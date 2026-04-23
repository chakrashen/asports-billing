/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Dashboard Logic
   ════════════════════════════════════════════════════════════ */

let analyticsData = null;
let revenueChart = null;
let productsChart = null;
let sortField = 'created_at';
let sortDir = 'desc';
let refreshTimer = null;

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  document.getElementById('header-date').textContent = dateStr;
  document.getElementById('header-time').textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// ─── Navigation ─────────────────────────────────────────────
document.getElementById('btn-back').addEventListener('click', () => {
  window.location.href = 'home.html';
});

document.getElementById('btn-duedate-view').addEventListener('click', () => {
  window.location.href = 'bill_history.html?status=duedate';
});

// ─── Format Currency ────────────────────────────────────────
function formatCurrency(num) {
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  if (num >= 1000) return '₹' + (num / 1000).toFixed(1) + 'K';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatFullCurrency(num) {
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Animate Counter ────────────────────────────────────────
function animateValue(el, end, prefix = '', suffix = '') {
  const duration = 800;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    
    if (prefix === '₹') {
      el.textContent = formatCurrency(current);
    } else {
      el.textContent = prefix + current.toLocaleString('en-IN') + suffix;
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

// ─── Load Data ──────────────────────────────────────────────
async function loadDashboard() {
  const result = await window.api.getAnalytics();
  if (!result.success) {
    console.error('Failed to load analytics:', result.error);
    return;
  }

  analyticsData = result.data;
  renderKPIs();
  renderRevenueChart();
  renderProductsChart();
  renderCustomers();
  renderFinancial();
}

// ─── KPI Cards ──────────────────────────────────────────────
function renderKPIs() {
  const d = analyticsData;

  // Revenue
  animateValue(document.getElementById('kpi-revenue'), d.sales.revenue, '₹');
  const revBadge = document.getElementById('kpi-revenue-badge');
  revBadge.textContent = `Today: ${formatCurrency(d.sales.todayRevenue)}`;
  revBadge.className = 'kpi-card__badge kpi-card__badge--neutral';

  // Orders
  animateValue(document.getElementById('kpi-orders'), d.sales.count);
  const ordBadge = document.getElementById('kpi-orders-badge');
  ordBadge.textContent = `Avg: ${formatCurrency(d.sales.avgValue)}`;
  ordBadge.className = 'kpi-card__badge kpi-card__badge--neutral';

  // Profit
  animateValue(document.getElementById('kpi-profit'), d.profit, '₹');
  const profitBadge = document.getElementById('kpi-profit-badge');
  if (d.sales.growth > 0) {
    profitBadge.innerHTML = `<span class="material-icons-round" style="font-size:14px;">arrow_upward</span>${d.sales.growth}%`;
    profitBadge.className = 'kpi-card__badge kpi-card__badge--up';
  } else if (d.sales.growth < 0) {
    profitBadge.innerHTML = `<span class="material-icons-round" style="font-size:14px;">arrow_downward</span>${Math.abs(d.sales.growth)}%`;
    profitBadge.className = 'kpi-card__badge kpi-card__badge--down';
  } else {
    profitBadge.textContent = '0%';
    profitBadge.className = 'kpi-card__badge kpi-card__badge--neutral';
  }

  // Pending
  const totalDue = (d.sales.totalDue || 0) + (d.purchases.totalDue || 0);
  animateValue(document.getElementById('kpi-pending'), totalDue, '₹');
  const pendBadge = document.getElementById('kpi-pending-badge');
  pendBadge.textContent = `${d.customers.uniqueCount} Customers`;
  pendBadge.className = 'kpi-card__badge kpi-card__badge--neutral';
}

// ─── Revenue Trend Chart ────────────────────────────────────
function renderRevenueChart() {
  const ctx = document.getElementById('chart-revenue').getContext('2d');
  
  if (revenueChart) revenueChart.destroy();

  const sales = analyticsData.salesTrend;
  const purchases = analyticsData.purchaseTrend;

  // Merge dates
  const allDates = new Set();
  sales.forEach(s => allDates.add(s.date));
  purchases.forEach(p => allDates.add(p.date));
  const sortedDates = [...allDates].sort();

  const salesMap = {};
  sales.forEach(s => salesMap[s.date] = s.total);
  const purchaseMap = {};
  purchases.forEach(p => purchaseMap[p.date] = p.total);

  const labels = sortedDates.map(d => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  });

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sales Revenue',
          data: sortedDates.map(d => salesMap[d] || 0),
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#00e5ff',
          pointBorderColor: '#0a0a1a',
          pointBorderWidth: 2,
          pointHoverRadius: 6
        },
        {
          label: 'Purchases',
          data: sortedDates.map(d => purchaseMap[d] || 0),
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: '#f43f5e',
          pointBorderColor: '#0a0a1a',
          pointBorderWidth: 2,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#8b8fad',
            font: { family: 'Inter', size: 11, weight: '600' },
            boxWidth: 12,
            boxHeight: 3,
            borderRadius: 2,
            useBorderRadius: true,
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: '#12142d',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0f1f7',
          bodyColor: '#8b8fad',
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Outfit' },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: '#5a5e7e', font: { family: 'Inter', size: 10 }, maxTicksLimit: 10 },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: {
            color: '#5a5e7e',
            font: { family: 'Inter', size: 10 },
            callback: (v) => formatCurrency(v)
          },
          border: { display: false },
          beginAtZero: true
        }
      }
    }
  });
}

