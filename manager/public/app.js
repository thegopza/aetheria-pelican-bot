
// ==========================================
// WEB CONFIG MODAL (EXPORT & IMPORT FOR WEB HUD)
// ==========================================
function openWebConfigModal(profileId, mode, preloadedJson = '') {
  let modal = document.getElementById('pelican-config-modal-web');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pelican-config-modal-web';
    modal.style.cssText = 'display: none; position: fixed; inset: 0; z-index: 999999; align-items: center; justify-content: center; font-family: "Segoe UI", Tahoma, sans-serif;';
    modal.innerHTML = `
      <div id="p-web-cfg-backdrop" style="position: absolute; inset: 0; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);"></div>
      <div style="position: relative; width: 620px; max-width: 95vw; background: #0b1329; border: 1.5px solid #a855f7; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(168,85,247,0.3); color: #f8fafc; overflow: hidden; display: flex; flex-direction: column;">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #1e1b4b; border-bottom: 1px solid rgba(168,85,247,0.3);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">💾</span>
            <span id="p-web-cfg-title" style="font-weight: bold; font-size: 14px; color: #c084fc;">สำรอง & ถ่ายโอนการตั้งค่า (Settings & Config)</span>
          </div>
          <button id="p-web-cfg-close" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 0 4px; font-weight: bold;">✕</button>
        </div>

        <div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 8px 12px; font-size: 11.5px; color: #e9d5ff; line-height: 1.4;">
            🔒 <b>ระบบความปลอดภัย (Security Guaranteed):</b><br/>
            ไฟล์คอนฟิกนี้จะรวบรวมการตั้งค่าทั้งหมด (แมพฟาร์ม, ลูกธนู, กรองขายของ NPC, กฎตลาดกลาง, ร้านค้า) โดย <b>ยกเว้นชื่อผู้ใช้ (ID) และ รหัสผ่าน (Password) ออก 100%</b> ทำให้แชร์หรือย้ายไปใช้กับจออื่นได้ทันทีอย่างปลอดภัย ไม่ทับซ้อนไอดีกัน
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11.5px; color: #cbd5e1; font-weight: 600;">ข้อมูลการตั้งค่า (Config JSON Data):</span>
              <span id="p-web-cfg-status" style="font-size: 10.5px; color: #10b981; font-weight: 600;"></span>
            </div>
            <textarea id="p-web-cfg-json" placeholder="วางโค้ด JSON การตั้งค่าที่นี่..." style="width: 100%; height: 250px; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #38bdf8; font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 11px; padding: 10px; resize: vertical; line-height: 1.4; outline: none;"></textarea>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; gap: 6px;">
              <button id="p-web-cfg-copy" style="background: #7c3aed; color: #fff; border: 1px solid #a855f7; padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                📋 คัดลอก JSON
              </button>
              <button id="p-web-cfg-download" style="background: #1e293b; color: #38bdf8; border: 1px solid rgba(56,189,248,0.4); padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                💾 ดาวน์โหลด .json
              </button>
            </div>
            <div style="display: flex; gap: 6px;">
              <label style="background: #334155; color: #e2e8f0; border: 1px solid #475569; padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                📂 เลือกไฟล์ .json
                <input type="file" id="p-web-cfg-file" accept=".json,application/json" style="display: none;">
              </label>
              <button id="p-web-cfg-apply" style="background: #0284c7; color: #fff; border: 1px solid #38bdf8; padding: 6px 14px; border-radius: 6px; font-size: 11.5px; font-weight: bold; cursor: pointer;">
                📥 นำเข้าการตั้งค่า (Apply)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => { modal.style.display = 'none'; };
    modal.querySelector('#p-web-cfg-close').onclick = close;
    modal.querySelector('#p-web-cfg-backdrop').onclick = close;

    modal.querySelector('#p-web-cfg-copy').onclick = () => {
      const txt = modal.querySelector('#p-web-cfg-json').value;
      if (!txt) return;
      navigator.clipboard.writeText(txt);
      modal.querySelector('#p-web-cfg-status').innerText = '✅ คัดลอกลง Clipboard เรียบร้อย';
    };

    modal.querySelector('#p-web-cfg-download').onclick = () => {
      const txt = modal.querySelector('#p-web-cfg-json').value;
      if (!txt) return;
      const element = document.createElement('a');
      element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(txt));
      element.setAttribute('download', 'aetheria_bot_config.json');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      modal.querySelector('#p-web-cfg-status').innerText = '💾 ดาวน์โหลดไฟล์เรียบร้อย';
    };

    modal.querySelector('#p-web-cfg-file').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        modal.querySelector('#p-web-cfg-json').value = event.target.result;
        modal.querySelector('#p-web-cfg-status').innerText = `📄 โหลดไฟล์ "${file.name}" แล้ว`;
      };
      reader.readAsText(file);
    };
  }

  const targetProfId = profileId;
  const area = modal.querySelector('#p-web-cfg-json');
  const title = modal.querySelector('#p-web-cfg-title');
  const status = modal.querySelector('#p-web-cfg-status');

  if (mode === 'export') {
    title.innerText = '📤 ส่งออกการตั้งค่า (Export Config JSON)';
    area.value = preloadedJson;
    status.innerText = '✅ คัดลอก JSON ลง Clipboard แล้ว';
    if (preloadedJson) navigator.clipboard.writeText(preloadedJson);
  } else {
    title.innerText = '📥 นำเข้าการตั้งค่า (Import Config JSON)';
    area.value = '';
    status.innerText = 'วางโค้ด JSON การตั้งค่าที่นี่';
  }

  modal.querySelector('#p-web-cfg-apply').onclick = async () => {
    const txt = area.value;
    if (!txt || !txt.trim()) {
      alert('กรุณาวางโค้ด JSON การตั้งค่าก่อนกดนำเข้า');
      return;
    }
    const res = await sendWebHudAction(targetProfId, { type: 'import-config', configJson: txt });
    if (res.success && res.result?.success !== false) {
      status.innerText = '✅ นำเข้าการตั้งค่าสำเร็จครบทุกระบบ!';
      alert('✅ นำเข้าการตั้งค่าสำเร็จ! (คง ID และ Password เดิมของจอนี้ไว้)');
      modal.style.display = 'none';
    } else {
      status.innerText = '❌ ผิดพลาด: ' + (res.error || res.result?.error || 'นำเข้าไม่สำเร็จ');
      alert('❌ ไม่สามารถนำเข้าการตั้งค่าได้: ' + (res.error || res.result?.error));
    }
  };

  modal.style.display = 'flex';
}

﻿const API_BASE = "";
let currentProfiles = [];
let allWindowsHidden = false;

// DOM Elements
const gridEl = document.getElementById("profiles-grid");
const totalEl = document.getElementById("metric-total-profiles");
const onlineEl = document.getElementById("metric-online-profiles");
const farmingEl = document.getElementById("metric-farming-profiles");

// Profile Modal Elements
const modalEl = document.getElementById("profile-modal");
const modalTitle = document.getElementById("modal-title");
const profileForm = document.getElementById("profile-form");
const formId = document.getElementById("form-profile-id");
const formName = document.getElementById("form-name");
const formAccount = document.getElementById("form-account");
const formClass = document.getElementById("form-class");
const formMap = document.getElementById("form-map");
const formPort = document.getElementById("form-port");
const formNotes = document.getElementById("form-notes");

// Script Plan Modal Elements
const planModalEl = document.getElementById("plan-modal");
const planForm = document.getElementById("plan-form");
const planProfileId = document.getElementById("plan-profile-id");
const planNameInput = document.getElementById("plan-name");
const planModeSelect = document.getElementById("plan-mode");
const planMapSelect = document.getElementById("plan-map");
const planAmmoMin = document.getElementById("plan-ammo-min");
const planWeightMax = document.getElementById("plan-weight-max");
const planRequireArrow = document.getElementById("plan-require-arrow");
const planArrowType = document.getElementById("plan-arrow-type");
const planAutoSell = document.getElementById("plan-auto-sell");
const planSellWeapons = document.getElementById("plan-sell-weapons");
const planSellArmors = document.getElementById("plan-sell-armors");
const planNotes = document.getElementById("plan-notes");

// Active Floating Web HUDs tracking: profileId -> { el, activeTab, activeSubTab, interval }
const activeWebHuds = {};
let topHudZIndex = 10000;

// ==========================================
// INITIALIZATION & POLLING
// ==========================================
async function fetchProfiles() {
  try {
    const res = await fetch(`${API_BASE}/api/profiles`);
    const data = await res.json();
    if (data.success) {
      currentProfiles = data.profiles;
      allWindowsHidden = !!data.allWindowsHidden;
      
      const lblHideAll = document.getElementById("lbl-toggle-all-windows");
      if (lblHideAll) {
        lblHideAll.innerText = allWindowsHidden ? "แสดงทุกจอ" : "ซ่อนทุกจอ (Headless)";
      }

      renderProfiles();
      updateMetrics();
      updateActiveWebHuds();
    }
  } catch (err) {
    console.error("Failed to fetch profiles:", err);
  }
}

function updateMetrics() {
  if (totalEl) totalEl.innerText = currentProfiles.length;
  const onlineCount = currentProfiles.filter(p => p.isRunning).length;
  if (onlineEl) onlineEl.innerText = onlineCount;
  const farmingCount = currentProfiles.filter(p => p.liveState && (p.liveState.autoLoop || p.liveState.isBotRunning)).length;
  if (farmingEl) farmingEl.innerText = farmingCount;
}

// ==========================================
// RENDER CLIENT PROFILES (CARDS)
// ==========================================
function renderProfiles() {
  if (currentProfiles.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px; background: rgba(15,23,42,0.5); border-radius: 16px; border: 1px dashed rgba(56,189,248,0.2);">
        <p style="color: #94a3b8; font-size: 14px; margin-bottom: 12px;">ยังไม่มีโปรไฟล์จอเกมในระบบ</p>
        <button class="btn btn-primary" onclick="openAddModal()">➕ เพิ่มโปรไฟล์แรกเลย</button>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = currentProfiles.map(p => {
    const isOnline = p.isRunning;
    const isWindowHidden = Boolean(p.windowState?.isHidden);
    const state = p.liveState;
    const isBotRunning = Boolean(state && (state.autoLoop || state.isBotRunning));

    const charName = state?.charName || null;
    const curClass = state?.charClass || p.charClass || 'Archer';
    const curLevels = state?.levels || '';
    const curMap = state && state.map ? state.map : p.targetMap;
    const curAmmo = state && typeof state.ammo === 'number' ? `${state.ammo.toLocaleString()} ดอก` : '--';
    const curPos = state && state.coords ? state.coords : (state && state.pos && state.pos.x ? `${state.pos.tileX || 0}, ${state.pos.tileY || 0} (${state.pos.x}, ${state.pos.y})` : '--');
    const curWeight = state?.weight ? `${state.weight}` : '--';
    
    // HP & SP
    const hpCur = state?.hp;
    const hpMax = state?.hpMax || hpCur || 1;
    const hpPct = (typeof hpCur === 'number' && hpMax > 0) ? Math.min(100, Math.round((hpCur / hpMax) * 100)) : 100;
    const hpStr = state?.hpText || (typeof hpCur === 'number' ? `${hpCur.toLocaleString()} / ${hpMax.toLocaleString()}` : '--');

    const spCur = state?.sp;
    const spMax = state?.spMax || spCur || 1;
    const spPct = (typeof spCur === 'number' && spMax > 0) ? Math.min(100, Math.round((spCur / spMax) * 100)) : 100;
    const spStr = state?.spText || (typeof spCur === 'number' ? `${spCur.toLocaleString()} / ${spMax.toLocaleString()}` : '--');

    // Bot Activity Status
    let activityText = "ออฟไลน์";
    let activityColor = "#64748b";
    if (isOnline) {
      if (state) {
        if (state.botStatus) {
          activityText = state.botStatus;
          if (activityText.includes('ตาย') || activityText.includes('ชุบ')) activityColor = '#ef4444';
          else if (activityText.includes('ซื้อ') || activityText.includes('ขาย')) activityColor = '#f59e0b';
          else if (activityText.includes('เดิน')) activityColor = '#38bdf8';
          else if (activityText.includes('ฟาร์ม') || activityText.includes('Farm')) activityColor = '#10b981';
          else activityColor = '#34d399';
        } else if (state.autoLoop || state.isBotRunning) {
          activityText = "⚔️ Auto-Farm ทำงาน";
          activityColor = "#10b981";
        } else {
          activityText = "⏸️ ยืนรอ / แสตนด์บาย";
          activityColor = "#f59e0b";
        }
      } else {
        activityText = "⏳ กำลังเชื่อมต่อ...";
        activityColor = "#f59e0b";
      }
    }

    return `
      <div class="profile-card ${isOnline ? 'is-online' : ''} ${p.isMain ? 'is-main' : ''}" id="card-${p.id}">
        <div class="card-header">
          <div class="profile-identity">
            <span class="status-dot ${isOnline ? 'online' : ''}"></span>
            <div>
              <div class="profile-title" style="display: flex; align-items: center; gap: 6px;">
                <span>${escapeHTML(p.name)}</span>
                ${p.isMain ? `<span class="badge" style="background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.4); font-size: 9.5px; padding: 1px 6px; border-radius: 4px; font-weight: bold;">⭐ MAIN</span>` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
                <div class="profile-acc">${escapeHTML(p.account || 'บัญชีเริ่มต้น')}</div>
                ${charName ? `<span class="char-live-name">👤 ${escapeHTML(charName)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="card-badges" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="class-badge">${escapeHTML(curClass)}${curLevels ? ` (${escapeHTML(curLevels.split('\n')[0].replace('Base ', ''))})` : ''}</span>
              <span class="port-badge">PORT: ${p.debugPort || 49876}</span>
            </div>
            ${isOnline ? `
              <span class="badge" style="background: ${isWindowHidden ? 'rgba(245, 158, 11, 0.18)' : 'rgba(34, 197, 94, 0.18)'}; color: ${isWindowHidden ? '#fbbf24' : '#4ade80'}; border: 1px solid ${isWindowHidden ? 'rgba(245, 158, 11, 0.4)' : 'rgba(34, 197, 94, 0.4)'}; font-size: 9px; padding: 1px 6px; border-radius: 4px; font-weight: bold;">
                ${isWindowHidden ? '👁️ ซ่อนอยู่' : '🖥️ ไม่ได้ซ่อน'}
              </span>
            ` : ''}
          </div>
        </div>

        ${isOnline && (typeof hpCur === 'number' || typeof spCur === 'number') ? `
          <div class="char-gauges">
            <div class="gauge-row">
              <span class="gauge-lbl hp">HP</span>
              <div class="gauge-track">
                <div class="gauge-fill hp" style="width: ${hpPct}%;"></div>
              </div>
              <span class="gauge-val" style="color: #fca5a5;">${hpStr}</span>
            </div>
            <div class="gauge-row">
              <span class="gauge-lbl sp">SP</span>
              <div class="gauge-track">
                <div class="gauge-fill sp" style="width: ${spPct}%;"></div>
              </div>
              <span class="gauge-val" style="color: #93c5fd;">${spStr}</span>
            </div>
          </div>
        ` : ''}

        <div class="card-body">
          <div class="stat-item">
            <span class="stat-lbl">แมพปัจจุบัน:</span>
            <span class="stat-val" style="color: #38bdf8; font-weight: 700;">${escapeHTML(curMap)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-lbl">พิกัด (Coords):</span>
            <span class="stat-val">${escapeHTML(curPos)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-lbl">จำนวนลูกธนู:</span>
            <span class="stat-val" style="color: #00ffcc; font-weight: 700;">${curAmmo}</span>
          </div>
          <div class="stat-item">
            <span class="stat-lbl">น้ำหนักคงเหลือ:</span>
            <span class="stat-val" style="color: #cbd5e1;">${escapeHTML(curWeight)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-lbl">สถานะบอท:</span>
            <span class="stat-val" style="color: ${activityColor}; font-weight: 700;">${activityText}</span>
          </div>
        </div>

        ${p.notes ? `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 6px;">📝 ${escapeHTML(p.notes)}</div>` : ''}

        <div class="card-footer-controls">
          ${isOnline ? `
            <!-- ROW 1: PRIMARY ACTION BUTTONS (Start/Stop Bot & Bot Menu) -->
            <div class="card-action-row main-actions">
              ${isBotRunning ? `
                <button class="btn btn-warning btn-sm btn-bot-toggle" onclick="toggleBotExecution('${p.id}', false, this)" title="หยุดการทำงานของบอท (เกมยังเปิดอยู่)">
                  <span>⏸️</span> หยุดบอท
                </button>
              ` : `
                <button class="btn btn-success btn-sm btn-bot-toggle" onclick="toggleBotExecution('${p.id}', true, this)" title="เริ่มการทำงานของบอททันที">
                  <span>▶️</span> เริ่มบอท
                </button>
              `}
              <button class="btn btn-menu btn-sm btn-bot-menu" onclick="openWebBotHUD('${p.id}')" title="เปิดหน้าต่างเมนูบอท (หน้าตาเหมือนในเกม) สำหรับ Session นี้">
                <span>🎮</span> เมนูบอท
              </button>
            </div>

            <!-- ROW 2: WINDOW & UTILITY BUTTONS -->
            <div class="card-action-row sub-actions">
              <button class="btn btn-dark btn-sm" onclick="toggleClientWindow('${p.id}')" title="${isWindowHidden ? 'แสดงหน้าต่างเกมบนจอ' : 'ซ่อนหน้าต่างเกม (ทำงานแบบ Headless)'}">
                <span>${isWindowHidden ? '👁️ เลิกซ่อน' : '👁️ ซ่อน'}</span>
              </button>
              <button class="btn btn-danger btn-sm" onclick="stopClient('${p.id}')" title="ปิดหน้าต่างและโปรเซสเกมนี้">
                <span>⏹️</span> ปิดจอ
              </button>
              <button class="btn btn-primary btn-sm btn-action-plan" onclick="openScriptPlanModal('${p.id}')" title="ตั้งค่าแผนการเล่น (Script Plan)">
                <span>📜</span> Plan
              </button>
              <button class="btn btn-warning btn-sm btn-icon" onclick="openCardWhitelistModal('${p.id}')" title="🛡️ จัดการ Whitelist (รายการห้ามขาย) ของจอนี้">
                <span>🛡️</span>
              </button>
              <button class="btn btn-purple btn-sm btn-icon" onclick="openSaveClientPresetModal('${p.id}')" title="💾 บันทึกการตั้งค่าจอนี้เข้า Save List ส่วนกลาง">
                <span>💾</span>
              </button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="openEditModal('${p.id}')" title="แก้ไขการตั้งค่าโปรไฟล์">
                <span>⚙️</span>
              </button>
              ${!p.isMain ? `
                <button class="btn btn-secondary btn-sm btn-icon" onclick="deleteProfile('${p.id}')" title="ลบโปรไฟล์">
                  <span>🗑️</span>
                </button>
              ` : ''}
            </div>
          ` : `
            <!-- OFFLINE ACTIONS -->
            <div class="card-action-row main-actions">
              <button class="btn btn-success btn-sm btn-launch" onclick="launchClient('${p.id}')" style="grid-column: 1 / -1;">
                <span>▶️</span> เปิดจอเกม
              </button>
            </div>
            <div class="card-action-row sub-actions" style="margin-top: 2px;">
              <button class="btn btn-primary btn-sm btn-action-plan" onclick="openScriptPlanModal('${p.id}')" title="ตั้งค่าแผนการเล่น (Script Plan)" style="flex: 1;">
                <span>📜</span> Plan
              </button>
              <button class="btn btn-warning btn-sm btn-icon" onclick="openCardWhitelistModal('${p.id}')" title="🛡️ จัดการ Whitelist (รายการห้ามขาย) ของจอนี้">
                <span>🛡️</span>
              </button>
              <button class="btn btn-purple btn-sm btn-icon" onclick="openSaveClientPresetModal('${p.id}')" title="💾 บันทึกการตั้งค่าจอนี้เข้า Save List ส่วนกลาง">
                <span>💾</span>
              </button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="openEditModal('${p.id}')" title="แก้ไขการตั้งค่าโปรไฟล์">
                <span>⚙️</span>
              </button>
              ${!p.isMain ? `
                <button class="btn btn-secondary btn-sm btn-icon" onclick="deleteProfile('${p.id}')" title="ลบโปรไฟล์">
                  <span>🗑️</span>
                </button>
              ` : ''}
            </div>
          `}
        </div>
      </div>
    `;
  }).join("");
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// ==========================================
// BOT & WINDOW ACTIONS (PER-CARD)
// ==========================================
async function toggleBotExecution(id, start, btnEl) {
  try {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = start ? `<span>⏳</span> กำลังเริ่ม...` : `<span>⏳</span> กำลังหยุด...`;
    }
    const action = start ? "start" : "stop";
    const res = await fetch(`${API_BASE}/api/profiles/${id}/toggle-bot?action=${action}`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      await fetchProfiles();
    } else {
      alert("❌ ไม่สามารถสั่งงานบอทได้: " + (data.error || "เกิดข้อผิดพลาด"));
      await fetchProfiles();
    }
  } catch (err) {
    console.error("toggleBotExecution error:", err);
    await fetchProfiles();
  }
}

async function toggleClientWindow(id) {
  try {
    const res = await fetch(`${API_BASE}/api/profiles/${id}/toggle-window`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      fetchProfiles();
    }
  } catch (err) {
    console.error("toggleClientWindow error:", err);
  }
}

async function launchClient(id) {
  try {
    const res = await fetch(`${API_BASE}/api/profiles/${id}/launch`, { method: "POST" });
    const data = await res.json();
    if (!data.success) {
      alert("❌ เปิดจอไม่สำเร็จ: " + (data.error || "เกิดข้อผิดพลาด"));
    }
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
  }
  fetchProfiles();
}

async function stopClient(id) {
  if (!confirm("ต้องการปิดจอเกมนี้ใช่หรือไม่?")) return;
  try {
    await fetch(`${API_BASE}/api/profiles/${id}/stop`, { method: "POST" });
  } catch (err) {}
  fetchProfiles();
}

// ==========================================
// TOP ACTION TOOLBAR LISTENERS
// ==========================================
const btnAutoTileShrink = document.getElementById("btn-auto-tile-shrink");
if (btnAutoTileShrink) {
  btnAutoTileShrink.onclick = async () => {
    try {
      btnAutoTileShrink.disabled = true;
      btnAutoTileShrink.innerText = "⏳ กำลังจัดเรียง...";
      await fetch(`${API_BASE}/api/tile-windows?layout=compact`, { method: "POST" });
      setTimeout(() => {
        btnAutoTileShrink.disabled = false;
        btnAutoTileShrink.innerHTML = `<span class="icon">📐</span> จัดเรียงจอย่อจออัตโนมัติ`;
      }, 1000);
    } catch(e) {
      btnAutoTileShrink.disabled = false;
    }
  };
}

const btnGlobalPlanSetup = document.getElementById("btn-global-plan-setup");
if (btnGlobalPlanSetup) {
  btnGlobalPlanSetup.onclick = () => {
    const online = currentProfiles.find(p => p.isRunning) || currentProfiles[0];
    if (online) {
      openScriptPlanModal(online.id);
    } else {
      alert("กรุณาเพิ่มหรือเปิดโปรไฟล์ก่อนตั้งค่า Plan");
    }
  };
}

const btnToggleAllWindows = document.getElementById("btn-toggle-all-windows");
if (btnToggleAllWindows) {
  btnToggleAllWindows.onclick = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/toggle-all-windows`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        allWindowsHidden = !!data.allWindowsHidden;
        const lbl = document.getElementById("lbl-toggle-all-windows");
        if (lbl) lbl.innerText = allWindowsHidden ? "แสดงทุกจอ" : "ซ่อนทุกจอ (Headless)";
        fetchProfiles();
      }
    } catch(e) {
      console.error(e);
    }
  };
}

