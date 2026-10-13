// Tests for manager/premium_api.js (Auto Premium)
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide, walkAsks, tokenTarget, sanitizeSettings, createPremiumService, READ_JS, ACTIONS, DEFAULTS } = require('../premium_api');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const PLANS = [{ id: '7d', days: 7, tokens: 1000 }, { id: '30d', days: 30, tokens: 3500 }];
const ASKS = [{ price: 22000, qty: 500 }, { price: 21800, qty: 300 }, { price: 23000, qty: 5000 }];

const snap = (o = {}) => Object.assign({
  ok: true, name: 'A', zeny: 30000000, level: 99, busy: [], plan: null,
  exchange: { tokens: 0, premiumUntil: null, plans: PLANS, bestAsk: 21800, asks: ASKS }
}, o);

test('walkAsks buys cheapest first within budget and wanted qty', () => {
  assert.deepStrictEqual(walkAsks(ASKS, 400, 1e12), { qty: 400, zeny: 300 * 21800 + 100 * 22000 });
  const w = walkAsks(ASKS, 1000, 10000000); // 10M: 300@21800 = 6.54M, then 157@22000 = 3.454M
  assert.strictEqual(w.qty, 457);
  assert.ok(w.zeny <= 10000000);
  assert.deepStrictEqual(walkAsks([], 10, 1e9), { qty: 0, zeny: 0 });
});

test('tokenTarget: full price without Premium, linear over (days - lead) while active', () => {
  assert.strictEqual(tokenTarget(1000, 7, 1, null, NOW), 1000);
  assert.strictEqual(tokenTarget(1000, 7, 1, NOW - 1, NOW), 1000);         // expired
  assert.strictEqual(tokenTarget(1000, 7, 1, NOW + 7 * DAY, NOW), 0);      // just activated
  assert.strictEqual(tokenTarget(1000, 7, 1, NOW + 4 * DAY, NOW), 500);    // 3 of 6 days gone
  assert.strictEqual(tokenTarget(1000, 7, 1, NOW + 1 * DAY, NOW), 1000);   // lead day: full
  assert.strictEqual(tokenTarget(1000, 7, 1, NOW + 20 * DAY, NOW), 0);     // long Premium bought by hand
});

test('decide: no Premium → buy at lowest asks keeping the reserve', () => {
  const d = decide(snap({ zeny: 12000000 }), DEFAULTS, true, NOW);
  assert.strictEqual(d.action, 'buy');
  assert.strictEqual(d.target, 1000);
  const w = walkAsks(ASKS, 1000, 10000000);
  assert.strictEqual(d.qty, w.qty);
  assert.ok(d.maxZeny <= 10000000, 'never touches the reserve');
});

test('decide: enough Token → activate; Premium on → only near the end', () => {
  assert.strictEqual(decide(snap({ exchange: Object.assign(snap().exchange, { tokens: 1000 }) }), DEFAULTS, true, NOW).action, 'activate');
  const active = until => snap({ exchange: Object.assign({}, snap().exchange, { tokens: 1000, premiumUntil: new Date(until).toISOString() }) });
  assert.strictEqual(decide(active(NOW + 2 * DAY), DEFAULTS, true, NOW).action, 'idle');
  assert.strictEqual(decide(active(NOW + 10 * 60000), DEFAULTS, true, NOW).action, 'activate');
});

test('decide: spreads purchases while Premium is on', () => {
  const s = snap({ exchange: Object.assign({}, snap().exchange, { tokens: 100, premiumUntil: NOW + 4 * DAY }) });
  const d = decide(s, DEFAULTS, true, NOW);
  assert.strictEqual(d.target, 500);
  assert.strictEqual(d.action, 'buy');
  assert.strictEqual(d.qty, 400);
});

test('decide: waits for plan gate, reserve, sellers and minimum batch', () => {
  assert.strictEqual(decide(snap({ plan: { id: 'p', blocked: ['Base 60'] } }), DEFAULTS, false, NOW).action, 'plan');
  assert.match(decide(snap({ plan: { id: 'p', blocked: ['Base 60'] } }), DEFAULTS, false, NOW).text, /Base 60/);
  assert.strictEqual(decide(snap({ zeny: 1500000 }), DEFAULTS, true, NOW).action, 'wait');
  assert.strictEqual(decide(snap({ exchange: Object.assign({}, snap().exchange, { asks: [] }) }), DEFAULTS, true, NOW).action, 'wait');
  assert.strictEqual(decide(snap({ zeny: 2000000 + 21800 * 3 }), DEFAULTS, true, NOW).action, 'wait'); // only 3 Token
  assert.strictEqual(decide({ ok: false }, DEFAULTS, true, NOW).action, 'offline');
});

