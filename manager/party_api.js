// manager/party_api.js — Party system: Manager forms in-game parties from its own clients.
//
//   GET  /api/parties                      → parties + live status + client list (for the leader picker)
//   POST /api/parties                      { leaderId }            → create a party
//   POST /api/parties/:id/settings         { expMode?, lootMode?, syncMap?, autoFill? }
//   POST /api/parties/:id/remove-member    { profileId }           → kick + never auto-pick again for this party
//   POST /api/parties/:id/summon                                   → leader uses the game's "รวมทีม"
//   POST /api/parties/:id/delete                                   → disband (members leave, then leader)
//
// Every ~10 s for each party the loop:
//   1. reads leader / members / free clients (char name, level, map, CH, in-game party, pending invite)
//   2. tops the party up to 6 (leader included) with free clients whose level is closest to the leader
//   3. leader sends `invite`, the member answers `accept` through the Manager (no need for AUTO acceptParty)
//   4. leader applies the EXP / loot mode chosen on the web page
//   5. members farm the leader's map; on that map they move to the leader's CH. When a member can't get into
//      that CH (full / refused) the leader moves to the least populated CH and everyone follows.
//
// The current in-game party is read from the game's own store through React's useSyncExternalStore getters
// (`()=>Y.party`, `()=>Y.invite`), so it also works right after a page reload. All commands go through
// evalProfilePort (POST). Game helpers (moveToChannel, setTargetFarmMap, …) come from the bot; when they are
// missing the related step is skipped and shown as a status instead.

const fs = require('fs');
const path = require('path');

const MAX_MEMBERS = 6;
const EXP_MODES = ['individual', 'even-share'];
const LOOT_MODES = ['personal', 'round-robin', 'leader'];
const BUSY_FLAGS = ['__isNavigating', '__isWalkingToMap', '__isShopping', '__isRecovering', '__isConsolidating',
  '__isChangingJob', '__isAutoSellingNow', '__isManualSelling', '__isStoring', '__isGearRefining',
  '__isMarketScanning', '__isWeightScrollBusy'];

const TIMING = {
  tickMs: 10000,
  inviteCooldownMs: 20000,
  inviteMaxAttempts: 4,
  excludeAfterFailMs: 10 * 60 * 1000,
  dropOfflineAfterMs: 10 * 60 * 1000,
  settingsCooldownMs: 15000,
  mapCooldownMs: 60000,
  channelCooldownMs: 45000,
  channelFailsBeforeFallback: 2,
  fallbackCooldownMs: 3 * 60 * 1000,
  acceptDelayMs: 1500,
  leaveCooldownMs: 30000,
  disbandGapMs: 1200
};

