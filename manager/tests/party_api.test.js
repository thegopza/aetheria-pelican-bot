const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createPartyService, pickCandidates, channelTarget, normalizeStates, READ_JS } = require('../party_api');

const snap = (name, level, extra = {}) => Object.assign({ ok: true, name, level, mapId: 'm1', mapName: 'แมพ1', channel: 1, targetMap: 'แมพ1', botRunning: true, busy: [], partyKnown: true, party: null, invite: null, move: null, helpers: { moveToChannel: true, findLeast: true, setTargetFarmMap: true } }, extra);

test('pickCandidates: closest level first, skips assigned / offline / foreign parties, respects slots', () => {
  const parties = [{ id: 'a', leaderId: 'L', memberIds: [] }, { id: 'b', leaderId: 'X', memberIds: ['taken'] }];
  const states = new Map([
    ['L', snap('Lead', 50)],
    ['X', snap('Other', 50)],
    ['taken', snap('Taken', 50)],
    ['c1', snap('C1', 70)],
    ['c2', snap('C2', 48)],
    ['c3', snap('C3', 55)],
    ['off', null],
    ['foreign', snap('F', 50, { party: { leader: 'Stranger', members: [] } })],
    ['stale', snap('S', 49, { party: { leader: 'Other', members: [] } })]
  ]);
  const managed = new Set(['Lead', 'Other', 'Taken', 'C1', 'C2', 'C3', 'S']);
  assert.deepStrictEqual(pickCandidates(parties[0], parties, states, managed, 3, new Set()), ['stale', 'c2', 'c3']);
  assert.deepStrictEqual(pickCandidates(parties[0], parties, states, managed, 10, new Set(['stale'])), ['c2', 'c3', 'c1']);
  assert.deepStrictEqual(pickCandidates(parties[0], parties, states, managed, 0, new Set()), []);
});

test('channelTarget: only on the same map and a different CH', () => {
  assert.strictEqual(channelTarget(snap('L', 1, { channel: 5 }), snap('M', 1, { channel: 2 })), 5);
  assert.strictEqual(channelTarget(snap('L', 1, { channel: 5 }), snap('M', 1, { channel: 5 })), null);
  assert.strictEqual(channelTarget(snap('L', 1, { channel: 5 }), snap('M', 1, { channel: 2, mapId: 'm2' })), null);
});

test('READ_JS is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function('return ' + READ_JS));
});

test('normalizeStates drops a stale party the leader no longer has', () => {
  const st = new Map([
    ['L', snap('Lead', 50, { party: { leader: 'Lead', members: [{ name: 'Lead' }, { name: 'A' }] } })],
    ['A', snap('A', 50, { party: { leader: 'Lead', members: [] } })],
    ['B', snap('B', 50, { party: { leader: 'Lead', members: [] } })],
    ['C', snap('C', 50, { party: { leader: 'Stranger', members: [] } })]
  ]);
  normalizeStates(st);
  assert.ok(st.get('A').party);
  assert.strictEqual(st.get('B').party, null);
  assert.ok(st.get('C').party, 'unknown leader cannot be verified, keep it');
});

// Run READ_JS in a fake page to check the Plan Script rule
function readInPage({ base, job, cls, plan, enabled = true, state = null }) {
  const store = {};
  if (state) store['pelican_plan_state_Me_' + plan.id] = JSON.stringify(state);
  const me = { name: 'Me', level: base, jobLevel: job, classId: cls };
  const window = {
    __planScriptEnabled: enabled, __currentScriptPlan: plan,
    getGameRoom: () => ({ sessionId: 's', state: { mapId: 'm', displayName: 'M', channel: 3, players: { get: () => me } } }),
    getCharacterName: () => 'Me'
  };
  const ctx = vm.createContext({ window, document: { getElementById: () => null, body: { firstElementChild: null } }, localStorage: { getItem: k => store[k] || null }, JSON, Date, Number, String, Array, Object });
  return vm.runInContext(READ_JS, ctx);
}

