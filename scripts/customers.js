/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Customer Directory Logic
   ════════════════════════════════════════════════════════════ */

let allCustomers = []; // { name, invoices: [...], totalAmount, invoiceCount, lastDate, phone, email, address, totalDues }
let currentFilter = 'all'; // 'all' or 'dues'
let currentView = 'invoices'; // 'customers' or 'invoices'
let currentEditingInvoiceId = null;
let shopifySyncedIds = new Set();

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
  window.location.href = 'invoice.html';
});

// ─── Edit Form Validation ──────────────────────────────────
document.getElementById('edit-phone').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

document.getElementById('edit-email').addEventListener('blur', (e) => {
  const val = e.target.value.trim();
  if (val && !val.includes('@')) {
    e.target.value = val + '@gmail.com';
  }
});

// ─── Load Data ──────────────────────────────────────────────
async function loadCustomers() {
  try {
    const result = await window.api.getInvoices();
    if (!result.success) return;

    const invoices = result.invoices;

    // Load ALL items in one batch query instead of N individual calls
    const allItemsResult = await window.api.getAllInvoiceItems();
    const allItems = (allItemsResult && allItemsResult.success) ? allItemsResult.items : [];

    // Group items by invoice_id for fast lookup
    const itemsByInvoice = {};
    allItems.forEach(item => {
      if (!itemsByInvoice[item.invoice_id]) itemsByInvoice[item.invoice_id] = [];
      itemsByInvoice[item.invoice_id].push(item);
    });

    // Attach items to each invoice
    const invoicesWithItems = invoices.map(inv => ({
      ...inv,
      items: itemsByInvoice[inv.id] || []
    }));

    // Group by customer name (case-insensitive)
    const customerMap = {};
    invoicesWithItems.forEach(inv => {
      const key = inv.customer_name.toLowerCase();
      if (!customerMap[key]) {
        customerMap[key] = {
          name: inv.customer_name,
          invoices: [],
          totalAmount: 0,
          invoiceCount: 0,
          lastDate: null,
          phone: null,
          email: null,
          address: null,
          totalDues: 0
        };
      }
      customerMap[key].invoices.push(inv);
      customerMap[key].totalAmount += inv.total_amount;
      customerMap[key].totalDues += (inv.due_amount || 0);
      customerMap[key].invoiceCount++;
      if (!customerMap[key].lastDate || inv.created_at > customerMap[key].lastDate) {
        customerMap[key].lastDate = inv.created_at;
        // Keep the most recent contact details
        customerMap[key].phone = inv.phone_number || customerMap[key].phone;
        customerMap[key].email = inv.email || customerMap[key].email;
        customerMap[key].address = inv.billing_address || customerMap[key].address;
      }
    });

    // Sort by last date descending (most recently saved customer on top)
    allCustomers = Object.values(customerMap).sort((a, b) => {
      const dateA = a.lastDate ? new Date(a.lastDate).getTime() : 0;
      const dateB = b.lastDate ? new Date(b.lastDate).getTime() : 0;
      return dateB - dateA;
    });

    // Load Shopify-synced invoice IDs
    try {
      const syncResult = await window.api.getShopifySyncedInvoiceIds();
      if (syncResult.success && syncResult.invoiceIds) {
        shopifySyncedIds = new Set(syncResult.invoiceIds);
      }
    } catch (e) { console.error('Failed to load Shopify synced IDs:', e); }

    updateSummary(allCustomers, invoices);
    applyFilters();
  } catch (e) {
    console.error('Failed to load customers:', e);
  }
}

