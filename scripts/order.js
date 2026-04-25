let rowId = 0;
let currentOrderNumber = 1;

async function fetchNextOrderNumber() {
  const result = await window.api.getNextOrderNumber();
  if (result.success) {
    currentOrderNumber = result.orderNumber;
  }
}

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
  window.location.href = 'home.html';
});

document.getElementById('btn-open-downloads').addEventListener('click', () => {
  window.api.openOrdersFolder();
});

document.getElementById('btn-order-history').addEventListener('click', () => {
  window.location.href = 'order_history.html';
});

function addRow(product = '', qty = '') {
  rowId++;
  const tbody = document.getElementById('order-body');
  const tr = document.createElement('tr');
  tr.id = `row-${rowId}`;
  tr.innerHTML = `
    <td class="row-num">${rowId}</td>
    <td><input type="text" class="table-input item-product" placeholder="Product name" value="${product}" spellcheck="false"></td>
    <td><input type="number" class="table-input table-input--num item-qty" placeholder="0" value="${qty}" min="1"></td>
    <td>
      <button class="btn-delete-row" onclick="deleteRow(${rowId})" title="Remove">
        <span class="material-icons-round">close</span>
      </button>
    </td>
  `;
  tbody.prepend(tr);
  reindexRows();
}

window.deleteRow = (id) => {
  const row = document.getElementById(`row-${id}`);
  if (row) row.remove();
  reindexRows();
};

function reindexRows() {
  const rows = document.querySelectorAll('#order-body tr');
  rowId = 0;
  rows.forEach((row, index) => {
    rowId++;
    row.id = `row-${rowId}`;
    row.querySelector('.row-num').textContent = rowId;
    row.querySelector('.btn-delete-row').setAttribute('onclick', `deleteRow(${rowId})`);
  });
}

document.getElementById('btn-add-row').addEventListener('click', () => addRow());

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear all items?')) {
    document.getElementById('order-body').innerHTML = '';
    rowId = 0;
    addRow();
  }
});

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  if (isError) {
    toast.classList.add('toast--error');
    icon.textContent = 'error_outline';
  } else {
    toast.classList.remove('toast--error');
    icon.textContent = 'check_circle';
  }
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Modal Elements
const modalOverlay = document.getElementById('modal-overlay');
const btnGenerate = document.getElementById('btn-generate');
let currentOrderData = null;

function showOrderModal(data) {
  let itemsHtml = '';
  data.items.forEach((item) => {
    itemsHtml += `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #000; border-right: 1px solid #000;">${escapeHtml(item.product)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #000; text-align: center;">${item.qty}</td>
      </tr>
    `;
  });

  const previewHtml = `
    <div style="background:#fff; color:#000; font-family:Arial, sans-serif; border:1px solid #000; width:100%; margin:0 auto; font-size:12px; line-height:1.4;">
      <!-- Banner -->
      <div style="background:#a855f7; color:#fff; display:flex; padding:5px 10px;">
        <div style="flex:1;"></div>
        <div style="flex:1; text-align:center; font-weight:bold; font-size:16px;">PURCHASE ORDER</div>
        <div style="flex:1; text-align:right; font-size:10px;">
          ORDER NO : ${currentOrderNumber.toString().padStart(4, '0')}<br>
          DATE : ${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}
        </div>
      </div>
      
      <!-- Business Header -->
      <div style="text-align:center; padding:15px; border-bottom:1px solid #000;">
        <strong style="font-size:22px;">ASPORTS ZONE</strong><br>
        2nd Rd, Gandhi Maidan, Sardarpura, Jodhpur, Rajasthan<br>
        GSTIN: 08GGVPM6232F1ZW<br>
        Email ID: sportswallajodhpur@gmail.com<br>
        Phone NO. +91 9256323239
      </div>
      
      <!-- Supplier Info -->
      <div style="display:flex; border-bottom:1px solid #000;">
        <div style="flex:1; padding:8px; border-right:1px solid #000;">
          <strong>Supplier Details:</strong><br>
          <strong>${escapeHtml(data.supplierName).toUpperCase()}</strong><br>
          ADDRESS:<br>
          ${escapeHtml(data.address || 'N/A')}<br>
          ${data.email ? 'Email ID: ' + escapeHtml(data.email) + '<br>' : ''}
          ${data.phone ? 'Phone: ' + escapeHtml(data.phone) : ''}
        </div>
        <div style="flex:1; padding:8px; background:#f6f0ff;">
        </div>
      </div>
      
      <!-- Table -->
      <table style="width:100%; border-collapse:collapse; text-align:left;">
        <thead>
          <tr style="border-bottom:1px solid #000; background: #fafafa;">
            <th style="padding:8px; border-right:1px solid #000; font-weight:bold; width: 80%;">Item Description</th>
            <th style="padding:8px; font-weight:bold; text-align:center; width: 20%;">Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr style="border-bottom: 1px solid #000;">
            <td style="padding: 40px 10px; border-right: 1px solid #000;"></td>
            <td style="padding: 40px 10px;"></td>
          </tr>
        </tbody>
      </table>
      
      <!-- Signatory -->
      <div style="padding:10px; height: 80px; display:flex; flex-direction:column; justify-content:space-between;">
        <strong>For : ASPORTS ZONE</strong>
        <strong>Authorised Signatory</strong>
      </div>
    </div>
  `;

  document.getElementById('order-preview').innerHTML = previewHtml;
  modalOverlay.classList.add('show');
}

