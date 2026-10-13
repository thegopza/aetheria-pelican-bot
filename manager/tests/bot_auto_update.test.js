'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createBotAutoUpdater } = require('../bot_auto_update');

function createHarness({ managedRelease = null, getRelease = null, clients = {}, evalHandler, dataDir: reuseDir = null } = {}) {
  const dataDir = reuseDir || path.join(os.tmpdir(), 'temp_bot_update_' + Math.random().toString(36).slice(2));
  fs.mkdirSync(dataDir, { recursive: true });
  if (!reuseDir) fs.writeFileSync(path.join(dataDir, 'bot_update_state.json'), JSON.stringify({ enabled: true }));

  const profiles = Object.keys(clients).map(id => ({ id, debugPort: 50000 + (parseInt(id.replace(/\D/g, ''), 10) || 1) }));
  const evalLog = [];
  let currentTime = 1000000;

  const evalProfilePort = async (port, code, timeout) => {
    evalLog.push({ port, code, timeout });
    if (evalHandler) return evalHandler(port, code, timeout);
    const profile = profiles.find(p => p.debugPort === port);
    if (!profile) return { success: false, error: 'NO_PROFILE' };
    const state = clients[profile.id];
    if (typeof state === 'function') return state(code);
    return { success: true, result: state };
  };

  const updater = createBotAutoUpdater({
    loadProfiles: () => profiles,
    evalProfilePort,
    getGameDir: () => dataDir,
    getManagedRelease: getRelease || (() => managedRelease),
    dataDir,
    clock: () => currentTime,
    sleep: async (ms) => { currentTime += (ms || 1000); },
    clientBackTimeoutMs: 10000
  });

  const cleanup = () => {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  };

  return { updater, evalLog, cleanup, profiles, dataDir };
}

test('managed release checks version and payloadHash; up-to-date client does not reload', async () => {
  const hash = 'a'.repeat(64);
  const { updater, evalLog, cleanup } = createHarness({
    managedRelease: { version: '4.38.0', hash },
    clients: {
      p1: { loadedAt: 1000, version: '4.38.0', payloadHash: hash, inGame: true, running: true, busy: [] }
    }
  });

  try {
    await updater.checkNow();
    assert.equal(updater.status.latest.version, '4.38.0');
    assert.equal(updater.status.latest.sha, hash);
    assert.equal(updater.status.latest.managed, true);
    assert.equal(updater.status.ready.sha, hash);

    assert.equal(updater.status.clients.p1.state, 'up-to-date');
    assert.equal(evalLog.some(e => e.code.includes('location.reload()')), false);
  } finally {
    cleanup();
  }
});

test('managed release reloads outdated client with different hash, and does not start bot if was not running', async () => {
  const hash = 'b'.repeat(64);
  let reloaded = false;
  let startedBot = false;

  const { updater, evalLog, cleanup } = createHarness({
    managedRelease: { version: '4.38.0', hash },
    clients: { p1: true },
    evalHandler: async (port, code) => {
      if (code.includes('location.reload()')) {
        reloaded = true;
        return { success: true, result: true };
      }
      if (code.includes('window.__isBotRunning = true')) {
        startedBot = true;
        return { success: true, result: true };
      }
      return {
        success: true,
        result: reloaded
          ? { loadedAt: 2000, version: '4.38.0', payloadHash: hash, inGame: true, running: false, busy: [] }
          : { loadedAt: 1000, version: '4.37.0', payloadHash: null, inGame: true, running: false, busy: [] }
      };
    }
  });

  try {
    await updater.checkNow();
    assert.equal(updater.status.latest.managed, true);
    assert.equal(reloaded, true);
    assert.equal(startedBot, false);
    assert.equal(updater.status.clients.p1.state, 'done');
    assert.equal(updater.status.clients.p1.note, 'อัปเดตแล้ว');
    assert.equal(evalLog.some(e => e.code.includes('window.__isBotRunning = true')), false);
  } finally {
    cleanup();
  }
});

