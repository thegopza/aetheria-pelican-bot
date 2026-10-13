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

