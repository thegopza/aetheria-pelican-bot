// Run the real updater with offline transports and controlled refresh/recovery timers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function fixture(evalProfilePort) {
  let tick;
  let releaseRefresh;
  let releaseRecoveryTimer;
  let now = Date.now();
  const module = { exports: {} };
  const fakeFs = { readFileSync() { throw new Error('No saved settings'); } };
  new Function('require', 'module', 'setTimeout', 'setInterval', 'Date',
    fs.readFileSync(path.join(__dirname, '..', 'bot_auto_update.js'), 'utf8'))(name => {
    if (name === 'fs') return fakeFs;
    if (name === 'https') return { get() { throw new Error('UNEXPECTED_NETWORK'); } };
    if (name === './github_check') return { getMainHeadSha() { throw new Error('UNEXPECTED_NETWORK'); } };
    return require(name);
  }, module, (fn, ms) => {
    if (ms === 8000) releaseRefresh = fn;
    if (ms === 5000) releaseRecoveryTimer = fn;
    // Startup/network timers are deliberately left unexecuted.
  }, (fn, ms) => { if (ms === 15000) tick = fn; }, { now: () => now });
  const updater = module.exports.createBotAutoUpdater({
    loadProfiles: () => [{ id: 'test', name: 'offline test', debugPort: 49999 }],
    evalProfilePort,
    getGameDir: () => { throw new Error('UNEXPECTED_GAME_ACCESS'); },
    dataDir: 'offline-data'
  });
  updater.status.latest = { sha: 'head', version: 'new', date: Date.now() - 3600000 };
  updater.status.ready = { sha: 'head', at: Date.now() - 60000, observedLive: true };
  updater.start();
  return {
    updater, tick: () => tick(), release: () => releaseRefresh(),
    advanceRecovery: ms => { now += ms; releaseRecoveryTimer(); }
  };
}
const oldClient = { loadedAt: 1, version: 'old', inGame: true, running: false, busy: [] };
const probeResult = result => ({ success: true, result });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('clients awaiting login or safe game state never block Manager updates', async () => {
  for (const client of [{ ...oldClient, inGame: false }, { ...oldClient, busy: ['walking'] }]) {
    const f = fixture(async () => probeResult(client));
    await f.tick();
    assert.equal(f.updater.status.clients.test.state, 'waiting');
    assert.equal(f.updater.status.phase, 'updating');
    assert.equal(f.updater.isBusy(), false);
  }
});

test('refresh dispatch, recovery sleep and reload probe block restart until completion', async () => {
  let probes = 0;
  let finishDispatch;
  let finishRecovery;
  const f = fixture((port, code) => {
    if (code.includes('location.reload()')) return new Promise(resolve => { finishDispatch = resolve; });
    if (++probes === 1) return Promise.resolve(probeResult(oldClient));
    return new Promise(resolve => { finishRecovery = resolve; });
  });
  const cycle = f.tick();
  await flush();
  assert.equal(f.updater.isBusy(), true);
  finishDispatch({ success: false, error: 'Page unloaded' });
  await flush();
  assert.equal(f.updater.isBusy(), true);
  f.release();
  await flush();
  assert.equal(f.updater.isBusy(), true);
  finishRecovery(probeResult({ ...oldClient, loadedAt: Date.now(), version: 'new' }));
  await cycle;
  assert.equal(f.updater.status.clients.test.state, 'done');
  assert.equal(f.updater.isBusy(), false);
});

test('rejected refresh dispatch still protects recovery of a possibly unloaded page', async () => {
  let probes = 0;
  const f = fixture(async (port, code) => {
    if (code.includes('location.reload()')) throw new Error('PAGE_UNLOADED');
    return probeResult(++probes === 1 ? oldClient : { ...oldClient, loadedAt: Date.now(), version: 'new' });
  });
  const cycle = f.tick();
  await flush();
  assert.equal(f.updater.isBusy(), true);
  assert.equal(probes, 1);
  f.release();
  await cycle;
  assert.equal(f.updater.status.clients.test.state, 'done');
  assert.equal(f.updater.isBusy(), false);
});

test('busy protection releases on recovery probe exceptions', async () => {
  let probes = 0;
  const f = fixture(async (port, code) => {
    if (code.includes('location.reload()')) return { success: true };
    if (++probes === 1) return probeResult(oldClient);
    throw new Error('RECOVERY_FAILED');
  });
  const cycle = f.tick();
  const rejection = assert.rejects(cycle, /RECOVERY_FAILED/);
  await flush();
  assert.equal(f.updater.isBusy(), true);
  f.release();
  await rejection;
  assert.equal(f.updater.isBusy(), false);
});

test('Manager restart remains blocked while resuming a previously running bot', async () => {
  let probes = 0;
  let finishResume;
  const f = fixture((port, code) => {
    if (code.includes('location.reload()')) return Promise.resolve({ success: true });
    if (code.includes('window.startMasterBot')) return new Promise(resolve => { finishResume = resolve; });
    return Promise.resolve(probeResult(++probes === 1
      ? { ...oldClient, running: true }
      : { ...oldClient, loadedAt: Date.now(), version: 'new' }));
  });
  const cycle = f.tick();
  await flush();
  f.release();
  await flush();
  assert.equal(f.updater.status.clients.test.state, 'resuming');
  assert.equal(f.updater.isBusy(), true);
  f.advanceRecovery(46000);
  await flush();
  assert.equal(typeof finishResume, 'function');
  assert.equal(f.updater.isBusy(), true);
  finishResume({ success: true });
  await cycle;
  assert.equal(f.updater.status.clients.test.state, 'done');
  assert.equal(f.updater.isBusy(), false);
});

test('idle, CDN and settle display phases do not imply a refresh is running', () => {
  const f = fixture(async () => probeResult(oldClient));
  for (const phase of ['idle', 'waiting-cdn', 'settling', 'updating']) {
    f.updater.status.phase = phase;
    assert.equal(f.updater.isBusy(), false);
  }
});