test('sanitizeSettings clamps bad input', () => {
  assert.deepStrictEqual(sanitizeSettings({ reserveZeny: -5, planId: 'x y', leadDays: 99 }), DEFAULTS);
  assert.deepStrictEqual(sanitizeSettings({ reserveZeny: 5e6, planId: '30d', leadDays: 2 }), { reserveZeny: 5e6, planId: '30d', leadDays: 2 });
});

// ---------------------------------------------------------------- in-page snippets in a fake game page
function fakePage(o = {}) {
  const store = Object.assign({}, o.storage || {});
  const market = Object.assign({ tokens: 0, premiumUntil: null, premiumPlans: PLANS, bestAsk: 21800, book: { asks: ASKS, bids: [] }, orders: [] }, o.market || {});
  const handlers = {};
  const sent = [];
  const room = {
    state: { players: new Map([['s1', { name: 'A', level: o.level || 99, jobLevel: o.job || 50, classId: o.cls || 'bard' }]]) },
    sessionId: 's1',
    onMessage(t, cb) { (handlers[t] = handlers[t] || []).push(cb); },
    send(t, m) {
      sent.push(m);
      if (t !== 'exchange') return;
      if (m.type === 'now' && market.tokens + m.qty >= 0) market.tokens += m.qty;
      if (m.type === 'premium') { const p = PLANS.find(x => x.id === m.plan); market.tokens -= p.tokens; market.premiumUntil = new Date(NOW + p.days * DAY).toISOString(); }
      setTimeout(() => (handlers.exchange || []).forEach(h => h(JSON.parse(JSON.stringify(market)))), 5);
    }
  };
  const window = Object.assign({
    getGameRoom: () => room,
    __getClientLiveState: () => ({ zeny: o.zeny != null ? o.zeny : 9000000, charName: 'A' }),
    getCharacterName: () => 'A'
  }, o.win || {});
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ctx = { window, localStorage, setTimeout, Date, JSON, Number, String, Math, Array, Object, Promise };
  return { run: code => vm.runInNewContext(code, ctx), sent, market };
}

const PLAN = {
  id: 'plan1', name: 'Bard 1-99', class1Target: 'bard',
  triggers: [
    { id: 't1', type: 'base_level', targetLevel: 40, actions: [{ type: 'change_map' }] },
    { id: 't2', type: 'job_level', targetLevel: 40, classId: 'bard', actions: [] },
    { id: 't3', type: 'zeny', targetZeny: 50000, actions: [{ type: 'weight_scroll' }] }
  ]
};

test('READ_JS: plan gate needs every trigger passed (levels, zeny) and nothing pending', async () => {
  let pg = fakePage({ win: { __planScriptEnabled: true, __currentScriptPlan: PLAN } });
  let r = JSON.parse(JSON.stringify(await pg.run(READ_JS)));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.plan.blocked, []);
  assert.strictEqual(r.exchange.tokens, 0);
  assert.strictEqual(r.exchange.plans[0].tokens, 1000);

  pg = fakePage({ level: 30, zeny: 1000, win: { __planScriptEnabled: true, __currentScriptPlan: PLAN } });
  r = JSON.parse(JSON.stringify(await pg.run(READ_JS)));
  assert.deepStrictEqual(r.plan.blocked, ['Base 40', 'เงิน 50,000 z']);

  pg = fakePage({ storage: { pelican_plan_state_A_plan1: JSON.stringify({ done: {}, pending: { t1: { actions: [0] } } }) }, win: { __planScriptEnabled: true, __currentScriptPlan: PLAN } });
  r = JSON.parse(JSON.stringify(await pg.run(READ_JS)));
  assert.deepStrictEqual(r.plan.blocked, ['Base 40 (ยังทำไม่เสร็จ)']);

  pg = fakePage({ win: { __planScriptEnabled: false, __currentScriptPlan: PLAN } });
  r = JSON.parse(JSON.stringify(await pg.run(READ_JS)));
  assert.strictEqual(r.plan, null);
});

