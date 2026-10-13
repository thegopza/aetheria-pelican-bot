'use strict';
// Comprehensive integration test:
// 1. Real owner handler / SQLite backend backing all sync requests (no mock server)
// 2. Real legacy coordinator (protocol 1) & offline debt coordinator (protocol 2) coexistence
// 3. Safe browser reload transition from protocol 1 -> protocol 2 without forced injection
// 4. Offline buffering of usage events across profiles
// 5. Reconnection sync with authoritative server ledger and wallet revision
// 6. Slot reuse on same day (ledger debits only once per slot/day, backend reports ledger rate)
// 7. Lost ACK / replayed batch deduplication without double-debit
// 8. Full TrueMoney voucher redeem flow through /v1/aetheria/topup handler with fake provider
// 9. Debt policy toggle OFF then ON without double-debiting
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const { createOfflineCoordinator } = require('../offline_coordinator');
const { createScriptCoordinator } = require('../script_coordinator');
const { createOfflinePayloadCache } = require('../offline_payload_cache');

function resolveOwnerApiRoot() {
  const candidates = [
    path.resolve(__dirname, '../../../PmheeAether/private-api'),
    path.resolve(__dirname, '../../../../PMheeSuite/PMheePlatform_Src/Server/PMhee.AetheriaApi'),
    'D:/MyProject/PmheeAether/private-api',
    'D:/MyProject/PMheeSuite/PMheePlatform_Src/Server/PMhee.AetheriaApi'
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'owner-host/server.mjs'))) return c;
  }
  throw new Error('Owner API root not found in candidates: ' + candidates.join(', '));
}

async function setupRealBackend(accountId, authToken) {
  const apiRoot = resolveOwnerApiRoot();
  const { openD1 } = await import(pathToFileURL(path.join(apiRoot, 'owner-host/sqlite-d1.mjs')).href);
  const { createOwnerHandler, rateLimit } = await import(pathToFileURL(path.join(apiRoot, 'owner-host/server.mjs')).href);
  const { createDebtPolicy } = await import(pathToFileURL(path.join(apiRoot, 'owner-host/debt-policy.mjs')).href);
  const { hash } = await import(pathToFileURL(path.join(apiRoot, 'cloudflare/protocol.mjs')).href);

  const db = openD1(':memory:');
  const migrationsDir = path.join(apiRoot, 'cloudflare/migrations');
  for (const name of fs.readdirSync(migrationsDir).filter(n => n.endsWith('.sql')).sort()) {
    db.sqlite.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
  }
  db.sqlite.exec(fs.readFileSync(path.join(apiRoot, 'owner-host/schema.sql'), 'utf8'));
  db.sqlite.exec("INSERT INTO catalog(id, body, updated_ms) VALUES(1, '{}', 0);");

  const now = Date.now();
  const today = new Date(now + 7 * 3600000).toISOString().slice(0, 10);

  // Initialize account with 10 points = 1000 balance_units
  db.sqlite.exec("UPDATE control SET maintenance=0;");
  db.sqlite.exec("INSERT INTO accounts(id, token_hash, hwid_hash, points) VALUES('" + accountId + "','" + hash(authToken) + "','hwid-test', 10);");
  db.sqlite.exec("UPDATE billing_control SET enabled=1, wallet_units_ready=1, activation_day='2026-10-13';");
  db.sqlite.exec("INSERT INTO billing_rate_revisions(request_id, day, rate_units, operator, reason, committed_ms) VALUES('r-init','" + today + "', 100, 'system', 'test-rate', 0);");

  // Review R5: Fake topup provider to test full redeem flow through /v1/aetheria/topup
  const fakeProvider = async (voucherCode) => {
    if (voucherCode === 'invalid') return { success: false, reason: 'VOUCHER_NOT_FOUND' };
    return {
      success: true,
      amount: 20,
      points: 20,
      evidence: crypto.createHash('sha256').update('evidence:' + voucherCode).digest('hex'),
      provider: 'gateway.autozy.app'
    };
  };

  const env = {
    DB: db,
    ACCOUNT_LIMIT: rateLimit(1000),
    IP_LIMIT: rateLimit(10000),
    ENROLL_LIMIT: rateLimit(100),
    SOLVE_COST: '0',
    WALLET_PROVIDER: fakeProvider
  };

  const handler = createOwnerHandler({ db, env });
  const debtPolicy = createDebtPolicy({ db });

  return { db, env, handler, debtPolicy, today, fakeProvider };
}

function setupClientFixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-real-transition-'));
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const source = '/* private candidate v4.38.0 authorized source */\nfunction __pmRealBot() {}\n';
  const claims = {
    protocol: 2,
    mode: 'friends-offline',
    version: '4.38.0',
    payloadHash: crypto.createHash('sha256').update(source).digest('hex'),
    size: Buffer.byteLength(source),
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const envelope = {
    keyId: 'test-pinned-key',
    claims: encoded,
    signature: crypto.sign('sha256', Buffer.from('PmheeAether.offline-release.v1\n' + encoded), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363'
    }).toString('base64url')
  };
  return {
    dataDir,
    trustedKeys: { 'test-pinned-key': keys.publicKey.export({ format: 'jwk' }) },
    protect: v => v,
    unprotect: v => v,
    source,
    envelope,
    claims
  };
}

test('Legacy bot (protocol 1) -> Debt bot (protocol 2) migration with real owner SQLite backend & redeem flow', async (t) => {
  const accountId = 'acc-test';
  const authToken = 'f'.repeat(64);

  const backend = await setupRealBackend(accountId, authToken);
  t.after(() => backend.db.close());

  const f = setupClientFixture();
  t.after(() => fs.rmSync(f.dataDir, { recursive: true, force: true }));

  createOfflinePayloadCache(f).save({ source: f.source, envelope: f.envelope });

  let currentTime = Date.now();
  const now = () => currentTime;
  let isOnline = false; // Start offline
  let walletApi = null;
  let capturedMachineId = 'machine-test-1';
  const capturedSlots = {};

  const fleet = {
    p1: { protocol: 1, version: '4.36.3', existingRuntime: true, running: true, busy: [], characterId: 'Char-P1', runtimeNonce: 'nonce-p1' },
    p2: { protocol: null, version: null, existingRuntime: false, running: false, busy: [], characterId: 'Char-P2', runtimeNonce: null }
  };

  const service = {
    serviceOrigin: 'https://api.noggunsshop.xyz',
    loadSettings: () => {
      const row = backend.db.sqlite.prepare('SELECT balance_units FROM accounts WHERE id=?').get(accountId);
      return { accountId, balanceUnits: row ? row.balance_units : 1000 };
    },
    setOfflineWallet: w => { walletApi = w; },
    applyOfflineBalance: () => {},
    applyOfflineWalletSnapshot: () => {},
    async serviceRequest(route, body) {
      if (!isOnline) throw Error('NETWORK_OFFLINE');
      if (body?.machineId) capturedMachineId = body.machineId;
      if (Array.isArray(body?.sessions)) {
        for (const s of body.sessions) {
          if (s.profileId && s.slotId) capturedSlots[s.profileId] = s.slotId;
        }
      }
      if (Array.isArray(body?.events)) {
        for (const e of body.events) {
          if (e.profileId && e.slotId) capturedSlots[e.profileId] = e.slotId;
        }
      }
      const req = new Request('https://api.noggunsshop.xyz' + route, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + authToken,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const res = await backend.handler(req);
      const data = await res.json();
      if (!data.success) throw Object.assign(new Error(data.code || 'SERVICE_ERROR'), { code: data.code });
      return data;
    }
  };

  // Browser execution harness simulating window and script bootstraps
  const evalProfilePort = async (port, code) => {
    const profileId = port === 49876 ? 'p1' : 'p2';
    const screen = fleet[profileId];

    // Bootstrap acceptance (delivering offline payload to un-injected or reloaded screen)
    if (code.includes('.accept(')) {
      assert.ok(!screen.existingRuntime || screen.protocol === 2, 'Cannot hot-inject over running protocol 1');
      screen.existingRuntime = true;
      screen.protocol = 2;
      screen.version = '4.38.0';
      screen.runtimeNonce = 'nonce-' + profileId + '-v2';
      return { success: true, result: { success: true } };
    }

    // Probe JS evaluation (window.__pmScriptBootstrap inspection)
    return {
      success: true,
      result: {
        version: screen.version,
        existingRuntime: screen.existingRuntime,
        running: screen.running,
        busy: screen.busy,
        characterId: screen.characterId,
        bootstrap: screen.protocol ? { protocol: screen.protocol, runtimeNonce: screen.runtimeNonce, activated: true } : null
      }
    };
  };

  // Review R5: Real legacy coordinator from script_coordinator.js executed alongside offline coordinator
  const legacyDataDir = path.join(f.dataDir, 'legacy_coordinator');
  fs.mkdirSync(legacyDataDir, { recursive: true });
  const legacyCoordinator = createScriptCoordinator({
    dataDir: legacyDataDir,
    now,
    loadProfiles: () => [{ id: 'p1', debugPort: 49876 }],
    evalProfilePort,
    service,
    pilotProfileIds: ['p1'],
    trustedKeys: f.trustedKeys,
    protect: f.protect,
    unprotect: f.unprotect
  });
  t.after(() => legacyCoordinator.stop());

  const coordinator = createOfflineCoordinator({
    ...f,
    now,
    service,
    legacyCoordinator,
    loadProfiles: () => [
      { id: 'p1', debugPort: 49876 },
      { id: 'p2', debugPort: 49877 }
    ],
    evalProfilePort
  });
  t.after(() => coordinator.stop());

  // -------------------------------------------------------------
  // PHASE 1: Real Legacy Bot Coexistence
  // -------------------------------------------------------------
  // Offline coordinator probes p1, detects protocol 1 runtime, retains legacy coordinator without hot-inject
  await coordinator.cycle();

  assert.equal(coordinator.status().clients.p1.state, 'waiting-safe-bootstrap');
  assert.equal(coordinator.status().clients.p1.version, '4.36.3');
  assert.ok(legacyCoordinator.status().clients.p1, 'Legacy coordinator has p1 recorded');
  assert.equal(fleet.p1.protocol, 1, 'p1 stays on protocol 1 without disruption');

  // p2 had no existing runtime: offline coordinator delivers protocol 2 candidate payload safely
  assert.equal(fleet.p2.protocol, 2);
  assert.equal(coordinator.status().clients.p2.state, 'authorized');
  assert.equal(coordinator.status().clients.p2.version, '4.38.0');

  // -------------------------------------------------------------
  // PHASE 2: Safe Reload to Protocol 2
  // -------------------------------------------------------------
  // User reloads p1 page safely: old runtime resets
  fleet.p1.existingRuntime = false;
  fleet.p1.protocol = null;
  fleet.p1.version = null;
  fleet.p1.running = false;

  currentTime += 5000;
  await coordinator.cycle();
  assert.equal(fleet.p1.protocol, 2, 'p1 upgraded safely to protocol 2 after reload');
  assert.equal(coordinator.status().clients.p1.state, 'authorized');
  assert.equal(coordinator.status().clients.p1.version, '4.38.0');

  // -------------------------------------------------------------
  // PHASE 3: Offline Farming & Journal Debt Buffering
  // -------------------------------------------------------------
  fleet.p1.running = true;
  fleet.p2.running = true;

  assert.equal(isOnline, false);
  currentTime += 5000;
  await coordinator.cycle();

  assert.equal(coordinator.statement().balanceUnits, 800, 'Journal buffers 2 active farming screens (-200 units)');
  assert.equal(coordinator.statement().usedSlotsToday, 2);
  assert.equal(coordinator.status().pendingEvents, 2);

  const initialServerBalance = backend.db.sqlite.prepare('SELECT balance_units FROM accounts WHERE id=?').get(accountId).balance_units;
  assert.equal(initialServerBalance, 1000, 'Real SQLite backend remains 1000 while offline');

  // -------------------------------------------------------------
  // PHASE 4: Reconnection Sync with Real Backend
  // -------------------------------------------------------------
  isOnline = true;
  currentTime += 130000; // Past 120s backoff
  await coordinator.cycle();

  assert.equal(coordinator.status().pendingEvents, 0, 'Events ACKed and cleared from journal');

  const syncedServer = backend.db.sqlite.prepare('SELECT balance_units, wallet_revision FROM accounts WHERE id=?').get(accountId);
  assert.equal(syncedServer.balance_units, 800, 'Real SQLite ledger debited to 800');
  assert.equal(syncedServer.wallet_revision, 3, 'Revision incremented monotonically by trigger');
  assert.equal(coordinator.statement().balanceUnits, 800);

  // -------------------------------------------------------------
  // PHASE 5: Slot Reuse on Same Day
  // -------------------------------------------------------------
  // Same slot s1 observed again today on p1. Backend must return ledger rate but NOT debit twice.
  const slot1 = capturedSlots.p1;
  assert.ok(slot1, 'Slot 1 must be captured from coordinator sync');
  const p1ReuseEvent = {
    eventId: 'evt-reuse-slot1',
    slotId: slot1,
    profileId: 'p1',
    characterId: 'Char-P1',
    date: backend.today,
    observedAt: currentTime
  };

  const syncReuseRes = await service.serviceRequest('/v1/aetheria/offline/sync', {
    machineId: capturedMachineId,
    batchId: 'batch-reuse-slot1',
    events: [p1ReuseEvent],
    sessions: [{ profileId: 'p1', slotId: slot1, characterId: 'Char-P1', running: true }]
  });

  assert.equal(syncReuseRes.balanceUnits, 800, 'Slot reused on same day did NOT debit ledger again');
  assert.deepEqual(syncReuseRes.eventCharges, [{ eventId: 'evt-reuse-slot1', rateUnits: 100 }], 'Backend reports recorded rate');

  // -------------------------------------------------------------
  // PHASE 6: Lost ACK & Idempotent Batch Replay
  // -------------------------------------------------------------
  // Simulate network dropping before client receives ACK: client re-sends exact batch
  const replayBatch = {
    machineId: capturedMachineId,
    batchId: 'batch-reuse-slot1',
    events: [p1ReuseEvent],
    sessions: [{ profileId: 'p1', slotId: slot1, characterId: 'Char-P1', running: true }]
  };
  const replayedRes = await service.serviceRequest('/v1/aetheria/offline/sync', replayBatch);
  assert.equal(replayedRes.replayed, true, 'Backend identified duplicate batchId');
  assert.equal(replayedRes.balanceUnits, 800, 'Replayed batch preserves balance');

  // -------------------------------------------------------------
  // PHASE 7: Full TrueMoney Voucher Redeem Flow
  // -------------------------------------------------------------
  // Review R5: Test full redeem flow through /v1/aetheria/topup handler with fake provider
  const voucherUrl = 'https://gift.truemoney.com/campaign/?v=0123456789abcdef12345';
  const topupReq = new Request('https://api.noggunsshop.xyz/v1/aetheria/topup', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + authToken,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ voucherUrl })
  });

  const topupRes = await backend.handler(topupReq);
  assert.equal(topupRes.status, 200, 'Topup redeem returned HTTP 200');
  const topupData = await topupRes.json();
  assert.equal(topupData.success, true);
  assert.equal(topupData.amount, 20, '20 Baht redeemed');
  assert.equal(topupData.pointsAdded, 20, '20 points credited');
  assert.equal(topupData.balanceUnits, 2800, '2800 balance units returned');

  // Verify SQLite ledger and receipts table entries created by settle()
  const receiptRow = backend.db.sqlite.prepare('SELECT state, amount, points FROM receipts WHERE account_id=?').get(accountId);
  assert.equal(receiptRow.state, 'credited', 'Receipt state transitioned to credited');
  assert.equal(receiptRow.amount, 20);

  const serverAfterTopup = backend.db.sqlite.prepare('SELECT balance_units, wallet_revision FROM accounts WHERE id=?').get(accountId);
  assert.equal(serverAfterTopup.balance_units, 2800, 'Balance after redeem is 800 + 2000 = 2800 units');
  assert.equal(serverAfterTopup.wallet_revision, 4, 'Revision incremented monotonically on topup ledger insert');

  // Manager offline wallet refreshes and confirms authoritative server balance
  await walletApi.forceRefresh();
  assert.equal(walletApi.balance(), 2800, 'Manager wallet shows 2800 after refresh');
  assert.equal(coordinator.statement().balanceUnits, 2800);

  // -------------------------------------------------------------
  // PHASE 8: Debt Policy Toggle OFF then ON
  // -------------------------------------------------------------
  // Admin turns debt policy OFF
  currentTime += 5000;
  const currentPolicy = backend.debtPolicy.get();
  backend.debtPolicy.set({ enabled: false, expectedRevision: currentPolicy.revision }, 'admin-test');

  const slot2 = capturedSlots.p2;
  assert.ok(slot2, 'Slot 2 must be captured from coordinator sync');
  const disabledTime = currentTime + 1000;
  const disabledEvent = {
    eventId: 'evt-while-disabled',
    slotId: slot2,
    profileId: 'p2',
    characterId: 'Char-P2',
    date: backend.today,
    observedAt: disabledTime
  };

  const syncDisabledRes = await service.serviceRequest('/v1/aetheria/offline/sync', {
    machineId: capturedMachineId,
    batchId: 'batch-while-disabled',
    events: [disabledEvent],
    sessions: [{ profileId: 'p2', slotId: slot2, characterId: 'Char-P2', running: true }]
  });

  assert.equal(syncDisabledRes.balanceUnits, 2800, 'Balance untouched while debt policy disabled');
  assert.deepEqual(syncDisabledRes.eventCharges, [{ eventId: 'evt-while-disabled', rateUnits: 0 }], 'Charged 0 while disabled');

  // Admin turns debt policy back ON
  currentTime += 5000;
  const disabledPolicy = backend.debtPolicy.get();
  backend.debtPolicy.set({ enabled: true, expectedRevision: disabledPolicy.revision }, 'admin-test');

  // Profile p2 on slot2 continues; to test fresh debit, use a fresh slot on a new profile p3
  const slot3 = 's3-fresh-slot';
  const reenabledTime = currentTime + 1000;
  const reenabledEvent = {
    eventId: 'evt-after-reenabled',
    slotId: slot3,
    profileId: 'p3',
    characterId: 'Char-P3',
    date: backend.today,
    observedAt: reenabledTime
  };

  const syncReenabledRes = await service.serviceRequest('/v1/aetheria/offline/sync', {
    machineId: capturedMachineId,
    batchId: 'batch-after-reenabled',
    events: [reenabledEvent],
    sessions: [{ profileId: 'p3', slotId: slot3, characterId: 'Char-P3', running: true }]
  });

  assert.equal(syncReenabledRes.balanceUnits, 2700, 'Debited 100 units after debt re-enabled');
  assert.deepEqual(syncReenabledRes.eventCharges, [{ eventId: 'evt-after-reenabled', rateUnits: 100 }]);

  const finalServer = backend.db.sqlite.prepare('SELECT balance_units FROM accounts WHERE id=?').get(accountId);
  assert.equal(finalServer.balance_units, 2700, 'Final authoritative server balance is 2700');
});
