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
    window.__latestInventory = null;
    window.__serverWeight = null;
    window.__isKnownOverweight = false;
    window.__debugSnifferEnabled = false;

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

    function syncAmmoFromDOM() {
        try {
            // 1. ตรวจจากช่อง ItemBar / Hotbar ด้านล่างจอ (ต้องมีรูปไอคอนธนูเท่านั้น ห้ามเดาจากช่องสุ่ม)
            const hotbarSlots = Array.from(document.querySelectorAll('[class*="itembar"] [class*="slot"], [class*="hotbar"] [class*="slot"], [class*="item-slot"], .quick-slot'));
            let foundInHotbar = false;

            for (const slot of hotbarSlots) {
                const img = slot.querySelector('img');
                const src = img ? (img.src || '').toLowerCase() : '';
                const title = (slot.getAttribute('title') || slot.getAttribute('data-name') || '').toLowerCase();
                const isArrowSlot = src.includes('arrow') || src.includes('90030') || title.includes('arrow') || title.includes('ลูกธนู');

                if (isArrowSlot) {
                    foundInHotbar = true;
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
                    const title = (itemEl.getAttribute('title') || itemEl.innerText || '').toLowerCase();
                    const isArrow = src.includes('arrow') || src.includes('90030') || title.includes('arrow') || title.includes('ลูกธนู');

                    if (isArrow) {
                        arrowInBagFound = true;
                        const match = (itemEl.innerText || itemEl.textContent || '').match(/(\d+)/);
                        if (match) {
                            bagArrowQty += parseInt(match[1]);
                        }
                    }
                }

                // ถ้าเปิดหน้าต่างกระเป๋าอยู่ แล้วสแกนไม่เจอลูกธนูเลยสักช่อง -> ลูกธนู = 0 ทันที 100%!
                if (!arrowInBagFound) {
                    if (window.__currentAmmo !== 0) {
                        console.log('%c[Pelican Ammo] 🎒 สแกนกระเป๋าแล้ว: ไม่พบลูกธนูในตัวเลย -> ปรับ Ammo = 0 ดอก', 'color: #ef4444; font-weight: bold;');
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
        return null;
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
                    decoded = window.msgpack.decode(uint8.slice(1));
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
        console.log('%c📦 PELICAN DEEP INVENTORY & EQUIPMENT DUMP TOOL v1.0', 'color: #00ffcc; font-weight: bold; font-size: 14px;');
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
    // IN-GAME DATA VIEWER MODAL & INSPECTOR
    // ==========================================
    window.__currentModalTab = 'items';

    window.showDataViewerModal = function(activeTab = 'items') {
        let modal = document.getElementById('pelican-data-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pelican-data-modal';
            modal.innerHTML = `
                <div id="p-modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 999998;"></div>
                <div id="p-modal-window" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; max-width: 95vw; height: 580px; max-height: 90vh; background: #0b1329; border: 1.5px solid #38bdf8; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.9), 0 0 20px rgba(56,189,248,0.25); z-index: 999999; display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, sans-serif; color: #f8fafc; overflow: hidden;">
                    <!-- Header -->
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #1e293b; border-bottom: 1px solid #334155;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16px;">🔍</span>
                            <span style="font-weight: bold; font-size: 13.5px; color: #38bdf8; letter-spacing: 0.5px;">Aetheria Data & Packet Inspector</span>
                            <span style="font-size: 10px; background: rgba(56,189,248,0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: bold;">LIVE</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button id="p-modal-copy-btn" style="background: #0284c7; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold;">
                                📋 คัดลอก JSON ทั้งหมด
                            </button>
                            <button id="p-modal-close-btn" style="background: #ef4444; color: white; border: none; width: 28px; height: 28px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer;">
                                ✖
                            </button>
                        </div>
                    </div>

                    <!-- Toolbar -->
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #0f172a; border-bottom: 1px solid #1e293b; gap: 10px; flex-wrap: wrap;">
                        <div style="display: flex; gap: 6px;">
                            <button class="p-mod-tab-btn" data-tab="items" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">📦 กระเป๋า & อุปกรณ์</button>
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

            document.getElementById('p-modal-close-btn').onclick = () => { modal.style.display = 'none'; };
            document.getElementById('p-modal-backdrop').onclick = () => { modal.style.display = 'none'; };

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
        window.renderModalTab(activeTab);
    };

    window.renderModalTab = function(tabName, query = '') {
        window.__currentModalTab = tabName;
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
            const rawInv = window.__latestInventory;
            const items = [];

            // Extract items from rawInv recursively
            function scanRaw(obj) {
                if (!obj) return;
                if (Array.isArray(obj)) {
                    obj.forEach(scanRaw);
                } else if (typeof obj === 'object') {
                    const id = obj.itemId || obj.id || obj.item_id || obj.code;
                    const name = obj.name || obj.itemName || obj.title;
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
            if (rawInv) scanRaw(rawInv);

            // Also scan DOM slots
            const domSlots = Array.from(document.querySelectorAll('[class*="item"], .inventory-slot, [data-item-id], [class*="slot"]'))
                .filter(el => !el.closest('#pelican-hud') && !el.closest('#pelican-data-modal') && el.offsetWidth > 0 && el.innerText.trim().length > 0);

            const filteredItems = items.filter(it => {
                if (!query) return true;
                return (String(it.name).toLowerCase().includes(query) || String(it.id).includes(query) || String(it.slot).includes(query));
            });

            let html = '';
            if (!rawInv) {
                html += `
                    <div style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; border-radius: 8px; padding: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="color: #fde047;">⚠️ ยังไม่ได้รับ Packet กระเป๋าจากเซิร์ฟเวอร์ (ลองกดเปิด-ปิดกระเป๋าในเกม 1 ครั้ง)</span>
                        <button onclick="window.pressKey('i')" style="background: #eab308; color: #000; border: none; padding: 5px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">🎒 กดเปิดกระเป๋า (I)</button>
                    </div>
                `;
            }

            html += `
                <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: #38bdf8;">📦 รายการไอเทมจากเซิร์ฟเวอร์ (ตรวจพบ ${items.length} รายการ):</span>
                    <span style="color: #64748b; font-size: 11px;">(Arrow: 90030 / Bwing: 90311)</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; text-align: left;">
                            <th style="padding: 6px 8px; border: 1px solid #334155;">Slot</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">ชื่อไอเทม</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">Item ID (Dec / Hex)</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">จำนวน</th>
                            <th style="padding: 6px 8px; border: 1px solid #334155;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (filteredItems.length === 0) {
                html += `<tr><td colspan="5" style="text-align: center; padding: 16px; color: #64748b;">ไม่พบไอเทมที่ตรงกับคำค้นหา</td></tr>`;
            } else {
                filteredItems.forEach(it => {
                    const hexId = it.id ? '0x' + parseInt(it.id).toString(16) : '-';
                    const isArrow = it.id === 90030 || String(it.name).toLowerCase().includes('arrow');
                    html += `
                        <tr style="border-bottom: 1px solid #1e293b; ${isArrow ? 'background: rgba(34, 197, 94, 0.1);' : ''}">
                            <td style="padding: 6px 8px; color: #94a3b8; border: 1px solid #334155;">${it.slot}</td>
                            <td style="padding: 6px 8px; font-weight: bold; color: ${isArrow ? '#4ade80' : '#f8fafc'}; border: 1px solid #334155;">${it.name}</td>
                            <td style="padding: 6px 8px; font-family: monospace; color: #38bdf8; border: 1px solid #334155;">${it.id || '-'} (${hexId})</td>
                            <td style="padding: 6px 8px; font-weight: bold; color: #f59e0b; border: 1px solid #334155;">${it.qty}</td>
                            <td style="padding: 6px 8px; border: 1px solid #334155;">
                                ${isArrow ? '<span style="color: #22c55e; font-weight: bold;">🏹 ลูกธนู</span>' : ''}
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
            // 1. หาปุ่ม "จัดเรียง" หรือ "จัดเรียงไอเทม" บนหน้าจอเกม
            const sortBtn = Array.from(document.querySelectorAll('button, div[role="button"], a, span, div')).find(el => {
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

            // 2. หา Header "กระเป๋า x/y"
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

        // 0. ตรวจสอบสถานะ Debuff บนแผง .hud-status ของตัวละครโดยตรง (เชื่อถือได้ 100% แม้ปิดกระเป๋า)
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

        // 1. ตรวจสอบข้อมูลน้ำหนักคำนวณจริงจาก DOM หรือ Server
        const w = getCharacterWeight() || window.__lastKnownWeight || window.__serverWeight;
        if (w && typeof w.percent === 'number' && w.percent > 0) {
            if (w.percent >= threshold) return true;
            // ถ้าน้ำหนักจริงยังไม่ถึงเกณฑ์ที่ตั้งไว้ (เช่น 38.6% < 70%) ถือว่าปลอดภัย 100% ห้ามสั่งวาร์ปกลับเด็ดขาด!
            return false;
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

    window.clickSortBag = function() {
        try {
            const bagInfo = getOpenBagInfo();
            if (bagInfo && bagInfo.sortBtn) {
                triggerClick(bagInfo.sortBtn);
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
        const bagInfo = getOpenBagInfo();
        if (bagInfo && bagInfo.windowEl) {
            const closeBtn = Array.from(bagInfo.windowEl.querySelectorAll('button, div, span, [aria-label="close"], [class*="close"]')).find(el => {
                const txt = (el.innerText || el.textContent || '').trim();
                return (txt === '✕' || txt === 'X' || txt === 'ปิด' || el.className.includes('close')) && el.offsetWidth > 0;
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

    window.refreshInventoryAndWeight = function(callback) {
        if (window.__isRefreshingWeight) {
            if (typeof callback === 'function') callback(window.__lastKnownWeight);
            return;
        }

        window.__isRefreshingWeight = true;

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
            if (typeof window.dumpWeightDebug === 'function') {
                window.dumpWeightDebug();
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

        // วิธี A: คลิกปุ่ม "กระเป๋า" จากหน้าจอเกม
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
                    const subBagBtn = Array.from(document.querySelectorAll('button, div, [role="button"], a, span, li, p')).find(el => {
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

        // วิธี B: ส่งคำสั่ง Keyboard 'I' และ 'B'
        dispatchKeyAll('i', 'KeyI', 73);
        dispatchKeyAll('b', 'KeyB', 66);

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
                let slotsPos = -1;
                for (let i = 0; i < Math.min(u.length - 5, 80); i++) {
                    if (u[i] === 0x73 && u[i+1] === 0x6c && u[i+2] === 0x6f && u[i+3] === 0x74 && u[i+4] === 0x73) {
                        slotsPos = i;
                        break;
                    }
                }

                if (slotsPos !== -1) {
                    for (let offset = Math.max(0, slotsPos - 4); offset <= slotsPos; offset++) {
                        try {
                            const dec = window.msgpack.decode(u.slice(offset));
                            if (dec && typeof dec === 'object') {
                                window.__latestInventory = dec;
                                const targetArrowId = (window.__archerConfig && window.__archerConfig.arrowType) ? parseInt(window.__archerConfig.arrowType) : 90030;
                                
                                let foundQty = null;

                                function inspectObject(obj, depth = 0) {
                                    if (!obj || depth > 5 || foundQty !== null) return;
                                    if (Array.isArray(obj)) {
                                        for (const item of obj) {
                                            if (item && typeof item === 'object') {
                                                const id = item.itemId || item.id || item.item_id || item.code;
                                                const name = (item.name || item.itemName || '').toLowerCase();
                                                const isArrow = (id === targetArrowId || id === targetArrowId.toString() || name.includes('arrow') || (targetArrowId === 90030 && (id === 90030 || name.includes('ลูกธนู') || name === 'arrow')));
                                                if (isArrow) {
                                                    foundQty = item.qty ?? item.amount ?? item.count ?? item.val ?? 0;
                                                    return;
                                                }
                                                inspectObject(item, depth + 1);
                                            }
                                        }
                                    } else if (typeof obj === 'object') {
                                        const id = obj.itemId || obj.id || obj.item_id || obj.code;
                                        const name = (obj.name || obj.itemName || '').toLowerCase();
                                        const isArrow = (id === targetArrowId || id === targetArrowId.toString() || name.includes('arrow') || (targetArrowId === 90030 && (id === 90030 || name.includes('ลูกธนู') || name === 'arrow')));
                                        if (isArrow) {
                                            foundQty = obj.qty ?? obj.amount ?? obj.count ?? obj.val ?? 0;
                                            return;
                                        }
                                        for (const k in obj) {
                                            inspectObject(obj[k], depth + 1);
                                        }
                                    }
                                }

                                inspectObject(dec);

                                // Detect weight if present in dec
                                try {
                                    const curW = dec.curWeight ?? dec.cur_weight ?? dec.weight ?? dec.currentWeight;
                                    const maxW = dec.maxWeight ?? dec.max_weight ?? dec.weightMax ?? dec.totalWeight;
                                    if (typeof curW === 'number' && typeof maxW === 'number' && maxW > 0) {
                                        window.__serverWeight = { current: curW, max: maxW, percent: Math.round((curW / maxW) * 1000) / 10 };
                                        updateWeightHUD(window.__serverWeight);
                                    }
                                } catch(e) {}

                                const hasInventoryList = dec && (dec.slots !== undefined || Array.isArray(dec) || typeof dec === 'object');
                                if (hasInventoryList) {
                                    const realQty = foundQty !== null ? (parseInt(foundQty) || 0) : 0;
                                    if (window.__currentAmmo !== realQty) {
                                        console.log(`%c[Pelican Ammo] 🏹 ซิงก์จำนวนลูกธนูจริงจาก Server: ${realQty} ดอก (เดิม ${window.__currentAmmo})`, 'color: #00ffcc; font-weight: bold;');
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

        // ซิงก์น้ำหนักและกดจัดเรียงกระเป๋า เพื่อให้ได้ค่าน้ำหนักจริง 100% ก่อนตัดสินใจ
        if (typeof window.refreshInventoryAndWeight === 'function') {
            window.refreshInventoryAndWeight(() => {
                continueStart();
            });
        } else {
            continueStart();
        }
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
        console.log(`%c[Pelican Shop] 📡 ส่ง Packet 'npc_talk' (NPC: ${key})...`, 'color: #f59e0b;');
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

    window.sendNpcClose = function() {
        if (!window.__gameSocket || window.__gameSocket.readyState !== 1) return;
        const token = window.__lastMoveToken || [0xd4, 0x72, 0x40];
        const prefix = [0x0D, 0xA9, 0x6E, 0x70, 0x63, 0x5F, 0x63, 0x6C, 0x6F, 0x73, 0x65];
        const suffix = [0x90];

        const buf = new Uint8Array(prefix.length + token.length + suffix.length);
        buf.set(prefix, 0);
        buf.set(token, prefix.length);
        buf.set(suffix, prefix.length + token.length);
        window.__gameSocket.send(buf.buffer);
        console.log('%c[Pelican Shop] 🚪 ส่ง npc_close ปิดหน้าร้านค้า', 'color: #94a3b8;');
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
        // ตรวจสอบว่าหน้าต่างแผนที่วาร์ปของ Alice หรือหน้าต่าง WorldMap เปิดอยู่แล้วหรือไม่ (ห้ามตรวจจากป้ายชื่อ NPC)
        function isAliceMapWindowOpen() {
            if (typeof isWorldMapOpen === 'function' && isWorldMapOpen()) return true;
            const stage = document.querySelector('.worldmap-stage, .worldmap-body, .worldmap-window');
            if (stage && stage.offsetWidth > 0) return true;
            const warpBtn = Array.from(document.querySelectorAll('button')).find(b => {
                const txt = (b.innerText || '').trim();
                return txt.includes('วาร์ปไปที่นี่') && b.offsetWidth > 0;
            });
            return !!warpBtn;
        }

        if (isAliceMapWindowOpen()) {
            console.log('%c[Pelican Warp] 🗺️ หน้าต่าง Alice Warp Service เปิดอยู่แล้ว ทำงานต่อได้ทันที', 'color: #22c55e;');
            if (callback) callback();
            return;
        }

        console.log('%c[Pelican Warp] 🧙 กำลังเดินทางไปคุยกับ NPC Alice (Warp Service) เพื่อเปิดวาร์ปเกต...', 'color: #eab308; font-weight: bold;');

        // ฟังก์ชันช่วยค้นหาและคลิกป้ายชื่อ NPC Alice บนจอ
        function findAliceElement() {
            const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal') || el.closest('#pelican-log')) return false;
                const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt.includes('Alice')) return false;
                const rect = el.getBoundingClientRect();
                return rect.width >= 15 && rect.width <= 350 && rect.height >= 10 && rect.height <= 85;
            });
            if (candidates.length > 0) {
                // เลือก element ที่มีพื้นที่เล็กที่สุด (innermost badge / text)
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

            // ตรวจว่ามีปุ่มตัวเลือก "Alice Warp Service" หรือ "วาร์ป" ในหน้าต่างสนทนาหรือไม่
            const dialogOption = Array.from(document.querySelectorAll('button, .dialog-option, [class*="option"]')).find(b => {
                if (b.closest('#pelican-hud') || b.closest('#pelican-data-modal')) return false;
                const txt = (b.innerText || '').trim();
                return (txt.includes('Alice Warp') || txt.includes('Warp Service') || txt.includes('วาร์ป')) && b.offsetWidth > 0;
            });

            if (dialogOption) {
                console.log('%c[Pelican Warp] 🔘 พบคลิกตัวเลือกในกล่องสนทนา: ' + dialogOption.innerText, 'color: #00ffcc;');
                triggerClick(dialogOption);
                window.sendRemoteNpcOption(1);
            }

            // ตรวจสอบตำแหน่งการเดิน
            const curPos = window.__currentPos || { x: 0, y: 0 };
            const isStationary = (curPos.x === lastPos.x && curPos.y === lastPos.y && curPos.x !== 0);
            lastPos = { x: curPos.x, y: curPos.y };
            if (isStationary) stillCount++; else stillCount = 0;

            // ระหว่างเดินข้ามเมือง: ส่งคำสั่งเดิน/คุยกับ Alice ซ้ำทุกๆ 3 วินาที (5 รอบ) เพื่อไม่ให้ตัวละครชะงัก
            if (attempts % 5 === 0) {
                clickAliceOnScreen();
                window.sendRemoteNpcTalk('n6');
            }

            // เมื่อตัวละครหยุดเดิน (ถึงตัว Alice หรือยืนอยู่นิ่งๆ) ให้ส่ง Packet คุยและเลือกตัวเลือกวาร์ป
            if ((isStationary && stillCount >= 2) || attempts === 2) {
                console.log('%c[Pelican Warp] 💬 ตัวละครเข้าใกล้ Alice -> ส่ง Packet คุยและเลือก Alice Warp Service...', 'color: #eab308;');
                window.sendRemoteNpcTalk('n6');
                setTimeout(() => {
                    if (!window.__isBotRunning && !window.__isManualWarping) return;
                    window.sendRemoteNpcOption(1);
                }, 300);
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
        console.log('%c[Pelican Ammo] 🏹 กำลังตรวจสอบและสวมใส่คันธนู & ลูกธนู...', 'color: #38bdf8; font-weight: bold;');

        // 1. ตรวจสอบและสวมใส่ "คันธนู" (Bow) เข้ามือหลักก่อนเสมอ! ป้องกันการไปถือมีดสั้น/ดาบ เช่น Damascus
        let bowFound = false;
        const bowInBag = findItemInServerInv(it => {
            const name = (it.name || it.itemName || '').toLowerCase();
            const slot = it.slot ?? it.idx;
            const isBow = ((name.includes('bow') || name.includes('crossbow') || name.includes('gakkung') || name.includes('arbalest') || name.includes('คันธนู') || (name.includes('ธนู') && !name.includes('ลูกธนู'))) && !name.includes('arrow') && !name.includes('ลูกธนู'));
            const isMelee = (name.includes('damascus') || name.includes('dagger') || name.includes('sword') || name.includes('knife') || name.includes('มีด') || name.includes('ดาบ'));
            return isBow && !isMelee && typeof slot === 'number';
        });

        if (bowInBag) {
            const slot = bowInBag.slot ?? bowInBag.idx;
            console.log(`%c[Pelican Weapon] 🏹 พบคันธนูในกระเป๋า Slot ${slot} ("${bowInBag.name || 'Bow'}") -> ส่งคำสั่งสวมใส่คันธนูกลับเข้ามือ!`, 'color: #22c55e; font-weight: bold;');
            window.sendEquip(slot);
            bowFound = true;
        }

        // 2. ถ้าในหน้าต่างกระเป๋าเปิดอยู่ ให้ลองหา element ของ Bow และ double click
        try {
            const bagModal = document.querySelector('.modal, .window, [class*="inventory"], [class*="bag"], [class*="dialog"]') || document.body;
            const slots = Array.from(bagModal.querySelectorAll('[class*="slot"], [class*="item"], [class*="cell"]')).filter(el => !el.closest('#pelican-hud') && el.offsetWidth > 0);
            for (const el of slots) {
                const img = el.querySelector('img');
                const src = img ? (img.src || '').toLowerCase() : '';
                const title = (el.getAttribute('title') || el.getAttribute('data-name') || el.innerText || '').toLowerCase();
                const isBow = (src.includes('bow') || title.includes('bow') || title.includes('crossbow') || title.includes('gakkung') || title.includes('arbalest') || title.includes('คันธนู') || (title.includes('ธนู') && !title.includes('ลูกธนู'))) && !src.includes('arrow') && !title.includes('arrow') && !title.includes('ลูกธนู');
                const isMelee = src.includes('dagger') || src.includes('sword') || src.includes('damascus') || title.includes('damascus') || title.includes('มีด') || title.includes('ดาบ');
                if (isBow && !isMelee) {
                    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
                    console.log('%c[Pelican Weapon] 🏹 Double-click สวมใส่คันธนูจากหน้าต่างกระเป๋าสำเร็จ!', 'color: #22c55e;');
                    bowFound = true;
                    break;
                }
            }
        } catch(e) {}

        // 3. ตรวจสอบการสวมใส่ "ลูกธนู" (Arrow) จากกระเป๋าเซิร์ฟเวอร์
        const targetArrowId = (window.__archerConfig && window.__archerConfig.arrowType) ? parseInt(window.__archerConfig.arrowType) : 90030;
        const arrowInBag = findItemInServerInv(it => {
            const id = it.itemId || it.id || it.item_id;
            const name = (it.name || it.itemName || '').toLowerCase();
            const slot = it.slot ?? it.idx;
            const isArrow = (id === targetArrowId || id === targetArrowId.toString() || name.includes('arrow') || name.includes('ลูกธนู'));
            return isArrow && typeof slot === 'number';
        });

        if (arrowInBag) {
            const slot = arrowInBag.slot ?? arrowInBag.idx;
            console.log(`%c[Pelican Ammo] 🎯 พบลูกธนูในกระเป๋า Slot ${slot} -> ส่งคำสั่งสวมใส่ลูกธนู!`, 'color: #22c55e; font-weight: bold;');
            setTimeout(() => {
                window.sendEquip(slot);
            }, 100);
        }

        // 4. ถ้ามีกระเป๋าเปิดอยู่ ให้ double click ที่ลูกธนู
        try {
            const bagModal = document.querySelector('.modal, .window, [class*="inventory"], [class*="bag"], [class*="dialog"]') || document.body;
            const slots = Array.from(bagModal.querySelectorAll('[class*="slot"], [class*="item"], [class*="cell"]')).filter(el => !el.closest('#pelican-hud') && el.offsetWidth > 0);
            for (const el of slots) {
                const img = el.querySelector('img');
                const src = img ? (img.src || '').toLowerCase() : '';
                const title = (el.getAttribute('title') || el.getAttribute('data-name') || el.innerText || '').toLowerCase();
                const isArrow = src.includes('arrow') || src.includes('90030') || title.includes('arrow') || title.includes('ลูกธนู');
                if (isArrow) {
                    setTimeout(() => {
                        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
                        console.log('%c[Pelican Ammo] 🎯 Double-click สวมใส่ลูกธนูจากหน้าต่างกระเป๋าสำเร็จ!', 'color: #22c55e;');
                    }, 120);
                    break;
                }
            }
        } catch(e) {}

        // 5. สั่งกดคีย์ Hotbar สำหรับลูกธนู (เพื่อกระตุ้นให้ระบบเกมสวมใส่ลูกธนูเข้า Arrow Slot)
        setTimeout(() => {
            const hotbarSlot = window.__archerConfig ? window.__archerConfig.arrowHotbarSlot : -1;
            if (typeof hotbarSlot === 'number' && hotbarSlot >= 0) {
                window.pressKey((hotbarSlot + 1).toString());
            } else {
                // ค้นหาช่อง Hotbar ที่มีรูปลูกธนูอัตโนมัติ
                try {
                    const hotbarSlots = Array.from(document.querySelectorAll('[class*="itembar"] [class*="slot"], [class*="hotbar"] [class*="slot"], [class*="item-slot"], .quick-slot'));
                    let foundKey = '1';
                    for (let i = 0; i < hotbarSlots.length; i++) {
                        const s = hotbarSlots[i];
                        const img = s.querySelector('img');
                        const src = img ? (img.src || '').toLowerCase() : '';
                        const title = (s.getAttribute('title') || s.getAttribute('data-name') || s.innerText || '').toLowerCase();
                        if (src.includes('arrow') || src.includes('90030') || title.includes('arrow') || title.includes('ลูกธนู')) {
                            foundKey = (i === 9 ? '0' : (i + 1).toString());
                            break;
                        }
                    }
                    window.pressKey(foundKey);
                } catch(e) {
                    window.pressKey('1');
                }
            }
        }, 180);
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

        // 5. Fallback: ส่ง Packet inv_use ช่องที่ 2 (Item 3 ในกระเป๋า) และช่อง 8
        if (!bwingInBag && !domFound) {
            window.sendInvUse(2);
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

        function isWhitelisted(itemName) {
            if (!itemName) return false;
            const lower = itemName.toLowerCase();
            return rawWhitelist.some(w => lower.includes(w) || w.includes(lower));
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
            const candidates = Array.from(shopModal.querySelectorAll('button, [role="tab"], div, span, a, li')).filter(el => {
                if (el.closest('#pelican-hud') || el.closest('#pelican-data-modal')) return false;
                if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
                
                const txt = (el.innerText || el.textContent || '').trim();
                const searchKey = catName.includes('/') ? catName.split('/')[0] : catName;
                if (!txt.includes(catName) && !txt.includes(searchKey)) return false;

                // กรอง container แม่ทิ้ง: ถ้ามีชื่อแท็บหมวดอื่นปนอยู่ แสดงว่าเป็นแถบแท็บรวม ไม่ใช่ตัวปุ่มแท็บ
                const knownTabs = ['ทั้งหมด', 'อาวุธ', 'ชุดเกราะ', 'ประดับ', 'ใช้ได้', 'การ์ด', 'แร่', 'วัตถุดิบ', 'อื่นๆ'];
                const overlap = knownTabs.filter(t => {
                    if (t === catName || catName.includes(t) || t.includes(catName)) return false;
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
            
            // 1. ค้นหาจาก element ชื่อโดยตรง
            const nameEl = row.querySelector('[class*="name"], [class*="title"], h3, h4, h5, b, strong, .item-label');
            if (nameEl) {
                const t = nameEl.innerText.split('\n')[0].trim();
                if (t && !t.toLowerCase().includes('option') && !/^\d+[\s,]*z$/i.test(t) && !/^\d+$/.test(t) && !/^มี\s*\d+/.test(t) && t !== '+' && t !== '-') {
                    return t;
                }
            }

            // 2. ถ้าไม่พบ element เฉพาะ ให้แยกบรรทัดข้อความทั้งหมดในแถว
            const lines = (row.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                if (/^\d+$/.test(line)) continue;
                if (/^\d+[\s,]*z$/i.test(line)) continue;
                if (line === '+' || line === '-' || line === 'ทั้งหมด') continue;
                if (line.toLowerCase().includes('option') || line.includes('ออฟชั่น')) continue;
                if (/^มี\s*\d+/.test(line) || /^x\s*\d+/i.test(line) || /^จำนวน/i.test(line)) continue;
                if (line.includes('ขาย') || line.includes('ราคา') || line.includes('น้ำหนัก')) continue;
                if (line.length <= 1) continue;
                return line;
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
            if (catBtn) {
                const tabTitle = (catBtn.innerText || catBtn.textContent || '').trim();
                console.log(`%c[Pelican Shop] 🎯 พบคลิกแท็บหมวดหมู่: "${tabTitle}"`, 'color: #38bdf8; font-weight: bold;');
                triggerClick(catBtn);
                catBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                if (typeof catBtn.click === 'function') catBtn.click();
            } else {
                console.warn(`[Pelican Shop] ⚠️ ไม่พบปุ่มแท็บหมวดหมู่ "${catName}" ในร้านค้า`);
            }

            // รอ 600ms ให้หน้าร้านค้าเปลี่ยนรายการตามแท็บที่เลือก
            setTimeout(() => {
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

                        // กฎความปลอดภัย 1: ห้ามขายของใช้ / ใบวาร์ป / ยา / ลูกธนู เด็ดขาด
                        const lower = itemName.toLowerCase();
                        if (lower.includes('wing') || lower.includes('potion') || lower.includes('arrow') || lower.includes('ใบวาร์ป') || lower.includes('ลูกธนู') || lower.includes('ขวดยา')) {
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

                        // กฎความปลอดภัย 3.5: แดร์ฟูลเซฟเด็ดขาดสำหรับ "ธรรมดา (ขาวเท่านั้น)" (maxRank === 1)
                        // หากผู้เล่นเลือกขายเฉพาะของขาวธรรมดา ห้ามขายชิ้นที่มี Option, มีรูการ์ด, หรือตีบวกเด็ดขาด
                        // แม้ว่าผู้เล่นจะไม่ได้ติ๊กช่องล็อกของมี Option ก็ตาม! (ป้องกันการขายของมีค่าโดยเด็ดขาด)
                        if (maxRank === 1) {
                            if (hasOptions(rowText, row)) {
                                console.log(`[Pelican Shop] 🔒 [มี Option] ข้าม: "${itemName}" (ผู้เล่นเลือกขายเฉพาะระดับขาวธรรมดา 0 Option)`);
                                return;
                            }
                            if (hasSockets(itemName, rowText, titleEl)) {
                                console.log(`[Pelican Shop] 🔒 [มีรูการ์ด] ข้าม: "${itemName}" (ผู้เล่นเลือกขายเฉพาะระดับขาวธรรมดา ไม่มีรูการ์ด)`);
                                return;
                            }
                            if (isRefined(itemName, rowText, titleEl)) {
                                console.log(`[Pelican Shop] 🔒 [ของตีบวก] ข้าม: "${itemName}" (ผู้เล่นเลือกขายเฉพาะระดับขาวธรรมดา ไม่ตีบวก)`);
                                return;
                            }
                        }

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

                        // กฎความปลอดภัย 6: ห้ามขายของมี Option สุ่ม (เฉพาะเมื่อผู้เล่นเลือกขายระดับขาวธรรมดา maxRank === 1)
                        // หากผู้เล่นเลือกขายระดับ "ดี (เขียวลงไป)" ขึ้นไป (maxRank >= 2) ย่อมต้องการขายของระดับดีที่มี Option ได้
                        if (sellCfg.keepSpecial && maxRank === 1 && hasOptions(rowText, row)) {
                            console.log(`[Pelican Shop] 🔒 [มี Option] ข้ามไอเทม: "${itemName}"`);
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

    window.executeAutoShopRoutine = function() {
        if (window.__isShopping) {
            console.warn('[Pelican Shop] ⚠️ กำลังดำเนินการซื้อขายอยู่แล้ว');
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
                                console.log(`%c[Pelican Shop] 🚀 ภารกิจซื้อขายเสร็จสิ้น! สั่งเดินกลับไปฟาร์ม: ${currentFarmMap}`, 'color: #a855f7; font-weight: bold;');
                                setTimeout(() => {
                                    if (!window.__isBotRunning) return;
                                    window.__isShopping = false;
                                    window.__isKnownOverweight = false;
                                    window.walkToTargetMap(currentFarmMap);
                                }, 1000);
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

        // 3.1 ซิงก์น้ำหนักและกดจัดเรียงกระเป๋าเป็นระยะ (ทุกๆ 25 วินาที)
        const now = Date.now();
        if (now - lastPeriodicWeightRefresh > 25000 && !window.__isShopping && !window.__isNavigating && !window.__isRecovering) {
            lastPeriodicWeightRefresh = now;
            if (typeof window.refreshInventoryAndWeight === 'function') {
                window.refreshInventoryAndWeight();
            }
        }

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
        // ตรวจสอบหน้าต่างเลือกตัวละคร หรือปุ่ม "เริ่มเกม" หลัง Login
        const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a.btn')).filter(el => {
            return !el.closest('#pelican-hud') && el.offsetWidth > 0;
        });
        const enterBtn = candidates.find(el => {
            const txt = (el.innerText || el.textContent || '').trim();
            return txt === 'เริ่มเกม' || txt === 'เข้าสู่โลก' || txt === 'เข้าเล่น' || txt === 'เลือกตัวละคร' || txt === 'Enter World' || txt === 'Start Game';
        });
        if (enterBtn && !isLoginScreenVisible()) {
            console.log(`%c[Pelican Auth] 🎮 พบคลิกปุ่มเข้าสู่โลก ("${enterBtn.innerText.trim()}") -> กำลังคลิกเข้าเกม...`, 'color: #22c55e; font-weight: bold;');
            triggerClick(enterBtn);
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

            setTimeout(() => {
                isLoginInProgress = false;
                checkPostLoginScreen();
            }, 2500);
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

    function createUI() {
        if (document.getElementById('pelican-hud')) return;

        const hud = document.createElement('div');
        hud.id = 'pelican-hud';
        hud.innerHTML = `
            <style>
                #pelican-hud {
                    position: fixed;
                    top: 180px;
                    right: 20px;
                    width: 270px;
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
                    <span>PELICAN v4.2.1</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
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
                    <button class="p-tab-btn" data-tab="sell">💰 ขายของ</button>
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
                            <option value="90030" ${window.__archerConfig.arrowType === 90030 ? 'selected' : ''}>Arrow (ธรรมดา - 1z)</option>
                            <option value="90031" ${window.__archerConfig.arrowType === 90031 ? 'selected' : ''}>Fire Arrow (ไฟ - 3z)</option>
                            <option value="90032" ${window.__archerConfig.arrowType === 90032 ? 'selected' : ''}>Crystal Arrow (น้ำ - 3z)</option>
                            <option value="90033" ${window.__archerConfig.arrowType === 90033 ? 'selected' : ''}>Stone Arrow (ดิน - 3z)</option>
                            <option value="90034" ${window.__archerConfig.arrowType === 90034 ? 'selected' : ''}>Arrow of Wind (ลม - 3z)</option>
                            <option value="90036" ${window.__archerConfig.arrowType === 90036 ? 'selected' : ''}>Silver Arrow (ศักดิ์สิทธิ์ - 3z)</option>
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

                    <label class="p-check-box" style="color: #facc15;">
                        <input type="checkbox" id="p-sell-enabled" ${window.__sellConfig.enabled ? 'checked' : ''}>
                        <b>เปิดระบบ Auto-Sell คัดกรองอัตโนมัติ</b>
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

                <!-- TAB 4: SYSTEM & TOOLS -->
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
                        <div style="margin-top: 3px;">
                            <button class="p-btn" id="p-btn-dump-weight" style="background: #f59e0b; color: #000; font-weight: bold; padding: 4px; font-size: 10px; width: 100%;">⚖️ Dump น้ำหนัก DOM & กระเป๋า</button>
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

        // Hunter / Archer Event Listeners
        document.getElementById('p-archer-req').onchange = (e) => {
            window.__archerConfig.requireArrow = e.target.checked;
            saveArcherConfig();
        };

        document.getElementById('p-archer-type').onchange = (e) => {
            window.__archerConfig.arrowType = parseInt(e.target.value);
            saveArcherConfig();
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
        updateMasterBotUI();
        if (typeof getCharacterWeight === 'function') getCharacterWeight();
        setTimeout(() => { if (typeof getCharacterWeight === 'function') getCharacterWeight(); }, 800);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();
