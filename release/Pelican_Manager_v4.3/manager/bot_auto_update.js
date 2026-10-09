// manager/bot_auto_update.js — Reload game clients automatically when bot.js changes on GitHub.
//
// The game loader (main.js) already fetches the latest bot.js from GitHub on every page load,
// so an update is just a page reload. This module decides *when*:
//   1. Poll the GitHub API for the newest commit touching bot.js (only bot.js commits count).
//   2. Wait until raw.githubusercontent.com actually serves that file (its CDN can lag ~5 min),
//      verified by the git blob sha, then also refresh the local fallback resources/bot.js.
//   3. Reload outdated clients one at a time, only while the bot is in a safe state
//      (never mid Alice walk, NPC shopping, revive, consolidation/trade, job change, ...).
//   4. Make sure a bot that was farming before the reload is running again afterwards.

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO = 'thegopza/aetheria-pelican-bot';
const RAW_BOT_URL = `https://raw.githubusercontent.com/${REPO}/main/bot.js`;
const POLL_MS = 5 * 60 * 1000;
const TICK_MS = 15 * 1000;
const RAW_WAIT_LIMIT_MS = 20 * 60 * 1000;
const RESUME_GRACE_MS = 45 * 1000;
const CLIENT_BACK_TIMEOUT_MS = 3 * 60 * 1000;

// Evaluated in the game: page load time, busy flags and whether the bot is farming.
const CLIENT_PROBE_JS = `(() => {
  const busy = [];
  if (window.__isWalkingToMap) busy.push('กำลังเดินกลับแมพผ่าน Alice');
  if (window.__isShopping) busy.push('กำลังซื้อ/ขายกับ NPC');
  if (window.__isRecovering) busy.push('กำลังชุบชีวิต');
  if (window.__isNavigating) busy.push('กำลังเดินทาง');
  if (window.__isConsolidating || window.__consolidationReceiverMode) busy.push('กำลังรวมเงิน/เทรด');
  if (window.__isChangingJob) busy.push('กำลังเปลี่ยนอาชีพ');
  if (window.__isManualSelling || window.__isAutoSellingNow) busy.push('กำลังขายของ');
  if (window.__isMarketScanning) busy.push('กำลังสแกนตลาด');
  const nameEl = document.querySelector('.hud-name');
  let map = '';
  try { map = (typeof window.__getClientLiveState === 'function' && window.__getClientLiveState().map) || ''; } catch (e) {}
  return {
    loadedAt: Math.round(performance.timeOrigin),
    version: window.__pelicanBotVersion || null,
    inGame: Boolean(nameEl && map && !map.startsWith('ไม่ทราบ')),
    running: Boolean(window.__autoLoopEnabled || window.__isBotRunning),
    busy
  };
})()`;

const START_BOT_JS = `(() => {
  window.__autoLoopEnabled = true;
  window.__isBotRunning = true;
  try { localStorage.setItem('pelican_auto_loop', true); localStorage.setItem('pelican_bot_running', 'true'); } catch (e) {}
  if (typeof window.startMasterBot === 'function') window.startMasterBot();
  if (typeof window.startAutoLoop === 'function') window.startAutoLoop();
  return true;
})()`;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Pelican-Manager', 'Accept': 'application/vnd.github+json' }, timeout: 10000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`GitHub HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Pelican-Manager', 'Cache-Control': 'no-cache' }, timeout: 20000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => res.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(`HTTP ${res.statusCode}`)));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

