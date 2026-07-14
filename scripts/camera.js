/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Camera Source Selection Logic
   ════════════════════════════════════════════════════════════ */

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  const dateEl = document.getElementById('header-date');
  const timeEl = document.getElementById('header-time');
  if (dateEl) dateEl.textContent = dateStr;
  if (timeEl) timeEl.textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// ─── Navigation ─────────────────────────────────────────────
document.getElementById('btn-back').addEventListener('click', () => {
  window.location.href = 'home.html';
});

document.getElementById('btn-webcam').addEventListener('click', () => {
  window.location.href = 'camera_live.html?source=webcam';
});

document.getElementById('btn-cctv').addEventListener('click', () => {
  window.location.href = 'cctv_setup.html';
});

document.getElementById('btn-history').addEventListener('click', () => {
  window.location.href = 'camera_history.html';
});

document.getElementById('btn-wireless').addEventListener('click', () => {
  window.location.href = 'camera_wireless_setup.html';
});

document.getElementById('btn-open-folder').addEventListener('click', async () => {
  try {
    const result = await window.api.recordingOpenFolder();
    if (!result.success) {
      alert('Failed to open recordings folder: ' + result.error);
    }
  } catch (err) {
    console.error('Error opening folder:', err);
  }
});

// ─── Keyboard Support ───────────────────────────────────────
document.querySelectorAll('[role="button"]').forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
    }
  });
});
