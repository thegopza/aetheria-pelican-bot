// Offline remote-wallet regressions. Provider, Discord and game transports are fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { allowLocalRequest } = require('../local_request_security');
const TOKEN = 'a'.repeat(64);
const ORIGIN = 'https://service.test';
function moduleWithFakes(filename, fakeFs = fs) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'))(name => {
    if (name === 'fs') return fakeFs;
    if (name === 'https' || name === 'http') return { request: () => { throw new Error('UNEXPECTED_REAL_NETWORK'); } };
    if (name === 'child_process') return { execSync: () => 'MachineGuid REG_SZ 00000000-0000-0000-0000-000000000001' };
    if (name.startsWith('.')) return require(path.join(__dirname, '..', name));
    return require(name);
  }, module, module.exports);
  return module.exports;
}
function fixture(t, provider) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-remote-security-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const calls = [];
  let failPersistence = false;
  const fakeFs = Object.create(fs);
  fakeFs.renameSync = (...args) => {
    if (failPersistence && String(args[1]).endsWith('aetheria_service_account.json')) throw new Error('SIMULATED_ACCOUNT_DISK_FAILURE');
    return fs.renameSync(...args);
  };
  const client = moduleWithFakes('human_check_solver.js', fakeFs);
  const requestJSON = async (route, payload, token) => {
    calls.push({ route, payload, token });
    if (provider) return provider(route, payload, token);
    if (route.endsWith('/enroll')) return { success: true, accountId: 'account-test', token: TOKEN };
    if (route.endsWith('/balance')) return { success: true, points: 7 };
    if (route.endsWith('/solve')) return { success: true, charged: 1, requestId: payload.requestId, pickIndex: 0, remaining: 6 };
    if (route.endsWith('/topup')) return { success: true, totalPoints: 7 };
    throw new Error('UNEXPECTED_ROUTE');
  };
  const create = (serviceUrl = ORIGIN) => client.createHumanCheckSolver({ dataDir, requestJSON, serviceUrl, localCatalogSeed: false });
  return { dataDir, calls, create, failPersistence: () => { failPersistence = true; } };
}
const options = [{ index: 0 }, { index: 1 }];

test('edited local points/HMAC/rates cannot authorize payment or mint credit', async t => {
  const f = fixture(t, async route => route.endsWith('/enroll') ? { success: true, accountId: 'test', token: TOKEN } : { success: false, charged: 0 });
  fs.writeFileSync(path.join(f.dataDir, 'human_check_settings.json'), JSON.stringify({ points: 999999, sig: 'forged', pointsPerBaht: 999, pointsPerSolve: 0, pointSystemEnabled: false }));
  const solver = f.create();
  solver.saveSettings({ points: 999999, pointSystemEnabled: false, pointsPerSolve: 0, pointsPerBaht: 999, token: TOKEN });
  const state = solver.loadSettings();
  assert.equal(state.points, 0);
  assert.equal(state.pointSystemEnabled, true);
  assert.equal(state.pointsPerSolve, 1);
  assert.equal(state.pointsPerBaht, 1);
  assert.equal(solver.addPoints(100).success, false);
  assert.equal(solver.deductPoints().success, false);
  assert.equal((await solver.solveHumanCheck('question', options, null, 'request-1')).success, false);
  assert.equal(f.calls.filter(c => c.route.endsWith('/solve')).length, 1);
});

test('solver rejects unapproved, mismatched request, invalid index or invalid balance replies', async t => {
  for (const override of [{ success: false }, { charged: -1 }, { charged: '1' }, { requestId: 'different' }, { pickIndex: -1 }, { pickIndex: 1.5 }, { pickIndex: 2 }, { pickIndex: 6 }, { remaining: -1 }, { remaining: NaN }, { remaining: '5' }]) {
    const f = fixture(t, async (route, payload) => route.endsWith('/enroll') ? { success: true, accountId: 'test', token: TOKEN } : { success: true, charged: 1, requestId: payload.requestId, pickIndex: 0, remaining: 5, ...override });
    assert.equal((await f.create().solveHumanCheck('question', options, null, 'request-2')).success, false, JSON.stringify(override));
  }
});

test('concurrent callers enroll once; account persists before authenticated calls', async t => {
  let release;
  const gate = new Promise(r => { release = r; });
  const f = fixture(t, async (route, payload, token) => {
    if (route.endsWith('/enroll')) { await gate; return { success: true, accountId: 'test', token: TOKEN }; }
    const saved = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'aetheria_service_account.json'), 'utf8'));
    assert.equal(saved.token, token);
    return { success: true, points: 8 };
  });
  const solver = f.create();
  const one = solver.refreshBalance(); const two = solver.refreshBalance();
  assert.equal(f.calls.length, 1);
  release(); await Promise.all([one, two]);
  assert.equal(f.calls.filter(c => c.route.endsWith('/enroll')).length, 1);
  assert.equal(f.calls.filter(c => c.route.endsWith('/balance')).length, 2);
  assert.equal(solver.loadSettings().points, 8);
});