document.getElementById("btn-launch-all").onclick = async () => {
  if (confirm("ยืนยันเปิดจอเกมทั้งหมดพร้อมกัน?")) {
    await fetch(`${API_BASE}/api/launch-all`, { method: "POST" });
    fetchProfiles();
  }
};

document.getElementById("btn-stop-all").onclick = async () => {
  if (confirm("ยืนยันสั่งปิดจอเกมทั้งหมดทันที?")) {
    await fetch(`${API_BASE}/api/stop-all`, { method: "POST" });
    fetchProfiles();
  }
};

document.getElementById("tile-side").onclick = async (e) => {
  e.preventDefault();
  await fetch(`${API_BASE}/api/tile-windows?layout=side`, { method: "POST" });
};

document.getElementById("tile-grid").onclick = async (e) => {
  e.preventDefault();
  await fetch(`${API_BASE}/api/tile-windows?layout=grid`, { method: "POST" });
};

document.getElementById("btn-refresh").onclick = () => {
  fetchProfiles();
};

document.getElementById("btn-add-profile").onclick = () => {
  openAddModal();
};

// ==========================================
// FLOATING IN-GAME BOT HUD (DIRECT GITHUB REPLICA)
// ==========================================
function getGitHubHudTemplate(profileId, clientData, profile) {
  const charDisplayName = clientData?.state?.charName || profile.name;
  const archer = clientData?.archerConfig || {};
  const sell = clientData?.sellConfig || {};
  const auth = clientData?.authConfig || {};
  const autosell = clientData?.autoMarketSellConfig || {};
  const marketFilter = clientData?.marketFilterConfig || {};
  const shop = clientData?.shopConfig || {};

  return `
<div class="p-header" id="pelican-drag-handle">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 13px;">🔄</span>
                    <span class="p-header-title">${escapeHTML(charDisplayName)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="p-quick-ammo" style="font-size: 10px; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); color: #22c55e; padding: 1px 7px; border-radius: 10px; font-weight: bold;">🏹 ${clientData?.currentAmmo ?? 0}</span>
                    <span id="p-quick-weight" style="font-size: 10px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 1px 7px; border-radius: 10px; font-weight: bold; cursor: pointer;" title="คลิกเพื่อจัดเรียงกระเป๋าและอัปเดตน้ำหนัก">⚖️ --%</span>
                    <span class="pelican-toggle" onclick="toggleWebHudCollapse('${profileId}')" style="cursor: pointer; font-size: 15px; padding: 0 4px; color: #94a3b8; font-weight: bold;">−</span>
<span class="pelican-close-btn" onclick="closeWebBotHUD('${profileId}')" style="cursor: pointer; font-size: 14px; padding: 0 4px; color: #94a3b8; font-weight: bold;" title="ปิดหน้าต่าง">✕</span>
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
                        <input type="checkbox" id="p-auto-loop" ${clientData?.autoLoopEnabled ? "checked" : ""}>
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
                            <input type="checkbox" id="p-auto-jump" ${clientData?.autoJumpEnabled ? "checked" : ""}>
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
                            <b id="p-ammo-count" style="color: #22c55e; font-size: 13px;">${clientData?.currentAmmo ?? 0} ดอก</b>
                            <div style="display: flex; gap: 3px;">
                                <button id="p-btn-sync-ammo" style="background: #0284c7; color: #fff; border: none; border-radius: 3px; font-size: 9px; cursor: pointer; padding: 2px 6px;">🔄 ซิงก์</button>
                                <button id="p-btn-zero-ammo" style="background: #e11d48; color: #fff; border: none; border-radius: 3px; font-size: 9px; cursor: pointer; padding: 2px 6px;">ตั้งเป็น 0</button>
                            </div>
                        </div>
                    </div>

                    <label class="p-check-box" style="color: #c084fc;">
                        <input type="checkbox" id="p-archer-req" ${archer.requireArrow ? "checked" : ""}>
                        <b>Require Arrow (เช็ค & ซื้ออัตโนมัติ)</b>
                    </label>

                    <div>
                        <span style="font-size: 10px; color: #94a3b8;">ชนิดลูกธนู:</span>
                        <select id="p-archer-type" class="p-select">
                            <option value="90030" ${parseInt(archer.arrowType || 90030) === 90030 ? "selected" : ""}>Arrow (ธรรมดา - 1z)</option>
                            <option value="90031" ${parseInt(archer.arrowType || 90030) === 90031 ? "selected" : ""}>Fire Arrow (ไฟ - 3z)</option>
                            <option value="90032" ${parseInt(archer.arrowType || 90030) === 90032 ? "selected" : ""}>Crystal Arrow (น้ำ - 3z)</option>
                            <option value="90033" ${parseInt(archer.arrowType || 90030) === 90033 ? "selected" : ""}>Stone Arrow (ดิน - 3z)</option>
                            <option value="90034" ${parseInt(archer.arrowType || 90030) === 90034 ? "selected" : ""}>Arrow of Wind (ลม - 3z)</option>
                            <option value="90035" ${parseInt(archer.arrowType || 90030) === 90035 ? "selected" : ""}>Poison Arrow (พิษ - 3z)</option>
                            <option value="90036" ${parseInt(archer.arrowType || 90030) === 90036 ? "selected" : ""}>Silver Arrow (ศักดิ์สิทธิ์ - 3z)</option>
                            <option value="90037" ${parseInt(archer.arrowType || 90030) === 90037 ? "selected" : ""}>Shadow Arrow (เงา - 3z)</option>
                        </select>
                    </div>

                    <div class="p-row">
                        <span>ตั้งเป้าพกลูกธนู (ซื้อเติมให้ครบ):</span>
                        <input type="number" id="p-archer-qty" value="${archer.arrowBuyQty || 5000}" style="width: 65px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                    </div>

                    <div class="p-row">
                        <span>วาร์ปซื้อเมื่อเหลือ <= (ดอก):</span>
                        <input type="number" id="p-archer-threshold" value="${archer.ammoThreshold || 50}" style="width: 55px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
                    </div>

                    <div class="p-card" style="border-color: rgba(56, 189, 248, 0.3);">
                        <label class="p-check-box" style="color: #38bdf8;">
                            <input type="checkbox" id="p-archer-bwing" ${archer.useBwing ? "checked" : ""}>
                            <b>ใช้วาร์ปกลับเมือง (Butterfly Wing)</b>
                        </label>
                        <div class="p-row" style="margin-top: 3px;">
                            <span>ซื้อ Bwing ติดตัว (ใบ):</span>
                            <input type="number" id="p-archer-bwing-qty" value="${archer.bwingBuyQty || 2}" style="width: 55px; background: #0f172a; border: 1px solid #38bdf8; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
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
                            <input type="checkbox" id="p-archer-auto-equip" ${archer.autoEquipArrow ? "checked" : ""}>
                            <span style="font-size: 9.5px;">สวมใส่คันธนู & ลูกธนูอัตโนมัติ (Auto-Equip Bow & Arrow)</span>
                        </label>
                    </div>
                </div>

                <!-- TAB 3: AUTO-SELL & WHITELIST -->
                <div class="p-tab-pane" id="p-tab-sell">
                    <!-- Weight Check Card -->
                    <div class="p-card" style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05); margin-bottom: 6px;">
                        <label class="p-check-box" style="color: #f59e0b;">
                            <input type="checkbox" id="p-weight-check-enabled" ${sell.weightCheckEnabled ? 'checked' : ''}>
                            <b>⚖️ ตรวจสอบน้ำหนักเกิน (Weight Return)</b>
                        </label>
                        <div class="p-row" style="margin-top: 4px;">
                            <span style="font-size: 10px; color: #cbd5e1;">วาร์ปกลับไปขายเมื่อเกิน (%):</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" id="p-weight-threshold" min="10" max="95" value="${sell.weightThreshold || 80}" style="width: 48px; background: #0f172a; border: 1px solid #f59e0b; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
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
                        <input type="checkbox" id="p-sell-enabled" ${sell.enabled ? "checked" : ""}>
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
                                <option value="none" ${(sell.weaponRarity || 'rare') === 'none' ? "selected" : ""}>❌ ไม่ขาย</option>
                                <option value="normal" ${(sell.weaponRarity || 'rare') === 'normal' ? "selected" : ""}>⚪ ขาวเท่านั้น (0 Opt)</option>
                                <option value="good" ${(sell.weaponRarity || 'rare') === 'good' ? "selected" : ""}>🟢 ดี (เขียวลงไป)</option>
                                <option value="rare" ${(sell.weaponRarity || 'rare') === 'rare' ? "selected" : ""}>🔵 หายาก (ฟ้าลงไป)</option>
                                <option value="epic" ${(sell.weaponRarity || 'rare') === 'epic' ? "selected" : ""}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                            </select>
                        </div>

                        <!-- 2. ชุดเกราะ -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">🛡️ ชุดเกราะ:</span>
                            <select id="p-sell-rarity-armor" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="none" ${(sell.armorRarity || 'good') === 'none' ? "selected" : ""}>❌ ไม่ขาย</option>
                                <option value="normal" ${(sell.armorRarity || 'good') === 'normal' ? "selected" : ""}>⚪ ขาวเท่านั้น (0 Opt)</option>
                                <option value="good" ${(sell.armorRarity || 'good') === 'good' ? "selected" : ""}>🟢 ดี (เขียวลงไป)</option>
                                <option value="rare" ${(sell.armorRarity || 'good') === 'rare' ? "selected" : ""}>🔵 หายาก (ฟ้าลงไป)</option>
                                <option value="epic" ${(sell.armorRarity || 'good') === 'epic' ? "selected" : ""}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                            </select>
                        </div>

                        <!-- 3. ประดับ/เจม -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">💍 ประดับ/เจม:</span>
                            <select id="p-sell-rarity-acc" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="none" ${sell.accRarity === 'none' ? 'selected' : ''}>❌ ไม่ขาย</option>
                                <option value="normal" ${sell.accRarity === 'normal' ? 'selected' : ''}>⚪ ขาวเท่านั้น (0 Opt)</option>
                                <option value="good" ${sell.accRarity === 'good' ? 'selected' : ''}>🟢 ดี (เขียวลงไป)</option>
                                <option value="rare" ${sell.accRarity === 'rare' ? 'selected' : ''}>🔵 หายาก (ฟ้าลงไป)</option>
                                <option value="epic" ${sell.accRarity === 'epic' ? 'selected' : ''}>🟣 มหากาพย์ (ม่วงลงไป)</option>
                            </select>
                        </div>

                        <!-- 4. วัตถุดิบ -->
                        <div class="p-row">
                            <span style="font-size: 10px; color: #e2e8f0; font-weight: 500;">🌿 วัตถุดิบ:</span>
                            <select id="p-sell-rarity-mat" class="p-select" style="width: 142px; padding: 2px 4px; font-size: 9.5px; background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);">
                                <option value="all" ${sell.sellMaterials ? 'selected' : ''}>🧺 ขายขยะทั้งหมด</option>
                                <option value="none" ${!sell.sellMaterials ? 'selected' : ''}>❌ ไม่ขาย</option>
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
                                <input type="checkbox" id="p-sell-keep-refined" ${sell.keepRefined !== false ? "checked" : ""}>
                                <span>🔨 ล็อกของตีบวก</span>
                            </label>
                            <label class="p-check-box" style="color: #c084fc;" title="ห้ามขายของที่มี Option สุ่ม">
                                <input type="checkbox" id="p-sell-keep-special" ${sell.keepSpecial ? "checked" : ""}>
                                <span>🔒 ล็อกของมี Option</span>
                            </label>
                        </div>
                        <label class="p-check-box" style="color: #38bdf8;" title="ห้ามขายของที่มีรูใส่การ์ด [1-4]">
                            <input type="checkbox" id="p-sell-keep-sockets" ${sell.keepSockets ? "checked" : ""}>
                            <span>🕳️ ล็อกของมีรูการ์ด [1-4]</span>
                        </label>
                    </div>

                    <!-- Whitelist Card -->
                    <div>
                        <span style="font-size: 10px; color: #94a3b8; display: block; margin-bottom: 2px;">🛡️ Whitelist ห้ามขาย (ชื่อไอเทมคั่นด้วย ,):</span>
                        <textarea id="p-sell-whitelist" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(234, 179, 8, 0.4); color: #fff; border-radius: 4px; font-size: 9.5px; height: 34px; resize: vertical; padding: 3px;">${escapeHTML(sell.whitelist || "")}</textarea>
                    </div>

                    <button class="p-btn" id="p-btn-test-sell-only" style="background: #ca8a04; color: #fff; font-weight: bold; margin-top: 2px;">🧺 ทดสอบขายของในร้านค้า (Sell Test)</button>
                </div>

                <!-- TAB 4: MARKET & STAT SNIPER -->
                <div class="p-tab-pane" id="p-tab-market">
                    <!-- Sub-Navigation: Auto Sell vs Sniper -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px; background: rgba(0,0,0,0.4); padding: 2px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                        <button id="p-subtab-btn-autosell" onclick="window.switchMarketSubTab('autosell')"
                            style="padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; border: none; background: #9333ea; color: #fff; transition: all 0.2s;">
                            🏷️ Auto Sell ตั้งขาย (<span id="p-subtab-autosell-count">${(autosell.rules || []).length}</span>)
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
                                    <input type="checkbox" id="p-autosell-toggle-hud" ${autosell.enabled ? "checked" : ""} onchange="window.toggleAutoMarketSell(this.checked)">
                                    <b>เปิดใช้งาน Auto Sell</b>
                                </label>
                                <span id="p-autosell-quota-badge-hud" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 0 4px; border-radius: 3px; font-size: 9px; font-weight: bold;">
                                    โควตา: ${clientData?.myMarketActiveCount ?? 0}/10
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
                                <input type="text" id="p-mk-search-query" value="${marketFilter.q || ''}" placeholder="ค้นหาชื่อไอเทม (เช่น Bow, Ring, Dagger)..." style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(56, 189, 248, 0.35); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 3px;">
                                <select id="p-mk-cat-select" class="p-select" style="font-size: 10px; padding: 2px 4px;">
                                    <option value="" ${marketFilter.category === '' ? 'selected' : ''}>ทุกหมวดหมู่</option>
                                    <option value="Weapon" ${marketFilter.category === 'Weapon' ? 'selected' : ''}>⚔️ อาวุธ</option>
                                    <option value="Armor" ${marketFilter.category === 'Armor' ? 'selected' : ''}>🛡️ ชุดเกราะ</option>
                                    <option value="Accessory" ${marketFilter.category === 'Accessory' ? 'selected' : ''}>💍 ประดับ/เจม</option>
                                    <option value="Card" ${marketFilter.category === 'Card' ? 'selected' : ''}>🎴 การ์ด</option>
                                    <option value="Ammo" ${marketFilter.category === 'Ammo' ? 'selected' : ''}>🏹 ลูกธนู</option>
                                </select>
                                <select id="p-mk-kind-select" class="p-select" style="font-size: 10px; padding: 2px 4px;">
                                    <option value="" ${marketFilter.kind === '' ? 'selected' : ''}>ทุกประเภท</option>
                                    <option value="bow" ${marketFilter.kind === 'bow' ? 'selected' : ''}>ธนู (Bow)</option>
                                    <option value="dagger" ${marketFilter.kind === 'dagger' ? 'selected' : ''}>มีด (Dagger)</option>
                                    <option value="sword" ${marketFilter.kind === 'sword' ? 'selected' : ''}>ดาบ (Sword)</option>
                                    <option value="spear" ${marketFilter.kind === 'spear' ? 'selected' : ''}>หอก (Spear)</option>
                                    <option value="axe" ${marketFilter.kind === 'axe' ? 'selected' : ''}>ขวาน (Axe)</option>
                                    <option value="staff" ${marketFilter.kind === 'staff' ? 'selected' : ''}>คทา (Staff)</option>
                                    <option value="shield" ${marketFilter.kind === 'shield' ? 'selected' : ''}>โล่ (Shield)</option>
                                    <option value="armor" ${marketFilter.kind === 'armor' ? 'selected' : ''}>ชุดเกราะ (Armor)</option>
                                    <option value="boot" ${marketFilter.kind === 'boot' ? 'selected' : ''}>รองเท้า (Boots)</option>
                                    <option value="cape" ${marketFilter.kind === 'cape' ? 'selected' : ''}>ผ้าคลุม (Cape)</option>
                                    <option value="ring" ${marketFilter.kind === 'ring' ? 'selected' : ''}>แหวน (Ring)</option>
                                </select>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 3px;">
                                <div class="p-row">
                                    <span style="font-size: 9.5px; color: #cbd5e1;">ตีบวก ≥:</span>
                                    <input type="number" id="p-mk-min-refine" min="0" max="15" value="${marketFilter.minRefine || 0}" style="width: 42px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 10px; padding: 1px;">
                                </div>
                                <div class="p-row">
                                    <span style="font-size: 9.5px; color: #cbd5e1;">งบสูงสุด:</span>
                                    <input type="number" id="p-mk-max-price" value="${marketFilter.maxPrice || 0}" placeholder="0=ไม่จำกัด" style="width: 58px; background: #0f172a; border: 1px solid #00ffcc; color: #00ffcc; text-align: right; border-radius: 4px; font-size: 10px; padding: 1px;">
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
                                    
                                </select>
                                <input type="number" id="p-mk-stat1-min" value="${marketFilter.statMinVal1 || 1}" min="1" style="width: 38px; background: #0f172a; border: 1px solid #f59e0b; color: #fff; text-align: center; border-radius: 4px; font-size: 10px; padding: 1px;">
                            </div>
                            <!-- Option 2 -->
                            <div class="p-row">
                                <span style="font-size: 9.5px; color: #c084fc;">Opt 2:</span>
                                <select id="p-mk-stat2-type" class="p-select" style="width: 120px; font-size: 9.5px; padding: 1px 3px;">
                                    
                                </select>
                                <input type="number" id="p-mk-stat2-min" value="${marketFilter.statMinVal2 || 1}" min="1" style="width: 38px; background: #0f172a; border: 1px solid #c084fc; color: #fff; text-align: center; border-radius: 4px; font-size: 10px; padding: 1px;">
                            </div>
                            <div class="p-row">
                                <span style="font-size: 9px; color: #94a3b8;">เงื่อนไข:</span>
                                <select id="p-mk-stat-mode" class="p-select" style="width: 90px; font-size: 9px; padding: 1px 3px;">
                                    <option value="AND" ${marketFilter.statMatchMode === 'AND' ? 'selected' : ''}>AND (ครบทุก Opt)</option>
                                    <option value="OR" ${marketFilter.statMatchMode === 'OR' ? 'selected' : ''}>OR (อย่างน้อย 1 Opt)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Sniper & Auto-Buy Card -->
                        <div class="p-card" style="border-color: rgba(168, 85, 247, 0.35); background: rgba(168, 85, 247, 0.05);">
                            <label class="p-check-box" style="color: #f59e0b;">
                                <input type="checkbox" id="p-mk-sniper-alert" ${marketFilter.sniperAlert ? 'checked' : ''}>
                                <b>🎯 เสียงเตือนเมื่อพบของตรงสเปค</b>
                            </label>
                            <label class="p-check-box" style="color: #4ade80; margin-top: 2px;">
                                <input type="checkbox" id="p-mk-auto-buy" ${marketFilter.autoBuy ? 'checked' : ''}>
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
                            <input type="checkbox" id="p-auth-enabled" ${auth.enabled ? "checked" : ""}>
                            <b>🔐 เปิดระบบ Auto-Login (เข้าเกมอัตโนมัติ)</b>
                        </label>
                        <div style="font-size: 9.5px; color: #94a3b8; margin: 3px 0 6px 0; line-height: 1.3;">
                            เมื่อเกมหลุดหรือเด้งไปหน้า Login บอทจะกรอก ID/PS และเข้าเกมให้อัตโนมัติ
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div class="p-row">
                                <span style="font-size: 10px; color: #cbd5e1;">ชื่อผู้ใช้ (ID):</span>
                                <input type="text" id="p-auth-user" value="${escapeHTML(auth.username || "")}" placeholder="ชื่อผู้ใช้ / ID" style="width: 130px; background: #0f172a; border: 1px solid rgba(192, 132, 252, 0.5); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                            </div>
                            <div class="p-row">
                                <span style="font-size: 10px; color: #cbd5e1;">รหัสผ่าน (PS):</span>
                                <div style="display: flex; align-items: center; gap: 3px;">
                                    <input type="password" id="p-auth-pass" value="${escapeHTML(auth.password || "")}" placeholder="รหัสผ่าน" style="width: 105px; background: #0f172a; border: 1px solid rgba(192, 132, 252, 0.5); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                                    <button type="button" id="p-auth-toggle-pass" style="background: rgba(15, 23, 42, 0.8); border: 1px solid #64748b; color: #94a3b8; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;" title="แสดง/ซ่อนรหัสผ่าน">👁️</button>
                                </div>
                            </div>
                            <div class="p-row">
                                <span style="font-size: 10px; color: #cbd5e1;">เลือกตัวละคร (Char):</span>
                                <input type="text" id="p-auth-char" value="${escapeHTML(auth.charName || "")}" placeholder="ชื่อตัวละคร (เว้นว่าง = ตัวแรก)" style="width: 130px; background: #0f172a; border: 1px solid rgba(192, 132, 252, 0.5); color: #fff; border-radius: 4px; font-size: 10.5px; padding: 2px 6px;">
                            </div>
                        </div>

                        <label class="p-check-box" style="color: #4ade80; margin-top: 6px;">
                            <input type="checkbox" id="p-auth-resume" ${auth.autoResumeBot ? "checked" : ""}>
                            <span style="font-size: 9.5px;">เริ่มทำงานบอทต่อทันทีเมื่อ Login สำเร็จ (Auto-Resume)</span>
                        </label>

                        <button class="p-btn" id="p-btn-test-login" style="background: #9333ea; color: #fff; font-size: 10.5px; padding: 5px; margin-top: 6px; font-weight: bold; border-radius: 4px; border: 1px solid #a855f7; width: 100%; cursor: pointer;">🔑 ทดสอบเข้าสู่ระบบทันที (Test Login)</button>
                    </div>

                    <div class="p-card" style="border-color: rgba(56, 189, 248, 0.3);">
                        <label class="p-check-box" style="color: #38bdf8;">
                            <input type="checkbox" id="p-shop-enabled" ${shop.enabled ? "checked" : ""}>
                            <b>เปิดระบบ Auto-Shop</b>
                        </label>
                        <div class="p-row" style="margin-top: 3px;">
                            <span>NPC Key:</span>
                            <input type="text" id="p-shop-npckey" value="${escapeHTML(shop.npcKey || "tools")}" style="width: 55px; background: #0f172a; border: 1px solid #38bdf8; color: #fff; text-align: center; border-radius: 4px; font-size: 11px; padding: 2px;">
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
}

async function openWebBotHUD(profileId) {
  const profile = currentProfiles.find(p => p.id === profileId);
  if (!profile) return;

  // Bring to top if already exists
  if (activeWebHuds[profileId]) {
    const existing = activeWebHuds[profileId].el;
    existing.style.zIndex = ++topHudZIndex;
    existing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // Fetch initial client data
  let clientData = null;
  try {
    const res = await fetch(API_BASE + '/api/profiles/' + profileId + '/client-data');
    const json = await res.json();
    if (json.success) clientData = json.data;
  } catch(e) {}

  const container = document.getElementById("web-huds-container") || document.body;
  const hudCount = Object.keys(activeWebHuds).length;
  const topPos = Math.min(window.innerHeight - 450, 100 + (hudCount * 30) % 250);
  const leftPos = Math.min(window.innerWidth - 320, 60 + (hudCount * 35) % 400);

  const hudEl = document.createElement("div");
  hudEl.className = "pelican-hud-web";
  hudEl.id = 'pelican-hud-' + profileId;
  hudEl.style.top = topPos + 'px';
  hudEl.style.left = leftPos + 'px';
  hudEl.style.zIndex = ++topHudZIndex;

  hudEl.innerHTML = getGitHubHudTemplate(profileId, clientData, profile);
  container.appendChild(hudEl);

  // Store active reference
  activeWebHuds[profileId] = {
    el: hudEl,
    activeTab: 'farm',
    data: clientData,
    profile: profile
  };

  // Wire Tab Switching directly within this HUD window (exact bot.js logic)
  const tabBtns = hudEl.querySelectorAll('.p-tab-btn');
  const tabPanes = hudEl.querySelectorAll('.p-tab-pane');
  tabBtns.forEach(btn => {
    btn.onclick = () => {
      const targetTab = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const activePane = hudEl.querySelector('#p-tab-' + targetTab);
      if (activePane) activePane.classList.add('active');
      activeWebHuds[profileId].activeTab = targetTab;
    };
  });

  // Wire Market subtabs
  const btnAuto = hudEl.querySelector('#p-subtab-btn-autosell');
  const btnSniper = hudEl.querySelector('#p-subtab-btn-sniper');
  const viewAuto = hudEl.querySelector('#p-market-view-autosell');
  const viewSniper = hudEl.querySelector('#p-market-view-sniper');
  if (btnAuto && btnSniper) {
    btnAuto.onclick = () => {
      if (viewAuto) viewAuto.style.display = 'block';
      if (viewSniper) viewSniper.style.display = 'none';
      btnAuto.style.background = '#9333ea'; btnAuto.style.color = '#fff';
      btnSniper.style.background = 'transparent'; btnSniper.style.color = '#94a3b8';
    };
    btnSniper.onclick = () => {
      if (viewAuto) viewAuto.style.display = 'none';
      if (viewSniper) viewSniper.style.display = 'block';
      btnAuto.style.background = 'transparent'; btnAuto.style.color = '#94a3b8';
      btnSniper.style.background = '#0284c7'; btnSniper.style.color = '#fff';
    };
  }

  // Password toggle
  const passToggle = hudEl.querySelector('#p-auth-toggle-pass');
  const passInp = hudEl.querySelector('#p-auth-pass');
  if (passToggle && passInp) {
    passToggle.onclick = () => {
      passInp.type = passInp.type === 'password' ? 'text' : 'password';
    };
  }

  // Action Buttons Wiring
  const toggleBotBtn = hudEl.querySelector('#p-btn-toggle-bot');
  if (toggleBotBtn) {
    toggleBotBtn.onclick = () => {
      const isRunning = Boolean(activeWebHuds[profileId]?.data?.autoLoopEnabled || activeWebHuds[profileId]?.data?.isBotRunning);
      toggleBotExecution(profileId, !isRunning);
    };
  }

  const autoLoopCb = hudEl.querySelector('#p-auto-loop');
  if (autoLoopCb) {
    autoLoopCb.onchange = (e) => {
      sendWebHudAction(profileId, { type: 'toggle-auto-loop', enabled: e.target.checked });
    };
  }

  const mapSelect = hudEl.querySelector('#p-target-map-select');
  if (mapSelect) {
    mapSelect.onchange = (e) => {
      sendWebHudAction(profileId, { type: 'set-farm-map', map: e.target.value });
    };
  }

  const walkMapBtn = hudEl.querySelector('#p-btn-walk-map');
  if (walkMapBtn) {
    walkMapBtn.onclick = () => sendWebHudAction(profileId, { type: 'walk-to-map' });
  }

  const openMapBtn = hudEl.querySelector('#p-btn-open-map');
  if (openMapBtn) {
    openMapBtn.onclick = () => sendWebHudAction(profileId, { type: 'open-world-map' });
  }

  const autoJumpCb = hudEl.querySelector('#p-auto-jump');
  if (autoJumpCb) {
    autoJumpCb.onchange = (e) => {
      sendWebHudAction(profileId, { type: 'toggle-auto-jump', enabled: e.target.checked });
    };
  }

  const testJumpBtn = hudEl.querySelector('#p-btn-test-jump');
  if (testJumpBtn) {
    testJumpBtn.onclick = () => sendWebHudAction(profileId, { type: 'test-jump' });
  }

  // Archer event listeners
  const saveArcher = () => {
    const cfg = {
      requireArrow: hudEl.querySelector('#p-archer-req')?.checked,
      arrowType: parseInt(hudEl.querySelector('#p-archer-type')?.value || '90030'),
      arrowBuyQty: parseInt(hudEl.querySelector('#p-archer-qty')?.value || '5000'),
      ammoThreshold: parseInt(hudEl.querySelector('#p-archer-threshold')?.value || '50'),
      useBwing: hudEl.querySelector('#p-archer-bwing')?.checked,
      bwingBuyQty: parseInt(hudEl.querySelector('#p-archer-bwing-qty')?.value || '2')
    };
    sendWebHudAction(profileId, { type: 'update-archer', config: cfg });
  };
  ['#p-archer-req', '#p-archer-type', '#p-archer-qty', '#p-archer-threshold', '#p-archer-bwing', '#p-archer-bwing-qty'].forEach(sel => {
    const el = hudEl.querySelector(sel);
    if (el) el.onchange = saveArcher;
  });

  const syncAmmoBtn = hudEl.querySelector('#p-btn-sync-ammo');
  if (syncAmmoBtn) syncAmmoBtn.onclick = () => sendWebHudAction(profileId, { type: 'sync-ammo' });

  const zeroAmmoBtn = hudEl.querySelector('#p-btn-zero-ammo');
  if (zeroAmmoBtn) zeroAmmoBtn.onclick = () => sendWebHudAction(profileId, { type: 'zero-ammo' });

  // Sell event listeners
  const saveSell = () => {
    const cfg = {
      enabled: hudEl.querySelector('#p-sell-trash')?.checked,
      weightThreshold: parseInt(hudEl.querySelector('#p-sell-weight')?.value || '80'),
      weaponRarity: hudEl.querySelector('#p-sell-weap')?.value || 'rare',
      armorRarity: hudEl.querySelector('#p-sell-armor')?.value || 'good',
      keepRefined: hudEl.querySelector('#p-sell-keep-refined')?.checked,
      keepSpecial: hudEl.querySelector('#p-sell-keep-special')?.checked,
      keepSockets: hudEl.querySelector('#p-sell-keep-sockets')?.checked,
      whitelist: hudEl.querySelector('#p-sell-whitelist')?.value || ''
    };
    sendWebHudAction(profileId, { type: 'update-sell', config: cfg });
  };
  ['#p-sell-trash', '#p-sell-weight', '#p-sell-weap', '#p-sell-armor', '#p-sell-keep-refined', '#p-sell-keep-special', '#p-sell-keep-sockets', '#p-sell-whitelist'].forEach(sel => {
    const el = hudEl.querySelector(sel);
    if (el) el.onchange = saveSell;
  });

  const refreshInvBtn = hudEl.querySelector('#p-btn-sort-inv') || hudEl.querySelector('#p-quick-weight');
  if (refreshInvBtn) refreshInvBtn.onclick = () => sendWebHudAction(profileId, { type: 'sort-inventory' });

  const testSellBtn = hudEl.querySelector('#p-btn-test-sell-only');
  if (testSellBtn) testSellBtn.onclick = () => sendWebHudAction(profileId, { type: 'test-sell' });

  // Auth event listeners
  const saveAuth = () => {
    const cfg = {
      enabled: hudEl.querySelector('#p-auth-enabled')?.checked,
      username: hudEl.querySelector('#p-auth-user')?.value || '',
      password: hudEl.querySelector('#p-auth-pass')?.value || '',
      charName: hudEl.querySelector('#p-auth-char')?.value || '',
      autoResumeBot: hudEl.querySelector('#p-auth-resume')?.checked
    };
    sendWebHudAction(profileId, { type: 'update-auth', config: cfg });
  };
  ['#p-auth-enabled', '#p-auth-user', '#p-auth-pass', '#p-auth-char', '#p-auth-resume'].forEach(sel => {
    const el = hudEl.querySelector(sel);
    if (el) el.onchange = saveAuth;
  });

  // Config Export / Import
  const exportBtn = hudEl.querySelector('#p-btn-export-cfg');
  if (exportBtn) {
    exportBtn.onclick = async () => {
      const res = await sendWebHudAction(profileId, { type: 'export-config' });
      const jsonStr = res?.result?.result?.json || res?.result?.json || JSON.stringify(res?.result, null, 2);
      openWebConfigModal(profileId, 'export', jsonStr);
    };
  }

  const importBtn = hudEl.querySelector('#p-btn-import-cfg');
  if (importBtn) {
    importBtn.onclick = () => {
      openWebConfigModal(profileId, 'import');
    };
  }

  // Market Search
  const mkSearchBtn = hudEl.querySelector('#p-btn-mk-search');
  if (mkSearchBtn) {
    mkSearchBtn.onclick = () => {
      const kw = hudEl.querySelector('#p-mk-keyword')?.value || '';
      sendWebHudAction(profileId, { type: 'market-search', keyword: kw });
    };
  }

  // Draggable
  makeElementDraggable(hudEl, hudEl.querySelector('#pelican-drag-handle'));

  // Initial Populate
  populateWebHudData(profileId, clientData);
}

function makeElementDraggable(elmnt, dragHandle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  if (dragHandle) {
    dragHandle.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    elmnt.style.zIndex = ++topHudZIndex;
    if (e.target.closest('button') || e.target.closest('span[style*="cursor"]') || e.target.closest('input') || e.target.closest('select')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    elmnt.style.top = Math.max(0, elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = Math.max(0, elmnt.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function closeWebBotHUD(profileId) {
  if (activeWebHuds[profileId]) {
    activeWebHuds[profileId].el.remove();
    delete activeWebHuds[profileId];
  }
}

function toggleWebHudCollapse(profileId) {
  const hud = activeWebHuds[profileId]?.el;
  if (!hud) return;
  const content = hud.querySelector('#pelican-content');
  const toggleBtn = hud.querySelector('.pelican-toggle') || hud.querySelector('#pelican-toggle');
  if (!content) return;
  if (content.style.display === 'none') {
    content.style.display = 'flex';
    if (toggleBtn) toggleBtn.innerText = '−';
  } else {
    content.style.display = 'none';
    if (toggleBtn) toggleBtn.innerText = '+';
  }
}

function populateWebHudData(profileId, data) {
  if (!data) return;
  const hud = activeWebHuds[profileId]?.el;
  if (!hud) return;

  // Title: Only character / profile name (NO Pmhee)
  const titleEl = hud.querySelector('.p-header-title');
  const charName = data.state?.charName || activeWebHuds[profileId]?.profile?.name;
  if (titleEl && charName) titleEl.innerText = charName;

  // Header quick badges
  const quickAmmo = hud.querySelector('#p-quick-ammo');
  if (quickAmmo) quickAmmo.innerText = '🏹 ' + (data.currentAmmo ?? '--');

  const quickWeight = hud.querySelector('#p-quick-weight');
  if (quickWeight) quickWeight.innerText = '⚖️ ' + (data.state?.weight ?? '--%');

  // Status strip
  const mapEl = hud.querySelector('#p-cur-map-display');
  if (mapEl) mapEl.innerText = data.state?.map || data.targetFarmMap || 'รอระบุแมพ...';

  const charStateEl = hud.querySelector('#p-char-state');
  if (charStateEl) {
    if (data.state?.botStatus) {
      charStateEl.innerText = data.state.botStatus;
    } else if (data.isBotRunning || data.autoLoopEnabled) {
      charStateEl.innerText = '⚔️ Auto-Farm ทำงาน';
    } else {
      charStateEl.innerText = '⏸️ หยุดทำงาน';
    }
  }

  const posEl = hud.querySelector('#p-cur-pos');
  if (posEl) posEl.innerText = data.state?.coords || 'รอ Minimap...';

  // Toggle Bot Button (Exact in-game styling)
  const btn = hud.querySelector('#p-btn-toggle-bot');
  if (btn) {
    const isRunning = Boolean(data.autoLoopEnabled || data.isBotRunning);
    if (isRunning) {
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

  // Auto Loop Checkbox
  const autoLoopCb = hud.querySelector('#p-auto-loop');
  if (autoLoopCb && document.activeElement !== autoLoopCb) autoLoopCb.checked = !!data.autoLoopEnabled;

  // Farm Map Select
  const mapSelect = hud.querySelector('#p-target-map-select');
  if (mapSelect && data.targetFarmMap && document.activeElement !== mapSelect) mapSelect.value = data.targetFarmMap;

  // Auto Jump Checkbox
  const autoJumpCb = hud.querySelector('#p-auto-jump');
  if (autoJumpCb && document.activeElement !== autoJumpCb) autoJumpCb.checked = !!data.autoJumpEnabled;

  // Archer
  const archer = data.archerConfig || {};
  const ammoCount = hud.querySelector('#p-ammo-count');
  if (ammoCount) ammoCount.innerText = (data.currentAmmo ?? 0) + ' ดอก';

  const reqArrow = hud.querySelector('#p-archer-req');
  if (reqArrow && document.activeElement !== reqArrow) reqArrow.checked = !!archer.requireArrow;

  const arrowType = hud.querySelector('#p-archer-type');
  if (arrowType && archer.arrowType && document.activeElement !== arrowType) arrowType.value = String(archer.arrowType);

  const arrowQty = hud.querySelector('#p-archer-qty');
  if (arrowQty && document.activeElement !== arrowQty) arrowQty.value = archer.arrowBuyQty || 5000;

  const arrowThresh = hud.querySelector('#p-archer-threshold');
  if (arrowThresh && document.activeElement !== arrowThresh) arrowThresh.value = archer.ammoThreshold || 50;

  const bwing = hud.querySelector('#p-archer-bwing');
  if (bwing && document.activeElement !== bwing) bwing.checked = !!archer.useBwing;

  const bwingQty = hud.querySelector('#p-archer-bwing-qty');
  if (bwingQty && document.activeElement !== bwingQty) bwingQty.value = archer.bwingBuyQty || 2;

  // Sell
  const sell = data.sellConfig || {};
  const sellTrash = hud.querySelector('#p-sell-trash');
  if (sellTrash && document.activeElement !== sellTrash) sellTrash.checked = !!sell.enabled;

  const sellWeight = hud.querySelector('#p-sell-weight');
  if (sellWeight && document.activeElement !== sellWeight) sellWeight.value = sell.weightThreshold || 80;

  const sellWeap = hud.querySelector('#p-sell-weap');
  if (sellWeap && sell.weaponRarity && document.activeElement !== sellWeap) sellWeap.value = sell.weaponRarity;

  const sellArmor = hud.querySelector('#p-sell-armor');
  if (sellArmor && sell.armorRarity && document.activeElement !== sellArmor) sellArmor.value = sell.armorRarity;

  const keepRef = hud.querySelector('#p-sell-keep-refined');
  if (keepRef && document.activeElement !== keepRef) keepRef.checked = sell.keepRefined !== false;

  const keepSpec = hud.querySelector('#p-sell-keep-special');
  if (keepSpec && document.activeElement !== keepSpec) keepSpec.checked = !!sell.keepSpecial;

  const keepSock = hud.querySelector('#p-sell-keep-sockets');
  if (keepSock && document.activeElement !== keepSock) keepSock.checked = !!sell.keepSockets;

  const sellWl = hud.querySelector('#p-sell-whitelist');
  if (sellWl && document.activeElement !== sellWl) sellWl.value = sell.whitelist || '';

  // Auth
  const auth = data.authConfig || {};
  const authEn = hud.querySelector('#p-auth-enabled');
  if (authEn && document.activeElement !== authEn) authEn.checked = !!auth.enabled;

  const authUs = hud.querySelector('#p-auth-user');
  if (authUs && document.activeElement !== authUs) authUs.value = auth.username || '';

  const authPs = hud.querySelector('#p-auth-pass');
  if (authPs && document.activeElement !== authPs) authPs.value = auth.password || '';

  const authCh = hud.querySelector('#p-auth-char');
  if (authCh && document.activeElement !== authCh) authCh.value = auth.charName || '';

  const authRes = hud.querySelector('#p-auth-resume');
  if (authRes && document.activeElement !== authRes) authRes.checked = !!auth.autoResumeBot;
}

async function sendWebHudAction(profileId, payload) {
  try {
    await fetch(API_BASE + '/api/profiles/' + profileId + '/client-action', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    // Immediately pull refreshed data
    setTimeout(async () => {
      const res = await fetch(API_BASE + '/api/profiles/' + profileId + '/client-data');
      const json = await res.json();
      if (json.success && json.data) {
        if (activeWebHuds[profileId]) activeWebHuds[profileId].data = json.data;
        populateWebHudData(profileId, json.data);
      }
    }, 250);
  } catch(e) {
    console.error("sendWebHudAction error:", e);
  }
}

async function updateActiveWebHuds() {
  const openIds = Object.keys(activeWebHuds);
  for (const id of openIds) {
    try {
      const res = await fetch(API_BASE + '/api/profiles/' + id + '/client-data');
      const json = await res.json();
      if (json.success && json.data) {
        activeWebHuds[id].data = json.data;
        populateWebHudData(id, json.data);
      }
    } catch(e) {}
  }
}

// ==========================================
// SCRIPT PLAN WORKFLOW BUILDER (n8n-style)
// ==========================================
let currentPlanProfiles = [];
let currentPlanAssignments = {};
let activePlanClientProfileId = null;
let activeEditingPlan = null;

const PLAN_MAP_OPTIONS = [
  { group: "🏰 เขตเมือง & ปลอดภัย", maps: ["เมืองหลวงโซลเฮเวน", "ตลาดคาราวาน"] },
  { group: "🌱 แมพระดับเริ่มต้น (Lv. 1-12)", maps: ["ถนนต้นหลิว", "ทุ่งโคลเวอร์", "ทุ่งหญ้าตะวันออก", "ไร่ซันเกรน"] },
  { group: "⚔️ แมพยอดนิยม (Lv. 12-55)", maps: ["ซากโบราณสถาน", "ทะเลสาบอาซูร์", "ป่ามูนลีฟ", "เส้นทางก็อบลิน", "เหมืองคริสตัลเก่า", "ค่ายออร์ค", "ที่ราบสูงเกล"] }
];

const PLAN_CLASS_OPTIONS = [
  "Novice", "Archer", "Hunter", "Rogue", "Mage", "Wizard", "Swordsman", "Knight", "Acolyte", "Priest"
];

// Open Plan Modal
async function openScriptPlanModal(profileId) {
  activePlanClientProfileId = profileId;
  const clientProfile = currentProfiles.find(p => p.id === profileId);

  const targetNameEl = document.getElementById("plan-target-client-name");
  const targetIdInput = document.getElementById("plan-target-client-id");
  if (targetNameEl) targetNameEl.innerText = clientProfile ? `${clientProfile.name} (Port: ${clientProfile.debugPort || '--'})` : profileId;
  if (targetIdInput) targetIdInput.value = profileId;

  switchPlanModalView('list');

  const modal = document.getElementById("plan-modal");
  if (modal) modal.classList.add("active");

  await fetchAndRenderPlanProfiles();
}

function closeScriptPlanModal() {
  const modal = document.getElementById("plan-modal");
  if (modal) modal.classList.remove("active");
  activePlanClientProfileId = null;
  activeEditingPlan = null;
}

function switchPlanModalView(view) {
  const viewList = document.getElementById("plan-view-list");
  const viewEditor = document.getElementById("plan-view-editor");
  if (view === 'list') {
    if (viewList) viewList.style.display = 'flex';
    if (viewEditor) viewEditor.style.display = 'none';
  } else if (view === 'editor') {
    if (viewList) viewList.style.display = 'none';
    if (viewEditor) viewEditor.style.display = 'flex';
  }
}

// Fetch Plan Profiles from Backend
async function fetchAndRenderPlanProfiles() {
  try {
    const res = await fetch(`${API_BASE}/api/plan-profiles`);
    const data = await res.json();
    if (data.success) {
      currentPlanProfiles = data.profiles || [];
      currentPlanAssignments = data.assignments || {};
    }
  } catch(e) {
    console.error("Failed to load plan profiles:", e);
  }

  renderPlanProfilesList();
}

function renderPlanProfilesList() {
  const container = document.getElementById("plan-profiles-list-container");
  const activeBadge = document.getElementById("plan-active-badge");
  if (!container) return;

  const currentAssignedPlanId = currentPlanAssignments[activePlanClientProfileId];
  const assignedPlan = currentPlanProfiles.find(p => p.id === currentAssignedPlanId);

  if (activeBadge) {
    if (assignedPlan) {
      activeBadge.innerText = assignedPlan.name;
      activeBadge.style.background = 'rgba(34, 197, 94, 0.18)';
      activeBadge.style.color = '#4ade80';
      activeBadge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    } else {
      activeBadge.innerText = 'ยังไม่ได้กำหนดแผน';
      activeBadge.style.background = 'rgba(148, 163, 184, 0.12)';
      activeBadge.style.color = '#94a3b8';
      activeBadge.style.borderColor = 'rgba(148, 163, 184, 0.2)';
    }
  }

  if (currentPlanProfiles.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 13px;">
        <span style="font-size: 28px; opacity: 0.6; display: block; margin-bottom: 8px;">📜</span>
        ยังไม่มี Plan Profile ในระบบ<br>
        คลิกปุ่ม <b>"➕ เพิ่ม Plan Profile ใหม่"</b> ด้านบนเพื่อเริ่มสร้างแผนแรกของคุณ
      </div>
    `;
    return;
  }

  container.innerHTML = currentPlanProfiles.map(plan => {
    const isAssigned = (plan.id === currentAssignedPlanId);
    const triggersCount = (plan.triggers || []).length;
    let actionsCount = 0;
    (plan.triggers || []).forEach(t => actionsCount += (t.actions || []).length);

    return `
      <div class="plan-profile-item ${isAssigned ? 'active-assigned' : ''}">
        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px; font-weight: 700; color: #f8fafc;">${escapeHTML(plan.name)}</span>
            ${isAssigned ? `
              <span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); font-size: 10px; padding: 1px 6px; border-radius: 4px;">
                ⚡ กำลังใช้งานกับจอนี้
              </span>
            ` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 12px; font-size: 11.5px; color: #94a3b8;">
            <span>🎯 <b>${triggersCount}</b> ระดับเลเวล</span>
            <span>⚡ <b>${actionsCount}</b> การทำงาน (Actions)</span>
            <span style="opacity: 0.8;">${escapeHTML(plan.description || '')}</span>
          </div>
        </div>

        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-primary btn-sm" onclick="openPlanWorkflowEditor('${plan.id}')" title="เปิดหน้าต่างแก้ไขแผนสไตล์ n8n">
            <span>✏️</span> Edit
          </button>
          <button type="button" class="btn ${isAssigned ? 'btn-secondary' : 'btn-success'} btn-sm" onclick="assignPlanToActiveClient('${plan.id}')" title="${isAssigned ? 'ซิงค์ข้อมูลกับจอนี้อีกครั้ง' : 'เลือกใช้แผนนี้กับจอนี้'}">
            <span>⚡</span> ${isAssigned ? 'ซิงค์ซ้ำ' : 'ใช้งาน'}
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="duplicatePlanProfile('${plan.id}')" title="ทำสำเนาแผนนี้">
            <span>📋</span>
          </button>
          <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="deletePlanProfile('${plan.id}')" title="ลบแผนนี้">
            <span>➖</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Create new Plan Profile
async function createNewPlanProfile() {
  const name = prompt("ตั้งชื่อ Plan Profile ใหม่:", "แผนเก็บเลเวล Archer " + (currentPlanProfiles.length + 1));
  if (!name || !name.trim()) return;

  try {
    const res = await fetch(`${API_BASE}/api/plan-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: "สร้างเมื่อ " + new Date().toLocaleDateString('th-TH'),
        triggers: [
          {
            id: "trig_" + Date.now(),
            type: "base_level",
            targetLevel: 8,
            actions: [
              {
                id: "act_" + Date.now(),
                type: "equip_item",
                itemName: "Gakkung Bow",
                optionFilter: "",
                buyFromMarket: true,
                maxPrice: 100000
              }
            ]
          }
        ]
      })
    });
    const result = await res.json();
    if (result.success && result.profile) {
      await fetchAndRenderPlanProfiles();
      openPlanWorkflowEditor(result.profile.id);
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาดในการสร้างแผนใหม่");
  }
}

