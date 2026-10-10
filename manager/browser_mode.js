// manager/browser_mode.js — run game clients as windows of ONE real Chrome / Edge instead of one Electron
// app per client. All windows share one browser + GPU process (much lighter than N Electron apps).
//
// The Manager drives that browser through the Chrome DevTools Protocol (remote debugging port) and, for each
// profile, serves the same small HTTP API the Electron loader serves on profile.debugPort (/api/eval,
// /api/state, /api/window), so the rest of the Manager works unchanged.
// - each window gets window.__pmProfileId before the page runs: bot.js uses it to keep its localStorage
//   settings per profile (all windows share one browser storage)
// - bot.js (GitHub, local fallback) + msgpack are injected on every load of the game page
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const GAME_URL = 'https://www.aetheria-online.in.th/play';
const BOT_URL = 'https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/bot.js';
const CDP_PORT = 9339;

function findBrowser(kind) {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const chrome = [path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'), path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), path.join(local, 'Google\\Chrome\\Application\\chrome.exe')];
  const edge = [path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')];
  const list = kind === 'edge' ? edge.concat(chrome) : chrome.concat(edge);
  return list.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}

function getText(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function createBrowserMode({ rootDir, sessionsDir, getSettings, loadProfiles, preferLocalBot }) {
  const userDataDir = path.join(sessionsDir, '_browser');
  const localBotPath = path.join(rootDir, 'bot.js');
  let browserProc = null;
  let ws = null, wsReady = null, nextId = 1;
  const pending = new Map();            // CDP call id -> {resolve, reject}
  const listeners = new Set();          // CDP event listeners
  const clients = new Map();            // profileId -> { targetId, sessionId, server, port }
  let startupPages = [];                // the empty window Chrome opens on start — closed once a game window exists
  const portServers = new Map();        // port -> proxy server (one per port, even if a client object went stale)
  let rediscovering = null;

  // A window that is gone (closed with Chrome's X, crashed, browser closed, CDP reconnected) must not stay
  // "open": that made launch answer "already open" and left a proxy with a dead session on the port.
  function drop(c) {
    if (!c) return;
    stopProxy(c);
    if (clients.get(c.profileId) === c) clients.delete(c.profileId);
  }
  const isGoneError = e => /Session with given id not found|No target with given id|Target closed|CDP closed|CDP not connected/i.test(String(e && e.message || e));

  // ---------- CDP connection ----------
  async function connect() {
    if (ws && ws.readyState === 1) return;
    if (wsReady) return wsReady;
    wsReady = (async () => {
      const info = JSON.parse(await getText(`http://127.0.0.1:${CDP_PORT}/json/version`, 3000));
      await new Promise((resolve, reject) => {
        ws = new WebSocket(info.webSocketDebuggerUrl);
        ws.onopen = resolve;
        ws.onerror = e => reject(new Error('CDP connect failed'));
        ws.onclose = () => { ws = null; for (const [, p] of pending) p.reject(new Error('CDP closed')); pending.clear(); Array.from(clients.values()).forEach(drop); };
        ws.onmessage = ev => {
          const msg = JSON.parse(ev.data);
          if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id); pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
          } else if (msg.method) {
            listeners.forEach(fn => { try { fn(msg); } catch (e) {} });
          }
        };
      });
    })();
    try { await wsReady; } finally { wsReady = null; }
    await send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
  }
  function send(method, params = {}, sessionId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) return reject(new Error('CDP not connected'));
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, timeoutMs);
    });
  }

  async function browserAlive() {
    try { await getText(`http://127.0.0.1:${CDP_PORT}/json/version`, 1500); return true; } catch (e) { return false; }
  }

  async function ensureBrowser() {
    if (await browserAlive()) return connect();
    const settings = getSettings() || {};
    const exe = findBrowser(settings.browserKind);
    if (!exe) throw new Error('ไม่พบ Google Chrome หรือ Microsoft Edge ในเครื่อง');
    fs.mkdirSync(userDataDir, { recursive: true });
    const args = [
      `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      // the bot's timers must keep running in background / covered windows
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
      '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank'
    ];
    browserProc = spawn(exe, args, { detached: true, stdio: 'ignore' });
    browserProc.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (await browserAlive()) {
        await connect();
        try { startupPages = (await send('Target.getTargets')).targetInfos.filter(t => t.type === 'page').map(t => t.targetId); } catch (e) {}
        return;
      }
    }
    throw new Error('เปิดเบราว์เซอร์ไม่สำเร็จ');
  }

  // ---------- bot injection ----------
  async function botSource() {
    if (preferLocalBot) return fs.readFileSync(localBotPath, 'utf8');
    try {
      const code = await getText(BOT_URL + '?t=' + Date.now(), 8000);
      if (code.length > 1000) return code;
    } catch (e) {}
    return fs.readFileSync(localBotPath, 'utf8');
  }
  const MSGPACK = `(function(){ if (!window.msgpack) { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js'; document.head.appendChild(s); } })(); void 0;`;

  async function injectBot(c) {
    try {
      await send('Runtime.evaluate', { expression: MSGPACK }, c.sessionId);
      const code = await botSource();
      await send('Runtime.evaluate', { expression: code + '\n; void 0;' }, c.sessionId);
      console.log(`[BrowserMode] 🚀 ใส่บอทในหน้าต่างของ ${c.profileId} แล้ว`);
    } catch (e) {
      console.warn(`[BrowserMode] inject failed for ${c.profileId}:`, e.message);
    }
  }

  listeners.add(msg => {
    if (msg.method !== 'Page.loadEventFired' || !msg.sessionId) return;
    const c = Array.from(clients.values()).find(x => x.sessionId === msg.sessionId);
    if (!c) return;
    send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, c.sessionId)
      .then(r => { if (String(r && r.result && r.result.value).includes('aetheria-online.in.th/play')) injectBot(c); })
      .catch(() => {});
  });
  listeners.add(msg => {
    if (msg.method === 'Target.targetDestroyed' || (msg.method === 'Target.targetCrashed')) {
      for (const c of Array.from(clients.values())) if (c.targetId === msg.params.targetId) drop(c);
    }
    if (msg.method === 'Target.detachedFromTarget') {
      for (const c of Array.from(clients.values())) if (c.sessionId === msg.params.sessionId) drop(c);
    }
  });

  async function attach(profileId, targetId) {
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pmProfileId = ${JSON.stringify(profileId)};` }, sessionId);
    const c = { profileId, targetId, sessionId };
    clients.set(profileId, c);
    return c;
  }

  // After a Manager restart the browser windows are still there: find them again by __pmProfileId
  function rediscover() {
    if (!rediscovering) rediscovering = rediscoverOnce().finally(() => { rediscovering = null; });
    return rediscovering;
  }
  async function rediscoverOnce() {
    if (!(await browserAlive())) return;
    await connect();
    const { targetInfos } = await send('Target.getTargets');
    for (const t of targetInfos.filter(x => x.type === 'page' && x.url.includes('aetheria-online.in.th'))) {
      if (Array.from(clients.values()).some(c => c.targetId === t.targetId)) continue;
      try {
        const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
        const r = await send('Runtime.evaluate', { expression: 'window.__pmProfileId || null', returnByValue: true }, sessionId);
        const pid = r && r.result && r.result.value;
        await send('Target.detachFromTarget', { sessionId }).catch(() => {});
        const profile = pid && loadProfiles().find(p => p.id === pid);
        if (profile) { const c = await attach(pid, t.targetId); startProxy(c, profile.debugPort); }
      } catch (e) {}
    }
  }

  // ---------- per-profile HTTP API (same as the Electron loader's) ----------
  async function evaluate(c, code) {
    // long scripts (channel switch waiting for a free slot, trades) may take minutes, like the Electron loader allows
    const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }, c.sessionId, 300000);
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'Script failed');
    return r.result ? r.result.value : undefined;
  }
  async function windowAction(c, action, q) {
    const { windowId } = await send('Browser.getWindowForTarget', { targetId: c.targetId });
    const set = bounds => send('Browser.setWindowBounds', { windowId, bounds });
    if (action === 'hide' || action === 'minimize') {
      await set({ windowState: 'minimized' });
      await evaluate(c, `typeof window.setLowPowerMode === 'function' && window.setLowPowerMode(true)`).catch(() => {});
    } else if (action === 'show' || action === 'restore' || action === 'top' || action === 'focus') {
      await set({ windowState: 'normal' });
      if (action === 'top' || action === 'focus') await send('Target.activateTarget', { targetId: c.targetId });
      await evaluate(c, `typeof window.setLowPowerMode === 'function' && window.setLowPowerMode(false)`).catch(() => {});
    } else if (action === 'set-bounds') {
      await set({ windowState: 'normal' });
      await set({ left: Number(q.get('x')) || 0, top: Number(q.get('y')) || 0, width: Number(q.get('w')) || 640, height: Number(q.get('h')) || 520 });
    }
  }
  function startProxy(c, port) {
    if (c.server) return;
    c.port = port;
    c.server = http.createServer(async (req, res) => {
      req.setEncoding('utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const url = new URL(req.url, 'http://127.0.0.1');
      const reply = (status, obj) => { res.writeHead(status); res.end(JSON.stringify(obj)); };
      try {
        if (url.pathname === '/api/eval') {
          let code = url.searchParams.get('code');
          if (req.method === 'POST') {
            let body = '';
            for await (const chunk of req) body += chunk;
            try { code = JSON.parse(body).code || body; } catch (e) { code = body; }
          }
          if (!code) return reply(400, { error: 'Missing code' });
          try { return reply(200, { success: true, result: await evaluate(c, code) }); }
          catch (e) { if (isGoneError(e)) drop(c); return reply(500, { success: false, error: e.message }); }
        }
        if (url.pathname === '/api/state') {
          return reply(200, await evaluate(c, `typeof window.__getClientLiveState === 'function' ? window.__getClientLiveState() : null`));
        }
        if (url.pathname === '/api/window') {
          await windowAction(c, url.searchParams.get('action'), url.searchParams);
          return reply(200, { success: true });
        }
        reply(200, { name: 'PmheeAether browser-mode client', profileId: c.profileId, endpoints: ['/api/eval', '/api/state', '/api/window'] });
      } catch (e) {
        if (isGoneError(e)) drop(c);
        reply(500, { success: false, error: e.message });
      }
    });
    c.server.on('error', e => console.warn(`[BrowserMode] port ${port}: ${e.message}`));
    const old = portServers.get(port);
    if (old) { try { old.close(); old.closeAllConnections && old.closeAllConnections(); } catch (e) {} }
    portServers.set(port, c.server);
    c.server.listen(port, '127.0.0.1');
  }
  function stopProxy(c) {
    if (c && c.server) {
      try { c.server.close(); c.server.closeAllConnections && c.server.closeAllConnections(); } catch (e) {}
      if (portServers.get(c.port) === c.server) portServers.delete(c.port);
      c.server = null;
    }
  }

  // ---------- public ----------
  async function launch(profile) {
    await ensureBrowser();
    await rediscover();
    const existing = clients.get(profile.id);
    if (existing) {
      const { targetInfos } = await send('Target.getTargets');
      if (targetInfos.some(t => t.targetId === existing.targetId)) {
        await windowAction(existing, 'focus', new URLSearchParams()).catch(() => {});
        return { success: true, message: 'หน้าต่างนี้เปิดอยู่แล้ว', alreadyOpen: true };
      }
      drop(existing);
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const c = await attach(profile.id, targetId);
    startProxy(c, profile.debugPort);
    await send('Page.navigate', { url: GAME_URL }, c.sessionId);
    for (const targetId of startupPages.splice(0)) await send('Target.closeTarget', { targetId }).catch(() => {});
    return { success: true, message: 'เปิดหน้าต่างเบราว์เซอร์แล้ว' };
  }
  async function stop(profileId) {
    const c = clients.get(profileId);
    if (!c) return false;
    stopProxy(c);
    clients.delete(profileId);
    await send('Target.closeTarget', { targetId: c.targetId }).catch(() => {});
    return true;
  }
  const isOpen = profileId => clients.has(profileId);

  function start() {
    // reconnect to a browser left open by a previous Manager run
    setTimeout(() => rediscover().catch(() => {}), 3000);
  }

  return { launch, stop, isOpen, start, findBrowser };
}

module.exports = { createBrowserMode, findBrowser };