// ─── Summary ────────────────────────────────────────────────
function updateSummary(customers, invoices) {
  document.getElementById('total-invoices').textContent = invoices.length;
  const totalRevenue = customers.reduce((sum, c) => sum + c.totalAmount, 0);
  document.getElementById('total-revenue').textContent = '₹ ' + totalRevenue.toLocaleString('en-IN', {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });

  const totalDues = customers.reduce((sum, c) => sum + (c.totalDues || 0), 0);
  document.getElementById('total-dues-val').textContent = '₹ ' + totalDues.toLocaleString('en-IN', {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
}

function applyFilters() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();

  if (currentView === 'invoices') {
    // Get all invoices from all customers
    let allInvoices = [];
    allCustomers.forEach(c => {
      allInvoices = allInvoices.concat(c.invoices);
    });

    // Sort by id DESC (most recent on top)
    allInvoices.sort((a, b) => b.id - a.id);

    // Apply search filter
    if (query) {
      allInvoices = allInvoices.filter(inv =>
        inv.customer_name.toLowerCase().includes(query) ||
        (inv.invoice_number && inv.invoice_number.toString().includes(query)) ||
        inv.id.toString().includes(query)
      );
    }

    // Apply status filter (Outstanding)
    if (currentFilter === 'dues') {
      allInvoices = allInvoices.filter(inv => (inv.due_amount || 0) > 0);
    }

    renderInvoices(allInvoices);
    return;
  }

  let filtered = allCustomers;

  // Apply Status Filter
  if (currentFilter === 'dues') {
    filtered = filtered.filter(c => c.totalDues > 0);
  }

  // Apply Search Filter
  if (query) {
    filtered = filtered.filter(c => c.name.toLowerCase().includes(query));
  }

  renderCustomers(filtered);
}

// ─── Render Invoices List ───────────────────────────────────
function renderInvoices(invoices) {
  const container = document.getElementById('customers-list');
  const emptyState = document.getElementById('empty-state');

  if (invoices.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.querySelector('.empty-state__text').textContent = 'No invoices found';
    return;
  }

  container.style.display = '';
  emptyState.style.display = 'none';

  container.innerHTML = `
    <div class="invoice-directory-table" style="width:100%; background: rgba(18, 20, 45, 0.4); border-radius: 16px; border: 1px solid var(--border-subtle); overflow: visible;">
      <div class="table-header" style="display: grid; grid-template-columns: 140px 1fr 100px 150px 140px 80px; padding: 18px 24px; background: #0d0d21; border-bottom: 1px solid var(--border-subtle); font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; position: sticky; top: 0; z-index: 10; border-radius: 16px 16px 0 0;">
        <div>Invoice No.</div>
        <div>Customer Name</div>
        <div style="text-align: center;">Source</div>
        <div style="text-align: right;">Amount</div>
        <div style="text-align: center;">Action</div>
        <div style="text-align: center;">Delete</div>
      </div>
      <div id="invoice-rows-container">
        ${invoices.map(inv => {
    const invNum = inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id}`;
    const amountStr = inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const isShopify = shopifySyncedIds.has(inv.id);
    const shopifyBadge = isShopify ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(150,191,72,0.15);color:#96bf48;border:1px solid rgba(150,191,72,0.3);padding:2px 8px;border-radius:6px;font-size:0.65rem;font-weight:800;letter-spacing:0.03em;margin-right:8px;vertical-align:middle;"><svg width="12" height="12" viewBox="0 0 256 292" style="flex-shrink:0;"><path d="M223.8 57.5s-4.9-1.3-16.2 3.3c-5.4-15.4-14.9-29.6-31.6-29.6h-1.5c-4.7-6.1-10.6-8.8-15.7-8.8-38.8 0-57.5 48.5-63.3 73.2l-27.2 8.4c-8.5 2.7-8.8 2.9-9.9 10.9L42 241.7 168 268l72.5-15.6S223.9 57.8 223.8 57.5z" fill="#96bf48"/></svg>Shopify</span>` : '';
    return `
            <div class="invoice-directory-row" style="display: grid; grid-template-columns: 140px 1fr 100px 150px 140px 80px; padding: 14px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center; transition: background 0.2s ease;">
              <div style="font-weight: 800; color: var(--accent-cyan); font-family: 'Outfit', sans-serif;">${invNum}</div>
              <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(inv.customer_name)}</div>
              <div style="text-align: center;">${shopifyBadge}</div>
              <div style="text-align: right; font-weight: 700; color: var(--text-primary); font-family: 'Outfit', sans-serif;">₹ ${amountStr}</div>
              <div style="text-align: center;">
                <button onclick="openInvoiceModal(${inv.id})" style="background: var(--accent-cyan-dim); color: var(--accent-cyan); border: 1px solid rgba(0, 229, 255, 0.2); padding: 6px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; transition: all 0.2s ease;" onmouseover="this.style.background='var(--accent-cyan)'; this.style.color='#000'" onmouseout="this.style.background='var(--accent-cyan-dim)'; this.style.color='var(--accent-cyan)'">
                  <span class="material-icons-round" style="font-size: 16px;">visibility</span>
                  View Detail
                </button>
              </div>
              <div style="text-align: center;">
                <button onclick="handleDeleteInvoice(${inv.id})" style="background: rgba(244, 63, 94, 0.1); color: var(--accent-rose); border: 1px solid rgba(244, 63, 94, 0.2); padding: 8px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease;" onmouseover="this.style.background='var(--accent-rose)'; this.style.color='#fff'" onmouseout="this.style.background='rgba(244, 63, 94, 0.1)'; this.style.color='var(--accent-rose)'">
                  <span class="material-icons-round" style="font-size: 18px;">delete_outline</span>
                </button>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

async function handleDeleteInvoice(invoiceId) {
  if (confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
    const result = await window.api.deleteInvoice(invoiceId);
    if (result.success) {
      showToast('Invoice deleted successfully');
      await loadCustomers();
    } else {
      showToast('Error deleting invoice: ' + result.error, true);
    }
  }
}

function openCustomerByName(name) {
  const cust = allCustomers.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (cust) {
    openCustomerDetailModal(cust);
  } else {
    console.warn('Customer not found for name:', name);
  }
}

// ─── Render Customer Cards ──────────────────────────────────
function renderCustomers(customers) {
  const container = document.getElementById('customers-list');
  const emptyState = document.getElementById('empty-state');

  if (customers.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  container.style.display = '';
  emptyState.style.display = 'none';

  container.innerHTML = customers.map((cust, idx) => {
    const initials = getInitials(cust.name);
    const totalStr = cust.totalAmount.toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    const lastDateStr = formatDateShort(cust.lastDate);

    // Build invoice rows
    const invoiceRows = cust.invoices.map(inv => {
      const amountStr = inv.total_amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
      const dateStr = formatDateShort(inv.created_at);
      const productNames = inv.items.map(it => it.product).join(', ') || 'No items';

      return `
        <div class="invoice-row" data-invoice-id="${inv.id}" title="Click to view details">
          <span class="invoice-row__id">#${inv.id}</span>
          <span class="invoice-row__products">${escapeHtml(productNames)}</span>
          <span class="invoice-row__amount">₹ ${amountStr}</span>
          <span class="invoice-row__date">${dateStr}</span>
          <span class="material-icons-round invoice-row__arrow">chevron_right</span>
        </div>
      `;
    }).join('');

    return `
      <div class="customer-card" style="animation: fade-in-up 0.5s var(--ease-out) ${idx * 0.05}s both" data-customer="${escapeHtml(cust.name.toLowerCase())}">
        <div class="customer-card__header" data-toggle>
          <div class="customer-card__avatar">${initials}</div>
          <div class="customer-card__info">
            <div class="customer-card__name">${escapeHtml(cust.name)}</div>
            <div class="customer-card__meta">
              <span class="customer-card__meta-item">
                <span class="material-icons-round">description</span>
                ${cust.invoiceCount} invoice${cust.invoiceCount > 1 ? 's' : ''}
              </span>
              <span class="customer-card__meta-item">
                <span class="material-icons-round">schedule</span>
                Last: ${lastDateStr}
              </span>
            </div>
          </div>
          <div class="customer-card__actions">
            <button class="btn-view-detail" data-customer-key="${escapeHtml(cust.name.toLowerCase())}" title="View full details">
              <span class="material-icons-round">visibility</span>
              View Detail
            </button>
          </div>
          <div class="customer-card__stats">
            <span class="customer-card__stat-value">₹ ${totalStr}</span>
            <span class="customer-card__stat-label">TOTAL SPENT</span>
          </div>
          <div class="customer-card__toggle">
            <span class="material-icons-round">expand_more</span>
          </div>
        </div>
        <div class="customer-card__body">
          <div class="customer-card__invoices">
            <div class="customer-card__invoices-title">Invoice History</div>
            ${invoiceRows}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach toggle events
  container.querySelectorAll('[data-toggle]').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't toggle when clicking the View Detail button
      if (e.target.closest('.btn-view-detail')) return;
      header.closest('.customer-card').classList.toggle('expanded');
    });
  });

  // Attach "View Detail" button events
  container.querySelectorAll('.btn-view-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.customerKey;
      const cust = allCustomers.find(c => c.name.toLowerCase() === key);
      if (cust) openCustomerDetailModal(cust);
    });
  });

  // Attach invoice row click events
  container.querySelectorAll('.invoice-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const invoiceId = parseInt(row.dataset.invoiceId);
      openInvoiceModal(invoiceId);
    });
  });
}

