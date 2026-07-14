let rowId = 0;
let currentImagePath = null; // Track uploaded image path for PDF generation

// ─── PDF.js Configuration ───────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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

// Set today's date as default for bill date
const today = new Date().toISOString().split('T')[0];
document.getElementById('bill-date').value = today;

document.getElementById('btn-back').addEventListener('click', () => {
  window.location.href = 'home.html';
});

document.getElementById('btn-past-bills').addEventListener('click', () => {
  window.location.href = 'bill_history.html?status=paid';
});

document.getElementById('btn-open-folder').addEventListener('click', async () => {
  const result = await window.api.openPurchaseBillsFolder();
  if (!result.success) {
    showToast(result.error, true);
  }
});

function addRow(product = '', qty = '', rate = '', gst = '5') {
  rowId++;
  const tbody = document.getElementById('bill-body');
  const tr = document.createElement('tr');
  tr.id = `row-${rowId}`;
  tr.dataset.gstAmount = '0.00';
  tr.innerHTML = `
    <td class="row-num">${rowId}</td>
    <td><input type="text" class="table-input item-product" placeholder="Product name" value="${product}" spellcheck="false"></td>
    <td><input type="number" class="table-input table-input--num item-qty" placeholder="0" value="${qty}" min="1"></td>
    <td><input type="number" class="table-input table-input--num item-rate" placeholder="0.00" value="${rate}" step="0.01"></td>
    <td><input type="number" class="table-input table-input--num item-gst" placeholder="0" value="${gst}" min="0" max="100" step="0.01"></td>
    <td class="row-total" style="text-align: right; font-weight: 600; font-family: 'Outfit', sans-serif; color: var(--text-primary); padding-right: 12px;">0.00</td>
    <td>
      <button class="btn-delete-row" onclick="deleteRow(${rowId})" title="Remove">
        <span class="material-icons-round">close</span>
      </button>
    </td>
  `;
  tbody.appendChild(tr);

  // Attach live calculation listeners
  const qtyInput = tr.querySelector('.item-qty');
  const rateInput = tr.querySelector('.item-rate');
  const gstInput = tr.querySelector('.item-gst');

  qtyInput.addEventListener('input', () => recalcRow(tr));
  rateInput.addEventListener('input', () => recalcRow(tr));
  gstInput.addEventListener('input', () => recalcRow(tr));
  
  setupAutoClearZero(gstInput);
}

function recalcRow(tr) {
  const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
  const rate = parseFloat(tr.querySelector('.item-rate').value) || 0;
  let gst = parseFloat(tr.querySelector('.item-gst').value) || 0;
  
  // Inclusive GST logic: rate is the total price per unit
  const totalAmount = qty * rate;
  
  // Back-calculate GST for display/data purposes
  const effectiveGst = Math.max(5, gst);
  const baseAmount = totalAmount / (1 + effectiveGst / 100);
  const gstAmount = totalAmount - baseAmount;
  
  tr.querySelector('.row-total').textContent = totalAmount.toFixed(2);
  tr.dataset.gstAmount = gstAmount.toFixed(2);
  recalculateTotals();
}

function recalculateTotals() {
  const rows = document.querySelectorAll('#bill-body tr');
  let grandTotal = 0;
  let totalGst = 0;
  rows.forEach(row => {
    const totalCell = row.querySelector('.row-total');
    if (totalCell) {
      grandTotal += parseFloat(totalCell.textContent) || 0;
    }
  });
  
  const discount = parseFloat(document.getElementById('discount-amount').value) || 0;
  const finalTotal = Math.max(0, grandTotal - discount);
  
  document.getElementById('total-amount').value = finalTotal.toFixed(2);
  recalcDue();
}

function recalcDue() {
  const total = parseFloat(document.getElementById('total-amount').value) || 0;
  const paid = parseFloat(document.getElementById('paid-amount').value) || 0;
  const due = Math.max(0, total - paid);
  document.getElementById('due-amount').value = due.toFixed(2);
}

document.getElementById('paid-amount').addEventListener('input', recalcDue);
document.getElementById('discount-amount').addEventListener('input', recalculateTotals);
document.getElementById('total-amount').addEventListener('input', recalcDue);

