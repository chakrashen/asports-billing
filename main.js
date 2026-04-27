const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const db = require('./database/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      experimentalFeatures: true
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a1a',
      symbolColor: '#00e5ff',
      height: 36
    },
    backgroundColor: '#0a0a1a',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'home.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ───────────────────────────────────────────

// Save invoice + items
ipcMain.handle('save-invoice', async (event, invoiceData) => {
  try {
    const { customerName, phone, email, address, items, paidAmount, dueAmount } = invoiceData;
    const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.price), 0);

    const insertInvoice = db.prepare(
      `INSERT INTO sales_invoices (customer_name, phone_number, email, billing_address, total_amount, invoice_number, paid_amount, due_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    );
    const insertItem = db.prepare(
      'INSERT INTO sales_items (invoice_id, product, qty, price) VALUES (?, ?, ?, ?)'
    );

    const transaction = (customerName, phone, email, address, totalAmount, items, paid, due) => {
      // Get next invoice number
      const lastInv = db.prepare('SELECT MAX(invoice_number) as max_inv FROM sales_invoices').get();
      const invoiceNumber = (lastInv && lastInv.max_inv && lastInv.max_inv >= 2026100001) ? lastInv.max_inv + 1 : 2026100001;

      const result = insertInvoice.run(customerName, phone, email, address, totalAmount, invoiceNumber, paid, due);
      const invoiceId = result.lastInsertRowid;

      for (const item of items) {
        insertItem.run(invoiceId, item.product, item.qty, item.price);
      }

      return { invoiceId, totalAmount };
    };

    const result = transaction(customerName, phone, email, address, totalAmount, items, paidAmount, dueAmount);
    
    // Fetch the invoice number we just created to return it to the frontend
    const savedInv = db.prepare('SELECT invoice_number FROM sales_invoices WHERE id = ?').get(result.invoiceId);
    
    return { success: true, ...result, invoiceNumber: savedInv?.invoice_number };
  } catch (error) {
    console.error('Error saving invoice:', error);
    return { success: false, error: error.message };
  }
});

// Get next invoice number
ipcMain.handle('get-next-invoice-number', async () => {
  try {
    const lastInv = db.prepare('SELECT MAX(invoice_number) as max_inv FROM sales_invoices').get();
    const invoiceNumber = (lastInv && lastInv.max_inv && lastInv.max_inv >= 2026100001) ? lastInv.max_inv + 1 : 2026100001;
    return { success: true, invoiceNumber };
  } catch (error) {
    console.error('Error fetching next invoice number:', error);
    return { success: false, error: error.message };
  }
});

// Get all invoices
ipcMain.handle('get-invoices', async () => {
  try {
    const invoices = db.prepare('SELECT * FROM sales_invoices ORDER BY id DESC').all();
    return { success: true, invoices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get invoice items
ipcMain.handle('get-invoice-items', async (event, invoiceId) => {
  try {
    const items = db.prepare('SELECT * FROM sales_items WHERE invoice_id = ?').all(invoiceId);
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get ALL invoice items in one query (batch for performance)
ipcMain.handle('get-all-invoice-items', async () => {
  try {
    const items = db.prepare('SELECT * FROM sales_items ORDER BY invoice_id').all();
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Clear all dues for a customer
ipcMain.handle('clear-customer-dues', async (event, { name, phone }) => {
  try {
    const update = db.prepare(`
      UPDATE sales_invoices 
      SET due_amount = 0, paid_amount = total_amount 
      WHERE LOWER(customer_name) = LOWER(?) AND (phone_number = ? OR ? IS NULL OR phone_number IS NULL)
    `);
    
    update.run(name, phone, phone);
    return { success: true };
  } catch (error) {
    console.error('Error clearing customer dues:', error);
    return { success: false, error: error.message };
  }
});

// Delete invoice + its items
ipcMain.handle('delete-invoice', async (event, invoiceId) => {
  try {
    const deleteItems = db.prepare('DELETE FROM sales_items WHERE invoice_id = ?');
    const deleteInvoice = db.prepare('DELETE FROM sales_invoices WHERE id = ?');

    const transaction = db.transaction((id) => {
      deleteItems.run(id);
      deleteInvoice.run(id);
    });

    transaction(invoiceId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return { success: false, error: error.message };
  }
});

// Delete purchase order + its items
ipcMain.handle('delete-order', async (event, orderId) => {
  try {
    const deleteItems = db.prepare('DELETE FROM purchase_order_items WHERE order_id = ?');
    const deleteOrder = db.prepare('DELETE FROM purchase_orders WHERE id = ?');

    const transaction = db.transaction((id) => {
      deleteItems.run(id);
      deleteOrder.run(id);
    });

    transaction(orderId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting order:', error);
    return { success: false, error: error.message };
  }
});

// Save Purchase Order
ipcMain.handle('save-order', async (event, data) => {
  try {
    const { supplierName, phone, email, address, items } = data;
    
    const insertOrder = db.prepare(`
      INSERT INTO purchase_orders (supplier_name, phone_number, email, supplier_address, order_number, created_at) 
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);
    const insertItem = db.prepare('INSERT INTO purchase_order_items (order_id, product, qty) VALUES (?, ?, ?)');

    const transaction = db.transaction((supplier, sPhone, sEmail, sAddress, orderItems) => {
      // Get next order number
      const lastOrd = db.prepare('SELECT MAX(order_number) as max_ord FROM purchase_orders').get();
      const orderNumber = lastOrd && lastOrd.max_ord ? lastOrd.max_ord + 1 : 1;

      const result = insertOrder.run(supplier, sPhone, sEmail, sAddress, orderNumber);
      const orderId = result.lastInsertRowid;
      for (const item of orderItems) {
        insertItem.run(orderId, item.product, item.qty);
      }
      return orderNumber;
    });

    const orderNumber = transaction(supplierName, phone, email, address, items);
    return { success: true, orderNumber };
  } catch (error) {
    console.error('Error saving purchase order:', error);
    return { success: false, error: error.message };
  }
});

// Get next order number
ipcMain.handle('get-next-order-number', async () => {
  try {
    const lastOrd = db.prepare('SELECT MAX(order_number) as max_ord FROM purchase_orders').get();
    const orderNumber = lastOrd && lastOrd.max_ord ? lastOrd.max_ord + 1 : 1;
    return { success: true, orderNumber };
  } catch (error) {
    console.error('Error fetching next order number:', error);
    return { success: false, error: error.message };
  }
});

