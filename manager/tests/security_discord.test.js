// Durable request billing tests using real Discord module and offline transports.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../discord_bot.js'), 'utf8');
function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-discord-security-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const file = path.join(dataDir, 'aetheria_request_state.json');
  const calls = []; const evals = []; const receipts = new Map();
  let debitCount = 0; let now = Date.now(); let fail = null;
  const fakeFs = Object.create(fs);
  fakeFs.writeFileSync = (...args) => {
    if (fail === 'write' && args[0] === file + '.tmp') throw new Error('SIMULATED_DISK_WRITE_FAILURE');
    return fs.writeFileSync(...args);
  };
  fakeFs.renameSync = (...args) => {
    if (fail === 'rename' && args[1] === file) throw new Error('SIMULATED_DISK_RENAME_FAILURE');
    return fs.renameSync(...args);
  };
  class Clock extends Date { static now() { return now; } }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'Date', source)(name => {
    if (name === 'fs') return fakeFs;
    if (name === 'https' || name === 'http') return { request: () => { throw new Error('UNEXPECTED_NETWORK'); } };
    if (name.startsWith('.')) return require(path.join(__dirname, '..', name));
    return require(name);
  }, module, module.exports, callback => { queueMicrotask(callback); return 0; }, Clock);
  const profile = { id: 'profile-one', name: 'offline', debugPort: 9999 };
  const solver = { isRemoteService: true, loadSettings: () => ({ autoAnswer: true, points: 0, answerDelayMs: 800 }), async solveHumanCheck(prompt, options, items, requestId) {
    const records = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(Object.values(records).some(r => r.requestId === requestId), 'Request ID must be persisted before solve');
    calls.push({ requestId, prompt, options, items });
    if (!receipts.has(requestId)) {
      debitCount++;
      receipts.set(requestId, { success: true, charged: 1, requestId, pickIndex: 0, remaining: 10 - debitCount });
    }
    return receipts.get(requestId);
  } };
  const create = () => module.exports.createDiscordBotService({ dataDir, loadProfiles: () => [profile, { ...profile, id: 'profile-two' }], humanCheckSolver: solver, evalProfilePort: async (...args) => { evals.push(args); return { result: { success: true } }; } });
  return { dataDir, file, profile, calls, evals, create, debitCount: () => debitCount, fail: stage => { fail = stage; }, advance: ms => { now += ms; } };
}
function question(overrides = {}) {
  return { id: 'challenge-one', prompt: 'Red Potion', options: [{ index: 0, itemId: 1 }, { index: 1, itemId: 2 }], items: [1, 2], ...overrides };
}
const notify = (service, f, check = question(), profile = f.profile) => service.notifyHumanCheck({ profile, check });

test('restarting service and clearing active check reuse durable UUID and one remote debit', async t => {
  const f = fixture(t);
  const first = f.create(); await notify(first, f);
  const id = f.calls[0].requestId;
  assert.match(id, /^[a-f0-9-]{36}$/);
  const restarted = f.create(); await notify(restarted, f);
  assert.equal(f.calls[1].requestId, id);
  restarted.clearHumanCheck(f.profile.id);
  await notify(restarted, f);
  assert.equal(f.calls[2].requestId, id);
  assert.equal(f.debitCount(), 1);
  assert.equal(f.evals.length, 3);
  // IDs provided by the game remain stable even beyond the no-ID time window.
  f.advance(120000); await notify(f.create(), f);
  assert.equal(f.calls[3].requestId, id);
  assert.equal(f.debitCount(), 1);
});

test('changed challenge, prompt, options, packet items, or profile generates new UUID', async t => {
  const f = fixture(t);
  await notify(f.create(), f);
  const original = f.calls[0].requestId;
  const changes = [{ id: 'challenge-two' }, { prompt: 'Blue Potion' }, { options: [{ index: 0, itemId: 3 }, { index: 1, itemId: 2 }] }, { items: [2, 1] }];
  for (const change of changes) {
    await notify(f.create(), f, question(change));
    assert.notEqual(f.calls.at(-1).requestId, original, JSON.stringify(change));
  }
  await notify(f.create(), f, question(), { ...f.profile, id: 'profile-two' });
  assert.notEqual(f.calls.at(-1).requestId, original);
  assert.equal(new Set(f.calls.map(c => c.requestId)).size, 6);
  assert.equal(f.debitCount(), 6);
});

test('questions without game ID reuse within 90 seconds and renew after expiry', async t => {
  const f = fixture(t); const check = question({ id: undefined });
  await notify(f.create(), f, check);
  const initial = f.calls[0].requestId;
  f.advance(89000); await notify(f.create(), f, check);
  assert.equal(f.calls[1].requestId, initial);
  assert.equal(f.debitCount(), 1);
  // The window is measured from the last saved sighting.
  f.advance(91000); await notify(f.create(), f, check);
  assert.notEqual(f.calls[2].requestId, initial);
  assert.equal(f.debitCount(), 2);
});

test('write or atomic rename failure prevents remote solve and game eval', async t => {
  for (const stage of ['write', 'rename']) {
    const f = fixture(t); f.fail(stage);
    await notify(f.create(), f);
    assert.equal(f.calls.length, 0, stage);
    assert.equal(f.evals.length, 0, stage);
    assert.equal(f.debitCount(), 0, stage);
    assert.equal(fs.existsSync(f.file), false, stage);
  }
});

test('corrupt durable request state fails closed without paying or answering', async t => {
  const f = fixture(t); fs.writeFileSync(f.file, '{malformed');
  await notify(f.create(), f);
  assert.equal(f.calls.length, 0);
  assert.equal(f.evals.length, 0);
  assert.equal(f.debitCount(), 0);
});

test('device nickname defaults to configured getter and can be updated dynamically', () => {
  const { createDiscordBotService } = require('../discord_bot.js');
  const service = createDiscordBotService({
    dataDir: os.tmpdir(),
    loadProfiles: () => [],
    getDeviceNickname: () => 'CustomPC'
  });
  assert.equal(service.getDeviceNickname(), 'CustomPC');
  service.setDeviceNickname('Office-Main');
  assert.equal(service.getDeviceNickname(), 'Office-Main');
});

