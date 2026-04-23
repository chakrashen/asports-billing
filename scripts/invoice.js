/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Invoice Screen Logic
   ════════════════════════════════════════════════════════════ */

let rowId = 0;

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();

  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
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

document.getElementById('btn-view-customers').addEventListener('click', () => {
  window.location.href = 'customers.html';
});

document.getElementById('btn-view-history').addEventListener('click', () => {
  window.api.openInvoicesFolder();
});

// ─── Input Validation & Logic ───────────────────────────────
document.getElementById('customer-phone').addEventListener('input', (e) => {
  // Only allow numbers
  e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

document.getElementById('customer-email').addEventListener('blur', (e) => {
  const val = e.target.value.trim();
  if (val && !val.includes('@')) {
    e.target.value = val + '@gmail.com';
  }
});

// ─── Add Row ────────────────────────────────────────────────
function addRow(product = '', qty = '', price = '') {
  rowId++;
  const tbody = document.getElementById('invoice-body');
  const tr = document.createElement('tr');
  tr.dataset.rowId = rowId;

  tr.innerHTML = `
    <td class="row-num">${1}</td>
    <td>
      <input type="text" class="table-input input-product" placeholder="Product name" value="${escapeHtml(product)}" autocomplete="off" spellcheck="false">
    </td>
    <td>
      <input type="number" class="table-input table-input--num input-qty" placeholder="0" min="1" value="${qty}">
    </td>
    <td>
      <input type="number" class="table-input table-input--num input-price" placeholder="0.00" min="0" step="0.01" value="${price}">
    </td>
    <td class="row-total">₹ 0.00</td>
    <td>
      <button class="btn-delete-row" title="Remove item">
        <span class="material-icons-round">close</span>
      </button>
    </td>
  `;

  // Prepend to table (add at top)
  if (tbody.firstChild) {
    tbody.insertBefore(tr, tbody.firstChild);
  } else {
    tbody.appendChild(tr);
  }

  // Attach event listeners
  const qtyInput = tr.querySelector('.input-qty');
  const priceInput = tr.querySelector('.input-price');
  const deleteBtn = tr.querySelector('.btn-delete-row');

  qtyInput.addEventListener('input', () => updateRowTotal(tr));
  priceInput.addEventListener('input', () => updateRowTotal(tr));
  deleteBtn.addEventListener('click', () => removeRow(tr));

  // Focus on product input
  tr.querySelector('.input-product').focus();

  updateRowTotal(tr);
  updateGrandTotal();
  updateItemCount();
  reindexRows();
}

function removeRow(tr) {
  tr.style.opacity = '0';
  tr.style.transform = 'translateX(20px)';
  tr.style.transition = 'all 0.25s ease';

  setTimeout(() => {
    tr.remove();
    reindexRows();
    updateGrandTotal();
    updateItemCount();
  }, 250);
}

function reindexRows() {
  const rows = document.querySelectorAll('#invoice-body tr');
  rows.forEach((row, index) => {
    row.querySelector('.row-num').textContent = index + 1;
  });
}

function getRowCount() {
  return document.querySelectorAll('#invoice-body tr').length;
}

// ─── Calculations ───────────────────────────────────────────
function updateRowTotal(tr) {
  const qty = parseFloat(tr.querySelector('.input-qty').value) || 0;
  const price = parseFloat(tr.querySelector('.input-price').value) || 0;
  const total = qty * price;

  tr.querySelector('.row-total').textContent = '₹ ' + total.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  updateGrandTotal();
}

function updateGrandTotal() {
  const rows = document.querySelectorAll('#invoice-body tr');
  let grandTotal = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.input-qty').value) || 0;
    const price = parseFloat(row.querySelector('.input-price').value) || 0;
    grandTotal += qty * price;
  });

  const paidAmount = parseFloat(document.getElementById('paid-amount').value) || 0;
  const balanceDue = grandTotal - paidAmount;

  document.getElementById('grand-total').textContent = '₹ ' + grandTotal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  document.getElementById('due-total').textContent = '₹ ' + balanceDue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Add event listener for real-time payment calculation
document.getElementById('paid-amount').addEventListener('input', updateGrandTotal);

function updateItemCount() {
  document.getElementById('item-count').textContent = getRowCount();
}

// ─── Add Row Button ─────────────────────────────────────────
document.getElementById('btn-add-row').addEventListener('click', () => {
  addRow();
});

// ─── Clear All ──────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  document.getElementById('customer-name').value = '';
  document.getElementById('customer-phone').value = '';
  document.getElementById('customer-email').value = '';
  document.getElementById('customer-address').value = '';
  document.getElementById('paid-amount').value = '';
  document.getElementById('invoice-body').innerHTML = '';
  rowId = 0;
  updateGrandTotal();
  updateItemCount();
});

