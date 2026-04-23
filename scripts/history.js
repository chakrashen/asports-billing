let allInvoices = [];
let salesTrendChart = null;
let topProductsChart = null;

// Initialize Dashboard
async function initDashboard() {
  await loadAnalytics();
  await loadHistory();
}

async function loadAnalytics() {
  const result = await window.api.getAnalytics();
  if (result.success) {
    updateKPIs(result.data.stats);
    renderCharts(result.data);
  }
}

function updateKPIs(stats) {
  document.getElementById('kpi-revenue').textContent = formatCurrency(stats.revenue);
  document.getElementById('kpi-count').textContent = stats.count;
  document.getElementById('kpi-avg').textContent = formatCurrency(stats.avgValue);
  document.getElementById('kpi-highest').textContent = formatCurrency(stats.maxValue);
}

function renderCharts(data) {
  const ctxTrend = document.getElementById('salesTrendChart').getContext('2d');
  const ctxProducts = document.getElementById('topProductsChart').getContext('2d');

  // Sales Trend Chart
  if (salesTrendChart) salesTrendChart.destroy();
  salesTrendChart = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels: data.salesTrend.map(d => d.date),
      datasets: [{
        label: 'Revenue (₹)',
        data: data.salesTrend.map(d => d.total),
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: chartOptions()
  });

  // Top Products Chart
  if (topProductsChart) topProductsChart.destroy();
  topProductsChart = new Chart(ctxProducts, {
    type: 'bar',
    data: {
      labels: data.topProducts.map(p => p.product),
      datasets: [{
        label: 'Qty Sold',
        data: data.topProducts.map(p => p.total_qty),
        backgroundColor: [
          '#6366f1', '#a855f7', '#ec4899', '#0ea5e9', '#10b981'
        ],
        borderRadius: 4
      }]
    },
    options: {
      ...chartOptions(),
      indexAxis: 'y'
    }
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#888', font: { size: 10 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#888', font: { size: 10 } }
      }
    }
  };
}

async function loadHistory() {
  const result = await window.api.getInvoices();
  if (result.success) {
    allInvoices = result.invoices;
    // For each invoice, fetch its items to support product searching (frontend only, usually small DB)
    for (let inv of allInvoices) {
      const itemsResult = await window.api.getInvoiceItems(inv.id);
      inv.items = itemsResult.success ? itemsResult.items : [];
    }
    filterAndRender();
  }
}

function filterAndRender() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const start = document.getElementById('filter-start').value;
  const end = document.getElementById('filter-end').value;

  const filtered = allInvoices.filter(inv => {
    const matchesCustomer = inv.customer_name.toLowerCase().includes(search);
    const matchesProduct = inv.items.some(item => item.product.toLowerCase().includes(search));
    
    let matchesDate = true;
    const invDate = inv.created_at.split(' ')[0]; // YYYY-MM-DD
    if (start) matchesDate = matchesDate && (invDate >= start);
    if (end) matchesDate = matchesDate && (invDate <= end);

    return (matchesCustomer || matchesProduct) && matchesDate;
  });

  renderTable(filtered);
}

function renderTable(invoices) {
  const tbody = document.getElementById('invoice-body');
  const emptyState = document.getElementById('empty-state');

  if (invoices.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="td-id">${inv.invoice_number || '#' + inv.id}</td>
      <td class="td-customer">${escapeHtml(inv.customer_name)}</td>
      <td class="td-date">${formatDate(inv.created_at)}</td>
      <td class="td-amount">₹${inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="td-actions">
        <button class="btn-action btn-action--view" onclick="viewInvoice(${inv.id})" title="View Details">
          <span class="material-icons-round">visibility</span>
        </button>
        <button class="btn-action btn-action--pdf" onclick="openPdf(${inv.id})" title="Open PDF">
          <span class="material-icons-round">picture_as_pdf</span>
        </button>
        <button class="btn-action btn-action--delete" onclick="deleteInvoice(${inv.id})" title="Delete Invoice">
          <span class="material-icons-round">delete_outline</span>
        </button>
      </td>
    </tr>
  `).join('');
}

window.openPdf = async (id) => {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;

  const result = await window.api.openInvoicePdf({ 
    customerName: inv.customer_name, 
    createdAt: inv.created_at 
  });

  if (!result.success) {
    showToast(result.error, true);
  } else {
    showToast('Opening PDF...', false);
  }
};

window.viewInvoice = async (id) => {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;

  document.getElementById('modal-invoice-id').textContent = inv.invoice_number || '#' + inv.id;
  document.getElementById('modal-customer').textContent = inv.customer_name;
  document.getElementById('modal-date').textContent = formatDate(inv.created_at);

  const tbody = document.getElementById('modal-items-body');
  tbody.innerHTML = inv.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.product)}</td>
      <td>${item.qty}</td>
      <td>₹${item.price.toLocaleString('en-IN')}</td>
      <td>₹${(item.qty * item.price).toLocaleString('en-IN')}</td>
    </tr>
  `).join('');

  document.getElementById('modal-total').textContent = '₹' + inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  document.getElementById('modal-overlay').classList.add('show');
};

window.deleteInvoice = async (id) => {
  if (confirm('Are you sure you want to delete this invoice? This cannot be undone.')) {
    const result = await window.api.deleteInvoice(id);
    if (result.success) {
      showToast('Invoice deleted', false);
      initDashboard();
    } else {
      showToast('Error: ' + result.error, true);
    }
  }
};

function exportCSV() {
  let csv = 'Invoice ID,Customer,Date,Total Amount,Products\n';
  allInvoices.forEach(inv => {
    const products = inv.items.map(i => i.product).join(' | ');
    csv += `${inv.id},"${inv.customer_name}",${inv.created_at},${inv.total_amount},"${products}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `sales_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Helpers
function formatCurrency(val) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + 
         ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(msg, isError) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  if (isError) toast.style.borderColor = 'var(--accent-rose)';
  else toast.style.borderColor = 'var(--accent-emerald)';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Listeners
document.getElementById('btn-back').addEventListener('click', () => window.location.href = 'home.html');
document.getElementById('btn-refresh').addEventListener('click', () => initDashboard());
document.getElementById('btn-export').addEventListener('click', exportCSV);
document.getElementById('filter-search').addEventListener('input', filterAndRender);
document.getElementById('filter-start').addEventListener('change', filterAndRender);
document.getElementById('filter-end').addEventListener('change', filterAndRender);
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('show'));

// Init
initDashboard();