const gitBlobSha = buf => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function createBotAutoUpdater({ loadProfiles, evalProfilePort, getGameDir, dataDir }) {
  const stateFile = path.join(dataDir, 'bot_update_state.json');
  let saved = { enabled: true };
  try { saved = Object.assign(saved, JSON.parse(fs.readFileSync(stateFile, 'utf8'))); } catch (e) {}

  const status = {
    enabled: saved.enabled !== false,
    lastCheckAt: null,
    lastError: null,
    latest: null,          // { sha, message, date, blobSha }
    ready: null,           // { sha, at } — raw CDN confirmed serving this version
    phase: 'idle',         // idle | waiting-cdn | updating
    clients: {}            // profileId -> { name, state, note, at }
  };
  let busyCycle = false;

  const persist = () => {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ enabled: status.enabled }, null, 2));
    } catch (e) {}
  };
  const setClient = (p, state, note, version) => {
    const prev = status.clients[p.id];
    status.clients[p.id] = { name: p.name, state, note: note || '', at: Date.now(), version: version || (prev && prev.version) || null };
  };

  async function probe(p) {
    const r = await evalProfilePort(p.debugPort, CLIENT_PROBE_JS, 4000);
    return r && r.success && r.result && typeof r.result === 'object' ? r.result : null;
  }

  async function checkGitHub() {
    status.lastCheckAt = Date.now();
    try {
      const commits = await getJSON(`https://api.github.com/repos/${REPO}/commits?path=bot.js&per_page=1`);
      const c = commits && commits[0];
      if (!c) throw new Error('ไม่พบ commit ของ bot.js');
      if (!status.latest || status.latest.sha !== c.sha) {
        const tree = await getJSON(`https://api.github.com/repos/${REPO}/git/trees/${c.sha}`);
        const entry = (tree.tree || []).find(t => t.path === 'bot.js');
        status.latest = {
          sha: c.sha,
          message: String(c.commit?.message || '').split('\n')[0],
          date: Date.parse(c.commit?.committer?.date) || Date.now(),
          blobSha: entry ? entry.sha : null
        };
        if (!status.ready || status.ready.sha !== c.sha) status.ready = null;
      }
      status.lastError = null;
    } catch (e) {
      status.lastError = `เช็ก GitHub ไม่สำเร็จ: ${e.message}`;
    }
  }

  // Wait until the raw URL the game loader uses serves this exact blob, then refresh the local fallback.
  async function waitForRaw() {
    const latest = status.latest;
    if (!latest || !latest.blobSha || (status.ready && status.ready.sha === latest.sha)) return;
    status.phase = 'waiting-cdn';
    const started = Date.now();
    let attempts = 0;
    while (Date.now() - started < RAW_WAIT_LIMIT_MS && status.latest === latest) {
      attempts++;
      try {
        const buf = await getBuffer(`${RAW_BOT_URL}?t=${Date.now()}`);
        if (gitBlobSha(buf) === latest.blobSha) {
          // observedLive: we saw the CDN switch over, so `at` is a tight bound for "served from now on"
          status.ready = { sha: latest.sha, at: Date.now(), observedLive: attempts > 1 };
          try {
            const local = path.join(getGameDir(), 'resources', 'bot.js');
            if (fs.existsSync(path.dirname(local))) fs.writeFileSync(local, buf);
          } catch (e) {}
          return;
        }
      } catch (e) {}
      await sleep(30000);
    }
    status.phase = 'idle';
  }

  // A client is outdated if its page was loaded before the raw URL served this version.
  // When we didn't watch the CDN switch over (e.g. Manager started later), allow for its ~5 min cache.
  const CDN_LAG_MS = 6 * 60 * 1000;
  function outdatedThreshold() {
    if (!status.latest || !status.ready) return null;
    if (status.ready.observedLive) return status.ready.at;
    return Math.min(status.latest.date + CDN_LAG_MS, status.ready.at);
  }

  async function reloadClient(p, info) {
    const wasRunning = info.running;
    setClient(p, 'reloading', 'กำลังรีเฟรชหน้าเกม...');
    // Fire and forget: the page unloads, so the eval never answers.
    evalProfilePort(p.debugPort, `(() => { try { localStorage.setItem('pelican_bot_running', ${wasRunning ? "'true'" : "'false'"}); } catch (e) {} setTimeout(() => location.reload(), 150); return true; })()`, 2000);
    await sleep(8000);

    const started = Date.now();
    let resumedAt = null;
    while (Date.now() - started < CLIENT_BACK_TIMEOUT_MS) {
      const now = await probe(p);
      if (now && now.inGame && now.loadedAt > info.loadedAt) {
        if (!wasRunning || now.running) {
          setClient(p, 'done', wasRunning ? 'อัปเดตแล้ว บอททำงานต่อ' : 'อัปเดตแล้ว', now.version);
          return;
        }
        resumedAt = resumedAt || Date.now();
        if (Date.now() - resumedAt > RESUME_GRACE_MS) {
          await evalProfilePort(p.debugPort, START_BOT_JS, 4000);
          setClient(p, 'done', 'อัปเดตแล้ว (Manager สั่งเริ่มบอทให้)', now.version);
          return;
        }
        setClient(p, 'resuming', 'รอบอทกลับมาทำงานต่อ...');
      }
      await sleep(5000);
    }
    setClient(p, 'error', 'รีเฟรชแล้วแต่ตัวละครยังไม่กลับเข้าเกม — ตรวจสอบจอนี้');
  }

  async function updateCycle() {
    if (busyCycle) return;
    busyCycle = true;
    try {
      if (!status.ready) return;
      const threshold = outdatedThreshold();
      const profiles = loadProfiles().filter(p => p.debugPort);
      let pending = 0;
      for (const p of profiles) {
        const info = await probe(p);
        if (!info) { delete status.clients[p.id]; continue; }
        if (info.loadedAt >= threshold) {
          if (!status.clients[p.id] || status.clients[p.id].state !== 'done') setClient(p, 'up-to-date', 'ใช้เวอร์ชันล่าสุดอยู่แล้ว', info.version);
          else status.clients[p.id].version = info.version;
          continue;
        }
        pending++;
        if (!status.enabled) { setClient(p, 'outdated', 'มีเวอร์ชันใหม่ (ปิดอัปเดตอัตโนมัติอยู่)', info.version); continue; }
        if (!info.inGame) { setClient(p, 'waiting', 'รอให้ตัวละครอยู่ในเกมก่อน', info.version); continue; }
        if (info.busy.length) { setClient(p, 'waiting', `รอจังหวะปลอดภัย: ${info.busy.join(', ')}`, info.version); continue; }
        status.phase = 'updating';
        await reloadClient(p, info);   // one client at a time
        pending--;
      }
      status.phase = pending > 0 ? 'updating' : 'idle';
    } finally {
      busyCycle = false;
    }
  }

  async function checkNow() {
    await checkGitHub();
    await waitForRaw();
    await updateCycle();
  }

  function start() {
    // First check after a minute so a freshly started Manager doesn't reload clients immediately.
    setTimeout(() => { checkNow(); setInterval(() => checkGitHub().then(waitForRaw), POLL_MS); }, 60 * 1000);
    setInterval(() => { if (status.ready) updateCycle(); }, TICK_MS);
  }

  async function handleRoute(req, res, pathname, sendJSON) {
    if (pathname === '/api/bot-update/status' && req.method === 'GET') {
      sendJSON({ success: true, ...status, pollMinutes: POLL_MS / 60000 });
      return true;
    }
    if (pathname === '/api/bot-update/settings' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.on('end', r));
      try {
        const p = JSON.parse(body || '{}');
        if (typeof p.enabled === 'boolean') { status.enabled = p.enabled; persist(); }
        sendJSON({ success: true, enabled: status.enabled });
      } catch (e) {
        sendJSON({ success: false, error: 'Invalid JSON' }, 400);
      }
      return true;
    }
    if (pathname === '/api/bot-update/check' && req.method === 'POST') {
      checkNow();
      sendJSON({ success: true });
      return true;
    }
    return false;
  }

  return { start, handleRoute, status };
}

module.exports = { createBotAutoUpdater };