test('account token never appears in loadSettings or public API settings', async t => {
  const f = fixture(t); const solver = f.create(); await solver.refreshBalance();
  const saved = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'aetheria_service_account.json'), 'utf8'));
  assert.equal(saved.token, TOKEN);
  for (const settings of [solver.loadSettings(), solver.publicSettings(), solver.publicSettings(solver.loadSettings()), solver.publicSettings({ ...solver.loadSettings(), token: TOKEN, apiKey: 'private', sig: 'forged', receiverPhone: 'private' }), solver.saveSettings({ token: TOKEN, apiKey: 'private' })]) {
    assert.equal(JSON.stringify(settings).includes(TOKEN), false);
    assert.equal(settings.token, undefined);
    assert.equal(settings.apiKey, undefined);
    assert.equal(settings.sig, undefined);
    assert.equal(settings.receiverPhone, undefined);
  }
});

test('credentials are bound to service origin; invalid service URLs rejected', async t => {
  const f = fixture(t); await f.create().refreshBalance();
  await f.create().refreshBalance();
  assert.equal(f.calls.filter(c => c.route.endsWith('/enroll')).length, 1);
  await f.create('https://other.test').refreshBalance();
  assert.equal(f.calls.filter(c => c.route.endsWith('/enroll')).length, 2);
  for (const origin of ['http://service.test', 'https://x@service.test', 'https://service.test/other', 'https://service.test/?x=1', 'https://service.test/#hash']) assert.throws(() => f.create(origin), /HTTPS origin/);
});

test('account persistence failure blocks authenticated calls; enrollment can retry', async t => {
  const f = fixture(t); const solver = f.create(); f.failPersistence();
  const result = await solver.solveHumanCheck('question', options, null, 'request-3');
  assert.equal(result.success, false); assert.match(result.reason, /SIMULATED_ACCOUNT_DISK_FAILURE/);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].token, null);
  assert.equal(solver.loadSettings().accountId, null);
  assert.equal(fs.existsSync(path.join(f.dataDir, 'aetheria_service_account.json')), false);
  await solver.refreshBalance();
  assert.equal(f.calls.filter(c => c.route.endsWith('/enroll')).length, 2);
  assert.equal(f.calls.some(c => c.token), false);
});

test('provider errors fail closed with no local spend or answer', async t => {
  const f = fixture(t, async route => {
    if (route.endsWith('/enroll')) return { success: true, accountId: 'test', token: TOKEN };
    throw new Error('PROVIDER_UNAVAILABLE');
  });
  const solver = f.create();
  assert.equal((await solver.solveHumanCheck('question', options, null, 'request-4')).success, false);
  assert.equal((await solver.redeemTrueMoneyVoucher('https://gift.truemoney.com/campaign/?v=FAKEONLY')).success, false);
  const settings = await solver.refreshBalance();
  assert.equal(settings.points, 0); assert.equal(settings.serviceAvailable, false);
});

test('remote HTTP failure preserves payment versus maintenance status for alerts', async t => {
  for (const [status, code] of [[402,'INSUFFICIENT_POINTS'],[503,'MAINTENANCE']]) {
    const f = fixture(t, async route => {
      if (route.endsWith('/enroll')) return {success:true,accountId:'test',token:TOKEN};
      const error = new Error('ไม่สามารถทำรายการได้'); error.status=status; error.code=code; throw error;
    });
    const result = await f.create().solveHumanCheck('question',options,null,'fixture-request');
    assert.equal(result.success,false); assert.equal(result.status,status); assert.equal(result.code,code);
  }
});

test('voucher submits to backend with token, never gateway; refresh follows topup', async t => {
  const f = fixture(t); const solver = f.create();
  const voucher = 'https://gift.truemoney.com/campaign/?v=FAKEONLYNOTREAL';
  assert.equal((await solver.redeemTrueMoneyVoucher(voucher)).success, true);
  assert.deepEqual(f.calls.map(c => c.route), ['/v1/aetheria/enroll', '/v1/aetheria/topup', '/v1/aetheria/balance']);
  assert.deepEqual(f.calls[1].payload, { voucherUrl: voucher });
  assert.equal(f.calls[1].token, TOKEN);
  assert.equal(solver.loadSettings().points, 7);
});

test('Discord cached zero balance requests remote solve; invalid authorization never sends game eval', async t => {
  for (const reply of [{ paid: true }, { charged: -1 }, { requestId: 'wrong' }, { pickIndex: 5 }, { providerError: true }]) {
    const f = fixture(t); let solves = 0; const gameCalls = [];
    const solver = { isRemoteService: true, loadSettings: () => ({ autoAnswer: true, points: 0, answerDelayMs: 800 }), async solveHumanCheck(prompt, opts, items, requestId) {
      solves++;
      if (reply.providerError) throw new Error('PROVIDER_FAILURE');
      return { success: true, charged: 1, requestId, pickIndex: 0, remaining: 4, matchedName: 'Red Potion', ...reply };
    } };
    const profile = { id: 'test-screen', name: 'test', debugPort: 9999 };
    const discord = moduleWithFakes('discord_bot.js').createDiscordBotService({ dataDir: f.dataDir, loadProfiles: () => [profile], evalProfilePort: async (...args) => { gameCalls.push(args); return { result: { success: true } }; }, humanCheckSolver: solver });
    await discord.notifyHumanCheck({ profile, check: { id: 'test-check', prompt: 'Red Potion', options } });
    assert.equal(solves, 1);
    assert.equal(gameCalls.length, reply.paid ? 1 : 0, JSON.stringify(reply));
    // Repeated polling for the same active check must not pay or answer twice.
    await discord.notifyHumanCheck({ profile, check: { id: 'test-check', prompt: 'Red Potion', options } });
    assert.equal(solves, 1);
    assert.equal(gameCalls.length, reply.paid ? 1 : 0);
  }
});

