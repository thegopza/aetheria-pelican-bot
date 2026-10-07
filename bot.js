// ==UserScript==
// @name         Aetheria Pelican Control Hub v4.2.0 (Auto-Sell Whitelist & True-Ammo Sync)
// @namespace    https://www.aetheria-online.in.th/
// @version      4.2.0
// @description  Full Packet Hex Dump, Minimap Direct Map Opener, WASD Backflip, Auto Shop, Auto-Sell Whitelist & True-Ammo Sync 24/7
// @match        https://www.aetheria-online.in.th/*
// @run-at       document-start
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js
// ==/UserScript==

(function () {
    'use strict';

    console.log('%c[Pelican] Control Hub v4.2.0 (Auto-Sell Whitelist & True-Ammo Sync 24/7) Ready', 'color: #00ffcc; font-weight: bold; font-size: 14px;');

    window.__gameSocket = null;
    window.__lastMoveToken = null;
    window.__currentPos = { x: 0, y: 0 };
    window.__monsterPos = null;
    window.__lastTargetTime = 0;
    window.__lastBackflipTime = 0;
    window.__packetLogs = [];
    window.__outgoingLogs = [];
    window.__latestInventory = null;
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

    // Auto-Sell Filter & Whitelist Config (ระดับตามเกมจริง: ธรรมดา, ดี, หายาก, มหากาพย์, ตำนาน)
    const defaultSellConfig = {
        enabled: true,
        sellMaterials: true,
        sellWeapons: false,
        sellArmors: false,
        maxRarityToSell: 'normal', // 'normal' (ธรรมดา), 'good' (ดี), 'rare' (หายาก), 'epic' (มหากาพย์)
        keepRefined: true, // ห้ามขายของตีบวก (+1 ขึ้นไป)
        keepSpecial: true, // ห้ามขายของมี Option สุ่ม
        keepSockets: true, // ห้ามขายของมีรูการ์ด [1-4]
        whitelist: 'Phracon, Rough Elunium, Enchant Rune, Composite Bow, Crossbow, Gakkung, Hunter Bow'
    };
    try {
        const stored = JSON.parse(localStorage.getItem('pelican_sell_cfg') || '{}');
        window.__sellConfig = Object.assign({}, defaultSellConfig, stored);
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

    
    // ==========================================
    // BROWSERTOOLS MCP NATIVE GAME CONNECTOR
    // ==========================================
    (function initBrowserToolsBridge() {
        let mcpWs = null;
        let reconnectTimer = null;
        const tabId = "aetheria-game";

        function tryConnect() {
            if (mcpWs && (mcpWs.readyState === WebSocket.OPEN || mcpWs.readyState === WebSocket.CONNECTING)) return;
            try {
                mcpWs = new WebSocket('ws://127.0.0.1:3025/extension-ws');
                mcpWs.onopen = () => {
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
                    scheduleReconnect();
                };

                mcpWs.onerror = () => {
                    mcpWs = null;
                };
            } catch(e) {
                scheduleReconnect();
            }
        }

        function scheduleReconnect() {
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    tryConnect();
                }, 3000);
            }
        }

        const origLog = console.log;
        const origWarn = console.warn;
        const origError = console.error;

        function forward(level, args) {
            if (mcpWs && mcpWs.readyState === WebSocket.OPEN) {
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

    const OriginalWebSocket = window.WebSocket;

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

    window.copyOutgoingLogs = function(count = 10) {
        const recent = window.__outgoingLogs.slice(-count);
        const jsonStr = JSON.stringify(recent, null, 2);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonStr).then(() => {
                alert(`คัดลอก Packet ขาออก (OUT) จำนวน ${recent.length} รายการ (Hex เต็ม 100%) สำเร็จแล้ว!`);
            });
        } else {
            console.log(jsonStr);
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
            if (navigator.clipboard) {
                navigator.clipboard.writeText(jsonStr).then(() => {
                    alert(`📋 คัดลอกข้อมูลแผนที่โลก (${mapList.length} โซน) ลง Clipboard เรียบร้อยแล้ว!`);
                });
            }
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
        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonStr).then(() => {
                alert('📦 [Pelican Dump] สแกนกระเป๋าและอุปกรณ์สำเร็จ!\n\n📋 คัดลอก Full Dump (JSON) ลง Clipboard ให้เรียบร้อยแล้ว');
            });
        }
        return dump;
    };

    window.dumpItemData = window.dumpDeepInventory;

    window.dumpAllPackets = function(count = 100) {
        const packets = (window.__packetLogs || []).slice(-count);
        const jsonStr = JSON.stringify(packets, null, 2);
        console.log(`%c[Pelican Dump] 📜 Dump Packet Logs (${packets.length} รายการ):`, 'color: #f59e0b; font-weight: bold;');
        console.table(packets.map(p => ({ time: p.time, dir: p.dir, opcode: p.opcode, len: p.len, ascii: p.ascii.slice(0, 30) })));
        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonStr).then(() => {
                alert(`📋 คัดลอก Packet Logs ทั้งหมด (${packets.length} รายการ) ลง Clipboard เรียบร้อยแล้ว!`);
            });
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
            shopConfig: window.__shopConfig
        };
        console.log('%c[Pelican Dump] 🕹️ ข้อมูล Game State ปัจจุบัน:', 'color: #22c55e; font-weight: bold;');
        console.dir(state);
        const jsonStr = JSON.stringify(state, null, 2);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonStr).then(() => {
                alert('📋 คัดลอก Game State ลง Clipboard เรียบร้อยแล้ว!');
            });
        }
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
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2)).then(() => {
                        const btn = document.getElementById('p-modal-copy-btn');
                        const orig = btn.innerText;
                        btn.innerText = '✅ คัดลอกสำเร็จ!';
                        setTimeout(() => btn.innerText = orig, 1500);
                    });
                }
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
                        <button onclick="window.pressKey('b')" style="background: #eab308; color: #000; border: none; padding: 5px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">🎒 กดเปิดกระเป๋า (B)</button>
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
            const packets = (window.__packetLogs || []).slice(-40);
            const filtered = packets.filter(p => {
                if (!query) return true;
                return p.dir.toLowerCase().includes(query) || p.opcode.toLowerCase().includes(query) || p.ascii.toLowerCase().includes(query);
            });

            let html = `
                <div style="margin-bottom: 8px; color: #f59e0b; font-weight: bold;">📜 บันทึก Packet เครือข่ายล่าสุด (ย้อนหลัง 40 รายการ):</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; font-family: monospace;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; text-align: left;">
                            <th style="padding: 5px 8px; border: 1px solid #334155;">เวลา</th>
                            <th style="padding: 5px 8px; border: 1px solid #334155;">ทิศทาง</th>
                            <th style="padding: 5px 8px; border: 1px solid #334155;">Opcode</th>
                            <th style="padding: 5px 8px; border: 1px solid #334155;">ขนาด</th>
                            <th style="padding: 5px 8px; border: 1px solid #334155;">Decoded / ASCII Preview</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            if (filtered.length === 0) {
                html += `<tr><td colspan="5" style="text-align: center; padding: 16px; color: #64748b;">ยังไม่มี Packet</td></tr>`;
            } else {
                filtered.slice().reverse().forEach(p => {
                    const isOut = p.dir === 'OUT';
                    const decStr = p.decoded ? (typeof p.decoded === 'object' ? JSON.stringify(p.decoded).slice(0, 70) : String(p.decoded)) : p.ascii.slice(0, 50);
                    html += `
                        <tr style="border-bottom: 1px solid #1e293b;">
                            <td style="padding: 4px 8px; color: #64748b; border: 1px solid #334155;">${p.time}</td>
                            <td style="padding: 4px 8px; font-weight: bold; color: ${isOut ? '#38bdf8' : '#f59e0b'}; border: 1px solid #334155;">${p.dir}</td>
                            <td style="padding: 4px 8px; color: #c084fc; border: 1px solid #334155;">${p.opcode}</td>
                            <td style="padding: 4px 8px; color: #94a3b8; border: 1px solid #334155;">${p.len}B</td>
                            <td style="padding: 4px 8px; color: #cbd5e1; word-break: break-all; border: 1px solid #334155;">${decStr}</td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table>`;
            container.innerHTML = html;

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

                    if (window.__autoJumpEnabled && window.__monsterPos) {
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

    function isCharacterOverweight() {
        const bodyText = document.body.innerText || '';
        return bodyText.includes('กระเป๋าหนักเกิน 90%') || bodyText.includes('น้ำหนักเกิน 90%');
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

    function dispatchKeyAll(keyStr, codeStr, keyCodeNum) {
        const opts = { key: keyStr, code: codeStr, keyCode: keyCodeNum, which: keyCodeNum, bubbles: true, cancelable: true, composed: true, view: window };
        document.body.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', opts));
        document.body.dispatchEvent(new KeyboardEvent('keydown', opts));
        window.dispatchEvent(new KeyboardEvent('keydown', opts));

        const canvas = document.querySelector('canvas');
        if (canvas) canvas.dispatchEvent(new KeyboardEvent('keydown', opts));

        setTimeout(() => {
            document.dispatchEvent(new KeyboardEvent('keyup', opts));
            document.body.dispatchEvent(new KeyboardEvent('keyup', opts));
            window.dispatchEvent(new KeyboardEvent('keyup', opts));
            if (canvas) canvas.dispatchEvent(new KeyboardEvent('keyup', opts));
        }, 50);
    }

    window.pressKey = function(keyStr) {
        const charCode = keyStr.charCodeAt(0);
        dispatchKeyAll(keyStr, 'Digit' + keyStr, charCode);
    };

    // ==========================================
    // 2. WebSocket Hooking
    // ==========================================
    window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(Target, args) {
            const ws = new Target(...args);
            window.__gameSocket = ws;
            console.log('%c[Pelican] Captured Game Socket:', 'color: #38bdf8;', args[0]);

            ws.addEventListener('open', () => updateUIStatus(true));
            ws.addEventListener('message', (event) => {
                recordPacket('IN', event.data);
                try {
                    const rawData = event.data;
                    const u = new Uint8Array(rawData instanceof ArrayBuffer ? rawData : rawData.buffer);
                    if (u[0] === 0x0D) {
                        // ค้นหาตำแหน่งคำว่า "slots" ในไบต์ (s=0x73, l=0x6c, o=0x6f, t=0x74, s=0x73)
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

                                        // ถ้ามีโครงสร้าง slots ส่งมา (อัปเดต inventory)
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
            });

            const originalSend = ws.send;
            ws.send = function (data) {
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

                            if (navigator.clipboard) {
                                const clipData = JSON.stringify({ hex: fullHex, ascii: fullAscii, decoded: decoded, len: uint8.length }, null, 2);
                                navigator.clipboard.writeText(clipData);
                            }
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
                return originalSend.apply(this, arguments);
            };

            return ws;
        }
    });

    // ==========================================
    // 3. WASD Reverse Backflip Engine
    // ==========================================
    window.executeReverseBackflip = function(mX, mY) {
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
    // In-Game AUTO Toggles (Low-Level)
    // ------------------------------------------
    window.activateInGameAuto = function() {
        // สลับใส่ลูกธนูผ่านคีย์ลัดเฉพาะเมื่อผู้ใช้เปิดใช้งานอย่างชัดเจน (ป้องกันการไปกดสลับใส่ดาบ Damascus)
        if (window.__archerConfig && window.__archerConfig.requireArrow && window.__archerConfig.autoEquipArrow) {
            const slot = window.__archerConfig.arrowHotbarSlot;
            if (typeof slot === 'number' && slot >= 0) {
                if (typeof window.sendEquip === 'function') {
                    window.sendEquip(slot);
                }
                if (typeof window.pressKey === 'function') {
                    window.pressKey((slot + 1).toString());
                }
            }
        }

        const autoPanel = document.querySelector('.auto-panel') || document.body;
        const autoBtns = Array.from(autoPanel.querySelectorAll('button, div')).filter(el => el.innerText && el.innerText.includes('AUTO'));
        const autoBtn = autoBtns.find(b => b.innerText.includes('ปิด') || b.innerText.includes('AUTO')) || autoBtns[0];

        if (autoBtn) {
            triggerClick(autoBtn);
            console.log('%c[Pelican] 🤖 คลิกปุ่ม AUTO บนหน้าจอเกมสำเร็จ!', 'color: #22c55e; font-weight: bold;');
        }

        if (window.__gameSocket && window.__gameSocket.readyState === 1) {
            const token = window.__lastMoveToken || [0xd4, 0x72, 0x41];
            const buffer = new Uint8Array(10 + token.length + 10);
            buffer.set([0x0D, 0xA8, 0x61, 0x75, 0x74, 0x6F, 0x5F, 0x73, 0x65, 0x74], 0);
            buffer.set(token, 10);
            buffer.set([0x91, 0xA7, 0x65, 0x6E, 0x61, 0x62, 0x6C, 0x65, 0x64, 0xC3], 10 + token.length);
            window.__gameSocket.send(buffer.buffer);
        }
    };

    window.deactivateInGameAuto = function() {
        const autoPanel = document.querySelector('.auto-panel') || document.body;
        const autoBtns = Array.from(autoPanel.querySelectorAll('button, div')).filter(el => el.innerText && el.innerText.includes('AUTO'));
        const activeAutoBtn = autoBtns.find(b => b.innerText.includes('เปิด') || b.className.includes('active') || b.className.includes('running'));
        if (activeAutoBtn) {
            triggerClick(activeAutoBtn);
        }

        if (window.__gameSocket && window.__gameSocket.readyState === 1) {
            const token = window.__lastMoveToken || [0xd4, 0x72, 0x41];
            const buffer = new Uint8Array(10 + token.length + 10);
            buffer.set([0x0D, 0xA8, 0x61, 0x75, 0x74, 0x6F, 0x5F, 0x73, 0x65, 0x74], 0);
            buffer.set(token, 10);
            buffer.set([0x91, 0xA7, 0x65, 0x6E, 0x61, 0x62, 0x6C, 0x65, 0x64, 0xC2], 10 + token.length); // 0xC2 = false in msgpack
            window.__gameSocket.send(buffer.buffer);
        }
    };

    // Alias for backward compatibility
    window.startBot = window.activateInGameAuto;

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

        // 3. ตรวจสอบแมพปัจจุบันและแมพเป้าหมาย (Map Check)
        const currentMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
        const targetMap = window.__targetFarmMap || 'ถนนต้นหลิว';
        console.log(`%c[Pelican Master] 🗺️ ตรวจสอบแมพ: แมพปัจจุบัน = "${currentMap || 'ไม่ทราบ'}" | แมพเป้าหมาย = "${targetMap}"`, 'color: #38bdf8; font-weight: bold;');

        // Case A: ตัวละครอยู่ที่แมพเป้าหมายแล้ว!
        if (currentMap && currentMap.includes(targetMap)) {
            console.log(`%c[Pelican Master] 🎯 ตัวละครอยู่ที่แมพ "${targetMap}" เรียบร้อยแล้ว! เปิดระบบ Auto โจมตีฟาร์มทันที!`, 'color: #22c55e; font-weight: bold;');
            window.activateInGameAuto();
            return;
        }

        // Case B: ตัวละครอยู่ในเมืองหลวง (Soulhaven) -> วาร์ปผ่าน Alice Service (n6)
        if (typeof isCharacterInCity === 'function' && isCharacterInCity()) {
            console.log(`%c[Pelican Master] 🏛️ ตัวละครอยู่ในเมืองหลวง -> เดินไปหา Alice (n6) เพื่อเปิดวาร์ปไป "${targetMap}"...`, 'color: #eab308; font-weight: bold;');
            window.walkToTargetMap(targetMap, true);
            return;
        }

        // Case C: ตัวละครอยู่แมพมอนสเตอร์อื่น -> เปิดแผนที่โลกเพื่อเดินทาง

        // Case C: ตัวละครอยู่แมพมอนสเตอร์อื่น -> เดินทางไปยังแมพเป้าหมาย
        console.log(`%c[Pelican Master] 🚶 กำลังเริ่มเดินทางไปยังแมพเป้าหมาย: "${targetMap}"...`, 'color: #38bdf8; font-weight: bold;');
        window.walkToTargetMap(targetMap, true);
    };

    window.stopMasterBot = function() {
        window.__isBotRunning = false;
        window.__autoLoopEnabled = false;
        localStorage.setItem('pelican_bot_running', 'false');
        localStorage.setItem('pelican_auto_loop', 'false');

        const loopCheckbox = document.getElementById('p-auto-loop');
        if (loopCheckbox) loopCheckbox.checked = false;

        // 1. ปิดระบบ AUTO ของเกม
        window.deactivateInGameAuto();

        // 2. หยุด Navigation และ Watchers
        if (typeof stopArrivalWatcher === 'function') stopArrivalWatcher();
        window.__isNavigating = false;
        window.__isShopping = false;
        window.__isRecovering = false;

        if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
        console.log('%c[Pelican Master] 🛑 STOP BOT: ปิดระบบการทำงานทั้งหมดเรียบร้อยแล้ว!', 'color: #ef4444; font-weight: bold; font-size: 13px;');
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
        // 1. ถ้าหน้าต่าง Alice Service เปิดอยู่บนหน้าจอแล้ว ให้ทำงานต่อได้ทันที
        const isAliceAlreadyOpen = isWorldMapOpen() || Array.from(document.querySelectorAll('*')).some(el => {
            const t = (el.textContent || '').trim();
            return t.includes('Alice Service') && el.offsetWidth > 0;
        });
        if (isAliceAlreadyOpen) {
            console.log('%c[Pelican Warp] 🗺️ หน้าต่าง Alice Service เปิดอยู่แล้ว ทำงานต่อได้ทันที', 'color: #22c55e;');
            if (callback) callback();
            return;
        }

        console.log('%c[Pelican Warp] 🧙 กำลังเดินทางไปคุยกับ NPC Alice (n6)...', 'color: #eab308; font-weight: bold;');
        window.sendRemoteNpcTalk('n6');

        let moveAttempts = 0;
        let lastPlayerPos = { x: 0, y: 0 };
        let stationaryCount = 0;

        const aliceArrivalCheck = setInterval(() => {
            if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                clearInterval(aliceArrivalCheck);
                console.warn('[Pelican Warp] 🛑 ตัวละครเสียชีวิต ยกเลิกการเดินไปหา Alice');
                return;
            }

            moveAttempts++;
            const curPos = window.__currentPos || { x: 0, y: 0 };
            const isStationary = (curPos.x === lastPlayerPos.x && curPos.y === lastPlayerPos.y && curPos.x !== 0);
            lastPlayerPos = { x: curPos.x, y: curPos.y };

            if (isStationary) {
                stationaryCount++;
            } else {
                stationaryCount = 0;
            }

            // ตรวจว่ามี Dialog หรือหน้าต่าง Alice Service เด้งขึ้นมาแล้วหรือไม่
            const hasAliceUI = isWorldMapOpen() || Array.from(document.querySelectorAll('*')).some(el => {
                const t = (el.textContent || '').trim();
                return t.includes('Alice Service') && el.offsetWidth > 0;
            });

            // เงื่อนไข: ตัวละครหยุดเดินแล้ว (ถึงตัว Alice แล้ว) หรือหน้าต่าง UI ขึ้นแล้ว
            if (hasAliceUI || (stationaryCount >= 2 && moveAttempts >= 5)) {
                clearInterval(aliceArrivalCheck);
                console.log('%c[Pelican Warp] 🎯 เดินถึงระยะคุยกับ NPC Alice แล้ว! กำลังเปิดเมนูวาร์ป...', 'color: #22c55e; font-weight: bold;');

                // ยิง npc_talk ย้ำระยะประชิดเพื่อเปิด Dialog ให้แน่นอน
                window.sendRemoteNpcTalk('n6');

                setTimeout(() => {
                    // ส่ง Option 1: Alice Warp Service
                    window.sendRemoteNpcOption(1);

                    // รอให้หน้าต่างแผนที่ Alice World Map เรนเดอร์บนหน้าจอ
                    let waitMapRounds = 0;
                    const mapWaitInterval = setInterval(() => {
                        waitMapRounds++;
                        const isMapReady = isWorldMapOpen() || Array.from(document.querySelectorAll('*')).some(el => {
                            const t = (el.textContent || '').trim();
                            return t.includes('Alice Service') && el.offsetWidth > 0;
                        });

                        if (isMapReady || waitMapRounds >= 10) {
                            clearInterval(mapWaitInterval);
                            console.log('%c[Pelican Warp] 🗺️ หน้าต่างแผนที่ Alice Warp Service พร้อมใช้งาน!', 'color: #00ffcc; font-weight: bold;');
                            setTimeout(() => {
                                if (callback) callback();
                            }, 500);
                        }
                    }, 300);
                }, 700);
                return;
            }

            // Timeout ป้องกันค้าง (เกิน 15 วินาที)
            if (moveAttempts >= 25) {
                clearInterval(aliceArrivalCheck);
                console.warn('[Pelican Warp] ⚠️ Timeout เดินไปหา Alice (เกิน 15 วิ) -> ลองส่งคำสั่งเปิดทันที');
                window.sendRemoteNpcTalk('n6');
                setTimeout(() => {
                    window.sendRemoteNpcOption(1);
                    setTimeout(() => {
                        if (callback) callback();
                    }, 800);
                }, 600);
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
        console.log(`%c[Pelican] 🏹 สวมใส่ไอเทมช่องลัด (sendEquip Slot: ${slot})!`, 'color: #22c55e; font-weight: bold;');
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
        console.log('%c[Pelican] 🦋 กำลังใช้วาร์ป Butterfly Wing กลับเมืองหลวง (Slot 8)...', 'color: #38bdf8; font-weight: bold;');

        // 1. ส่ง Packet equip ช่อง 8 (Packet หลักของช่อง ItemBar)
        if (typeof window.sendEquip === 'function') {
            window.sendEquip(8);
        }

        // 2. ส่ง Packet inv_use ช่อง 8 (สำรอง)
        window.sendInvUse(8);

        // 3. คลิก DOM Element ถ้ามี (หา element ที่มีรูปหรือชื่อ Bwing)
        try {
            const bwingEl = Array.from(document.querySelectorAll('*')).find(el => {
                if (el.closest('#pelican-hud')) return false;
                const src = el.src || (el.style && el.style.backgroundImage) || '';
                const txt = el.innerText || el.textContent || '';
                return (src.includes('160c7') || src.includes('90311') || src.includes('bwing') || src.includes('wing') || txt.includes('Butterfly')) && el.offsetWidth > 0;
            });
            if (bwingEl) {
                triggerClick(bwingEl);
                console.log('%c[Pelican] 🦋 คลิกปุ่ม Butterfly Wing บนหน้าจอสำเร็จ!', 'color: #22c55e;');
            }
        } catch(e) {}

        // 4. จำลองคลิก Canvas ที่ช่องลัด Slot 8 (แถวบน ItemBar ฝั่งขวาสุด)
        const canvas = document.querySelector('canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const targetX = centerX + 160;
            const targetY = rect.bottom - 85;

            const opts = { clientX: targetX, clientY: targetY, bubbles: true, cancelable: true, view: window, buttons: 1 };
            canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
            canvas.dispatchEvent(new MouseEvent('mousedown', opts));
            canvas.dispatchEvent(new PointerEvent('pointerup', opts));
            canvas.dispatchEvent(new MouseEvent('mouseup', opts));
            canvas.dispatchEvent(new MouseEvent('click', opts));
        }
    };

    function triggerAutoSellTrash(callback) {
        const sellCfg = window.__sellConfig || {};
        if (!sellCfg.enabled || (!sellCfg.sellMaterials && !sellCfg.sellWeapons && !sellCfg.sellArmors)) {
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

        function getItemRarity(rowText, titleEl) {
            const text = ((titleEl ? titleEl.innerText : '') + ' ' + (rowText || '')).toLowerCase();
            // ระดับ 5: ตำนาน (Legendary - สีส้ม/ทอง)
            if (text.includes('ตำนาน') || text.includes('legendary')) return 5;
            // ระดับ 4: มหากาพย์ (Epic - สีม่วง)
            if (text.includes('มหากาพย์') || text.includes('epic')) return 4;
            // ระดับ 3: หายาก (Rare - สีฟ้า)
            if (text.includes('หายาก') || text.includes('rare')) return 3;
            // ระดับ 2: ดี (Good - สีเขียว)
            if (text.includes('ระดับ: ดี') || text.includes('ระดับ ดี') || text.includes('ระดับดี') || text.includes('· ดี') || /(?:^|\s|[·•|])ดี(?:\s|[·•|]|$)/.test(text) || text.includes('good') || text.includes('ชำนาญ')) return 2;
            // ระดับ 1: ธรรมดา (Normal / Common - สีขาว)
            if (text.includes('ธรรมดา') || text.includes('ทั่วไป') || text.includes('common') || text.includes('normal')) return 1;

            if (titleEl) {
                const color = window.getComputedStyle(titleEl).color || '';
                if (color.includes('245, 158') || color.includes('234, 88') || color.includes('249, 115') || color.includes('234, 179, 8')) return 5; // ตำนาน (ส้ม/ทอง)
                if (color.includes('168, 85') || color.includes('192, 132') || color.includes('147, 51') || color.includes('168, 85, 247')) return 4; // มหากาพย์ (ม่วง)
                if (color.includes('56, 189') || color.includes('59, 130') || color.includes('14, 165') || color.includes('96, 165, 250')) return 3; // หายาก (ฟ้า)
                if (color.includes('34, 197') || color.includes('74, 222') || color.includes('22, 163') || color.includes('16, 185, 129')) return 2; // ดี (เขียว)
            }
            return 1;
        }

        function isRefined(rowText, titleEl) {
            const text = ((titleEl ? titleEl.innerText : '') + ' ' + (rowText || '')).toLowerCase();
            return /\+\s*\d+/.test(text) || text.includes('ตีบวก');
        }

        function hasSockets(rowText, titleEl) {
            const text = ((titleEl ? titleEl.innerText : '') + ' ' + (rowText || ''));
            return /\[\s*[1-4]\s*\]/.test(text);
        }

        function hasOptions(rowText) {
            const text = (rowText || '').toLowerCase();
            return text.includes('option') || text.includes('ออฟชั่น') || text.includes('มี option');
        }

        // 1. สลับไปแท็บ "ขาย" (เฉพาะปุ่มแท็บในหน้าต่างร้านค้า)
        const sellTabs = Array.from(document.querySelectorAll('button, div')).filter(el => {
            const txt = (el.innerText || '').trim();
            return txt === 'ขาย' && (el.closest('.shop-window') || el.closest('[class*="shop"]') || el.offsetHeight > 0);
        });
        const sellTab = sellTabs[0];
        if (sellTab) {
            triggerClick(sellTab);
            if (typeof sellTab.click === 'function') sellTab.click();
        }

        function processCategory(catName, isItemByItem, onDone) {
            console.log(`[Pelican Shop] 🔍 ตรวจสอบหมวดหมู่: "${catName}"...`);
            const catBtns = Array.from(document.querySelectorAll('button, div')).filter(el => {
                const txt = (el.innerText || '').trim();
                return txt.includes(catName) && el.offsetWidth > 0 && el.offsetHeight > 0;
            });
            const catBtn = catBtns[0];
            if (catBtn) {
                triggerClick(catBtn);
                if (typeof catBtn.click === 'function') catBtn.click();
            }

            setTimeout(() => {
                if (!isItemByItem) {
                    // หมวด "วัตถุดิบ": คลิก "ใส่วัตถุดิบทั่งหมดลงตะกร้า" (button.shop-sell-junk)
                    const putAllBtn = document.querySelector('button.shop-sell-junk') ||
                        Array.from(document.querySelectorAll('button')).find(el => (el.innerText || '').includes('ใส่วัตถุดิบ'));
                    
                    if (putAllBtn && !putAllBtn.innerText.includes('0 รายการ')) {
                        console.log('%c[Pelican Shop] 🧺 คลิก "ใส่วัตถุดิบทั่งหมดลงตะกร้า"...', 'color: #eab308; font-weight: bold;');
                        triggerClick(putAllBtn);
                        if (typeof putAllBtn.click === 'function') putAllBtn.click();
                        const inner = putAllBtn.querySelector('button, span, div') || putAllBtn;
                        if (typeof inner.click === 'function') inner.click();
                    }
                    setTimeout(onDone, 500);
                } else {
                    // หมวด "อาวุธ" หรือ "ชุดเกราะ": กรองตาม Whitelist, ระดับ Rarity, ตีบวก, รูการ์ด, และ Option
                    const shopModal = document.querySelector('.shop-window') || document.querySelector('[class*="shop"]') || document.body;
                    const plusBtns = Array.from(shopModal.querySelectorAll('button, div')).filter(b => (b.innerText || '').trim() === '+' && b.offsetWidth > 0);

                    let addedCount = 0;
                    plusBtns.forEach(btn => {
                        const row = btn.closest('[class*="item"]') || btn.parentElement?.parentElement || btn.parentElement;
                        if (!row) return;

                        const rowText = row.innerText || '';
                        const titleEl = row.querySelector('h3, h4, span, div') || row;
                        const itemName = titleEl ? titleEl.innerText.split('\n')[0].trim() : '';

                        // กฎความปลอดภัย 1: ห้ามขายเด็ดขาดถ้าตรงกับ Whitelist
                        if (isWhitelisted(itemName)) {
                            console.log(`[Pelican Shop] 🔒 [Whitelist] ข้าม: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 2: กรองระดับความหายาก (Rarity ตามเกม: ธรรมดา, ดี, หายาก, มหากาพย์, ตำนาน)
                        const rarityRank = getItemRarity(rowText, titleEl);
                        const rankMap = {
                            'normal': 1, 'common': 1,
                            'good': 2, 'magic': 2,
                            'rare': 3,
                            'epic': 4,
                            'legendary': 5
                        };
                        const maxRank = rankMap[sellCfg.maxRarityToSell || 'normal'] || 1;
                        if (rarityRank > maxRank) {
                            const rankNames = { 1: 'ธรรมดา (ขาว)', 2: 'ดี (เขียว)', 3: 'หายาก (ฟ้า)', 4: 'มหากาพย์ (ม่วง)', 5: 'ตำนาน (ทอง)' };
                            console.log(`[Pelican Shop] 🔒 [ระดับสูง] ข้าม: "${itemName}" (ระดับ: ${rankNames[rarityRank] || rarityRank})`);
                            return;
                        }

                        // กฎความปลอดภัย 3: ห้ามขายของตีบวก (+1 ขึ้นไป)
                        if (sellCfg.keepRefined && isRefined(rowText, titleEl)) {
                            console.log(`[Pelican Shop] 🔒 [ของตีบวก] ข้ามไอเทมตีบวก: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 4: ห้ามขายของมีรูการ์ด [1-4]
                        if (sellCfg.keepSockets && hasSockets(rowText, titleEl)) {
                            console.log(`[Pelican Shop] 🔒 [มีรูการ์ด] ข้ามไอเทมมีรู: "${itemName}"`);
                            return;
                        }

                        // กฎความปลอดภัย 5: ห้ามขายของมี Option สุ่ม
                        if (sellCfg.keepSpecial && hasOptions(rowText)) {
                            console.log(`[Pelican Shop] 🔒 [มี Option] ข้ามไอเทม: "${itemName}"`);
                            return;
                        }

                        // ปลอดภัย 100% -> กด '+' ใส่ตะกร้า
                        console.log(`%c[Pelican Shop] ➕ ใส่อาวุธ/เกราะขยะลงตะกร้า: "${itemName}"`, 'color: #22c55e;');
                        triggerClick(btn);
                        if (typeof btn.click === 'function') btn.click();
                        addedCount++;
                    });

                    setTimeout(onDone, addedCount > 0 ? 600 : 350);
                }
            }, 500);
        }

        setTimeout(() => {
            const steps = [];
            if (sellCfg.sellMaterials) steps.push((next) => processCategory('วัตถุดิบ', false, next));
            if (sellCfg.sellWeapons) steps.push((next) => processCategory('อาวุธ', true, next));
            if (sellCfg.sellArmors) steps.push((next) => processCategory('ชุดเกราะ', true, next));

            function runSteps(idx) {
                if (idx >= steps.length) {
                    setTimeout(() => {
                        const confirmBtn = document.querySelector('button.cart-go') ||
                            Array.from(document.querySelectorAll('button')).find(el => (el.innerText || '').includes('ตรวจสอบและขาย') && el.offsetWidth > 0);

                        if (confirmBtn && !confirmBtn.disabled && !confirmBtn.className.includes('disabled')) {
                            console.log('%c[Pelican Shop] 💵 คลิก "ตรวจสอบและขาย" (cart-go)...', 'color: #22c55e; font-weight: bold;');
                            triggerClick(confirmBtn);
                            if (typeof confirmBtn.click === 'function') confirmBtn.click();

                            // รอให้หน้าต่าง Modal "ยืนยันการขาย" เด้งขึ้นมา แล้วกดปุ่ม "ยืนยันขาย" สีทอง
                            let confirmAttempts = 0;
                            const confirmPoll = setInterval(() => {
                                confirmAttempts++;

                                // 1. หาปุ่มที่มีคำว่า "ยืนยันขาย" โดยตรง
                                let finalBtn = Array.from(document.querySelectorAll('button')).find(b => {
                                    const txt = (b.innerText || '').trim();
                                    return txt === 'ยืนยันขาย' || txt.includes('ยืนยันขาย');
                                });

                                // 2. ถ้าไม่พบตรงๆ ให้หาจากกล่อง Modal ยืนยันการขาย (ไม่เอากล่องร้านหลัก)
                                if (!finalBtn) {
                                    const confirmModal = Array.from(document.querySelectorAll('div, section, aside')).find(el => {
                                        const t = el.innerText || '';
                                        return t.includes('ยืนยันการขาย') && (t.includes('ยกเลิก') || t.includes('รวมที่ได้รับ'));
                                    });
                                    if (confirmModal) {
                                        finalBtn = Array.from(confirmModal.querySelectorAll('button')).find(b => {
                                            const txt = (b.innerText || '').trim();
                                            return txt.includes('ยืนยัน') && !txt.includes('ยกเลิก');
                                        });
                                    }
                                }

                                if (finalBtn) {
                                    clearInterval(confirmPoll);
                                    console.log('%c[Pelican Shop] 💰 พบปุ่ม "ยืนยันขาย" สีทองตัวจริง กำลังกดยืนยัน...', 'color: #22c55e; font-weight: bold;', finalBtn);
                                    triggerClick(finalBtn);
                                    if (typeof finalBtn.click === 'function') finalBtn.click();
                                    const inner = finalBtn.querySelector('button, span, div') || finalBtn;
                                    if (typeof inner.click === 'function') inner.click();

                                    // รอให้ Modal ปิดลงและระบบบันทึกเงิน Zeny จากนั้นสลับกลับไปแท็บ "ซื้อ"
                                    setTimeout(() => {
                                        const buyTabs = Array.from(document.querySelectorAll('button, div')).filter(el => {
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
                                    clearInterval(confirmPoll);
                                    console.warn('[Pelican Shop] ⚠️ หมดเวลารอปุ่มยืนยันขาย (Timeout)');
                                    const buyTabs = Array.from(document.querySelectorAll('button, div')).filter(el => (el.innerText || '').trim() === 'ซื้อ');
                                    if (buyTabs[0]) triggerClick(buyTabs[0]);
                                    if (callback) callback();
                                }
                            }, 200);
                        } else {
                            console.log('[Pelican Shop] ตะกร้าขายว่างเปล่า (ไม่มีไอเทมจะขาย) -> สลับไปขั้นตอนซื้อ');
                            const buyTabs = Array.from(document.querySelectorAll('button, div')).filter(el => (el.innerText || '').trim() === 'ซื้อ');
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
        triggerAutoSellTrash(() => {
            console.log('%c[Pelican Shop] ✅ ทดสอบขายไอเทมเสร็จสมบูรณ์!', 'color: #22c55e; font-weight: bold;');
        });
    };

    function executeSellAndBuyActions(onComplete) {
        console.log('%c[Pelican Shop] 📦 กำลังดำเนินการซื้อ/ขายไอเทมตามตั้งค่า...', 'color: #00ffcc;');

        // 1. ดำเนินการขายขยะมอนสเตอร์ก่อน (ถ้าเปิดใช้งาน)
        triggerAutoSellTrash(() => {
            const cfg = window.__archerConfig || {};
            const arrowId = parseInt(cfg.arrowType) || 0x00015fae;
            const arrowQty = parseInt(cfg.arrowBuyQty) || 200;

            // 2. ซื้อลูกธนูชนิดที่เลือก
            if (cfg.requireArrow) {
                window.sendShopBuy(arrowId, arrowQty);
            }

            // 3. ซื้อ Butterfly Wing พ่วงด้วยถ้าเปิดใช้
            if (cfg.useBwing) {
                setTimeout(() => {
                    window.sendShopBuy(cfg.bwingItemId || 0x000160c7, parseInt(cfg.bwingBuyQty) || 5);
                }, 350);
            }

            // 4. นำลูกธนูและ Butterfly Wing ใส่ช่องลัดด้านล่างอัตโนมัติ (เฉพาะเมื่อระบุช่อง)
            setTimeout(() => {
                if (cfg.requireArrow) {
                    if (typeof cfg.arrowHotbarSlot === 'number' && cfg.arrowHotbarSlot >= 0) {
                        window.sendItembarSet(cfg.arrowHotbarSlot, arrowId);
                    }
                    // แก้นับเบิ้ล (ถ้า Server ซิงก์มาแล้วให้ใช้ค่านั้น หรือตั้งเป็น arrowQty ไม่บวกซ้ำ)
                    if (!window.__currentAmmo || window.__currentAmmo < arrowQty) {
                        window.__currentAmmo = arrowQty;
                    }
                    localStorage.setItem('pelican_current_ammo', window.__currentAmmo);
                    updateAmmoHUD();
                }
                if (cfg.useBwing) {
                    window.sendItembarSet(8, cfg.bwingItemId || 0x000160c7); // ใส่ Bwing ที่ช่อง 8
                }
            }, 900);

            // 5. สั่งสวมใส่ลูกธนู (เฉพาะกรณีที่ผู้ใช้เปิด autoEquipArrow เท่านั้น เพื่อไม่ให้ไปสลับใส่ดาบ)
            setTimeout(() => {
                if (cfg.requireArrow && cfg.autoEquipArrow && typeof cfg.arrowHotbarSlot === 'number' && cfg.arrowHotbarSlot >= 0) {
                    window.sendEquip(cfg.arrowHotbarSlot);
                    window.pressKey((cfg.arrowHotbarSlot + 1).toString());
                    console.log(`%c[Pelican Shop] 🏹 สวมใส่ลูกธนู (Equip Arrows Slot ${cfg.arrowHotbarSlot}) เรียบร้อยแล้ว!`, 'color: #22c55e; font-weight: bold;');
                }
            }, 1400);

            setTimeout(() => {
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

            const arrivalCheck = setInterval(() => {
                // GUARD 5: ระหว่างเดินหา NPC ถ้าตัวละครตาย ให้ตัดจบ
                if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                    clearInterval(arrivalCheck);
                    console.error('%c[Pelican Shop Guard] 🛑 ตัวละครเสียชีวิตระหว่างเดินในเมือง! ยกเลิกทันที', 'color: #ef4444; font-weight: bold;');
                    window.__isShopping = false;
                    return;
                }

                moveAttempts++;
                const curPos = window.__currentPos;
                const isStationary = (curPos.x === lastPlayerPos.x && curPos.y === lastPlayerPos.y && curPos.x !== 0);
                lastPlayerPos = { x: curPos.x, y: curPos.y };

                if (isStationary && moveAttempts >= 3) {
                    clearInterval(arrivalCheck);

                    // GUARD 6: ตรวจสอบเมืองอีกครั้งก่อนส่ง packet เปิดร้านค้า
                    if (typeof isCharacterInCity === 'function' && !isCharacterInCity()) {
                        console.error('[Pelican Shop Guard] 🛑 หลุดออกจากเมืองหลวง ยกเลิกการเปิดร้าน');
                        window.__isShopping = false;
                        return;
                    }

                    console.log('%c[Pelican Shop] 🎯 ตัวละครหยุดเดิน (ถึงระยะ NPC) -> กำลังเปิดร้านค้า...', 'color: #22c55e; font-weight: bold;');
                    window.sendRemoteNpcTalk(targetNpc);

                    setTimeout(() => {
                        window.sendRemoteNpcOption(0);

                        setTimeout(() => {
                            executeSellAndBuyActions(() => {
                                window.sendNpcClose();
                                console.log(`%c[Pelican Shop] 🚀 ภารกิจซื้อขายเสร็จสิ้น! สั่งเดินกลับไปฟาร์ม: ${currentFarmMap}`, 'color: #a855f7; font-weight: bold;');
                                setTimeout(() => {
                                    window.__isShopping = false;
                                    window.walkToTargetMap(currentFarmMap);
                                }, 1000);
                            });
                        }, 1200);

                    }, 700);
                }

                if (moveAttempts >= 45) {
                    clearInterval(arrivalCheck);
                    console.error('[Pelican Shop] ❌ หมดเวลาเดินหา NPC (Timeout)');
                    window.__isShopping = false;
                }
            }, 1000);
        }

        // GUARD 7: วาร์ปกลับเมืองหลวง (Bwing Guard)
        const inCity = typeof isCharacterInCity === 'function' ? isCharacterInCity() : false;
        if (!inCity) {
            if (!window.__archerConfig || !window.__archerConfig.useBwing) {
                console.warn(`%c[Pelican Shop Guard] 🛑 ตัวละครอยู่ที่ "${getCurrentMapName()}" (ไม่ใช่เมืองหลวง) และไม่ได้เปิดใช้งาน Butterfly Wing -> ยกเลิก Routine ร้านค้า!`, 'color: #ef4444; font-weight: bold;');
                window.__isShopping = false;
                return;
            }

            console.log(`%c[Pelican Shop] ⚡ ตัวละครอยู่ที่ "${getCurrentMapName()}" (ไม่ใช่เมืองหลวง) -> กำลังใช้วาร์ป Butterfly Wing...`, 'color: #38bdf8; font-weight: bold;');
            window.useButterflyWing();

            let warpAttempts = 0;
            const warpChecker = setInterval(() => {
                warpAttempts++;

                // เช็คว่าตัวละครตายหรือไม่ขณะรอวาร์ป
                if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                    clearInterval(warpChecker);
                    console.warn('%c[Pelican Shop Guard] 🛑 ตัวละครเสียชีวิตขณะพยายามวาร์ป! ยกเลิก Routine ร้านค้า', 'color: #ef4444; font-weight: bold;');
                    window.__isShopping = false;
                    return;
                }

                // เช็คว่าถึงเมืองหลวงสำเร็จหรือยัง
                if (typeof isCharacterInCity === 'function' && isCharacterInCity()) {
                    clearInterval(warpChecker);
                    console.log(`%c[Pelican Shop] 🏛️ วาร์ปถึงเมืองหลวง (${getCurrentMapName()}) สำเร็จ 100%! เตรียมเดินหา NPC...`, 'color: #22c55e; font-weight: bold;');
                    setTimeout(startCityWalk, 1200);
                    return;
                }

                // ถ้ายังไม่ถึงเมือง ลองใช้วาร์ปซ้ำ (สูงสุด 3 ครั้ง)
                if (warpAttempts <= 3) {
                    console.log(`%c[Pelican Shop] 🔄 ยังไม่ถึงเมืองหลวง (อยู่ที่ "${getCurrentMapName()}") กำลังใช้วาร์ปซ้ำ (${warpAttempts}/3)...`, 'color: #f59e0b;');
                    window.useButterflyWing();
                } else {
                    clearInterval(warpChecker);
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

        let attempts = 0;
        const poll = setInterval(() => {
            attempts++;
            if (isWorldMapOpen()) {
                clearInterval(poll);
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
                clearInterval(poll);
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

        const curMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
        if (curMap && curMap.includes(mapName)) {
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

        function clickMapPin(retries = 2) {
            const currentInspect = document.querySelector('.worldmap-inspect h3');
            if (currentInspect && currentInspect.textContent.includes(mapName)) {
                if (clickWalkButton()) return;
            }

            const stage = document.querySelector('.worldmap-stage') || document.querySelector('.worldmap-body') || document.querySelector('.worldmap-window') || document.body;
            const matches = Array.from(stage.querySelectorAll('*')).filter(el => {
                if (el.closest('#pelican-hud')) return false;
                if (!el.textContent || !el.textContent.includes(mapName)) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });

            const pin = matches.find(el => !Array.from(el.children).some(c => c.textContent && c.textContent.includes(mapName))) || matches[0];

            if (pin) {
                triggerClick(pin);
                pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                const mapId = MAP_NAME_TO_ID[mapName];

                let walkTries = 0;
                const walkInterval = setInterval(() => {
                    walkTries++;
                    if (clickWalkButton() || walkTries >= 8) {
                        clearInterval(walkInterval);
                    }
                }, 300);
                if (mapId && typeof window.sendNpcWarp === 'function') {
                    setTimeout(() => window.sendNpcWarp(mapId), 500);
                }
            } else if (retries > 0) {
                setTimeout(() => clickMapPin(retries - 1), 400);
            } else {
                console.warn(`[Pelican] ไม่พบหมุดแมพ "${mapName}" บนหน้าต่างแผนที่`);
                const mapId = MAP_NAME_TO_ID[mapName];
                if (mapId && typeof window.sendNpcWarp === 'function') {
                    console.log(`[Pelican Warp] ⚡ ส่ง Packet วาร์ปตรงไปยัง "${mapName}" (${mapId})...`);
                    window.sendNpcWarp(mapId);
                    startArrivalWatcher(mapName);
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
            console.log(`%c[Pelican Warp] 🏛️ ตัวละครอยู่ในเมืองหลวง -> คุยกับ NPC Alice (n6) เพื่อเปิดวาร์ปไป "${mapName}"...`, 'color: #eab308; font-weight: bold;');
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
            if (typeof isCharacterDead === 'function' && isCharacterDead()) {
                stopArrivalWatcher();
                window.__isNavigating = false;
                return;
            }

            const currentMap = typeof getCurrentMapName === 'function' ? getCurrentMapName() : '';
            if (currentMap && currentMap.includes(targetMap)) {
                stopArrivalWatcher();
                console.log(`%c[Pelican] 🎯 เดินทางถึงแมพ "${targetMap}" สำเร็จ! เปิด Auto-Bot...`, 'color: #22c55e; font-weight: bold;');
                setTimeout(() => {
                    window.startBot();
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
    setInterval(() => {
        if (!window.__isBotRunning || !window.__autoLoopEnabled || window.__isRecovering || window.__isShopping) return;

        // ตรวจจับลูกธนูหมด สำหรับอาชีพ Archer / Hunter (วาร์ปซื้อเมื่อเหลือ <= 50 ดอก)
        if (window.__archerConfig && window.__archerConfig.requireArrow) {
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
                window.executeAutoShopRoutine();
                return;
            }

            if (typeof window.__currentAmmo === 'number' && window.__currentAmmo <= threshold) {
                console.log(`%c[Pelican Archer] 🏹 ลูกธนูหมดหรือเหลือน้อย (${window.__currentAmmo} <= ${threshold} ดอก) -> สั่งวาร์ปกลับไปซื้อทันที!`, 'color: #ef4444; font-weight: bold;');
                window.executeAutoShopRoutine();
                return;
            }
        }

        const isDead = typeof isCharacterDead === 'function' ? isCharacterDead() : false;

        if (isDead) {
            console.log('%c[Pelican] ⚠️ ตัวละครตาย! เริ่มชุบชีวิตและเดินกลับแมพฟาร์ม...', 'color: #ef4444; font-weight: bold;');
            window.__isRecovering = true;

            // 1. ส่ง Packet ชุบชีวิต
            window.sendRespawn();

            // 2. คลิกปุ่มฟื้นคืนชีพบน Modal (เช่น "ฟื้นที่จุดเกิด")
            try {
                const respawnBtns = Array.from(document.querySelectorAll('button, div[role="button"], a.btn')).filter(el => {
                    if (el.closest('#pelican-hud') || el.closest('[class*="chat"]') || el.closest('.chat-log') || el.closest('.worldmap-window')) return false;
                    const txt = (el.innerText || '').trim();
                    return (txt === 'ฟื้นที่จุดเกิด' || txt === 'ฟื้นคืนชีพ' || txt === 'ฟื้นอัตโนมัติ') && el.offsetWidth > 0 && el.offsetHeight > 0;
                });
                if (respawnBtns[0]) triggerClick(respawnBtns[0]);
            } catch(e) {}

            setTimeout(() => { window.__isRecovering = false; }, 30000);

            setTimeout(() => {
                window.walkToTargetMap(window.__targetFarmMap);
            }, 4000);
        }
    }, 2000);

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
                    <span>PELICAN v4.2</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="p-quick-ammo" style="font-size: 10px; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); color: #22c55e; padding: 1px 7px; border-radius: 10px; font-weight: bold;">🏹 ${window.__currentAmmo}</span>
                    <span id="pelican-toggle" style="cursor: pointer; font-size: 15px; padding: 0 4px; color: #94a3b8; font-weight: bold;">−</span>
                </div>
            </div>

            <div class="p-body" id="pelican-content">
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
                        <span>ซื้อจำนวน (Qty):</span>
                        <input type="number" id="p-archer-qty" value="${window.__archerConfig.arrowBuyQty || 200}" style="width: 65px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
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

                        <label class="p-check-box" style="color: #94a3b8; margin-top: 5px;">
                            <input type="checkbox" id="p-archer-auto-equip" ${window.__archerConfig.autoEquipArrow ? 'checked' : ''}>
                            <span style="font-size: 9.5px;">เปิดสลับลูกธนูอัตโนมัติ (ปกติปิดไว้เพื่อกันสลับใส่ดาบ)</span>
                        </label>
                    </div>
                </div>

                <!-- TAB 3: AUTO-SELL & WHITELIST -->
                <div class="p-tab-pane" id="p-tab-sell">
                    <label class="p-check-box" style="color: #facc15;">
                        <input type="checkbox" id="p-sell-enabled" ${window.__sellConfig.enabled ? 'checked' : ''}>
                        <b>เปิดระบบ Auto-Sell คัดกรองอัตโนมัติ</b>
                    </label>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: rgba(15, 23, 42, 0.6); padding: 5px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                        <label class="p-check-box" style="color: #94a3b8;">
                            <input type="checkbox" id="p-sell-mat" ${window.__sellConfig.sellMaterials ? 'checked' : ''}>
                            <span>🌿 วัตถุดิบ</span>
                        </label>
                        <label class="p-check-box" style="color: #94a3b8;">
                            <input type="checkbox" id="p-sell-weap" ${window.__sellConfig.sellWeapons ? 'checked' : ''}>
                            <span>⚔️ อาวุธ</span>
                        </label>
                        <label class="p-check-box" style="color: #94a3b8;">
                            <input type="checkbox" id="p-sell-armor" ${window.__sellConfig.sellArmors ? 'checked' : ''}>
                            <span>🛡️ เกราะ</span>
                        </label>
                        <label class="p-check-box" style="color: #ef4444;" title="ห้ามขายของที่ผ่านการตีบวก (+1 ขึ้นไป)">
                            <input type="checkbox" id="p-sell-keep-refined" ${window.__sellConfig.keepRefined ? 'checked' : ''}>
                            <span>🔨 ล็อกของตีบวก</span>
                        </label>
                    </div>

                    <div class="p-row">
                        <span style="font-size: 10px; color: #94a3b8;">ขายเฉพาะระดับไม่เกิน:</span>
                        <select id="p-sell-max-rarity" class="p-select" style="width: 140px; padding: 2px 4px; font-size: 10.5px;">
                            <option value="normal" ${window.__sellConfig.maxRarityToSell === 'normal' ? 'selected' : ''}>⚪ ธรรมดา (ขาวเท่านั้น)</option>
                            <option value="good" ${window.__sellConfig.maxRarityToSell === 'good' ? 'selected' : ''}>🟢 ดี (เขียวลงไป)</option>
                            <option value="rare" ${window.__sellConfig.maxRarityToSell === 'rare' ? 'selected' : ''}>🔵 หายาก (ฟ้าลงไป)</option>
                            <option value="epic" ${window.__sellConfig.maxRarityToSell === 'epic' ? 'selected' : ''}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <label class="p-check-box" style="color: #c084fc;" title="ห้ามขายของที่มี Option สุ่ม">
                            <input type="checkbox" id="p-sell-keep-special" ${window.__sellConfig.keepSpecial ? 'checked' : ''}>
                            <span>🔒 ล็อกของมี Option</span>
                        </label>
                        <label class="p-check-box" style="color: #38bdf8;" title="ห้ามขายของที่มีรูใส่การ์ด [1-4]">
                            <input type="checkbox" id="p-sell-keep-sockets" ${window.__sellConfig.keepSockets ? 'checked' : ''}>
                            <span>🕳️ ล็อกของมีรู [1-4]</span>
                        </label>
                    </div>

                    <div>
                        <span style="font-size: 10px; color: #94a3b8; display: block; margin-bottom: 2px;">🛡️ Whitelist ห้ามขาย (ชื่อไอเทมคั่นด้วย ,):</span>
                        <textarea id="p-sell-whitelist" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(234, 179, 8, 0.4); color: #fff; border-radius: 4px; font-size: 10px; height: 38px; resize: vertical; padding: 3px;">${window.__sellConfig.whitelist || ''}</textarea>
                    </div>

                    <button class="p-btn" id="p-btn-test-sell-only" style="background: #ca8a04; color: #fff; font-weight: bold;">🧺 ทดสอบขายของในร้านค้า (Sell Test)</button>
                </div>

                <!-- TAB 4: SYSTEM & TOOLS -->
                <div class="p-tab-pane" id="p-tab-system">
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

        // Auto-Sell & Whitelist Event Listeners
        document.getElementById('p-sell-enabled').onchange = (e) => {
            window.__sellConfig.enabled = e.target.checked;
            saveSellConfig();
        };

        document.getElementById('p-sell-mat').onchange = (e) => {
            window.__sellConfig.sellMaterials = e.target.checked;
            saveSellConfig();
        };

        document.getElementById('p-sell-weap').onchange = (e) => {
            window.__sellConfig.sellWeapons = e.target.checked;
            saveSellConfig();
        };

        document.getElementById('p-sell-armor').onchange = (e) => {
            window.__sellConfig.sellArmors = e.target.checked;
            saveSellConfig();
        };

        const sellRefinedEl = document.getElementById('p-sell-keep-refined');
        if (sellRefinedEl) {
            sellRefinedEl.onchange = (e) => {
                window.__sellConfig.keepRefined = e.target.checked;
                saveSellConfig();
            };
        }

        const sellMaxRarityEl = document.getElementById('p-sell-max-rarity');
        if (sellMaxRarityEl) {
            sellMaxRarityEl.onchange = (e) => {
                window.__sellConfig.maxRarityToSell = e.target.value;
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
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();