// ---------------------------------------------------------------- in-page snippets
const READ_JS = `(() => {
  const findGetters = () => {
    const out = {};
    try {
      const rootEl = document.getElementById('root') || document.body.firstElementChild;
      const key = rootEl && Object.keys(rootEl).find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
      if (!key) return out;
      let start = rootEl[key]; if (start && start.stateNode && start.stateNode.current) start = start.stateNode.current;
      const stack = [start]; let n = 0;
      while (stack.length && n++ < 100000 && !(out.party && out.invite)) {
        const f = stack.pop(); if (!f) continue;
        let h = f.memoizedState, g = 0;
        while (h && typeof h === 'object' && g++ < 80) {
          const q = h.queue;
          if (q && typeof q.getSnapshot === 'function') {
            const src = String(q.getSnapshot).replace(/\\s+/g, '');
            if (!out.party && /^\\(\\)=>[A-Za-z_$][\\w$]*\\.party$/.test(src)) out.party = q.getSnapshot;
            if (!out.invite && /^\\(\\)=>[A-Za-z_$][\\w$]*\\.invite$/.test(src)) out.invite = q.getSnapshot;
          }
          h = h.next;
        }
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    } catch (e) {}
    return out;
  };
  let g = window.__pmPartyGetters;
  if (!g || !g.party || !g.invite) { g = findGetters(); window.__pmPartyGetters = g; }
  const room = typeof window.getGameRoom === 'function' ? window.getGameRoom() : null;
  if (!room || !room.state) return { ok: false, reason: 'not-in-game' };
  let me = null; try { me = room.state.players.get(room.sessionId); } catch (e) {}
  let live = null; try { live = typeof window.__getClientLiveState === 'function' ? window.__getClientLiveState() : null; } catch (e) {}
  let party = null, invite = null;
  try { party = g.party ? g.party() : null; } catch (e) {}
  try { invite = g.invite ? g.invite() : null; } catch (e) {}
  const busy = ${JSON.stringify(BUSY_FLAGS)}.filter(k => window[k] === true);
  return {
    ok: true,
    name: (me && me.name) || (live && live.charName) || null,
    level: (me && me.level) || (live && live.baseLv) || null,
    classId: me ? me.classId : null,
    mapId: room.state.mapId || null,
    mapName: room.state.displayName || null,
    channel: typeof room.state.channel === 'number' ? room.state.channel : null,
    targetMap: window.__targetFarmMap || (live && live.targetMap) || null,
    botRunning: window.__isBotRunning === true,
    busy,
    partyKnown: !!g.party,
    party: party ? {
      leader: party.leader, expMode: party.expMode, lootMode: party.lootMode,
      evenShareAllowed: party.evenShareAllowed !== false, levelRange: party.levelRange, maxMembers: party.maxMembers || 6,
      members: (party.members || []).map(m => ({ name: m.name, online: m.online !== false, mapId: m.mapId, mapName: m.mapName, channel: m.channel, level: m.level }))
    } : null,
    invite: invite && invite.kind === 'party' && (!invite.expiresAt || invite.expiresAt > Date.now()) ? { from: invite.from, expiresAt: invite.expiresAt } : null,
    move: window.__pmPartyMove || null,
    helpers: { moveToChannel: typeof window.moveToChannel === 'function', findLeast: typeof window.findLeastPopulatedChannel === 'function', setTargetFarmMap: typeof window.setTargetFarmMap === 'function' }
  };
})()`;

const sendPartyJs = (msg, guard) => `(() => {
  const room = typeof window.getGameRoom === 'function' ? window.getGameRoom() : null;
  if (!room) return { success: false, error: 'not-in-game' };
  ${guard || ''}
  room.send('party', ${JSON.stringify(msg)});
  return { success: true };
})()`;

const ACTIONS = {
  invite: name => sendPartyJs({ action: 'invite', name }),
  // Only accept an invite that really comes from our leader
  accept: leaderName => sendPartyJs({ action: 'accept' }, `
    const g = window.__pmPartyGetters; let inv = null; try { inv = g && g.invite ? g.invite() : null; } catch (e) {}
    if (!inv || inv.kind !== 'party' || inv.from !== ${JSON.stringify(leaderName)}) return { success: false, error: 'no-invite' };`),
  leave: () => sendPartyJs({ action: 'leave' }),
  kick: name => sendPartyJs({ action: 'kick', name }),
  summon: () => sendPartyJs({ action: 'summon' }),
  settings: patch => sendPartyJs(Object.assign({ action: 'settings' }, patch)),
  setMap: (map, walkNow) => `(() => {
    const map = ${JSON.stringify(map)};
    if (typeof window.clearSafeMap === 'function') window.clearSafeMap('ปาร์ตี้: ตามแมพหัวตี้');
    window.__targetFarmMap = map;
    try { localStorage.setItem('pelican_farm_map', map); } catch (e) {}
    const sel = document.getElementById('p-target-map-select'); if (sel) sel.value = map;
    if (typeof window.setTargetFarmMap === 'function') window.setTargetFarmMap(map, ${walkNow ? 'true' : 'false'});
    return { success: true };
  })()`,
  // Fire and forget: moveToChannel can wait up to ~90 s for cooldown / a free slot
  moveChannel: ch => `(() => {
    if (typeof window.moveToChannel !== 'function') return { success: false, error: 'no-helper' };
    const cur = window.__pmPartyMove;
    if (cur && !cur.done && Date.now() - cur.at < 120000) return { success: true, already: true };
    const st = { ch: ${Number(ch)}, at: Date.now(), done: false, ok: null };
    window.__pmPartyMove = st;
    Promise.resolve().then(() => window.moveToChannel(${Number(ch)}, 90000)).then(r => {
      const room = window.getGameRoom && window.getGameRoom();
      st.ok = !!(room && room.state && room.state.channel === st.ch) || r === true;
      st.done = true;
    }).catch(e => { st.ok = false; st.done = true; st.error = String(e && e.message || e); });
    return { success: true };
  })()`,
  leastChannel: () => `(async () => {
    if (typeof window.findLeastPopulatedChannel !== 'function') return { success: false, error: 'no-helper' };
    let r = await window.findLeastPopulatedChannel();
    const ch = typeof r === 'number' ? r : (r && (r.channel != null ? r.channel : r.ch));
    return typeof ch === 'number' ? { success: true, channel: ch } : { success: false, error: 'no-channel' };
  })()`
};

