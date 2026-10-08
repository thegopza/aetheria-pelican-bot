let currentProfiles = [];
let pollingTimer = null;

const API_BASE = "";

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
const planAutoLoop = document.getElementById("plan-auto-loop");

async function fetchProfiles() {
  try {
    const res = await fetch(`${API_BASE}/api/profiles`);
    const data = await res.json();
    if (data.success) {
      currentProfiles = data.profiles;
      renderProfiles();
      updateMetrics();
    }
  } catch (err) {
    console.error("Failed to fetch profiles:", err);
  }
}

function updateMetrics() {
  totalEl.innerText = currentProfiles.length;
  const onlineCount = currentProfiles.filter(p => p.isRunning).length;
  onlineEl.innerText = onlineCount;

  const farmingCount = currentProfiles.filter(p => p.liveState && (p.liveState.autoLoop || p.liveState.isBotRunning)).length;
  farmingEl.innerText = farmingCount;
}

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
    const state = p.liveState;
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
          activityText = "🟢 ยืนรอ / แสตนด์บาย";
          activityColor = "#34d399";
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
          <div class="card-badges">
            <span class="class-badge">${escapeHTML(curClass)}${curLevels ? ` (${escapeHTML(curLevels.split('\n')[0].replace('Base ', ''))})` : ''}</span>
            <span class="port-badge">PORT: ${p.debugPort || 49876}</span>
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

        <div class="card-footer">
          ${isOnline ? `
            <button class="btn btn-danger btn-launch" onclick="stopClient('${p.id}')">
              <span>⏹️</span> ปิดจอ ${p.pid ? `(PID: ${p.pid})` : ''}
            </button>
          ` : `
            <button class="btn btn-success btn-launch" onclick="launchClient('${p.id}')">
              <span>▶️</span> เปิดจอเกม
            </button>
          `}
          <button class="btn btn-primary" onclick="openScriptPlanModal('${p.id}')" title="ตั้งค่าแผนการเล่น (Script Plan)" style="background: linear-gradient(135deg, #6366f1, #4f46e5); font-size: 12px; padding: 7px 11px;">
            <span>📜</span> Plan
          </button>
          <button class="btn btn-secondary" onclick="openEditModal('${p.id}')" title="แก้ไขการตั้งค่า">
            <span>⚙️</span>
          </button>
          ${!p.isMain ? `
            <button class="btn btn-secondary" onclick="deleteProfile('${p.id}')" title="ลบโปรไฟล์">
              <span>🗑️</span>
            </button>
          ` : ''}
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

// Client Actions
async function launchClient(id) {
  const btn = event?.currentTarget;
  if (btn) btn.innerText = "⏳ กำลังเปิด...";
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

// Modal Handling
function openAddModal() {
  formId.value = "";
  formName.value = `Client ${currentProfiles.length + 1}`;
  formAccount.value = "";
  formClass.value = "Hunter";
  formMap.value = "ถนนต้นหลิว";
  const maxPort = Math.max(49875, ...currentProfiles.map(p => p.debugPort || 49876));
  formPort.value = maxPort + 1;
  formNotes.value = "";

  modalTitle.innerText = "➕ เพิ่มโปรไฟล์จอใหม่";
  modalEl.classList.add("active");
}

function openEditModal(id) {
  const p = currentProfiles.find(x => x.id === id);
  if (!p) return;

  formId.value = p.id;
  formName.value = p.name;
  formAccount.value = p.account || "";
  formClass.value = p.charClass || "Hunter";
  formMap.value = p.targetMap || "ถนนต้นหลิว";
  formPort.value = p.debugPort || 49876;
  formNotes.value = p.notes || "";

  modalTitle.innerText = `⚙️ แก้ไขโปรไฟล์: ${p.name}`;
  modalEl.classList.add("active");
}

document.getElementById("modal-close-btn").onclick = () => modalEl.classList.remove("active");
document.getElementById("modal-cancel-btn").onclick = () => modalEl.classList.remove("active");

profileForm.onsubmit = async (e) => {
  e.preventDefault();
  const id = formId.value;
  const payload = {
    name: formName.value,
    account: formAccount.value,
    charClass: formClass.value,
    targetMap: formMap.value,
    debugPort: parseInt(formPort.value, 10),
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
    alert("เกิดข้อผิดพลาดในการบันทึกโปรไฟล์");
  }
};

async function deleteProfile(id) {
  const p = currentProfiles.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`ยืนยันลบโปรไฟล์ "${p.name}" ออกจากระบบ?\n(ข้อมูลโฟลเดอร์เซสชันจะยังคงอยู่)`)) return;

  try {
    await fetch(`${API_BASE}/api/profiles/${id}`, { method: "DELETE" });
    fetchProfiles();
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการลบโปรไฟล์");
  }
}

// ==========================================
// SCRIPT PLAN MODAL LOGIC
// ==========================================
async function openScriptPlanModal(id) {
  const p = currentProfiles.find(x => x.id === id);
  if (!p) return;

  planProfileId.value = id;
  document.getElementById("plan-modal-title").innerText = `📜 ตั้งค่าแผนการเล่น (Script Plan): ${p.name}`;

  // Fetch saved plan if any
  try {
    const res = await fetch(`${API_BASE}/api/plans/${id}`);
    const data = await res.json();
    const plan = data.plan || {};

    planNameInput.value = plan.name || `ลูปฟาร์ม 24 ชม. - ${p.name}`;
    planModeSelect.value = plan.mode || "farm_loop";
    planMapSelect.value = plan.targetMap || p.targetMap || "ซากโบราณสถาน";
    planAmmoMin.value = plan.minAmmo || 100;
    planWeightMax.value = plan.maxWeight || 70;
    planAutoLoop.checked = plan.autoLoop !== false;
  } catch (err) {
    planNameInput.value = `ลูปฟาร์ม 24 ชม. - ${p.name}`;
    planMapSelect.value = p.targetMap || "ซากโบราณสถาน";
  }

  planModalEl.classList.add("active");
}

document.getElementById("plan-modal-close-btn").onclick = () => planModalEl.classList.remove("active");
document.getElementById("plan-modal-cancel-btn").onclick = () => planModalEl.classList.remove("active");

document.getElementById("plan-modal-apply-btn").onclick = async () => {
  const id = planProfileId.value;
  if (!id) return;

  const payload = {
    name: planNameInput.value.trim(),
    mode: planModeSelect.value,
    targetMap: planMapSelect.value,
    minAmmo: parseInt(planAmmoMin.value, 10) || 100,
    maxWeight: parseInt(planWeightMax.value, 10) || 70,
    autoLoop: planAutoLoop.checked
  };

  try {
    const res = await fetch(`${API_BASE}/api/plans/${id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert("✅ บันทึกและนำแผนการเล่นไปใช้กับตัวละครเรียบร้อยแล้ว!");
      planModalEl.classList.remove("active");
      fetchProfiles();
    } else {
      alert("❌ เกิดข้อผิดพลาด: " + (data.error || ""));
    }
  } catch (err) {
    alert("❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
  }
};

// Initial Load & 2s Polling
fetchProfiles();
pollingTimer = setInterval(fetchProfiles, 2000);
