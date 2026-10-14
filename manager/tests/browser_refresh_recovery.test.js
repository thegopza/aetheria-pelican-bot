'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const trustedKeys = require('../script_release_keys');
const { createOfflineCoordinator } = require('../offline_coordinator');

const SOURCE = "window.__sourceRuns=(window.__sourceRuns||0)+1;window.__pelicanBotVersion='4.38.1';document.hud=true;window.__getClientLiveState=()=>({inGame:false});window.__isBotRunning=false;/*" + 'x'.repeat(1200) + '*/';

function fixture(options = {}) {
  let timerId = 0, sessionId = 0, documentId = 1, sourceCalls = 0, fullEvaluations = 0;
  const timers = new Map(), sessions = new Map(), sockets = [], servers = [], calls = [], targets = new Map(), deferred = [];

  function makeDoc(targetId, profileId, existing = false, readyState = 'complete') {
    const storage = options.storage || new Map();
    const doc = {
      readyState,
      hud: existing,
      getElementById: id => id === 'pelican-hud' && doc.hud ? {} : null,
      createElement: () => ({}),
      head: { appendChild() {} },
      querySelector: sel => sel === '#pelican-hud' && doc.hud ? {} : null
    };
    const win = {
      __pmProfileId: profileId,
      localStorage: {
        getItem: k => storage.get(k) || null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: k => storage.delete(k)
      }
    };
    if (existing) {
      win.__pelicanBotVersion = '4.38.1';
      win.__getClientLiveState = () => ({ inGame: false });
      win.__isBotRunning = false;
      win.__pmPayloadInitialized = true;
    }
    const context = vm.createContext({
      window: win,
      document: doc,
      location: { href: 'https://www.aetheria-online.in.th/play' },
      performance: { timeOrigin: documentId++ }
    });
    const target = { targetId, profileId, context };
    targets.set(targetId, target);
    return target;
  }

  const initial = makeDoc('target', 'p1', options.existing, options.initialReadyState || 'complete');
  const setTimeoutFake = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };

  function get(url, opts, callback) {
    const req = new EventEmitter();
    req.destroy = e => req.emit('error', e);
    const respond = text => {
      const res = new PassThrough();
      res.statusCode = 200;
      callback(res);
      res.end(text);
    };
    process.nextTick(() => {
      if (url.includes('/json/version')) respond(JSON.stringify({ webSocketDebuggerUrl: 'ws://fake' }));
      else {
        sourceCalls++;
        if (options.failSource) req.emit('error', Error('fake network failure'));
        else if (options.deferSource) deferred.push(() => respond(SOURCE));
        else respond(SOURCE);
      }
    });
    return req;
  }

  const http = {
    get,
    createServer(handler) {
      const s = {
        handler,
        listen(port) { s.port = port; s.listening = true; },
        on() {},
        close() { s.closed = true; s.listening = false; },
        closeAllConnections() {}
      };
      servers.push(s);
      return s;
    }
  };

  class Socket {
    constructor() {
      this.readyState = 0;
      sockets.push(this);
      process.nextTick(() => { this.readyState = 1; this.onopen?.(); });
    }
    close() { this.readyState = 3; this.onclose?.(); }
    send(raw) {
      const command = JSON.parse(raw);
      calls.push(command);
      process.nextTick(async () => {
        let result = {};
        try {
          switch (command.method) {
            case 'Target.getTargets':
              result = { targetInfos: [...targets.values()].map(t => ({ targetId: t.targetId, type: 'page', url: t.context.location.href })) };
              break;
            case 'Target.attachToTarget': {
              const id = 's' + (++sessionId);
              sessions.set(id, targets.get(command.params.targetId));
              result = { sessionId: id };
              break;
            }
            case 'Target.closeTarget':
              targets.delete(command.params.targetId);
              result = { success: true };
              break;
            case 'Browser.getWindowForTarget':
              result = { windowId: 100 };
              break;
            case 'Browser.setWindowBounds':
              result = { success: true };
              break;
            case 'Target.activateTarget':
              result = { success: true };
              break;
            case 'Page.reload':
            case 'Page.navigate': {
              const target = sessions.get(command.sessionId);
              if (target) {
                target.crashed = false;
                const next = makeDoc(target.targetId, target.profileId, false, 'complete');
                for (const [id, t] of sessions) if (t?.targetId === target.targetId) sessions.set(id, next);
                process.nextTick(() => {
                  this.onmessage?.({ data: JSON.stringify({ method: 'Page.frameNavigated', params: { frame: { id: 'main' }, type: 'Reload' }, sessionId: command.sessionId }) });
                  this.onmessage?.({ data: JSON.stringify({ method: 'Page.loadEventFired', params: {}, sessionId: command.sessionId }) });
                });
              }
              result = {};
              break;
            }
            case 'Runtime.evaluate': {
              const target = sessions.get(command.sessionId);
              if (!target || !targets.has(target.targetId)) throw Error('Session with given id not found');
              if (target.crashed) throw Error('Inspected target navigated or closed');
              const expression = command.params.expression;
              if (expression.includes('(0,eval)(')) {
                fullEvaluations++;
              }
              const value = await vm.runInContext(expression, target.context);
              result = { result: { value } };
              break;
            }
          }
          this.onmessage?.({ data: JSON.stringify({ id: command.id, result }) });
        } catch (e) {
          this.onmessage?.({ data: JSON.stringify({ id: command.id, error: { message: e.message } }) });
        }
      });
    }
  }

  const fakeFs = {
    ...fs,
    readFileSync(file, encoding) {
      if (String(file).endsWith('bot.js')) {
        if (options.failLocal) throw Error('local source unavailable');
        return SOURCE;
      }
      return fs.readFileSync(file, encoding);
    }
  };

  const mod = { exports: {} };
  new Function('require', 'module', 'WebSocket', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    fs.readFileSync(path.join(__dirname, '../browser_mode.js'), 'utf8')
  )(
    name => name === 'http' ? http : name === 'https' ? { get } : name === 'fs' ? fakeFs : name === 'child_process' ? { spawn() { assert.fail('must not spawn'); } } : require(name),
    mod, Socket, setTimeoutFake, id => timers.delete(id), (fn, ms) => setTimeoutFake(fn, ms), id => timers.delete(id)
  );

  const client = mod.exports.createBrowserMode({
    rootDir: 'fake',
    sessionsDir: 'fake',
    getSettings: () => ({ browserKind: 'edge' }),
    loadProfiles: () => options.profiles || [{ id: 'p1', debugPort: 49999 }],
    profileScriptSource: options.profileScriptSource
  });

  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
  const advance = async ms => {
    const matching = [...timers].filter(([, t]) => t.ms === ms);
    for (const [id, t] of matching) { timers.delete(id); t.fn(); }
    await settle();
  };
  const event = (method, params = {}) => {
    const session = [...sessions].filter(([, t]) => t?.targetId === 'target').at(-1)?.[0];
    sockets.at(-1).onmessage?.({ data: JSON.stringify({ method, params, sessionId: session }) });
  };

  return {
    client, settle, advance, event, options, initial, targets, calls, sockets, servers, deferred, sessions,
    get sourceCalls() { return sourceCalls; },
    get fullEvaluations() { return fullEvaluations; },
    newDocument(readyState = 'complete', profileId = 'p1', targetId = 'target') {
      const next = makeDoc(targetId, profileId, false, readyState);
      for (const [id, t] of sessions) if (t?.targetId === targetId) sessions.set(id, next);
      return next;
    }
  };
}

