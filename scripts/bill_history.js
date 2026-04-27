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
      <td style="padding: 18px 12px 18px 24px; color: var(--accent-orange); font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 0.95rem;">${escapeHtml(bill.invoice_number)}</td>
      <td style="padding: 18px 12px; font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(bill.supplier_name)}</td>
      <td style="padding: 18px 24px; text-align: right; font-weight: 700; color: var(--text-primary); font-family: 'Outfit', sans-serif; font-size: 1rem;">₹${bill.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
  today.setHours(0,0,0,0);

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

window.switchToDueDateView = function() {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-duedate').classList.add('active');
  currentStatus = 'duedate';
  document.getElementById('table-view').style.display = 'none';
  document.getElementById('duedate-view').style.display = 'block';
  try { document.getElementById('search-input').closest('.search-box').style.display = 'none'; } catch(e) {}
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

async function generateBillPdf(bill) {
  const itemsResult = await window.api.getBillItems(bill.id);
  if (!itemsResult.success) return null;
  return await window.api.downloadBillPdf({
    supplierName: bill.supplier_name,
    supplierAddress: bill.supplier_address,
    phone: bill.phone_number,
    email: bill.email,
    invoiceNumber: bill.invoice_number,
    totalAmount: bill.total_amount,
    paidAmount: bill.paid_amount || 0,
    dueAmount: bill.due_amount || 0,
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
  updateModalDue(bill);
  const pdfResult = await generateBillPdf(bill);
  if (pdfResult && pdfResult.success) {
    currentPdfPath = pdfResult.filePath;
    await displayPdf(pdfResult.filePath);
  }
};

function updateModalDue(bill) {
  const dueAmount = bill.due_amount || 0;
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

document.getElementById('btn-pdf-refresh').addEventListener('click', async () => {
  if (!currentModalBillId) return;
  await loadBills();
  const bill = allBills.find(b => b.id === currentModalBillId);
  if (bill) {
    updateModalDue(bill);
    const pdfResult = await generateBillPdf(bill);
    if (pdfResult && pdfResult.success) await displayPdf(pdfResult.filePath);
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
document.getElementById('btn-pdf-close').addEventListener('click', () => { document.getElementById('pdf-modal').classList.remove('show'); });
document.getElementById('btn-pdf-header-close').addEventListener('click', () => { document.getElementById('pdf-modal').classList.remove('show'); });

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
  
  try { document.getElementById('search-input').closest('.search-box').style.display = 'flex'; } catch(e) {}
  try { document.getElementById('notif-banner').classList.remove('show'); } catch(e) {}
}

function showDueDateCalendar() {
  document.getElementById('table-view').style.display = 'none';
  document.getElementById('duedate-view').style.display = 'block';
  
  // Hide the entire filter row (tabs + search) for a clean calendar-only view
  const filterRow = document.querySelector('.filter-row');
  if (filterRow) filterRow.style.display = 'none';
  
  try { document.getElementById('notif-banner').classList.remove('show'); } catch(e) {}
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