// ─── Top Products Chart ─────────────────────────────────────
function renderProductsChart() {
  const ctx = document.getElementById('chart-products').getContext('2d');

  if (productsChart) productsChart.destroy();

  const products = analyticsData.topProducts.slice(0, 7);

  const colors = [
    'rgba(0, 229, 255, 0.7)',
    'rgba(168, 85, 247, 0.7)',
    'rgba(52, 211, 153, 0.7)',
    'rgba(251, 146, 60, 0.7)',
    'rgba(244, 63, 94, 0.7)',
    'rgba(99, 102, 241, 0.7)',
    'rgba(236, 72, 153, 0.7)'
  ];

  productsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: products.map(p => p.product.length > 18 ? p.product.substring(0, 18) + '…' : p.product),
      datasets: [{
        label: 'Qty Sold',
        data: products.map(p => p.total_qty),
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#12142d',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0f1f7',
          bodyColor: '#8b8fad',
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => `Sold: ${ctx.parsed.x} units`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: '#5a5e7e', font: { family: 'Inter', size: 10 } },
          border: { display: false },
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: { color: '#8b8fad', font: { family: 'Inter', size: 11, weight: '500' } },
          border: { display: false }
        }
      }
    }
  });
}

// ─── Top Customers ──────────────────────────────────────────
function renderCustomers() {
  const list = document.getElementById('customer-list');
  const customers = analyticsData.customers.top;

  if (!customers.length) {
    list.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 40px;">No customer data yet</div>';
    return;
  }

  const maxSpend = customers[0]?.total_spend || 1;

  list.innerHTML = customers.map((c, i) => `
    <div class="customer-item">
      <div class="customer-item__rank">${i + 1}</div>
      <div class="customer-item__info">
        <div class="customer-item__name">${escapeHtml(c.customer_name)}</div>
        <div class="customer-item__meta">${c.invoice_count} invoice${c.invoice_count > 1 ? 's' : ''}</div>
      </div>
      <div class="customer-item__bar-bg">
        <div class="customer-item__bar" style="width: ${(c.total_spend / maxSpend * 100).toFixed(0)}%"></div>
      </div>
      <div class="customer-item__amount">${formatCurrency(c.total_spend)}</div>
    </div>
  `).join('');
}

// ─── Financial Summary ──────────────────────────────────────
function renderFinancial() {
  const grid = document.getElementById('financial-grid');
  const d = analyticsData;

  grid.innerHTML = `
    <div class="fin-item fin-item--highlight">
      <div class="fin-item__label">Net Profit</div>
      <div class="fin-item__value">${formatFullCurrency(d.profit)}</div>
    </div>
    <div class="fin-item fin-item--cyan">
      <div class="fin-item__label">Sales Revenue</div>
      <div class="fin-item__value">${formatFullCurrency(d.sales.revenue)}</div>
    </div>
    <div class="fin-item fin-item--rose">
      <div class="fin-item__label">Purchase Spend</div>
      <div class="fin-item__value">${formatFullCurrency(d.purchases.totalSpend)}</div>
    </div>
    <div class="fin-item fin-item--emerald">
      <div class="fin-item__label">Sales Collected</div>
      <div class="fin-item__value">${formatFullCurrency(d.sales.totalPaid)}</div>
    </div>
    <div class="fin-item fin-item--orange">
      <div class="fin-item__label">Sales Due</div>
      <div class="fin-item__value">${formatFullCurrency(d.sales.totalDue)}</div>
    </div>
    <div class="fin-item fin-item--purple">
      <div class="fin-item__label">This Month</div>
      <div class="fin-item__value">${formatFullCurrency(d.sales.monthRevenue)}</div>
    </div>
    <div class="fin-item fin-item--cyan">
      <div class="fin-item__label">Purchase Due</div>
      <div class="fin-item__value">${formatFullCurrency(d.purchases.totalDue)}</div>
    </div>
  `;
}

// ─── Filter Chips ───────────────────────────────────────────
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    // Filters are cosmetic labels showing which period is selected
    // The backend always returns full data; filtering is visual context
    loadDashboard();
  });
});

// ─── Refresh ────────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', () => {
  const icon = document.querySelector('#btn-refresh .material-icons-round');
  icon.style.animation = 'spin 0.5s ease';
  setTimeout(() => icon.style.animation = '', 500);
  loadDashboard();
  showToast('Dashboard refreshed');
});

// ─── Export CSV ──────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  if (!analyticsData || !analyticsData.recentInvoices.length) {
    showToast('No data to export', true);
    return;
  }

  const headers = ['Invoice #', 'Customer', 'Amount', 'Paid', 'Due', 'Date'];
  const rows = analyticsData.recentInvoices.map(inv => [
    inv.invoice_number || inv.id,
    `"${inv.customer_name}"`,
    inv.total_amount,
    inv.paid_amount || 0,
    inv.due_amount || 0,
    inv.created_at
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ASPORTS_Invoices_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully');
});

// ─── Toast ──────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const icon = toast.querySelector('.toast__icon');
  document.getElementById('toast-msg').textContent = msg;
  icon.textContent = isError ? 'error' : 'check_circle';
  toast.className = 'toast show' + (isError ? ' toast--error' : '');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Auto-Refresh (30s) ─────────────────────────────────────
refreshTimer = setInterval(loadDashboard, 30000);

// ─── Add spin keyframe ──────────────────────────────────────
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── Init ───────────────────────────────────────────────────
loadDashboard();