// ─── Modal Elements ─────────────────────────────────────────
const modalOverlay = document.getElementById('modal-overlay');
const btnGenerate = document.getElementById('btn-generate');
let currentInvoiceData = null;

// ─── Generate Invoice ───────────────────────────────────────
btnGenerate.addEventListener('click', async () => {
  const customerName = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const email = document.getElementById('customer-email').value.trim();
  const address = document.getElementById('customer-address').value.trim();

  if (!customerName) {
    showToast('Please enter customer name', 'error');
    document.getElementById('customer-name').focus();
    return;
  }

  if (phone && phone.length !== 10) {
    showToast('Phone number must be exactly 10 digits', 'error');
    document.getElementById('customer-phone').focus();
    return;
  }

  const rows = document.querySelectorAll('#invoice-body tr');
  if (rows.length === 0) {
    showToast('Please add at least one item', 'error');
    return;
  }

  const items = [];
  let hasError = false;

  rows.forEach(row => {
    const product = row.querySelector('.input-product').value.trim();
    const qty = parseInt(row.querySelector('.input-qty').value) || 0;
    const price = parseFloat(row.querySelector('.input-price').value) || 0;

    if (!product) {
      hasError = true;
      row.querySelector('.input-product').style.borderColor = 'var(--accent-rose)';
      setTimeout(() => {
        row.querySelector('.input-product').style.borderColor = '';
      }, 2000);
    }

    if (qty <= 0) {
      hasError = true;
      row.querySelector('.input-qty').style.borderColor = 'var(--accent-rose)';
      setTimeout(() => {
        row.querySelector('.input-qty').style.borderColor = '';
      }, 2000);
    }

    if (price <= 0) {
      hasError = true;
      row.querySelector('.input-price').style.borderColor = 'var(--accent-rose)';
      setTimeout(() => {
        row.querySelector('.input-price').style.borderColor = '';
      }, 2000);
    }

    items.push({ product, qty, price });
  });

  if (hasError) {
    showToast('Please fill all item fields correctly', 'error');
    return;
  }

  const nextInvRes = await window.api.getNextInvoiceNumber();
  const nextInvoiceNumber = (nextInvRes && nextInvRes.success) ? nextInvRes.invoiceNumber : 'NEW';

  const paidAmount = parseFloat(document.getElementById('paid-amount').value) || 0;
  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
  const dueAmount = totalAmount - paidAmount;

  currentInvoiceData = { 
    customerName, 
    phone, 
    email, 
    address, 
    items, 
    invoiceNumber: nextInvoiceNumber,
    paidAmount,
    dueAmount
  };
  showInvoiceModal(currentInvoiceData);
});

function numberToWords(num) {
    if (num === 0) return 'Zero Rupees Only';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Rupees Only' : 'Rupees Only';
    return str.trim();
}

