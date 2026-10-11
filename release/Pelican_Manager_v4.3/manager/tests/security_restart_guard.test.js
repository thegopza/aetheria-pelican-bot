const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function fixture() {
  let busy = false;
  let failProbe = false;
  let scan;
  let source = 'loaded source';
  let clean = true;
  let syntax = true;
  let sourceFailure = false;
  const timers = [];
  const exits = [];
  const module = { exports: {} };
  const fakeFs = {
    existsSync: file => String(file).endsWith('.git'),
    readdirSync: () => { if (sourceFailure) throw new Error('SOURCE_UNREADABLE'); return ['server.js']; },
    statSync: () => ({ isDirectory: () => false }),
    readFileSync: file => {
      if (String(file).endsWith('server.js')) return Buffer.from(source);
      throw new Error('No saved state');
    }
  };
  new Function('require', 'module', 'process', 'console', 'setTimeout', 'setInterval',
    fs.readFileSync(path.join(__dirname, '..', 'manager_self_update.js'), 'utf8'))(name => {
    if (name === 'fs') return fakeFs;
    if (name === 'child_process') return { execFileSync: (command, args) => {
      if (command === 'git') return clean ? '' : ' M manager/server.js';
      if (args.includes('--check') && !syntax) throw new Error('SYNTAX_FAILED');
      return '';
    } };
    if (name === './github_check') return {
      REPO: 'offline/test',
      getMainHeadSha() { throw new Error('UNEXPECTED_NETWORK'); },
      apiGetJSON() { throw new Error('UNEXPECTED_NETWORK'); }
    };
    if (name === 'https') return { get() { throw new Error('UNEXPECTED_NETWORK'); } };
    return require(name);
  }, module, {
    send() {}, env: { PELICAN_SERVER_CHILD: '1' }, execPath: 'offline-node',
    exit: code => exits.push(code)
  }, { log() {} }, (fn, ms) => { if (ms === 1500) timers.push(fn); }, fn => { scan = fn; });
  const updater = module.exports.createManagerSelfUpdater({
    managerDir: path.join(__dirname, 'offline-manager'), dataDir: 'offline-data',
    isBusy: () => { if (failProbe) throw new Error('PROBE_FAILED'); return busy; }
  });
  source = 'committed new source';
  updater.start();
  const apply = async () => {
    updater.status.pending = [{ path: 'server.js', kind: 'server' }];
    let response;
    await updater.handleRoute({ method: 'POST' }, {}, '/api/manager-update/apply', value => { response = value; });
    return response;
  };
  return {
    updater, timers, exits, apply, scan: () => scan(),
    busy: value => { busy = value; }, fail: value => { failProbe = value; },
    source: ({ committed = true, valid = true, unreadable = false } = {}) => {
      source += '\nchanged'; clean = committed; syntax = valid; sourceFailure = unreadable;
    }
  };
}

test('restart queued while idle cancels if game activity begins before exit', async () => {
  const f = fixture();
  assert.equal((await f.apply()).restarting, true);
  f.busy(true);
  f.timers.shift()();
  assert.deepEqual(f.exits, []);
  assert.match(f.updater.status.note, /รอ/);
  f.busy(false);
  f.scan();
  assert.equal(f.timers.length, 1);
  f.timers.shift()();
  assert.deepEqual(f.exits, [75]);
});

test('idle restart uses supervisor exit 75 and repeated apply never duplicates timers', async () => {
  const f = fixture();
  await f.apply();
  await f.apply();
  assert.equal(f.timers.length, 1);
  f.timers.shift()();
  assert.deepEqual(f.exits, [75]);
});

test('manual apply while game is busy does not queue a restart', async () => {
  const f = fixture();
  f.busy(true);
  assert.equal((await f.apply()).success, false);
  assert.equal(f.timers.length, 0);
  assert.deepEqual(f.exits, []);
});

test('busy probe failures fail closed before scheduling and at exit boundary', async () => {
  const f = fixture();
  f.fail(true);
  assert.equal((await f.apply()).success, false);
  assert.equal(f.timers.length, 0);
  f.fail(false);
  await f.apply();
  f.fail(true);
  f.timers.shift()();
  assert.deepEqual(f.exits, []);
  assert.match(f.updater.status.note, /ตรวจสอบสถานะเกมไม่ได้/);
});

test('deferred restart cannot load dirty or invalid files; a later committed fix resumes once', async () => {
  for (const change of [{ committed: false }, { valid: false }]) {
    const f = fixture();
    f.busy(true);
    assert.equal((await f.apply()).success, false);
    f.source(change);
    f.busy(false);
    f.scan();
    assert.equal(f.timers.length, 0);
    assert.deepEqual(f.exits, []);
    f.source();
    f.scan();
    f.scan();
    assert.equal(f.timers.length, 1);
    f.timers.shift()();
    assert.deepEqual(f.exits, [75]);
  }
});

test('file changes after queueing are revalidated immediately before supervisor exit', async () => {
  for (const change of [{ committed: false }, { valid: false }, { unreadable: true }]) {
    const f = fixture();
    assert.equal((await f.apply()).restarting, true);
    f.source(change);
    f.timers.shift()();
    assert.deepEqual(f.exits, []);
    assert.match(f.updater.status.note, /ยังไม่รีสตาร์ท/);
  }
});
