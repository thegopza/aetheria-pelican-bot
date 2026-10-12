'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { instrument } = require('../build-private-payload');
const { webcrypto, createHash } = require('node:crypto');

test('full bot plus external Plan IIFEs initialize on a simulated page only after admission, with no live network', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'bot.js'), 'utf8');
  const compiled = instrument(source);
  const messages = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => messages.push(error.message));
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.aetheria-online.in.th/play', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  const win = dom.window, timers = [];
  win.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
  const script = new win.Function('runtime', compiled.source);
  let active = false;
  const runtime = { allowed: () => active, draining: () => false, assert() { if (!active) throw Error('DENIED'); },
    setInterval: fn => { timers.push(fn); return timers.length; }, setTimeout: fn => { timers.push(fn); return timers.length; },
    nativeInterval: fn => { timers.push(fn); return timers.length; }, nativeTimeout: fn => { timers.push(fn); return timers.length; },
    wait: async p => p };
  assert.throws(() => script(runtime), /DENIED/);
  assert.equal(win.__pelicanBotVersion, undefined);
  assert.equal(timers.length, 0);
  active = true;
  script(runtime);
  assert.equal(win.__pelicanBotVersion, '4.36.0');
  assert.equal(typeof win.startMasterBot, 'function');
  assert.equal(typeof win.__applyScriptPlan, 'function');
  assert.equal(win.__planScriptEnabled, false);
  assert.ok(timers.length > 10);
  active = false;
  win.startMasterBot();
  win.__applyScriptPlan({ id: 'unauthorized', triggers: [] }, true);
  assert.notEqual(win.__isBotRunning, true);
  assert.equal(win.__planScriptEnabled, false);
  assert.equal(messages.length, 0);
  dom.window.close();
});

test('real full payload under signed bootstrap preserves native gameplay and local Humancheck after expiry', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.aetheria-online.in.th/play', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole()
  });
  try {
    const win = dom.window, timers = [], packets = [];
    let clock = 1800000000000;
    win.Date.now = () => clock;
    win.__pmProfileId = 'profile_test';
    win.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    win.clearInterval = () => {};
    win.setTimeout = () => 1;
    win.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    Object.defineProperty(win, 'crypto', { value: webcrypto });
    win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
    class FakeSocket {
      constructor(url) { this.url = url; this.readyState = 1; }
      send(value) { packets.push(value); }
      addEventListener() {}
      close() { this.readyState = 3; }
    }
    win.WebSocket = FakeSocket;
    const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}', JSON.stringify({ test: jwk }));
    win.eval(bootstrap);
    const source = instrument(fs.readFileSync(path.join(__dirname, '..', '..', 'bot.js'), 'utf8')).source;
    const claims = Buffer.from(JSON.stringify({ protocol: 1, accountId: 'a', deviceId: 'd', slotId: 's', leaseId: 'l',
      managerInstanceId: 'm', runtimeNonce: win.__pmScriptBootstrap.status().runtimeNonce, bindingVersion: 1,
      version: '4.36.0', payloadHash: createHash('sha256').update(source).digest('hex'), issuedAt: clock, expiresAt: clock + 60000, graceUntil: clock + 120000 })).toString('base64url');
    const signature = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey,
      new TextEncoder().encode('PmheeAether.ticket.v1\n' + claims))).toString('base64url');
    const result = await win.__pmScriptBootstrap.accept({ ticket: { keyId: 'test', claims, signature }, payload: source });
    assert.equal(result.success, true, result.code);
    assert.equal(win.__planScriptEnabled, false);
    const oldSocket = new win.WebSocket('wss://www.aetheria-online.in.th/game');
    oldSocket.send('initial-manual-packet');
    clock += 121000;
    timers.at(-1).fn();
    assert.equal(win.__pmScriptBootstrap.status().phase, 'expired');
    assert.throws(() => win.startMasterBot(), /SCRIPT_AUTHORIZATION_REQUIRED/);
    assert.throws(() => win.__applyScriptPlan({ id: 'denied' }, true), /SCRIPT_AUTHORIZATION_REQUIRED/);
    win.localStorage.setItem('pelican_farm_map', 'preserved-map');
    assert.equal(win.localStorage.getItem('pelican_farm_map'), 'preserved-map');
    oldSocket.send('manual-move-after-expiry');
    const fresh = new win.WebSocket('wss://www.aetheria-online.in.th/game');
    const button = win.document.createElement('button');
    button.onclick = () => fresh.send('human-check-answer-after-expiry');
    win.document.body.append(button); button.click();
    assert.ok(packets.includes('manual-move-after-expiry'));
    assert.ok(packets.includes('human-check-answer-after-expiry'));
    assert.equal(typeof win.__getClientLiveState(), 'object');
    assert.equal(win.__isBotRunning, false);
  } finally { dom.window.close(); }
});