function setupAutoClearZero(input) {
  input.addEventListener('focus', () => {
    if (input.value === '0' || input.value === '0.00' || input.value === '0.0') {
      input.value = '';
    }
  });
  input.addEventListener('blur', () => {
    if (input.value === '') {
      input.value = '0';
      input.dispatchEvent(new Event('input'));
    }
  });
}

setupAutoClearZero(document.getElementById('discount-amount'));
setupAutoClearZero(document.getElementById('paid-amount'));

// ─── Fill Remaining Balance Logic ──────────────────────────
const btnShowDue = document.getElementById('btn-show-due');
const dueBadge = document.getElementById('due-badge');
const paidInput = document.getElementById('paid-amount');
const dueAmountInput = document.getElementById('due-amount');

btnShowDue.addEventListener('click', (e) => {
  e.stopPropagation();
  const isVisible = dueBadge.classList.contains('show');
  
  if (!isVisible) {
    const currentDue = parseFloat(dueAmountInput.value) || 0;
    
    if (currentDue <= 0) {
      showToast('No remaining balance to fill', true);
      return;
    }
    
    dueBadge.textContent = currentDue.toFixed(2);
    dueBadge.classList.add('show');
  } else {
    dueBadge.classList.remove('show');
  }
});

dueBadge.addEventListener('click', () => {
  const amount = parseFloat(dueBadge.textContent) || 0;
  paidInput.value = amount.toFixed(2);
  dueBadge.classList.remove('show');
  recalcDue();
  showToast(`Paid amount set to ₹ ${amount.toLocaleString('en-IN')}`);
});

// Hide badge when clicking anywhere else
document.addEventListener('click', (e) => {
  if (!dueBadge.contains(e.target) && e.target !== btnShowDue) {
    dueBadge.classList.remove('show');
  }
});

// Email auto-suffix logic
document.getElementById('supplier-email').addEventListener('blur', (e) => {
  const val = e.target.value.trim();
  if (val && !val.includes('@')) {
    e.target.value = val + '@gmail.com';
  }
});


window.deleteRow = (id) => {
  const row = document.getElementById(`row-${id}`);
  if (row) row.remove();
  reindexRows();
  recalculateTotals();
};