// ─── Modal Logic ────────────────────────────────────────────
function showInvoiceModal(data) {
  const { paidAmount, dueAmount } = data;
  let total = 0;
  let itemsHtml = '';
  
  // Need minimum height for rows to match image style
  data.items.forEach((item, index) => {
    const itemTotal = item.qty * item.price;
    total += itemTotal;
    itemsHtml += `
      <tr>
        <td style="padding: 6px; border-right: 1px solid #000; border-bottom: 0;">${escapeHtml(item.product)}</td>
        <td style="padding: 6px; border-right: 1px solid #000; border-bottom: 0; text-align: center;">-</td>
        <td style="padding: 6px; border-right: 1px solid #000; border-bottom: 0; text-align: center;">${item.qty}</td>
        <td style="padding: 6px; border-right: 1px solid #000; border-bottom: 0; text-align: right;">${item.price.toFixed(2)}</td>
        <td style="padding: 6px; border-bottom: 0; text-align: right;">${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  });

  const previewHtml = `
    <div style="background:#fff; color:#000; font-family:Arial, sans-serif; border:1px solid #000; width:100%; margin:0 auto; font-size:12px; line-height:1.4;">
      <!-- Banner -->
      <div style="background:#2f5597; color:#fff; display:flex; padding:5px 10px;">
        <div style="flex:1;"></div>
        <div style="flex:1; text-align:center; font-weight:bold; font-size:16px;">TAX INVOICE</div>
        <div style="flex:1; text-align:right; font-size:10px;">
          INVOICE NO : ${data.invoiceNumber || 'GENERATING...'}<br>
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
      
      <!-- Bill To & Payment -->
      <div style="display:flex; border-bottom:1px solid #000;">
        <div style="flex:1; padding:8px; border-right:1px solid #000;">
          <strong>Bill To:</strong><br>
          <strong>${escapeHtml(data.customerName).toUpperCase()}</strong><br>
          ADDRESS:<br>
          ${escapeHtml(data.address || 'N/A')}<br>
          ${data.email ? 'Email ID: ' + escapeHtml(data.email) + '<br>' : ''}
          ${data.phone ? 'Phone: ' + escapeHtml(data.phone) : ''}
        </div>
        <div style="flex:1; padding:8px; background:#e6f2ff;">
          Payment Due Date:<br>
          Payment Mode:<br>
          <div style="margin-top:5px; padding:2px 5px; ${dueAmount > 0 ? 'background:#ffff00; font-weight:bold;' : ''}">
            Due Amount: ₹ ${dueAmount.toFixed(2)}
          </div>
        </div>
      </div>
      
      <!-- Table -->
      <table style="width:100%; border-collapse:collapse; text-align:left;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th style="padding:6px; border-right:1px solid #000; font-weight:bold;">Description</th>
            <th style="padding:6px; border-right:1px solid #000; font-weight:bold; text-align:center;">HSN Code</th>
            <th style="padding:6px; border-right:1px solid #000; font-weight:bold; text-align:center;">Qty</th>
            <th style="padding:6px; border-right:1px solid #000; font-weight:bold; text-align:right;">Rate</th>
            <th style="padding:6px; font-weight:bold; text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody style="min-height: 200px;">
          ${itemsHtml}
          <tr>
            <!-- Placeholder row to give table height before totals -->
            <td style="padding: 40px 6px; border-right: 1px solid #000;"></td>
            <td style="padding: 40px 6px; border-right: 1px solid #000;"></td>
            <td style="padding: 40px 6px; border-right: 1px solid #000;"></td>
            <td style="padding: 40px 6px; border-right: 1px solid #000;"></td>
            <td style="padding: 40px 6px;"></td>
          </tr>
          <tr>
            <td style="padding:6px; border-right:1px solid #000; border-top:1px solid #000;"></td>
            <td style="padding:6px; border-right:1px solid #000; border-top:1px solid #000;"></td>
            <td style="padding:6px; border-right:1px solid #000; border-top:1px solid #000;"></td>
            <td style="padding:6px; border-right:1px solid #000; border-top:1px solid #000; font-weight:bold; text-align:right;">Total</td>
            <td style="padding:6px; border-top:1px solid #000; font-weight:bold; text-align:right;">${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      
      <!-- Footer Sections -->
      <div style="display:flex; border-top:1px solid #000; border-bottom:1px solid #000;">
        <!-- Terms -->
        <div style="flex:1.2; padding:8px; border-right:1px solid #000; font-size:11px;">
          <strong style="font-size:12px;">Terms & conditions</strong><br>
          Orders once confirmed cannot be canceled.<br>
          No refunds will be processed under any circumstances.<br>
          The provider is not liable for any indirect or consequential losses from the use of services/products.
        </div>
        <!-- Taxes -->
        <div style="flex:1; padding:0; display:flex; flex-direction:column; justify-content:space-between;">
          <div style="padding:8px; padding-bottom:0;">
             <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><strong>Add : CGST @ 0%</strong><span>-</span></div>
             <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><strong>Add : SGST @ 0%</strong><span>-</span></div>
             <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><strong>Balance Received :</strong><span>${(paidAmount || 0).toFixed(2)}</span></div>
             <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><strong>Balance Due :</strong><span>${(dueAmount || 0).toFixed(2)}</span></div>
          </div>
          <div style="background:#2f5597; color:#fff; display:flex; justify-content:space-between; padding:8px; font-weight:bold; border-top:1px solid #000;">
            <span>Grand Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      <!-- Amount in Words -->
      <div style="padding:8px; border-bottom:1px solid #000; display:flex; gap: 15px;">
        <strong>Total Amount (₹ - In Words) :</strong>
        <span>${numberToWords(Math.round(total))}</span>
      </div>
      
      <!-- Signatory -->
      <div style="padding:10px; height: 80px; display:flex; flex-direction:column; justify-content:space-between;">
        <strong>For : ASPORTS ZONE</strong>
        <strong>Authorised Signatory</strong>
      </div>
    </div>
  `;

  document.getElementById('invoice-preview').innerHTML = previewHtml;
  modalOverlay.classList.add('show');
}

// ─── Share Logic ────────────────────────────────────────────

function hideInvoiceModal() {
  modalOverlay.classList.remove('show');
}

// Modal closing events
document.getElementById('modal-close').addEventListener('click', hideInvoiceModal);
document.getElementById('modal-close-x').addEventListener('click', hideInvoiceModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) hideInvoiceModal();
});

// Save Invoice Only Button
document.getElementById('modal-save').addEventListener('click', async () => {
  if (!currentInvoiceData) return;

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  const originalWidth = btn.offsetWidth;
  btn.style.width = originalWidth + 'px';
  btn.innerHTML = '<span class="material-icons-round">hourglass_top</span>';

  try {
    const result = await window.api.saveInvoice(currentInvoiceData);
    
    if (result && result.success) {
      showToast(`Invoice #${result.invoiceId} saved successfully!`, 'success');
      btn.innerHTML = '<span class="material-icons-round">check</span>';
      btn.style.background = 'var(--gradient-emerald)';

      setTimeout(() => {
        hideInvoiceModal();
        resetForm();
        resetSaveBtn(btn);
      }, 1000);
    } else {
      showToast('Error: ' + (result?.error || 'Database error'), 'error');
      resetSaveBtn(btn);
    }
  } catch (error) {
    console.error('Invoice save error:', error);
    showToast('Error: ' + (error.message || 'Failed to save invoice'), 'error');
    resetSaveBtn(btn);
  }
});

