// manager/discord_bot.js — Discord Webhook & Interactive Bot Integration for PmheeAether Manager
// Supports:
// 1. One-way Webhook notification (Rich Embed + Options)
// 2. Two-way Discord Bot (Gateway WebSocket + Interactive Buttons)
// 3. Human-in-the-loop: click button in Discord -> clicks answer in game window

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createHumanCheckSolver } = require('./human_check_solver.js');

function createDiscordBotService({ dataDir, loadProfiles, evalProfilePort, focusProfileWindow, humanCheckSolver }) {
  const SETTINGS_FILE = path.join(dataDir, 'discord_settings.json');
  const solver = humanCheckSolver || createHumanCheckSolver({ dataDir });

  // Load / Save Settings
  function loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        return {
          enabled: !!s.enabled,
          webhookUrl: s.webhookUrl || '',
          botToken: s.botToken || '',
          channelId: s.channelId || '',
          autoBringToFront: s.autoBringToFront !== false,
          soundAlert: s.soundAlert !== false,
          autoAnswer: s.autoAnswer !== false,
          answerDelayMs: parseInt(s.answerDelayMs, 10) || 1800
        };
      }
    } catch (e) {}
    return {
      enabled: false,
      webhookUrl: '',
      botToken: '',
      channelId: '',
      autoBringToFront: true,
      soundAlert: true,
      autoAnswer: true,
      answerDelayMs: 1800
    };
  }

  function saveSettings(settings) {
    try {
      const current = loadSettings();
      const updated = {
        ...current,
        ...settings,
        autoAnswer: settings.autoAnswer !== false,
        answerDelayMs: Math.max(800, Math.min(10000, parseInt(settings.answerDelayMs, 10) || 1800))
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
      // If bot token changed or enabled state changed, reconnect gateway
      syncGatewayConnection();
      return true;
    } catch (e) {
      console.error('[Discord] Failed to save settings:', e);
      return false;
    }
  }

  // Active checks tracker: profileId -> { checkId, prompt, notifiedAt, messageId, options }
  const activeChecks = new Map();
  const requestStateFile = path.join(dataDir, 'aetheria_request_state.json');
  function questionFingerprint(check) {
    return crypto.createHash('sha256').update(JSON.stringify([
      check.id ?? null, check.prompt, check.options || [], check.items || null
    ])).digest('hex');
  }
  function durableRequestId(profileId, check) {
    const fingerprint = questionFingerprint(check);
    let records = {};
    try { records = JSON.parse(fs.readFileSync(requestStateFile, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const previous = records[profileId];
    const now = Date.now();
    const same = previous?.fingerprint === fingerprint &&
      (check.id != null || now - previous.seenAt < 90000);
    const requestId = same ? previous.requestId : crypto.randomUUID();
    records[profileId] = { fingerprint, requestId, seenAt: now };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(requestStateFile + '.tmp', JSON.stringify(records), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(requestStateFile + '.tmp', requestStateFile);
    return requestId;
  }

  // Gateway connection state
  let gatewayWs = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let lastSequence = null;
  let isConnecting = false;

  // HTTP helper for Discord REST API (supports JSON and multipart/form-data with file attachments)
  function discordRequest(endpoint, method = 'GET', body = null, token = null, fileAttachment = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint.startsWith('http') ? endpoint : `https://discord.com/api/v10${endpoint}`);
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bot ${token}`;
      }

      let requestBody = null;
      if (fileAttachment && fileAttachment.buffer) {
        const boundary = '----PmheeAetherBoundary' + Date.now().toString(16);
        const parts = [];
        if (body) {
          parts.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="payload_json"\r\n` +
            `Content-Type: application/json; charset=utf-8\r\n\r\n` +
            JSON.stringify(body) + `\r\n`
          ));
        }
        parts.push(Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files[0]"; filename="${fileAttachment.filename || 'human_check.png'}"\r\n` +
          `Content-Type: ${fileAttachment.contentType || 'image/png'}\r\n\r\n`
        ));
        parts.push(fileAttachment.buffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        requestBody = Buffer.concat(parts);
        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        headers['Content-Length'] = requestBody.length;
      } else {
        headers['Content-Type'] = 'application/json';
        if (body) requestBody = Buffer.from(JSON.stringify(body), 'utf8');
      }

      const req = https.request(url, {
        method,
        headers,
        timeout: 15000
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, status: res.statusCode, data: parsed });
          } else {
            resolve({ success: false, status: res.statusCode, error: parsed });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });

      if (requestBody) req.write(requestBody);
      req.end();
    });
  }

  // Answer human check in the game window
  async function answerCheckInGame(profileId, pickIndex, matchedName = '', expectedCheck = null) {
    if (!Number.isInteger(pickIndex) || pickIndex < 0 || pickIndex > 5 || typeof profileId !== 'string') {
      return { success: false, error: 'ตัวเลือกหรือโปรไฟล์ไม่ถูกต้อง' };
    }
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile || !profile.debugPort) {
      return { success: false, error: `ไม่พบโปรไฟล์ ${profileId} หรือโปรไฟล์ออฟไลน์อยู่` };
    }

    const cleanName = String(matchedName || '');
    const evalCode = `(() => {
      let clickAttempted = false;
      try {
        const hc = document.querySelector('.human-check');
        if (!hc) return { success: false, error: 'ไม่พบหน้าต่างเช็คผู้เล่น (อาจปิดหรือตอบไปแล้ว)' };
        const expected = ${JSON.stringify(expectedCheck)};
        if (expected) {
          const prompt = (hc.querySelector('.human-check-prompt')?.innerText || '').trim();
          const packet = window.__latestHumanCheck;
          if (prompt !== expected.prompt || (expected.id != null && packet?.id != null && String(packet.id) !== String(expected.id))) {
            return { success: false, error: 'คำถามนี้หมดอายุหรือเปลี่ยนไปแล้ว' };
          }
        }
        const btns = Array.from(hc.querySelectorAll('.human-check-pick'));
        const targetBtn = btns[${Number(pickIndex)}];
        if (!targetBtn) return { success: false, error: 'ไม่พบปุ่มตัวเลือกที่ ${pickIndex + 1}' };
        if (targetBtn.disabled) return { success: false, error: 'ปุ่มนี้ถูกกดไปแล้วหรือถูกปิดใช้งาน' };
        clickAttempted = true;
        targetBtn.click();
        window.__lastHumanCheckSolved = {
          pickIndex: ${Number(pickIndex)},
          matchedName: ${JSON.stringify(cleanName)},
          timestamp: Date.now()
        };
        if (window.showHudToast) {
          window.showHudToast(${JSON.stringify('🤖 ตอบเช็คผู้เล่น: ' + (cleanName || ('ข้อ ' + (pickIndex + 1))))}, 'success', 5000);
        }
        return { success: true, picked: ${pickIndex} };
      } catch (err) {
        return { success: false, uncertain: clickAttempted, error: err.message };
      }
    })()`;

    try {
      const res = await evalProfilePort(profile.debugPort, evalCode, 6000);
      return res?.result || { success: false, uncertain: true, error: 'ไม่ได้รับการตอบรับจากจอเกม' };
    } catch (e) {
      return { success: false, uncertain: true, error: e.message };
    }
  }

  // Connect to Discord Gateway via native WebSocket (Node.js 21+)
  function syncGatewayConnection() {
    const cfg = loadSettings();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);

    if (!cfg.enabled || !cfg.botToken || typeof WebSocket === 'undefined') {
      if (gatewayWs) {
        try { gatewayWs.close(); } catch (e) {}
        gatewayWs = null;
      }
      return;
    }

    if (gatewayWs && (gatewayWs.readyState === WebSocket.OPEN || gatewayWs.readyState === WebSocket.CONNECTING)) {
      return; // Already connected or connecting
    }

    connectGateway(cfg.botToken);
  }

  function connectGateway(token) {
    if (isConnecting) return;
    isConnecting = true;

    try {
      console.log('[Discord Bot] Connecting to Discord Gateway...');
      const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
      gatewayWs = ws;

      ws.onopen = () => {
        isConnecting = false;
        console.log('[Discord Bot] Gateway WebSocket connected');
      };

      ws.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { op, d, s, t } = payload;
          if (s !== null) lastSequence = s;

          // OP 10: Hello -> start heartbeat & identify
          if (op === 10) {
            const interval = d.heartbeat_interval;
            heartbeatTimer = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ op: 1, d: lastSequence }));
              }
            }, interval);

            // Send Identify
            ws.send(JSON.stringify({
              op: 2,
              d: {
                token: token,
                intents: 33280, // Guilds + Guild Messages + Message Content
                properties: {
                  os: 'windows',
                  browser: 'PmheeAetherManager',
                  device: 'PmheeAetherManager'
                }
              }
            }));
          }

          // OP 0: Dispatch Events
          if (op === 0) {
            // READY
            if (t === 'READY') {
              console.log(`[Discord Bot] Logged in as ${d.user.username}#${d.user.discriminator} (${d.user.id})`);
            }

            // INTERACTION_CREATE (User clicked a button)
            if (t === 'INTERACTION_CREATE') {
              handleInteraction(d, token);
            }

            // MESSAGE_CREATE (User typed a number or reply in channel)
            if (t === 'MESSAGE_CREATE') {
              handleMessage(d, token);
            }
          }
        } catch (err) {
          console.error('[Discord Bot] Error handling gateway message:', err);
        }
      };

      ws.onclose = (event) => {
        isConnecting = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        console.log(`[Discord Bot] Gateway closed (${event.code}). Reconnecting in 10s...`);
        reconnectTimer = setTimeout(syncGatewayConnection, 10000);
      };

      ws.onerror = (err) => {
        isConnecting = false;
        console.error('[Discord Bot] Gateway error:', err.message || err);
      };
    } catch (e) {
      isConnecting = false;
      console.error('[Discord Bot] Failed to init gateway:', e);
      reconnectTimer = setTimeout(syncGatewayConnection, 15000);
    }
  }

  // Handle Button Interaction
  async function handleInteraction(interaction, token) {
    // Only handle Component Interactions (Type 3: Message Component / Button)
    if (interaction.type !== 3) return;

    const customId = interaction.data?.custom_id || '';
    // Every button is tied to one active question and the original alert message.
    const cfg = loadSettings();
    if (!cfg.enabled || !cfg.channelId || interaction.channel_id !== cfg.channelId) return;
    const parts = customId.split(':');
    if (parts.length !== 4 || parts[0] !== 'hc') return;
    const [, profileId, action, nonce] = parts;
    const active = activeChecks.get(profileId);
    if (!active || active.nonce !== nonce || active.messageId !== interaction.message?.id || Date.now() - active.notifiedAt > 90000) return;

    const interactionId = interaction.id;
    const interactionToken = interaction.token;

    // Helper: Acknowledge & update interaction
    const respondInteraction = async (content, updateMessage = false) => {
      // Type 4: ChannelMessageWithSource, Type 7: UpdateMessage
      const type = updateMessage ? 7 : 4;
      await discordRequest(
        `https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`,
        'POST',
        {
          type,
          data: { content, flags: 64 } // 64 = ephemeral (visible only to clicker)
        }
      );
    };

    if (action === 'focus') {
      if (typeof focusProfileWindow === 'function') {
        focusProfileWindow(profileId);
      }
      await respondInteraction(`🖥️ ดึงหน้าต่างจอเกม [${profileId}] ขึ้นมาหน้าสุดเรียบร้อยแล้ว!`);
      return;
    }

    const pickIndex = /^[0-5]$/.test(action) ? Number(action) : NaN;
    if (isNaN(pickIndex)) {
      await respondInteraction(`❌ คำสั่งไม่ถูกต้อง: ${action}`);
      return;
    }

    // Answer in game
    const result = await answerCheckInGame(profileId, pickIndex, '', { id: active.checkId, prompt: active.prompt });
    if (result.success) {
      await respondInteraction(`✅ **ตอบตัวเลือกที่ ${pickIndex + 1}** ให้จอ [${profileId}] เรียบร้อยแล้ว! กำลังตรวจสอบผลลัพธ์...`);
    } else {
      await respondInteraction(`⚠️ สั่งตอบไม่สำเร็จ: ${result.error || 'ไม่ทราบสาเหตุ'}`);
    }
  }

  // Handle Text Message (e.g. user types "1", "2", "3", "4" in the designated channel)
  async function handleMessage(msg, token) {
    if (msg.author?.bot) return;

    const cfg = loadSettings();
    if (!cfg.enabled || !cfg.channelId || msg.channel_id !== cfg.channelId) return;

    const text = (msg.content || '').trim();
    // Match "1", "2", "3", "4" or "!ans 1"
    const match = text.match(/^(?:!ans\s+)?([1-6])$/i);
    if (!match) return;

    const pickNum = parseInt(match[1], 10);
    const pickIndex = pickNum - 1;

    // Find active check (most recent)
    let targetProfileId = null;
    let newestTime = 0;
    for (const [pId, info] of activeChecks.entries()) {
      if (info.messageId === msg.message_reference?.message_id && Date.now() - info.notifiedAt <= 90000 && info.notifiedAt > newestTime) {
        newestTime = info.notifiedAt;
        targetProfileId = pId;
      }
    }

    if (!targetProfileId) {
      // No active check registered
      return;
    }

    const active = activeChecks.get(targetProfileId);
    const result = await answerCheckInGame(targetProfileId, pickIndex, '', { id: active.checkId, prompt: active.prompt });
    const replyText = result.success
      ? `✅ [ตอบผ่านแชท] เลือกตัวเลือกที่ **${pickNum}** ให้จอ **${targetProfileId}** เรียบร้อยแล้ว!`
      : `⚠️ [ตอบผ่านแชท] สั่งตอบไม่สำเร็จ: ${result.error}`;

    await discordRequest(
      `/channels/${msg.channel_id}/messages`,
      'POST',
      {
        content: replyText,
        message_reference: { message_id: msg.id }
      },
      token
    );
  }

  // Notify Discord about an active human check & execute Auto-Answer if enabled
  async function notifyHumanCheck({ profile, check }) {
    const cfg = loadSettings();
    let hcSettings = { autoAnswer: false, pointSystemEnabled: true, points: 0, pointsPerSolve: 1 };
    try {
      if (solver && typeof solver.loadSettings === 'function') hcSettings = solver.loadSettings() || hcSettings;
    } catch (err) {
      console.warn('[HumanCheckSolver] Cannot verify point balance; auto-answer disabled.');
    }

    // If both Discord alert and Auto-Answer are disabled, nothing to do
    if (!cfg.enabled && !hcSettings.autoAnswer) return;

    const profileId = profile.id;
    const now = Date.now();

    // Avoid duplicate alerts for the exact same check prompt within 90 seconds
    const existing = activeChecks.get(profileId);
    if (existing && existing.fingerprint === questionFingerprint(check) && (now - existing.notifiedAt < 90000)) {
      return;
    }

    // Decode composite image preview if available from game client
    let fileAttachment = null;
    if (check.imageDataUrl && typeof check.imageDataUrl === 'string' && check.imageDataUrl.startsWith('data:image/')) {
      try {
        const base64Str = check.imageDataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const buf = Buffer.from(base64Str, 'base64');
        if (buf.length > 200) {
          fileAttachment = {
            buffer: buf,
            filename: 'human_check.png',
            contentType: 'image/png'
          };
        }
      } catch (e) {
        console.warn('[Discord Bot] Failed to decode imageDataUrl:', e.message);
      }
    }

    // Manual alerts use only option positions; item matching stays on the paid service.
    const resolvedOptions = (check.options || []).map((o, i) => ({
      index: o.index != null ? o.index : i,
      label: `ตัวเลือกที่ ${i + 1}`,
      itemName: `ตัวเลือกที่ ${i + 1}`
    }));


    activeChecks.set(profileId, {
      checkId: check.id ?? null,
      fingerprint: questionFingerprint(check),
      nonce: crypto.randomBytes(12).toString('hex'),
      requestId: null,
      prompt: check.prompt,
      notifiedAt: now,
      options: resolvedOptions
    });

    const trackedCheck = activeChecks.get(profileId);
    const charName = profile.liveState?.charName || profile.lastCharName || profile.name;
    const promptText = check.prompt || '(ไม่มีข้อความโจทย์)';
    const metaText = check.meta || '';
    const optionsCount = resolvedOptions.length || 4;

    let pointMessage = '';
    // Cached points are display data. Only the remote service authorizes and charges a solve.
    const shouldAutoAnswer = hcSettings.autoAnswer && cfg.autoAnswer !== false && solver?.isRemoteService === true;
    if (shouldAutoAnswer) {
      const baseDelay = parseInt(hcSettings.answerDelayMs || cfg.answerDelayMs, 10) || 1800;
      const jitter = Math.floor(Math.random() * 600) - 250;
      const delayMs = Math.max(800, baseDelay + jitter);
      await new Promise(r => setTimeout(r, delayMs));

      let solution = { success: false };
      let ansRes = { success: false, error: 'ไม่สามารถยืนยันสิทธิ์ตอบอัตโนมัติได้' };
      try {
        const latestSettings = solver.loadSettings();
        if (activeChecks.get(profileId) === trackedCheck && latestSettings?.autoAnswer && loadSettings().autoAnswer !== false && typeof solver.solveHumanCheck === 'function') {
          trackedCheck.requestId = durableRequestId(profileId, check);
          solution = await solver.solveHumanCheck(check.prompt, check.options, check.items, trackedCheck.requestId);
          // The service bills for analysis. Game transport errors never refund that analysis.
          const authorized = solution?.success === true && solution.charged === 1 && solution.requestId === trackedCheck.requestId && Number.isInteger(solution.pickIndex) && solution.pickIndex >= 0 && solution.pickIndex < optionsCount;
          if (activeChecks.get(profileId) !== trackedCheck) return;
          const stillEnabled = solver.loadSettings()?.autoAnswer && loadSettings().autoAnswer !== false;
          if (authorized && stillEnabled) {
            ansRes = await answerCheckInGame(profileId, solution.pickIndex, solution.matchedName, { id: trackedCheck.checkId, prompt: trackedCheck.prompt });
          } else {
            pointMessage = '⚠️ บริการส่วนกลางไม่อนุมัติการตอบอัตโนมัติ กรุณาตรวจสอบ Point หรือการเชื่อมต่อ';
            ansRes = { success: false, error: 'บริการส่วนกลางไม่อนุมัติคำตอบ หรือปิดการตอบอัตโนมัติแล้ว' };
          }
        }
      } catch (err) {
        pointMessage = '⚠️ ไม่สามารถยืนยันคำตอบจากบริการส่วนกลางได้ กรุณาตอบด้วยตนเอง';
        console.warn('[HumanCheckSolver] Remote authorization unavailable; auto-answer disabled.');
      }

      if (ansRes && ansRes.success) {
        console.log(`[Discord Bot] ✅ Auto-answer succeeded for [${profile.name}]! Picked #${solution.pickIndex + 1} (${solution.matchedName})`);

        // Send Success Notification to Discord
        const optionsList = resolvedOptions.map((opt, i) => {
          const isChosen = (opt.index === solution.pickIndex);
          const icon = isChosen ? '✅' : '⚪';
          const highlight = isChosen ? `**ข้อ ${i + 1}: ${opt.itemName}** 👈 *(ระบบเลือกข้อนี้)*` : `ข้อ ${i + 1}: ${opt.itemName}`;
          return `${icon} ${highlight}`;
        }).join('\n');

        const pointDeductText = (solution.charged === 1)
          ? `\n🪙 **แต้มคงเหลือ:** หัก 1 Point ต่อการวิเคราะห์คำตอบสำเร็จ (คงเหลือ: **${solution.remaining}** P)`
          : '';

        const embed = {
          title: `🤖 [Auto Human Check] ตรวจพบและตอบเช็คผู้เล่นสำเร็จ!`,
          description: `**จอเกม:** \`${profile.name}\` (ตัวละคร: **${charName}**)\n\n### ❓ โจทย์คำถาม:\n> **${promptText}**\n\n🎯 **ระบบจับคู่อัตโนมัติ:**\n✅ เลือกตัวเลือกที่ **${solution.pickIndex + 1}**: **${solution.matchedName}** (ยืนยันจากบริการส่วนกลาง)\n⏱️ หน่วงเวลาตอบ: **${delayMs} ms** (เลียนแบบผู้เล่น)${pointDeductText}`,
          color: 0x10B981, // Emerald Green
          fields: [
            {
              name: `📋 ตัวเลือกรูปภาพ (${optionsCount} ตัวเลือก):`,
              value: optionsList || '(ไม่มีข้อมูล)',
              inline: false
            }
          ],
          footer: { text: `Aetheria Online · PmheeAether Auto-Solver · จอ #${profile.name}` },
          timestamp: new Date().toISOString()
        };

        if (fileAttachment) {
          embed.image = { url: 'attachment://human_check.png' };
        }

        if (cfg.botToken && cfg.channelId) {
          await discordRequest(`/channels/${cfg.channelId}/messages`, 'POST', {
            content: `🤖 **[Auto-Solver]** จอ **${charName}** (${profile.name}) มีโจทย์เช็คผู้เล่น -> บอทจับคู่และตอบ **"${solution.matchedName}"** ให้อัตโนมัติเรียบร้อยแล้ว!`,
            embeds: [embed]
          }, cfg.botToken, fileAttachment);
        } else if (cfg.webhookUrl) {
          await discordRequest(cfg.webhookUrl, 'POST', {
            username: 'PmheeAether Anti-Bot Solver',
            avatar_url: 'https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/manager/public/icon.png',
            content: `🤖 **[Auto-Solver]** จอ **${charName}** (${profile.name}) ตอบเช็คผู้เล่นอัตโนมัติสำเร็จ!`,
            embeds: [embed]
          }, null, fileAttachment);
        }
        return;
      } else {
        console.warn(`[Discord Bot] ⚠️ Auto-answer execution returned error: ${ansRes?.error}. Falling back to manual alert.`);
      }
    }

    if (activeChecks.get(profileId) !== trackedCheck) return;

    // Fallback or Manual Mode: Send Urgent Alert with Interactive Buttons & Real Item Names & Card Image
    if (cfg.autoBringToFront && typeof focusProfileWindow === 'function') {
      try { focusProfileWindow(profileId); } catch (e) {}
    }

    const embed = {
      title: `🚨 ตรวจพบเช็คผู้เล่น (Human Check)!`,
      description: `**จอเกม:** \`${profile.name}\` (ตัวละคร: **${charName}**)\n\n### ❓ โจทย์คำถาม:\n> **${promptText}**\n\n⏱️ **สถานะ:** ${metaText || 'กรุณาตอบภายในเวลา มิฉะนั้นจะถูกส่งเข้าคุก!'}` +
        (pointMessage ? `\n\n${pointMessage}` : '') + '\n\nตอบผ่านแชทด้วยการ Reply ข้อความแจ้งเตือนนี้แล้วพิมพ์เลขตัวเลือก',
      color: 0xEF4444, // Red
      fields: [],
      footer: { text: `Aetheria Online · PmheeAether Manager · จอ #${profile.name}` },
      timestamp: new Date().toISOString()
    };

    if (fileAttachment) {
      embed.image = { url: 'attachment://human_check.png' };
    }

    const optionDescriptions = resolvedOptions.map((opt, i) => `**${i + 1}️⃣** ตัวเลือกที่ ${i + 1}`).join('\n');

    if (optionDescriptions) {
      embed.fields.push({
        name: `📋 ตัวเลือกรูปภาพ (${optionsCount} ตัวเลือก):`,
        value: optionDescriptions,
        inline: false
      });
    }

    // Build Interactive Buttons (with item names and recommended star)
    let components = [];
    if (cfg.enabled && cfg.botToken && cfg.channelId) {
      const buttons = [];
      for (let i = 0; i < optionsCount; i++) {
        const opt = resolvedOptions[i] || {};
        const labelText = `ตัวเลือกที่ ${i + 1}`;
        buttons.push({
          type: 2, // Button
          style: 1, // Manual choices do not reveal the paid solver result
          label: labelText,
          custom_id: `hc:${profileId}:${opt.index != null ? opt.index : i}:${trackedCheck.nonce}`
        });
      }

      components.push({
        type: 1, // Action Row
        components: buttons
      });

      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 4, // Danger (Red)
            label: '🖥️ ดึงจอเกมขึ้นหน้าสุด',
            custom_id: `hc:${profileId}:focus:${trackedCheck.nonce}`
          }
        ]
      });
    }

    // Send via Bot Token (to channel) or Webhook with image attachment
    if (cfg.enabled) {
      if (cfg.botToken && cfg.channelId) {
        const payload = {
          content: `🚨 **แจ้งเตือนด่วน!** จอ **${charName}** (${profile.name}) มีคำถามเช็คผู้เล่น! กดปุ่มด้านล่างเพื่อตอบได้ทันที:`,
          embeds: [embed],
          components
        };
        const res = await discordRequest(`/channels/${cfg.channelId}/messages`, 'POST', payload, cfg.botToken, fileAttachment);
        if (res.success && res.data?.id) {
          const info = activeChecks.get(profileId);
          if (info === trackedCheck) info.messageId = res.data.id;
        }
      } else if (cfg.webhookUrl) {
        const payload = {
          username: 'PmheeAether Anti-Bot Alert',
          avatar_url: 'https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/manager/public/icon.png',
          content: `🚨 **แจ้งเตือนด่วน!** จอ **${charName}** (${profile.name}) มีคำถามเช็คผู้เล่น!`,
          embeds: [embed]
        };
        await discordRequest(cfg.webhookUrl, 'POST', payload, null, fileAttachment);
      }
    }
  }

  // Clear check when resolved in game
  function clearHumanCheck(profileId) {
    activeChecks.delete(profileId);
  }

  // Test Discord Message
  async function testNotification() {
    const cfg = loadSettings();
    if (!cfg.webhookUrl && (!cfg.botToken || !cfg.channelId)) {
      return { success: false, error: 'กรุณากรอก Webhook URL หรือ Bot Token + Channel ID ก่อนทดสอบ' };
    }

    const embed = {
      title: '🧪 ทดสอบการแจ้งเตือน Discord (PmheeAether Manager)',
      description: 'ระบบเชื่อมต่อ Discord สำเร็จเรียบร้อย! เมื่อมีคำถาม **เช็คผู้เล่น (Human Check)** เด้งขึ้นมาในเกม ระบบจะส่งข้อความแจ้งเตือนมายังห้องนี้ทันที',
      color: 0x10B981, // Emerald Green
      fields: [
        { name: '🖥️ โหมดการทำงาน', value: cfg.botToken ? '🤖 Discord Bot (รองรับปุ่มกดตอบโต้ในห้อง)' : '📢 Webhook (แจ้งเตือนข่าวสาร)', inline: true },
        { name: '🤖 ตอบอัตโนมัติ (Auto-Answer)', value: cfg.autoAnswer !== false ? `เปิดใช้งาน (หน่วง ${cfg.answerDelayMs || 1800}ms)` : 'ปิดใช้งาน', inline: true },
        { name: '🔔 ดึงจออัตโนมัติ', value: cfg.autoBringToFront ? 'เปิดใช้งาน' : 'ปิดใช้งาน', inline: true },
        { name: '🔊 เสียงเตือนในเครื่อง', value: cfg.soundAlert ? 'เปิดใช้งาน' : 'ปิดใช้งาน', inline: true },
        { name: '📚 ฐานข้อมูลไอเทม', value: solver && solver.isReady() ? 'พร้อมใช้งาน (1,160 รายการ)' : 'กำลังเตรียมข้อมูล...', inline: true }
      ],
      footer: { text: 'PmheeAether Manager · Discord Integration' },
      timestamp: new Date().toISOString()
    };

    if (cfg.botToken && cfg.channelId) {
      const payload = {
        content: '👋 **ทดสอบการเชื่อมต่อสำเร็จ!**',
        embeds: [embed],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: 'ทดสอบปุ่ม 1', custom_id: 'hc_test_0' },
              { type: 2, style: 2, label: 'ทดสอบปุ่ม 2', custom_id: 'hc_test_1' }
            ]
          }
        ]
      };
      return await discordRequest(`/channels/${cfg.channelId}/messages`, 'POST', payload, cfg.botToken);
    } else if (cfg.webhookUrl) {
      const payload = {
        username: 'PmheeAether Alert Test',
        embeds: [embed]
      };
      return await discordRequest(cfg.webhookUrl, 'POST', payload);
    }
  }

  const townAlertCooldowns = new Map();

  async function notifyUnexpectedTown({ profile, unexpectedTown }) {
    const cfg = loadSettings();
    if (!cfg.enabled) return;

    const profileId = profile.id;
    const now = Date.now();
    const lastNotified = townAlertCooldowns.get(profileId) || 0;
    if (now - lastNotified < 5 * 60 * 1000) return; // at most once every 5 minutes per profile
    townAlertCooldowns.set(profileId, now);

    const remainingSec = Math.max(0, Math.ceil(((unexpectedTown.waitUntil || 0) - now) / 1000));
    const mm = Math.floor(remainingSec / 60);
    const ss = remainingSec % 60;
    const timeText = `${mm}:${ss < 10 ? '0' : ''}${ss} นาที`;

    const embed = {
      title: '🚨 [เตือนภัยบอท] ตรวจพบตัวละครกลับเมืองโดยไม่ทราบสาเหตุ!',
      description: `ตัวละคร **${profile.name}** กำลังอยู่ในเมืองหลวงโซลเฮเวนโดยตรวจไม่พบสาเหตุ\n(ไม่ได้เสียชีวิต / ไม่ได้กด Butterfly Wing / ไม่ได้กำลังเดินทางผ่านเมือง)\n\nระบบสั่งสุ่มพักรอนิรภัย **${timeText}** เพื่อความปลอดภัยสูงสุดของไอดี`,
      color: 0xEF4444,
      fields: [
        { name: '👤 จอโปรไฟล์', value: profile.name, inline: true },
        { name: '⏱️ ระยะเวลาพักรอ', value: timeText, inline: true },
        { name: '🛡️ สถานะระบบ', value: 'ระงับการเดินและรอครบเวลา หรือกดปุ่ม [ข้าม] ในหน้าจอเกม', inline: false }
      ],
      footer: { text: 'PmheeAether Anti-Detection System · Discord Alert' },
      timestamp: new Date().toISOString()
    };

    if (cfg.botToken && cfg.channelId) {
      const payload = {
        content: `🚨 **แจ้งเตือนความปลอดภัย:** ตรวจพบตัวละคร **${profile.name}** กลับเมืองโดยไม่ทราบสาเหตุ!`,
        embeds: [embed]
      };
      return await discordRequest(`/channels/${cfg.channelId}/messages`, 'POST', payload, cfg.botToken);
    } else if (cfg.webhookUrl) {
      const payload = {
        username: 'PmheeAether Safety Guard',
        embeds: [embed]
      };
      return await discordRequest(cfg.webhookUrl, 'POST', payload);
    }
  }

  // Initialize gateway on startup
  syncGatewayConnection();

  return {
    loadSettings,
    saveSettings,
    notifyHumanCheck,
    notifyUnexpectedTown,
    clearHumanCheck,
    answerCheckInGame,
    testNotification,
    syncGatewayConnection
  };
}

module.exports = { createDiscordBotService };