function reindexRows() {
  const rows = document.querySelectorAll('#bill-body tr');
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
    document.getElementById('bill-body').innerHTML = '';
    rowId = 0;
    addRow();
    recalculateTotals();
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

function showLoading() {
  document.getElementById('loading-overlay').classList.add('show');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('show');
}

// ─── Shared form data collection & validation ──────────────
function collectFormData() {
  const supplierName = document.getElementById('supplier-name').value.trim();
  const invoiceNumber = document.getElementById('invoice-number').value.trim();
  const totalAmount = parseFloat(document.getElementById('total-amount').value);
  const discount = parseFloat(document.getElementById('discount-amount').value) || 0;
  const paidAmount = parseFloat(document.getElementById('paid-amount').value) || 0;
  const dueAmount = parseFloat(document.getElementById('due-amount').value) || 0;
  const supplierAddress = document.getElementById('supplier-address').value.trim();
  const phone = document.getElementById('supplier-phone').value.trim();
  const email = document.getElementById('supplier-email').value.trim();
  const billDate = document.getElementById('bill-date').value;
  const dueDate = document.getElementById('due-date').value;
  const remarks = document.getElementById('bill-remarks').value.trim();
  const showRemarks = document.getElementById('show-remarks-pdf').checked;

  if (!supplierName || !invoiceNumber || !phone || isNaN(totalAmount)) {
    showToast('Please fill Supplier Name, Invoice Number, Contact Number & Total Amount', true);
    return null;
  }

  if (phone.length > 25) {
    showToast('Contact Number cannot exceed 25 digits', true);
    return null;
  }

  const itemRows = document.querySelectorAll('#bill-body tr');
  const items = [];

  itemRows.forEach(row => {
    const product = row.querySelector('.item-product').value.trim();
    const qty = parseInt(row.querySelector('.item-qty').value);
    const rate = parseFloat(row.querySelector('.item-rate').value);
    const gstPercent = parseFloat(row.querySelector('.item-gst').value) || 0;

    if (product && !isNaN(qty) && !isNaN(rate)) {
      items.push({ product, qty, rate, gstPercent });
    }
  });

  if (items.length === 0) {
    showToast('Add at least one item', true);
    return null;
  }

  return { supplierName, supplierAddress, phone, email, invoiceNumber, billDate, dueDate, totalAmount, discount, paidAmount, dueAmount, remarks, showRemarks, items };
}

function clearForm() {
  document.getElementById('supplier-name').value = '';
  document.getElementById('invoice-number').value = '';
  document.getElementById('supplier-address').value = '';
  document.getElementById('supplier-phone').value = '';
  document.getElementById('supplier-email').value = '';
  document.getElementById('bill-remarks').value = '';
  document.getElementById('show-remarks-pdf').checked = true;
  document.getElementById('bill-date').value = today;
  document.getElementById('due-date').value = '';
  document.getElementById('total-amount').value = '';
  document.getElementById('discount-amount').value = '0';
  document.getElementById('paid-amount').value = '0';
  document.getElementById('due-amount').value = '0';
  document.getElementById('bill-body').innerHTML = '';
  rowId = 0;
  addRow();
  resetUploadZone();
}

// ─── Save Bill (saves to Past Bills) ────────────────────────
document.getElementById('btn-save').addEventListener('click', async () => {
  const data = collectFormData();
  if (!data) return;

  showLoading();
  try {
    const result = await window.api.saveBill(data);
    if (result && result.success) {
      showToast('Bill saved successfully!');
      clearForm();
    } else {
      showToast('Save failed: ' + (result?.error || 'Unknown error'), true);
    }
  } catch (err) {
    showToast('An unexpected error occurred: ' + err.message, true);
  } finally {
    hideLoading();
  }
});

// ─── Download & Save (saves to Past Bills + downloads PDF) ──
document.getElementById('btn-download-save').addEventListener('click', async () => {
  const data = collectFormData();
  if (!data) return;

  showLoading();
  try {
    // Save to database first
    const result = await window.api.saveBill(data);
    
    if (result && result.success) {
      // Now generate and download the PDF
      const pdfResult = await window.api.downloadBillPdf(data);
      if (pdfResult && pdfResult.success) {
        showToast('Bill saved & PDF downloaded!');
      } else {
        showToast('Bill saved but PDF failed: ' + (pdfResult?.error || 'Unknown'), true);
      }
      clearForm();
    } else {
      showToast('Save failed: ' + (result?.error || 'Unknown error'), true);
    }
  } catch (err) {
    showToast('An unexpected error occurred: ' + err.message, true);
  } finally {
    hideLoading();
  }
});

// Init
addRow();


/* ═══════════════════════════════════════════════════════════════
   BILL PHOTO UPLOAD & OCR
   ═══════════════════════════════════════════════════════════════ */

const dropzone = document.getElementById('upload-dropzone');
const fileInput = document.getElementById('bill-photo-input');
const dropzoneContent = document.getElementById('dropzone-content');
const uploadPreview = document.getElementById('upload-preview');
const previewImage = document.getElementById('preview-image');
const uploadProcessing = document.getElementById('upload-processing');
const processingText = document.getElementById('processing-text');
const processingBar = document.getElementById('processing-bar');
const uploadStatus = document.getElementById('upload-status');
const uploadStatusText = document.getElementById('upload-status-text');

// ─── Drag & Drop ────────────────────────────────────────────
dropzone.addEventListener('click', (e) => {
  // Don't trigger file input when clicking actions in preview mode
  if (e.target.closest('.upload-preview__actions') || e.target.closest('.upload-processing')) return;
  if (uploadPreview.style.display !== 'none') return;
  fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
    handleUploadFile(file);
  } else {
    showToast('Please upload an image or PDF file', true);
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleUploadFile(file);
});

// ─── Change / Remove buttons ────────────────────────────────
document.getElementById('btn-change-photo').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.value = '';
  fileInput.click();
});

document.getElementById('btn-remove-photo').addEventListener('click', (e) => {
  e.stopPropagation();
  resetUploadZone();
});

function resetUploadZone() {
  currentImagePath = null;
  fileInput.value = '';
  dropzoneContent.style.display = 'flex';
  uploadPreview.style.display = 'none';
  uploadProcessing.style.display = 'none';
  uploadStatus.style.display = 'none';
  processingBar.style.width = '0%';
}

