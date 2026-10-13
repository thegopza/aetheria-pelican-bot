const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { EventEmitter } = require('events');

function loadModule(file, dependencies) {
  const mod = { exports: {} };
  const run = vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(path.join(__dirname, '..', file), 'utf8')}\n})`, {
    Buffer, Date, Map, process, setTimeout, setInterval, console
  });
  run(name => dependencies[name] || require(name), mod, mod.exports);
  return mod.exports;
}

function fakeHTTPS(resolve) {
  return { get(url) {
    const callback = arguments[2];
    const req = new EventEmitter();
    req.destroy = error => req.emit('error', error);
    queueMicrotask(() => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = {};
      callback(res);
      res.emit('data', Buffer.from(resolve(url)));
      res.emit('end');
    });
    return req;
  } };
}

test('Git head cache is isolated per repository and legacy bot default remains unchanged', async () => {
  const calls = [];
  const legacyHead = '1'.repeat(40);
  const managerHead = '2'.repeat(40);
  const github = loadModule('github_check.js', { https: fakeHTTPS(url => {
    calls.push(url);
    return `${url.includes('aetheria-manager-updates') ? managerHead : legacyHead} refs/heads/main\n`;
  }) });
  assert.equal(github.REPO, 'thegopza/aetheria-pelican-bot');
  assert.equal(github.MANAGER_UPDATE_REPO, 'thegopza/aetheria-manager-updates');
  assert.equal(await github.getMainHeadSha(), legacyHead);
  assert.equal(await github.getMainHeadSha(github.MANAGER_UPDATE_REPO), managerHead);
  assert.equal(await github.getMainHeadSha(), legacyHead);
  assert.equal(await github.getMainHeadSha(github.MANAGER_UPDATE_REPO), managerHead);
  assert.equal(calls.length, 2);
  await assert.rejects(github.getMainHeadSha('../invalid'), /Invalid GitHub repository/);
});

test('release Manager reads tree and verified downloads exclusively from distribution repository', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-update-repo-'));
  try {
    const managerDir = path.join(dir, 'manager');
    const dataDir = path.join(managerDir, 'data');
    fs.mkdirSync(path.join(managerDir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(managerDir, 'public', 'app.js'), 'old');
    fs.writeFileSync(path.join(managerDir, 'settings.json'), '{"keep":true}');
    const body = Buffer.from('// อัปเดตหน้าเว็บ\n');
    const blob = crypto.createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
    const head = '3'.repeat(40);
    const tree = '4'.repeat(40);
    const requests = [];
    const repo = 'thegopza/aetheria-manager-updates';
    const github = {
      MANAGER_UPDATE_REPO: repo,
      async getMainHeadSha(selected) { assert.equal(selected, repo); return head; },
      async apiGetJSON(url) {
        requests.push(url);
        if (url.endsWith(head)) return { tree: [{ path: 'manager', type: 'tree', sha: tree }] };
        assert.equal(url, `https://api.github.com/repos/${repo}/git/trees/${tree}?recursive=1`);
        return { tree: [
          { type: 'blob', path: 'public/app.js', sha: blob },
          { type: 'blob', path: 'settings.json', sha: blob },
          { type: 'blob', path: 'data/customer.json', sha: blob }
        ] };
      }
    };
    const selfUpdate = loadModule('manager_self_update.js', {
      './github_check': github,
      https: fakeHTTPS(url => {
        requests.push(url);
        assert.equal(url, `https://raw.githubusercontent.com/${repo}/${head}/manager/public/app.js`);
        return body;
      })
    });
    const updater = selfUpdate.createManagerSelfUpdater({ managerDir, dataDir, isBusy: () => false });
    async function route(endpoint) {
      let response;
      await updater.handleRoute({ method: 'POST' }, {}, endpoint, value => { response = value; });
      return response;
    }
    assert.equal((await route('/api/manager-update/check')).pending, 1);
    assert.equal((await route('/api/manager-update/apply')).success, true);
    assert.deepEqual(fs.readFileSync(path.join(managerDir, 'public/app.js')), body);
    assert.equal(fs.readFileSync(path.join(managerDir, 'settings.json'), 'utf8'), '{"keep":true}');
    assert.equal(fs.existsSync(path.join(dataDir, 'customer.json')), false);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(url => url.includes(repo)));
    const backupDirs = fs.readdirSync(path.join(dataDir, 'update_backup'));
    assert.equal(fs.readFileSync(path.join(dataDir, 'update_backup', backupDirs[0], 'public/app.js'), 'utf8'), 'old');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