window.hideModal = () => {
  if (modalOverlay) {
    modalOverlay.classList.remove('show');
  }
};

document.getElementById('modal-close').addEventListener('click', window.hideModal);
document.getElementById('modal-close-x').addEventListener('click', window.hideModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) window.hideModal();
});

btnGenerate.addEventListener('click', async () => {
  const supplierName = document.getElementById('supplier-name').value.trim();
  const phone = document.getElementById('supplier-phone').value.trim();
  const email = document.getElementById('supplier-email').value.trim();
  const address = document.getElementById('supplier-address').value.trim();

  if (!supplierName) {
    showToast('Please enter supplier name', true);
    return;
  }

  const items = [];
  const itemRows = document.querySelectorAll('#order-body tr');
  itemRows.forEach(row => {
    const product = row.querySelector('.item-product').value.trim();
    const qty = parseInt(row.querySelector('.item-qty').value);
    if (product && !isNaN(qty)) {
      items.push({ product, qty });
    }
  });

  if (items.length === 0) {
    showToast('Add at least one item', true);
    return;
  }

  currentOrderData = { supplierName, phone, email, address, items, orderNumber: currentOrderNumber };
  showOrderModal(currentOrderData);
});

// Save Order
document.getElementById('modal-save').addEventListener('click', async () => {
  if (!currentOrderData) return;
  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">hourglass_top</span>';

  try {
    const result = await window.api.saveOrder(currentOrderData);
    if (result && result.success) {
      showToast('Order saved successfully!');
      setTimeout(() => {
        hideModal();
        resetForm();
        resetBtn(btn, 'save', 'Save');
      }, 1000);
    } else {
      showToast('Save failed: ' + (result?.error || 'Unknown error'), true);
      resetBtn(btn, 'save', 'Save');
    }
  } catch (error) {
    showToast('Error: ' + error.message, true);
    resetBtn(btn, 'save', 'Save');
  }
});

// Download PDF
document.getElementById('modal-download').addEventListener('click', async () => {
  if (!currentOrderData) return;
  const btn = document.getElementById('modal-download');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">hourglass_top</span>';

  try {
    const result = await window.api.downloadOrderPdf(currentOrderData);
    if (result && result.success) {
      showToast('Order PDF saved to Desktop!');
      setTimeout(() => {
        hideModal();
        resetForm();
        resetBtn(btn, 'file_download', 'Download PDF');
      }, 1000);
    } else {
      showToast('Download failed: ' + (result?.error || 'Unknown error'), true);
      resetBtn(btn, 'file_download', 'Download PDF');
    }
  } catch (error) {
    showToast('Error: ' + error.message, true);
    resetBtn(btn, 'file_download', 'Download PDF');
  }
});


function resetBtn(btn, icon, text) {
  btn.disabled = false;
  btn.innerHTML = `<span class="material-icons-round">${icon}</span> ${text}`;
}

function resetForm() {
  document.getElementById('supplier-name').value = '';
  document.getElementById('supplier-phone').value = '';
  document.getElementById('supplier-email').value = '';
  document.getElementById('supplier-address').value = '';
  document.getElementById('order-body').innerHTML = '';
  rowId = 0;
  addRow();
  fetchNextOrderNumber();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Auto-append @gmail.com to email input on blur
document.getElementById('supplier-email').addEventListener('blur', function() {
    let val = this.value.trim();
    if (val !== '' && !val.includes('@')) {
        this.value = val + '@gmail.com';
    }
});

// Init
addRow();
fetchNextOrderNumber();