// ─── Handle uploaded file (Image or PDF) ────────────────────
async function handleUploadFile(file) {
  dropzoneContent.style.display = 'none';
  uploadPreview.style.display = 'flex';
  uploadProcessing.style.display = 'flex';
  
  // Show status in header
  uploadStatus.style.display = 'flex';
  uploadStatusText.textContent = 'Preparing file...';

  processingText.textContent = 'Processing file...';
  processingBar.style.width = '5%';

  let imageToProcess = null;

  try {
    if (file.type === 'application/pdf') {
      processingText.textContent = 'Reading PDF...';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for maximum OCR precision
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      previewImage.src = dataUrl;
      
      // We need a path for the backend, but since it's a dataURL from PDF, 
      // we'll send the dataURL directly if the backend supports it, 
      // or save it to a temp file.
      // The current backend ocr-bill-photo expects an imagePath.
      // Let's modify the backend or use a temp file.
      
      // Actually, I can send the dataUrl to a new IPC handler 
      // or modify ocr-bill-photo to handle dataUrl.
      
      // For now, let's assume we use the existing path if it's the original file,
      // but for PDF we converted it.
      // I'll send the dataUrl to the backend.
      imageToProcess = dataUrl;
    } else {
      // Image flow
      const reader = new FileReader();
      const loadPromise = new Promise(resolve => {
        reader.onload = (e) => {
          previewImage.src = e.target.result;
          resolve(e.target.result);
        };
      });
      reader.readAsDataURL(file);
      imageToProcess = await loadPromise;
      
      // Use original path for images if available
      currentImagePath = window.api.getPathForFile(file);
    }

    uploadStatusText.textContent = 'Extracting data...';
    processingBar.style.width = '10%';

    // Listen for progress updates
    window.api.onOcrProgress((data) => {
      const pct = Math.round(data.progress * 100);
      processingBar.style.width = `${pct}%`;
      if (pct < 30) {
        processingText.textContent = 'Loading AI model...';
      } else if (pct < 70) {
        processingText.textContent = 'Analyzing bill structure...';
      } else {
        processingText.textContent = 'Finalizing extraction...';
      }
    });

    // Call OCR handler - we'll update the handler to accept either path or dataUrl
    const result = await window.api.ocrBillPhoto(imageToProcess || currentImagePath);

    uploadProcessing.style.display = 'none';
    processingBar.style.width = '100%';

    if (result && result.success) {
      uploadStatusText.textContent = 'Data extracted!';
      setTimeout(() => { uploadStatus.style.display = 'none'; }, 2000);
      showOcrResultModal(result.data);
    } else {
      uploadStatus.style.display = 'none';
      showToast('Extraction failed: ' + (result?.error || 'Unknown error'), true);
    }
  } catch (err) {
    console.error('File processing error:', err);
    uploadProcessing.style.display = 'none';
    uploadStatus.style.display = 'none';
    showToast('File error: ' + err.message, true);
  }
}

// ─── OCR Result Modal ───────────────────────────────────────
let extractedData = null;

