// manager/public/patcher_module.js — Game Patcher, Script Installer & Auto-Updater Client Logic
(function() {
  'use strict';

  function initGamePatcher() {
    const btnOpen = document.getElementById('btn-game-patcher');
    const modal = document.getElementById('modal-game-patcher');
    const btnClose = document.getElementById('btn-patcher-close');
    const btnCancel = document.getElementById('btn-patcher-cancel');
    const pathInput = document.getElementById('game-patcher-path-input');
    const btnAutoDetect = document.getElementById('btn-patcher-autodetect');
    const btnBrowse = document.getElementById('btn-patcher-browse');
    const btnCheck = document.getElementById('btn-patcher-check');
    const btnInstall = document.getElementById('btn-patcher-install');
    const btnRestore = document.getElementById('btn-patcher-restore');
    const badge = document.getElementById('game-patcher-status-badge');
    const msgBox = document.getElementById('patcher-msg-box');

    const cardGameStatus = document.getElementById('patcher-card-game-status');
    const cardLoaderStatus = document.getElementById('patcher-card-loader-status');
    const cardBotStatus = document.getElementById('patcher-card-bot-status');
    const cardBackupStatus = document.getElementById('patcher-card-backup-status');

    const ghCommit = document.getElementById('patcher-github-commit');
    const ghDate = document.getElementById('patcher-github-date');

    if (!btnOpen || !modal) return;

    let defaultGamePath = '';

    function showMsg(text, isError = false) {
      if (!msgBox) return;
      msgBox.style.display = 'block';
      msgBox.style.background = isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
      msgBox.style.borderColor = isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)';
      msgBox.style.color = isError ? '#f87171' : '#34d399';
      msgBox.innerHTML = (isError ? '⚠️ ' : '✅ ') + text;
    }

    async function fetchStatus(overridePath = '') {
      try {
        const url = overridePath ? `/api/game-install/status?path=${encodeURIComponent(overridePath)}` : '/api/game-install/status';
        const res = await fetch(url);
        const data = await res.json();

        if (!data || !data.success) {
          showMsg('ไม่สามารถอ่านสถานะตัวเกมได้: ' + (data.error || 'Unknown error'), true);
          return;
        }

        defaultGamePath = data.defaultPath || '';
        if (pathInput && (!pathInput.value || !overridePath)) {
          pathInput.value = data.gamePath || defaultGamePath;
        }

        // 1. Game folder status
        if (cardGameStatus) {
          if (data.isValidFolder) {
            cardGameStatus.innerText = '✅ พบโฟลเดอร์ตัวเกม';
            cardGameStatus.style.color = '#34d399';
          } else {
            cardGameStatus.innerText = '❌ ไม่พบตัวเกมในโฟลเดอร์นี้';
            cardGameStatus.style.color = '#f87171';
          }
        }

        // 2. Loader status
        if (cardLoaderStatus) {
          if (data.isInstalled) {
            cardLoaderStatus.innerText = `✅ ติดตั้งแล้ว (v${data.loaderVersion || '1.0.2'})`;
            cardLoaderStatus.style.color = '#34d399';
          } else {
            cardLoaderStatus.innerText = '⚠️ ยังไม่ได้ติดตั้ง Loader';
            cardLoaderStatus.style.color = '#fbbf24';
          }
        }

        // 3. Bot script status
        if (cardBotStatus) {
          if (data.isInstalled && data.isUpToDate) {
            cardBotStatus.innerText = '✅ เวอร์ชันล่าสุด (Up-to-date)';
            cardBotStatus.style.color = '#34d399';
          } else if (data.isInstalled && !data.isUpToDate) {
            cardBotStatus.innerText = '⚡ ตรวจพบอัปเดตใหม่!';
            cardBotStatus.style.color = '#fbbf24';
          } else {
            cardBotStatus.innerText = '❌ ยังไม่ได้ติดตั้ง bot.js';
            cardBotStatus.style.color = '#f87171';
          }
        }

        // 4. Backup status
        if (cardBackupStatus) {
          if (data.hasBackup) {
            cardBackupStatus.innerText = '🛡️ มีไฟล์สำรองพร้อมกู้คืน';
            cardBackupStatus.style.color = '#34d399';
          } else {
            cardBackupStatus.innerText = 'ยังไม่มีไฟล์สำรอง';
            cardBackupStatus.style.color = '#94a3b8';
          }
        }

        // Update header badge
        if (badge) {
          if (data.isInstalled && data.isUpToDate) {
            badge.innerText = '✅ ติดตั้งแล้ว';
            badge.style.background = '#10b981';
          } else if (data.isInstalled && !data.isUpToDate) {
            badge.innerText = '⚡ มีอัปเดต';
            badge.style.background = '#f59e0b';
          } else {
            badge.innerText = '⚠️ ยังไม่ติดตั้ง';
            badge.style.background = '#ef4444';
          }
        }

      } catch (e) {
        console.error('[Patcher] Failed to fetch status:', e);
      }
    }

    async function checkGitHub() {
      try {
        const res = await fetch('/api/game-install/manager-update');
        const data = await res.json();
        if (data && data.success) {
          if (ghCommit) ghCommit.innerText = `Commit: ${data.latestCommit}`;
          if (ghDate) ghDate.innerText = `${new Date(data.commitDate).toLocaleString('th-TH')}`;
        } else {
          if (ghCommit) ghCommit.innerText = 'เชื่อมต่อ GitHub ปกติ';
        }
      } catch (e) {
        if (ghCommit) ghCommit.innerText = 'ออฟไลน์';
      }
    }

    // Event Listeners
    btnOpen.addEventListener('click', () => {
      modal.style.display = 'flex';
      fetchStatus(pathInput.value);
      checkGitHub();
    });

    const closeModal = () => { modal.style.display = 'none'; };
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    if (btnAutoDetect) {
      btnAutoDetect.addEventListener('click', () => {
        if (defaultGamePath) {
          pathInput.value = defaultGamePath;
          fetchStatus(defaultGamePath);
          showMsg('ตั้งค่าเป็นโฟลเดอร์เริ่มต้นของ Windows แล้ว');
        }
      });
    }

    if (btnBrowse) {
      btnBrowse.addEventListener('click', async () => {
        try {
          btnBrowse.innerText = '⏳ กำลังเลือก...';
          const res = await fetch('/api/game-install/browse', { method: 'POST' });
          const data = await res.json();
          btnBrowse.innerText = '📂 Browse...';
          if (data && data.success && data.path) {
            pathInput.value = data.path;
            fetchStatus(data.path);
            showMsg(`เลือกโฟลเดอร์: ${data.path}`);
          }
        } catch (e) {
          btnBrowse.innerText = '📂 Browse...';
          alert('เกิดข้อผิดพลาดในการเปิด File Dialog: ' + e.message);
        }
      });
    }

    if (btnCheck) {
      btnCheck.addEventListener('click', () => {
        fetchStatus(pathInput.value);
      });
    }

    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        const targetPath = (pathInput ? pathInput.value : '').trim();
        if (!targetPath) {
          alert('กรุณาระบุโฟลเดอร์ตัวเกมก่อนกดติดตั้ง');
          return;
        }

        try {
          btnInstall.disabled = true;
          btnInstall.innerText = '⏳ กำลังติดตั้งและอัปเดตสคริปต์...';

          const res = await fetch('/api/game-install/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gamePath: targetPath })
          });
          const data = await res.json();

          btnInstall.disabled = false;
          btnInstall.innerText = '🚀 ติดตั้ง / อัปเดตสคริปต์ลงตัวเกมทันที';

          if (data && data.success) {
            showMsg('🎉 ติดตั้งและอัปเดตสคริปต์ Pelican ลงในตัวเกมเรียบร้อยแล้ว! พร้อมเข้าเกมได้ทันที');
            fetchStatus(targetPath);
          } else {
            showMsg('❌ ติดตั้งไม่สำเร็จ: ' + (data.error || 'Unknown error'), true);
          }
        } catch (e) {
          btnInstall.disabled = false;
          btnInstall.innerText = '🚀 ติดตั้ง / อัปเดตสคริปต์ลงตัวเกมทันที';
          showMsg('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + e.message, true);
        }
      });
    }

    if (btnRestore) {
      btnRestore.addEventListener('click', async () => {
        const confirmRestore = confirm('คุณแน่ใจหรือไม่ว่าต้องการกู้คืนไฟล์เกมดั้งเดิม (ลบตัวโหลด Pelican และกู้คืน app.asar)?');
        if (!confirmRestore) return;

        const targetPath = (pathInput ? pathInput.value : '').trim();
        try {
          btnRestore.disabled = true;
          btnRestore.innerText = '⏳ กำลังกู้คืน...';

          const res = await fetch('/api/game-install/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gamePath: targetPath })
          });
          const data = await res.json();

          btnRestore.disabled = false;
          btnRestore.innerText = '🔄 กู้คืนไฟล์เกมเดิม (Restore)';

          if (data && data.success) {
            showMsg('กู้คืนไฟล์เกมเดิมเรียบร้อยแล้ว');
            fetchStatus(targetPath);
          } else {
            showMsg('❌ กู้คืนไม่สำเร็จ: ' + (data.error || 'Unknown error'), true);
          }
        } catch (e) {
          btnRestore.disabled = false;
          btnRestore.innerText = '🔄 กู้คืนไฟล์เกมเดิม (Restore)';
          showMsg('❌ เกิดข้อผิดพลาด: ' + e.message, true);
        }
      });
    }

    // Initial background check
    fetchStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamePatcher);
  } else {
    initGamePatcher();
  }
})();
