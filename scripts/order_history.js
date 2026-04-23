let currentOrder = null;

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
  window.location.href = 'order.html';
});

async function loadOrders() {
  const result = await window.api.getOrders();
  if (result.success) {
    allOrders = result.orders;
    
    // Fetch items for all orders
    let totalItems = 0;
    for (const order of allOrders) {
        const itemRes = await window.api.getOrderItems(order.id);
        if (itemRes.success) {
            order.items = itemRes.items;
            order.itemCount = itemRes.items.reduce((sum, item) => sum + item.qty, 0);
            totalItems += order.itemCount;
        }
    }
    
    renderStats(allOrders.length);
    renderOrders(allOrders);
  } else {
    console.error('Failed to load orders:', result.error);
    showToast('Failed to load orders', 'error');
  }
}

function renderStats(count) {
  document.getElementById('stat-total-orders').textContent = count;
}

function renderOrders(orders) {
  const container = document.getElementById('orders-list');
  const emptyState = document.getElementById('empty-state');
  const query = document.getElementById('search-input').value.toLowerCase();

  const filtered = orders.filter(order => 
    order.supplier_name.toLowerCase().includes(query) || 
    order.id.toString().includes(query)
  );

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = filtered.map((order, idx) => {
    const date = new Date(order.created_at);
    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const initials = getInitials(order.supplier_name);
    const orderNum = order.order_number ? order.order_number.toString().padStart(4, '0') : order.id;
    return `
      <div class="order-card" style="animation: fade-in-up 0.5s var(--ease-out) ${idx * 0.05}s both">
        <div class="order-card__id">#${orderNum}</div>
        <div class="order-card__avatar">${initials}</div>
        <div class="order-card__info">
          <div class="order-card__supplier">${escapeHtml(order.supplier_name)}</div>
          <div class="order-card__meta">
            <span class="order-card__meta-item">
              <span class="material-icons-round">inventory_2</span>
              ${order.itemCount || 0} items
            </span>
            <span class="order-card__meta-item">
              <span class="material-icons-round">calendar_today</span>
              ${dateStr}
            </span>
          </div>
        </div>
        <div class="order-card__stat">
          <span class="order-card__stat-value">${order.itemCount || 0}</span>
          <span class="order-card__stat-label">TOTAL QTY</span>
        </div>
        <div class="order-card__actions">
          <button class="btn-detail-action btn-detail-action--edit" onclick="viewDetail(${order.id})" title="View Detail" style="padding: 6px 14px; font-size: 0.7rem;">
            <span class="material-icons-round" style="font-size: 16px;">visibility</span>
            VIEW DETAIL
          </button>
          <button class="btn-card-action btn-card-action--rose" onclick="deleteOrder(${order.id})" title="Delete">
            <span class="material-icons-round">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

window.viewDetail = async (id) => {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  currentOrder = order;
  showModal(order, order.items || []);
};

window.downloadOrder = async (id) => {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    
    showToast('Generating PDF...');
    const result = await window.api.downloadOrderPdf({
        supplierName: order.supplier_name,
        phone: order.phone_number,
        email: order.email,
        address: order.supplier_address,
        orderId: order.id,
        items: order.items
    });
    
    if (result.success) {
        showToast('PDF saved in Desktop/ASPORTS_ORDERS!');
    } else {
        showToast('Download failed: ' + result.error, 'error');
    }
};

window.shareOrder = async (id) => {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    
    showToast('Preparing share...');
    const result = await window.api.downloadOrderPdf({
        supplierName: order.supplier_name,
        phone: order.phone_number,
        email: order.email,
        address: order.supplier_address,
        orderId: order.id,
        items: order.items
    });
    
    if (result.success) {
        const pdfRes = await window.api.readOrderPdf(result.filePath);
        if (pdfRes.success) {
            const filename = `Order_${order.id}_${order.supplier_name.replace(/\s+/g, '_')}.pdf`;
            const file = new File([pdfRes.data], filename, { type: 'application/pdf' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Purchase Order',
                    text: `Order for ${order.supplier_name}`
                });
            } else {
                await window.api.copyFileToClipboard(result.filePath);
                showToast('Path copied to clipboard');
            }
        }
    }
};

window.deleteOrder = async (id) => {
    if (confirm('Are you sure you want to delete this order?')) {
        const result = await window.api.deleteOrder(id);
        if (result.success) {
            showToast('Order deleted');
            loadOrders();
        } else {
            showToast('Delete failed: ' + result.error, 'error');
        }
    }
};

function showModal(order, items) {
  const orderNum = order.order_number ? order.order_number.toString().padStart(4, '0') : order.id;
  document.getElementById('modal-order-id').textContent = '#' + orderNum;
  document.getElementById('modal-supplier').textContent = order.supplier_name;
  
  const date = new Date(order.created_at);
  document.getElementById('modal-date').textContent = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Handle supplier details
  document.getElementById('modal-phone').textContent = order.phone_number || 'N/A';
  document.getElementById('modal-email').textContent = order.email || 'N/A';
  document.getElementById('modal-address').textContent = order.supplier_address || 'N/A';

  const tbody = document.getElementById('modal-items-body');
  tbody.innerHTML = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td style="font-weight: 500; color: var(--text-primary);">${escapeHtml(item.product)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--accent-cyan);">${item.qty}</td>
    </tr>
  `).join('');

  // Reset to View section
  document.getElementById('modal-view-section').style.display = 'block';
  document.getElementById('modal-edit-section').style.display = 'none';
  document.getElementById('btn-modal-edit').style.display = '';
  document.getElementById('btn-modal-download').style.display = '';
  document.getElementById('btn-modal-share').style.display = '';

  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

// ─── Edit Mode Functionality ──────────────────────────────────
document.getElementById('btn-modal-edit').addEventListener('click', () => {
    if (!currentOrder) return;
    
    // Populate form
    document.getElementById('edit-supplier').value = currentOrder.supplier_name;
    document.getElementById('edit-phone').value = currentOrder.phone_number || '';
    document.getElementById('edit-email').value = currentOrder.email || '';
    document.getElementById('edit-address').value = currentOrder.supplier_address || '';
    
    // Populate items
    const container = document.getElementById('edit-items-container');
    container.innerHTML = '';
    currentOrder.items.forEach(item => addEditItemRow(item.product, item.qty));
    
    // Toggle sections
    document.getElementById('modal-view-section').style.display = 'none';
    document.getElementById('modal-edit-section').style.display = 'block';
    document.getElementById('btn-modal-edit').style.display = 'none';
    document.getElementById('btn-modal-download').style.display = 'none';
    document.getElementById('btn-modal-share').style.display = 'none';
});

function addEditItemRow(product = '', qty = 1) {
    const container = document.getElementById('edit-items-container');
    const div = document.createElement('div');
    div.className = 'edit-item-row';
    div.innerHTML = `
        <input type="text" class="form-input edit-item-product" placeholder="Product name" value="${escapeHtml(product)}" style="flex: 2;">
        <input type="number" class="form-input edit-item-qty" placeholder="Qty" value="${qty}" style="flex: 1;" min="1">
        <button class="btn-remove-item material-icons-round" onclick="this.parentElement.remove()">delete</button>
    `;
    container.appendChild(div);
}

document.getElementById('btn-add-edit-item').addEventListener('click', () => addEditItemRow());

document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    document.getElementById('modal-view-section').style.display = 'block';
    document.getElementById('modal-edit-section').style.display = 'none';
    document.getElementById('btn-modal-edit').style.display = '';
    document.getElementById('btn-modal-download').style.display = '';
    document.getElementById('btn-modal-share').style.display = '';
});