// Save Purchase Bill
ipcMain.handle('save-bill', async (event, data) => {
  try {
    const { supplierName, supplierAddress, phone, email, invoiceNumber, billDate, dueDate, totalAmount, paidAmount, dueAmount, items } = data;
    // Determine status: 'pending' if there is a due amount, 'paid' if fully paid
    const billStatus = (dueAmount > 0) ? 'pending' : 'paid';
    const insertBill = db.prepare(`INSERT INTO purchase_bills (supplier_name, supplier_address, phone_number, email, invoice_number, bill_date, due_date, total_amount, paid_amount, due_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`);
    const insertItem = db.prepare('INSERT INTO purchase_items (bill_id, product, qty, rate, gst_percent) VALUES (?, ?, ?, ?, ?)');

    const transaction = db.transaction((supplier, address, sPhone, sEmail, invoice, bDate, dDate, total, paid, due, status, billItems) => {
      const result = insertBill.run(supplier, address, sPhone, sEmail, invoice, bDate, dDate, total, paid, due, status);
      const billId = result.lastInsertRowid;
      for (const item of billItems) {
        insertItem.run(billId, item.product, item.qty, item.rate, item.gstPercent || 0);
      }
    });

    transaction(supplierName, supplierAddress || null, phone || null, email || null, invoiceNumber, billDate || null, dueDate || null, totalAmount, paidAmount || 0, dueAmount || 0, billStatus, items);
    return { success: true };
  } catch (error) {
    console.error('Error saving purchase bill:', error);
    return { success: false, error: error.message };
  }
});

// Get all Purchase Orders
ipcMain.handle('get-orders', async () => {
  try {
    const orders = db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all();
    return { success: true, orders };
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return { success: false, error: error.message };
  }
});

// Get Purchase Order Items
ipcMain.handle('get-order-items', async (event, orderId) => {
  try {
    const items = db.prepare('SELECT * FROM purchase_order_items WHERE order_id = ?').all(orderId);
    return { success: true, items };
  } catch (error) {
    console.error('Error fetching purchase order items:', error);
    return { success: false, error: error.message };
  }
});

// Update Purchase Order
ipcMain.handle('update-order', async (event, data) => {
  try {
    const { orderId, supplierName, phone, email, address, items } = data;
    
    const updateOrder = db.prepare(`
      UPDATE purchase_orders 
      SET supplier_name = ?, phone_number = ?, email = ?, supplier_address = ? 
      WHERE id = ?
    `);
    const deleteItems = db.prepare('DELETE FROM purchase_order_items WHERE order_id = ?');
    const insertItem = db.prepare('INSERT INTO purchase_order_items (order_id, product, qty) VALUES (?, ?, ?)');

    const transaction = db.transaction((id, supplier, sPhone, sEmail, sAddress, orderItems) => {
      updateOrder.run(supplier, sPhone, sEmail, sAddress, id);
      deleteItems.run(id);
      for (const item of orderItems) {
        insertItem.run(id, item.product, item.qty);
      }
    });

    transaction(orderId, supplierName, phone, email, address, items);
    return { success: true };
  } catch (error) {
    console.error('Error updating purchase order:', error);
    return { success: false, error: error.message };
  }
});

// Get all Purchase Bills
ipcMain.handle('get-bills', async (event, filterStatus) => {
  try {
    let query = 'SELECT * FROM purchase_bills';
    let params = [];
    if (filterStatus === 'pending') {
      query += ' WHERE due_amount > 0';
    } else if (filterStatus === 'paid') {
      // Show ALL bills for history
    } else if (filterStatus) {
      query += ' WHERE status = ?';
      params.push(filterStatus);
    }
    query += ' ORDER BY id DESC';
    const bills = db.prepare(query).all(...params);
    return { success: true, bills };
  } catch (error) {
    console.error('Error fetching purchase bills:', error);
    return { success: false, error: error.message };
  }
});

// Get Purchase Bill Items
ipcMain.handle('get-bill-items', async (event, billId) => {
  try {
    const items = db.prepare('SELECT * FROM purchase_items WHERE bill_id = ?').all(billId);
    return { success: true, items };
  } catch (error) {
    console.error('Error fetching purchase bill items:', error);
    return { success: false, error: error.message };
  }
});

// Update Bill Status (Pending -> Paid)
ipcMain.handle('update-bill-status', async (event, { billId, status }) => {
  try {
    const update = db.prepare('UPDATE purchase_bills SET status = ? WHERE id = ?');
    update.run(status, billId);
    return { success: true };
  } catch (error) {
    console.error('Error updating bill status:', error);
    return { success: false, error: error.message };
  }
});

// Clear Bill Dues (All Paid)
ipcMain.handle('clear-bill-dues', async (event, billId) => {
  try {
    const update = db.prepare('UPDATE purchase_bills SET paid_amount = total_amount, due_amount = 0, status = ? WHERE id = ?');
    update.run('paid', billId);
    return { success: true };
  } catch (error) {
    console.error('Error clearing bill dues:', error);
    return { success: false, error: error.message };
  }
});

// Get Due Bills sorted by Due Date (for due-date calendar view)
ipcMain.handle('get-due-bills-by-date', async () => {
  try {
    // Fetch all pending bills that have a due_date set, sorted by due_date ascending
    const bills = db.prepare(`
      SELECT * FROM purchase_bills
      WHERE status = 'pending' AND due_amount > 0
      ORDER BY
        CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END ASC,
        due_date ASC
    `).all();
    return { success: true, bills };
  } catch (error) {
    console.error('Error fetching due bills by date:', error);
    return { success: false, error: error.message };
  }
});