test('F5 navigation with interactive readyState retries and injects bot when ready', async () => {
  const f = fixture({ existing: true });
  f.client.start();
  await f.advance(3000);
  assert.equal(f.client.isOpen('p1'), true);
  assert.equal(f.client.status().p1.state, 'ready');

  // F5 happens: document starts as 'interactive'
  const nextDoc = f.newDocument('interactive');
  f.event('Page.frameNavigated', { frame: { id: 'main' }, type: 'Navigation' });
  f.event('Page.loadEventFired');
  await f.settle();

  assert.equal(f.client.status().p1.state, 'document-pending');
  // Document becomes complete shortly after
  nextDoc.context.document.readyState = 'complete';

  // Advance retry timer
  await f.advance(1000);
  await f.settle();

  assert.equal(f.fullEvaluations, 1);
  assert.equal(nextDoc.context.window.__pelicanBotVersion, '4.38.1');
  assert.equal(f.client.status().p1.state, 'ready');
});

test('launch() on existing target with missing or pending bot re-injects and returns recovered ACK', async () => {
  const f = fixture({ existing: true });
  f.client.start();
  await f.advance(3000);

  // Simulate F5 refresh where bot is missing
  const nextDoc = f.newDocument('complete');
  f.event('Page.frameNavigated', { frame: { id: 'main' }, type: 'Navigation' });
  // Do not fire loadEventFired to simulate missed event
  await f.settle();
  assert.equal(f.fullEvaluations, 0);

  // User clicks "เปิดจอ" from Manager
  const res = await f.client.launch({ id: 'p1', debugPort: 49999 });
  assert.equal(res.success, true);
  assert.equal(res.alreadyOpen, true);
  assert.equal(res.recovered, true);
  assert.equal(f.fullEvaluations, 1);
  assert.equal(nextDoc.context.window.__pelicanBotVersion, '4.38.1');
  assert.equal(f.client.status().p1.state, 'ready');
});

