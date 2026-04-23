/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Customer Directory Logic
   ════════════════════════════════════════════════════════════ */

let allCustomers = []; // { name, invoices: [...], totalAmount, invoiceCount, lastDate, phone, email, address, totalDues }
let currentFilter = 'all'; // 'all' or 'dues'
let currentView = 'invoices'; // 'customers' or 'invoices'

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

    // Load items for each invoice
    const invoicesWithItems = await Promise.all(
      invoices.map(async (inv) => {
        const itemsResult = await window.api.getInvoiceItems(inv.id);
        return {
          ...inv,
          items: itemsResult.success ? itemsResult.items : []
        };
      })
    );

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
    <div class="invoice-directory-table" style="width:100%; background: rgba(18, 20, 45, 0.4); border-radius: 16px; border: 1px solid var(--border-subtle); overflow: hidden;">
      <div class="table-header" style="display: grid; grid-template-columns: 140px 1fr 150px 140px 80px; padding: 16px 24px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-subtle); font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">
        <div>Invoice No.</div>
        <div>Customer Name</div>
        <div style="text-align: right;">Amount</div>
        <div style="text-align: center;">Action</div>
        <div style="text-align: center;">Delete</div>
      </div>
      <div id="invoice-rows-container">
        ${invoices.map(inv => {
          const invNum = inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id}`;
          const amountStr = inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
          return `
            <div class="invoice-directory-row" style="display: grid; grid-template-columns: 140px 1fr 150px 140px 80px; padding: 14px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center; transition: background 0.2s ease;">
              <div style="font-weight: 800; color: var(--accent-cyan); font-family: 'Outfit', sans-serif;">${invNum}</div>
              <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(inv.customer_name)}</div>
              <div style="text-align: right; font-weight: 700; color: var(--text-primary); font-family: 'Outfit', sans-serif;">₹ ${amountStr}</div>
              <div style="text-align: center;">
                <button onclick="openCustomerByName('${escapeHtml(inv.customer_name)}')" style="background: var(--accent-cyan-dim); color: var(--accent-cyan); border: 1px solid rgba(0, 229, 255, 0.2); padding: 6px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; transition: all 0.2s ease;" onmouseover="this.style.background='var(--accent-cyan)'; this.style.color='#000'" onmouseout="this.style.background='var(--accent-cyan-dim)'; this.style.color='var(--accent-cyan)'">
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
  document.getElementById('detail-total-dues').textContent = '₹ ' + (cust.totalDues || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
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

  // Sort invoices by date/id descending to ensure most recent is on top
  const sortedInvoices = [...cust.invoices].sort((a, b) => b.id - a.id);

  sortedInvoices.forEach(inv => {
    const dateStr = formatDateShort(inv.created_at);
    const invTotal = inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const invNum = inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id}`;

    historyHTML += `
      <div class="purchase-invoice-block" style="margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; overflow: hidden;">
        <div class="purchase-invoice-header" style="padding: 12px 16px; background: rgba(255,255,255,0.02); display: flex; align-items: center; justify-content: space-between;">
          <div class="purchase-invoice-header__left" style="display: flex; align-items: center; gap: 12px;">
            <span class="purchase-invoice-id" style="font-weight: 800; color: var(--accent-cyan); font-family: 'Outfit', sans-serif;">${invNum}</span>
            <span class="purchase-invoice-customer" style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(cust.name)}</span>
            <span class="purchase-invoice-date" style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px;">${dateStr}</span>
          </div>
          <span class="purchase-invoice-total" style="font-weight: 800; color: var(--accent-emerald); font-family: 'Outfit', sans-serif;">₹ ${invTotal}</span>
        </div>
      </div>
    `;
  });

  historyContainer.innerHTML = historyHTML || '<p style="color:var(--text-muted);text-align:center;padding:16px;">No purchase history</p>';

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

  if (newPhone && newPhone.length !== 10) {
    showToast('Phone number must be exactly 10 digits', true);
    document.getElementById('edit-phone').focus();
    return;
  }

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
      showToast('Customer details saved successfully!');
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
        price: it.price
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

// ─── Invoice Detail Modal ───────────────────────────────────
async function openInvoiceModal(invoiceId) {
  const overlay = document.getElementById('modal-overlay');

  // Find the invoice data from allCustomers
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
  } else {
    itemsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No items</td></tr>';
  }

  overlay.classList.add('show');
}

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
document.getElementById('search-input').addEventListener('input', () => {
  applyFilters();
});



document.getElementById('filter-dues').addEventListener('click', () => {
  currentView = 'customers';
  currentFilter = 'dues';
  document.getElementById('filter-dues').classList.add('is-active');
  document.getElementById('summary-invoices').classList.remove('is-active');
  applyFilters();
});

document.getElementById('summary-invoices').addEventListener('click', () => {
  currentView = 'invoices';
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