test('plan rule: only unpassed Base/Job level triggers block, zeny/gear do not', () => {
  const plan = { id: 'p', name: 'Bard', class1Target: 'archer', class2Target: 'bard', triggers: [
    { id: 'b1', type: 'base_level', targetLevel: 20 }, { id: 'b2', type: 'base_level', targetLevel: 60 },
    { id: 'j1', type: 'job_level', targetLevel: 10, classId: 'novice' }, { id: 'j2', type: 'job_level', targetLevel: 50, classId: 'archer' },
    { id: 'j3', type: 'job_level', targetLevel: 40, classId: 'bard' }, { id: 'z', type: 'zeny', targetZeny: 999999999 }
  ] };
  // Lv99 bard job 50 with an empty plan state (plan loaded late) → everything passed
  assert.deepStrictEqual(readInPage({ base: 99, job: 50, cls: 'bard', plan }).plan.levelPending, []);
  // Archer Base 45 Job 30 → Base 60, Job 50 archer and Job 40 bard still to do
  assert.deepStrictEqual(readInPage({ base: 45, job: 30, cls: 'archer', plan }).plan.levelPending, ['Base 60', 'Job 50 archer', 'Job 40 bard']);
  // Level reached but the map step is still being retried → still blocked
  const planA = JSON.parse(JSON.stringify(plan)); planA.triggers[1].actions = [{ type: 'equip_item' }, { type: 'change_map' }];
  assert.deepStrictEqual(readInPage({ base: 99, job: 50, cls: 'bard', plan: planA, state: { done: {}, pending: { b2: { level: 60, actions: [1] } } } }).plan.levelPending, ['Base 60']);
  // Only a gear step left (map already done) → does not block
  assert.deepStrictEqual(readInPage({ base: 99, job: 50, cls: 'bard', plan: planA, state: { done: {}, pending: { b2: { level: 60, actions: [0] } } } }).plan.levelPending, []);
  // Plan Script switched off → no plan rule
  assert.strictEqual(readInPage({ base: 10, job: 1, cls: 'novice', plan, enabled: false }).plan, null);
});

test('pickCandidates skips characters still levelling with their plan', () => {
  const parties = [{ id: 'a', leaderId: 'L', memberIds: [] }];
  const states = new Map([
    ['L', snap('Lead', 99)],
    ['lv', snap('Levelling', 99, { plan: { levelPending: ['Base 60'] } })],
    ['ok', snap('Done', 90, { plan: { levelPending: [] } })]
  ]);
  assert.deepStrictEqual(pickCandidates(parties[0], parties, states, new Set(), 5, new Set()), ['ok']);
});

// ---- simulated game world -------------------------------------------------
function makeWorld(chars) {
  // chars: { profileId: { name, level, channel, mapId, full? } }
  const world = { chars, parties: {}, invites: {}, sent: [], moves: [], fullChannels: new Set(), least: 9 };
  const partyOf = name => Object.values(world.parties).find(p => p.members.includes(name));
  const partyView = name => {
    const p = partyOf(name); if (!p) return null;
    return { leader: p.leader, expMode: p.expMode, lootMode: p.lootMode, evenShareAllowed: true, levelRange: 10, maxMembers: 6,
      members: p.members.map(n => { const c = Object.values(chars).find(x => x.name === n); return { name: n, online: c ? c.online !== false : false, mapId: c ? c.mapId : null, channel: c ? c.channel : null, level: c ? c.level : 1 }; }) };
  };
  async function evalProfilePort(port, code) {
    const id = Object.keys(chars).find(k => chars[k].port === port);
    const c = chars[id];
    if (!c) return { success: false, error: 'ECONNREFUSED' };
    if (code === READ_JS) {
      return { success: true, result: snap(c.name, c.level, { channel: c.channel, mapId: c.mapId, mapName: c.mapId, targetMap: c.targetMap || c.mapId, party: partyView(c.name), invite: world.invites[c.name] ? { from: world.invites[c.name] } : null, plan: c.plan || null, follow: c.follow || null }) };
    }
    const m = code.match(/room\.send\('party', (\{.*?\})\);/s);
    if (m) {
      const msg = JSON.parse(m[1]);
      world.sent.push([c.name, msg]);
      if (msg.action === 'invite') {
        world.invites[msg.name] = c.name;
        if (!partyOf(c.name)) world.parties[c.name] = { leader: c.name, members: [c.name], expMode: 'individual', lootMode: 'personal' };
      } else if (msg.action === 'accept') {
        if (!/no-invite/.test(code) || world.invites[c.name]) {
          const lead = world.invites[c.name]; delete world.invites[c.name];
          if (lead && world.parties[lead]) world.parties[lead].members.push(c.name);
        }
      } else if (msg.action === 'settings') {
        Object.assign(world.parties[c.name], msg.expMode ? { expMode: msg.expMode } : {}, msg.lootMode ? { lootMode: msg.lootMode } : {});
      } else if (msg.action === 'leave') {
        const p = partyOf(c.name); if (p) { p.members = p.members.filter(n => n !== c.name); if (p.leader === c.name) delete world.parties[c.name]; }
      } else if (msg.action === 'kick') {
        const p = partyOf(c.name); if (p && p.leader === c.name) { p.members = p.members.filter(n => n !== msg.name); }
      }
      return { success: true, result: { success: true } };
    }
    if (code.includes('window.__targetFarmMap = map')) {
      c.targetMap = JSON.parse(code.match(/const map = (".*?");/)[1]);
      return { success: true, result: { success: true } };
    }
    if (code.includes('window.moveToChannel(')) {
      const ch = Number(code.match(/window\.moveToChannel\((\d+),/)[1]);
      world.moves.push([c.name, ch]);
      const ok = !world.fullChannels.has(ch);
      if (ok) c.channel = ch;
      return { success: true, result: { success: ok, channel: c.channel, error: ok ? null : 'CH full' } };
    }
    if (code.includes('findLeastPopulatedChannel()')) return { success: true, result: { success: true, channel: world.least } };
    if (code.includes(".follow-chip button")) {
      if (!c.follow) return { success: true, result: { success: false, error: 'no-follow' } };
      world.unfollowed = (world.unfollowed || []).concat(c.name); c.follow = null;
      return { success: true, result: { success: true } };
    }
    return { success: true, result: { success: true } };
  }
  return { world, evalProfilePort };
}

function service(chars, extra = {}) {
  const { world, evalProfilePort } = makeWorld(chars);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'party-test-'));
  const profiles = Object.keys(chars).map(id => ({ id, name: 'จอ ' + id, debugPort: chars[id].port }));
  const svc = createPartyService({
    loadProfiles: () => profiles, evalProfilePort, dataFile: path.join(dir, 'parties.json'),
    sleep: async () => {}, log: () => {}, timing: Object.assign({ inviteCooldownMs: 0, settingsCooldownMs: 0, mapCooldownMs: 0, channelCooldownMs: 0, fallbackCooldownMs: 0, disbandGapMs: 0, gatherCooldownMs: 0 }, extra)
  });
  return { svc, world, dir };
}

