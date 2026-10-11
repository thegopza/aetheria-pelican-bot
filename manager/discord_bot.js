// manager/discord_bot.js — Discord Webhook & Interactive Bot Integration for PmheeAether Manager
// Supports:
// 1. One-way Webhook notification (Rich Embed + Options)
// 2. Two-way Discord Bot (Gateway WebSocket + Interactive Buttons)
// 3. Human-in-the-loop: click button in Discord -> clicks answer in game window

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function createDiscordBotService({ dataDir, loadProfiles, evalProfilePort, focusProfileWindow }) {
  const SETTINGS_FILE = path.join(dataDir, 'discord_settings.json');

  // Load / Save Settings
  function loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      enabled: false,
      webhookUrl: '',
      botToken: '',
      channelId: '',
      autoBringToFront: true,
      soundAlert: true
    };
  }

  function saveSettings(settings) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
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

  // Gateway connection state
  let gatewayWs = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let lastSequence = null;
  let isConnecting = false;

  // HTTP helper for Discord REST API
  function discordRequest(endpoint, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint.startsWith('http') ? endpoint : `https://discord.com/api/v10${endpoint}`);
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bot ${token}`;
      }

      const req = https.request(url, {
        method,
        headers,
        timeout: 10000
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

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // Answer human check in the game window
  async function answerCheckInGame(profileId, pickIndex) {
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile || !profile.debugPort) {
      return { success: false, error: `ไม่พบโปรไฟล์ ${profileId} หรือโปรไฟล์ออฟไลน์อยู่` };
    }

    const evalCode = `(() => {
      try {
        const hc = document.querySelector('.human-check');
        if (!hc) return { success: false, error: 'ไม่พบหน้าต่างเช็คผู้เล่น (อาจปิดหรือตอบไปแล้ว)' };
        const btns = Array.from(hc.querySelectorAll('.human-check-pick'));
        const targetBtn = btns[${Number(pickIndex)}];
        if (!targetBtn) return { success: false, error: 'ไม่พบปุ่มตัวเลือกที่ ${pickIndex + 1}' };
        if (targetBtn.disabled) return { success: false, error: 'ปุ่มนี้ถูกกดไปแล้วหรือถูกปิดใช้งาน' };
        targetBtn.click();
        return { success: true, picked: ${pickIndex} };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()`;

    try {
      const res = await evalProfilePort(profile.debugPort, evalCode, 6000);
      return res?.result || { success: false, error: 'ไม่ได้รับการตอบรับจากจอเกม' };
    } catch (e) {
      return { success: false, error: e.message };
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
    // Format: hc_<profileId>_<pickIndex> or hc_<profileId>_focus
    if (!customId.startsWith('hc_')) return;

    const parts = customId.split('_');
    const profileId = parts[1];
    const action = parts[2];

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

    const pickIndex = parseInt(action, 10);
    if (isNaN(pickIndex)) {
      await respondInteraction(`❌ คำสั่งไม่ถูกต้อง: ${action}`);
      return;
    }

    // Answer in game
    const result = await answerCheckInGame(profileId, pickIndex);
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
    if (cfg.channelId && msg.channel_id !== cfg.channelId) return;

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
      if (info.notifiedAt > newestTime) {
        newestTime = info.notifiedAt;
        targetProfileId = pId;
      }
    }

    if (!targetProfileId) {
      // No active check registered
      return;
    }

    const result = await answerCheckInGame(targetProfileId, pickIndex);
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

  // Notify Discord about an active human check
  async function notifyHumanCheck({ profile, check }) {
    const cfg = loadSettings();
    if (!cfg.enabled) return;

    const profileId = profile.id;
    const now = Date.now();

    // Avoid duplicate alerts for the exact same check prompt within 90 seconds
    const existing = activeChecks.get(profileId);
    if (existing && existing.prompt === check.prompt && (now - existing.notifiedAt < 90000)) {
      return;
    }

    activeChecks.set(profileId, {
      checkId: check.id || now,
      prompt: check.prompt,
      notifiedAt: now,
      options: check.options || []
    });

    const charName = profile.liveState?.charName || profile.lastCharName || profile.name;
    const promptText = check.prompt || '(ไม่มีข้อความโจทย์)';
    const metaText = check.meta || '';
    const optionsCount = (check.options && check.options.length) || 4;

    // Auto-bring game window to front if enabled
    if (cfg.autoBringToFront && typeof focusProfileWindow === 'function') {
      try { focusProfileWindow(profileId); } catch (e) {}
    }

    // 1. Build Embed
    const embed = {
      title: `🚨 ตรวจพบเช็คผู้เล่น (Human Check)!`,
      description: `**จอเกม:** \`${profile.name}\` (ตัวละคร: **${charName}**)\n\n### ❓ โจทย์คำถาม:\n> **${promptText}**\n\n⏱️ **สถานะ:** ${metaText || 'กรุณาตอบภายในเวลา มิฉะนั้นจะถูกส่งเข้าคุก!'}`,
      color: 0xEF4444, // Red
      fields: [],
      footer: { text: `Aetheria Online · PmheeAether Manager · จอ #${profile.name}` },
      timestamp: new Date().toISOString()
    };

    // Add choices field description
    const optionDescriptions = (check.options || []).map((opt, i) => {
      return `**${i + 1}️⃣** ตัวเลือกที่ ${i + 1}`;
    }).join('\n');

    if (optionDescriptions) {
      embed.fields.push({
        name: `📋 ตัวเลือกรูปภาพ (${optionsCount} ตัวเลือก):`,
        value: optionDescriptions,
        inline: false
      });
    }

    // 2. Build Interactive Buttons (if botToken is available)
    let components = [];
    if (cfg.botToken && cfg.channelId) {
      const buttons = [];
      for (let i = 0; i < optionsCount; i++) {
        buttons.push({
          type: 2, // Button
          style: 1, // Primary (Blurple)
          label: `ข้อ ${i + 1}`,
          custom_id: `hc_${profileId}_${i}`
        });
      }

      // Action row for choice buttons
      components.push({
        type: 1, // Action Row
        components: buttons
      });

      // Secondary row for Focus / Window Bring-to-Front
      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 4, // Danger (Red)
            label: '🖥️ ดึงจอเกมขึ้นหน้าสุด',
            custom_id: `hc_${profileId}_focus`
          }
        ]
      });
    }

    // 3. Send via Bot Token (to channel) or Webhook
    if (cfg.botToken && cfg.channelId) {
      const payload = {
        content: `🚨 **แจ้งเตือนด่วน!** จอ **${charName}** (${profile.name}) มีคำถามเช็คผู้เล่น! กดปุ่มด้านล่างเพื่อตอบได้ทันที:`,
        embeds: [embed],
        components
      };
      const res = await discordRequest(`/channels/${cfg.channelId}/messages`, 'POST', payload, cfg.botToken);
      if (res.success && res.data?.id) {
        const info = activeChecks.get(profileId);
        if (info) info.messageId = res.data.id;
      }
    } else if (cfg.webhookUrl) {
      const payload = {
        username: 'PmheeAether Anti-Bot Alert',
        avatar_url: 'https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/manager/public/icon.png',
        content: `🚨 **แจ้งเตือนด่วน!** จอ **${charName}** (${profile.name}) มีคำถามเช็คผู้เล่น!`,
        embeds: [embed]
      };
      await discordRequest(cfg.webhookUrl, 'POST', payload);
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
        { name: '🔔 ดึงจออัตโนมัติ', value: cfg.autoBringToFront ? 'เปิดใช้งาน' : 'ปิดใช้งาน', inline: true },
        { name: '🔊 เสียงเตือนในเครื่อง', value: cfg.soundAlert ? 'เปิดใช้งาน' : 'ปิดใช้งาน', inline: true }
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

  // Initialize gateway on startup
  syncGatewayConnection();

  return {
    loadSettings,
    saveSettings,
    notifyHumanCheck,
    clearHumanCheck,
    answerCheckInGame,
    testNotification,
    syncGatewayConnection
  };
}

module.exports = { createDiscordBotService };