// Delete Plan Profile
async function deletePlanProfile(planId) {
  const plan = currentPlanProfiles.find(p => p.id === planId);
  if (!plan) return;
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบแผน "${plan.name}"?\n(หากมีจอเกมที่ใช้แผนนี้อยู่ แผนจะถูกยกเลิก)`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/plan-profiles/${planId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      await fetchAndRenderPlanProfiles();
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาดในการลบแผน");
  }
}

// Duplicate Plan Profile
async function duplicatePlanProfile(planId) {
  const plan = currentPlanProfiles.find(p => p.id === planId);
  if (!plan) return;

  try {
    const res = await fetch(`${API_BASE}/api/plan-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: plan.name + " (Copy)",
        description: plan.description || "",
        triggers: plan.triggers || []
      })
    });
    const result = await res.json();
    if (result.success) {
      await fetchAndRenderPlanProfiles();
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาดในการทำสำเนาแผน");
  }
}

// Assign Plan to Active Client Card
async function assignPlanToActiveClient(planId) {
  if (!activePlanClientProfileId) return;

  try {
    const res = await fetch(`${API_BASE}/api/plan-profiles/${planId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientProfileId: activePlanClientProfileId })
    });
    const result = await res.json();
    if (result.success) {
      alert(`⚡ ${result.message || 'ผูกแผนกับจอนี้เรียบร้อยแล้ว!'}`);
      await fetchAndRenderPlanProfiles();
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาดในการผูกแผน");
  }
}

// Open Visual Workflow Editor for a Plan
function openPlanWorkflowEditor(planId) {
  const plan = currentPlanProfiles.find(p => p.id === planId);
  if (!plan) return;

  activeEditingPlan = JSON.parse(JSON.stringify(plan));

  const titleInput = document.getElementById("plan-editor-title");
  const descInput = document.getElementById("plan-editor-desc");
  if (titleInput) titleInput.value = activeEditingPlan.name || "Untitled Plan";
  if (descInput) descInput.value = activeEditingPlan.description || "";

  renderPlanWorkflowCanvas();
  switchPlanModalView('editor');
}

// Render Triggers and Action nodes
function renderPlanWorkflowCanvas() {
  const canvas = document.getElementById("plan-workflow-canvas");
  if (!canvas || !activeEditingPlan) return;

  const triggers = activeEditingPlan.triggers || [];

  if (triggers.length === 0) {
    canvas.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 40px; border: 2px dashed rgba(255, 255, 255, 0.1); border-radius: 10px;">
        <span style="font-size: 32px; opacity: 0.6; display: block; margin-bottom: 8px;">🎯</span>
        ยังไม่มีเงื่อนไขเลเวลในแผนนี้<br>
        คลิกปุ่ม <b>"➕ เพิ่มเงื่อนไขเลเวล (Trigger)"</b> ด้านบนเพื่อเริ่มสร้างเงื่อนไขแรก (เช่น เลเวล 8)
      </div>
    `;
    return;
  }

  canvas.innerHTML = triggers.map((trig, trigIdx) => {
    const isJob = (trig.type === 'job_level');
    const actions = trig.actions || [];

    return `
      <div class="plan-trigger-card ${isJob ? 'job-type' : ''}" data-trigger-idx="${trigIdx}">
        <!-- Trigger Node Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 16px;">🎯</span>
            <select class="form-select" style="font-size: 11.5px; padding: 3px 8px; width: auto;" onchange="updateTriggerType(${trigIdx}, this.value)">
              <option value="base_level" ${trig.type === 'base_level' ? 'selected' : ''}>เลเวลตัวละคร (Base Level)</option>
              <option value="job_level" ${trig.type === 'job_level' ? 'selected' : ''}>เลเวลอาชีพ (Job Level)</option>
            </select>
            <span style="font-size: 12px; font-weight: 700; color: #f8fafc;">เลเวล:</span>
            <input type="number" class="form-input" value="${trig.targetLevel || 1}" min="1" max="150" style="width: 65px; font-size: 12px; padding: 3px 6px; font-weight: 700;" onchange="updateTriggerLevel(${trigIdx}, this.value)">
            <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; padding: 2px 6px; border-radius: 4px;">
              ⚡ One-Shot (ทำ 1 ครั้งตอนถึงเลเวลนี้)
            </span>
          </div>
          <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="removeTrigger(${trigIdx})" title="ลบเงื่อนไขเลเวลนี้">
            <span>🗑️</span>
          </button>
        </div>

        <!-- Connector line -->
        <div class="plan-node-connector"></div>

        <!-- Actions Container -->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
          ${actions.length === 0 ? `
            <div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px;">
              ยังไม่มีการทำงานในเงื่อนไขนี้ — กดปุ่ม "+ เพิ่ม Action" ด้านล่าง
            </div>
          ` : actions.map((act, actIdx) => renderActionNodeHtml(trigIdx, actIdx, act)).join('')}
        </div>

        <!-- Add Action Bar -->
        <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 6px;">
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="addActionToTrigger(${trigIdx}, 'equip_item')" style="font-size: 11px; padding: 3px 8px;">
              <span>🛡️</span> + สวมใส่ของ
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addActionToTrigger(${trigIdx}, 'change_map')" style="font-size: 11px; padding: 3px 8px;">
              <span>🗺️</span> + ย้ายแมพ
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addActionToTrigger(${trigIdx}, 'change_class')" style="font-size: 11px; padding: 3px 8px;">
              <span>🏹</span> + เปลี่ยนอาชีพ
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render single Action Node
function renderActionNodeHtml(trigIdx, actIdx, act) {
  if (act.type === 'equip_item') {
    return `
      <div class="plan-action-card type-equip">
        <div class="plan-action-header">
          <span class="plan-action-title">
            <span>🛡️</span> ${actIdx + 1}. สวมใส่อุปกรณ์ (Equip Item)
          </span>
          <button type="button" class="plan-action-del-btn" onclick="removeAction(${trigIdx}, ${actIdx})" title="ลบ Action นี้">&times;</button>
        </div>
        <div class="plan-action-grid">
          <div>
            <label style="font-size: 10px; color: #94a3b8;">ชื่อไอเทม:</label>
            <input type="text" class="form-input" style="font-size: 11.5px; padding: 4px 8px;" placeholder="เช่น Gakkung Bow, Angelic Protection" value="${escapeHTML(act.itemName || '')}" onchange="updateActionField(${trigIdx}, ${actIdx}, 'itemName', this.value)">
          </div>
          <div>
            <label style="font-size: 10px; color: #94a3b8;">ออปชั่นขั้นต่ำ (เว้นว่างได้):</label>
            <input type="text" class="form-input" style="font-size: 11.5px; padding: 4px 8px;" placeholder="เช่น dex, atk, cri" value="${escapeHTML(act.optionFilter || '')}" onchange="updateActionField(${trigIdx}, ${actIdx}, 'optionFilter', this.value)">
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #cbd5e1; cursor: pointer;">
            <input type="checkbox" ${act.buyFromMarket !== false ? 'checked' : ''} onchange="updateActionField(${trigIdx}, ${actIdx}, 'buyFromMarket', this.checked)">
            <span>🛒 ถ้าไม่มีในตัวและกระเป๋า ให้ค้นหาและซื้อจากตลาดอัตโนมัติ</span>
          </label>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 10px; color: #94a3b8;">งบสูงสุด:</span>
            <input type="number" class="form-input" style="width: 80px; font-size: 11px; padding: 2px 6px;" value="${act.maxPrice || 100000}" onchange="updateActionField(${trigIdx}, ${actIdx}, 'maxPrice', parseInt(this.value)||0)">
            <span style="font-size: 10px; color: #eab308;">z</span>
          </div>
        </div>
      </div>
    `;
  } else if (act.type === 'change_map') {
    return `
      <div class="plan-action-card type-map">
        <div class="plan-action-header">
          <span class="plan-action-title">
            <span>🗺️</span> ${actIdx + 1}. เปลี่ยนแมพฟาร์ม (Change Farm Map)
          </span>
          <button type="button" class="plan-action-del-btn" onclick="removeAction(${trigIdx}, ${actIdx})" title="ลบ Action นี้">&times;</button>
        </div>
        <div>
          <label style="font-size: 10px; color: #94a3b8;">เลือกแมพเป้าหมาย:</label>
          <select class="form-select" style="font-size: 11.5px; padding: 4px 8px;" onchange="updateActionField(${trigIdx}, ${actIdx}, 'targetMap', this.value)">
            ${PLAN_MAP_OPTIONS.map(grp => `
              <optgroup label="${grp.group}">
                ${grp.maps.map(m => `
                  <option value="${m}" ${act.targetMap === m ? 'selected' : ''}>${m}</option>
                `).join('')}
              </optgroup>
            `).join('')}
          </select>
        </div>
      </div>
    `;
  } else if (act.type === 'change_class') {
    return `
      <div class="plan-action-card type-class">
        <div class="plan-action-header">
          <span class="plan-action-title">
            <span>🏹</span> ${actIdx + 1}. เปลี่ยนอาชีพ (Change Class)
          </span>
          <button type="button" class="plan-action-del-btn" onclick="removeAction(${trigIdx}, ${actIdx})" title="ลบ Action นี้">&times;</button>
        </div>
        <div>
          <label style="font-size: 10px; color: #94a3b8;">เลือกอาชีพเป้าหมาย:</label>
          <select class="form-select" style="font-size: 11.5px; padding: 4px 8px;" onchange="updateActionField(${trigIdx}, ${actIdx}, 'targetClass', this.value)">
            ${PLAN_CLASS_OPTIONS.map(cls => `
              <option value="${cls}" ${act.targetClass === cls ? 'selected' : ''}>${cls}</option>
            `).join('')}
          </select>
        </div>
      </div>
    `;
  }
  return '';
}

// Trigger and Action Mutators
function addLevelTrigger() {
  if (!activeEditingPlan) return;
  if (!Array.isArray(activeEditingPlan.triggers)) activeEditingPlan.triggers = [];

  const nextLevel = (activeEditingPlan.triggers.length > 0)
    ? (parseInt(activeEditingPlan.triggers[activeEditingPlan.triggers.length - 1].targetLevel, 10) + 5)
    : 8;

  activeEditingPlan.triggers.push({
    id: "trig_" + Date.now(),
    type: "base_level",
    targetLevel: nextLevel,
    actions: []
  });

  renderPlanWorkflowCanvas();
}

function removeTrigger(trigIdx) {
  if (!activeEditingPlan || !activeEditingPlan.triggers) return;
  activeEditingPlan.triggers.splice(trigIdx, 1);
  renderPlanWorkflowCanvas();
}

function updateTriggerType(trigIdx, type) {
  if (!activeEditingPlan || !activeEditingPlan.triggers) return;
  activeEditingPlan.triggers[trigIdx].type = type;
  renderPlanWorkflowCanvas();
}

function updateTriggerLevel(trigIdx, level) {
  if (!activeEditingPlan || !activeEditingPlan.triggers) return;
  activeEditingPlan.triggers[trigIdx].targetLevel = parseInt(level, 10) || 1;
}

function addActionToTrigger(trigIdx, actionType) {
  if (!activeEditingPlan || !activeEditingPlan.triggers) return;
  const trig = activeEditingPlan.triggers[trigIdx];
  if (!Array.isArray(trig.actions)) trig.actions = [];

  const newAction = {
    id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 100),
    type: actionType
  };

  if (actionType === 'equip_item') {
    newAction.itemName = "Gakkung Bow";
    newAction.optionFilter = "";
    newAction.buyFromMarket = true;
    newAction.maxPrice = 100000;
  } else if (actionType === 'change_map') {
    newAction.targetMap = "ซากโบราณสถาน";
  } else if (actionType === 'change_class') {
    newAction.targetClass = "Archer";
  }

  trig.actions.push(newAction);
  renderPlanWorkflowCanvas();
}

function removeAction(trigIdx, actIdx) {
  if (!activeEditingPlan || !activeEditingPlan.triggers) return;
  const trig = activeEditingPlan.triggers[trigIdx];
  if (trig && trig.actions) {
    trig.actions.splice(actIdx, 1);
    renderPlanWorkflowCanvas();
  }
}

function updateActionField(trigIdx, actIdx, field, val) {
  if (!activeEditingPlan || !activeEditingPlan.triggers) return;
  const trig = activeEditingPlan.triggers[trigIdx];
  if (trig && trig.actions && trig.actions[actIdx]) {
    trig.actions[actIdx][field] = val;
  }
}

// Save Plan
async function saveActivePlan(applyLive = false) {
  if (!activeEditingPlan) return;

  const titleInput = document.getElementById("plan-editor-title");
  const descInput = document.getElementById("plan-editor-desc");
  if (titleInput && titleInput.value.trim()) activeEditingPlan.name = titleInput.value.trim();
  if (descInput) activeEditingPlan.description = descInput.value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/plan-profiles/${activeEditingPlan.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activeEditingPlan)
    });
    const result = await res.json();
    if (result.success) {
      if (applyLive && activePlanClientProfileId) {
        await assignPlanToActiveClient(activeEditingPlan.id);
      } else {
        alert("💾 บันทึกแผนการเล่นเรียบร้อยแล้ว!");
      }
      await fetchAndRenderPlanProfiles();
      switchPlanModalView('list');
    } else {
      alert("เกิดข้อผิดพลาด: " + (result.error || "ไม่สามารถบันทึกได้"));
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
  }
}

// Import & Export Plans
function handleImportPlansClick() {
  const input = document.getElementById("plan-import-file-input");
  if (input) {
    input.value = '';
    input.click();
  }
}

function handleExportPlansClick() {
  if (currentPlanProfiles.length === 0) {
    alert("ไม่มี Plan Profile ในระบบให้ส่งออก");
    return;
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    profiles: currentPlanProfiles,
    assignments: currentPlanAssignments
  };

  const text = JSON.stringify(exportData, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aetheria_plan_scripts_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert(`📤 ส่งออก Plan Profiles ทั้งหมด (${currentPlanProfiles.length} รายการ) เรียบร้อยแล้ว!`);
}

// Setup Event Listeners for Plan Modal
function setupPlanModalEventListeners() {
  const btnClose = document.getElementById("plan-modal-close-btn");
  if (btnClose) btnClose.onclick = closeScriptPlanModal;

  const btnListClose = document.getElementById("plan-modal-list-close");
  if (btnListClose) btnListClose.onclick = closeScriptPlanModal;

  const btnEditorClose = document.getElementById("plan-editor-close-btn");
  if (btnEditorClose) btnEditorClose.onclick = closeScriptPlanModal;

  const btnBack = document.getElementById("btn-back-to-plan-list");
  if (btnBack) btnBack.onclick = () => switchPlanModalView('list');

  const btnCreate = document.getElementById("btn-create-new-plan");
  if (btnCreate) btnCreate.onclick = createNewPlanProfile;

  const btnAddTrigger = document.getElementById("btn-add-level-trigger");
  if (btnAddTrigger) btnAddTrigger.onclick = addLevelTrigger;

  const btnSave = document.getElementById("btn-save-plan");
  if (btnSave) btnSave.onclick = () => saveActivePlan(false);

  const btnSaveApply = document.getElementById("btn-save-and-apply-plan");
  if (btnSaveApply) btnSaveApply.onclick = () => saveActivePlan(true);

  const btnImport = document.getElementById("btn-import-plans");
  if (btnImport) btnImport.onclick = handleImportPlansClick;

  const fileInput = document.getElementById("plan-import-file-input");
  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          const res = await fetch(`${API_BASE}/api/plan-profiles/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed)
          });
          const result = await res.json();
          if (result.success) {
            alert(`📥 ${result.message || 'นำเข้าแผนเรียบร้อยแล้ว!'}`);
            await fetchAndRenderPlanProfiles();
          } else {
            alert("ไม่สามารถนำเข้าได้: " + (result.error || "ไฟล์ไม่ถูกต้อง"));
          }
        } catch(err) {
          alert("รูปแบบไฟล์ JSON ไม่ถูกต้อง");
        }
      };
      reader.readAsText(file);
    };
  }

  const btnExport = document.getElementById("btn-export-plans");
  if (btnExport) btnExport.onclick = handleExportPlansClick;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPlanModalEventListeners);
} else {
  setupPlanModalEventListeners();
}