async function post(svc, url, body) {
  let out = null;
  const req = { method: 'POST', setEncoding() {}, on(ev, cb) { if (ev === 'data') cb(JSON.stringify(body || {})); if (ev === 'end') cb(); } };
  await svc.handleRoute(req, {}, url, j => { out = j; });
  return out;
}

test('tick: fills to 6 by level, invites + accepts, applies modes, no member in two parties', async () => {
  const chars = {};
  const levels = [50, 51, 49, 80, 52, 47, 60, 10, 50];
  levels.forEach((lv, i) => { chars['p' + i] = { name: 'C' + i, level: lv, channel: 1, mapId: 'm1', port: 1000 + i }; });
  const { svc, world } = service(chars);
  await post(svc, '/api/parties', { leaderId: 'p0' });
  await new Promise(r => setTimeout(r, 120));
  await svc.tick(); await svc.tick();
  const p1 = svc._parties()[0];
  assert.strictEqual(p1.memberIds.length, 5);
  assert.deepStrictEqual(p1.memberIds.slice().sort(), ['p1', 'p2', 'p4', 'p5', 'p8'].sort());
  assert.strictEqual(world.parties.C0.members.length, 6);
  assert.strictEqual(world.parties.C0.expMode, 'even-share');

  // Second party can't take anyone from the first
  await post(svc, '/api/parties', { leaderId: 'p6' });
  await svc.tick(); await svc.tick();
  const p2 = svc._parties()[1];
  assert.deepStrictEqual(p2.memberIds.slice().sort(), ['p3', 'p7'].sort());
  for (const id of p2.memberIds) assert.ok(!p1.memberIds.includes(id));

  // A leader already used can't lead again
  const dup = await post(svc, '/api/parties', { leaderId: 'p1' });
  assert.strictEqual(dup.success, false);

  // Loot mode change from the web page reaches the game
  await post(svc, '/api/parties/' + p1.id + '/settings', { lootMode: 'round-robin' });
  await svc.tick();
  assert.strictEqual(world.parties.C0.lootMode, 'round-robin');
});