// Delete Purchase Bill + its items
ipcMain.handle('delete-bill', async (event, billId) => {
  try {
    const deleteItems = db.prepare('DELETE FROM purchase_items WHERE bill_id = ?');
    const deleteBill = db.prepare('DELETE FROM purchase_bills WHERE id = ?');

    const transaction = db.transaction((id) => {
      deleteItems.run(id);
      deleteBill.run(id);
    });

    transaction(billId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting purchase bill:', error);
    return { success: false, error: error.message };
  }
});

// Get analytics data for dashboard
ipcMain.handle('get-analytics', async () => {
  try {
    // ─── Sales KPIs ─────────────────────────────────────
    const salesStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(AVG(total_amount), 0) as avgValue,
        COALESCE(MAX(total_amount), 0) as maxValue,
        COALESCE(SUM(due_amount), 0) as totalDue,
        COALESCE(SUM(paid_amount), 0) as totalPaid
      FROM sales_invoices
    `).get();

    // ─── Purchase KPIs ──────────────────────────────────
    const purchaseStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as totalSpend,
        COALESCE(SUM(due_amount), 0) as totalDue,
        COALESCE(SUM(paid_amount), 0) as totalPaid
      FROM purchase_bills
    `).get();

    // ─── Unique Customers ───────────────────────────────
    const customerCount = db.prepare(`
      SELECT COUNT(DISTINCT LOWER(customer_name)) as count FROM sales_invoices
    `).get();

    // ─── Today's Revenue ────────────────────────────────
    const todayRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE date(created_at) = date('now', 'localtime')
    `).get();

    // ─── This Month Revenue ─────────────────────────────
    const monthRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get();

    // ─── Last Month Revenue (for growth calc) ───────────
    const lastMonthRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime', '-1 month')
    `).get();

    // ─── Sales Trend (last 30 days) ─────────────────────
    const salesTrend = db.prepare(`
      SELECT date(created_at) as date, SUM(total_amount) as total, COUNT(*) as count
      FROM sales_invoices
      WHERE created_at >= date('now', 'localtime', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();

    // ─── Purchase Trend (last 30 days) ──────────────────
    const purchaseTrend = db.prepare(`
      SELECT date(created_at) as date, SUM(total_amount) as total
      FROM purchase_bills
      WHERE created_at >= date('now', 'localtime', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();

    // ─── Top Products by Quantity ────────────────────────
    const topProducts = db.prepare(`
      SELECT product, SUM(qty) as total_qty, SUM(qty * price) as total_revenue
      FROM sales_items
      GROUP BY LOWER(product)
      ORDER BY total_qty DESC
      LIMIT 10
    `).all();

    // ─── Top Customers by Spend ─────────────────────────
    const topCustomers = db.prepare(`
      SELECT customer_name, 
        SUM(total_amount) as total_spend, 
        COUNT(*) as invoice_count
      FROM sales_invoices
      GROUP BY LOWER(customer_name)
      ORDER BY total_spend DESC
      LIMIT 5
    `).all();

    // ─── Recent Invoices ────────────────────────────────
    const recentInvoices = db.prepare(`
      SELECT id, customer_name, invoice_number, total_amount, paid_amount, due_amount, created_at
      FROM sales_invoices
      ORDER BY id DESC
      LIMIT 20
    `).all();

    // ─── Monthly Breakdown (last 6 months) ──────────────
    const monthlyBreakdown = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, 
        SUM(total_amount) as revenue,
        COUNT(*) as count
      FROM sales_invoices
      WHERE created_at >= date('now', 'localtime', '-6 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `).all();

    // ─── Calculate growth ───────────────────────────────
    const growth = lastMonthRevenue.total > 0
      ? ((monthRevenue.total - lastMonthRevenue.total) / lastMonthRevenue.total * 100)
      : (monthRevenue.total > 0 ? 100 : 0);

    return {
      success: true,
      data: {
        sales: {
          count: salesStats.count || 0,
          revenue: salesStats.revenue || 0,
          avgValue: salesStats.avgValue || 0,
          maxValue: salesStats.maxValue || 0,
          totalDue: salesStats.totalDue || 0,
          totalPaid: salesStats.totalPaid || 0,
          todayRevenue: todayRevenue.total || 0,
          monthRevenue: monthRevenue.total || 0,
          growth: Math.round(growth * 10) / 10
        },
        purchases: {
          count: purchaseStats.count || 0,
          totalSpend: purchaseStats.totalSpend || 0,
          totalDue: purchaseStats.totalDue || 0,
          totalPaid: purchaseStats.totalPaid || 0
        },
        customers: {
          uniqueCount: customerCount.count || 0,
          top: topCustomers
        },
        profit: (salesStats.revenue || 0) - (purchaseStats.totalSpend || 0),
        salesTrend,
        purchaseTrend,
        topProducts,
        recentInvoices,
        monthlyBreakdown
      }
    };
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { success: false, error: error.message };
  }
});

// Update Customer Details (name, phone, email, address) across all their invoices
ipcMain.handle('update-customer-details', async (event, data) => {
  try {
    const { invoiceIds, customerName, phone, email, address } = data;
    const update = db.prepare(
      'UPDATE sales_invoices SET customer_name = ?, phone_number = ?, email = ?, billing_address = ? WHERE id = ?'
    );

    const transaction = db.transaction((ids) => {
      for (const id of ids) {
        update.run(customerName, phone, email, address, id);
      }
    });

    transaction(invoiceIds);
    return { success: true };
  } catch (error) {
    console.error('Error updating customer details:', error);
    return { success: false, error: error.message };
  }
});

// ─── Sharing & File Handlers ────────────────────────────────

// Open Invoice PDF
ipcMain.handle('open-invoice-pdf', async (event, { customerName, createdAt }) => {
  try {
    const sanitizedName = customerName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Invoice';
    const dateStr = createdAt.split(' ')[0];
    const filename = `Invoice_${sanitizedName}_${dateStr}.pdf`;
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const filePath = path.join(desktopPath, filename);
    if (fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return { success: true };
    } else {
      return { success: false, error: 'PDF file not found on Desktop: ' + filename };
    }
  } catch (error) {
    console.error('Error opening PDF:', error);
    return { success: false, error: error.message };
  }
});

// Read Invoice PDF for sharing
ipcMain.handle('read-invoice-pdf', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return { success: true, data: buffer };
    } else {
      return { success: false, error: 'File not found' };
    }
  } catch (error) {
    console.error('Error reading PDF for share:', error);
    return { success: false, error: error.message };
  }
});

// Open Invoices Folder
ipcMain.handle('open-invoices-folder', async () => {
  try {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    if (fs.existsSync(desktopPath)) {
      await shell.openPath(desktopPath);
      return { success: true };
    } else {
      return { success: false, error: 'Desktop folder not found' };
    }
  } catch (error) {
    console.error('Error opening invoices folder:', error);
    return { success: false, error: error.message };
  }
});

// Open Orders Folder
ipcMain.handle('open-orders-folder', async () => {
  try {
    const ordersPath = path.join(os.homedir(), 'Desktop', 'ASPORTS_ORDERS');
    if (fs.existsSync(ordersPath)) {
      await shell.openPath(ordersPath);
      return { success: true };
    } else {
      return { success: false, error: 'Orders folder not found. Please generate an order first.' };
    }
  } catch (error) {
    console.error('Error opening orders folder:', error);
    return { success: false, error: error.message };
  }
});

// Open Purchase Bills Folder
ipcMain.handle('open-purchase-bills-folder', async () => {
  try {
    const billsPath = path.join(os.homedir(), 'Desktop', 'ASPORTS_PURCHASE_BILLS');
    if (fs.existsSync(billsPath)) {
      await shell.openPath(billsPath);
      return { success: true };
    } else {
      return { success: false, error: 'Purchase bills folder not found. Please download a bill first.' };
    }
  } catch (error) {
    console.error('Error opening purchase bills folder:', error);
    return { success: false, error: error.message };
  }
});

