'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadClientActionHelpers() {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const startIdx = serverSrc.indexOf('const profileClientActionQueues = new Map();');
  const endMarker = '// ==========================================\n// CENTRALIZED ZENY CONSOLIDATION WORKFLOW';
  const endIdx = serverSrc.indexOf(endMarker) !== -1
    ? serverSrc.indexOf(endMarker)
    : serverSrc.indexOf('// ==========================================\r\n// CENTRALIZED ZENY CONSOLIDATION WORKFLOW');
  assert.ok(startIdx > 0 && endIdx > startIdx, 'Should locate client action helpers in manager/server.js');
  const snippet = serverSrc.slice(startIdx, endIdx);
  const sandbox = {};
  vm.runInNewContext(
    `${snippet}\nthis.enqueueProfileClientAction = enqueueProfileClientAction;\nthis.buildClientActionEvalCode = buildClientActionEvalCode;`,
    sandbox
  );
  return sandbox;
}

function createMockGameEnv() {
  const elements = new Map();
  const storage = new Map();
  const getEl = (id) => {
    const cleanId = String(id).replace(/^#/, '');
    if (!elements.has(cleanId)) {
      elements.set(cleanId, { id: cleanId, checked: false, value: '', innerText: '', innerHTML: '' });
    }
    return elements.get(cleanId);
  };
  const document = {
    getElementById: (id) => getEl(id),
    querySelector: (sel) => getEl(sel)
  };
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v))
  };
  const window = {
    document,
    localStorage,
    __buffPotionConfig: {
      90306: { enabled: true, targetQty: 10 },
      90307: { enabled: true, targetQty: 10 },
      90308: { enabled: true, targetQty: 10 }
    },
    __archerConfig: {},
    __sellConfig: {},
    __autoMarketSellConfig: { enabled: false, rules: [] },
    __humanizeConfig: {},
    renderAutoSellHudRulesHtml: () => '<div class="rule-row">MockRule</div>'
  };
  const runEval = (code) => vm.runInNewContext(code, { window, document, localStorage });
  return { window, document, localStorage, getEl, runEval };
}

describe('Central Menu & Web HUD -> In-Game DOM Synchronization', () => {
  const { buildClientActionEvalCode, enqueueProfileClientAction } = loadClientActionHelpers();

  it('syncs Buff Potion checkboxes (#p-potion-enable-90308) and qty inputs in-game on uncheck -> re-check', () => {
    const env = createMockGameEnv();
    env.getEl('p-potion-enable-90308').checked = true;

    // 1. Uncheck Berserk Potion (90308) from Central Menu
    const codeOff = buildClientActionEvalCode({
      type: 'update-buff-potions',
      config: { 90308: { enabled: false } }
    });
    env.runEval(codeOff);
    assert.equal(env.window.__buffPotionConfig['90308'].enabled, false);
    assert.equal(env.getEl('p-potion-enable-90308').checked, false, 'In-game checkbox should uncheck');

    // 2. Re-check Berserk Potion (90308) and update qty to 25
    const codeOn = buildClientActionEvalCode({
      type: 'update-buff-potions',
      config: { 90308: { enabled: true, targetQty: 25 } }
    });
    env.runEval(codeOn);
    assert.equal(env.window.__buffPotionConfig['90308'].enabled, true);
    assert.equal(env.getEl('p-potion-enable-90308').checked, true, 'In-game checkbox should re-check');
    assert.equal(env.getEl('p-potion-qty-90308').value, '25', 'In-game qty input should update');
  });

  it('syncs Archer autoEquipArrow (#p-archer-auto-equip) and all archer controls in-game', () => {
    const env = createMockGameEnv();
    const code = buildClientActionEvalCode({
      type: 'update-archer',
      config: { requireArrow: true, autoEquipArrow: true, useBwing: false, arrowBuyQty: 3000 }
    });
    env.runEval(code);
    assert.equal(env.getEl('p-archer-req').checked, true);
    assert.equal(env.getEl('p-archer-auto-equip').checked, true);
    assert.equal(env.getEl('p-archer-bwing').checked, false);
    assert.equal(env.getEl('p-archer-qty').value, '3000');
  });

  it('syncs Sell, Storage (#p-store-*), Materials/Ores, and Stat Filter controls in-game', () => {
    const env = createMockGameEnv();
    const code = buildClientActionEvalCode({
      type: 'update-sell',
      config: {
        enabled: true,
        sellMaterials: true,
        materialMode: 'common',
        sellRefineOres: true,
        storeEnabled: true,
        storeWeapon: false,
        storeArmor: true,
        storeAcc: false,
        storeRefine: true,
        storeSkipLocked: true,
        statsFilterPatch: {
          enabled: true,
          filterWeapons: false,
          filterArmors: true,
          filterAccessories: false,
          protectGems: true,
          minOptions: 3
        }
      }
    });
    env.runEval(code);
    assert.equal(env.getEl('p-sell-enabled').checked, true);
    assert.equal(env.getEl('p-sell-rarity-mat').value, 'common');
    assert.equal(env.getEl('p-sell-refine-ores').value, 'unlisted');
    assert.equal(env.getEl('p-store-enabled').checked, true);
    assert.equal(env.getEl('p-store-weapon').checked, false);
    assert.equal(env.getEl('p-store-armor').checked, true);
    assert.equal(env.getEl('p-store-acc').checked, false);
    assert.equal(env.getEl('p-store-refine').checked, true);
    assert.equal(env.getEl('p-store-skip-locked').checked, true);
    assert.equal(env.getEl('p-statfilter-toggle').checked, true);
    assert.equal(env.getEl('p-statfilter-weap').checked, false);
    assert.equal(env.getEl('p-statfilter-armor').checked, true);
    assert.equal(env.getEl('p-statfilter-acc').checked, false);
    assert.equal(env.getEl('p-statfilter-protect-gems').checked, true);
    assert.equal(env.getEl('p-statfilter-min-opts').value, '3');
  });

  it('syncs Auto Market Sell toggles (#p-autosell-toggle & #p-autosell-toggle-hud) and rules container in-game', () => {
    const env = createMockGameEnv();
    const code = buildClientActionEvalCode({
      type: 'update-autosell',
      config: {
        enabled: true,
        rules: [{ id: 'r1', itemName: 'Elunium', minQty: 10, sellMode: 'all', enabled: true }]
      }
    });
    env.runEval(code);
    assert.equal(env.getEl('p-autosell-toggle').checked, true);
    assert.equal(env.getEl('p-autosell-toggle-hud').checked, true);
    assert.equal(env.getEl('p-subtab-autosell-count').innerText, '1');
    assert.ok(env.getEl('p-autosell-hud-rules-container').innerHTML.includes('MockRule'));
  });

  it('serializes rapid uncheck -> re-check actions per profile so final state never races', async () => {
    const order = [];
    const p1 = enqueueProfileClientAction('profile_1', async () => {
      await new Promise(r => setTimeout(r, 40));
      order.push('off');
      return { state: false };
    });
    const p2 = enqueueProfileClientAction('profile_1', async () => {
      await new Promise(r => setTimeout(r, 5));
      order.push('on');
      return { state: true };
    });
    await Promise.all([p1, p2]);
    assert.deepEqual(order, ['off', 'on'], 'Second toggle must wait for first toggle on the same profile');
  });
});