function resetSaveBtn(btn) {
  btn.disabled = false;
  btn.style.width = '';
  btn.style.background = '';
  btn.innerHTML = '<span class="material-icons-round">save</span> Save';
}

// Download PDF Button
document.getElementById('modal-download').addEventListener('click', async () => {
  if (!currentInvoiceData) return;

  const btn = document.getElementById('modal-download');
  btn.disabled = true;
  const originalWidth = btn.offsetWidth;
  btn.style.width = originalWidth + 'px';
  btn.innerHTML = '<span class="material-icons-round">hourglass_top</span>';

  try {
    // Step 1: Save invoice to database
    const result = await window.api.saveInvoice(currentInvoiceData);
    
    if (!result || !result.success) {
      showToast('Error: ' + (result?.error || 'Database error'), 'error');
      resetDownloadBtn(btn);
      return;
    }

    // Step 2: Download PDF
    const pdfResult = await window.api.downloadInvoicePdf({
      ...currentInvoiceData,
      invoiceNumber: result.invoiceNumber
    });
    
    if (pdfResult && pdfResult.success) {
      showToast(`Invoice #${result.invoiceId} saved & PDF downloaded!`, 'success');
      btn.innerHTML = '<span class="material-icons-round">check</span>';
      btn.style.background = 'var(--gradient-emerald)';

      setTimeout(() => {
        hideInvoiceModal();
        resetForm();
        resetDownloadBtn(btn);
      }, 1000);
    } else {
      showToast('Saved but PDF failed: ' + (pdfResult?.error || 'Unknown error'), 'error');
      resetDownloadBtn(btn);
    }
  } catch (error) {
    console.error('Invoice generation error:', error);
    showToast('Error: ' + (error.message || 'Failed to process invoice'), 'error');
    resetDownloadBtn(btn);
  }
});

