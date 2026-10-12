'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const { instrument, build } = require('../build-private-payload');

async function fixture({ legacy = false } = {}) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  let clock = 1800000000000;
  const intervals = [];
  const window = { crypto: webcrypto, setTimeout: fn => fn, setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {} };
  if (legacy) window.__pelicanBotVersion = '4.36.0';
  const context = vm.createContext({ window, TextEncoder, TextDecoder, atob, Date: { now: () => clock } });
  let source = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}', JSON.stringify({ test: jwk }));
  vm.runInContext(source, context);
  const api = window.__pmScriptBootstrap;
  const payload = 'runtime.assert(); window.loaded=(window.loaded||0)+1;';
  async function sign(overrides = {}, body = payload) {
    const claims = Buffer.from(JSON.stringify({ protocol: 1, accountId: 'a', deviceId: 'd', slotId: 's', leaseId: 'l', managerInstanceId: 'm',
      bindingVersion: 1, version: '4.37.0', payloadHash: createHash('sha256').update(body).digest('hex'),
      runtimeNonce: api.status().runtimeNonce, issuedAt: clock, expiresAt: clock + 60000, graceUntil: clock + 120000, ...overrides })).toString('base64url');
    const signature = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey,
      new TextEncoder().encode('PmheeAether.ticket.v1\n' + claims))).toString('base64url');
    return { keyId: 'test', claims, signature };
  }
  return { window, api, sign, payload, intervals, advance: ms => { clock += ms; }, reload: () => vm.runInContext(source, context) };
}

