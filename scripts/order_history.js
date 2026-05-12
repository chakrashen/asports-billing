let allOrders = [];
let currentOrder = null;
let currentPdfPath = null;

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
    for (const order of allOrders) {
        const itemRes = await window.api.getOrderItems(order.id);
        if (itemRes.success) {
            order.items = itemRes.items;
            order.itemCount = itemRes.items.reduce((sum, item) => sum + item.qty, 0);
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
  const statEl = document.getElementById('stat-total-orders');
  if (statEl) statEl.textContent = count;
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-body');
  const emptyState = document.getElementById('empty-state');
  const query = document.getElementById('search-input').value.toLowerCase();

  const filtered = orders.filter(order => 
    order.supplier_name.toLowerCase().includes(query) || 
    order.id.toString().includes(query) ||
    (order.order_number && order.order_number.toString().includes(query))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = filtered.map((order, idx) => {
    const orderNum = order.order_number ? order.order_number.toString().padStart(4, '0') : order.id;
    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
        <td style="padding: 18px 12px 18px 24px; color: var(--accent-orange); font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 0.95rem; white-space: nowrap;">#${orderNum}</td>
        <td style="padding: 18px 12px; font-weight: 600; color: var(--text-primary); font-size: 0.95rem; white-space: nowrap;">${escapeHtml(order.supplier_name)}</td>
        <td style="padding: 18px 24px; text-align: right; font-weight: 700; color: var(--text-primary); font-family: 'Outfit', sans-serif; font-size: 1rem; white-space: nowrap;">${order.itemCount || 0} Items</td>
        <td style="padding: 18px 12px; text-align: right;">
          <button class="btn-view-detail" onclick="viewDetail(${order.id})">
            <span class="material-icons-round" style="font-size: 18px;">description</span>
            View Detail
          </button>
        </td>
        <td style="padding: 18px 24px; text-align: center;">
          <button onclick="deleteOrder(${order.id})" style="background: rgba(244, 63, 94, 0.1); color: var(--accent-rose); border: 1px solid rgba(244, 63, 94, 0.2); padding: 8px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease;" onmouseover="this.style.background='var(--accent-rose)'; this.style.color='#fff'" onmouseout="this.style.background='rgba(244, 63, 94, 0.1)'; this.style.color='var(--accent-rose)'">
            <span class="material-icons-round" style="font-size: 18px;">delete_outline</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.viewDetail = async (id) => {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  currentOrder = order;

  document.getElementById('pdf-modal').classList.add('show');
  showPdfLoading();
  document.getElementById('pdf-modal-title').textContent = `Purchase Order — ${order.supplier_name}`;

  const itemsResult = await window.api.getOrderItems(order.id);
  if (!itemsResult.success) return;

  const pdfResult = await window.api.downloadOrderPdf({
    supplierName: order.supplier_name,
    phone: order.phone_number,
    email: order.email,
    address: order.supplier_address,
    orderId: order.id,
    items: itemsResult.items
  });

  if (pdfResult && pdfResult.success) {
    currentPdfPath = pdfResult.filePath;
    await displayPdf(pdfResult.filePath);
  }
};

function showPdfLoading() {
  document.getElementById('pdf-modal-body').innerHTML = `
    <div class="pdf-loading">
      <div class="spinner"></div>
      <span>Generating PDF preview...</span>
    </div>
  `;
}

async function displayPdf(filePath) {
  const body = document.getElementById('pdf-modal-body');
  const readResult = await window.api.readOrderPdf(filePath);
  if (readResult && readResult.success) {
    const blob = new Blob([readResult.data], { type: 'application/pdf' });
    const dataUrl = URL.createObjectURL(blob);
    body.innerHTML = `<embed src="${dataUrl}" type="application/pdf" style="width: 100%; height: 100%; border-radius: 8px;">`;
  } else {
    body.innerHTML = '<p style="color: var(--accent-rose); text-align: center; padding: 40px;">Could not read PDF file.</p>';
  }
}

window.deleteOrder = async (id) => {
    if (confirm('Are you sure you want to delete this order?')) {
        const result = await window.api.deleteOrder(id);
        if (result.success) {
            showToast('Order deleted');
            document.getElementById('pdf-modal').classList.remove('show');
            loadOrders();
        } else {
            showToast('Delete failed: ' + result.error, 'error');
        }
    }
};

// PDF Modal Actions
document.getElementById('btn-pdf-download').addEventListener('click', async () => {
    if (currentOrder) {
        const itemsResult = await window.api.getOrderItems(currentOrder.id);
        if (itemsResult.success) {
            const pdfResult = await window.api.downloadOrderPdf({
                supplierName: currentOrder.supplier_name,
                phone: currentOrder.phone_number,
                email: currentOrder.email,
                address: currentOrder.supplier_address,
                orderId: currentOrder.id,
                items: itemsResult.items
            });

            if (pdfResult && pdfResult.success) {
                currentPdfPath = pdfResult.filePath;
                await window.api.showItemInFolder(currentPdfPath);
                showToast('PDF Downloaded successfully!');
            } else {
                showToast('Failed to generate PDF', 'error');
            }
        }
    }
});

document.getElementById('btn-pdf-close').addEventListener('click', () => {
  document.getElementById('pdf-modal').classList.remove('show');
});

document.getElementById('btn-pdf-back').addEventListener('click', () => {
  document.getElementById('pdf-modal').classList.remove('show');
});

document.getElementById('btn-pdf-delete').addEventListener('click', () => {
    if (currentOrder) deleteOrder(currentOrder.id);
});

// ─── Edit Mode Functionality ──────────────────────────────────
document.getElementById('btn-pdf-edit').addEventListener('click', () => {
    if (!currentOrder) return;
    
    // Populate form
    document.getElementById('edit-modal-order-id').textContent = '#' + (currentOrder.order_number || currentOrder.id);
    document.getElementById('edit-supplier').value = currentOrder.supplier_name;
    document.getElementById('edit-phone').value = currentOrder.phone_number || '';
    document.getElementById('edit-email').value = currentOrder.email || '';
    document.getElementById('edit-address').value = currentOrder.supplier_address || '';
    
    // Populate items
    const container = document.getElementById('edit-items-container');
    container.innerHTML = '';
    currentOrder.items.forEach(item => addEditItemRow(item.product, item.qty));
    
    // Show edit modal
    document.getElementById('edit-modal-overlay').classList.add('show');
});

function addEditItemRow(product = '', qty = 1) {
    const container = document.getElementById('edit-items-container');
    const div = document.createElement('div');
    div.className = 'edit-item-row';
    div.style = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
    div.innerHTML = `
        <input type="text" class="form-input edit-item-product" placeholder="Product name" value="${escapeHtml(product)}" style="flex: 2;">
        <input type="number" class="form-input edit-item-qty" placeholder="Qty" value="${qty}" style="flex: 1;" min="1">
        <button class="btn-remove-item material-icons-round" onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--accent-rose); cursor: pointer;">delete</button>
    `;
    container.appendChild(div);
}

document.getElementById('btn-add-edit-item').addEventListener('click', () => addEditItemRow());

document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    document.getElementById('edit-modal-overlay').classList.remove('show');
});

document.getElementById('btn-edit-close').addEventListener('click', () => {
    document.getElementById('edit-modal-overlay').classList.remove('show');
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
        document.getElementById('edit-modal-overlay').classList.remove('show');
        // Refresh PDF preview
        viewDetail(currentOrder.id);
        loadOrders();
    } else {
        showToast('Update failed: ' + result.error, 'error');
    }
});

// Search functionality
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
  div.textContent = text || '';
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