// ─── Customer Detail Modal (View / Edit / Re-save) ──────────
let currentDetailCustomer = null;

function openCustomerDetailModal(cust) {
  currentDetailCustomer = cust;
  const overlay = document.getElementById('detail-modal-overlay');

  // Get latest invoice for contact info
  const latest = cust.invoices[0]; // invoices come from getInvoices ORDER BY id DESC

  // Populate read-only view
  document.getElementById('detail-avatar').textContent = getInitials(cust.name);
  document.getElementById('detail-name').textContent = cust.name;
  document.getElementById('detail-since').textContent = 'Customer since ' + formatDateShort(cust.invoices[cust.invoices.length - 1]?.created_at);

  document.getElementById('detail-phone-val').textContent = cust.phone || '—';
  document.getElementById('detail-email-val').textContent = cust.email || '—';
  document.getElementById('detail-address-val').textContent = cust.address || '—';

  document.getElementById('detail-total-invoices').textContent = cust.invoiceCount;
  document.getElementById('detail-total-spent').textContent = '₹ ' + cust.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  // Total dues is already shown in the header pill id="detail-due-val"
  document.getElementById('detail-last-visit').textContent = formatDate(cust.lastDate);

  const avgVal = cust.invoiceCount > 0 ? (cust.totalAmount / cust.invoiceCount) : 0;
  document.getElementById('detail-avg-order').textContent = '₹ ' + avgVal.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Update Header Due Pill
  const duePill = document.getElementById('detail-due-pill');
  const markPaidBtn = document.getElementById('btn-mark-paid');

  duePill.style.display = 'flex';
  document.getElementById('detail-due-val').textContent = '₹ ' + (cust.totalDues || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  if (cust.totalDues > 0) {
    duePill.classList.remove('is-paid');
    markPaidBtn.style.display = 'flex';
  } else {
    duePill.classList.add('is-paid');
    markPaidBtn.style.display = 'none';
  }

  // Populate purchase history (what they bought)
  const historyContainer = document.getElementById('detail-purchase-history');
  let historyHTML = '';
  let editHistoryHTML = '';

  // Sort invoices by date/id descending to ensure most recent is on top
  const sortedInvoices = [...cust.invoices].sort((a, b) => b.id - a.id);

  sortedInvoices.forEach(inv => {
    const dateStr = formatDateShort(inv.created_at);
    const invTotal = inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const invNum = inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id}`;

    // View Mode Items
    const itemsViewHTML = (inv.items && inv.items.length > 0)
      ? inv.items.map((it, idx) => `
          <div class="purchase-item">
            <span class="purchase-item__num">${idx + 1}</span>
            <span class="purchase-item__name">${escapeHtml(it.product)}</span>
            <span class="purchase-item__qty">${it.qty} × ₹${it.price.toLocaleString('en-IN')}</span>
            <span class="purchase-item__total">₹${(it.qty * it.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        `).join('')
      : '<div class="purchase-item purchase-item--empty">No items recorded</div>';

    // Edit Mode Items (Inputs)
    const itemsEditHTML = (inv.items && inv.items.length > 0)
      ? inv.items.map((it, idx) => `
          <div class="purchase-item editable-row" data-invoice-id="${inv.id}">
            <span class="purchase-item__num">${idx + 1}</span>
            <input type="text" class="purchase-item-input purchase-item-input--name" value="${escapeHtml(it.product)}" placeholder="Product Name">
            <input type="number" class="purchase-item-input purchase-item-input--qty" value="${it.qty}" placeholder="Qty">
            <input type="number" class="purchase-item-input purchase-item-input--price" value="${it.price}" step="0.01" placeholder="Price">
            <button class="btn-remove-item" title="Remove Item" onclick="this.closest('.purchase-item').remove()">
              <span class="material-icons-round">close</span>
            </button>
          </div>
        `).join('')
      : '<div class="purchase-item purchase-item--empty">No items recorded</div>';

    historyHTML += `
      <div class="purchase-invoice-block">
        <div class="purchase-invoice-header">
          <div class="purchase-invoice-header__left">
            <span class="purchase-invoice-id">${invNum}</span>
            <span class="purchase-invoice-date">${dateStr}</span>
          </div>
          <div style="text-align: right;">
            <span class="detail-item__label" style="margin-bottom: 0;">Total Amount</span>
            <span class="purchase-invoice-total">₹ ${invTotal}</span>
          </div>
        </div>
        <div class="purchase-items-list">
          <div class="detail-section__title" style="font-size: 0.6rem; margin-bottom: 8px;">
            <span class="material-icons-round" style="font-size: 14px;">shopping_cart</span>
            Products List
          </div>
          ${itemsViewHTML}
        </div>
      </div>
    `;

    editHistoryHTML += `
      <div class="purchase-invoice-block" data-invoice-id="${inv.id}">
        <div class="purchase-invoice-header">
          <div class="purchase-invoice-header__left">
            <span class="purchase-invoice-id">${invNum}</span>
            <span class="purchase-invoice-date">${dateStr}</span>
          </div>
          <div style="text-align: right;">
            <span class="detail-item__label" style="margin-bottom: 0;">Total Amount</span>
            <span class="purchase-invoice-total">₹ ${invTotal}</span>
          </div>
        </div>
        <div class="purchase-items-list edit-items-container">
          <div class="detail-section__title" style="font-size: 0.6rem; margin-bottom: 8px;">
            <span class="material-icons-round" style="font-size: 14px;">edit_note</span>
            Edit Products
          </div>
          ${itemsEditHTML}
        </div>
      </div>
    `;
  });

  if (!historyHTML) historyHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No purchase history</p>';
  if (!editHistoryHTML) editHistoryHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No purchase history</p>';

  historyContainer.innerHTML = historyHTML;

  const editHistoryContainer = document.getElementById('detail-edit-purchase-history');
  if (editHistoryContainer) {
    editHistoryContainer.innerHTML = historyHTML;
  }

  // Populate edit form fields
  document.getElementById('edit-name').value = cust.name;
  document.getElementById('edit-phone').value = cust.phone || '';
  document.getElementById('edit-email').value = cust.email || '';
  document.getElementById('edit-address').value = cust.address || '';

  // Ensure we're in view mode
  setDetailMode('view');
  overlay.classList.add('show');
}

function setDetailMode(mode) {
  const viewSection = document.getElementById('detail-view-section');
  const editSection = document.getElementById('detail-edit-section');
  const editBtn = document.getElementById('detail-edit-btn');
  const saveBtn = document.getElementById('detail-save-btn');
  const cancelBtn = document.getElementById('detail-cancel-btn');

  if (mode === 'edit') {
    viewSection.style.display = 'none';
    editSection.style.display = 'block';
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-flex';
    cancelBtn.style.display = 'inline-flex';
  } else {
    viewSection.style.display = 'block';
    editSection.style.display = 'none';
    editBtn.style.display = 'inline-flex';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal-overlay').classList.remove('show');
  currentDetailCustomer = null;
}

// Edit button
document.getElementById('detail-edit-btn').addEventListener('click', () => {
  setDetailMode('edit');
});

// Cancel edit
document.getElementById('detail-cancel-btn').addEventListener('click', () => {
  // Reset fields
  if (currentDetailCustomer) {
    document.getElementById('edit-name').value = currentDetailCustomer.name;
    document.getElementById('edit-phone').value = currentDetailCustomer.phone || '';
    document.getElementById('edit-email').value = currentDetailCustomer.email || '';
    document.getElementById('edit-address').value = currentDetailCustomer.address || '';
  }
  setDetailMode('view');
});

// Save button — updates all invoices for this customer
document.getElementById('detail-save-btn').addEventListener('click', async () => {
  if (!currentDetailCustomer) return;

  const newName = document.getElementById('edit-name').value.trim();
  const newPhone = document.getElementById('edit-phone').value.trim();
  const newEmail = document.getElementById('edit-email').value.trim();
  const newAddress = document.getElementById('edit-address').value.trim();

  if (!newName) {
    showToast('Customer name cannot be empty', true);
    return;
  }

  // Phone length validation removed to support up to 25 digits as per latest requirements.

  const saveBtn = document.getElementById('detail-save-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="material-icons-round spinner">sync</span> Saving...';

  try {
    // Update all invoices for this customer
    const invoiceIds = currentDetailCustomer.invoices.map(inv => inv.id);
    const result = await window.api.updateCustomerDetails({
      invoiceIds,
      customerName: newName,
      phone: newPhone,
      email: newEmail,
      address: newAddress
    });

    if (result.success) {
      // 2. Update Invoice Items if any
      const editBlocks = document.querySelectorAll('#detail-edit-purchase-history .purchase-invoice-block');
      for (const block of editBlocks) {
        const invId = parseInt(block.dataset.invoiceId);
        const rows = block.querySelectorAll('.editable-row');
        const items = [];

        rows.forEach(row => {
          const name = row.querySelector('.purchase-item-input--name').value.trim();
          const qty = parseInt(row.querySelector('.purchase-item-input--qty').value) || 0;
          const price = parseFloat(row.querySelector('.purchase-item-input--price').value) || 0;

          if (name) {
            items.push({ product: name, qty, price });
          }
        });

        // Always update the invoice, even if items are empty (in case user deleted all items)
        await window.api.updateInvoiceItems(invId, items);
      }

      showToast('Customer and product details saved successfully!');
      closeDetailModal();
      // Reload the customer list to reflect changes
      await loadCustomers();
    } else {
      showToast('Failed to save: ' + (result.error || 'Unknown error'), true);
    }
  } catch (err) {
    console.error('Save error:', err);
    showToast('Error saving customer details', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="material-icons-round">save</span> Save Changes';
  }
});

// Close detail modal events
document.getElementById('detail-modal-close').addEventListener('click', closeDetailModal);
document.getElementById('detail-modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDetailModal();
});

// PDF Download button — generates exact same invoice PDF using the most recent invoice
document.getElementById('detail-pdf-btn').addEventListener('click', async () => {
  if (!currentDetailCustomer) return;

  const pdfBtn = document.getElementById('detail-pdf-btn');
  pdfBtn.disabled = true;
  pdfBtn.innerHTML = '<span class="material-icons-round spinner">sync</span> Generating...';

  try {
    // Use the most recent invoice (first in the list since sorted DESC)
    const latestInvoice = currentDetailCustomer.invoices[0];
    if (!latestInvoice) {
      showToast('No invoice found for this customer', true);
      return;
    }

    // Collect all items from the latest invoice
    const items = latestInvoice.items || [];

    const result = await window.api.downloadInvoicePdf({
      customerName: latestInvoice.customer_name,
      phone: latestInvoice.phone_number || '',
      email: latestInvoice.email || '',
      address: latestInvoice.billing_address || '',
      invoiceNumber: latestInvoice.invoice_number || latestInvoice.id,
      paidAmount: latestInvoice.paid_amount || 0,
      dueAmount: latestInvoice.due_amount || 0,
      items: items.map(it => ({
        product: it.product,
        qty: it.qty,
        price: it.price,
        gstPercent: it.gst_percent || it.gstPercent || 0
      }))
    });

    if (result.success) {
      showToast('PDF downloaded successfully!');
    } else {
      showToast('PDF generation failed: ' + (result.error || 'Unknown error'), true);
    }
  } catch (err) {
    console.error('PDF download error:', err);
    showToast('Error generating PDF', true);
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.innerHTML = '<span class="material-icons-round">picture_as_pdf</span> Download PDF';
  }
});

// ─── Invoice Detail Modal (PDF View) ─────────────────────────
let currentPdfInvoiceId = null;
let currentPdfPath = null;

async function openInvoiceModal(invoiceId) {
  currentPdfInvoiceId = invoiceId;
  const modal = document.getElementById('invoice-pdf-modal');
  const body = document.getElementById('invoice-pdf-modal-body');
  const loading = document.getElementById('invoice-pdf-loading');

  modal.classList.add('show');
  loading.style.display = 'flex';
  body.querySelectorAll('embed').forEach(e => e.remove());

  // Find invoice data
  let invoice = null;
  for (const cust of allCustomers) {
    invoice = cust.invoices.find(i => i.id === invoiceId);
    if (invoice) break;
  }
  if (!invoice) {
    body.innerHTML = '<p style="color: var(--accent-rose); text-align: center; padding: 40px;">Invoice not found.</p>';
    return;
  }

  document.getElementById('invoice-pdf-modal-title').textContent = `Invoice Detail — ${invoice.customer_name}`;
  document.getElementById('invoice-pdf-due-amount').textContent = `₹${(invoice.due_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const paidBtn = document.getElementById('btn-invoice-pdf-paid');
  if ((invoice.due_amount || 0) > 0) {
    paidBtn.style.display = 'inline-flex';
  } else {
    paidBtn.style.display = 'none';
  }

  // Generate and display PDF
  try {
    const pdfResult = await window.api.downloadInvoicePdf({
      customerName: invoice.customer_name,
      phone: invoice.phone_number,
      email: invoice.email,
      address: invoice.billing_address,
      invoiceNumber: invoice.invoice_number || invoice.id,
      totalAmount: invoice.total_amount,
      discount: invoice.discount || 0,
      paidAmount: invoice.paid_amount || 0,
      dueAmount: invoice.due_amount || 0,
      items: invoice.items.map(item => ({
        product: item.product,
        qty: item.qty,
        price: item.price,
        gstPercent: item.gst_percent || 0
      }))
    });

    if (pdfResult.success) {
      currentPdfPath = pdfResult.filePath;
      const readResult = await window.api.readInvoicePdf(pdfResult.filePath);
      if (readResult.success) {
        const blob = new Blob([readResult.data], { type: 'application/pdf' });
        const dataUrl = URL.createObjectURL(blob);
        loading.style.display = 'none';
        body.innerHTML += `<embed src="${dataUrl}" type="application/pdf" style="width: 100%; height: 100%; border-radius: 8px;">`;
      } else {
        throw new Error('Failed to read generated PDF');
      }
    } else {
      throw new Error(pdfResult.error || 'PDF generation failed');
    }
  } catch (err) {
    loading.style.display = 'none';
    body.innerHTML = `<p style="color: var(--accent-rose); text-align: center; padding: 40px;">Error: ${err.message}</p>`;
  }
}

// PDF Modal Listeners
document.getElementById('btn-invoice-pdf-close').addEventListener('click', () => {
  document.getElementById('invoice-pdf-modal').classList.remove('show');
});
document.getElementById('btn-invoice-pdf-close-bottom').addEventListener('click', () => {
  document.getElementById('invoice-pdf-modal').classList.remove('show');
});
document.getElementById('btn-invoice-pdf-back').addEventListener('click', () => {
  document.getElementById('invoice-pdf-modal').classList.remove('show');
});

document.getElementById('btn-invoice-pdf-download').addEventListener('click', async () => {
  if (currentPdfInvoiceId) {
    // Find invoice data
    let invoice = null;
    for (const cust of allCustomers) {
      invoice = cust.invoices.find(i => i.id === currentPdfInvoiceId);
      if (invoice) break;
    }

    if (invoice) {
      const pdfResult = await window.api.downloadInvoicePdf({
        customerName: invoice.customer_name,
        phone: invoice.phone_number,
        email: invoice.email,
        address: invoice.billing_address,
        invoiceNumber: invoice.invoice_number || invoice.id,
        totalAmount: invoice.total_amount,
        discount: invoice.discount || 0,
        paidAmount: invoice.paid_amount || 0,
        dueAmount: invoice.due_amount || 0,
        items: invoice.items.map(item => ({
          product: item.product,
          qty: item.qty,
          price: item.price,
          gstPercent: item.gst_percent || 0
        }))
      });

      if (pdfResult.success) {
        currentPdfPath = pdfResult.filePath;
        await window.api.showItemInFolder(currentPdfPath);
        showToast('PDF Downloaded successfully!');
      } else {
        showToast('Failed to generate PDF: ' + pdfResult.error, true);
      }
    }
  }
});

document.getElementById('btn-invoice-pdf-delete').addEventListener('click', async () => {
  if (!currentPdfInvoiceId) return;
  if (confirm('Are you sure you want to delete this invoice?')) {
    const result = await window.api.deleteInvoice(currentPdfInvoiceId);
    if (result.success) {
      document.getElementById('invoice-pdf-modal').classList.remove('show');
      await loadCustomers();
    } else {
      alert('Error deleting invoice: ' + result.error);
    }
  }
});

document.getElementById('btn-invoice-pdf-edit').addEventListener('click', () => {
  if (!currentPdfInvoiceId) return;
  document.getElementById('invoice-pdf-modal').classList.remove('show');
  openInvoiceEditModal(currentPdfInvoiceId);
});

document.getElementById('btn-invoice-pdf-paid').addEventListener('click', async () => {
  if (!currentPdfInvoiceId) return;
  if (confirm('Mark this invoice as fully paid?')) {
    const result = await window.api.clearInvoiceDues(currentPdfInvoiceId);
    if (result.success) {
      showToast('Invoice marked as paid!');
      await loadCustomers(); // Refresh all data including in-memory allCustomers
      openInvoiceModal(currentPdfInvoiceId); // Refresh PDF view
    } else {
      showToast('Error: ' + result.error, true);
    }
  }
});

// ─── Invoice Edit Modal (Old Table Style) ───────────────────
async function openInvoiceEditModal(invoiceId) {
  currentEditingInvoiceId = invoiceId;
  const overlay = document.getElementById('modal-overlay');

  // Ensure we're in edit mode
  setInvoiceEditMode('edit');

  // Find the invoice data
  let invoice = null;
  for (const cust of allCustomers) {
    invoice = cust.invoices.find(i => i.id === invoiceId);
    if (invoice) break;
  }
  if (!invoice) return;

  document.getElementById('modal-invoice-id').textContent = '#' + invoice.id;
  document.getElementById('modal-customer').textContent = invoice.customer_name;

  // New details
  const phoneVal = invoice.phone_number || '—';
  const emailVal = invoice.email || '—';
  const addressVal = invoice.billing_address || '—';

  document.getElementById('modal-phone').textContent = phoneVal;
  document.getElementById('modal-email').textContent = emailVal;
  document.getElementById('modal-address').textContent = addressVal;

  document.getElementById('modal-date').textContent = formatDate(invoice.created_at);
  document.getElementById('modal-amount').textContent = '₹ ' + invoice.total_amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2
  });
  document.getElementById('modal-total').textContent = '₹ ' + invoice.total_amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2
  });

  const itemsBody = document.getElementById('modal-items-body');

  if (invoice.items && invoice.items.length > 0) {
    // Note: setInvoiceEditMode('edit') will be called after this in some flows, 
    // but here we need to populate the rows first so setInvoiceEditMode can convert them to inputs.
    itemsBody.innerHTML = invoice.items.map((item, idx) => {
      const itemTotal = item.qty * item.price;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(item.product)}</td>
          <td>${item.qty}</td>
          <td>₹ ${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>₹ ${itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    // Now convert them to inputs since we are in edit mode
    setInvoiceEditMode('edit');
  } else {
    itemsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No items</td></tr>';
  }

  overlay.classList.add('show');
}

function setInvoiceEditMode(mode) {
  const editBtn = document.getElementById('invoice-edit-btn');
  const footer = document.getElementById('invoice-edit-footer');
  const itemsBody = document.getElementById('modal-items-body');

  if (mode === 'edit') {
    if (editBtn) editBtn.style.display = 'none';
    if (footer) footer.style.display = 'flex';

    // Turn table rows into inputs
    const rows = itemsBody.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) return; // Skip "No items" row

      const productName = cells[1].textContent;
      const qty = cells[2].textContent;
      const price = cells[3].textContent.replace('₹ ', '').replace(/,/g, '');

      cells[1].innerHTML = `<input type="text" class="table-input" value="${escapeHtml(productName)}" style="padding: 4px 8px; font-size: 0.85rem;">`;
      cells[2].innerHTML = `<input type="number" class="table-input" value="${qty}" style="padding: 4px 8px; font-size: 0.85rem; text-align: right;">`;
      cells[3].innerHTML = `<input type="number" class="table-input" value="${price}" step="0.01" style="padding: 4px 8px; font-size: 0.85rem; text-align: right;">`;
    });
  } else {
    if (editBtn) editBtn.style.display = 'inline-flex';
    if (footer) footer.style.display = 'none';
  }
}

// Edit Invoice button (on the old modal if visible)
if (document.getElementById('invoice-edit-btn')) {
  document.getElementById('invoice-edit-btn').addEventListener('click', () => {
    setInvoiceEditMode('edit');
  });
}

// Cancel Invoice edit

document.getElementById('invoice-cancel-btn').addEventListener('click', () => {
  if (currentEditingInvoiceId) {
    document.getElementById('modal-overlay').classList.remove('show');
    openInvoiceModal(currentEditingInvoiceId);
  }
});

// Save Invoice edit
document.getElementById('invoice-save-btn').addEventListener('click', async () => {
  if (!currentEditingInvoiceId) return;

  const itemsBody = document.getElementById('modal-items-body');
  const rows = itemsBody.querySelectorAll('tr');
  const newItems = [];

  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    if (inputs.length === 3) {
      newItems.push({
        product: inputs[0].value.trim(),
        qty: parseInt(inputs[1].value) || 0,
        price: parseFloat(inputs[2].value) || 0
      });
    }
  });

  if (newItems.length === 0) {
    showToast('Invoice must have at least one item', true);
    return;
  }

  const saveBtn = document.getElementById('invoice-save-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="material-icons-round spinner">sync</span> Saving...';

  try {
    const result = await window.api.updateInvoiceItems(currentEditingInvoiceId, newItems);
    if (result.success) {
      showToast('Invoice updated successfully!');
      await loadCustomers(); // Refresh data
      openInvoiceModal(currentEditingInvoiceId); // Back to view mode with new data
    } else {
      showToast('Update failed: ' + result.error, true);
    }
  } catch (err) {
    console.error('Update items error:', err);
    showToast('Error updating invoice items', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="material-icons-round">save</span> Save Changes';
  }
});

// ─── Close Invoice Modal ────────────────────────────────────
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeDetailModal();
  }
});

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

