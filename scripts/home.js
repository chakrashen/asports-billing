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

// ─── Notifications ──────────────────────────────────────────
let dueBills = [];

function getDueCategory(dueDateStr) {
  if (!dueDateStr) return 'nodate';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

function formatDueDate(dateStr) {
  if (!dateStr) return 'No date';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getDaysOverdue(dateStr) {
  if (!dateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.abs(Math.round((today - due) / (1000 * 60 * 60 * 24)));
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadNotifications() {
  try {
    const result = await window.api.getDueBillsByDate();
    if (!result.success) return;

    dueBills = result.bills;

    const overdueBills = dueBills.filter(b => getDueCategory(b.due_date) === 'overdue');
    const todayBills = dueBills.filter(b => getDueCategory(b.due_date) === 'today');
    const urgentCount = overdueBills.length + todayBills.length;

    // Update bell badge
    const badge = document.getElementById('bell-badge');
    if (urgentCount > 0) {
      badge.textContent = urgentCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }

    // Render notification panel
    refreshNotifPanel();
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

// ─── Auto-Update Notifications ──────────────────────────────
let updateState = null; // null | { status, version, percent, message }

function initUpdateListener() {
  window.api.onUpdateStatus((data) => {
    console.log('[Update]', data);
    updateState = data;

    // Show bell badge pulsing for update available
    if (data.status === 'available') {
      const badge = document.getElementById('bell-badge');
      badge.style.display = 'flex';
      // Increase badge count by 1 for update
      const current = parseInt(badge.textContent) || 0;
      badge.textContent = current + 1;
    }

    // Re-render the notification panel content
    refreshNotifPanel();
  });
}

function renderUpdateCard() {
  if (!updateState) return '';

  const { status, version, percent, message } = updateState;

  if (status === 'available') {
    return `
      <div class="notif-section-header notif-section-header--update">
        <span class="material-icons-round" style="font-size:16px;">system_update</span>
        App Update
      </div>
      <div class="notif-item notif-item--update" id="update-card">
        <div class="notif-item__icon notif-update-icon">
          <span class="material-icons-round">rocket_launch</span>
        </div>
        <div class="notif-item__content">
          <div class="notif-item__supplier">New Version ${escapeHtml(version)} Available</div>
          <div class="notif-item__meta">A new update is ready to download.</div>
          <div class="notif-update-actions">
            <button class="notif-update-btn notif-update-btn--primary" id="btn-do-update">
              <span class="material-icons-round" style="font-size:16px;">download</span>
              Update
            </button>
          </div>

        </div>
      </div>
    `;
  }

  if (status === 'downloading') {
    const pct = percent || 0;
    return `
      <div class="notif-section-header notif-section-header--update">
        <span class="material-icons-round" style="font-size:16px;">system_update</span>
        Downloading Update
      </div>
      <div class="notif-item notif-item--update" id="update-card">
        <div class="notif-item__icon notif-update-icon">
          <span class="material-icons-round notif-spin">sync</span>
        </div>
        <div class="notif-item__content">
          <div class="notif-item__supplier">Downloading Update…</div>
          <div class="notif-update-progress-wrap">
            <div class="notif-update-progress-bar">
              <div class="notif-update-progress-fill" style="width: ${pct}%;"></div>
            </div>
            <span class="notif-update-progress-text">${pct}%</span>
          </div>
        </div>
      </div>
    `;
  }

  if (status === 'ready') {
    return `
      <div class="notif-section-header notif-section-header--update">
        <span class="material-icons-round" style="font-size:16px;">check_circle</span>
        Update Ready
      </div>
      <div class="notif-item notif-item--update-ready" id="update-card">
        <div class="notif-item__icon notif-update-ready-icon">
          <span class="material-icons-round">verified</span>
        </div>
        <div class="notif-item__content">
          <div class="notif-item__supplier">Version ${escapeHtml(version)} Downloaded</div>
          <div class="notif-item__meta">Restart the app to apply the update.</div>
          <div class="notif-update-actions">
            <button class="notif-update-btn notif-update-btn--restart" id="btn-restart-update">
              <span class="material-icons-round" style="font-size:16px;">restart_alt</span>
              Restart & Update
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (status === 'error') {
    return `
      <div class="notif-item notif-item--update-error" id="update-card">
        <div class="notif-item__icon notif-update-error-icon">
          <span class="material-icons-round">error</span>
        </div>
        <div class="notif-item__content">
          <div class="notif-item__supplier">Update Failed</div>
          <div class="notif-item__meta">${escapeHtml(message || 'An error occurred while checking for updates.')}</div>
        </div>
      </div>
    `;
  }

  return '';
}

function refreshNotifPanel() {
  const body = document.getElementById('notif-body');
  const overdueBills = dueBills.filter(b => getDueCategory(b.due_date) === 'overdue');
  const todayBills = dueBills.filter(b => getDueCategory(b.due_date) === 'today');

  let html = '';

  // Update card always goes at the top
  html += renderUpdateCard();

  if (overdueBills.length === 0 && todayBills.length === 0 && !updateState) {
    body.innerHTML = `
      <div class="notif-empty">
        <span class="material-icons-round">notifications_none</span>
        <p class="notif-empty__title">All Clear!</p>
        <p class="notif-empty__sub">No overdue or due-today bills. You're all caught up.</p>
      </div>
    `;
    return;
  }

  // Overdue section
  if (overdueBills.length > 0) {
    html += `
      <div class="notif-section-header notif-section-header--overdue">
        <span class="material-icons-round" style="font-size:16px;">warning</span>
        Overdue (${overdueBills.length})
      </div>
    `;
    overdueBills.forEach(bill => {
      const days = getDaysOverdue(bill.due_date);
      html += `
        <div class="notif-item notif-item--overdue" data-bill-id="${bill.id}" onclick="window.location.href='bill_history.html?status=duedate'">
          <div class="notif-item__icon">
            <span class="material-icons-round">error_outline</span>
          </div>
          <div class="notif-item__content">
            <div class="notif-item__supplier">${escapeHtml(bill.supplier_name)}</div>
            <div class="notif-item__meta">${escapeHtml(bill.invoice_number)} • Due: ${formatDueDate(bill.due_date)}</div>
            <div class="notif-item__badge">${days} day${days !== 1 ? 's' : ''} overdue</div>
          </div>
          <div class="notif-item__amount">₹${Number(bill.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
      `;
    });
  }

  // Today section
  if (todayBills.length > 0) {
    html += `
      <div class="notif-section-header notif-section-header--today" style="${overdueBills.length > 0 ? 'margin-top: 16px;' : ''}">
        <span class="material-icons-round" style="font-size:16px;">alarm</span>
        Due Today (${todayBills.length})
      </div>
    `;
    todayBills.forEach(bill => {
      html += `
        <div class="notif-item notif-item--today" data-bill-id="${bill.id}" onclick="window.location.href='bill_history.html?status=duedate'">
          <div class="notif-item__icon">
            <span class="material-icons-round">schedule</span>
          </div>
          <div class="notif-item__content">
            <div class="notif-item__supplier">${escapeHtml(bill.supplier_name)}</div>
            <div class="notif-item__meta">${escapeHtml(bill.invoice_number)} • Due Today</div>
            <div class="notif-item__badge">Payment due today</div>
          </div>
          <div class="notif-item__amount">₹${Number(bill.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
      `;
    });
  }

  body.innerHTML = html;

  // Attach update button handlers
  const btnUpdate = document.getElementById('btn-do-update');
  if (btnUpdate) {
    btnUpdate.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnUpdate.disabled = true;
      btnUpdate.innerHTML = '<span class="material-icons-round notif-spin" style="font-size:16px;">sync</span> Starting…';
      await window.api.startUpdateDownload();
    });
  }



  const btnRestart = document.getElementById('btn-restart-update');
  if (btnRestart) {
    btnRestart.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.installUpdate();
    });
  }
}

// ─── Bell Button & Panel Controls ───────────────────────────
document.getElementById('btn-notifications').addEventListener('click', () => {
  document.getElementById('notif-overlay').classList.add('show');
});

document.getElementById('notif-close').addEventListener('click', () => {
  document.getElementById('notif-overlay').classList.remove('show');
});

// Close panel when clicking overlay background
document.getElementById('notif-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('show');
  }
});

// Close panel with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('notif-overlay').classList.remove('show');
  }
});

// Load notifications on page load
loadNotifications();

// Start listening for auto-updates
initUpdateListener();