test('signed ticket admits one payload only, concurrent accepts and repeated bootstrap create no duplicate runtime', async () => {
  const f = await fixture(), ticket = await f.sign();
  const results = await Promise.all([f.api.accept({ ticket, payload: f.payload }), f.api.accept({ ticket, payload: f.payload })]);
  assert.equal(results.filter(x => x.success).length, 1);
  assert.equal(f.window.loaded, 1);
  f.reload();
  assert.equal(f.api, f.window.__pmScriptBootstrap);
  assert.equal(f.intervals.length, 1);
  assert.equal((await f.api.accept({ ticket, payload: f.payload })).code, 'ALREADY_LOADED');
});
test('tampered signature/hash/nonce, expired tickets and untrusted key cannot start payload', async () => {
  for (const variant of ['signature', 'hash', 'nonce', 'expired', 'key']) {
    const f = await fixture();
    const ticket = await f.sign(variant === 'nonce' ? { runtimeNonce: 'another' } : variant === 'expired' ? { expiresAt: 1 } : {});
    if (variant === 'signature') ticket.signature = Buffer.alloc(64).toString('base64url');
    if (variant === 'key') ticket.keyId = 'attacker';
    const result = await f.api.accept({ ticket, payload: variant === 'hash' ? f.payload + ' ' : f.payload });
    assert.equal(result.success, false, variant);
    assert.equal(f.window.loaded, undefined);
    assert.equal(f.intervals.length, 0);
  }
});
test('legacy runtime requires refresh; partial payload exception is terminal until refresh', async () => {
  const legacy = await fixture({ legacy: true });
  assert.equal((await legacy.api.accept({ ticket: await legacy.sign(), payload: legacy.payload })).code, 'EXISTING_RUNTIME_REFRESH_REQUIRED');
  const f = await fixture(), bad = 'window.loaded=1; throw Error("PARTIAL");';
  assert.equal((await f.api.accept({ ticket: await f.sign({}, bad), payload: bad })).success, false);
  assert.equal(f.api.status().phase, 'failed');
  assert.equal((await f.api.accept({ ticket: await f.sign(), payload: f.payload })).success, false);
});
test('renewal cannot change binding; expiry drains busy task then pauses without closing game', async () => {
  const f = await fixture();
  assert.equal((await f.api.accept({ ticket: await f.sign(), payload: f.payload })).success, true);
  assert.equal((await f.api.renew(await f.sign({ slotId: 'other' }))).success, false);
  f.window.__isBotRunning = true;
  f.window.__isGearRefining = true;
  f.advance(121000);
  f.intervals[0]();
  assert.equal(f.window.__isBotRunning, true);
  f.window.__isGearRefining = false;
  f.intervals[0]();
  assert.equal(f.window.__isBotRunning, false);
  assert.equal(f.api.status().phase, 'expired');
});
test('bounded grace and signed metadata required', async () => {
  const f = await fixture();
  assert.equal((await f.api.accept({ ticket: await f.sign({ graceUntil: 1800000400000 }), payload: f.payload })).success, false);
  assert.equal((await f.api.accept({ ticket: await f.sign(), payload: { source: f.payload, hash: 'bad', version: '4.37.0' } })).code, 'PAYLOAD_METADATA_MISMATCH');
});
test('expiry blocks external entries while an existing task drains; native sockets/storage/Humancheck remain usable', async () => {
  const f = await fixture(), packets = [], storage = new Map();
  class Socket { constructor() { this.url = 'wss://game'; } send(value) { packets.push(value); } addEventListener() {} }
  class Store { getItem(k) { return storage.get(k) ?? null; } setItem(k, v) { storage.set(k, v); } removeItem(k) { storage.delete(k); } }
  f.window.WebSocket = Socket; f.window.Storage = Store; f.window.localStorage = new Store();
  f.window.button = {}; f.window.input = {}; f.window.target = { addEventListener(_event, listener) { this.listener = listener; } };
  const source = instrument(`
    window.actions=0;
    window.startMasterBot=function(){window.actions++;};
    window.executeSenderTrade=function(){window.actions++;};
    window.stopMasterBot=function(){window.stops=(window.stops||0)+1;};
    window.button.onclick=()=>window.startMasterBot();
    window.input.onchange=function(){window.executeSenderTrade();};
    window.target.addEventListener('click',()=>window.startMasterBot());
    window.__getClientLiveState=function(){return {running:!!window.__isBotRunning};};
    setInterval(()=>{window.actions++;},1);
    (function namespaceBotStorage(){const proto=window.Storage.prototype;
      const get=proto.getItem,set=proto.setItem,del=proto.removeItem;
      const map=k=>'profile:'+k;
      proto.getItem=function(k){return get.call(this,map(k));};
      proto.setItem=function(k,v){return set.call(this,map(k),v);};
      proto.removeItem=function(k){return del.call(this,map(k));};})();
    const OriginalWebSocket=window.WebSocket;
    const origProtoSend=OriginalWebSocket.prototype.send;
    OriginalWebSocket.prototype.send=function(data){window.actions++;return origProtoSend.apply(this,arguments);};
    const origProtoAddEventListener=OriginalWebSocket.prototype.addEventListener;
    OriginalWebSocket.prototype.addEventListener=function(type,listener,options){return origProtoAddEventListener.apply(this,arguments);};
    window.WebSocket=new Proxy(OriginalWebSocket,{construct(Target,args){const ws=new Target(...args);return ws;}});
    const ws=new window.WebSocket();const origInstanceSend=ws.send;
    ws.send=function(data){window.actions++;return origInstanceSend.apply(this,arguments);};window.socket=ws;
    function checkHumanCheckStatus(){window.humanchecks=(window.humanchecks||0)+1;}
    setInterval(checkHumanCheckStatus,1000);
  `).source;
  assert.equal((await f.api.accept({ ticket: await f.sign({}, source), payload: source })).success, true);
  f.window.__isShopping = true;
  f.advance(121000);
  f.intervals.at(-1)();
  assert.throws(() => f.window.startMasterBot(), /SCRIPT_AUTHORIZATION_REQUIRED/);
  assert.throws(() => f.window.executeSenderTrade(), /SCRIPT_AUTHORIZATION_REQUIRED/);
  f.window.button.onclick(); f.window.input.onchange(); f.window.target.listener();
  assert.equal(f.window.actions, 0);
  f.window.stopMasterBot();
  assert.equal(f.window.stops, 1);
  f.intervals[0](); // Previously admitted callback may finish while shopping is busy.
  assert.equal(f.window.actions, 1);
  f.window.__isShopping = false;
  f.intervals.at(-1)();
  assert.equal(f.api.status().phase, 'expired');
  f.window.socket.send('manual-move');
  const fresh = new f.window.WebSocket(); fresh.send('human-check-answer');
  assert.deepEqual(packets, ['manual-move', 'human-check-answer']);
  f.window.localStorage.setItem('config', 'preserved');
  assert.equal(f.window.localStorage.getItem('config'), 'preserved');
  f.window.localStorage.removeItem('config');
  assert.equal(f.window.localStorage.getItem('config'), null);
  f.intervals[1]();
  assert.equal(f.window.humanchecks, 1);
  assert.equal(f.window.__getClientLiveState().running, false);
});
test('AST instrumentation covers IIFEs, exported functions, timers, DOM handlers, concise arrows and async resumes', async () => {
  const input = `'use strict'; (function(){ window.actions=0; window.act=function(){window.actions++;};
    window.inline=()=>window.actions++; window.dom={onclick(){window.actions++;}};
    setInterval(()=>{window.actions++;},1); window.promise=async function(){await window.pending; window.actions++;}; })();
    (function plan(){window.plan=()=>{window.actions++;};})();`;
  const compiled = instrument(input);
  const timers = [];
  let active = false, resolve;
  const window = { pending: new Promise(r => { resolve = r; }) };
  const runtime = { allowed: () => active, draining: () => false, assert: () => { if (!active) throw Error('DENIED'); },
    setInterval: fn => timers.push(fn), setTimeout: fn => timers.push(fn),
    wait: async value => { const result = await value; if (!active) throw Error('EXPIRED'); return result; } };
  const context = vm.createContext({ runtime, window });
  const run = () => vm.runInContext('(function(runtime){\n' + compiled.source + '\n})(runtime)', context);
  assert.throws(run, /DENIED/);
  assert.equal(window.act, undefined);
  active = true;
  run();
  const resumed = window.promise();
  active = false;
  window.act(); window.inline(); window.dom.onclick(); window.plan(); timers[0]();
  resolve();
  await assert.rejects(resumed, /EXPIRED/);
  assert.equal(window.actions, 0);
  assert.equal(compiled.awaits, 1);
});
test('full current bot parses under instrumentation; private builder rejects public output and private keys', () => {
  const original = fs.readFileSync(path.join(__dirname, '..', '..', 'bot.js'), 'utf8');
  const result = instrument(original);
  assert.ok(result.functions > 1000);
  assert.ok(result.awaits > 100);
  assert.throws(() => build({ sourcePath: 'unused', outputDir: path.join(__dirname, '..', 'output'), publicKeys: {} }), /PRIVATE_OUTPUT_REQUIRED/);
});