// Copy File to Clipboard
ipcMain.handle('copy-file-to-clipboard', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      // Writing the file path to clipboard. 
      // Note: On Windows, this allows apps like File Explorer or WhatsApp to pick it up if they support it.
      clipboard.writeText(filePath);
      return { success: true };
    } else {
      return { success: false, error: 'File not found' };
    }
  } catch (error) {
    console.error('Error copying file to clipboard:', error);
    return { success: false, error: error.message };
  }
});

// Get Printers
ipcMain.handle('get-printers', async (event) => {
  try {
    return event.sender.getPrinters();
  } catch (error) {
    console.error('Error fetching printers:', error);
    return [];
  }
});

// Print Invoice
ipcMain.handle('print-invoice', async (event, { htmlContent, deviceName }) => {
  try {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { margin: 0; padding: 0.5cm; background: #fff; }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `;

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

    return new Promise((resolve) => {
      printWindow.webContents.print({
        silent: deviceName ? true : false,
        printBackground: true,
        deviceName: deviceName || ''
      }, (success, failureReason) => {
        printWindow.close();
        if (success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: failureReason });
        }
      });
    });
  } catch (error) {
    console.error('Print Error:', error);
    return { success: false, error: error.message };
  }
});

// ─── App Lifecycle ──────────────────────────────────────────

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

