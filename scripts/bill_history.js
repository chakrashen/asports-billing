let allBills = [];
let allDueBills = [];
let currentStatus = 'pending';
let currentModalBillId = null;
let currentPdfPath = null;
let notifDismissed = false;

// Calendar State
let calendarDate = new Date();
let selectedDate = new Date();

// Handle initial status from URL
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('status')) {
  currentStatus = urlParams.get('status');
}

function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  document.getElementById('header-date').textContent = dateStr;
  document.getElementById('header-time').textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

document.getElementById('btn-back').addEventListener('click', () => {
  if (currentStatus === 'duedate') {
    window.location.href = 'dashboard.html';
  } else {
    window.location.href = 'bill.html';
  }
});

// ─── Standard Bills Load ──────────────────────────────────────
async function loadBills() {
  const result = await window.api.getBills(currentStatus);
  if (result.success) {
    allBills = result.bills;
    renderBills(allBills);
  } else {
    console.error('Failed to load bills:', result.error);
  }
}

function renderBills(bills) {
  const tbody = document.getElementById('bills-body');
  const emptyState = document.getElementById('empty-state');

  const query = document.getElementById('search-input').value.toLowerCase();
  const filtered = bills.filter(b =>
    b.supplier_name.toLowerCase().includes(query) ||
    b.invoice_number.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = filtered.map((bill, index) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
      <td style="padding: 18px 12px 18px 24px; color: var(--accent-orange); font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 0.95rem; white-space: nowrap;">${escapeHtml(bill.invoice_number)}</td>
      <td style="padding: 18px 12px; font-weight: 600; color: var(--text-primary); font-size: 0.95rem; white-space: nowrap;">${escapeHtml(bill.supplier_name)}</td>
      <td style="padding: 18px 24px; text-align: right; font-weight: 700; color: var(--text-primary); font-family: 'Outfit', sans-serif; font-size: 1rem; white-space: nowrap;">₹${bill.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="padding: 18px 12px; text-align: right;">
        <button class="btn-view-detail" onclick="viewDetail(${bill.id})">
          <span class="material-icons-round" style="font-size: 18px;">description</span>
          View Detail
        </button>
      </td>
      <td style="padding: 18px 24px; text-align: center;">
        <button onclick="handleDeleteBill(${bill.id})" style="background: rgba(244, 63, 94, 0.1); color: var(--accent-rose); border: 1px solid rgba(244, 63, 94, 0.2); padding: 8px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease;" onmouseover="this.style.background='var(--accent-rose)'; this.style.color='#fff'" onmouseout="this.style.background='rgba(244, 63, 94, 0.1)'; this.style.color='var(--accent-rose)'">
          <span class="material-icons-round" style="font-size: 18px;">delete_outline</span>
        </button>
      </td>
    </tr>
  `).join('');
}

async function handleDeleteBill(id) {
  if (confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
    const result = await window.api.deleteBill(id);
    if (result.success) {
      loadBills();
    } else {
      alert('Error deleting bill: ' + result.error);
    }
  }
}

// ─── Due Date View (Calendar) ──────────────────────────────────
// Load due bills - optionally render the calendar view
async function loadDueBillsByDate(renderView = false) {
  const result = await window.api.getDueBillsByDate();
  if (result.success) {
    allDueBills = result.bills;
    if (renderView) {
      renderDueDateView();
    }
    updateDueDateBadge();
    showNotificationBanner();
  } else {
    console.error('Failed to load due bills by date:', result.error);
  }
}

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

function renderDueDateView() {
  const emptyDiv = document.getElementById('duedate-empty');
  const splitLayout = document.getElementById('duedate-split-layout');

  if (allDueBills.length === 0) {
    emptyDiv.style.display = 'block';
    splitLayout.style.display = 'none';
    return;
  }
  emptyDiv.style.display = 'none';
  splitLayout.style.display = 'flex';

  renderCalendar();
  renderTodayList();
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const monthYearLabel = document.getElementById('calendar-month-year');

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  monthYearLabel.textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(calendarDate);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `
    <div class="calendar-day-label">Sun</div>
    <div class="calendar-day-label">Mon</div>
    <div class="calendar-day-label">Tue</div>
    <div class="calendar-day-label">Wed</div>
    <div class="calendar-day-label">Thu</div>
    <div class="calendar-day-label">Fri</div>
    <div class="calendar-day-label">Sat</div>
  `;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-date empty"></div>`;
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dStr = d.toISOString().split('T')[0];

    // Check for bills on this date
    const dayBills = allDueBills.filter(b => b.due_date === dStr);
    let dueClass = '';
    if (dayBills.length > 0) {
      const cat = getDueCategory(dStr);
      dueClass = `has-due ${cat === 'overdue' ? 'overdue' : (cat === 'today' ? 'today-due' : 'upcoming-due')}`;
    }

    const isToday = d.getTime() === today.getTime();
    const isSelected = d.getTime() === selectedDate.getTime();

    html += `
      <div class="calendar-date ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dueClass}" 
           onclick="selectCalendarDate(${year}, ${month}, ${day})">
        ${day}
      </div>
    `;
  }

  grid.innerHTML = html;
}

window.selectCalendarDate = (y, m, d) => {
  selectedDate = new Date(y, m, d);
  renderCalendar();
  renderTodayList();
};

document.getElementById('btn-prev-month').addEventListener('click', () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('btn-next-month').addEventListener('click', () => {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  renderCalendar();
});

function renderTodayList() {
  const list = document.getElementById('today-due-list');
  const countChip = document.getElementById('today-count-chip');

  const todayStr = new Date().toISOString().split('T')[0];
  const selectedStr = selectedDate.toISOString().split('T')[0];

  // Show selected date bills
  const billsOnDate = allDueBills.filter(b => b.due_date === selectedStr);

  countChip.textContent = `${billsOnDate.length} Bill${billsOnDate.length !== 1 ? 's' : ''}`;

  const dateLabel = selectedStr === todayStr ? "Today's Due" : `Due on ${selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  document.querySelector('.today-due-container h3').innerHTML = `
    <span class="material-icons-round" style="color: var(--accent-orange);">event_note</span>
    ${dateLabel}
  `;

  if (billsOnDate.length === 0) {
    list.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.5;">
        <span class="material-icons-round" style="font-size: 48px; margin-bottom: 12px;">event_available</span>
        <p style="font-size: 0.9rem; font-weight: 600;">No bills due on this date</p>
      </div>
    `;
    return;
  }

  list.innerHTML = billsOnDate.map(bill => `
    <div class="due-item-mini" onclick="viewDetailFromDue(${bill.id})">
      <div class="due-item-mini__info">
        <div class="due-item-mini__supplier">${escapeHtml(bill.supplier_name)}</div>
        <div class="due-item-mini__invoice">${escapeHtml(bill.invoice_number)}</div>
      </div>
      <div class="due-item-mini__amount">
        <div class="due-item-mini__total">₹${bill.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        <div class="due-item-mini__due">Due: ₹${bill.due_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
      </div>
      <button class="paid-btn" onclick="markPaidFromDue(event, ${bill.id})" style="margin-top: 0; margin-left: 10px; padding: 6px 10px;">
        <span class="material-icons-round" style="font-size:16px;">check</span>
      </button>
    </div>
  `).join('');
}

function updateDueDateBadge() {
  const badge = document.getElementById('due-date-badge');
  const overdue = allDueBills.filter(b => getDueCategory(b.due_date) === 'overdue').length;
  const today = allDueBills.filter(b => getDueCategory(b.due_date) === 'today').length;
  const urgent = overdue + today;
  if (urgent > 0) {
    badge.textContent = urgent;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function showNotificationBanner() {
  if (notifDismissed) return;
  const banner = document.getElementById('notif-banner');
  // Don't show banner when already in Due Date View — calendar shows everything
  if (currentStatus === 'duedate') {
    banner.classList.remove('show');
    return;
  }
  const itemsDiv = document.getElementById('notif-items');

  const overdueBills = allDueBills.filter(b => getDueCategory(b.due_date) === 'overdue');
  const todayBills = allDueBills.filter(b => getDueCategory(b.due_date) === 'today');

  if (overdueBills.length === 0 && todayBills.length === 0) {
    banner.classList.remove('show');
    return;
  }

  let chips = '';
  if (overdueBills.length > 0) {
    chips += `<span class="notif-chip overdue"><span class="material-icons-round" style="font-size:14px;">warning</span>${overdueBills.length} Overdue</span>`;
  }
  if (todayBills.length > 0) {
    chips += `<span class="notif-chip today"><span class="material-icons-round" style="font-size:14px;">alarm</span>${todayBills.length} Due Today</span>`;
  }

  itemsDiv.innerHTML = chips;
  banner.classList.add('show');
}

window.switchToDueDateView = function () {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-duedate').classList.add('active');
  currentStatus = 'duedate';
  document.getElementById('table-view').style.display = 'none';
  document.getElementById('duedate-view').style.display = 'block';
  try { document.getElementById('search-input').closest('.search-box').style.display = 'none'; } catch (e) { }
  loadDueBillsByDate(true);
};

document.getElementById('notif-dismiss').addEventListener('click', () => {
  document.getElementById('notif-banner').classList.remove('show');
  notifDismissed = true;
});

// ─── Mark Paid from Due Date View ────────────────────────────
window.markPaidFromDue = async (e, id) => {
  e.stopPropagation();
  if (!confirm('Mark this bill as fully paid? Due amount will become ₹0.')) return;

  const result = await window.api.clearBillDues(id);
  if (result.success) {
    allDueBills = allDueBills.filter(b => b.id !== id);
    renderDueDateView();
    updateDueDateBadge();
    showNotificationBanner();
    showDueToast('Bill marked as paid!');
  } else {
    alert('Failed to mark as paid: ' + (result.error || 'Unknown'));
  }
};

window.viewDetailFromDue = async (id) => {
  const bill = allDueBills.find(b => b.id === id);
  if (!bill) return;
  currentModalBillId = id;
  document.getElementById('pdf-modal').classList.add('show');
  showPdfLoading();
  document.getElementById('pdf-modal-title').textContent = `Purchase Bill — ${bill.supplier_name}`;
  updateModalDue(bill);
  const pdfResult = await generateBillPdf(bill);
  if (pdfResult && pdfResult.success) {
    currentPdfPath = pdfResult.filePath;
    await displayPdf(pdfResult.filePath);
  } else {
    document.getElementById('pdf-modal-body').innerHTML = '<p style="color: var(--accent-rose); text-align: center; padding: 40px;">PDF generation failed</p>';
  }
};

function showDueToast(msg) {
  let toast = document.getElementById('due-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'due-toast';
    toast.style.cssText = `
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3);
      color: var(--accent-emerald); font-family: 'Inter', sans-serif; font-weight:700;
      font-size: 0.88rem; padding: 12px 24px; border-radius: 10px;
      z-index:9999; opacity:0;
      transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
      display:flex; align-items:center; gap:8px;
    `;
    toast.innerHTML = '<span class="material-icons-round" style="font-size:18px;">check_circle</span><span id="due-toast-msg"></span>';
    document.body.appendChild(toast);
  }
  toast.querySelector('#due-toast-msg').textContent = msg;
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2800);
}

function showPdfLoading() {
  const body = document.getElementById('pdf-modal-body');
  body.innerHTML = `
    <div class="pdf-loading" style="display:flex;">
      <div class="spinner"></div>
      <span>Generating PDF preview...</span>
    </div>
  `;
}

async function displayPdf(filePath) {
  const body = document.getElementById('pdf-modal-body');
  const readResult = await window.api.readBillPdf(filePath);
  if (readResult && readResult.success) {
    const blob = new Blob([readResult.data], { type: 'application/pdf' });
    const dataUrl = URL.createObjectURL(blob);
    body.innerHTML = `<embed src="${dataUrl}" type="application/pdf" style="width: 100%; height: 100%; border-radius: 8px;">`;
  } else {
    body.innerHTML = '<p style="color: var(--accent-rose); text-align: center; padding: 40px;">Could not read PDF file.</p>';
  }
}

async function generateBillPdf(bill, existingItems = null) {
  const itemsResult = existingItems ? { success: true, items: existingItems } : await window.api.getBillItems(bill.id);
  if (!itemsResult.success) return null;
  return await window.api.downloadBillPdf({
    supplierName: bill.supplier_name,
    supplierAddress: bill.supplier_address,
    phone: bill.phone_number,
    email: bill.email,
    invoiceNumber: bill.invoice_number,
    totalAmount: bill.total_amount,
    discount: bill.discount || 0,
    paidAmount: bill.paid_amount || 0,
    dueAmount: bill.due_amount || 0,
    remarks: bill.remarks,
    showRemarks: bill.show_remarks_pdf !== 0,
    items: itemsResult.items.map(item => ({ product: item.product, qty: item.qty, rate: item.rate, gstPercent: item.gst_percent || 0 }))
  });
}

window.viewDetail = async (id) => {
  const bill = allBills.find(b => b.id === id);
  if (!bill) return;
  currentModalBillId = id;
  document.getElementById('pdf-modal').classList.add('show');
  showPdfLoading();
  document.getElementById('pdf-modal-title').textContent = `Purchase Bill — ${bill.supplier_name}`;

  const itemsResult = await window.api.getBillItems(bill.id);
  if (!itemsResult.success) return;

  updateModalDue(bill, itemsResult.items);
  const pdfResult = await generateBillPdf(bill, itemsResult.items);
  if (pdfResult && pdfResult.success) {
    currentPdfPath = pdfResult.filePath;
    await displayPdf(pdfResult.filePath);
  }

  // Populate remark popover
  const remarkContent = document.getElementById('remark-popover-content');
  if (remarkContent) {
    remarkContent.textContent = bill.remarks || '';
  }
};

function updateModalDue(bill, items = []) {
  const dueAmount = bill.due_amount || 0;
  const discount = bill.discount || 0;

  document.getElementById('pdf-due-amount').textContent = `₹${dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;



  const btnAllPaid = document.getElementById('btn-all-paid');
  const dueBadge = document.getElementById('pdf-due-badge');
  if (dueAmount > 0) {
    dueBadge.style.color = 'var(--accent-rose)';
    btnAllPaid.style.display = 'inline-flex';
  } else {
    dueBadge.style.color = 'var(--accent-emerald)';
    btnAllPaid.style.display = 'none';
  }
}

document.getElementById('btn-all-paid').addEventListener('click', async () => {
  if (!currentModalBillId) return;
  const result = await window.api.clearBillDues(currentModalBillId);
  if (result.success) {
    const bill = allBills.find(b => b.id === currentModalBillId);
    if (bill) { bill.due_amount = 0; updateModalDue(bill); }
    allDueBills = allDueBills.filter(b => b.id !== currentModalBillId);
    updateDueDateBadge();
    renderDueDateView();
    renderBills(allBills);
  }
});



document.getElementById('btn-pdf-delete').addEventListener('click', async () => {
  if (!currentModalBillId) return;
  if (!confirm('Delete this bill?')) return;
  const result = await window.api.deleteBill(currentModalBillId);
  if (result.success) {
    allDueBills = allDueBills.filter(b => b.id !== currentModalBillId);
    updateDueDateBadge();
    if (currentStatus === 'duedate') renderDueDateView();
    document.getElementById('pdf-modal').classList.remove('show');
    await loadBills();
  }
});

document.getElementById('btn-pdf-download').addEventListener('click', () => { if (currentPdfPath) window.api.openPurchaseBillsFolder(); });
document.getElementById('btn-pdf-close').addEventListener('click', () => {
  document.getElementById('pdf-modal').classList.remove('show');
  document.getElementById('remark-popover').classList.remove('show');
});
document.getElementById('btn-pdf-back').addEventListener('click', () => {
  document.getElementById('pdf-modal').classList.remove('show');
  document.getElementById('remark-popover').classList.remove('show');
});


// ─── View Switching Helpers ───────────────────────────────────
function showTableView() {
  document.getElementById('table-view').style.display = 'block';
  document.getElementById('duedate-view').style.display = 'none';

  // Show the filter row (tabs + search)
  const filterRow = document.querySelector('.filter-row');
  if (filterRow) filterRow.style.display = 'flex';

  // Show standard tabs, hide Due Date View tab
  const tabPending = document.getElementById('tab-pending');
  const tabPaid = document.getElementById('tab-paid');
  const tabDueDate = document.getElementById('tab-duedate');
  if (tabPending) tabPending.style.display = 'inline-flex';
  if (tabPaid) tabPaid.style.display = 'inline-flex';
  if (tabDueDate) tabDueDate.style.display = 'none';

  try { document.getElementById('search-input').closest('.search-box').style.display = 'flex'; } catch (e) { }
  try { document.getElementById('notif-banner').classList.remove('show'); } catch (e) { }
}

function showDueDateCalendar() {
  document.getElementById('table-view').style.display = 'none';
  document.getElementById('duedate-view').style.display = 'block';

  // Hide the entire filter row (tabs + search) for a clean calendar-only view
  const filterRow = document.querySelector('.filter-row');
  if (filterRow) filterRow.style.display = 'none';

  try { document.getElementById('notif-banner').classList.remove('show'); } catch (e) { }
}

// ─── Tab Click Logic ────────────────────────────────────────
const tabs = document.querySelectorAll('.tab-btn');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentStatus = tab.dataset.status;
    if (currentStatus === 'duedate') {
      showDueDateCalendar();
      loadDueBillsByDate(true);
    } else {
      showTableView();
      loadBills();
    }
  });
});

document.getElementById('search-input').addEventListener('input', () => renderBills(allBills));

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Init ────────────────────────────────────────────────────
(async function init() {
  try {
    // 1. Highlight the correct tab
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    if (currentStatus === 'paid') {
      document.getElementById('tab-paid').classList.add('active');
    } else if (currentStatus === 'duedate') {
      document.getElementById('tab-duedate').classList.add('active');
    } else {
      document.getElementById('tab-pending').classList.add('active');
    }

    // 2. Show the correct view BEFORE any async work
    if (currentStatus === 'duedate') {
      showDueDateCalendar();
    } else {
      showTableView();
    }

    // 3. Load data
    if (currentStatus === 'duedate') {
      await loadDueBillsByDate(true);
    } else {
      await loadBills();
      await loadDueBillsByDate(false);
    }
  } catch (err) {
    console.error('Bill history init error:', err);
  }
})();

// ─── Edit Bill Logic ─────────────────────────────────────────
let editBillId = null;
let editBillItems = [];
let editItemRowId = 0;

// ─── Password Gate for Edit ─────────────────────────────────
let currentEditPassword = 'asports@2026'; // fallback, loaded from DB below

// Load password from database
(async function loadEditPassword() {
  try {
    const result = await window.api.getEditPassword();
    if (result.success && result.password) {
      currentEditPassword = result.password;
    }
  } catch (e) { console.error('Failed to load edit password:', e); }
})();

// Open the edit modal when Edit is clicked — requires password
document.getElementById('btn-pdf-edit').addEventListener('click', () => {
  if (!currentModalBillId) return;

  // Show password modal
  const overlay = document.getElementById('password-overlay');
  const input = document.getElementById('pw-input');
  const errorEl = document.getElementById('pw-error');

  input.value = '';
  input.type = 'password';
  document.getElementById('pw-toggle').querySelector('.material-icons-round').textContent = 'visibility_off';
  errorEl.textContent = '';
  input.classList.remove('error');
  overlay.classList.add('show');

  setTimeout(() => input.focus(), 100);
});

// Password toggle visibility
document.getElementById('pw-toggle').addEventListener('click', () => {
  const input = document.getElementById('pw-input');
  const icon = document.getElementById('pw-toggle').querySelector('.material-icons-round');
  if (input.type === 'password') {
    input.type = 'text';
    icon.textContent = 'visibility';
  } else {
    input.type = 'password';
    icon.textContent = 'visibility_off';
  }
});

// Password cancel
document.getElementById('pw-cancel').addEventListener('click', () => {
  document.getElementById('password-overlay').classList.remove('show');
});

// Close password overlay on backdrop click
document.getElementById('password-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('password-overlay').classList.remove('show');
  }
});

// Password submit
document.getElementById('pw-submit').addEventListener('click', () => {
  verifyAndOpenEdit();
});

// Enter key on password input
document.getElementById('pw-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    verifyAndOpenEdit();
  }
});

async function verifyAndOpenEdit() {
  const input = document.getElementById('pw-input');
  const errorEl = document.getElementById('pw-error');

  if (input.value !== currentEditPassword) {
    input.classList.add('error');
    errorEl.textContent = 'Incorrect password. Please try again.';
    input.select();
    setTimeout(() => input.classList.remove('error'), 400);
    return;
  }

  // Password correct — close password modal
  document.getElementById('password-overlay').classList.remove('show');

  // Proceed to open the edit form
  await openEditModal();
}

async function openEditModal() {
  if (!currentModalBillId) return;

  // Find the bill from allBills or allDueBills
  let bill = allBills.find(b => b.id === currentModalBillId);
  if (!bill) bill = allDueBills.find(b => b.id === currentModalBillId);
  if (!bill) return;

  // Get items for this bill
  const itemsResult = await window.api.getBillItems(currentModalBillId);
  if (!itemsResult.success) {
    alert('Failed to load bill items for editing.');
    return;
  }

  editBillId = currentModalBillId;
  editBillItems = itemsResult.items;

  // Fill the edit form fields
  document.getElementById('edit-supplier-name').value = bill.supplier_name || '';
  document.getElementById('edit-invoice-number').value = bill.invoice_number || '';
  document.getElementById('edit-supplier-address').value = bill.supplier_address || '';
  document.getElementById('edit-remarks').value = bill.remarks || '';
  document.getElementById('edit-show-remarks-pdf').checked = (bill.show_remarks_pdf !== 0);
  document.getElementById('edit-phone').value = bill.phone_number || '';
  document.getElementById('edit-email').value = bill.email || '';
  document.getElementById('edit-bill-date').value = bill.bill_date || '';
  document.getElementById('edit-due-date').value = bill.due_date || '';
  document.getElementById('edit-discount').value = bill.discount || 0;
  document.getElementById('edit-paid-amount').value = bill.paid_amount || 0;

  // Populate items table
  editItemRowId = 0;
  const tbody = document.getElementById('edit-items-body');
  tbody.innerHTML = '';

  if (editBillItems.length > 0) {
    editBillItems.forEach(item => {
      addEditItemRow(item.product, item.qty, item.rate, item.gst_percent || 0);
    });
  } else {
    addEditItemRow();
  }

  // Recalculate totals
  editRecalcTotals();

  // Show the edit modal
  document.getElementById('edit-modal').classList.add('show');
}

function addEditItemRow(product = '', qty = '', rate = '', gst = '0') {
  editItemRowId++;
  const tbody = document.getElementById('edit-items-body');
  const tr = document.createElement('tr');
  tr.dataset.editRowId = editItemRowId;

  const rowNum = editItemRowId;
  tr.innerHTML = `
    <td style="text-align:center; color:var(--text-muted); font-weight:600; font-size:0.82rem;">${rowNum}</td>
    <td><input type="text" class="edit-item-input edit-item-input--product" placeholder="Product name" value="${escapeHtml(String(product))}" spellcheck="false"></td>
    <td><input type="number" class="edit-item-input edit-item-input--num" placeholder="0" value="${qty}" min="1"></td>
    <td><input type="number" class="edit-item-input edit-item-input--num" placeholder="0.00" value="${rate}" step="0.01"></td>
    <td><input type="number" class="edit-item-input edit-item-input--num" placeholder="0" value="${gst}" min="0" max="100" step="0.01"></td>
    <td class="edit-row-total">0.00</td>
    <td>
      <button class="btn-edit-delete-item" title="Remove item">
        <span class="material-icons-round" style="font-size:18px;">close</span>
      </button>
    </td>
  `;
  tbody.appendChild(tr);

  // Attach input listeners
  const inputs = tr.querySelectorAll('.edit-item-input');
  inputs.forEach(inp => inp.addEventListener('input', () => {
    editRecalcRowTotal(tr);
    editRecalcTotals();
  }));

  // Attach delete listener
  tr.querySelector('.btn-edit-delete-item').addEventListener('click', () => {
    tr.remove();
    editReindexRows();
    editRecalcTotals();
  });

  // Calculate initial row total
  editRecalcRowTotal(tr);
}

function editRecalcRowTotal(tr) {
  const qty = parseFloat(tr.querySelector('input[placeholder="0"]')?.value) || 0;
  const rate = parseFloat(tr.querySelectorAll('.edit-item-input--num')[1]?.value) || 0;
  const gst = parseFloat(tr.querySelectorAll('.edit-item-input--num')[2]?.value) || 0;
  const base = qty * rate;
  const gstAmount = base * (gst / 100);
  const total = base + gstAmount;
  tr.querySelector('.edit-row-total').textContent = total.toFixed(2);
}

function editReindexRows() {
  const rows = document.querySelectorAll('#edit-items-body tr');
  rows.forEach((row, index) => {
    row.querySelector('td:first-child').textContent = index + 1;
  });
}

function editRecalcTotals() {
  const rows = document.querySelectorAll('#edit-items-body tr');
  let grandTotal = 0;
  rows.forEach(row => {
    const totalCell = row.querySelector('.edit-row-total');
    if (totalCell) grandTotal += parseFloat(totalCell.textContent) || 0;
  });

  const discount = parseFloat(document.getElementById('edit-discount').value) || 0;
  const finalTotal = Math.max(0, grandTotal - discount);
  document.getElementById('edit-total-amount').value = finalTotal.toFixed(2);

  const paid = parseFloat(document.getElementById('edit-paid-amount').value) || 0;
  const due = Math.max(0, finalTotal - paid);
  document.getElementById('edit-due-amount').value = due.toFixed(2);
}

// Auto-recalculate when discount or paid changes
document.getElementById('edit-discount').addEventListener('input', editRecalcTotals);
document.getElementById('edit-paid-amount').addEventListener('input', editRecalcTotals);

// Add item button
document.getElementById('btn-edit-add-item').addEventListener('click', () => {
  addEditItemRow();
});

// Close edit modal
function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('show');
  editBillId = null;
}

document.getElementById('btn-edit-close').addEventListener('click', closeEditModal);
document.getElementById('btn-edit-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});

// Save edited bill
document.getElementById('btn-edit-save').addEventListener('click', async () => {
  if (!editBillId) return;

  const supplierName = document.getElementById('edit-supplier-name').value.trim();
  const invoiceNumber = document.getElementById('edit-invoice-number').value.trim();
  const supplierAddress = document.getElementById('edit-supplier-address').value.trim();
  const remarks = document.getElementById('edit-remarks').value.trim();
  const showRemarks = document.getElementById('edit-show-remarks-pdf').checked;
  const phone = document.getElementById('edit-phone').value.trim();
  const email = document.getElementById('edit-email').value.trim();
  const billDate = document.getElementById('edit-bill-date').value;
  const dueDate = document.getElementById('edit-due-date').value;
  const totalAmount = parseFloat(document.getElementById('edit-total-amount').value) || 0;
  const discount = parseFloat(document.getElementById('edit-discount').value) || 0;
  const paidAmount = parseFloat(document.getElementById('edit-paid-amount').value) || 0;
  const dueAmount = parseFloat(document.getElementById('edit-due-amount').value) || 0;

  // Validate required fields
  if (!supplierName || !invoiceNumber) {
    alert('Please fill Supplier Name and Invoice Number.');
    return;
  }

  // Collect items
  const items = [];
  const rows = document.querySelectorAll('#edit-items-body tr');
  rows.forEach(row => {
    const product = row.querySelector('.edit-item-input--product')?.value.trim();
    const qty = parseInt(row.querySelectorAll('.edit-item-input--num')[0]?.value);
    const rate = parseFloat(row.querySelectorAll('.edit-item-input--num')[1]?.value);
    const gstPercent = parseFloat(row.querySelectorAll('.edit-item-input--num')[2]?.value) || 0;

    if (product && !isNaN(qty) && !isNaN(rate)) {
      items.push({ product, qty, rate, gstPercent });
    }
  });

  if (items.length === 0) {
    alert('Add at least one item.');
    return;
  }

  // Save to database
  const result = await window.api.updateBill({
    billId: editBillId,
    supplierName,
    supplierAddress,
    phone,
    email,
    invoiceNumber,
    billDate,
    dueDate,
    totalAmount,
    discount,
    paidAmount,
    dueAmount,
    remarks,
    showRemarks,
    items
  });

  if (result.success) {
    closeEditModal();
    // Close the PDF modal too since the bill data changed
    document.getElementById('pdf-modal').classList.remove('show');

    // Refresh data
    await loadBills();
    await loadDueBillsByDate(currentStatus === 'duedate');
    showDueToast('Bill updated successfully!');
  } else {
    alert('Failed to save changes: ' + (result.error || 'Unknown error'));
  }
});

// ─── Remark Popover Event Listeners ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const remarkBtn = document.getElementById('btn-pdf-remark');
  const remarkPopover = document.getElementById('remark-popover');

  if (remarkBtn && remarkPopover) {
    remarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      remarkPopover.classList.toggle('show');
    });

    // Close popover when clicking anywhere else
    document.addEventListener('click', (e) => {
      if (remarkPopover.classList.contains('show') && !remarkPopover.contains(e.target)) {
        remarkPopover.classList.remove('show');
      }
    });

    // Close button logic
    const closePopoverBtn = document.getElementById('remark-popover-close');
    if (closePopoverBtn) {
      closePopoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        remarkPopover.classList.remove('show');
      });
    }
  }

  // ─── Change Log Event Listeners ──────────────────────────────
  const changelogBtn = document.getElementById('btn-pdf-changelog');
  const changelogOverlay = document.getElementById('changelog-overlay');
  const changelogClose = document.getElementById('btn-changelog-close');

  if (changelogBtn) {
    changelogBtn.addEventListener('click', async () => {
      if (!currentModalBillId) return;
      await loadAndRenderChangelog(currentModalBillId);
      changelogOverlay.classList.add('show');
    });
  }

  if (changelogClose) {
    changelogClose.addEventListener('click', () => {
      changelogOverlay.classList.remove('show');
    });
  }

  if (changelogOverlay) {
    changelogOverlay.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        changelogOverlay.classList.remove('show');
      }
    });
  }
});

// Load and render changelog for a bill
async function loadAndRenderChangelog(billId) {
  const body = document.getElementById('changelog-body');
  body.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding: 60px 0; gap: 12px; color: var(--text-muted);">
      <div class="spinner" style="width:24px; height:24px; border-width:2px;"></div>
      <span style="font-size: 0.88rem;">Loading change history...</span>
    </div>
  `;

  const result = await window.api.getBillEditHistory(billId);
  if (!result.success || !result.logs || result.logs.length === 0) {
    body.innerHTML = `
      <div class="changelog-empty">
        <span class="material-icons-round">verified</span>
        <p>No changes recorded yet</p>
        <small>Edit history will appear here after you make changes to this bill.</small>
      </div>
    `;
    return;
  }

  // Group logs by edit_group (timestamp of the edit session)
  const groups = {};
  for (const log of result.logs) {
    if (!groups[log.edit_group]) {
      groups[log.edit_group] = {
        changedAt: log.changed_at,
        entries: []
      };
    }
    groups[log.edit_group].entries.push(log);
  }

  // Render grouped timeline
  const groupKeys = Object.keys(groups);
  let html = '';

  for (const key of groupKeys) {
    const group = groups[key];
    const d = new Date(group.changedAt);
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    html += `
      <div class="changelog-group">
        <div class="changelog-group__dot"></div>
        <div class="changelog-group__date">
          <span class="material-icons-round">schedule</span>
          ${dateStr} at ${timeStr}
        </div>
    `;

    for (const entry of group.entries) {
      const isItemsField = entry.field_name === 'Items';

      if (isItemsField) {
        const oldItems = (entry.old_value || '(none)').split(' | ');
        const newItems = (entry.new_value || '(none)').split(' | ');

        html += `
          <div class="changelog-entry">
            <div class="changelog-entry__field">Items Changed</div>
            <div class="changelog-split">
              <div class="changelog-split__side changelog-split__side--old">
                <div class="changelog-split__label changelog-split__label--old">
                  <span class="material-icons-round" style="font-size:13px;">remove_circle_outline</span>
                  Before
                </div>
                ${oldItems.map(i => `<div class="changelog-split__item">${escapeHtml(i.trim())}</div>`).join('')}
              </div>
              <div class="changelog-split__side changelog-split__side--new">
                <div class="changelog-split__label changelog-split__label--new">
                  <span class="material-icons-round" style="font-size:13px;">add_circle_outline</span>
                  After
                </div>
                ${newItems.map(i => `<div class="changelog-split__item">${escapeHtml(i.trim())}</div>`).join('')}
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="changelog-entry">
            <div class="changelog-entry__field">${escapeHtml(entry.field_name)}</div>
            <div class="changelog-split">
              <div class="changelog-split__side changelog-split__side--old">
                <div class="changelog-split__label changelog-split__label--old">
                  <span class="material-icons-round" style="font-size:13px;">remove_circle_outline</span>
                  Before
                </div>
                <div class="changelog-split__value changelog-split__value--old">${escapeHtml(entry.old_value || '(empty)')}</div>
              </div>
              <div class="changelog-split__side changelog-split__side--new">
                <div class="changelog-split__label changelog-split__label--new">
                  <span class="material-icons-round" style="font-size:13px;">add_circle_outline</span>
                  After
                </div>
                <div class="changelog-split__value">${escapeHtml(entry.new_value || '(empty)')}</div>
              </div>
            </div>
          </div>
        `;
      }
    }

    html += `</div>`;
  }

  body.innerHTML = html;
}

// ─── Forgot Password Flow ──────────────────────────────────────
let forgotTimerInterval = null;

function showForgotStep(stepId) {
  document.querySelectorAll('.forgot-step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

function closeForgotModal() {
  document.getElementById('forgot-overlay').classList.remove('show');
  if (forgotTimerInterval) { clearInterval(forgotTimerInterval); forgotTimerInterval = null; }
}

function resetForgotModal() {
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-otp').value = '';
  document.getElementById('forgot-new-pw').value = '';
  document.getElementById('forgot-confirm-pw').value = '';
  document.getElementById('forgot-email-error').textContent = '';
  document.getElementById('forgot-otp-error').textContent = '';
  document.getElementById('forgot-pw-error').textContent = '';
  document.querySelectorAll('.forgot-input').forEach(i => i.classList.remove('error'));
  showForgotStep('forgot-step-email');
}

// "Forgot Password?" link
document.getElementById('pw-forgot').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('password-overlay').classList.remove('show');
  resetForgotModal();
  document.getElementById('forgot-overlay').classList.add('show');
  setTimeout(() => document.getElementById('forgot-email').focus(), 150);
});

// Cancel buttons
document.getElementById('forgot-cancel-1').addEventListener('click', closeForgotModal);
document.getElementById('forgot-cancel-2').addEventListener('click', closeForgotModal);
document.getElementById('forgot-cancel-3').addEventListener('click', closeForgotModal);
document.getElementById('forgot-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeForgotModal();
});

// Step 1: Send OTP
document.getElementById('forgot-send-otp').addEventListener('click', async () => {
  const emailInput = document.getElementById('forgot-email');
  const errorEl = document.getElementById('forgot-email-error');
  const btn = document.getElementById('forgot-send-otp');
  const email = emailInput.value.trim();

  if (!email) {
    emailInput.classList.add('error');
    errorEl.textContent = 'Please enter your email address.';
    setTimeout(() => emailInput.classList.remove('error'), 400);
    return;
  }

  // Disable button while sending
  btn.disabled = true;
  btn.textContent = 'Sending...';
  errorEl.textContent = '';

  const result = await window.api.sendOtp(email);

  btn.disabled = false;
  btn.textContent = 'Send OTP';

  if (!result.success) {
    emailInput.classList.add('error');
    errorEl.textContent = result.error || 'Failed to send OTP.';
    setTimeout(() => emailInput.classList.remove('error'), 400);
    return;
  }

  // Get masked email for display
  const emailResult = await window.api.getRegisteredEmail();
  document.getElementById('forgot-masked-email').textContent = emailResult.masked || email;

  // Move to OTP step + start timer
  showForgotStep('forgot-step-otp');
  setTimeout(() => document.getElementById('forgot-otp').focus(), 150);
  startOtpTimer();
});

// Enter key on email input
document.getElementById('forgot-email').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('forgot-send-otp').click();
  }
});

