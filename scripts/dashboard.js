/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Dashboard Logic
   ════════════════════════════════════════════════════════════ */

let analyticsData = null;
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

// ─── Sidebar Toggle ─────────────────────────────────────────
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('dash-sidebar');

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  sidebarToggle.classList.toggle('active');
});

// ─── View Switching ─────────────────────────────────────────
const navItems = document.querySelectorAll('.sidebar-nav__item');
const viewAnalytics = document.getElementById('view-analytics');
const viewDuedate = document.getElementById('view-duedate');
let calDate = new Date();
let selDate = new Date();
let allDueBills = [];
let calLoaded = false;

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    const view = item.dataset.view;

    // Hide all views
    viewAnalytics.classList.add('hidden');
    viewDuedate.classList.add('hidden');
    const viewProducts = document.getElementById('view-products');
    if (viewProducts) viewProducts.classList.add('hidden');

    if (view === 'analytics') {
      viewAnalytics.classList.remove('hidden');
    } else if (view === 'duedate') {
      viewDuedate.classList.remove('hidden');
      loadCalendarData();
    } else if (view === 'products') {
      if (viewProducts) viewProducts.classList.remove('hidden');
      loadProductAnalytics();
    }
  });
});

// Handle initial view from URL (e.g., from notifications)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('view') === 'duedate') {
  const duedateNav = document.getElementById('nav-duedate');
  if (duedateNav) duedateNav.click();
}

// ─── Calendar: Load Data ────────────────────────────────────
async function loadCalendarData() {
  try {
    const result = await window.api.getDueBillsByDate();
    if (result.success) {
      allDueBills = result.bills;
    } else {
      allDueBills = [];
      console.error('Failed to load due bills:', result.error);
    }
  } catch (err) {
    allDueBills = [];
    console.error('Calendar data error:', err);
  }
  renderCalendar();
  renderSelectedDateBills();

  // Bind nav buttons (once)
  if (!calLoaded) {
    document.getElementById('btn-prev-month').addEventListener('click', () => {
      calDate.setMonth(calDate.getMonth() - 1);
      renderCalendar();
    });
    document.getElementById('btn-next-month').addEventListener('click', () => {
      calDate.setMonth(calDate.getMonth() + 1);
      renderCalendar();
    });
    calLoaded = true;
  }
}

// ─── Calendar: Render Grid ──────────────────────────────────
function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const monthLabel = document.getElementById('cal-month-year');
  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  monthLabel.textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(calDate);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // Build due dates map
  const dueDatesMap = {};
  allDueBills.forEach(b => {
    if (b.due_date) {
      const dStr = b.due_date.split('T')[0];
      if (!dueDatesMap[dStr]) dueDatesMap[dStr] = [];
      dueDatesMap[dStr].push(b);
    }
  });

  let html = '';
  // Day labels
  ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(d => {
    html += `<div class="cal-day-label">${d}</div>`;
  });

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-date empty"></div>';
  }

  // Date cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dStr === todayStr;
    const isSelected = selDate.getFullYear() === year && selDate.getMonth() === month && selDate.getDate() === d;
    const dayBills = dueDatesMap[dStr] || [];
    const hasDue = dayBills.length > 0;

    let cls = 'cal-date';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    if (hasDue) {
      cls += ' has-due';
      // Determine dot color
      const cat = getCalDueCategory(dStr);
      if (cat === 'overdue') cls += ' overdue';
      else if (cat === 'today') cls += ' today-due';
      else cls += ' upcoming-due';
    }

    html += `<div class="${cls}" data-date="${dStr}" onclick="selectCalDate('${dStr}')">${d}</div>`;
  }

  grid.innerHTML = html;
}

