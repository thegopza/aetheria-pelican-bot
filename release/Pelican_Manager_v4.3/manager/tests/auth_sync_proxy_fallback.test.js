'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthSync } = require('../auth_sync');

test('known proxy refusal falls back to in-game sign-up instead of disabling autoRegister', async () => {
  let profiles = [{ id: 'p', name: 'P', account: 'genuser1', autoRegister: true, generatedAccount: true, debugPort: 1 }];
  const pushed = [];
  let proxyCalls = 0;
  const sync = createAuthSync({
    loadProfiles: () => structuredClone(profiles),
    saveProfiles: p => { profiles = p; },
    credentials: { getPassword: () => 'pw12345678', setPassword() {} },
    proxyRegister: { isEnabled: () => true, hasPending: () => false, registerAccountWithProxy: async () => { proxyCalls++; return { success: false, code: 'INSUFFICIENT_BALANCE', error: 'balance' }; } },
    evalProfilePort: async (port, code) => {
      if (code.includes('const c = window.__authConfig;')) return { success: true, result: { username: 'genuser1', password: 'pw12345678', register: false, registerDone: false } };
      pushed.push(code); return { success: true, result: { success: true } };
    }
  });
  await sync.tick();
  assert.equal(profiles[0].autoRegister, true, 'profile must stay in auto-register mode');
  assert.equal(profiles[0].proxyFallbackBrowser, true);
  assert.equal(pushed.length, 0, 'no browser push in the same tick');
  await sync.tick();
  assert.equal(proxyCalls, 1, 'proxy is not asked again after a known refusal');
  assert.equal(pushed.length, 1);
  assert.match(pushed[0], /"register":true/);
});

test('ambiguous proxy failure (exception) never falls back to unproxied sign-up', async () => {
  let profiles = [{ id: 'p', name: 'P', account: 'genuser2', autoRegister: true, generatedAccount: true, debugPort: 1 }];
  const pushed = [];
  const sync = createAuthSync({
    loadProfiles: () => structuredClone(profiles),
    saveProfiles: p => { profiles = p; },
    credentials: { getPassword: () => 'pw12345678', setPassword() {} },
    proxyRegister: { isEnabled: () => true, hasPending: () => false, registerAccountWithProxy: async () => { throw Error('ECONNRESET'); } },
    evalProfilePort: async (port, code) => {
      if (code.includes('const c = window.__authConfig;')) return { success: true, result: { username: 'genuser2', password: 'pw12345678' } };
      pushed.push(code); return { success: true, result: { success: true } };
    }
  });
  await sync.tick(); await sync.tick();
  assert.equal(profiles[0].proxyFallbackBrowser, undefined);
  assert.equal(profiles[0].proxyRegistrationState, 'retry-pending');
  assert.equal(pushed.length, 0);
});

test('disabled proxy immediately uses in-game sign-up without calling proxy', async () => {
  let profiles = [{ id: 'p', name: 'P', account: 'genuser3', autoRegister: true, generatedAccount: true, debugPort: 1 }];
  const pushed = [];
  let proxyCalls = 0;
  const sync = createAuthSync({
    loadProfiles: () => structuredClone(profiles),
    saveProfiles: p => { profiles = p; },
    credentials: { getPassword: () => 'pw12345678', setPassword() {} },
    proxyRegister: {
      isEnabled: () => false,
      publicSettings: () => ({ configured: true }),
      hasPending: () => false,
      registerAccountWithProxy: async () => { proxyCalls++; return { success: false }; }
    },
    evalProfilePort: async (port, code) => {
      if (code.includes('const c = window.__authConfig;')) return { success: true, result: { username: 'genuser3', password: 'pw12345678', register: false, registerDone: false } };
      pushed.push(code); return { success: true, result: { success: true } };
    }
  });
  await sync.tick();
  assert.equal(proxyCalls, 0, 'proxy must not be called when disabled');
  assert.equal(pushed.length, 1, 'in-game registration must be pushed immediately');
  assert.match(pushed[0], /"register":true/);
});