// OTP countdown timer
function startOtpTimer() {
  if (forgotTimerInterval) clearInterval(forgotTimerInterval);
  let seconds = 300; // 5 minutes
  const timerEl = document.getElementById('forgot-timer');

  function updateTimer() {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    timerEl.innerHTML = `OTP expires in <strong>${m}:${String(s).padStart(2, '0')}</strong>`;
    if (seconds <= 0) {
      clearInterval(forgotTimerInterval);
      timerEl.innerHTML = `<strong style="color: var(--accent-rose);">OTP expired. Please go back and resend.</strong>`;
    }
    seconds--;
  }
  updateTimer();
  forgotTimerInterval = setInterval(updateTimer, 1000);
}

// Step 2: Verify OTP
document.getElementById('forgot-verify-otp').addEventListener('click', async () => {
  const otpInput = document.getElementById('forgot-otp');
  const errorEl = document.getElementById('forgot-otp-error');
  const btn = document.getElementById('forgot-verify-otp');
  const otp = otpInput.value.trim();

  if (!otp || otp.length !== 6) {
    otpInput.classList.add('error');
    errorEl.textContent = 'Please enter the 6-digit OTP.';
    setTimeout(() => otpInput.classList.remove('error'), 400);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verifying...';
  errorEl.textContent = '';

  const result = await window.api.verifyOtp(otp);

  btn.disabled = false;
  btn.textContent = 'Verify';

  if (!result.success) {
    otpInput.classList.add('error');
    errorEl.textContent = result.error || 'Invalid OTP.';
    setTimeout(() => otpInput.classList.remove('error'), 400);
    return;
  }

  // OTP verified — stop timer, move to new password step
  if (forgotTimerInterval) { clearInterval(forgotTimerInterval); forgotTimerInterval = null; }
  showForgotStep('forgot-step-newpw');
  setTimeout(() => document.getElementById('forgot-new-pw').focus(), 150);
});

// OTP input: only allow numbers
document.getElementById('forgot-otp').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});