function getCalDueCategory(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

// ─── Calendar: Select Date ──────────────────────────────────
window.selectCalDate = function(dStr) {
  const parts = dStr.split('-');
  selDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  renderCalendar();
  renderSelectedDateBills();
};

// ─── Calendar: Render Selected Date Bills ───────────────────
function renderSelectedDateBills() {
  const titleEl = document.getElementById('cal-due-title');
  const badgeEl = document.getElementById('cal-due-badge');
  const listEl = document.getElementById('cal-due-list');

  const dateLabel = selDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  titleEl.innerHTML = `<span class="material-icons-round" style="color: var(--accent-orange);">event_note</span> Due on ${dateLabel}`;

  const selStr = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, '0')}-${String(selDate.getDate()).padStart(2, '0')}`;
  const bills = allDueBills.filter(b => b.due_date && b.due_date.split('T')[0] === selStr);

  badgeEl.textContent = `${bills.length} Bill${bills.length !== 1 ? 's' : ''}`;

  if (bills.length === 0) {
    listEl.innerHTML = `
      <div class="cal-due-empty">
        <span class="material-icons-round">event_available</span>
        <p style="font-size: 0.88rem; font-weight: 600;">No bills due on this date</p>
      </div>`;
    return;
  }

  listEl.innerHTML = bills.map(b => `
    <div class="cal-due-item">
      <div class="cal-due-item__info">
        <div class="cal-due-item__supplier">${escapeHtml(b.supplier_name)}</div>
        <div class="cal-due-item__invoice">${escapeHtml(b.invoice_number)}</div>
      </div>
      <div class="cal-due-item__amount">
        <div class="cal-due-item__total">₹${(b.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        <div class="cal-due-item__due">Due: ₹${(b.due_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>
  `).join('');
}

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
  const days = parseInt(document.getElementById('sales-days-filter').value) || 0;

  const result = await window.api.getSalesAnalytics({ days });
  if (!result.success) {
    console.error('Failed to load sales analytics:', result.error);
    return;
  }

  analyticsData = result.data;
  renderKPIs();
  renderSalesChart();
  updateSalesSubtitle();
}

function updateSalesSubtitle() {
  const days = parseInt(document.getElementById('sales-days-filter').value) || 0;
  const dataset = document.getElementById('sales-dataset-filter').value;
  const daysLabel = days === 0 ? 'All Time' : `Last ${days} Days`;
  const datasetLabel = dataset === 'both' ? 'Revenue & Profit' : dataset === 'revenue' ? 'Revenue Only' : 'Profit Only';
  document.getElementById('sales-chart-subtitle').textContent = `${daysLabel} · ${datasetLabel}`;
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

// ─── Revenue & Profit Chart ─────────────────────────────────
let salesChart = null;

function renderSalesChart() {
  const ctx = document.getElementById('chart-sales').getContext('2d');
  if (salesChart) salesChart.destroy();

  const sales = analyticsData.salesTrend;
  const purchases = analyticsData.purchaseTrend;
  const dataset = document.getElementById('sales-dataset-filter').value;

  // Merge all dates
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

  const revenueData = sortedDates.map(d => salesMap[d] || 0);
  const profitData = sortedDates.map(d => (salesMap[d] || 0) - (purchaseMap[d] || 0));

  const datasets = [];

  if (dataset === 'revenue' || dataset === 'both') {
    datasets.push({
      label: 'Revenue',
      data: revenueData,
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
    });
  }

  if (dataset === 'profit' || dataset === 'both') {
    datasets.push({
      label: 'Profit',
      data: profitData,
      borderColor: '#34d399',
      backgroundColor: 'rgba(52, 211, 153, 0.06)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#34d399',
      pointBorderColor: '#0a0a1a',
      pointBorderWidth: 2,
      pointHoverRadius: 6,
      borderDash: dataset === 'both' ? [6, 4] : []
    });
  }

  salesChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'end',
          labels: {
            color: '#8b8fad',
            font: { family: 'Inter', size: 11, weight: '600' },
            boxWidth: 12, boxHeight: 3, borderRadius: 2, useBorderRadius: true, padding: 16
          }
        },
        tooltip: {
          backgroundColor: '#12142d', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
          titleColor: '#f0f1f7', bodyColor: '#8b8fad',
          titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Outfit' },
          padding: 12, cornerRadius: 10,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: '#5a5e7e', font: { family: 'Inter', size: 10 }, maxTicksLimit: 12 },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: '#5a5e7e', font: { family: 'Inter', size: 10 }, callback: (v) => formatCurrency(v) },
          border: { display: false }, beginAtZero: true
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

// ─── Sales Filter Listeners (instant update) ────────────────
document.getElementById('sales-days-filter').addEventListener('change', () => loadDashboard());
document.getElementById('sales-dataset-filter').addEventListener('change', () => {
  // Dataset change only affects chart rendering, no need to re-fetch
  renderSalesChart();
  updateSalesSubtitle();
});

// ─── Refresh ────────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', () => {
  const icon = document.querySelector('#btn-refresh .material-icons-round');
  icon.style.animation = 'spin 0.5s ease';
  setTimeout(() => icon.style.animation = '', 500);
  loadDashboard();
  showToast('Sales data refreshed');
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
  a.download = `ASPORTS_Sales_${new Date().toISOString().split('T')[0]}.csv`;
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

// ─── Auto-Refresh (2 min) ───────────────────────────────────
refreshTimer = setInterval(() => {
  loadDashboard();
}, 120000);

// ─── Add spin keyframe ──────────────────────────────────────
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── Product Analytics ──────────────────────────────────────
let productBarChart = null;
let productTrendChart = null;
let productAnalyticsData = null;

async function loadProductAnalytics() {
  const days = parseInt(document.getElementById('prod-days-filter').value) || 0;
  const limit = parseInt(document.getElementById('prod-limit-filter').value) || 10;
  const sortBy = document.getElementById('prod-sort-filter').value || 'qty';

  try {
    const result = await window.api.getProductAnalytics({ days, limit, sortBy });
    if (!result.success) {
      console.error('Product analytics error:', result.error);
      return;
    }

    productAnalyticsData = result.data;
    renderProductKPIs();
    renderProductBarChart();
    renderProductTable();
    renderProductTrendChart();
    updateProductSubtitle();
  } catch (err) {
    console.error('Failed to load product analytics:', err);
  }
}

function updateProductSubtitle() {
  const days = parseInt(document.getElementById('prod-days-filter').value) || 0;
  const limit = parseInt(document.getElementById('prod-limit-filter').value) || 10;
  const daysLabel = days === 0 ? 'All Time' : `Last ${days} Days`;
  document.getElementById('prod-chart-subtitle').textContent = `Top ${limit} · ${daysLabel}`;
}

function renderProductKPIs() {
  const t = productAnalyticsData.totals;
  animateValue(document.getElementById('prod-kpi-unique'), t.uniqueProducts);
  animateValue(document.getElementById('prod-kpi-units'), t.totalUnits);
  animateValue(document.getElementById('prod-kpi-revenue'), t.totalRevenue, '₹');
}

function renderProductBarChart() {
  const ctx = document.getElementById('chart-product-analytics').getContext('2d');
  if (productBarChart) productBarChart.destroy();

  const products = productAnalyticsData.products;
  const sortBy = document.getElementById('prod-sort-filter').value || 'qty';

  if (!products.length) {
    productBarChart = null;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  const gradientColors = [
    ['rgba(168, 85, 247, 0.85)', 'rgba(168, 85, 247, 0.2)'],
    ['rgba(0, 229, 255, 0.85)', 'rgba(0, 229, 255, 0.2)'],
    ['rgba(52, 211, 153, 0.85)', 'rgba(52, 211, 153, 0.2)'],
    ['rgba(251, 146, 60, 0.85)', 'rgba(251, 146, 60, 0.2)'],
    ['rgba(244, 63, 94, 0.85)', 'rgba(244, 63, 94, 0.2)'],
    ['rgba(99, 102, 241, 0.85)', 'rgba(99, 102, 241, 0.2)'],
    ['rgba(236, 72, 153, 0.85)', 'rgba(236, 72, 153, 0.2)'],
    ['rgba(34, 211, 238, 0.85)', 'rgba(34, 211, 238, 0.2)'],
    ['rgba(163, 230, 53, 0.85)', 'rgba(163, 230, 53, 0.2)'],
    ['rgba(251, 191, 36, 0.85)', 'rgba(251, 191, 36, 0.2)'],
  ];

  const barColors = products.map((_, i) => gradientColors[i % gradientColors.length][0]);
  const borderColors = products.map((_, i) => gradientColors[i % gradientColors.length][0].replace('0.85', '1'));

  const dataValues = sortBy === 'revenue'
    ? products.map(p => p.total_revenue)
    : products.map(p => p.total_qty);

  const dataLabel = sortBy === 'revenue' ? 'Revenue (₹)' : 'Qty Sold';

  productBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: products.map(p => p.product.length > 22 ? p.product.substring(0, 22) + '…' : p.product),
      datasets: [{
        label: dataLabel,
        data: dataValues,
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
        barThickness: products.length > 15 ? 14 : (products.length > 8 ? 20 : 28)
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
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Outfit' },
          padding: 14,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => {
              const p = products[ctx.dataIndex];
              if (sortBy === 'revenue') {
                return `Revenue: ₹${p.total_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Qty: ${p.total_qty}`;
              }
              return `Sold: ${p.total_qty} units | Revenue: ₹${p.total_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: {
            color: '#5a5e7e',
            font: { family: 'Inter', size: 10 },
            callback: (v) => sortBy === 'revenue' ? formatCurrency(v) : v
          },
          border: { display: false },
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#8b8fad',
            font: { family: 'Inter', size: 11, weight: '500' },
            autoSkip: false
          },
          border: { display: false }
        }
      }
    }
  });
}

