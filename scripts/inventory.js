/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Inventory Management Logic
   ════════════════════════════════════════════════════════════ */

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById('header-date');
  const timeEl = document.getElementById('header-time');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}
updateClock();
setInterval(updateClock, 1000);

// ─── Navigation ─────────────────────────────────────────────
document.getElementById('btn-back').addEventListener('click', () => window.location.href = 'home.html');

// ─── Toast ──────────────────────────────────────────────────
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-message');
  msg.textContent = message;
  icon.textContent = isError ? 'error' : 'check_circle';
  toast.className = isError ? 'toast toast--error show' : 'toast show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Helpers ────────────────────────────────────────────────
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function fmt(n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } }
function fmtDateTime(d) { if (!d) return '—'; try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return d; } }

const movementIcons = { PURCHASE: 'add_shopping_cart', SALE: 'point_of_sale', RETURN: 'assignment_return', DAMAGE: 'broken_image', LOST: 'search_off', ADJUSTMENT: 'tune', TRANSFER: 'swap_horiz' };
const movementColors = { PURCHASE: 'purchase', SALE: 'sale', RETURN: 'return', DAMAGE: 'damage', LOST: 'lost', ADJUSTMENT: 'adjustment', TRANSFER: 'adjustment' };

// ─── Tab System ─────────────────────────────────────────────
const tabs = document.querySelectorAll('.inv-tab');
const panels = document.querySelectorAll('.inv-panel');
let currentTab = 'dashboard';

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${target}`).classList.add('active');
    currentTab = target;
    if (target === 'dashboard') loadDashboard();
    if (target === 'products') loadProducts();
    if (target === 'items') loadItems();
    if (target === 'scan') document.getElementById('barcode-input').focus();
  });
});

// ═══════════════════════════════════════════════════════════
// ─── DASHBOARD ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

async function loadDashboard() {
  const result = await window.api.inventoryGetDashboard();
  if (!result.success) return showToast('Failed to load dashboard', true);
  const d = result.data;

  // Stat cards
  document.getElementById('dash-stats').innerHTML = `
    <div class="dash-stat dash-stat--products">
      <div class="dash-stat__icon"><span class="material-icons-round">category</span></div>
      <div class="dash-stat__value">${d.counts.totalProducts}</div>
      <div class="dash-stat__label">Products</div>
    </div>
    <div class="dash-stat dash-stat--total">
      <div class="dash-stat__icon"><span class="material-icons-round">inventory_2</span></div>
      <div class="dash-stat__value">${d.counts.totalItems}</div>
      <div class="dash-stat__label">Total Items</div>
    </div>
    <div class="dash-stat dash-stat--stock">
      <div class="dash-stat__icon"><span class="material-icons-round">check_circle</span></div>
      <div class="dash-stat__value">${d.counts.inStock}</div>
      <div class="dash-stat__label">In Stock</div>
    </div>
    <div class="dash-stat dash-stat--sold">
      <div class="dash-stat__icon"><span class="material-icons-round">point_of_sale</span></div>
      <div class="dash-stat__value">${d.counts.sold}</div>
      <div class="dash-stat__label">Sold</div>
    </div>
    <div class="dash-stat dash-stat--returned">
      <div class="dash-stat__icon"><span class="material-icons-round">assignment_return</span></div>
      <div class="dash-stat__value">${d.counts.returned}</div>
      <div class="dash-stat__label">Returned</div>
    </div>
    <div class="dash-stat dash-stat--damaged">
      <div class="dash-stat__icon"><span class="material-icons-round">broken_image</span></div>
      <div class="dash-stat__value">${d.counts.damaged}</div>
      <div class="dash-stat__label">Damaged</div>
    </div>
    <div class="dash-stat dash-stat--lost">
      <div class="dash-stat__icon"><span class="material-icons-round">search_off</span></div>
      <div class="dash-stat__value">${d.counts.lost}</div>
      <div class="dash-stat__label">Lost</div>
    </div>
  `;

  // Financial values
  document.getElementById('dash-values').innerHTML = `
    <h3 class="dash-card__title"><span class="material-icons-round">account_balance</span> Financial Overview</h3>
    <div class="dash-card__body">
      <div class="value-row"><span class="value-row__label">Inventory Value (Cost)</span><span class="value-row__amount">₹${fmt(d.values.inventoryValue)}</span></div>
      <div class="value-row"><span class="value-row__label">Potential Selling Value</span><span class="value-row__amount">₹${fmt(d.values.sellingValue)}</span></div>
      <div class="value-row"><span class="value-row__label">Expected Profit</span><span class="value-row__amount value-row__amount--positive">₹${fmt(d.values.expectedProfit)}</span></div>
      <div class="value-row"><span class="value-row__label">Realized Revenue</span><span class="value-row__amount">₹${fmt(d.values.soldValue)}</span></div>
      <div class="value-row"><span class="value-row__label">Realized Profit</span><span class="value-row__amount ${d.values.realizedProfit >= 0 ? 'value-row__amount--positive' : 'value-row__amount--negative'}">₹${fmt(d.values.realizedProfit)}</span></div>
    </div>
  `;

  // Today's changes
  const todayMap = {};
  d.todayMovements.forEach(m => todayMap[m.movement_type] = m.cnt);
  const todayTotal = d.todayMovements.reduce((s, m) => s + m.cnt, 0);
  document.getElementById('dash-today').innerHTML = `
    <h3 class="dash-card__title"><span class="material-icons-round">today</span> Today's Changes</h3>
    <div class="dash-card__body">
      <div class="value-row"><span class="value-row__label">Total Movements</span><span class="value-row__amount">${todayTotal}</span></div>
      ${todayMap.PURCHASE ? `<div class="value-row"><span class="value-row__label">Purchases</span><span class="value-row__amount value-row__amount--positive">+${todayMap.PURCHASE}</span></div>` : ''}
      ${todayMap.SALE ? `<div class="value-row"><span class="value-row__label">Sales</span><span class="value-row__amount">${todayMap.SALE}</span></div>` : ''}
      ${todayMap.RETURN ? `<div class="value-row"><span class="value-row__label">Returns</span><span class="value-row__amount">${todayMap.RETURN}</span></div>` : ''}
      ${todayMap.DAMAGE ? `<div class="value-row"><span class="value-row__label">Damaged</span><span class="value-row__amount value-row__amount--negative">${todayMap.DAMAGE}</span></div>` : ''}
      ${todayMap.LOST ? `<div class="value-row"><span class="value-row__label">Lost</span><span class="value-row__amount value-row__amount--negative">${todayMap.LOST}</span></div>` : ''}
      ${todayTotal === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No inventory activity today.</p>' : ''}
    </div>
  `;

  // Fast movers
  const fastBody = document.querySelector('#dash-fast-movers .dash-card__body');
  fastBody.innerHTML = d.fastMovers.length ? d.fastMovers.map(m => `
    <div class="mover-item"><div><div class="mover-item__name">${esc(m.name)}</div><div class="mover-item__brand">${esc(m.brand || '')}</div></div><div class="mover-item__count">${m.sale_count} sold</div></div>
  `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">No sales in the last 30 days.</p>';

  // Slow movers
  const slowBody = document.querySelector('#dash-slow-movers .dash-card__body');
  slowBody.innerHTML = d.slowMovers.length ? d.slowMovers.map(m => `
    <div class="mover-item"><div><div class="mover-item__name">${esc(m.name)}</div><div class="mover-item__brand">${esc(m.brand || '')}</div></div><div class="mover-item__count">${m.in_stock} in stock</div></div>
  `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">No slow-moving products.</p>';

  // Low stock
  const lowBody = document.querySelector('#dash-low-stock .dash-card__body');
  lowBody.innerHTML = d.lowStockProducts.length ? d.lowStockProducts.map(m => `
    <div class="mover-item"><div><div class="mover-item__name">${esc(m.name)}</div><div class="mover-item__brand">${esc(m.brand || '')}</div></div><div class="mover-item__count" style="color:var(--accent-rose);">${m.in_stock} left</div></div>
  `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">No low-stock products.</p>';

  // Recent activity
  const actBody = document.getElementById('dash-activity-body');
  actBody.innerHTML = d.recentActivity.length ? d.recentActivity.map(a => `
    <div class="activity-item">
      <div class="activity-item__icon activity-item__icon--${movementColors[a.movement_type] || 'adjustment'}">
        <span class="material-icons-round">${movementIcons[a.movement_type] || 'tune'}</span>
      </div>
      <div class="activity-item__content">
        <div class="activity-item__text"><strong>${a.movement_type}</strong> — ${esc(a.product_name)} (${esc(a.barcode)})</div>
        <div class="activity-item__meta">${a.remarks ? esc(a.remarks) + ' • ' : ''}${fmtDateTime(a.created_at)}</div>
      </div>
    </div>
  `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;padding:12px 0;">No inventory activity yet.</p>';
}

// ═══════════════════════════════════════════════════════════
// ─── PRODUCTS ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

let productsCache = [];

async function loadProducts() {
  const search = document.getElementById('product-search').value;
  const category = document.getElementById('filter-category').value;
  const brand = document.getElementById('filter-brand').value;

  const result = await window.api.inventoryGetProducts({ search, category, brand });
  if (!result.success) return showToast('Failed to load products', true);

  productsCache = result.products;

  // Populate filter dropdowns (preserve selection)
  const catSelect = document.getElementById('filter-category');
  const brandSelect = document.getElementById('filter-brand');
  const curCat = catSelect.value;
  const curBrand = brandSelect.value;

  catSelect.innerHTML = '<option value="">All Categories</option>' + result.categories.map(c => `<option value="${esc(c)}" ${c === curCat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  brandSelect.innerHTML = '<option value="">All Brands</option>' + result.brands.map(b => `<option value="${esc(b)}" ${b === curBrand ? 'selected' : ''}>${esc(b)}</option>`).join('');

  const tbody = document.getElementById('products-tbody');
  const empty = document.getElementById('products-empty');

  if (result.products.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('products-table').style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  document.getElementById('products-table').style.display = '';

  tbody.innerHTML = result.products.map(p => `
    <tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.brand || '—')}</td>
      <td>${esc(p.category || '—')}</td>
      <td>₹${fmt(p.purchase_price)}</td>
      <td>₹${fmt(p.selling_price)}</td>
      <td>${p.gst_percent || 0}%</td>
      <td><span class="status-badge status-badge--in_stock">${p.in_stock}</span></td>
      <td>${p.total_items}</td>
      <td>
        <div class="inv-actions">
          <button class="inv-action-btn" title="View Details" onclick="viewProductDetail(${p.id})"><span class="material-icons-round">visibility</span></button>
          <button class="inv-action-btn" title="Edit" onclick="editProduct(${p.id})"><span class="material-icons-round">edit</span></button>
          <button class="inv-action-btn inv-action-btn--danger" title="Delete" onclick="deleteProduct(${p.id})"><span class="material-icons-round">delete</span></button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Search and filter listeners
document.getElementById('product-search').addEventListener('input', debounce(loadProducts, 300));
document.getElementById('filter-category').addEventListener('change', loadProducts);
document.getElementById('filter-brand').addEventListener('change', loadProducts);

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Product Modal ───────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.getElementById('btn-add-product').addEventListener('click', () => {
  document.getElementById('mp-id').value = '';
  document.getElementById('modal-product-title').textContent = 'Add Product';
  ['mp-name', 'mp-brand', 'mp-category', 'mp-prefix', 'mp-purchase', 'mp-selling', 'mp-gst', 'mp-desc'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-product');
});

document.getElementById('modal-product-close').addEventListener('click', () => closeModal('modal-product'));
document.getElementById('mp-cancel').addEventListener('click', () => closeModal('modal-product'));

document.getElementById('mp-save').addEventListener('click', async () => {
  const name = document.getElementById('mp-name').value.trim();
  if (!name) return showToast('Product name is required', true);

  const data = {
    name,
    brand: document.getElementById('mp-brand').value.trim(),
    category: document.getElementById('mp-category').value.trim(),
    barcodePrefix: document.getElementById('mp-prefix').value.trim().toUpperCase(),
    purchasePrice: parseFloat(document.getElementById('mp-purchase').value) || 0,
    sellingPrice: parseFloat(document.getElementById('mp-selling').value) || 0,
    gstPercent: parseFloat(document.getElementById('mp-gst').value) || 0,
    description: document.getElementById('mp-desc').value.trim()
  };

  const editId = document.getElementById('mp-id').value;
  let result;
  if (editId) {
    result = await window.api.inventoryUpdateProduct({ productId: parseInt(editId), ...data });
  } else {
    result = await window.api.inventoryCreateProduct(data);
  }

  if (result.success) {
    showToast(editId ? 'Product updated' : 'Product created');
    closeModal('modal-product');
    loadProducts();
  } else {
    showToast(result.error, true);
  }
});

window.editProduct = function (id) {
  const p = productsCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('mp-id').value = p.id;
  document.getElementById('modal-product-title').textContent = 'Edit Product';
  document.getElementById('mp-name').value = p.name;
  document.getElementById('mp-brand').value = p.brand || '';
  document.getElementById('mp-category').value = p.category || '';
  document.getElementById('mp-prefix').value = p.barcode_prefix || '';
  document.getElementById('mp-purchase').value = p.purchase_price || '';
  document.getElementById('mp-selling').value = p.selling_price || '';
  document.getElementById('mp-gst').value = p.gst_percent || '';
  document.getElementById('mp-desc').value = p.description || '';
  openModal('modal-product');
};

window.deleteProduct = async function (id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  const result = await window.api.inventoryDeleteProduct(id);
  if (result.success) { showToast('Product deleted'); loadProducts(); }
  else showToast(result.error, true);
};

// ── Product Detail Modal ────────────────────────────────────

window.viewProductDetail = async function (id) {
  const result = await window.api.inventoryGetProductDetails(id);
  if (!result.success) return showToast(result.error, true);

  const { product, statusCounts, items, movements, financials } = result;
  document.getElementById('detail-title').textContent = product.name;

  const sc = statusCounts;
  const body = document.getElementById('detail-body');
  body.innerHTML = `
    <div class="detail-stats">
      <div class="detail-stat"><div class="detail-stat__value" style="color:var(--accent-emerald)">${sc.IN_STOCK || 0}</div><div class="detail-stat__label">In Stock</div></div>
      <div class="detail-stat"><div class="detail-stat__value" style="color:var(--accent-cyan)">${sc.SOLD || 0}</div><div class="detail-stat__label">Sold</div></div>
      <div class="detail-stat"><div class="detail-stat__value" style="color:var(--accent-orange)">${sc.RETURNED || 0}</div><div class="detail-stat__label">Returned</div></div>
      <div class="detail-stat"><div class="detail-stat__value" style="color:var(--accent-rose)">${sc.DAMAGED || 0}</div><div class="detail-stat__label">Damaged</div></div>
      <div class="detail-stat"><div class="detail-stat__value" style="color:var(--text-secondary)">${sc.LOST || 0}</div><div class="detail-stat__label">Lost</div></div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat"><div class="detail-stat__value">₹${fmt(financials.stockCost)}</div><div class="detail-stat__label">Stock Cost</div></div>
      <div class="detail-stat"><div class="detail-stat__value">₹${fmt(financials.stockSellingValue)}</div><div class="detail-stat__label">Selling Value</div></div>
      <div class="detail-stat"><div class="detail-stat__value" style="color:var(--accent-emerald)">₹${fmt(financials.profitGenerated)}</div><div class="detail-stat__label">Profit Generated</div></div>
      <div class="detail-stat"><div class="detail-stat__value">${financials.avgStockAgeDays}d</div><div class="detail-stat__label">Avg Stock Age</div></div>
    </div>

    <div class="detail-section">
      <h4 class="detail-section__title"><span class="material-icons-round" style="font-size:18px;color:var(--accent-cyan)">qr_code_2</span> All Items (${items.length})</h4>
      ${items.length ? `
        <div style="max-height:300px;overflow-y:auto;">
          <table class="detail-items-table">
            <thead><tr><th>Barcode</th><th>Status</th><th>Purchase ₹</th><th>Selling ₹</th><th>Purchase Date</th><th>Invoice</th></tr></thead>
            <tbody>
              ${items.map(it => `
                <tr>
                  <td><code style="color:var(--accent-cyan);font-weight:600;">${esc(it.barcode)}</code></td>
                  <td><span class="status-badge status-badge--${it.status.toLowerCase()}">${it.status}</span></td>
                  <td>₹${fmt(it.purchase_price)}</td>
                  <td>₹${fmt(it.selling_price)}</td>
                  <td>${fmtDate(it.purchase_date)}</td>
                  <td>${it.invoice_number ? '#' + it.invoice_number : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p style="color:var(--text-muted);font-size:0.85rem;">No inventory items for this product.</p>'}
    </div>

    <div class="detail-section">
      <h4 class="detail-section__title"><span class="material-icons-round" style="font-size:18px;color:var(--accent-cyan)">history</span> Movement Timeline</h4>
      ${movements.length ? `
        <div class="timeline" style="max-height:300px;overflow-y:auto;">
          ${movements.map(m => `
            <div class="timeline-item">
              <div class="timeline-item__dot timeline-item__dot--${movementColors[m.movement_type] || 'adjustment'}"></div>
              <div class="timeline-item__type" style="color:var(--accent-${m.movement_type === 'PURCHASE' ? 'emerald' : m.movement_type === 'SALE' ? 'cyan' : m.movement_type === 'RETURN' ? 'orange' : m.movement_type === 'DAMAGE' ? 'rose' : 'amber'})">${m.movement_type}</div>
              <div class="timeline-item__remark">${esc(m.barcode)} ${m.remarks ? '— ' + esc(m.remarks) : ''}</div>
              <div class="timeline-item__date">${fmtDateTime(m.created_at)}</div>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:var(--text-muted);font-size:0.85rem;">No movement history.</p>'}
    </div>
  `;

  openModal('modal-detail');
};

document.getElementById('modal-detail-close').addEventListener('click', () => closeModal('modal-detail'));

// ═══════════════════════════════════════════════════════════
// ─── INVENTORY ITEMS ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════

let itemsPage = 1;

async function loadItems() {
  const search = document.getElementById('items-search').value;
  const status = document.getElementById('filter-status').value;

  const result = await window.api.inventoryGetItems({ search, status, page: itemsPage, limit: 50 });
  if (!result.success) return showToast('Failed to load items', true);

  const tbody = document.getElementById('items-tbody');
  const empty = document.getElementById('items-empty');

  if (result.items.length === 0 && itemsPage === 1) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('items-table').style.display = 'none';
    document.getElementById('items-pagination').innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  document.getElementById('items-table').style.display = '';

  tbody.innerHTML = result.items.map(it => `
    <tr>
      <td><code style="color:var(--accent-cyan);font-weight:600;letter-spacing:1px;">${esc(it.barcode)}</code></td>
      <td>${esc(it.product_name)}</td>
      <td>${esc(it.brand || '—')}</td>
      <td><span class="status-badge status-badge--${it.status.toLowerCase()}">${it.status.replace('_', ' ')}</span></td>
      <td>₹${fmt(it.purchase_price)}</td>
      <td>₹${fmt(it.selling_price)}</td>
      <td>${fmtDate(it.purchase_date)}</td>
      <td>
        <div class="inv-actions">
          <button class="inv-action-btn" title="View in scanner" onclick="scanFromTable('${esc(it.barcode)}')"><span class="material-icons-round">search</span></button>
          ${it.status === 'IN_STOCK' ? `<button class="inv-action-btn inv-action-btn--warning" title="Mark Damaged" onclick="quickStatus(${it.id},'DAMAGED')"><span class="material-icons-round">broken_image</span></button>` : ''}
          ${it.status === 'SOLD' ? `<button class="inv-action-btn inv-action-btn--warning" title="Return" onclick="quickReturn('${esc(it.barcode)}')"><span class="material-icons-round">assignment_return</span></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  // Pagination
  const pag = document.getElementById('items-pagination');
  if (result.totalPages > 1) {
    let html = `<button ${itemsPage <= 1 ? 'disabled' : ''} onclick="changePage(${itemsPage - 1})">← Prev</button>`;
    for (let i = 1; i <= result.totalPages; i++) {
      if (result.totalPages > 7 && Math.abs(i - itemsPage) > 2 && i !== 1 && i !== result.totalPages) {
        if (i === 2 || i === result.totalPages - 1) html += '<button disabled>…</button>';
        continue;
      }
      html += `<button class="${i === itemsPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }
    html += `<button ${itemsPage >= result.totalPages ? 'disabled' : ''} onclick="changePage(${itemsPage + 1})">Next →</button>`;
    pag.innerHTML = html;
  } else {
    pag.innerHTML = '';
  }
}

window.changePage = function (p) { itemsPage = p; loadItems(); };

document.getElementById('items-search').addEventListener('input', debounce(() => { itemsPage = 1; loadItems(); }, 300));
document.getElementById('filter-status').addEventListener('change', () => { itemsPage = 1; loadItems(); });

window.scanFromTable = function (barcode) {
  document.querySelector('[data-tab="scan"]').click();
  document.getElementById('barcode-input').value = barcode;
  performScan(barcode);
};

window.quickStatus = async function (id, status) {
  const remarks = prompt(`Reason for marking as ${status}:`);
  if (remarks === null) return;
  const result = await window.api.inventoryUpdateItemStatus({ itemId: id, status, remarks });
  if (result.success) { showToast(`Item marked as ${status}`); loadItems(); }
  else showToast(result.error, true);
};

window.quickReturn = async function (barcode) {
  const remarks = prompt('Return reason:');
  if (remarks === null) return;
  const result = await window.api.inventoryReturnItem({ barcode, remarks });
  if (result.success) { showToast('Item returned to stock'); loadItems(); }
  else showToast(result.error, true);
};

// ── Add Item Modal ──────────────────────────────────────────

async function populateProductSelect(selectId) {
  const result = await window.api.inventoryGetProducts({});
  if (!result.success) return;
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Select product...</option>' +
    result.products.map(p => `<option value="${p.id}" data-prefix="${p.barcode_prefix || ''}" data-purchase="${p.purchase_price}" data-selling="${p.selling_price}">${esc(p.name)}${p.brand ? ' (' + esc(p.brand) + ')' : ''}</option>`).join('');
}

document.getElementById('btn-add-item').addEventListener('click', async () => {
  await populateProductSelect('mi-product');
  ['mi-barcode', 'mi-purchase', 'mi-selling', 'mi-date', 'mi-notes'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-item');
  document.getElementById('mi-barcode').focus();
});

document.getElementById('modal-item-close').addEventListener('click', () => closeModal('modal-item'));
document.getElementById('mi-cancel').addEventListener('click', () => closeModal('modal-item'));

// Auto-fill prices from product
document.getElementById('mi-product').addEventListener('change', function () {
  const opt = this.options[this.selectedIndex];
  if (opt.dataset.purchase) document.getElementById('mi-purchase').value = opt.dataset.purchase;
  if (opt.dataset.selling) document.getElementById('mi-selling').value = opt.dataset.selling;
});

document.getElementById('mi-save').addEventListener('click', async () => {
  const productId = parseInt(document.getElementById('mi-product').value);
  const barcode = document.getElementById('mi-barcode').value.trim();
  if (!productId) return showToast('Select a product', true);
  if (!barcode) return showToast('Barcode is required', true);

  const result = await window.api.inventoryAddItem({
    productId, barcode,
    purchasePrice: parseFloat(document.getElementById('mi-purchase').value) || 0,
    sellingPrice: parseFloat(document.getElementById('mi-selling').value) || 0,
    purchaseDate: document.getElementById('mi-date').value || null,
    notes: document.getElementById('mi-notes').value.trim()
  });

  if (result.success) {
    showToast('Item added to inventory');
    closeModal('modal-item');
    loadItems();
  } else {
    showToast(result.error, true);
  }
});

// ── Bulk Add Modal ──────────────────────────────────────────

document.getElementById('btn-bulk-add').addEventListener('click', async () => {
  await populateProductSelect('mb-product');
  ['mb-qty', 'mb-prefix', 'mb-purchase', 'mb-selling', 'mb-date'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-bulk');
});

document.getElementById('modal-bulk-close').addEventListener('click', () => closeModal('modal-bulk'));
document.getElementById('mb-cancel').addEventListener('click', () => closeModal('modal-bulk'));

// Auto-fill prefix from product
document.getElementById('mb-product').addEventListener('change', function () {
  const opt = this.options[this.selectedIndex];
  if (opt.dataset.prefix) document.getElementById('mb-prefix').value = opt.dataset.prefix;
  if (opt.dataset.purchase) document.getElementById('mb-purchase').value = opt.dataset.purchase;
  if (opt.dataset.selling) document.getElementById('mb-selling').value = opt.dataset.selling;
});

document.getElementById('mb-save').addEventListener('click', async () => {
  const productId = parseInt(document.getElementById('mb-product').value);
  const quantity = parseInt(document.getElementById('mb-qty').value);
  if (!productId) return showToast('Select a product', true);
  if (!quantity || quantity < 1) return showToast('Enter a valid quantity', true);

  const barcodePrefix = document.getElementById('mb-prefix').value.trim().toUpperCase();
  if (!barcodePrefix) return showToast('Barcode prefix is required for bulk generation', true);

  const result = await window.api.inventoryBulkAdd({
    productId, quantity, barcodePrefix,
    purchasePrice: parseFloat(document.getElementById('mb-purchase').value) || 0,
    sellingPrice: parseFloat(document.getElementById('mb-selling').value) || 0,
    purchaseDate: document.getElementById('mb-date').value || null
  });

  if (result.success) {
    showToast(`${result.count} items created (${result.items[0]?.barcode} — ${result.items[result.items.length - 1]?.barcode})`);
    closeModal('modal-bulk');
    loadItems();
  } else {
    showToast(result.error, true);
  }
});

// ═══════════════════════════════════════════════════════════
// ─── BARCODE SEARCH / SCANNER ─────────────────────────────
// ═══════════════════════════════════════════════════════════

const barcodeInput = document.getElementById('barcode-input');
let scanTimeout;

barcodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const barcode = barcodeInput.value.trim();
    if (barcode) performScan(barcode);
  }
});

// Also handle rapid scanner input (characters typed very fast)
barcodeInput.addEventListener('input', () => {
  clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    // If the input ends with a newline character from scanner, auto-search
    const val = barcodeInput.value.trim();
    if (val.length >= 4) {
      // Don't auto-scan, wait for Enter
    }
  }, 100);
});

async function performScan(barcode) {
  const resultDiv = document.getElementById('scan-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><span class="material-icons-round" style="font-size:32px;animation:pulse-glow 1s ease-in-out infinite;">search</span><p>Searching...</p></div>';

  const result = await window.api.inventoryScanBarcode(barcode);

  if (!result.success) {
    resultDiv.innerHTML = `<div class="scan-not-found"><span class="material-icons-round">error</span><h3>Error</h3><p>${esc(result.error)}</p></div>`;
    return;
  }

  if (!result.found) {
    resultDiv.innerHTML = `
      <div class="scan-not-found">
        <span class="material-icons-round">help_outline</span>
        <h3>Barcode Not Found</h3>
        <p>"<strong>${esc(barcode)}</strong>" does not exist in inventory.</p>
        <button class="btn btn--primary" style="margin-top:16px;" onclick="goAddItemWithBarcode('${esc(barcode)}')">
          <span class="material-icons-round">add</span> Add to Inventory
        </button>
      </div>
    `;
    return;
  }

  const item = result.item;
  const movements = result.movements || [];
  const inv = result.invoiceInfo;

  resultDiv.innerHTML = `
    <div class="scan-card">
      <div class="scan-card__header">
        <div class="scan-card__title">${esc(item.product_name)}</div>
        <div class="scan-card__barcode">${esc(item.barcode)}</div>
      </div>
      <div class="scan-info-grid">
        <div class="scan-info"><div class="scan-info__label">Status</div><div class="scan-info__value"><span class="status-badge status-badge--${item.status.toLowerCase()}">${item.status.replace('_', ' ')}</span></div></div>
        <div class="scan-info"><div class="scan-info__label">Brand</div><div class="scan-info__value">${esc(item.brand || '—')}</div></div>
        <div class="scan-info"><div class="scan-info__label">Category</div><div class="scan-info__value">${esc(item.category || '—')}</div></div>
        <div class="scan-info"><div class="scan-info__label">Purchase Price</div><div class="scan-info__value">₹${fmt(item.purchase_price)}</div></div>
        <div class="scan-info"><div class="scan-info__label">Selling Price</div><div class="scan-info__value">₹${fmt(item.selling_price)}</div></div>
        <div class="scan-info"><div class="scan-info__label">Purchase Date</div><div class="scan-info__value">${fmtDate(item.purchase_date)}</div></div>
        <div class="scan-info"><div class="scan-info__label">Sale Date</div><div class="scan-info__value">${fmtDate(item.sale_date)}</div></div>
        ${inv ? `<div class="scan-info"><div class="scan-info__label">Invoice</div><div class="scan-info__value">#${inv.invoice_number} — ${esc(inv.customer_name)}</div></div>` : ''}
        <div class="scan-info"><div class="scan-info__label">Added</div><div class="scan-info__value">${fmtDateTime(item.created_at)}</div></div>
      </div>
      ${item.notes ? `<div style="margin-top:12px;padding:10px;background:var(--bg-input);border-radius:var(--radius-sm);font-size:0.85rem;color:var(--text-secondary);"><strong>Notes:</strong> ${esc(item.notes)}</div>` : ''}

      <div class="scan-actions">
        ${item.status === 'SOLD' ? `<button class="scan-action-btn scan-action-btn--return" onclick="scanReturn('${esc(item.barcode)}')"><span class="material-icons-round">assignment_return</span> Return</button>` : ''}
        ${item.status === 'IN_STOCK' ? `<button class="scan-action-btn scan-action-btn--damage" onclick="scanDamage('${esc(item.barcode)}')"><span class="material-icons-round">broken_image</span> Mark Damaged</button>` : ''}
        ${item.status === 'IN_STOCK' ? `<button class="scan-action-btn scan-action-btn--lost" onclick="scanLost('${esc(item.barcode)}')"><span class="material-icons-round">search_off</span> Mark Lost</button>` : ''}
      </div>
    </div>

    <div class="scan-card">
      <h3 class="dash-card__title"><span class="material-icons-round">history</span> Lifecycle History</h3>
      ${movements.length ? `
        <div class="timeline">
          ${movements.map(m => `
            <div class="timeline-item">
              <div class="timeline-item__dot timeline-item__dot--${movementColors[m.movement_type] || 'adjustment'}"></div>
              <div class="timeline-item__type" style="color:var(--accent-${m.movement_type === 'PURCHASE' ? 'emerald' : m.movement_type === 'SALE' ? 'cyan' : m.movement_type === 'RETURN' ? 'orange' : m.movement_type === 'DAMAGE' ? 'rose' : 'amber'})">${m.movement_type}${m.invoice_number ? ' — Invoice #' + m.invoice_number : ''}</div>
              <div class="timeline-item__remark">${m.remarks ? esc(m.remarks) : ''}</div>
              <div class="timeline-item__date">${fmtDateTime(m.created_at)}</div>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:var(--text-muted);font-size:0.85rem;">No history records.</p>'}
    </div>
  `;
}

window.goAddItemWithBarcode = function (barcode) {
  document.querySelector('[data-tab="items"]').click();
  setTimeout(async () => {
    await populateProductSelect('mi-product');
    document.getElementById('mi-barcode').value = barcode;
    openModal('modal-item');
  }, 200);
};

window.scanReturn = async function (barcode) {
  const remarks = prompt('Return reason:');
  if (remarks === null) return;
  const result = await window.api.inventoryReturnItem({ barcode, remarks });
  if (result.success) { showToast('Item returned to stock'); performScan(barcode); }
  else showToast(result.error, true);
};

window.scanDamage = async function (barcode) {
  const remarks = prompt('Damage description:');
  if (remarks === null) return;
  const result = await window.api.inventoryUpdateItemStatus({ barcode, status: 'DAMAGED', remarks });
  if (result.success) { showToast('Item marked as damaged'); performScan(barcode); }
  else showToast(result.error, true);
};

window.scanLost = async function (barcode) {
  const remarks = prompt('Lost item description:');
  if (remarks === null) return;
  const result = await window.api.inventoryUpdateItemStatus({ barcode, status: 'LOST', remarks });
  if (result.success) { showToast('Item marked as lost'); performScan(barcode); }
  else showToast(result.error, true);
};

// ═══════════════════════════════════════════════════════════
// ─── MODAL ESCAPE KEY HANDLING ────────────────────────────
// ═══════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show');
  });
});

// ═══════════════════════════════════════════════════════════
// ─── INITIAL LOAD ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

loadDashboard();