test('managed release reloads outdated client and resumes bot if was running', async () => {
  const hash = 'c'.repeat(64);
  let reloaded = false;
  let startedBot = false;

  const { updater, evalLog, cleanup } = createHarness({
    managedRelease: { version: '4.38.0', hash },
    clients: { p1: true },
    evalHandler: async (port, code) => {
      if (code.includes('location.reload()')) {
        reloaded = true;
        return { success: true, result: true };
      }
      if (code.includes('window.__isBotRunning = true')) {
        startedBot = true;
        return { success: true, result: true };
      }
      return {
        success: true,
        result: reloaded
          ? { loadedAt: 3000, version: '4.38.0', payloadHash: hash, inGame: true, running: true, busy: [] }
          : { loadedAt: 1000, version: '4.37.0', payloadHash: 'oldhash', inGame: true, running: true, busy: [] }
      };
    }
  });

  try {
    await updater.checkNow();
    assert.equal(reloaded, true);
    assert.equal(updater.status.clients.p1.state, 'done');
    assert.match(updater.status.clients.p1.note, /บอททำงานต่อ/);
  } finally {
    cleanup();
  }
});

test('managed release waits and times out with error if reload fails to receive latest payload (no refresh loop)', async () => {
  const hash = 'e'.repeat(64);
  let reloadCount = 0;

  const { updater, cleanup } = createHarness({
    managedRelease: { version: '4.38.0', hash },
    clients: { p1: true },
    evalHandler: async (port, code) => {
      if (code.includes('location.reload()')) {
        reloadCount++;
        return { success: true, result: true };
      }
      return {
        success: true,
        result: { loadedAt: reloadCount > 0 ? 5000 : 1000, version: '4.37.0', payloadHash: 'stuck_old', inGame: true, running: false, busy: [] }
      };
    }
  });

  try {
    await updater.checkNow();
    assert.equal(reloadCount, 1);
    assert.equal(updater.status.clients.p1.state, 'error');
    assert.match(updater.status.clients.p1.note, /ยังไม่ได้เวอร์ชันล่าสุด/);
  } finally {
    cleanup();
  }
});

test('managed release does not fallback to public GitHub or raw CDN', async () => {
  const hash = 'd'.repeat(64);
  const { updater, cleanup } = createHarness({
    managedRelease: { version: '4.38.0', hash },
    clients: {
      p1: { loadedAt: 1000, version: '4.38.0', payloadHash: hash, inGame: true, running: false, busy: [] }
    }
  });

  try {
    await updater.checkNow();
    assert.equal(updater.status.ready.observedLive, true);
    assert.equal(updater.status.phase, 'idle');
    assert.equal(updater.status.lastError, null);
  } finally {
    cleanup();
  }
});

// R2: a stuck screen must not be refreshed again on every cycle / after restart.
function stuckClient(counter) {
  return async (port, code) => {
    if (code.includes('location.reload()')) { counter.reloads++; return { success: true, result: true }; }
    return { success: true, result: { loadedAt: 1000 + counter.reloads * 1000, version: '4.37.0', payloadHash: 'stuck_old', inGame: true, running: false, busy: [] } };
  };
}

test('R2: failed target is not reloaded again across many cycles', async () => {
  const counter = { reloads: 0 };
  const { updater, cleanup } = createHarness({ managedRelease: { version: '4.38.0', hash: 'f'.repeat(64) }, clients: { p1: true }, evalHandler: stuckClient(counter) });
  try {
    await updater.checkNow();
    for (let i = 0; i < 10; i++) await updater.checkNow();
    for (let i = 0; i < 10; i++) await updater.updateCycle();
    assert.equal(counter.reloads, 1);
    assert.equal(updater.status.clients.p1.state, 'error');
    assert.match(updater.status.clients.p1.note, /ไม่รีเฟรชซ้ำอัตโนมัติ/);
  } finally { cleanup(); }
});

