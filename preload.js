const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onOcrProgress: (callback) => ipcRenderer.on('ocr-progress', (event, data) => callback(data)),
  saveInvoice: (invoiceData) => ipcRenderer.invoke('save-invoice', invoiceData),
  openInvoicesFolder: () => ipcRenderer.invoke('open-invoices-folder'),
  downloadInvoicePdf: (data) => ipcRenderer.invoke('download-invoice-pdf', data),
  readInvoicePdf: (filePath) => ipcRenderer.invoke('read-invoice-pdf', filePath),
  copyFileToClipboard: (filePath) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  openInvoicePdf: (data) => ipcRenderer.invoke('open-invoice-pdf', data),
  getInvoices: () => ipcRenderer.invoke('get-invoices'),
  getInvoiceItems: (invoiceId) => ipcRenderer.invoke('get-invoice-items', invoiceId),
  getAllInvoiceItems: () => ipcRenderer.invoke('get-all-invoice-items'),
  deleteInvoice: (invoiceId) => ipcRenderer.invoke('delete-invoice', invoiceId),
  deleteOrder: (orderId) => ipcRenderer.invoke('delete-order', orderId),
  updateOrder: (data) => ipcRenderer.invoke('update-order', data),
  deleteBill: (billId) => ipcRenderer.invoke('delete-bill', billId),
  saveOrder: (data) => ipcRenderer.invoke('save-order', data),
  saveBill: (data) => ipcRenderer.invoke('save-bill', data),
  getOrders: () => ipcRenderer.invoke('get-orders'),
  getOrderItems: (orderId) => ipcRenderer.invoke('get-order-items', orderId),
  getBills: (status) => ipcRenderer.invoke('get-bills', status),
  getBillItems: (billId) => ipcRenderer.invoke('get-bill-items', billId),
  updateBillStatus: (billId, status) => ipcRenderer.invoke('update-bill-status', { billId, status }),
  getAnalytics: (filter) => ipcRenderer.invoke('get-analytics', filter),
  getProductAnalytics: (filter) => ipcRenderer.invoke('get-product-analytics', filter),
  getSalesAnalytics: (filter) => ipcRenderer.invoke('get-sales-analytics', filter),
  getNextInvoiceNumber: () => ipcRenderer.invoke('get-next-invoice-number'),
  updateCustomerDetails: (data) => ipcRenderer.invoke('update-customer-details', data),
  updateInvoiceItems: (invoiceId, items) => ipcRenderer.invoke('update-invoice-items', { invoiceId, items }),
  printInvoice: (data) => ipcRenderer.invoke('print-invoice', data),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  clearCustomerDues: (name, phone) => ipcRenderer.invoke('clear-customer-dues', { name, phone }),
  clearInvoiceDues: (invoiceId) => ipcRenderer.invoke('clear-invoice-dues', invoiceId),
  downloadOrderPdf: (data) => ipcRenderer.invoke('download-order-pdf', data),
  readOrderPdf: (filePath) => ipcRenderer.invoke('read-order-pdf', filePath),
  openOrdersFolder: () => ipcRenderer.invoke('open-orders-folder'),
  openPurchaseBillsFolder: () => ipcRenderer.invoke('open-purchase-bills-folder'),
  getNextOrderNumber: () => ipcRenderer.invoke('get-next-order-number'),
  ocrBillPhoto: (imagePath) => ipcRenderer.invoke('ocr-bill-photo', imagePath),
  generateBillPdf: (data) => ipcRenderer.invoke('generate-bill-pdf', data),
  downloadBillPdf: (data) => ipcRenderer.invoke('download-bill-pdf', data),
  clearBillDues: (billId) => ipcRenderer.invoke('clear-bill-dues', billId),
  deleteBill: (billId) => ipcRenderer.invoke('delete-bill', billId),
  readBillPdf: (filePath) => ipcRenderer.invoke('read-order-pdf', filePath),
  getDueBillsByDate: () => ipcRenderer.invoke('get-due-bills-by-date'),
  updateBill: (data) => ipcRenderer.invoke('update-bill', data),
  getBillEditHistory: (billId) => ipcRenderer.invoke('get-bill-edit-history', billId),
  getEditPassword: () => ipcRenderer.invoke('get-edit-password'),
  updateEditPassword: (pw) => ipcRenderer.invoke('update-edit-password', pw),
  getRegisteredEmail: () => ipcRenderer.invoke('get-registered-email'),
  sendOtp: (email) => ipcRenderer.invoke('send-otp', email),
  verifyOtp: (otp) => ipcRenderer.invoke('verify-otp', otp),
  searchShopifyProducts: (query, searchBy) => ipcRenderer.invoke('shopify-search-products', { query, searchBy }),
  getShopifyProduct: (productId) => ipcRenderer.invoke('shopify-get-product', productId),
  getSupplierLedgers: () => ipcRenderer.invoke('get-supplier-ledgers'),
  getShopifySyncedInvoiceIds: () => ipcRenderer.invoke('get-shopify-synced-invoice-ids'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Auto-update APIs
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  removeUpdateListener: () => ipcRenderer.removeAllListeners('update-status'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // Shopify order sync listener
  onShopifyOrdersSynced: (callback) => ipcRenderer.on('shopify-orders-synced', (event, data) => callback(data)),
  // AI Assistant and Thermal Printing
  askAssistant: (query) => ipcRenderer.invoke('ask-assistant', query),
  printThermalReceipt: (data) => ipcRenderer.invoke('print-thermal-receipt', data)
});

// ─── Global Font Ready Fix ───────────────────────────────────
// This prevents icons from showing as text (ligatures) before 
// the icon font is fully loaded.
window.addEventListener('DOMContentLoaded', () => {
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      document.body.classList.add('fonts-loaded');
    }).catch(() => {
      document.body.classList.add('fonts-loaded');
    });
  } else {
    document.body.classList.add('fonts-loaded');
  }

  // Fallback: Show everything after 1.5s regardless of font state
  setTimeout(() => {
    document.body.classList.add('fonts-loaded');
  }, 1500);
});