test('verification failure does not fallback to public bot and marks diagnostic without infinite retry', async () => {
  const f = fixture({
    profileScriptSource: () => { throw Error('SIGNATURE_VERIFICATION_FAILED'); }
  });
  f.client.start();
  await f.advance(3000);
  await f.advance(1000);
  await f.advance(3000);
  await f.advance(15000);

  // Must NOT fall back to local bot.js or full evaluation
  assert.equal(f.fullEvaluations, 0);
  assert.match(f.client.status().p1.state, /load-failed|probe-unavailable/);
});

test('stopped bot before F5 remains stopped after recovery', async () => {
  const storage = new Map([['pelican_bot_running', 'false']]);
  const f = fixture({ existing: true, storage });
  f.client.start();
  await f.advance(3000);

  const nextDoc = f.newDocument('complete');
  f.event('Page.frameNavigated', { frame: { id: 'main' }, type: 'Navigation' });
  f.event('Page.loadEventFired');
  await f.settle();

  assert.equal(nextDoc.context.window.__isBotRunning, false);
});

test('partial initialized failure does not evaluate full bot again in same document', async () => {
  const f = fixture({ existing: true });
  f.client.start();
  await f.advance(3000);

  const nextDoc = f.newDocument('complete');
  // Simulate a failed initialization marker
  nextDoc.context.window.__pmScriptBootstrap = {
    status: () => ({ protocol: 2, phase: 'failed', code: 'TEST_INIT_FAILED' })
  };
  nextDoc.context.window.__pmPayloadInitialized = true;

  f.event('Page.frameNavigated', { frame: { id: 'main' }, type: 'Navigation' });
  f.event('Page.loadEventFired');
  await f.settle();

  // Full bot should not have been re-evaluated
  assert.equal(f.fullEvaluations, 0);
  assert.equal(f.client.status().p1.state, 'partial-runtime');
});

test('unsent captcha stats survive reload and are not duplicated', async () => {
  const event1 = { eventId: 'evt-1', checkId: 'chk-1', profileId: 'p1', charged: 0 };
  const storage = new Map([
    ['pelican_p1__pelican_embedded_human_check_events', JSON.stringify([event1])]
  ]);
  const f = fixture({ existing: true, storage });
  f.client.start();
  await f.advance(3000);

  const nextDoc = f.newDocument('complete');
  f.event('Page.frameNavigated', { frame: { id: 'main' }, type: 'Navigation' });
  f.event('Page.loadEventFired');
  await f.settle();

  const stored = JSON.parse(storage.get('pelican_p1__pelican_embedded_human_check_events') || '[]');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].eventId, 'evt-1');
});