// ---------------------------------------------------------------- pure helpers (unit-tested)
function assignedIds(parties) {
  const s = new Set();
  for (const p of parties) { s.add(p.leaderId); for (const id of p.memberIds || []) s.add(id); }
  return s;
}

function inGameMemberNames(snap) {
  return snap && snap.party ? snap.party.members.map(m => m.name) : [];
}

// Pick free clients for `party`, closest level to the leader first.
// states: Map<profileId, snapshot|null>; managedNames: Set of char names that belong to this Manager.
function pickCandidates(party, parties, states, managedNames, slots, excluded) {
  if (slots <= 0) return [];
  const leaderSnap = states.get(party.leaderId);
  if (!leaderSnap || !leaderSnap.ok || !leaderSnap.name) return [];
  const taken = assignedIds(parties);
  const out = [];
  for (const [id, s] of states) {
    if (taken.has(id) || (excluded && excluded.has(id))) continue;
    if (!s || !s.ok || !s.name || typeof s.level !== 'number') continue;
    if (s.party) {
      // In someone else's party: only usable when that party is ours (stale bot party) or led by our leader
      const lead = s.party.leader;
      if (lead !== leaderSnap.name && !managedNames.has(lead)) continue;
    }
    out.push({ id, diff: Math.abs(s.level - leaderSnap.level), level: s.level, name: s.name });
  }
  out.sort((a, b) => a.diff - b.diff || b.level - a.level || a.name.localeCompare(b.name));
  return out.slice(0, slots).map(c => c.id);
}

// Which CH should a member move to? null = stay.
function channelTarget(leaderSnap, memberSnap) {
  if (!leaderSnap || !memberSnap || !leaderSnap.ok || !memberSnap.ok) return null;
  if (!leaderSnap.mapId || memberSnap.mapId !== leaderSnap.mapId) return null;
  if (typeof leaderSnap.channel !== 'number' || memberSnap.channel === leaderSnap.channel) return null;
  return leaderSnap.channel;
}

function sanitizeParty(p) {
  return {
    id: String(p.id),
    leaderId: String(p.leaderId),
    memberIds: Array.isArray(p.memberIds) ? p.memberIds.map(String).slice(0, MAX_MEMBERS - 1) : [],
    excludedIds: Array.isArray(p.excludedIds) ? p.excludedIds.map(String) : [],
    expMode: EXP_MODES.includes(p.expMode) ? p.expMode : 'even-share',
    lootMode: LOOT_MODES.includes(p.lootMode) ? p.lootMode : 'personal',
    syncMap: p.syncMap !== false,
    autoFill: p.autoFill !== false,
    createdAt: Number(p.createdAt) || Date.now()
  };
}

