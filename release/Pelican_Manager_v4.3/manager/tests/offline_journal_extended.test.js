'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createOfflineJournal, encryptedStore } = require('../offline_journal');

const protect = v => Buffer.from(v).toString('base64');
const unprotect = v => Buffer.from(v, 'base64').toString('utf8');

function createHarness(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-offline-ext-'));
  let currentTime = options.startTime ?? 1000000;
  const open = (extra = {}) => createOfflineJournal({
    dataDir,
    accountId: options.accountId || 'acc_test_1',
    initialBalanceUnits: options.initialBalanceUnits ?? 500,
    now: () => currentTime,
    protect,
    unprotect,
    ...extra
  });
  const journal = open();
  const accountDir = path.join(dataDir, 'offline', crypto.createHash('sha256').update(options.accountId || 'acc_test_1').digest('hex'));
  const cleanup = () => { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {} };
  return { journal, open, dataDir, accountDir, cleanup, advanceTime: ms => { currentTime += ms; } };
}

const ack = (batch, balanceUnits, walletRevision, extra = {}) => ({
  success: true, batchId: batch.batchId, unitScale: 100, balanceUnits, rateUnits: 100, walletRevision,
  ackEventIds: batch.events.map(e => e.eventId), ...extra
});

test('input bounds rejection on invalid profileId, characterId, or negative observedAt', () => {
  const { journal, cleanup } = createHarness();
  try {
    assert.throws(() => journal.slot(''), /INVALID_PROFILE_ID/);
    assert.throws(() => journal.slot('a'.repeat(129)), /INVALID_PROFILE_ID/);
    assert.throws(() => journal.observe({ profileId: 'p1', characterId: 'c'.repeat(129) }), /INVALID_CHARACTER_ID/);
    assert.throws(() => journal.observe({ profileId: 'p1', observedAt: -100 }), /INVALID_OBSERVED_AT/);
  } finally { cleanup(); }
});

test('history survives restart; an actually corrupted history row is rejected on load without reset', () => {
  const { journal, open, accountDir, cleanup } = createHarness({ initialBalanceUnits: 1000 });
  try {
    journal.observe({ profileId: 'p1', characterId: 'Hero1', observedAt: 1000000 });
    journal.observe({ profileId: 'p2', characterId: 'Hero2', observedAt: 1000000 });
    const batch = journal.snapshot(500);
    journal.acknowledge(batch, ack(batch, 800, 5));
    const j2 = open();
    assert.equal(j2.history().length, 2);
    assert.equal(j2.history()[0].characterId, 'Hero1');
    assert.equal(j2.history()[0].acknowledged, true);
    assert.equal(j2.balance(), 800);
    assert.equal(j2.walletRevision(), 5);

    // Corrupt a history row inside the authenticated, encrypted index (not just garbage bytes).
    const store = encryptedStore(accountDir, protect, unprotect);
    const indexFile = path.join(accountDir, 'index.dat');
    const state = store.decode(fs.readFileSync(indexFile, 'utf8'));
    state.history[0].observedAt = 'not-a-number';
    const corrupted = store.encode(state);
    fs.writeFileSync(indexFile, corrupted);
    assert.throws(() => open(), /OFFLINE_JOURNAL_CORRUPT: INVALID_JOURNAL_HISTORY/);
    assert.equal(fs.readFileSync(indexFile, 'utf8'), corrupted, 'evidence preserved, journal not reset');

    state.history[0].observedAt = 1000000;
    state.walletRevision = -3;
    fs.writeFileSync(indexFile, store.encode(state));
    assert.throws(() => open(), /OFFLINE_JOURNAL_CORRUPT: INVALID_JOURNAL/);
  } finally { cleanup(); }
});

// Review R4 exact reproduction: start 10 ส่วนบุญ (1000 units), use 1 → ACK 900 delayed; topup → server 1900;
// client learns 1900; old ACK 900 arrives. Previously local balance went back to 900 (19 → 9).
test('R4: delayed old ACK cannot roll back a newer topup balance (19 must not become 9)', () => {
  const { journal, open, cleanup } = createHarness({ initialBalanceUnits: 1000 });
  try {
    const base = journal.snapshot(500);
    journal.acknowledge(base, ack(base, 1000, 10));
    journal.observe({ profileId: 'p1', observedAt: 1000000 });
    assert.equal(journal.balance(), 900);
    const batch = journal.snapshot(500);
    // Server: debit → 900 @ rev 11 (ACK delayed in network); topup → 1900 @ rev 12.
    const delayedAck = ack(batch, 900, 11);
    assert.equal(journal.setConfirmedBalance(1900, 12), true);
    const result = journal.acknowledge(batch, delayedAck);
    assert.equal(result.stale, true);
    assert.equal(result.applied, false);
    assert.equal(journal.pendingCount(), 0, 'ACKed events are still cleared');
    assert.equal(journal.balance(), 1900);
    assert.equal(open().balance(), 1900, 'persisted value is the newer one');
    assert.equal(open().walletRevision(), 12);
  } finally { cleanup(); }
});