// ─── Search & Filters ───────────────────────────────────────
let searchTimer = null;
document.getElementById('search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applyFilters(), 150);
});



document.getElementById('filter-dues').addEventListener('click', () => {
  currentView = 'invoices';
  currentFilter = 'dues';
  document.getElementById('filter-dues').classList.add('is-active');
  document.getElementById('summary-invoices').classList.remove('is-active');
  applyFilters();
});

document.getElementById('summary-invoices').addEventListener('click', () => {
  currentView = 'invoices';
  currentFilter = 'all';
  document.getElementById('filter-dues').classList.remove('is-active');
  document.getElementById('summary-invoices').classList.add('is-active');
  applyFilters();
});

// ─── Toast ──────────────────────────────────────────────────
function showToast(message, isError = false) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' toast--error' : '');
  toast.innerHTML = `
    <span class="material-icons-round toast__icon">${isError ? 'error_outline' : 'check_circle'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ─── Utilities ──────────────────────────────────────────────
function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) + ', ' + d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
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
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Mark Paid Shortcut ─────────────────────────────────────
document.getElementById('btn-mark-paid').addEventListener('click', async () => {
  if (!currentDetailCustomer) return;

  const confirmed = confirm(`Are you sure you want to mark all pending dues as PAID for ${currentDetailCustomer.name}?`);
  if (!confirmed) return;

  const btn = document.getElementById('btn-mark-paid');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Clearing...';

  try {
    // We use name and phone for accurate identification
    const result = await window.api.clearCustomerDues(currentDetailCustomer.name, currentDetailCustomer.phone);

    if (result && result.success) {
      // Reload everything to refresh UI
      await loadCustomers();

      // Update the current modal view if the customer is still the same
      const updatedCust = allCustomers.find(c => c.name.toLowerCase() === currentDetailCustomer.name.toLowerCase());
      if (updatedCust) {
        openCustomerDetailModal(updatedCust);
      } else {
        document.getElementById('detail-modal-overlay').classList.remove('show');
      }

      alert('All dues cleared successfully!');
    } else {
      alert('Failed to clear dues: ' + (result?.error || 'Unknown error'));
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  } catch (error) {
    alert('Error clearing dues: ' + error.message);
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

// ─── Init ───────────────────────────────────────────────────
loadCustomers();

// Auto-refresh when Shopify orders are synced or updated
if (window.api.onShopifyOrdersSynced) {
  window.api.onShopifyOrdersSynced((data) => {
    console.log('[Shopify Sync] Orders synced/updated — refreshing customer list...', data);
    loadCustomers();
  });
}
