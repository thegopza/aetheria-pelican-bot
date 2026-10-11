// manager/human_check_solver.js — Anti-Bot Human Check Auto-Solver for PmheeAether
// Automatically matches questions (e.g. "กดรูป Red Potion" or "Press the picture of Red Potion")
// with the correct item choices from Colyseus packet items or DOM button icon images.

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getMachineFingerprint() {
  try {
    const stdout = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8' });
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i);
    if (match) {
      const guid = match[1].trim().toUpperCase();
      const canonical = 'PMhee.MachineFingerprint.v1|' + guid;
      return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase();
    }
  } catch (e) {}
  const fallback = 'PMhee.MachineFingerprint.v1|' + require('os').hostname().toUpperCase();
  return crypto.createHash('sha256').update(fallback, 'utf8').digest('hex').toUpperCase();
}

function extractVoucherHash(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const match = raw.match(/(?:\?v=|campaign\/|\/vouchers\/|^)([a-zA-Z0-9]{15,45})/);
  return match ? match[1] : null;
}

function createHumanCheckSolver({ dataDir }) {
  const CATALOG_FILE = path.join(dataDir, 'item_catalog.json');
  const SETTINGS_FILE = path.join(dataDir, 'human_check_settings.json');

  // Load / Save Human Check Solver Settings (Auto-answer, delay, point system, HWID)
  function loadSettings() {
    const hwid = getMachineFingerprint();
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
        const s = JSON.parse(raw);
        return {
          autoAnswer: s.autoAnswer !== false,
          answerDelayMs: Math.max(800, Math.min(10000, parseInt(s.answerDelayMs, 10) || 1800)),
          pointSystemEnabled: s.pointSystemEnabled !== undefined ? !!s.pointSystemEnabled : true,
          points: Math.max(0, parseInt(s.points, 10) || 0),
          pointsPerSolve: 1, // 1 point ต่อ 1 captcha
          pointsPerBaht: Math.max(1, parseInt(s.pointsPerBaht, 10) || 1),
          receiverPhone: String(s.receiverPhone || '0970674584').replace(/\D/g, ''),
          machineHwid: s.machineHwid || hwid,
          claimedVouchers: Array.isArray(s.claimedVouchers) ? s.claimedVouchers : [],
          topupHistory: Array.isArray(s.topupHistory) ? s.topupHistory : [],
          apiUrl: s.apiUrl || '',
          apiKey: s.apiKey || ''
        };
      }
    } catch (e) {}
    return {
      autoAnswer: true,
      answerDelayMs: 1800,
      pointSystemEnabled: true,
      points: 0,
      pointsPerSolve: 1,
      pointsPerBaht: 1,
      receiverPhone: '0970674584',
      machineHwid: hwid,
      claimedVouchers: [],
      topupHistory: [],
      apiUrl: '',
      apiKey: ''
    };
  }

  function saveSettings(settings) {
    try {
      const current = loadSettings();
      const updated = {
        ...current,
        ...settings,
        autoAnswer: settings.autoAnswer !== undefined ? (settings.autoAnswer !== false) : current.autoAnswer,
        answerDelayMs: settings.answerDelayMs !== undefined ? Math.max(800, Math.min(10000, parseInt(settings.answerDelayMs, 10) || 1800)) : current.answerDelayMs,
        pointSystemEnabled: settings.pointSystemEnabled !== undefined ? !!settings.pointSystemEnabled : current.pointSystemEnabled,
        points: settings.points !== undefined ? Math.max(0, parseInt(settings.points, 10) || 0) : current.points,
        pointsPerSolve: 1, // 1 point ต่อ 1 captcha
        pointsPerBaht: settings.pointsPerBaht !== undefined ? Math.max(1, parseInt(settings.pointsPerBaht, 10) || 1) : current.pointsPerBaht,
        receiverPhone: String(settings.receiverPhone || current.receiverPhone || '0970674584').replace(/\D/g, ''),
        machineHwid: current.machineHwid,
        claimedVouchers: Array.isArray(settings.claimedVouchers) ? settings.claimedVouchers : current.claimedVouchers,
        topupHistory: Array.isArray(settings.topupHistory) ? settings.topupHistory : current.topupHistory,
        apiUrl: String(settings.apiUrl || current.apiUrl || '').trim(),
        apiKey: String(settings.apiKey || current.apiKey || '').trim()
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
      return updated;
    } catch (e) {
      console.error('[HumanCheckSolver] Failed to save settings:', e);
      return null;
    }
  }

  // Redeem TrueMoney Gift Voucher (ซองอั่งเปา TrueMoney Wallet)
  async function redeemTrueMoneyVoucher(rawInput, receiverPhoneOverride = null) {
    const voucherHash = extractVoucherHash(rawInput);
    if (!voucherHash) {
      return { success: false, message: 'กรุณากรอกลิงก์ซองของขวัญ TrueMoney Wallet ให้ถูกต้อง (เช่น https://gift.truemoney.com/campaign/?v=...)' };
    }

    const s = loadSettings();
    const receiverPhone = String(receiverPhoneOverride || s.receiverPhone || '0970674584').replace(/\D/g, '');
    if (!receiverPhone || receiverPhone.length !== 10) {
      return { success: false, message: 'เบอร์โทรศัพท์ผู้รับเงิน TrueMoney ไม่ถูกต้อง (ต้องมี 10 หลัก)' };
    }

    // Replay protection (Receipt Hash)
    const receiptId = crypto.createHash('sha256').update('truemoney:' + voucherHash.toUpperCase()).digest('hex');
    const alreadyClaimed = (s.claimedVouchers || []).some(v => v.receiptId === receiptId || v.voucherHash === voucherHash);
    if (alreadyClaimed) {
      return { success: false, message: 'ซองของขวัญนี้ถูกใช้งานในระบบไปแล้ว ไม่สามารถใช้ซ้ำได้' };
    }

    // Call Autozy Gateway API (proven Cloudflare bypass for TrueMoney voucher redeem)
    try {
      const gatewayRes = await new Promise((resolve, reject) => {
        const url = `https://gateway.autozy.app/api/giftvoucher/${voucherHash}/${receiverPhone}/`;
        https.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 15000
        }, r => {
          let body = '';
          r.setEncoding('utf8');
          r.on('data', chunk => body += chunk);
          r.on('end', () => {
            try {
              resolve({ statusCode: r.statusCode, data: JSON.parse(body) });
            } catch (e) {
              resolve({ statusCode: r.statusCode, raw: body });
            }
          });
        }).on('error', reject).on('timeout', function() { this.destroy(new Error('เชื่อมต่อ Gateway หมดเวลา (Timeout)')); });
      });

      const resData = gatewayRes.data;
      if (resData && (resData.status === 'success' || resData.code === 200) && resData.data) {
        let amountBaht = 0.0;
        if (typeof resData.data.amount === 'number') amountBaht = resData.data.amount;
        else if (typeof resData.data.amount === 'string') amountBaht = parseFloat(resData.data.amount) || 0;

        if (amountBaht <= 0) {
          return { success: false, message: 'ยอดเงินในซองของขวัญไม่ถูกต้อง (0 บาท)' };
        }

        const pointsPerBaht = s.pointsPerBaht || 1;
        const pointsAdded = Math.round(amountBaht * pointsPerBaht);
        s.points = (s.points || 0) + pointsAdded;
        s.pointSystemEnabled = true; // Auto-enable point system once user tops up!

        const claimRecord = {
          receiptId,
          voucherHash: voucherHash.slice(0, 6) + '...' + voucherHash.slice(-4),
          amountBaht,
          pointsAdded,
          claimedAt: Date.now(),
          ownerName: resData.data.owner_name || ''
        };
        s.claimedVouchers = [claimRecord, ...(s.claimedVouchers || [])].slice(0, 50);

        const historyRecord = {
          id: receiptId.slice(0, 8),
          date: new Date().toISOString(),
          type: 'truemoney_voucher',
          amountBaht,
          pointsAdded,
          balance: s.points,
          note: `ซองของขวัญ ${amountBaht.toFixed(2)} บ. (${resData.data.owner_name || 'ผู้ส่ง'})`
        };
        s.topupHistory = [historyRecord, ...(s.topupHistory || [])].slice(0, 50);

        saveSettings(s);

        return {
          success: true,
          amount: amountBaht,
          pointsAdded,
          totalPoints: s.points,
          ownerName: resData.data.owner_name || '',
          message: `🎉 แลกซองอั่งเปาสำเร็จ! ได้รับ ${amountBaht.toFixed(2)} บาท (+${pointsAdded.toLocaleString()} Points)`
        };
      }

      // Handle gateway error responses
      let errMsg = 'ไม่สามารถแลกซองของขวัญนี้ได้';
      if (resData && resData.message) errMsg = resData.message;
      if (resData && resData.message_en === 'VOUCHER_OUT_OF_STOCK') {
        errMsg = 'ซองของขวัญนี้ถูกใช้งานหรือมีผู้รับเงินไปแล้ว';
      } else if (resData && resData.message_en === 'VOUCHER_NOT_FOUND') {
        errMsg = 'ไม่พบซองของขวัญนี้ กรุณาตรวจสอบลิงก์ซองของขวัญอีกครั้ง';
      } else if (resData && resData.message_en === 'VOUCHER_EXPIRED') {
        errMsg = 'ซองของขวัญนี้หมดอายุแล้ว (อายุเกิน 72 ชั่วโมง)';
      } else if (resData && resData.message_en === 'CANNOT_GET_OWN_VOUCHER') {
        errMsg = 'เบอร์ผู้รับเป็นผู้สร้างซองนี้ ไม่สามารถรับเงินของตนเองได้';
      }

      return { success: false, message: errMsg, code: resData?.code || resData?.message_en };
    } catch (err) {
      return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message };
    }
  }

  // Deduct points after a successful auto-solve (if point system is active)
  function deductPoints(amount = null) {
    const s = loadSettings();
    if (!s.pointSystemEnabled) return { success: true, remaining: s.points, deducted: 0 };
    const cost = amount != null ? amount : (s.pointsPerSolve || 1);
    if (s.points < cost) {
      return { success: false, error: 'Point ไม่เพียงพอสำหรับการตอบคำถาม', remaining: s.points };
    }
    s.points -= cost;
    saveSettings(s);
    return { success: true, remaining: s.points, deducted: cost };
  }

  // Add / top up points
  function addPoints(amount) {
    const add = parseInt(amount, 10);
    if (isNaN(add) || add <= 0) return { success: false, error: 'จำนวน Point ไม่ถูกต้อง' };
    const s = loadSettings();
    s.points = (s.points || 0) + add;
    saveSettings(s);
    return { success: true, points: s.points, added: add };
  }

  // In-memory lookup tables
  let idToName = new Map();
  let iconToNames = new Map();
  let isReady = false;
  let isUpdating = false;

  // Helper: Fetch JSON via HTTPS
  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { timeout: 12000 }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        });
      }).on('error', reject).on('timeout', () => reject(new Error(`Timeout fetching ${url}`)));
    });
  }

  // Clean icon path to relative key (e.g. "items/red-potion.webp")
  function cleanIconPath(icon) {
    if (!icon || typeof icon !== 'string') return '';
    return icon
      .replace(/^https?:\/\/[^\/]+/, '')
      .replace(/^\/?art\/icons\//, '')
      .replace(/^\//, '')
      .split('?')[0]
      .trim();
  }

  // Build in-memory lookup maps from catalog data
  function buildIndex(catalog) {
    idToName.clear();
    iconToNames.clear();

    if (Array.isArray(catalog.items)) {
      for (const it of catalog.items) {
        if (it && it.id != null && it.name) {
          idToName.set(Number(it.id), String(it.name).trim());
        }
      }
    }

    if (catalog.manifest && typeof catalog.manifest === 'object') {
      const manifestItems = catalog.manifest.items || catalog.manifest;
      for (const [idStr, iconPath] of Object.entries(manifestItems)) {
        const id = Number(idStr);
        const name = idToName.get(id);
        const clean = cleanIconPath(iconPath);
        if (clean) {
          if (!iconToNames.has(clean)) {
            iconToNames.set(clean, new Set());
          }
          if (name) {
            iconToNames.get(clean).add(name);
          }
        }
      }
    }

    isReady = idToName.size > 0;
    console.log(`[HumanCheckSolver] Catalog indexed: ${idToName.size} items, ${iconToNames.size} unique icons.`);
  }

  // Load from disk or download
  async function init() {
    try {
      if (fs.existsSync(CATALOG_FILE)) {
        const stats = fs.statSync(CATALOG_FILE);
        const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 3600);
        const content = fs.readFileSync(CATALOG_FILE, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && parsed.items && parsed.manifest) {
          buildIndex(parsed);
          // If older than 7 days, refresh in background
          if (ageHours > 168) {
            refreshCatalog().catch(() => {});
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[HumanCheckSolver] Failed to read cached catalog from disk:', e.message);
    }

    // Otherwise download fresh
    await refreshCatalog();
  }

  // Download fresh catalog from Aetheria Online
  async function refreshCatalog() {
    if (isUpdating) return;
    isUpdating = true;
    try {
      console.log('[HumanCheckSolver] Downloading item catalog from Aetheria Online...');
      const [wiki, manifest] = await Promise.all([
        fetchJSON('https://www.aetheria-online.in.th/wiki-data'),
        fetchJSON('https://www.aetheria-online.in.th/art/icons/manifest.json')
      ]);

      const catalogData = {
        updatedAt: new Date().toISOString(),
        items: wiki.items || [],
        manifest: manifest.items || manifest
      };

      try {
        fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalogData), 'utf8');
      } catch (err) {
        console.warn('[HumanCheckSolver] Could not write catalog to disk:', err.message);
      }

      buildIndex(catalogData);
    } catch (err) {
      console.error('[HumanCheckSolver] Failed to download catalog:', err.message);
    } finally {
      isUpdating = false;
    }
  }

  // Clean prompt to extract item name
  // Handles:
  // "กดรูป Red Potion" -> "Red Potion"
  // "กรุณากดรูป Red Potion ภายในเวลา" -> "Red Potion"
  // "Press the picture of Wedding Veil" -> "Wedding Veil"
  // "เลือกรูปภาพของ Guard" -> "Guard"
  function cleanPromptText(prompt) {
    if (!prompt || typeof prompt !== 'string') return '';
    let p = prompt.trim();
    // Strip Thai prefixes
    p = p.replace(/^(?:กรุณา)?\s*(?:คลิก|กด|เลือก)\s*(?:ที่)?\s*(?:รูป|ภาพ|รูปภาพ)?\s*(?:ของ)?\s*/i, '');
    // Strip English prefixes
    p = p.replace(/^(?:please\s+)?(?:press|click|select|choose)\s+(?:the\s+)?(?:picture|image|icon)\s+(?:of\s+)?/i, '');
    // Strip suffix reminders
    p = p.replace(/\s*(?:ภายในเวลา|ด่วน|ก่อนหมดเวลา).*$/i, '');
    return p.trim();
  }

  // Solve human check question
  // prompt: string (e.g. "กดรูป Red Potion")
  // options: array of { index, label, icon, itemId? }
  // packetItems: optional array of numbers [2101, 90301, ...]
  function solveHumanCheck(prompt, options = [], packetItems = null) {
    if (!prompt) return { success: false, reason: 'ไม่มีข้อความโจทย์' };

    const rawPromptLower = String(prompt).trim().toLowerCase();
    const cleanTarget = cleanPromptText(prompt);
    const cleanTargetLower = cleanTarget.toLowerCase();

    const resolvedOptions = [];
    const candidates = [];

    const count = Math.max(options.length, (packetItems && packetItems.length) || 0);

    for (let i = 0; i < count; i++) {
      const opt = options[i] || { index: i };
      const index = opt.index != null ? opt.index : i;
      const itemId = (packetItems && packetItems[i]) || opt.itemId;
      const icon = cleanIconPath(opt.icon);

      const candidateNames = new Set();

      // 1. From exact item ID
      if (itemId != null) {
        const n = idToName.get(Number(itemId));
        if (n) candidateNames.add(n);
      }

      // 2. From icon path in manifest
      if (icon) {
        const names = iconToNames.get(icon);
        if (names) {
          names.forEach(n => candidateNames.add(n));
        }
      }

      const namesArr = Array.from(candidateNames);
      const displayItemName = namesArr[0] || opt.label || `ตัวเลือกที่ ${index + 1}`;

      resolvedOptions.push({
        index,
        label: opt.label || `ตัวเลือกที่ ${index + 1}`,
        icon: opt.icon || '',
        itemId: itemId || null,
        itemName: displayItemName,
        allNames: namesArr
      });

      // Score matching against prompt
      for (const name of namesArr) {
        const nameLower = name.toLowerCase();
        let score = 0;

        // Exact match with cleaned prompt target: highest priority
        if (cleanTargetLower === nameLower) {
          score = 1000 + nameLower.length;
        } else if (cleanTargetLower.includes(nameLower)) {
          // Clean target contains item name (e.g. prompt had slight extra word)
          score = 800 + nameLower.length;
        } else if (rawPromptLower.includes(nameLower)) {
          // Raw prompt contains item name (e.g. "กดรูป Red Potion")
          score = 600 + nameLower.length;
        } else {
          // Normalize spaces and dashes (e.g. "two-hand sword" vs "two hand sword")
          const normPrompt = rawPromptLower.replace(/[^a-z0-9]/g, '');
          const normName = nameLower.replace(/[^a-z0-9]/g, '');
          if (normPrompt.includes(normName) && normName.length >= 3) {
            score = 500 + normName.length;
          }
        }

        if (score > 0) {
          candidates.push({
            index,
            matchedName: name,
            score
          });
        }
      }
    }

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      // Mark chosen in resolvedOptions
      resolvedOptions.forEach(o => {
        o.isMatch = (o.index === best.index);
      });

      return {
        success: true,
        pickIndex: best.index,
        matchedName: best.matchedName,
        confidence: Math.min(100, Math.round(best.score / 10)),
        cleanTarget,
        resolvedOptions
      };
    }

    return {
      success: false,
      reason: 'ไม่พบชื่อไอเทมที่ตรงกับโจทย์',
      cleanTarget,
      resolvedOptions
    };
  }

  // Get item name by ID
  function getItemName(id) {
    return idToName.get(Number(id)) || null;
  }

  // Get item names by icon path
  function getItemNamesByIcon(icon) {
    const clean = cleanIconPath(icon);
    const set = iconToNames.get(clean);
    return set ? Array.from(set) : [];
  }

  // Kick off initialization
  init().catch(err => {
    console.warn('[HumanCheckSolver] Init deferred/error:', err.message);
  });

  return {
    init,
    refreshCatalog,
    solveHumanCheck,
    getItemName,
    getItemNamesByIcon,
    cleanIconPath,
    cleanPromptText,
    loadSettings,
    saveSettings,
    deductPoints,
    addPoints,
    redeemTrueMoneyVoucher,
    extractVoucherHash,
    getMachineFingerprint,
    isReady: () => isReady
  };
}

module.exports = { createHumanCheckSolver };
