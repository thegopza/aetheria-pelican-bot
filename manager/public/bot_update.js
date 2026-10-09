// manager/public/bot_update.js — header pill + panel for automatic bot.js updates from GitHub
(function () {
  'use strict';

  const STATE_LABEL = {
    'up-to-date': ['✅', 'ล่าสุดแล้ว'],
    done: ['✅', 'อัปเดตแล้ว'],
    outdated: ['⚠️', 'มีเวอร์ชันใหม่'],
    waiting: ['⏳', 'รอจังหวะ'],
    reloading: ['🔄', 'กำลังรีเฟรช'],
    resuming: ['▶️', 'รอบอททำงานต่อ'],
    error: ['❌', 'มีปัญหา']
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const ago = ts => {
    if (!ts) return '--';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'เมื่อสักครู่';
    if (m < 60) return `${m} นาทีที่แล้ว`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} ชม.ที่แล้ว` : `${Math.round(h / 24)} วันที่แล้ว`;
  };

  let status = null;
  let pill = null;
  let panel = null;

  function mount() {
    const actions = document.querySelector('.header-actions');
    if (!actions || pill) return;
    const wrap = document.createElement('div');
    wrap.className = 'bu-wrap';
    wrap.innerHTML = `
      <button type="button" class="btn btn-ghost bu-pill" title="อัปเดตบอทอัตโนมัติจาก GitHub">
        <span class="bu-dot"></span><span class="bu-text">Auto-update</span>
      </button>
      <div class="bu-panel" hidden></div>`;
    const refresh = document.getElementById('btn-refresh');
    actions.insertBefore(wrap, refresh || null);
    pill = wrap.querySelector('.bu-pill');
    panel = wrap.querySelector('.bu-panel');
    pill.addEventListener('click', e => { e.stopPropagation(); panel.hidden = !panel.hidden; render(); });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) panel.hidden = true; });
    panel.addEventListener('click', onPanelClick);
  }

  async function load() {
    try {
      const r = await fetch('/api/bot-update/status');
      const d = await r.json();
      if (d && d.success) { status = d; render(); }
    } catch (e) {}
  }

  async function onPanelClick(e) {
    const b = e.target.closest('[data-bu]');
    if (!b) return;
    if (b.dataset.bu === 'toggle') {
      await fetch('/api/bot-update/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !status.enabled }) });
      await load();
    } else if (b.dataset.bu === 'check') {
      b.disabled = true;
      b.textContent = '⏳ กำลังเช็ก...';
      await fetch('/api/bot-update/check', { method: 'POST' });
      setTimeout(load, 3000);
    }
  }

  function render() {
    if (!pill || !status) return;
    const clients = Object.values(status.clients || {});
    const pending = clients.filter(c => ['outdated', 'waiting', 'reloading', 'resuming'].includes(c.state)).length;
    const hasError = clients.some(c => c.state === 'error') || status.lastError;
    const tone = !status.enabled ? 'off' : hasError ? 'err' : (status.phase !== 'idle' || pending) ? 'busy' : 'ok';
    pill.className = `btn btn-ghost bu-pill ${tone}`;
    pill.querySelector('.bu-text').textContent =
      !status.enabled ? 'Auto-update ปิด'
        : status.phase === 'waiting-cdn' ? 'รอ GitHub ส่งไฟล์ใหม่'
          : pending ? `กำลังอัปเดต (${pending})`
            : 'Auto-update';

    if (panel.hidden) return;
    const l = status.latest;
    panel.innerHTML = `
      <div class="bu-head">
        <b>🔄 อัปเดตบอทอัตโนมัติ</b>
        <button type="button" class="bu-switch ${status.enabled ? 'on' : ''}" data-bu="toggle" title="เปิด/ปิด">
          <span></span>
        </button>
      </div>
      <p class="bu-desc">เช็ก GitHub ทุก ${status.pollMinutes || 5} นาที เมื่อ bot.js มีเวอร์ชันใหม่ จะรีเฟรชหน้าเกมทีละจอเฉพาะตอนที่ปลอดภัย แล้วให้บอทกลับมาทำงานต่อ</p>
      <div class="bu-latest">
        <small>bot.js ล่าสุดบน GitHub</small>
        ${l ? `<div><code>${esc(l.sha.slice(0, 7))}</code> ${esc(l.message)}</div><small>${ago(l.date)}${status.ready && status.ready.sha === l.sha ? ' · ✅ พร้อมใช้งาน' : status.phase === 'waiting-cdn' ? ' · ⏳ รอ GitHub CDN' : ''}</small>`
          : '<div class="bu-muted">ยังไม่ได้เช็ก (เช็กครั้งแรกหลังเปิด Manager 1 นาที)</div>'}
      </div>
      ${status.lastError ? `<div class="bu-error">⚠️ ${esc(status.lastError)}</div>` : ''}
      <div class="bu-clients">
        ${clients.length ? clients.map(c => {
          const [icon, label] = STATE_LABEL[c.state] || ['•', c.state];
          return `<div class="bu-client ${c.state}"><span>${icon} ${esc(c.name)}${c.version ? ` <em class="bu-ver">v${esc(c.version)}</em>` : ''}</span><small>${esc(c.note || label)}</small></div>`;
        }).join('') : '<div class="bu-muted">ยังไม่มีข้อมูลจอ</div>'}
      </div>
      <div class="bu-foot">
        <small>เช็กล่าสุด ${ago(status.lastCheckAt)}</small>
        <button type="button" class="btn btn-ghost btn-sm" data-bu="check">เช็กตอนนี้</button>
      </div>`;
  }

  mount();
  load();
  setInterval(load, 10000);
})();
