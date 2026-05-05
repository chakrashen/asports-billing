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
const navMap = {
  'btn-invoice': 'invoice.html',
  'btn-order': 'order.html',
  'btn-update': 'bill.html',
  'btn-history': 'dashboard.html',
  'btn-ledger': 'ledger.html',
  'btn-stock': 'supplier_ledger.html'
};

Object.entries(navMap).forEach(([id, url]) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', () => {
      console.log(`Navigating to ${url}...`);
      window.location.href = url;
    });
  } else {
    console.warn(`Element with ID ${id} not found.`);
  }
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
