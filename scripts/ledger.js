/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Ledger (Shopify Products) Logic
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

// ─── DOM References ─────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const searchFilter = document.getElementById('search-filter');
const btnSearch = document.getElementById('btn-search');
const statsRow = document.getElementById('ledger-stats');
const statTotal = document.getElementById('stat-total');
const statInStock = document.getElementById('stat-in-stock');
const statVariants = document.getElementById('stat-variants');
const initialState = document.getElementById('initial-state');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const productsGrid = document.getElementById('products-grid');
const detailOverlay = document.getElementById('detail-overlay');
const detailClose = document.getElementById('detail-close');
const detailTitle = document.getElementById('detail-title');
const detailBody = document.getElementById('detail-body');

// ─── State ──────────────────────────────────────────────────
let debounceTimer = null;

// ─── Search ─────────────────────────────────────────────────
async function performSearch() {
  const query = searchInput.value.trim();
  const searchBy = searchFilter.value;

  // Show loading
  initialState.style.display = 'none';
  emptyState.style.display = 'none';
  errorState.style.display = 'none';
  productsGrid.style.display = 'none';
  statsRow.style.display = 'none';
  loadingState.style.display = 'flex';

  try {
    const result = await window.api.searchShopifyProducts(query, searchBy);

    loadingState.style.display = 'none';

    if (!result.success) {
      errorMessage.textContent = result.error || 'Failed to fetch products.';
      errorState.style.display = 'flex';
      return;
    }

    const products = result.products;

    if (products.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    // Update stats
    const totalVariants = products.reduce((sum, p) => sum + (p.variants ? p.variants.length : 0), 0);
    const inStock = products.filter(p => {
      const totalQty = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
      return totalQty > 0;
    }).length;

    statTotal.textContent = products.length;
    statInStock.textContent = inStock;
    statVariants.textContent = totalVariants;
    statsRow.style.display = 'flex';

    // Render products
    renderProducts(products);

  } catch (err) {
    loadingState.style.display = 'none';
    errorMessage.textContent = err.message || 'Network error.';
    errorState.style.display = 'flex';
  }
}

// ─── Render Products ────────────────────────────────────────
function renderProducts(products) {
  productsGrid.innerHTML = '';
  productsGrid.style.display = 'grid';

  products.forEach(product => {
    const totalQty = (product.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
    const prices = (product.variants || []).map(v => parseFloat(v.price) || 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const priceStr = minPrice === maxPrice
      ? `₹${minPrice.toLocaleString('en-IN')}`
      : `₹${minPrice.toLocaleString('en-IN')} – ₹${maxPrice.toLocaleString('en-IN')}`;

    let stockClass, stockLabel;
    if (totalQty <= 0) {
      stockClass = 'product-card__stock--out';
      stockLabel = 'Out of Stock';
    } else if (totalQty <= 5) {
      stockClass = 'product-card__stock--low';
      stockLabel = `Low: ${totalQty}`;
    } else {
      stockClass = 'product-card__stock--in';
      stockLabel = `In Stock: ${totalQty}`;
    }

    const variantCount = (product.variants || []).length;

    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-id', product.id);
    card.innerHTML = `
      ${product.image
        ? `<img class="product-card__image" src="${product.image}" alt="${escapeHtml(product.title)}" loading="lazy">`
        : `<div class="product-card__no-image"><span class="material-icons-round">image</span></div>`
      }
      <div class="product-card__body">
        ${product.vendor ? `<span class="product-card__vendor">${escapeHtml(product.vendor)}</span>` : ''}
        <h3 class="product-card__title">${escapeHtml(product.title)}</h3>
        <div class="product-card__footer">
          <span class="product-card__price">${priceStr}</span>
          <span class="product-card__stock ${stockClass}">${stockLabel}</span>
        </div>
        ${variantCount > 1 ? `<span class="product-card__variants-count">${variantCount} variants</span>` : ''}
      </div>
    `;

    card.addEventListener('click', () => openDetail(product));
    productsGrid.appendChild(card);
  });
}

// ─── Detail Modal ───────────────────────────────────────────
function openDetail(product) {
  detailTitle.textContent = product.title;

  let html = '';

  // Images
  if (product.images && product.images.length > 0) {
    html += `<div class="detail-images">`;
    product.images.forEach(src => {
      html += `<img src="${src}" alt="Product image" loading="lazy">`;
    });
    html += `</div>`;
  }

  // Info grid
  const totalQty = (product.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
  const prices = (product.variants || []).map(v => parseFloat(v.price) || 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const priceStr = minPrice === maxPrice
    ? `₹${minPrice.toLocaleString('en-IN')}`
    : `₹${minPrice.toLocaleString('en-IN')} – ₹${maxPrice.toLocaleString('en-IN')}`;

  html += `
    <div class="detail-info-grid">
      <div class="detail-info-item">
        <span class="detail-info-item__label">Price Range</span>
        <span class="detail-info-item__value" style="color: var(--accent-emerald); font-family: 'Outfit', sans-serif; font-weight: 800;">${priceStr}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-item__label">Total Stock</span>
        <span class="detail-info-item__value">${totalQty}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-item__label">Variants</span>
        <span class="detail-info-item__value">${(product.variants || []).length}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-item__label">Vendor</span>
        <span class="detail-info-item__value">${escapeHtml(product.vendor || '—')}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-item__label">Product Type</span>
        <span class="detail-info-item__value">${escapeHtml(product.product_type || '—')}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-item__label">Status</span>
        <span class="detail-info-item__value" style="text-transform: capitalize;">${product.status || '—'}</span>
      </div>
    </div>
  `;

  // Tags
  if (product.tags && product.tags.trim()) {
    const tags = product.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length) {
      html += `<div class="detail-tags">`;
      tags.forEach(tag => {
        html += `<span class="detail-tag">${escapeHtml(tag)}</span>`;
      });
      html += `</div>`;
    }
  }

  // Description
  if (product.body_html && product.body_html.trim()) {
    // Strip HTML tags for clean display
    const cleanDesc = product.body_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanDesc) {
      html += `
        <div class="detail-description">
          <h4>Description</h4>
          ${cleanDesc}
        </div>
      `;
    }
  }

  // Variants table
  if (product.variants && product.variants.length > 0) {
    html += `
      <div class="detail-variants-title">
        <span class="material-icons-round">style</span>
        Variants (${product.variants.length})
      </div>
      <table class="detail-variants-table">
        <thead>
          <tr>
            <th>Variant</th>
            <th>SKU</th>
            <th>Barcode</th>
            <th>Price</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
    `;

    product.variants.forEach(v => {
      let stockClass = 'stock-in';
      if (v.inventory_quantity <= 0) stockClass = 'stock-out';
      else if (v.inventory_quantity <= 5) stockClass = 'stock-low';

      html += `
        <tr>
          <td>${escapeHtml(v.title || 'Default')}</td>
          <td>${escapeHtml(v.sku || '—')}</td>
          <td>${escapeHtml(v.barcode || '—')}</td>
          <td class="price-cell">₹${parseFloat(v.price || 0).toLocaleString('en-IN')}</td>
          <td class="stock-cell ${stockClass}">${v.inventory_quantity != null ? v.inventory_quantity : '—'}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
  }

  detailBody.innerHTML = html;
  detailOverlay.classList.add('show');
}

function closeDetail() {
  detailOverlay.classList.remove('show');
}

// ─── Utility ────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event Listeners ────────────────────────────────────────
btnSearch.addEventListener('click', performSearch);

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch();
  }
});

// Debounced live search
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (searchInput.value.trim().length >= 2) {
      performSearch();
    }
  }, 500);
});

detailClose.addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) closeDetail();
});

// Retry button
document.getElementById('btn-retry').addEventListener('click', performSearch);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detailOverlay.classList.contains('show')) {
    closeDetail();
  }
});

// ─── Auto-load all products on page load ────────────────────
window.addEventListener('DOMContentLoaded', () => {
  performSearch();
});
