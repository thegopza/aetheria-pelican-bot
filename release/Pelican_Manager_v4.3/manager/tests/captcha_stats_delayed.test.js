'use strict';
// Review P2: exercises the REAL captcha stats implementation (manager/captcha_stats.js) that server.js uses,
// instead of a copy redefined inside the test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCaptchaStats, EVENT_ID_LIMIT, EVENT_ID_TTL_MS } = require('../captcha_stats');

function fixture(t, nowMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-captcha-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'captcha_stats.json');
  let now = nowMs;
  const stats = createCaptchaStats({ file, now: () => now, log: { warn() {} } });
  return { file, stats, read: () => JSON.parse(fs.readFileSync(file, 'utf8')), setNow: v => { now = v; } };
}

test('server.js uses the real captcha_stats module (no private copy)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /require\('\.\/captcha_stats'\)\.createCaptchaStats\(/);
  assert.match(src, /function recordCaptchaSolved\(profileId, details = \{\}\) \{ return captchaStats\.record\(profileId, details\); \}/);
  assert.doesNotMatch(src, /stats\.embeddedEventIds\[details\.eventId\]=true/);
});

test('delayed stats across midnight go to the exact event day; re-sent events are deduplicated across restarts', t => {
  const before = Date.parse('2026-10-12T23:55:00+07:00'), after = Date.parse('2026-10-13T00:05:00+07:00');
  const f = fixture(t, Date.parse('2026-10-13T08:00:00+07:00'));
  f.stats.get(); // first run seeds totalSolved=16 (legacy behaviour)
  assert.ok(f.stats.record('p1', { eventId: 'evt_before', timestamp: before }));
  assert.ok(f.stats.record('p1', { eventId: 'evt_after', timestamp: after }));
  // duplicate: truthy (caller ACKs so the client stops resending) but not counted
  assert.ok(f.stats.record('p1', { eventId: 'evt_before', timestamp: before }));
  // a fresh instance (= Manager restart) still knows the IDs
  const restarted = createCaptchaStats({ file: f.file, now: () => Date.parse('2026-10-13T09:00:00+07:00'), log: { warn() {} } });
  assert.ok(restarted.record('p1', { eventId: 'evt_after', timestamp: after }));
  const s = f.read();
  assert.equal(s.totalSolved, 18);
  assert.equal(s.daily['2026-10-12'].total, 1);
  assert.equal(s.daily['2026-10-12'].byProfile.p1, 1);
  assert.equal(s.daily['2026-10-13'].total, 1);
  assert.deepEqual(Object.keys(s.embeddedEventIds).sort(), ['evt_after', 'evt_before']);
  assert.equal(restarted.get().totalSolved, 18);
});

test('regression: the old server read path dropped embeddedEventIds and double-counted a re-sent event', t => {
  const f = fixture(t, Date.parse('2026-10-13T08:00:00+07:00'));
  fs.writeFileSync(f.file, JSON.stringify({ totalSolved: 5, lastSolvedAt: 1, daily: { '2026-10-13': { date: '2026-10-13', total: 5, byProfile: {} } }, embeddedEventIds: { known: true } }));
  assert.ok(f.stats.record('p1', { eventId: 'known' }));      // legacy `true` value still deduplicates
  assert.equal(f.read().totalSolved, 5);
  assert.equal('embeddedEventIds' in f.stats.get(), false);  // UI view shape unchanged
});

test('future/invalid timestamps fall back to now; dedupe map is bounded by TTL and size', t => {
  const now = Date.parse('2026-10-13T12:00:00+07:00');
  const f = fixture(t, now);
  f.stats.record('p2', { eventId: 'future', timestamp: now + 3600000 });
  assert.equal(f.read().lastSolvedAt, now);
  const ids = {};
  for (let i = 0; i < EVENT_ID_LIMIT + 50; i++) ids['id' + i] = now - i;
  ids.old = now - EVENT_ID_TTL_MS - 1;
  const s = f.read(); s.embeddedEventIds = ids; fs.writeFileSync(f.file, JSON.stringify(s));
  f.stats.record('p2', { eventId: 'fresh' });
  const kept = f.read().embeddedEventIds;
  assert.equal(Object.keys(kept).length, EVENT_ID_LIMIT + 1);
  assert.ok(kept.fresh && kept.id0 && !kept.old && !kept['id' + (EVENT_ID_LIMIT + 49)]);
});

test('write failure returns null so the caller does not ACK the event', t => {
  const f = fixture(t, Date.now());
  fs.mkdirSync(f.file); // a directory where the file should be -> write fails
  assert.equal(f.stats.record('p1', { eventId: 'x' }), null);
});