document.getElementById('btn-save-edit').addEventListener('click', async () => {
    if (!currentOrder) return;
    
    const supplierName = document.getElementById('edit-supplier').value.trim();
    if (!supplierName) return showToast('Supplier name is required', 'error');
    
    const items = [];
    const itemRows = document.querySelectorAll('.edit-item-row');
    itemRows.forEach(row => {
        const product = row.querySelector('.edit-item-product').value.trim();
        const qty = parseInt(row.querySelector('.edit-item-qty').value);
        if (product && qty > 0) {
            items.push({ product, qty });
        }
    });
    
    if (items.length === 0) return showToast('Please add at least one item', 'error');
    
    const updateData = {
        orderId: currentOrder.id,
        supplierName,
        phone: document.getElementById('edit-phone').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        address: document.getElementById('edit-address').value.trim(),
        items
    };
    
    showToast('Saving changes...');
    const result = await window.api.updateOrder(updateData);
    if (result.success) {
        showToast('Order updated successfully');
        closeModal();
        loadOrders();
    } else {
        showToast('Update failed: ' + result.error, 'error');
    }
});

// Modal Actions
document.getElementById('btn-modal-download').addEventListener('click', () => {
    if (currentOrder) downloadOrder(currentOrder.id);
});

document.getElementById('btn-modal-share').addEventListener('click', () => {
    if (currentOrder) shareOrder(currentOrder.id);
});

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

document.getElementById('search-input').addEventListener('input', () => {
  renderOrders(allOrders);
});

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-msg');

  msg.textContent = message;
  if (type === 'error') {
    icon.textContent = 'error';
    toast.classList.add('toast--error');
  } else {
    icon.textContent = 'check_circle';
    toast.classList.remove('toast--error');
  }

  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-append @gmail.com to email input on blur
document.getElementById('edit-email').addEventListener('blur', function() {
    let val = this.value.trim();
    if (val !== '' && !val.includes('@')) {
        this.value = val + '@gmail.com';
    }
});

// Init
loadOrders();