// Download Invoice PDF
ipcMain.handle('download-invoice-pdf', async (event, invoiceData) => {
  return new Promise((resolve) => {
    try {
      const { customerName, items, invoiceNumber, phone, email, address, paidAmount = 0, dueAmount = 0 } = invoiceData;
      
      const sanitizedName = customerName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Invoice';
      const invNo = (invoiceNumber || 'NEW').toString().replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `Invoice_${invNo}_${sanitizedName}.pdf`;
      const desktopPath = path.join(os.homedir(), 'Desktop');
      const filePath = path.join(desktopPath, filename);

      // Ensure directory exists
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        bufferPages: true
      });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const margin = 30;
      const width = 535; // 595.28 - 60
      const bottomY = 810;

      // Outer Main Bounding Box
      doc.lineWidth(1).strokeColor('#000').rect(margin, margin, width, bottomY - margin).stroke();

      // Top Banner (TAX INVOICE)
      doc.rect(margin, margin, width, 25).fillAndStroke('#2f5597', '#000');
      doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold').text('TAX INVOICE', margin, margin + 6, { width: width, align: 'center' });
      doc.fontSize(8).text(`INVOICE NO : ${invNo}`, margin, margin + 4, { width: width - 5, align: 'right' });
      const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      doc.text(`DATE : ${dateStr}`, margin, margin + 14, { width: width - 5, align: 'right' });

      // BUSINESS NAME Section
      doc.fillColor('#000').fontSize(18).font('Helvetica-Bold').text('ASPORTS ZONE', margin, margin + 35, { width: width, align: 'center' });
      doc.fontSize(10).font('Helvetica').text('2nd Rd, Gandhi Maidan, Sardarpura, Jodhpur, Rajasthan', margin, margin + 55, { width: width, align: 'center' });
      doc.fontSize(9).text('GSTIN: 08GGVPM6232F1ZW', margin, margin + 68, { width: width, align: 'center' });
      doc.text('Email ID: sportswallajodhpur@gmail.com', margin, margin + 79, { width: width, align: 'center' });
      doc.text('Phone NO. +91 9256323239', margin, margin + 90, { width: width, align: 'center' });

      // Horizontal line under Business Name
      doc.moveTo(margin, 140).lineTo(margin + width, 140).stroke();

      // Bill To Section (Left) & Payment Details (Right)
      doc.rect(margin + width / 2, 140, width / 2, 80).fill('#e6f2ff'); // Light blue background for right side
      doc.moveTo(margin + width / 2, 140).lineTo(margin + width / 2, 220).strokeColor('#000').stroke();
      
      // Bill To Data
      doc.fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(10).text('Bill To:', margin + 5, 145);
      doc.text(customerName.toUpperCase(), margin + 5, 158);
      doc.font('Helvetica').fontSize(9);
      doc.text('ADDRESS:\n' + (address ? address : 'N/A'), margin + 5, 170, { width: (width / 2) - 10 });
      if (email) doc.text('Email ID: ' + email, margin + 5, 195);
      if (phone) doc.text('Phone: ' + phone, margin + 5, 205);

      // Payment Details Data
      doc.font('Helvetica').fontSize(9).text('Payment Due Date:', margin + width / 2 + 5, 145);
      doc.text('Payment Mode:', margin + width / 2 + 5, 158);
      
      if (dueAmount > 0) {
        // Yellow highlight for Due Amount
        doc.rect(margin + width / 2 + 3, 170, (width / 2) - 10, 15).fill('#ffff00');
        doc.fillColor('#000').font('Helvetica-Bold').text(`Due Amount: Rs. ${dueAmount.toFixed(2)}`, margin + width / 2 + 5, 174);
      } else {
        doc.fillColor('#000').font('Helvetica').text(`Due Amount: Rs. ${dueAmount.toFixed(2)}`, margin + width / 2 + 5, 174);
      }

      // Horizontal line before table headers
      doc.moveTo(margin, 220).lineTo(margin + width, 220).stroke();

      // Table Headers
      const yHeaders = 220;
      doc.moveTo(margin, 240).lineTo(margin + width, 240).stroke();

      const colXs = [
        margin,             // Description starts
        margin + 230,       // HSN Code
        margin + 290,       // Qty
        margin + 340,       // Rate
        margin + 410,       // Amount
        margin + width      // End
      ];

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Description', colXs[0] + 5, yHeaders + 6);
      doc.text('HSN Code', colXs[1] + 5, yHeaders + 6);
      doc.text('Qty', colXs[2] + 5, yHeaders + 6, { width: colXs[3] - colXs[2] - 10, align: 'center' });
      doc.text('Rate', colXs[3] + 5, yHeaders + 6, { width: colXs[4] - colXs[3] - 10, align: 'center' });
      doc.text('Amount', colXs[4] + 5, yHeaders + 6, { width: colXs[5] - colXs[4] - 10, align: 'center' });

      // Draw all vertical lines for the table all the way down to Total Row (y = 590)
      const tableBottom = 590;
      doc.moveTo(colXs[1], yHeaders).lineTo(colXs[1], tableBottom).stroke();
      doc.moveTo(colXs[2], yHeaders).lineTo(colXs[2], tableBottom).stroke();
      doc.moveTo(colXs[3], yHeaders).lineTo(colXs[3], tableBottom).stroke();
      doc.moveTo(colXs[4], yHeaders).lineTo(colXs[4], tableBottom).stroke();

      // Render Items
      doc.font('Helvetica').fontSize(9);
      let rowY = 245;
      let grandTotal = 0;

      items.forEach((item, index) => {
        const total = item.qty * item.price;
        grandTotal += total;

        doc.text(item.product, colXs[0] + 5, rowY, { width: colXs[1] - colXs[0] - 10 });
        doc.text('-', colXs[1] + 5, rowY, { width: colXs[2] - colXs[1] - 10, align: 'center' });
        doc.text(`${item.qty}`, colXs[2] + 5, rowY, { width: colXs[3] - colXs[2] - 10, align: 'center' });
        doc.text(item.price.toFixed(2), colXs[3] + 5, rowY, { width: colXs[4] - colXs[3] - 10, align: 'right' });
        doc.text(total.toFixed(2), colXs[4] + 5, rowY, { width: colXs[5] - colXs[4] - 10, align: 'right' });

        rowY += 15;
      });

      // Total Row inside table
      doc.moveTo(margin + 290, tableBottom).lineTo(margin + width, tableBottom).stroke(); // horizontal line for totals
      doc.font('Helvetica-Bold');
      doc.text('Total', colXs[3] + 5, tableBottom + 5, { width: colXs[4] - colXs[3] - 10, align: 'right' });
      doc.text(grandTotal.toFixed(2), colXs[4] + 5, tableBottom + 5, { width: colXs[5] - colXs[4] - 10, align: 'right' });

      // End of table section
      const afterTableY = 610;
      doc.moveTo(margin, afterTableY).lineTo(margin + width, afterTableY).stroke();

      // Lower Section: Terms (Left) and Taxes/Totals (Right)
      const midX = margin + 290;
      doc.moveTo(midX, afterTableY).lineTo(midX, 690).stroke(); // vertical divider

      // Left: Terms
      doc.font('Helvetica-Bold').fontSize(9).text('Terms & conditions', margin + 5, afterTableY + 5);
      doc.font('Helvetica').fontSize(8);
      doc.text('Orders once confirmed cannot be canceled.', margin + 5, afterTableY + 18);
      doc.text('No refunds will be processed under any circumstances.', margin + 5, afterTableY + 28);
      doc.text('The provider is not liable for any indirect or consequential', margin + 5, afterTableY + 38);
      doc.text('losses from the use of services/products.', margin + 5, afterTableY + 48);

      // Right: Taxes
      doc.font('Helvetica-Bold').fontSize(9);
      const rightPadding = 5;
      const rightSpan = margin + width - midX - (rightPadding * 2);
      
      const taxesY = afterTableY + 5;
      doc.text('Add : CGST @ 0%', midX + rightPadding, taxesY);
      doc.text('-', midX + rightPadding, taxesY, { width: rightSpan, align: 'right' });
      doc.text('Add : SGST @ 0%', midX + rightPadding, taxesY + 15);
      doc.text('-', midX + rightPadding, taxesY + 15, { width: rightSpan, align: 'right' });
      doc.text('Balance Received :', midX + rightPadding, taxesY + 30);
      doc.text((paidAmount || 0).toFixed(2), midX + rightPadding, taxesY + 30, { width: rightSpan, align: 'right' });
      doc.text('Balance Due :', midX + rightPadding, taxesY + 45);
      doc.text((dueAmount || 0).toFixed(2), midX + rightPadding, taxesY + 45, { width: rightSpan, align: 'right' });

      // Grand Total Box
      doc.rect(midX, 672, margin + width - midX, 18).fillAndStroke('#2f5597', '#000');
      doc.fillColor('#fff').text('Grand Total', midX + rightPadding, 677);
      doc.text(grandTotal.toFixed(2), midX + rightPadding, 677, { width: rightSpan, align: 'right' });

      // Amount in Words Section
      doc.fillColor('#000');
      doc.moveTo(margin, 690).lineTo(margin + width, 690).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Total Amount (₹ - In Words) :', margin + 5, 695);
      doc.font('Helvetica').fontSize(9).text(numberToWords(Math.round(grandTotal)), margin + 145, 695);

      // Business Signatory Section
      doc.moveTo(margin, 730).lineTo(margin + width, 730).stroke();
      doc.font('Helvetica-Bold').fontSize(10).text('For : ASPORTS ZONE', margin + 5, 740);
      doc.font('Helvetica-Bold').fontSize(9).text('Authorised Signatory', margin + 5, bottomY - 15);

      stream.on('finish', () => resolve({ success: true, filePath }));
      doc.end();
    } catch (error) {
      console.error('PDF Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
});

// Download Order PDF
ipcMain.handle('download-order-pdf', async (event, orderData) => {
  return new Promise((resolve) => {
    try {
      const { supplierName, items, orderNumber, phone, email, address } = orderData;
      
      const sanitizedName = supplierName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Order';
      const ordNo = (orderNumber || 'NEW').toString().padStart(4, '0').replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `Order_${ordNo}_${sanitizedName}.pdf`;
      const ordersPath = path.join(os.homedir(), 'Desktop', 'ASPORTS_ORDERS');
      
      const filePath = path.join(ordersPath, filename);

      // Ensure directory exists
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        bufferPages: true
      });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const margin = 30;
      const width = 535;
      const bottomY = 810;

      // Outer Box
      doc.lineWidth(1).strokeColor('#000').rect(margin, margin, width, bottomY - margin).stroke();

      // Top Banner
      doc.rect(margin, margin, width, 25).fillAndStroke('#a855f7', '#000'); // Purple for orders
      doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold').text('PURCHASE ORDER', margin, margin + 6, { width: width, align: 'center' });
      doc.fontSize(8).text(`ORDER NO : ${ordNo}`, margin, margin + 4, { width: width - 5, align: 'right' });
      const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      doc.text(`DATE : ${dateStr}`, margin, margin + 14, { width: width - 5, align: 'right' });

      // BUSINESS NAME Section
      doc.fillColor('#000').fontSize(18).font('Helvetica-Bold').text('ASPORTS ZONE', margin, margin + 35, { width: width, align: 'center' });
      doc.fontSize(10).font('Helvetica').text('2nd Rd, Gandhi Maidan, Sardarpura, Jodhpur, Rajasthan', margin, margin + 55, { width: width, align: 'center' });
      doc.fontSize(9).text('GSTIN: 08GGVPM6232F1ZW', margin, margin + 68, { width: width, align: 'center' });
      doc.text('Email ID: sportswallajodhpur@gmail.com', margin, margin + 79, { width: width, align: 'center' });
      doc.text('Phone NO. +91 9256323239', margin, margin + 90, { width: width, align: 'center' });

      doc.moveTo(margin, 140).lineTo(margin + width, 140).stroke();

      // Supplier Details Section
      doc.rect(margin + width / 2, 140, width / 2, 80).fill('#f6f0ff'); // Light purple background
      doc.moveTo(margin + width / 2, 140).lineTo(margin + width / 2, 220).strokeColor('#000').stroke();
      
      doc.fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(10).text('Supplier Details:', margin + 5, 145);
      doc.text(supplierName.toUpperCase(), margin + 5, 158);
      doc.font('Helvetica').fontSize(9);
      doc.text('ADDRESS:\n' + (address ? address : 'N/A'), margin + 5, 170, { width: (width / 2) - 10 });
      if (email) doc.text('Email ID: ' + email, margin + 5, 195);
      if (phone) doc.text('Phone: ' + phone, margin + 5, 205);

      // doc.font('Helvetica').fontSize(9).text('Shipping Method:', margin + width / 2 + 5, 145);
      // doc.text('Expected Date:', margin + width / 2 + 5, 158);

      doc.moveTo(margin, 220).lineTo(margin + width, 220).stroke();

      // Table Headers
      const yHeaders = 220;
      doc.moveTo(margin, 240).lineTo(margin + width, 240).stroke();

      const colXs = [margin, margin + 440, margin + width];

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Item Description', colXs[0] + 5, yHeaders + 6);
      doc.text('Quantity', colXs[1] + 5, yHeaders + 6, { width: colXs[2] - colXs[1] - 10, align: 'center' });

      const tableBottom = 610;
      doc.moveTo(colXs[1], yHeaders).lineTo(colXs[1], tableBottom).stroke();

      // Render Items
      doc.font('Helvetica').fontSize(10);
      let rowY = 245;

      items.forEach((item) => {
        doc.text(item.product, colXs[0] + 5, rowY, { width: colXs[1] - colXs[0] - 10 });
        doc.text(`${item.qty}`, colXs[1] + 5, rowY, { width: colXs[2] - colXs[1] - 10, align: 'center' });
        rowY += 20;
      });

      const afterTableY = 610;
      doc.moveTo(margin, afterTableY).lineTo(margin + width, afterTableY).stroke();

      doc.moveTo(margin, 730).lineTo(margin + width, 730).stroke();
      doc.font('Helvetica-Bold').fontSize(10).text('For : ASPORTS ZONE', margin + 5, 740);
      doc.font('Helvetica-Bold').fontSize(9).text('Authorised Signatory', margin + 5, bottomY - 15);

      stream.on('finish', () => resolve({ success: true, filePath }));
      doc.end();
    } catch (error) {
      console.error('PDF Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
});

// Read Order PDF
ipcMain.handle('read-order-pdf', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return { success: true, data: buffer };
    } else {
      return { success: false, error: 'File not found' };
    }
  } catch (error) {
    console.error('Error reading Order PDF:', error);
    return { success: false, error: error.message };
  }
});

// ─── Extract Bill Data via Groq Vision AI ───────────────────
const GROQ_API_KEY = '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';

ipcMain.handle('ocr-bill-photo', async (event, imageSource) => {
  try {
    let base64Image;
    let mimeType;

    if (imageSource.startsWith('data:')) {
      // Handle base64 data URL (from PDF conversion)
      const matches = imageSource.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Image = matches[2];
      } else {
        return { success: false, error: 'Invalid image data' };
      }
    } else {
      // Handle local file path
      const imageBuffer = fs.readFileSync(imageSource);
      base64Image = imageBuffer.toString('base64');
      
      // Detect mime type from extension
      const ext = path.extname(imageSource).toLowerCase();
      const mimeMap = { 
        '.jpg': 'image/jpeg', 
        '.jpeg': 'image/jpeg', 
        '.png': 'image/png', 
        '.webp': 'image/webp', 
        '.gif': 'image/gif', 
        '.bmp': 'image/bmp' 
      };
      mimeType = mimeMap[ext] || 'image/jpeg';
    }

    // Send progress
    event.sender.send('ocr-progress', { progress: 0.3 });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this bill/invoice image with 100% precision and extract EVERY detail. Return ONLY a valid JSON object.

JSON format:
{
  "supplierName": "Official name of the company/vendor",
  "supplierAddress": "Full physical address of the supplier",
  "phone": "Contact number/phone of the supplier",
  "email": "Email address of the supplier",
  "invoiceNumber": "The specific Bill/Invoice/Reference number",
  "billDate": "YYYY-MM-DD (convert date to this format)",
  "dueDate": "YYYY-MM-DD (if mentioned, otherwise empty)",
  "totalAmount": 0.00,
  "items": [
    { 
      "product": "Full item description", 
      "qty": 1, 
      "rate": 0.00,
      "gstPercent": 0
    }
  ]
}

Rules:
1. Accuracy is critical. Double check numbers and names.
2. If a field is not found, use an empty string "" or 0.
3. For dates, always use YYYY-MM-DD format.
4. For items, extract the product name, quantity, unit price (rate), and GST percentage if mentioned.
5. totalAmount must be the final payable amount.
6. Return ONLY the raw JSON object. No markdown, no "here is the json", no code blocks.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_completion_tokens: 2048
      })
    });

    event.sender.send('ocr-progress', { progress: 0.8 });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Groq API error:', response.status, errBody);
      return { success: false, error: `Groq API error: ${response.status}` };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';
    
    event.sender.send('ocr-progress', { progress: 1.0 });

    // Parse JSON from response (handle potential markdown code fences)
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(content);
    } catch (e) {
      // Try extracting JSON from markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
      if (jsonMatch && jsonMatch[1]) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        console.error('Failed to parse Groq response:', content);
        return { success: false, error: 'Could not parse AI response' };
      }
    }

    return {
      success: true,
      data: {
        supplierName: parsed.supplierName || '',
        supplierAddress: parsed.supplierAddress || parsed.address || '',
        phone: parsed.phone || '',
        email: parsed.email || '',
        invoiceNumber: parsed.invoiceNumber || '',
        billDate: parsed.billDate || '',
        dueDate: parsed.dueDate || '',
        totalAmount: parseFloat(parsed.totalAmount) || 0,
        items: Array.isArray(parsed.items) ? parsed.items.map(item => ({
          product: item.product || '',
          qty: parseInt(item.qty) || 0,
          rate: parseFloat(item.rate) || 0,
          gstPercent: parseFloat(item.gstPercent) || 0
        })) : [],
        rawText: content
      }
    };
  } catch (error) {
    console.error('Groq Vision Error:', error);
    return { success: false, error: error.message };
  }
});


