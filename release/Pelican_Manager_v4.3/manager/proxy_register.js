// manager/proxy_register.js — Isolated Proxy Account Registration System
// Used ONLY during account sign-up to prevent hitting the game's limit of 3 IDs/hour/IP.
// Cloudflare server (api.noggunsshop.xyz) coordinates IP reservations and deducts 0.1 point only on success.

const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PROXY_HOST = 'gw.dataimpulse.com';
const DEFAULT_PROXY_PORT = 823;
const DEFAULT_PROXY_USER = '4d1ed17d79c50d9ed7f4';
const DEFAULT_PROXY_PASS = 'f8a9e1f2304e2c1d';
const DEFAULT_COUNTRY = 'th';
const POINT_COST_PER_ACCOUNT = 0.1;

function createProxyRegisterService({ dataDir, solver }) {
  const settingsFile = path.join(dataDir, 'proxy_settings.json');

  function loadSettings() {
    let s = {};
    try {
      if (fs.existsSync(settingsFile)) {
        s = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || {};
      }
    } catch (_) {}
    return {
      enabled: s.enabled === true,
      proxyHost: s.proxyHost || DEFAULT_PROXY_HOST,
      proxyPort: parseInt(s.proxyPort, 10) || DEFAULT_PROXY_PORT,
      proxyUser: s.proxyUser || DEFAULT_PROXY_USER,
      proxyPass: s.proxyPass || DEFAULT_PROXY_PASS,
      country: s.country || DEFAULT_COUNTRY,
      pointCost: POINT_COST_PER_ACCOUNT,
      registeredCount: parseInt(s.registeredCount, 10) || 0,
      lastRegisteredAt: s.lastRegisteredAt || null,
      lastTestedIp: s.lastTestedIp || null
    };
  }

  function saveSettings(patch) {
    const current = loadSettings();
    const updated = {
      ...current,
      ...patch,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      proxyHost: patch.proxyHost || current.proxyHost,
      proxyPort: parseInt(patch.proxyPort, 10) || current.proxyPort,
      proxyUser: patch.proxyUser || current.proxyUser,
      proxyPass: patch.proxyPass || current.proxyPass,
      country: patch.country || current.country,
      pointCost: POINT_COST_PER_ACCOUNT
    };
    try {
      fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2), 'utf8');
    } catch (e) {
      console.error('[ProxyRegister] Failed to save settings:', e.message);
    }
    return updated;
  }

  function publicSettings() {
    const s = loadSettings();
    return {
      enabled: s.enabled,
      pointCost: s.pointCost,
      country: s.country,
      registeredCount: s.registeredCount,
      lastRegisteredAt: s.lastRegisteredAt,
      lastTestedIp: s.lastTestedIp
    };
  }

  function createTunnel(targetHost, targetPort, user, pass, proxyHost, proxyPort, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      const req = http.request({
        host: proxyHost,
        port: proxyPort,
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: {
          'Host': `${targetHost}:${targetPort}`,
          'Proxy-Authorization': `Basic ${auth}`
        },
        timeout: timeoutMs
      });

      req.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          return reject(new Error(`Proxy CONNECT error: ${res.statusCode} ${res.statusMessage || ''}`));
        }
        const tlsSocket = tls.connect({ socket, servername: targetHost }, () => resolve(tlsSocket));
        tlsSocket.on('error', reject);
      });

      req.on('timeout', () => req.destroy(new Error('Proxy CONNECT timed out')));
      req.on('error', reject);
      req.end();
    });
  }

  async function fetchEgressIp(user, pass, proxyHost, proxyPort) {
    const socket = await createTunnel('api.ipify.org', 443, user, pass, proxyHost, proxyPort, 10000);
    return new Promise((resolve, reject) => {
      const client = https.request({
        host: 'api.ipify.org',
        path: '/?format=json',
        method: 'GET',
        headers: { 'Host': 'api.ipify.org', 'Accept': 'application/json' },
        createConnection: () => socket,
        timeout: 10000
      }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data?.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(data.ip)) {
              resolve(data.ip);
            } else {
              reject(new Error('Invalid IP from ipify: ' + body.slice(0, 100)));
            }
          } catch (e) {
            reject(new Error('Failed to parse IP response: ' + body.slice(0, 100)));
          }
        });
      });
      client.on('timeout', () => client.destroy(new Error('ipify request timed out')));
      client.on('error', reject);
      client.end();
    });
  }

  async function testConnection() {
    const s = loadSettings();
    const sessionTag = 'test_' + Date.now().toString(36);
    const user = `${s.proxyUser}__cr-${s.country}__session-${sessionTag}`;
    try {
      const ip = await fetchEgressIp(user, s.proxyPass, s.proxyHost, s.proxyPort);
      saveSettings({ lastTestedIp: ip });
      let cloudflareStatus = null;
      if (solver && typeof solver.proxyStatus === 'function') {
        try {
          cloudflareStatus = await solver.proxyStatus(ip);
        } catch (_) {}
      }
      return {
        success: true,
        ip,
        country: s.country,
        cloudflareStatus
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  async function registerAccountWithProxy({ username, password }) {
    const s = loadSettings();
    if (!s.enabled) {
      throw new Error('ระบบ Proxy สำหรับสมัครไอดีถูกปิดอยู่');
    }
    if (!solver || typeof solver.proxyReserve !== 'function') {
      throw new Error('ไม่พบระบบเชื่อมต่อ Cloudflare สำหรับตรวจสอบโควต้า');
    }

    // 1. Check user point balance first
    const balance = await solver.refreshBalance().catch(() => null);
    const balanceUnits = balance?.balanceUnits ?? 0;
    if (balanceUnits < 10) {
      throw new Error('ส่วนบุญไม่เพียงพอสำหรับการใช้ Proxy สมัครไอดี (ต้องการ 0.1 ส่วนบุญ, ปัจจุบันมี ' + (balanceUnits / 100) + ' ส่วนบุญ)');
    }

    // 2. Obtain a clean, non-rate-limited IP by rotating sessions
    let reservedTicket = null;
    let reservedIp = null;
    let attempts = 0;
    const maxAttempts = 6;

    while (attempts < maxAttempts) {
      attempts++;
      const sessionTag = `reg_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
      const user = `${s.proxyUser}__cr-${s.country}__session-${sessionTag}`;

      let ip = null;
      try {
        ip = await fetchEgressIp(user, s.proxyPass, s.proxyHost, s.proxyPort);
      } catch (e) {
        console.warn(`[ProxyRegister] Attempt ${attempts}: Fetch egress IP failed: ${e.message}`);
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      console.log(`[ProxyRegister] Attempt ${attempts}: Acquired proxy IP ${ip}, requesting Cloudflare reservation...`);
      try {
        const reserveRes = await solver.proxyReserve(ip);
        if (reserveRes?.success && reserveRes.ticketId) {
          reservedTicket = reserveRes.ticketId;
          reservedIp = ip;
          console.log(`[ProxyRegister] ✅ Cloudflare reserved slot #${reserveRes.slot} for IP ${ip} (Ticket: ${reservedTicket})`);
          break;
        } else if (reserveRes?.code === 'IP_RATE_LIMITED') {
          console.log(`[ProxyRegister] ⚠️ IP ${ip} is rate-limited (3 IDs reached this hour). Rotating to new session...`);
          await new Promise(r => setTimeout(r, 500));
          continue;
        } else {
          console.warn(`[ProxyRegister] Reservation returned: ${JSON.stringify(reserveRes)}`);
        }
      } catch (e) {
        console.error(`[ProxyRegister] Cloudflare reserve failed:`, e.message);
        throw e;
      }
    }

    if (!reservedTicket || !reservedIp) {
      throw new Error('ไม่สามารถจัดสรร IP ที่ไม่ติดลิมิตได้หลังจากพยายาม ' + maxAttempts + ' ครั้ง กรุณาลองใหม่อีกครั้ง');
    }

    // 3. Perform registration through the reserved proxy session
    try {
      const sessionTag = `active_${reservedTicket.slice(0, 8)}`;
      // Re-use session with sticky parameter if needed, or session tag
      const user = `${s.proxyUser}__cr-${s.country}__session-${sessionTag}`;
      const socket = await createTunnel('www.aetheria-online.in.th', 443, user, s.proxyPass, s.proxyHost, s.proxyPort, 15000);

      const regPayload = JSON.stringify({ userId: username, password: password });
      const regResponse = await new Promise((resolve, reject) => {
        const req = https.request({
          host: 'www.aetheria-online.in.th',
          port: 443,
          path: '/auth/register',
          method: 'POST',
          headers: {
            'Host': 'www.aetheria-online.in.th',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(regPayload),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://www.aetheria-online.in.th',
            'Referer': 'https://www.aetheria-online.in.th/'
          },
          createConnection: () => socket,
          timeout: 20000
        }, res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', c => body += c);
          res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });

        req.on('timeout', () => req.destroy(new Error('Game register request timed out')));
        req.on('error', reject);
        req.write(regPayload);
        req.end();
      });

      console.log(`[ProxyRegister] Game registration response: status=${regResponse.statusCode}, body=${regResponse.body.slice(0, 200)}`);

      // 4. Evaluate game server response
      if (regResponse.statusCode >= 200 && regResponse.statusCode < 300) {
        // Success! Complete reservation and charge 0.1 point
        const comp = await solver.proxyComplete(reservedTicket, username, true);
        console.log(`[ProxyRegister] 🎉 สมัครสำเร็จ! บัญชี: ${username}, IP: ${reservedIp}, หักแต้ม: 0.1, คงเหลือ: ${comp.balance}`);
        saveSettings({
          registeredCount: (s.registeredCount || 0) + 1,
          lastRegisteredAt: Date.now(),
          lastTestedIp: reservedIp
        });
        return {
          success: true,
          username,
          ip: reservedIp,
          ticketId: reservedTicket,
          chargedPoints: 0.1,
          newBalance: comp.balance
        };
      }

      // If registration failed
      let errJson = null;
      try { errJson = JSON.parse(regResponse.body); } catch (_) {}
      const errMsg = errJson?.error || errJson?.message || `HTTP ${regResponse.statusCode}`;

      // Release ticket without charge
      await solver.proxyComplete(reservedTicket, username, false).catch(() => {});

      if (regResponse.statusCode === 409 || errMsg.includes('ถูกใช้แล้ว')) {
        return {
          success: false,
          code: 'USERNAME_TAKEN',
          error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว (' + username + ')',
          ip: reservedIp
        };
      }

      return {
        success: false,
        code: 'GAME_SERVER_REJECTED',
        error: errMsg,
        ip: reservedIp
      };

    } catch (err) {
      // Release ticket on network or socket error
      if (reservedTicket) {
        await solver.proxyComplete(reservedTicket, username, false).catch(() => {});
      }
      throw err;
    }
  }

  return {
    loadSettings,
    saveSettings,
    publicSettings,
    testConnection,
    registerAccountWithProxy,
    isEnabled: () => loadSettings().enabled
  };
}

module.exports = { createProxyRegisterService };
