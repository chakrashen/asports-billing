/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Supplier Ledger Logic
   ════════════════════════════════════════════════════════════ */

let allSuppliers = [];

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

// ─── Load Supplier Ledgers ──────────────────────────────────
async function loadSuppliers() {
  const loadingEl = document.getElementById('loading-state');
  const emptyEl = document.getElementById('empty-state');
  const gridEl = document.getElementById('suppliers-grid');

  loadingEl.style.display = 'flex';
  emptyEl.style.display = 'none';
  gridEl.style.display = 'none';

  try {
    const result = await window.api.getSupplierLedgers();

    loadingEl.style.display = 'none';

    if (!result.success) {
      emptyEl.style.display = 'flex';
      console.error('Failed to load suppliers:', result.error);
      return;
    }

    allSuppliers = result.suppliers;

    if (allSuppliers.length === 0) {
      emptyEl.style.display = 'flex';
      return;
    }

    updateStats(allSuppliers);
    renderSuppliers(allSuppliers);
  } catch (err) {
    loadingEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    console.error('Error loading suppliers:', err);
  }
}

function updateStats(suppliers) {
  let totalBills = 0;
  let totalDue = 0;
  suppliers.forEach(s => {
    totalBills += s.billCount;
    totalDue += s.totalDue;
  });

  document.getElementById('stat-suppliers').textContent = suppliers.length;
  document.getElementById('stat-bills').textContent = totalBills;
  document.getElementById('stat-due').textContent = '₹' + totalDue.toLocaleString('en-IN', {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
}

// ─── Render Supplier Cards ──────────────────────────────────
function renderSuppliers(suppliers) {
  const gridEl = document.getElementById('suppliers-grid');
  const emptyEl = document.getElementById('empty-state');

  if (suppliers.length === 0) {
    gridEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    return;
  }

  emptyEl.style.display = 'none';
  gridEl.style.display = 'grid';

  gridEl.innerHTML = suppliers.map((s, index) => {
    const initials = s.supplierName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const contact = s.phone || s.email || '';

    return `
      <div class="sl-card" onclick="openSupplierDetail(${index})" style="animation-delay: ${index * 0.05}s;">
        <div class="sl-card__header">
          <div class="sl-card__avatar">${escapeHtml(initials)}</div>
          <div>
            <div class="sl-card__name">${escapeHtml(s.supplierName)}</div>
            ${contact ? `<div class="sl-card__contact">${escapeHtml(contact)}</div>` : ''}
          </div>
        </div>
        <div class="sl-card__meta">
          <div class="sl-card__metric">
            <span class="sl-card__metric-label">Total</span>
            <span class="sl-card__metric-value">₹${formatAmount(s.totalAmount)}</span>
          </div>
          <div class="sl-card__metric">
            <span class="sl-card__metric-label">Paid</span>
            <span class="sl-card__metric-value sl-card__metric-value--paid">₹${formatAmount(s.totalPaid)}</span>
          </div>
          <div class="sl-card__metric">
            <span class="sl-card__metric-label">Due</span>
            <span class="sl-card__metric-value ${s.totalDue > 0 ? 'sl-card__metric-value--due' : 'sl-card__metric-value--paid'}">₹${formatAmount(s.totalDue)}</span>
          </div>
        </div>
        <div class="sl-card__footer">
          <span class="sl-card__bills-count">
            <span class="material-icons-round">receipt_long</span>
            ${s.billCount} Bill${s.billCount !== 1 ? 's' : ''}
          </span>
          <span class="material-icons-round sl-card__arrow">arrow_forward</span>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Search ─────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  if (!query) {
    renderSuppliers(allSuppliers);
    updateStats(allSuppliers);
    return;
  }
  const filtered = allSuppliers.filter(s =>
    s.supplierName.toLowerCase().includes(query) ||
    (s.phone && s.phone.includes(query)) ||
    (s.email && s.email.toLowerCase().includes(query))
  );
  renderSuppliers(filtered);
  updateStats(filtered);
});

// ─── Supplier Detail Modal ──────────────────────────────────
window.openSupplierDetail = function (index) {
  const supplier = allSuppliers[index];
  if (!supplier) return;

  const overlay = document.getElementById('detail-overlay');
  const nameEl = document.getElementById('detail-supplier-name');
  const contactEl = document.getElementById('detail-supplier-contact');
  const summaryEl = document.getElementById('detail-summary');
  const bodyEl = document.getElementById('detail-body');

  // Header
  nameEl.textContent = supplier.supplierName;
  const contactParts = [];
  if (supplier.phone) contactParts.push(supplier.phone);
  if (supplier.email) contactParts.push(supplier.email);
  if (supplier.address) contactParts.push(supplier.address);
  contactEl.textContent = contactParts.join(' • ');

  // Summary cards
  summaryEl.innerHTML = `
    <div class="sl-summary-card">
      <div class="sl-summary-card__label">Total Bills</div>
      <div class="sl-summary-card__value sl-summary-card__value--cyan">${supplier.billCount}</div>
    </div>
    <div class="sl-summary-card">
      <div class="sl-summary-card__label">Total Amount</div>
      <div class="sl-summary-card__value sl-summary-card__value--orange">₹${formatAmount(supplier.totalAmount)}</div>
    </div>
    <div class="sl-summary-card">
      <div class="sl-summary-card__label">Total Paid</div>
      <div class="sl-summary-card__value sl-summary-card__value--emerald">₹${formatAmount(supplier.totalPaid)}</div>
    </div>
    <div class="sl-summary-card">
      <div class="sl-summary-card__label">Total Due</div>
      <div class="sl-summary-card__value sl-summary-card__value--rose">₹${formatAmount(supplier.totalDue)}</div>
    </div>
  `;

  // Transaction table with running balance
  let runningBalance = 0;
  const billRows = supplier.bills.map((bill, i) => {
    runningBalance += (bill.due_amount || 0);
    const billDate = bill.bill_date || bill.created_at?.split(' ')[0] || '—';
    const formattedDate = formatDate(billDate);
    const isPaid = (bill.due_amount || 0) <= 0;

    // Items detail HTML
    const itemsDetailHtml = (bill.items || []).map(it => {
      const base = it.qty * it.rate;
      const gst = base * ((it.gst_percent || 0) / 100);
      const total = base + gst;
      return `
        <tr>
          <td>${escapeHtml(it.product)}</td>
          <td style="text-align:center;">${it.qty}</td>
          <td style="text-align:right;">₹${it.rate.toFixed(2)}</td>
          <td style="text-align:right;">${it.gst_percent || 0}%</td>
          <td style="text-align:right; font-weight:600;">₹${total.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <tr>
        <td class="sl-txn-date">${formattedDate}</td>
        <td class="sl-txn-invoice">${escapeHtml(bill.invoice_number)}</td>
        <td class="sl-txn-items-col">
          ${(bill.items || []).length > 0 ? `<button class="sl-txn-toggle" onclick="toggleItems(event, 'items-${i}')" title="View items"><span class="material-icons-round">expand_more</span></button>` : '—'}
        </td>
        <td class="sl-txn-amount">₹${formatAmount(bill.total_amount)}</td>
        <td class="sl-txn-paid">₹${formatAmount(bill.paid_amount || 0)}</td>
        <td class="sl-txn-due ${isPaid ? 'sl-txn-due--paid' : 'sl-txn-due--pending'}">${isPaid ? 'Paid' : '₹' + formatAmount(bill.due_amount)}</td>
        <td class="sl-txn-balance ${runningBalance > 0 ? 'sl-txn-balance--positive' : 'sl-txn-balance--zero'}">₹${formatAmount(runningBalance)}</td>
        <td class="sl-txn-logs">
          <button class="sl-log-btn" onclick="openBillLogs(event, ${bill.id}, '${escapeHtml(bill.invoice_number).replace(/'/g, "\\'")}')">
            <span class="material-icons-round">history</span>
            Logs
          </button>
        </td>
      </tr>
      <tr class="sl-txn-items-detail" id="items-${i}">
        <td colspan="8">
          <div class="sl-txn-items-list">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Rate</th>
                  <th style="text-align:right;">GST</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsDetailHtml}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  bodyEl.innerHTML = `
    <table class="sl-txn-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Invoice #</th>
          <th class="sl-txn-items-col">Items</th>
          <th style="text-align:right;">Amount</th>
          <th style="text-align:right;">Paid</th>
          <th style="text-align:right;">Due</th>
          <th style="text-align:right;">Balance</th>
          <th style="text-align:center;">Logs</th>
        </tr>
      </thead>
      <tbody>
        ${billRows}
      </tbody>
    </table>
  `;

  overlay.classList.add('show');
};

// Toggle items detail row
window.toggleItems = function (event, rowId) {
  event.stopPropagation();
  const row = document.getElementById(rowId);
  const btn = event.currentTarget;
  if (row) {
    const isExpanding = !row.classList.contains('show');
    row.classList.toggle('show');
    btn.classList.toggle('expanded');
    btn.innerHTML = `<span class="material-icons-round">${isExpanding ? 'expand_less' : 'expand_more'}</span>`;
  }
};

// ─── Bill Logs Modal ────────────────────────────────────────
window.openBillLogs = async function (event, billId, invoiceNumber) {
  event.stopPropagation();

  const overlay = document.getElementById('log-overlay');
  const invoiceEl = document.getElementById('log-invoice-num');
  const bodyEl = document.getElementById('log-body');

  invoiceEl.textContent = invoiceNumber;
  bodyEl.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding: 60px 0; gap: 12px; color: var(--text-muted);">
      <div class="sl-spinner" style="width:24px; height:24px; border-width:2px;"></div>
      <span style="font-size: 0.88rem;">Loading change history...</span>
    </div>
  `;
  overlay.classList.add('show');

  try {
    const result = await window.api.getBillEditHistory(billId);

    if (!result.success || !result.logs || result.logs.length === 0) {
      bodyEl.innerHTML = `
        <div class="changelog-empty">
          <span class="material-icons-round">verified</span>
          <p>No changes recorded yet</p>
          <small>Edit history will appear here after you make changes to this bill.</small>
        </div>
      `;
      return;
    }

    // Group logs by edit_group (timestamp)
    const groups = {};
    result.logs.forEach(log => {
      const key = log.edit_group || log.changed_at;
      if (!groups[key]) {
        groups[key] = {
          changedAt: log.changed_at,
          entries: []
        };
      }
      groups[key].entries.push(log);
    });

    let html = '';
    const groupKeys = Object.keys(groups).sort((a, b) => new Date(groups[b].changedAt) - new Date(groups[a].changedAt));

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
                  <div class="changelog-split__label changelog-split__label--old">Before</div>
                  <div class="changelog-split__value changelog-split__value--old">${escapeHtml(entry.old_value || '—')}</div>
                </div>
                <div class="changelog-split__side changelog-split__side--new">
                  <div class="changelog-split__label changelog-split__label--new">After</div>
                  <div class="changelog-split__value">${escapeHtml(entry.new_value || '—')}</div>
                </div>
              </div>
            </div>
          `;
        }
      }
      html += `</div>`;
    }

    bodyEl.innerHTML = html;
  } catch (err) {
    bodyEl.innerHTML = `
      <div class="changelog-empty">
        <span class="material-icons-round">error_outline</span>
        <p>Failed to load logs</p>
      </div>
    `;
    console.error('Error loading bill logs:', err);
  }
};

// Close log modal
document.getElementById('log-close').addEventListener('click', closeLog);
document.getElementById('log-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeLog();
});

function closeLog() {
  document.getElementById('log-overlay').classList.remove('show');
}

function formatLogDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) + ' — ' + d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch {
    return str;
  }
}

// Close detail modal
document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-back').addEventListener('click', closeDetail);
document.getElementById('detail-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDetail();
});

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('show');
}

// ─── Utilities ──────────────────────────────────────────────
function formatAmount(num) {
  return (num || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === '—') return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ───────────────────────────────────────────────────
loadSuppliers();