// After a CH / map change the game joins a new room and may keep the old party object in its store even
// though the server already removed the player. Cross-check against the leader's own view when we can see it.
function normalizeStates(states) {
  const byName = new Map();
  for (const s of states.values()) if (s && s.ok && s.name) byName.set(s.name, s);
  for (const s of states.values()) {
    if (!s || !s.ok || !s.party || s.party.leader === s.name) continue;
    const lead = byName.get(s.party.leader);
    if (!lead) continue; // leader not one of ours — can't verify
    const leads = lead.party && lead.party.leader === lead.name;
    if (!leads || !lead.party.members.some(m => m.name === s.name)) { s.party = null; s.partyStale = true; }
  }
  return states;
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.setEncoding && req.setEncoding('utf8');
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve(null); } });
  });
}

// ---------------------------------------------------------------- service
function createPartyService(opts) {
  const { loadProfiles, evalProfilePort } = opts;
  const dataFile = opts.dataFile || path.join(__dirname, 'data', 'parties.json');
  const isBusy = opts.isBusy || (() => false);
  const now = opts.now || (() => Date.now());
  const sleep = opts.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const log = opts.log || ((...a) => console.log('[Party]', ...a));
  const T = Object.assign({}, TIMING, opts.timing || {});

  let parties = [];
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    parties = (Array.isArray(raw) ? raw : raw.parties || []).map(sanitizeParty);
  } catch (e) { parties = []; }

  const runtime = new Map();     // partyId -> { status, notes, lastTickAt, fallbackAt, ... }
  const memberRt = new Map();    // `${partyId}:${profileId}` -> counters
  const tempExcluded = new Map(); // `${partyId}:${profileId}` -> until
  let states = new Map();        // profileId -> snapshot | null
  let statesAt = 0;
  let ticking = false;
  let timer = null;

  function save() {
    try {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      const tmp = dataFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ parties }, null, 2));
      fs.renameSync(tmp, dataFile);
    } catch (e) { log('save failed', e.message); }
  }

  const mrt = (pid, id) => {
    const k = pid + ':' + id;
    if (!memberRt.has(k)) memberRt.set(k, { inviteAt: 0, inviteAttempts: 0, mapAt: 0, chAt: 0, chFails: 0, lastMoveAt: 0, leaveAt: 0, seenAt: now() });
    return memberRt.get(k);
  };
  const prt = pid => {
    if (!runtime.has(pid)) runtime.set(pid, { notes: [], settingsAt: 0, fallbackAt: 0, leaveAt: 0, lastTickAt: 0 });
    return runtime.get(pid);
  };

  async function evalOk(port, code, timeoutMs) {
    const r = await evalProfilePort(port, code, timeoutMs || 6000);
    const res = r && r.result;
    return { ok: Boolean(r && r.success !== false && res && res.success !== false), result: res, error: (res && res.error) || (r && r.error) || null };
  }

  async function refreshStates(force) {
    if (!force && now() - statesAt < 4000) return states;
    const profiles = loadProfiles();
    const next = new Map();
    await Promise.all(profiles.map(async p => {
      if (!p.debugPort) { next.set(p.id, null); return; }
      const r = await evalProfilePort(p.debugPort, READ_JS, 5000);
      const s = r && r.success !== false && r.result && typeof r.result === 'object' ? r.result : null;
      next.set(p.id, s && s.ok ? s : (s ? s : null));
    }));
    states = normalizeStates(next);
    statesAt = now();
    return states;
  }

  function profileMap() {
    const m = new Map();
    for (const p of loadProfiles()) m.set(p.id, p);
    return m;
  }

  function managedNameSet() {
    const s = new Set();
    for (const st of states.values()) if (st && st.name) s.add(st.name);
    for (const p of loadProfiles()) if (p.lastCharName) s.add(p.lastCharName);
    return s;
  }

  async function act(profile, code, label, timeoutMs) {
    if (!profile || !profile.debugPort) return { ok: false, error: 'offline' };
    const r = await evalOk(profile.debugPort, code, timeoutMs);
    if (!r.ok) log(label, profile.name || profile.id, 'failed:', r.error);
    return r;
  }

  async function tickParty(party, profiles) {
    const rt = prt(party.id);
    const notes = [];
    rt.lastTickAt = now();
    const leaderP = profiles.get(party.leaderId);
    const L = states.get(party.leaderId);
    if (!leaderP) { rt.notes = ['ไม่พบโปรไฟล์หัวตี้แล้ว']; return; }
    if (!L || !L.ok || !L.name) { rt.notes = ['หัวตี้ออฟไลน์หรือยังไม่เข้าเกม']; return; }
    if (!L.partyKnown) notes.push('อ่านสถานะปาร์ตี้ในเกมไม่ได้ (หน้าเกมอาจยังโหลดไม่เสร็จ)');
    const managed = managedNameSet();

    // Leader stuck in another (stale bot) party → leave it first
    if (L.party && L.party.leader !== L.name) {
      if (managed.has(L.party.leader)) {
        if (now() - rt.leaveAt >= T.leaveCooldownMs) { rt.leaveAt = now(); await act(leaderP, ACTIONS.leave(), 'leader-leave'); }
        rt.notes = notes.concat('หัวตี้อยู่ในตี้เก่าของ ' + L.party.leader + ' — กำลังออกจากตี้นั้น');
      } else {
        rt.notes = notes.concat('หัวตี้อยู่ในตี้ของผู้เล่นอื่น (' + L.party.leader + ') — ออกจากตี้นั้นก่อน');
      }
      return;
    }

    // Drop members that have been offline for a long time / unknown profiles
    const keep = [];
    for (const id of party.memberIds) {
      if (!profiles.has(id)) continue;
      const s = states.get(id), m = mrt(party.id, id);
      if (s && s.ok && s.name) m.seenAt = now();
      if (now() - m.seenAt >= T.dropOfflineAfterMs) { notes.push('ปลดสมาชิกที่ออฟไลน์นาน: ' + (profiles.get(id).name || id)); continue; }
      keep.push(id);
    }
    let changed = keep.length !== party.memberIds.length;
    party.memberIds = keep;

    // Top up to 6 (leader included)
    if (party.autoFill) {
      const excluded = new Set(party.excludedIds);
      for (const [k, until] of tempExcluded) {
        if (until < now()) { tempExcluded.delete(k); continue; }
        const [pid, id] = k.split(':'); if (pid === party.id) excluded.add(id);
      }
      const inGameCount = L.party ? L.party.members.length : 1;
      const managedInGame = L.party ? L.party.members.filter(m => managed.has(m.name)).length : 1;
      const outsiders = Math.max(0, inGameCount - managedInGame);
      const slots = MAX_MEMBERS - 1 - party.memberIds.length - outsiders;
      const picks = pickCandidates(party, parties, states, managed, slots, excluded);
      if (picks.length) { party.memberIds.push(...picks); changed = true; }
    }
    if (changed) save();

    const inGame = new Set(inGameMemberNames(L));
    const isLeader = !L.party || L.party.leader === L.name;
    const partyFull = L.party && L.party.members.length >= (L.party.maxMembers || MAX_MEMBERS);

    // Invites
    for (const id of party.memberIds) {
      const P = profiles.get(id), S = states.get(id), m = mrt(party.id, id);
      if (!S || !S.ok || !S.name) continue;
      if (inGame.has(S.name)) { m.inviteAttempts = 0; continue; }
      if (S.party && S.party.leader !== L.name) {
        if (managed.has(S.party.leader) && now() - m.leaveAt >= T.leaveCooldownMs) {
          m.leaveAt = now(); await act(P, ACTIONS.leave(), 'member-leave');
        }
        continue;
      }
      if (S.invite && S.invite.from === L.name) { await act(P, ACTIONS.accept(L.name), 'accept'); continue; }
      if (!isLeader || partyFull) continue;
      if (now() - m.inviteAt < T.inviteCooldownMs) continue;
      if (m.inviteAttempts >= T.inviteMaxAttempts) {
        tempExcluded.set(party.id + ':' + id, now() + T.excludeAfterFailMs);
        party.memberIds = party.memberIds.filter(x => x !== id);
        m.inviteAttempts = 0;
        notes.push('ชวน ' + S.name + ' ไม่สำเร็จหลายครั้ง — ข้ามไปก่อน 10 นาที');
        save();
        continue;
      }
      m.inviteAt = now(); m.inviteAttempts++;
      const inv = await act(leaderP, ACTIONS.invite(S.name), 'invite');
      if (inv.ok) {
        await sleep(T.acceptDelayMs);
        await act(P, ACTIONS.accept(L.name), 'accept');
      }
    }

    // EXP / loot mode (leader only)
    if (L.party && L.party.leader === L.name && now() - rt.settingsAt >= T.settingsCooldownMs) {
      if (L.party.expMode !== party.expMode) {
        if (party.expMode === 'even-share' && !L.party.evenShareAllowed) {
          notes.push('แชร์ EXP ไม่ได้: เลเวลสมาชิกห่างกันเกิน ' + (L.party.levelRange || '?'));
        } else { rt.settingsAt = now(); await act(leaderP, ACTIONS.settings({ expMode: party.expMode }), 'exp-mode'); }
      }
      if (L.party.lootMode !== party.lootMode) { rt.settingsAt = now(); await act(leaderP, ACTIONS.settings({ lootMode: party.lootMode }), 'loot-mode'); }
    }

    // Same map + same CH as the leader
    if (party.syncMap) {
      const leaderMap = L.targetMap || L.mapName;
      let needFallback = false;
      for (const id of party.memberIds) {
        const P = profiles.get(id), S = states.get(id), m = mrt(party.id, id);
        if (!S || !S.ok || !S.name || !inGame.has(S.name)) continue;
        if (S.move && S.move.done && S.move.at > m.lastMoveAt) {
          m.lastMoveAt = S.move.at;
          if (S.move.ch === L.channel && S.move.ok === false) m.chFails++;
          else if (S.move.ok) m.chFails = 0;
        }
        if (m.chFails >= T.channelFailsBeforeFallback) needFallback = true;
        if (S.busy && S.busy.length) continue;
        if (leaderMap && S.targetMap !== leaderMap && S.helpers && S.helpers.setTargetFarmMap && now() - m.mapAt >= T.mapCooldownMs) {
          m.mapAt = now();
          await act(P, ACTIONS.setMap(leaderMap, S.botRunning), 'set-map');
        }
        const ch = channelTarget(L, S);
        if (ch != null && S.helpers && S.helpers.moveToChannel && now() - m.chAt >= T.channelCooldownMs && !(S.move && !S.move.done)) {
          m.chAt = now();
          await act(P, ACTIONS.moveChannel(ch), 'move-ch');
        }
      }
      if (needFallback && now() - rt.fallbackAt >= T.fallbackCooldownMs && !(L.busy && L.busy.length) && !(L.move && !L.move.done)) {
        rt.fallbackAt = now();
        const least = await act(leaderP, ACTIONS.leastChannel(), 'least-ch', 15000);
        const ch = least.ok && least.result ? least.result.channel : null;
        if (typeof ch === 'number' && ch !== L.channel) {
          await act(leaderP, ACTIONS.moveChannel(ch), 'leader-move-ch');
          notes.push('สมาชิกเข้า CH ' + L.channel + ' ไม่ได้ — หัวตี้ย้ายไป CH ' + ch + ' (คนน้อยสุด) ให้ทุกจอตามไป');
        } else {
          notes.push('สมาชิกเข้า CH ' + L.channel + ' ไม่ได้ และหา CH ที่ว่างกว่าไม่ได้');
        }
        for (const id of party.memberIds) mrt(party.id, id).chFails = 0;
      }
    }
    rt.notes = notes;
  }

  async function tick() {
    if (ticking) return;
    if (!parties.length) return;
    if (isBusy()) return;
    ticking = true;
    try {
      await refreshStates(true);
      const profiles = profileMap();
      for (const party of parties.slice()) {
        if (!parties.includes(party)) continue;
        try { await tickParty(party, profiles); } catch (e) { log('tick error', party.id, e.message); prt(party.id).notes = ['ผิดพลาด: ' + e.message]; }
      }
    } finally { ticking = false; }
  }

  function memberView(partyId, id, profiles, leaderSnap) {
    const P = profiles.get(id), S = states.get(id);
    const inGame = new Set(inGameMemberNames(leaderSnap));
    let status = 'offline', text = 'ออฟไลน์';
    if (S && S.ok && S.name) {
      if (inGame.has(S.name)) {
        const same = leaderSnap && S.mapId === leaderSnap.mapId && S.channel === leaderSnap.channel;
        status = same ? 'joined' : 'apart';
        text = same ? 'อยู่ด้วยกัน' : (S.mapId !== (leaderSnap && leaderSnap.mapId) ? 'กำลังไปแมพหัวตี้' : 'กำลังย้าย CH');
      } else if (S.party && leaderSnap && S.party.leader !== leaderSnap.name) { status = 'other'; text = 'อยู่ตี้อื่น'; }
      else { status = 'inviting'; text = 'กำลังชวน'; }
    } else if (S && S.reason === 'not-in-game') { status = 'offline'; text = 'ยังไม่เข้าเกม'; }
    return {
      id, profileName: P ? P.name : id, charName: (S && S.name) || (P && P.lastCharName) || null,
      charClass: P ? P.lastCharClass || null : null, level: S && S.level, mapName: S && S.mapName, channel: S && S.channel,
      status, statusText: text
    };
  }

  function view() {
    const profiles = profileMap();
    const taken = assignedIds(parties);
    const list = parties.map((p, i) => {
      const L = states.get(p.leaderId);
      const rt = prt(p.id);
      return {
        id: p.id, index: i + 1, expMode: p.expMode, lootMode: p.lootMode, syncMap: p.syncMap, autoFill: p.autoFill,
        leader: Object.assign(memberView(p.id, p.leaderId, profiles, L), L && L.ok ? { status: 'leader', statusText: L.party && L.party.leader === L.name ? 'หัวตี้' : 'หัวตี้ (ยังไม่มีสมาชิก)' } : {}),
        members: p.memberIds.map(id => memberView(p.id, id, profiles, L)),
        count: 1 + p.memberIds.length, max: MAX_MEMBERS,
        inGame: L && L.party ? { expMode: L.party.expMode, lootMode: L.party.lootMode, evenShareAllowed: L.party.evenShareAllowed, levelRange: L.party.levelRange, size: L.party.members.length } : null,
        notes: rt.notes || [], lastTickAt: rt.lastTickAt
      };
    });
    const clients = [...profiles.values()].map(p => {
      const S = states.get(p.id);
      return { id: p.id, name: p.name, charName: (S && S.name) || p.lastCharName || null, charClass: p.lastCharClass || null,
        level: S && S.ok ? S.level : null, online: !!(S && S.ok && S.name), inGameParty: !!(S && S.party), assigned: taken.has(p.id),
        mapName: S && S.mapName, channel: S && S.channel };
    });
    return { success: true, parties: list, clients, statesAt, maxMembers: MAX_MEMBERS };
  }

  async function disband(party) {
    const profiles = profileMap();
    let leaderName = null;
    // Members first (otherwise the game hands leadership to a member and the party lives on), then the leader.
    // The server drops rapid back-to-back party changes, so space them out and retry a few rounds.
    for (let round = 0; round < 4; round++) {
      await refreshStates(true);
      const L = states.get(party.leaderId);
      if (L && L.name) leaderName = L.name;
      if (!leaderName) return;
      const stillIn = party.memberIds.filter(id => { const S = states.get(id); return S && S.ok && S.party && S.party.leader === leaderName; });
      const leaderLeads = L && L.ok && L.party && L.party.leader === leaderName;
      if (!stillIn.length && !leaderLeads) return;
      for (const id of stillIn) { await act(profiles.get(id), ACTIONS.leave(), 'disband-leave'); await sleep(T.disbandGapMs); }
      if (leaderLeads && !stillIn.length) { await act(profiles.get(party.leaderId), ACTIONS.leave(), 'disband-leader'); await sleep(T.disbandGapMs); }
    }
  }

  async function handleRoute(req, res, pathname, sendJSON) {
    if (!pathname.startsWith('/api/parties')) return false;
    if (pathname === '/api/parties' && req.method === 'GET') {
      await refreshStates(false);
      sendJSON(view());
      return true;
    }
    if (pathname === '/api/parties' && req.method === 'POST') {
      const body = await readBody(req);
      const leaderId = body && String(body.leaderId || '');
      const profiles = profileMap();
      if (!leaderId || !profiles.has(leaderId)) { sendJSON({ success: false, error: 'ไม่พบจอที่เลือกเป็นหัวตี้' }, 400); return true; }
      if (assignedIds(parties).has(leaderId)) { sendJSON({ success: false, error: 'จอนี้อยู่ในตี้อื่นแล้ว' }, 409); return true; }
      const party = sanitizeParty({ id: 'party_' + now().toString(36) + Math.random().toString(36).slice(2, 6), leaderId,
        expMode: body.expMode, lootMode: body.lootMode, createdAt: now() });
      parties.push(party);
      save();
      setTimeout(() => tick().catch(() => {}), 50);
      sendJSON(Object.assign(view(), { created: party.id }));
      return true;
    }
    const m = pathname.match(/^\/api\/parties\/([^/]+)\/(settings|remove-member|summon|delete)$/);
    if (!m || req.method !== 'POST') return false;
    const party = parties.find(p => p.id === m[1]);
    if (!party) { sendJSON({ success: false, error: 'ไม่พบตี้นี้' }, 404); return true; }
    const body = (await readBody(req)) || {};
    if (m[2] === 'settings') {
      if (body.expMode !== undefined) { if (!EXP_MODES.includes(body.expMode)) { sendJSON({ success: false, error: 'โหมด EXP ไม่ถูกต้อง' }, 400); return true; } party.expMode = body.expMode; }
      if (body.lootMode !== undefined) { if (!LOOT_MODES.includes(body.lootMode)) { sendJSON({ success: false, error: 'โหมดไอเทมไม่ถูกต้อง' }, 400); return true; } party.lootMode = body.lootMode; }
      if (body.syncMap !== undefined) party.syncMap = !!body.syncMap;
      if (body.autoFill !== undefined) party.autoFill = !!body.autoFill;
      prt(party.id).settingsAt = 0;
      save();
      setTimeout(() => tick().catch(() => {}), 50);
      sendJSON(view());
      return true;
    }
    if (m[2] === 'remove-member') {
      const id = String(body.profileId || '');
      if (!party.memberIds.includes(id)) { sendJSON({ success: false, error: 'จอนี้ไม่ได้อยู่ในตี้' }, 400); return true; }
      party.memberIds = party.memberIds.filter(x => x !== id);
      if (!party.excludedIds.includes(id)) party.excludedIds.push(id);
      save();
      const profiles = profileMap();
      const S = states.get(id), L = states.get(party.leaderId);
      if (S && S.name && L && L.party && L.party.leader === L.name && inGameMemberNames(L).includes(S.name)) {
        await act(profiles.get(party.leaderId), ACTIONS.kick(S.name), 'kick');
      }
      sendJSON(view());
      return true;
    }
    if (m[2] === 'summon') {
      const r = await act(profileMap().get(party.leaderId), ACTIONS.summon(), 'summon');
      sendJSON(Object.assign(view(), { success: r.ok, error: r.ok ? null : 'หัวตี้ออฟไลน์หรือไม่ตอบสนอง' }));
      return true;
    }
    if (m[2] === 'delete') {
      parties = parties.filter(p => p !== party);
      save();
      try { await disband(party); } catch (e) { log('disband error', e.message); }
      runtime.delete(party.id);
      sendJSON(view());
      return true;
    }
    return false;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => tick().catch(e => log('tick failed', e.message)), T.tickMs);
    if (timer.unref) timer.unref();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  return { handleRoute, tick, start, stop, view, _parties: () => parties, _states: () => states };
}

module.exports = { createPartyService, pickCandidates, channelTarget, assignedIds, sanitizeParty, normalizeStates, READ_JS, ACTIONS, MAX_MEMBERS };