// ==========================================
// PROFILE MODAL (EDIT / ADD)
// ==========================================
function openAddModal() {
  formId.value = "";
  formName.value = `Client ${currentProfiles.length + 1}`;
  formAccount.value = "";
  formClass.value = "Hunter";
  formMap.value = "ถนนต้นหลิว";
  const maxPort = Math.max(49875, ...currentProfiles.map(p => p.debugPort || 49876));
  formPort.value = maxPort + 1;
  formNotes.value = "";
  modalTitle.innerText = "➕ เพิ่มโปรไฟล์จอเกมใหม่";
  modalEl.classList.add("active");
}

function openEditModal(id) {
  const profile = currentProfiles.find(p => p.id === id);
  if (!profile) return;
  formId.value = profile.id;
  formName.value = profile.name;
  formAccount.value = profile.account || "";
  formClass.value = profile.charClass || "Hunter";
  formMap.value = profile.targetMap || "ถนนต้นหลิว";
  formPort.value = profile.debugPort || 49876;
  formNotes.value = profile.notes || "";
  modalTitle.innerText = `⚙️ แก้ไขโปรไฟล์: ${profile.name}`;
  modalEl.classList.add("active");
}

document.getElementById("modal-close-btn").onclick = () => {
  modalEl.classList.remove("active");
};