test('offlineCoordinator.profileScriptSource delivers signed cached payload directly into fresh document', async () => {
  const os = require('os');
  const crypto = require('crypto');
  const { createOfflinePayloadCache } = require('../offline_payload_cache');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-coord-deliver-'));
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const payloadSource = "window.__sourceRuns=(window.__sourceRuns||0)+1;window.__pelicanBotVersion='4.38.1';document.hud=true;window.__getClientLiveState=()=>({inGame:false});window.__isBotRunning=false;/*" + 'x'.repeat(1200) + '*/';
  const claims = {
    protocol: 2,
    mode: 'friends-offline',
    version: '4.38.1',
    payloadHash: crypto.createHash('sha256').update(payloadSource).digest('hex'),
    size: Buffer.byteLength(payloadSource),
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const envelope = {
    keyId: 'testKey',
    claims: encoded,
    signature: crypto.sign('sha256', Buffer.from('PmheeAether.offline-release.v1\n' + encoded), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  };

  const offlineFixture = {
    dataDir,
    trustedKeys: { testKey: keys.publicKey.export({ format: 'jwk' }) },
    protect: v => v,
    unprotect: v => v
  };
  createOfflinePayloadCache(offlineFixture).save({ source: payloadSource, envelope });

  const service = {
    serviceOrigin: 'https://example.test',
    loadSettings: () => ({ accountId: 'acc-1', balanceUnits: 1000 }),
    setOfflineWallet() {},
    serviceRequest: async () => { throw Error('OFFLINE'); }
  };

  const coord = createOfflineCoordinator({
    ...offlineFixture,
    service,
    loadProfiles: () => [{ id: 'p1', debugPort: 49999 }],
    evalProfilePort: async () => ({ success: true })
  });

  const src = coord.profileScriptSource('p1');
  assert.ok(typeof src === 'string');
  assert.ok(src.includes('.accept('));
  assert.ok(src.includes('4.38.1'));

  const f = fixture({
    profileScriptSource: (id) => coord.profileScriptSource(id)
  });
  f.client.start();
  await f.advance(3000);
  assert.equal(f.fullEvaluations, 1);
});

test('Aw, Snap! renderer crash (Inspector.targetCrashed / Target.targetCrashed / unresponsive target) auto-reloads tab and recovers bot', async () => {
  const f = fixture({ existing: true });
  f.client.start();
  await f.advance(3000);
  assert.equal(f.client.isOpen('p1'), true);
  assert.equal(f.client.status().p1.state, 'ready');

  // 1) Simulate renderer crash via Inspector.targetCrashed event
  f.targets.get('target').crashed = true;
  f.event('Inspector.targetCrashed', { status: 'oom', errorCode: -536870904 });
  await f.settle();

  assert.equal(f.calls.some(c => c.method === 'Page.reload'), true);
  assert.equal(f.fullEvaluations, 1);
  assert.equal(f.client.status().p1.state, 'ready');

  // 2) Simulate silent renderer crash where only Runtime.evaluate fails and user clicks "เปิดจอเกม" (launch)
  f.targets.get('target').crashed = true;
  const reloadCallsBefore = f.calls.filter(c => c.method === 'Page.reload').length;
  const res = await f.client.launch({ id: 'p1', debugPort: 49999 });
  await f.settle();

  assert.equal(res.success, true);
  assert.equal(res.alreadyOpen, true);
  assert.equal(res.recovered, true);
  assert.ok(f.calls.filter(c => c.method === 'Page.reload').length > reloadCallsBefore);
  assert.equal(f.client.status().p1.state, 'ready');
});