function showOcrResultModal(data) {
  extractedData = data;
  const grid = document.getElementById('ocr-result-grid');

  let html = '';

  // Supplier Name
  html += `
    <div class="ocr-result-field ocr-result-field--highlight">
      <span class="ocr-result-field__label">Supplier</span>
      <span class="ocr-result-field__value">${data.supplierName || '<em style="color:var(--text-muted)">Not detected</em>'}</span>
    </div>
  `;

  // Address, Phone, Email
  if (data.supplierAddress || data.phone || data.email) {
    html += `
      <div class="ocr-result-field">
        <span class="ocr-result-field__label">Contact Details</span>
        <div style="font-size: 0.85rem; color: var(--text-light);">
          ${data.supplierAddress ? `<div><span style="color:var(--text-muted)">Address:</span> ${data.supplierAddress}</div>` : ''}
          ${data.phone ? `<div><span style="color:var(--text-muted)">Phone:</span> ${data.phone}</div>` : ''}
          ${data.email ? `<div><span style="color:var(--text-muted)">Email:</span> ${data.email}</div>` : ''}
        </div>
      </div>
    `;
  }

  // Invoice Number & Dates
  html += `
    <div class="ocr-result-field ocr-result-field--highlight">
      <span class="ocr-result-field__label">Invoice & Dates</span>
      <div style="font-size: 0.85rem; color: var(--text-light);">
        <div><span style="color:var(--text-muted)">No:</span> ${data.invoiceNumber || 'N/A'}</div>
        <div><span style="color:var(--text-muted)">Bill Date:</span> ${data.billDate || 'N/A'}</div>
        <div><span style="color:var(--text-muted)">Due Date:</span> ${data.dueDate || 'N/A'}</div>
      </div>
    </div>
  `;

  // Total Amount
  html += `
    <div class="ocr-result-field ocr-result-field--highlight">
      <span class="ocr-result-field__label">Total Amount</span>
      <span class="ocr-result-field__value" style="font-family:'Outfit',sans-serif; font-weight:700; color:var(--accent-emerald);">₹ ${data.totalAmount ? data.totalAmount.toFixed(2) : '0.00'}</span>
    </div>
  `;

  // Items table
  if (data.items && data.items.length > 0) {
    html += `
      <div class="ocr-result-items">
        <div class="ocr-result-items__title">
          <span class="material-icons-round" style="font-size:16px;">inventory_2</span>
          Detected Items (${data.items.length})
        </div>
        <table class="ocr-result-items__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th style="text-align:center;">Qty</th>
              <th style="text-align:right;">Rate (₹)</th>
              <th style="text-align:right;">GST%</th>
            </tr>
          </thead>
          <tbody>
    `;
    data.items.forEach((item, i) => {
      html += `
            <tr>
              <td>${i + 1}</td>
              <td>${item.product}</td>
              <td style="text-align:center;">${item.qty}</td>
              <td style="text-align:right;">${item.rate.toFixed(2)}</td>
              <td style="text-align:right;">${item.gstPercent || 0}%</td>
            </tr>
      `;
    });
    html += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `
      <div class="ocr-result-field">
        <span class="ocr-result-field__label">Items</span>
        <span class="ocr-result-field__value" style="color:var(--text-muted); font-style:italic;">No line items detected. You can add them manually.</span>
      </div>
    `;
  }

  // Raw OCR text (collapsible)
  html += `
    <details style="margin-top:8px;">
      <summary style="cursor:pointer; font-size:0.78rem; color:var(--text-muted); font-weight:600; padding:8px 0;">
        Show Raw OCR Text
      </summary>
      <pre style="font-size:0.72rem; color:var(--text-muted); background:rgba(0,0,0,0.3); padding:12px; border-radius:8px; max-height:150px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; margin-top:6px;">${escapeHtml(data.rawText)}</pre>
    </details>
  `;

  grid.innerHTML = html;

  // Show modal
  document.getElementById('ocr-modal').classList.add('show');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Modal controls
document.getElementById('ocr-modal-close').addEventListener('click', closeOcrModal);
document.getElementById('ocr-modal-cancel').addEventListener('click', closeOcrModal);

function closeOcrModal() {
  document.getElementById('ocr-modal').classList.remove('show');
}

// Apply extracted data to form
document.getElementById('ocr-modal-apply').addEventListener('click', () => {
  if (!extractedData) return;

  // Fill form fields
  if (extractedData.supplierName) {
    document.getElementById('supplier-name').value = extractedData.supplierName;
  }
  if (extractedData.invoiceNumber) {
    document.getElementById('invoice-number').value = extractedData.invoiceNumber;
  }
  if (extractedData.supplierAddress || extractedData.address) {
    document.getElementById('supplier-address').value = extractedData.supplierAddress || extractedData.address;
  }
  if (extractedData.phone) {
    document.getElementById('supplier-phone').value = extractedData.phone;
  }
  if (extractedData.email) {
    document.getElementById('supplier-email').value = extractedData.email;
  }
  if (extractedData.billDate) {
    document.getElementById('bill-date').value = extractedData.billDate;
  }
  if (extractedData.dueDate) {
    document.getElementById('due-date').value = extractedData.dueDate;
  }
  if (extractedData.totalAmount) {
    document.getElementById('total-amount').value = extractedData.totalAmount.toFixed(2);
  }

  // Fill items
  if (extractedData.items && extractedData.items.length > 0) {
    document.getElementById('bill-body').innerHTML = '';
    rowId = 0;
    extractedData.items.forEach(item => {
      addRow(item.product, item.qty, item.rate, item.gstPercent || '0');
    });
    // Recalculate each row and totals
    document.querySelectorAll('#bill-body tr').forEach(tr => recalcRow(tr));
  } else {
    // If no items, still recalculate to reset GST displays
    recalculateTotals();
  }

  recalcDue();
  closeOcrModal();
  showToast('Bill data filled from photo!');
});

// Close modal on overlay click
document.getElementById('ocr-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeOcrModal();
});