profileForm.onsubmit = async (e) => {
  e.preventDefault();
  const id = formId.value;
  const payload = {
    name: formName.value,
    account: formAccount.value,
    charClass: formClass.value,
    targetMap: formMap.value,
    debugPort: parseInt(formPort.value),
    notes: formNotes.value
  };

  try {
    if (id) {
      await fetch(`${API_BASE}/api/profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(`${API_BASE}/api/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    modalEl.classList.remove("active");
    fetchProfiles();
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
  }
};

async function deleteProfile(id) {
  if (!confirm("คุณแน่ใจว่าต้องการลบโปรไฟล์นี้ใช่หรือไม่?")) return;
  try {
    await fetch(`${API_BASE}/api/profiles/${id}`, { method: "DELETE" });
    fetchProfiles();
  } catch (err) {}
}

// Global Poll interval
fetchProfiles();
setInterval(fetchProfiles, 2000);

// ==========================================
// PRESETS & SAVE LIST SYSTEM (CENTRAL PROFILE LIBRARY)
// ==========================================
let currentPresets = [];
let activeCopyToPresetId = null;

// Fetch all presets from server
async function fetchPresets() {
  try {
    const res = await fetch(`${API_BASE}/api/presets`);
    const data = await res.json();
    if (data.success && Array.isArray(data.presets)) {
      currentPresets = data.presets;
      renderPresetsList();
    }
  } catch (err) {
    console.error('Failed to fetch presets:', err);
  }
}

// Render presets inside presets-modal
function renderPresetsList() {
  const container = document.getElementById('presets-list-container');
  if (!container) return;

  if (currentPresets.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: rgba(15, 23, 42, 0.5); border-radius: 8px; border: 1px dashed rgba(168, 85, 247, 0.25); color: #94a3b8;">
        <div style="font-size: 28px; margin-bottom: 6px;">📂</div>
        <div style="font-size: 13px; font-weight: 600; color: #cbd5e1;">ยังไม่มีการตั้งค่าในระบบ Save List ส่วนกลาง</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">กดปุ่ม "บันทึกจอเกมปัจจุบันเข้า Save List" หรือ "นำเข้า (Import)" เพื่อสร้างหรือโหลดโปรไฟล์</div>
      </div>
    `;
    return;
  }

  container.innerHTML = currentPresets.map(preset => {
    const cfg = preset.config || {};
    const targetMap = cfg.targetMap || cfg.archerConfig?.targetMap || 'ตามเดิม';
    const ammoMin = cfg.archerConfig?.minAmmoRestock || cfg.minAmmoRestock || null;
    const sellCount = cfg.sellConfig?.items?.length || 0;
    const updateTime = new Date(preset.updatedAt || preset.createdAt || Date.now()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="preset-card-item" id="preset-card-${preset.id}">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 13.5px; font-weight: 700; color: #f8fafc;">💾 ${escapeHTML(preset.name)}</span>
            <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 9.5px; padding: 1px 6px; border-radius: 4px;">
              🗺️ ${escapeHTML(targetMap)}
            </span>
            ${ammoMin ? `<span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 9.5px; padding: 1px 6px; border-radius: 4px;">🏹 ธนู: ${ammoMin} ดอก</span>` : ''}
            ${sellCount > 0 ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9.5px; padding: 1px 6px; border-radius: 4px;">💰 ขายตลาด ${sellCount} ชิ้น</span>` : ''}
            <span style="font-size: 10px; color: #34d399; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 1px 5px; border-radius: 3px;">🔒 ปลอดภัย (ไม่รวม ID/รหัส)</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 5px; line-height: 1.4;">
            ${escapeHTML(preset.description || 'ไม่มีคำอธิบาย')}
            <span style="color: #64748b; margin-left: 8px;">🕒 อัปเดต ${updateTime}</span>
          </div>
        </div>

        <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
          <button class="btn btn-purple btn-sm" onclick="openCopyToModal('${preset.id}')" title="คัดลอกการตั้งค่านี้ไปยังจอเกมต่างๆ ทันที">
            <span>📋</span> Copy to...
          </button>
          <button class="btn btn-secondary btn-sm" onclick="exportSinglePreset('${preset.id}')" title="ส่งออกเป็นไฟล์ .json แยกโปรไฟล์">
            <span>📤</span> Export
          </button>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="deletePreset('${preset.id}')" title="ลบโปรไฟล์นี้จาก Save List" style="color: #f87171;">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// PRESETS MODAL CONTROLS
// -------------------------------------------------------------
function openPresetsModal() {
  const modal = document.getElementById('presets-modal');
  if (modal) {
    modal.classList.add('active');
    fetchPresets();
  }
}

function closePresetsModal() {
  const modal = document.getElementById('presets-modal');
  if (modal) modal.classList.remove('active');
}

// -------------------------------------------------------------
// COPY TO PROFILES MODAL & LOGIC
// -------------------------------------------------------------
function openCopyToModal(presetId) {
  activeCopyToPresetId = presetId;
  const preset = currentPresets.find(p => p.id === presetId);
  if (!preset) return;

  const titleEl = document.getElementById('copy-to-preset-title');
  if (titleEl) {
    titleEl.innerText = `Preset: "${preset.name}" (แมพ: ${preset.config?.targetMap || 'ตามเดิม'})`;
  }

  const checklistContainer = document.getElementById('copy-to-profiles-checklist');
  if (checklistContainer) {
    if (currentProfiles.length === 0) {
      checklistContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 12px;">ไม่พบจอเกมในระบบ</div>';
    } else {
      checklistContainer.innerHTML = currentProfiles.map(p => `
        <label class="copy-to-check-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" class="copy-to-profile-checkbox" value="${p.id}" checked style="width: 16px; height: 16px; cursor: pointer;">
            <span style="font-weight: 600; color: #f8fafc; font-size: 12px;">${escapeHTML(p.name)}</span>
            <span style="font-size: 11px; color: #94a3b8;">(${escapeHTML(p.charClass || 'Archer')})</span>
            <span style="font-size: 10px; color: #64748b;">Port: ${p.debugPort || '--'}</span>
          </div>
          <span style="font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 600; ${p.isRunning ? 'background: rgba(34,197,94,0.18); color: #4ade80; border: 1px solid rgba(34,197,94,0.3);' : 'background: rgba(148,163,184,0.12); color: #94a3b8; border: 1px solid rgba(148,163,184,0.2);'}">
            ${p.isRunning ? '🟢 ออนไลน์' : '⚪ ออฟไลน์'}
          </span>
        </label>
      `).join('');
    }
  }

  const modal = document.getElementById('copy-to-modal');
  if (modal) modal.classList.add('active');
}

function closeCopyToModal() {
  const modal = document.getElementById('copy-to-modal');
  if (modal) modal.classList.remove('active');
  activeCopyToPresetId = null;
}

async function confirmApplyCopyTo() {
  if (!activeCopyToPresetId) return;
  const checkboxes = document.querySelectorAll('.copy-to-profile-checkbox:checked');
  const targetProfileIds = Array.from(checkboxes).map(cb => cb.value);

  if (targetProfileIds.length === 0) {
    alert('กรุณาเลือกจอเกมเป้าหมายอย่างน้อย 1 จอ');
    return;
  }

  const confirmBtn = document.getElementById('copy-to-modal-confirm');
  const originalText = confirmBtn ? confirmBtn.innerHTML : '';
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '⏳ กำลังคัดลอกและอัปเดต...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/presets/${activeCopyToPresetId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProfileIds })
    });
    const result = await res.json();
    if (result.success) {
      alert(result.message || `คัดลอกการตั้งค่าไปยัง ${result.appliedCount || targetProfileIds.length} จอเรียบร้อยแล้ว!`);
      closeCopyToModal();
      fetchProfiles();
    } else {
      alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถคัดลอกได้'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalText;
    }
  }
}

// -------------------------------------------------------------
// IMPORT PROFILE / PRESETS MODAL
// -------------------------------------------------------------
function openImportProfileModal() {
  const nameInput = document.getElementById('import-preset-name');
  const textarea = document.getElementById('import-json-textarea');
  const fileInput = document.getElementById('import-file-input');

  if (nameInput) nameInput.value = 'โปรไฟล์นำเข้าส่วนกลาง ' + (currentPresets.length + 1);
  if (textarea) textarea.value = '';
  if (fileInput) fileInput.value = '';

  const modal = document.getElementById('import-profile-modal');
  if (modal) modal.classList.add('active');
}

function closeImportProfileModal() {
  const modal = document.getElementById('import-profile-modal');
  if (modal) modal.classList.remove('active');
}

async function handleImportProfileSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('import-preset-name');
  const textarea = document.getElementById('import-json-textarea');
  if (!textarea || !textarea.value.trim()) {
    alert('กรุณาวางโค้ด JSON การตั้งค่าที่ต้องการนำเข้า');
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(textarea.value.trim());
  } catch (err) {
    alert('รูปแบบ JSON ไม่ถูกต้อง: ' + err.message);
    return;
  }

  const presetName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'โปรไฟล์นำเข้าส่วนกลาง';

  let payload = parsed;
  if (!Array.isArray(parsed) && !parsed.presets) {
    // Single preset or single config object
    if (!parsed.name) parsed.name = presetName;
    payload = parsed;
  }

  const submitBtn = document.getElementById('import-modal-submit-btn');
  const origText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ กำลังนำเข้า...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/presets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert(`นำเข้าการตั้งค่าสำเร็จ ${result.count || 1} รายการเข้าสู่ Save List เรียบร้อย!`);
      closeImportProfileModal();
      openPresetsModal();
      fetchPresets();
    } else {
      alert('นำเข้าไม่สำเร็จ: ' + (result.error || 'เกิดข้อผิดพลาด'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origText;
    }
  }
}

// -------------------------------------------------------------
// SAVE CLIENT AS PRESET MODAL
// -------------------------------------------------------------
function openSaveClientPresetModal(preferredProfileId = null) {
  const select = document.getElementById('save-client-select');
  const nameInput = document.getElementById('save-client-preset-name');
  const descInput = document.getElementById('save-client-preset-desc');
  const hiddenId = document.getElementById('save-client-profile-id');

  if (!select) return;
  select.innerHTML = currentProfiles.map(p => `
    <option value="${p.id}" ${p.id === preferredProfileId ? 'selected' : ''}>
      ${escapeHTML(p.name)} (${escapeHTML(p.charClass || 'Archer')}) - พอร์ต ${p.debugPort || '--'} ${p.isRunning ? '🟢 ออนไลน์' : '⚪ ออฟไลน์'}
    </option>
  `).join('');

  const targetProfile = currentProfiles.find(p => p.id === (preferredProfileId || (select.value || currentProfiles[0]?.id)));
  const baseName = targetProfile ? targetProfile.name : 'Client';

  if (hiddenId) hiddenId.value = targetProfile ? targetProfile.id : '';
  if (nameInput) nameInput.value = `${baseName} Setup`;
  if (descInput) descInput.value = `ดึงการตั้งค่าจาก ${baseName} (พอร์ต ${targetProfile?.debugPort || '--'})`;

  select.onchange = () => {
    const chosen = currentProfiles.find(p => p.id === select.value);
    if (chosen) {
      if (hiddenId) hiddenId.value = chosen.id;
      if (nameInput) nameInput.value = `${chosen.name} Setup`;
      if (descInput) descInput.value = `ดึงการตั้งค่าจาก ${chosen.name} (พอร์ต ${chosen.debugPort || '--'})`;
    }
  };

  const modal = document.getElementById('save-client-preset-modal');
  if (modal) modal.classList.add('active');
}

function closeSaveClientPresetModal() {
  const modal = document.getElementById('save-client-preset-modal');
  if (modal) modal.classList.remove('active');
}

async function handleSaveClientPresetSubmit(e) {
  e.preventDefault();
  const select = document.getElementById('save-client-select');
  const nameInput = document.getElementById('save-client-preset-name');
  const descInput = document.getElementById('save-client-preset-desc');

  const profileId = select ? select.value : null;
  if (!profileId) {
    alert('ไม่พบจอเกมที่เลือก');
    return;
  }

  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'โปรไฟล์ส่วนกลาง';
  const description = descInput ? descInput.value.trim() : '';

  try {
    const res = await fetch(`${API_BASE}/api/profiles/${profileId}/save-as-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const result = await res.json();
    if (result.success) {
      alert(`บันทึก "${name}" เข้า Save List ส่วนกลางเรียบร้อย!`);
      closeSaveClientPresetModal();
      openPresetsModal();
      fetchPresets();
    } else {
      alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถบันทึกได้'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}

// -------------------------------------------------------------
// EXPORT & DELETE PRESETS
// -------------------------------------------------------------
function exportAllPresets() {
  window.location.href = `${API_BASE}/api/presets/export`;
}

function exportSinglePreset(presetId) {
  const preset = currentPresets.find(p => p.id === presetId);
  if (!preset) return;

  const jsonStr = JSON.stringify(preset, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanName = preset.name.replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  a.download = `preset_${cleanName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function deletePreset(presetId) {
  const preset = currentPresets.find(p => p.id === presetId);
  const name = preset ? preset.name : presetId;
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${name}" ออกจาก Save List?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/presets/${presetId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      fetchPresets();
    } else {
      alert('ลบไม่สำเร็จ: ' + (result.error || 'เกิดข้อผิดพลาด'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

// -------------------------------------------------------------
// DOM EVENT WIRING FOR PRESETS & SAVE LIST
// -------------------------------------------------------------
function setupPresetsEventListeners() {
  // Top row buttons
  const btnOpenPresets = document.getElementById('btn-open-presets-modal');
  if (btnOpenPresets) btnOpenPresets.onclick = openPresetsModal;

  const btnImportGlobal = document.getElementById('btn-import-profile-global');
  if (btnImportGlobal) btnImportGlobal.onclick = openImportProfileModal;

  const btnExportGlobal = document.getElementById('btn-export-profile-global');
  if (btnExportGlobal) btnExportGlobal.onclick = exportAllPresets;

  // Presets modal buttons
  const btnPresetsClose = document.getElementById('presets-modal-close-btn');
  if (btnPresetsClose) btnPresetsClose.onclick = closePresetsModal;

  const btnPresetsCloseBottom = document.getElementById('presets-modal-close-bottom');
  if (btnPresetsCloseBottom) btnPresetsCloseBottom.onclick = closePresetsModal;

  const btnCreateFromClient = document.getElementById('btn-create-preset-from-client');
  if (btnCreateFromClient) btnCreateFromClient.onclick = () => openSaveClientPresetModal();

  const btnPresetsModalImport = document.getElementById('btn-presets-modal-import');
  if (btnPresetsModalImport) btnPresetsModalImport.onclick = openImportProfileModal;

  const btnPresetsModalExport = document.getElementById('btn-presets-modal-export');
  if (btnPresetsModalExport) btnPresetsModalExport.onclick = exportAllPresets;

  // Copy-to modal buttons
  const btnCopyClose = document.getElementById('copy-to-modal-close-btn');
  if (btnCopyClose) btnCopyClose.onclick = closeCopyToModal;

  const btnCopyCancel = document.getElementById('copy-to-modal-cancel');
  if (btnCopyCancel) btnCopyCancel.onclick = closeCopyToModal;

  const btnCopyConfirm = document.getElementById('copy-to-modal-confirm');
  if (btnCopyConfirm) btnCopyConfirm.onclick = confirmApplyCopyTo;

  const btnSelectAll = document.getElementById('btn-copy-to-select-all');
  if (btnSelectAll) {
    btnSelectAll.onclick = () => {
      document.querySelectorAll('.copy-to-profile-checkbox').forEach(cb => cb.checked = true);
    };
  }

  const btnDeselectAll = document.getElementById('btn-copy-to-deselect-all');
  if (btnDeselectAll) {
    btnDeselectAll.onclick = () => {
      document.querySelectorAll('.copy-to-profile-checkbox').forEach(cb => cb.checked = false);
    };
  }

  // Import modal buttons & form
  const btnImportClose = document.getElementById('import-modal-close-btn');
  if (btnImportClose) btnImportClose.onclick = closeImportProfileModal;

  const btnImportCancel = document.getElementById('import-modal-cancel-btn');
  if (btnImportCancel) btnImportCancel.onclick = closeImportProfileModal;

  const importForm = document.getElementById('import-profile-form');
  if (importForm) importForm.onsubmit = handleImportProfileSubmit;

  const importFileInput = document.getElementById('import-file-input');
  if (importFileInput) {
    importFileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const textarea = document.getElementById('import-json-textarea');
        if (textarea) textarea.value = text;
        try {
          const parsed = JSON.parse(text);
          const nameInput = document.getElementById('import-preset-name');
          if (nameInput) {
            if (Array.isArray(parsed) || parsed.presets) {
              nameInput.value = `ชุดโปรไฟล์นำเข้า (${(parsed.presets || parsed).length} รายการ)`;
            } else if (parsed.name) {
              nameInput.value = parsed.name;
            } else {
              nameInput.value = file.name.replace(/\.json$/i, '');
            }
          }
        } catch(err) {}
      };
      reader.readAsText(file);
    };
  }

  // Save client modal buttons & form
  const btnSaveClientClose = document.getElementById('save-client-modal-close-btn');
  if (btnSaveClientClose) btnSaveClientClose.onclick = closeSaveClientPresetModal;

  const btnSaveClientCancel = document.getElementById('save-client-modal-cancel');
  if (btnSaveClientCancel) btnSaveClientCancel.onclick = closeSaveClientPresetModal;

  const saveClientForm = document.getElementById('save-client-preset-form');
  if (saveClientForm) saveClientForm.onsubmit = handleSaveClientPresetSubmit;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPresetsEventListeners);
} else {
  setupPresetsEventListeners();
}

// Initial fetch presets
fetchPresets();


// ==========================================================================
// CARD WHITELIST MODAL & CONTROLLER
// ==========================================================================
let activeWLProfileId = null;
let activeWLItems = [];
let activeWLViewMode = 'chips'; // 'chips' or 'text'

async function openCardWhitelistModal(profileId) {
  activeWLProfileId = profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  if (!profile) return;

  const modal = document.getElementById('card-whitelist-modal');
  const subtitleEl = document.getElementById('card-wl-subtitle');
  const bannerEl = document.getElementById('card-wl-banner');
  const statusTextEl = document.getElementById('card-wl-status-text');
  const copyPanel = document.getElementById('card-wl-copy-panel');
  const inputEl = document.getElementById('card-wl-input');

  if (copyPanel) copyPanel.style.display = 'none';
  if (inputEl) inputEl.value = '';

  activeWLViewMode = 'chips';
  updateWLViewModeUI();

  if (subtitleEl) {
    subtitleEl.innerText = `จอ: ${profile.name} (${profile.account || 'No account'}) • Port: ${profile.debugPort || '--'}`;
  }

  if (statusTextEl) {
    statusTextEl.innerText = '⏳ กำลังดึงข้อมูล Whitelist จากจอเกม...';
  }

  // Open modal first with loading state
  if (modal) modal.classList.add('active');

  try {
    const res = await fetch(`${API_BASE}/api/profiles/${profileId}/whitelist`);
    const data = await res.json();
    if (data.success) {
      activeWLItems = Array.isArray(data.items) ? data.items : [];
      if (statusTextEl) {
        if (data.isOnline) {
          statusTextEl.innerHTML = `🟢 <b>ออนไลน์</b> (Port ${profile.debugPort}) — ซิงค์ข้อมูล Real-time กับเกมสด`;
          if (bannerEl) bannerEl.style.background = 'rgba(16, 185, 129, 0.12)';
          if (bannerEl) bannerEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          if (bannerEl) bannerEl.style.color = '#a7f3d0';
        } else {
          statusTextEl.innerHTML = `⚪ <b>ออฟไลน์</b> — ข้อมูลบันทึกไว้ในโปรไฟล์ (จะอัปเดตเมื่อเปิดจอ)`;
          if (bannerEl) bannerEl.style.background = 'rgba(148, 163, 184, 0.1)';
          if (bannerEl) bannerEl.style.borderColor = 'rgba(148, 163, 184, 0.25)';
          if (bannerEl) bannerEl.style.color = '#cbd5e1';
        }
      }
    } else {
      activeWLItems = (profile.whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
      if (statusTextEl) statusTextEl.innerText = '⚠️ ใช้ข้อมูลจากโปรไฟล์เครื่อง';
    }
  } catch(e) {
    console.warn('Fetch whitelist error:', e);
    activeWLItems = (profile.whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
    if (statusTextEl) statusTextEl.innerText = '⚠️ ใช้ข้อมูลแคชในตัว';
  }

  renderCardWhitelistChips();
}

function closeCardWhitelistModal() {
  const modal = document.getElementById('card-whitelist-modal');
  if (modal) modal.classList.remove('active');
  const copyPanel = document.getElementById('card-wl-copy-panel');
  if (copyPanel) copyPanel.style.display = 'none';
  activeWLProfileId = null;
  activeWLItems = [];
}

function renderCardWhitelistChips() {
  const container = document.getElementById('card-wl-chips-container');
  const textarea = document.getElementById('card-wl-textarea');
  const countBadge = document.getElementById('card-wl-count-badge');

  if (countBadge) {
    countBadge.innerText = `${activeWLItems.length} รายการ`;
  }

  if (textarea) {
    textarea.value = activeWLItems.join(', ');
  }

  if (!container) return;

  if (activeWLItems.length === 0) {
    container.innerHTML = `
      <div class="wl-empty-msg">
        <span style="font-size: 24px; opacity: 0.6;">📦</span>
        <span>ไม่มีไอเทมใน Whitelist (บอทจะขายทุกชิ้นตามเกณฑ์ความหายาก)</span>
        <span style="font-size: 11px; opacity: 0.7;">พิมพ์ชื่อไอเทมด้านบนแล้วกด "➕ เพิ่ม" หรือกด "📥 นำเข้า"</span>
      </div>
    `;
    return;
  }

  container.innerHTML = activeWLItems.map((item, idx) => `
    <div class="wl-chip" title="${escapeHTML(item)}">
      <span class="wl-chip-icon">🛡️</span>
      <span class="wl-chip-text">${escapeHTML(item)}</span>
      <span class="wl-chip-del" onclick="removeCardWhitelistItem(${idx})" title="ลบออกจาก Whitelist">&times;</span>
    </div>
  `).join('');
}

function addCardWhitelistItems(inputStr) {
  if (!inputStr || !inputStr.trim()) return;
  const parts = inputStr.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  let addedCount = 0;

  parts.forEach(name => {
    const exists = activeWLItems.some(existing => existing.toLowerCase() === name.toLowerCase());
    if (!exists) {
      activeWLItems.push(name);
      addedCount++;
    }
  });

  renderCardWhitelistChips();
  return addedCount;
}

function removeCardWhitelistItem(idx) {
  if (idx >= 0 && idx < activeWLItems.length) {
    activeWLItems.splice(idx, 1);
    renderCardWhitelistChips();
  }
}

function updateWLViewModeUI() {
  const chipsContainer = document.getElementById('card-wl-chips-container');
  const textContainer = document.getElementById('card-wl-text-container');
  const viewLabel = document.getElementById('card-wl-view-label');
  const textarea = document.getElementById('card-wl-textarea');

  if (activeWLViewMode === 'chips') {
    if (chipsContainer) chipsContainer.style.display = 'flex';
    if (textContainer) textContainer.style.display = 'none';
    if (viewLabel) viewLabel.innerText = '📝 Text Mode';
  } else {
    if (chipsContainer) chipsContainer.style.display = 'none';
    if (textContainer) textContainer.style.display = 'block';
    if (viewLabel) viewLabel.innerText = '🏷️ Tags Mode';
    if (textarea) textarea.value = activeWLItems.join(', ');
  }
}

function toggleCardWhitelistViewMode() {
  const textarea = document.getElementById('card-wl-textarea');
  if (activeWLViewMode === 'chips') {
    activeWLViewMode = 'text';
    if (textarea) textarea.value = activeWLItems.join(', ');
  } else {
    if (textarea) {
      const parts = textarea.value.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const unique = [];
      parts.forEach(p => {
        if (!unique.some(u => u.toLowerCase() === p.toLowerCase())) {
          unique.push(p);
        }
      });
      activeWLItems = unique;
    }
    activeWLViewMode = 'chips';
  }
  updateWLViewModeUI();
  renderCardWhitelistChips();
}

function handleCardWhitelistImport() {
  const fileInput = document.getElementById('card-wl-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function handleCardWhitelistExport() {
  if (activeWLItems.length === 0) {
    alert('Whitelist ว่างเปล่า ไม่มีรายการให้ส่งออก');
    return;
  }
  const profile = currentProfiles.find(p => p.id === activeWLProfileId);
  const text = activeWLItems.join(', ');

  // 1. Copy to clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // 2. Download as text file
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (profile?.name || 'profile').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F]/g, '_');
  a.download = `whitelist_${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert(`📤 ส่งออกเรียบร้อย!\n- คัดลอก ${activeWLItems.length} รายการลงคลิปบอร์ดแล้ว\n- ดาวน์โหลดไฟล์ ${a.download} เรียบร้อยแล้ว`);
}

function toggleCardWhitelistCopyPanel() {
  const panel = document.getElementById('card-wl-copy-panel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none' || !panel.style.display;
  if (isHidden) {
    populateWLCopyTargetList();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

function populateWLCopyTargetList() {
  const container = document.getElementById('card-wl-target-clients-list');
  if (!container) return;

  const targets = currentProfiles.filter(p => p.id !== activeWLProfileId);
  if (targets.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">ไม่มีจออื่นในระบบให้คัดลอก</div>';
    return;
  }

  container.innerHTML = targets.map(p => `
    <label class="wl-target-client-item">
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" class="wl-target-checkbox" value="${p.id}" checked style="width: 14px; height: 14px; cursor: pointer;">
        <span style="font-size: 12px; font-weight: 600; color: #f8fafc;">${escapeHTML(p.name)}</span>
        <span style="font-size: 11px; color: #94a3b8;">(${escapeHTML(p.charClass || 'Archer')})</span>
        <span style="font-size: 10px; color: #64748b;">Port: ${p.debugPort || '--'}</span>
      </div>
      <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; ${p.isRunning ? 'background: rgba(34,197,94,0.18); color: #4ade80; border: 1px solid rgba(34,197,94,0.3);' : 'background: rgba(148,163,184,0.12); color: #94a3b8; border: 1px solid rgba(148,163,184,0.2);'}">
        ${p.isRunning ? '🟢 ออนไลน์' : '⚪ ออฟไลน์'}
      </span>
    </label>
  `).join('');
}

async function executeCardWhitelistCopyToTargets() {
  if (!activeWLProfileId) return;
  const checkboxes = document.querySelectorAll('.wl-target-checkbox:checked');
  const targetIds = Array.from(checkboxes).map(cb => cb.value);

  if (targetIds.length === 0) {
    alert('กรุณาเลือกจอเป้าหมายอย่างน้อย 1 จอ');
    return;
  }

  if (activeWLViewMode === 'text') {
    const textarea = document.getElementById('card-wl-textarea');
    if (textarea) {
      activeWLItems = textarea.value.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    }
  }

  const execBtn = document.getElementById('btn-card-wl-copy-execute');
  const originalText = execBtn ? execBtn.innerHTML : '';
  if (execBtn) {
    execBtn.disabled = true;
    execBtn.innerHTML = '⏳ กำลังคัดลอก...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/profiles/${activeWLProfileId}/whitelist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whitelist: activeWLItems.join(', '),
        targets: targetIds
      })
    });
    const result = await res.json();
    if (result.success) {
      alert(`🚀 ${result.message || 'คัดลอก Whitelist สำเร็จแล้ว!'}`);
      const panel = document.getElementById('card-wl-copy-panel');
      if (panel) panel.style.display = 'none';
      fetchProfiles();
    } else {
      alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถคัดลอกได้'));
    }
  } catch(e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    if (execBtn) {
      execBtn.disabled = false;
      execBtn.innerHTML = originalText;
    }
  }
}

async function saveCardWhitelist() {
  if (!activeWLProfileId) return;

  if (activeWLViewMode === 'text') {
    const textarea = document.getElementById('card-wl-textarea');
    if (textarea) {
      const parts = textarea.value.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const unique = [];
      parts.forEach(p => {
        if (!unique.some(u => u.toLowerCase() === p.toLowerCase())) {
          unique.push(p);
        }
      });
      activeWLItems = unique;
    }
  }

  const saveBtn = document.getElementById('btn-card-wl-save');
  const originalText = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ กำลังบันทึก...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/profiles/${activeWLProfileId}/whitelist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whitelist: activeWLItems.join(', ')
      })
    });
    const result = await res.json();
    if (result.success) {
      alert('💾 บันทึก Whitelist สำเร็จและอัปเดตเข้าจอเกมเรียบร้อยแล้ว!');
      closeCardWhitelistModal();
      fetchProfiles();
    } else {
      alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถบันทึกได้'));
    }
  } catch(e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }
  }
}

function setupCardWhitelistEventListeners() {
  const btnClose = document.getElementById('card-wl-modal-close-btn');
  if (btnClose) btnClose.onclick = closeCardWhitelistModal;

  const btnCancel = document.getElementById('card-wl-modal-cancel');
  if (btnCancel) btnCancel.onclick = closeCardWhitelistModal;

  const inputEl = document.getElementById('card-wl-input');
  const btnAdd = document.getElementById('btn-card-wl-add');
  const handleAdd = () => {
    if (inputEl && inputEl.value.trim()) {
      addCardWhitelistItems(inputEl.value);
      inputEl.value = '';
      inputEl.focus();
    }
  };
  if (btnAdd) btnAdd.onclick = handleAdd;
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    };
  }

  const btnToggleView = document.getElementById('btn-card-wl-toggle-view');
  if (btnToggleView) btnToggleView.onclick = toggleCardWhitelistViewMode;

  const btnImport = document.getElementById('btn-card-wl-import');
  if (btnImport) btnImport.onclick = handleCardWhitelistImport;

  const fileInput = document.getElementById('card-wl-file-input');
  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        let importedItems = [];
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            importedItems = parsed.map(String);
          } else if (parsed.whitelist) {
            importedItems = String(parsed.whitelist).split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
          } else if (parsed.items && Array.isArray(parsed.items)) {
            importedItems = parsed.items.map(String);
          }
        } catch(err) {
          importedItems = content.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
        }

        if (importedItems.length === 0) {
          alert('ไม่พบรายการไอเทมในไฟล์ที่เลือก');
          return;
        }

        const isReplace = confirm(`พบรายการไอเทมทั้งหมด ${importedItems.length} รายการ\n\nต้องการ "แทนที่ทั้งหมด (Replace)" หรือไม่?\n[OK] = แทนที่ทั้งหมด\n[Cancel] = เพิ่มต่อท้าย (Append)`);
        if (isReplace) {
          activeWLItems = [];
        }

        importedItems.forEach(name => {
          name = name.trim();
          if (name && !activeWLItems.some(existing => existing.toLowerCase() === name.toLowerCase())) {
            activeWLItems.push(name);
          }
        });

        renderCardWhitelistChips();
        alert(`📥 นำเข้าเรียบร้อย! ตอนนี้มีทั้งหมด ${activeWLItems.length} รายการ`);
      };
      reader.readAsText(file);
    };
  }

  const btnExport = document.getElementById('btn-card-wl-export');
  if (btnExport) btnExport.onclick = handleCardWhitelistExport;

  const btnCopyTo = document.getElementById('btn-card-wl-copy-to');
  if (btnCopyTo) btnCopyTo.onclick = toggleCardWhitelistCopyPanel;

  const btnCopyCancel = document.getElementById('btn-card-wl-copy-cancel');
  if (btnCopyCancel) btnCopyCancel.onclick = () => {
    const panel = document.getElementById('card-wl-copy-panel');
    if (panel) panel.style.display = 'none';
  };

  const btnCopySelectAll = document.getElementById('btn-card-wl-copy-select-all');
  if (btnCopySelectAll) btnCopySelectAll.onclick = () => {
    document.querySelectorAll('.wl-target-checkbox').forEach(cb => cb.checked = true);
  };

  const btnCopyClearAll = document.getElementById('btn-card-wl-copy-clear-all');
  if (btnCopyClearAll) btnCopyClearAll.onclick = () => {
    document.querySelectorAll('.wl-target-checkbox').forEach(cb => cb.checked = false);
  };

  const btnCopyExec = document.getElementById('btn-card-wl-copy-execute');
  if (btnCopyExec) btnCopyExec.onclick = executeCardWhitelistCopyToTargets;

  const btnClearAll = document.getElementById('btn-card-wl-clear-all');
  if (btnClearAll) {
    btnClearAll.onclick = () => {
      if (activeWLItems.length === 0) return;
      if (confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างรายการ Whitelist ทั้งหมดสำหรับจอนี้?')) {
        activeWLItems = [];
        renderCardWhitelistChips();
      }
    };
  }

  const btnSave = document.getElementById('btn-card-wl-save');
  if (btnSave) btnSave.onclick = saveCardWhitelist;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCardWhitelistEventListeners);
} else {
  setupCardWhitelistEventListeners();
}
