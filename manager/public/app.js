let currentProfiles = [];
let pollingTimer = null;

const API_BASE = "";

// DOM Elements
const gridEl = document.getElementById("profiles-grid");
const totalEl = document.getElementById("metric-total-profiles");
const onlineEl = document.getElementById("metric-online-profiles");
const farmingEl = document.getElementById("metric-farming-profiles");

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

  const farmingCount = currentProfiles.filter(p => p.liveState && p.liveState.autoLoop).length;
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
    const curMap = state && state.map ? state.map : p.targetMap;
    const curAmmo = state && typeof state.ammo === 'number' ? `${state.ammo.toLocaleString()} ดอก` : '--';
    const curPos = state && state.pos ? `${state.pos.x}, ${state.pos.y}` : '--';
    
    let activityText = "ออฟไลน์";
    let activityColor = "#64748b";
    if (isOnline) {
      if (state) {
        if (state.recovering) { activityText = "⚠️ กำลังชุบชีวิต"; activityColor = "#ef4444"; }
        else if (state.shopping) { activityText = "🛒 ซื้อ/ขายของที่ NPC"; activityColor = "#f59e0b"; }
        else if (state.navigating) { activityText = "🚶 กำลังเดินทางข้ามแมพ"; activityColor = "#38bdf8"; }
        else if (state.autoLoop) { activityText = "⚔️ Auto-Farm ทำงาน"; activityColor = "#10b981"; }
        else { activityText = "🟢 ยืนรอ / แสตนด์บาย"; activityColor = "#34d399"; }
      } else {
        activityText = "⏳ กำลังโหลดเกม...";
        activityColor = "#f59e0b";
      }
    }

    return `
      <div class="profile-card ${isOnline ? 'is-online' : ''}" id="card-${p.id}">
        <div class="card-header">
          <div class="profile-identity">
            <span class="status-dot ${isOnline ? 'online' : ''}"></span>
            <div>
              <div class="profile-title">${escapeHTML(p.name)}</div>
              <div class="profile-acc">${escapeHTML(p.account || 'บัญชีเริ่มต้น')}</div>
            </div>
          </div>
          <div class="card-badges">
            <span class="class-badge">${escapeHTML(p.charClass || 'Archer')}</span>
            <span class="port-badge">PORT: ${p.debugPort || 49876}</span>
          </div>
        </div>

        <div class="card-body">
          <div class="stat-item">
            <span class="stat-lbl">แมพปัจจุบัน:</span>
            <span class="stat-val" style="color: #38bdf8;">${escapeHTML(curMap)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-lbl">พิกัด (Coords):</span>
            <span class="stat-val">${curPos}</span>
          </div>
          <div class="stat-item">
            <span class="stat-lbl">จำนวนลูกธนู:</span>
            <span class="stat-val" style="color: #00ffcc;">${curAmmo}</span>
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
              <span>⏹️</span> ปิดจอ (PID: ${p.pid})
            </button>
          ` : `
            <button class="btn btn-success btn-launch" onclick="launchClient('${p.id}')">
              <span>▶️</span> เปิดจอเกม
            </button>
          `}
          <button class="btn btn-secondary" onclick="openEditModal('${p.id}')" title="แก้ไขการตั้งค่า">
            <span>⚙️</span>
          </button>
          <button class="btn btn-secondary" onclick="deleteProfile('${p.id}')" title="ลบโปรไฟล์">
            <span>🗑️</span>
          </button>
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

  modalTitle.innerText = "⚙️ แก้ไขการตั้งค่าโปรไฟล์";
  modalEl.classList.add("active");
}

function closeModal() {
  modalEl.classList.remove("active");
}

document.getElementById("btn-add-profile").onclick = openAddModal;
document.getElementById("modal-close-btn").onclick = closeModal;
document.getElementById("modal-cancel-btn").onclick = closeModal;

profileForm.onsubmit = async (e) => {
  e.preventDefault();
  const id = formId.value;
  const payload = {
    name: formName.value,
    account: formAccount.value,
    charClass: formClass.value,
    targetMap: formMap.value,
    debugPort: parseInt(formPort.value) || 49876,
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
    closeModal();
    fetchProfiles();
  } catch (err) {
    alert("❌ ไม่สามารถบันทึกข้อมูลได้");
  }
};

async function deleteProfile(id) {
  if (confirm("ยืนยันต้องการลบโปรไฟล์นี้?")) {
    await fetch(`${API_BASE}/api/profiles/${id}`, { method: "DELETE" });
    fetchProfiles();
  }
}

// Initial Load & Auto-polling
fetchProfiles();
pollingTimer = setInterval(fetchProfiles, 2500);