test('tick: members follow leader map and CH like the consolidation; full CH → leader moves to least populated CH', async () => {
  const chars = {
    L: { name: 'Lead', level: 50, channel: 3, mapId: 'm1', port: 2000 },
    A: { name: 'A', level: 50, channel: 1, mapId: 'm1', port: 2001 },
    B: { name: 'B', level: 50, channel: 1, mapId: 'm2', port: 2002 },
    D: { name: 'D', level: 50, channel: 5, mapId: 'm1', port: 2003 }
  };
  const { svc, world } = service(chars);
  world.fullChannels.add(3);
  world.least = 9;
  await post(svc, '/api/parties', { leaderId: 'L' });
  await new Promise(r => setTimeout(r, 120));
  // D joins the party but its plan still has Base/Job levels to do
  await svc.tick();
  chars.D.plan = { levelPending: ['Base 60'] };
  for (let i = 0; i < 6; i++) { await svc.tick(); await new Promise(r => setTimeout(r, 20)); }
  assert.strictEqual(chars.B.targetMap, 'm1', 'member B gets the leader farm map');
  assert.strictEqual(chars.L.channel, 9, 'leader moved to the least populated CH');
  assert.strictEqual(chars.A.channel, 9, 'member followed the leader to the new CH');
  assert.strictEqual(chars.D.channel, 5, 'member still levelling with its plan is not moved');
  assert.strictEqual(chars.D.targetMap, undefined, 'and its farm map is left to the plan');
  // Moves are one at a time: A tried CH 3 first, then the leader, then A again
  const order = world.moves.map(m => m.join('>'));
  assert.deepStrictEqual(order.slice(0, 3), ['A>3', 'Lead>9', 'A>9']);
  const view = svc.view().parties[0];
  assert.strictEqual(view.members.find(m => m.id === 'D').status, 'plan');
});

test('delete disbands the party in game', async () => {
  const chars = { L: { name: 'Lead', level: 50, channel: 1, mapId: 'm1', port: 3000 }, A: { name: 'A', level: 51, channel: 1, mapId: 'm1', port: 3001 } };
  const { svc, world } = service(chars);
  await post(svc, '/api/parties', { leaderId: 'L' });
  await new Promise(r => setTimeout(r, 120));
  await svc.tick();
  assert.strictEqual(world.parties.Lead.members.length, 2);
  await post(svc, '/api/parties/' + svc._parties()[0].id + '/delete', {});
  assert.strictEqual(svc._parties().length, 0);
  assert.ok(!world.parties.Lead);
});

test('tick: members following the leader with the game follow get it cancelled (they farm on their own)', async () => {
  const chars = { L: { name: 'Lead', level: 50, channel: 1, mapId: 'm1', port: 4000 }, A: { name: 'A', level: 51, channel: 1, mapId: 'm1', port: 4001 }, B: { name: 'B', level: 50, channel: 1, mapId: 'm1', port: 4002 } };
  const { svc, world } = service(chars, { unfollowCooldownMs: 0 });
  await post(svc, '/api/parties', { leaderId: 'L' });
  await new Promise(r => setTimeout(r, 120));
  await svc.tick();
  chars.A.follow = 'Lead'; // e.g. after รวมทีม
  chars.L.follow = 'Someone'; // the leader is not touched
  await svc.tick();
  assert.deepStrictEqual(world.unfollowed, ['A']);
  assert.strictEqual(chars.A.follow, null);
  assert.strictEqual(chars.L.follow, 'Someone');
});

test('tick: kicks offline unassigned members from 6/6 in-game party so new members can be invited and accepted', async () => {
  const chars = {
    L: { name: 'G4YSuuuuu', level: 80, channel: 1, mapId: 'm1', port: 5000 },
    M1: { name: 'Member1', level: 80, channel: 1, mapId: 'm1', port: 5001 },
    M2: { name: 'Member2', level: 80, channel: 1, mapId: 'm1', port: 5002 },
    M3: { name: 'Member3', level: 80, channel: 1, mapId: 'm1', port: 5003 },
    M4: { name: 'SuuuG4y', level: 80, channel: 1, mapId: 'm1', port: 5004 }
  };
  const { svc, world } = service(chars);
  // Pre-seed leader's in-game party as 6/6 full with 2 offline dropped ghosts
  world.parties['G4YSuuuuu'] = {
    leader: 'G4YSuuuuu',
    members: ['G4YSuuuuu', 'Member1', 'Member2', 'Member3', 'OfflineGhost1', 'OfflineGhost2'],
    expMode: 'even-share',
    lootMode: 'personal'
  };
  await post(svc, '/api/parties', { leaderId: 'L', memberIds: ['M1', 'M2', 'M3', 'M4'], autoFill: true });
  await new Promise(r => setTimeout(r, 120));
  await svc.tick();
  assert.ok(!world.parties['G4YSuuuuu'].members.includes('OfflineGhost1'), 'should kick OfflineGhost1');
  assert.ok(!world.parties['G4YSuuuuu'].members.includes('OfflineGhost2'), 'should kick OfflineGhost2');
  assert.ok(world.parties['G4YSuuuuu'].members.includes('SuuuG4y'), 'should invite and accept SuuuG4y after freeing slots');
});