test('R4: newer ACK still replaces an older confirmed balance; equal/older confirmations are ignored', () => {
  const { journal, cleanup } = createHarness({ initialBalanceUnits: 1000 });
  try {
    assert.throws(() => journal.setConfirmedBalance(2000), /WALLET_REVISION_REQUIRED/);
    assert.equal(journal.setConfirmedBalance(2000, 3), true);
    assert.equal(journal.setConfirmedBalance(5000, 3), false);
    assert.equal(journal.setConfirmedBalance(5000, 2), false);
    journal.observe({ profileId: 'p1', observedAt: 1000000 });
    assert.equal(journal.balance(), 1900);
    const batch = journal.snapshot(500);
    // Topup confirmed at rev 3 happened before the server processed this batch (rev 4 includes both).
    const r = journal.acknowledge(batch, ack(batch, 1900, 4));
    assert.equal(r.applied, true);
    assert.equal(journal.balance(), 1900);
    assert.equal(journal.pendingCount(), 0);
  } finally { cleanup(); }
});

test('R4: ACK without walletRevision is rejected and debt is retained', () => {
  const { journal, cleanup } = createHarness({ initialBalanceUnits: 1000 });
  try {
    journal.observe({ profileId: 'p1', observedAt: 1000000 });
    const batch = journal.snapshot(500);
    const bad = ack(batch, 900, 1); delete bad.walletRevision;
    assert.throws(() => journal.acknowledge(batch, bad), /INVALID_SYNC_ACK/);
    assert.throws(() => journal.acknowledge(batch, ack(batch, 900, -1)), /INVALID_SYNC_ACK/);
    assert.equal(journal.pendingCount(), 1);
    assert.equal(journal.balance(), 900);
  } finally { cleanup(); }
});

test('R4: lost ACK replay after restart gets the current server revision and applies once', () => {
  const { journal, open, cleanup } = createHarness({ initialBalanceUnits: 1000 });
  try {
    journal.observe({ profileId: 'p1', observedAt: 1000000 });
    const batch = journal.snapshot(500);
    // ACK for rev 1 is lost; admin adds 500 → rev 2. Client restarts and resends the same batch.
    const j2 = open();
    const again = j2.snapshot(500);
    assert.equal(again.batchId, batch.batchId);
    j2.acknowledge(again, ack(again, 1400, 2, { replayed: true }));
    assert.equal(j2.balance(), 1400);
    assert.equal(j2.pendingCount(), 0);
  } finally { cleanup(); }
});

test('history retention keeps recent acknowledged rows past 1000 entries and never prunes unacknowledged debt', () => {
  const { journal, cleanup } = createHarness({ initialBalanceUnits: 0 });
  try {
    const day = 86400000;
    const start = Date.parse('2025-01-01T05:00:00Z');
    let rev = 0;
    for (let d = 0; d < 42; d++) {
      for (let p = 0; p < 25; p++) journal.observe({ profileId: 'p' + p, observedAt: start + d * day });
      const batch = journal.snapshot(500);
      journal.acknowledge(batch, ack(batch, -(d + 1) * 2500, ++rev));
    }
    assert.equal(journal.history().length, 1050, 'old 2000-cap style truncation would not apply here, but nothing recent is dropped');
    // An unacknowledged row from long ago, then a row 500 days later: old acknowledged rows are pruned, unacked kept.
    journal.observe({ profileId: 'late', observedAt: start + 41 * day });
    journal.observe({ profileId: 'late', observedAt: start + 541 * day });
    const history = journal.history();
    assert.equal(history.filter(e => e.acknowledged).length, 0);
    assert.equal(history.length, 2);
    assert.equal(journal.pendingCount(), 2);
  } finally { cleanup(); }
});