// ─── Download Purchase Bill PDF ─────────────────────────────
ipcMain.handle('download-bill-pdf', async (event, billData) => {
  return new Promise((resolve) => {
    try {
      const { supplierName, supplierAddress, address, phone, email, invoiceNumber, billDate, dueDate, totalAmount, paidAmount = 0, dueAmount = 0, items } = billData;
      
      const sanitizedName = (supplierName || 'Bill').replace(/[<>:"/\\|?*]/g, '').trim();
      const invNo = (invoiceNumber || 'NEW').toString().replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `PurchaseBill_${invNo}_${sanitizedName}.pdf`;
      const billsPath = path.join(os.homedir(), 'Desktop', 'ASPORTS_PURCHASE_BILLS');
      
      const filePath = path.join(billsPath, filename);

      // Ensure directory exists
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        bufferPages: true
      });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const margin = 30;
      const width = 535; // 595.28 - 60
      const bottomY = 810;

      // Outer Main Bounding Box
      doc.lineWidth(1).strokeColor('#000').rect(margin, margin, width, bottomY - margin).stroke();

      // Top Banner (PURCHASE BILL)
      doc.rect(margin, margin, width, 25).fillAndStroke('#1a6b3c', '#000');
      doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold').text('PURCHASE BILL', margin, margin + 6, { width: width, align: 'center' });
      doc.fontSize(8).text(`BILL NO : ${invNo}`, margin, margin + 4, { width: width - 5, align: 'right' });
      const dateStr = billDate ? new Date(billDate).toLocaleDateString('en-IN').replace(/\//g, '-') : new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      doc.text(`DATE : ${dateStr}`, margin, margin + 14, { width: width - 5, align: 'right' });

      // BUSINESS NAME Section
      doc.fillColor('#000').fontSize(18).font('Helvetica-Bold').text('ASPORTS ZONE', margin, margin + 35, { width: width, align: 'center' });
      doc.fontSize(10).font('Helvetica').text('2nd Rd, Gandhi Maidan, Sardarpura, Jodhpur, Rajasthan', margin, margin + 55, { width: width, align: 'center' });
      doc.fontSize(9).text('GSTIN: 08GGVPM6232F1ZW', margin, margin + 68, { width: width, align: 'center' });
      doc.text('Email ID: sportswallajodhpur@gmail.com', margin, margin + 79, { width: width, align: 'center' });
      doc.text('Phone NO. +91 9256323239', margin, margin + 90, { width: width, align: 'center' });

      // Horizontal line under Business Name
      doc.moveTo(margin, 140).lineTo(margin + width, 140).stroke();

      // Supplier Details Section (Left) & Payment Details (Right)
      doc.rect(margin + width / 2, 140, width / 2, 80).fill('#e6ffe6'); // Light green background for right side
      doc.moveTo(margin + width / 2, 140).lineTo(margin + width / 2, 220).strokeColor('#000').stroke();
      
      // Supplier Data (Left)
      doc.fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(10).text('Supplier:', margin + 5, 145);
      doc.text((supplierName || '').toUpperCase(), margin + 5, 158);
      doc.font('Helvetica').fontSize(9);
      doc.text('ADDRESS: ' + (supplierAddress || address || 'N/A'), margin + 5, 170, { width: (width / 2) - 10 });
      if (email) doc.text('Email: ' + email, margin + 5, 195);
      if (phone) doc.text('Phone: ' + phone, margin + 5, 205);

      // Payment Details Data (Right)
      doc.font('Helvetica').fontSize(9);
      if (dueDate) {
        const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN').replace(/\//g, '-');
        doc.text('Due Date: ' + dueDateStr, margin + width / 2 + 5, 145);
      } else {
        doc.text('Due Date: N/A', margin + width / 2 + 5, 145);
      }
      doc.text('Bill Date: ' + dateStr, margin + width / 2 + 5, 158);
      
      if (dueAmount > 0) {
        // Yellow highlight for Due Amount
        doc.rect(margin + width / 2 + 3, 172, (width / 2) - 10, 15).fill('#ffff00');
        doc.fillColor('#000').font('Helvetica-Bold').text(`Due Amount: Rs. ${dueAmount.toFixed(2)}`, margin + width / 2 + 5, 176);
      } else {
        doc.fillColor('#000').font('Helvetica-Bold').text(`Paid in Full`, margin + width / 2 + 5, 176);
      }
      
      doc.font('Helvetica').fontSize(9);
      doc.fillColor('#000').text(`Paid: Rs. ${paidAmount.toFixed(2)}`, margin + width / 2 + 5, 195);
      doc.text(`Total: Rs. ${totalAmount.toFixed(2)}`, margin + width / 2 + 5, 205);

      // Horizontal line before table headers
      doc.moveTo(margin, 220).lineTo(margin + width, 220).stroke();

      // Table Headers
      const yHeaders = 220;
      doc.moveTo(margin, 240).lineTo(margin + width, 240).stroke();

      const colXs = [
        margin,             // # / Description
        margin + 30,        // Description
        margin + 230,       // Qty
        margin + 290,       // Rate
        margin + 360,       // GST %
        margin + 420,       // Amount
        margin + width      // End
      ];

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('#', colXs[0] + 3, yHeaders + 6, { width: colXs[1] - colXs[0] - 5, align: 'center' });
      doc.text('Description', colXs[1] + 5, yHeaders + 6);
      doc.text('Qty', colXs[2] + 5, yHeaders + 6, { width: colXs[3] - colXs[2] - 10, align: 'center' });
      doc.text('Rate', colXs[3] + 5, yHeaders + 6, { width: colXs[4] - colXs[3] - 10, align: 'center' });
      doc.text('GST %', colXs[4] + 3, yHeaders + 6, { width: colXs[5] - colXs[4] - 6, align: 'center' });
      doc.text('Amount', colXs[5] + 5, yHeaders + 6, { width: colXs[6] - colXs[5] - 10, align: 'center' });

      // Draw all vertical lines for the table
      const tableBottom = 590;
      doc.moveTo(colXs[1], yHeaders).lineTo(colXs[1], tableBottom).stroke();
      doc.moveTo(colXs[2], yHeaders).lineTo(colXs[2], tableBottom).stroke();
      doc.moveTo(colXs[3], yHeaders).lineTo(colXs[3], tableBottom).stroke();
      doc.moveTo(colXs[4], yHeaders).lineTo(colXs[4], tableBottom).stroke();
      doc.moveTo(colXs[5], yHeaders).lineTo(colXs[5], tableBottom).stroke();

      // Render Items
      doc.font('Helvetica').fontSize(9);
      let rowY = 245;
      let grandTotal = 0;
      let totalGstAmount = 0;

      items.forEach((item, index) => {
        const baseAmount = item.qty * item.rate;
        const gstPct = item.gstPercent || 0;
        const gstAmt = baseAmount * (gstPct / 100);
        const lineTotal = baseAmount + gstAmt;
        grandTotal += lineTotal;
        totalGstAmount += gstAmt;

        doc.text(`${index + 1}`, colXs[0] + 3, rowY, { width: colXs[1] - colXs[0] - 5, align: 'center' });
        doc.text(item.product, colXs[1] + 5, rowY, { width: colXs[2] - colXs[1] - 10 });
        doc.text(`${item.qty}`, colXs[2] + 5, rowY, { width: colXs[3] - colXs[2] - 10, align: 'center' });
        doc.text(item.rate.toFixed(2), colXs[3] + 5, rowY, { width: colXs[4] - colXs[3] - 10, align: 'right' });
        doc.text(`${gstPct}%`, colXs[4] + 3, rowY, { width: colXs[5] - colXs[4] - 6, align: 'center' });
        doc.text(lineTotal.toFixed(2), colXs[5] + 5, rowY, { width: colXs[6] - colXs[5] - 10, align: 'right' });

        rowY += 15;
      });

      // Total Row inside table
      doc.moveTo(margin + 290, tableBottom).lineTo(margin + width, tableBottom).stroke();
      doc.font('Helvetica-Bold');
      doc.text('Total', colXs[4] + 3, tableBottom + 5, { width: colXs[5] - colXs[4] - 6, align: 'right' });
      doc.text(grandTotal.toFixed(2), colXs[5] + 5, tableBottom + 5, { width: colXs[6] - colXs[5] - 10, align: 'right' });

      // End of table section
      const afterTableY = 610;
      doc.moveTo(margin, afterTableY).lineTo(margin + width, afterTableY).stroke();

      // Lower Section: Terms (Left) and Taxes/Totals (Right)
      const midX = margin + 290;
      doc.moveTo(midX, afterTableY).lineTo(midX, 690).stroke(); // vertical divider

      // Left: Terms
      doc.font('Helvetica-Bold').fontSize(9).text('Terms & conditions', margin + 5, afterTableY + 5);
      doc.font('Helvetica').fontSize(8);
      doc.text('Goods once sold will not be taken back.', margin + 5, afterTableY + 18);
      doc.text('All disputes are subject to Jodhpur jurisdiction.', margin + 5, afterTableY + 28);
      doc.text('Please check goods at the time of delivery.', margin + 5, afterTableY + 38);
      doc.text('Interest @18% per annum will be charged on overdue.', margin + 5, afterTableY + 48);

      // Right: Taxes & Payment Summary
      doc.font('Helvetica-Bold').fontSize(9);
      const rightPadding = 5;
      const rightSpan = margin + width - midX - (rightPadding * 2);
      
      const taxesY = afterTableY + 5;
      const halfGst = totalGstAmount / 2;
      doc.text('Add : CGST', midX + rightPadding, taxesY);
      doc.text(halfGst.toFixed(2), midX + rightPadding, taxesY, { width: rightSpan, align: 'right' });
      doc.text('Add : SGST', midX + rightPadding, taxesY + 15);
      doc.text(halfGst.toFixed(2), midX + rightPadding, taxesY + 15, { width: rightSpan, align: 'right' });
      doc.text('Balance Received :', midX + rightPadding, taxesY + 30);
      doc.text((paidAmount || 0).toFixed(2), midX + rightPadding, taxesY + 30, { width: rightSpan, align: 'right' });
      doc.text('Balance Due :', midX + rightPadding, taxesY + 45);
      doc.text((dueAmount || 0).toFixed(2), midX + rightPadding, taxesY + 45, { width: rightSpan, align: 'right' });

      // Grand Total Box
      doc.rect(midX, 672, margin + width - midX, 18).fillAndStroke('#1a6b3c', '#000');
      doc.fillColor('#fff').text('Grand Total', midX + rightPadding, 677);
      doc.text(totalAmount.toFixed(2), midX + rightPadding, 677, { width: rightSpan, align: 'right' });

      // Amount in Words Section
      doc.fillColor('#000');
      doc.moveTo(margin, 690).lineTo(margin + width, 690).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Total Amount (₹ - In Words) :', margin + 5, 695);
      doc.font('Helvetica').fontSize(9).text(numberToWords(Math.round(totalAmount)), margin + 145, 695);

      // Business Signatory Section
      doc.moveTo(margin, 730).lineTo(margin + width, 730).stroke();
      doc.font('Helvetica-Bold').fontSize(10).text('For : ASPORTS ZONE', margin + 5, 740);
      doc.font('Helvetica-Bold').fontSize(9).text('Authorised Signatory', margin + 5, bottomY - 15);

      stream.on('finish', () => resolve({ success: true, filePath }));
      doc.end();
    } catch (error) {
      console.error('Purchase Bill PDF Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
});

// ─── Generate Bill PDF (Exact replica from image) ───────────
ipcMain.handle('generate-bill-pdf', async (event, data) => {
  return new Promise((resolve) => {
    try {
      const { imagePath, supplierName, invoiceNumber } = data;
      
      // Read the image to determine its dimensions
      const sharp = (() => {
        try { return require('sharp'); } catch(e) { return null; }
      })();

      const imageBuffer = fs.readFileSync(imagePath);
      
      const sanitizedName = (supplierName || 'Bill').replace(/[<>:"/\\|?*]/g, '').trim();
      const invNo = (invoiceNumber || new Date().getTime()).toString().replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `Bill_${invNo}_${sanitizedName}.pdf`;
      const billsPath = path.join(os.homedir(), 'Desktop', 'ASPORTS_BILLS');
      
      const filePath = path.join(billsPath, filename);
      
      // Ensure the directory for the file exists (handles subdirectories in filename)
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      
      // Create PDF with the image embedded at full page (A4 by default)
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true
      });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      
      // Embed the bill image to fill the entire page while maintaining aspect ratio
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      
      doc.image(imageBuffer, 0, 0, {
        width: pageWidth,
        height: pageHeight,
        fit: [pageWidth, pageHeight],
        align: 'center',
        valign: 'center'
      });
      
      stream.on('finish', () => resolve({ success: true, filePath }));
      doc.end();
    } catch (error) {
      console.error('Bill PDF Generation Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
});

// ─── App Lifecycle ──────────────────────────────────────────

// Fix GPU cache "Access is denied" errors on Windows
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
// NOTE: Do NOT disable-software-rasterizer — it's the fallback when GPU is off.
// Without it, <canvas> (Chart.js) crashes the renderer process.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'asports-billing-cache'));
app.commandLine.appendSwitch('disk-cache-size', '1');

// Ensure only one instance of the app runs at a time
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.error('[ASPORTS] Another instance is already running. Exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the existing window if a second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      createWindow();
    } catch (err) {
      console.error('[ASPORTS] Failed to create window:', err);
      app.quit();
    }
  });


  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