// ─── Integrated Printer System ──────────────────────────────
const printerMenu = document.getElementById('printer-menu');
const printerList = document.getElementById('printer-list');

// Open Printer Menu
document.getElementById('modal-print').addEventListener('click', async () => {
  const previewHtml = document.getElementById('invoice-preview').innerHTML;
  if (!previewHtml) return;

  // Show the menu overlay
  printerMenu.classList.add('show');
  renderPrinterLoading();

  try {
    const printers = await window.api.getPrinters();
    renderPrinterList(printers, previewHtml);
  } catch (error) {
    console.error('Failed to get printers:', error);
    printerList.innerHTML = `
      <div class="printer-placeholder">
        <span class="material-icons-round">error_outline</span>
        <p>Could not load printers. Please check your connection.</p>
      </div>
    `;
  }
});

// Close Printer Menu
document.getElementById('btn-close-printers').addEventListener('click', () => {
  printerMenu.classList.remove('show');
});

function renderPrinterLoading() {
  printerList.innerHTML = `
    <div class="printer-loading">
      <span class="material-icons-round spinner">sync</span>
      <p>Searching for printers...</p>
    </div>
  `;
}

function renderPrinterList(printers, previewHtml) {
  if (!printers || printers.length === 0) {
    printerList.innerHTML = `
      <div class="printer-placeholder">
        <span class="material-icons-round">print_disabled</span>
        <p>No printers found on this system.</p>
      </div>
    `;
    return;
  }

  printerList.innerHTML = '';
  printers.forEach(printer => {
    const isDefault = printer.isDefault;
    const item = document.createElement('div');
    item.className = `printer-item ${isDefault ? 'printer-item--default' : ''}`;
    
    // Determine status color/symbol (Simplified logic for Electron printers)
    const statusText = isDefault ? 'Default Printer' : 'Ready';
    
    item.innerHTML = `
      <div class="printer-item__icon">
        <span class="material-icons-round">print</span>
      </div>
      <div class="printer-item__info">
        <div class="printer-item__name">${escapeHtml(printer.name)}</div>
        <div class="printer-item__status">${statusText}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      executeSilentPrint(printer.name, previewHtml);
    });

    printerList.appendChild(item);
  });
}

async function executeSilentPrint(printerName, html) {
  const printerItems = document.querySelectorAll('.printer-item');
  printerItems.forEach(i => i.style.pointerEvents = 'none'); // Prevent double clicks

  showToast(`Printing to ${printerName}...`, 'success');

  try {
    const result = await window.api.printInvoice({ 
      htmlContent: html, 
      deviceName: printerName 
    });

    if (result && result.success) {
      showToast('Sent to printer successfully!', 'success');
      printerMenu.classList.remove('show');
      // Optional: hide invoice modal after success
      setTimeout(hideInvoiceModal, 1500);
    } else {
      showToast('Print failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    console.error('Silent Print Error:', err);
    showToast('Failed to connect to printer', 'error');
  } finally {
    printerItems.forEach(i => i.style.pointerEvents = 'all');
  }
}
function resetDownloadBtn(btn) {
  btn.disabled = false;
  btn.style.width = '';
  btn.style.background = '';
  btn.innerHTML = '<span class="material-icons-round">file_download</span> Download PDF';
}

function resetForm() {
  document.getElementById('customer-name').value = '';
  document.getElementById('customer-phone').value = '';
  document.getElementById('customer-email').value = '';
  document.getElementById('customer-address').value = '';
  document.getElementById('invoice-body').innerHTML = '';
  rowId = 0;
  updateGrandTotal();
  updateItemCount();
  addRow();
}


// ─── Toast ──────────────────────────────────────────────────
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

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// ─── Utility ────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Keyboard Shortcut ─────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter to generate invoice
  if (e.ctrlKey && e.key === 'Enter') {
    document.getElementById('btn-generate').click();
  }
  // Ctrl+N to add new row
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    addRow();
  }
});

// ─── Initialize with one empty row ─────────────────────────
addRow();
