/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Home Screen Logic
   ════════════════════════════════════════════════════════════ */

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();

  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const dateEl = document.getElementById('header-date');
  const timeEl = document.getElementById('header-time');

  if (dateEl) dateEl.textContent = dateStr;
  if (timeEl) timeEl.textContent = timeStr;
}

updateClock();
setInterval(updateClock, 1000);

// ─── Navigation ─────────────────────────────────────────────
document.getElementById('btn-invoice').addEventListener('click', () => {
  window.location.href = 'invoice.html';
});

document.getElementById('btn-order').addEventListener('click', () => {
  window.location.href = 'order.html';
});

document.getElementById('btn-update').addEventListener('click', () => {
  window.location.href = 'bill.html';
});

document.getElementById('btn-history').addEventListener('click', () => {
  window.location.href = 'dashboard.html';
});

// Keyboard support
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.click();
    }
  });
});