test('R2: failed target survives Manager restart and is still not reloaded', async () => {
  const counter = { reloads: 0 };
  const release = { version: '4.38.0', hash: '1'.repeat(64) };
  const first = createHarness({ managedRelease: release, clients: { p1: true }, evalHandler: stuckClient(counter) });
  try {
    await first.updater.checkNow();
    assert.equal(counter.reloads, 1);
    const saved = JSON.parse(fs.readFileSync(path.join(first.dataDir, 'bot_update_state.json'), 'utf8'));
    assert.equal(saved.failedTargets.p1.key, 'm:' + release.hash);
    const second = createHarness({ managedRelease: release, clients: { p1: true }, evalHandler: stuckClient(counter), dataDir: first.dataDir });
    for (let i = 0; i < 5; i++) await second.updater.checkNow();
    assert.equal(counter.reloads, 1);
  } finally { first.cleanup(); }
});

test('R2: explicit owner retry allows exactly one more attempt; new release clears failure', async () => {
  const counter = { reloads: 0 };
  let release = { version: '4.38.0', hash: '2'.repeat(64) };
  const { updater, cleanup } = createHarness({ getRelease: () => release, clients: { p1: true }, evalHandler: stuckClient(counter) });
  try {
    await updater.checkNow();
    assert.equal(counter.reloads, 1);
    await updater.retryFailed();
    assert.equal(counter.reloads, 2);
    await updater.checkNow();
    assert.equal(counter.reloads, 2);
    release = { version: '4.38.1', hash: '3'.repeat(64) };
    await updater.checkNow();
    assert.equal(counter.reloads, 3);
    assert.equal(updater._failedTargets.p1.key, 'm:' + '3'.repeat(64));
  } finally { cleanup(); }
});

// R3: legacy (GitHub) mode used to throw ReferenceError: threshold is not defined during recovery.
test('R3: legacy mode recovery with new page lacking version does not throw and uses snapshot threshold', async () => {
  let reloaded = false;
  const { updater, cleanup } = createHarness({
    getRelease: () => undefined,
    clients: { p1: true },
    evalHandler: async (port, code) => {
      if (code.includes('location.reload()')) { reloaded = true; return { success: true, result: true }; }
      return { success: true, result: reloaded
        ? { loadedAt: 9000, version: null, payloadHash: null, inGame: true, running: false, busy: [] }
        : { loadedAt: 1000, version: '4.36.1', payloadHash: null, inGame: true, running: false, busy: [] } };
    }
  });
  try {
    updater.status.latest = { sha: 'abc', blobSha: 'abc', version: '4.36.2', date: 0, message: 'bot.js' };
    updater.status.ready = { sha: 'abc', at: 5000, observedLive: true };
    await updater.updateCycle();
    assert.equal(reloaded, true);
    assert.equal(updater.status.clients.p1.state, 'done');
  } finally { cleanup(); }
});

test('R3: legacy mode page that never becomes current fails once without ReferenceError', async () => {
  const counter = { reloads: 0 };
  const { updater, cleanup } = createHarness({ getRelease: () => undefined, clients: { p1: true }, evalHandler: async (port, code) => {
    if (code.includes('location.reload()')) { counter.reloads++; return { success: true, result: true }; }
    // reload "succeeds" but page loadedAt stays before the threshold and version is missing
    return { success: true, result: { loadedAt: 1000 + counter.reloads, version: null, payloadHash: null, inGame: true, running: false, busy: [] } };
  } });
  try {
    updater.status.latest = { sha: 'abc', blobSha: 'abc', version: '4.36.2', date: 0, message: 'bot.js' };
    updater.status.ready = { sha: 'abc', at: 999999, observedLive: true };
    await updater.updateCycle();
    await updater.updateCycle();
    assert.equal(counter.reloads, 1);
    assert.equal(updater.status.clients.p1.state, 'error');
  } finally { cleanup(); }
});
