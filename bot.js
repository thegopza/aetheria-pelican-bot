// ==UserScript==
// @name         Aetheria Pelican Control Hub v4.2.1 (Auto-Sort Bag & Weight Auto-Sync 24/7)
// @namespace    https://www.aetheria-online.in.th/
// @version      4.2.1
// @description  Full Packet Hex Dump, Minimap Direct Map Opener, WASD Backflip, Auto Shop, Auto-Sort Bag & Weight Auto-Sync 24/7
// @match        https://www.aetheria-online.in.th/*
// @run-at       document-start
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js
// ==/UserScript==

(function () {
    'use strict';

    console.log('%c[Pelican] Control Hub v4.2.1 (Auto-Sort Bag & Weight Auto-Sync 24/7) Ready', 'color: #00ffcc; font-weight: bold; font-size: 14px;');

    window.__gameSocket = null;
    window.__lastMoveToken = null;
    window.__currentPos = { x: 0, y: 0 };
    window.__monsterPos = null;
    window.__lastTargetTime = 0;
    window.__lastBackflipTime = 0;
    window.__packetLogs = [];
    window.__outgoingLogs = [];
    try {
        const cachedInv = localStorage.getItem('pelican_latest_inventory');
        window.__latestInventory = cachedInv ? JSON.parse(cachedInv) : null;
    } catch(e) {
        window.__latestInventory = null;
    }
    window.__serverWeight = null;
    window.__isKnownOverweight = false;
    window.__debugSnifferEnabled = false;

    // ==========================================
    // TOOLTIP GUARDIAN (Persistent Hover & Re-render Rescue)
    // ==========================================
    window.initTooltipGuardian = function() {
        if (window.__tooltipGuardianInitialized) return;
        window.__tooltipGuardianInitialized = true;

        window.__lastMouseX = 0;
        window.__lastMouseY = 0;

        const updateMousePos = (e) => {
            if (e.clientX || e.clientY) {
                window.__lastMouseX = e.clientX;
                window.__lastMouseY = e.clientY;
            }
            if (window.__gameTooltipSnapFn) {
                try {
                    const tx = window.__gameTooltipSnapFn();
                    if (tx && tx.owner && (!tx.owner.isConnected || !tx.owner.contains(e.target))) {
                        const elUnderCursor = (e.target && e.target.closest) ? e.target.closest('[class*="slot"], [class*="item"], .inv-item, .cell, .tip, .tooltip, button') : null;
                        if (elUnderCursor) {
                            tx.owner = elUnderCursor;
                        }
                    }
                } catch(err) {}
            }
        };

        window.addEventListener('mousemove', updateMousePos, true);
        window.addEventListener('pointermove', updateMousePos, true);

        // 1. Intercept synthetic events (e.g. from bot auto-attack, macro keys) so they don't dismiss the native tooltip
        window.addEventListener('keydown', (e) => {
            if (!e.isTrusted) {
                const tt = document.querySelector('.tooltip.panel, [role="tooltip"]');
                if (tt && tt.offsetWidth > 0) {
                    e.stopImmediatePropagation();
                }
            }
        }, true);

        window.addEventListener('keyup', (e) => {
            if (!e.isTrusted) {
                const tt = document.querySelector('.tooltip.panel, [role="tooltip"]');
                if (tt && tt.offsetWidth > 0) {
                    e.stopImmediatePropagation();
                }
            }
        }, true);

        // 2. Prevent window blur from instantly killing tooltip if user is hovering over game slots
        window.addEventListener('blur', (e) => {
            if (window.__lastMouseX > 0 && window.__lastMouseY > 0) {
                const el = document.elementFromPoint(window.__lastMouseX, window.__lastMouseY);
                if (el && el.closest('[class*="slot"], [class*="item"], .inv-item, .cell, .tip, .tooltip, .panel')) {
                    e.stopImmediatePropagation();
                }
            }
        }, true);

        // 3. React Re-render Rescue Loop:
        // When packets arrive (arrow consumption, loot, exp, market sync), React unmounts & recreates slot DOM nodes.
        // Game has window.setInterval(() => !tx.owner.isConnected && close(), 150).
        // Our 40ms rescue loop catches disconnected owner and rebinds it to the slot under the cursor!
        if (window.__tooltipRescueInterval) clearInterval(window.__tooltipRescueInterval);
        window.__tooltipRescueInterval = setInterval(() => {
            try {
                if (!window.__gameTooltipSnapFn) {
                    const root = document.querySelector('#root');
                    const rKey = root ? Object.keys(root).find(k => k.startsWith('__reactContainer')) : null;
                    if (rKey && root[rKey]) {
                        let fiber = root[rKey];
                        let fxFiber = null;
                        function walk(node, depth = 0) {
                            if (!node || depth > 30 || fxFiber) return;
                            if (node.type && node.type.name === 'Fx') { fxFiber = node; return; }
                            if (node.child) walk(node.child, depth + 1);
                            if (node.sibling) walk(node.sibling, depth + 1);
                        }
                        walk(fiber);
                        if (fxFiber && fxFiber.memoizedState?.queue?.getSnapshot) {
                            window.__gameTooltipSnapFn = fxFiber.memoizedState.queue.getSnapshot;
                        }
                    }
                }

                if (window.__gameTooltipSnapFn) {
                    const tx = window.__gameTooltipSnapFn();
                    if (tx && tx.owner) {
                        if (!tx.owner.isConnected || tx.owner.getClientRects().length === 0) {
                            if (window.__lastMouseX > 0 && window.__lastMouseY > 0) {
                                const elUnderCursor = document.elementFromPoint(window.__lastMouseX, window.__lastMouseY);
                                if (elUnderCursor) {
                                    const newSlot = elUnderCursor.closest('[class*="slot"], [class*="item"], .inv-item, .cell, .tip, .tooltip, button');
                                    if (newSlot) {
                                        tx.owner = newSlot;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
        }, 40);

        console.log('%c[Pelican] Tooltip Guardian (Anti-Dismissal & Re-render Rescue) Active', 'color: #38bdf8; font-weight: bold;');
    };
    window.initTooltipGuardian();


    window.getMarketStatSelectOptionsHtml = function(currentVal) {
        const options = [
            { value: 'none', label: '-- ไม่ระบุ --' },
            // สเตตัสหลัก (Primary Stats)
            { value: 'DEX', label: 'DEX (ความแม่นยำ/ระยะไกล)' },
            { value: 'STR', label: 'STR (พลังโจมตีประชิด/แบกน้ำหนัก)' },
            { value: 'AGI', label: 'AGI (ความเร็วโจมตี/หลบหลีก)' },
            { value: 'VIT', label: 'VIT (พลังป้องกัน/HP)' },
            { value: 'INT', label: 'INT (พลังเวท/มานา)' },
            { value: 'LUK', label: 'LUK (คริติคอล/โชคลาภ)' },
            // กายภาพ / Physical (% และ Flat)
            { value: 'ATK_PERCENT', label: 'ATK% (พลังโจมตีกายภาพ %)' },
            { value: 'ATK_FLAT', label: 'ATK (พลังโจมตีกายภาพ หน่วยตรง)' },
            { value: 'RANGED_DAMAGE_PERCENT', label: 'RANGED DMG% (ความแรงระยะไกล %)' },
            { value: 'RANGE_ATTACK', label: 'RANGE ATK (พลังโจมตีระยะไกล หน่วยตรง)' },
            { value: 'MELEE_DAMAGE_PERCENT', label: 'MELEE DMG% (ความแรงประชิด %)' },
            { value: 'MELEE_ATTACK', label: 'MELEE ATK (พลังโจมตีประชิด หน่วยตรง)' },
            // เวท / Magic (% และ Flat)
            { value: 'MATK_PERCENT', label: 'MATK% (พลังโจมตีเวท %)' },
            { value: 'MATK_FLAT', label: 'MATK (พลังโจมตีเวท หน่วยตรง)' },
            { value: 'MAGIC_DAMAGE_PERCENT', label: 'MAGIC DMG% (ความแรงเวท %)' },
            { value: 'MAGIC_ATTACK', label: 'MAGIC ATK (พลังโจมตีเวท หน่วยตรง)' },
            // คริติคอล / Critical
            { value: 'CRIT', label: 'CRIT (อัตราคริติคอล)' },
            { value: 'CRIT_DAMAGE', label: 'CRIT DMG% (ความแรงคริ %)' },
            // ความเร็ว & ความแม่นยำ
            { value: 'ASPD', label: 'ASPD (ความเร็วโจมตี หน่วยตรง)' },
            { value: 'ASPD_PERCENT', label: 'ASPD% (ความเร็วโจมตี %)' },
            { value: 'HIT', label: 'HIT (ความแม่นยำ)' },
            { value: 'FLEE', label: 'FLEE (การหลบหลีก)' },
            { value: 'MOVE_SPEED', label: 'MOVE SPEED (ความเร็วเดิน)' },
            { value: 'CAST_TIME_REDUCTION', label: 'CAST RED% (ลดเวลาร่าย %)' },
            // ป้องกัน & เอาชีวิตรอด
            { value: 'DEF', label: 'DEF (พลังป้องกันกายภาพ)' },
            { value: 'MDEF', label: 'MDEF (พลังป้องกันเวท)' },
            { value: 'DAMAGE_REDUCTION', label: 'DMG RED% (ลดดาเมจที่ได้รับ %)' },
            { value: 'BLOCK_CHANCE', label: 'BLOCK% (โอกาสบล็อก %)' },
            { value: 'MAXHP_PERCENT', label: 'Max HP% (เลือดสูงสุด %)' },
            { value: 'MAXHP', label: 'Max HP (เลือดสูงสุด หน่วยตรง)' },
            { value: 'MAXSP_PERCENT', label: 'Max SP% (มานาสูงสุด %)' },
            { value: 'MAXSP', label: 'Max SP (มานาสูงสุด หน่วยตรง)' },
            { value: 'HP_REGEN', label: 'HP REGEN (ฟื้นฟูเลือด)' },
            { value: 'SP_REGEN', label: 'SP REGEN (ฟื้นฟูมานา)' },
            { value: 'HEAL_POWER', label: 'HEAL% (พลังการฮีล %)' }
        ];

        return options.map(opt => {
            let isSel = (currentVal === opt.value);
            if (!isSel && currentVal === 'ATK' && opt.value === 'ATK_FLAT') isSel = true;
            if (!isSel && currentVal === 'MATK' && opt.value === 'MATK_FLAT') isSel = true;
            return `<option value="${opt.value}" ${isSel ? 'selected' : ''}>${opt.label}</option>`;
        }).join('');
    };

    function getMarketStatSelectOptionsHtml(currentVal) {
        return window.getMarketStatSelectOptionsHtml(currentVal);
    }


    // Config & Map Name Migration
    const mapAliases = {
        'ทุ่งหญ้าเอลเดอร์': 'ทุ่งโคลเวอร์',
        'ถนนต้นสน': 'ถนนต้นหลิว',
        'ป่าบลูมิฟ': 'ป่ามูนลีฟ',
        'ป่ามูนลิฟ': 'ป่ามูนลีฟ',
        'เส้นทางกิลเดน': 'เส้นทางก็อบลิน',
        'ถ้ำเมทัลเวฟ': 'ถ้ำเอมเบอร์',
        'ป่าลึกเอลเดอร์': 'ที่ราบสูงเกล',
        'แหล่งแร่เอลเดนท์': 'แอ่งเวอร์แดนท์',
        'ชายหาดปะการัง': 'ชายฝั่งปะการัง',
        'สุสานเก่า': 'สุสานเงา',
        'โบสถ์เคปิ': 'โบสถ์อเวจี',
        'โบสถ์แวร์จิ': 'โบสถ์อเวจี',
        'บึงรากดำ': 'บึงรากเน่า',
        'เนินทรายแหลมผา': 'เนินทรายแผดเผา',
        'ปิรามิดทราย': 'พีระมิดจมทราย',
        'แดนลาวา': 'แกนลาวา',
        'ไร่ซันแกรน': 'ไร่ซันเกรน'
    };
    let initialMap = localStorage.getItem('pelican_farm_map') || 'ทะเลสาบอาซูร์';
    if (mapAliases[initialMap]) {
        initialMap = mapAliases[initialMap];
        localStorage.setItem('pelican_farm_map', initialMap);
    }
    window.__targetFarmMap = initialMap;
    window.__autoLoopEnabled = localStorage.getItem('pelican_auto_loop') === 'true';
    window.__autoJumpEnabled = localStorage.getItem('pelican_auto_jump') === 'true';
    window.__isBotRunning = localStorage.getItem('pelican_bot_running') === 'true';
    window.__isNavigating = false;
    window.__isRecovering = false;
    window.__isShopping = false;

    // Auto-Shop Config
    window.__shopConfig = JSON.parse(localStorage.getItem('pelican_shop_cfg') || JSON.stringify({
        enabled: true,
        npcKey: 'n2',
        autoSellTrash: true,
        autoBuyPotion: true,
        buyItemId: 0x00015fae, // ธนู (90030)
        buyItemQty: 200
    }));

    function saveShopConfig() {
        localStorage.setItem('pelican_shop_cfg', JSON.stringify(window.__shopConfig));
    }

    // Auto-Login & Account Config
    const defaultAuthConfig = {
        enabled: false,
        username: '',
        password: '',
        charName: '', // ชื่อตัวละครที่ต้องการเลือกอัตโนมัติ (ถ้าว่างจะเลือกตัวแรกที่พบ)
        autoResumeBot: true
    };
    try {
        const storedAuth = JSON.parse(localStorage.getItem('pelican_auth_cfg') || '{}');
        window.__authConfig = Object.assign({}, defaultAuthConfig, storedAuth);
    } catch(e) {
        window.__authConfig = defaultAuthConfig;
    }

    function saveAuthConfig() {
        localStorage.setItem('pelican_auth_cfg', JSON.stringify(window.__authConfig));
    }

    // Auto-Sell Filter & Whitelist Config (ระดับตามเกมจริง: ธรรมดา, ดี, หายาก, มหากาพย์, ตำนาน)
    const defaultSellConfig = {
        enabled: true,
        weightCheckEnabled: true,
        weightThreshold: 80, // วาร์ปกลับไปขายเมื่อน้ำหนักเกิน 80% (ปรับได้)
        sellMaterials: true,
        weaponRarity: 'normal', // 'none' (ไม่ขาย), 'normal' (ขาวเท่านั้น 0 Opt), 'good' (เขียวลงไป), 'rare' (ฟ้าลงไป), 'epic' (ม่วงลงไป)
        armorRarity: 'normal',  // 'none' (ไม่ขาย), 'normal' (ขาวเท่านั้น 0 Opt), 'good' (เขียวลงไป), 'rare' (ฟ้าลงไป), 'epic' (ม่วงลงไป)
        accRarity: 'none',      // 'none' (ไม่ขาย), 'normal' (ขาวเท่านั้น 0 Opt), 'good' (เขียวลงไป), 'rare' (ฟ้าลงไป), 'epic' (ม่วงลงไป)
        sellWeapons: false,     // legacy fallback
        sellArmors: false,      // legacy fallback
        maxRarityToSell: 'normal', // legacy fallback
        keepRefined: true, // ห้ามขายของตีบวก (+1 ขึ้นไป)
        keepSpecial: true, // ห้ามขายของมี Option สุ่ม
        keepSockets: true, // ห้ามขายของมีรูการ์ด [1-4]
        whitelist: 'Phracon, Rough Elunium, Enchant Rune, Composite Bow, Crossbow, Gakkung, Hunter Bow'
    };
    try {
        const stored = JSON.parse(localStorage.getItem('pelican_sell_cfg') || '{}');
        window.__sellConfig = Object.assign({}, defaultSellConfig, stored);
        if (typeof window.__sellConfig.weightThreshold !== 'number') window.__sellConfig.weightThreshold = 80;
        if (window.__sellConfig.weightCheckEnabled === undefined) window.__sellConfig.weightCheckEnabled = true;

        // Auto migration for per-category settings
        if (stored.weaponRarity === undefined) {
            if (stored.sellWeapons) {
                window.__sellConfig.weaponRarity = stored.maxRarityToSell || 'normal';
            } else if (stored.sellWeapons === false) {
                window.__sellConfig.weaponRarity = 'none';
            }
        }
        if (stored.armorRarity === undefined) {
            if (stored.sellArmors) {
                window.__sellConfig.armorRarity = stored.maxRarityToSell || 'normal';
            } else if (stored.sellArmors === false) {
                window.__sellConfig.armorRarity = 'none';
            }
        }
        if (stored.accRarity === undefined) {
            window.__sellConfig.accRarity = 'none';
        }
        window.__sellConfig.sellWeapons = window.__sellConfig.weaponRarity !== 'none';
        window.__sellConfig.sellArmors = window.__sellConfig.armorRarity !== 'none';
    } catch (e) {
        window.__sellConfig = defaultSellConfig;
    }

    function saveSellConfig() {
        localStorage.setItem('pelican_sell_cfg', JSON.stringify(window.__sellConfig));
    }

    // Hunter / Archer Suite Config
    const defaultArcherConfig = {
        requireArrow: true,
        arrowType: 0x00015fae, // Normal Arrow (90030)
        arrowBuyQty: 200,
        useBwing: true,
        bwingBuyQty: 5,
        bwingItemId: 0x000160c7, // Butterfly Wing (90311)
        ammoThreshold: 50, // วาร์ปกลับไปซื้อเมื่อเหลือน้อยกว่า 50 ดอก
        autoEquipArrow: false, // ปิดการสลับใส่ลูกธนูผ่านคีย์ลัดอัตโนมัติ เพื่อป้องกันการไปสลับใส่ดาบ Damascus
        arrowHotbarSlot: -1 // ช่อง ItemBar ของลูกธนู (-1 คือไม่กดช่องลัด)
    };
    try {
        const storedArcher = JSON.parse(localStorage.getItem('pelican_archer_cfg') || '{}');
        window.__archerConfig = Object.assign({}, defaultArcherConfig, storedArcher);
        if (!window.__archerConfig.ammoThreshold || window.__archerConfig.ammoThreshold < 50) {
            window.__archerConfig.ammoThreshold = 50;
        }
    } catch(e) {
        window.__archerConfig = defaultArcherConfig;
    }

    window.__currentAmmo = parseInt(localStorage.getItem('pelican_current_ammo')) || 0;

    function saveArcherConfig() {
        localStorage.setItem('pelican_archer_cfg', JSON.stringify(window.__archerConfig));
    }

    // Market Finder & Stat Sniper Config
    const defaultMarketFilterConfig = {
        q: '',
        category: '',
        kind: '',
        minRefine: 0,
        maxPrice: 0,
        statType1: 'none',
        statMinVal1: 1,
        statType2: 'none',
        statMinVal2: 1,
        statMatchMode: 'AND',
        sniperAlert: true,
        autoBuy: false,
        maxAutoBuyPrice: 100000
    };
    try {
        const storedMarket = JSON.parse(localStorage.getItem('pelican_market_filter_cfg') || '{}');
        window.__marketFilterConfig = Object.assign({}, defaultMarketFilterConfig, storedMarket);
    } catch(e) {
        window.__marketFilterConfig = defaultMarketFilterConfig;
    }

    function saveMarketFilterConfig() {
        localStorage.setItem('pelican_market_filter_cfg', JSON.stringify(window.__marketFilterConfig));
    }

    // Auto Market Sell Config (⚖️ Market Median Algorithm)
    const defaultAutoMarketSellConfig = {
        enabled: false,
        priceStrategy: 'median', // ⚖️ ราคากลางสมดุล (Recent Completed Trades Median)
        checkIntervalSec: 25,
        maxActiveListings: 10,
        rules: []
    };
    try {
        const storedAutoSell = JSON.parse(localStorage.getItem('pelican_auto_market_sell_cfg') || '{}');
        window.__autoMarketSellConfig = Object.assign({}, defaultAutoMarketSellConfig, storedAutoSell);
        if (!Array.isArray(window.__autoMarketSellConfig.rules)) {
            window.__autoMarketSellConfig.rules = [];
        }
    } catch(e) {
        window.__autoMarketSellConfig = defaultAutoMarketSellConfig;
    }

    function saveAutoMarketSellConfig() {
        localStorage.setItem('pelican_auto_market_sell_cfg', JSON.stringify(window.__autoMarketSellConfig));
    }
    window.saveAutoMarketSellConfig = saveAutoMarketSellConfig;

    function updateAmmoHUD() {
        const threshold = (window.__archerConfig && window.__archerConfig.ammoThreshold) ? window.__archerConfig.ammoThreshold : 50;
        const isLow = window.__currentAmmo <= threshold;

        const el = document.getElementById('p-ammo-count');
        if (el) {
            el.innerText = `${window.__currentAmmo} ดอก`;
            el.style.color = isLow ? '#ef4444' : '#22c55e';
        }
        const quickEl = document.getElementById('p-quick-ammo');
        if (quickEl) {
            quickEl.innerText = `🏹 ${window.__currentAmmo}`;
            quickEl.style.color = isLow ? '#ef4444' : '#22c55e';
            quickEl.style.borderColor = isLow ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.4)';
        }
    }

    const ARROW_DATA = {
        90030: { name: 'Arrow', th: 'ลูกธนูธรรมดา', icon: 'items/arrow.webp', price: 1 },
        90031: { name: 'Fire Arrow', th: 'ลูกธนูไฟ', icon: 'items/fire-arrow.webp', price: 3 },
        90032: { name: 'Crystal Arrow', th: 'ลูกธนูน้ำ', icon: 'items/crystal-arrow.webp', price: 3 },
        90033: { name: 'Stone Arrow', th: 'ลูกธนูดิน', icon: 'items/stone-arrow.webp', price: 3 },
        90034: { name: 'Arrow of Wind', th: 'ลูกธนูลม', icon: 'items/wind-arrow.webp', price: 3 },
        90035: { name: 'Poison Arrow', th: 'ลูกธนูพิษ', icon: 'items/poison-arrow.webp', price: 3 },
        90036: { name: 'Silver Arrow', th: 'ลูกธนูเงิน (ศักดิ์สิทธิ์)', icon: 'items/silver-arrow.webp', price: 3 },
        90037: { name: 'Shadow Arrow', th: 'ลูกธนูเงา', icon: 'items/shadow-arrow.webp', price: 3 },
        90038: { name: 'Immaterial Arrow', th: 'ลูกธนูวิญญาณ', icon: 'items/immaterial-arrow.webp', price: 3 },
        90039: { name: 'Rotten Arrow', th: 'ลูกธนูเน่า', icon: 'items/rotten-arrow.webp', price: 3 }
    };

    function isTargetArrow(item, targetArrowId) {
        if (!item) return false;
        const id = parseInt(item.itemId || item.id || item.item_id || item.code);
        const targetId = parseInt(targetArrowId) || 90030;

        // 1. ถ้า Item ID ตรงกับ targetArrowId -> ใช่ 100%
        if (!isNaN(id) && id === targetId) return true;

        const name = (item.name || item.itemName || '').trim();
        const lowerName = name.toLowerCase();
        const info = ARROW_DATA[targetId];

        // 2. ถ้าชื่อภาษาอังกฤษตรงกับลูกธนูชนิดนั้น
        if (info) {
            const targetLower = info.name.toLowerCase();
            if (lowerName === targetLower || lowerName === `[${targetLower}]` || lowerName === targetLower.replace(/\s+/g, '')) return true;
        }

        // 3. ตรวจสอบชื่อเฉพาะของแต่ละชนิดเพื่อป้องกันการนับปนกัน
        if (targetId === 90030) {
            // Normal Arrow: ต้องเป็น "Arrow" หรือ "ลูกธนู" ธรรมดาเท่านั้น ห้ามชนกับ Silver Arrow หรือชนิดธาตุอื่น
            const isOther = lowerName.includes('silver') || lowerName.includes('fire') || lowerName.includes('crystal') ||
                            lowerName.includes('stone') || lowerName.includes('wind') || lowerName.includes('poison') ||
                            lowerName.includes('shadow') || lowerName.includes('immaterial') || lowerName.includes('rotten') ||
                            name.includes('เงิน') || name.includes('ศักดิ์สิทธิ์') || name.includes('ไฟ') ||
                            name.includes('น้ำ') || name.includes('ดิน') || name.includes('ลม') || name.includes('พิษ') || name.includes('เงา');
            if (isOther) return false;
            return lowerName === 'arrow' || lowerName === '[arrow]' || name === 'ลูกธนู' || name === 'Arrow (ธรรมดา)';
        }
        if (targetId === 90031) return lowerName.includes('fire arrow') || name.includes('ลูกธนูไฟ');
        if (targetId === 90032) return lowerName.includes('crystal arrow') || name.includes('ลูกธนูน้ำ');
        if (targetId === 90033) return lowerName.includes('stone arrow') || name.includes('ลูกธนูดิน');
        if (targetId === 90034) return lowerName.includes('arrow of wind') || lowerName.includes('wind arrow') || name.includes('ลูกธนูลม');
        if (targetId === 90035) return lowerName.includes('poison arrow') || name.includes('ลูกธนูพิษ');
        if (targetId === 90036) return lowerName.includes('silver arrow') || name.includes('ลูกธนูเงิน') || name.includes('ลูกธนูศักดิ์สิทธิ์');
        if (targetId === 90037) return lowerName.includes('shadow arrow') || name.includes('ลูกธนูเงา');
        if (targetId === 90038) return lowerName.includes('immaterial arrow') || name.includes('ลูกธนูวิญญาณ');
        if (targetId === 90039) return lowerName.includes('rotten arrow') || name.includes('ลูกธนูเน่า');

        return false;
    }

    function isTargetArrowDom(src, title, targetArrowId) {
        const targetId = parseInt(targetArrowId) || 90030;
        const arrowInfo = ARROW_DATA[targetId] || { name: 'Arrow' };
        const iconSlug = arrowInfo.icon ? arrowInfo.icon.split('/').pop().replace('.webp', '') : 'arrow';

        if (targetId === 90030) {
            // Normal Arrow: ต้องไม่เป็นธาตุอื่น
            const isOther = src.includes('fire-arrow') || src.includes('crystal-arrow') || src.includes('stone-arrow') ||
                            src.includes('wind-arrow') || src.includes('poison-arrow') || src.includes('silver-arrow') ||
                            src.includes('shadow-arrow') || src.includes('immaterial-arrow') || src.includes('rotten-arrow') ||
                            title.includes('fire') || title.includes('crystal') || title.includes('stone') ||
                            title.includes('wind') || title.includes('poison') || title.includes('silver') ||
                            title.includes('shadow') || title.includes('ไฟ') || title.includes('น้ำ') ||
                            title.includes('ดิน') || title.includes('ลม') || title.includes('พิษ') ||
                            title.includes('เงิน') || title.includes('ศักดิ์สิทธิ์') || title.includes('เงา');
            if (isOther) return false;
            return src.includes('/arrow.') || src.endsWith('arrow.webp') || src.endsWith('arrow.png') || src.includes('90030') || title === 'arrow' || title.includes('ลูกธนู');
        } else {
            return src.includes(iconSlug) || src.includes(targetId.toString()) || title.includes(arrowInfo.name.toLowerCase()) || (arrowInfo.th && title.includes(arrowInfo.th));
        }
    }

    function syncAmmoFromDOM() {
        try {
            const targetArrowId = (window.__archerConfig && window.__archerConfig.arrowType) ? parseInt(window.__archerConfig.arrowType) : 90030;
            const arrowInfo = ARROW_DATA[targetArrowId] || { name: 'Arrow' };

            // 0. PRIORITY 1: ตรวจจาก Server Inventory Payload โดยตรง 100% (รวมทุก Stack ของลูกธนูชนิดที่เลือก)
            if (window.__latestInventory) {
                let totalAmmo = 0;
                let foundAny = false;

                function scanInv(obj, depth = 0) {
                    if (!obj || depth > 5) return;
                    if (Array.isArray(obj)) {
                        for (const it of obj) {
                            scanInv(it, depth + 1);
                        }
                    } else if (typeof obj === 'object') {
                        if (isTargetArrow(obj, targetArrowId)) {
                            foundAny = true;
                            totalAmmo += parseInt(obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 1) || 0;
                            return; // เจอลูกธนูแล้ว ไม่ต้องลงลึกเข้าไปในคีย์ของไอเทม
                        }
                        for (const k in obj) {
                            if (typeof obj[k] === 'object') scanInv(obj[k], depth + 1);
                        }
                    }
                }
                scanInv(window.__latestInventory);

                if (foundAny) {
                    if (window.__currentAmmo !== totalAmmo) {
                        window.__currentAmmo = totalAmmo;
                        localStorage.setItem('pelican_current_ammo', totalAmmo);
                        updateAmmoHUD();
                    }
                    return totalAmmo;
                } else if (window.__latestInventory.items && Array.isArray(window.__latestInventory.items)) {
                    // ถ้ามี payload กระเป๋าจริงสมบูรณ์แล้วแต่ไม่มีลูกธนูชนิดที่เลือกเลย -> 0 ดอก
                    if (window.__currentAmmo !== 0) {
                        window.__currentAmmo = 0;
                        localStorage.setItem('pelican_current_ammo', 0);
                        updateAmmoHUD();
                    }
                    return 0;
                }
            }

            // 1. Fallback รอง: ตรวจจากช่อง ItemBar / Hotbar ด้านล่างจอ
            const hotbarSlots = Array.from(document.querySelectorAll('[class*="itembar"] [class*="slot"], [class*="hotbar"] [class*="slot"], [class*="item-slot"], .quick-slot'));
            for (const slot of hotbarSlots) {
                const img = slot.querySelector('img');
                const src = img ? (img.src || '').toLowerCase() : '';
                const title = (slot.getAttribute('title') || slot.getAttribute('data-name') || '').toLowerCase();
                const isArrowSlot = isTargetArrowDom(src, title, targetArrowId);

                if (isArrowSlot) {
                    const countEl = slot.querySelector('.count, .amount, .qty, [class*="count"], [class*="qty"], span, div');
                    const text = (countEl ? countEl.textContent : slot.textContent || '').trim();
                    const match = text.match(/(\d+)/);
                    if (match) {
                        const parsed = parseInt(match[1]);
                        if (!isNaN(parsed) && parsed >= 0) {
                            if (window.__currentAmmo !== parsed) {
                                window.__currentAmmo = parsed;
                                localStorage.setItem('pelican_current_ammo', parsed);
                                updateAmmoHUD();
                            }
                            return parsed;
                        }
                    }
                }
            }

            // 2. ตรวจจากหน้าต่างกระเป๋า (Inventory) ถ้าผู้เล่นเปิดหน้าต่างกระเป๋าอยู่
            const bagModal = Array.from(document.querySelectorAll('.modal, .window, [class*="inventory"], [class*="bag"], [class*="dialog"]')).find(el => {
                if (el.closest('#pelican-hud')) return false;
                const headerText = (el.innerText || '').slice(0, 80);
                return headerText.includes('กระเป๋า') || headerText.includes('Inventory');
            });

            if (bagModal && bagModal.offsetWidth > 0) {
                const bagItems = Array.from(bagModal.querySelectorAll('[class*="slot"], [class*="item"], [class*="cell"]'));
                let arrowInBagFound = false;
                let bagArrowQty = 0;

                for (const itemEl of bagItems) {
                    const img = itemEl.querySelector('img');
                    const src = img ? (img.src || '').toLowerCase() : '';
                    const title = (itemEl.getAttribute('title') || itemEl.getAttribute('data-name') || itemEl.innerText || '').toLowerCase();
                    const isArrow = isTargetArrowDom(src, title, targetArrowId);

                    if (isArrow) {
                        arrowInBagFound = true;
                        const match = (itemEl.innerText || itemEl.textContent || '').match(/(\d+)/);
                        if (match) {
                            bagArrowQty += parseInt(match[1]);
                        }
                    }
                }

                // ถ้าเปิดหน้าต่างกระเป๋าอยู่ แล้วสแกนไม่เจอลูกธนูชนิดนี้เลย -> ลูกธนู = 0 ทันที 100%!
                if (!arrowInBagFound) {
                    if (window.__currentAmmo !== 0) {
                        console.log(`%c[Pelican Ammo] 🎒 สแกนกระเป๋าแล้ว: ไม่พบลูกธนู "${arrowInfo.name}" ในตัวเลย -> ปรับ Ammo = 0 ดอก`, 'color: #ef4444; font-weight: bold;');
                        window.__currentAmmo = 0;
                        localStorage.setItem('pelican_current_ammo', 0);
                        updateAmmoHUD();
                    }
                    return 0;
                } else if (bagArrowQty > 0) {
                    if (window.__currentAmmo !== bagArrowQty) {
                        window.__currentAmmo = bagArrowQty;
                        localStorage.setItem('pelican_current_ammo', bagArrowQty);
                        updateAmmoHUD();
                    }
                    return bagArrowQty;
                }
            }
        } catch(e) {}
        return window.__currentAmmo || 0;
    }

    setInterval(syncAmmoFromDOM, 600);

    
    const OriginalWebSocket = window.WebSocket;

    function isGameSocket(ws) {
        if (!ws) return false;
        if (ws.__isMcpInternal) return false;
        const url = (ws.url || '').toLowerCase();
        if (url.includes('extension') || url.includes(':3025') || url.includes('127.0.0.1:3025') ||
            url.includes('livereload') || url.includes('hot-reload') || url.includes('webpack') || 
            url.includes('vite') || url.includes('devtools') || url.includes('socket.io') || 
            url.includes('browser-tools') || url.includes('/ws-internal')) {
            return false;
        }
        return true;
    }

    // ==========================================
    // BROWSERTOOLS MCP NATIVE GAME CONNECTOR
    // ==========================================
    (function initBrowserToolsBridge() {
        let mcpWs = null;
        let reconnectTimer = null;
        let failCount = 0;
        const tabId = "aetheria-game";

        function tryConnect() {
            if (failCount >= 2) return; // ถ้าเครื่องอื่นไม่มี BrowserTools MCP ให้หยุดเชื่อมต่อทันที ไม่ต้องสแปม error
            if (mcpWs && (mcpWs.readyState === 1 || mcpWs.readyState === 0)) return;
            try {
                mcpWs = new OriginalWebSocket('ws://127.0.0.1:3025/extension-ws');
                mcpWs.__isMcpInternal = true;

                mcpWs.onopen = () => {
                    failCount = 0;
                    console.log('%c[Pelican MCP] 🔗 Connected natively to BrowserTools MCP on port 3025!', 'color: #00ffcc; font-weight: bold;');
                    mcpWs.send(JSON.stringify({ type: 'hello', extensionVersion: '2.0.0', tabId: tabId }));
                    mcpWs.send(JSON.stringify({ type: 'page', url: window.location.href, tabId: tabId }));
                };

                mcpWs.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'ping') {
                            mcpWs.send(JSON.stringify({ type: 'pong', id: msg.id }));
                        } else if (msg.type === 'refresh-tab') {
                            window.location.reload();
                        } else if (msg.type === 'capture-screenshot') {
                            const canvas = document.querySelector('canvas');
                            if (canvas) {
                                try {
                                    const dataUrl = canvas.toDataURL('image/png');
                                    mcpWs.send(JSON.stringify({
                                        requestId: msg.requestId,
                                        type: 'screenshot-result',
                                        dataUrl: dataUrl
                                    }));
                                } catch(e) {}
                            }
                        }
                    } catch(e) {}
                };

                mcpWs.onclose = () => {
                    mcpWs = null;
                    failCount++;
                    if (failCount < 2) scheduleReconnect();
                };

                mcpWs.onerror = () => {
                    mcpWs = null;
                    failCount++;
                };
            } catch(e) {
                failCount++;
                if (failCount < 2) scheduleReconnect();
            }
        }

        function scheduleReconnect() {
            if (!reconnectTimer && failCount < 2) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    tryConnect();
                }, 5000);
            }
        }

        const origLog = console.log;
        const origWarn = console.warn;
        const origError = console.error;

        function forward(level, args) {
            if (mcpWs && mcpWs.readyState === 1) {
                try {
                    const text = Array.from(args).map(a => {
                        if (typeof a === 'string') return a;
                        try { return JSON.stringify(a); } catch(e) { return String(a); }
                    }).join(' ');

                    mcpWs.send(JSON.stringify({
                        type: 'console',
                        entries: [{
                            type: level === 'error' ? 'console-error' : 'console-log',
                            level: level,
                            message: text.slice(0, 1500),
                            timestamp: Date.now()
                        }]
                    }));
                } catch(e) {}
            }
        }

        console.log = function(...args) {
            origLog.apply(console, args);
            forward('log', args);
        };
        console.warn = function(...args) {
            origWarn.apply(console, args);
            forward('warn', args);
        };
        console.error = function(...args) {
            origError.apply(console, args);
            forward('error', args);
        };

        tryConnect();
    })();

    // บันทึก Hex เต็ม 100% ทุกไบต์
    function recordPacket(direction, rawData) {
        try {
            let uint8;
            if (rawData instanceof ArrayBuffer) {
                uint8 = new Uint8Array(rawData);
            } else if (rawData && rawData.buffer instanceof ArrayBuffer) {
                uint8 = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);
            } else {
                return;
            }

            // กรองไม่เก็บแพ็กเก็ตมอนสเตอร์เดิน/เกิด 0x0F ลง Log ประวัติ เพื่อไม่ให้ล้น Buffer 100 รายการ
            if (direction === 'IN' && uint8[0] === 0x0f) {
                return;
            }

            // แสดง Hex เต็มความยาวทุกไบต์
            const fullHex = Array.from(uint8).map(b => b.toString(16).padStart(2, '0')).join(' ');

            let fullAscii = '';
            for (let i = 0; i < uint8.length; i++) {
                const b = uint8[i];
                fullAscii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
            }

            let decoded = null;
            try {
                if (window.msgpack && uint8.length > 2) {
                    if (uint8[0] === 0x0D && uint8[1] === 0xa9 && uint8.length > 12) {
                        decoded = window.msgpack.decode(uint8.slice(11));
                    } else {
                        decoded = window.msgpack.decode(uint8.slice(1));
                    }
                }
            } catch(e) {}

            const entry = {
                time: new Date().toLocaleTimeString(),
                dir: direction,
                len: uint8.length,
                opcode: uint8[0] ? '0x' + uint8[0].toString(16).toUpperCase() : '0x00',
                hex: fullHex,
                ascii: fullAscii,
                decoded: decoded
            };

            window.__packetLogs.push(entry);
            if (window.__packetLogs.length > 100) window.__packetLogs.shift();

            if (direction === 'OUT') {
                window.__outgoingLogs.push(entry);
                if (window.__outgoingLogs.length > 50) window.__outgoingLogs.shift();
            }

            if (window.__debugSnifferEnabled) {
                const color = direction === 'OUT' ? '#38bdf8' : '#f59e0b';
                console.log(`%c[Pelican ${direction}] (${entry.len}B) Op:${entry.opcode}\nHex: ${entry.hex}\nAscii: ${entry.ascii}`, `color: ${color};`);
            }
        } catch(e) {}
    }

    // ==========================================
    // BULLETPROOF CLIPBOARD & DATA EXTRACTOR
    // ==========================================
    window.safeCopyToClipboard = function(text, successMsg, onComplete) {
        console.log('%c[Pelican Clipboard Data]:', 'color: #38bdf8; font-weight: bold; font-size: 11px;');
        console.log(text);

        function showResult(success) {
            if (success && successMsg) {
                alert(successMsg);
            }
            if (typeof onComplete === 'function') onComplete(success);
        }

        function execCommandCopy() {
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.top = '-9999px';
                textArea.style.left = '-9999px';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (ok) {
                    showResult(true);
                    return true;
                }
            } catch(e) {
                console.warn('[Pelican] execCommand copy failed:', e);
            }
            return false;
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(() => {
                showResult(true);
            }).catch((err) => {
                console.warn('[Pelican] navigator.clipboard.writeText rejected (focus issue), falling back to execCommand:', err);
                const ok = execCommandCopy();
                if (!ok) {
                    showResult(false);
                }
            });
            return;
        }

        execCommandCopy();
    };

    window.copyOutgoingLogs = function(count = 10) {
        const recent = (window.__outgoingLogs || []).slice(-count);
        const jsonStr = JSON.stringify(recent, null, 2);

        console.log(`%c[Pelican Dump] 📤 Dump Outgoing Packets (${recent.length} รายการ):`, 'color: #38bdf8; font-weight: bold;');
        console.table(recent.map(p => ({ time: p.time, opcode: p.opcode, len: p.len, hex: (p.hex || '').slice(0, 30), ascii: (p.ascii || '').slice(0, 30) })));

        window.safeCopyToClipboard(jsonStr, `📋 คัดลอก Packet ขาออก (OUT) จำนวน ${recent.length} รายการ (Hex เต็ม 100%) สำเร็จแล้ว!`);

        if (window.showDataViewerModal) {
            window.showDataViewerModal('packets');
        }
    };

    // ==========================================
    // DATA DUMPER UTILITIES (Dump แมพ, ไอเทม, State)
    // ==========================================
    window.dumpMapData = function() {
        function extractPins() {
            const stage = document.querySelector('.worldmap-stage') || document.querySelector('.worldmap-body') || document.querySelector('.worldmap-window') || document.body;
            const isBadge = (s) => /^(?:Lv\.|ปลอดภัย|คุณอยู่ที่นี่)/i.test(s) || s === 'ปลอดภัย' || s === 'คุณอยู่ที่นี่';

            const pins = Array.from(stage.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud')) return false;
                const txt = (el.innerText || '').trim();
                const rect = el.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0 || rect.width > 260 || rect.height > 100) return false;
                return (txt.includes('Lv.') || txt.includes('ปลอดภัย')) && !isBadge(txt);
            });

            const mapList = [];
            pins.forEach(pin => {
                const lines = (pin.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
                if (lines.length >= 1) {
                    const name = lines[0];
                    const info = lines.slice(1).join(' ') || '';
                    if (!isBadge(name) && !mapList.some(m => m.name === name) && name !== 'แผนที่โลก' && !name.includes('Aetheria')) {
                        const rect = pin.getBoundingClientRect();
                        mapList.push({
                            name: name,
                            info: info,
                            rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }
                        });
                    }
                }
            });

            console.log(`%c[Pelican Dump] 🗺️ พบข้อมูลแมพทั้งหมด ${mapList.length} โซน:`, 'color: #00ffcc; font-weight: bold;');
            console.table(mapList);
            const jsonStr = JSON.stringify(mapList, null, 2);
            window.safeCopyToClipboard(jsonStr, `📋 คัดลอกข้อมูลแผนที่โลก (${mapList.length} โซน) ลง Clipboard เรียบร้อยแล้ว!`);
            return mapList;
        }

        if (isWorldMapOpen()) {
            return extractPins();
        } else {
            console.log('[Pelican Dump] กำลังเปิดแผนที่โลกเพื่อดึงข้อมูลหมุด...');
            openWorldMap(() => {
                setTimeout(extractPins, 500);
            });
        }
    };

    window.dumpWeightDebug = function() {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`%c[Pelican Dump ${timestamp}] ================= WEIGHT & BAG DOM DUMP =================`, 'color: #f59e0b; font-weight: bold; font-size: 13px;');
        
        // 0. Character HP status
        const charHp = (typeof getCharacterHP === 'function') ? getCharacterHP() : null;
        console.log(`[Pelican Dump] ❤️ Character HP:`, charHp);

        // 1. Check all elements with text "น้ำหนัก"
        const weightEls = Array.from(document.querySelectorAll('*')).filter(el => {
            if (!isValidNonBotElement(el)) return false;
            const t = el.textContent || '';
            return t.includes('น้ำหนัก') && el.children.length <= 4;
        });
        console.log(`[Pelican Dump] 🔎 Elements containing "น้ำหนัก" (count: ${weightEls.length}):`);
        const weightSummary = weightEls.map((el, i) => {
            const rect = el.getBoundingClientRect();
            const parent = el.parentElement;
            const item = {
                index: i,
                tag: el.tagName.toLowerCase(),
                className: el.className,
                rect: `${Math.round(rect.x)},${Math.round(rect.y)} (${Math.round(rect.width)}x${Math.round(rect.height)})`,
                text: (el.innerText || el.textContent || '').trim(),
                parentTag: parent?.tagName?.toLowerCase(),
                parentClass: parent?.className,
                parentText: (parent?.innerText || parent?.textContent || '').replace(/\s+/g, ' ').trim(),
                parentHTML: parent?.outerHTML?.slice(0, 350)
            };
            console.log(`  [#${i}] <${item.tag} class="${item.className}"> rect=[${item.rect}] text="${item.text}"`);
            console.log(`       parent: <${item.parentTag} class="${item.parentClass}"> text="${item.parentText}"`);
            console.log(`       parentHTML:`, item.parentHTML);
            return item;
        });

        // 2. Check all elements with text "จัดเรียง"
        const sortEls = Array.from(document.querySelectorAll('*')).filter(el => {
            if (!isValidNonBotElement(el)) return false;
            const t = (el.innerText || el.textContent || '').trim();
            return (t === 'จัดเรียง' || t.includes('จัดเรียง')) && el.offsetWidth > 0;
        });
        console.log(`[Pelican Dump] 🔄 Elements containing "จัดเรียง" (count: ${sortEls.length}):`);
        const sortSummary = sortEls.map((el, i) => {
            const rect = el.getBoundingClientRect();
            const item = {
                index: i,
                tag: el.tagName.toLowerCase(),
                className: el.className,
                visible: el.offsetWidth > 0,
                rect: `${Math.round(rect.x)},${Math.round(rect.y)} (${Math.round(rect.width)}x${Math.round(rect.height)})`,
                text: (el.innerText || '').trim()
            };
            console.log(`  [#${i}] <${item.tag} class="${item.className}"> rect=[${item.rect}] text="${item.text}"`);
            return item;
        });

        // 2.1 Check all elements with text "กระเป๋า"
        const bagEls = Array.from(document.querySelectorAll('*')).filter(el => {
            if (!isValidNonBotElement(el)) return false;
            const t = (el.innerText || el.textContent || '').trim();
            return (t === 'กระเป๋า' || t.startsWith('กระเป๋า')) && el.children.length <= 2;
        });
        console.log(`[Pelican Dump] 🎒 Elements containing "กระเป๋า" (count: ${bagEls.length}):`);
        bagEls.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            console.log(`  [#${i}] <${el.tagName.toLowerCase()} class="${el.className}"> rect=[${Math.round(rect.x)},${Math.round(rect.y)} (${Math.round(rect.width)}x${Math.round(rect.height)})] text="${(el.innerText || '').trim()}" HTML=${el.outerHTML.slice(0, 150)}`);
        });

        // 3. Bag Modal detection
        const bagInfo = getOpenBagInfo();
        const bagSummary = bagInfo ? {
            windowTag: bagInfo.windowEl?.tagName,
            windowClass: bagInfo.windowEl?.className,
            windowRect: bagInfo.windowEl?.getBoundingClientRect(),
            hasSortBtn: !!bagInfo.sortBtn,
            sortBtnTag: bagInfo.sortBtn?.tagName,
            sortBtnText: bagInfo.sortBtn?.innerText
        } : null;
        console.log(`[Pelican Dump] 🎒 getOpenBagInfo():`, bagSummary || 'null (BAG NOT DETECTED AS OPEN)');

        // 4. Weight calculation trace
        const currentW = getCharacterWeight();
        console.log(`[Pelican Dump] ⚖️ Current Weight:`, currentW);
        console.log(`[Pelican Dump] 💾 window.__lastKnownWeight:`, window.__lastKnownWeight);
        console.log(`[Pelican Dump] 💾 localStorage('pelican_last_weight'):`, localStorage.getItem('pelican_last_weight'));
        console.log(`[Pelican Dump] 🌐 window.__serverWeight:`, window.__serverWeight);
        console.log(`[Pelican Dump] 🚨 isCharacterOverweight():`, typeof isCharacterOverweight === 'function' ? isCharacterOverweight() : 'N/A');
        console.log(`%c[Pelican Dump] =====================================================================`, 'color: #f59e0b; font-weight: bold;');

        return { timestamp, charHp, weightEls: weightSummary, sortEls: sortSummary, bagInfo: bagSummary, currentWeight: currentW, lastKnownWeight: window.__lastKnownWeight };
    };

    // ==========================================
    // EQUIP SNIFFER & DEEP INVENTORY DUMPER
    // ==========================================
    window.__isSniffingEquip = false;

    window.startEquipSniffer = function() {
        window.__isSniffingEquip = true;
        const resBox = document.getElementById('p-sniffer-result');
        if (resBox) {
            resBox.style.display = 'block';
            resBox.innerHTML = '<span style="color: #f59e0b; font-weight: bold; animation: pulse 1.5s infinite;">⏳ รอตรวจจับ... ดับเบิลคลิกสวมใส่ "ลูกธนู" หรือ "อาวุธ" ในหน้าต่างกระเป๋าเกมเดี๋ยวนี้!</span>';
        }
        console.log('%c[Pelican Sniffer] 🎯 กำลังดักฟัง Packet สวมใส่... กรุณาคลิก/ดับเบิลคลิกไอเทมในหน้ากระเป๋าเกมเดี๋ยวนี้!', 'color: #f59e0b; font-weight: bold; font-size: 13px;');
    };

    window.dumpDeepInventory = function() {
        console.log('%c====================================================', 'color: #00ffcc;');
        console.log('%c📦 Pmhee Ma weaw DEEP INVENTORY & EQUIPMENT DUMP TOOL v1.0', 'color: #00ffcc; font-weight: bold; font-size: 14px;');
        console.log('%c====================================================', 'color: #00ffcc;');

        // 1. ข้อมูลดิบจาก Server (window.__latestInventory)
        const serverInv = window.__latestInventory;
        console.log('%c[1. SERVER INVENTORY PAYLOAD (MsgPack)]', 'color: #38bdf8; font-weight: bold;');
        if (serverInv) {
            console.dir(serverInv);
        } else {
            console.warn('[Pelican] ยังไม่พบ Packet Inventory จากเซิร์ฟเวอร์ (ลองเปิด-ปิดกระเป๋าในเกม 1 ครั้ง)');
        }

        // 2. ข้อมูลอุปกรณ์บนหน้าจอ (Equipment Slots)
        const equipItems = [];
        const charSlots = Array.from(document.querySelectorAll('*')).filter(el => {
            if (el.closest('#pelican-hud')) return false;
            const text = (el.innerText || el.textContent || '').trim();
            const isEquipText = text.includes('Munak') || text.includes('Damascus') || text.includes('Arrow x') || text.includes('Mitten') || text.includes('Binoculars') || text.includes('Mink Coat');
            return isEquipText && el.offsetWidth > 0;
        });
        charSlots.forEach(el => {
            equipItems.push({
                text: el.innerText.trim().replace(/\n+/g, ' | '),
                className: el.className
            });
        });

        // 3. กวาด DOM รายการในกระเป๋า
        const domItems = [];
        const slots = Array.from(document.querySelectorAll('[class*="item"], .inventory-slot, [data-item-id], [class*="slot"]')).filter(el => {
            return !el.closest('#pelican-hud') && el.offsetWidth > 0 && el.innerText.trim().length > 0;
        });
        slots.forEach((slot, idx) => {
            const img = slot.querySelector('img');
            domItems.push({
                idx: idx,
                name: slot.getAttribute('title') || slot.getAttribute('data-name') || slot.innerText.trim().replace(/\n+/g, ' '),
                img: img ? img.src.split('/').pop() : ''
            });
        });

        // 4. กวาดข้อมูล Hotbar 1-10
        const hotbar = [];
        for (let i = 0; i < 10; i++) {
            const hotbarSlot = document.querySelector(`[data-slot="${i}"], .slot-${i}, #hotbar-${i}, .quick-slot-${i}`);
            const text = hotbarSlot ? hotbarSlot.innerText.trim().replace(/\n+/g, ' ') : '';
            hotbar.push({ slot: i, key: (i === 9 ? '0' : (i + 1).toString()), info: text || 'Empty' });
        }

        const dump = {
            timestamp: new Date().toLocaleString(),
            serverInventoryRaw: serverInv,
            hotbarSummary: hotbar,
            detectedEquippedSummary: equipItems,
            domItemsSample: domItems.slice(0, 40),
            recentPacketsOut: (window.__outgoingLogs || []).slice(-10)
        };

        console.log('%c[2. HOTBAR / ITEMBAR SUMMARY]', 'color: #eab308; font-weight: bold;');
        console.table(hotbar);

        console.log('%c[3. INVENTORY ITEMS (Sample 30)]', 'color: #a855f7; font-weight: bold;');
        console.table(domItems.slice(0, 30));

        console.log('%c[4. RECENT OUTGOING PACKETS]', 'color: #ef4444; font-weight: bold;');
        console.table((window.__outgoingLogs || []).slice(-5).map(p => ({
            time: p.time,
            opcode: p.opcode,
            len: p.len,
            ascii: p.ascii,
            decoded: typeof p.decoded === 'object' ? JSON.stringify(p.decoded) : p.decoded
        })));

        const jsonStr = JSON.stringify(dump, null, 2);
        window.safeCopyToClipboard(jsonStr, '📦 [Pelican Dump] สแกนกระเป๋าและอุปกรณ์สำเร็จ!\n\n📋 คัดลอก Full Dump (JSON) ลง Clipboard ให้เรียบร้อยแล้ว');
        return dump;
    };

    window.dumpItemData = window.dumpDeepInventory;

    window.dumpAllPackets = function(count = 100) {
        const packets = (window.__packetLogs || []).slice(-count);
        const jsonStr = JSON.stringify(packets, null, 2);
        console.log(`%c[Pelican Dump] 📜 Dump Packet Logs (${packets.length} รายการ):`, 'color: #f59e0b; font-weight: bold;');
        console.table(packets.map(p => ({ time: p.time, dir: p.dir, opcode: p.opcode, len: p.len, ascii: p.ascii.slice(0, 30) })));
        window.safeCopyToClipboard(jsonStr, `📋 คัดลอก Packet Logs ทั้งหมด (${packets.length} รายการ) ลง Clipboard เรียบร้อยแล้ว!`);
        if (window.showDataViewerModal) {
            window.showDataViewerModal('packets');
        }
        return packets;
    };

    window.dumpGameState = function() {
        const state = {
            timestamp: new Date().toLocaleString(),
            currentMap: getCurrentMapName(),
            targetMap: window.__targetFarmMap,
            position: window.__currentPos,
            monsterTarget: window.__monsterPos,
            ammo: window.__currentAmmo,
            isNavigating: window.__isNavigating,
            isRecovering: window.__isRecovering,
            isShopping: window.__isShopping,
            autoLoop: window.__autoLoopEnabled,
            autoJump: window.__autoJumpEnabled,
            archerConfig: window.__archerConfig,
            sellConfig: window.__sellConfig,
            shopConfig: window.__shopConfig,
            authConfig: {
                enabled: window.__authConfig?.enabled,
                username: window.__authConfig?.username,
                hasPassword: !!window.__authConfig?.password,
                autoResumeBot: window.__authConfig?.autoResumeBot
            }
        };
        console.log('%c[Pelican Dump] 🕹️ ข้อมูล Game State ปัจจุบัน:', 'color: #22c55e; font-weight: bold;');
        console.dir(state);
        const jsonStr = JSON.stringify(state, null, 2);
        window.safeCopyToClipboard(jsonStr, '📋 คัดลอก Game State ลง Clipboard เรียบร้อยแล้ว!');
        return state;
    };

    // ==========================================
    
    // ==========================================
    // ==========================================
    // IN-GAME STYLE ITEM TOOLTIP FOR INSPECTOR
    // ==========================================
    const ITEM_RARITY_MAP = {
        'common': { th: 'ทั่วไป', color: '#cbd5e1' },
        'normal': { th: 'ทั่วไป', color: '#cbd5e1' },
        'uncommon': { th: 'ดี', color: '#4ade80' },
        'good': { th: 'ดี', color: '#4ade80' },
        'rare': { th: 'หายาก', color: '#38bdf8' },
        'epic': { th: 'มหากาพย์', color: '#c084fc' },
        'legendary': { th: 'ตำนาน', color: '#f59e0b' },
        'mythic': { th: 'มายา', color: '#f43f5e' }
    };

    const ITEM_TYPE_TH = {
        'Equipment': 'อุปกรณ์',
        'Consumable': 'ไอเทมกดใช้',
        'Card': 'การ์ดมอนสเตอร์',
        'Material': 'วัตถุดิบ',
        'Ore': 'แร่ธาตุ',
        'Miscellaneous': 'วัตถุดิบ / ขยะ',
        'Enchantment': 'หินออปชัน / รูน',
        'Ammo': 'ลูกธนู / กระสุน',
        'Quest': 'เควส',
        'Etc': 'ทั่วไป'
    };

    const EQUIP_TYPE_TH = {
        'Weapon': 'อาวุธ',
        'Armor': 'ชุดเกราะ',
        'Shield': 'โล่',
        'Helmet': 'หมวก / ส่วนหัว',
        'Head': 'ส่วนหัว',
        'Headgear': 'หมวก',
        'HeadMid': 'ส่วนใบหน้า / ตา',
        'Cape': 'ผ้าคลุม',
        'Garment': 'ผ้าคลุม',
        'Boot': 'รองเท้า',
        'Shoes': 'รองเท้า',
        'Footwear': 'รองเท้า',
        'Accessory': 'เครื่องประดับ',
        'Gem': 'อัญมณี',
        'Ammo': 'กระสุน / ลูกธนู'
    };

    const WEAPON_TYPE_TH = {
        'Bow': 'ธนู',
        'Dagger': 'มีดสั้น',
        'Sword': 'ดาบมือเดียว',
        'OneHandSword': 'ดาบมือเดียว',
        'TwoHandSword': 'ดาบสองมือ',
        'Spear': 'หอก',
        'TwoHandSpear': 'หอกสองมือ',
        'Axe': 'ขวาน',
        'Mace': 'กระบอง',
        'Staff': 'คทา',
        'Katar': 'กาตาร์',
        'Knuckle': 'สนับมือ',
        'Gun': 'ปืน',
        'Wand': 'ไม้กายสิทธิ์'
    };

    const ATTR_NAME_TH = {
        'MELEE_DEFENSE': 'DEF (กายภาพ)',
        'MAGIC_DEFENSE': 'MDEF (เวท)',
        'DEFENSE': 'DEF (กายภาพ)',
        'DEF': 'DEF',
        'MDEF': 'MDEF',
        'RANGE_ATTACK': 'ATK (ระยะไกล)',
        'RANGED_ATK': 'ATK (ระยะไกล)',
        'MELEE_ATTACK': 'ATK (ประชิด)',
        'MELEE_ATK': 'ATK (ประชิด)',
        'ATTACK': 'ATK',
        'ATK': 'ATK',
        'MAGIC_ATTACK': 'MATK (เวท)',
        'MATK': 'MATK (เวท)',
        'STR': 'STR',
        'AGI': 'AGI',
        'VIT': 'VIT',
        'INT': 'INT',
        'DEX': 'DEX',
        'LUK': 'LUK',
        'MAXHP': 'Max HP',
        'MAX_HP': 'Max HP',
        'MAXSP': 'Max SP',
        'MAX_SP': 'Max SP',
        'HP': 'HP',
        'SP': 'SP',
        'HIT': 'HIT',
        'FLEE': 'FLEE',
        'CRIT': 'CRIT',
        'CRITICAL': 'CRIT',
        'CRIT_DAMAGE': 'ดาเมจคริ',
        'CRIT_DMG': 'ดาเมจคริ',
        'ATTACK_SPEED': 'ASPD',
        'ASPD': 'ASPD',
        'MOVE_SPEED': 'ความเร็วเคลื่อนที่',
        'HEAL_POWER': 'พลังฮีล',
        'BLOCK_CHANCE': 'โอกาสบล็อก',
        'DAMAGE_REDUCTION': 'ลดความเสียหาย',
        'MELEE_DAMAGE_PERCENT': 'ดาเมจประชิด',
        'RANGED_DAMAGE_PERCENT': 'ดาเมจระยะไกล',
        'HP_DRAIN_ATTACK': 'ดูด HP',
        'SP_DRAIN_ATTACK': 'ดูด SP'
    };

    // ==========================================
    // IN-GAME OFFICIAL ICON LOADER & MANIFEST CACHE
    // ==========================================
    window.__itemIconManifest = null;
    try {
        const cachedManifest = localStorage.getItem('pelican_icon_manifest');
        if (cachedManifest) {
            window.__itemIconManifest = JSON.parse(cachedManifest);
        }
    } catch (e) {}

    function fetchIconManifest() {
        if (typeof fetch === 'function') {
            fetch('/art/icons/manifest.json', { cache: 'force-cache' })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data && (data.items || data.itemKeys)) {
                        window.__itemIconManifest = data;
                        try {
                            localStorage.setItem('pelican_icon_manifest', JSON.stringify(data));
                        } catch (e) {}
                        const modal = document.getElementById('pelican-data-modal');
                        if (modal && modal.style.display === 'flex' && typeof window.renderModalTab === 'function') {
                            window.renderModalTab('items');
                        }
                    }
                })
                .catch(() => {});
        }
    }
    fetchIconManifest();

    function getItemIconUrl(raw) {
        if (!raw) return null;
        const itemId = raw.itemId ?? raw.id ?? raw.item_id;
        const manifest = window.__itemIconManifest;
        if (manifest && manifest.items && itemId !== undefined && manifest.items[itemId]) {
            return '/art/icons/' + manifest.items[itemId];
        }
        if (manifest && manifest.itemKeys && raw.name) {
            const slug = String(raw.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (manifest.itemKeys[slug]) {
                return '/art/icons/' + manifest.itemKeys[slug];
            }
        }
        return null;
    }

    function getItemIconHtml(raw, size = 20) {
        const iconUrl = getItemIconUrl(raw);
        const fallbackEmoji = getItemIconEmoji(raw);
        if (iconUrl) {
            return `<img src="${iconUrl}" style="width: ${size}px; height: ${size}px; min-width: ${size}px; min-height: ${size}px; object-fit: contain; image-rendering: pixelated; vertical-align: middle; display: inline-block;" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" alt="" draggable="false" /><span style="display: none; vertical-align: middle;">${fallbackEmoji}</span>`;
        }
        return `<span style="vertical-align: middle; display: inline-block;">${fallbackEmoji}</span>`;
    }

    function getItemIconEmoji(raw) {
        if (!raw) return '📦';
        const type = raw.type || '';
        const equipType = raw.equipType || '';
        const weaponType = raw.weaponType || '';
        const name = (raw.name || '').toLowerCase();

        // 1. Cards (must match exact word 'card', not cardigan)
        if (type === 'Card' || /\bcard\b/i.test(name)) return '🎴';

        // 2. Ammunition
        if (name.includes('arrow') || equipType === 'Ammo') return '🏹';

        // 3. Weapons
        if (weaponType === 'Bow' || name.includes('bow')) return '🏹';
        if (weaponType === 'TwoHandSword' || weaponType === 'Sword' || weaponType === 'OneHandSword') return '⚔️';
        if (weaponType === 'Dagger' || name.includes('dagger')) return '🗡️';
        if (weaponType === 'Spear' || weaponType === 'TwoHandSpear' || name.includes('spear') || name.includes('lance') || name.includes('halberd') || name.includes('pike')) return '🔱';
        if (weaponType === 'Axe' || name.includes('axe')) return '🪓';
        if (weaponType === 'Knuckle' || name.includes('knuckle') || name.includes('claw')) return '🥊';
        if (weaponType === 'Staff' || weaponType === 'Wand' || weaponType === 'Rod' || name.includes('staff') || name.includes('wand')) return '🪄';
        if (weaponType === 'Mace' || name.includes('mace') || name.includes('hammer')) return '🔨';
        if (weaponType === 'Katar' || name.includes('katar')) return '🪒';
        if (weaponType === 'Gun' || name.includes('gun') || name.includes('revolver')) return '🔫';
        if (equipType === 'Weapon') return '⚔️';

        // 4. Equipment by equipType
        if (equipType === 'Shield' || name.includes('shield') || name.includes('guard') || name.includes('buckler')) return '🛡️';
        if (equipType === 'Armor' || name.includes('armor') || name.includes('mail') || name.includes('coat') || name.includes('suit') || name.includes('robe') || name.includes('plate') || name.includes('cardigan') || name.includes('protection')) return '🦺';
        if (equipType === 'Cape' || equipType === 'Garment' || name.includes('cape') || name.includes('muffler') || name.includes('hood') || name.includes('manteau') || name.includes('dragon breath') || name.includes('breath')) return '🧣';
        if (equipType === 'Boot' || equipType === 'Shoes' || equipType === 'Footwear' || name.includes('boot') || name.includes('shoes') || name.includes('greave') || name.includes('reincarnation')) return '👢';
        if (equipType === 'Helmet' || equipType === 'Head' || equipType === 'Headgear' || equipType === 'HeadMid' || name.includes('hat') || name.includes('cap') || name.includes('circlet') || name.includes('helm') || name.includes('ribbon') || name.includes('coronet') || name.includes('band') || name.includes('crown') || name.includes('glasses')) return '👑';
        if (equipType === 'Accessory' || name.includes('ring') || name.includes('clip') || name.includes('earring') || name.includes('brooch') || name.includes('necklace') || name.includes('glove')) return '💍';
        if (equipType === 'Gem' || name.includes('gem')) return '💎';

        // 5. Consumables / Potions / Wings
        if (name.includes('wing') || raw.itemId === 90311) return '🕊️';
        if (name.includes('potion') || raw.autoPotion) return '🧪';
        if (name.includes('scroll')) return '📜';
        if (type === 'Consumable') return '🍎';

        // 6. Materials / Ores / Enchantments
        if (type === 'Enchantment' || name.includes('rune') || name.includes('enchant')) return '🔮';
        if (type === 'Material' || type === 'Ore' || name.includes('ore') || name.includes('phracon') || name.includes('elunium') || name.includes('stone') || name.includes('iron') || name.includes('steel')) return '💎';
        if (type === 'Miscellaneous') return '🧩';

        return '📦';
    }

    function getOrCreatePelicanItemTooltip() {
        let tt = document.getElementById('pelican-item-tooltip');
        if (!tt) {
            tt = document.createElement('div');
            tt.id = 'pelican-item-tooltip';
            tt.style.cssText = `
                position: fixed;
                pointer-events: none;
                z-index: 10000005;
                width: 320px;
                max-width: 92vw;
                background: linear-gradient(180deg, #0e172a 0%, #0a0f1d 100%);
                border: 2px solid #d97706;
                border-radius: 12px;
                box-shadow: 0 12px 36px rgba(0,0,0,0.85), 0 0 20px rgba(217, 119, 6, 0.25);
                padding: 14px 16px;
                font-family: 'Segoe UI', Tahoma, -apple-system, sans-serif;
                color: #f1f5f9;
                font-size: 11.5px;
                line-height: 1.45;
                display: none;
                box-sizing: border-box;
            `;
            document.body.appendChild(tt);
        }
        return tt;
    }

    window.hidePelicanItemTooltip = function() {
        const tt = document.getElementById('pelican-item-tooltip');
        if (tt) {
            tt.style.display = 'none';
        }
    };

    window.movePelicanItemTooltip = function(e) {
        const tt = document.getElementById('pelican-item-tooltip');
        if (!tt || tt.style.display === 'none') return;

        const offset = 16;
        const padding = 12;
        const rect = tt.getBoundingClientRect();
        const width = rect.width || 320;
        const height = rect.height || 220;

        let x = e.clientX + offset;
        let y = e.clientY + offset;

        if (x + width > window.innerWidth - padding) {
            x = e.clientX - width - offset;
        }
        if (y + height > window.innerHeight - padding) {
            y = e.clientY - height - offset;
        }

        x = Math.max(padding, Math.min(x, window.innerWidth - width - padding));
        y = Math.max(padding, Math.min(y, window.innerHeight - height - padding));

        tt.style.left = `${Math.round(x)}px`;
        tt.style.top = `${Math.round(y)}px`;
    };

    window.showPelicanItemTooltip = function(idx, e) {
        if (!window.__modalFilteredItems || !window.__modalFilteredItems[idx]) return;
        const it = window.__modalFilteredItems[idx];
        const raw = it.raw || {};
        const tt = getOrCreatePelicanItemTooltip();

        // Rarity & Style
        const rarityKey = (raw.rarity || 'common').toLowerCase();
        const rarityInfo = ITEM_RARITY_MAP[rarityKey] || { th: raw.rarity || 'ทั่วไป', color: '#cbd5e1' };

        // Types
        const typeTH = ITEM_TYPE_TH[raw.type] || raw.type || 'ไอเทม';
        const equipTypeTH = EQUIP_TYPE_TH[raw.equipType] || raw.equipType || '';
        const weaponTypeTH = WEAPON_TYPE_TH[raw.weaponType] || raw.weaponType || '';

        // Sockets [x]
        const slotCount = raw.slots !== undefined ? raw.slots : (raw.maxSlots !== undefined ? raw.maxSlots : null);
        const titleSlotSuffix = (slotCount !== null && slotCount > 0) ? ` [${slotCount}]` : '';

        // Subtitle parts: อุปกรณ์ · อาวุธ · x1 · หายาก
        const subParts = [];
        if (typeTH) subParts.push(typeTH);
        if (equipTypeTH && equipTypeTH !== typeTH) subParts.push(equipTypeTH);
        else if (weaponTypeTH) subParts.push(weaponTypeTH);
        subParts.push(`x${it.qty || raw.qty || 1}`);
        subParts.push(`<span style="color: ${rarityInfo.color}; font-weight: 600;">${rarityInfo.th}</span>`);

        // Category & Level requirement line
        let categoryLine = '';
        if (weaponTypeTH || equipTypeTH) {
            categoryLine = `<div>ประเภท <span style="color: #fff; font-weight: 600;">${weaponTypeTH || equipTypeTH}</span> · ระดับ <span style="color: ${rarityInfo.color}; font-weight: bold;">${rarityInfo.th}</span></div>`;
        } else if (raw.type) {
            categoryLine = `<div>ประเภท <span style="color: #fff; font-weight: 600;">${typeTH}</span> · ระดับ <span style="color: ${rarityInfo.color}; font-weight: bold;">${rarityInfo.th}</span></div>`;
        }

        let levelReqLine = '';
        const minLvl = raw.levelReq ?? raw.minLevel ?? raw.reqLevel;
        if (minLvl !== undefined && minLvl > 0) {
            levelReqLine = `<div style="margin-top: 2px;">ต้อง Base Lv.<span style="color: #fde047; font-weight: bold;">${minLvl}</span></div>`;
        }

        // Base Attributes & Stats
        const statsList = [];
        if (Array.isArray(raw.attributes)) {
            raw.attributes.forEach(attr => {
                const name = ATTR_NAME_TH[attr.type] || attr.type || 'ATTR';
                const sign = (typeof attr.value === 'number' && attr.value > 0) ? '+' : '';
                statsList.push(`<span>${name} <b style="color: #4ade80;">${sign}${attr.value}</b></span>`);
            });
        } else if (typeof raw.attributes === 'object' && raw.attributes !== null) {
            for (const [k, v] of Object.entries(raw.attributes)) {
                const name = ATTR_NAME_TH[k] || k;
                const sign = (typeof v === 'number' && v > 0) ? '+' : '';
                statsList.push(`<span>${name} <b style="color: #4ade80;">${sign}${v}</b></span>`);
            }
        }

        // Primary & Secondary Affixes
        const primaryAffixes = [];
        const secondaryAffixes = [];
        if (Array.isArray(raw.affixes)) {
            raw.affixes.forEach(aff => {
                const name = ATTR_NAME_TH[aff.type] || aff.type || 'Opt';
                const isPercent = aff.type && (aff.type.includes('CRIT') || aff.type.includes('PERCENT') || aff.type.includes('RATE') || aff.type.includes('HEAL') || aff.type.includes('REDUCTION') || aff.type.includes('BLOCK'));
                const sign = (typeof aff.value === 'number' && aff.value > 0) ? '+' : '';
                const valStr = `${sign}${aff.value}${isPercent ? '%' : ''}`;
                const text = `<span>${name} <b style="color: #4ade80;">${valStr}</b></span>`;
                if (aff.category === 'primary' || aff.pool === 'status') {
                    primaryAffixes.push(text);
                } else {
                    secondaryAffixes.push(text);
                }
            });
        }

        // Combine base stats & primary affixes
        let statBlockHtml = '';
        if (statsList.length > 0 || primaryAffixes.length > 0) {
            let leftStats = statsList.join('&nbsp;&nbsp;');
            let rightAffixes = primaryAffixes.join('&nbsp;&nbsp;');
            if (leftStats && rightAffixes) {
                statBlockHtml = `<div style="margin-top: 5px; font-size: 11px; color: #cbd5e1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                    <div>${leftStats}</div>
                    <span style="color: #475569;">|</span>
                    <div>${rightAffixes}</div>
                </div>`;
            } else {
                statBlockHtml = `<div style="margin-top: 5px; font-size: 11px; color: #cbd5e1; display: flex; flex-wrap: wrap; gap: 8px;">
                    ${leftStats || rightAffixes}
                </div>`;
            }
        }

        // Special affixes / Card sockets / Job restrictions (Orange left border accent)
        const accentDetails = [];
        if (secondaryAffixes.length > 0) {
            accentDetails.push(secondaryAffixes.join('&nbsp;&nbsp;'));
        }
        if (slotCount !== null && slotCount > 0) {
            const socketed = Array.isArray(raw.cards) ? raw.cards.length : 0;
            accentDetails.push(`<span>ช่องการ์ด ${socketed}/${slotCount}</span>`);
        }
        if (Array.isArray(raw.jobs) && raw.jobs.length > 0) {
            accentDetails.push(`<span>ใส่ได้: <span style="color: #f8fafc; font-weight: 500;">${raw.jobs.join(', ')}</span></span>`);
        }

        let accentBlockHtml = '';
        if (accentDetails.length > 0) {
            accentBlockHtml = `
                <div style="margin-top: 6px; border-left: 3px solid #f59e0b; padding-left: 8px; font-size: 10.5px; color: #fde68a; display: flex; flex-direction: column; gap: 3px;">
                    ${accentDetails.map(d => `<div>${d}</div>`).join('')}
                </div>
            `;
        }

        // Effects / Descriptions (for Consumables, Ores, Cards)
        let effectsHtml = '';
        if (Array.isArray(raw.effects) && raw.effects.length > 0) {
            effectsHtml = `
                <div style="margin-top: 6px; font-size: 11px; color: #38bdf8; display: flex; flex-direction: column; gap: 2px;">
                    ${raw.effects.map(eff => `<div>✨ ${eff}</div>`).join('')}
                </div>
            `;
        } else if (raw.description || raw.desc) {
            effectsHtml = `
                <div style="margin-top: 6px; font-size: 10.5px; color: #94a3b8; line-height: 1.35;">
                    ${raw.description || raw.desc}
                </div>
            `;
        }

        // Weight & Economy
        const weightVal = raw.weight !== undefined ? raw.weight : '-';
        const sellVal = raw.sellPrice !== undefined ? raw.sellPrice : (raw.price || '-');
        const econHtml = `
            <div style="margin-top: 8px; font-size: 10.5px; color: #94a3b8;">
                น้ำหนัก <span style="color: #e2e8f0; font-weight: 600;">${weightVal}</span> · ขาย <span style="color: #e2e8f0; font-weight: 600;">${sellVal} z</span>
            </div>
        `;

        // Footer action hint
        let footerText = 'ดับเบิลคลิกเพื่อสวม · ลากไปหน้าอุปกรณ์';
        if (raw.type === 'Consumable') {
            footerText = 'ดับเบิลคลิกเพื่อใช้ · ลากไปช่องคีย์ลัด';
        } else if (raw.type === 'Card' || (it.name || '').includes('Card')) {
            footerText = 'ดับเบิลคลิกเพื่อผสมการ์ดลงในอุปกรณ์';
        } else if (raw.equipType === 'Ammo' || (it.name || '').includes('Arrow')) {
            footerText = 'ดับเบิลคลิกเพื่อสวมใส่ลูกธนู';
        } else if (raw.type === 'Material' || raw.type === 'Ore') {
            footerText = 'วัตถุดิบสำหรับอัปเกรดและคราฟต์ไอเทม';
        }

        const iconHtml = getItemIconHtml(raw, 36);

        // Assemble Full Tooltip
        tt.innerHTML = `
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="width: 44px; height: 44px; min-width: 44px; background: rgba(15, 23, 42, 0.85); border: 1.5px solid #d97706; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: inset 0 0 8px rgba(0,0,0,0.5); overflow: hidden;">
                    ${iconHtml}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13.5px; font-weight: bold; color: #67e8f9; text-shadow: 0 1px 3px rgba(0,0,0,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${it.name || 'Unknown Item'}${titleSlotSuffix}
                    </div>
                    <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">
                        ${subParts.join(' · ')}
                    </div>
                </div>
            </div>

            <div style="font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid rgba(51, 65, 85, 0.5); padding-top: 6px;">
                ${categoryLine}
                ${levelReqLine}
            </div>

            ${statBlockHtml}
            ${accentBlockHtml}
            ${effectsHtml}
            ${econHtml}

            <div style="height: 1px; background: rgba(51, 65, 85, 0.6); margin: 8px 0 6px 0;"></div>
            <div style="font-size: 10px; color: #38bdf8; font-weight: 500;">
                ${footerText}
            </div>
        `;

        tt.style.display = 'block';
        window.movePelicanItemTooltip(e);
    };

    // Recovery function to scan packet logs for inventory payload if memory was reset
    window.tryRecoverInventoryFromPackets = function() {
        if (window.__latestInventory && (window.__latestInventory.slots !== undefined || Array.isArray(window.__latestInventory.items))) {
            return window.__latestInventory;
        }
        if (!window.__packetLogs || window.__packetLogs.length === 0 || !window.msgpack) return null;

        for (let i = window.__packetLogs.length - 1; i >= 0; i--) {
            const p = window.__packetLogs[i];
            if (p && p.dir === 'IN' && p.ascii && (p.ascii.includes('inventory') || p.ascii.includes('slots') || p.ascii.includes('weightLimit'))) {
                try {
                    const bytes = new Uint8Array(p.hex.split(' ').map(h => parseInt(h, 16)));
                    const offsetsToScan = [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15];
                    for (const off of offsetsToScan) {
                        if (off >= bytes.length - 10) continue;
                        try {
                            const dec = window.msgpack.decode(bytes.slice(off));
                            if (dec && typeof dec === 'object' && (dec.slots !== undefined || Array.isArray(dec.items))) {
                                window.__latestInventory = dec;
                                try { localStorage.setItem('pelican_latest_inventory', JSON.stringify(dec)); } catch(e) {}
                                return dec;
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
        }
        return null;
    };

    // Recovery function to scan packet logs for character / zeny payload
    window.tryRecoverCharacterFromPackets = function() {
        if (typeof window.__currentZeny === 'number') {
            return window.__currentZeny;
        }
        const cached = localStorage.getItem('pelican_current_zeny');
        if (cached && !isNaN(Number(cached))) {
            window.__currentZeny = Number(cached);
        }
        if (!window.__packetLogs || window.__packetLogs.length === 0 || !window.msgpack) {
            return (typeof window.__currentZeny === 'number') ? window.__currentZeny : null;
        }

        for (let i = window.__packetLogs.length - 1; i >= 0; i--) {
            const p = window.__packetLogs[i];
            if (p && p.dir === 'IN' && p.ascii && p.ascii.includes('character') && p.ascii.includes('pets')) {
                try {
                    const bytes = new Uint8Array(p.hex.split(' ').map(h => parseInt(h, 16)));
                    const dec = window.msgpack.decode(bytes.slice(11));
                    if (dec && typeof dec === 'object' && typeof dec.zeny === 'number') {
                        window.__latestCharacterData = dec;
                        window.__currentZeny = dec.zeny;
                        try { localStorage.setItem('pelican_current_zeny', String(dec.zeny)); } catch(e) {}
                        return dec.zeny;
                    }
                } catch(e) {}
            }
        }
        return (typeof window.__currentZeny === 'number') ? window.__currentZeny : null;
    };

    // ==========================================
    // IN-GAME DATA VIEWER MODAL & INSPECTOR
    // ==========================================
    window.__currentModalTab = 'items';
    window.__isInspectorCollapsed = false;
    window.__inspectorBackdropActive = true;

    window.toggleInspectorCollapse = function(forceState) {
        const modalWin = document.getElementById('p-modal-window');
        const toolbar = document.getElementById('p-modal-toolbar');
        const content = document.getElementById('p-modal-content');
        const collapseBtn = document.getElementById('p-modal-collapse-btn');
        const backdrop = document.getElementById('p-modal-backdrop');
        if (!modalWin) return;

        const shouldCollapse = (typeof forceState === 'boolean') ? forceState : !window.__isInspectorCollapsed;
        window.__isInspectorCollapsed = shouldCollapse;

        if (shouldCollapse) {
            if (toolbar) toolbar.style.display = 'none';
            if (content) content.style.display = 'none';
            modalWin.style.height = 'auto';
            modalWin.style.maxHeight = '48px';
            modalWin.style.width = '520px';
            if (collapseBtn) {
                collapseBtn.innerHTML = '➕';
                collapseBtn.title = 'ขยายหน้าต่าง (ดับเบิ้ลคลิกแถบหัว)';
            }
            if (backdrop) backdrop.style.display = 'none';
        } else {
            if (toolbar) toolbar.style.display = 'flex';
            if (content) content.style.display = 'block';
            modalWin.style.height = '580px';
            modalWin.style.maxHeight = '90vh';
            modalWin.style.width = '800px';
            if (collapseBtn) {
                collapseBtn.innerHTML = '−';
                collapseBtn.title = 'พับหน้าต่างเก็บ (ดับเบิ้ลคลิกแถบหัว)';
            }
            if (backdrop && window.__inspectorBackdropActive) {
                backdrop.style.display = 'block';
            }
        }
    };

    window.toggleInspectorBackdrop = function() {
        window.__inspectorBackdropActive = !window.__inspectorBackdropActive;
        const backdrop = document.getElementById('p-modal-backdrop');
        const btn = document.getElementById('p-modal-backdrop-btn');
        if (backdrop) {
            if (!window.__inspectorBackdropActive || window.__isInspectorCollapsed) {
                backdrop.style.display = 'none';
            } else {
                backdrop.style.display = 'block';
            }
        }
        if (btn) {
            btn.innerHTML = window.__inspectorBackdropActive ? '👁️ ม่านดำ: เปิด' : '🕶️ ม่านดำ: ปิด';
            btn.style.color = window.__inspectorBackdropActive ? '#38bdf8' : '#94a3b8';
            btn.style.borderColor = window.__inspectorBackdropActive ? '#0284c7' : '#334155';
        }
        try {
            localStorage.setItem('pelican_inspector_backdrop', window.__inspectorBackdropActive ? '1' : '0');
        } catch(e) {}
    };

    window.showDataViewerModal = function(activeTab = 'items') {
        let modal = document.getElementById('pelican-data-modal');
        if (!modal) {
            let savedPos = null;
            try {
                savedPos = JSON.parse(localStorage.getItem('pelican_inspector_pos') || 'null');
                const storedB = localStorage.getItem('pelican_inspector_backdrop');
                if (storedB !== null) window.__inspectorBackdropActive = (storedB === '1');
            } catch(e) {}

            const winW = window.innerWidth || document.documentElement.clientWidth || 1024;
            const winH = window.innerHeight || document.documentElement.clientHeight || 768;
            let initLeft = Math.max(10, Math.floor((winW - 800) / 2));
            let initTop = Math.max(10, Math.floor((winH - 580) / 2));
            if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
                initLeft = Math.max(5, Math.min(winW - 120, savedPos.left));
                initTop = Math.max(5, Math.min(winH - 50, savedPos.top));
            }

            modal = document.createElement('div');
            modal.id = 'pelican-data-modal';
            modal.innerHTML = `
                <div id="p-modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(3px); z-index: 999998; display: ${window.__inspectorBackdropActive ? 'block' : 'none'};"></div>
                <div id="p-modal-window" style="position: fixed; left: ${initLeft}px; top: ${initTop}px; width: 800px; max-width: 95vw; height: 580px; max-height: 90vh; background: #0b1329; border: 1.5px solid #38bdf8; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.9), 0 0 20px rgba(56,189,248,0.25); z-index: 999999; display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, sans-serif; color: #f8fafc; overflow: hidden;">
                    <!-- Header (Drag Handle) -->
                    <div id="p-modal-header" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #1e293b; border-bottom: 1px solid #334155; cursor: grab; user-select: none;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16px;">🔍</span>
                            <span style="font-weight: bold; font-size: 13px; color: #38bdf8; letter-spacing: 0.5px;">Aetheria Data & Packet Inspector</span>
                            <span style="font-size: 10px; background: rgba(56,189,248,0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: bold;">LIVE</span>
                            <span style="font-size: 10px; color: #64748b; margin-left: 2px;">(ลากขยับ / ดับเบิ้ลคลิกเพื่อพับ)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button id="p-modal-copy-btn" title="คัดลอกข้อมูล JSON แท็บปัจจุบัน" style="background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold;">
                                📋 คัดลอก JSON
                            </button>
                            <button id="p-modal-backdrop-btn" title="สลับม่านดำพื้นหลัง (เปิด/ปิดเพื่อให้มองทะลุเกมและคลิกเกมได้)" style="background: #0f172a; color: ${window.__inspectorBackdropActive ? '#38bdf8' : '#94a3b8'}; border: 1px solid ${window.__inspectorBackdropActive ? '#0284c7' : '#334155'}; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;">
                                ${window.__inspectorBackdropActive ? '👁️ ม่านดำ: เปิด' : '🕶️ ม่านดำ: ปิด'}
                            </button>
                            <button id="p-modal-collapse-btn" title="พับหน้าต่างเก็บ (ดับเบิ้ลคลิกแถบหัวได้ด้วย)" style="background: #334155; color: #38bdf8; border: 1px solid #475569; width: 28px; height: 28px; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;">
                                −
                            </button>
                            <button id="p-modal-close-btn" title="ปิดหน้าต่าง" style="background: #ef4444; color: white; border: none; width: 28px; height: 28px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer;">
                                ✖
                            </button>
                        </div>
                    </div>

                    <!-- Toolbar -->
                    <div id="p-modal-toolbar" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #0f172a; border-bottom: 1px solid #1e293b; gap: 10px; flex-wrap: wrap;">
                        <div style="display: flex; gap: 6px;">
                            <button class="p-mod-tab-btn" data-tab="items" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">📦 กระเป๋า & อุปกรณ์</button>
                            <button class="p-mod-tab-btn" data-tab="market" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">🛒 ตลาดกลาง (Market)</button>
                            <button class="p-mod-tab-btn" data-tab="maps" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">🗺️ แผนที่โลก (25 โซน)</button>
                            <button class="p-mod-tab-btn" data-tab="packets" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">📜 Packets ล่าสุด</button>
                            <button class="p-mod-tab-btn" data-tab="state" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">🕹️ สถานะตัวละคร</button>
                        </div>
                        <div style="flex: 1; min-width: 180px; max-width: 250px;">
                            <input type="text" id="p-modal-search" placeholder="🔎 ค้นหาชื่อ / ID / Opcode..." style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; color: #fff; padding: 5px 10px; border-radius: 6px; font-size: 11px;">
                        </div>
                    </div>

                    <!-- Content Area -->
                    <div id="p-modal-content" style="flex: 1; overflow-y: auto; padding: 12px 16px; font-size: 12px; background: #090e1a;">
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Drag Handle Logic
            const header = document.getElementById('p-modal-header');
            const modalWin = document.getElementById('p-modal-window');
            let isDragging = false;
            let startOffsetX = 0;
            let startOffsetY = 0;

            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
                isDragging = true;
                header.style.cursor = 'grabbing';
                startOffsetX = e.clientX - modalWin.offsetLeft;
                startOffsetY = e.clientY - modalWin.offsetTop;
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const winW = window.innerWidth || document.documentElement.clientWidth || 1024;
                const winH = window.innerHeight || document.documentElement.clientHeight || 768;
                const newLeft = Math.max(5, Math.min(winW - 100, e.clientX - startOffsetX));
                const newTop = Math.max(5, Math.min(winH - 45, e.clientY - startOffsetY));
                modalWin.style.left = newLeft + 'px';
                modalWin.style.top = newTop + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    header.style.cursor = 'grab';
                    try {
                        localStorage.setItem('pelican_inspector_pos', JSON.stringify({
                            left: parseInt(modalWin.style.left, 10),
                            top: parseInt(modalWin.style.top, 10)
                        }));
                    } catch(e) {}
                }
            });

            // Double click header to fold/unfold
            header.addEventListener('dblclick', (e) => {
                if (e.target.closest('button')) return;
                window.toggleInspectorCollapse();
            });

            document.getElementById('p-modal-collapse-btn').onclick = () => {
                window.toggleInspectorCollapse();
            };

            document.getElementById('p-modal-backdrop-btn').onclick = () => {
                window.toggleInspectorBackdrop();
            };

            document.getElementById('p-modal-close-btn').onclick = () => {
                modal.style.display = 'none';
                if (window.hidePelicanItemTooltip) window.hidePelicanItemTooltip();
            };
            document.getElementById('p-modal-backdrop').onclick = () => {
                modal.style.display = 'none';
                if (window.hidePelicanItemTooltip) window.hidePelicanItemTooltip();
            };

            modal.querySelectorAll('.p-mod-tab-btn').forEach(btn => {
                btn.onclick = () => {
                    const target = btn.getAttribute('data-tab');
                    window.renderModalTab(target);
                };
            });

            document.getElementById('p-modal-search').oninput = (e) => {
                window.renderModalTab(window.__currentModalTab || 'items', e.target.value.toLowerCase().trim());
            };

            document.getElementById('p-modal-copy-btn').onclick = () => {
                let dataToCopy = null;
                if (window.__currentModalTab === 'items') {
                    dataToCopy = window.dumpDeepInventory();
                } else if (window.__currentModalTab === 'market') {
                    dataToCopy = window.dumpMarketData ? window.dumpMarketData() : [];
                } else if (window.__currentModalTab === 'maps') {
                    dataToCopy = window.dumpMapData();
                } else if (window.__currentModalTab === 'packets') {
                    dataToCopy = window.__packetLogs || [];
                } else {
                    dataToCopy = window.dumpGameState();
                }
                const btn = document.getElementById('p-modal-copy-btn');
                const orig = btn.innerText;
                window.safeCopyToClipboard(JSON.stringify(dataToCopy, null, 2), null, (ok) => {
                    if (ok) {
                        btn.innerText = '✅ คัดลอกสำเร็จ!';
                        setTimeout(() => btn.innerText = orig, 1500);
                    }
                });
            };
        }

        modal.style.display = 'block';

        // Auto-recover or Auto-sync inventory if empty
        if (activeTab === 'items' && !window.__latestInventory) {
            try {
                const cached = localStorage.getItem('pelican_latest_inventory');
                if (cached) window.__latestInventory = JSON.parse(cached);
            } catch(e) {}

            if (!window.__latestInventory && typeof window.tryRecoverInventoryFromPackets === 'function') {
                window.tryRecoverInventoryFromPackets();
            }

            if (!window.__latestInventory && typeof window.refreshInventoryAndWeight === 'function') {
                window.refreshInventoryAndWeight(() => {
                    if (window.__currentModalTab === 'items') window.renderModalTab('items');
                }, true);
            }
        }

        window.renderModalTab(activeTab);
    };

    window.syncMarketFiltersFromUI = function() {
        const qInput = document.getElementById('p-mod-mk-q') || document.getElementById('p-mk-search-query');
        const catSelect = document.getElementById('p-mod-mk-cat');
        const refInput = document.getElementById('p-mod-mk-refine');
        const priceInput = document.getElementById('p-mod-mk-price');
        const stat1Select = document.getElementById('p-mod-mk-stat1');
        const stat1MinInput = document.getElementById('p-mod-mk-stat1-min');
        const stat2Select = document.getElementById('p-mod-mk-stat2');
        const stat2MinInput = document.getElementById('p-mod-mk-stat2-min');
        const modeSelect = document.getElementById('p-mod-mk-mode');
        const autoDeepInput = document.getElementById('p-mod-mk-auto-deep');
        const scanDepthSelect = document.getElementById('p-mod-mk-scan-depth');

        if (!window.__marketFilterConfig) window.__marketFilterConfig = {};
        if (qInput) window.__marketFilterConfig.q = qInput.value.trim();
        if (catSelect) window.__marketFilterConfig.category = catSelect.value;
        if (refInput) window.__marketFilterConfig.minRefine = parseInt(refInput.value) || 0;
        if (priceInput) window.__marketFilterConfig.maxPrice = parseInt(priceInput.value) || 0;
        if (stat1Select) window.__marketFilterConfig.statType1 = stat1Select.value;
        if (stat1MinInput) window.__marketFilterConfig.statMinVal1 = parseInt(stat1MinInput.value) || 1;
        if (stat2Select) window.__marketFilterConfig.statType2 = stat2Select.value;
        if (stat2MinInput) window.__marketFilterConfig.statMinVal2 = parseInt(stat2MinInput.value) || 1;
        if (modeSelect) window.__marketFilterConfig.statMatchMode = modeSelect.value;
        if (autoDeepInput) window.__marketFilterConfig.autoDeepScan = autoDeepInput.checked;
        if (scanDepthSelect) window.__marketFilterConfig.scanDepth = scanDepthSelect.value;

        saveMarketFilterConfig();
        const matched = window.applyMarketFilters();
        return matched;
    };

    window.renderMarketRowsHtml = function(results, cfg) {
        cfg = cfg || window.__marketFilterConfig || {};
        if (!results || results.length === 0) {
            const totalServer = window.__latestMarketResults?.total || 0;
            const cachedCount = (window.__marketAllListings || []).length;
            const hasOptions = (cfg && ((cfg.statType1 && cfg.statType1 !== 'none') || (cfg.statType2 && cfg.statType2 !== 'none')));
            const hintMsg = (hasOptions && cachedCount <= 20 && totalServer > 20)
                ? `เซิร์ฟเวอร์ส่งมาแค่ 20 รายการแรก (ราคาถูกสุด) ซึ่งยังไม่มี Option ที่คุณเลือก แต่ยังมีอีก <b>${totalServer - cachedCount} รายการ</b> ในหน้าถัดไป!`
                : `ลองขยายช่วงราคา, ปรับเงื่อนไข Option หรือคลิกสแกนค้นหาหน้าถัดไป`;

            return `
                <tr>
                    <td colspan="7" style="padding: 24px; text-align: center; color: #64748b; border: 1px solid #1e293b; background: rgba(15, 23, 42, 0.4);">
                        <div style="font-size: 13px; font-weight: bold; color: #cbd5e1; margin-bottom: 6px;">⚠️ ไม่พบรายการไอเทมที่ตรงเงื่อนไขในข้อมูลปัจจุบัน</div>
                        <div style="font-size: 11px; color: #94a3b8; max-width: 520px; margin: 0 auto 12px auto; line-height: 1.4;">
                            ${hintMsg}
                        </div>
                        <div style="display: flex; justify-content: center; gap: 8px;">
                            <button onclick="window.startMarketMultiPageScan('all');" style="background: linear-gradient(135deg, #7c3aed, #9333ea); color: #fff; border: 1px solid #c084fc; padding: 6px 16px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; box-shadow: 0 0 12px rgba(147, 51, 234, 0.4);">⚡ สแกนค้นหาทุกหน้าทันที (Deep Scan All Pages)</button>
                            <button onclick="window.executeMarketSearch();" style="background: #0284c7; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">🔍 ค้นหาใหม่</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        return results.slice(0, 80).map((listing, idx) => {
            const it = listing.item || {};
            const rarityKey = (it.rarity || 'common').toLowerCase();
            const rarityInfo = (typeof ITEM_RARITY_MAP !== 'undefined' && ITEM_RARITY_MAP[rarityKey]) ? ITEM_RARITY_MAP[rarityKey] : { th: 'ทั่วไป', color: '#cbd5e1' };
            const refBadge = it.refine ? `<span style="background: rgba(168, 85, 247, 0.25); border: 1px solid #c084fc; color: #e9d5ff; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">+${it.refine}</span>` : '<span style="color: #64748b;">+0</span>';

            const slotCount = it.slots !== undefined ? it.slots : null;
            const slotSuffix = (slotCount !== null && slotCount > 0) ? ` [${slotCount}]` : '';

            let affHtml = '';
            if (Array.isArray(it.affixes) && it.affixes.length > 0) {
                affHtml = it.affixes.map(aff => {
                    const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[aff.type]) ? STAT_NAMES_MAP[aff.type] : { short: aff.type };
                    const valStr = (aff.mode === 'increasedPercent' || String(aff.type).includes('PERCENT') || String(aff.type).includes('DAMAGE')) ? `+${aff.value}%` : `+${aff.value}`;
                    const isMatch = (cfg.statType1 && cfg.statType1 !== 'none' && String(aff.type).toUpperCase() === cfg.statType1.toUpperCase()) ||
                                    (cfg.statType2 && cfg.statType2 !== 'none' && String(aff.type).toUpperCase() === cfg.statType2.toUpperCase());

                    const bg = isMatch ? 'rgba(234, 179, 8, 0.25)' : (aff.category === 'special' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(34, 197, 94, 0.15)');
                    const border = isMatch ? '#eab308' : (aff.category === 'special' ? '#c084fc' : '#22c55e');
                    const color = isMatch ? '#fef08a' : (aff.category === 'special' ? '#e9d5ff' : '#86efac');
                    const glow = isMatch ? 'box-shadow: 0 0 6px rgba(234, 179, 8, 0.5);' : '';

                    return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; color: ${color}; padding: 1px 5px; border-radius: 4px; font-size: 10px; margin: 1px 3px 1px 0; font-weight: 500; ${glow}">${sInfo.short || aff.type} <b>${valStr}</b></span>`;
                }).join('');
            } else {
                affHtml = '<span style="color: #64748b; font-size: 10px;">-</span>';
            }

            const bg = idx % 2 === 0 ? 'background: rgba(15, 23, 42, 0.6);' : 'background: rgba(30, 41, 59, 0.4);';
            const buyBtnText = (listing.auctionEndsAt && listing.auctionEndsAt > Date.now()) ? '🔨 ประมูล' : '🛒 ซื้อ';
            const buyBtnBg = (listing.auctionEndsAt && listing.auctionEndsAt > Date.now()) ? '#eab308' : '#0284c7';

            const qty = listing.qty || listing.quantity || listing.amount || it.qty || it.amount || 1;
            const qtyBadge = (qty > 1) ? `<b class="mk-qty" style="color: #fde047; font-size: 11px; margin-left: 2px; font-weight: bold; background: rgba(234, 179, 8, 0.2); border: 1px solid rgba(234, 179, 8, 0.45); padding: 1px 5px; border-radius: 4px;">×${qty.toLocaleString()}</b>` : '';
            const unitPrice = (qty > 1) ? Math.round(Number(listing.price) / qty) : null;
            const priceHtml = (unitPrice !== null) ? `
                <div style="font-weight: bold; color: #00ffcc; line-height: 1.2;">${Number(listing.price).toLocaleString()} z</div>
                <div style="font-size: 9px; color: #94a3b8; font-weight: normal; margin-top: 1px;">(${unitPrice.toLocaleString()} z ต่อชิ้น)</div>
            ` : `
                <span style="font-weight: bold; color: #00ffcc;">${Number(listing.price).toLocaleString()} z</span>
            `;
            const tooltipData = { ...it, qty, price: listing.price, sellerName: listing.sellerName };
            const iconHtml = (typeof getItemIconHtml === 'function') ? getItemIconHtml(it, 22) : '';

            return `
                <tr style="${bg} border-bottom: 1px solid #1e293b;" onmouseenter="window.showPelicanMarketItemTooltip(${JSON.stringify(tooltipData).replace(/"/g, '&quot;')}, event)" onmousemove="window.movePelicanItemTooltip(event)" onmouseleave="window.hidePelicanItemTooltip()">
                    <td style="padding: 6px 8px; border: 1px solid #334155; text-align: center; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 6px 8px; border: 1px solid #334155;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${iconHtml}
                            <span style="font-weight: bold; color: ${rarityInfo.color};">${it.name || 'ไอเทม'}${slotSuffix}</span>
                            ${qtyBadge}
                            <span style="font-size: 9.5px; color: ${rarityInfo.color}; opacity: 0.85;">(${rarityInfo.th})</span>
                        </div>
                    </td>
                    <td style="padding: 6px 8px; border: 1px solid #334155; text-align: center;">${refBadge}</td>
                    <td style="padding: 6px 8px; border: 1px solid #334155;">${affHtml}</td>
                    <td style="padding: 6px 8px; border: 1px solid #334155; text-align: right;">${priceHtml}</td>
                    <td style="padding: 6px 8px; border: 1px solid #334155; color: #cbd5e1;">${listing.sellerName || '-'}</td>
                    <td style="padding: 6px 8px; border: 1px solid #334155; text-align: center;">
                        <button onclick="window.buyMarketListing(${listing.listingId}, ${listing.price}, '${(it.name || '').replace(/'/g, "\\'")}', '${(listing.sellerName || '').replace(/'/g, "\\'")}', this)" style="background: ${buyBtnBg}; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer; transition: all 0.15s ease;">${buyBtnText}</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    window.toggleMarketScanFromModal = function() {
        if (window.__isMarketScanning) {
            window.stopMarketScan();
        } else {
            const depthSelect = document.getElementById('p-mod-mk-scan-depth');
            const depthVal = depthSelect ? depthSelect.value : 'all';
            const targetPages = (depthVal === 'all') ? 'all' : (parseInt(depthVal) || 5);
            window.startMarketMultiPageScan(targetPages);
        }
    };

    window.renderModalTab = function(tabName, query = '') {
        window.__currentModalTab = tabName;
        if (window.hidePelicanItemTooltip) window.hidePelicanItemTooltip();
        const modal = document.getElementById('pelican-data-modal');
        if (!modal) return;

        // Update tab button styles
        modal.querySelectorAll('.p-mod-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.style.background = '#0284c7';
                btn.style.color = '#fff';
                btn.style.borderColor = '#38bdf8';
            } else {
                btn.style.background = '#1e293b';
                btn.style.color = '#94a3b8';
                btn.style.borderColor = '#334155';
            }
        });

        const container = document.getElementById('p-modal-content');
        if (!container) return;

        if (tabName === 'items') {
            if (!window.__latestInventory) {
                try {
                    const cached = localStorage.getItem('pelican_latest_inventory');
                    if (cached) window.__latestInventory = JSON.parse(cached);
                } catch(e) {}
            }
            if (!window.__latestInventory && typeof window.tryRecoverInventoryFromPackets === 'function') {
                window.tryRecoverInventoryFromPackets();
            }

            const rawInv = window.__latestInventory;
            const items = [];

            // Extract items: check rawInv.items first, else scan recursively
            if (rawInv && Array.isArray(rawInv.items)) {
                rawInv.items.forEach(obj => {
                    if (!obj) return;
                    const id = obj.itemId ?? obj.id ?? obj.item_id ?? obj.code;
                    const name = obj.name ?? obj.itemName ?? obj.title;
                    if (id !== undefined || name !== undefined) {
                        items.push({
                            id: id,
                            name: name || `Item_${id}`,
                            qty: obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 1,
                            slot: obj.slot ?? obj.idx ?? '-',
                            raw: obj
                        });
                    }
                });
            } else if (rawInv) {
                function scanRaw(obj) {
                    if (!obj) return;
                    if (Array.isArray(obj)) {
                        obj.forEach(scanRaw);
                    } else if (typeof obj === 'object') {
                        const id = obj.itemId ?? obj.id ?? obj.item_id ?? obj.code;
                        const name = obj.name ?? obj.itemName ?? obj.title;
                        if (id !== undefined || name !== undefined) {
                            items.push({
                                id: id,
                                name: name || `Item_${id}`,
                                qty: obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 1,
                                slot: obj.slot ?? obj.idx ?? '-',
                                raw: obj
                            });
                        }
                        for (const k in obj) {
                            if (typeof obj[k] === 'object') scanRaw(obj[k]);
                        }
                    }
                }
                scanRaw(rawInv);
            }

            // Sort by bag slot
            items.sort((a, b) => {
                const sa = typeof a.slot === 'number' ? a.slot : parseInt(a.slot);
                const sb = typeof b.slot === 'number' ? b.slot : parseInt(b.slot);
                if (!isNaN(sa) && !isNaN(sb)) return sa - sb;
                return 0;
            });

            const filteredItems = items.filter(it => {
                if (!query) return true;
                return (String(it.name).toLowerCase().includes(query) || String(it.id).includes(query) || String(it.slot).includes(query));
            });

            window.__modalFilteredItems = filteredItems;

            let html = `
                <style>
                    .p-item-row:hover { background: rgba(56, 189, 248, 0.15) !important; }
                </style>
            `;

            if (!rawInv) {
                html += `
                    <div style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; border-radius: 8px; padding: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <span style="color: #fde047;">⚠️ ยังไม่พบ Packet กระเป๋าในหน่วยความจำ (กดดึงข้อมูลเพื่อเชื่อมต่อกับเซิร์ฟเวอร์อัตโนมัติ)</span>
                        <div style="display: flex; gap: 6px;">
                            <button onclick="window.refreshInventoryAndWeight(() => window.renderModalTab('items'), true)" style="background: #0284c7; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px;">🔄 ดึงข้อมูลอัตโนมัติ (Sync Bag)</button>
                            <button onclick="window.pressKey('i')" style="background: #eab308; color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px;">🎒 เปิดกระเป๋า (I)</button>
                        </div>
                    </div>
                `;
            }

            html += `
                <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: #38bdf8;">📦 รายการไอเทมจากเซิร์ฟเวอร์ (ตรวจพบ ${items.length} รายการ):</span>
                    <span style="color: #eab308; font-size: 11px;">💡 ชี้เมาส์ที่แถวไอเทมเพื่อดูรายละเอียดและสเตตัสในเกม</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; text-align: left;">
                            <th style="padding: 6px 8px; border: 1px solid #334155;">Slot</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">ชื่อไอเทม</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">Item ID (Dec / Hex)</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">จำนวน</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">ประเภท</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (filteredItems.length === 0) {
                html += `<tr><td colspan="5" style="text-align: center; padding: 16px; color: #64748b;">ไม่พบไอเทมที่ตรงกับคำค้นหา</td></tr>`;
            } else {
                filteredItems.forEach((it, idx) => {
                    const hexId = it.id ? '0x' + parseInt(it.id).toString(16) : '-';
                    const isArrow = (it.id >= 90030 && it.id <= 90039) || String(it.name).toLowerCase().includes('arrow') || String(it.name).includes('ลูกธนู');
                    const iconHtml = getItemIconHtml(it.raw, 20);

                    let categoryBadge = '';
                    if (isArrow) {
                        categoryBadge = '<span style="color: #22c55e; font-weight: bold;">🏹 ลูกธนู</span>';
                    } else if (it.raw?.type === 'Equipment') {
                        if (it.raw?.equipType === 'Weapon') {
                            categoryBadge = `<span style="color: #38bdf8; font-weight: 500;">⚔️ ${WEAPON_TYPE_TH[it.raw?.weaponType] || 'อาวุธ'}</span>`;
                        } else if (it.raw?.equipType === 'Shield') {
                            categoryBadge = '<span style="color: #60a5fa; font-weight: 500;">🛡️ โล่</span>';
                        } else if (it.raw?.equipType === 'Armor') {
                            categoryBadge = '<span style="color: #c084fc; font-weight: 500;">🦺 ชุดเกราะ</span>';
                        } else if (it.raw?.equipType === 'Helmet' || it.raw?.equipType === 'Head' || it.raw?.equipType === 'HeadMid') {
                            categoryBadge = '<span style="color: #facc15; font-weight: 500;">👑 ส่วนหัว</span>';
                        } else if (it.raw?.equipType === 'Cape') {
                            categoryBadge = '<span style="color: #fb923c; font-weight: 500;">🧣 ผ้าคลุม</span>';
                        } else if (it.raw?.equipType === 'Boot' || it.raw?.equipType === 'Shoes') {
                            categoryBadge = '<span style="color: #a78bfa; font-weight: 500;">👢 รองเท้า</span>';
                        } else if (it.raw?.equipType === 'Accessory') {
                            categoryBadge = '<span style="color: #f472b6; font-weight: 500;">💍 เครื่องประดับ</span>';
                        } else {
                            categoryBadge = `<span style="color: #c084fc; font-weight: 500;">🛡️ ${EQUIP_TYPE_TH[it.raw?.equipType] || it.raw?.equipType || 'อุปกรณ์'}</span>`;
                        }
                    } else if (it.raw?.type === 'Consumable') {
                        categoryBadge = '<span style="color: #f59e0b; font-weight: 500;">🧪 กดใช้</span>';
                    } else if (it.raw?.type === 'Card' || (/\bcard\b/i.test(it.name || ''))) {
                        categoryBadge = '<span style="color: #ec4899; font-weight: bold;">🎴 การ์ด</span>';
                    } else if (it.raw?.type === 'Material' || it.raw?.type === 'Ore' || it.raw?.type === 'Miscellaneous') {
                        categoryBadge = '<span style="color: #94a3b8; font-weight: 500;">💎 วัตถุดิบ</span>';
                    } else if (it.raw?.type === 'Enchantment') {
                        categoryBadge = '<span style="color: #a855f7; font-weight: bold;">🔮 หินออปชัน</span>';
                    } else {
                        categoryBadge = `<span style="color: #64748b;">${it.raw?.type || '-'}</span>`;
                    }

                    html += `
                        <tr class="p-item-row" data-idx="${idx}"
                            onmouseenter="window.showPelicanItemTooltip(${idx}, event)"
                            onmousemove="window.movePelicanItemTooltip(event)"
                            onmouseleave="window.hidePelicanItemTooltip()"
                            style="border-bottom: 1px solid #1e293b; cursor: pointer; transition: background 0.15s ease; ${isArrow ? 'background: rgba(34, 197, 94, 0.08);' : ''}">
                            <td style="padding: 6px 8px; color: #94a3b8; border: 1px solid #334155;">${it.slot}</td>
                            <td style="padding: 6px 8px; font-weight: bold; color: ${isArrow ? '#4ade80' : '#f8fafc'}; border: 1px solid #334155;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${iconHtml}
                                    <span>${it.name}</span>
                                </div>
                            </td>
                            <td style="padding: 6px 8px; font-family: monospace; color: #38bdf8; border: 1px solid #334155;">${it.id || '-'} (${hexId})</td>
                            <td style="padding: 6px 8px; font-weight: bold; color: #f59e0b; border: 1px solid #334155;">${it.qty}</td>
                            <td style="padding: 6px 8px; border: 1px solid #334155;">
                                ${categoryBadge}
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table>`;

            // Hotbar & Equips
            html += `
                <div style="font-weight: bold; color: #a855f7; margin-top: 14px; margin-bottom: 6px;">🎯 สรุปช่องทางลัด Hotbar (1-10):</div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
            `;
            for (let i = 0; i < 10; i++) {
                const key = i === 9 ? '0' : (i + 1).toString();
                const hotbarSlot = document.querySelector(`[data-slot="${i}"], .slot-${i}, #hotbar-${i}, .quick-slot-${i}`);
                const text = hotbarSlot ? hotbarSlot.innerText.trim().replace(/\n+/g, ' ') : 'Empty';
                html += `
                    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; font-size: 10px;">
                        <span style="color: #38bdf8; font-weight: bold;">[Key ${key}]</span>: <span style="color: #cbd5e1;">${text}</span>
                    </div>
                `;
            }
            html += `</div>`;
            container.innerHTML = html;

        } else if (tabName === 'maps') {
            const mapList = Object.entries(MAP_NAME_TO_ID);
            const filtered = mapList.filter(([name, id]) => {
                if (!query) return true;
                return name.toLowerCase().includes(query) || id.toLowerCase().includes(query);
            });

            let html = `
                <div style="margin-bottom: 8px; color: #38bdf8; font-weight: bold;">🗺️ รายชื่อแผนที่โลกทั้งหมด (${mapList.length} รายการ):</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; text-align: left;">
                            <th style="padding: 6px 8px; border: 1px solid #334155;">ชื่อแผนที่ (ไทย / Display)</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">Internal Map ID</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155; text-align: center;">เดินทาง</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            filtered.forEach(([name, id]) => {
                html += `
                    <tr style="border-bottom: 1px solid #1e293b;">
                        <td style="padding: 6px 8px; font-weight: bold; color: #f8fafc; border: 1px solid #334155;">${name}</td>
                        <td style="padding: 6px 8px; font-family: monospace; color: #38bdf8; border: 1px solid #334155;">${id}</td>
                        <td style="padding: 6px 8px; text-align: center; border: 1px solid #334155;">
                            <button onclick="window.walkToTargetMap('${name}'); document.getElementById('pelican-data-modal').style.display='none';" style="background: #059669; color: #fff; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: bold;">🚶 เดินไปที่นี่</button>
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            container.innerHTML = html;

        } else if (tabName === 'packets') {
            const packets = (window.__packetLogs || []).slice(-50);
            const filtered = packets.filter(p => {
                if (!query) return true;
                const q = query.toLowerCase();
                return p.dir.toLowerCase().includes(q) || p.opcode.toLowerCase().includes(q) || (p.ascii && p.ascii.toLowerCase().includes(q)) || (p.hex && p.hex.toLowerCase().includes(q));
            });

            let html = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                    <div style="color: #f59e0b; font-weight: bold; font-size: 11.5px;">📜 บันทึก Packet เครือข่าย (${packets.length} รายการล่าสุด | คลิกแถวเพื่อดู Hex/JSON เต็ม):</div>
                    <div style="display: flex; gap: 4px;">
                        <button id="p-mod-copy-out-btn" style="background: #0284c7; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10.5px; cursor: pointer; font-weight: bold;">📤 คัดลอกเฉพาะ OUT</button>
                        <button id="p-mod-copy-all-btn" style="background: #e11d48; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10.5px; cursor: pointer; font-weight: bold;">📜 คัดลอกทั้งหมด</button>
                    </div>
                </div>
                <div style="max-height: 220px; overflow-y: auto; border: 1px solid #334155; border-radius: 6px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; font-family: monospace;">
                        <thead>
                            <tr style="background: #1e293b; color: #94a3b8; text-align: left; position: sticky; top: 0; z-index: 2;">
                                <th style="padding: 5px 8px; border-bottom: 1px solid #334155;">เวลา</th>
                                <th style="padding: 5px 8px; border-bottom: 1px solid #334155;">ทิศทาง</th>
                                <th style="padding: 5px 8px; border-bottom: 1px solid #334155;">Opcode</th>
                                <th style="padding: 5px 8px; border-bottom: 1px solid #334155;">ขนาด</th>
                                <th style="padding: 5px 8px; border-bottom: 1px solid #334155;">Decoded / ASCII Preview</th>
                                <th style="padding: 5px 8px; border-bottom: 1px solid #334155; text-align: center;">ดู</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            if (filtered.length === 0) {
                html += `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">ยังไม่มี Packet ข้อมูล (ลองขยับตัวหรือยิงมอนสเตอร์ดูครับ)</td></tr>`;
            } else {
                filtered.slice().reverse().forEach((p, idx) => {
                    const isOut = p.dir === 'OUT';
                    const decStr = p.decoded ? (typeof p.decoded === 'object' ? JSON.stringify(p.decoded).slice(0, 60) : String(p.decoded)) : (p.ascii || '').slice(0, 40);
                    html += `
                        <tr class="p-packet-row" data-idx="${idx}" style="border-bottom: 1px solid #1e293b; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='transparent'">
                            <td style="padding: 4px 8px; color: #64748b;">${p.time}</td>
                            <td style="padding: 4px 8px; font-weight: bold; color: ${isOut ? '#38bdf8' : '#f59e0b'};">${p.dir}</td>
                            <td style="padding: 4px 8px; color: #c084fc; font-weight: bold;">${p.opcode}</td>
                            <td style="padding: 4px 8px; color: #94a3b8;">${p.len}B</td>
                            <td style="padding: 4px 8px; color: #cbd5e1; word-break: break-all;">${decStr}</td>
                            <td style="padding: 4px 8px; text-align: center;">
                                <button class="p-row-inspect-btn" style="background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; cursor: pointer;">🔍</button>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;

            // Dedicated Textarea for instant highlight/copy without permission issues
            const defaultJson = JSON.stringify(filtered.slice(-10), null, 2);
            html += `
                <div style="margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <span style="font-size: 10px; color: #38bdf8; font-weight: bold;">📋 Packet Raw JSON / รายละเอียดเต็ม (คลุมดำแล้วกด Ctrl+C ได้ตลอดเวลา):</span>
                        <button id="p-btn-select-json" style="background: #334155; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; font-size: 9.5px; cursor: pointer;">✨ เลือกทั้งหมดในกล่องนี้</button>
                    </div>
                    <textarea id="p-modal-raw-json" readonly style="width: 100%; height: 95px; background: #020617; border: 1px solid #334155; color: #00ffcc; font-family: monospace; font-size: 9.5px; padding: 6px; box-sizing: border-box; border-radius: 6px; resize: vertical;">${defaultJson}</textarea>
                </div>
            `;
            container.innerHTML = html;

            const reversedFiltered = filtered.slice().reverse();
            const rawTextarea = document.getElementById('p-modal-raw-json');

            container.querySelectorAll('.p-packet-row').forEach(row => {
                row.onclick = () => {
                    const idx = parseInt(row.getAttribute('data-idx'));
                    const selected = reversedFiltered[idx];
                    if (selected && rawTextarea) {
                        rawTextarea.value = JSON.stringify(selected, null, 2);
                        rawTextarea.focus();
                        rawTextarea.select();
                    }
                };
            });

            const selBtn = document.getElementById('p-btn-select-json');
            if (selBtn && rawTextarea) {
                selBtn.onclick = () => {
                    rawTextarea.focus();
                    rawTextarea.select();
                };
            }

            const copyOutBtn = document.getElementById('p-mod-copy-out-btn');
            if (copyOutBtn) {
                copyOutBtn.onclick = () => {
                    const outPackets = (window.__outgoingLogs || []).slice(-20);
                    window.safeCopyToClipboard(JSON.stringify(outPackets, null, 2), `📋 คัดลอก Packet ขาออก (${outPackets.length} รายการ) สำเร็จแล้ว!`);
                    if (rawTextarea) rawTextarea.value = JSON.stringify(outPackets, null, 2);
                };
            }

            const copyAllBtn = document.getElementById('p-mod-copy-all-btn');
            if (copyAllBtn) {
                copyAllBtn.onclick = () => {
                    const allPackets = (window.__packetLogs || []).slice(-50);
                    window.safeCopyToClipboard(JSON.stringify(allPackets, null, 2), `📋 คัดลอก Packet ทั้งหมด (${allPackets.length} รายการ) สำเร็จแล้ว!`);
                    if (rawTextarea) rawTextarea.value = JSON.stringify(allPackets, null, 2);
                };
            }

        } else if (tabName === 'state') {
            const state = window.dumpGameState ? window.dumpGameState() : {};
            let html = `
                <div style="margin-bottom: 10px; color: #22c55e; font-weight: bold;">🕹️ ข้อมูลสถานะระบบและตัวละครแบบเรียลไทม์:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div style="background: #1e293b; padding: 10px; border-radius: 8px; border: 1px solid #334155;">
                        <div style="color: #38bdf8; font-weight: bold; margin-bottom: 4px;">🗺️ ตำแหน่ง & แผนที่</div>
                        <div>แผนที่ปัจจุบัน: <b style="color: #fff;">${state.currentMap || 'ไม่ทราบ'}</b></div>
                        <div>แมพเป้าหมาย: <b style="color: #f59e0b;">${state.targetMap || '-'}</b></div>
                        <div>พิกัดตัวละคร: <b style="color: #22c55e;">${state.position ? `X: ${state.position.tileX}, Y: ${state.position.tileY}` : 'กำลังรออ่านค่า...'}</b></div>
                    </div>
                    <div style="background: #1e293b; padding: 10px; border-radius: 8px; border: 1px solid #334155;">
                        <div style="color: #a855f7; font-weight: bold; margin-bottom: 4px;">🏹 สถานะการฟาร์ม</div>
                        <div>จำนวนลูกธนู: <b style="color: ${(state.ammo <= 50) ? '#ef4444' : '#22c55e'};">${state.ammo} ดอก</b></div>
                        <div>เป้าหมายมอนสเตอร์: <b style="color: #fff;">${state.monsterTarget ? `X: ${Math.round(state.monsterTarget.x)}, Y: ${Math.round(state.monsterTarget.y)}` : 'ไม่มี'}</b></div>
                        <div>สถานะบอท: <b style="color: ${state.autoLoop ? '#22c55e' : '#ef4444'};">${state.autoLoop ? 'กำลังทำงาน' : 'หยุด'}</b></div>
                    </div>
                </div>
                <div style="margin-top: 12px; background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 10px;">
                    <div style="color: #64748b; font-size: 11px; margin-bottom: 4px;">JSON Dump State:</div>
                    <pre style="margin: 0; color: #cbd5e1; font-size: 10.5px; overflow-x: auto;">${JSON.stringify(state, null, 2)}</pre>
                </div>
            `;
            container.innerHTML = html;
        } else if (tabName === 'market') {
            const cfg = window.__marketFilterConfig || {};
            const totalServer = window.__latestMarketResults?.total ?? 'รอสแกน';
            const cachedListings = window.__marketAllListings || [];
            const results = (window.__marketFilteredResults && window.__marketFilteredResults.length > 0) ? window.__marketFilteredResults : cachedListings;

            let html = `
                <!-- 🏷️ ระบบตั้งขายอัตโนมัติ (Auto Sell to Market - ⚖️ Market Median) -->
                <div style="margin-bottom: 12px; background: #0f172a; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 8px; padding: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 15px;">🏷️</span>
                            <span style="font-weight: bold; color: #c084fc; font-size: 13px;">ระบบตั้งขายอัตโนมัติ (Auto Sell to Market)</span>
                            <span style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">⚖️ กลยุทธ์: ราคากลางสมดุล (Market Median)</span>
                            <span id="p-autosell-quota-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">โควตา: ${window.__myMarketActiveCount ?? 0}/10 รายการ</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <label style="display: flex; align-items: center; gap: 6px; color: #fff; font-size: 11px; cursor: pointer; font-weight: bold; background: rgba(255,255,255,0.05); padding: 3px 8px; border-radius: 4px; border: 1px solid #334155;">
                                <input type="checkbox" id="p-autosell-toggle" ${(window.__autoMarketSellConfig?.enabled) ? 'checked' : ''} onchange="window.toggleAutoMarketSell(this.checked)">
                                <span>เปิดใช้งาน Auto Sell</span>
                            </label>
                            <button onclick="window.addAutoMarketSellRule();" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: 1px solid #34d399; padding: 4px 12px; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">
                                <span>➕</span>
                                <span>เพิ่มรายการลงขาย</span>
                            </button>
                            <button onclick="window.runAutoMarketSellCycle(true);" style="background: #0284c7; color: #fff; border: none; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer;" title="ตรวจสอบกระเป๋าและประเมินราคาทันที">⚡ ตรวจสอบทันที</button>
                        </div>
                    </div>
                    <div id="p-autosell-rules-container">
                        ${(typeof window.renderAutoSellRulesHtml === 'function') ? window.renderAutoSellRulesHtml() : ''}
                    </div>
                </div>

                <div style="margin-bottom: 12px; background: #0f172a; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 15px;">🛒</span>
                            <span style="font-weight: bold; color: #38bdf8; font-size: 13px;">ระบบตลาดกลาง & ดักจับ Option สเตตัส (Market Sniper)</span>
                            <span id="p-mod-mk-server-badge" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">Server: ${totalServer} รายการ</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <button id="p-mod-btn-search" onclick="window.executeMarketSearch();" style="background: #0284c7; color: #fff; border: none; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer;">🔍 ค้นหา</button>
                            <div style="display: flex; align-items: center; background: #1e1b4b; border: 1px solid #7c3aed; border-radius: 5px; overflow: hidden;">
                                <select id="p-mod-mk-scan-depth" style="background: transparent; border: none; color: #e9d5ff; font-size: 10px; padding: 4px 6px; outline: none; cursor: pointer; font-weight: bold;">
                                    <option value="all" ${(!cfg.scanDepth || cfg.scanDepth === 'all') ? 'selected' : ''}>⚡ สแกนทุกหน้า (All)</option>
                                    <option value="5" ${cfg.scanDepth === '5' ? 'selected' : ''}>สแกน 5 หน้า (100)</option>
                                    <option value="10" ${cfg.scanDepth === '10' ? 'selected' : ''}>สแกน 10 หน้า (200)</option>
                                    <option value="15" ${cfg.scanDepth === '15' ? 'selected' : ''}>สแกน 15 หน้า (300)</option>
                                    <option value="20" ${cfg.scanDepth === '20' ? 'selected' : ''}>สแกน 20 หน้า (400)</option>
                                </select>
                                <button id="p-mod-btn-scan" onclick="window.toggleMarketScanFromModal();" style="background: #9333ea; color: #fff; border: none; padding: 4px 10px; font-size: 11px; font-weight: bold; cursor: pointer; border-left: 1px solid #7c3aed;">⚡ เริ่มสแกน</button>
                            </div>
                            <button onclick="window.claimMarketDeliveries();" title="กดรับของทั้งหมดที่ซื้อแล้วเข้ากระเป๋าตัวละครทันที" style="background: #eab308; color: #000; border: none; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer;">🎁 รับของเข้าตัว</button>
                            <button onclick="window.safeCopyToClipboard(JSON.stringify(window.dumpMarketData(), null, 2), '📋 คัดลอก Dump ตลาดสำเร็จ!');" style="background: #059669; color: #fff; border: none; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer;">📋 Dump JSON</button>
                        </div>
                    </div>

                    <!-- Filter Controls Bar -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 6px; font-size: 11px; align-items: center;">
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">ชื่อไอเทม:</span>
                            <input type="text" id="p-mod-mk-q" value="${cfg.q || ''}" placeholder="เช่น Bow, Ring, Dagger..." style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 11px;">
                        </div>
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">หมวดหมู่:</span>
                            <select id="p-mod-mk-cat" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px;">
                                <option value="" ${cfg.category === '' ? 'selected' : ''}>ทุกหมวด</option>
                                <option value="Weapon" ${cfg.category === 'Weapon' ? 'selected' : ''}>อาวุธ</option>
                                <option value="Armor" ${cfg.category === 'Armor' ? 'selected' : ''}>ชุดเกราะ</option>
                                <option value="Accessory" ${cfg.category === 'Accessory' ? 'selected' : ''}>ประดับ/เจม</option>
                                <option value="Card" ${cfg.category === 'Card' ? 'selected' : ''}>การ์ด</option>
                                <option value="Ammo" ${cfg.category === 'Ammo' ? 'selected' : ''}>ลูกธนู</option>
                            </select>
                        </div>
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">ตีบวก ≥:</span>
                            <input type="number" id="p-mod-mk-refine" value="${cfg.minRefine || 0}" min="0" max="15" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; color: #c084fc; text-align: center; padding: 3px; border-radius: 4px; font-size: 11px;">
                        </div>
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">งบสูงสุด (z):</span>
                            <input type="number" id="p-mod-mk-price" value="${cfg.maxPrice || 0}" placeholder="0 = ไม่จำกัด" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; color: #00ffcc; text-align: right; padding: 3px; border-radius: 4px; font-size: 11px;">
                        </div>
                        <div style="display: flex; gap: 4px; padding-top: 14px;">
                            <button id="p-mod-btn-apply-filters" style="width: 100%; background: #2563eb; color: #fff; border: none; padding: 4px; border-radius: 4px; font-weight: bold; cursor: pointer;">⚡ กรองผล</button>
                        </div>
                    </div>

                    <!-- Deep Stat Filters Row -->
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #1e293b; display: grid; grid-template-columns: 2fr 1fr 2fr 1fr 1fr; gap: 6px; align-items: center;">
                        <div>
                            <span style="color: #f59e0b; font-size: 10px; font-weight: bold;">💎 Option 1 (Stat):</span>
                            <select id="p-mod-mk-stat1" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid rgba(245, 158, 11, 0.4); color: #fde047; padding: 3px; border-radius: 4px; font-size: 10.5px;">
                                ${(typeof getMarketStatSelectOptionsHtml === 'function' ? getMarketStatSelectOptionsHtml(cfg.statType1) : (typeof window.getMarketStatSelectOptionsHtml === 'function' ? window.getMarketStatSelectOptionsHtml(cfg.statType1) : ''))}
                            </select>
                        </div>
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">ค่าขั้นต่ำ:</span>
                            <input type="number" id="p-mod-mk-stat1-min" value="${cfg.statMinVal1 || 1}" min="1" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid rgba(245, 158, 11, 0.4); color: #fff; text-align: center; padding: 3px; border-radius: 4px; font-size: 11px;">
                        </div>
                        <div>
                            <span style="color: #c084fc; font-size: 10px; font-weight: bold;">🔮 Option 2 (Stat):</span>
                            <select id="p-mod-mk-stat2" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid rgba(192, 132, 252, 0.4); color: #e9d5ff; padding: 3px; border-radius: 4px; font-size: 10.5px;">
                                ${(typeof getMarketStatSelectOptionsHtml === 'function' ? getMarketStatSelectOptionsHtml(cfg.statType2) : (typeof window.getMarketStatSelectOptionsHtml === 'function' ? window.getMarketStatSelectOptionsHtml(cfg.statType2) : ''))}
                            </select>
                        </div>
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">ค่าขั้นต่ำ:</span>
                            <input type="number" id="p-mod-mk-stat2-min" value="${cfg.statMinVal2 || 1}" min="1" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid rgba(192, 132, 252, 0.4); color: #fff; text-align: center; padding: 3px; border-radius: 4px; font-size: 11px;">
                        </div>
                        <div>
                            <span style="color: #94a3b8; font-size: 10px;">เงื่อนไข:</span>
                            <select id="p-mod-mk-mode" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px;">
                                <option value="AND" ${cfg.statMatchMode === 'AND' ? 'selected' : ''}>AND (ครบทุก Opt)</option>
                                <option value="OR" ${cfg.statMatchMode === 'OR' ? 'selected' : ''}>OR (มี Opt ใด Opt หนึ่ง)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Auto Deep Scan Row -->
                    <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center; background: rgba(56, 189, 248, 0.08); border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: 4px; padding: 4px 8px;">
                        <label style="display: flex; align-items: center; gap: 6px; color: #38bdf8; font-size: 11px; cursor: pointer;" title="เมื่อเลือก Option และกดค้นหา ระบบจะสแกนลึกทุกหน้าในตลาดจนครบโดยอัตโนมัติ ไม่หยุดแค่ 20 รายการแรก">
                            <input type="checkbox" id="p-mod-mk-auto-deep" ${cfg.autoDeepScan !== false ? 'checked' : ''} onchange="window.__marketFilterConfig.autoDeepScan = this.checked; saveMarketFilterConfig();">
                            <b>⚡ Auto Deep-Scan: สแกนทุกหน้าอัตโนมัติเมื่อค้นหาด้วย Option</b>
                            <span style="color: #94a3b8; font-size: 10px;">(แก้ปัญหา 20 รายการแรกไม่มี Option ที่ต้องการ)</span>
                        </label>
                        <span style="color: #eab308; font-size: 10px; font-weight: bold;">ความเร็ว: ~250ms/หน้า</span>
                    </div>
                </div>

                <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span id="p-mod-mk-summary-text" style="font-weight: bold; color: #38bdf8; font-size: 12px;">
                        📋 ผลลัพธ์ในตลาดที่พบ (${results.length} รายการ จากทั้งหมด ${cachedListings.length} ในแคช · Server มี ${totalServer} รายการ):
                    </span>
                    <span style="color: #eab308; font-size: 11px;">💡 ชี้เมาส์ที่แถวเพื่อดูรายละเอียด Tooltip ในเกมเต็มรูปแบบ</span>
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; text-align: left;">
                            <th style="padding: 6px 8px; border: 1px solid #334155; width: 40px; text-align: center;">#</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">ไอเทม</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155; width: 65px; text-align: center;">ตีบวก</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">สเตตัส / Options (Affixes)</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155; width: 90px; text-align: right;">ราคา</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155; width: 100px;">ผู้ขาย</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155; width: 80px; text-align: center;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="p-mod-mk-tbody">
                        ${(typeof window.renderMarketRowsHtml === 'function') ? window.renderMarketRowsHtml(results, cfg) : ''}
                    </tbody>
                </table>
            `;

            container.innerHTML = html;

            // Wire live auto-filtering listeners on all inputs & selects
            const filterInputIds = [
                'p-mod-mk-q', 'p-mod-mk-cat', 'p-mod-mk-refine', 'p-mod-mk-price',
                'p-mod-mk-stat1', 'p-mod-mk-stat1-min', 'p-mod-mk-stat2', 'p-mod-mk-stat2-min', 'p-mod-mk-mode',
                'p-mod-mk-scan-depth', 'p-mod-mk-auto-deep'
            ];
            filterInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
                    el.addEventListener(evt, () => {
                        window.syncMarketFiltersFromUI();
                        if (evt === 'change') {
                            const tbody = document.getElementById('p-mod-mk-tbody');
                            if (tbody && typeof window.renderMarketRowsHtml === 'function') {
                                const newMatched = window.applyMarketFilters();
                                tbody.innerHTML = window.renderMarketRowsHtml(newMatched, window.__marketFilterConfig);
                                const sumText = document.getElementById('p-mod-mk-summary-text');
                                if (sumText) {
                                    const srv = window.__latestMarketResults?.total ?? 'รอสแกน';
                                    sumText.innerText = `📋 ผลลัพธ์ในตลาดที่พบ (${newMatched.length} รายการ จากทั้งหมด ${(window.__marketAllListings || []).length} ในแคช · Server มี ${srv} รายการ):`;
                                }
                            } else {
                                window.renderModalTab('market');
                            }
                        }
                    });
                    if (el.tagName === 'INPUT' && el.type === 'text') {
                        el.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                window.executeMarketSearch();
                            }
                        });
                    }
                }
            });

            const applyBtn = document.getElementById('p-mod-btn-apply-filters');
            if (applyBtn) {
                applyBtn.onclick = () => {
                    window.syncMarketFiltersFromUI();
                    window.renderModalTab('market');
                };
            }

            if (typeof window.updateMarketScanUIState === 'function') {
                window.updateMarketScanUIState(window.__isMarketScanning);
            }
        }
    };

    // 1. Real-Time Minimap Tracker
    // ==========================================
    setInterval(() => {
        const footerSpans = document.querySelectorAll('.minimap-footer span');
        if (footerSpans.length >= 2) {
            const coordSpan = footerSpans[footerSpans.length - 1];
            const text = coordSpan ? coordSpan.textContent.trim() : '';
            if (text.includes(',')) {
                const parts = text.split(',').map(s => parseInt(s.trim()));
                if (!isNaN(parts[0]) && !isNaN(parts[1])) {
                    const worldX = parts[0] * 32 + 16;
                    const worldY = parts[1] * 32 + 16;
                    window.__currentPos = { x: worldX, y: worldY, tileX: parts[0], tileY: parts[1] };
                    updateUIPos(worldX, worldY, parts[0], parts[1]);

                    if (window.__isBotRunning && window.__autoJumpEnabled && window.__monsterPos) {
                        const dist = Math.hypot(window.__monsterPos.x - worldX, window.__monsterPos.y - worldY);
                        if (dist >= 60 && dist <= 260) {
                            window.executeReverseBackflip(window.__monsterPos.x, window.__monsterPos.y);
                        }
                    }
                }
            }
        }
    }, 200);

    function getCurrentMapName() {
        // 1. ลองหาจาก class ที่เป็นไปได้
        const el = document.querySelector('.minimap-name, .minimap-title, [class*="map-name"], [class*="map-title"]');
        if (el && el.textContent.trim()) {
            return el.textContent.trim();
        }

        // 2. สแกน element ใน .minimap-footer (จากภาพ: CH 5 | เมืองหลวงโซลเฮเวน | 28, 47)
        const footerEls = Array.from(document.querySelectorAll('.minimap-footer span, .minimap-footer div, .minimap-footer p, .minimap-footer b, .minimap-footer strong'));
        for (const fEl of footerEls) {
            const t = (fEl.textContent || '').trim();
            if (t.length > 1 && !t.includes(',') && !/^CH\s*\d+/i.test(t) && !/^\d+%?$/.test(t) && t !== '-' && t !== '+') {
                return t;
            }
        }

        // 3. สแกน text ทั้งหมดใน .minimap-footer
        const footer = document.querySelector('.minimap-footer');
        if (footer) {
            const lines = (footer.innerText || footer.textContent || '').split(/\n|\s{2,}/).map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                if (line.length > 1 && !line.includes(',') && !/^CH\s*\d+/i.test(line) && !/^\d+%?$/.test(line) && line !== '-' && line !== '+') {
                    return line;
                }
            }
        }

        // 4. สแกนจาก container ของ minimap ทั้งหมด
        const minimap = document.querySelector('.minimap, [class*="minimap"]');
        if (minimap) {
            const spans = Array.from(minimap.querySelectorAll('span, div')).filter(s => {
                const t = (s.textContent || '').trim();
                return t.length > 2 && !t.includes(',') && !/^CH\s*\d+/i.test(t) && !/^\d+%?$/.test(t) && t !== '-' && t !== '+';
            });
            if (spans.length > 0) return spans[0].textContent.trim();
        }

        return '';
    }

    function getCharacterHP() {
        try {
            // 1. ตรวจหาจาก selector เฉพาะเจาะจงของระบบเกม
            const specificHp = document.querySelector('.hp-text, .character-hp, [class*="hp-val"], [id*="hp-val"], .hp-bar-text, [class*="char-hp"]');
            if (specificHp) {
                const m = (specificHp.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
                if (m) return { current: parseInt(m[1], 10), max: parseInt(m[2], 10) };
            }

            // 2. สแกน elements ทั้งหมดบนจอ (ยกเว้น #pelican-hud และกล่องแชท)
            const elements = Array.from(document.querySelectorAll('span, div, p, b, strong')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('[class*="chat"]') || el.closest('.chat-log')) return false;
                const t = (el.textContent || '').trim();
                return /^HP\s*:?\s*(\d+)\s*\/\s*(\d+)/i.test(t) || /^\s*(\d+)\s*\/\s*(\d+)\s*$/.test(t);
            });

            // หาแบบที่มีตัวอักษร HP นำหน้าก่อน (ความแม่นยำสูงสุด)
            for (const el of elements) {
                const t = el.textContent.trim();
                const mWithHp = t.match(/HP\s*:?\s*(\d+)\s*\/\s*(\d+)/i);
                if (mWithHp) {
                    return { current: parseInt(mWithHp[1], 10), max: parseInt(mWithHp[2], 10) };
                }
            }

            // หาแบบตัวเลขเดี่ยว ๆ (เช่น 666/1331) ที่ parent หรือ sibling มีคำว่า 'HP' และไม่มี 'SP'
            for (const el of elements) {
                const t = el.textContent.trim();
                const mPure = t.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (mPure) {
                    const parentText = (el.parentElement ? (el.parentElement.innerText || el.parentElement.textContent || '') : '');
                    if (parentText.includes('HP') && !parentText.includes('SP')) {
                        return { current: parseInt(mPure[1], 10), max: parseInt(mPure[2], 10) };
                    }
                }
            }

            // 3. Spatial fallback: โซน HUD ตัวละครมุมบนซ้าย (rect.top < 160 && rect.left < 260)
            const topStats = Array.from(document.querySelectorAll('span, div, p, b')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('[class*="chat"]')) return false;
                const t = (el.textContent || '').trim();
                if (!/^\s*(\d+)\s*\/\s*(\d+)\s*$/.test(t)) return false;
                const r = el.getBoundingClientRect();
                return r.top >= 0 && r.top < 160 && r.left >= 0 && r.left < 260;
            });
            if (topStats.length > 0) {
                topStats.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                const m = topStats[0].textContent.trim().match(/(\d+)\s*\/\s*(\d+)/);
                if (m) return { current: parseInt(m[1], 10), max: parseInt(m[2], 10) };
            }
        } catch (e) {
            console.error('[Pelican] getCharacterHP error:', e);
        }
        return null;
    }

    function isCharacterDead() {
        // กฎเหล็กข้อที่ 1: ตรวจสอบเลือด (HP) จาก HUD ก่อนเสมอ (Truth Source)
        const hp = getCharacterHP();
        if (hp && typeof hp.current === 'number') {
            if (hp.current > 0) {
                return false; // เลือดมากกว่า 0 = มีชีวิตอยู่ 100% ห้ามตัดสินว่าตายเด็ดขาด!
            }
            if (hp.current === 0) {
                return true; // เลือด 0 = เสียชีวิต 100%
            }
        }

        // กฎเหล็กข้อที่ 2: ถ้าตรวจ HP ไม่พบ ให้ตรวจเฉพาะเจาะจงจาก Modal ตาย (ห้ามสแกน document.body.innerText ตรงๆ)
        const deathModal = Array.from(document.querySelectorAll('.modal, .dialog, [class*="modal"], [class*="death"], [class*="popup"], [role="dialog"]')).find(el => {
            if (el.closest('#pelican-hud') || el.closest('[class*="chat"]') || el.closest('.chat-log')) return false;
            const t = el.innerText || '';
            const hasDeathText = t.includes('คุณเสียชีวิต') || t.includes('ตัวละครเสียชีวิต');
            const hasRespawnAction = t.includes('ฟื้นที่จุดเกิด') || t.includes('ฟื้นคืนชีพ') || t.includes('ฟื้นอัตโนมัติ');
            return hasDeathText && hasRespawnAction;
        });
        if (deathModal) return true;

        // ตรวจปุ่มชุบชีวิตเดี่ยวๆ กลางจอ
        const respawnBtn = Array.from(document.querySelectorAll('button, div[role="button"], a.btn')).find(el => {
            if (el.closest('#pelican-hud') || el.closest('[class*="chat"]') || el.closest('.chat-log') || el.closest('.worldmap-window')) return false;
            const txt = (el.innerText || '').trim();
            const isRespawnText = (txt === 'ฟื้นที่จุดเกิด' || txt === 'ฟื้นคืนชีพ' || txt === 'ฟื้นอัตโนมัติ');
            return isRespawnText && el.offsetWidth > 0 && el.offsetHeight > 0;
        });
        if (respawnBtn) return true;

        return false;
    }

    function isCharacterInCity() {
        const curMap = getCurrentMapName();
        return curMap.includes('เมืองหลวง') || curMap.includes('โซลเฮเวน') || curMap.includes('ตลาดคาราวาน');
    }

    // ==========================================
    // WEIGHT TRACKER & OVERLOAD SENSOR
    // ==========================================
    function isValidNonBotElement(el) {
        return el && !el.closest('#pelican-hud') && !el.closest('#pelican-data-modal') && !el.closest('#pelican-log');
    }

    // Helper: ค้นหาข้อมูลหน้าต่างกระเป๋าบนจอ
    function getOpenBagInfo() {
        try {
            // 1. Selector ตรงจากโครงสร้างจริงของเกม: .inventory.panel หรือ div[role="dialog"][aria-label="กระเป๋า"]
            const bagPanel = document.querySelector('.inventory.panel, div[role="dialog"][aria-label="กระเป๋า"]');
            if (bagPanel && bagPanel.offsetWidth > 0 && bagPanel.offsetHeight > 0) {
                const sortBtn = bagPanel.querySelector('button.inv-sort') ||
                                Array.from(bagPanel.querySelectorAll('button, div[role="button"]')).find(el => (el.innerText || '').trim() === 'จัดเรียง');
                return { windowEl: bagPanel, sortBtn };
            }

            // 2. หาปุ่ม "จัดเรียง" หรือ "จัดเรียงไอเทม" บนหน้าจอเกม
            const sortBtn = Array.from(document.querySelectorAll('button.inv-sort, button, div[role="button"], a, span, div')).find(el => {
                if (!isValidNonBotElement(el)) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                return (txt === 'จัดเรียง' || txt === 'จัดเรียงไอเทม' || txt === 'Sort') && el.offsetWidth > 0 && el.offsetHeight > 0;
            });

            if (sortBtn) {
                let cur = sortBtn.parentElement;
                for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
                    const t = cur.textContent || '';
                    if (t.includes('กระเป๋า') || t.includes('Inventory') || t.includes('น้ำหนัก')) {
                        return { windowEl: cur, sortBtn };
                    }
                    cur = cur.parentElement;
                }
                return { windowEl: sortBtn.parentElement?.parentElement || sortBtn.parentElement, sortBtn };
            }

            // 3. หา Header "กระเป๋า x/y"
            const allBagHeaders = Array.from(document.querySelectorAll('*')).filter(el => {
                if (!isValidNonBotElement(el) || el.children.length > 3) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                return /กระเป๋า\s*\d+\s*\/\s*\d+/i.test(txt) && el.offsetWidth > 0 && el.offsetHeight > 0;
            });
            if (allBagHeaders.length > 0) {
                let cur = allBagHeaders[0].parentElement;
                for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
                    if (cur.offsetWidth >= 200 && cur.offsetHeight >= 200) {
                        return { windowEl: cur, sortBtn: null };
                    }
                    cur = cur.parentElement;
                }
                return { windowEl: allBagHeaders[0].parentElement, sortBtn: null };
            }
        } catch(e) {}
        return null;
    }

    function getBagSlots() {
        try {
            const bagInfo = getOpenBagInfo();
            if (bagInfo && bagInfo.windowEl) {
                const bagHeaders = Array.from(bagInfo.windowEl.querySelectorAll('*')).filter(el => {
                    if (!isValidNonBotElement(el)) return false;
                    const txt = (el.textContent || '').trim();
                    return txt.includes('กระเป๋า') || txt.includes('Inventory');
                });
                for (const el of bagHeaders) {
                    const txt = (el.textContent || '').replace(/[\u00a0\r\n\t]/g, ' ');
                    const m = txt.match(/กระเป๋า[^\d]*(\d+)\s*\/\s*(\d+)/i) || txt.match(/Inventory[^\d]*(\d+)\s*\/\s*(\d+)/i) || txt.match(/(\d+)\s*\/\s*(\d+)/);
                    if (m) {
                        const cur = parseInt(m[1]);
                        const max = parseInt(m[2]);
                        if (max > 0 && max <= 300) {
                            const res = { current: cur, max, percent: Math.round((cur / max) * 100) };
                            window.__lastKnownSlots = res;
                            return res;
                        }
                    }
                }
            }
            if (window.__lastKnownSlots) return window.__lastKnownSlots;
        } catch(e) {}
        return null;
    }

    function getCharacterWeight() {
        try {
            // Method 0 (PRIMARY & REALTIME): ข้อมูลตรงจาก Server Packet แบบเรียลไทม์ (ไม่ต้องเปิดกระเป๋า!)
            if (window.__serverWeight && typeof window.__serverWeight.percent === 'number' && window.__serverWeight.max > 0) {
                window.__lastKnownWeight = window.__serverWeight;
                updateWeightHUD(window.__serverWeight);
                return window.__serverWeight;
            }

            const bagInfo = getOpenBagInfo();
            const charHp = (typeof getCharacterHP === 'function') ? getCharacterHP() : null;
            const invalidMax = charHp && charHp.max > 0 ? charHp.max : null;

            // ตรวจจับ Debuff สถานะน้ำหนักเกินบนแถบตัวละคร .hud-status (เช่น "น้ำหนักเกิน 70%" หรือ "น้ำหนักเกิน 90%")
            const statusPanel = document.querySelector('.hud-status');
            if (statusPanel) {
                const statusText = statusPanel.innerText || statusPanel.textContent || '';
                if (statusText.includes('น้ำหนักเกิน 90%')) {
                    window.__isKnownOverweight = true;
                    if (window.__lastKnownWeight && window.__lastKnownWeight.percent < 90) {
                        window.__lastKnownWeight.percent = 90.0;
                    }
                } else if (statusText.includes('น้ำหนักเกิน 70%')) {
                    if (window.__lastKnownWeight && window.__lastKnownWeight.percent < 70) {
                        window.__lastKnownWeight.percent = 70.0;
                    }
                }
            }

            // ถ้าหน้าต่างกระเป๋าเปิดอยู่ -> อ่านค่าน้ำหนักจริงจากภายในหน้าต่างกระเป๋าเท่านั้น!
            if (bagInfo && bagInfo.windowEl) {
                // Method 1 (PRIMARY): ค้นหาแถวข้อความที่มีคำว่า "น้ำหนัก" ภายในหน้าต่างกระเป๋า
                const weightLabels = Array.from(bagInfo.windowEl.querySelectorAll('*')).filter(el => {
                    if (!isValidNonBotElement(el) || el.children.length > 5) return false;
                    if (el.closest('.hud-status') || el.closest('.hud-head') || el.closest('.hud-levels')) return false;
                    const txt = (el.textContent || '').trim();
                    return txt.includes('น้ำหนัก');
                });

                for (const label of weightLabels) {
                    const searchTargets = [label, label.parentElement, label.parentElement?.parentElement, label.nextElementSibling].filter(Boolean);
                    for (const target of searchTargets) {
                        if (target.closest('.hud-status')) continue;
                        const cleanTxt = (target.textContent || '').replace(/[\u00a0\r\n\t]/g, ' ');
                        const matches = Array.from(cleanTxt.matchAll(/([\d,]+(?:\.\d+)?)\s*\/\s*([\d,]+(?:\.\d+)?)/g));
                        for (const m of matches) {
                            const cur = parseFloat(m[1].replace(/,/g, ''));
                            const max = parseFloat(m[2].replace(/,/g, ''));
                            // กรองค่า: ต้องไม่ใช่ Max HP (เช่น 1,755) และต้องเป็นสเกลน้ำหนักกระเป๋าจริง (เช่น 500 - 50,000)
                            if (invalidMax && max === invalidMax) continue;
                            if (max >= 500 && max <= 50000) {
                                const res = { current: cur, max, percent: Math.round((cur / max) * 1000) / 10 };
                                window.__lastKnownWeight = res;
                                if (res.percent < (window.__sellConfig?.weightThreshold || 80)) {
                                    window.__isKnownOverweight = false;
                                }
                                try { localStorage.setItem('pelican_last_weight', JSON.stringify(res)); } catch(e) {}
                                updateWeightHUD(res);
                                return res;
                            }
                        }
                    }
                }

                // Method 2: ค้นหา Node X / Y ภายในหน้าต่างกระเป๋าเท่านั้น
                const leafNodes = Array.from(bagInfo.windowEl.querySelectorAll('*')).filter(el => {
                    if (!isValidNonBotElement(el)) return false;
                    if (el.closest('.hud-status')) return false;
                    const txt = (el.textContent || '').trim();
                    if (!txt.includes('/')) return false;
                    return /^[\d,]+(?:\.\d+)?\s*\/\s*[\d,]+(?:\.\d+)?$/.test(txt);
                });

                for (const el of leafNodes) {
                    const txt = (el.textContent || '').replace(/[\u00a0\r\n\t]/g, ' ').trim();
                    const m = txt.match(/([\d,]+(?:\.\d+)?)\s*\/\s*([\d,]+(?:\.\d+)?)/);
                    if (m) {
                        const cur = parseFloat(m[1].replace(/,/g, ''));
                        const max = parseFloat(m[2].replace(/,/g, ''));
                        if (invalidMax && max === invalidMax) continue;
                        if (max >= 500 && max <= 50000) {
                            const res = { current: cur, max, percent: Math.round((cur / max) * 1000) / 10 };
                            window.__lastKnownWeight = res;
                            if (res.percent < (window.__sellConfig?.weightThreshold || 80)) {
                                window.__isKnownOverweight = false;
                            }
                            try { localStorage.setItem('pelican_last_weight', JSON.stringify(res)); } catch(e) {}
                            updateWeightHUD(res);
                            return res;
                        }
                    }
                }
            }

            // ถ้าหน้าต่างกระเป๋าปิดอยู่:
            // กฎเหล็ก: ห้ามสแกนหาตัวเลขบน document.body เด็ดขาด! เพราะใน Aetheria ตัวเลขน้ำหนัก X/Y มีเฉพาะในหน้าต่างกระเป๋า
            // การสแกน document.body จะไปจับแถบสถานะดีบัฟ "น้ำหนักเกิน 70%" แล้วไปอ่านค่า HP 1,063/1,755 ของตัวละครแทน

            // Method 3: ข้อมูลจาก Server Packet (ถ้ามี)
            if (window.__serverWeight && typeof window.__serverWeight.percent === 'number' && window.__serverWeight.percent > 0) {
                window.__lastKnownWeight = window.__serverWeight;
                updateWeightHUD(window.__serverWeight);
                return window.__serverWeight;
            }

            // Method 4: Fallback จาก Memory หรือ localStorage (พร้อมกรองล้างค่า HP เก่าที่เคยบันทึกผิดทิ้ง)
            if (window.__lastKnownWeight && typeof window.__lastKnownWeight.percent === 'number') {
                if (invalidMax && window.__lastKnownWeight.max === invalidMax) {
                    window.__lastKnownWeight = null;
                    try { localStorage.removeItem('pelican_last_weight'); } catch(e) {}
                } else if (window.__lastKnownWeight.percent === 100 && window.__lastKnownWeight.current === window.__lastKnownWeight.max) {
                    window.__lastKnownWeight = null;
                    try { localStorage.removeItem('pelican_last_weight'); } catch(e) {}
                } else {
                    updateWeightHUD(window.__lastKnownWeight);
                    return window.__lastKnownWeight;
                }
            }

            try {
                const saved = localStorage.getItem('pelican_last_weight');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed.percent === 'number' && parsed.max > 0) {
                        if (invalidMax && parsed.max === invalidMax) {
                            localStorage.removeItem('pelican_last_weight');
                        } else if (parsed.percent === 100 && parsed.current === parsed.max) {
                            localStorage.removeItem('pelican_last_weight');
                        } else {
                            window.__lastKnownWeight = parsed;
                            updateWeightHUD(parsed);
                            return parsed;
                        }
                    }
                }
            } catch(e) {}
        } catch(e) {
            console.error('[Pelican Weight] getCharacterWeight error:', e);
        }
        return window.__lastKnownWeight || null;
    }

    function updateWeightHUD(w) {
        if (!w && window.__lastKnownWeight) w = window.__lastKnownWeight;
        if (!w) {
            try {
                const saved = localStorage.getItem('pelican_last_weight');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed.percent === 'number') {
                        w = parsed;
                        window.__lastKnownWeight = parsed;
                    }
                }
            } catch(e) {}
        }

        const el = document.getElementById('p-cur-weight-val');
        const quickWeightEl = document.getElementById('p-quick-weight');
        const bannerEl = document.getElementById('p-weight-alert-banner');
        const slots = getBagSlots();
        const slotStr = slots ? ` | ช่อง: ${slots.current}/${slots.max}` : '';

        const thresh = window.__sellConfig?.weightThreshold || 80;
        const isOver = (w && typeof w.percent === 'number' && w.percent >= thresh) || window.__isKnownOverweight;

        if (el) {
            if (w) {
                const color = isOver ? '#ef4444' : (w.percent >= 70 ? '#f59e0b' : '#00ffcc');
                el.innerHTML = `<span style="color: ${color}; font-weight: bold;">${w.current.toLocaleString()} / ${w.max.toLocaleString()} (${w.percent}%)${slotStr}</span>`;
            } else if (slots) {
                const color = slots.percent >= 90 ? '#ef4444' : '#00ffcc';
                el.innerHTML = `<span style="color: ${color}; font-weight: bold;">ช่อง: ${slots.current}/${slots.max} (${slots.percent}%)</span>`;
            } else {
                el.innerHTML = '<span style="color: #64748b;">-- / --</span>';
            }
        }

        if (quickWeightEl) {
            if (w && typeof w.percent === 'number') {
                quickWeightEl.innerText = `⚖️ ${w.percent}%`;
                if (isOver) {
                    quickWeightEl.style.background = 'rgba(239, 68, 68, 0.3)';
                    quickWeightEl.style.borderColor = '#ef4444';
                    quickWeightEl.style.color = '#ef4444';
                } else if (w.percent >= 70) {
                    quickWeightEl.style.background = 'rgba(245, 158, 11, 0.2)';
                    quickWeightEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                    quickWeightEl.style.color = '#f59e0b';
                } else {
                    quickWeightEl.style.background = 'rgba(56, 189, 248, 0.2)';
                    quickWeightEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
                    quickWeightEl.style.color = '#38bdf8';
                }
            }
        }

        if (bannerEl) {
            if (isOver && w) {
                bannerEl.style.display = 'block';
                bannerEl.innerHTML = `⚠️ <b>น้ำหนักเกินเกณฑ์!</b> (${w.percent}% >= ${thresh}%) บอทจะนำทางไปขายของ`;
            } else {
                bannerEl.style.display = 'none';
            }
        }
    }

    setInterval(getCharacterWeight, 1500);

    function isCharacterOverweight() {
        const cfg = window.__sellConfig || {};

        // ถ้าผู้เล่นปิดระบบตรวจน้ำหนัก ไม่ต้องส่งวาร์ปกลับ
        if (!cfg.weightCheckEnabled && !window.__isKnownOverweight) {
            return false;
        }

        // กรณีฉุกเฉิน: บอทพยายามเปิด AUTO 3 ครั้งแล้วเกมไม่ยอมเปิด แสดงว่าตัวเกมล็อคเพราะน้ำหนักเกิน 90%
        if (window.__isKnownOverweight) {
            return true;
        }

        const threshold = typeof cfg.weightThreshold === 'number' ? cfg.weightThreshold : 80;

        // 1. ตรวจสอบข้อมูลน้ำหนักคำนวณจริงจาก DOM หรือ Server เป็นหลัก
        const w = getCharacterWeight() || window.__lastKnownWeight || window.__serverWeight;
        if (w && typeof w.percent === 'number' && w.percent > 0) {
            if (w.percent >= threshold) return true;
            // ถ้าน้ำหนักจริงอ่านได้แล้วและยังไม่ถึงเกณฑ์ที่ตั้งไว้ (เช่น 35% < 70%) ถือว่าปลอดภัย 100% ห้ามสั่งวาร์ปกลับเด็ดขาด!
            return false;
        }

        // 2. ตรวจสอบสถานะ Debuff บนแผง .hud-status ของตัวละครโดยตรง (เฉพาะกรณีที่ยังไม่มีค่าน้ำหนักจริงหรือแคชเกินเกณฑ์)
        const statusPanel = document.querySelector('.hud-status');
        if (statusPanel) {
            const statusText = statusPanel.innerText || statusPanel.textContent || '';
            if (statusText.includes('น้ำหนักเกิน 90%')) {
                window.__isKnownOverweight = true;
                return true;
            }
            if (statusText.includes('น้ำหนักเกิน 70%') && threshold <= 70) {
                return true;
            }
        }

        // 2. ตรวจสอบจำนวนช่องกระเป๋า (Slots) เช่น กระเป๋า 99/100 (ถ้า 98 ช่องขึ้นไปถือว่ากระเป๋าเต็ม)
        const slots = getBagSlots();
        if (slots && (slots.percent >= 98 || slots.current >= slots.max - 1)) {
            console.warn(`%c[Pelican Overload] 🎒 ช่องกระเป๋าเต็ม (${slots.current}/${slots.max} ช่อง)! สั่งวาร์ปกลับไปขายของ`, 'color: #ef4444; font-weight: bold;');
            return true;
        }

        return false;
    }

    function isWorldMapOpen() {
        const el = document.querySelector('.worldmap-window') || document.querySelector('.worldmap-stage');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function triggerClick(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY, buttons: 1 };

        el.focus();
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        if (typeof el.click === 'function') el.click();

        const reactKey = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
        if (reactKey && el[reactKey]) {
            const props = el[reactKey];
            if (typeof props.onClick === 'function') props.onClick({ stopPropagation: () => {}, preventDefault: () => {} });
            if (typeof props.onPointerDown === 'function') props.onPointerDown({ stopPropagation: () => {}, preventDefault: () => {} });
        }
        return true;
    }

    function createSyntheticKeyEvent(type, keyStr, codeStr, keyCodeNum) {
        let evt;
        try {
            evt = new KeyboardEvent(type, {
                key: keyStr,
                code: codeStr,
                keyCode: keyCodeNum,
                which: keyCodeNum,
                charCode: keyCodeNum,
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window
            });
        } catch(e) {
            evt = document.createEvent('Event');
            evt.initEvent(type, true, true);
        }
        try { Object.defineProperty(evt, 'keyCode', { get: () => keyCodeNum, configurable: true }); } catch(e) {}
        try { Object.defineProperty(evt, 'which', { get: () => keyCodeNum, configurable: true }); } catch(e) {}
        try { Object.defineProperty(evt, 'charCode', { get: () => keyCodeNum, configurable: true }); } catch(e) {}
        try { Object.defineProperty(evt, 'key', { get: () => keyStr, configurable: true }); } catch(e) {}
        try { Object.defineProperty(evt, 'code', { get: () => codeStr, configurable: true }); } catch(e) {}
        return evt;
    }

    function dispatchKeyAll(keyStr, codeStr, keyCodeNum) {
        // ปลด Focus จากปุ่ม/Input บน HUD ไม่ให้กลืน Key Event
        if (document.activeElement && document.activeElement !== document.body) {
            try { document.activeElement.blur(); } catch(e) {}
        }
        const canvas = document.querySelector('canvas');
        if (canvas) {
            try { canvas.focus(); } catch(e) {}
        }

        const target = canvas || document.body || window;
        const downEvt = createSyntheticKeyEvent('keydown', keyStr, codeStr, keyCodeNum);
        target.dispatchEvent(downEvt);

        // Phaser Keyboard Injection หากตัวเกมมี instance บน window
        try {
            const phaserGame = window.game || (window.Phaser && window.Phaser.GAMES && window.Phaser.GAMES[0]);
            if (phaserGame && phaserGame.input && phaserGame.input.keyboard) {
                if (typeof phaserGame.input.keyboard.onKeyDown === 'function') {
                    phaserGame.input.keyboard.onKeyDown(downEvt);
                }
            }
        } catch(e) {}

        setTimeout(() => {
            const upEvt = createSyntheticKeyEvent('keyup', keyStr, codeStr, keyCodeNum);
            target.dispatchEvent(upEvt);

            try {
                const phaserGame = window.game || (window.Phaser && window.Phaser.GAMES && window.Phaser.GAMES[0]);
                if (phaserGame && phaserGame.input && phaserGame.input.keyboard) {
                    if (typeof phaserGame.input.keyboard.onKeyUp === 'function') {
                        phaserGame.input.keyboard.onKeyUp(upEvt);
                    }
                }
            } catch(e) {}
        }, 50);
    }

    window.pressKey = function(keyStr) {
        const lower = keyStr.toLowerCase();
        if (lower === 'b' || lower === 'i') {
            dispatchKeyAll('i', 'KeyI', 73);
        } else {
            const charCode = keyStr.charCodeAt(0);
            dispatchKeyAll(keyStr, 'Digit' + keyStr, charCode);
        }
    };

    function playWarningChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch(e) {}
    }

    function closeCardBookIfOpen() {
        try {
            const cardBookModal = Array.from(document.querySelectorAll('.panel, [role="dialog"], .modal')).find(el => {
                if (el.closest('#pelican-hud') || el.closest('.inventory')) return false;
                const txt = (el.innerText || el.textContent || '');
                return (txt.includes('สมุดการ์ด') || txt.includes('Card Album') || txt.includes('Card Book')) && el.offsetWidth > 0;
            });
            if (cardBookModal) {
                const closeBtn = cardBookModal.querySelector('button.close, button[aria-label="ปิด"], button.inv-close') ||
                                 Array.from(cardBookModal.querySelectorAll('button, span, div')).find(el => (el.innerText || '').trim() === '✕');
                if (closeBtn) {
                    triggerClick(closeBtn);
                } else {
                    dispatchKeyAll('Escape', 'Escape', 27);
                }
            }
        } catch(e) {}
    }

    window.clickSortBag = function() {
        try {
            const bagInfo = getOpenBagInfo();
            if (bagInfo && bagInfo.sortBtn) {
                triggerClick(bagInfo.sortBtn);
                console.log('%c[Pelican Inventory] 🔄 คลิกปุ่ม "จัดเรียง" (Sort) สำเร็จ!', 'color: #22c55e; font-weight: bold;');
                return true;
            }

            const directSort = document.querySelector('button.inv-sort');
            if (directSort && directSort.offsetWidth > 0) {
                triggerClick(directSort);
                console.log('%c[Pelican Inventory] 🔄 คลิกปุ่ม "จัดเรียง" (Sort) สำเร็จ!', 'color: #22c55e; font-weight: bold;');
                return true;
            }

            // ค้นหาทั่วทั้งจอ
            const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a, span, div')).filter(el => {
                if (!isValidNonBotElement(el)) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                return (txt === 'จัดเรียง' || txt === 'จัดเรียงไอเทม' || txt === 'Sort') && el.offsetWidth > 0;
            });

            if (candidates.length > 0) {
                const btn = candidates.find(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') || candidates[0];
                triggerClick(btn);
                console.log('%c[Pelican Inventory] 🔄 คลิกปุ่ม "จัดเรียง" (Sort) สำเร็จ!', 'color: #22c55e; font-weight: bold;');
                return true;
            }
        } catch(e) {}
        return false;
    };

    function closeOpenBagWindow() {
        closeCardBookIfOpen();
        const bagPanel = document.querySelector('.inventory.panel, div[role="dialog"][aria-label="กระเป๋า"]');
        if (bagPanel) {
            const closeBtn = bagPanel.querySelector('button.inv-close') ||
                             Array.from(bagPanel.querySelectorAll('button, div, span, [aria-label="ปิด"], [class*="close"]')).find(el => {
                                 const txt = (el.innerText || el.textContent || '').trim();
                                 return (txt === '✕' || txt === 'X' || txt === 'ปิด') && el.offsetWidth > 0;
                             });
            if (closeBtn) {
                triggerClick(closeBtn);
                return;
            }
        }
        dispatchKeyAll('i', 'KeyI', 73);
        dispatchKeyAll('Escape', 'Escape', 27);
    }

    window.__isRefreshingWeight = false;

    window.refreshInventoryAndWeight = function(callback, forceOpen = false) {
        // ถ้ามีข้อมูลน้ำหนักและกระเป๋าอยู่แล้ว และไม่ได้สั่ง forceOpen ให้ใช้ข้อมูลเดิมทันทีโดยไม่ต้องเปิดกระเป๋า
        const weightData = window.__serverWeight || window.__lastKnownWeight;
        if (!forceOpen && window.__latestInventory && weightData && typeof weightData.percent === 'number' && weightData.max > 0) {
            window.__lastKnownWeight = weightData;
            updateWeightHUD(weightData);
            if (typeof callback === 'function') callback(weightData);
            return;
        }

        if (window.__isRefreshingWeight) {
            if (typeof callback === 'function') callback(window.__lastKnownWeight);
            return;
        }

        window.__isRefreshingWeight = true;

        // ปิดหน้าต่างสมุดการ์ดทันทีกรณีเคยถูกเปิดค้างไว้
        closeCardBookIfOpen();

        const safetyTimer = setTimeout(() => {
            window.__isRefreshingWeight = false;
            if (typeof callback === 'function') callback(window.__lastKnownWeight);
        }, 5000);

        const finish = (w) => {
            clearTimeout(safetyTimer);
            window.__isRefreshingWeight = false;
            if (w) {
                window.__lastKnownWeight = w;
                try { localStorage.setItem('pelican_last_weight', JSON.stringify(w)); } catch(e) {}
                updateWeightHUD(w);
            }
            if (typeof callback === 'function') callback(w || window.__lastKnownWeight);
        };

        // 1. ตรวจสอบว่าหน้าต่างกระเป๋าเปิดอยู่แล้วหรือไม่
        const openBag = getOpenBagInfo();
        if (openBag) {
            window.clickSortBag();
            setTimeout(() => {
                const w = getCharacterWeight();
                finish(w);
            }, 300);
            return;
        }

        // 2. ถ้าหน้าต่างกระเป๋าปิดอยู่: ดำเนินการเปิดกระเป๋า
        console.log('%c[Pelican Inventory] 🎒 กำลังเปิดกระเป๋าเพื่ออ่านน้ำหนักและกดจัดเรียง...', 'color: #38bdf8;');

        // วิธี A: คลิกปุ่มกระเป๋าจาก selector แท้ของเกม (button.menu-btn[title*="กระเป๋า"])
        const directBagBtn = document.querySelector('button.menu-btn[title*="กระเป๋า"], button[title="กระเป๋า (I)"]');
        if (directBagBtn) {
            triggerClick(directBagBtn);
        } else {
            const bagBtn = Array.from(document.querySelectorAll('button, div, [role="button"], a, span, li, p')).find(el => {
                if (!isValidNonBotElement(el)) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                return (txt === 'กระเป๋า' || (txt.includes('กระเป๋า') && txt.length <= 15 && !txt.includes('/')));
            });

            if (bagBtn) {
                try { bagBtn.scrollIntoView(); } catch(e) {}
                triggerClick(bagBtn);
            } else {
                // ถ้าไม่เจอปุ่มกระเป๋า ให้คลิกปุ่ม "เมนู" เพื่อเปิดเมนูกริดออกมาก่อน
                const menuBtn = Array.from(document.querySelectorAll('button, div, [role="button"]')).find(el => {
                    if (!isValidNonBotElement(el)) return false;
                    const txt = (el.innerText || el.textContent || '').trim();
                    return txt === '▲ เมนู' || txt === 'เมนู';
                });
                if (menuBtn) {
                    triggerClick(menuBtn);
                    setTimeout(() => {
                        const subBagBtn = document.querySelector('button.menu-btn[title*="กระเป๋า"]') ||
                                          Array.from(document.querySelectorAll('button, div, [role="button"], a, span, li, p')).find(el => {
                                              if (!isValidNonBotElement(el)) return false;
                                              const txt = (el.innerText || el.textContent || '').trim();
                                              return (txt === 'กระเป๋า' || (txt.includes('กระเป๋า') && txt.length <= 15 && !txt.includes('/')));
                                          });
                        if (subBagBtn) {
                            try { subBagBtn.scrollIntoView(); } catch(e) {}
                            triggerClick(subBagBtn);
                        }
                    }, 120);
                }
            }
        }

        // วิธี B: ส่งคำสั่ง Keyboard 'I' เท่านั้น (ห้ามส่ง 'B' เด็ดขาดเพราะใน Aetheria Online คือคีย์ลัดของ "สมุดการ์ด"!)
        dispatchKeyAll('i', 'KeyI', 73);

        // 3. Poll รอจนกว่าหน้าต่างกระเป๋าจะเปิดออกมา (เช็คทุก 50ms สูงสุด 30 รอบ = 1.5 วินาที)
        let pollCount = 0;
        const pollInterval = setInterval(() => {
            pollCount++;
            const currentBag = getOpenBagInfo();
            if (currentBag || pollCount >= 30) {
                clearInterval(pollInterval);

                window.clickSortBag();

                setTimeout(() => {
                    const w = getCharacterWeight();

                    // ปิดหน้าต่างกระเป๋ากลับอัตโนมัติเฉพาะกรณีที่เราเป็นคนสั่งเปิด
                    if (currentBag) {
                        closeOpenBagWindow();
                    }
                    closeCardBookIfOpen();

                    finish(w);
                }, 350);
            } else if (pollCount === 10) {
                // Retry dispatching 'I' at 500ms if not open yet
                dispatchKeyAll('i', 'KeyI', 73);
            }
        }, 50);
    };

    // ==========================================
    // 2. UNIVERSAL WEBSOCKET HOOKING (All-Vector Sniffer)
    // ==========================================
    function processIncomingData(rawData) {
        recordPacket('IN', rawData);
        try {
            const u = new Uint8Array(rawData instanceof ArrayBuffer ? rawData : rawData.buffer);
            if (u[0] === 0x0D) {
                // ตรวจสอบแพ็กเก็ต 'character' (0x0D + fixstr 9 'character')
                if (u.length > 20 && u[1] === 0xa9 && u[2] === 0x63 && u[3] === 0x68 && u[4] === 0x61 && u[5] === 0x72 && u[6] === 0x61 && u[7] === 0x63 && u[8] === 0x74 && u[9] === 0x65 && u[10] === 0x72) {
                    try {
                        const charDec = window.msgpack.decode(u.slice(11));
                        if (charDec && typeof charDec === 'object') {
                            window.__latestCharacterData = charDec;
                            if (typeof charDec.zeny === 'number') {
                                window.__currentZeny = charDec.zeny;
                                try { localStorage.setItem('pelican_current_zeny', String(charDec.zeny)); } catch(e) {}
                                const quickZeny = document.getElementById('p-quick-zeny');
                                if (quickZeny) {
                                    quickZeny.innerText = `🪙 ${charDec.zeny.toLocaleString()} z`;
                                }
                            }
                        }
                    } catch(err) {
                        console.warn('[Pelican Character] Error parsing character packet:', err);
                    }
                }

                // ตรวจสอบแพ็กเก็ต 'market_results' (0x0D + fixstr 14 'market_results')
                if (u.length > 20 && u[1] === 0xae && u[2] === 0x6d && u[3] === 0x61 && u[4] === 0x72 && u[5] === 0x6b && u[6] === 0x65 && u[7] === 0x74 && u[8] === 0x5f && u[9] === 0x72) {
                    try {
                        const marketDec = window.msgpack.decode(u.slice(16));
                        if (marketDec && Array.isArray(marketDec.listings)) {
                            window.handleIncomingMarketResults(marketDec);
                        }
                    } catch(err) {
                        console.warn('[Pelican Market] Error parsing market_results packet:', err);
                    }
                }

                // ตรวจสอบว่าคือแพ็กเก็ต 'inventory' หรือไม่ (0x0D + fixstr(9) 'inventory')
                const isInventoryPacket = (u.length > 15 && u[1] === 0xa9 && u[2] === 0x69 && u[3] === 0x6e && u[4] === 0x76);
                const targetOffset = isInventoryPacket ? 11 : -1;

                let slotsPos = -1;
                for (let i = 0; i < Math.min(u.length - 5, 80); i++) {
                    if (u[i] === 0x73 && u[i+1] === 0x6c && u[i+2] === 0x6f && u[i+3] === 0x74 && u[i+4] === 0x73) {
                        slotsPos = i;
                        break;
                    }
                }

                const offsetsToTry = targetOffset !== -1 ? [targetOffset] : [];
                if (slotsPos !== -1) {
                    for (let offset = Math.max(0, slotsPos - 4); offset <= slotsPos; offset++) {
                        if (!offsetsToTry.includes(offset)) offsetsToTry.push(offset);
                    }
                }

                if (offsetsToTry.length > 0) {
                    for (const offset of offsetsToTry) {
                        try {
                            const dec = window.msgpack.decode(u.slice(offset));
                            if (dec && typeof dec === 'object') {
                                window.__latestInventory = dec;
                                try { localStorage.setItem('pelican_latest_inventory', JSON.stringify(dec)); } catch(e) {}
                                const targetArrowId = (window.__archerConfig && window.__archerConfig.arrowType) ? parseInt(window.__archerConfig.arrowType) : 90030;
                                const arrowInfo = (typeof ARROW_DATA !== 'undefined' && ARROW_DATA[targetArrowId]) ? ARROW_DATA[targetArrowId] : { name: 'Arrow' };
                                let totalAmmo = 0;
                                let foundAny = false;

                                function inspectObject(obj, depth = 0) {
                                    if (!obj || depth > 5) return;
                                    if (Array.isArray(obj)) {
                                        for (const item of obj) {
                                            inspectObject(item, depth + 1);
                                        }
                                    } else if (typeof obj === 'object') {
                                        if (typeof isTargetArrow === 'function' && isTargetArrow(obj, targetArrowId)) {
                                            foundAny = true;
                                            totalAmmo += parseInt(obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 1) || 0;
                                            return; // เจอลูกธนูแล้ว ไม่ต้องลงลึกต่อ
                                        }
                                        for (const k in obj) {
                                            inspectObject(obj[k], depth + 1);
                                        }
                                    }
                                }

                                inspectObject(dec);

                                // Detect weight & weightLimit directly from server packet (Real-time Sync!)
                                try {
                                    const curW = dec.weight ?? dec.curWeight ?? dec.cur_weight ?? dec.currentWeight;
                                    const maxW = dec.weightLimit ?? dec.maxWeight ?? dec.max_weight ?? dec.weightMax ?? dec.totalWeight ?? dec.limitWeight ?? dec.weight_limit;
                                    if (typeof curW === 'number' && typeof maxW === 'number' && maxW > 0) {
                                        window.__serverWeight = { current: curW, max: maxW, percent: Math.round((curW / maxW) * 1000) / 10 };
                                        window.__lastKnownWeight = window.__serverWeight;
                                        try { localStorage.setItem('pelican_last_weight', JSON.stringify(window.__serverWeight)); } catch(e) {}
                                        if (window.__serverWeight.percent < (window.__sellConfig?.weightThreshold || 80)) {
                                            window.__isKnownOverweight = false;
                                        } else {
                                            window.__isKnownOverweight = true;
                                        }
                                        updateWeightHUD(window.__serverWeight);
                                        console.log(`%c[Pelican Weight Sync] ⚖️ Server Weight Realtime: ${curW.toLocaleString()} / ${maxW.toLocaleString()} (${window.__serverWeight.percent}%)`, 'color: #00ffcc; font-weight: bold;');
                                    }
                                } catch(e) {}

                                const hasInventoryList = dec && (dec.slots !== undefined || Array.isArray(dec) || typeof dec === 'object');
                                if (hasInventoryList) {
                                    const realQty = foundAny ? totalAmmo : 0;
                                    if (window.__currentAmmo !== realQty) {
                                        console.log(`%c[Pelican Ammo] 🏹 ซิงก์จำนวนลูกธนู "${arrowInfo.name}" จริงจาก Server: ${realQty} ดอก (เดิม ${window.__currentAmmo})`, 'color: #00ffcc; font-weight: bold;');
                                    }
                                    window.__currentAmmo = realQty;
                                    localStorage.setItem('pelican_current_ammo', realQty);
                                    updateAmmoHUD();
                                }
                                break;
                            }
                        } catch(err) {}
                    }
                }
            }
        } catch(err) {}
    }

    function processOutgoingData(data) {
        recordPacket('OUT', data);
        try {
            const uint8 = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
            for (let i = 0; i < uint8.length - 3; i++) {
                if (uint8[i] === 0xd4 && uint8[i+1] === 0x72) {
                    window.__lastMoveToken = uint8.slice(i, i + 3);
                    break;
                }
            }

            // EQUIP ACTION SNIFFER
            if (window.__isSniffingEquip) {
                const isMovePacket = uint8[1] === 0xa4 && uint8[2] === 0x6d && uint8[3] === 0x6f && uint8[4] === 0x76; // 'move'
                if (!isMovePacket) {
                    window.__isSniffingEquip = false;
                    const fullHex = Array.from(uint8).map(b => b.toString(16).padStart(2, '0')).join(' ');
                    let fullAscii = '';
                    for (let i = 0; i < uint8.length; i++) {
                        const b = uint8[i];
                        fullAscii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
                    }
                    let decoded = null;
                    try {
                        if (window.msgpack && uint8.length > 2) decoded = window.msgpack.decode(uint8.slice(1));
                    } catch(err) {}

                    console.log('%c======================================================', 'color: #22c55e;');
                    console.log('%c🎯 [EQUIP SNIFFER] ตรวจพบ Packet สวมใส่/ใช้งานไอเทม!', 'color: #22c55e; font-weight: bold; font-size: 14px;');
                    console.log(`%cความยาว: ${uint8.length} ไบต์ | Opcode: 0x${uint8[0].toString(16).toUpperCase()}`, 'color: #38bdf8; font-weight: bold;');
                    console.log('%cHex: ' + fullHex, 'color: #f59e0b;');
                    console.log('%cAscii: ' + fullAscii, 'color: #94a3b8;');
                    console.log('%cDecoded Data:', 'color: #a855f7;', decoded);
                    console.log('%c======================================================', 'color: #22c55e;');

                    const resBox = document.getElementById('p-sniffer-result');
                    if (resBox) {
                        resBox.style.display = 'block';
                        resBox.innerHTML = `
                            <div style="color: #22c55e; font-weight: bold; font-size: 11px;">✅ ตรวจพบ Packet สวมใส่!</div>
                            <div style="color: #38bdf8; font-size: 10px; margin-top: 1px;">Op: 0x${uint8[0].toString(16).toUpperCase()} | Len: ${uint8.length}B</div>
                            <div style="color: #cbd5e1; font-family: monospace; font-size: 9px; word-break: break-all; background: rgba(0,0,0,0.5); padding: 3px; border-radius: 3px; margin-top: 2px;">Hex: ${fullHex}</div>
                            <div style="color: #c084fc; font-size: 9.5px; margin-top: 2px;">Decoded: ${JSON.stringify(decoded)}</div>
                        `;
                    }

                    const clipData = JSON.stringify({ hex: fullHex, ascii: fullAscii, decoded: decoded, len: uint8.length }, null, 2);
                    window.safeCopyToClipboard(clipData, null);
                }
            }

            // ตรวจจับการยิงโจมตี (คำสั่ง target) เพื่อลดจำนวนลูกธนู Real-Time
            if (window.__archerConfig && window.__archerConfig.requireArrow && !window.__isShopping) {
                if (uint8[1] === 0xa6 && uint8[2] === 0x74 && uint8[3] === 0x61 && uint8[4] === 0x72) {
                    if (typeof window.__currentAmmo === 'number' && window.__currentAmmo > 0) {
                        window.__currentAmmo--;
                        updateAmmoHUD();
                    }
                }
            }
        } catch(e) {}
    }

    function hookSocketInstance(ws) {
        if (!ws || !isGameSocket(ws)) return;
        if (ws.__pelicanHooked) {
            if (ws.readyState === 1 && (!window.__gameSocket || window.__gameSocket.readyState !== 1)) {
                window.__gameSocket = ws;
                updateUIStatus(true);
            }
            return;
        }
        ws.__pelicanHooked = true;

        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) {
            window.__gameSocket = ws;
            if (ws.readyState === 1) updateUIStatus(true);
        }

        console.log('%c[Pelican] 🎯 Hooked Game WebSocket Instance Successfully!', 'color: #22c55e; font-weight: bold;', ws.url || '(active)');

        ws.addEventListener('open', () => {
            if (isGameSocket(ws)) {
                window.__gameSocket = ws;
                updateUIStatus(true);
            }
        });
        ws.addEventListener('message', (event) => {
            if (isGameSocket(ws)) {
                processIncomingData(event.data);
            }
        });
        ws.addEventListener('close', () => {
            if (window.__gameSocket === ws) {
                updateUIStatus(false);
                setTimeout(() => { if (typeof window.scanForActiveSocket === 'function') window.scanForActiveSocket(); }, 1000);
            }
        });

        const origInstanceSend = ws.send;
        ws.send = function(data) {
            if (isGameSocket(ws)) {
                window.__gameSocket = ws;
                processOutgoingData(data);
            }
            return origInstanceSend.apply(this, arguments);
        };
    }

    // 1. Hook WebSocket.prototype.send so even existing sockets get captured on their very first send
    const origProtoSend = OriginalWebSocket.prototype.send;
    OriginalWebSocket.prototype.send = function(data) {
        if (isGameSocket(this)) {
            if (!window.__gameSocket || window.__gameSocket !== this) {
                hookSocketInstance(this);
            }
            processOutgoingData(data);
        }
        return origProtoSend.apply(this, arguments);
    };

    // 2. Hook WebSocket.prototype.addEventListener to capture socket on registration
    const origProtoAddEventListener = OriginalWebSocket.prototype.addEventListener;
    OriginalWebSocket.prototype.addEventListener = function(type, listener, options) {
        if (type === 'message' && isGameSocket(this)) {
            if (!window.__gameSocket || window.__gameSocket !== this) {
                hookSocketInstance(this);
            }
        }
        return origProtoAddEventListener.apply(this, arguments);
    };

    // 3. Hook new WebSocket creation via Proxy
    window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(Target, args) {
            const ws = new Target(...args);
            if (isGameSocket(ws)) {
                hookSocketInstance(ws);
            }
            return ws;
        }
    });

    // 4. Actively scan window properties to find any existing WebSocket instance immediately
    window.scanForActiveSocket = function() {
        if (window.__gameSocket && window.__gameSocket.readyState === 1 && isGameSocket(window.__gameSocket)) return;
        for (const key of Object.getOwnPropertyNames(window)) {
            try {
                const val = window[key];
                if (val && val instanceof OriginalWebSocket && val.readyState === 1 && isGameSocket(val)) {
                    hookSocketInstance(val);
                    return;
                }
            } catch(e) {}
        }
        // Deep scan 1 level
        for (const key of Object.getOwnPropertyNames(window)) {
            try {
                const root = window[key];
                if (root && typeof root === 'object' && root !== window && !root.document && !root.window) {
                    for (const subKey of Object.keys(root)) {
                        try {
                            const subVal = root[subKey];
                            if (subVal && subVal instanceof OriginalWebSocket && subVal.readyState === 1 && isGameSocket(subVal)) {
                                hookSocketInstance(subVal);
                                return;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
        }
    };

    window.scanForActiveSocket();
    setInterval(window.scanForActiveSocket, 1000);

    // ==========================================
    // 3. WASD Reverse Backflip Engine
    // ==========================================
    window.executeReverseBackflip = function(mX, mY, force = false) {
        if (!window.__isBotRunning && !force) return;
        const now = Date.now();
        if (now - window.__lastBackflipTime < 1100) return;

        const curX = window.__currentPos.x;
        const curY = window.__currentPos.y;
        if (!curX && !curY) return;

        const dx = mX - curX;
        const dy = mY - curY;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        window.__lastBackflipTime = now;

        let turnKey = 's', turnCode = 'KeyS', turnKeyCode = 83;

        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
                turnKey = 'a'; turnCode = 'KeyA'; turnKeyCode = 65; // มอนอยู่ขวา -> หันซ้าย
            } else {
                turnKey = 'd'; turnCode = 'KeyD'; turnKeyCode = 68; // มอนอยู่ซ้าย -> หันขวา
            }
        } else {
            if (dy > 0) {
                turnKey = 'w'; turnCode = 'KeyW'; turnKeyCode = 87; // มอนอยู่ล่าง -> หันบน
            } else {
                turnKey = 's'; turnCode = 'KeyS'; turnKeyCode = 83; // มอนอยู่บน -> หันล่าง
            }
        }

        console.log(`%c[Pelican] ⚡ สั่งหันหน้า (${turnKey.toUpperCase()}) หนีมอน (${mX}, ${mY}) ระยะ: ${Math.round(dist)}px...`, 'color: #38bdf8;');

        const pressOpts = { key: turnKey, code: turnCode, keyCode: turnKeyCode, which: turnKeyCode, bubbles: true, cancelable: true, view: window };
        document.dispatchEvent(new KeyboardEvent('keydown', pressOpts));
        document.body.dispatchEvent(new KeyboardEvent('keydown', pressOpts));

        setTimeout(() => {
            document.dispatchEvent(new KeyboardEvent('keyup', pressOpts));
            document.body.dispatchEvent(new KeyboardEvent('keyup', pressOpts));

            setTimeout(() => {
                window.pressKey('2');
                console.log(`%c[Pelican] ⚡ ดีดตัวพุ่งชนมอนสเตอร์สำเร็จ!`, 'color: #22c55e; font-weight: bold;');
            }, 30);
        }, 45);
    };

    window.sendRespawn = function() {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x41];
        const buffer = new Uint8Array(9 + token.length + 9);
        buffer.set([0x0D, 0xA7, 0x72, 0x65, 0x73, 0x70, 0x61, 0x77, 0x6E], 0);
        buffer.set(token, 9);
        buffer.set([0x91, 0xA2, 0x74, 0x6F, 0xA4, 0x73, 0x61, 0x76, 0x65], 9 + token.length);
        window.__gameSocket.send(buffer.buffer);
        console.log('%c[Pelican] ⚡ Sent Respawn to Save Point!', 'color: #ef4444; font-weight: bold;');
    };

    // ------------------------------------------
    // In-Game AUTO Toggles & Detection
    // ------------------------------------------
    function getInGameAutoButton() {
        const candidates = Array.from(document.querySelectorAll('button, div, span, a, [role="button"]')).filter(el => {
            if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-sniffer-modal')) return false;
            if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
            if (el.offsetWidth > 160 || el.offsetHeight > 100) return false;
            const txt = (el.innerText || el.textContent || '').trim();
            return txt.includes('AUTO') && (txt.includes('เปิด') || txt.includes('ปิด'));
        });

        if (candidates.length > 0) {
            const btnTag = candidates.find(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button');
            if (btnTag) return btnTag;
            candidates.sort((a, b) => (a.offsetWidth * a.offsetHeight) - (b.offsetWidth * b.offsetHeight));
            return candidates[0];
        }

        const fallbacks = Array.from(document.querySelectorAll('button, div, [role="button"]')).filter(el => {
            if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-sniffer-modal')) return false;
            if (el.offsetWidth <= 0 || el.offsetHeight <= 0 || el.offsetWidth > 160 || el.offsetHeight > 100) return false;
            const txt = (el.innerText || el.textContent || '').trim();
            return txt === 'AUTO' || txt.startsWith('AUTO\n') || txt.startsWith('AUTO ');
        });

        if (fallbacks.length > 0) {
            const btnTag = fallbacks.find(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button');
            return btnTag || fallbacks[0];
        }

        return null;
    }

    function getInGameAutoStatus() {
        const btn = getInGameAutoButton();
        if (!btn) return 'unknown';

        const txt = (btn.innerText || btn.textContent || '').trim();
        if (txt.includes('เปิด')) return 'on';
        if (txt.includes('ปิด')) return 'off';

        if (btn.classList.contains('active') || btn.classList.contains('running') || btn.classList.contains('on') || btn.classList.contains('enabled')) {
            return 'on';
        }

        try {
            const cs = window.getComputedStyle(btn);
            const bg = cs.backgroundColor || '';
            const border = cs.borderColor || '';
            if (bg.includes('197') || bg.includes('222') || bg.includes('231') || bg.includes('185') || border.includes('245') || border.includes('234')) {
                return 'on';
            }
        } catch(e) {}

        return 'off';
    }

    function clickInGameAutoButton() {
        const btn = getInGameAutoButton();
        if (!btn) {
            console.warn('[Pelican Auto] ⚠️ ไม่พบปุ่ม AUTO บนหน้าจอเกม');
            return false;
        }

        triggerClick(btn);
        if (typeof btn.click === 'function') btn.click();

        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = { clientX: cx, clientY: cy, bubbles: true, cancelable: true, view: window, buttons: 1 };
        btn.dispatchEvent(new PointerEvent('pointerdown', opts));
        btn.dispatchEvent(new MouseEvent('mousedown', opts));
        btn.dispatchEvent(new PointerEvent('pointerup', opts));
        btn.dispatchEvent(new MouseEvent('mouseup', opts));
        btn.dispatchEvent(new MouseEvent('click', opts));
        return true;
    }

    function sendAutoSetPacket(enabled) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x41];
        const buffer = new Uint8Array(10 + token.length + 10);
        buffer.set([0x0D, 0xA8, 0x61, 0x75, 0x74, 0x6F, 0x5F, 0x73, 0x65, 0x74], 0);
        buffer.set(token, 10);
        buffer.set([0x91, 0xA7, 0x65, 0x6E, 0x61, 0x62, 0x6C, 0x65, 0x64, enabled ? 0xC3 : 0xC2], 10 + token.length);
        window.__gameSocket.send(buffer.buffer);
    }

    window.activateInGameAuto = function(force = false) {
        const status = getInGameAutoStatus();
        if (status === 'on' && !force) {
            console.log('%c[Pelican Auto] ⚡ In-Game AUTO เปิดอยู่แล้ว (Status: ON)', 'color: #22c55e;');
            sendAutoSetPacket(true);
            return;
        }

        // GUARD: ตรวจสอบน้ำหนักเกิน 90% หรือกระเป๋าเต็ม
        if (!force && typeof isCharacterOverweight === 'function' && isCharacterOverweight()) {
            console.warn('%c[Pelican Auto] 🛑 ไม่สามารถเปิด AUTO ได้ เนื่องจากน้ำหนักในกระเป๋าเต็มหรือเกิน 90%! สั่งวาร์ปกลับไปขายของทันที...', 'color: #ef4444; font-weight: bold;');
            if (typeof window.executeAutoShopRoutine === 'function') {
                window.executeAutoShopRoutine();
            }
            return;
        }

        console.log('%c[Pelican Auto] 🤖 กำลังคลิกเปิด In-Game AUTO...', 'color: #22c55e; font-weight: bold;');

        if (window.__archerConfig && window.__archerConfig.requireArrow && window.__archerConfig.autoEquipArrow) {
            if (typeof window.equipArrowAndBow === 'function') {
                window.equipArrowAndBow();
            }
        }

        clickInGameAutoButton();
        sendAutoSetPacket(true);
    };

    window.deactivateInGameAuto = function(force = false) {
        const status = getInGameAutoStatus();
        if (status === 'off' && !force) {
            console.log('%c[Pelican Auto] ⏹️ In-Game AUTO ปิดอยู่แล้ว (Status: OFF)', 'color: #94a3b8;');
            sendAutoSetPacket(false);
            return;
        }

        console.log('%c[Pelican Auto] ⏹️ กำลังคลิกปิด In-Game AUTO...', 'color: #ef4444; font-weight: bold;');
        clickInGameAutoButton();
        sendAutoSetPacket(false);
    };

    // Alias for backward compatibility
    window.startBot = window.activateInGameAuto;

    // ------------------------------------------
    // Timer & Interval Cleanup Manager
    // ------------------------------------------
    function clearAllBotTimers() {
        const timers = [
            '__alicePollInterval',
            '__shopConfirmInterval',
            '__shopArrivalInterval',
            '__shopWarpInterval',
            '__worldMapPollInterval',
            '__walkClickInterval',
            '__arrivalWatcherInterval'
        ];
        for (const t of timers) {
            if (window[t]) {
                clearInterval(window[t]);
                window[t] = null;
            }
        }
        if (window.__arrivalTimeout) {
            clearTimeout(window.__arrivalTimeout);
            window.__arrivalTimeout = null;
        }
    }

    // ------------------------------------------
    // Master START / STOP Controller (High-Level)
    // ------------------------------------------
    window.startMasterBot = function() {
        window.__isBotRunning = true;
        window.__autoLoopEnabled = true;
        localStorage.setItem('pelican_bot_running', 'true');
        localStorage.setItem('pelican_auto_loop', 'true');

        const loopCheckbox = document.getElementById('p-auto-loop');
        if (loopCheckbox) loopCheckbox.checked = true;

        if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
        console.log('%c[Pelican Master] 🚀 START BOT: กำลังเริ่มกระบวนการตรวจสอบสถานะและเดินงานอัตโนมัติ...', 'color: #10b981; font-weight: bold; font-size: 13px;');

        // 1. ตรวจสอบสถานะการมีชีวิต (Dead Check)
        if (typeof isCharacterDead === 'function' && isCharacterDead()) {
            console.log('%c[Pelican Master] 💀 ตรวจพบตัวละครเสียชีวิตอยู่! สั่งชุบชีวิตทันที...', 'color: #ef4444; font-weight: bold;');
            window.__isRecovering = true;
            window.sendRespawn();
            setTimeout(() => {
                window.__isRecovering = false;
                if (window.__isBotRunning) {
                    window.startMasterBot();
                }
            }, 3500);
            return;
        }

        function continueStart() {
            if (!window.__isBotRunning) return;

            // 2. ตรวจสอบลูกธนูและเสบียง (Ammo Check)
            if (typeof syncAmmoFromDOM === 'function') syncAmmoFromDOM();
            const requireArrow = window.__archerConfig && window.__archerConfig.requireArrow;
            const threshold = (window.__archerConfig && typeof window.__archerConfig.ammoThreshold === 'number') ? window.__archerConfig.ammoThreshold : 50;
            const currentAmmo = typeof window.__currentAmmo === 'number' ? window.__currentAmmo : 999;

            if (requireArrow && currentAmmo <= threshold) {
                console.log(`%c[Pelican Master] 🏹 ลูกธนูหมดหรือเหลือน้อย (${currentAmmo} <= ${threshold} ดอก)! เริ่มต้นกระบวนการซื้อลูกธนูทันที...`, 'color: #f59e0b; font-weight: bold;');
                window.executeAutoShopRoutine();
                return;
            }

            // 2.1 ตรวจสอบน้ำหนักสัมภาระเกินเกณฑ์ (Weight Overload Check)
            if (typeof isCharacterOverweight === 'function' && isCharacterOverweight()) {
                const w = (typeof getCharacterWeight === 'function' ? getCharacterWeight() : null) || window.__lastKnownWeight || window.__serverWeight;
                const pctStr = w ? `${w.percent}%` : '>= เกณฑ์';
                const limitStr = `${window.__sellConfig?.weightThreshold || 80}%`;
                console.warn(`%c[Pelican Master] ⚖️ ตรวจพบกระเป๋าเต็มหรือน้ำหนักเกินเกณฑ์ (${pctStr} >= ${limitStr})! เริ่มต้นกระบวนการขายของและเคลียร์กระเป๋าทันที...`, 'color: #ef4444; font-weight: bold;');
                if (typeof playWarningChime === 'function') playWarningChime();
                window.executeAutoShopRoutine();
                return;
            }

            // 3. ตรวจสอบแมพปัจจุบันและแมพเป้าหมาย (Map Check)
            const currentMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
            const targetMap = window.__targetFarmMap || 'ถนนต้นหลิว';
            console.log(`%c[Pelican Master] 🗺️ ตรวจสอบแมพ: แมพปัจจุบัน = "${currentMap || 'ไม่ทราบ'}" | แมพเป้าหมาย = "${targetMap}"`, 'color: #38bdf8; font-weight: bold;');

            // Case A: ตัวละครอยู่ที่แมพเป้าหมายแล้ว!
            if (currentMap && currentMap.includes(targetMap)) {
                if (typeof isCharacterOverweight === 'function' && isCharacterOverweight()) {
                    console.warn('%c[Pelican Master] ⚖️ ถึงแมพแล้วแต่น้ำหนักเต็ม/เกินเกณฑ์! สั่งวาร์ปกลับไปขายของทันที...', 'color: #ef4444; font-weight: bold;');
                    if (typeof playWarningChime === 'function') playWarningChime();
                    window.executeAutoShopRoutine();
                    return;
                }
                console.log(`%c[Pelican Master] 🎯 ตัวละครอยู่ที่แมพ "${targetMap}" เรียบร้อยแล้ว! เปิดระบบ Auto โจมตีฟาร์มทันที!`, 'color: #22c55e; font-weight: bold;');
                window.activateInGameAuto();
                return;
            }

            // Case B: ตัวละครอยู่ในเมืองหลวง (Soulhaven) -> วาร์ปผ่าน Alice Service (n6)
            if (typeof isCharacterInCity === 'function' && isCharacterInCity()) {
                console.log(`%c[Pelican Master] 🏛️ ตัวละครอยู่ในเมืองหลวง -> ใช้วาร์ปเกตด่วน NPC Alice เพื่อไปยัง "${targetMap}" (Warp Service ไม่ใช่ซื้อของ/ลูกธนู)`, 'color: #eab308; font-weight: bold;');
                window.walkToTargetMap(targetMap, true);
                return;
            }

            // Case C: ตัวละครอยู่แมพมอนสเตอร์อื่น -> เดินทางไปยังแมพเป้าหมาย
            console.log(`%c[Pelican Master] 🚶 กำลังเริ่มเดินทางไปยังแมพเป้าหมาย: "${targetMap}"...`, 'color: #38bdf8; font-weight: bold;');
            window.walkToTargetMap(targetMap, true);
        }

        // ตรวจสอบสถานะน้ำหนัก: ถ้ากระเป๋าเปิดอยู่แล้ว ให้จัดเรียงและอ่านน้ำหนัก
        // ถ้ากระเป๋าปิดอยู่ ให้ใช้ค่าน้ำหนักจากแคชหรือสถานะ Debuff บนจอ เพื่อไม่ให้หน้าต่างเด้งรบกวนสายตา
        if (typeof getOpenBagInfo === 'function' && getOpenBagInfo()) {
            if (typeof window.clickSortBag === 'function') window.clickSortBag();
            if (typeof getCharacterWeight === 'function') getCharacterWeight();
        }
        continueStart();
    };

    window.stopMasterBot = function() {
        window.__isBotRunning = false;
        window.__autoLoopEnabled = false;
        localStorage.setItem('pelican_bot_running', 'false');
        localStorage.setItem('pelican_auto_loop', 'false');

        const loopCheckbox = document.getElementById('p-auto-loop');
        if (loopCheckbox) loopCheckbox.checked = false;

        // 1. ล้าง Interval และ Timeout ทั้งหมดที่ค้างส่ง packet ทันที!
        clearAllBotTimers();
        if (typeof stopArrivalWatcher === 'function') stopArrivalWatcher();

        // 2. ปิดระบบ In-Game AUTO ของเกมอย่างแน่นอน
        window.deactivateInGameAuto();
        setTimeout(() => {
            if (getInGameAutoStatus() === 'on') {
                window.deactivateInGameAuto();
            }
        }, 350);

        // 3. ปิดการสนทนา NPC เพื่อตัดลูปที่ค้างอยู่ที่ Server
        if (typeof window.sendNpcClose === 'function') {
            window.sendNpcClose();
        }

        // 4. รีเซ็ตสถานะการทำงาน
        window.__isNavigating = false;
        window.__isShopping = false;
        window.__isRecovering = false;

        // 5. ปิดเมนูและหน้าต่างที่อาจค้างอยู่
        if (typeof closeAnyOpenMenus === 'function') {
            closeAnyOpenMenus();
        }
        dispatchKeyAll('Escape', 'Escape', 27);

        if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
        console.log('%c[Pelican Master] 🛑 STOP BOT: ปิดระบบการทำงานทั้งหมด เคลียร์ Timer และหยุดส่ง Packet โดยเด็ดขาด!', 'color: #ef4444; font-weight: bold; font-size: 13px;');
    };

    window.toggleMasterBot = function() {
        if (window.__isBotRunning) {
            window.stopMasterBot();
        } else {
            window.startMasterBot();
        }
    };

    // ==========================================
    // 3.5 Auto Merchant & Shop State Machine
    // ==========================================
    window.sendRemoteNpcTalk = function(key = (window.__shopConfig ? window.__shopConfig.npcKey : 'n2')) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xA8, 0x6E, 0x70, 0x63, 0x5F, 0x74, 0x61, 0x6C, 0x6B];
        const keyBytes = Array.from(key).map(c => c.charCodeAt(0));
        const suffix = [0x91, 0xA6, 0x6E, 0x70, 0x63, 0x4B, 0x65, 0x79, 0xA0 + keyBytes.length, ...keyBytes];

        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);

        let tag = '[Pelican Shop]';
        let color = '#f59e0b';
        if (key === 'n6') {
            tag = '[Pelican Warp/Alice]';
            color = '#38bdf8';
        } else if (key === 'n1') {
            tag = '[Pelican Storage]';
            color = '#a855f7';
        }
        console.log(`%c${tag} 📡 ส่ง Packet 'npc_talk' (NPC: ${key})...`, `color: ${color}; font-weight: bold;`);
    };

    window.sendRemoteNpcOption = function(index = 0) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xAA, 0x6E, 0x70, 0x63, 0x5F, 0x6F, 0x70, 0x74, 0x69, 0x6F, 0x6E];
        const suffix = [0x91, 0xA5, 0x69, 0x6E, 0x64, 0x65, 0x78, index];

        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log(`%c[Pelican Shop] 🛒 ส่ง Packet 'npc_option' (Index: ${index})...`, 'color: #38bdf8;');
    };

    window.sendRemoteNpcHeal = function() {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xAA, 0x6E, 0x70, 0x63, 0x5F, 0x6F, 0x70, 0x74, 0x69, 0x6F, 0x6E];
        const suffix = [0x91, 0xA5, 0x69, 0x6E, 0x64, 0x65, 0x78, 0x03];

        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log('%c[Pelican Heal] 💖 ส่ง Packet ฟื้นฟูเลือด/มานา (npc_option index: 3) สำเร็จ!', 'color: #ec4899; font-weight: bold;');
    };

    window.closeShopUI = function() {
        try {
            // 1. ค้นหาหน้าต่างร้านค้า / Cart / Dialog ทั้งหมดบนหน้าจอ
            const shopModals = Array.from(document.querySelectorAll('.shop-window, .cart-shop, [class*="shop-window"], [class*="cart-shop"], .npc-dialog, .dialog')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-log')) return false;
                return el.offsetWidth > 0 || el.offsetHeight > 0;
            });

            // ค้นหา window panel ที่มีเนื้อหาเกี่ยวกับร้านค้า General Goods หรือตะกร้าซื้อ/ขาย
            const otherShopPanels = Array.from(document.querySelectorAll('.window.panel, .modal, .panel')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-log')) return false;
                const txt = (el.innerText || el.textContent || '');
                return (txt.includes('General Goods') || txt.includes('ตะกร้าซื้อ') || txt.includes('ตะกร้าขาย') || txt.includes('ตรวจสอบและซื้อ') || txt.includes('ตรวจสอบและขาย')) && (el.offsetWidth > 0 || el.offsetHeight > 0);
            });

            const allModals = Array.from(new Set([...shopModals, ...otherShopPanels]));
            let closedCount = 0;

            for (const win of allModals) {
                // ค้นหาปุ่มปิด win-close หรือ ✕
                const closeBtn = win.querySelector('button.win-close, button.close, [aria-label="ปิด"], [class*="close"]') ||
                                 Array.from(win.querySelectorAll('button, div, span, [role="button"]')).find(el => {
                                     const t = (el.innerText || el.textContent || '').trim();
                                     return t === '✕' || t === 'X' || (el.className && typeof el.className === 'string' && el.className.includes('close'));
                                 });

                if (closeBtn) {
                    if (typeof triggerClick === 'function') {
                        triggerClick(closeBtn);
                    } else if (typeof closeBtn.click === 'function') {
                        closeBtn.click();
                    }
                    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    closedCount++;
                }

                // Failsafe: สั่งซ่อน element ทันทีเพื่อไม่ให้บัง Canvas และไม่ขวาง Mouse Pointer
                setTimeout(() => {
                    if (win && (win.offsetWidth > 0 || win.offsetHeight > 0)) {
                        win.style.display = 'none';
                        try { win.remove(); } catch(e) {}
                    }
                }, 120);
            }

            dispatchKeyAll('Escape', 'Escape', 27);

            if (closedCount > 0) {
                console.log(`%c[Pelican Shop] 🚪 ปิดหน้าต่างร้านค้าสำเร็จ (${closedCount} หน้าต่าง)`, 'color: #94a3b8; font-weight: bold;');
            }
        } catch(e) {
            console.error('[Pelican Shop] เกิดข้อผิดพลาดในการปิดหน้าต่างร้านค้า:', e);
        }
    };

    window.sendNpcClose = function() {
        if (window.__gameSocket && window.__gameSocket.readyState === 1) {
            const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
            const prefix = [0x0D, 0xA9, 0x6E, 0x70, 0x63, 0x5F, 0x63, 0x6C, 0x6F, 0x73, 0x65];
            const suffix = [0x90];

            const buf = new Uint8Array(prefix.length + token.length + suffix.length);
            buf.set(prefix, 0);
            buf.set(token, prefix.length);
            buf.set(suffix, prefix.length + token.length);
            window.__gameSocket.send(buf.buffer);
            console.log('%c[Pelican Shop] 🚪 ส่ง npc_close ปิดหน้าร้านค้า (Packet)', 'color: #94a3b8;');
        }
        // ปิด DOM UI ของหน้าร้านค้าเสมอ
        if (typeof window.closeShopUI === 'function') {
            window.closeShopUI();
        }
    };

    // ==========================================
    // ALICE WARP SERVICE (npc_warp via n6)
    // ==========================================
    const MAP_NAME_TO_ID = {
        'ป่ามูนลีฟ': 'moon_forest',
        'Moonleaf Forest': 'moon_forest',
        'ทะเลสาบอาซูร์': 'azure_lake',
        'Azure Lake': 'azure_lake',
        'ทุ่งโคลเวอร์': 'clover_field',
        'Clover Field': 'clover_field',
        'ทุ่งหญ้าตะวันออก': 'east_field',
        'East Meadow': 'east_field',
        'ไร่ซันเกรน': 'sungrain_farm',
        'Sungrain Farm': 'sungrain_farm',
        'ถนนต้นหลิว': 'willow_road',
        'Willow Road': 'willow_road',
        'สวนนักผจญภัยมือใหม่': 'novice_garden',
        'Novice Garden': 'novice_garden',
        'เส้นทางก็อบลิน': 'goblin_trail',
        'Goblin Trail': 'goblin_trail',
        'ค่ายออร์ค': 'orc_camp',
        'Orc Camp': 'orc_camp',
        'ถ้ำเอมเบอร์': 'ember_cave',
        'Ember Cave': 'ember_cave',
        'ที่ราบสูงเกล': 'gale_plateau',
        'Gale Plateau': 'gale_plateau',
        'แอ่งเวอร์แดนท์': 'verdant_basin',
        'Verdant Basin': 'verdant_basin',
        'ช่องเขาฟรอสต์พีค': 'frostpeak_pass',
        'Frostpeak Pass': 'frostpeak_pass',
        'ตลาดคาราวาน': 'caravan_market',
        'Caravan Market': 'caravan_market',
        'ชายฝั่งปะการัง': 'coral_coast',
        'Coral Coast': 'coral_coast',
        'ซากโบราณสถาน': 'ancient_ruins',
        'Ancient Ruins': 'ancient_ruins',
        'สุสานเงา': 'shadow_tomb',
        'Shadow Tomb': 'shadow_tomb',
        'โบสถ์อเวจี': 'abyss_church',
        'Abyss Church': 'abyss_church',
        'หนองพิษ': 'poison_swamp',
        'Poison Swamp': 'poison_swamp',
        'บึงรากเน่า': 'rotroot_marsh',
        'Rotroot Marsh': 'rotroot_marsh',
        'พีระมิดจมทราย': 'sunken_pyramid',
        'Sunken Pyramid': 'sunken_pyramid',
        'เนินทรายแผดเผา': 'scorching_dunes',
        'Scorching Dunes': 'scorching_dunes',
        'แกนลาวา': 'lava_core',
        'Lava Core': 'lava_core',
        'เหมืองคริสตัลเก่า': 'old_crystal_mine',
        'Old Crystal Mine': 'old_crystal_mine',
        'เมืองหลวงโซลเฮเวน': 'soulhaven',
        'Soulhaven Capital': 'soulhaven'
    };

    window.sendNpcWarp = function(mapId) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1 || !mapId) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xA8, 0x6E, 0x70, 0x63, 0x5F, 0x77, 0x61, 0x72, 0x70];
        const mapBytes = Array.from(mapId).map(c => c.charCodeAt(0));
        const suffix = [
            0x91, 0xA5, 0x6D, 0x61, 0x70, 0x49, 0x64,
            0xA0 + mapBytes.length, ...mapBytes
        ];
        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log(`%c[Pelican Warp] ⚡ ยิง Packet 'npc_warp' (MapId: "${mapId}") สำเร็จ!`, 'color: #22c55e; font-weight: bold;');
    };

    window.openAliceWarpService = function(callback) {
        // ล้างหน้าต่างร้านค้าหรือ dialog ค้างเก่าก่อนเริ่มคุยกับ Alice เสมอ
        if (typeof window.closeShopUI === 'function') {
            window.closeShopUI();
        }

        // ตรวจสอบว่าหน้าต่างบทสนทนาของ Alice เปิดอยู่บนจอหรือไม่
        function isAliceDialogOpen() {
            const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-log')) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                return (txt.includes('ยินดีต้อนรับสู่เมืองหลวง') || txt.includes('ให้ฉันช่วยอะไรดี') || txt.includes('บันทึกจุดเกิดที่นี่') || txt.includes('วาร์ป (เลือกจากแผนที่โลก)')) && el.offsetWidth > 0;
            });
            return candidates.length > 0;
        }

        // ตรวจสอบว่าหน้าต่างแผนที่วาร์ปของ Alice หรือหน้าต่าง WorldMap เปิดอยู่แล้วหรือไม่
        function isAliceMapWindowOpen() {
            if (typeof isWorldMapOpen === 'function' && isWorldMapOpen()) return true;
            const stage = document.querySelector('.worldmap-stage, .worldmap-body, .worldmap-window, [class*="worldmap"]');
            if (stage && stage.offsetWidth > 0) return true;
            const warpBtn = Array.from(document.querySelectorAll('button, [role="button"], div')).find(b => {
                if (b.closest('#pelican-hud') || b.closest('#pelican-data-modal')) return false;
                const txt = (b.innerText || b.textContent || '').trim();
                return (txt.includes('วาร์ปไปที่นี่') || txt.includes('เดินไปที่นี่')) && b.offsetWidth > 0;
            });
            return !!warpBtn;
        }

        // ฟังก์ชันช่วยค้นหาปุ่ม/แถวตัวเลือกในหน้าต่างสนทนาตามคีย์เวิร์ด
        function findDialogOption(keywords) {
            const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-log')) return false;
                if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
                const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt) return false;
                const matches = keywords.every(kw => txt.includes(kw)) || (keywords.length > 1 && keywords.some(kw => txt.includes(kw) && kw.length >= 3));
                if (!matches) return false;
                const rect = el.getBoundingClientRect();
                return rect.width >= 40 && rect.width <= 650 && rect.height >= 15 && rect.height <= 85;
            });

            if (candidates.length === 0) return null;

            // เลือกระดับ element ที่เล็กที่สุด (innermost row/button)
            candidates.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return (ra.width * ra.height) - (rb.width * rb.height);
            });
            return candidates[0];
        }

        if (isAliceMapWindowOpen()) {
            console.log('%c[Pelican Warp] 🗺️ หน้าต่าง Alice Warp Service เปิดอยู่แล้ว ทำงานต่อได้ทันที', 'color: #22c55e;');
            if (callback) callback();
            return;
        }

        console.log('%c[Pelican Warp] 🧙 กำลังเดินทางไปคุยกับ NPC Alice (Warp Service) เพื่อเปิดวาร์ปเกต...', 'color: #eab308; font-weight: bold;');

        // ฟังก์ชันช่วยค้นหาและคลิกป้ายชื่อ NPC Alice บนจอเกม (เฉพาะตอนที่ dialog ยังไม่เปิด)
        function findAliceElement() {
            if (isAliceDialogOpen()) return null;

            const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-log')) return false;
                if (el.closest('.dialog, .modal, [class*="dialog"], [class*="modal"]')) return false;
                const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt.includes('Alice')) return false;
                if (txt.includes('ยินดีต้อนรับ') || txt.includes('ช่วยอะไรดี') || txt.includes('จุดเกิด')) return false;
                const rect = el.getBoundingClientRect();
                return rect.width >= 15 && rect.width <= 350 && rect.height >= 10 && rect.height <= 85;
            });
            if (candidates.length > 0) {
                candidates.sort((a, b) => {
                    const ra = a.getBoundingClientRect();
                    const rb = b.getBoundingClientRect();
                    return (ra.width * ra.height) - (rb.width * rb.height);
                });
                return candidates[0];
            }
            return null;
        }

        function clickAliceOnScreen() {
            if (isAliceDialogOpen()) return false;

            const aliceLabel = findAliceElement();
            if (aliceLabel) {
                console.log('%c[Pelican Warp] 🎯 พบคลิกป้ายชื่อ "Alice Service" บนจอเพื่อให้ตัวละครเดินไปหา...', 'color: #38bdf8; font-weight: bold;');
                triggerClick(aliceLabel);

                const rect = aliceLabel.getBoundingClientRect();
                const canvas = document.querySelector('canvas');
                if (canvas) {
                    const clientX = rect.left + rect.width / 2;
                    const clientY = rect.top + rect.height / 2;
                    const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY, buttons: 1 };
                    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
                    canvas.dispatchEvent(new MouseEvent('mousedown', opts));
                    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
                    canvas.dispatchEvent(new MouseEvent('mouseup', opts));
                    canvas.dispatchEvent(new MouseEvent('click', opts));
                }
                return true;
            }
            return false;
        }

        // 1. ลองคลิกที่ตัว Alice บนจอเกม
        clickAliceOnScreen();

        // 2. ส่ง Packet npc_talk เพื่อเปิดคุย
        window.sendRemoteNpcTalk('n6');

        let attempts = 0;
        let lastPos = { x: 0, y: 0 };
        let stillCount = 0;
        let hasHealed = false;
        let hasRequestedMap = false;
        let lastActionTime = 0;
        const maxAttempts = 35; // 35 * 600ms = 21 วินาที ให้เวลาเดินข้ามเมืองจากร้านค้ามาหา Alice อย่างสบายๆ

        if (window.__alicePollInterval) {
            clearInterval(window.__alicePollInterval);
            window.__alicePollInterval = null;
        }

        window.__alicePollInterval = setInterval(() => {
            if (!window.__isBotRunning && !window.__isManualWarping) {
                clearInterval(window.__alicePollInterval);
                window.__alicePollInterval = null;
                return;
            }

            attempts++;

            if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                clearInterval(window.__alicePollInterval);
                window.__alicePollInterval = null;
                return;
            }

            // ถ้าหน้าต่างแผนที่วาร์ปเปิดแล้ว ให้ตัดจบและทำงานต่อทันที
            if (isAliceMapWindowOpen()) {
                clearInterval(window.__alicePollInterval);
                window.__alicePollInterval = null;
                console.log('%c[Pelican Warp] 🗺️ หน้าต่างแผนที่ Alice Warp Service พร้อมใช้งาน!', 'color: #00ffcc; font-weight: bold;');
                setTimeout(() => { if (callback) callback(); }, 300);
                return;
            }

            const dialogOpen = isAliceDialogOpen();
            const now = Date.now();

            // =========================================================
            // กรณีที่ 1: หน้าต่างสนทนา Alice เปิดอยู่บนจอแล้ว
            // (หยุดคลิกเดินและหยุดส่ง npc_talk ซ้ำโดยเด็ดขาด!)
            // =========================================================
            if (dialogOpen) {
                const healOption = findDialogOption(['ขอรักษาหน่อย']) || findDialogOption(['รักษา']) || findDialogOption(['ฟื้นฟู']);
                const warpOption = findDialogOption(['วาร์ป', 'แผนที่โลก']) || findDialogOption(['วาร์ป']) || findDialogOption(['Alice Warp']);

                // สเต็ป 1: กดฮีลฟื้นฟูเลือด/มานาก่อน (index: 3)
                if (!hasHealed) {
                    if (healOption) {
                        console.log('%c[Pelican Warp] 💖 พบคลิกตัวเลือกฮีลบนจอ: "' + (healOption.innerText || '').trim() + '"', 'color: #ec4899; font-weight: bold;');
                        triggerClick(healOption);
                    }
                    if (typeof window.sendRemoteNpcHeal === 'function') {
                        window.sendRemoteNpcHeal();
                    } else {
                        window.sendRemoteNpcOption(3);
                    }
                    hasHealed = true;
                    lastActionTime = now;

                    // เว้นจังหวะ 350ms แล้วกดเลือกเปิดแผนที่วาร์ป (Option 2 / index: 1)
                    setTimeout(() => {
                        if (!window.__isBotRunning && !window.__isManualWarping) return;
                        if (isAliceMapWindowOpen()) return;

                        const curWarpOpt = findDialogOption(['วาร์ป', 'แผนที่โลก']) || findDialogOption(['วาร์ป']) || findDialogOption(['Alice Warp']);
                        if (curWarpOpt) {
                            console.log('%c[Pelican Warp] 🔘 พบคลิกตัวเลือกในกล่องสนทนา: "' + (curWarpOpt.innerText || '').trim() + '"', 'color: #00ffcc; font-weight: bold;');
                            triggerClick(curWarpOpt);
                        }
                        console.log('%c[Pelican Warp] 🗺️ ส่ง Packet เลือก Alice Warp Service (index: 1)...', 'color: #38bdf8; font-weight: bold;');
                        window.sendRemoteNpcOption(1);
                        hasRequestedMap = true;
                        lastActionTime = Date.now();
                    }, 350);
                    return;
                }

                // สเต็ป 2: ถ้าฮีลแล้ว แต่ยังไม่ได้เลือกวาร์ป หรือรอเกิน 1.2 วินาทีแล้วแผนที่ยังไม่เปิด
                if (!hasRequestedMap || (now - lastActionTime > 1200)) {
                    if (warpOption) {
                        console.log('%c[Pelican Warp] 🔘 พบคลิกตัวเลือกในกล่องสนทนา: "' + (warpOption.innerText || '').trim() + '"', 'color: #00ffcc; font-weight: bold;');
                        triggerClick(warpOption);
                    }
                    console.log('%c[Pelican Warp] 🗺️ ส่ง Packet เลือก Alice Warp Service (index: 1)...', 'color: #38bdf8; font-weight: bold;');
                    window.sendRemoteNpcOption(1);
                    hasRequestedMap = true;
                    lastActionTime = now;
                }

                // อยู่ใน dialog: ห้ามคลิกเดินหรือส่งคำสั่งคุยซ้ำเด็ดขาด
                return;
            }

            // =========================================================
            // กรณีที่ 2: หน้าต่างสนทนายังไม่เปิด (ตัวละครกำลังเดินข้ามเมืองไปหา Alice)
            // =========================================================
            const curPos = window.__currentPos || { x: 0, y: 0 };
            const isStationary = (curPos.x === lastPos.x && curPos.y === lastPos.y && curPos.x !== 0);
            lastPos = { x: curPos.x, y: curPos.y };
            if (isStationary) stillCount++; else stillCount = 0;

            // ส่งคำสั่งเดิน/คุยกับ Alice ซ้ำทุกๆ 3 วินาที (5 รอบ) เพื่อไม่ให้ตัวละครชะงัก เฉพาะตอนที่ dialog ยังไม่เปิด
            if (attempts % 5 === 0) {
                if (typeof window.closeShopUI === 'function') window.closeShopUI();
                clickAliceOnScreen();
                window.sendRemoteNpcTalk('n6');
            }

            // เมื่อตัวละครหยุดเดิน (ถึงตัว Alice แล้ว) ส่ง packet คุยทันที
            if (isStationary && stillCount === 2) {
                if (typeof window.closeShopUI === 'function') window.closeShopUI();
                console.log('%c[Pelican Warp] 💬 ตัวละครหยุดเดิน (ถึงตัว Alice) -> ส่ง Packet คุย (n6)...', 'color: #38bdf8;');
                window.sendRemoteNpcTalk('n6');
            }

            // Timeout: ให้เวลาเดินอย่างน้อย 21 วินาที (35 รอบ) และถ้าตัวละครกำลังเดินอยู่ ให้รอต่อไปห้ามตัดจบ
            const isStillMoving = !isStationary && curPos.x !== 0;
            if (attempts >= maxAttempts && !isStillMoving) {
                clearInterval(window.__alicePollInterval);
                window.__alicePollInterval = null;
                console.warn('%c[Pelican Warp] ⚠️ หมดเวลารอ Alice Warp Service (เดินหาเกิน 21 วิ) -> สลับไปเปิดแผนที่โลกเพื่อเดินเท้าสำรอง...', 'color: #f59e0b; font-weight: bold;');
                openWorldMap(() => {
                    if (callback) callback();
                });
            }
        }, 600);
    };

    window.warpToMap = function(targetMapNameOrId) {
        const mapId = MAP_NAME_TO_ID[targetMapNameOrId] || targetMapNameOrId;
        console.log(`%c[Pelican Warp] 🚀 กำลังวาร์ปด่วนไปแมพ: "${targetMapNameOrId}" (${mapId})...`, 'color: #22c55e; font-weight: bold;');
        window.openAliceWarpService(() => {
            setTimeout(() => {
                window.sendNpcWarp(mapId);
            }, 400);
        });
    };

    // ==========================================
    // SHOP BUY PACKET BUILDER (shop_buy_many)
    // ==========================================
    window.sendShopBuy = function(itemId = (window.__shopConfig ? window.__shopConfig.buyItemId : 0x00015fae), qty = (window.__shopConfig ? window.__shopConfig.buyItemQty : 10)) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];

        // Opcode 0x0D + "shop_buy_many"
        const prefix = [0x0D, 0xAD, 0x73, 0x68, 0x6F, 0x70, 0x5F, 0x62, 0x75, 0x79, 0x5F, 0x6D, 0x61, 0x6E, 0x79];

        // Container structure: ["lines"] -> [ [ "itemId", "qty" ], itemId (uint32), qty ]
        const mid = [
            0x91, 0xA5, 0x6C, 0x69, 0x6E, 0x65, 0x73,
            0x91, 0xD4, 0x72, 0x41,
            0x92, 0xA6, 0x69, 0x74, 0x65, 0x6D, 0x49, 0x64, 0xA3, 0x71, 0x74, 0x79,
            0xCE, (itemId >>> 24) & 0xFF, (itemId >>> 16) & 0xFF, (itemId >>> 8) & 0xFF, itemId & 0xFF
        ];

        let qtyBytes = [];
        if (qty <= 0x7F) {
            qtyBytes = [qty];
        } else if (qty <= 0xFF) {
            qtyBytes = [0xCC, qty];
        } else {
            qtyBytes = [0xCD, (qty >> 8) & 0xFF, qty & 0xFF];
        }

        const totalLen = prefix.length + token.length + mid.length + qtyBytes.length;
        const buf = new Uint8Array(totalLen);
        let offset = 0;
        buf.set(prefix, offset); offset += prefix.length;
        buf.set(token, offset); offset += token.length;
        buf.set(mid, offset); offset += mid.length;
        buf.set(qtyBytes, offset);

        window.__gameSocket.send(buf.buffer);
        console.log(`%c[Pelican Shop] 🏹 ยิง Packet 'shop_buy_many' (ItemID: ${itemId} [0x${itemId.toString(16)}], Qty: ${qty}) สำเร็จ!`, 'color: #22c55e; font-weight: bold;');
    };

    // ==========================================
    // ITEMBAR & BUTTERFLY WING ACTIONS
    // ==========================================
    window.sendItembarSet = function(slot = 0, itemId = 0x00015fae) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xAB, 0x69, 0x74, 0x65, 0x6D, 0x62, 0x61, 0x72, 0x5F, 0x73, 0x65, 0x74];
        const suffix = [
            0x92, 0xA4, 0x73, 0x6C, 0x6F, 0x74, 0xA6, 0x69, 0x74, 0x65, 0x6D, 0x49, 0x64,
            slot,
            0xCE, (itemId >>> 24) & 0xFF, (itemId >>> 16) & 0xFF, (itemId >>> 8) & 0xFF, itemId & 0xFF
        ];
        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log(`%c[Pelican] 📌 ตั้งค่า ItemBar ช่อง ${slot} เป็น Item: 0x${itemId.toString(16)} (${itemId}) เรียบร้อย!`, 'color: #38bdf8;');
    };

    window.sendEquip = function(slot = 0) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xA5, 0x65, 0x71, 0x75, 0x69, 0x70];
        const suffix = [0x91, 0xA4, 0x73, 0x6C, 0x6F, 0x74, slot];
        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log(`%c[Pelican Inv] 🎒 ส่ง Packet สวมใส่จากกระเป๋า (sendEquip Inventory Slot: ${slot})!`, 'color: #22c55e;');
    };

    function findItemInServerInv(filterFn) {
        if (!window.__latestInventory) return null;
        let found = null;
        function scan(obj, depth = 0) {
            if (!obj || depth > 6 || found) return;
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    if (item && typeof item === 'object') {
                        if (filterFn(item)) {
                            found = item;
                            return;
                        }
                        scan(item, depth + 1);
                    }
                }
            } else if (typeof obj === 'object') {
                if (filterFn(obj)) {
                    found = obj;
                    return;
                }
                for (const k in obj) {
                    scan(obj[k], depth + 1);
                }
            }
        }
        scan(window.__latestInventory);
        return found;
    }

    window.equipArrowAndBow = function() {
        console.log('%c[Pelican Ammo] 🏹 กำลังตรวจสอบและสวมใส่ลูกธนู (ไม่แตะต้องอาวุธของผู้เล่น)...', 'color: #38bdf8; font-weight: bold;');

        // 1. ตรวจสอบการสวมใส่ "ลูกธนู" ชนิดที่เลือกจากกระเป๋าเซิร์ฟเวอร์
        const targetArrowId = (window.__archerConfig && window.__archerConfig.arrowType) ? parseInt(window.__archerConfig.arrowType) : 90030;
        const arrowInfo = (typeof ARROW_DATA !== 'undefined' && ARROW_DATA[targetArrowId]) ? ARROW_DATA[targetArrowId] : { name: 'Arrow' };
        console.log(`%c[Pelican Ammo] 🏹 กำลังตรวจสอบและสวมใส่ลูกธนู "${arrowInfo.name}" (${targetArrowId})...`, 'color: #38bdf8; font-weight: bold;');

        const arrowInBag = findItemInServerInv(it => {
            const slot = it.slot ?? it.idx;
            return typeof isTargetArrow === 'function' && isTargetArrow(it, targetArrowId) && typeof slot === 'number';
        });

        if (arrowInBag) {
            const slot = arrowInBag.slot ?? arrowInBag.idx;
            console.log(`%c[Pelican Ammo] 🎯 พบลูกธนู "${arrowInBag.name || arrowInfo.name}" ในกระเป๋า Slot ${slot} (จำนวน: ${arrowInBag.qty || 1} ดอก) -> ส่งคำสั่งสวมใส่ทันที!`, 'color: #22c55e; font-weight: bold;');
            window.sendEquip(slot);
            return;
        }

        // 2. ถ้าใน Server Inventory ยังไม่เจอ ให้ลองดูถ้ามีกระเป๋าเปิดอยู่
        try {
            const bagModal = document.querySelector('.modal, .window, [class*="inventory"], [class*="bag"], [class*="dialog"]') || document.body;
            const slots = Array.from(bagModal.querySelectorAll('[class*="slot"], [class*="item"], [class*="cell"]')).filter(el => !el.closest('#pelican-hud') && el.offsetWidth > 0);
            for (const el of slots) {
                const img = el.querySelector('img');
                const src = img ? (img.src || '').toLowerCase() : '';
                const title = (el.getAttribute('title') || el.getAttribute('data-name') || el.innerText || '').toLowerCase();
                const isArrow = isTargetArrowDom(src, title, targetArrowId);
                if (isArrow) {
                    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
                    console.log(`%c[Pelican Ammo] 🎯 Double-click สวมใส่ลูกธนู "${arrowInfo.name}" จากหน้าต่างกระเป๋าสำเร็จ!`, 'color: #22c55e;');
                    return;
                }
            }
        } catch(e) {}

        // 3. Fallback สุดท้าย: ถ้าไม่มีทั้งข้อมูล Server และกระเป๋าไม่ได้เปิด จึงค่อยลองกด Hotbar สำรอง
        const hotbarSlot = window.__archerConfig ? window.__archerConfig.arrowHotbarSlot : -1;
        if (typeof hotbarSlot === 'number' && hotbarSlot >= 0) {
            window.pressKey((hotbarSlot + 1).toString());
        }
    };

    window.sendInvUse = function(slot = 8) {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xA7, 0x69, 0x6E, 0x76, 0x5F, 0x75, 0x73, 0x65];
        const suffix = [0x91, 0xA4, 0x73, 0x6C, 0x6F, 0x74, slot];
        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log(`%c[Pelican] 🦋 ใช้วาร์ป Butterfly Wing (sendInvUse Slot: ${slot})!`, 'color: #38bdf8; font-weight: bold;');
    };

    window.useButterflyWing = function() {
        console.log('%c[Pelican] 🦋 กำลังใช้วาร์ป Butterfly Wing กลับเมืองหลวง...', 'color: #38bdf8; font-weight: bold;');

        // 1. ค้นหาช่อง Butterfly Wing ในข้อมูล Packet เซิร์ฟเวอร์
        let bwingSlot = -1;
        const bwingInBag = findItemInServerInv(it => {
            const id = it.itemId || it.id || it.item_id;
            const name = (it.name || it.itemName || '').toLowerCase();
            return (id === 90311 || id === 0x000160c7 || name.includes('wing') || name.includes('bwing') || name.includes('butterfly') || name.includes('วิง')) && typeof (it.slot ?? it.idx) === 'number';
        });
        if (bwingInBag) {
            bwingSlot = bwingInBag.slot ?? bwingInBag.idx;
            console.log(`%c[Pelican] 🦋 พบ Butterfly Wing ใน Server Inventory Slot: ${bwingSlot}`, 'color: #22c55e;');
            window.sendInvUse(bwingSlot);
        }

        // 2. ค้นหาใน DOM ช่องกระเป๋า (ถ้าหน้าต่างกระเป๋าเปิดอยู่)
        const bagModals = Array.from(document.querySelectorAll('.modal, .window, [class*="inventory"], [class*="bag"], [class*="dialog"]')).filter(el => {
            return !el.closest('#pelican-hud') && !el.closest('#pelican-data-modal');
        });

        let domFound = false;
        for (const modal of bagModals) {
            const slots = Array.from(modal.querySelectorAll('[class*="item"], .inventory-slot, [data-item-id], [class*="slot"]'));
            for (let idx = 0; idx < slots.length; idx++) {
                const s = slots[idx];
                const img = s.querySelector('img');
                const src = (img?.src || s.style?.backgroundImage || '').toLowerCase();
                const title = (s.getAttribute('title') || s.getAttribute('data-name') || s.innerText || '').toLowerCase();
                if (src.includes('160c7') || src.includes('90311') || src.includes('bwing') || src.includes('wing') || title.includes('butterfly') || title.includes('วิง')) {
                    domFound = true;
                    console.log(`%c[Pelican] 🦋 พบ Butterfly Wing ในช่องกระเป๋า DOM ช่องที่ ${idx} -> ดับเบิลคลิกใช้งาน!`, 'color: #22c55e; font-weight: bold;');
                    triggerClick(s);
                    s.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
                    window.sendInvUse(idx);
                    break;
                }
            }
            if (domFound) break;
        }

        // 3. ตรวจสอบ Hotbar ช่องลัด 1-10
        let hotbarKey = '8';
        for (let i = 0; i < 10; i++) {
            const hotbarSlot = document.querySelector(`[data-slot="${i}"], .slot-${i}, #hotbar-${i}, .quick-slot-${i}, [class*="hotbar"] > *:nth-child(${i+1})`);
            if (hotbarSlot) {
                const img = hotbarSlot.querySelector('img');
                const src = (img?.src || hotbarSlot.style?.backgroundImage || '').toLowerCase();
                const txt = (hotbarSlot.getAttribute('title') || hotbarSlot.innerText || '').toLowerCase();
                if (src.includes('160c7') || src.includes('90311') || src.includes('bwing') || src.includes('wing') || txt.includes('butterfly') || txt.includes('วิง')) {
                    hotbarKey = (i === 9 ? '0' : (i + 1).toString());
                    console.log(`%c[Pelican] 🦋 พบ Butterfly Wing ใน Hotbar ช่องลัดเลข ${hotbarKey} -> กดใช้งาน!`, 'color: #22c55e;');
                    triggerClick(hotbarSlot);
                    break;
                }
            }
        }
        dispatchKeyAll(hotbarKey, 'Digit' + hotbarKey, hotbarKey.charCodeAt(0));

        // 4. คลิกไอคอน Bwing บนหน้าจอถ้ามี
        try {
            const bwingEl = Array.from(document.querySelectorAll('*')).find(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal')) return false;
                const src = (el.src || el.style?.backgroundImage || '').toLowerCase();
                const txt = (el.innerText || el.textContent || '').toLowerCase();
                return (src.includes('160c7') || src.includes('90311') || src.includes('bwing') || txt.includes('butterfly')) && el.offsetWidth > 0;
            });
            if (bwingEl) {
                triggerClick(bwingEl);
                bwingEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
                console.log('%c[Pelican] 🦋 คลิกปุ่ม Butterfly Wing บนหน้าจอสำเร็จ!', 'color: #22c55e;');
            }
        } catch(e) {}

        // 5. Fallback: ส่ง Packet inv_use ช่อง 8 (Hotbar Bwing)
        if (!bwingInBag && !domFound) {
            window.sendInvUse(8);
            dispatchKeyAll('8', 'Digit8', 56);

            // ถ้าหน้าต่างกระเป๋ายังไม่เคยเปิด ให้กดเปิดเพื่อดึง Packet และสแกน DOM
            if (bagModals.length === 0) {
                dispatchKeyAll('i', 'KeyI', 73);
                setTimeout(() => {
                    window.useButterflyWing();
                }, 300);
            }
        }
    };

    function triggerAutoSellTrash(callback) {
        const sellCfg = window.__sellConfig || {};
        const canSellAny = sellCfg.sellMaterials || 
            (sellCfg.weaponRarity && sellCfg.weaponRarity !== 'none') ||
            (sellCfg.armorRarity && sellCfg.armorRarity !== 'none') ||
            (sellCfg.accRarity && sellCfg.accRarity !== 'none') ||
            sellCfg.sellWeapons || sellCfg.sellArmors;

        if (!sellCfg.enabled || !canSellAny) {
            if (callback) callback();
            return;
        }

        console.log('%c[Pelican Shop] 💰 เริ่มต้นระบบคัดกรองขายไอเทม (Auto-Sell & Whitelist)...', 'color: #f59e0b; font-weight: bold;');

        const rawWhitelist = (sellCfg.whitelist || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        function normalizeItemBaseName(name) {
            if (!name) return '';
            return name
                .replace(/^\+\s*\d+\s*/, '')                          // ตัดค่าตีบวก (+7, +10)
                .replace(/\s*\[\s*\d+\s*\]\s*$/, '')                  // ตัดจำนวนรูการ์ด ([1], [2], [3], [4])
                .replace(/\s*\[\s*(?:ธรรมดา|ดี|หายาก|มหากาพย์|ตำนาน)\s*\]/gi, '') // ตัดป้ายระดับความหายาก
                .replace(/มี\s*(?:option|options|ออฟชั่น|ออปชั่น|ออฟ|opt).*/i, '')
                .replace(/\b(?:option|options|ออฟชั่น|ออปชั่น)\b.*/i, '')
                .replace(/มี\s*\d+.*/, '')
                .replace(/\bx\s*\d+\b.*/i, '')
                .replace(/\b\d+[\s,]*z\b.*/i, '')
                .trim();
        }

        function isWhitelisted(itemName) {
            if (!itemName) return false;
            const baseName = normalizeItemBaseName(itemName).toLowerCase();
            const fullName = itemName.toLowerCase();

            return rawWhitelist.some(w => {
                const target = w.trim().toLowerCase();
                if (!target) return false;

                // 1. ตรงกับชื่อหลัก หรือชื่อเต็มแบบเป๊ะๆ (เช่น 'bow' === 'bow', 'hunter bow' === 'hunter bow')
                if (baseName === target || fullName === target) return true;

                // กรณีพิเศษ: ถ้าพิมพ์ 'bow' ใน Whitelist จะหมายถึงธนูธรรมดา 'Bow' เท่านั้น ไม่ครอบคลุม 'Hunter Bow' หรือ 'Crossbow'
                if (target === 'bow') {
                    return baseName === 'bow';
                }

                // 2. คำใน Whitelist เป็นวลีระบุเฉพาะที่ตรงกับชื่อไอเทม (เช่น 'hunter bow' ตรงกับ 'Hunter Bow [1]')
                // สำคัญ: ห้ามใช้ target.includes(baseName) เด็ดขาด เพราะจะทำให้ 'Hunter Bow' ไปครอบคลุมไอเทมสั้นอย่าง 'Bow'
                if (baseName.includes(target) || fullName.includes(target)) {
                    return true;
                }

                // 3. ป้องกันการพิมพ์ผิดยอดฮิต เช่น 'angrelic protection' -> 'angelic protection'
                if ((target.includes('angrelic') || target.includes('angelic')) && (baseName.includes('angelic') || baseName.includes('angrelic'))) {
                    return true;
                }

                return false;
            });
        }

        function parseOptionCount(text) {
            if (!text) return null;
            const lower = text.toLowerCase();

            // 1. ถ้ามี 0 option อย่างชัดเจน (เช่น '0 option', '0  option', '0 ออฟชั่น')
            const isZero = /(?:^|[^\d])0\s*(?:option|options|ออฟชั่น|ออปชั่น|ออฟ|opt)(?:[^\u0E00-\u0E7Fa-zA-Z]|$)/i.test(lower);

            // 2. รูปแบบตัวเลขนำหน้า เช่น '1 Option', '2 options', '3 ออฟชั่น', '4 ออฟ'
            const mPrefix = lower.match(/(?:^|[^\d])([1-9]\d*)\s*(?:option|options|ออฟชั่น|ออปชั่น|ออฟ|opt)(?:[^\u0E00-\u0E7Fa-zA-Z]|$)/i);
            if (mPrefix) {
                return parseInt(mPrefix[1], 10);
            }

            // 3. รูปแบบ Option: 1-5 (ในบรรทัดเดียวกันเท่านั้น ห้ามข้ามบรรทัดไปตรงกับราคา zeny)
            const mSuffix = lower.match(/(?:option|options|ออฟชั่น|ออปชั่น|ออฟ|opt)[^\S\r\n]*[:=][^\S\r\n]*([1-9]\d*)/i);
            if (mSuffix) {
                return parseInt(mSuffix[1], 10);
            }

            if (isZero) return 0;
            return null;
        }

        function hasOptions(rowText, row) {
            const text = ((row ? (row.innerText || row.textContent || '') : '') + ' ' + (rowText || '')).toLowerCase();

            // ตรวจสอบจำนวนออฟชั่นด้วย parseOptionCount
            const optCount = parseOptionCount(text);
            if (optCount !== null) {
                return optCount > 0;
            }

            // ข้อความระบุว่ามีออฟชั่น
            if (text.includes('มี option') || text.includes('ออฟชั่นพิเศษ') || text.includes('มีออฟชั่น')) {
                return true;
            }

            // มีคำว่า option แต่ไม่ใช่ 0 option
            if ((text.includes('option') || text.includes('ออฟชั่น') || text.includes('ออปชั่น')) && 
                !text.includes('0 option') && !text.includes('0  option') && !text.includes('0ออฟชั่น') && 
                !text.includes('0 ออฟชั่น') && !text.includes('0 ออปชั่น') && !text.includes('ไม่มี option')) {
                return true;
            }

            // ตรวจสอบ DOM Element พิเศษ เช่น badge, class ที่เกี่ยวข้องกับ option
            if (row && typeof row.querySelectorAll === 'function') {
                const optEls = row.querySelectorAll('[class*="option"], [class*="opt"], [class*="affix"], [class*="bonus"]');
                for (const el of optEls) {
                    const elTxt = (el.innerText || el.textContent || '').toLowerCase();
                    if (elTxt) {
                        const badgeCount = parseOptionCount(elTxt);
                        if (badgeCount !== null) return badgeCount > 0;
                        if (!elTxt.includes('0 option') && !elTxt.includes('0 opt') && !elTxt.includes('0ออฟ')) return true;
                    }
                }
            }

            return false;
        }

        function getItemRarity(itemName, rowText, titleEl, row) {
            const fullText = [
                itemName || '',
                titleEl ? (titleEl.innerText || titleEl.textContent || '') : '',
                row ? (row.innerText || row.textContent || '') : '',
                rowText || ''
            ].join(' ').toLowerCase();

            // กฎเหล็กสูงสุด: การ์ดมอนสเตอร์ทุกชนิด ถือเป็นระดับสูงสุด (999) เสมอ ห้ามคิดเป็นของขาวธรรมดาเด็ดขาด!
            if (fullText.includes('card') || fullText.includes('การ์ด')) return 999;

            // 1. ตรวจสอบข้อความระดับ Rarity ภาษาไทย / อังกฤษ โดยตรงเป็นอันดับแรก (ป้องกันของหายาก/มหากาพย์/ตำนาน หลุดรอด 100%)
            if (fullText.includes('ตำนาน') || fullText.includes('legendary')) return 5;
            if (fullText.includes('มหากาพย์') || fullText.includes('epic')) return 4;
            if (fullText.includes('หายาก') || fullText.includes('rare')) return 3;
            if (fullText.includes('ระดับ: ดี') || fullText.includes('ระดับ ดี') || fullText.includes('ระดับดี') || 
                fullText.includes('· ดี') || /(?:^|\s|[·•|])ดี(?:\s|[·•|]|$)/.test(fullText) || 
                fullText.includes('good') || fullText.includes('ชำนาญ') || fullText.includes('ขั้นดี')) return 2;

            // 2. ตรวจสอบจำนวน Option จากตัวเลขชัดเจน
            const optCount = parseOptionCount(fullText);
            if (optCount !== null) {
                if (optCount >= 4) return 5; // ตำนาน (4+ Option)
                if (optCount === 3) return 4; // มหากาพย์ (3 Option)
                if (optCount === 2) return 3; // หายาก (2 Option)
                if (optCount === 1) return 2; // ดี (1 Option)
                if (optCount === 0) return 1; // ขาวธรรมดา (0 Option)
            }

            // 3. ในเกม Aetheria: ไอเทมที่มีป้าย [มี option] แต่ไม่มีคำว่าหายาก/มหากาพย์/ตำนาน คือของระดับ "ดี (เขียว 1 Option)" เสมอ
            if (hasOptions(rowText, row)) {
                return 2;
            }

            // 4. ตรวจสอบ Class name เฉพาะของ Title / Badge (เฉพาะคลาส rarity โดยตรง ห้ามตรวจคำว่า gold/amber/orange เด็ดขาด เพราะจะไปตรงกับราคา Zeny ในร้านค้า)
            const elementsToScan = [];
            if (titleEl) elementsToScan.push(titleEl);
            if (row && typeof row.querySelectorAll === 'function') {
                const badges = row.querySelectorAll('[class*="rarity"], [class*="badge"], [class*="rank"], [class*="tier"]');
                badges.forEach(b => elementsToScan.push(b));
            }

            for (const el of elementsToScan) {
                const cls = (el.className || '').toString().toLowerCase();
                if (cls.includes('legendary') || cls.includes('tier-5') || cls.includes('rank-5')) return 5;
                if (cls.includes('epic') || cls.includes('tier-4') || cls.includes('rank-4')) return 4;
                if (cls.includes('rare') || cls.includes('tier-3') || cls.includes('rank-3')) return 3;
                if (cls.includes('good') || cls.includes('tier-2') || cls.includes('rank-2')) return 2;
            }

            // 5. ถ้ามีข้อความระบุธรรมดา หรือไม่มีอะไรบ่งบอก ให้ถือเป็นระดับ 1 (ธรรมดา/ขาว)
            return 1;
        }

        function isRefined(itemName, rowText, titleEl) {
            // ของตีบวกจะมีเครื่องหมาย + นำหน้าชื่อไอเทมเสมอ เช่น "+4 Damascus", "+7 Knife", "+9 Crossbow"
            // ห้ามตรวจเช็ค /\+\s*\d+/ ใน rowText สุ่มสี่สุ่มห้า เพราะจะไปตรงกับ Tooltip "ATK +7", "HIT +1" หรือปุ่ม '+' กับตัวเลขจำนวน '1' (+\n1)
            const name = (itemName || (titleEl ? (titleEl.innerText || titleEl.textContent) : '') || '').trim();
            if (/^\s*\+\s*[1-9]\d*/.test(name)) return true;
            if (/\+\s*[1-9]\d*\s+[a-zA-Z\u0E00-\u0E7F]/.test(name)) return true;
            if (name.includes('ตีบวก')) return true;
            return false;
        }

        function hasSockets(itemName, rowText, titleEl) {
            // ของมีรูการ์ดจะมี [1], [2], [3], [4] อยู่ในชื่อไอเทม เช่น "Damascus [1]", "Crossbow [3]"
            const name = (itemName || (titleEl ? (titleEl.innerText || titleEl.textContent) : '') || '').trim();
            if (/\[\s*[1-4]\s*\]/.test(name)) return true;
            const text = (rowText || '');
            if (text.includes('ช่องการ์ด 1') || text.includes('ช่องการ์ด 2') || text.includes('ช่องการ์ด 3') || text.includes('ช่องการ์ด 4')) {
                return true;
            }
            return false;
        }

        function findCategoryTab(catName) {
            const shopModal = document.querySelector('.shop-window, [class*="shop"], .modal-body, .window') || document.body;
            const candidates = Array.from(shopModal.querySelectorAll('button, [role="tab"], [class*="tab"], li, div, span, a')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal')) return false;
                if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
                
                const txt = (el.innerText || el.textContent || '').trim();
                const searchKey = catName.includes('/') ? catName.split('/')[0] : catName;
                if (!txt.includes(catName) && !txt.includes(searchKey)) return false;
                if (txt.length > 25) return false;

                // กรอง container แม่ทิ้ง: ถ้ามีชื่อแท็บหมวดอื่นปนอยู่ แสดงว่าเป็นแถบแท็บรวม ไม่ใช่ตัวปุ่มแท็บ
                const knownTabs = ['ทั้งหมด', 'อาวุธ', 'ชุดเกราะ', 'ประดับ', 'ใช้ได้', 'การ์ด', 'แร่', 'วัตถุดิบ', 'อื่นๆ'];
                const overlap = knownTabs.filter(t => {
                    if (t === catName || catName.includes(t) || t.includes(catName) || t === searchKey) return false;
                    return txt.includes(t);
                }).length;
                if (overlap > 0) return false;

                return true;
            });

            if (candidates.length === 0) return null;

            candidates.sort((a, b) => {
                const aTxt = (a.innerText || a.textContent || '').trim();
                const bTxt = (b.innerText || b.textContent || '').trim();
                return aTxt.length - bTxt.length;
            });

            return candidates.find(el => el.tagName === 'BUTTON' || (el.className && el.className.includes('tab'))) || candidates[0];
        }

        function findItemRow(btn) {
            let curr = btn.parentElement;
            let bestRow = null;
            while (curr && curr !== document.body) {
                if (curr.classList.contains('shop-window') || curr.classList.contains('modal') || (curr.innerText && (curr.innerText.includes('ตะกร้าขาย') || curr.innerText.includes('General Goods')))) {
                    break;
                }
                const txt = (curr.innerText || '').trim();
                const h = curr.offsetHeight;
                
                // ตรวจสอบว่าคอนเทนเนอร์นี้มีราคา zeny และมีชื่อไอเทม (ไม่ใช่แค่ปุ่ม '+' หรือราคาอย่างเดียว)
                const hasZeny = /\d+[\s,]*z/i.test(txt);
                const cleanTxt = txt.replace(/\b\d+\s*z\b/gi, '').replace(/\boption\b/gi, '').replace(/\bออฟชั่น\b/gi, '').replace(/มี\s*\d+/g, '').replace(/[+\-0-9\s]/g, '');
                const hasItemName = cleanTxt.length >= 2;

                if (hasZeny && hasItemName && h >= 25 && h <= 130) {
                    bestRow = curr;
                    if (curr.querySelector('img, [class*="icon"], [class*="thumb"]')) {
                        return curr;
                    }
                }
                curr = curr.parentElement;
            }
            return bestRow || btn.closest('[class*="item"], [class*="row"], li, tr') || btn.parentElement?.parentElement || btn.parentElement;
        }

        function extractItemName(row) {
            if (!row) return '';

            // 0. ตรวจสอบจาก aria-label ของปุ่มใส่ตะกร้า (แม่นยำที่สุด 100% ในหน้าต่างร้านค้า Aetheria)
            const addBtnWithAria = row.querySelector('button[aria-label*="ใส่ตะกร้า"], [aria-label*="ใส่ตะกร้า"]');
            if (addBtnWithAria) {
                const aria = addBtnWithAria.getAttribute('aria-label') || '';
                const ariaClean = aria.replace(/ใส่ตะกร้า/gi, '').trim();
                if (ariaClean && ariaClean.length >= 2) {
                    return ariaClean;
                }
            }

            function cleanName(str) {
                if (!str) return '';
                return str.split('\n')[0]
                          .replace(/มี\s*(?:option|options|ออฟชั่น|ออปชั่น|ออฟ|opt).*/i, '')
                          .replace(/\b(?:option|options|ออฟชั่น|ออปชั่น)\b.*/i, '')
                          .replace(/\[\s*มี\s*(?:option|options|ออฟชั่น|ออปชั่น|opt)\s*\]/gi, '')
                          .replace(/\[\s*(?:ธรรมดา|ดี|หายาก|มหากาพย์|ตำนาน)\s*\]/gi, '')
                          .replace(/มี\s*\d+.*/, '')
                          .replace(/\bx\s*\d+\b.*/i, '')
                          .replace(/\b\d+[\s,]*z\b.*/i, '')
                          .trim();
            }

            // 1. ค้นหาจาก element ชื่อโดยตรง
            const nameEl = row.querySelector('[class*="name"], [class*="title"], h3, h4, h5, b, strong, .item-label');
            if (nameEl) {
                const cleaned = cleanName(nameEl.innerText || nameEl.textContent);
                if (cleaned && !/^\d+[\s,]*z$/i.test(cleaned) && !/^\d+$/.test(cleaned) && cleaned !== '+' && cleaned !== '-' && cleaned.length >= 2) {
                    return cleaned;
                }
            }

            // 2. ถ้าไม่พบ element เฉพาะ ให้แยกบรรทัดข้อความทั้งหมดในแถว
            const lines = (row.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                if (/^\d+$/.test(line)) continue;
                if (/^\d+[\s,]*z$/i.test(line)) continue;
                if (line === '+' || line === '-' || line === 'ทั้งหมด') continue;
                if (/^มี\s*\d+/.test(line) || /^x\s*\d+/i.test(line) || /^จำนวน/i.test(line)) continue;
                if (line.includes('ขาย') || line.includes('ราคา') || line.includes('น้ำหนัก')) continue;

                const cleaned = cleanName(line);
                if (cleaned.length <= 1) continue;
                if (cleaned === 'ธรรมดา' || cleaned === 'ดี' || cleaned === 'หายาก' || cleaned === 'มหากาพย์' || cleaned === 'ตำนาน') continue;
                return cleaned;
            }
            return '';
        }

        // 1. สลับไปแท็บ "ขาย" (เฉพาะปุ่มแท็บในหน้าต่างร้านค้า)
        const sellTabs = Array.from(document.querySelectorAll('button, div')).filter(el => {
            if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal')) return false;
            const txt = (el.innerText || '').trim();
            return txt === 'ขาย' && (el.closest('.shop-window') || el.closest('[class*="shop"]') || el.offsetHeight > 0);
        });
        const sellTab = sellTabs[0];
        if (sellTab) {
            triggerClick(sellTab);
            if (typeof sellTab.click === 'function') sellTab.click();
        }

        function processCategory(catName, isItemByItem, targetMaxRarity, onDone) {
            if (typeof targetMaxRarity === 'function') {
                onDone = targetMaxRarity;
                targetMaxRarity = sellCfg.maxRarityToSell || 'normal';
            }
            const rankMap = {
                'normal': 1, 'common': 1,
                'good': 2, 'magic': 2,
                'rare': 3,
                'epic': 4,
                'legendary': 5
            };
            const maxRank = rankMap[targetMaxRarity || 'normal'] || 1;
            const rankNames = { 1: 'ธรรมดา (ขาว 0 Option)', 2: 'ดี (เขียว 1 Option)', 3: 'หายาก (ฟ้า 2 Option)', 4: 'มหากาพย์ (ม่วง 3 Option)', 5: 'ตำนาน (ทอง/ส้ม 4+ Option)' };

            console.log(`[Pelican Shop] 🔍 ตรวจสอบหมวดหมู่: "${catName}" (เกณฑ์ขายไม่เกิน: ${rankNames[maxRank] || maxRank})...`);
            
            const catBtn = findCategoryTab(catName);
            if (!catBtn) {
                console.warn(`[Pelican Shop] ⚠️ ไม่พบปุ่มแท็บหมวดหมู่ "${catName}" ในร้านค้า -> ข้ามหมวดนี้ทันทีเพื่อความปลอดภัยเด็ดขาด!`);
                onDone();
                return;
            }

            const tabTitle = (catBtn.innerText || catBtn.textContent || '').trim();
            console.log(`%c[Pelican Shop] 🎯 พบคลิกแท็บหมวดหมู่: "${tabTitle}"`, 'color: #38bdf8; font-weight: bold;');
            triggerClick(catBtn);
            catBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            catBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            catBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            if (typeof catBtn.click === 'function') catBtn.click();

            // รอ 600ms ให้หน้าร้านค้าเปลี่ยนรายการตามแท็บที่เลือก
            setTimeout(() => {
                const shopModal = document.querySelector('.shop-window, [class*="shop"]') || document.body;

                // กฎเหล็ก: ป้องกันการขายมั่วในขณะที่หน้าร้านค้าเปิดค้างที่แท็บ 'การ์ด' หรือ 'ทั้งหมด'
                const activeTab = shopModal.querySelector('[class*="active"], [class*="selected"], [aria-selected="true"], .tab.active, button.active');
                const activeText = (activeTab ? (activeTab.innerText || activeTab.textContent || '') : '').trim();
                if (activeText.includes('การ์ด') || activeText.includes('แร่') || activeText.includes('ใช้ได้') || activeText.startsWith('ทั้งหมด')) {
                    console.warn(`[Pelican Shop] 🛑 หน้าร้านค้ากำลังแสดงแท็บ "${activeText}" (ไม่ใช่หมวด ${catName}) -> ข้ามทันทีเพื่อความปลอดภัยเด็ดขาด!`);
                    onDone();
                    return;
                }
                if (!isItemByItem) {
                    // หมวด "วัตถุดิบ": คลิก "ใส่วัตถุดิบทั่งหมดลงตะกร้า" (button.shop-sell-junk)
                    const putAllBtn = document.querySelector('button.shop-sell-junk') ||
                        Array.from(document.querySelectorAll('button')).find(el => {
                            if (el.closest('#pelican-hud')) return false;
                            const t = (el.innerText || '').trim();
                            return t.includes('ใส่วัตถุดิบ') || t.includes('ขายขยะ');
                        });
                    
                    if (putAllBtn && !putAllBtn.disabled && !putAllBtn.className.includes('disabled') && !putAllBtn.innerText.includes('0 รายการ') && !putAllBtn.innerText.includes('ไม่มีวัตถุดิบ')) {
                        console.log('%c[Pelican Shop] 🧺 คลิก "ใส่วัตถุดิบทั่งหมดลงตะกร้า"...', 'color: #eab308; font-weight: bold;');
                        triggerClick(putAllBtn);
                        if (typeof putAllBtn.click === 'function') putAllBtn.click();
                    } else {
                        console.log('[Pelican Shop] ℹ️ ไม่มีวัตถุดิบขยะให้ขายในกระเป๋า');
                    }
                    setTimeout(onDone, 400);
                } else {
                    // หมวด "อาวุธ", "ชุดเกราะ", หรือ "ประดับ/เจม": กรองตาม Whitelist, ระดับ Rarity, ตีบวก, รูการ์ด, และ Option
                    const shopModal = document.querySelector('.shop-window, [class*="shop"]') || document.body;
                    const plusBtns = Array.from(shopModal.querySelectorAll('button, div')).filter(b => {
                        if (b.closest('#pelican-hud') || b.closest('#pelican-data-modal')) return false;
                        const txt = (b.innerText || '').trim();
                        if (txt !== '+') return false;
                        if (b.offsetWidth <= 0 || b.offsetHeight <= 0) return false;
                        const row = findItemRow(b);
                        if (!row || row.offsetWidth <= 0 || row.offsetHeight <= 0) return false;
                        try {
                            const rowStyle = window.getComputedStyle(row);
                            if (rowStyle.display === 'none' || rowStyle.visibility === 'hidden' || rowStyle.opacity === '0') return false;
                            const btnStyle = window.getComputedStyle(b);
                            if (btnStyle.display === 'none' || btnStyle.visibility === 'hidden' || btnStyle.opacity === '0') return false;
                        } catch(e) {}
                        return true;
                    });

                    console.log(`[Pelican Shop] 🔎 พบปุ่มขาย (+) ในหมวด "${catName}" ทั้งหมด ${plusBtns.length} ปุ่ม`);

                    const itemsToSell = [];

                    plusBtns.forEach((btn, btnIdx) => {
                        const row = findItemRow(btn);
                        if (!row) {
                            console.warn(`[Pelican Shop] ⚠️ ข้ามปุ่ม (+) ลำดับที่ ${btnIdx + 1}: ไม่พบ Item Row`);
                            return;
                        }

                        const rowText = row.innerText || '';
                        const itemName = extractItemName(row);
                        if (!itemName) {
                            console.warn(`[Pelican Shop] ⚠️ ข้ามปุ่ม (+) ลำดับที่ ${btnIdx + 1}: ไม่สามารถอ่านชื่อไอเทมจากแถวได้ (${rowText.replace(/\n+/g, ' | ')})`);
                            return;
                        }

                        const titleEl = row.querySelector('[class*="name"], [class*="title"], h3, h4, h5, b, strong, .item-label') || 
                                        Array.from(row.querySelectorAll('*')).find(el => (el.innerText || '').trim() === itemName) || row;

                        // กฎความปลอดภัย 0 (กฎเหล็กสูงสุด): ห้ามขาย "การ์ด (Card)" หรือ "แร่/ตีบวก (Ores/Refine)" เด็ดขาด 100%!
                        const lower = itemName.toLowerCase();
                        // กฎความปลอดภัย 0 (กฎเหล็กสูงสุด): ห้ามขาย "การ์ด (Card)" หรือ "แร่/ตีบวก (Ores/Refine)" เด็ดขาด 100%!
                        const isCard = (catName !== 'อาวุธ' && catName !== 'ชุดเกราะ') && (
                            lower.endsWith(' card') || lower.startsWith('card ') || lower === 'card' || lower.includes('การ์ด') || 
                            rowText.includes('การ์ด') || rowText.includes('card') ||
                            (row.querySelector('img') && (row.querySelector('img').src || '').includes('card'))
                        );

                        // แร่ตีบวก: เช็คเฉพาะถ้าไม่ใช่หมวดอาวุธ/ชุดเกราะ และต้องเป็นชื่อแร่จริง (ไม่ใช่ชื่ออุปกรณ์เช่น Iron Cain, Steel Shield, Oridecon Dagger)
                        const oreExactList = ['iron', 'iron ore', 'steel', 'phracon', 'emveretarcon', 'oridecon', 'rough oridecon', 'elunium', 'rough elunium', 'gold'];
                        const isOre = (catName !== 'อาวุธ' && catName !== 'ชุดเกราะ') && (
                            oreExactList.includes(lower) || lower === 'แร่เหล็ก' || lower === 'เหล็ก' || lower === 'โอริเดคอน' || lower === 'อีลูเนียม' || 
                            rowText.includes('แร่/ตีบวก')
                        );

                        if (isCard) {
                            console.log(`%c[Pelican Shop] 🛑 [การ์ดมีค่า!] ป้องกันการขายเด็ดขาด: "${itemName}"`, 'color: #ef4444; font-weight: bold;');
                            return;
                        }
                        if (isOre) {
                            console.log(`%c[Pelican Shop] 🛑 [แร่ตีบวก!] ป้องกันการขายเด็ดขาด: "${itemName}"`, 'color: #f59e0b; font-weight: bold;');
                            return;
                        }

                        // กฎความปลอดภัย 1: ห้ามขายของใช้ / ใบวาร์ป / ยา / ลูกธนู (Consumables / Ammo) เด็ดขาด
                        const isGem = lower.includes('gem') || lower.includes('เจม') || catName.includes('ประดับ') || catName.includes('เจม');
                        const isTeleportWing = lower.includes('fly wing') || lower.includes('butterfly wing') || lower === 'wing' || lower.includes('ใบวาร์ป');
                        const isPotion = lower.includes('potion') || lower.includes('ขวดยา');
                        // ข้อสำคัญ: เจมของ Archer/Hunter มักมีชื่อสกิล เช่น "Dancing Arrow Gem", "Arrow Shower Gem" ห้ามกรองทิ้งเป็นลูกธนูจริง
                        const isActualArrow = (lower.includes('arrow') || lower.includes('ลูกธนู')) && !isGem && !lower.includes('bow');

                        if (isTeleportWing || isPotion || isActualArrow) {
                            console.log(`[Pelican Shop] 🛑 [ของใช้/เสบียง] ข้าม: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 2: ห้ามขายเด็ดขาดถ้าตรงกับ Whitelist
                        if (isWhitelisted(itemName)) {
                            console.log(`[Pelican Shop] 🔒 [Whitelist] ข้าม: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 3: กรองระดับความหายาก (Rarity ตามเกณฑ์เฉพาะของหมวดนี้: ธรรมดา, ดี, หายาก, มหากาพย์, ตำนาน)
                        const rarityRank = getItemRarity(itemName, rowText, titleEl, row);

                        if (rarityRank > maxRank) {
                            console.log(`[Pelican Shop] 🔒 [ระดับสูง] ข้าม: "${itemName}" (ระดับ: ${rankNames[rarityRank] || rarityRank} > เกณฑ์ที่เลือก: ${rankNames[maxRank]})`);
                            return;
                        }

// (กฎ 4-6 ควบคุมการล็อกตีบวก / รูการ์ด / Option ตามที่ผู้เล่นติ๊กเลือกใน UI โดยตรง)

                        // กฎความปลอดภัย 4: ห้ามขายของตีบวก (+1 ขึ้นไป)
                        if (sellCfg.keepRefined && isRefined(itemName, rowText, titleEl)) {
                            console.log(`[Pelican Shop] 🔒 [ของตีบวก] ข้ามไอเทมตีบวก: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 5: ห้ามขายของมีรูการ์ด [1-4]
                        if (sellCfg.keepSockets && hasSockets(itemName, rowText, titleEl)) {
                            console.log(`[Pelican Shop] 🔒 [มีรูการ์ด] ข้ามไอเทมมีรู: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 6: ห้ามขายของมี Option สุ่ม (เฉพาะเมื่อผู้เล่นติ๊ก "ล็อคของมี Option")
                        if (sellCfg.keepSpecial && hasOptions(rowText, row)) {
                            console.log(`[Pelican Shop] 🔒 [มี Option] ข้ามไอเทม: "${itemName}" (เนื่องจากติ๊ก 'ล็อคของมี Option')`);
                            return;
                        }

                        console.log(`%c[Pelican Shop] 🛒 เลือกขาย: "${itemName}" (ระดับ: ${rankNames[rarityRank] || rarityRank})`, 'color: #22c55e;');
                        itemsToSell.push({ name: itemName, btn: btn, row: row });
                    });

                    if (itemsToSell.length === 0) {
                        console.log(`[Pelican Shop] ℹ️ ไม่มีไอเทมในหมวด "${catName}" ที่ตรงตามเงื่อนไขการขาย`);
                        setTimeout(onDone, 300);
                        return;
                    }

                    console.log(`%c[Pelican Shop] 📋 เตรียมใส่ไอเทมลงตะกร้า ${itemsToSell.length} ชิ้น...`, 'color: #22c55e; font-weight: bold;');

                    // คลิกปุ่ม '+' ทีละชิ้นอย่างต่อเนื่อง (เว้นจังหวะ 130ms เพื่อให้ UI อัปเดตเสถียร)
                    let clickIdx = 0;
                    function stepClick() {
                        if (clickIdx >= itemsToSell.length) {
                            setTimeout(onDone, 500);
                            return;
                        }
                        const item = itemsToSell[clickIdx++];
                        console.log(`%c[Pelican Shop] ➕ ใส่ไอเทมลงตะกร้า (${clickIdx}/${itemsToSell.length}): "${item.name}"`, 'color: #22c55e;');
                        triggerClick(item.btn);
                        if (typeof item.btn.click === 'function') item.btn.click();
                        setTimeout(stepClick, 130);
                    }
                    stepClick();
                }
            }, 600);
        }

        setTimeout(() => {
            const steps = [];
            if (sellCfg.sellMaterials) {
                steps.push((next) => processCategory('วัตถุดิบ', false, 'all', next));
            }
            if (sellCfg.weaponRarity && sellCfg.weaponRarity !== 'none') {
                steps.push((next) => processCategory('อาวุธ', true, sellCfg.weaponRarity, next));
            } else if (sellCfg.sellWeapons && (!sellCfg.weaponRarity || sellCfg.weaponRarity === 'none')) {
                steps.push((next) => processCategory('อาวุธ', true, sellCfg.maxRarityToSell || 'normal', next));
            }

            if (sellCfg.armorRarity && sellCfg.armorRarity !== 'none') {
                steps.push((next) => processCategory('ชุดเกราะ', true, sellCfg.armorRarity, next));
            } else if (sellCfg.sellArmors && (!sellCfg.armorRarity || sellCfg.armorRarity === 'none')) {
                steps.push((next) => processCategory('ชุดเกราะ', true, sellCfg.maxRarityToSell || 'normal', next));
            }

            if (sellCfg.accRarity && sellCfg.accRarity !== 'none') {
                steps.push((next) => processCategory('ประดับ/เจม', true, sellCfg.accRarity, next));
            }

            function runSteps(idx) {
                if (idx >= steps.length) {
                    setTimeout(() => {
                        const confirmBtn = document.querySelector('button.cart-go') ||
                            Array.from(document.querySelectorAll('button')).find(el => {
                                if (el.closest('#pelican-hud')) return false;
                                return (el.innerText || '').includes('ตรวจสอบและขาย') && el.offsetWidth > 0;
                            });

                        if (confirmBtn && !confirmBtn.disabled && !confirmBtn.className.includes('disabled')) {
                            console.log('%c[Pelican Shop] 💵 คลิก "ตรวจสอบและขาย" (cart-go)...', 'color: #22c55e; font-weight: bold;');
                            triggerClick(confirmBtn);
                            if (typeof confirmBtn.click === 'function') confirmBtn.click();

                            // รอให้หน้าต่าง Modal "ยืนยันการขาย" เด้งขึ้นมา แล้วกดปุ่ม "ยืนยันขาย" สีทอง
                            if (window.__shopConfirmInterval) {
                                clearInterval(window.__shopConfirmInterval);
                                window.__shopConfirmInterval = null;
                            }

                            let confirmAttempts = 0;
                            window.__shopConfirmInterval = setInterval(() => {
                                if (!window.__isBotRunning && !window.__isManualSelling) {
                                    clearInterval(window.__shopConfirmInterval);
                                    window.__shopConfirmInterval = null;
                                    return;
                                }

                                confirmAttempts++;

                                // 1. หาปุ่มที่มีคำว่า "ยืนยันขาย" โดยตรง
                                let finalBtn = Array.from(document.querySelectorAll('button')).find(b => {
                                    if (b.closest('#pelican-hud')) return false;
                                    const txt = (b.innerText || '').trim();
                                    return (txt === 'ยืนยันขาย' || txt.includes('ยืนยันขาย')) && b.offsetWidth > 0;
                                });

                                // 2. ถ้าไม่พบตรงๆ ให้หาจากกล่อง Modal ยืนยันการขาย (ไม่เอากล่องร้านหลัก)
                                if (!finalBtn) {
                                    const confirmModal = Array.from(document.querySelectorAll('div, section, aside')).find(el => {
                                        if (el.closest('#pelican-hud')) return false;
                                        const t = el.innerText || '';
                                        return t.includes('ยืนยันการขาย') && (t.includes('ยกเลิก') || t.includes('รวมที่ได้รับ'));
                                    });
                                    if (confirmModal) {
                                        finalBtn = Array.from(confirmModal.querySelectorAll('button')).find(b => {
                                            if (b.closest('#pelican-hud')) return false;
                                            const txt = (b.innerText || '').trim();
                                            return txt.includes('ยืนยัน') && !txt.includes('ยกเลิก') && b.offsetWidth > 0;
                                        });
                                    }
                                }

                                if (finalBtn) {
                                    clearInterval(window.__shopConfirmInterval);
                                    window.__shopConfirmInterval = null;
                                    console.log('%c[Pelican Shop] 💰 พบปุ่ม "ยืนยันขาย" สีทองตัวจริง กำลังกดยืนยัน...', 'color: #22c55e; font-weight: bold;', finalBtn);
                                    triggerClick(finalBtn);
                                    if (typeof finalBtn.click === 'function') finalBtn.click();
                                    const inner = finalBtn.querySelector('button, span, div') || finalBtn;
                                    if (typeof inner.click === 'function') inner.click();

                                    // รอให้ Modal ปิดลงและระบบบันทึกเงิน Zeny จากนั้นสลับกลับไปแท็บ "ซื้อ"
                                    setTimeout(() => {
                                        if (!window.__isBotRunning && !window.__isManualSelling) return;
                                        const buyTabs = Array.from(document.querySelectorAll('button, div')).filter(el => {
                                            if (el.closest('#pelican-hud')) return false;
                                            return (el.innerText || '').trim() === 'ซื้อ' && (el.closest('.shop-window') || el.closest('[class*="shop"]') || el.offsetHeight > 0);
                                        });
                                        const buyTab = buyTabs[0];
                                        if (buyTab) {
                                            triggerClick(buyTab);
                                            if (typeof buyTab.click === 'function') buyTab.click();
                                        }
                                        if (callback) callback();
                                    }, 700);
                                    return;
                                }

                                if (confirmAttempts >= 12) {
                                    clearInterval(window.__shopConfirmInterval);
                                    window.__shopConfirmInterval = null;
                                    console.warn('[Pelican Shop] ⚠️ หมดเวลารอปุ่มยืนยันขาย (Timeout)');
                                    const buyTabs = Array.from(document.querySelectorAll('button, div')).filter(el => {
                                        if (el.closest('#pelican-hud')) return false;
                                        return (el.innerText || '').trim() === 'ซื้อ';
                                    });
                                    if (buyTabs[0]) triggerClick(buyTabs[0]);
                                    if (callback) callback();
                                }
                            }, 200);
                        } else {
                            console.log('[Pelican Shop] ตะกร้าขายว่างเปล่า (ไม่มีไอเทมจะขาย) -> สลับไปขั้นตอนซื้อ');
                            const buyTabs = Array.from(document.querySelectorAll('button, div')).filter(el => {
                                if (el.closest('#pelican-hud')) return false;
                                return (el.innerText || '').trim() === 'ซื้อ';
                            });
                            if (buyTabs[0]) triggerClick(buyTabs[0]);
                            if (callback) callback();
                        }
                    }, 450);
                    return;
                }
                steps[idx](() => runSteps(idx + 1));
            }

            if (steps.length === 0) {
                if (callback) callback();
                return;
            }
            runSteps(0);
        }, 500);
    }

    window.testSellTrash = function() {
        window.__isManualSelling = true;
        triggerAutoSellTrash(() => {
            window.__isManualSelling = false;
            console.log('%c[Pelican Shop] ✅ ทดสอบขายไอเทมเสร็จสมบูรณ์!', 'color: #22c55e; font-weight: bold;');
        });
    };

    function executeSellAndBuyActions(onComplete) {
        if (!window.__isBotRunning && !window.__isManualSelling) return;
        console.log('%c[Pelican Shop] 📦 กำลังดำเนินการซื้อ/ขายไอเทมตามตั้งค่า...', 'color: #00ffcc;');

        // 1. ดำเนินการขายขยะมอนสเตอร์ก่อน (ถ้าเปิดใช้งาน)
        triggerAutoSellTrash(() => {
            if (!window.__isBotRunning && !window.__isManualSelling) return;
            const cfg = window.__archerConfig || {};
            const arrowId = parseInt(cfg.arrowType) || 0x00015fae;
            const arrowQty = parseInt(cfg.arrowBuyQty) || 200;

            // 2. ซื้อลูกธนูชนิดที่เลือก (Smart Restock: เติมส่วนต่างให้ครบ targetQty ป้องกันซื้อเกินจนน้ำหนักล้น)
            const targetQty = parseInt(cfg.arrowBuyQty) || 1000;
            const curAmmo = (typeof window.__currentAmmo === 'number') ? window.__currentAmmo : 0;
            const qtyToBuy = Math.max(0, targetQty - curAmmo);

            if (cfg.requireArrow && qtyToBuy > 0) {
                console.log(`%c[Pelican Shop] 🏹 คำนวณการเติมลูกธนู: ปัจจุบันมี ${curAmmo} ดอก / ตั้งเป้าพก ${targetQty} ดอก -> ซื้อเพิ่ม ${qtyToBuy} ดอก`, 'color: #00ffcc; font-weight: bold;');
                window.sendShopBuy(arrowId, qtyToBuy);
            } else if (cfg.requireArrow) {
                console.log(`%c[Pelican Shop] 🏹 ลูกธนูยังมีเพียงพอ (${curAmmo} >= ${targetQty} ดอก) ไม่จำเป็นต้องซื้อเพิ่ม`, 'color: #94a3b8;');
            }

            // 3. ซื้อ Butterfly Wing พ่วงด้วยถ้าเปิดใช้
            if (cfg.useBwing) {
                setTimeout(() => {
                    if (!window.__isBotRunning && !window.__isManualSelling) return;
                    window.sendShopBuy(cfg.bwingItemId || 0x000160c7, parseInt(cfg.bwingBuyQty) || 5);
                }, 350);
            }

            // 4. นำลูกธนูและ Butterfly Wing ใส่ช่องลัดด้านล่างอัตโนมัติ (เฉพาะเมื่อระบุช่อง)
            setTimeout(() => {
                if (!window.__isBotRunning && !window.__isManualSelling) return;
                if (cfg.requireArrow) {
                    if (typeof cfg.arrowHotbarSlot === 'number' && cfg.arrowHotbarSlot >= 0) {
                        window.sendItembarSet(cfg.arrowHotbarSlot, arrowId);
                    }
                    // แก้นับเบิ้ล (ถ้า Server ซิงก์มาแล้วให้ใช้ค่านั้น หรือตั้งเป็น arrowQty ไม่บวกซ้ำ)
                    if (!window.__currentAmmo || window.__currentAmmo < targetQty) {
                        window.__currentAmmo = targetQty;
                    }
                    localStorage.setItem('pelican_current_ammo', window.__currentAmmo);
                    updateAmmoHUD();
                }
                if (cfg.useBwing) {
                    window.sendItembarSet(8, cfg.bwingItemId || 0x000160c7); // ใส่ Bwing ที่ช่อง 8
                }
            }, 900);

            // 5. สั่งสวมใส่คันธนูและลูกธนู (ดึงคันธนูกลับเข้ามือแทนมีด Damascus และติดตั้งลูกธนู)
            setTimeout(() => {
                if (!window.__isBotRunning && !window.__isManualSelling) return;
                if (cfg.requireArrow) {
                    if (typeof window.equipArrowAndBow === 'function') {
                        window.equipArrowAndBow();
                    } else if (typeof cfg.arrowHotbarSlot === 'number' && cfg.arrowHotbarSlot >= 0) {
                        window.pressKey((cfg.arrowHotbarSlot + 1).toString());
                    }
                    console.log(`%c[Pelican Shop] 🏹 สวมใส่คันธนูและลูกธนูเรียบร้อยแล้ว!`, 'color: #22c55e; font-weight: bold;');
                }
            }, 1400);

            setTimeout(() => {
                if (!window.__isBotRunning && !window.__isManualSelling) return;
                if (onComplete) onComplete();
            }, 2400);
        });
    }

    let lastAutoShopCompletionTime = 0;

    window.executeAutoShopRoutine = function() {
        if (window.__isShopping) {
            console.warn('[Pelican Shop] ⚠️ กำลังดำเนินการซื้อขายอยู่แล้ว');
            return;
        }

        // Cooldown Guard: ป้องกันไม่ให้วนกลับมาเปิดร้านซ้ำทันทีหลังเพิ่งเสร็จสิ้น (Cooldown 20 วินาที)
        const now = Date.now();
        if (now - lastAutoShopCompletionTime < 20000) {
            console.log('[Pelican Shop] ⏳ เพิ่งดำเนินการซื้อขายเสร็จสิ้นไป อยู่ในช่วงพักคูลดาวน์ (Cooldown 20s)');
            return;
        }

        // GUARD 1: ป้องกันตัวละครตายแล้วยังพยายามซื้อของ
        if (typeof isCharacterDead === 'function' && isCharacterDead()) {
            console.warn('%c[Pelican Shop Guard] 🛑 ตัวละครเสียชีวิตอยู่! ยกเลิก Routine ร้านค้า และรอระบบชุบชีวิตทำงานก่อน', 'color: #ef4444; font-weight: bold;');
            return;
        }

        // GUARD 2: ถ้ากำลังเดินข้ามแมพอยู่ ให้รอเดินทางเสร็จก่อน
        if (window.__isNavigating) {
            console.warn('[Pelican Shop Guard] ⚠️ กำลังเดินทางข้ามแมพอยู่ ไม่สามารถเปิดร้านค้าได้');
            return;
        }

        window.__isShopping = true;
        const startMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : 'ไม่ทราบแมพ';
        console.log(`%c[Pelican Shop] 🛒 เริ่มต้น Routine ซื้อ/ขายอัตโนมัติ (แมพปัจจุบัน: "${startMap}")`, 'color: #f59e0b; font-weight: bold;');

        const currentFarmMap = window.__targetFarmMap;
        const targetNpc = (window.__shopConfig && window.__shopConfig.npcKey) ? window.__shopConfig.npcKey : 'n2';

        function startCityWalk() {
            // GUARD 3: ต้องมั่นใจ 100% ว่าตัวละครอยู่ในเมืองหลวงจริง ๆ จึงจะอนุญาตให้เดินหา NPC และเปิดร้าน!
            if (typeof isCharacterInCity === 'function' && !isCharacterInCity()) {
                console.error(`%c[Pelican Shop Guard] 🛑 ปฏิเสธการเปิดร้าน! ตัวละครไม่ได้อยู่ในเมืองหลวง (แมพปัจจุบัน: "${getCurrentMapName()}") เพื่อป้องกันซื้อของจนน้ำหนักเกินในแมพมอนสเตอร์`, 'color: #ef4444; font-weight: bold;');
                window.__isShopping = false;
                return;
            }

            // GUARD 4: ตรวจสอบการตายก่อนคุยกับ NPC
            if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                console.error('%c[Pelican Shop Guard] 🛑 ตัวละครเสียชีวิต! ยกเลิกการเปิดร้านทันที', 'color: #ef4444; font-weight: bold;');
                window.__isShopping = false;
                return;
            }

            console.log(`%c[Pelican Shop] 🚶 เดินหา NPC ร้านค้า (${targetNpc}) ในเมือง: "${getCurrentMapName()}"`, 'color: #38bdf8;');
            window.sendRemoteNpcTalk(targetNpc);

            let moveAttempts = 0;
            let lastPlayerPos = { x: 0, y: 0 };

            if (window.__shopArrivalInterval) {
                clearInterval(window.__shopArrivalInterval);
                window.__shopArrivalInterval = null;
            }

            window.__shopArrivalInterval = setInterval(() => {
                if (!window.__isBotRunning) {
                    clearInterval(window.__shopArrivalInterval);
                    window.__shopArrivalInterval = null;
                    window.__isShopping = false;
                    return;
                }

                // GUARD 5: ระหว่างเดินหา NPC ถ้าตัวละครตาย ให้ตัดจบ
                if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                    clearInterval(window.__shopArrivalInterval);
                    window.__shopArrivalInterval = null;
                    console.error('%c[Pelican Shop Guard] 🛑 ตัวละครเสียชีวิตระหว่างเดินในเมือง! ยกเลิกทันที', 'color: #ef4444; font-weight: bold;');
                    window.__isShopping = false;
                    return;
                }

                moveAttempts++;
                const curPos = window.__currentPos;
                const isStationary = (curPos.x === lastPlayerPos.x && curPos.y === lastPlayerPos.y && curPos.x !== 0);
                lastPlayerPos = { x: curPos.x, y: curPos.y };

                if (isStationary && moveAttempts >= 3) {
                    clearInterval(window.__shopArrivalInterval);
                    window.__shopArrivalInterval = null;

                    // GUARD 6: ตรวจสอบเมืองอีกครั้งก่อนส่ง packet เปิดร้านค้า
                    if (typeof isCharacterInCity === 'function' && !isCharacterInCity()) {
                        console.error('[Pelican Shop Guard] 🛑 หลุดออกจากเมืองหลวง ยกเลิกการเปิดร้าน');
                        window.__isShopping = false;
                        return;
                    }

                    console.log('%c[Pelican Shop] 🎯 ตัวละครหยุดเดิน (ถึงระยะ NPC) -> กำลังเปิดร้านค้า...', 'color: #22c55e; font-weight: bold;');
                    window.sendRemoteNpcTalk(targetNpc);

                    setTimeout(() => {
                        if (!window.__isBotRunning) return;
                        window.sendRemoteNpcOption(0);

                        setTimeout(() => {
                            if (!window.__isBotRunning) return;
                            executeSellAndBuyActions(() => {
                                if (!window.__isBotRunning) return;
                                window.sendNpcClose();
                                if (typeof window.closeShopUI === 'function') {
                                    window.closeShopUI();
                                }
                                console.log('%c[Pelican Shop] 🔄 ซิงก์จัดเรียงกระเป๋าและอ่านน้ำหนักจริงหลังขาย...', 'color: #38bdf8; font-weight: bold;');

                                // ซิงก์น้ำหนักและกดจัดเรียงกระเป๋าทันทีที่หน้า NPC ร้านค้า (~300ms)
                                // เพื่อให้เกมคำนวณน้ำหนักจริงใหม่ ลบ Debuff 70% บนจอ และอัปเดตแคชตัวเลขจริงก่อนเริ่มเดินทางกลับ
                                if (typeof window.refreshInventoryAndWeight === 'function') {
                                    window.refreshInventoryAndWeight((newWeight) => {
                                        lastAutoShopCompletionTime = Date.now();
                                        window.__isKnownOverweight = false;
                                        if (newWeight) {
                                            window.__lastKnownWeight = newWeight;
                                        }
                                        console.log(`%c[Pelican Shop] 🚀 ภารกิจซื้อขายเสร็จสิ้น! น้ำหนักคงเหลือ: ${newWeight ? newWeight.percent + '%' : 'ปลอดภัย'} | สั่งเดินกลับไปฟาร์ม: ${currentFarmMap}`, 'color: #a855f7; font-weight: bold;');
                                        setTimeout(() => {
                                            if (!window.__isBotRunning) return;
                                            if (typeof window.closeShopUI === 'function') window.closeShopUI();
                                            window.__isShopping = false;
                                            window.walkToTargetMap(currentFarmMap);
                                        }, 600);
                                    });
                                } else {
                                    lastAutoShopCompletionTime = Date.now();
                                    window.__isKnownOverweight = false;
                                    setTimeout(() => {
                                        if (!window.__isBotRunning) return;
                                        if (typeof window.closeShopUI === 'function') window.closeShopUI();
                                        window.__isShopping = false;
                                        window.walkToTargetMap(currentFarmMap);
                                    }, 800);
                                }
                            });
                        }, 1200);

                    }, 700);
                }

                if (moveAttempts >= 45) {
                    clearInterval(window.__shopArrivalInterval);
                    window.__shopArrivalInterval = null;
                    console.error('[Pelican Shop] ❌ หมดเวลาเดินหา NPC (Timeout)');
                    window.__isShopping = false;
                }
            }, 1000);
        }

        // GUARD 7: วาร์ปกลับเมืองหลวง (Bwing Guard)
        const inCity = typeof isCharacterInCity === 'function' ? isCharacterInCity() : false;
        if (!inCity) {
            const allowWarp = (window.__archerConfig && window.__archerConfig.useBwing) || (typeof isCharacterOverweight === 'function' && isCharacterOverweight());
            if (!allowWarp) {
                console.warn(`%c[Pelican Shop Guard] 🛑 ตัวละครอยู่ที่ "${getCurrentMapName()}" (ไม่ใช่เมืองหลวง) และไม่ได้เปิดใช้งาน Butterfly Wing -> ยกเลิก Routine ร้านค้า!`, 'color: #ef4444; font-weight: bold;');
                window.__isShopping = false;
                return;
            }

            console.log(`%c[Pelican Shop] ⚡ ตัวละครอยู่ที่ "${getCurrentMapName()}" (ไม่ใช่เมืองหลวง) -> กำลังใช้วาร์ป Butterfly Wing...`, 'color: #38bdf8; font-weight: bold;');
            window.useButterflyWing();

            if (window.__shopWarpInterval) {
                clearInterval(window.__shopWarpInterval);
                window.__shopWarpInterval = null;
            }

            let warpAttempts = 0;
            window.__shopWarpInterval = setInterval(() => {
                if (!window.__isBotRunning) {
                    clearInterval(window.__shopWarpInterval);
                    window.__shopWarpInterval = null;
                    window.__isShopping = false;
                    return;
                }

                warpAttempts++;

                // เช็คว่าตัวละครตายหรือไม่ขณะรอวาร์ป
                if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                    clearInterval(window.__shopWarpInterval);
                    window.__shopWarpInterval = null;
                    console.warn('%c[Pelican Shop Guard] 🛑 ตัวละครเสียชีวิตขณะพยายามวาร์ป! ยกเลิก Routine ร้านค้า', 'color: #ef4444; font-weight: bold;');
                    window.__isShopping = false;
                    return;
                }

                // เช็คว่าถึงเมืองหลวงสำเร็จหรือยัง
                if (typeof isCharacterInCity === 'function' && isCharacterInCity()) {
                    clearInterval(window.__shopWarpInterval);
                    window.__shopWarpInterval = null;
                    console.log(`%c[Pelican Shop] 🏛️ วาร์ปถึงเมืองหลวง (${getCurrentMapName()}) สำเร็จ 100%! เตรียมเดินหา NPC...`, 'color: #22c55e; font-weight: bold;');
                    setTimeout(() => {
                        if (window.__isBotRunning) startCityWalk();
                    }, 1200);
                    return;
                }

                // ถ้ายังไม่ถึงเมือง ลองใช้วาร์ปซ้ำ (สูงสุด 3 ครั้ง)
                if (warpAttempts <= 3) {
                    console.log(`%c[Pelican Shop] 🔄 ยังไม่ถึงเมืองหลวง (อยู่ที่ "${getCurrentMapName()}") กำลังใช้วาร์ปซ้ำ (${warpAttempts}/3)...`, 'color: #f59e0b;');
                    window.useButterflyWing();
                } else {
                    clearInterval(window.__shopWarpInterval);
                    window.__shopWarpInterval = null;
                    console.error(`%c[Pelican Shop Guard] ❌ วาร์ปกลับเมืองไม่สำเร็จหลังจากลอง 3 ครั้ง (แมพยังคงเป็น "${getCurrentMapName()}")! ยกเลิก Routine ร้านค้าทั้งหมด เพื่อป้องกันการซื้อของจนน้ำหนักเกินในแมพมอนสเตอร์`, 'color: #ef4444; font-weight: bold;');
                    window.__isShopping = false;
                }
            }, 2000);
        } else {
            console.log(`%c[Pelican Shop] 🏛️ ตัวละครอยู่ที่เมืองหลวงอยู่แล้ว (${getCurrentMapName()}) -> เริ่มต้นเดินหา NPC ได้ทันที`, 'color: #22c55e;');
            startCityWalk();
        }
    };

    // ==========================================
    // 4. World Map Opener (Unfocused-Safe)
    // ==========================================
    function closeAnyOpenMenus() {
        if (typeof window.closeShopUI === 'function') {
            window.closeShopUI();
        }
        const openNavMenu = document.querySelector('nav.hud-menu:not(.closed)');
        if (openNavMenu) {
            const menuToggleBtn = Array.from(document.querySelectorAll('button, div')).find(el => el.innerText && el.innerText.includes('เมนู'));
            if (menuToggleBtn) triggerClick(menuToggleBtn);
        }
        // ตรวจสอบถ้ามีปุ่มเมนูมุมขวาล่างเปิดอยู่
        const menuBtn = Array.from(document.querySelectorAll('button, div')).find(el => {
            if (el.closest('#pelican-hud')) return false;
            const txt = (el.innerText || '').trim();
            return txt === 'เมนู' || txt === '▼ เมนู' || txt === '▲ เมนู';
        });
        const hasOpenGrid = Array.from(document.querySelectorAll('button, div')).some(el => {
            if (el.closest('#pelican-hud')) return false;
            return (el.innerText || '').trim() === 'สมุดการ์ด' && el.offsetWidth > 0;
        });
        if (hasOpenGrid && menuBtn) {
            triggerClick(menuBtn);
        }
        dispatchKeyAll('Escape', 'Escape', 27);
    }

    function openWorldMap(callback) {
        if (isWorldMapOpen()) {
            if (callback) callback();
            return;
        }

        console.log('[Pelican] 🗺️ กำลังเปิดหน้าต่างแผนที่โลก...');

        closeAnyOpenMenus();

        const minimapStage = document.querySelector('.minimap-stage') ||
                             document.querySelector('[aria-label="เปิดแผนที่โลก"]') ||
                             document.querySelector('.minimap');

        if (minimapStage) {
            triggerClick(minimapStage);
            minimapStage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }

        dispatchKeyAll('m', 'KeyM', 77);

        if (window.__worldMapPollInterval) {
            clearInterval(window.__worldMapPollInterval);
            window.__worldMapPollInterval = null;
        }

        let attempts = 0;
        window.__worldMapPollInterval = setInterval(() => {
            if (!window.__isBotRunning && !window.__isNavigating) {
                clearInterval(window.__worldMapPollInterval);
                window.__worldMapPollInterval = null;
                return;
            }

            attempts++;
            if (isWorldMapOpen()) {
                clearInterval(window.__worldMapPollInterval);
                window.__worldMapPollInterval = null;
                console.log('%c[Pelican] ✅ หน้าต่างแผนที่โลกเปิดสำเร็จ!', 'color: #22c55e;');
                setTimeout(() => { if (callback) callback(); }, 350);
                return;
            }

            if (attempts % 3 === 0) {
                closeAnyOpenMenus();
                if (minimapStage) triggerClick(minimapStage);
                dispatchKeyAll('m', 'KeyM', 77);
            }

            if (attempts >= 16) {
                clearInterval(window.__worldMapPollInterval);
                window.__worldMapPollInterval = null;
                console.error('[Pelican] ❌ เปิดแผนที่โลกไม่สำเร็จ');
                window.__isNavigating = false;
                window.__isRecovering = false;
            }
        }, 250);
    }

    window.openMap = function() {
        openWorldMap();
    };

    window.__arrivalWatcherInterval = null;
    window.__arrivalTimeout = null;

    function stopArrivalWatcher() {
        if (window.__arrivalWatcherInterval) {
            clearInterval(window.__arrivalWatcherInterval);
            window.__arrivalWatcherInterval = null;
        }
        if (window.__arrivalTimeout) {
            clearTimeout(window.__arrivalTimeout);
            window.__arrivalTimeout = null;
        }
    }

    window.walkToTargetMap = function(mapName = window.__targetFarmMap, force = false) {
        if (!mapName) mapName = window.__targetFarmMap;

        // ถ้ากำลังนำทางอยู่ แต่เป็นการกดสั่งใหม่ (force) หรือเปลี่ยนแมพเป้าหมาย ให้ยกเลิกการเดินเดิมทันที
        if (window.__isNavigating) {
            if (force || mapName !== window.__targetFarmMap) {
                console.log(`%c[Pelican] 🔄 ยกเลิกการเดินเดิม สลับไปเดินหาแมพใหม่ทันที: "${mapName}"`, 'color: #f59e0b; font-weight: bold;');
                stopArrivalWatcher();
                window.__isNavigating = false;
            } else {
                console.log(`[Pelican] กำลังเดินทางไปยัง "${window.__targetFarmMap}" อยู่แล้ว`);
                return;
            }
        }

        window.__isNavigating = true;
        window.__targetFarmMap = mapName;
        localStorage.setItem('pelican_farm_map', mapName);

        // GUARD: ตรวจสอบการตาย
        if (typeof isCharacterDead === 'function' && isCharacterDead()) {
            console.warn('[Pelican Guard] 🛑 ตัวละครเสียชีวิตอยู่ ไม่สามารถเริ่มเดินไปแมพได้');
            window.__isNavigating = false;
            return;
        }

        console.log(`%c[Pelican] 🗺️ กำลังเริ่มกระบวนการเดินไปแมพ: ${mapName}`, 'color: #00ffcc; font-weight: bold;');

        const inCity = typeof isCharacterInCity === 'function' ? isCharacterInCity() : false;
        const curMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
        const isTargetCity = mapName.includes('เมืองหลวง') || mapName.includes('โซลเฮเวน') || mapName.includes('ตลาดคาราวาน');

        // ถ้าตัวละครอยู่ในเมืองหลวง หรือกำลังฟื้นคืนชีพ (recovering) แต่เป้าหมายคือแมพมอนสเตอร์ -> ห้ามสรุปว่าถึงแล้วเด็ดขาด!
        if ((!inCity || isTargetCity) && curMap && curMap.includes(mapName) && !window.__isRecovering) {
            console.log(`[Pelican] ตัวละครอยู่ที่แมพ "${mapName}" อยู่แล้ว เปิดบอททันที!`);
            window.startBot();
            window.__isNavigating = false;
            window.__isRecovering = false;
            return;
        }

        function clickWalkButton() {
            // 1. ถ้ามีปุ่ม "วาร์ปไปที่นี่" (Alice Warp Service จาก NPC n6) ให้กดวาร์ปทันที!
            const warpBtn = Array.from(document.querySelectorAll('button')).find(b => {
                const txt = (b.innerText || '').trim();
                return txt.includes('วาร์ปไปที่นี่') && !b.disabled && !b.className.includes('disabled') && b.offsetWidth > 0;
            });

            if (warpBtn) {
                triggerClick(warpBtn);
                console.log('%c[Pelican Warp] ⚡ พบคลิก "วาร์ปไปที่นี่ (NPC Alice)" สำเร็จ! กำลังวาร์ปตรง...', 'color: #eab308; font-weight: bold;');

                setTimeout(() => {
                    if (isWorldMapOpen()) {
                        dispatchKeyAll('m', 'KeyM', 77);
                    }
                }, 1200);

                startArrivalWatcher(mapName);
                return true;
            }

            // 2. ถ้าไม่มีปุ่มวาร์ป ให้กด "เดินไปที่นี่" ปกติ
            const walkBtn = document.querySelector('.worldmap-walk button') ||
                            Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('เดินไปที่นี่'));
            if (walkBtn) {
                triggerClick(walkBtn);
                console.log('%c[Pelican] 🚀 คลิก "เดินไปที่นี่" สำเร็จ! กำลังเฝ้าดูการเดินทาง...', 'color: #22c55e; font-weight: bold;');

                setTimeout(() => {
                    if (isWorldMapOpen()) {
                        dispatchKeyAll('m', 'KeyM', 77);
                    }
                }, 1500);

                startArrivalWatcher(mapName);
                return true;
            }
            return false;
        }

        function clickMapPin(retries = 3) {
            // ตัดข้อความวงเล็บเลเวลออก เช่น "ทะเลสาบอาซูร์ (Lv. 12-20)" -> "ทะเลสาบอาซูร์"
            const cleanMapName = mapName.replace(/\s*\(Lv\..*?\)/i, '').trim();

            const currentInspect = document.querySelector('.worldmap-inspect h3');
            if (currentInspect && currentInspect.textContent.includes(cleanMapName)) {
                if (clickWalkButton()) return;
            }

            // ค้นหาเฉพาะในคอนเทนเนอร์แผนที่เท่านั้น ห้ามค้นหาใน document.body เพื่อป้องกันการไปคลิกโดนผู้เล่นอื่น
            const stage = document.querySelector('.worldmap-stage, .worldmap-body, .worldmap-window, [class*="worldmap"]');
            if (!stage) {
                console.warn(`[Pelican] ⏳ หน้าต่างแผนที่ยังไม่เปิด กำลังรอ... (retries: ${retries})`);
                if (retries > 0) {
                    setTimeout(() => clickMapPin(retries - 1), 600);
                }
                return;
            }

            const matches = Array.from(stage.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal')) return false;
                const txt = (el.textContent || '').trim();
                if (!txt.includes(cleanMapName)) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });

            const pin = matches.find(el => !Array.from(el.children).some(c => c.textContent && c.textContent.includes(cleanMapName))) || matches[0];

            if (pin) {
                console.log(`%c[Pelican Map] 📍 คลิกหมุดแมพ: "${cleanMapName}"`, 'color: #00ffcc; font-weight: bold;');
                triggerClick(pin);
                pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

                const mapId = MAP_NAME_TO_ID[cleanMapName] || MAP_NAME_TO_ID[mapName];

                if (window.__walkClickInterval) {
                    clearInterval(window.__walkClickInterval);
                    window.__walkClickInterval = null;
                }

                let walkTries = 0;
                window.__walkClickInterval = setInterval(() => {
                    if (!window.__isBotRunning && !window.__isNavigating) {
                        clearInterval(window.__walkClickInterval);
                        window.__walkClickInterval = null;
                        return;
                    }

                    walkTries++;
                    if (clickWalkButton() || walkTries >= 8) {
                        clearInterval(window.__walkClickInterval);
                        window.__walkClickInterval = null;
                    }
                }, 300);

                if (mapId && typeof window.sendNpcWarp === 'function') {
                    setTimeout(() => {
                        if (window.__isBotRunning || window.__isNavigating) {
                            window.sendNpcWarp(mapId);
                        }
                    }, 500);
                }
            } else if (retries > 0) {
                setTimeout(() => clickMapPin(retries - 1), 400);
            } else {
                console.warn(`[Pelican] ไม่พบหมุดแมพ "${cleanMapName}" บนหน้าต่างแผนที่`);
                const mapId = MAP_NAME_TO_ID[cleanMapName] || MAP_NAME_TO_ID[mapName];
                if (mapId && typeof window.sendNpcWarp === 'function') {
                    console.log(`[Pelican Warp] ⚡ ส่ง Packet วาร์ปตรงไปยัง "${cleanMapName}" (${mapId})...`);
                    window.sendNpcWarp(mapId);
                    startArrivalWatcher(cleanMapName);
                    return;
                }
                if (!clickWalkButton()) {
                    window.__isNavigating = false;
                    window.__isRecovering = false;
                }
            }
        }

        // ถ้าตัวละครอยู่ในเมืองหลวง ให้คุยกับ Alice (n6) เพื่อเปิด Alice Warp Service ก่อน
        if (typeof isCharacterInCity === 'function' && isCharacterInCity()) {
            console.log(`%c[Pelican Warp] 🏛️ ตัวละครอยู่ในเมืองหลวง -> คุยกับ NPC Alice เพื่อเปิดวาร์ปเกตด่วนไป "${mapName}" (Warp Service ไม่ใช่ซื้อของ/ลูกธนู)`, 'color: #eab308; font-weight: bold;');
            window.openAliceWarpService(() => {
                setTimeout(() => clickMapPin(3), 500);
            });
        } else {
            console.log(`%c[Pelican] 🗺️ กำลังเปิดแผนที่โลกเพื่อเดินทางไปยัง "${mapName}"...`, 'color: #38bdf8; font-weight: bold;');
            openWorldMap(() => clickMapPin(2));
        }
    };

    function startArrivalWatcher(targetMap) {
        stopArrivalWatcher();
        console.log(`%c[Pelican] 📡 เริ่มต้นระบบตรวจจับการถึงแมพ: "${targetMap}"`, 'color: #38bdf8;');
        window.__arrivalWatcherInterval = setInterval(() => {
            if (!window.__isBotRunning && !window.__isNavigating) {
                stopArrivalWatcher();
                window.__isNavigating = false;
                return;
            }

            if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                stopArrivalWatcher();
                window.__isNavigating = false;
                return;
            }

            const inCity = typeof isCharacterInCity === 'function' ? isCharacterInCity() : false;
            const currentMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
            const isTargetCity = targetMap.includes('เมืองหลวง') || targetMap.includes('โซลเฮเวน') || targetMap.includes('ตลาดคาราวาน');

            if ((!inCity || isTargetCity) && currentMap && currentMap.includes(targetMap)) {
                stopArrivalWatcher();
                console.log(`%c[Pelican] 🎯 เดินทางถึงแมพ "${targetMap}" สำเร็จ! เปิด Auto-Bot...`, 'color: #22c55e; font-weight: bold;');
                setTimeout(() => {
                    if (window.__isBotRunning) {
                        if (typeof isCharacterOverweight === 'function' && isCharacterOverweight()) {
                            console.warn('%c[Pelican] ⚖️ ถึงแมพฟาร์มแล้วแต่น้ำหนักเต็มหรือเกินเกณฑ์ (>= 90%)! สั่งวาร์ปกลับไปขายของทันที...', 'color: #ef4444; font-weight: bold;');
                            window.executeAutoShopRoutine();
                        } else {
                            window.startBot();
                        }
                    }
                    window.__isNavigating = false;
                    window.__isRecovering = false;
                }, 1500);
            }
        }, 1500);

        window.__arrivalTimeout = setTimeout(() => {
            if (window.__isNavigating) {
                stopArrivalWatcher();
                console.warn(`[Pelican] ⚠️ หมดเวลาเฝ้าดูการเดินทางไปยัง "${targetMap}" (Timeout)`);
                window.__isNavigating = false;
                window.__isRecovering = false;
            }
        }, 120000);
    }

    // ==========================================
    // 5. Monster Raycast
    // ==========================================
    window.addEventListener('pointerdown', (e) => {
        const canvas = document.querySelector('canvas');
        if (!canvas || e.target !== canvas) return;

        const curX = window.__currentPos.x;
        const curY = window.__currentPos.y;
        if (!curX && !curY) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const worldX = Math.round(curX + (clickX - centerX));
        const worldY = Math.round(curY + (clickY - centerY));

        window.__monsterPos = { x: worldX, y: worldY };
        updateUIMonster(worldX, worldY);
    }, true);

    // ==========================================
    // 6. Watchdog Loop
    // ==========================================
    let lastAutoActivateAttempt = 0;
    let autoActivateFailCount = 0;
    let lastPeriodicWeightRefresh = 0;
    let lastCityToFarmAttempt = 0;

    setInterval(() => {
        if (!window.__isBotRunning || !window.__autoLoopEnabled || window.__isRecovering || window.__isShopping) return;

        const isDead = typeof isCharacterDead === 'function' ? isCharacterDead() : false;
        const inCity = typeof isCharacterInCity === 'function' ? isCharacterInCity() : false;

        // 1. ตรวจจับการเสียชีวิต (Dead Check)
        if (isDead) {
            console.log('%c[Pelican] ⚠️ ตัวละครตาย! เริ่มชุบชีวิตและเตรียมเดินกลับแมพฟาร์ม...', 'color: #ef4444; font-weight: bold;');
            window.__isRecovering = true;
            autoActivateFailCount = 0;

            // ส่ง Packet ชุบชีวิต
            if (typeof window.sendRespawn === 'function') {
                window.sendRespawn();
            }

            // คลิกปุ่มฟื้นคืนชีพบน Modal (เช่น "ฟื้นที่จุดเกิด")
            try {
                const respawnBtns = Array.from(document.querySelectorAll('button, div[role="button"], a.btn')).filter(el => {
                    if (el.closest('#pelican-hud') || el.closest('[class*="chat"]') || el.closest('.chat-log') || el.closest('.worldmap-window')) return false;
                    const txt = (el.innerText || '').trim();
                    return (txt === 'ฟื้นที่จุดเกิด' || txt === 'ฟื้นคืนชีพ' || txt === 'ฟื้นอัตโนมัติ') && el.offsetWidth > 0 && el.offsetHeight > 0;
                });
                if (respawnBtns[0]) triggerClick(respawnBtns[0]);
            } catch(e) {}

            // รอจนกระทั่งตัวละครฟื้นคืนชีพและแมพสลับเข้าเมืองสำเร็จ
            let respawnCheckCount = 0;
            const respawnInterval = setInterval(() => {
                respawnCheckCount++;
                const stillDead = typeof isCharacterDead === 'function' ? isCharacterDead() : false;
                const nowInCity = typeof isCharacterInCity === 'function' ? isCharacterInCity() : false;

                // เมื่อตัวละครฟื้นแล้ว และเข้าสู่เมืองหลวงเรียบร้อย (หรือรอครบ 15 วินาที fail-safe)
                if (!stillDead && (nowInCity || respawnCheckCount >= 15)) {
                    clearInterval(respawnInterval);
                    window.__isRecovering = false;
                    console.log(`%c[Pelican] 🏛️ ตัวละครฟื้นคืนชีพเรียบร้อย (แมพ: "${getCurrentMapName()}")! สั่งเดินกลับไปฟาร์ม...`, 'color: #22c55e; font-weight: bold;');
                    setTimeout(() => {
                        if (window.__isBotRunning) {
                            window.walkToTargetMap(window.__targetFarmMap || 'ถนนต้นหลิว', true);
                        }
                    }, 1200);
                }
            }, 1000);

            // Fail-safe 20s ป้องกันติดค้าง
            setTimeout(() => {
                clearInterval(respawnInterval);
                window.__isRecovering = false;
            }, 20000);
            return;
        }

        // 2. ถ้ากำลังเดินทางข้ามแมพ ให้รอเดินทางเสร็จก่อน
        if (window.__isNavigating) return;

        // 3. ตรวจสอบน้ำหนักสัมภาระเกินเกณฑ์ (Weight Overload Check) - เช็คทั้งในเมืองและนอกเมือง!
        if (typeof isCharacterOverweight === 'function' && isCharacterOverweight()) {
            const w = (typeof getCharacterWeight === 'function' ? getCharacterWeight() : null) || window.__lastKnownWeight || window.__serverWeight;
            const pctStr = w ? `${w.percent}%` : '>= เกณฑ์';
            const limitStr = `${window.__sellConfig?.weightThreshold || 80}%`;
            if (inCity) {
                console.warn(`%c[Pelican Watchdog] ⚖️ ตรวจพบตัวละครอยู่ในเมืองหลวง แต่น้ำหนักสัมภาระเกินเกณฑ์ (${pctStr} >= ${limitStr})! เดินไปร้านค้า (NPC n2) เพื่อขายของทันที...`, 'color: #ef4444; font-weight: bold;');
            } else {
                console.warn(`%c[Pelican Watchdog] ⚖️ ตรวจพบกระเป๋าเต็มหรือน้ำหนักเกินเกณฑ์ในสนามฟาร์ม (${pctStr} >= ${limitStr})! สั่งวาร์ปกลับไปขายของและเคลียร์กระเป๋าทันที...`, 'color: #ef4444; font-weight: bold;');
            }
            if (typeof playWarningChime === 'function') playWarningChime();
            autoActivateFailCount = 0;
            window.executeAutoShopRoutine();
            return;
        }

        // หมายเหตุ: ตัดระบบเปิดกระเป๋าอัตโนมัติเป็นระยะออกแล้ว เพื่อไม่ให้หน้าต่างกระเป๋าเด้งรบกวนผู้เล่น
        // ระบบจะอ่านน้ำหนักจาก Debuff Status (.hud-status) บนหน้าจอแทนแบบ 100% Passive

        // 4. ตรวจจับลูกธนูหมด สำหรับอาชีพ Archer / Hunter
        if (window.__archerConfig && window.__archerConfig.requireArrow && !inCity) {
            const threshold = typeof window.__archerConfig.ammoThreshold === 'number' ? window.__archerConfig.ammoThreshold : 50;

            // ซิงก์จำนวนล่าสุดจาก DOM ก่อนตัดสินใจ
            if (typeof syncAmmoFromDOM === 'function') {
                syncAmmoFromDOM();
            }

            // ตรวจจับข้อความเตือนลูกธนูหมดในจอหรือหน้าต่างแชท/แจ้งเตือน
            const screenText = document.body.innerText || '';
            const noAmmoWarning = screenText.includes('ไม่มีลูกธนู') || 
                                  screenText.includes('ลูกธนูหมด') || 
                                  screenText.includes('ไม่พอลูกธนู') || 
                                  screenText.includes('กระสุนหมด') || 
                                  screenText.includes('ต้องการลูกธนู') || 
                                  screenText.includes('Arrow depleted') || 
                                  screenText.includes('Out of arrows');

            if (noAmmoWarning) {
                console.warn('%c[Pelican Archer] ⚠️ ตรวจพบข้อความลูกธนูหมดบนหน้าจอ! ปรับ Ammo = 0 และสั่งวาร์ปทันที!', 'color: #ef4444; font-weight: bold;');
                window.__currentAmmo = 0;
                localStorage.setItem('pelican_current_ammo', 0);
                updateAmmoHUD();
                autoActivateFailCount = 0;
                window.executeAutoShopRoutine();
                return;
            }

            if (typeof window.__currentAmmo === 'number' && window.__currentAmmo <= threshold) {
                console.log(`%c[Pelican Archer] 🏹 ลูกธนูหมดหรือเหลือน้อย (${window.__currentAmmo} <= ${threshold} ดอก) -> สั่งวาร์ปกลับไปซื้อทันที!`, 'color: #ef4444; font-weight: bold;');
                autoActivateFailCount = 0;
                window.executeAutoShopRoutine();
                return;
            }
        }

        // 5. ตรวจสอบสถานะปุ่ม AUTO ในเกม (In-Game AUTO State Monitor)
        // เมื่ออยู่ในสนามฟาร์ม (ไม่ใช่ในเมือง) และบอทกำลัง START อยู่ และไม่ได้อยู่ในช่วงฟื้นฟู/เดินทาง/ช้อป/ตาย
        if (!inCity) {
            const autoStatus = getInGameAutoStatus();
            if (autoStatus === 'on') {
                // AUTO กำลังทำงานปกติ รีเซ็ตตัวนับความล้มเหลว
                autoActivateFailCount = 0;
                window.__isKnownOverweight = false;
            } else if (autoStatus === 'off') {
                if (Date.now() - lastAutoActivateAttempt > 1500) {
                    lastAutoActivateAttempt = Date.now();

                    // FAIL-SAFE: ถ้ากดเปิด AUTO ไปแล้ว 3 ครั้ง แต่สถานะยังคงเป็น "off" ตลอด
                    // แสดงว่าตัวเกมบล็อคไม่ให้เปิด AUTO เพราะน้ำหนักในกระเป๋าเต็มหรือเกิน 90%!
                    if (autoActivateFailCount >= 3) {
                        console.error('%c[Pelican Watchdog] 🛑 กดเปิด AUTO ไม่สำเร็จ 3 ครั้งติดต่อกัน! ตัวเกมล็อค AUTO เนื่องจากน้ำหนักในกระเป๋าเต็มหรือเกิน 90% -> สั่งวาร์ปกลับไปขายของและเคลียร์กระเป๋าทันที!', 'color: #ef4444; font-weight: bold; font-size: 13px;');
                        autoActivateFailCount = 0;
                        window.__isKnownOverweight = true;
                        window.executeAutoShopRoutine();
                        return;
                    }

                    autoActivateFailCount++;
                    console.log(`%c[Pelican Watchdog] ⚡ บอท START อยู่ในสนามรบ แต่ปุ่ม AUTO ในเกมปิดอยู่ ("AUTO ปิด") [ครั้งที่ ${autoActivateFailCount}/3] -> สั่งกดเปิด AUTO ทันที!`, 'color: #f59e0b; font-weight: bold;');
                    window.activateInGameAuto();
                }
            }
        }

        // 6. ตรวจสอบกรณีตัวละครตกค้างอยู่ในเมืองหลวง (City-to-Farm Auto-Dispatch)
        // เมื่อบอท START อยู่ แต่ตัวละครยืนค้างอยู่ในเมืองหลวง และไม่ได้อยู่ในลูปซื้อของ/เดินทาง/ฟื้นฟู
        if (inCity && !window.__isShopping && !window.__isNavigating && !window.__isRecovering) {
            const targetMap = window.__targetFarmMap || 'ถนนต้นหลิว';
            const isTargetCity = targetMap.includes('เมืองหลวง') || targetMap.includes('โซลเฮเวน') || targetMap.includes('ตลาดคาราวาน');
            if (!isTargetCity) {
                const now = Date.now();
                if (now - lastCityToFarmAttempt > 4000) {
                    lastCityToFarmAttempt = now;
                    console.log(`%c[Pelican Watchdog] 🏛️ ตัวละครตกค้างอยู่ในเมืองหลวง ("${getCurrentMapName()}") ขณะบอท START -> สั่งเดินทางไปยังแมพเป้าหมาย: "${targetMap}" ผ่าน NPC Alice ทันที!`, 'color: #38bdf8; font-weight: bold;');
                    window.walkToTargetMap(targetMap, true);
                    return;
                }
            }
        }
    }, 1000);

    // ==========================================
    // 6.5 AUTO-LOGIN & RECONNECT ENGINE
    // ==========================================
    let lastLoginAttemptTime = 0;
    let loginFailCount = 0;
    let isLoginInProgress = false;

    function setNativeInputValue(element, value) {
        if (!element) return;
        element.focus();
        try {
            const prototype = Object.getPrototypeOf(element);
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(element, value);
            } else {
                element.value = value;
            }
        } catch(e) {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
    }

    function findLoginElements() {
        // หา password input ที่อยู่นอก #pelican-hud
        const passInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(el => {
            return !el.closest('#pelican-hud') && el.offsetWidth > 0;
        });
        const passInput = passInputs[0] || null;

        // หา text/username input ที่อยู่นอก #pelican-hud
        const allTextInputs = Array.from(document.querySelectorAll('input:not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="hidden"])')).filter(el => {
            return !el.closest('#pelican-hud') && el.offsetWidth > 0;
        });

        let userInput = allTextInputs.find(el => {
            const placeholder = (el.placeholder || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            return placeholder.includes('ผู้ใช้') || placeholder.includes('user') || placeholder.includes('username') || placeholder.includes('id') ||
                   name.includes('user') || name.includes('username') || name.includes('login') ||
                   id.includes('user') || id.includes('username');
        });

        if (!userInput && passInput) {
            const form = passInput.closest('form');
            if (form) {
                userInput = form.querySelector('input:not([type="password"])');
            } else {
                userInput = allTextInputs[0] || null;
            }
        }

        // หาปุ่ม "เข้าเกม"
        const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], a.btn, input[type="submit"]')).filter(el => {
            return !el.closest('#pelican-hud') && el.offsetWidth > 0;
        });

        const loginBtn = allButtons.find(el => {
            const txt = (el.innerText || el.textContent || el.value || '').trim();
            return txt === 'เข้าเกม' || txt === 'เข้าสู่ระบบ' || txt === 'Login' || txt === 'Sign In';
        }) || null;

        return { userInput, passInput, loginBtn };
    }

    function isLoginScreenVisible() {
        const { passInput, loginBtn } = findLoginElements();
        if (passInput && loginBtn) return true;

        const bodyText = document.body.innerText || '';
        const isAuthPage = bodyText.includes('เริ่มต้นเป็น Novice') || 
                           bodyText.includes('สมัครบัญชีใหม่') || 
                           bodyText.includes('ลงชื่อเข้าใช้ด้วย Google') ||
                           bodyText.includes('เล่นทันที ไม่ต้องสมัคร');

        if (isAuthPage && (passInput || loginBtn)) {
            return true;
        }
        return false;
    }

    function checkPostLoginScreen() {
        const cfg = window.__authConfig || {};
        if (isLoginScreenVisible()) return;

        const bodyText = document.body.innerText || '';
        const isCharSelectScreen = bodyText.includes('เลือกตัวละคร') || 
                                   bodyText.includes('สร้างตัวละคร') || 
                                   bodyText.includes('เข้าเกมด้วย') || 
                                   bodyText.includes('Select Character');

        // Helper: หาปุ่มเข้าเกมที่มีอยู่แล้ว
        function findEnterButton() {
            const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a.btn, [class*="btn"], div')).filter(el => {
                if (el.closest('#pelican-hud') || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                if (el.offsetHeight > 140) return false; // ไม่ใช่ container ใหญ่
                const txt = (el.innerText || el.textContent || '').trim();
                if (!txt) return false;
                if (txt.startsWith('เข้าเกมด้วย') || 
                    txt === 'เข้าเกม' || 
                    txt === 'เริ่มเกม' || 
                    txt === 'เข้าสู่โลก' || 
                    txt === 'เข้าเล่น' || 
                    txt === 'เลือกตัวละคร' || 
                    txt === 'Enter World' || 
                    txt === 'Start Game') {
                    return true;
                }
                return false;
            });
            candidates.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
            return candidates[0] || null;
        }

        // Helper: หาการ์ดตัวละคร
        function findCharacterCards() {
            const cards = Array.from(document.querySelectorAll('div, button, a')).filter(el => {
                if (el.closest('#pelican-hud') || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                if (el.offsetWidth < 80 || el.offsetHeight < 80 || el.offsetWidth > 450 || el.offsetHeight > 500) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                if (!txt) return false;
                if (txt.includes('สร้างตัวละคร') || txt.includes('ช่องว่าง')) return false;
                return txt.includes('Lv.') || txt.includes('Job') || txt.includes('Hunter') || txt.includes('Novice') || 
                       txt.includes('Knight') || txt.includes('Wizard') || txt.includes('Priest') || txt.includes('Assassin') || 
                       txt.includes('Blacksmith') || txt.includes('Bard') || txt.includes('Dancer') || txt.includes('Crusader') || 
                       txt.includes('Monk') || txt.includes('Sage') || txt.includes('Rogue') || txt.includes('Alchemist');
            });
            cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
            return cards;
        }

        if (isCharSelectScreen) {
            const cards = findCharacterCards();
            if (cards.length > 0) {
                let targetCard = null;
                if (cfg.charName && cfg.charName.trim().length > 0) {
                    targetCard = cards.find(c => (c.innerText || '').includes(cfg.charName.trim()));
                }
                if (!targetCard) {
                    targetCard = cards[0];
                }

                if (targetCard) {
                    triggerClick(targetCard);
                }
            }

            // คลิกปุ่มเข้าเกมหลังเลือกตัวละคร
            setTimeout(() => {
                const enterBtn = findEnterButton();
                if (enterBtn && !isLoginScreenVisible()) {
                    const btnTxt = (enterBtn.innerText || enterBtn.textContent || '').trim();
                    console.log(`%c[Pelican Auth] 🎮 เลือกตัวละคร & คลิกเข้าเกม ("${btnTxt}")...`, 'color: #22c55e; font-weight: bold;');
                    triggerClick(enterBtn);
                }
            }, 350);
        } else {
            const enterBtn = findEnterButton();
            if (enterBtn && !isLoginScreenVisible()) {
                const btnTxt = (enterBtn.innerText || enterBtn.textContent || '').trim();
                console.log(`%c[Pelican Auth] 🎮 พบคลิกปุ่มเข้าสู่โลก ("${btnTxt}") -> กำลังคลิกเข้าเกม...`, 'color: #22c55e; font-weight: bold;');
                triggerClick(enterBtn);
            }
        }
    }

    window.executeAutoLogin = function(force = false) {
        const cfg = window.__authConfig || {};
        if (!force && !cfg.enabled) return;

        if (!cfg.username || !cfg.password) {
            if (force) {
                console.warn('%c[Pelican Auth] ⚠️ ยังไม่ได้ตั้งค่าชื่อผู้ใช้ (ID) หรือ รหัสผ่าน (PS) ในแท็บ "ตั้งค่า"!', 'color: #f59e0b; font-weight: bold;');
                alert('กรุณากรอกชื่อผู้ใช้ (ID) และ รหัสผ่าน (PS) ในแท็บ "⚙️ ตั้งค่า" ก่อนเปิดใช้งาน Auto-Login');
            }
            return;
        }

        if (isLoginInProgress) return;

        const { userInput, passInput, loginBtn } = findLoginElements();
        if (!passInput || !loginBtn) {
            if (force) {
                console.warn('%c[Pelican Auth] ⚠️ ไม่พบหน้าต่าง Login บนหน้าจอ (ตัวละครอาจอยู่ในเกมอยู่แล้ว)', 'color: #f59e0b;');
            }
            return;
        }

        const now = Date.now();
        if (!force && (now - lastLoginAttemptTime < 4500)) return;

        if (!force && loginFailCount >= 6) {
            if (now - lastLoginAttemptTime < 25000) {
                return;
            }
            loginFailCount = 0;
        }

        isLoginInProgress = true;
        lastLoginAttemptTime = now;
        loginFailCount++;

        console.log(`%c[Pelican Auth] 🔐 กำลังดำเนินการ Auto-Login (ครั้งที่ ${loginFailCount}) ด้วย ID: "${cfg.username}"...`, 'color: #a855f7; font-weight: bold;');

        // 1. กรอก Username
        if (userInput) {
            setNativeInputValue(userInput, cfg.username);
        }

        // 2. กรอก Password
        if (passInput) {
            setNativeInputValue(passInput, cfg.password);
        }

        // 3. คลิกปุ่มเข้าเกม
        setTimeout(() => {
            console.log('%c[Pelican Auth] 🚀 คลิกปุ่ม "เข้าเกม"...', 'color: #22c55e; font-weight: bold;');
            triggerClick(loginBtn);

            // ตรวจสอบหน้าต่างเลือกตัวละครหลายระลอก (1.5s, 3s, 5s) เพื่อความเสถียร
            [1500, 3000, 5000].forEach(delay => {
                setTimeout(() => {
                    isLoginInProgress = false;
                    checkPostLoginScreen();
                }, delay);
            });
        }, 500);
    };

    // Auto-Login Watcher & Reconnect Monitor (รันทุก 2.5 วินาที)
    setInterval(() => {
        const cfg = window.__authConfig || {};
        if (!cfg.enabled) return;

        // ถ้าอยู่ในหน้า Login
        if (isLoginScreenVisible()) {
            window.executeAutoLogin(false);
            return;
        }

        // ตรวจสอบหน้าเลือกตัวละคร (ถ้ามี)
        checkPostLoginScreen();

        // ตรวจสอบเมื่อกลับเข้าสู่เกมสำเร็จ และต้องการ Resume Bot ทำงานต่อ
        const curMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
        if (curMap && curMap !== 'ไม่ทราบ' && curMap.length > 0 && !isLoginScreenVisible()) {
            if (loginFailCount > 0) {
                console.log('%c[Pelican Auth] ✅ เข้าสู่โลกสำเร็จเรียบร้อย! (แมพปัจจุบัน: ' + curMap + ')', 'color: #22c55e; font-weight: bold;');
                loginFailCount = 0;
            }

            const shouldResume = cfg.autoResumeBot && (localStorage.getItem('pelican_bot_running') === 'true' || window.__autoLoopEnabled);
            if (shouldResume && !window.__isBotRunning && !window.__isNavigating && !window.__isShopping && !window.__isRecovering) {
                if (!window.__resumeTimer) {
                    console.log('%c[Pelican Auth] ⏳ กำลังเตรียมความพร้อมแผนที่... อีก 3 วินาทีจะเริ่มระบบฟาร์มอัตโนมัติต่อเนื่อง', 'color: #38bdf8; font-weight: bold;');
                    window.__resumeTimer = setTimeout(() => {
                        window.__resumeTimer = null;
                        if (!window.__isBotRunning && (localStorage.getItem('pelican_bot_running') === 'true' || window.__autoLoopEnabled)) {
                            console.log('%c[Pelican Auth] 🚀 Auto-Resume: ทำการ START BOT ฟาร์มต่อทันที 24 ชม.!', 'color: #10b981; font-weight: bold;');
                            window.startMasterBot();
                        }
                    }, 3500);
                }
            }
        }
    }, 2500);

    // ==========================================
    // 7. GUI HUD
    // ==========================================
    function updateUIStatus(online) {
        const el = document.getElementById('pelican-status-text');
        if (el) el.innerText = online ? 'Online' : 'Offline';
    }

    function updateMasterBotUI() {
        const btn = document.getElementById('p-btn-toggle-bot');
        if (!btn) return;
        if (window.__isBotRunning) {
            btn.innerHTML = '⏹️ STOP BOT (หยุดทำงาน)';
            btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            btn.style.boxShadow = '0 0 14px rgba(239, 68, 68, 0.55)';
            btn.style.border = '1px solid #f87171';
            btn.style.color = '#fff';
        } else {
            btn.innerHTML = '▶️ START BOT (เริ่มทำงาน)';
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btn.style.boxShadow = '0 0 14px rgba(16, 185, 129, 0.4)';
            btn.style.border = '1px solid #34d399';
            btn.style.color = '#fff';
        }
    }

    function updateUIPos(x, y, tx, ty) {
        const el = document.getElementById('p-cur-pos');
        if (el) el.innerText = `${tx},${ty} (${x},${y})`;

        const mapEl = document.getElementById('p-cur-map-display');
        const curMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
        if (mapEl) {
            mapEl.innerText = curMap || 'กำลังค้นหา...';
            mapEl.style.color = (typeof isCharacterInCity === 'function' && isCharacterInCity()) ? '#22c55e' : '#38bdf8';
        }

        const stateEl = document.getElementById('p-char-state');
        if (stateEl) {
            if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                stateEl.innerText = '💀 เสียชีวิต';
                stateEl.style.color = '#ef4444';
            } else if (!window.__isBotRunning) {
                stateEl.innerText = '⏸️ หยุดทำงาน';
                stateEl.style.color = '#94a3b8';
            } else if (window.__isShopping) {
                stateEl.innerText = '🛒 กำลังซื้อขาย';
                stateEl.style.color = '#f59e0b';
            } else if (window.__isNavigating) {
                stateEl.innerText = '🚶 เดินทาง';
                stateEl.style.color = '#c084fc';
            } else if (typeof isCharacterInCity === 'function' && isCharacterInCity()) {
                stateEl.innerText = '🏛️ ในเมือง';
                stateEl.style.color = '#22c55e';
            } else {
                stateEl.innerText = '⚔️ ในสนามฟาร์ม';
                stateEl.style.color = '#38bdf8';
            }
        }
    }

    function updateUIMonster(x, y) {
        const el = document.getElementById('p-mon-pos');
        if (el) {
            const curX = window.__currentPos.x;
            const curY = window.__currentPos.y;
            const dist = curX && curY ? Math.round(Math.hypot(x - curX, y - curY)) : '?';
            el.innerText = `(${x}, ${y}) [${dist}px]`;
            el.style.color = '#00ffcc';
        }
    }

    // ==========================================
    // 8. MARKET FINDER & STAT SNIPER SUITE
    // ==========================================
    window.__latestMarketResults = null;
    window.__marketAllListings = [];
    window.__marketFilteredResults = [];
    window.__alertedMarketIds = new Set();
    window.__isMarketScanning = false;

    const STAT_NAMES_MAP = {
        'DEX': { th: 'DEX (ความแม่นยำ/ระยะไกล)', short: 'DEX' },
        'STR': { th: 'STR (พลังโจมตีประชิด/แบกน้ำหนัก)', short: 'STR' },
        'AGI': { th: 'AGI (ความเร็วโจมตี/หลบหลีก)', short: 'AGI' },
        'VIT': { th: 'VIT (พลังป้องกัน/เลือดสูงสุด)', short: 'VIT' },
        'INT': { th: 'INT (พลังเวท/มานาสูงสุด)', short: 'INT' },
        'LUK': { th: 'LUK (คริติคอล/โชคลาภ)', short: 'LUK' },
        'ATK': { th: 'ATK (พลังโจมตีกายภาพ)', short: 'ATK' },
        'ATK_PERCENT': { th: 'ATK% (พลังโจมตีกายภาพ %)', short: 'ATK%' },
        'ATK_FLAT': { th: 'ATK (พลังโจมตีกายภาพ)', short: 'ATK' },
        'MATK': { th: 'MATK (พลังโจมตีเวท)', short: 'MATK' },
        'MATK_PERCENT': { th: 'MATK% (พลังโจมตีเวท %)', short: 'MATK%' },
        'MATK_FLAT': { th: 'MATK (พลังโจมตีเวท)', short: 'MATK' },
        'DEF': { th: 'DEF (พลังป้องกันกายภาพ)', short: 'DEF' },
        'MDEF': { th: 'MDEF (พลังป้องกันเวท)', short: 'MDEF' },
        'MELEE_DEFENSE': { th: 'พลังป้องกันประชิด', short: 'DEF' },
        'MAGIC_DEFENSE': { th: 'พลังป้องกันเวท', short: 'MDEF' },
        'HIT': { th: 'HIT (ความแม่นยำ)', short: 'HIT' },
        'FLEE': { th: 'FLEE (การหลบหลีก)', short: 'FLEE' },
        'CRIT': { th: 'CRIT (อัตราคริติคอล)', short: 'CRIT' },
        'CRIT_DAMAGE': { th: 'CRIT DMG% (ความแรงคริ)', short: 'CRIT_DMG%' },
        'MELEE_ATTACK': { th: 'พลังโจมตีประชิด', short: 'MELEE_ATK' },
        'RANGE_ATTACK': { th: 'พลังโจมตีระยะไกล', short: 'RANGE_ATK' },
        'MAGIC_ATTACK': { th: 'พลังโจมตีเวท', short: 'MAGIC_ATK' },
        'PHYSICAL_ATTACK': { th: 'พลังโจมตีกายภาพ', short: 'ATK' },
        'MELEE_DAMAGE_PERCENT': { th: 'ความแรงกายภาพประชิด%', short: 'MELEE_DMG%' },
        'RANGED_DAMAGE_PERCENT': { th: 'ความแรงระยะไกล%', short: 'RANGED_DMG%' },
        'MAGIC_DAMAGE_PERCENT': { th: 'ความแรงเวท%', short: 'MAGIC_DMG%' },
        'DAMAGE_REDUCTION': { th: 'ลดดาเมจที่ได้รับ%', short: 'DMG_RED%' },
        'BLOCK_CHANCE': { th: 'โอกาสบล็อก%', short: 'BLOCK%' },
        'HEAL_POWER': { th: 'พลังการฮีล%', short: 'HEAL%' },
        'MAXHP': { th: 'Max HP (เลือดสูงสุด)', short: 'MAX_HP' },
        'MAXHP_PERCENT': { th: 'Max HP% (เลือดสูงสุด %)', short: 'MAX_HP%' },
        'MAXSP': { th: 'Max SP (มานาสูงสุด)', short: 'MAX_SP' },
        'MAXSP_PERCENT': { th: 'Max SP% (มานาสูงสุด %)', short: 'MAX_SP%' },
        'HP_REGEN': { th: 'ฟื้นฟูเลือด HP', short: 'HP_REGEN' },
        'SP_REGEN': { th: 'ฟื้นฟูมานา SP', short: 'SP_REGEN' },
        'ATTACK_SPEED': { th: 'ความเร็วโจมตี ASPD', short: 'ASPD' },
        'ASPD': { th: 'ความเร็วโจมตี ASPD', short: 'ASPD' },
        'ASPD_PERCENT': { th: 'ความเร็วโจมตี ASPD%', short: 'ASPD%' },
        'MOVE_SPEED': { th: 'ความเร็วเคลื่อนที่', short: 'SPEED' },
        'CAST_TIME_REDUCTION': { th: 'ลดระยะเวลาร่ายเวท%', short: 'CAST_RED%' }
    };

    window.matchesMarketFilter = function(listing, cfg) {
        if (!listing || !listing.item) return false;
        cfg = cfg || window.__marketFilterConfig || {};
        const it = listing.item;

        // 1. Max Price
        if (cfg.maxPrice && cfg.maxPrice > 0) {
            const price = Number(listing.price) || 0;
            if (price > cfg.maxPrice) return false;
        }

        // 2. Min Refine
        if (cfg.minRefine && cfg.minRefine > 0) {
            const ref = Number(it.refine) || 0;
            if (ref < cfg.minRefine) return false;
        }

        // 3. Name Query
        if (cfg.q && cfg.q.trim()) {
            const qLower = cfg.q.trim().toLowerCase();
            const nameLower = (it.name || '').toLowerCase();
            if (!nameLower.includes(qLower)) return false;
        }

        // 4. Category
        if (cfg.category && cfg.category !== '') {
            const cat = cfg.category;
            const equipType = it.equipType || '';
            const type = it.type || '';
            if (cat === 'Weapon' && equipType !== 'Weapon') return false;
            if (cat === 'Armor' && !['Armor', 'Shield', 'Cape', 'Garment', 'Boot', 'Shoes', 'Helmet', 'Headgear'].includes(equipType)) return false;
            if (cat === 'Accessory' && !['Accessory', 'Gem'].includes(equipType)) return false;
            if (cat === 'Card' && type !== 'Card') return false;
            if (cat === 'Ammo' && equipType !== 'Ammo') return false;
        }

        // 5. Kind
        if (cfg.kind && cfg.kind !== '') {
            const kind = cfg.kind.toLowerCase();
            const weapType = (it.weaponType || '').toLowerCase();
            const equipType = (it.equipType || '').toLowerCase();
            if (!weapType.includes(kind) && !equipType.includes(kind)) return false;
        }

        // 6. Deep Stat Filters
        const checkStat = (targetType, minVal) => {
            if (!targetType || targetType === 'none') return true;
            targetType = String(targetType).toUpperCase();
            minVal = Number(minVal) || 1;

            const matchAffix = (aff) => {
                if (!aff) return false;
                const affType = String(aff.type).toUpperCase();
                const affVal = Number(aff.value) || 0;
                if (affVal < minVal) return false;

                const isPercentMode = aff.mode === 'increasedPercent' || String(aff.type).includes('PERCENT');

                if (targetType === 'ATK_PERCENT') {
                    return (affType === 'ATK' && isPercentMode) || affType === 'ATK_PERCENT';
                }
                if (targetType === 'ATK_FLAT') {
                    return affType === 'ATK' && !isPercentMode;
                }
                if (targetType === 'MATK_PERCENT') {
                    return (affType === 'MATK' && isPercentMode) || affType === 'MATK_PERCENT';
                }
                if (targetType === 'MATK_FLAT') {
                    return affType === 'MATK' && !isPercentMode;
                }
                if (targetType === 'RANGED_DAMAGE_PERCENT' || targetType === 'RANGE_DMG%') {
                    return affType === 'RANGED_DAMAGE_PERCENT' || (affType === 'RANGE_ATTACK' && isPercentMode);
                }
                if (targetType === 'RANGE_ATTACK' || targetType === 'RANGE_ATK') {
                    return affType === 'RANGE_ATTACK' && !isPercentMode;
                }
                if (targetType === 'MELEE_DAMAGE_PERCENT' || targetType === 'MELEE_DMG%') {
                    return affType === 'MELEE_DAMAGE_PERCENT' || (affType === 'MELEE_ATTACK' && isPercentMode);
                }
                if (targetType === 'MELEE_ATTACK' || targetType === 'MELEE_ATK') {
                    return affType === 'MELEE_ATTACK' && !isPercentMode;
                }
                if (targetType === 'MAGIC_DAMAGE_PERCENT' || targetType === 'MAGIC_DMG%') {
                    return affType === 'MAGIC_DAMAGE_PERCENT' || (affType === 'MAGIC_ATTACK' && isPercentMode);
                }
                if (targetType === 'MAGIC_ATTACK' || targetType === 'MAGIC_ATK') {
                    return affType === 'MAGIC_ATTACK' && !isPercentMode;
                }
                if (targetType === 'MAXHP_PERCENT') {
                    return (affType === 'MAXHP' || affType === 'MAX_HP' || affType === 'HP') && isPercentMode;
                }
                if (targetType === 'MAXHP' || targetType === 'MAX_HP') {
                    return (affType === 'MAXHP' || affType === 'MAX_HP' || affType === 'HP') && !isPercentMode;
                }
                if (targetType === 'MAXSP_PERCENT') {
                    return (affType === 'MAXSP' || affType === 'MAX_SP' || affType === 'SP') && isPercentMode;
                }
                if (targetType === 'MAXSP' || targetType === 'MAX_SP') {
                    return (affType === 'MAXSP' || affType === 'MAX_SP' || affType === 'SP') && !isPercentMode;
                }
                if (targetType === 'ASPD_PERCENT') {
                    return (affType === 'ASPD' || affType === 'ATTACK_SPEED') && isPercentMode;
                }
                if (targetType === 'ASPD' || targetType === 'ATTACK_SPEED') {
                    return (affType === 'ASPD' || affType === 'ATTACK_SPEED') && !isPercentMode;
                }
                if (targetType === 'CRIT_DAMAGE') {
                    return affType === 'CRIT_DAMAGE' || affType === 'CRIT_DMG';
                }
                if (targetType === 'CRIT') {
                    return affType === 'CRIT' && affType !== 'CRIT_DAMAGE';
                }
                if (targetType === 'DAMAGE_REDUCTION') {
                    return affType === 'DAMAGE_REDUCTION' || affType === 'DMG_RED';
                }
                if (targetType === 'BLOCK_CHANCE') {
                    return affType === 'BLOCK_CHANCE' || affType === 'BLOCK';
                }
                if (targetType === 'HEAL_POWER') {
                    return affType === 'HEAL_POWER' || affType === 'HEAL';
                }
                if (targetType === 'CAST_TIME_REDUCTION') {
                    return affType === 'CAST_TIME_REDUCTION' || affType === 'CAST_RED';
                }
                if (targetType === 'MOVE_SPEED') {
                    return affType === 'MOVE_SPEED' || affType === 'SPEED';
                }

                if (targetType === 'ATK') {
                    return affType === 'ATK';
                }
                if (targetType === 'MATK') {
                    return affType === 'MATK';
                }
                return affType === targetType;
            };

            // กรองเฉพาะออฟชั่นสุ่ม (Random Options / Affixes) เท่านั้น ไม่นำสเตตัสพื้นฐาน (Base Attributes) มาคิด
            if (Array.isArray(it.affixes)) {
                for (const aff of it.affixes) {
                    if (matchAffix(aff)) return true;
                }
            }
            return false;
        };

        const hasStat1 = cfg.statType1 && cfg.statType1 !== 'none';
        const hasStat2 = cfg.statType2 && cfg.statType2 !== 'none';

        if (hasStat1 && hasStat2) {
            const m1 = checkStat(cfg.statType1, cfg.statMinVal1);
            const m2 = checkStat(cfg.statType2, cfg.statMinVal2);
            if (cfg.statMatchMode === 'OR') {
                if (!m1 && !m2) return false;
            } else {
                if (!m1 || !m2) return false;
            }
        } else if (hasStat1) {
            if (!checkStat(cfg.statType1, cfg.statMinVal1)) return false;
        } else if (hasStat2) {
            if (!checkStat(cfg.statType2, cfg.statMinVal2)) return false;
        }

        return true;
    };

    window.applyMarketFilters = function() {
        const pool = window.__marketAllListings || [];
        const cfg = window.__marketFilterConfig || {};
        const matched = [];

        for (const item of pool) {
            if (window.matchesMarketFilter(item, cfg)) {
                matched.push(item);
            }
        }

        matched.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        window.__marketFilteredResults = matched;

        if (typeof window.renderMarketHudTab === 'function') {
            window.renderMarketHudTab();
        }

        return matched;
    };

    window.getGameRoom = function() {
        if (window.__gameRoom && window.__gameRoom.connection?.isOpen) return window.__gameRoom;
        let found = null;
        const visited = new Set();
        function search(obj, depth = 0) {
            if (!obj || depth > 25 || visited.has(obj) || found) return;
            visited.add(obj);
            if (obj.roomId && obj.sessionId && typeof obj.send === 'function') {
                found = obj;
                return;
            }
            if (obj.memoizedState) {
                let s = obj.memoizedState;
                while (s) {
                    if (s.memoizedState?.current?.roomId && typeof s.memoizedState.current.send === 'function') {
                        found = s.memoizedState.current;
                        return;
                    }
                    search(s.memoizedState, depth + 1);
                    s = s.next;
                }
            }
            if (obj.child) search(obj.child, depth + 1);
            if (obj.sibling) search(obj.sibling, depth + 1);
            if (obj.return) search(obj.return, depth + 1);
        }
        const all = document.querySelectorAll('.ui-root, .hud-status, .minimap, .chat, .hotbars, .market-window');
        for (const el of all) {
            const k = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (k) {
                search(el[k]);
                if (found) break;
            }
        }
        if (found) window.__gameRoom = found;
        return found;
    };

    window.updateMarketDetailOverlay = function(listing) {
        const detail = document.querySelector('.mk-detail');
        if (!detail) return;

        // If listing is not provided, try to find from selected row or fallback
        if (!listing) {
            const win = document.querySelector('.market-window');
            const rows = win ? Array.from(win.querySelectorAll('.mk-row')) : [];
            const selIdx = rows.findIndex(r => r.classList.contains('selected'));
            const latestListings = window.__latestMarketResults?.listings || [];
            listing = (selIdx >= 0 && latestListings[selIdx]) ? latestListings[selIdx] : (window.__currentSelectedMarketListing || latestListings[0]);
        }
        if (!listing || !listing.item) return;

        const facts = detail.querySelector('.mk-detail-facts');
        if (!facts) return;

        let box = detail.querySelector('.pelican-mk-affix-box');
        if (!box) {
            box = document.createElement('div');
            box.className = 'pelican-mk-affix-box';
            box.style.cssText = 'margin: 6px 0; padding: 7px 9px; background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 6px; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);';
            facts.insertAdjacentElement('beforebegin', box);
        }

        const it = listing.item;
        let affHtml = '';
        if (Array.isArray(it.affixes) && it.affixes.length > 0) {
            affHtml = it.affixes.map(a => {
                const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[a.type]) ? STAT_NAMES_MAP[a.type] : { short: a.type };
                const isSpec = a.category === 'special' || String(a.type).includes('CRIT') || a.mode === 'increasedPercent' || String(a.type).includes('PERCENT');
                const color = isSpec ? '#fef08a' : '#86efac';
                const bg = isSpec ? 'rgba(234, 179, 8, 0.25)' : 'rgba(34, 197, 94, 0.2)';
                const border = isSpec ? '#eab308' : '#22c55e';
                const val = (a.mode === 'increasedPercent' || String(a.type).includes('PERCENT')) ? `+${a.value}%` : `+${a.value}`;
                return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; color: ${color}; padding: 1px 6px; border-radius: 4px; font-size: 10px; margin: 2px 3px 2px 0; font-weight: bold;">⭐ ${sInfo.short || a.type} ${val}</span>`;
            }).join('');
        }

        let attrHtml = '';
        if (Array.isArray(it.attributes) && it.attributes.length > 0) {
            attrHtml = it.attributes.map(a => {
                const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[a.type]) ? STAT_NAMES_MAP[a.type] : { short: a.type };
                return `<span style="display: inline-block; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-size: 10px; margin: 2px 3px 2px 0;">⚔️ ${sInfo.short || a.type}: +${a.value}</span>`;
            }).join('');
        }

        let refineHtml = '';
        if (it.refine) {
            refineHtml = `<span style="background: rgba(168, 85, 247, 0.25); border: 1px solid #c084fc; color: #e9d5ff; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; margin-right: 4px;">ตีบวก +${it.refine}</span>`;
        }

        const qty = listing.qty || listing.quantity || listing.amount || it.qty || it.amount || 1;
        let qtyHtml = '';
        if (qty > 1) {
            qtyHtml = `<span style="background: rgba(234, 179, 8, 0.25); border: 1px solid #eab308; color: #fde047; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; margin-right: 4px;">จำนวน ×${qty.toLocaleString()}</span>`;
        }

        const isMatch = (typeof window.matchesMarketFilter === 'function') ? window.matchesMarketFilter(listing, window.__marketFilterConfig) : false;
        const matchBadge = isMatch ? `<span style="background: rgba(234, 179, 8, 0.25); border: 1px solid #eab308; color: #fde047; padding: 1px 6px; border-radius: 4px; font-size: 9.5px; font-weight: bold;">🎯 ตรงสเปคที่ค้นหา!</span>` : '';

        box.innerHTML = `
            <div style="font-weight: bold; color: #f59e0b; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>💎 คุณสมบัติไอเทม (Stats & Random Options)</span>
                <div>${refineHtml}${qtyHtml}${matchBadge}</div>
            </div>
            <div>${attrHtml || '<span style="color: #64748b; font-size: 9.5px;">ไม่มีสเตตัสพื้นฐาน</span>'}</div>
            <div style="margin-top: 3px;">${affHtml || '<span style="color: #64748b; font-size: 9.5px;">ไม่มี Option สุ่ม</span>'}</div>
        `;
    };

    // Attach click listener on market window rows once with event delegation (capture phase)
    if (!window.__marketRowClickListenerAttached) {
        window.__marketRowClickListenerAttached = true;
        document.addEventListener('click', (e) => {
            const row = e.target.closest('.mk-row');
            if (!row) return;
            const win = document.querySelector('.market-window');
            if (!win || !win.contains(row)) return;

            const allRows = Array.from(win.querySelectorAll('.mk-row'));
            const clickedIdx = allRows.indexOf(row);
            const latestListings = window.__latestMarketResults?.listings || [];
            if (clickedIdx >= 0 && latestListings[clickedIdx]) {
                const clickedListing = latestListings[clickedIdx];
                window.__currentSelectedMarketListing = clickedListing;
                window.updateMarketDetailOverlay(clickedListing);
                setTimeout(() => window.updateMarketDetailOverlay(clickedListing), 30);
                setTimeout(() => window.updateMarketDetailOverlay(clickedListing), 100);
            }
        }, true);
    }

    window.injectMarketOverlay = function() {
        const win = document.querySelector('.market-window');
        if (!win) return;

        // 0. Inject Deep Scan Button into native game .market-window filters form
        const mkForm = win.querySelector('form.mk-filters, .mk-filters');
        if (mkForm && !mkForm.querySelector('.pelican-mk-deep-scan-btn')) {
            const scanBtn = document.createElement('button');
            scanBtn.type = 'button';
            scanBtn.className = 'pelican-mk-deep-scan-btn';
            scanBtn.title = 'สแกนทุกหน้าในตลาดเพื่อดึง Option เข้าสู่ Pelican Inspector';
            scanBtn.style.cssText = 'margin-left: 6px; background: linear-gradient(135deg, #7c3aed, #9333ea); color: #fff; border: 1px solid #c084fc; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; height: 26px; vertical-align: middle; box-shadow: 0 2px 6px rgba(147, 51, 234, 0.4);';
            scanBtn.innerText = window.__isMarketScanning ? '⚡ กำลังสแกน...' : '⚡ สแกนทุกหน้า';
            scanBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.__isMarketScanning) {
                    window.stopMarketScan();
                } else {
                    window.startMarketMultiPageScan('all');
                }
            };
            const submitBtn = mkForm.querySelector('button[type="submit"], button.primary, button');
            if (submitBtn && submitBtn.nextSibling) {
                mkForm.insertBefore(scanBtn, submitBtn.nextSibling);
            } else {
                mkForm.appendChild(scanBtn);
            }
        }

        const latestListings = window.__latestMarketResults?.listings || [];
        const rows = Array.from(win.querySelectorAll('.mk-row'));
        const cfg = window.__marketFilterConfig || {};

        rows.forEach((row, idx) => {
            const listing = latestListings[idx];
            if (!listing || !listing.item) return;
            const it = listing.item;

            let badgeContainer = row.querySelector('.pelican-row-affixes');
            if (!badgeContainer) {
                badgeContainer = document.createElement('div');
                badgeContainer.className = 'pelican-row-affixes';
                badgeContainer.style.cssText = 'display: inline-flex; gap: 3px; margin-left: 6px; flex-wrap: wrap; vertical-align: middle;';
                const nameEl = row.querySelector('.mk-name, .mk-item');
                if (nameEl) nameEl.appendChild(badgeContainer);
            }

            const affixes = it.affixes || [];
            if (affixes.length > 0) {
                badgeContainer.innerHTML = affixes.map(a => {
                    const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[a.type]) ? STAT_NAMES_MAP[a.type] : { short: a.type };
                    const isSpec = a.category === 'special' || String(a.type).includes('CRIT') || a.mode === 'increasedPercent' || String(a.type).includes('PERCENT');
                    const color = isSpec ? '#fef08a' : '#86efac';
                    const bg = isSpec ? 'rgba(234, 179, 8, 0.25)' : 'rgba(34, 197, 94, 0.2)';
                    const border = isSpec ? '#eab308' : '#22c55e';
                    const val = (a.mode === 'increasedPercent' || String(a.type).includes('PERCENT')) ? `+${a.value}%` : `+${a.value}`;
                    return `<span style="background: ${bg}; border: 1px solid ${border}; color: ${color}; padding: 0 4px; border-radius: 3px; font-size: 9.5px; font-weight: bold; line-height: 1.2;">${sInfo.short || a.type} ${val}</span>`;
                }).join('');
            } else {
                badgeContainer.innerHTML = '';
            }

            const isMatch = (typeof window.matchesMarketFilter === 'function') ? window.matchesMarketFilter(listing, cfg) : false;
            if (isMatch && (cfg.statType1 !== 'none' || cfg.statType2 !== 'none' || cfg.minRefine > 0)) {
                row.style.outline = '1.5px solid #f59e0b';
                row.style.background = 'rgba(245, 158, 11, 0.12)';
            } else {
                row.style.outline = '';
            }

            row.onclick = () => {
                window.__currentSelectedMarketListing = listing;
                setTimeout(() => window.updateMarketDetailOverlay(listing), 20);
                setTimeout(() => window.updateMarketDetailOverlay(listing), 80);
            };
        });

        // Determine currently selected listing from .selected row or state
        const selectedIdx = rows.findIndex(r => r.classList.contains('selected'));
        let targetListing = null;
        if (selectedIdx >= 0 && latestListings[selectedIdx]) {
            targetListing = latestListings[selectedIdx];
            window.__currentSelectedMarketListing = targetListing;
        } else if (window.__currentSelectedMarketListing) {
            targetListing = window.__currentSelectedMarketListing;
        } else if (latestListings.length > 0) {
            targetListing = latestListings[0];
            window.__currentSelectedMarketListing = targetListing;
        }

        if (targetListing && rows.length > 0) {
            window.updateMarketDetailOverlay(targetListing);
        }

        // 3. Inject Quick-Add Auto Sell Button into In-Game Market "ลงขาย" (Sell) tab
        const sellSubmitBtn = win.querySelector('button.primary');
        if (sellSubmitBtn && (sellSubmitBtn.innerText || '').trim() === 'ลงขาย') {
            const form = sellSubmitBtn.closest('form') || sellSubmitBtn.parentElement;
            if (form && !form.querySelector('.pelican-quick-autosell-btn')) {
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'pelican-quick-autosell-btn';
                addBtn.title = 'เพิ่มไอเทมนี้เข้าสู่ระบบ Auto Sell อัตโนมัติ (⚖️ Market Median)';
                addBtn.style.cssText = 'margin-top: 6px; width: 100%; background: linear-gradient(135deg, #7c3aed, #9333ea); color: #fff; border: 1px solid #c084fc; padding: 6px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 6px rgba(147, 51, 234, 0.3); display: flex; align-items: center; justify-content: center; gap: 6px;';
                addBtn.innerHTML = '<span>➕</span><span>เพิ่มไอเทมนี้เข้า Auto Sell (⚖️ Market Median)</span>';
                addBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const text = win.innerText || '';
                    const m = text.match(/([A-Za-z0-9\s()+-]+)\s*×\s*(\d+)/);
                    const itemName = m ? m[1].trim() : '';
                    if (itemName && typeof window.addAutoMarketSellRule === 'function') {
                        window.addAutoMarketSellRule(itemName, 20);
                        if (typeof window.showDataViewerModal === 'function') {
                            window.showDataViewerModal('market');
                        }
                    } else if (typeof window.addAutoMarketSellRule === 'function') {
                        window.addAutoMarketSellRule('', 20);
                    }
                };
                sellSubmitBtn.insertAdjacentElement('afterend', addBtn);
            }
        }
    };

    window.handleIncomingMarketResults = function(dec) {
        if (!dec || !Array.isArray(dec.listings)) return;
        window.__latestMarketResults = dec;

        if (!window.__marketAllListings) window.__marketAllListings = [];
        const existingMap = new Map();
        for (const item of window.__marketAllListings) {
            if (item && item.listingId !== undefined) existingMap.set(item.listingId, item);
        }
        for (const incoming of dec.listings) {
            if (incoming && incoming.listingId !== undefined) {
                existingMap.set(incoming.listingId, incoming);
            }
        }
        window.__marketAllListings = Array.from(existingMap.values()).slice(-1000);

        const matched = window.applyMarketFilters();
        const cfg = window.__marketFilterConfig || {};

        // In-Game Market Overlay Injection
        setTimeout(() => {
            if (typeof window.injectMarketOverlay === 'function') {
                window.injectMarketOverlay();
            }
        }, 80);

        if (cfg.sniperAlert || cfg.autoBuy) {
            for (const item of dec.listings) {
                if (window.matchesMarketFilter(item, cfg)) {
                    const id = item.listingId;
                    if (!window.__alertedMarketIds.has(id)) {
                        window.__alertedMarketIds.add(id);
                        const it = item.item || {};
                        const refStr = it.refine ? `+${it.refine} ` : '';
                        console.log(`%c[Pelican Sniper] 🎯 พบไอเทมเป้าหมาย! ${refStr}${it.name} | ราคา ${Number(item.price).toLocaleString()} z จาก ${item.sellerName}`, 'color: #f59e0b; font-weight: bold; font-size: 13px;');
                        if (typeof playWarningChime === 'function') playWarningChime();

                        if (cfg.autoBuy) {
                            const maxBuy = Number(cfg.maxAutoBuyPrice) || Number(cfg.maxPrice) || 0;
                            if (maxBuy <= 0 || (Number(item.price) || 0) <= maxBuy) {
                                console.log(`%c[Pelican Sniper] ⚡ สั่งซื้ออัตโนมัติทันที: ${refStr}${it.name} (${Number(item.price).toLocaleString()} z)...`, 'color: #10b981; font-weight: bold;');
                                setTimeout(() => {
                                    window.buyMarketListing(item.listingId, item.price, it.name, item.sellerName);
                                }, 150);
                            }
                        }
                    }
                }
            }
        }

        // Live Dynamic DOM update for Market Inspector modal
        const tbody = document.getElementById('p-mod-mk-tbody');
        const summaryText = document.getElementById('p-mod-mk-summary-text');
        const serverBadge = document.getElementById('p-mod-mk-server-badge');

        if (tbody && typeof window.renderMarketRowsHtml === 'function') {
            tbody.innerHTML = window.renderMarketRowsHtml(matched, cfg);
            if (summaryText) {
                const totalServer = dec.total || window.__latestMarketResults?.total || 'รอสแกน';
                summaryText.innerText = `📋 ผลลัพธ์ในตลาดที่พบ (${matched.length} รายการ จากทั้งหมด ${(window.__marketAllListings || []).length} ในแคช · Server มี ${totalServer} รายการ):`;
            }
            if (serverBadge) {
                serverBadge.innerText = `Server: ${dec.total ?? 'รอสแกน'} รายการ`;
            }
        } else {
            const modal = document.getElementById('pelican-data-modal');
            if (modal && modal.style.display !== 'none' && window.__currentModalTab === 'market') {
                window.renderModalTab('market');
            }
        }

        if (!window.__isMarketScanning) {
            const searchBtn = document.getElementById('p-mod-btn-search');
            if (searchBtn) searchBtn.innerText = '🔍 ค้นหา';
        }
    };

    window.dumpMarketData = function() {
        return {
            timestamp: new Date().toISOString(),
            totalServerListings: window.__latestMarketResults?.total ?? null,
            cachedListingsCount: (window.__marketAllListings || []).length,
            filteredCount: (window.__marketFilteredResults || []).length,
            filters: window.__marketFilterConfig,
            results: window.__marketFilteredResults || []
        };
    };

    window.openMarketWindow = function(callback) {
        let win = document.querySelector('.market-window');
        if (win && win.offsetWidth > 0) {
            if (typeof callback === 'function') callback(win);
            return;
        }
        const marketBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('ตลาดกลาง'));
        if (marketBtn) {
            marketBtn.click();
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                win = document.querySelector('.market-window');
                if ((win && win.offsetWidth > 0) || attempts > 15) {
                    clearInterval(timer);
                    if (typeof callback === 'function') callback(win);
                }
            }, 100);
        } else {
            console.warn('[Pelican Market] ⚠️ ไม่พบปุ่มตลาดกลางในหน้าจอ');
            if (typeof callback === 'function') callback(null);
        }
    };

    window.stopMarketScan = function() {
        if (window.__isMarketScanning) {
            window.__isMarketScanning = false;
            if (window.__marketScanTimer) {
                clearTimeout(window.__marketScanTimer);
                window.__marketScanTimer = null;
            }
            console.log('%c[Pelican Market] ⏹️ หยุดการสแกนตลาดเรียบร้อย', 'color: #f59e0b; font-weight: bold;');
            if (typeof window.updateMarketScanUIState === 'function') {
                window.updateMarketScanUIState(false);
            }
        }
    };

    window.updateMarketScanUIState = function(isScanning, curPage = 0, totalPages = 0, foundCount = 0) {
        const scanBtn = document.getElementById('p-mod-btn-scan');
        const inGameScanBtn = document.querySelector('.pelican-mk-deep-scan-btn');
        const hudScanBtn = document.getElementById('p-btn-mk-scan');

        const label = isScanning 
            ? `⚡ สแกน ${curPage}/${totalPages}... (${foundCount} พบ) [⏹️ หยุด]` 
            : `⚡ เริ่มสแกน`;

        if (scanBtn) {
            scanBtn.innerText = label;
            scanBtn.style.background = isScanning ? '#dc2626' : '#9333ea';
        }
        if (inGameScanBtn) {
            inGameScanBtn.innerText = isScanning ? `⚡ สแกน ${curPage}/${totalPages}... [หยุด]` : `⚡ สแกนทุกหน้า`;
            inGameScanBtn.style.background = isScanning ? '#dc2626' : 'linear-gradient(135deg, #7c3aed, #9333ea)';
        }
        if (hudScanBtn) {
            hudScanBtn.innerText = isScanning ? `⚡ ${curPage}/${totalPages} (${foundCount}) ⏹️` : `⚡ สแกนทุกหน้า`;
            hudScanBtn.style.background = isScanning ? '#dc2626' : '#9333ea';
        }
    };

    window.startMarketMultiPageScan = function(targetPages = 'all') {
        if (window.__isMarketScanning) {
            window.stopMarketScan();
            return;
        }

        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        const q = (window.__marketFilterConfig?.q || '').trim();
        const cfg = window.__marketFilterConfig || {};

        const serverTotal = window.__latestMarketResults?.total || 0;
        let maxPages = 20; // safe cap
        if (typeof targetPages === 'number' && targetPages > 0) {
            maxPages = targetPages;
        } else if (serverTotal > 0) {
            maxPages = Math.min(25, Math.ceil(serverTotal / 20));
        }

        window.__isMarketScanning = true;
        console.log(`%c[Pelican Market] ⚡ เริ่มต้นสแกนตลาดอัตโนมัติเป้าหมาย ${maxPages} หน้าต่อเนื่อง...`, 'color: #a855f7; font-weight: bold;');

        let curPage = 0;
        if (typeof window.updateMarketScanUIState === 'function') {
            window.updateMarketScanUIState(true, 1, maxPages, (window.__marketFilteredResults || []).length);
        }

        const scanNext = () => {
            if (!window.__isMarketScanning) return;

            const curServerTotal = window.__latestMarketResults?.total || 0;
            if (targetPages === 'all' && curServerTotal > 0) {
                maxPages = Math.min(25, Math.ceil(curServerTotal / 20));
            }

            if (curPage >= maxPages) {
                window.__isMarketScanning = false;
                const found = (window.__marketFilteredResults || []).length;
                console.log(`%c[Pelican Market] ✅ สแกนครบ ${maxPages} หน้าเรียบร้อย! พบตรงสเปค: ${found} รายการ (ในแคช ${(window.__marketAllListings || []).length})`, 'color: #10b981; font-weight: bold;');
                if (typeof window.updateMarketScanUIState === 'function') {
                    window.updateMarketScanUIState(false);
                }
                if (typeof window.renderMarketHudTab === 'function') window.renderMarketHudTab();
                if (found > 0 && typeof playWarningChime === 'function') playWarningChime();
                return;
            }

            curPage++;
            const foundCount = (window.__marketFilteredResults || []).length;
            if (typeof window.updateMarketScanUIState === 'function') {
                window.updateMarketScanUIState(true, curPage, maxPages, foundCount);
            }

            if (room && room.connection?.isOpen) {
                room.send('market', {
                    op: 'search',
                    filters: {
                        q: q || undefined,
                        category: cfg.category || undefined,
                        kind: cfg.kind || undefined,
                        minRefine: Number(cfg.minRefine) || undefined,
                        maxPrice: Number(cfg.maxPrice) || undefined,
                        sort: 'price_asc',
                        page: curPage - 1
                    }
                });
            } else {
                const win = document.querySelector('.market-window');
                const nextBtn = win ? Array.from(win.querySelectorAll('button')).find(b => (b.innerText || '').includes('ถัดไป')) : null;
                if (nextBtn && !nextBtn.disabled) nextBtn.click();
            }

            window.__marketScanTimer = setTimeout(scanNext, 260);
        };

        scanNext();
    };

    window.executeMarketSearch = function(filters) {
        window.syncMarketFiltersFromUI();
        filters = Object.assign({}, window.__marketFilterConfig, filters || {});
        const queryText = (filters.q || '').trim();
        const oldQuery = window.__marketFilterConfig.q;

        // If searching a new item name, clear previous cached listings
        if (oldQuery && oldQuery.toLowerCase() !== queryText.toLowerCase()) {
            window.__marketAllListings = [];
            window.__marketFilteredResults = [];
        }

        window.__marketFilterConfig.q = queryText;
        saveMarketFilterConfig();

        // 1. กรองข้อมูลในแคชทันทีและอัปเดตสถานะปุ่ม
        window.applyMarketFilters();
        const searchBtn = document.getElementById('p-mod-btn-search');
        if (searchBtn) searchBtn.innerText = '🔍 กำลังค้นหา...';

        // 2. ส่งคำสั่งหน้าแรกตรงสู่เซิร์ฟเวอร์
        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        if (room && room.connection?.isOpen) {
            try {
                room.send('market', {
                    op: 'search',
                    filters: {
                        q: queryText || undefined,
                        category: filters.category || undefined,
                        kind: filters.kind || undefined,
                        minRefine: Number(filters.minRefine) || undefined,
                        maxPrice: Number(filters.maxPrice) || undefined,
                        sort: 'price_asc',
                        page: Number(filters.page) || 0
                    }
                });
                console.log(`%c[Pelican Market] 🚀 ส่งคำสั่งค้นหาตลาดตรงสู่เซิร์ฟเวอร์: "${queryText || 'ทั้งหมด'}"`, 'color: #38bdf8; font-weight: bold;');
            } catch(e) {
                console.warn('[Pelican Market] room.send search failed:', e);
            }
        }

        // 3. Synchronize In-Game Market Window UI
        const inGameWin = document.querySelector('.market-window');
        if (inGameWin && inGameWin.offsetWidth > 0) {
            const searchInput = inGameWin.querySelector('input[type="text"], input[type="search"]');
            if (searchInput) {
                const k = Object.keys(searchInput).find(k => k.startsWith('__reactProps'));
                if (searchInput[k]?.onChange) {
                    searchInput[k].onChange({ target: { value: queryText.trim() } });
                } else {
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    if (nativeSetter) nativeSetter.call(searchInput, queryText.trim());
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            const selects = inGameWin.querySelectorAll('select');
            if (selects.length >= 1 && filters.category !== undefined) {
                selects[0].value = filters.category || '';
                selects[0].dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (selects.length >= 2 && filters.kind !== undefined) {
                selects[1].value = filters.kind || '';
                selects[1].dispatchEvent(new Event('change', { bubbles: true }));
            }

            setTimeout(() => {
                const form = inGameWin.querySelector('form.mk-filters');
                if (form) {
                    const fk = Object.keys(form).find(k => k.startsWith('__reactProps'));
                    if (form[fk]?.onSubmit) {
                        form[fk].onSubmit({ preventDefault: () => {} });
                    } else {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                }
            }, 120);
        }

        // 4. Auto Deep Scan: ถ้ามี Option ระบุไว้ หรือเปิด Auto Deep Scan
        const hasOptionFilter = (filters.statType1 && filters.statType1 !== 'none') || (filters.statType2 && filters.statType2 !== 'none');
        const autoScan = filters.autoDeepScan !== false;
        if (hasOptionFilter && autoScan) {
            setTimeout(() => {
                const depthVal = window.__marketFilterConfig.scanDepth || 'all';
                const targetPages = (depthVal === 'all') ? 'all' : (parseInt(depthVal) || 5);
                window.startMarketMultiPageScan(targetPages);
            }, 320);
        }
    };

    window.claimMarketDeliveries = function(callback) {
        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        if (room && room.connection?.isOpen) {
            try {
                room.send('market', { op: 'collect_all' });
                console.log('%c[Pelican Market] 🎁 ส่งคำสั่งรับของทั้งหมดจากตลาดกลาง (collect_all) สู่เซิร์ฟเวอร์!', 'color: #10b981; font-weight: bold;');
            } catch(e) {
                console.warn('[Pelican Market] room.send collect_all error:', e);
            }
        }

        const win = document.querySelector('.market-window');
        if (win) {
            const tabs = Array.from(win.querySelectorAll('nav.mk-tabs button, .mk-tabs button'));
            const collectTab = tabs.find(t => (t.innerText || '').includes('รับของ'));
            if (collectTab) {
                collectTab.click();
                setTimeout(() => {
                    const collectBtns = Array.from(win.querySelectorAll('.mk-body button, .mk-list button, button.collect-all, button.primary')).filter(b => {
                        const txt = (b.innerText || '').trim();
                        return txt === 'รับ' || txt === 'รับทั้งหมด' || txt.includes('รับ');
                    });
                    for (const btn of collectBtns) {
                        try { btn.click(); } catch(e) {}
                    }
                    if (typeof callback === 'function') callback();
                }, 250);
            } else if (typeof callback === 'function') {
                callback();
            }
        } else if (typeof callback === 'function') {
            callback();
        }

        setTimeout(() => {
            if (typeof window.refreshInventoryAndWeight === 'function') {
                window.refreshInventoryAndWeight();
            }
        }, 500);
    };

    window.buyMarketListing = function(listingId, price, itemName, sellerName, btnEl) {
        console.log(`%c[Pelican Market] 🛒 ดำเนินการสั่งซื้อ: ${itemName} (${Number(price).toLocaleString()} z) จาก ${sellerName}...`, 'color: #38bdf8; font-weight: bold;');

        // อัปเดตสถานะปุ่มใน UI ทันที
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.style.opacity = '0.7';
            btnEl.innerText = '⏳ กำลังซื้อ...';
        }

        // 1. ส่งแพ็กเก็ตซื้อตรงผ่านระบบ Colyseus Network โดยอ้างอิง listingId เท่านั้น
        // (ปลอดภัย 100%: ไม่เปิดหรือแตะหน้าต่างตลาดในเกมเด็ดขาด เพื่อป้องกันไม่ให้เผลอไปกดซื้อไอเทมแถวแรกของตลาดอย่าง Arrow)
        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        if (room && room.connection?.isOpen && listingId) {
            try {
                room.send('market', {
                    op: 'buy',
                    listingId: Number(listingId),
                    price: Number(price)
                });
                console.log(`%c[Pelican Market] ⚡ ส่งแพ็กเก็ตซื้อตรงสำเร็จ: { op: 'buy', listingId: ${listingId}, price: ${price} } `, 'color: #10b981; font-weight: bold;');
            } catch(e) {
                console.warn('[Pelican Market] direct buy send failed:', e);
            }
        } else {
            console.error('[Pelican Market] ❌ ไม่พบการเชื่อมต่อเกม หรือ listingId ไม่ถูกต้อง');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.style.opacity = '1';
                btnEl.innerText = '🛒 ซื้อ';
            }
            return;
        }

        // 2. Safety Dialog Guard: ตรวจจับกล่องยืนยันในเกม
        // หากมีกล่องถามยืนยันเปิดอยู่ ให้ตรวจว่าชื่อไอเทมตรงกันหรือไม่
        // ถ้าตรงกันให้กดยืนยัน แต่ถ้าไม่ตรง (เช่น เด้งเป็น Arrow) ให้กดยกเลิกหรือปิดทิ้งทันที!
        const safeguardConfirmDialog = () => {
            const confirmDialog = document.querySelector('.qty-dialog.confirm-dialog, [role="alertdialog"]');
            if (confirmDialog) {
                const titleText = (confirmDialog.querySelector('.qty-title, h3, h4, p')?.innerText || confirmDialog.innerText || '');
                if (itemName && titleText.includes(itemName)) {
                    const confirmBtn = Array.from(confirmDialog.querySelectorAll('button')).find(b => {
                        const t = (b.innerText || '').trim();
                        return t === 'ซื้อ' || t === 'ยืนยัน' || t === 'ตกลง';
                    });
                    if (confirmBtn) {
                        confirmBtn.click();
                        console.log('%c[Pelican Market] ✅ ยืนยันการสั่งซื้อในหน้าต่าง Dialog สำเร็จ!', 'color: #10b981;');
                    }
                } else if (titleText.length > 0 && !titleText.includes(itemName)) {
                    console.warn(`[Pelican Market Guard] ⚠️ พบ Dialog ซื้อไอเทมไม่ตรง ("${titleText.slice(0, 40)}") -> สั่งยกเลิก/ปิดทันที`);
                    const cancelBtn = Array.from(confirmDialog.querySelectorAll('button')).find(b => {
                        const t = (b.innerText || '').trim();
                        return t === 'ยกเลิก' || t === 'ปิด' || t === 'Cancel';
                    });
                    if (cancelBtn) {
                        cancelBtn.click();
                    } else {
                        confirmDialog.remove();
                    }
                }
            }
        };
        setTimeout(safeguardConfirmDialog, 80);
        setTimeout(safeguardConfirmDialog, 200);

        // 3. กดรับของเข้ากระเป๋าอัตโนมัติ (Auto-Claim Deliveries)
        setTimeout(() => {
            console.log(`%c[Pelican Market] 🎁 ดำเนินการกดรับของ (${itemName}) เข้ากระเป๋าอัตโนมัติ...`, 'color: #f59e0b; font-weight: bold;');
            if (room && room.connection?.isOpen) {
                try {
                    room.send('market', { op: 'collect_all' });
                    console.log('%c[Pelican Market] 🎁 ยิงแพ็กเก็ต collect_all สำเร็จ!', 'color: #10b981;');
                } catch(e) {}
            }

            if (typeof window.claimMarketDeliveries === 'function') {
                window.claimMarketDeliveries(() => {
                    console.log(`%c[Pelican Market] 🎉 ซื้อและรับของ ${itemName} เรียบร้อยแล้ว!`, 'color: #10b981; font-weight: bold; font-size: 13px;');
                });
            }

            // ลบ listingId นี้ออกจากแคชเพื่อไม่ให้กดซ้ำ และอัปเดต UI ทันที
            if (Array.isArray(window.__marketAllListings)) {
                window.__marketAllListings = window.__marketAllListings.filter(l => l.listingId !== listingId);
            }
            if (Array.isArray(window.__marketFilteredResults)) {
                window.__marketFilteredResults = window.__marketFilteredResults.filter(l => l.listingId !== listingId);
            }

            if (btnEl) {
                btnEl.style.background = '#10b981';
                btnEl.innerText = '✅ ซื้อแล้ว!';
                setTimeout(() => {
                    if (typeof window.renderModalContent === 'function') {
                        window.renderModalContent('market');
                    }
                }, 1200);
            }

            // รีเฟรชกระเป๋าและน้ำหนักของตัวละคร
            setTimeout(() => {
                if (typeof window.refreshInventoryAndWeight === 'function') {
                    window.refreshInventoryAndWeight();
                }
            }, 600);
        }, 450);
    };

    // ==========================================
    // AUTO MARKET SELL ENGINE (⚖️ Market Median Algorithm)
    // ==========================================
    window.getBagItems = function() {
        const rawInv = window.__latestInventory;
        const items = [];
        if (rawInv && Array.isArray(rawInv.items)) {
            rawInv.items.forEach(obj => {
                if (!obj) return;
                const id = obj.itemId ?? obj.id ?? obj.item_id ?? obj.code;
                const name = obj.name ?? obj.itemName ?? obj.title;
                if (id !== undefined || name !== undefined) {
                    items.push({
                        id: id,
                        name: (name || `Item_${id}`).trim(),
                        qty: Number(obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 1) || 1,
                        slot: obj.slot ?? obj.idx ?? '-',
                        refine: obj.refine || 0,
                        raw: obj
                    });
                }
            });
        } else if (rawInv) {
            function scanRaw(obj) {
                if (!obj) return;
                if (Array.isArray(obj)) {
                    obj.forEach(scanRaw);
                } else if (typeof obj === 'object') {
                    const id = obj.itemId ?? obj.id ?? obj.item_id ?? obj.code;
                    const name = obj.name ?? obj.itemName ?? obj.title;
                    if (id !== undefined || name !== undefined) {
                        items.push({
                            id: id,
                            name: (name || `Item_${id}`).trim(),
                            qty: Number(obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 1) || 1,
                            slot: obj.slot ?? obj.idx ?? '-',
                            refine: obj.refine || 0,
                            raw: obj
                        });
                    }
                    for (const k in obj) {
                        if (typeof obj[k] === 'object') scanRaw(obj[k]);
                    }
                }
            }
            scanRaw(rawInv);
        }
        return items;
    };

    window.fetchMyMarketActiveCount = async function() {
        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        if (!room || !room.connection?.isOpen) return window.__myMarketActiveCount || 0;

        return await new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
                if (!done) {
                    done = true;
                    if (typeof unsub === 'function') unsub();
                    resolve(window.__myMarketActiveCount || 0);
                }
            }, 1500);

            const unsub = room.onMessage('market_mine', (msg) => {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    if (typeof unsub === 'function') unsub();
                    const active = msg?.active || [];
                    window.__myMarketActiveCount = active.length;
                    const badge = document.getElementById('p-autosell-quota-badge');
                    if (badge) badge.innerText = `โควตา: ${active.length}/10 รายการ`;
                    const badgeHud = document.getElementById('p-autosell-quota-badge-hud');
                    if (badgeHud) badgeHud.innerText = `โควตา: ${active.length}/10`;
                    resolve(active.length);
                }
            });
            room.send('market', { op: 'mine' });
        });
    };

    window.fetchItemMarketMedianPrice = async function(itemId, refine = 0) {
        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        if (!room || !room.connection?.isOpen) return null;

        return await new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
                if (!done) {
                    done = true;
                    if (typeof unsub === 'function') unsub();
                    resolve(null);
                }
            }, 3000);

            const unsub = room.onMessage('market_history', (msg) => {
                if (msg && Number(msg.itemId) === Number(itemId)) {
                    if (!done) {
                        done = true;
                        clearTimeout(timer);
                        if (typeof unsub === 'function') unsub();

                        const recent = msg.recent || [];
                        if (recent.length === 0) {
                            const lastBucket = (msg.points || []).filter(p => p && p.avg > 0).pop();
                            const fallbackPrice = lastBucket ? Math.round(lastBucket.avg) : 0;
                            return resolve({
                                medianPrice: fallbackPrice,
                                cleanTradesCount: 0,
                                totalTrades: 0,
                                isFallback: true
                            });
                        }

                        // Calculate unit price for each trade
                        const unitPrices = recent.map(r => Math.round(r.price / r.qty)).filter(p => p > 0);
                        unitPrices.sort((a, b) => a - b);

                        // Robust IQR Outlier Rejection
                        let cleanPrices = unitPrices;
                        if (unitPrices.length >= 4) {
                            const q1 = unitPrices[Math.floor(unitPrices.length * 0.25)];
                            const q3 = unitPrices[Math.floor(unitPrices.length * 0.75)];
                            const iqr = q3 - q1;
                            const lowBound = Math.max(1, q1 - 1.5 * iqr);
                            const highBound = q3 + 1.5 * iqr;
                            const filtered = unitPrices.filter(p => p >= lowBound && p <= highBound);
                            if (filtered.length > 0) cleanPrices = filtered;
                        }

                        // Calculate median
                        let median = 0;
                        const mid = Math.floor(cleanPrices.length / 2);
                        if (cleanPrices.length % 2 === 0 && cleanPrices.length > 1) {
                            median = Math.round((cleanPrices[mid - 1] + cleanPrices[mid]) / 2);
                        } else {
                            median = cleanPrices[mid];
                        }

                        resolve({
                            medianPrice: median,
                            cleanTradesCount: cleanPrices.length,
                            totalTrades: recent.length,
                            minPrice: cleanPrices[0],
                            maxPrice: cleanPrices[cleanPrices.length - 1]
                        });
                    }
                }
            });

            room.send('market', { op: 'history', itemId: Number(itemId), refine: Number(refine) || 0, range: '24h' });
        });
    };

    window.getAutoSellRuleBagStatusHtml = function(itemName, minQty) {
        if (!itemName) return '<span style="color: #64748b; font-size: 10px;">รอระบุชื่อ</span>';
        const bagItems = (typeof window.getBagItems === 'function') ? window.getBagItems() : [];
        const norm = itemName.trim().toLowerCase();
        let totalCount = 0;
        bagItems.forEach(it => {
            if (it.name && it.name.trim().toLowerCase() === norm) {
                totalCount += (Number(it.qty) || 1);
            }
        });
        const threshold = Number(minQty) || 1;
        if (totalCount === 0) {
            return '<span style="color: #94a3b8; font-size: 10px;">❌ ไม่มีในตัว</span>';
        } else if (totalCount >= threshold) {
            return `<span style="color: #4ade80; font-weight: bold; font-size: 10.5px;">✅ มี ${totalCount.toLocaleString()} ชิ้น (พร้อมขาย)</span>`;
        } else {
            return `<span style="color: #facc15; font-size: 10px;">⏳ มี ${totalCount.toLocaleString()}/${threshold} ชิ้น (รอฟาร์ม)</span>`;
        }
    };

    window.renderAutoSellRulesHtml = function() {
        const cfg = window.__autoMarketSellConfig || { rules: [] };
        const rules = cfg.rules || [];

        const bagItems = (typeof window.getBagItems === 'function') ? window.getBagItems() : [];
        const bagItemNames = new Set();
        bagItems.forEach(it => {
            if (it && it.name) bagItemNames.add(it.name.trim());
        });

        let datalistHtml = `<datalist id="p-bag-datalist">`;
        Array.from(bagItemNames).sort().forEach(name => {
            datalistHtml += `<option value="${name}">`;
        });
        datalistHtml += `</datalist>`;

        if (rules.length === 0) {
            return `
                ${datalistHtml}
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 14px; text-align: center; color: #94a3b8; font-size: 11.5px;">
                    <span style="font-size: 16px;">💡</span> ยังไม่มีรายการตั้งขายอัตโนมัติ — กดปุ่ม <b style="color: #4ade80;">[➕ เพิ่มรายการลงขาย]</b> ด้านบน เพื่อระบุชื่อไอเทมและจำนวนขั้นต่ำที่ต้องการให้บอทลงขายอัตโนมัติเมื่อฟาร์มครบ
                </div>
            `;
        }

        let rowsHtml = '';
        rules.forEach((rule, idx) => {
            const statusHtml = window.getAutoSellRuleBagStatusHtml(rule.itemName, rule.minQty);
            const isReady = statusHtml.includes('✅');

            rowsHtml += `
                <tr style="border-bottom: 1px solid #1e293b; background: ${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'};">
                    <td style="padding: 6px 8px; text-align: center; color: #64748b; font-family: monospace; border: 1px solid #334155;">${idx + 1}</td>
                    <td style="padding: 6px 8px; border: 1px solid #334155;">
                        <input type="text" list="p-bag-datalist" value="${rule.itemName || ''}" placeholder="พิมพ์หรือเลือกชื่อไอเทม..."
                            oninput="window.updateAutoSellRuleName('${rule.id}', this.value)"
                            style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #475569; color: #f8fafc; padding: 4px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">
                    </td>
                    <td style="padding: 6px 8px; text-align: center; border: 1px solid #334155;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <span style="color: #94a3b8; font-size: 10px;">ครบ ≥</span>
                            <input type="number" min="1" value="${rule.minQty || 20}"
                                oninput="window.updateAutoSellRuleMin('${rule.id}', this.value)"
                                style="width: 65px; box-sizing: border-box; background: #020617; border: 1px solid #475569; color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; font-weight: bold; text-align: center;">
                            <span style="color: #94a3b8; font-size: 10px;">ชิ้น</span>
                        </div>
                    </td>
                    <td style="padding: 6px 8px; text-align: center; border: 1px solid #334155;">
                        <select onchange="window.updateAutoSellRule('${rule.id}', 'sellMode', this.value)"
                            style="background: #020617; border: 1px solid #475569; color: #c084fc; padding: 4px; border-radius: 4px; font-size: 10.5px;">
                            <option value="all" ${rule.sellMode !== 'min' ? 'selected' : ''}>ขายทั้งหมดในตัว</option>
                            <option value="min" ${rule.sellMode === 'min' ? 'selected' : ''}>ขายทีละ ${rule.minQty} ชิ้น</option>
                        </select>
                    </td>
                    <td id="p-autosell-status-${rule.id}" style="padding: 6px 8px; text-align: center; border: 1px solid #334155;">
                        ${statusHtml}
                    </td>
                    <td style="padding: 6px 8px; text-align: center; border: 1px solid #334155;">
                        <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                            <button onclick="window.sellSingleRuleNow('${rule.id}');" title="สั่งประเมินราคากลางและลงขายไอเทมนี้ทันที 1 ครั้ง"
                                style="background: ${isReady ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#334155'}; color: #fff; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: ${isReady ? 'pointer' : 'not-allowed'}; opacity: ${isReady ? '1' : '0.6'};">
                                ⚡ ขายทันที
                            </button>
                            <button onclick="window.removeAutoMarketSellRule('${rule.id}');" title="ลบรายการนี้ทิ้ง"
                                style="background: #ef4444; color: #fff; border: none; width: 22px; height: 22px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);">
                                ➖
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        return `
            ${datalistHtml}
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="background: #1e293b; color: #94a3b8; text-align: center;">
                        <th style="padding: 6px 8px; border: 1px solid #334155; width: 35px;">#</th>
                        <th style="padding: 6px 8px; border: 1px solid #334155; text-align: left;">ชื่อไอเทม</th>
                        <th style="padding: 6px 8px; border: 1px solid #334155; width: 140px;">เงื่อนไขลงขาย</th>
                        <th style="padding: 6px 8px; border: 1px solid #334155; width: 130px;">จำนวนที่ขาย</th>
                        <th style="padding: 6px 8px; border: 1px solid #334155; width: 160px;">สถานะในกระเป๋า</th>
                        <th style="padding: 6px 8px; border: 1px solid #334155; width: 110px;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    };

    window.renderAutoSellHudRulesHtml = function() {
        const cfg = window.__autoMarketSellConfig || { rules: [] };
        const rules = cfg.rules || [];

        const bagItems = (typeof window.getBagItems === 'function') ? window.getBagItems() : [];
        const bagItemNames = new Set();
        bagItems.forEach(it => {
            if (it && it.name) bagItemNames.add(it.name.trim());
        });

        let datalistHtml = `<datalist id="p-bag-datalist-hud">`;
        Array.from(bagItemNames).sort().forEach(name => {
            datalistHtml += `<option value="${name}">`;
        });
        datalistHtml += `</datalist>`;

        if (rules.length === 0) {
            return `
                ${datalistHtml}
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(168, 85, 247, 0.35); border-radius: 6px; padding: 10px 8px; text-align: center; color: #94a3b8; font-size: 10px; margin: 4px 0;">
                    <span style="font-size: 14px;">💡</span> ยังไม่มีรายการตั้งขายอัตโนมัติ<br/>
                    <span style="color: #cbd5e1; font-size: 9px;">กดปุ่ม <b style="color: #4ade80;">[➕ เพิ่มรายการลงขาย]</b> ด้านบน เพื่อระบุชื่อไอเทมและจำนวนขั้นต่ำที่จะลงขาย</span>
                </div>
            `;
        }

        let html = datalistHtml;
        rules.forEach((rule, idx) => {
            const statusHtml = (typeof window.getAutoSellRuleBagStatusHtml === 'function')
                ? window.getAutoSellRuleBagStatusHtml(rule.itemName, rule.minQty)
                : '';
            const isReady = statusHtml.includes('✅');

            html += `
                <div class="p-card" style="border-color: rgba(168, 85, 247, 0.35); background: rgba(15, 23, 42, 0.7); padding: 5px; margin-bottom: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                        <span style="color: #a855f7; font-weight: bold; font-size: 10px; font-family: monospace;">#${idx + 1}</span>
                        <input type="text" list="p-bag-datalist-hud" value="${rule.itemName || ''}" placeholder="พิมพ์/เลือกชื่อไอเทม..."
                            oninput="window.updateAutoSellRuleName('${rule.id}', this.value)"
                            style="flex: 1; min-width: 0; background: #020617; border: 1px solid #475569; color: #fff; padding: 2px 5px; border-radius: 4px; font-size: 10px; font-weight: bold;">
                        <button onclick="window.removeAutoMarketSellRule('${rule.id}');" title="ลบรายการนี้ทิ้ง"
                            style="background: #ef4444; color: #fff; border: none; width: 20px; height: 20px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            ➖
                        </button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 2px; font-size: 9.5px; color: #cbd5e1;">
                            <span>ครบ ≥</span>
                            <input type="number" min="1" value="${rule.minQty || 20}"
                                oninput="window.updateAutoSellRuleMin('${rule.id}', this.value)"
                                style="width: 44px; background: #020617; border: 1px solid #475569; color: #38bdf8; padding: 1px 3px; border-radius: 3px; font-size: 10px; text-align: center; font-weight: bold;">
                            <span>ชิ้น</span>
                        </div>
                        <select onchange="window.updateAutoSellRule('${rule.id}', 'sellMode', this.value)"
                            style="background: #020617; border: 1px solid #475569; color: #c084fc; padding: 1px 4px; border-radius: 3px; font-size: 9.5px;">
                            <option value="all" ${rule.sellMode !== 'min' ? 'selected' : ''}>ขายหมดในตัว</option>
                            <option value="min" ${rule.sellMode === 'min' ? 'selected' : ''}>ทีละ ${rule.minQty} ชิ้น</option>
                        </select>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 3px;">
                        <div id="p-autosell-hud-status-${rule.id}" style="font-size: 9px;">
                            ${statusHtml}
                        </div>
                        <button onclick="window.sellSingleRuleNow('${rule.id}');" title="ประเมินราคากลางและลงขายทันที"
                            style="background: ${isReady ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#334155'}; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; font-size: 9.5px; font-weight: bold; cursor: ${isReady ? 'pointer' : 'not-allowed'}; opacity: ${isReady ? '1' : '0.6'};">
                            ⚡ ขายทันที
                        </button>
                    </div>
                </div>
            `;
        });
        return html;
    };

    window.switchMarketSubTab = function(subtab = 'autosell') {
        window.__currentMarketSubTab = subtab;
        localStorage.setItem('pelican_market_subtab', subtab);

        const btnAuto = document.getElementById('p-subtab-btn-autosell');
        const btnSniper = document.getElementById('p-subtab-btn-sniper');
        const viewAuto = document.getElementById('p-market-view-autosell');
        const viewSniper = document.getElementById('p-market-view-sniper');

        if (subtab === 'autosell') {
            if (btnAuto) {
                btnAuto.style.background = '#9333ea';
                btnAuto.style.color = '#fff';
            }
            if (btnSniper) {
                btnSniper.style.background = 'transparent';
                btnSniper.style.color = '#94a3b8';
            }
            if (viewAuto) viewAuto.style.display = 'block';
            if (viewSniper) viewSniper.style.display = 'none';

            const hudContainer = document.getElementById('p-autosell-hud-rules-container');
            if (hudContainer && typeof window.renderAutoSellHudRulesHtml === 'function') {
                hudContainer.innerHTML = window.renderAutoSellHudRulesHtml();
            }
        } else {
            if (btnAuto) {
                btnAuto.style.background = 'transparent';
                btnAuto.style.color = '#94a3b8';
            }
            if (btnSniper) {
                btnSniper.style.background = '#0284c7';
                btnSniper.style.color = '#fff';
            }
            if (viewAuto) viewAuto.style.display = 'none';
            if (viewSniper) viewSniper.style.display = 'block';
        }
    };

    window.switchHudTabToMarketAutoSell = function() {
        const hud = document.getElementById('pelican-hud');
        if (!hud) return;
        const marketTabBtn = hud.querySelector('.p-tab-btn[data-tab="market"]');
        if (marketTabBtn) {
            marketTabBtn.click();
        }
        if (typeof window.switchMarketSubTab === 'function') {
            window.switchMarketSubTab('autosell');
        }
    };

    window.addAutoMarketSellRule = function(initialName = '', initialMin = 20) {
        if (!window.__autoMarketSellConfig) window.__autoMarketSellConfig = { rules: [] };
        if (!Array.isArray(window.__autoMarketSellConfig.rules)) window.__autoMarketSellConfig.rules = [];

        const newRule = {
            id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            itemName: initialName || '',
            minQty: initialMin || 20,
            sellMode: 'all',
            enabled: true
        };
        window.__autoMarketSellConfig.rules.push(newRule);
        window.saveAutoMarketSellConfig();

        const container = document.getElementById('p-autosell-rules-container');
        if (container) {
            container.innerHTML = window.renderAutoSellRulesHtml();
        } else {
            const modal = document.getElementById('pelican-data-modal');
            if (modal && modal.style.display !== 'none' && window.__currentModalTab === 'market') {
                window.renderModalTab('market');
            }
        }
        const hudContainer = document.getElementById('p-autosell-hud-rules-container');
        if (hudContainer && typeof window.renderAutoSellHudRulesHtml === 'function') {
            hudContainer.innerHTML = window.renderAutoSellHudRulesHtml();
        }
        const countBadge = document.getElementById('p-subtab-autosell-count');
        if (countBadge) {
            countBadge.innerText = (window.__autoMarketSellConfig?.rules || []).length;
        }
        console.log(`%c[Pelican AutoSell] ➕ เพิ่มรายการลงขายใหม่: "${initialName || 'ยังไม่ระบุชื่อ'}" (เมื่อครบ ≥ ${initialMin} ชิ้น)`, 'color: #10b981; font-weight: bold;');
    };

    window.removeAutoMarketSellRule = function(ruleId) {
        if (!window.__autoMarketSellConfig?.rules) return;
        const rule = window.__autoMarketSellConfig.rules.find(r => r.id === ruleId);
        window.__autoMarketSellConfig.rules = window.__autoMarketSellConfig.rules.filter(r => r.id !== ruleId);
        window.saveAutoMarketSellConfig();

        const container = document.getElementById('p-autosell-rules-container');
        if (container) {
            container.innerHTML = window.renderAutoSellRulesHtml();
        } else {
            const modal = document.getElementById('pelican-data-modal');
            if (modal && modal.style.display !== 'none' && window.__currentModalTab === 'market') {
                window.renderModalTab('market');
            }
        }
        const hudContainer = document.getElementById('p-autosell-hud-rules-container');
        if (hudContainer && typeof window.renderAutoSellHudRulesHtml === 'function') {
            hudContainer.innerHTML = window.renderAutoSellHudRulesHtml();
        }
        const countBadge = document.getElementById('p-subtab-autosell-count');
        if (countBadge) {
            countBadge.innerText = (window.__autoMarketSellConfig?.rules || []).length;
        }
        console.log(`%c[Pelican AutoSell] ➖ ลบรายการลงขาย: "${rule?.itemName || ruleId}" เรียบร้อยแล้ว`, 'color: #ef4444; font-weight: bold;');
    };

    window.updateAutoSellRule = function(ruleId, field, value) {
        if (!window.__autoMarketSellConfig?.rules) return;
        const rule = window.__autoMarketSellConfig.rules.find(r => r.id === ruleId);
        if (rule) {
            rule[field] = value;
            window.saveAutoMarketSellConfig();
        }
    };

    window.updateAutoSellRuleName = function(ruleId, newName) {
        if (!window.__autoMarketSellConfig?.rules) return;
        const rule = window.__autoMarketSellConfig.rules.find(r => r.id === ruleId);
        if (!rule) return;
        rule.itemName = newName.trim();
        window.saveAutoMarketSellConfig();

        const statusEl = document.getElementById(`p-autosell-status-${ruleId}`);
        if (statusEl && typeof window.getAutoSellRuleBagStatusHtml === 'function') {
            statusEl.innerHTML = window.getAutoSellRuleBagStatusHtml(rule.itemName, rule.minQty);
        }
        const hudStatusEl = document.getElementById(`p-autosell-hud-status-${ruleId}`);
        if (hudStatusEl && typeof window.getAutoSellRuleBagStatusHtml === 'function') {
            hudStatusEl.innerHTML = window.getAutoSellRuleBagStatusHtml(rule.itemName, rule.minQty);
        }
    };

    window.updateAutoSellRuleMin = function(ruleId, newMin) {
        if (!window.__autoMarketSellConfig?.rules) return;
        const rule = window.__autoMarketSellConfig.rules.find(r => r.id === ruleId);
        if (!rule) return;
        rule.minQty = Math.max(1, parseInt(newMin) || 1);
        window.saveAutoMarketSellConfig();

        const statusEl = document.getElementById(`p-autosell-status-${ruleId}`);
        if (statusEl && typeof window.getAutoSellRuleBagStatusHtml === 'function') {
            statusEl.innerHTML = window.getAutoSellRuleBagStatusHtml(rule.itemName, rule.minQty);
        }
        const hudStatusEl = document.getElementById(`p-autosell-hud-status-${ruleId}`);
        if (hudStatusEl && typeof window.getAutoSellRuleBagStatusHtml === 'function') {
            hudStatusEl.innerHTML = window.getAutoSellRuleBagStatusHtml(rule.itemName, rule.minQty);
        }
    };

    window.toggleAutoMarketSell = function(enabled) {
        if (!window.__autoMarketSellConfig) window.__autoMarketSellConfig = { rules: [] };
        window.__autoMarketSellConfig.enabled = !!enabled;
        window.saveAutoMarketSellConfig();

        const t1 = document.getElementById('p-autosell-toggle');
        if (t1) t1.checked = !!enabled;
        const t2 = document.getElementById('p-autosell-toggle-hud');
        if (t2) t2.checked = !!enabled;

        console.log(`%c[Pelican AutoSell] ${enabled ? '🟢 เปิดการทำงาน Auto Market Sell 24/7' : '🔴 ปิดการทำงาน Auto Market Sell'}`, 'color: #a855f7; font-weight: bold;');
        if (enabled) {
            window.runAutoMarketSellCycle(true);
        }
    };

    window.sellSingleRuleNow = async function(ruleId) {
        if (!window.__autoMarketSellConfig?.rules) return;
        const rule = window.__autoMarketSellConfig.rules.find(r => r.id === ruleId);
        if (!rule || !rule.itemName) {
            console.warn('[Pelican AutoSell] ⚠️ กรุณาระบุชื่อไอเทมก่อนลงขาย');
            return;
        }

        const bagItems = (typeof window.getBagItems === 'function') ? window.getBagItems() : [];
        const norm = rule.itemName.trim().toLowerCase();
        const matchingItems = bagItems.filter(it => it.name && it.name.trim().toLowerCase() === norm);

        if (matchingItems.length === 0) {
            console.warn(`[Pelican AutoSell] ⚠️ ไม่พบไอเทม "${rule.itemName}" ในกระเป๋าตัวละคร`);
            return;
        }

        let totalQty = 0;
        matchingItems.forEach(it => totalQty += (Number(it.qty) || 1));
        const targetSlotItem = matchingItems[0];
        const qtyToSell = (rule.sellMode === 'min') ? Math.min(rule.minQty, targetSlotItem.qty) : targetSlotItem.qty;

        console.log(`%c[Pelican AutoSell] 🔍 กำลังคำนวณราคากลางสมดุล (Market Median) ของ ${rule.itemName} (ID: ${targetSlotItem.id})...`, 'color: #38bdf8; font-weight: bold;');

        const priceInfo = await window.fetchItemMarketMedianPrice(targetSlotItem.id, targetSlotItem.refine || 0);
        if (!priceInfo || !priceInfo.medianPrice || priceInfo.medianPrice <= 0) {
            console.warn(`[Pelican AutoSell] ❌ ไม่สามารถคำนวณราคาของ ${rule.itemName} ได้จากเซิร์ฟเวอร์`);
            return;
        }

        const medianUnitPrice = priceInfo.medianPrice;
        const totalPrice = medianUnitPrice * qtyToSell;

        console.log(`%c[Pelican AutoSell] 📊 ผลการวิเคราะห์ราคา: มัธยฐาน = ${medianUnitPrice.toLocaleString()} z/ชิ้น (จาก ${priceInfo.cleanTradesCount} ธุรกรรมล่าสุด) | ราคารวม ${qtyToSell} ชิ้น = ${totalPrice.toLocaleString()} z`, 'color: #c084fc; font-weight: bold;');

        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
        if (room && room.connection?.isOpen) {
            room.send('market', {
                op: 'list',
                slot: Number(targetSlotItem.slot),
                qty: Number(qtyToSell),
                price: Number(totalPrice),
                hours: 24
            });
            console.log(`%c[Pelican AutoSell] 🚀 ยิงคำสั่งลงขายสำเร็จ! { op: 'list', slot: ${targetSlotItem.slot}, qty: ${qtyToSell}, price: ${totalPrice}, hours: 24 }`, 'color: #10b981; font-weight: bold;');
            if (typeof playWarningChime === 'function') playWarningChime();

            setTimeout(() => {
                const hudContainer = document.getElementById('p-autosell-hud-rules-container');
                if (hudContainer && typeof window.renderAutoSellHudRulesHtml === 'function') {
                    hudContainer.innerHTML = window.renderAutoSellHudRulesHtml();
                }
                const modalContainer = document.getElementById('p-autosell-rules-container');
                if (modalContainer && typeof window.renderAutoSellRulesHtml === 'function') {
                    modalContainer.innerHTML = window.renderAutoSellRulesHtml();
                }
            }, 600);
        }
    };

    window.runAutoMarketSellCycle = async function(manual = false) {
        const cfg = window.__autoMarketSellConfig;
        if (!cfg || (!cfg.enabled && !manual)) return;
        if (window.__isAutoSellingNow) return;

        window.__isAutoSellingNow = true;
        let soldCount = 0;
        try {
            const bagItems = (typeof window.getBagItems === 'function') ? window.getBagItems() : [];
            if (!bagItems || bagItems.length === 0) return;

            const activeCount = await window.fetchMyMarketActiveCount();
            const maxQuota = cfg.maxActiveListings || 10;
            if (activeCount >= maxQuota) {
                console.log(`%c[Pelican AutoSell] ⏸️ โควตาลงขายเต็มแล้ว (${activeCount}/${maxQuota} รายการ) รอขายออกก่อน`, 'color: #f59e0b;');
                return;
            }

            let remainingSlots = maxQuota - activeCount;

            for (const rule of (cfg.rules || [])) {
                if (!rule || !rule.itemName || rule.enabled === false) continue;
                if (remainingSlots <= 0) break;

                const norm = rule.itemName.trim().toLowerCase();
                const matchingItems = bagItems.filter(it => it.name && it.name.trim().toLowerCase() === norm);
                if (matchingItems.length === 0) continue;

                let totalQty = 0;
                matchingItems.forEach(it => totalQty += (Number(it.qty) || 1));

                if (totalQty >= (Number(rule.minQty) || 1)) {
                    const targetSlotItem = matchingItems[0];
                    const qtyToSell = (rule.sellMode === 'min') ? Math.min(rule.minQty, targetSlotItem.qty) : targetSlotItem.qty;

                    const priceInfo = await window.fetchItemMarketMedianPrice(targetSlotItem.id, targetSlotItem.refine || 0);
                    if (priceInfo && priceInfo.medianPrice > 0) {
                        const medianUnitPrice = priceInfo.medianPrice;
                        const totalPrice = medianUnitPrice * qtyToSell;

                        const room = (typeof window.getGameRoom === 'function') ? window.getGameRoom() : window.__gameRoom;
                        if (room && room.connection?.isOpen) {
                            room.send('market', {
                                op: 'list',
                                slot: Number(targetSlotItem.slot),
                                qty: Number(qtyToSell),
                                price: Number(totalPrice),
                                hours: 24
                            });
                            console.log(`%c[Pelican AutoSell] 🏷️ ลงขายอัตโนมัติสำเร็จ: ${rule.itemName} x${qtyToSell} @ ${medianUnitPrice.toLocaleString()} z (รวม ${totalPrice.toLocaleString()} z)`, 'color: #10b981; font-weight: bold;');
                            if (typeof playWarningChime === 'function') playWarningChime();
                            remainingSlots--;
                            soldCount++;
                            await new Promise(r => setTimeout(r, 1200));
                        }
                    }
                }
            }
        } finally {
            window.__isAutoSellingNow = false;
            // อัปเดตการแสดงผลของกฎและจำนวนคงเหลือใน HUD และ Modal โดยไม่เปิดปิดกระเป๋าบนจอ
            setTimeout(() => {
                const hudContainer = document.getElementById('p-autosell-hud-rules-container');
                if (hudContainer && typeof window.renderAutoSellHudRulesHtml === 'function') {
                    hudContainer.innerHTML = window.renderAutoSellHudRulesHtml();
                }
                const modalContainer = document.getElementById('p-autosell-rules-container');
                if (modalContainer && typeof window.renderAutoSellRulesHtml === 'function') {
                    modalContainer.innerHTML = window.renderAutoSellRulesHtml();
                }
            }, 600);
        }
    };

    window.showPelicanMarketItemTooltip = function(itemData, e) {
        if (!itemData) return;
        const raw = itemData.raw || itemData;
        const tt = getOrCreatePelicanItemTooltip();

        const rarityKey = (raw.rarity || 'common').toLowerCase();
        const rarityInfo = ITEM_RARITY_MAP[rarityKey] || { th: raw.rarity || 'ทั่วไป', color: '#cbd5e1' };

        const typeTH = ITEM_TYPE_TH[raw.type] || raw.type || 'ไอเทม';
        const equipTypeTH = EQUIP_TYPE_TH[raw.equipType] || raw.equipType || '';
        const weaponTypeTH = WEAPON_TYPE_TH[raw.weaponType] || raw.weaponType || '';

        const slotCount = raw.slots !== undefined ? raw.slots : null;
        const titleSlotSuffix = (slotCount !== null && slotCount > 0) ? ` [${slotCount}]` : '';
        const refinePrefix = raw.refine ? `+${raw.refine} ` : '';

        let affixesHtml = '';
        if (Array.isArray(raw.affixes) && raw.affixes.length > 0) {
            affixesHtml = `
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255, 255, 255, 0.12);">
                    <div style="font-size: 10px; color: #38bdf8; font-weight: bold; margin-bottom: 3px;">✨ คุณสมบัติพิเศษ (Options):</div>
                    ${raw.affixes.map(aff => {
                        const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[aff.type]) ? STAT_NAMES_MAP[aff.type] : { th: aff.type };
                        const valStr = (aff.mode === 'increasedPercent' || String(aff.type).includes('PERCENT') || String(aff.type).includes('DAMAGE')) ? `+${aff.value}%` : `+${aff.value}`;
                        const isSpecial = aff.category === 'special' || String(aff.type).includes('CRIT');
                        const color = isSpecial ? '#f59e0b' : '#34d399';
                        return `<div style="color: ${color}; font-size: 11px; margin-bottom: 1px;">• ${sInfo.th || aff.type} <b style="color: #fff;">${valStr}</b></div>`;
                    }).join('')}
                </div>
            `;
        }

        let attrsHtml = '';
        if (Array.isArray(raw.attributes) && raw.attributes.length > 0) {
            attrsHtml = `
                <div style="margin-top: 4px; font-size: 11px; color: #94a3b8;">
                    ${raw.attributes.map(attr => {
                        const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[attr.type]) ? STAT_NAMES_MAP[attr.type] : { th: attr.type };
                        return `<div>${sInfo.th || attr.type}: <b style="color: #fff;">+${attr.value}</b></div>`;
                    }).join('')}
                </div>
            `;
        }

        tt.innerHTML = `
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="width: 36px; height: 36px; min-width: 36px; background: rgba(15, 23, 42, 0.8); border: 1.5px solid ${rarityInfo.color}; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                    ${getItemIconHtml(raw, 28)}
                </div>
                <div style="flex: 1;">
                    <div style="color: ${rarityInfo.color}; font-size: 13px; font-weight: bold;">
                        ${refinePrefix}${raw.name || 'ไอเทม'}${titleSlotSuffix}${(raw.qty && raw.qty > 1) ? ` <b style="color: #fde047;">×${raw.qty.toLocaleString()}</b>` : ''}
                    </div>
                    <div style="font-size: 10.5px; color: #94a3b8; margin-top: 1px;">
                        ${weaponTypeTH || equipTypeTH || typeTH} · <span style="color: ${rarityInfo.color};">${rarityInfo.th}</span>
                    </div>
                </div>
            </div>
            ${attrsHtml}
            ${affixesHtml}
            <div style="margin-top: 6px; font-size: 9.5px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 4px;">
                💡 คลิก 'ซื้อทันที' เพื่อส่งคำสั่งซื้อผ่านตลาดกลาง
            </div>
        `;

        tt.style.display = 'block';
        window.movePelicanItemTooltip(e);
    };

    window.renderMarketHudTab = function() {
        const hudTab = document.getElementById('p-tab-market');
        if (!hudTab) return;

        const countEl = document.getElementById('p-mk-result-count');
        const listEl = document.getElementById('p-mk-hud-results');
        const results = window.__marketFilteredResults || [];

        if (countEl) countEl.innerText = results.length;
        if (!listEl) return;

        if (results.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 14px 6px; font-size: 10.5px;">
                    ยังไม่พบรายการที่ตรงเงื่อนไข<br/>
                    <span style="font-size: 9.5px; color: #475569;">กดปุ่ม '🔍 ค้นหา' หรือ '⚡ สแกนหลายหน้า' เพื่อดึงข้อมูล</span>
                </div>
            `;
            return;
        }

        let html = '';
        for (const item of results.slice(0, 30)) {
            const it = item.item || {};
            const refBadge = it.refine ? `<span style="background: rgba(168, 85, 247, 0.25); border: 1px solid #c084fc; color: #e9d5ff; padding: 0 4px; border-radius: 3px; font-weight: bold; font-size: 9.5px; margin-right: 3px;">+${it.refine}</span>` : '';
            const rarityKey = (it.rarity || 'common').toLowerCase();
            const rarityInfo = ITEM_RARITY_MAP[rarityKey] || { th: 'ทั่วไป', color: '#cbd5e1' };

            let affHtml = '';
            if (Array.isArray(it.affixes)) {
                affHtml = it.affixes.map(a => {
                    const sInfo = (typeof STAT_NAMES_MAP !== 'undefined' && STAT_NAMES_MAP[a.type]) ? STAT_NAMES_MAP[a.type] : { short: a.type };
                    const isSpec = a.category === 'special' || String(a.type).includes('CRIT');
                    const bg = isSpec ? 'rgba(234, 179, 8, 0.25)' : 'rgba(34, 197, 94, 0.2)';
                    const border = isSpec ? 'rgba(234, 179, 8, 0.5)' : 'rgba(34, 197, 94, 0.4)';
                    const color = isSpec ? '#fef08a' : '#86efac';
                    const val = (a.mode === 'increasedPercent' || String(a.type).includes('PERCENT')) ? `+${a.value}%` : `+${a.value}`;
                    return `<span style="background: ${bg}; border: 1px solid ${border}; color: ${color}; padding: 0 3px; border-radius: 3px; font-size: 9px; margin-right: 2px;">${sInfo.short || a.type} ${val}</span>`;
                }).join('');
            }

            const qty = item.qty || item.quantity || item.amount || it.qty || it.amount || 1;
            const qtyBadge = (qty > 1) ? ` <b style="color: #fde047; font-size: 10.5px;">×${qty.toLocaleString()}</b>` : '';
            const unitPrice = (qty > 1) ? Math.round(Number(item.price) / qty) : null;
            const tooltipData = { ...it, qty, price: item.price, sellerName: item.sellerName };

            html += `
                <div class="p-card" style="margin-bottom: 4px; border-color: rgba(255, 255, 255, 0.12); padding: 5px;" onmouseenter="window.showPelicanMarketItemTooltip(${JSON.stringify(tooltipData).replace(/"/g, '&quot;')}, event)" onmousemove="window.movePelicanItemTooltip(event)" onmouseleave="window.hidePelicanItemTooltip()">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; flex: 1;">
                            ${getItemIconHtml(it, 18)}
                            <span style="font-weight: bold; color: ${rarityInfo.color}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${refBadge}${it.name || 'ไอเทม'}${qtyBadge}
                            </span>
                        </div>
                        <div style="text-align: right; margin-left: 4px;">
                            <div style="font-weight: bold; color: #00ffcc; font-size: 11px;">
                                ${Number(item.price).toLocaleString()} z
                            </div>
                            ${unitPrice ? `<div style="font-size: 8.5px; color: #94a3b8; line-height: 1;">(${unitPrice.toLocaleString()} z/ชิ้น)</div>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px;">
                        <div style="display: flex; flex-wrap: wrap; gap: 2px; flex: 1;">
                            ${affHtml || '<span style="color: #64748b; font-size: 9px;">ไม่มี Option</span>'}
                        </div>
                        <button onclick="window.buyMarketListing(${item.listingId}, ${item.price}, '${(it.name || '').replace(/'/g, "\\'")}', '${(item.sellerName || '').replace(/'/g, "\\'")}', this)" style="background: #0284c7; color: white; border: none; padding: 2px 7px; border-radius: 4px; font-size: 9.5px; font-weight: bold; cursor: pointer; white-space: nowrap; margin-left: 4px; transition: all 0.15s ease;">🛒 ซื้อ</button>
                    </div>
                </div>
            `;
        }
        listEl.innerHTML = html;
    };

    
    // ==========================================
    // CONFIG EXPORT & IMPORT UTILITIES (SAFE & SANITIZED)
    // ==========================================
    window.exportAllBotSettings = function() {
        const selectMap = document.getElementById('p-target-map-select');
        const targetMap = (selectMap ? selectMap.value : '') || window.__targetFarmMap || localStorage.getItem('pelican_target_map') || 'ซากโบราณสถาน';
        const autoLoop = (document.getElementById('p-auto-loop') ? document.getElementById('p-auto-loop').checked : true) && (localStorage.getItem('pelican_auto_loop') !== 'false');

        // กรองการตั้งค่าทั้งหมด โดยยกเว้น ID (username) และ Password ออกเด็ดขาด 100% เพื่อความปลอดภัย
        const exportData = {
            version: '4.3.0',
            exportedAt: new Date().toISOString(),
            targetMap: targetMap,
            autoLoop: autoLoop,
            sellConfig: Object.assign({}, window.__sellConfig || {}),
            archerConfig: Object.assign({}, window.__archerConfig || {}),
            shopConfig: Object.assign({}, window.__shopConfig || {}),
            autoMarketSellConfig: Object.assign({}, window.__autoMarketSellConfig || {}),
            marketFilterConfig: Object.assign({}, window.__marketFilterConfig || {}),
            authConfig: {
                enabled: !!window.__authConfig?.enabled,
                autoResumeBot: window.__authConfig?.autoResumeBot !== false,
                charName: window.__authConfig?.charName || ''
                // NOTE: username and password are strictly excluded!
            }
        };

        const jsonStr = JSON.stringify(exportData, null, 2);
        return { data: exportData, json: jsonStr };
    };

    window.syncAllHudInputsFromConfig = function() {
        // 1. Target Map & Loop
        const selMap = document.getElementById('p-target-map-select');
        if (selMap && window.__targetFarmMap) selMap.value = window.__targetFarmMap;
        const cbLoop = document.getElementById('p-auto-loop');
        if (cbLoop) cbLoop.checked = !!window.__autoLoopEnabled;

        // 2. Archer
        const archer = window.__archerConfig || {};
        const archerReq = document.getElementById('p-archer-req');
        if (archerReq) archerReq.checked = !!archer.requireArrow;
        const archerType = document.getElementById('p-archer-type');
        if (archerType && archer.arrowType) archerType.value = String(archer.arrowType);
        const archerQty = document.getElementById('p-archer-qty');
        if (archerQty) archerQty.value = archer.arrowBuyQty || 200;
        const archerBwing = document.getElementById('p-archer-bwing');
        if (archerBwing) archerBwing.checked = !!archer.useBwing;
        const archerBwingQty = document.getElementById('p-archer-bwing-qty');
        if (archerBwingQty) archerBwingQty.value = archer.bwingBuyQty || 5;
        const archerThresh = document.getElementById('p-archer-threshold');
        if (archerThresh) archerThresh.value = archer.ammoThreshold || 50;

        // 3. Sell
        const sell = window.__sellConfig || {};
        const sellWeightCb = document.getElementById('p-weight-check-enabled');
        if (sellWeightCb) sellWeightCb.checked = !!sell.weightCheckEnabled;
        const sellThresh = document.getElementById('p-weight-threshold');
        if (sellThresh) sellThresh.value = sell.weightThreshold || 80;
        const sellWep = document.getElementById('p-sell-rarity-weapon');
        if (sellWep) sellWep.value = sell.weaponRarity || 'normal';
        const sellArm = document.getElementById('p-sell-rarity-armor');
        if (sellArm) sellArm.value = sell.armorRarity || 'normal';
        const sellAcc = document.getElementById('p-sell-rarity-acc');
        if (sellAcc) sellAcc.value = sell.accRarity || 'none';
        const sellMat = document.getElementById('p-sell-rarity-mat');
        if (sellMat) sellMat.value = sell.sellMaterials ? 'all' : 'none';
        const sellRefined = document.getElementById('p-sell-keep-refined');
        if (sellRefined) sellRefined.checked = sell.keepRefined !== false;
        const sellSpecial = document.getElementById('p-sell-keep-special');
        if (sellSpecial) sellSpecial.checked = !!sell.keepSpecial;
        const sellSockets = document.getElementById('p-sell-keep-sockets');
        if (sellSockets) sellSockets.checked = !!sell.keepSockets;
        const sellWhitelist = document.getElementById('p-sell-whitelist');
        if (sellWhitelist) sellWhitelist.value = sell.whitelist || '';

        // 4. Shop
        const shop = window.__shopConfig || {};
        const shopEn = document.getElementById('p-shop-enabled');
        if (shopEn) shopEn.checked = !!shop.enabled;
        const shopKey = document.getElementById('p-shop-npckey');
        if (shopKey) shopKey.value = shop.npcKey || 'n2';

        // 5. Auth (เฉพาะตั้งค่าทั่วไป ไม่แตะ ID/Password)
        const auth = window.__authConfig || {};
        const authEn = document.getElementById('p-auth-enabled');
        if (authEn) authEn.checked = !!auth.enabled;
        const authRes = document.getElementById('p-auth-resume');
        if (authRes) authRes.checked = auth.autoResumeBot !== false;
        const authChar = document.getElementById('p-auth-char');
        if (authChar) authChar.value = auth.charName || '';

        // 6. Market Rules HTML
        if (typeof window.renderAutoSellHudRulesHtml === 'function') {
            const hudContainer = document.getElementById('p-autosell-hud-rules-container');
            if (hudContainer) hudContainer.innerHTML = window.renderAutoSellHudRulesHtml();
        }
    };

    window.importAllBotSettings = function(jsonStr) {
        try {
            let data = null;
            if (typeof jsonStr === 'string') {
                data = JSON.parse(jsonStr);
            } else if (typeof jsonStr === 'object') {
                data = jsonStr;
            }
            if (!data || typeof data !== 'object') throw new Error('ข้อมูลไม่ใช่ JSON Object ที่ถูกต้อง');

            // 1. Sell Config
            if (data.sellConfig && typeof data.sellConfig === 'object') {
                window.__sellConfig = Object.assign({}, window.__sellConfig || {}, data.sellConfig);
                localStorage.setItem('pelican_sell_cfg', JSON.stringify(window.__sellConfig));
            }

            // 2. Archer Config
            if (data.archerConfig && typeof data.archerConfig === 'object') {
                window.__archerConfig = Object.assign({}, window.__archerConfig || {}, data.archerConfig);
                localStorage.setItem('pelican_archer_cfg', JSON.stringify(window.__archerConfig));
            }

            // 3. Shop Config
            if (data.shopConfig && typeof data.shopConfig === 'object') {
                window.__shopConfig = Object.assign({}, window.__shopConfig || {}, data.shopConfig);
                localStorage.setItem('pelican_shop_cfg', JSON.stringify(window.__shopConfig));
            }

            // 4. Auto Market Sell Config
            if (data.autoMarketSellConfig && typeof data.autoMarketSellConfig === 'object') {
                window.__autoMarketSellConfig = Object.assign({}, window.__autoMarketSellConfig || {}, data.autoMarketSellConfig);
                localStorage.setItem('pelican_automarket_cfg', JSON.stringify(window.__autoMarketSellConfig));
            }

            // 5. Market Filter Config
            if (data.marketFilterConfig && typeof data.marketFilterConfig === 'object') {
                window.__marketFilterConfig = Object.assign({}, window.__marketFilterConfig || {}, data.marketFilterConfig);
                localStorage.setItem('pelican_market_filter', JSON.stringify(window.__marketFilterConfig));
            }

            // 6. Target Map & Auto Loop
            if (data.targetMap) {
                window.__targetFarmMap = data.targetMap;
                localStorage.setItem('pelican_target_map', data.targetMap);
                const sel = document.getElementById('p-target-map-select');
                if (sel) sel.value = data.targetMap;
            }
            if (typeof data.autoLoop === 'boolean') {
                window.__autoLoopEnabled = data.autoLoop;
                localStorage.setItem('pelican_auto_loop', data.autoLoop ? 'true' : 'false');
                const cb = document.getElementById('p-auto-loop');
                if (cb) cb.checked = data.autoLoop;
            }

            // 7. Auth Config (ห้ามแตะ username และ password เดิมของจอนี้เด็ดขาด!)
            if (data.authConfig && typeof data.authConfig === 'object') {
                if (!window.__authConfig) window.__authConfig = {};
                if (typeof data.authConfig.enabled === 'boolean') window.__authConfig.enabled = data.authConfig.enabled;
                if (typeof data.authConfig.autoResumeBot === 'boolean') window.__authConfig.autoResumeBot = data.authConfig.autoResumeBot;
                if (data.authConfig.charName !== undefined) window.__authConfig.charName = data.authConfig.charName;
                // username & password ยังคงเป็นค่าเดิมของบัญชีนี้เสมอ
                localStorage.setItem('pelican_auth_cfg', JSON.stringify(window.__authConfig));
            }

            // 8. Refresh HUD inputs to reflect imported values
            window.syncAllHudInputsFromConfig();

            console.log('%c[Pelican Config] ✅ นำเข้าการตั้งค่าสำเร็จครบทุกระบบ (คง ID/Password เดิมของบัญชีนี้ไว้)', 'color: #10b981; font-weight: bold;');
            return { success: true, message: 'นำเข้าการตั้งค่าสำเร็จครบทุกระบบ (คง ID/Password เดิมของบัญชีนี้ไว้)' };
        } catch(err) {
            console.error('[Pelican Config] ❌ นำเข้าผิดพลาด:', err);
            return { success: false, error: err.message };
        }
    };

    window.injectConfigModal = function() {
        let modal = document.getElementById('pelican-config-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'pelican-config-modal';
        modal.style.cssText = 'display: none; position: fixed; inset: 0; z-index: 1000002; align-items: center; justify-content: center; font-family: "Segoe UI", Tahoma, sans-serif;';
        modal.innerHTML = `
            <div id="p-cfg-backdrop" style="position: absolute; inset: 0; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);"></div>
            <div style="position: relative; width: 620px; max-width: 95vw; background: #0b1329; border: 1.5px solid #a855f7; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(168,85,247,0.3); color: #f8fafc; overflow: hidden; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #1e1b4b; border-bottom: 1px solid rgba(168,85,247,0.3);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;">💾</span>
                        <span id="p-cfg-modal-title" style="font-weight: bold; font-size: 14px; color: #c084fc;">สำรอง & ถ่ายโอนการตั้งค่า (Settings & Config)</span>
                    </div>
                    <button id="p-cfg-modal-close" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 0 4px; font-weight: bold;">✕</button>
                </div>

                <div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
                    <div style="background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 8px 12px; font-size: 11.5px; color: #e9d5ff; line-height: 1.4;">
                        🔒 <b>ระบบความปลอดภัย (Security Guaranteed):</b><br/>
                        ไฟล์คอนฟิกนี้จะรวบรวมการตั้งค่าทั้งหมด (แมพฟาร์ม, ลูกธนู, กรองขายของ NPC, กฎตลาดกลาง, ร้านค้า) โดย <b>ยกเว้นชื่อผู้ใช้ (ID) และ รหัสผ่าน (Password) ออก 100%</b> ทำให้แชร์หรือย้ายไปใช้กับจออื่นได้ทันทีอย่างปลอดภัย ไม่ทับซ้อนไอดีกัน
                    </div>

                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 11.5px; color: #cbd5e1; font-weight: 600;">ข้อมูลการตั้งค่า (Config JSON Data):</span>
                            <span id="p-cfg-status-hint" style="font-size: 10.5px; color: #10b981; font-weight: 600;"></span>
                        </div>
                        <textarea id="p-cfg-json-area" placeholder="วางโค้ด JSON การตั้งค่าที่นี่..." style="width: 100%; height: 250px; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #38bdf8; font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 11px; padding: 10px; resize: vertical; line-height: 1.4; outline: none;"></textarea>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; gap: 6px;">
                            <button id="p-cfg-btn-copy" style="background: #7c3aed; color: #fff; border: 1px solid #a855f7; padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                📋 คัดลอก JSON
                            </button>
                            <button id="p-cfg-btn-download" style="background: #1e293b; color: #38bdf8; border: 1px solid rgba(56,189,248,0.4); padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                                💾 ดาวน์โหลด .json
                            </button>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <label style="background: #334155; color: #e2e8f0; border: 1px solid #475569; padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                                📂 เลือกไฟล์ .json
                                <input type="file" id="p-cfg-file-input" accept=".json,application/json" style="display: none;">
                            </label>
                            <button id="p-cfg-btn-apply-import" style="background: #0284c7; color: #fff; border: 1px solid #38bdf8; padding: 6px 14px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                                📥 นำเข้าการตั้งค่า (Apply)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => { modal.style.display = 'none'; };
        modal.querySelector('#p-cfg-modal-close').onclick = close;
        modal.querySelector('#p-cfg-backdrop').onclick = close;

        modal.querySelector('#p-cfg-btn-copy').onclick = () => {
            const txt = modal.querySelector('#p-cfg-json-area').value;
            if (!txt) return;
            if (typeof window.safeCopyToClipboard === 'function') {
                window.safeCopyToClipboard(txt, '📋 คัดลอกการตั้งค่า (JSON) สำเร็จ!');
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(txt);
            }
            modal.querySelector('#p-cfg-status-hint').innerText = '✅ คัดลอกลง Clipboard สำเร็จ!';
        };

        modal.querySelector('#p-cfg-btn-download').onclick = () => {
            const txt = modal.querySelector('#p-cfg-json-area').value;
            if (!txt) return;
            const element = document.createElement('a');
            element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(txt));
            element.setAttribute('download', 'aetheria_bot_config.json');
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            modal.querySelector('#p-cfg-status-hint').innerText = '💾 ดาวน์โหลดไฟล์เรียบร้อย';
        };

        const fileInput = modal.querySelector('#p-cfg-file-input');
        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    modal.querySelector('#p-cfg-json-area').value = event.target.result;
                    modal.querySelector('#p-cfg-status-hint').innerText = `📄 โหลดไฟล์ "${file.name}" แล้ว`;
                };
                reader.readAsText(file);
            };
        }

        modal.querySelector('#p-cfg-btn-apply-import').onclick = () => {
            const txt = modal.querySelector('#p-cfg-json-area').value;
            if (!txt || !txt.trim()) {
                alert('กรุณาวางโค้ด JSON การตั้งค่าก่อนกดนำเข้า');
                return;
            }
            const res = window.importAllBotSettings(txt);
            if (res.success) {
                modal.querySelector('#p-cfg-status-hint').innerText = '✅ ' + res.message;
                alert('✅ ' + res.message);
                close();
            } else {
                modal.querySelector('#p-cfg-status-hint').innerText = '❌ ผิดพลาด: ' + res.error;
                alert('❌ ไม่สามารถนำเข้าการตั้งค่าได้:\n' + res.error);
            }
        };

        return modal;
    };

    window.openConfigExportModal = function(mode = 'export') {
        const modal = window.injectConfigModal();
        const area = modal.querySelector('#p-cfg-json-area');
        const hint = modal.querySelector('#p-cfg-status-hint');
        const title = modal.querySelector('#p-cfg-modal-title');

        if (mode === 'export') {
            const exp = window.exportAllBotSettings();
            area.value = exp.json;
            if (typeof window.safeCopyToClipboard === 'function') {
                window.safeCopyToClipboard(exp.json, '📋 คัดลอกการตั้งค่า (JSON) สำเร็จ! (ไม่รวม ID/Password)');
            }
            hint.innerText = '✅ คัดลอก JSON ลง Clipboard แล้ว';
            title.innerText = '📤 ส่งออกการตั้งค่า (Export Config JSON)';
        } else {
            area.value = '';
            hint.innerText = 'วางโค้ด JSON การตั้งค่าที่นี่ หรือกด "เลือกไฟล์ .json"';
            title.innerText = '📥 นำเข้าการตั้งค่า (Import Config JSON)';
        }

        modal.style.display = 'flex';
    };

    function createUI() {
        window.createUI = createUI;
        window.recreateUI = function() {
            const old = document.getElementById('pelican-hud');
            if (old) old.remove();
            createUI();
        };
        if (document.getElementById('pelican-hud')) return;

        const hud = document.createElement('div');
        hud.id = 'pelican-hud';
        hud.innerHTML = `
            <style>
                #pelican-hud {
                    position: fixed;
                    top: 180px;
                    right: 20px;
                    width: 285px;
                    background: rgba(15, 23, 42, 0.96);
                    border: 1px solid rgba(0, 255, 204, 0.35);
                    border-radius: 10px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(12px);
                    color: #fff;
                    font-family: 'Segoe UI', Tahoma, sans-serif;
                    z-index: 999999;
                    user-select: none;
                    font-size: 11.5px;
                    overflow: hidden;
                }
                .p-header {
                    background: rgba(0, 255, 204, 0.1);
                    padding: 7px 10px;
                    border-bottom: 1px solid rgba(0, 255, 204, 0.25);
                    cursor: move;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: bold;
                    color: #00ffcc;
                    font-size: 12px;
                }
                .p-status-strip {
                    display: flex;
                    justify-content: space-between;
                    padding: 4px 10px;
                    background: rgba(0, 0, 0, 0.3);
                    font-size: 10px;
                    color: #94a3b8;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                }
                .p-tabs {
                    display: flex;
                    background: rgba(15, 23, 42, 0.85);
                    padding: 3px;
                    gap: 3px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                }
                .p-tab-btn {
                    flex: 1;
                    padding: 5px 2px;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 5px;
                    color: #94a3b8;
                    font-size: 10.5px;
                    font-weight: bold;
                    cursor: pointer;
                    text-align: center;
                    transition: all 0.15s ease;
                }
                .p-tab-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.05);
                }
                .p-tab-btn.active {
                    color: #00ffcc;
                    background: rgba(0, 255, 204, 0.15);
                    border-color: rgba(0, 255, 204, 0.4);
                    box-shadow: 0 0 8px rgba(0, 255, 204, 0.15);
                }
                .p-body {
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                }
                .p-tab-pane {
                    display: none;
                    flex-direction: column;
                    gap: 6px;
                    padding: 10px;
                    max-height: 310px;
                    overflow-y: auto;
                    box-sizing: border-box;
                }
                .p-tab-pane.active {
                    display: flex;
                }
                .p-tab-pane::-webkit-scrollbar {
                    width: 4px;
                }
                .p-tab-pane::-webkit-scrollbar-thumb {
                    background: rgba(0, 255, 204, 0.3);
                    border-radius: 2px;
                }
                .p-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 11px;
                    color: #94a3b8;
                }
                .p-select {
                    width: 100%;
                    box-sizing: border-box;
                    background: rgba(30, 41, 59, 0.9);
                    border: 1px solid rgba(0, 255, 204, 0.3);
                    border-radius: 5px;
                    padding: 4px 6px;
                    color: #00ffcc;
                    font-size: 11px;
                    font-weight: bold;
                    outline: none;
                    cursor: pointer;
                }
                .p-select optgroup { color: #94a3b8; background: #0f172a; }
                .p-select option { color: #fff; background: #1e293b; padding: 3px; }
                .p-btn {
                    width: 100%;
                    padding: 5px 8px;
                    border-radius: 5px;
                    border: none;
                    cursor: pointer;
                    font-size: 11px;
                    font-weight: bold;
                    transition: all 0.15s ease;
                }
                .p-btn-loop { background: #16a34a; color: #fff; }
                .p-btn-loop:hover { background: #15803d; }
                .p-btn-bot { background: #0284c7; color: #fff; }
                .p-btn-bot:hover { background: #0369a1; }
                .p-btn-jump { background: #9333ea; color: #fff; }
                .p-btn-jump:hover { background: #7e22ce; }
                .p-btn-map { background: #334155; color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); }
                .p-btn-map:hover { background: #1e293b; }
                .p-btn-copy-out { background: #e11d48; color: #fff; }
                .p-btn-copy-out:hover { background: #be123c; }
                .p-check-box {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 11px;
                    cursor: pointer;
                }
                .p-card {
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 6px;
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
            </style>
            <div class="p-header" id="pelican-drag-handle">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 13px;">🔄</span>
                    <span id="p-hud-title-text">Aetheria Bot v4.3.0</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="p-quick-zeny" style="font-size: 10px; background: rgba(250, 204, 21, 0.2); border: 1px solid rgba(250, 204, 21, 0.4); color: #facc15; padding: 1px 7px; border-radius: 10px; font-weight: bold;" title="เงินในตัว (Zeny)">🪙 ${typeof window.__currentZeny === 'number' ? window.__currentZeny.toLocaleString() + ' z' : '-- z'}</span>
                    <span id="p-quick-ammo" style="font-size: 10px; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); color: #22c55e; padding: 1px 7px; border-radius: 10px; font-weight: bold;">🏹 ${window.__currentAmmo}</span>
                    <span id="p-quick-weight" style="font-size: 10px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 1px 7px; border-radius: 10px; font-weight: bold; cursor: pointer;" title="คลิกเพื่อจัดเรียงกระเป๋าและอัปเดตน้ำหนัก">⚖️ --%</span>
                    <span id="pelican-toggle" style="cursor: pointer; font-size: 15px; padding: 0 4px; color: #94a3b8; font-weight: bold;">−</span>
                </div>
            </div>

            <div class="p-body" id="pelican-content">
                <div id="p-weight-alert-banner" style="display: none; background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fca5a5; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 10px; text-align: center; margin: 4px 10px 0 10px;">⚠️ น้ำหนักเกินเกณฑ์!</div>
                <div class="p-status-strip">
                    <span>แมพ: <b id="p-cur-map-display" style="color:#38bdf8;">รอระบุแมพ...</b></span>
                    <span>สถานะ: <b id="p-char-state" style="color:#22c55e;">ปกติ</b></span>
                </div>
                <div class="p-status-strip" style="border-top:none; padding-top:0;">
                    <span>Status: <b id="pelican-status-text" style="color:#22c55e;">Online</b></span>
                    <span>Pos: <b id="p-cur-pos" style="color:#00ffcc;">รอ Minimap...</b></span>
                </div>

                <div class="p-tabs">
                    <button class="p-tab-btn active" data-tab="farm">🚀 ฟาร์ม</button>
                    <button class="p-tab-btn" data-tab="ammo">🏹 ธนู</button>
                    <button class="p-tab-btn" data-tab="sell">💰 ขาย</button>
                    <button class="p-tab-btn" data-tab="market">🛒 ตลาด</button>
                    <button class="p-tab-btn" data-tab="system">⚙️ ตั้งค่า</button>
                </div>

                <!-- TAB 1: FARM -->
                <div class="p-tab-pane active" id="p-tab-farm">
                    <button class="p-btn" id="p-btn-toggle-bot" style="font-size: 12.5px; padding: 8px 10px; font-weight: bold; border-radius: 6px; transition: all 0.2s ease;">▶️ START BOT (เริ่มทำงาน)</button>

                    <label class="p-check-box" style="color: #4ade80;">
                        <input type="checkbox" id="p-auto-loop" ${window.__autoLoopEnabled ? 'checked' : ''}>
                        <b>เปิดลูป 24 ชม. (ตาย -> ชุบ -> กลับแมพ)</b>
                    </label>

                    <div>
                        <span style="font-size: 10px; color: #94a3b8; display: block; margin-bottom: 2px;">แมพฟาร์มเป้าหมาย:</span>
                        <select id="p-target-map-select" class="p-select">
                            <optgroup label="🏰 เขตเมือง & พื้นที่ปลอดภัย">
                                <option value="เมืองหลวงโซลเฮเวน">เมืองหลวงโซลเฮเวน (ปลอดภัย)</option>
                                <option value="ตลาดคาราวาน">ตลาดคาราวาน (ปลอดภัย)</option>
                            </optgroup>
                            <optgroup label="🌱 แมพระดับเริ่มต้น (Lv. 1-12)">
                                <option value="สวนนักผจญภัยมือใหม่">สวนนักผจญภัยมือใหม่ (Lv. 1-3)</option>
                                <option value="ทุ่งโคลเวอร์">ทุ่งโคลเวอร์ (Lv. 1-5)</option>
                                <option value="ทุ่งหญ้าตะวันออก">ทุ่งหญ้าตะวันออก (Lv. 1-5)</option>
                                <option value="ไร่ซันเกรน">ไร่ซันเกรน (Lv. 1-6)</option>
                                <option value="ถนนต้นหลิว">ถนนต้นหลิว (Lv. 6-12)</option>
                            </optgroup>
                            <optgroup label="⚔️ แมพยอดนิยมระดับกลาง (Lv. 12-35)">
                                <option value="ทะเลสาบอาซูร์">ทะเลสาบอาซูร์ (Lv. 12-20)</option>
                                <option value="ป่ามูนลีฟ">ป่ามูนลีฟ (Lv. 14-22)</option>
                                <option value="เส้นทางก็อบลิน">เส้นทางก็อบลิน (Lv. 16-20)</option>
                                <option value="เหมืองคริสตัลเก่า">เหมืองคริสตัลเก่า (Lv. 18-28)</option>
                                <option value="ค่ายออร์ค">ค่ายออร์ค (Lv. 22-32)</option>
                                <option value="ถ้ำเอมเบอร์">ถ้ำเอมเบอร์ (Lv. 22-32)</option>
                                <option value="ที่ราบสูงเกล">ที่ราบสูงเกล (Lv. 25-35)</option>
                            </optgroup>
                            <optgroup label="🏔️ แมพระดับกลางสูง (Lv. 30-60)">
                                <option value="แอ่งเวอร์แดนท์">แอ่งเวอร์แดนท์ (Lv. 30-40)</option>
                                <option value="ช่องเขาฟรอสต์พีค">ช่องเขาฟรอสต์พีค (Lv. 35-45)</option>
                                <option value="ชายฝั่งปะการัง">ชายฝั่งปะการัง (Lv. 40-50)</option>
                                <option value="ซากโบราณสถาน">ซากโบราณสถาน (Lv. 45-55)</option>
                                <option value="สุสานเงา">สุสานเงา (Lv. 50-60)</option>
                            </optgroup>
                            <optgroup label="🔥 แมพระดับสูง & แดนอันตราย (Lv. 60-150)">
                                <option value="หนองพิษ">หนองพิษ (Lv. 60-70)</option>
                                <option value="โบสถ์อเวจี">โบสถ์อเวจี (Lv. 80-95)</option>
                                <option value="บึงรากเน่า">บึงรากเน่า (Lv. 90-105)</option>
                                <option value="เนินทรายแผดเผา">เนินทรายแผดเผา (Lv. 100-115)</option>
                                <option value="พีระมิดจมทราย">พีระมิดจมทราย (Lv. 115-130)</option>
                                <option value="แกนลาวา">แกนลาวา (Lv. 135-150)</option>
                            </optgroup>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <button class="p-btn p-btn-loop" id="p-btn-walk-map">🚀 เดินกลับแมพ</button>
                        <button class="p-btn p-btn-map" id="p-btn-open-map">🗺️ เปิดแผนที่โลก</button>
                    </div>

                    <div class="p-card">
                        <label class="p-check-box" style="color: #c084fc;">
                            <input type="checkbox" id="p-auto-jump" ${window.__autoJumpEnabled ? 'checked' : ''}>
                            <span>⚡ Auto-Backflip (พุ่ง 60-260px)</span>
                        </label>
                        <div class="p-row" style="margin-top: 2px;">
                            <span>Target: <b id="p-mon-pos" style="color:#f59e0b; font-size: 10px;">(คลิกมอน)</b></span>
                            <button class="p-btn p-btn-jump" id="p-btn-test-jump" style="width: auto; padding: 2px 8px; font-size: 10px;">⚡ ดีดตัว</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 2: HUNTER / AMMO -->
                <div class="p-tab-pane" id="p-tab-ammo">
                    <div class="p-card" style="border-color: rgba(34, 197, 94, 0.3); background: rgba(34, 197, 94, 0.08);">
                        <div class="p-row">
                            <span>ลูกธนูคงเหลือ (Server):</span>
                            <b id="p-ammo-count" style="color: #22c55e; font-size: 13px;">${window.__currentAmmo} ดอก</b>
                            <div style="display: flex; gap: 3px;">
                                <button id="p-btn-sync-ammo" style="background: #0284c7; color: #fff; border: none; border-radius: 3px; font-size: 9px; cursor: pointer; padding: 2px 6px;">🔄 ซิงก์</button>
                                <button id="p-btn-zero-ammo" style="background: #e11d48; color: #fff; border: none; border-radius: 3px; font-size: 9px; cursor: pointer; padding: 2px 6px;">ตั้งเป็น 0</button>
                            </div>
                        </div>
                    </div>

                    <label class="p-check-box" style="color: #c084fc;">
                        <input type="checkbox" id="p-archer-req" ${window.__archerConfig.requireArrow ? 'checked' : ''}>
                        <b>Require Arrow (เช็ค & ซื้ออัตโนมัติ)</b>
                    </label>

                    <div>
                        <span style="font-size: 10px; color: #94a3b8;">ชนิดลูกธนู:</span>
                        <select id="p-archer-type" class="p-select">
                            <option value="90030" ${parseInt(window.__archerConfig.arrowType) === 90030 ? 'selected' : ''}>Arrow (ธรรมดา - 1z)</option>
                            <option value="90031" ${parseInt(window.__archerConfig.arrowType) === 90031 ? 'selected' : ''}>Fire Arrow (ไฟ - 3z)</option>
                            <option value="90032" ${parseInt(window.__archerConfig.arrowType) === 90032 ? 'selected' : ''}>Crystal Arrow (น้ำ - 3z)</option>
                            <option value="90033" ${parseInt(window.__archerConfig.arrowType) === 90033 ? 'selected' : ''}>Stone Arrow (ดิน - 3z)</option>
                            <option value="90034" ${parseInt(window.__archerConfig.arrowType) === 90034 ? 'selected' : ''}>Arrow of Wind (ลม - 3z)</option>
                            <option value="90035" ${parseInt(window.__archerConfig.arrowType) === 90035 ? 'selected' : ''}>Poison Arrow (พิษ - 3z)</option>
                            <option value="90036" ${parseInt(window.__archerConfig.arrowType) === 90036 ? 'selected' : ''}>Silver Arrow (ศักดิ์สิทธิ์ - 3z)</option>
                            <option value="90037" ${parseInt(window.__archerConfig.arrowType) === 90037 ? 'selected' : ''}>Shadow Arrow (เงา - 3z)</option>
                        </select>
                    </div>

                    <div class="p-row">
                        <span>ตั้งเป้าพกลูกธนู (ซื้อเติมให้ครบ):</span>
                        <input type="number" id="p-archer-qty" value="${window.__archerConfig.arrowBuyQty || 1000}" style="width: 65px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                    </div>

                    <div class="p-row">
                        <span>วาร์ปซื้อเมื่อเหลือ <= (ดอก):</span>
                        <input type="number" id="p-archer-threshold" value="${window.__archerConfig.ammoThreshold || 50}" style="width: 55px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                    </div>

                    <div class="p-card" style="border-color: rgba(56, 189, 248, 0.3);">
                        <label class="p-check-box" style="color: #38bdf8;">
                            <input type="checkbox" id="p-archer-bwing" ${window.__archerConfig.useBwing ? 'checked' : ''}>
                            <b>ใช้วาร์ปกลับเมือง (Butterfly Wing)</b>
                        </label>
                        <div class="p-row" style="margin-top: 3px;">
                            <span>ซื้อ Bwing ติดตัว (ใบ):</span>
                            <input type="number" id="p-archer-bwing-qty" value="${window.__archerConfig.bwingBuyQty || 5}" style="width: 55px; background: #0f172a; border: 1px solid #38bdf8; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                        </div>
                    </div>

                    <div class="p-card" style="border-color: rgba(234, 179, 8, 0.4); background: rgba(234, 179, 8, 0.05);">
                        <span style="font-size: 10px; font-weight: bold; color: #eab308;">🎯 ตรวจสอบ & ดักจับการสวมใส่ (Equip Inspector)</span>
                        <div style="font-size: 9.5px; color: #94a3b8; margin: 2px 0 4px 0; line-height: 1.3;">
                            กดปุ่มด้านล่าง แล้วดับเบิลคลิกสวมใส่ "ลูกธนู" ในเกม เพื่อจับ Packet ของแท้
                        </div>
                        <button class="p-btn" id="p-btn-sniff-equip" style="background: #eab308; color: #000; font-size: 10px; padding: 4px;">🎯 เริ่มดักจับ Packet สวมใส่ (Sniff)</button>
                        <div id="p-sniffer-result" style="display: none; margin-top: 4px; padding: 4px; background: rgba(0,0,0,0.5); border-radius: 4px; border: 1px dashed rgba(234, 179, 8, 0.4);"></div>

                        <button class="p-btn" id="p-btn-equip-bow-arrow" style="background: #10b981; color: #fff; font-size: 11px; padding: 6px; margin-top: 6px; font-weight: bold; border-radius: 4px; border: 1px solid #059669; width: 100%; cursor: pointer;">🏹 สวมใส่คันธนู & ลูกธนูทันที (Equip Bow & Arrow)</button>

                        <label class="p-check-box" style="color: #94a3b8; margin-top: 5px;">
                            <input type="checkbox" id="p-archer-auto-equip" ${window.__archerConfig.autoEquipArrow ? 'checked' : ''}>
                            <span style="font-size: 9.5px;">สวมใส่คันธนู & ลูกธนูอัตโนมัติ (Auto-Equip Bow & Arrow)</span>
                        </label>
                    </div>
                </div>

                <!-- TAB 3: AUTO-SELL & WHITELIST -->
                <div class="p-tab-pane" id="p-tab-sell">
                    <!-- Weight Check Card -->
                    <div class="p-card" style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05); margin-bottom: 6px;">
                        <label class="p-check-box" style="color: #f59e0b;">
                            <input type="checkbox" id="p-weight-check-enabled" ${window.__sellConfig.weightCheckEnabled ? 'checked' : ''}>
                            <b>⚖️ ตรวจสอบน้ำหนักเกิน (Weight Return)</b>
                        </label>
                        <div class="p-row" style="margin-top: 4px;">
                            <span style="font-size: 10px; color: #cbd5e1;">วาร์ปกลับไปขายเมื่อเกิน (%):</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" id="p-weight-threshold" min="10" max="95" value="${window.__sellConfig.weightThreshold || 80}" style="width: 48px; background: #0f172a; border: 1px solid #f59e0b; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                                <span style="font-size: 10px; color: #94a3b8;">%</span>
                            </div>
                        </div>
                        <div id="p-weight-hud-display" style="font-size: 9.5px; color: #94a3b8; margin-top: 3px; display: flex; justify-content: space-between; align-items: center;">
                            <span>น้ำหนัก: <span id="p-cur-weight-val" style="color: #00ffcc; font-weight: bold;">-- / --</span></span>
                            <button id="p-btn-refresh-weight" style="background: #0284c7; color: white; border: none; padding: 2px 7px; border-radius: 4px; font-size: 9px; cursor: pointer; font-weight: bold; transition: all 0.2s ease;">🔄 จัดเรียง & อัปเดต</button>
                        </div>
                    </div>

                    <!-- Shortcut to Market Auto-Sell -->
                    <div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 10px; font-weight: bold; color: #c084fc;">🏷️ ต้องการตั้งขายที่ตลาดกลาง (Market)?</div>
                            <div style="font-size: 8.5px; color: #94a3b8;">แท็บนี้สำหรับขายขยะ NPC</div>
                        </div>
                        <button onclick="window.switchHudTabToMarketAutoSell();" style="background: linear-gradient(135deg, #7c3aed, #9333ea); color: #fff; border: 1px solid #c084fc; padding: 3px 8px; border-radius: 4px; font-size: 9.5px; font-weight: bold; cursor: pointer; white-space: nowrap;">
                            ไปที่ Auto Sell ตลาด ➔
                        </button>
                    </div>

                    <label class="p-check-box" style="color: #facc15;">
                        <input type="checkbox" id="p-sell-enabled" ${window.__sellConfig.enabled ? 'checked' : ''}>
                        <b>เปิดระบบ Auto-Sell คัดกรองอัตโนมัติ (ขายขยะ NPC)</b>
                    </label>

                    <!-- Category Rarity Card -->
                    <div class="p-card" style="border-color: rgba(56, 189, 248, 0.35); background: rgba(15, 23, 42, 0.7); padding: 6px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="font-size: 10px; font-weight: bold; color: #38bdf8; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.2); padding-bottom: 3px; margin-bottom: 1px;">
                            <span>🗂️ แยกขายตามระดับและประเภท</span>
                            <span style="font-size: 8.5px; color: #94a3b8; font-weight: normal;">ระดับไม่เกินที่เลือก</span>
                        </div>

                        <!-- 1. อาวุธ -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">⚔️ อาวุธ:</span>
                            <select id="p-sell-rarity-weap" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="none" ${window.__sellConfig.weaponRarity === 'none' ? 'selected' : ''}>❌ ไม่ขาย</option>
                                <option value="normal" ${window.__sellConfig.weaponRarity === 'normal' ? 'selected' : ''}>⚪ ขาวเท่านั้น (0 Opt)</option>
                                <option value="good" ${window.__sellConfig.weaponRarity === 'good' ? 'selected' : ''}>🟢 ดี (เขียวลงไป)</option>
                                <option value="rare" ${window.__sellConfig.weaponRarity === 'rare' ? 'selected' : ''}>🔵 หายาก (ฟ้าลงไป)</option>
                                <option value="epic" ${window.__sellConfig.weaponRarity === 'epic' ? 'selected' : ''}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                            </select>
                        </div>

                        <!-- 2. ชุดเกราะ -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">🛡️ ชุดเกราะ:</span>
                            <select id="p-sell-rarity-armor" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="none" ${window.__sellConfig.armorRarity === 'none' ? 'selected' : ''}>❌ ไม่ขาย</option>
                                <option value="normal" ${window.__sellConfig.armorRarity === 'normal' ? 'selected' : ''}>⚪ ขาวเท่านั้น (0 Opt)</option>
                                <option value="good" ${window.__sellConfig.armorRarity === 'good' ? 'selected' : ''}>🟢 ดี (เขียวลงไป)</option>
                                <option value="rare" ${window.__sellConfig.armorRarity === 'rare' ? 'selected' : ''}>🔵 หายาก (ฟ้าลงไป)</option>
                                <option value="epic" ${window.__sellConfig.armorRarity === 'epic' ? 'selected' : ''}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                            </select>
                        </div>

                        <!-- 3. ประดับ/เจม -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">💍 ประดับ/เจม:</span>
                            <select id="p-sell-rarity-acc" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="none" ${window.__sellConfig.accRarity === 'none' ? 'selected' : ''}>❌ ไม่ขาย</option>
                                <option value="normal" ${window.__sellConfig.accRarity === 'normal' ? 'selected' : ''}>⚪ ขาวเท่านั้น (0 Opt)</option>
                                <option value="good" ${window.__sellConfig.accRarity === 'good' ? 'selected' : ''}>🟢 ดี (เขียวลงไป)</option>
                                <option value="rare" ${window.__sellConfig.accRarity === 'rare' ? 'selected' : ''}>🔵 หายาก (ฟ้าลงไป)</option>
                                <option value="epic" ${window.__sellConfig.accRarity === 'epic' ? 'selected' : ''}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                            </select>
                        </div>

                        <!-- 4. วัตถุดิบ -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">🌿 วัตถุดิบ:</span>
                            <select id="p-sell-rarity-mat" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="all" ${window.__sellConfig.sellMaterials ? 'selected' : ''}>🧺 ขายขยะทั้งหมด</option>
                                <option value="none" ${!window.__sellConfig.sellMaterials ? 'selected' : ''}>❌ ไม่ขาย</option>
                            </select>
                        </div>
                    </div>

                    <!-- Safety Locks Card -->
                    <div class="p-card" style="border-color: rgba(239, 68, 68, 0.35); background: rgba(15, 23, 42, 0.65); padding: 5px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="font-size: 10px; font-weight: bold; color: #f87171; border-bottom: 1px solid rgba(239, 68, 68, 0.2); padding-bottom: 2px;">
                            🔒 ล็อกความปลอดภัย (ห้ามขายเด็ดขาด)
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                            <label class="p-check-box" style="color: #ef4444;" title="ห้ามขายของที่ผ่านการตีบวก (+1 ขึ้นไป)">
                                <input type="checkbox" id="p-sell-keep-refined" ${window.__sellConfig.keepRefined ? 'checked' : ''}>
                                <span>🔨 ล็อกของตีบวก</span>
                            </label>
                            <label class="p-check-box" style="color: #c084fc;" title="ห้ามขายของที่มี Option สุ่ม">
                                <input type="checkbox" id="p-sell-keep-special" ${window.__sellConfig.keepSpecial ? 'checked' : ''}>
                                <span>🔒 ล็อกของมี Option</span>
                            </label>
                        </div>
                        <label class="p-check-box" style="color: #38bdf8;" title="ห้ามขายของที่มีรูใส่การ์ด [1-4]">
                            <input type="checkbox" id="p-sell-keep-sockets" ${window.__sellConfig.keepSockets ? 'checked' : ''}>
                            <span>🕳️ ล็อกของมีรูการ์ด [1-4]</span>
                        </label>
                    </div>

                    <!-- Whitelist Card -->
                    <div>
                        <span style="font-size: 10px; color: #94a3b8; display: block; margin-bottom: 2px;">🛡️ Whitelist ห้ามขาย (ชื่อไอเทมคั่นด้วย ,):</span>
                        <textarea id="p-sell-whitelist" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(234, 179, 8, 0.4); color: #fff; border-radius: 4px; font-size: 9.5px; height: 34px; resize: vertical; padding: 3px;">${window.__sellConfig.whitelist || ''}</textarea>
                    </div>

                    <button class="p-btn" id="p-btn-test-sell-only" style="background: #ca8a04; color: #fff; font-weight: bold; margin-top: 2px;">🧺 ทดสอบขายของในร้านค้า (Sell Test)</button>
                </div>

                <!-- TAB 4: MARKET & STAT SNIPER -->
                <div class="p-tab-pane" id="p-tab-market">
                    <!-- Sub-Navigation: Auto Sell vs Sniper -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px; background: rgba(0,0,0,0.4); padding: 2px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                        <button id="p-subtab-btn-autosell" onclick="window.switchMarketSubTab('autosell')"
                            style="padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; border: none; background: #9333ea; color: #fff; transition: all 0.2s;">
                            🏷️ Auto Sell ตั้งขาย (<span id="p-subtab-autosell-count">${(window.__autoMarketSellConfig?.rules || []).length}</span>)
                        </button>
                        <button id="p-subtab-btn-sniper" onclick="window.switchMarketSubTab('sniper')"
                            style="padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; border: none; background: transparent; color: #94a3b8; transition: all 0.2s;">
                            🎯 Sniper ค้นหาซื้อ
                        </button>
                    </div>

                    <!-- VIEW 1: AUTO SELL TO MARKET -->
                    <div id="p-market-view-autosell" style="display: block;">
                        <!-- Auto Sell Main Card -->
                        <div class="p-card" style="border-color: rgba(168, 85, 247, 0.45); background: rgba(168, 85, 247, 0.08); padding: 6px; margin-bottom: 5px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(168, 85, 247, 0.25); padding-bottom: 3px; margin-bottom: 4px;">
                                <label class="p-check-box" style="color: #c084fc; margin: 0; font-size: 10.5px;">
                                    <input type="checkbox" id="p-autosell-toggle-hud" ${(window.__autoMarketSellConfig?.enabled) ? 'checked' : ''} onchange="window.toggleAutoMarketSell(this.checked)">
                                    <b>เปิดใช้งาน Auto Sell</b>
                                </label>
                                <span id="p-autosell-quota-badge-hud" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 0 4px; border-radius: 3px; font-size: 9px; font-weight: bold;">
                                    โควตา: ${window.__myMarketActiveCount ?? 0}/10
                                </span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #d8b4fe; margin-bottom: 4px;">
                                <span>⚖️ กลยุทธ์: <b>ราคากลางสมดุล (Market Median)</b></span>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                                <button onclick="window.addAutoMarketSellRule();" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: 1px solid #34d399; padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px;">
                                    <span>➕</span> <span>เพิ่มรายการลงขาย</span>
                                </button>
                                <button onclick="window.runAutoMarketSellCycle(true);" style="background: #0284c7; color: #fff; border: none; padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;" title="ตรวจสอบกระเป๋าและประเมินราคาทันที">
                                    ⚡ ตรวจสอบทันที
                                </button>
                            </div>
                        </div>

                        <!-- Rules List in HUD -->
                        <div id="p-autosell-hud-rules-container" style="max-height: 250px; overflow-y: auto;">
                            ${(typeof window.renderAutoSellHudRulesHtml === 'function') ? window.renderAutoSellHudRulesHtml() : ''}
                        </div>

                        <!-- Open Full Modal Button -->
                        <div style="margin-top: 5px;">
                            <button onclick="window.showDataViewerModal('market');" style="width: 100%; background: #1e293b; color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); padding: 4px; border-radius: 4px; font-size: 9.5px; font-weight: bold; cursor: pointer;">
                                🔎 จัดการรายการแบบตารางเต็มจอ (Data Hub)
                            </button>
                        </div>
                    </div>

                    <!-- VIEW 2: SNIPER & SEARCH (Original) -->
                    <div id="p-market-view-sniper" style="display: none;">
                        <!-- Quick Search Card -->
                        <div class="p-card" style="border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.2); padding-bottom: 2px; margin-bottom: 3px;">
                                <span style="font-size: 10px; font-weight: bold; color: #38bdf8;">🔍 ค้นหาไอเทมตลาดกลาง</span>
                                <span id="p-mk-server-count-badge" style="font-size: 8.5px; color: #94a3b8;">Server Sync</span>
                            </div>
                            <div>
                                <input type="text" id="p-mk-search-query" value="${window.__marketFilterConfig.q || ''}" placeholder="ค้นหาชื่อไอเทม (เช่น Bow, Ring, Dagger)..." style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(56, 189, 248, 0.35); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 3px;">
                                <select id="p-mk-cat-select" class="p-select" style="font-size: 10px; padding: 2px 4px;">
                                    <option value="" ${window.__marketFilterConfig.category === '' ? 'selected' : ''}>ทุกหมวดหมู่</option>
                                    <option value="Weapon" ${window.__marketFilterConfig.category === 'Weapon' ? 'selected' : ''}>⚔️ อาวุธ</option>
                                    <option value="Armor" ${window.__marketFilterConfig.category === 'Armor' ? 'selected' : ''}>🛡️ ชุดเกราะ</option>
                                    <option value="Accessory" ${window.__marketFilterConfig.category === 'Accessory' ? 'selected' : ''}>💍 ประดับ/เจม</option>
                                    <option value="Card" ${window.__marketFilterConfig.category === 'Card' ? 'selected' : ''}>🎴 การ์ด</option>
                                    <option value="Ammo" ${window.__marketFilterConfig.category === 'Ammo' ? 'selected' : ''}>🏹 ลูกธนู</option>
                                </select>
                                <select id="p-mk-kind-select" class="p-select" style="font-size: 10px; padding: 2px 4px;">
                                    <option value="" ${window.__marketFilterConfig.kind === '' ? 'selected' : ''}>ทุกประเภท</option>
                                    <option value="bow" ${window.__marketFilterConfig.kind === 'bow' ? 'selected' : ''}>ธนู (Bow)</option>
                                    <option value="dagger" ${window.__marketFilterConfig.kind === 'dagger' ? 'selected' : ''}>มีด (Dagger)</option>
                                    <option value="sword" ${window.__marketFilterConfig.kind === 'sword' ? 'selected' : ''}>ดาบ (Sword)</option>
                                    <option value="spear" ${window.__marketFilterConfig.kind === 'spear' ? 'selected' : ''}>หอก (Spear)</option>
                                    <option value="axe" ${window.__marketFilterConfig.kind === 'axe' ? 'selected' : ''}>ขวาน (Axe)</option>
                                    <option value="staff" ${window.__marketFilterConfig.kind === 'staff' ? 'selected' : ''}>คทา (Staff)</option>
                                    <option value="shield" ${window.__marketFilterConfig.kind === 'shield' ? 'selected' : ''}>โล่ (Shield)</option>
                                    <option value="armor" ${window.__marketFilterConfig.kind === 'armor' ? 'selected' : ''}>ชุดเกราะ (Armor)</option>
                                    <option value="boot" ${window.__marketFilterConfig.kind === 'boot' ? 'selected' : ''}>รองเท้า (Boots)</option>
                                    <option value="cape" ${window.__marketFilterConfig.kind === 'cape' ? 'selected' : ''}>ผ้าคลุม (Cape)</option>
                                    <option value="ring" ${window.__marketFilterConfig.kind === 'ring' ? 'selected' : ''}>แหวน (Ring)</option>
                                </select>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 3px;">
                                <div class="p-row">
                                    <span style="font-size: 9.5px; color: #cbd5e1;">ตีบวก ≥:</span>
                                    <input type="number" id="p-mk-min-refine" min="0" max="15" value="${window.__marketFilterConfig.minRefine || 0}" style="width: 42px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 10px; padding: 1px;">
                                </div>
                                <div class="p-row">
                                    <span style="font-size: 9.5px; color: #cbd5e1;">งบสูงสุด:</span>
                                    <input type="number" id="p-mk-max-price" value="${window.__marketFilterConfig.maxPrice || 0}" placeholder="0=ไม่จำกัด" style="width: 58px; background: #0f172a; border: 1px solid #00ffcc; color: #00ffcc; text-align: right; border-radius: 4px; font-size: 10px; padding: 1px;">
                                </div>
                            </div>
                        </div>

                        <!-- Deep Stat & Affix Filter Card -->
                        <div class="p-card" style="border-color: rgba(234, 179, 8, 0.4); background: rgba(234, 179, 8, 0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(234, 179, 8, 0.2); padding-bottom: 2px;">
                                <span style="font-size: 10px; font-weight: bold; color: #f59e0b;">💎 ตัวกรอง Option (Stat Filter)</span>
                                <span style="font-size: 8.5px; color: #94a3b8;">ลึกถึง Option สุ่ม</span>
                            </div>
                            <!-- Option 1 -->
                            <div class="p-row" style="margin-top: 2px;">
                                <span style="font-size: 9.5px; color: #fde047;">Opt 1:</span>
                                <select id="p-mk-stat1-type" class="p-select" style="width: 120px; font-size: 9.5px; padding: 1px 3px;">
                                    ${(typeof getMarketStatSelectOptionsHtml === 'function' ? getMarketStatSelectOptionsHtml(window.__marketFilterConfig.statType1) : (typeof window.getMarketStatSelectOptionsHtml === 'function' ? window.getMarketStatSelectOptionsHtml(window.__marketFilterConfig.statType1) : ''))}
                                </select>
                                <input type="number" id="p-mk-stat1-min" value="${window.__marketFilterConfig.statMinVal1 || 1}" min="1" style="width: 38px; background: #0f172a; border: 1px solid #f59e0b; color: #fff; text-align: center; border-radius: 4px; font-size: 10px; padding: 1px;">
                            </div>
                            <!-- Option 2 -->
                            <div class="p-row">
                                <span style="font-size: 9.5px; color: #c084fc;">Opt 2:</span>
                                <select id="p-mk-stat2-type" class="p-select" style="width: 120px; font-size: 9.5px; padding: 1px 3px;">
                                    ${(typeof getMarketStatSelectOptionsHtml === 'function' ? getMarketStatSelectOptionsHtml(window.__marketFilterConfig.statType2) : (typeof window.getMarketStatSelectOptionsHtml === 'function' ? window.getMarketStatSelectOptionsHtml(window.__marketFilterConfig.statType2) : ''))}
                                </select>
                                <input type="number" id="p-mk-stat2-min" value="${window.__marketFilterConfig.statMinVal2 || 1}" min="1" style="width: 38px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 10px; padding: 1px;">
                            </div>
                            <div class="p-row">
                                <span style="font-size: 9px; color: #94a3b8;">เงื่อนไข:</span>
                                <select id="p-mk-stat-mode" class="p-select" style="width: 90px; font-size: 9px; padding: 1px 3px;">
                                    <option value="AND" ${window.__marketFilterConfig.statMatchMode === 'AND' ? 'selected' : ''}>AND (ครบทุก Opt)</option>
                                    <option value="OR" ${window.__marketFilterConfig.statMatchMode === 'OR' ? 'selected' : ''}>OR (อย่างน้อย 1 Opt)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Sniper & Auto-Buy Card -->
                        <div class="p-card" style="border-color: rgba(168, 85, 247, 0.35); background: rgba(168, 85, 247, 0.05);">
                            <label class="p-check-box" style="color: #f59e0b;">
                                <input type="checkbox" id="p-mk-sniper-alert" ${window.__marketFilterConfig.sniperAlert ? 'checked' : ''}>
                                <b>🎯 เสียงเตือนเมื่อพบของตรงสเปค</b>
                            </label>
                            <label class="p-check-box" style="color: #4ade80; margin-top: 2px;">
                                <input type="checkbox" id="p-mk-auto-buy" ${window.__marketFilterConfig.autoBuy ? 'checked' : ''}>
                                <b>⚡ Auto-Buy Sniper (ซื้อทันทีเมื่อพบ)</b>
                            </label>
                        </div>

                        <!-- Action Buttons -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                            <button class="p-btn" id="p-btn-mk-search" style="background: #0284c7; color: #fff; font-size: 10.5px; padding: 5px;">🔍 ค้นหาตลาด</button>
                            <button class="p-btn" id="p-btn-mk-scan" style="background: #9333ea; color: #fff; font-size: 10.5px; padding: 5px;">⚡ สแกนทุกหน้า</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                            <button class="p-btn" id="p-btn-mk-open-modal" style="background: #0d9488; color: #fff; font-size: 10px; padding: 4px;">🔎 ตลาดเต็มจอ</button>
                            <button class="p-btn" id="p-btn-mk-copy-json" style="background: #334155; color: #38bdf8; font-size: 10px; padding: 4px; border: 1px solid rgba(56,189,248,0.3);">📋 Dump JSON</button>
                        </div>

                        <!-- Live Results Section -->
                        <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 4px;">
                            <div style="font-size: 10px; color: #38bdf8; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span>📦 รายการตรงสเปค (<span id="p-mk-result-count" style="color: #00ffcc;">0</span>)</span>
                                <span style="font-size: 9px; color: #94a3b8;">1-Click Buy</span>
                            </div>
                            <div id="p-mk-hud-results" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;">
                                <div style="text-align: center; color: #64748b; padding: 12px 6px; font-size: 10px;">
                                    ยังไม่มีผลการค้นหา<br/><span style="color: #475569;">กดปุ่ม '🔍 ค้นหาตลาด' เพื่อเริ่ม</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: SYSTEM & TOOLS -->
                <div class="p-tab-pane" id="p-tab-system">
                    <!-- Auto-Login & Account Card -->
                    <div class="p-card" style="border-color: rgba(168, 85, 247, 0.4); background: rgba(168, 85, 247, 0.06); margin-bottom: 6px;">
                        <label class="p-check-box" style="color: #c084fc;">
                            <input type="checkbox" id="p-auth-enabled" ${window.__authConfig.enabled ? 'checked' : ''}>
                            <b>🔐 เปิดระบบ Auto-Login (เข้าเกมอัตโนมัติ)</b>
                        </label>
                        <div style="font-size: 9.5px; color: #94a3b8; margin: 3px 0 6px 0; line-height: 1.3;">
                            เมื่อเกมหลุดหรือเด้งไปหน้า Login บอทจะกรอก ID/PS และเข้าเกมให้อัตโนมัติ
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div class="p-row">
                                <span style="font-size: 10px; color: #cbd5e1;">ชื่อผู้ใช้ (ID):</span>
                                <input type="text" id="p-auth-user" value="${window.__authConfig.username || ''}" placeholder="ชื่อผู้ใช้ / ID" style="width: 130px; background: #0f172a; border: 1px solid rgba(192, 132, 252, 0.5); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                            </div>
                            <div class="p-row">
                                <span style="font-size: 10px; color: #cbd5e1;">รหัสผ่าน (PS):</span>
                                <div style="display: flex; align-items: center; gap: 3px;">
                                    <input type="password" id="p-auth-pass" value="${window.__authConfig.password || ''}" placeholder="รหัสผ่าน" style="width: 105px; background: #0f172a; border: 1px solid rgba(192, 132, 252, 0.5); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                                    <button type="button" id="p-auth-toggle-pass" style="background: rgba(15, 23, 42, 0.8); border: 1px solid #64748b; color: #94a3b8; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;" title="แสดง/ซ่อนรหัสผ่าน">👁️</button>
                                </div>
                            </div>
                            <div class="p-row">
                                <span style="font-size: 10px; color: #cbd5e1;">เลือกตัวละคร (Char):</span>
                                <input type="text" id="p-auth-char" value="${window.__authConfig.charName || ''}" placeholder="ชื่อตัวละคร (เว้นว่าง = ตัวแรก)" style="width: 130px; background: #0f172a; border: 1px solid rgba(192, 132, 252, 0.5); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                            </div>
                        </div>

                        <label class="p-check-box" style="color: #4ade80; margin-top: 6px;">
                            <input type="checkbox" id="p-auth-resume" ${window.__authConfig.autoResumeBot ? 'checked' : ''}>
                            <span style="font-size: 9.5px;">เริ่มทำงานบอทต่อทันทีเมื่อ Login สำเร็จ (Auto-Resume)</span>
                        </label>

                        <button class="p-btn" id="p-btn-test-login" style="background: #9333ea; color: #fff; font-size: 10.5px; padding: 5px; margin-top: 6px; font-weight: bold; border-radius: 4px; border: 1px solid #a855f7; width: 100%; cursor: pointer;">🔑 ทดสอบเข้าสู่ระบบทันที (Test Login)</button>
                    </div>

                    <div class="p-card" style="border-color: rgba(56, 189, 248, 0.3);">
                        <label class="p-check-box" style="color: #38bdf8;">
                            <input type="checkbox" id="p-shop-enabled" ${window.__shopConfig.enabled ? 'checked' : ''}>
                            <b>เปิดระบบ Auto-Shop</b>
                        </label>
                        <div class="p-row" style="margin-top: 3px;">
                            <span>NPC Key:</span>
                            <input type="text" id="p-shop-npckey" value="${window.__shopConfig.npcKey}" style="width: 55px; background: #0f172a; border: 1px solid #38bdf8; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                        </div>
                        <button class="p-btn" id="p-btn-test-shop" style="background: #f59e0b; color: #000; font-weight: bold; margin-top: 4px;">🛍️ ทดสอบ Routine ร้านค้า (Shop Routine)</button>
                    </div>

                    
                    <div class="p-card" style="border-color: rgba(168, 85, 247, 0.35); background: rgba(168, 85, 247, 0.05);">
                        <span style="font-size: 10.5px; font-weight: bold; color: #c084fc;">💾 สำรอง & ถ่ายโอนการตั้งค่า (Settings & Config)</span>
                        <div style="font-size: 9px; color: #94a3b8; margin: 2px 0 5px 0;">
                            ส่งออกหรือนำเข้าการตั้งค่าทั้งหมด (ยกเว้น ID / Password เพื่อความปลอดภัย)
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                            <button class="p-btn" id="p-btn-export-cfg" style="background: linear-gradient(135deg, #7c3aed, #9333ea); color: #fff; font-size: 10px; font-weight: bold; padding: 5px;">📤 Export Config (JSON)</button>
                            <button class="p-btn" id="p-btn-import-cfg" style="background: #0284c7; color: #fff; font-size: 10px; font-weight: bold; padding: 5px;">📥 Import Config (นำเข้า)</button>
                        </div>
                    </div>
                    <div class="p-card" style="border-color: rgba(34, 197, 94, 0.3);">
                        <span style="font-size: 10.5px; font-weight: bold; color: #22c55e;">📥 Data Dumper (ดึง/ส่งออกข้อมูล)</span>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 2px;">
                            <button class="p-btn" id="p-btn-dump-map" style="background: #0284c7; color: #fff; padding: 4px; font-size: 10px;">🗺️ Dump แมพ (25 โซน)</button>
                            <button class="p-btn" id="p-btn-dump-item" style="background: #7c3aed; color: #fff; padding: 4px; font-size: 10px;">📦 Dump ไอเทม</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 3px;">
                            <button class="p-btn" id="p-btn-dump-packets" style="background: #e11d48; color: #fff; padding: 4px; font-size: 10px;">📜 Dump Packet</button>
                            <button class="p-btn" id="p-btn-dump-state" style="background: #059669; color: #fff; padding: 4px; font-size: 10px;">🕹️ Dump State</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 3px;">
                            <button class="p-btn" id="p-btn-dump-market" style="background: #ec4899; color: #fff; font-weight: bold; padding: 4px; font-size: 10px;">🛒 Dump ตลาดกลาง</button>
                            <button class="p-btn" id="p-btn-dump-weight" style="background: #f59e0b; color: #000; font-weight: bold; padding: 4px; font-size: 10px;">⚖️ Dump น้ำหนัก DOM & กระเป๋า</button>
                        </div>
                    </div>

                    <button class="p-btn p-btn-copy-out" id="p-btn-copy-out" style="margin-top: 2px;">📋 คัดลอก Packet ขาออก (Hex เต็ม)</button>
                </div>
            </div>
        `;

        document.body.appendChild(hud);

        // Tab Navigation Switcher
        const tabBtns = hud.querySelectorAll('.p-tab-btn');
        const tabPanes = hud.querySelectorAll('.p-tab-pane');
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const targetTab = btn.getAttribute('data-tab');
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const activePane = hud.querySelector(`#p-tab-${targetTab}`);
                if (activePane) activePane.classList.add('active');
                localStorage.setItem('pelican_active_tab', targetTab);
                if (targetTab === 'market') {
                    if (typeof window.switchMarketSubTab === 'function') {
                        const savedSub = localStorage.getItem('pelican_market_subtab') || 'autosell';
                        window.switchMarketSubTab(savedSub);
                    }
                }
            };
        });
        const savedTab = localStorage.getItem('pelican_active_tab') || 'farm';
        const defaultBtn = hud.querySelector(`.p-tab-btn[data-tab="${savedTab}"]`);
        if (defaultBtn) defaultBtn.click();

        const selectEl = document.getElementById('p-target-map-select');
        if (selectEl) {
            selectEl.value = window.__targetFarmMap;
            selectEl.onchange = (e) => {
                window.__targetFarmMap = e.target.value;
                localStorage.setItem('pelican_farm_map', window.__targetFarmMap);
            };
        }

        document.getElementById('p-auto-loop').onchange = (e) => {
            window.__autoLoopEnabled = e.target.checked;
            localStorage.setItem('pelican_auto_loop', window.__autoLoopEnabled);
        };

        document.getElementById('p-auto-jump').onchange = (e) => {
            window.__autoJumpEnabled = e.target.checked;
            localStorage.setItem('pelican_auto_jump', window.__autoJumpEnabled);
        };

        
        const btnExportCfg = document.getElementById('p-btn-export-cfg');
        if (btnExportCfg) {
            btnExportCfg.onclick = () => window.openConfigExportModal('export');
        }

        const btnImportCfg = document.getElementById('p-btn-import-cfg');
        if (btnImportCfg) {
            btnImportCfg.onclick = () => window.openConfigExportModal('import');
        }
        document.getElementById('p-btn-copy-out').onclick = () => {
            window.copyOutgoingLogs(10);
        };

        // Data Dumper Event Listeners
        const dumpMapBtn = document.getElementById('p-btn-dump-map');
        if (dumpMapBtn) dumpMapBtn.onclick = () => { window.dumpMapData(); window.showDataViewerModal("maps"); };

        const dumpItemBtn = document.getElementById('p-btn-dump-item');
        if (dumpItemBtn) dumpItemBtn.onclick = () => { window.dumpItemData(); window.showDataViewerModal("items"); };

        const dumpPacketsBtn = document.getElementById('p-btn-dump-packets');
        if (dumpPacketsBtn) dumpPacketsBtn.onclick = () => { window.dumpAllPackets(100); window.showDataViewerModal("packets"); };

        const dumpStateBtn = document.getElementById('p-btn-dump-state');
        if (dumpStateBtn) dumpStateBtn.onclick = () => { window.dumpGameState(); window.showDataViewerModal("state"); };

        const dumpWeightBtn = document.getElementById('p-btn-dump-weight');
        if (dumpWeightBtn) {
            dumpWeightBtn.onclick = () => {
                const res = window.dumpWeightDebug();
                const modal = document.getElementById('pelican-data-modal');
                if (modal) {
                    document.getElementById('p-modal-title').innerText = '⚖️ DOM Weight Debug Dump';
                    document.getElementById('p-modal-raw-json').value = JSON.stringify(res, null, 2);
                    modal.style.display = 'flex';
                }
            };
        }

        document.getElementById('p-btn-test-jump').onclick = () => {
            if (window.__monsterPos) {
                window.executeReverseBackflip(window.__monsterPos.x, window.__monsterPos.y);
            } else {
                console.warn('[Pelican] ยังไม่มีเป้าหมายมอนสเตอร์ ลองคลิกมอนบนจอก่อนครับ');
                window.pressKey('2');
            }
        };

        document.getElementById('p-btn-open-map').onclick = () => {
            openWorldMap();
        };

        document.getElementById('p-btn-walk-map').onclick = () => {
            const select = document.getElementById('p-target-map-select');
            const targetMap = (select ? select.value : '') || window.__targetFarmMap;
            window.walkToTargetMap(targetMap, true);
        };

        document.getElementById('p-btn-toggle-bot').onclick = () => {
            window.toggleMasterBot();
        };

        document.getElementById('p-shop-enabled').onchange = (e) => {
            window.__shopConfig.enabled = e.target.checked;
            saveShopConfig();
        };

        document.getElementById('p-shop-npckey').onchange = (e) => {
            window.__shopConfig.npcKey = e.target.value.trim();
            saveShopConfig();
        };

        document.getElementById('p-btn-test-shop').onclick = () => {
            window.executeAutoShopRoutine();
        };

        // Auto-Login Event Listeners
        const authEnabledEl = document.getElementById('p-auth-enabled');
        if (authEnabledEl) {
            authEnabledEl.onchange = (e) => {
                window.__authConfig.enabled = e.target.checked;
                saveAuthConfig();
            };
        }

        const authUserEl = document.getElementById('p-auth-user');
        if (authUserEl) {
            authUserEl.oninput = (e) => {
                window.__authConfig.username = e.target.value.trim();
                saveAuthConfig();
            };
        }

        const authPassEl = document.getElementById('p-auth-pass');
        if (authPassEl) {
            authPassEl.oninput = (e) => {
                window.__authConfig.password = e.target.value;
                saveAuthConfig();
            };
        }

        const authCharEl = document.getElementById('p-auth-char');
        if (authCharEl) {
            authCharEl.oninput = (e) => {
                window.__authConfig.charName = e.target.value.trim();
                saveAuthConfig();
            };
        }

        const authTogglePassEl = document.getElementById('p-auth-toggle-pass');
        if (authTogglePassEl && authPassEl) {
            authTogglePassEl.onclick = () => {
                authPassEl.type = authPassEl.type === 'password' ? 'text' : 'password';
            };
        }

        const authResumeEl = document.getElementById('p-auth-resume');
        if (authResumeEl) {
            authResumeEl.onchange = (e) => {
                window.__authConfig.autoResumeBot = e.target.checked;
                saveAuthConfig();
            };
        }

        const btnTestLogin = document.getElementById('p-btn-test-login');
        if (btnTestLogin) {
            btnTestLogin.onclick = () => {
                console.log('%c[Pelican Auth] 🔑 ทดสอบกระบวนการ Login ด้วยตนเอง...', 'color: #c084fc; font-weight: bold;');
                window.executeAutoLogin(true);
            };
        }

        // Auto-Sell & Whitelist Event Listeners
        const weightCheckEl = document.getElementById('p-weight-check-enabled');
        if (weightCheckEl) {
            weightCheckEl.onchange = (e) => {
                window.__sellConfig.weightCheckEnabled = e.target.checked;
                saveSellConfig();
            };
        }

        const weightThresholdEl = document.getElementById('p-weight-threshold');
        if (weightThresholdEl) {
            weightThresholdEl.onchange = (e) => {
                window.__sellConfig.weightThreshold = parseInt(e.target.value) || 80;
                saveSellConfig();
            };
        }

        const btnRefreshWeight = document.getElementById('p-btn-refresh-weight');
        if (btnRefreshWeight) {
            btnRefreshWeight.onclick = () => {
                btnRefreshWeight.innerText = '⏳ จัดเรียง...';
                btnRefreshWeight.style.opacity = '0.7';
                window.refreshInventoryAndWeight((w) => {
                    if (w && typeof w.percent === 'number') {
                        btnRefreshWeight.innerText = `✅ ${w.percent}%`;
                    } else {
                        btnRefreshWeight.innerText = '✅ เรียบร้อย';
                    }
                    btnRefreshWeight.style.opacity = '1';
                    setTimeout(() => {
                        btnRefreshWeight.innerText = '🔄 จัดเรียง & อัปเดต';
                    }, 1500);
                });
            };
        }

        const quickWeightEl = document.getElementById('p-quick-weight');
        if (quickWeightEl) {
            quickWeightEl.onclick = () => {
                const oldText = quickWeightEl.innerText;
                quickWeightEl.innerText = '⚖️ ⏳...';
                quickWeightEl.style.opacity = '0.7';
                window.refreshInventoryAndWeight((w) => {
                    quickWeightEl.style.opacity = '1';
                    if (w && typeof w.percent === 'number') {
                        quickWeightEl.innerText = `⚖️ ${w.percent}%`;
                    } else {
                        quickWeightEl.innerText = oldText;
                    }
                });
            };
        }

        document.getElementById('p-sell-enabled').onchange = (e) => {
            window.__sellConfig.enabled = e.target.checked;
            saveSellConfig();
        };

        const sellWeapEl = document.getElementById('p-sell-rarity-weap');
        if (sellWeapEl) {
            sellWeapEl.onchange = (e) => {
                window.__sellConfig.weaponRarity = e.target.value;
                window.__sellConfig.sellWeapons = e.target.value !== 'none';
                saveSellConfig();
            };
        }

        const sellArmorEl = document.getElementById('p-sell-rarity-armor');
        if (sellArmorEl) {
            sellArmorEl.onchange = (e) => {
                window.__sellConfig.armorRarity = e.target.value;
                window.__sellConfig.sellArmors = e.target.value !== 'none';
                saveSellConfig();
            };
        }

        const sellAccEl = document.getElementById('p-sell-rarity-acc');
        if (sellAccEl) {
            sellAccEl.onchange = (e) => {
                window.__sellConfig.accRarity = e.target.value;
                saveSellConfig();
            };
        }

        const sellMatEl = document.getElementById('p-sell-rarity-mat');
        if (sellMatEl) {
            sellMatEl.onchange = (e) => {
                window.__sellConfig.sellMaterials = (e.target.value === 'all');
                saveSellConfig();
            };
        }

        const sellRefinedEl = document.getElementById('p-sell-keep-refined');
        if (sellRefinedEl) {
            sellRefinedEl.onchange = (e) => {
                window.__sellConfig.keepRefined = e.target.checked;
                saveSellConfig();
            };
        }

        document.getElementById('p-sell-keep-special').onchange = (e) => {
            window.__sellConfig.keepSpecial = e.target.checked;
            saveSellConfig();
        };

        const sellSocketsEl = document.getElementById('p-sell-keep-sockets');
        if (sellSocketsEl) {
            sellSocketsEl.onchange = (e) => {
                window.__sellConfig.keepSockets = e.target.checked;
                saveSellConfig();
            };
        }

        document.getElementById('p-sell-whitelist').onchange = (e) => {
            window.__sellConfig.whitelist = e.target.value;
            saveSellConfig();
        };

        document.getElementById('p-btn-test-sell-only').onclick = () => {
            window.testSellTrash();
        };

        // Market Finder Event Listeners
        const mkSearchQueryEl = document.getElementById('p-mk-search-query');
        if (mkSearchQueryEl) {
            mkSearchQueryEl.onchange = (e) => {
                window.__marketFilterConfig.q = e.target.value.trim();
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkCatSelectEl = document.getElementById('p-mk-cat-select');
        if (mkCatSelectEl) {
            mkCatSelectEl.onchange = (e) => {
                window.__marketFilterConfig.category = e.target.value;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkKindSelectEl = document.getElementById('p-mk-kind-select');
        if (mkKindSelectEl) {
            mkKindSelectEl.onchange = (e) => {
                window.__marketFilterConfig.kind = e.target.value;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkMinRefineEl = document.getElementById('p-mk-min-refine');
        if (mkMinRefineEl) {
            mkMinRefineEl.onchange = (e) => {
                window.__marketFilterConfig.minRefine = parseInt(e.target.value) || 0;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkMaxPriceEl = document.getElementById('p-mk-max-price');
        if (mkMaxPriceEl) {
            mkMaxPriceEl.onchange = (e) => {
                window.__marketFilterConfig.maxPrice = parseInt(e.target.value) || 0;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkStat1TypeEl = document.getElementById('p-mk-stat1-type');
        if (mkStat1TypeEl) {
            mkStat1TypeEl.onchange = (e) => {
                window.__marketFilterConfig.statType1 = e.target.value;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkStat1MinEl = document.getElementById('p-mk-stat1-min');
        if (mkStat1MinEl) {
            mkStat1MinEl.onchange = (e) => {
                window.__marketFilterConfig.statMinVal1 = parseInt(e.target.value) || 1;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkStat2TypeEl = document.getElementById('p-mk-stat2-type');
        if (mkStat2TypeEl) {
            mkStat2TypeEl.onchange = (e) => {
                window.__marketFilterConfig.statType2 = e.target.value;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkStat2MinEl = document.getElementById('p-mk-stat2-min');
        if (mkStat2MinEl) {
            mkStat2MinEl.onchange = (e) => {
                window.__marketFilterConfig.statMinVal2 = parseInt(e.target.value) || 1;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkStatModeEl = document.getElementById('p-mk-stat-mode');
        if (mkStatModeEl) {
            mkStatModeEl.onchange = (e) => {
                window.__marketFilterConfig.statMatchMode = e.target.value;
                saveMarketFilterConfig();
                window.applyMarketFilters();
            };
        }

        const mkSniperAlertEl = document.getElementById('p-mk-sniper-alert');
        if (mkSniperAlertEl) {
            mkSniperAlertEl.onchange = (e) => {
                window.__marketFilterConfig.sniperAlert = e.target.checked;
                saveMarketFilterConfig();
            };
        }

        const mkAutoBuyEl = document.getElementById('p-mk-auto-buy');
        if (mkAutoBuyEl) {
            mkAutoBuyEl.onchange = (e) => {
                window.__marketFilterConfig.autoBuy = e.target.checked;
                saveMarketFilterConfig();
            };
        }

        const btnMkSearch = document.getElementById('p-btn-mk-search');
        if (btnMkSearch) {
            btnMkSearch.onclick = () => {
                window.executeMarketSearch();
            };
        }

        const btnMkScan = document.getElementById('p-btn-mk-scan');
        if (btnMkScan) {
            btnMkScan.onclick = () => {
                if (window.__isMarketScanning) {
                    window.stopMarketScan();
                } else {
                    window.startMarketMultiPageScan('all');
                }
            };
        }

        const btnMkOpenModal = document.getElementById('p-btn-mk-open-modal');
        if (btnMkOpenModal) {
            btnMkOpenModal.onclick = () => {
                window.showDataViewerModal('market');
            };
        }

        const btnMkCopyJson = document.getElementById('p-btn-mk-copy-json');
        if (btnMkCopyJson) {
            btnMkCopyJson.onclick = () => {
                const dump = window.dumpMarketData();
                window.safeCopyToClipboard(JSON.stringify(dump, null, 2), `📋 คัดลอกผลการค้นหาตลาด (${dump.filteredCount} รายการ) สำเร็จ!`);
            };
        }

        const dumpMarketBtn = document.getElementById('p-btn-dump-market');
        if (dumpMarketBtn) {
            dumpMarketBtn.onclick = () => {
                window.dumpMarketData();
                window.showDataViewerModal('market');
            };
        }

        // Hunter / Archer Event Listeners
        document.getElementById('p-archer-req').onchange = (e) => {
            window.__archerConfig.requireArrow = e.target.checked;
            saveArcherConfig();
        };

        document.getElementById('p-archer-type').onchange = (e) => {
            window.__archerConfig.arrowType = parseInt(e.target.value);
            saveArcherConfig();
            syncAmmoFromDOM();
            updateAmmoHUD();
            const arrowName = (typeof ARROW_DATA !== 'undefined' && ARROW_DATA[window.__archerConfig.arrowType]) ? ARROW_DATA[window.__archerConfig.arrowType].name : e.target.value;
            console.log(`%c[Pelican Archer] 🏹 เปลี่ยนชนิดลูกธนูเป้าหมายเป็น: "${arrowName}" (ตรวจพบในตัว: ${window.__currentAmmo} ดอก)`, 'color: #38bdf8; font-weight: bold;');
        };

        document.getElementById('p-archer-qty').onchange = (e) => {
            window.__archerConfig.arrowBuyQty = parseInt(e.target.value) || 200;
            saveArcherConfig();
        };

        const archerThresholdEl = document.getElementById('p-archer-threshold');
        if (archerThresholdEl) {
            archerThresholdEl.onchange = (e) => {
                window.__archerConfig.ammoThreshold = parseInt(e.target.value) || 50;
                saveArcherConfig();
                updateAmmoHUD();
            };
        }

        document.getElementById('p-archer-bwing').onchange = (e) => {
            window.__archerConfig.useBwing = e.target.checked;
            saveArcherConfig();
        };

        document.getElementById('p-archer-bwing-qty').onchange = (e) => {
            window.__archerConfig.bwingBuyQty = parseInt(e.target.value) || 5;
            saveArcherConfig();
        };

        const syncAmmoBtn = document.getElementById('p-btn-sync-ammo');
        if (syncAmmoBtn) {
            syncAmmoBtn.onclick = () => {
                syncAmmoFromDOM();
                updateAmmoHUD();
            };
        }

        const zeroAmmoBtn = document.getElementById('p-btn-zero-ammo');
        if (zeroAmmoBtn) {
            zeroAmmoBtn.onclick = () => {
                window.__currentAmmo = 0;
                localStorage.setItem('pelican_current_ammo', 0);
                updateAmmoHUD();
                console.log('%c[Pelican Ammo] 🎯 ปรับจำนวนลูกธนูเป็น 0 ดอกเรียบร้อยแล้ว!', 'color: #ef4444; font-weight: bold;');
            };
        }

        const quickAmmoBadge = document.getElementById('p-quick-ammo');
        if (quickAmmoBadge) {
            quickAmmoBadge.onclick = () => {
                syncAmmoFromDOM();
                updateAmmoHUD();
            };
        }

        const sniffEquipBtn = document.getElementById('p-btn-sniff-equip');
        if (sniffEquipBtn) {
            sniffEquipBtn.onclick = () => {
                window.startEquipSniffer();
            };
        }

        const equipBowArrowBtn = document.getElementById('p-btn-equip-bow-arrow');
        if (equipBowArrowBtn) {
            equipBowArrowBtn.onclick = () => {
                if (typeof window.equipArrowAndBow === 'function') {
                    window.equipArrowAndBow();
                }
            };
        }

        const autoEquipCheckbox = document.getElementById('p-archer-auto-equip');
        if (autoEquipCheckbox) {
            autoEquipCheckbox.onchange = (e) => {
                window.__archerConfig.autoEquipArrow = e.target.checked;
                saveArcherConfig();
            };
        }

        const toggleBtn = document.getElementById('pelican-toggle');
        const content = document.getElementById('pelican-content');
        toggleBtn.onclick = () => {
            if (content.style.display === 'none') {
                content.style.display = 'flex';
                toggleBtn.innerText = '−';
            } else {
                content.style.display = 'none';
                toggleBtn.innerText = '+';
            }
        };

        const dragHandle = document.getElementById('pelican-drag-handle');
        let isDragging = false, startX, startY;
        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target === toggleBtn) return;
            isDragging = true;
            startX = e.clientX - hud.offsetLeft;
            startY = e.clientY - hud.offsetTop;
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                hud.style.left = (e.clientX - startX) + 'px';
                hud.style.top = (e.clientY - startY) + 'px';
                hud.style.right = 'auto';
            }
        });
        document.addEventListener('mouseup', () => { isDragging = false; });
        
    // ==========================================
    // INVENTORY ITEM INFO WHITELIST QUICK-TOGGLE
    // ==========================================
    function normalizeWLItemName(name) {
        if (!name) return '';
        return name
            .replace(/^\+\s*\d+\s*/, '')                          // ตัดค่าตีบวก (+7, +10)
            .replace(/\s*\[\s*\d+\s*\]\s*$/, '')                  // ตัดจำนวนรูการ์ด ([1], [2], [3], [4])
            .replace(/\s*\[\s*(?:ธรรมดา|ดี|หายาก|มหากาพย์|ตำนาน)\s*\]/gi, '') // ตัดป้ายระดับ
            .replace(/มี\s*(?:option|options|ออฟชั่น|ออปชั่น|ออฟ|opt).*/i, '')
            .replace(/\b(?:option|options|ออฟชั่น|ออปชั่น)\b.*/i, '')
            .replace(/มี\s*\d+.*/, '')
            .replace(/\bx\s*\d+\b.*/i, '')
            .replace(/\b\d+[\s,]*z\b.*/i, '')
            .trim();
    }

    window.injectBagWhitelistButton = function() {
        const invDetail = document.querySelector('.inv-detail');
        if (!invDetail || invDetail.offsetWidth <= 0) return;

        const nameEl = invDetail.querySelector('.inv-detail-name');
        const actionsEl = invDetail.querySelector('.inv-actions');
        if (!nameEl || !actionsEl) return;

        const rawName = (nameEl.innerText || nameEl.textContent || '').trim();
        if (!rawName) return;

        const baseName = normalizeWLItemName(rawName);
        if (!baseName) return;

        const sellCfg = window.__sellConfig || {};
        let currentList = (sellCfg.whitelist || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        const lowerBase = baseName.toLowerCase();
        const isInWL = currentList.some(item => item.toLowerCase() === lowerBase);

        let btn = actionsEl.querySelector('.pelican-wl-toggle-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'pelican-wl-toggle-btn';
            btn.style.cssText = 'font-weight: 700; border-radius: 4px; cursor: pointer; padding: 4px 10px; margin-left: 4px; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; z-index: 10;';
            actionsEl.appendChild(btn);
        }

        const existingTarget = btn.getAttribute('data-target-item');
        const existingState = btn.getAttribute('data-in-wl');
        if (existingTarget === baseName && existingState === String(isInWL)) {
            return;
        }

        btn.setAttribute('data-target-item', baseName);
        btn.setAttribute('data-in-wl', String(isInWL));

        if (isInWL) {
            btn.innerText = '🛡️ ลบ WL';
            btn.title = 'ลบ "' + baseName + '" ออกจาก Whitelist (จะถูกขายได้ตามเกณฑ์)';
            btn.style.background = '#7f1d1d';
            btn.style.color = '#fecaca';
            btn.style.border = '1px solid #ef4444';
        } else {
            btn.innerText = '🛡️ เพิ่ม WL';
            btn.title = 'เพิ่ม "' + baseName + '" ลงใน Whitelist (ห้ามขายเด็ดขาด)';
            btn.style.background = '#0369a1';
            btn.style.color = '#e0f2fe';
            btn.style.border = '1px solid #38bdf8';
        }

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const targetName = btn.getAttribute('data-target-item') || baseName;
            const targetLower = targetName.toLowerCase();

            let freshList = (window.__sellConfig?.whitelist || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            const alreadyIn = freshList.some(it => it.toLowerCase() === targetLower);

            if (alreadyIn) {
                freshList = freshList.filter(it => it.toLowerCase() !== targetLower);
                window.__sellConfig.whitelist = freshList.join(', ');
                if (typeof saveSellConfig === 'function') saveSellConfig();

                const wlTextarea = document.getElementById('p-sell-whitelist');
                if (wlTextarea) wlTextarea.value = window.__sellConfig.whitelist;

                console.log('%c[Pelican Whitelist] ❌ ลบ "' + targetName + '" ออกจาก Whitelist เรียบร้อย', 'color: #ef4444; font-weight: bold;');
            } else {
                freshList.push(targetName);
                window.__sellConfig.whitelist = freshList.join(', ');
                if (typeof saveSellConfig === 'function') saveSellConfig();

                const wlTextarea = document.getElementById('p-sell-whitelist');
                if (wlTextarea) wlTextarea.value = window.__sellConfig.whitelist;

                console.log('%c[Pelican Whitelist] 🛡️ เพิ่ม "' + targetName + '" ลงใน Whitelist สำเร็จ!', 'color: #22c55e; font-weight: bold;');
            }

            window.injectBagWhitelistButton();
        };
    };

    document.addEventListener('click', (e) => {
        if (e.target && (e.target.closest('.inv-item') || e.target.closest('[class*="slot"]') || e.target.closest('.inv-grid') || e.target.closest('.inventory') || e.target.closest('.bag-window'))) {
            setTimeout(() => {
                if (typeof window.injectBagWhitelistButton === 'function') {
                    window.injectBagWhitelistButton();
                }
            }, 60);
        }
    }, true);

        updateMasterBotUI();
        if (typeof getCharacterWeight === 'function') getCharacterWeight();
        setTimeout(() => { if (typeof getCharacterWeight === 'function') getCharacterWeight(); }, 800);

        setInterval(() => {
            if (document.querySelector('.inv-detail') && typeof window.injectBagWhitelistButton === 'function') {
                window.injectBagWhitelistButton();
            }
        }, 300);

        setInterval(() => {
            if (document.querySelector('.market-window') && typeof window.injectMarketOverlay === 'function') {
                window.injectMarketOverlay();
            }
        }, 600);

        setInterval(() => {
            if (window.__autoMarketSellConfig?.enabled && typeof window.runAutoMarketSellCycle === 'function') {
                window.runAutoMarketSellCycle(false);
            }
        }, 25000);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();

    // ==========================================
    
    // ==========================================
    // PELICAN SCRIPT PLAN EXECUTION ENGINE
    // ==========================================
    window.__currentScriptPlan = null;
    window.__executedPlanTriggers = {};

    try {
        const savedPlan = localStorage.getItem('pelican_script_plan');
        if (savedPlan) window.__currentScriptPlan = JSON.parse(savedPlan);
        const savedExec = localStorage.getItem('pelican_executed_triggers');
        if (savedExec) window.__executedPlanTriggers = JSON.parse(savedExec);
    } catch(e) {}

    window.__applyScriptPlan = function(plan) {
        window.__currentScriptPlan = plan;
        try {
            localStorage.setItem('pelican_script_plan', JSON.stringify(plan));
        } catch(e) {}
        console.log('%c[Pelican Plan] 📜 โหลดแผนการเล่นใหม่เรียบร้อย:', 'color: #38bdf8; font-weight: bold;', plan ? plan.name : 'None');
        if (plan && Array.isArray(plan.triggers)) {
            console.log(`[Pelican Plan] แผนมีทั้งหมด ${plan.triggers.length} เงื่อนไขเลเวล`);
        }
    };

    window.findAndEquipItemByName = async function(itemName, buyFromMarketIfMissing = true, maxPrice = 100000, optionFilter = '') {
        if (!itemName) return;
        const targetClean = itemName.trim().toLowerCase();
        console.log(`%c[Pelican Plan] 🛡️ เริ่มขั้นตอนตรวจสอบอุปกรณ์ "${itemName}"...`, 'color: #38bdf8; font-weight: bold;');

        // 1. ตรวจสอบว่าสวมใส่อยู่บนตัวละครแล้วหรือไม่
        const isAlreadyEquipped = () => {
            const charSlots = Array.from(document.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud')) return false;
                const text = (el.innerText || el.textContent || '').trim().toLowerCase();
                return text.includes(targetClean) && el.offsetWidth > 0;
            });
            return charSlots.length > 0;
        };

        if (isAlreadyEquipped()) {
            console.log(`%c[Pelican Plan] 🛡️ "${itemName}" สวมใส่อยู่บนตัวละครแล้ว (ข้ามการทำงาน)`, 'color: #22c55e;');
            return true;
        }

        // 2. ตรวจสอบในกระเป๋าเซิร์ฟเวอร์
        const invItem = (typeof findItemInServerInv === 'function') ? findItemInServerInv(it => {
            const name = (it.name || '').toLowerCase();
            return name.includes(targetClean) && typeof (it.slot ?? it.idx) === 'number';
        }) : null;

        if (invItem) {
            const slot = invItem.slot ?? invItem.idx;
            console.log(`%c[Pelican Plan] 🎒 พบ "${itemName}" ในกระเป๋า Slot ${slot} -> ส่งคำสั่งสวมใส่ทันที!`, 'color: #22c55e; font-weight: bold;');
            if (typeof window.sendEquip === 'function') {
                window.sendEquip(slot);
            }
            return true;
        }

        // 3. ถ้าไม่มีในกระเป๋า และเปิดตัวเลือกซื้อจากตลาด
        if (buyFromMarketIfMissing) {
            console.log(`%c[Pelican Plan] 🛒 ไม่พบ "${itemName}" ในกระเป๋า -> กำลังค้นหาและซื้อจากตลาด (งบสูงสุด: ${maxPrice} z)...`, 'color: #f59e0b; font-weight: bold;');
            try {
                if (typeof window.executeMarketSearch === 'function') {
                    if (window.__marketFilterConfig) {
                        window.__marketFilterConfig.q = itemName;
                        window.__marketFilterConfig.maxPrice = maxPrice;
                    }
                    window.executeMarketSearch();
                }
            } catch(e) {
                console.warn('[Pelican Plan] Market buy error:', e);
            }
        }

        return false;
    };

    window.checkAndExecutePlanTriggers = async function() {
        const plan = window.__currentScriptPlan;
        if (!plan || !Array.isArray(plan.triggers) || plan.triggers.length === 0) return;

        const levelsEl = document.querySelector('.hud-levels');
        const text = levelsEl ? levelsEl.innerText : '';
        const baseMatch = text.match(/Base\s*(?:Lv\.?|Level)?\s*(\d+)/i);
        const jobMatch = text.match(/Job\s*(?:Lv\.?|Level)?\s*(\d+)/i);
        const curBase = baseMatch ? parseInt(baseMatch[1], 10) : 1;
        const curJob = jobMatch ? parseInt(jobMatch[1], 10) : 1;

        for (const trig of plan.triggers) {
            const isJob = (trig.type === 'job_level');
            const targetLvl = parseInt(trig.targetLevel, 10);
            const trigKey = (isJob ? 'job_' : 'base_') + targetLvl;

            const matched = isJob ? (curJob === targetLvl) : (curBase === targetLvl);

            if (matched && !window.__executedPlanTriggers[trigKey]) {
                window.__executedPlanTriggers[trigKey] = true;
                try {
                    localStorage.setItem('pelican_executed_triggers', JSON.stringify(window.__executedPlanTriggers));
                } catch(e) {}

                console.log(`%c[Pelican Plan] 🎯 ทำตามแผน Trigger เลเวล ${targetLvl} (${isJob ? 'Job Lv' : 'Base Lv'})!`, 'color: #f59e0b; font-weight: bold;');

                for (const act of (trig.actions || [])) {
                    try {
                        if (act.type === 'change_map' && act.targetMap) {
                            console.log(`%c[Pelican Plan] 🗺️ แผนสั่งเปลี่ยนแมพฟาร์มไปที่: "${act.targetMap}"`, 'color: #38bdf8;');
                            if (typeof window.setTargetFarmMap === 'function') {
                                window.setTargetFarmMap(act.targetMap);
                            }
                        } else if (act.type === 'change_class' && act.targetClass) {
                            console.log(`%c[Pelican Plan] 🏹 แผนสั่งเปลี่ยนอาชีพเป็น: "${act.targetClass}"`, 'color: #a855f7; font-weight: bold;');
                        } else if (act.type === 'equip_item' && act.itemName) {
                            await window.findAndEquipItemByName(act.itemName, act.buyFromMarket, act.maxPrice, act.optionFilter);
                        }
                    } catch(err) {
                        console.warn('[Pelican Plan] Action execution error:', err);
                    }
                }
            }
        }
    };

    // Auto-check plan triggers every 5 seconds
    setInterval(() => {
        try {
            if (typeof window.checkAndExecutePlanTriggers === 'function') {
                window.checkAndExecutePlanTriggers();
            }
        } catch(e) {}
    }, 5000);

    // MULTI-CLIENT HUB REAL-TIME STATE SYNC
    // ==========================================
    window.__getClientLiveState = function() {
        // 1. Character Name, Class & Levels
        const nameEl = document.querySelector('.hud-name');
        const classEl = document.querySelector('.hud-class');
        const levelsEl = document.querySelector('.hud-levels');
        
        // 2. HP & SP
        const hpBar = document.querySelector('.bar-fill.bar-hp')?.closest('.bar');
        const hpText = hpBar?.querySelector('.bar-num')?.innerText?.trim() || null;
        const spBar = document.querySelector('.bar-fill.bar-sp')?.closest('.bar');
        const spText = spBar?.querySelector('.bar-num')?.innerText?.trim() || null;
        
        let hpCurrent = null, hpMax = null;
        if (hpText) {
            const m = hpText.match(/(\d+)\s*\/\s*(\d+)/);
            if (m) { hpCurrent = Number(m[1]); hpMax = Number(m[2]); }
        }
        let spCurrent = null, spMax = null;
        if (spText) {
            const m = spText.match(/(\d+)\s*\/\s*(\d+)/);
            if (m) { spCurrent = Number(m[1]); spMax = Number(m[2]); }
        }

        // 3. Map Name
        let mapName = null;
        const footer = document.querySelector('.minimap-footer');
        if (footer) {
            const spans = Array.from(footer.querySelectorAll('span, div')).map(s => s.innerText.trim()).filter(Boolean);
            const foundMap = spans.find(t => t.length > 2 && !t.includes(',') && !/^CH\s*\d+/i.test(t) && !/^\d+%?$/.test(t));
            if (foundMap) mapName = foundMap;
        }
        if (!mapName && typeof window.getCurrentMapName === 'function') {
            mapName = window.getCurrentMapName();
        }

        // 4. Pos
        const pos = window.__currentPos || { x: 0, y: 0, tileX: 0, tileY: 0 };
        
        // 5. Ammo, Weight & Zeny
        const ammo = (typeof window.__currentAmmo === 'number') ? window.__currentAmmo : 0;
        const weightText = document.getElementById('p-quick-weight')?.innerText?.replace('⚖️', '')?.trim() || null;
        let currentZeny = window.__currentZeny;
        if (typeof currentZeny !== 'number' && typeof window.tryRecoverCharacterFromPackets === 'function') {
            currentZeny = window.tryRecoverCharacterFromPackets();
        }

        // 6. Bot Status & Actions
        const hudState = document.getElementById('p-char-state')?.innerText?.trim();
        let activity = '🟢 ยืนรอ / แสตนด์บาย';
        if (window.__isRecovering) activity = '⚠️ กำลังชุบชีวิต';
        else if (window.__isShopping) activity = '🛒 ซื้อ/ขายของที่ NPC';
        else if (window.__isNavigating) activity = '🚶 กำลังเดินทาง';
        else if (window.__autoLoopEnabled || window.__isBotRunning) activity = '⚔️ Auto-Farm ทำงาน';
        else if (hudState) activity = hudState;

        return {
            charName: nameEl?.innerText?.trim() || window.__charName || 'G4YSuuuuu',
            charClass: classEl?.innerText?.trim() || 'Hunter',
            levels: levelsEl?.innerText?.trim() || '',
            hp: hpCurrent,
            hpMax: hpMax,
            hpText: hpText,
            sp: spCurrent,
            spMax: spMax,
            spText: spText,
            map: mapName || 'ไม่ทราบแมพ',
            targetMap: window.__targetFarmMap || null,
            pos: pos,
            coords: pos.tileX ? (pos.tileX + ', ' + pos.tileY + ' (' + pos.x + ', ' + pos.y + ')') : (pos.x ? (pos.x + ', ' + pos.y) : '--'),
            ammo: ammo,
            weight: weightText,
            zeny: (typeof currentZeny === 'number') ? currentZeny : null,
            zenyText: (typeof currentZeny === 'number') ? (currentZeny.toLocaleString() + ' z') : '--',
            botStatus: activity,
            navigating: !!window.__isNavigating,
            recovering: !!window.__isRecovering,
            shopping: !!window.__isShopping,
            autoLoop: !!window.__autoLoopEnabled,
            isBotRunning: !!window.__isBotRunning,
            hasSocket: !!window.__gameSocket,
            hasInventory: !!window.__latestInventory,
            isOnline: true
        };
    };