test('PROXY_DISABLED exception immediately falls back to in-game sign-up', async () => {
  let profiles = [{ id: 'p', name: 'P', account: 'genuser4', autoRegister: true, generatedAccount: true, debugPort: 1 }];
  const pushed = [];
  let proxyCalls = 0;
  const sync = createAuthSync({
    loadProfiles: () => structuredClone(profiles),
    saveProfiles: p => { profiles = p; },
    credentials: { getPassword: () => 'pw12345678', setPassword() {} },
    proxyRegister: {
      isEnabled: () => true,
      hasPending: () => false,
      registerAccountWithProxy: async () => { proxyCalls++; throw Error('PROXY_DISABLED'); }
    },
    evalProfilePort: async (port, code) => {
      if (code.includes('const c = window.__authConfig;')) return { success: true, result: { username: 'genuser4', password: 'pw12345678', register: false, registerDone: false } };
      pushed.push(code); return { success: true, result: { success: true } };
    }
  });
  await sync.tick();
  assert.equal(profiles[0].proxyFallbackBrowser, true);
  await sync.tick();
  assert.equal(proxyCalls, 1);
  assert.equal(pushed.length, 1);
  assert.match(pushed[0], /"register":true/);
});

test('DataImpulse sticky session username uses dot+semicolon syntax', () => {
  const { formatProxySessionUser } = require('../proxy_register');
  const diUser = formatProxySessionUser({
    proxyHost: 'gw.dataimpulse.com',
    proxyUser: 'd257d3b437de1c456556',
    country: 'th'
  }, 'reg_12345678-abcd');
  assert.equal(diUser, 'd257d3b437de1c456556__cr.th;sessid.reg12345678abcd;sessttl.5');
});

test('proxy registration runs even while client window is offline, then pushes login when online', async () => {
  let profiles = [{ id: 'p_off', name: 'OfflineClient', account: '', autoRegister: true, debugPort: 49999 }];
  const savedPasswords = {};
  const pushed = [];
  let clientOnline = false;
  let proxyCalls = 0;

  const sync = createAuthSync({
    loadProfiles: () => structuredClone(profiles),
    saveProfiles: p => { profiles = p; },
    credentials: {
      getPassword: id => savedPasswords[id] || '',
      setPassword: (id, pw) => { savedPasswords[id] = pw; }
    },
    proxyRegister: {
      isEnabled: () => true,
      hasPending: () => false,
      registerAccountWithProxy: async ({ username }) => {
        proxyCalls++;
        return { success: true, username, ip: '1.46.30.187' };
      }
    },
    evalProfilePort: async (port, code) => {
      if (!clientOnline) return { success: false, error: 'offline' };
      if (code.includes('const c = window.__authConfig;')) {
        return { success: true, result: { username: '', password: '', register: false, registerDone: false } };
      }
      pushed.push(code);
      return { success: true, result: { success: true } };
    }
  });

  // Tick 1: client is offline, but Proxy registration still completes and commits credentials
  await sync.tick();
  assert.equal(proxyCalls, 1);
  assert.equal(profiles[0].autoRegister, false);
  assert.equal(profiles[0].loginSyncPending, true);
  assert.ok(profiles[0].account.startsWith('pm'));
  assert.ok(savedPasswords.p_off);
  assert.equal(pushed.length, 0);

  // Tick 2: client comes online, credentials are pushed
  clientOnline = true;
  await sync.tick();
  assert.equal(pushed.length, 1);
  assert.match(pushed[0], /"register":false/);
  assert.match(pushed[0], /"registerDone":true/);
  assert.equal(profiles[0].loginSyncPending, false);
});

test('IP_RATE_LIMITED retries on next tick via Proxy instead of falling back to home IP', async () => {
  let profiles = [{ id: 'p_rl', name: 'RateLimited', account: '', autoRegister: true, debugPort: 1 }];
  let proxyCalls = 0;
  const pushed = [];

  const sync = createAuthSync({
    loadProfiles: () => structuredClone(profiles),
    saveProfiles: p => { profiles = p; },
    credentials: { getPassword: () => 'pw12345678', setPassword() {} },
    proxyRegister: {
      isEnabled: () => true,
      hasPending: () => false,
      registerAccountWithProxy: async () => {
        proxyCalls++;
        return { success: false, code: 'IP_RATE_LIMITED', error: 'IP ครบโควต้า 3 บัญชี/ชม.' };
      }
    },
    evalProfilePort: async (port, code) => {
      if (code.includes('const c = window.__authConfig;')) {
        return { success: true, result: { username: '', password: '', register: false, registerDone: false } };
      }
      pushed.push(code);
      return { success: true, result: { success: true } };
    }
  });

  await sync.tick();
  assert.equal(profiles[0].proxyFallbackBrowser, undefined);
  assert.equal(profiles[0].proxyRegistrationState, 'retry-pending');
  assert.equal(pushed.length, 0);
});
