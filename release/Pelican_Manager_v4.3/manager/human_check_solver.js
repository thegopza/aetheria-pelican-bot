// manager/human_check_solver.js — Anti-Bot Human Check Auto-Solver for PmheeAether
// Automatically matches questions (e.g. "กดรูป Red Potion" or "Press the picture of Red Potion")
// with the correct item choices from Colyseus packet items or DOM button icon images.

const https = require('https');
const fs = require('fs');
const path = require('path');

function createHumanCheckSolver({ dataDir }) {
  const CATALOG_FILE = path.join(dataDir, 'item_catalog.json');

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
    isReady: () => isReady
  };
}

module.exports = { createHumanCheckSolver };