test('loopback guard rejects foreign origin, null, DNS rebinding, LAN and cross-site', () => {
  const req = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers: { host: '127.0.0.1:3899', ...headers }, socket: { remoteAddress } });
  assert.equal(allowLocalRequest(req(), 3899), true);
  assert.equal(allowLocalRequest(req({ origin: 'http://localhost:3899' }), 3899), true);
  for (const headers of [{ host: 'evil.test:3899' }, { origin: 'https://evil.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal(allowLocalRequest(req(headers), 3899), false);
  assert.equal(allowLocalRequest(req({}, '192.168.1.1'), 3899), false);
});


test('security reports bind the account and carry only bounded client identification', async t => {
  const f = fixture(t, async (route, payload) => {
    if (route.endsWith('/enroll')) return { success: true, accountId: 'account-test', token: TOKEN };
    if (route.endsWith('/report')) return { success: true };
    throw new Error('UNEXPECTED_ROUTE');
  });
  const client = f.create();
  assert.equal(await client.reportSecurityEvent('local_credit_override', { profileId: 'profile-offline', password: 'must-not-send', token: 'must-not-send' }), true);
  const call = f.calls.find(c => c.route.endsWith('/report'));
  assert.equal(call.token, TOKEN);
  assert.equal(call.payload.kind, 'local_credit_override');
  assert.equal(call.payload.clientContext.profileId, 'profile-offline');
  assert.match(call.payload.clientContext.sessionId, /^[a-f0-9-]{36}$/);
  assert.equal('password' in call.payload.clientContext, false);
  assert.equal('token' in call.payload.clientContext, false);
  assert.equal(await client.reportSecurityEvent('unknown-kind'), false);
});

test('the compatibility lure never mints balance even if a fake transport claims success', async t => {
  const f = fixture(t, async (route) => {
    if (route.endsWith('/enroll')) return { success: true, accountId: 'account-test', token: TOKEN };
    if (route.endsWith('/balance')) return { success: true, points: 7 };
    if (route.endsWith('/admin/add-points')) return { success: true, totalPoints: 999999 };
    throw new Error('UNEXPECTED_ROUTE');
  });
  const client = f.create();
  await client.refreshBalance();
  assert.equal((await client.recoverOfflineCredit(999999, { profileId: 'profile-offline' })).success, false);
  assert.equal(client.loadSettings().points, 7);
  const call = f.calls.find(c => c.route.endsWith('/admin/add-points'));
  assert.equal(call.payload.clientContext.profileId, 'profile-offline');
  assert.equal(call.token, TOKEN);
});

test('failed security reporting does not spend or erase cached points', async t => {
  const f = fixture(t, async route => {
    if (route.endsWith('/enroll')) return { success: true, accountId: 'account-test', token: TOKEN };
    if (route.endsWith('/balance')) return { success: true, points: 7 };
    throw new Error('SIMULATED_SECURITY_BACKEND_DOWN');
  });
  const client = f.create();
  await client.refreshBalance();
  assert.equal(await client.reportSecurityEvent('offline_solver_probe'), false);
  assert.equal(client.loadSettings().points, 7);
  assert.equal(f.calls.some(c => c.route.endsWith('/solve') || c.route.endsWith('/topup')), false);
});


test('server-authorized free analysis works with zero balance and exposes zero cost', async t => {
  const f = fixture(t, async (route, payload) => {
    if (route.endsWith('/enroll')) return { success: true, accountId: 'test', token: TOKEN };
    if (route.endsWith('/balance')) return { success: true, points: 0, pointsPerSolve: 0 };
    if (route.endsWith('/solve')) return { success: true, requestId: payload.requestId, charged: 0, pickIndex: 0, remaining: 0 };
    throw new Error('UNEXPECTED_ROUTE');
  });
  const client = f.create();
  await client.refreshBalance();
  assert.equal(client.loadSettings().pointsPerSolve, 0);
  client.saveSettings({ pointsPerSolve: 1, pointSystemEnabled: false, points: 999999 });
  assert.equal(client.loadSettings().pointsPerSolve, 0);
  assert.equal(client.loadSettings().points, 0);
  const result = await client.solveHumanCheck('question', options, [], 'free-request');
  assert.equal(result.success, true);
  assert.equal(result.charged, 0);
  assert.equal(client.loadSettings().points, 0);
});