// Enter key on OTP input
document.getElementById('forgot-otp').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('forgot-verify-otp').click();
  }
});

// Step 3: Save new password
document.getElementById('forgot-save-pw').addEventListener('click', async () => {
  const newPw = document.getElementById('forgot-new-pw').value;
  const confirmPw = document.getElementById('forgot-confirm-pw').value;
  const errorEl = document.getElementById('forgot-pw-error');

  if (!newPw || newPw.length < 4) {
    errorEl.textContent = 'Password must be at least 4 characters.';
    document.getElementById('forgot-new-pw').classList.add('error');
    setTimeout(() => document.getElementById('forgot-new-pw').classList.remove('error'), 400);
    return;
  }

  if (newPw !== confirmPw) {
    errorEl.textContent = 'Passwords do not match.';
    document.getElementById('forgot-confirm-pw').classList.add('error');
    setTimeout(() => document.getElementById('forgot-confirm-pw').classList.remove('error'), 400);
    return;
  }

  const btn = document.getElementById('forgot-save-pw');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  errorEl.textContent = '';

  const result = await window.api.updateEditPassword(newPw);

  btn.disabled = false;
  btn.textContent = 'Save Password';

  if (!result.success) {
    errorEl.textContent = result.error || 'Failed to save password.';
    return;
  }

  // Update in-memory password
  currentEditPassword = newPw;

  // Show success step
  showForgotStep('forgot-step-success');
});

// Enter key on confirm password
document.getElementById('forgot-confirm-pw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('forgot-save-pw').click();
  }
});

// Done button
document.getElementById('forgot-done').addEventListener('click', () => {
  closeForgotModal();
});

// Toggle visibility for new password fields
function setupPwToggle(toggleId, inputId) {
  document.getElementById(toggleId).addEventListener('click', () => {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(toggleId).querySelector('.material-icons-round');
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'visibility';
    } else {
      input.type = 'password';
      icon.textContent = 'visibility_off';
    }
  });
}
setupPwToggle('forgot-new-pw-toggle', 'forgot-new-pw');
setupPwToggle('forgot-confirm-pw-toggle', 'forgot-confirm-pw');
