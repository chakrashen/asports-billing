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
  printThermalReceipt: (data) => ipcRenderer.invoke('print-thermal-receipt', data),
  getLastProductGst: (productName) => ipcRenderer.invoke('get-last-product-gst', productName),
  // ── Inventory Management APIs ─────────────────────────────
  inventoryCreateProduct: (data) => ipcRenderer.invoke('inventory-create-product', data),
  inventoryUpdateProduct: (data) => ipcRenderer.invoke('inventory-update-product', data),
  inventoryGetProducts: (filters) => ipcRenderer.invoke('inventory-get-products', filters),
  inventoryGetProduct: (productId) => ipcRenderer.invoke('inventory-get-product', productId),
  inventorySearchProducts: (query) => ipcRenderer.invoke('inventory-search-products', query),
  inventoryDeleteProduct: (productId) => ipcRenderer.invoke('inventory-delete-product', productId),
  inventoryAddItem: (data) => ipcRenderer.invoke('inventory-add-item', data),
  inventoryBulkAdd: (data) => ipcRenderer.invoke('inventory-bulk-add', data),
  inventoryScanBarcode: (barcode) => ipcRenderer.invoke('inventory-scan-barcode', barcode),
  inventoryUpdateItemStatus: (data) => ipcRenderer.invoke('inventory-update-item-status', data),
  inventoryGetItems: (filters) => ipcRenderer.invoke('inventory-get-items', filters),
  inventoryGetMovements: (filters) => ipcRenderer.invoke('inventory-get-movements', filters),
  inventoryGetDashboard: () => ipcRenderer.invoke('inventory-get-dashboard'),
  inventoryGetProductDetails: (productId) => ipcRenderer.invoke('inventory-get-product-details', productId),
  inventoryBillScan: (barcode) => ipcRenderer.invoke('inventory-bill-scan', barcode),
  inventoryMarkSold: (data) => ipcRenderer.invoke('inventory-mark-sold', data),
  inventoryRestoreInvoice: (invoiceId) => ipcRenderer.invoke('inventory-restore-invoice', invoiceId),
  inventoryReturnItem: (data) => ipcRenderer.invoke('inventory-return-item', data),
  inventoryPurchaseScan: (data) => ipcRenderer.invoke('inventory-purchase-scan', data),
  inventoryPurchaseBulk: (data) => ipcRenderer.invoke('inventory-bulk-add', data),
  // ── Universal Barcode Mapping APIs ─────────────────────────
  inventorySetProductBarcode: (data) => ipcRenderer.invoke('inventory-set-product-barcode', data),
  inventoryLookupBarcode: (barcode) => ipcRenderer.invoke('inventory-lookup-barcode', barcode),

  // ── Camera & CCTV Recording APIs ────────────────────────────
  cctvGetCameras: () => ipcRenderer.invoke('cctv-get-cameras'),
  cctvSaveCamera: (data) => ipcRenderer.invoke('cctv-save-camera', data),
  cctvUpdateCamera: (data) => ipcRenderer.invoke('cctv-update-camera', data),
  cctvDeleteCamera: (cameraId) => ipcRenderer.invoke('cctv-delete-camera', cameraId),
  cctvGetCamera: (cameraId) => ipcRenderer.invoke('cctv-get-camera', cameraId),
  cctvTestConnection: (data) => ipcRenderer.invoke('cctv-test-connection', data),
  cctvStartStream: (data) => ipcRenderer.invoke('cctv-start-stream', data),
  cctvStopStream: (streamId) => ipcRenderer.invoke('cctv-stop-stream', streamId),
  cctvStartRecording: (data) => ipcRenderer.invoke('cctv-start-recording', data),
  cctvStopRecording: (recordingId) => ipcRenderer.invoke('cctv-stop-recording', recordingId),
  webcamSaveRecording: (data) => ipcRenderer.invoke('webcam-save-recording', data),
  recordingGetAll: () => ipcRenderer.invoke('recording-get-all'),
  recordingGetDetails: (id) => ipcRenderer.invoke('recording-get-details', id),
  recordingDelete: (id) => ipcRenderer.invoke('recording-delete', id),
  recordingGetFilePath: (id) => ipcRenderer.invoke('recording-get-file-path', id),
  recordingOpenFolder: () => ipcRenderer.invoke('recording-open-folder'),
  recordingReadFile: (filePath) => ipcRenderer.invoke('recording-read-file', filePath),
  recordingGetByInvoice: (invoiceId) => ipcRenderer.invoke('recording-get-by-invoice', invoiceId),
  recordingGetAllByInvoice: (invoiceId) => ipcRenderer.invoke('recording-get-all-by-invoice', invoiceId),
  // Wireless Phone APIs
  wirelessStartServer: () => ipcRenderer.invoke('wireless-start-server'),
  wirelessStopServer: () => ipcRenderer.invoke('wireless-stop-server'),
  onWirelessFrame: (callback) => ipcRenderer.on('wireless-frame', (event, data) => callback(data)),
  onWirelessStatus: (callback) => ipcRenderer.on('wireless-status', (event, data) => callback(data)),
  onWirelessRecordTrigger: (callback) => ipcRenderer.on('wireless-record-trigger', (event, data) => callback(data)),
  removeWirelessListeners: () => {
    ipcRenderer.removeAllListeners('wireless-frame');
    ipcRenderer.removeAllListeners('wireless-status');
    ipcRenderer.removeAllListeners('wireless-record-trigger');
  },
  // CCTV stream event listeners
  onCctvFrame: (callback) => ipcRenderer.on('cctv-frame', (event, data) => callback(data)),
  onCctvStatus: (callback) => ipcRenderer.on('cctv-status', (event, data) => callback(data)),
  onRecordingError: (callback) => ipcRenderer.on('recording-error', (event, data) => callback(data)),
  removeCctvListeners: () => {
    ipcRenderer.removeAllListeners('cctv-frame');
    ipcRenderer.removeAllListeners('cctv-status');
    ipcRenderer.removeAllListeners('recording-error');
  }
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