test('ACTIONS.buy re-checks the wallet and never buys past the target', async () => {
  const pg = fakePage({ market: { tokens: 1000 } });
  const r = await pg.run(ACTIONS.buy(50, 2000000, 1000));
  assert.strictEqual(r.success, false);
  assert.ok(!pg.sent.some(m => m.type === 'now'));
  const pg2 = fakePage({ market: { tokens: 10 } });
  const r2 = await pg2.run(ACTIONS.buy(50, 2000000, 1000));
  assert.strictEqual(r2.success, true);
  assert.deepStrictEqual([r2.before, r2.after], [10, 60]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pg2.sent.find(m => m.type === 'now'))), { type: 'now', side: 'bid', qty: 50, maxZeny: 2000000 });
});

test('ACTIONS.activate buys the plan only with enough Token', async () => {
  const pg = fakePage({ market: { tokens: 999 } });
  assert.strictEqual((await pg.run(ACTIONS.activate('7d', 1000))).success, false);
  const pg2 = fakePage({ market: { tokens: 1200 } });
  const r = await pg2.run(ACTIONS.activate('7d', 1000));
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.tokens, 200);
});

// ---------------------------------------------------------------- service with a simulated client
test('service: gate latch, buy then activate, busy skip', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  const world = { tokens: 0, until: null, zeny: 30000000, blocked: ['Base 60'], busy: [] };
  const calls = [];
  let t = NOW;
  const evalProfilePort = async (port, code) => {
    if (code === READ_JS) {
      return { success: true, result: snap({ zeny: world.zeny, busy: world.busy, plan: { id: 'plan1', name: 'P', blocked: world.blocked },
        exchange: { tokens: world.tokens, premiumUntil: world.until, plans: PLANS, bestAsk: 21800, asks: ASKS } }) };
    }
    if (code.includes("type: 'now'")) {
      const qty = Number(code.match(/qty: (\d+)/)[1]); calls.push('buy' + qty);
      const before = world.tokens; world.tokens += qty; world.zeny -= qty * 22000;
      return { success: true, result: { success: true, before, after: world.tokens } };
    }
    if (code.includes("type: 'premium'")) {
      calls.push('activate'); world.tokens -= 1000; world.until = t + 7 * DAY;
      return { success: true, result: { success: true, premiumUntil: world.until, tokens: world.tokens } };
    }
    return { success: false };
  };
  const svc = createPremiumService({ loadProfiles: () => [{ id: 'p1', name: 'C1', debugPort: 1 }], evalProfilePort, dataFile: path.join(dir, 'premium.json'), now: () => t, log: () => {} });
  await svc.tick();
  assert.deepStrictEqual(calls, [], 'disabled → nothing');
  await new Promise(resolve => svc.handleRoute({ method: 'POST', url: '', setEncoding() {}, on(ev, cb) { if (ev === 'data') cb(JSON.stringify({ profileId: 'p1', enabled: true })); if (ev === 'end') cb(); } }, null, '/api/premium/toggle', () => resolve()));
  await svc.tick();
  assert.strictEqual(svc.view().clients[0].status, 'plan');
  assert.deepStrictEqual(calls.filter(c => c !== 'activate' && !c.startsWith('buy')), []);
  assert.strictEqual(calls.length, 0, 'plan not passed → no buy');

  world.blocked = [];
  await svc.tick();
  assert.deepStrictEqual(calls, ['buy1000']);
  world.blocked = ['เงิน 50,000 z']; // zeny dropped after buying: latch keeps the gate open
  t += 5 * 60000;
  await svc.tick();
  assert.deepStrictEqual(calls, ['buy1000', 'activate']);
  assert.ok(world.until > t);

  // 3 days later: target 500 → buy 500, but not while the bot is busy
  t += 3 * DAY; world.busy = ['__isShopping']; world.zeny = 40000000;
  await svc.tick();
  assert.deepStrictEqual(calls, ['buy1000', 'activate']);
  assert.match(svc.view().clients[0].statusText, /รอบอทว่าง/);
  world.busy = [];
  await svc.tick();
  assert.strictEqual(calls[2], 'buy500'); // 3 of 6 days since activation
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'premium.json'), 'utf8'));
  assert.strictEqual(saved.clients.p1.enabled, true);
  assert.strictEqual(saved.clients.p1.gatePlan, 'plan1');
  assert.ok(saved.clients.p1.history.length >= 3);
});