function renderProductTable() {
  const tbody = document.getElementById('prod-table-body');
  const products = productAnalyticsData.products;

  if (!products.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="prod-empty">
            <span class="material-icons-round">inventory_2</span>
            <p style="font-size: 0.88rem; font-weight: 600;">No product data available</p>
            <p style="font-size: 0.78rem;">Products will appear here when invoices are created.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map((p, i) => `
    <tr>
      <td class="td-rank">${i + 1}</td>
      <td class="td-name" title="${escapeHtml(p.product)}">${escapeHtml(p.product)}</td>
      <td class="td-qty">${p.total_qty.toLocaleString('en-IN')}</td>
      <td class="td-revenue">₹${p.total_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="td-avg">₹${(p.avg_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="td-invoices">${p.invoice_count}</td>
    </tr>
  `).join('');
}

function renderProductTrendChart() {
  const ctx = document.getElementById('chart-product-trend').getContext('2d');
  if (productTrendChart) productTrendChart.destroy();

  const trend = productAnalyticsData.dailyTrend;

  if (!trend.length) {
    productTrendChart = null;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  const labels = trend.map(d => {
    const dt = new Date(d.date);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  });

  productTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Units Sold',
          data: trend.map(d => d.total_qty),
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.06)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#00e5ff',
          pointBorderColor: '#0a0a1a',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'Revenue',
          data: trend.map(d => d.total_revenue),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.04)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: '#a855f7',
          pointBorderColor: '#0a0a1a',
          pointBorderWidth: 2,
          borderDash: [5, 5],
          yAxisID: 'y1'
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
            label: (ctx) => {
              if (ctx.datasetIndex === 0) return `Units: ${ctx.parsed.y}`;
              return `Revenue: ₹${ctx.parsed.y.toLocaleString('en-IN')}`;
            }
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
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: '#00e5ff', font: { family: 'Inter', size: 10 } },
          border: { display: false },
          beginAtZero: true,
          title: { display: true, text: 'Units', color: '#5a5e7e', font: { family: 'Inter', size: 10 } }
        },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: { color: '#a855f7', font: { family: 'Inter', size: 10 }, callback: (v) => formatCurrency(v) },
          border: { display: false },
          beginAtZero: true,
          title: { display: true, text: 'Revenue', color: '#5a5e7e', font: { family: 'Inter', size: 10 } }
        }
      }
    }
  });
}

// Instant filter listeners — update graphs immediately on change
document.getElementById('prod-days-filter').addEventListener('change', () => loadProductAnalytics());
document.getElementById('prod-limit-filter').addEventListener('change', () => loadProductAnalytics());
document.getElementById('prod-sort-filter').addEventListener('change', () => loadProductAnalytics());

// Refresh button
document.getElementById('btn-prod-refresh').addEventListener('click', () => {
  const icon = document.querySelector('#btn-prod-refresh .material-icons-round');
  icon.style.animation = 'spin 0.5s ease';
  setTimeout(() => icon.style.animation = '', 500);
  loadProductAnalytics();
  showToast('Product analytics refreshed');
});

// ─── Init ───────────────────────────────────────────────────
async function initApp() {
  loadDashboard();
  
  // Set App Version
  try {
    const version = await window.api.getAppVersion();
    const versionEl = document.getElementById('app-version-text');
    if (versionEl) versionEl.textContent = `v${version}`;
  } catch (err) {
    console.error('Failed to get app version:', err);
  }
}

initApp();
