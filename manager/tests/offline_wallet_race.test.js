'use strict';
// Review R4 integration: real coordinator + real journal, sync response delayed in the "network" while a topup
// lands on the server. The old ACK must not become the displayed balance.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { createOfflineCoordinator } = require('../offline_coordinator');
const { createOfflinePayloadCache } = require('../offline_payload_cache');

function fixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-offline-race-'));
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const source = '/* private fixture */';
  const claims = { protocol: 2, mode: 'friends-offline', version: '4.38.0', payloadHash: crypto.createHash('sha256').update(source).digest('hex'), size: Buffer.byteLength(source), issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const envelope = { keyId: 'test', claims: encoded, signature: crypto.sign('sha256', Buffer.from('PmheeAether.offline-release.v1\n' + encoded), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
  return { dataDir, trustedKeys: { test: keys.publicKey.export({ format: 'jwk' }) }, protect: v => v, unprotect: v => v, source, envelope };
}

// Minimal server model with an authoritative per-account wallet revision.
function fakeServer(startUnits) {
  const s = { balance: startUnits, revision: 1, seen: new Set(), batches: new Map(), held: [] };
  s.topup = units => { s.balance += units; s.revision++; };
  s.handleSync = body => {
    if (s.batches.has(body.batchId)) return { ...s.batches.get(body.batchId), balanceUnits: s.balance, walletRevision: s.revision, replayed: true };
    for (const e of body.events) if (!s.seen.has(e.eventId)) { s.seen.add(e.eventId); s.balance -= 100; s.revision++; }
    const response = { success: true, batchId: body.batchId, ackEventIds: body.events.map(e => e.eventId), unitScale: 100, rateUnits: 100, balanceUnits: s.balance, walletRevision: s.revision };
    s.batches.set(body.batchId, response);
    return response;
  };
  return s;
}

const tick = () => new Promise(r => setImmediate(r));

test('R4 integration: delayed sync ACK racing a topup leaves the newer balance (19 not 9)', async () => {
  const f = fixture();
  createOfflinePayloadCache(f).save({ source: f.source, envelope: f.envelope });
  const server = fakeServer(1000);
  let wallet, delayNext = true, applied = [];
  const service = {
    serviceOrigin: 'https://fixture.invalid',
    loadSettings: () => ({ accountId: 'a', balanceUnits: 1000 }),
    setOfflineWallet: v => { wallet = v; },
    applyOfflineWalletSnapshot: r => applied.push(r.balanceUnits),
    async serviceRequest(route, body) {
      if (!route.endsWith('/sync')) throw Error('OFFLINE');
      const response = server.handleSync(body);       // server commits now
      if (delayNext) { delayNext = false; return new Promise(resolve => server.held.push(() => resolve(response))); }
      return response;
    }
  };
  const c = createOfflineCoordinator({ ...f, service, loadProfiles: () => [{ id: 'p', debugPort: 1 }],
    evalProfilePort: async () => ({ success: true, result: { version: '4.38.0', existingRuntime: true, busy: [], running: true, bootstrap: { protocol: 2 } } }) });
  try {
    const cycle = c.cycle();                          // observes 1 screen, sends sync, ACK is held
    while (!server.held.length) await tick();
    assert.equal(server.balance, 900);
    assert.equal(wallet.balance(), 900);
    server.topup(1000);                                // topup verified on server: 1900
    const refresh = wallet.forceRefresh();             // what redeemTrueMoneyVoucher does after success
    await tick();
    server.held.shift()();                             // old ACK (900) finally arrives
    await cycle;
    await refresh;
    assert.equal(wallet.balance(), 1900);
    assert.equal(c.statement().balanceUnits, 1900);
    assert.equal(c.status().pendingEvents, 0);
    assert.equal(server.seen.size, 1, 'resend/refresh never debits twice');
    assert.equal(server.balance, 1900);
  } finally { c.stop(); fs.rmSync(f.dataDir, { recursive: true, force: true }); }
});

test('R4 integration: lost ACK then Manager restart replays identical batch and debits once', async () => {
  const f = fixture();
  createOfflinePayloadCache(f).save({ source: f.source, envelope: f.envelope });
  const server = fakeServer(1000);
  let dropAck = true;
  const mk = () => {
    let wallet;
    const service = { serviceOrigin: 'https://fixture.invalid', loadSettings: () => ({ accountId: 'a', balanceUnits: 1000 }), setOfflineWallet: v => { wallet = v; },
      async serviceRequest(route, body) { if (!route.endsWith('/sync')) throw Error('OFFLINE'); const r = server.handleSync(body); if (dropAck) { dropAck = false; throw Error('ECONNRESET'); } return r; } };
    const c = createOfflineCoordinator({ ...f, service, loadProfiles: () => [{ id: 'p', debugPort: 1 }],
      evalProfilePort: async () => ({ success: true, result: { version: '4.38.0', existingRuntime: true, busy: [], running: true, bootstrap: { protocol: 2 } } }) });
    return { c, wallet: () => wallet };
  };
  const first = mk();
  try {
    await first.c.cycle();
    assert.equal(server.balance, 900);
    assert.equal(first.c.status().pendingEvents, 1, 'debt kept locally when ACK is lost');
    first.c.stop();
    const second = mk();                               // Manager restart
    await second.wallet().forceRefresh();
    assert.equal(server.balance, 900);
    assert.equal(server.seen.size, 1);
    assert.equal(second.wallet().balance(), 900);
    assert.equal(second.c.status().pendingEvents, 0);
    second.c.stop();
  } finally { fs.rmSync(f.dataDir, { recursive: true, force: true }); }
});
