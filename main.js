const path = require('path');
// Load .env from the correct location in both dev and packaged app
const envPath = require('electron')?.app?.isPackaged
  ? path.join(process.resourcesPath, '..', '.env')
  : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const db = require('./database/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const supabase = require('./database/supabase');
const cloudSync = require('./database/supabaseSync');

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
    const { customerName, phone, email, address, items, paidAmount, dueAmount, discountAmount = 0 } = invoiceData;
    const subTotal = items.reduce((sum, item) => sum + (item.qty * item.price * (1 + (item.gstPercent || 0) / 100)), 0);
    const totalAmount = Math.max(0, subTotal - discountAmount);

    const insertInvoice = db.prepare(
      `INSERT INTO sales_invoices (customer_name, phone_number, email, billing_address, total_amount, invoice_number, paid_amount, due_amount, discount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    );
    const insertItem = db.prepare(
      'INSERT INTO sales_items (invoice_id, product, qty, price, gst_percent) VALUES (?, ?, ?, ?, ?)'
    );

    const transaction = (customerName, phone, email, address, totalAmount, items, paid, due, disc) => {
      // Get next invoice number
      const lastInv = db.prepare('SELECT MAX(invoice_number) as max_inv FROM sales_invoices').get();
      const invoiceNumber = (lastInv && lastInv.max_inv && lastInv.max_inv >= 2026100001) ? lastInv.max_inv + 1 : 2026100001;

      const result = insertInvoice.run(customerName, phone, email, address, totalAmount, invoiceNumber, paid, due, disc);
      const invoiceId = result.lastInsertRowid;

      for (const item of items) {
        insertItem.run(invoiceId, item.product, item.qty, item.price, item.gstPercent || 0);
      }

      return { invoiceId, totalAmount };
    };

    const res = transaction(customerName, phone, email, address, totalAmount, items, paidAmount, dueAmount, discountAmount);

    // Fetch the invoice number we just created to return it to the frontend
    const savedInv = db.prepare('SELECT invoice_number FROM sales_invoices WHERE id = ?').get(res.invoiceId);

    // ── Sync to Supabase (cloud) ──
    cloudSync.syncSaveInvoice(res.invoiceId, {
      customerName, phone, email, address, totalAmount,
      invoiceNumber: savedInv?.invoice_number, paidAmount, dueAmount, discount: discountAmount
    }, items);

    // ─── Automate WhatsApp Delivery (DoubleTick) ───────────────────
    if (phone) {
      console.log(`[WhatsApp Sync] Triggering automatic WhatsApp delivery for Invoice #${savedInv?.invoice_number}...`);
      // Run in background (non-blocking)
      sendWhatsAppInvoice({ ...invoiceData, invoiceNumber: savedInv?.invoice_number })
        .then(result => {
          if (result.success) console.log(`[WhatsApp Sync] ✅ WhatsApp delivered to ${phone}`);
          else console.error(`[WhatsApp Sync] ❌ Failed to deliver WhatsApp:`, result.error);
        })
        .catch(err => console.error(`[WhatsApp Sync] CRITICAL ERROR:`, err));
    }

    return { success: true, ...res, invoiceNumber: savedInv?.invoice_number };
  } catch (error) {
    console.error('Error saving invoice:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

// ─── Auto-Update IPC Handlers ──────────────────────────────
ipcMain.handle('start-update-download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    console.error('[ASPORTS] Failed to start update download:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

// Helper: Generate Invoice PDF and return file path
async function generateInvoicePDF(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const { customerName, items, invoiceNumber, phone, email, address, paidAmount = 0, dueAmount = 0 } = invoiceData;
      const discountAmount = invoiceData.discountAmount !== undefined ? invoiceData.discountAmount : (invoiceData.discount || 0);

      const sanitizedName = customerName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Invoice';
      const invNo = (invoiceNumber || 'NEW').toString().replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `Invoice_${invNo}_${sanitizedName}_${Date.now()}.pdf`;
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

      // ── Bill To Section (Left) & Payment Details (Right) ──
      const billToTopY = 140;
      const halfW = width / 2;
      doc.font('Helvetica').fontSize(9);
      const addressText = 'ADDRESS:\n' + (address ? address : 'N/A');
      const addressHeight = doc.heightOfString(addressText, { width: halfW - 10 });
      let leftContentHeight = 13 + 12 + 2 + addressHeight + 5;
      if (email) leftContentHeight += 11;
      if (phone) leftContentHeight += 11;
      const rightContentHeight = 13 * 4 + 15;
      const billToBoxH = Math.max(80, Math.ceil(Math.max(leftContentHeight, rightContentHeight)) + 10);
      const billToBottomY = billToTopY + billToBoxH;

      doc.rect(margin + halfW, billToTopY, halfW, billToBoxH).fill('#e6f2ff');
      doc.moveTo(margin + halfW, billToTopY).lineTo(margin + halfW, billToBottomY).strokeColor('#000').stroke();

      doc.fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(10).text('Bill To:', margin + 5, billToTopY + 5);
      doc.text(customerName.toUpperCase(), margin + 5, billToTopY + 18);
      doc.font('Helvetica').fontSize(9);
      const addrY = billToTopY + 30;
      doc.text(addressText, margin + 5, addrY, { width: halfW - 10 });
      let leftCursorY = addrY + addressHeight + 3;
      if (email) { doc.text('Email ID: ' + email, margin + 5, leftCursorY); leftCursorY += 11; }
      if (phone) { doc.text('Phone: ' + phone, margin + 5, leftCursorY); leftCursorY += 11; }

      const subTotalItems = items.reduce((sum, item) => sum + (item.qty * (item.price || item.rate || 0)), 0);
      const totalGst = items.reduce((sum, item) => sum + (item.qty * (item.price || item.rate || 0) * ((item.gstPercent || item.gst_percent || 0) / 100)), 0);
      const totalGrandAmount = subTotalItems + totalGst;
      const rightX = margin + halfW + 5;
      const rightSpan = halfW - 10;
      const payY = billToTopY + 18;

      doc.text('Total Grand Amount:', rightX, payY);
      doc.text(`${totalGrandAmount.toFixed(2)}`, rightX, payY, { width: rightSpan - 5, align: 'right' });
      doc.text('Discount:', rightX, payY + 13);
      doc.text(`${(discountAmount || 0).toFixed(2)}`, rightX, payY + 13, { width: rightSpan - 5, align: 'right' });
      doc.text('Amount Paid:', rightX, payY + 26);
      doc.text(`${(paidAmount || 0).toFixed(2)}`, rightX, payY + 26, { width: rightSpan - 5, align: 'right' });
      const finalDue = totalGrandAmount - (discountAmount || 0) - (paidAmount || 0);
      const dueY = payY + 39;

      if (finalDue > 0) {
        doc.rect(margin + halfW + 3, dueY - 4, halfW - 10, 15).fill('#ffff00');
        doc.fillColor('#000').font('Helvetica-Bold');
        doc.text('Due Amount:', rightX, dueY);
        doc.text(`${finalDue.toFixed(2)}`, rightX, dueY, { width: rightSpan - 5, align: 'right' });
        doc.font('Helvetica');
      } else {
        doc.fillColor('#000').font('Helvetica');
        doc.text('Due Amount:', rightX, dueY);
        doc.text(`${finalDue.toFixed(2)}`, rightX, dueY, { width: rightSpan - 5, align: 'right' });
      }

      doc.moveTo(margin, billToBottomY).lineTo(margin + width, billToBottomY).stroke();
      const yHeaders = billToBottomY;
      doc.moveTo(margin, yHeaders + 20).lineTo(margin + width, yHeaders + 20).stroke();

      const colXs = [margin, margin + 200, margin + 260, margin + 310, margin + 380, margin + 440, margin + width];
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Description', colXs[0] + 5, yHeaders + 6);
      doc.text('HSN Code', colXs[1] + 5, yHeaders + 6);
      doc.text('Qty', colXs[2] + 5, yHeaders + 6, { width: colXs[3] - colXs[2] - 10, align: 'center' });
      doc.text('Rate', colXs[3] + 5, yHeaders + 6, { width: colXs[4] - colXs[3] - 10, align: 'center' });
      doc.text('GST %', colXs[4] + 5, yHeaders + 6, { width: colXs[5] - colXs[4] - 10, align: 'center' });
      doc.text('Amount', colXs[5] + 5, yHeaders + 6, { width: colXs[6] - colXs[5] - 10, align: 'center' });

      const tableBottom = Math.max(yHeaders + 20 + (items.length * 15) + 30, yHeaders + 370);
      doc.moveTo(colXs[1], yHeaders).lineTo(colXs[1], tableBottom).stroke();
      doc.moveTo(colXs[2], yHeaders).lineTo(colXs[2], tableBottom).stroke();
      doc.moveTo(colXs[3], yHeaders).lineTo(colXs[3], tableBottom).stroke();
      doc.moveTo(colXs[4], yHeaders).lineTo(colXs[4], tableBottom).stroke();
      doc.moveTo(colXs[5], yHeaders).lineTo(colXs[5], tableBottom).stroke();

      doc.font('Helvetica').fontSize(9);
      let rowY = yHeaders + 25;
      items.forEach((item) => {
        const itemBaseTotal = item.qty * (item.price || item.rate || 0);
        const gstPct = item.gstPercent || item.gst_percent || 0;
        doc.text(item.product, colXs[0] + 5, rowY, { width: colXs[1] - colXs[0] - 10 });
        doc.text('-', colXs[1] + 5, rowY, { width: colXs[2] - colXs[1] - 10, align: 'center' });
        doc.text(`${item.qty}`, colXs[2] + 5, rowY, { width: colXs[3] - colXs[2] - 10, align: 'center' });
        doc.text((item.price || item.rate || 0).toFixed(2), colXs[3] + 5, rowY, { width: colXs[4] - colXs[3] - 10, align: 'right' });
        doc.text(`${gstPct}%`, colXs[4] + 5, rowY, { width: colXs[5] - colXs[4] - 10, align: 'center' });
        doc.text(itemBaseTotal.toFixed(2), colXs[5] + 5, rowY, { width: colXs[6] - colXs[5] - 10, align: 'right' });
        rowY += 15;
      });

      const footerY = tableBottom - 15;
      doc.moveTo(margin, footerY).lineTo(margin + width, footerY).stroke();
      doc.font('Helvetica-Bold').fontSize(9);
      const totalQty = items.reduce((sum, it) => sum + it.qty, 0);
      doc.text('Total', colXs[0] + 5, footerY + 4);
      doc.text('-', colXs[1] + 5, footerY + 4, { width: colXs[2] - colXs[1] - 10, align: 'center' });
      doc.text(`${totalQty}`, colXs[2] + 5, footerY + 4, { width: colXs[3] - colXs[2] - 10, align: 'center' });
      doc.text(subTotalItems.toFixed(2), colXs[5] + 5, footerY + 4, { width: colXs[6] - colXs[5] - 10, align: 'right' });

      const afterTableY = tableBottom;
      doc.moveTo(margin, afterTableY).lineTo(margin + width, afterTableY).stroke();

      const midX = margin + 290;
      const termsBottomY = afterTableY + 80;
      doc.moveTo(midX, afterTableY).lineTo(midX, termsBottomY).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Terms & conditions', margin + 5, afterTableY + 5);
      doc.font('Helvetica').fontSize(8);
      doc.text('Orders once confirmed cannot be canceled.', margin + 5, afterTableY + 18);
      doc.text('No refunds will be processed under any circumstances.', margin + 5, afterTableY + 28);
      doc.text('The provider is not liable for any indirect or consequential', margin + 5, afterTableY + 38);
      doc.text('losses from the use of services/products.', margin + 5, afterTableY + 48);
      doc.text("Subject to 'jodhpur' Jurisdiction only.", margin + 5, afterTableY + 58);

      doc.font('Helvetica-Bold').fontSize(9);
      const rightPadding = 5;
      const summarySpan = margin + width - midX - (rightPadding * 2);
      const taxesY = afterTableY + 5;
      doc.text(`CGST :`, midX + rightPadding, taxesY);
      doc.text((totalGst / 2).toFixed(2), midX + rightPadding, taxesY, { width: summarySpan, align: 'right' });
      doc.text(`SGST :`, midX + rightPadding, taxesY + 12);
      doc.text((totalGst / 2).toFixed(2), midX + rightPadding, taxesY + 12, { width: summarySpan, align: 'right' });
      doc.moveTo(midX + 160, taxesY + 24).lineTo(margin + width - 5, taxesY + 24).stroke();
      const netTotal = totalGrandAmount - (discountAmount || 0);
      doc.text(`Total Tax :`, midX + rightPadding, taxesY + 28);
      doc.text(totalGst.toFixed(2), midX + rightPadding, taxesY + 28, { width: summarySpan, align: 'right' });
      doc.text(`Discount :`, midX + rightPadding, taxesY + 40);
      doc.text((discountAmount || 0).toFixed(2), midX + rightPadding, taxesY + 40, { width: summarySpan, align: 'right' });

      const grandTotalY = afterTableY + 62;
      doc.rect(midX, grandTotalY, margin + width - midX, 18).fillAndStroke('#2f5597', '#000');
      doc.fillColor('#fff').text('Grand Total', midX + rightPadding, grandTotalY + 5);
      doc.text(netTotal.toFixed(2), midX + rightPadding, grandTotalY + 5, { width: summarySpan, align: 'right' });

      const wordsY = termsBottomY;
      doc.fillColor('#000');
      doc.moveTo(margin, wordsY).lineTo(margin + width, wordsY).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Total Amount (₹ - In Words) :', margin + 5, wordsY + 5);
      doc.font('Helvetica').fontSize(9).text(numberToWords(Math.round(netTotal)), margin + 145, wordsY + 5);

      const sigY = wordsY + 40;
      doc.moveTo(margin, sigY).lineTo(margin + width, sigY).stroke();
      doc.font('Helvetica-Bold').fontSize(10).text('For : ASPORTS ZONE', margin + 5, sigY + 10);
      doc.font('Helvetica-Bold').fontSize(9).text('Authorised Signatory', margin + 5, bottomY - 15);

      stream.on('finish', () => resolve(filePath));
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ─── Automate WhatsApp Delivery (DoubleTick) ───────────────────────────

async function sendWhatsAppInvoice(invoiceData) {
  const apiKey = process.env.DOUBLETICK_API_KEY;
  const fromNumber = process.env.DOUBLETICK_WABA_NUMBER;

  if (!apiKey || !fromNumber) {
    return { success: false, error: 'DoubleTick API credentials missing in .env' };
  }

  try {
    const { phone, customerName, invoiceNumber } = invoiceData;
    // Format phone number (ensure +91 for India if not present)
    let toPhone = phone.trim().replace(/\s+/g, '');
    if (toPhone.length === 10) toPhone = '+91' + toPhone;
    else if (toPhone.startsWith('0')) toPhone = '+91' + toPhone.substring(1);
    else if (!toPhone.startsWith('+')) toPhone = '+' + toPhone;

    // 1. Generate PDF
    console.log('[WhatsApp Sync] Generating PDF...');
    const filePath = await generateInvoicePDF(invoiceData);

    // 2. Upload PDF to DoubleTick
    console.log('[WhatsApp Sync] Uploading PDF to DoubleTick...');
    const uploadRes = await uploadToDoubleTick(filePath, apiKey);
    if (!uploadRes.success) throw new Error(`Upload failed: ${uploadRes.error}`);
    const mediaUrl = uploadRes.mediaUrl;
    console.log('[WhatsApp Sync] PDF uploaded successfully:', mediaUrl);

    // 3. Send Template Message (your_order_is_confirmed__)
    console.log(`[WhatsApp Sync] Sending confirmation template to ${toPhone}...`);
    const templateRes = await fetch('https://public.doubletick.io/whatsapp/message/template', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          to: toPhone,
          from: fromNumber,
          content: {
            language: 'en',
            templateName: 'your_order_is_confirmed__',
            templateData: {} // Omit placeholders since there are none
          }
        }]
      })
    });

    const templateData = await templateRes.json().catch(() => ({}));
    if (!templateRes.ok) {
      console.warn('[WhatsApp Sync] ⚠️ Template message failed:', templateRes.status, JSON.stringify(templateData));
    } else {
      console.log('[WhatsApp Sync] ✅ Template message sent. ID:', templateData.msgId || 'N/A');
    }

    // ─── CRITICAL: Wait for the window to open ───
    console.log('[WhatsApp Sync] Waiting 10 seconds for WhatsApp window to open...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 4. Send Document Message (The Invoice PDF)
    console.log(`[WhatsApp Sync] Sending Invoice PDF document to ${toPhone}...`);
    const docRes = await fetch('https://public.doubletick.io/whatsapp/message/document', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          to: toPhone,
          from: fromNumber,
          content: {
            mediaUrl: mediaUrl,
            filename: `Invoice_${invoiceNumber}_ASPORTS.pdf`
          }
        }]
      })
    });

    const docData = await docRes.json().catch(() => ({}));
    if (!docRes.ok) {
      console.error('[WhatsApp Sync] ❌ Document message failed:', docRes.status, JSON.stringify(docData));
      // If it still fails with 422, it means the window didn't open
      if (docRes.status === 422) {
        throw new Error('WhatsApp window is closed. PDF can only be sent if the customer replies to your message, OR if you use a template with a Document Header.');
      }
      throw new Error(`Document send failed: HTTP ${docRes.status}`);
    } else {
      console.log('[WhatsApp Sync] ✅ Document message sent.');
    }

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}


async function uploadToDoubleTick(filePath, apiKey) {
  return new Promise((resolve) => {
    const https = require('https');
    const fs = require('fs');
    const path = require('path');

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const filename = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);

    const options = {
      method: 'POST',
      hostname: 'public.doubletick.io',
      path: '/media/upload',
      headers: {
        'Authorization': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, mediaUrl: json.mediaUrl });
          } catch (e) {
            resolve({ success: false, error: 'Invalid JSON response from DoubleTick' });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));

    // Write multipart body
    req.write(`--${boundary}\r\n`);
    req.write(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`);
    req.write(`Content-Type: application/pdf\r\n\r\n`);

    fileStream.pipe(req, { end: false });
    fileStream.on('end', () => {
      req.write(`\r\n--${boundary}--\r\n`);
      req.end();
    });
  });
}



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
    // ── Sync to Supabase ──
    cloudSync.syncClearCustomerDues(name, phone);
    return { success: true };
  } catch (error) {
    console.error('Error clearing customer dues:', error);
    return { success: false, error: error.message };
  }
});
// Clear dues for a specific invoice
ipcMain.handle('clear-invoice-dues', async (event, invoiceId) => {
  try {
    const update = db.prepare(`
      UPDATE sales_invoices 
      SET due_amount = 0, paid_amount = total_amount 
      WHERE id = ?
    `);
    update.run(invoiceId);
    // ── Sync to Supabase ──
    cloudSync.syncClearInvoiceDues(invoiceId);
    return { success: true };
  } catch (error) {
    console.error('Error clearing invoice dues:', error);
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
    // ── Sync to Supabase ──
    cloudSync.syncDeleteInvoice(invoiceId);
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
    // ── Sync to Supabase ──
    cloudSync.syncDeleteOrder(orderId);
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
    // ── Sync to Supabase ──
    const savedOrder = db.prepare('SELECT id FROM purchase_orders WHERE order_number = ?').get(orderNumber);
    if (savedOrder) {
      cloudSync.syncSaveOrder(savedOrder.id, { supplierName, phone, email, address, orderNumber }, items);
    }
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
    const { supplierName, supplierAddress, phone, email, invoiceNumber, billDate, dueDate, totalAmount, discount = 0, paidAmount, dueAmount, remarks, items } = data;
    // Determine status: 'pending' if there is a due amount, 'paid' if fully paid
    const billStatus = (dueAmount > 0) ? 'pending' : 'paid';
    const insertBill = db.prepare(`INSERT INTO purchase_bills (supplier_name, supplier_address, phone_number, email, invoice_number, bill_date, due_date, total_amount, discount, paid_amount, due_amount, status, remarks, show_remarks_pdf, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`);
    const insertItem = db.prepare('INSERT INTO purchase_items (bill_id, product, qty, rate, gst_percent) VALUES (?, ?, ?, ?, ?)');

    const transaction = db.transaction((supplier, address, sPhone, sEmail, invoice, bDate, dDate, total, disc, paid, due, status, rem, showRem, billItems) => {
      const result = insertBill.run(supplier, address, sPhone, sEmail, invoice, bDate, dDate, total, disc, paid, due, status, rem, showRem);
      const billId = result.lastInsertRowid;
      for (const item of billItems) {
        insertItem.run(billId, item.product, item.qty, item.rate, item.gstPercent || 0);
      }
      return billId;
    });

    const savedBillId = transaction(supplierName, supplierAddress || null, phone || null, email || null, invoiceNumber, billDate || null, dueDate || null, totalAmount, discount, paidAmount || 0, dueAmount || 0, billStatus, remarks || null, data.showRemarks ? 1 : 0, items);

    // ── Sync to Supabase (cloud) ──
    cloudSync.syncSaveBill(savedBillId, {
      supplierName, supplierAddress, phone, email, invoiceNumber,
      billDate, dueDate, totalAmount, discount, paidAmount, dueAmount,
      status: billStatus, remarks, showRemarks: data.showRemarks
    }, items);

    // ── Sync products to Shopify as DRAFT ──
    console.log('[Shopify Sync] New bill saved — now syncing products to Shopify...');
    console.log('[Shopify Sync] Supplier:', supplierName, '| Invoice:', invoiceNumber, '| Items:', items.length);
    let shopifyResult = { synced: false, reason: 'Not attempted' };
    try {
      shopifyResult = await syncBillProductsToShopifyDraft(supplierName, invoiceNumber, items);
    } catch (shopifyErr) {
      console.error('[Shopify Sync] Unexpected error:', shopifyErr);
      shopifyResult = { synced: false, reason: shopifyErr.message };
    }

    // Show native dialog with result
    try {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow();
      if (shopifyResult.synced && shopifyResult.successCount === shopifyResult.totalCount) {
        dialog.showMessageBoxSync(win, {
          type: 'info',
          title: 'Shopify Sync Complete',
          message: `✅ ${shopifyResult.successCount} product(s) added to Shopify as Draft successfully!`
        });
      } else if (shopifyResult.synced) {
        const failedDetails = (shopifyResult.results || [])
          .filter(r => !r.success)
          .map(r => `${r.product}: ${r.error}`)
          .join('\n');
        dialog.showMessageBoxSync(win, {
          type: 'warning',
          title: 'Shopify Sync Partial',
          message: `${shopifyResult.successCount}/${shopifyResult.totalCount} products synced.\n\nErrors:\n${failedDetails}`
        });
      } else {
        dialog.showMessageBoxSync(win, {
          type: 'error',
          title: 'Shopify Sync Failed',
          message: `Shopify sync was not attempted.\nReason: ${shopifyResult.reason}`
        });
      }
    } catch (dlgErr) {
      console.error('[Shopify Sync] Dialog error:', dlgErr);
    }

    return { success: true, shopify: shopifyResult };
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
    // ── Sync to Supabase ──
    const orderRow = db.prepare('SELECT order_number FROM purchase_orders WHERE id = ?').get(orderId);
    cloudSync.syncSaveOrder(orderId, { supplierName, phone, email, address, orderNumber: orderRow?.order_number }, items);
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
    // ── Sync to Supabase ──
    cloudSync.syncUpdateBillStatus(billId, status);
    return { success: true };
  } catch (error) {
    console.error('Error updating bill status:', error);
    return { success: false, error: error.message };
  }
});

// Clear Bill Dues (All Paid)
ipcMain.handle('clear-bill-dues', async (event, billId) => {
  try {
    // Snapshot old values for audit trail
    const oldBill = db.prepare('SELECT paid_amount, due_amount, status FROM purchase_bills WHERE id = ?').get(billId);

    const update = db.prepare('UPDATE purchase_bills SET paid_amount = total_amount, due_amount = 0, status = ? WHERE id = ?');
    update.run('paid', billId);

    // Log the change
    if (oldBill) {
      const editGroup = new Date().toISOString();
      const insertLog = db.prepare('INSERT INTO bill_edit_history (bill_id, edit_group, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?)');
      const updatedBill = db.prepare('SELECT paid_amount FROM purchase_bills WHERE id = ?').get(billId);
      if (String(oldBill.paid_amount) !== String(updatedBill.paid_amount)) {
        insertLog.run(billId, editGroup, 'Paid Amount', `₹${Number(oldBill.paid_amount || 0).toFixed(2)}`, `₹${Number(updatedBill.paid_amount || 0).toFixed(2)}`);
      }
      if (String(oldBill.due_amount) !== '0') {
        insertLog.run(billId, editGroup, 'Due Amount', `₹${Number(oldBill.due_amount || 0).toFixed(2)}`, '₹0.00');
      }
      if (oldBill.status !== 'paid') {
        insertLog.run(billId, editGroup, 'Status', oldBill.status || 'pending', 'paid');
      }
    }
    // ── Sync to Supabase ──
    const clearedBill = db.prepare('SELECT paid_amount FROM purchase_bills WHERE id = ?').get(billId);
    cloudSync.syncClearBillDues(billId, clearedBill?.paid_amount || 0);
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
    // ── Sync to Supabase ──
    cloudSync.syncDeleteBill(billId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting purchase bill:', error);
    return { success: false, error: error.message };
  }
});

// Update Purchase Bill (all fields + items) — with audit trail
ipcMain.handle('update-bill', async (event, data) => {
  try {
    const { billId, supplierName, supplierAddress, phone, email, invoiceNumber, billDate, dueDate, totalAmount, discount = 0, paidAmount, dueAmount, remarks, items } = data;
    const billStatus = (dueAmount > 0) ? 'pending' : 'paid';

    // ── Snapshot old bill + items BEFORE update ──
    const oldBill = db.prepare('SELECT * FROM purchase_bills WHERE id = ?').get(billId);
    const oldItems = db.prepare('SELECT product, qty, rate, gst_percent FROM purchase_items WHERE bill_id = ? ORDER BY id').all(billId);

    const updateBill = db.prepare(`
      UPDATE purchase_bills 
      SET supplier_name = ?, supplier_address = ?, phone_number = ?, email = ?, 
          invoice_number = ?, bill_date = ?, due_date = ?, total_amount = ?, 
          discount = ?, paid_amount = ?, due_amount = ?, status = ?, remarks = ?, show_remarks_pdf = ?
      WHERE id = ?
    `);
    const deleteItems = db.prepare('DELETE FROM purchase_items WHERE bill_id = ?');
    const insertItem = db.prepare('INSERT INTO purchase_items (bill_id, product, qty, rate, gst_percent) VALUES (?, ?, ?, ?, ?)');
    const insertLog = db.prepare('INSERT INTO bill_edit_history (bill_id, edit_group, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?)');

    const transaction = db.transaction((id, supplier, address, sPhone, sEmail, invoice, bDate, dDate, total, disc, paid, due, status, rem, showRem, billItems) => {
      // Apply the update
      updateBill.run(supplier, address, sPhone, sEmail, invoice, bDate, dDate, total, disc, paid, due, status, rem, showRem, id);
      deleteItems.run(id);
      for (const item of billItems) {
        insertItem.run(id, item.product, item.qty, item.rate, item.gstPercent || 0);
      }

      // ── Diff & log changes ──
      if (oldBill) {
        const editGroup = new Date().toISOString();
        const fieldMap = [
          ['Supplier Name', oldBill.supplier_name, supplier],
          ['Supplier Address', oldBill.supplier_address, address],
          ['Phone', oldBill.phone_number, sPhone],
          ['Email', oldBill.email, sEmail],
          ['Invoice Number', oldBill.invoice_number, invoice],
          ['Bill Date', oldBill.bill_date, bDate],
          ['Due Date', oldBill.due_date, dDate],
          ['Total Amount', `₹${Number(oldBill.total_amount || 0).toFixed(2)}`, `₹${Number(total || 0).toFixed(2)}`],
          ['Discount', `₹${Number(oldBill.discount || 0).toFixed(2)}`, `₹${Number(disc || 0).toFixed(2)}`],
          ['Paid Amount', `₹${Number(oldBill.paid_amount || 0).toFixed(2)}`, `₹${Number(paid || 0).toFixed(2)}`],
          ['Due Amount', `₹${Number(oldBill.due_amount || 0).toFixed(2)}`, `₹${Number(due || 0).toFixed(2)}`],
          ['Status', oldBill.status, status],
          ['Remarks', oldBill.remarks, rem],
        ];

        for (const [label, oldVal, newVal] of fieldMap) {
          const o = (oldVal == null ? '' : String(oldVal)).trim();
          const n = (newVal == null ? '' : String(newVal)).trim();
          if (o !== n) {
            insertLog.run(id, editGroup, label, o || '(empty)', n || '(empty)');
          }
        }

        // ── Track item-level changes ──
        const fmtItem = (it) => `${it.product} × ${it.qty} @ ₹${Number(it.rate || 0).toFixed(2)} (GST ${it.gst_percent || it.gstPercent || 0}%)`;
        const oldItemStr = oldItems.map(fmtItem).join(' | ');
        const newItemStr = billItems.map(fmtItem).join(' | ');
        if (oldItemStr !== newItemStr) {
          insertLog.run(id, editGroup, 'Items', oldItemStr || '(none)', newItemStr || '(none)');
        }
      }
    });

    transaction(billId, supplierName, supplierAddress || null, phone || null, email || null, invoiceNumber, billDate || null, dueDate || null, totalAmount, discount, paidAmount || 0, dueAmount || 0, billStatus, remarks || null, data.showRemarks ? 1 : 0, items);

    // ── Sync to Supabase (cloud) ──
    cloudSync.syncSaveBill(billId, {
      supplierName, supplierAddress, phone, email, invoiceNumber,
      billDate, dueDate, totalAmount, discount, paidAmount, dueAmount,
      status: billStatus, remarks, showRemarks: data.showRemarks
    }, items);

    // ── Sync ONLY NEW products to Shopify as DRAFT (skip existing ones) ──
    // Compare old items vs new items — only sync products that are truly new
    const oldProductNames = new Set(oldItems.map(it => it.product.trim().toLowerCase()));
    const newOnlyItems = items.filter(it => !oldProductNames.has(it.product.trim().toLowerCase()));

    let shopifyResult = { synced: false, reason: 'Not attempted' };

    if (newOnlyItems.length > 0) {
      console.log('[Shopify Sync] Bill update — found', newOnlyItems.length, 'NEW product(s) to sync:', newOnlyItems.map(i => i.product));
      try {
        shopifyResult = await syncBillProductsToShopifyDraft(supplierName, invoiceNumber, newOnlyItems);
      } catch (shopifyErr) {
        console.error('[Shopify Sync] Unexpected error:', shopifyErr);
        shopifyResult = { synced: false, reason: shopifyErr.message };
      }
    } else {
      console.log('[Shopify Sync] Bill update — no new products added, skipping Shopify sync.');
      shopifyResult = { synced: true, successCount: 0, totalCount: 0, reason: 'No new products to sync' };
    }

    // Show native dialog with result so user can see what happened
    try {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow();
      if (newOnlyItems.length === 0) {
        // No new products — no dialog needed, just return silently
      } else if (shopifyResult.synced && shopifyResult.successCount === shopifyResult.totalCount) {
        dialog.showMessageBoxSync(win, {
          type: 'info',
          title: 'Shopify Sync Complete',
          message: `✅ ${shopifyResult.successCount} NEW product(s) added to Shopify as Draft successfully!`
        });
      } else if (shopifyResult.synced) {
        const failedDetails = (shopifyResult.results || [])
          .filter(r => !r.success)
          .map(r => `${r.product}: ${r.error}`)
          .join('\n');
        dialog.showMessageBoxSync(win, {
          type: 'warning',
          title: 'Shopify Sync Partial',
          message: `${shopifyResult.successCount}/${shopifyResult.totalCount} products synced.\n\nErrors:\n${failedDetails}`
        });
      } else {
        dialog.showMessageBoxSync(win, {
          type: 'error',
          title: 'Shopify Sync Failed',
          message: `Shopify sync was not attempted.\nReason: ${shopifyResult.reason}`
        });
      }
    } catch (dlgErr) {
      console.error('[Shopify Sync] Dialog error:', dlgErr);
    }

    return { success: true, shopify: shopifyResult };
  } catch (error) {
    console.error('Error updating purchase bill:', error);
    return { success: false, error: error.message };
  }
});

// Get Bill Edit History (Audit Trail)
ipcMain.handle('get-bill-edit-history', async (event, billId) => {
  try {
    const logs = db.prepare('SELECT * FROM bill_edit_history WHERE bill_id = ? ORDER BY changed_at DESC, id DESC').all(billId);
    return { success: true, logs };
  } catch (error) {
    console.error('Error fetching bill edit history:', error);
    return { success: false, error: error.message };
  }
});

// ─── Password & OTP Management ──────────────────────────────

// Get edit password from DB
ipcMain.handle('get-edit-password', async () => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'edit_password'").get();
    return { success: true, password: row ? row.value : 'asports@2026' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Update edit password
ipcMain.handle('update-edit-password', async (event, newPassword) => {
  try {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('edit_password', ?)").run(newPassword);
    // ── Sync to Supabase ──
    cloudSync.syncAppSetting('edit_password', newPassword);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get registered email (masked for display)
ipcMain.handle('get-registered-email', async () => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'registered_email'").get();
    const email = row ? row.value : '';
    const masked = email ? email.replace(/^(.{2})(.*)(@.*)$/, (m, a, b, c) => a + '*'.repeat(b.length) + c) : '';
    return { success: true, masked, raw: email };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// OTP state
let currentOTP = null;
let otpExpiry = null;

// Send OTP via email
ipcMain.handle('send-otp', async (event, inputEmail) => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'registered_email'").get();
    const registeredEmail = row ? row.value : '';

    if (!registeredEmail || inputEmail.toLowerCase().trim() !== registeredEmail.toLowerCase().trim()) {
      return { success: false, error: 'Email does not match the registered email.' };
    }

    const smtpRow = db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_app_password'").get();
    const smtpPassword = smtpRow ? smtpRow.value : '';

    if (!smtpPassword) {
      return { success: false, error: 'Email service not configured. Please set your Gmail App Password in settings.' };
    }

    // Generate 6-digit OTP
    currentOTP = String(Math.floor(100000 + Math.random() * 900000));
    otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: registeredEmail,
        pass: smtpPassword
      }
    });

    await transporter.sendMail({
      from: `"ASPORTS ZONE Billing" <${registeredEmail}>`,
      to: registeredEmail,
      subject: 'Password Reset OTP — ASPORTS Billing',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0f23; color: #fff; border-radius: 16px;">
          <h2 style="color: #00e5ff; margin-top: 0;">🔐 Password Reset</h2>
          <p style="color: #aaa;">You requested a password reset for the ASPORTS Billing System.</p>
          <div style="background: #1a1a3e; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #00e5ff;">${currentOTP}</span>
          </div>
          <p style="color: #aaa; font-size: 13px;">This OTP is valid for <strong>5 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border: none; border-top: 1px solid #222; margin: 20px 0;">
          <p style="color: #666; font-size: 11px;">If you did not request this, ignore this email.</p>
        </div>
      `
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return { success: false, error: 'Failed to send OTP. Check your email/SMTP configuration.' };
  }
});

// Verify OTP
ipcMain.handle('verify-otp', async (event, otp) => {
  try {
    if (!currentOTP || !otpExpiry) {
      return { success: false, error: 'No OTP was requested. Please try again.' };
    }
    if (Date.now() > otpExpiry) {
      currentOTP = null;
      otpExpiry = null;
      return { success: false, error: 'OTP has expired. Please request a new one.' };
    }
    if (otp.trim() !== currentOTP) {
      return { success: false, error: 'Invalid OTP. Please check and try again.' };
    }
    // OTP verified — clear it
    currentOTP = null;
    otpExpiry = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get analytics data for dashboard
ipcMain.handle('get-analytics', async (event, filter = {}) => {
  try {
    const { range = 'all', startDate, endDate } = filter;
    let dateClause = '';
    let params = [];

    if (range === 'today') {
      dateClause = "WHERE date(created_at) = date('now', 'localtime')";
    } else if (range === 'week') {
      dateClause = "WHERE created_at >= date('now', 'localtime', '-7 days')";
    } else if (range === 'month') {
      dateClause = "WHERE created_at >= date('now', 'localtime', '-30 days')";
    } else if (range === 'custom' && startDate && endDate) {
      dateClause = "WHERE date(created_at) BETWEEN ? AND ?";
      params = [startDate, endDate];
    }

    // Dynamic queries with dateClause
    const salesStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(AVG(total_amount), 0) as avgValue,
        COALESCE(MAX(total_amount), 0) as maxValue,
        COALESCE(SUM(due_amount), 0) as totalDue,
        COALESCE(SUM(paid_amount), 0) as totalPaid
      FROM sales_invoices
      ${dateClause}
    `).get(...params);

    const purchaseStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as totalSpend,
        COALESCE(SUM(due_amount), 0) as totalDue,
        COALESCE(SUM(paid_amount), 0) as totalPaid
      FROM purchase_bills
      ${dateClause}
    `).get(...params);

    const customerCount = db.prepare(`
      SELECT COUNT(DISTINCT LOWER(customer_name)) as count FROM sales_invoices
      ${dateClause}
    `).get(...params);

    const todayRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE date(created_at) = date('now', 'localtime')
    `).get();

    const monthRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get();

    const lastMonthRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime', '-1 month')
    `).get();

    // Sales Trend (range-aware)
    let trendLimit = '-30 days';
    if (range === 'today') trendLimit = '-1 day';
    else if (range === 'week') trendLimit = '-7 days';
    else if (range === 'month') trendLimit = '-30 days';
    else if (range === 'custom') trendLimit = null; // We'll handle custom separately if needed

    let trendQuery = `
      SELECT date(created_at) as date, SUM(total_amount) as total, COUNT(*) as count
      FROM sales_invoices
      ${range === 'custom' ? dateClause : `WHERE created_at >= date('now', 'localtime', '${trendLimit}')`}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `;
    const salesTrend = db.prepare(trendQuery).all(...(range === 'custom' ? params : []));

    let purchaseTrendQuery = `
      SELECT date(created_at) as date, SUM(total_amount) as total
      FROM purchase_bills
      ${range === 'custom' ? dateClause : `WHERE created_at >= date('now', 'localtime', '${trendLimit}')`}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `;
    const purchaseTrend = db.prepare(purchaseTrendQuery).all(...(range === 'custom' ? params : []));

    const topProducts = db.prepare(`
      SELECT si.product, SUM(si.qty) as total_qty, SUM(si.qty * si.price) as total_revenue
      FROM sales_items si
      JOIN sales_invoices s ON si.invoice_id = s.id
      ${dateClause.replace('created_at', 's.created_at')}
      GROUP BY LOWER(si.product)
      ORDER BY total_qty DESC
      LIMIT 10
    `).all(...params);

    const topCustomers = db.prepare(`
      SELECT customer_name, 
        SUM(total_amount) as total_spend, 
        COUNT(*) as invoice_count
      FROM sales_invoices
      ${dateClause}
      GROUP BY LOWER(customer_name)
      ORDER BY total_spend DESC
      LIMIT 5
    `).all(...params);

    const recentInvoices = db.prepare(`
      SELECT id, customer_name, invoice_number, total_amount, paid_amount, due_amount, created_at
      FROM sales_invoices
      ${dateClause}
      ORDER BY id DESC
      LIMIT 20
    `).all(...params);

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
        recentInvoices
      }
    };
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { success: false, error: error.message };
  }
});

// Get sales analytics for the Sales dashboard view (day-configurable)
ipcMain.handle('get-sales-analytics', async (event, filter = {}) => {
  try {
    const { days = 0 } = filter;
    let dateClause = '';
    let dateClausePurchase = '';

    if (days > 0) {
      dateClause = `WHERE created_at >= date('now', 'localtime', '-${parseInt(days)} days')`;
      dateClausePurchase = `WHERE created_at >= date('now', 'localtime', '-${parseInt(days)} days')`;
    }

    // KPI stats
    const salesStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(AVG(total_amount), 0) as avgValue,
        COALESCE(SUM(due_amount), 0) as totalDue,
        COALESCE(SUM(paid_amount), 0) as totalPaid
      FROM sales_invoices
      ${dateClause}
    `).get();

    const purchaseStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as totalSpend,
        COALESCE(SUM(due_amount), 0) as totalDue,
        COALESCE(SUM(paid_amount), 0) as totalPaid
      FROM purchase_bills
      ${dateClausePurchase}
    `).get();

    const todayRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE date(created_at) = date('now', 'localtime')
    `).get();

    const monthRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get();

    const lastMonthRevenue = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime', '-1 month')
    `).get();

    const customerCount = db.prepare(`
      SELECT COUNT(DISTINCT LOWER(customer_name)) as count FROM sales_invoices
      ${dateClause}
    `).get();

    // Daily trends for revenue
    const salesTrend = db.prepare(`
      SELECT date(created_at) as date, SUM(total_amount) as total, COUNT(*) as count
      FROM sales_invoices
      ${dateClause}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();

    // Daily trends for purchases (to compute daily profit)
    const purchaseTrend = db.prepare(`
      SELECT date(created_at) as date, SUM(total_amount) as total
      FROM purchase_bills
      ${dateClausePurchase}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();

    // Top customers
    const topCustomers = db.prepare(`
      SELECT customer_name, SUM(total_amount) as total_spend, COUNT(*) as invoice_count
      FROM sales_invoices
      ${dateClause}
      GROUP BY LOWER(customer_name)
      ORDER BY total_spend DESC
      LIMIT 5
    `).all();

    // Recent invoices (for CSV export)
    const recentInvoices = db.prepare(`
      SELECT id, customer_name, invoice_number, total_amount, paid_amount, due_amount, created_at
      FROM sales_invoices
      ${dateClause}
      ORDER BY id DESC
      LIMIT 50
    `).all();

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
        recentInvoices
      }
    };
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    return { success: false, error: error.message };
  }
});

// Get product analytics for the Product Analytics dashboard view
ipcMain.handle('get-product-analytics', async (event, filter = {}) => {
  try {
    const { days = 0, limit = 10, sortBy = 'qty' } = filter;
    let dateClause = '';
    let params = [];

    if (days > 0) {
      dateClause = `WHERE s.created_at >= date('now', 'localtime', '-${parseInt(days)} days')`;
    }

    const orderCol = sortBy === 'revenue' ? 'total_revenue' : 'total_qty';

    const products = db.prepare(`
      SELECT 
        si.product,
        SUM(si.qty) as total_qty,
        SUM(si.qty * si.price) as total_revenue,
        COUNT(DISTINCT s.id) as invoice_count,
        MAX(s.created_at) as last_sold,
        AVG(si.price) as avg_price
      FROM sales_items si
      JOIN sales_invoices s ON si.invoice_id = s.id
      ${dateClause}
      GROUP BY LOWER(si.product)
      ORDER BY ${orderCol} DESC
      LIMIT ?
    `).all(limit);

    // Also get totals for the summary cards
    const totals = db.prepare(`
      SELECT 
        COUNT(DISTINCT LOWER(si.product)) as unique_products,
        COALESCE(SUM(si.qty), 0) as total_units,
        COALESCE(SUM(si.qty * si.price), 0) as total_revenue
      FROM sales_items si
      JOIN sales_invoices s ON si.invoice_id = s.id
      ${dateClause}
    `).get();

    // Daily trend for the selected period (for the mini line chart)
    let trendClause = '';
    if (days > 0) {
      trendClause = `WHERE s.created_at >= date('now', 'localtime', '-${parseInt(days)} days')`;
    }
    const dailyTrend = db.prepare(`
      SELECT 
        date(s.created_at) as date,
        SUM(si.qty) as total_qty,
        SUM(si.qty * si.price) as total_revenue,
        COUNT(DISTINCT LOWER(si.product)) as unique_products
      FROM sales_items si
      JOIN sales_invoices s ON si.invoice_id = s.id
      ${trendClause}
      GROUP BY date(s.created_at)
      ORDER BY date ASC
    `).all();

    return {
      success: true,
      data: {
        products,
        totals: {
          uniqueProducts: totals.unique_products || 0,
          totalUnits: totals.total_units || 0,
          totalRevenue: totals.total_revenue || 0
        },
        dailyTrend
      }
    };
  } catch (error) {
    console.error('Error fetching product analytics:', error);
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

// Update Invoice Items (and recalculate total)
ipcMain.handle('update-invoice-items', async (event, { invoiceId, items, discountAmount = 0 }) => {
  try {
    const subTotal = items.reduce((sum, it) => sum + (it.qty * it.price * (1 + (it.gstPercent || 0) / 100)), 0);
    const totalAmount = Math.max(0, subTotal - discountAmount);

    const updateInvoice = db.prepare('UPDATE sales_invoices SET total_amount = ?, discount = ? WHERE id = ?');
    const deleteItems = db.prepare('DELETE FROM sales_items WHERE invoice_id = ?');
    const insertItem = db.prepare('INSERT INTO sales_items (invoice_id, product, qty, price, gst_percent) VALUES (?, ?, ?, ?, ?)');

    const transaction = db.transaction((id, total, disc, invoiceItems) => {
      updateInvoice.run(total, disc, id);
      deleteItems.run(id);
      for (const item of invoiceItems) {
        insertItem.run(id, item.product, item.qty, item.price, item.gstPercent || 0);
      }
    });

    transaction(invoiceId, totalAmount, discountAmount, items);
    return { success: true };
  } catch (error) {
    console.error('Error updating invoice items:', error);
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

// Show Item in Folder
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    } else {
      return { success: false, error: 'File not found: ' + filePath };
    }
  } catch (error) {
    console.error('Error showing item in folder:', error);
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
  try {
    const filePath = await generateInvoicePDF(invoiceData);
    return { success: true, filePath };
  } catch (error) {
    console.error('PDF Error:', error);
    return { success: false, error: error.message };
  }
});

// Download Order PDF
ipcMain.handle('download-order-pdf', async (event, orderData) => {
  return new Promise((resolve) => {
    try {
      const { supplierName, items, orderNumber, phone, email, address } = orderData;

      const sanitizedName = supplierName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Order';
      const ordNo = (orderNumber || 'NEW').toString().padStart(4, '0').replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `Order_${ordNo}_${sanitizedName}_${Date.now()}.pdf`;
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

      // Left: Terms
      doc.font('Helvetica-Bold').fontSize(9).text('Terms & conditions', margin + 5, afterTableY + 5);
      doc.font('Helvetica').fontSize(8);
      doc.text('Goods once sold will not be taken back.', margin + 5, afterTableY + 18);
      doc.text("Subject to 'jodhpur' Jurisdiction only.", margin + 5, afterTableY + 28);
      doc.text('Please check goods at the time of delivery.', margin + 5, afterTableY + 38);
      doc.text('Interest @18% per annum will be charged on overdue.', margin + 5, afterTableY + 48);

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
const GROQ_API_KEY = process.env.GROQ_API_KEY;

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
      const { supplierName, supplierAddress, address, phone, email, invoiceNumber, billDate, dueDate, totalAmount, discount = 0, paidAmount = 0, dueAmount = 0, remarks, showRemarks, items } = billData;

      // Pre-calculate totals for Payment Details display
      const calcSubTotal = (items || []).reduce((sum, item) => sum + (item.qty * (item.rate || item.price || 0)), 0);
      const calcTotalGst = (items || []).reduce((sum, item) => {
        const base = item.qty * (item.rate || item.price || 0);
        const gst = item.gstPercent || item.gst_percent || 0;
        return sum + (base * (gst / 100));
      }, 0);
      const calcGrand = calcSubTotal + calcTotalGst;
      const calcDue = calcGrand - (paidAmount || 0) - (discount || 0);

      const sanitizedName = (supplierName || 'Bill').replace(/[<>:"/\\|?*]/g, '').trim();
      const invNo = (invoiceNumber || 'NEW').toString().replace(/[<>:"/\\|?*]/g, '_').trim();
      const filename = `PurchaseBill_${invNo}_${sanitizedName}_${Date.now()}.pdf`;
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
      const rightBoxSpan = (width / 2) - 10;

      if (dueDate) {
        const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN').replace(/\//g, '-');
        doc.text('Due Date:', margin + width / 2 + 5, 145);
        doc.text(dueDateStr, margin + width / 2 + 5, 145, { width: rightBoxSpan, align: 'right' });
      } else {
        doc.text('Due Date:', margin + width / 2 + 5, 145);
        doc.text('N/A', margin + width / 2 + 5, 145, { width: rightBoxSpan, align: 'right' });
      }

      doc.text('Bill Date:', margin + width / 2 + 5, 155);
      doc.text(dateStr, margin + width / 2 + 5, 155, { width: rightBoxSpan, align: 'right' });

      const displayTotal = (totalAmount !== undefined && totalAmount !== null) ? totalAmount : calcGrand;
      const displayDue = (dueAmount !== undefined && dueAmount !== null) ? dueAmount : calcDue;

      if (dueDate) {
        const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN').replace(/\//g, '-');
        doc.text('Due Date:', margin + width / 2 + 5, 145);
        doc.text(dueDateStr, margin + width / 2 + 5, 145, { width: rightBoxSpan, align: 'right' });
      } else {
        doc.text('Due Date:', margin + width / 2 + 5, 145);
        doc.text('N/A', margin + width / 2 + 5, 145, { width: rightBoxSpan, align: 'right' });
      }

      doc.text('Bill Date:', margin + width / 2 + 5, 155);
      doc.text(dateStr, margin + width / 2 + 5, 155, { width: rightBoxSpan, align: 'right' });

      doc.text('Total Grand Amount:', margin + width / 2 + 5, 166);
      doc.text('Rs. ' + Number(displayTotal).toFixed(2), margin + width / 2 + 5, 166, { width: rightBoxSpan, align: 'right' });

      doc.text('Discount:', margin + width / 2 + 5, 177);
      doc.text('Rs. ' + (discount || 0).toFixed(2), margin + width / 2 + 5, 177, { width: rightBoxSpan, align: 'right' });

      doc.text('Amount Paid:', margin + width / 2 + 5, 188);
      doc.text('Rs. ' + (paidAmount || 0).toFixed(2), margin + width / 2 + 5, 188, { width: rightBoxSpan, align: 'right' });

      if (displayDue > 0) {
        // Yellow highlight for Due Amount
        doc.rect(margin + width / 2 + 3, 198, (width / 2) - 10, 15).fill('#ffff00');
        doc.fillColor('#000').font('Helvetica-Bold');
        doc.text('Due Amount:', margin + width / 2 + 5, 202);
        doc.text('Rs. ' + Number(displayDue).toFixed(2), margin + width / 2 + 5, 202, { width: rightBoxSpan, align: 'right' });
      } else {
        doc.fillColor('#000').font('Helvetica-Bold');
        doc.text('Due Amount:', margin + width / 2 + 5, 202);
        doc.text('Rs. 0.00', margin + width / 2 + 5, 202, { width: rightBoxSpan, align: 'right' });
      }

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
      const tableBottom = 610;
      doc.moveTo(colXs[1], yHeaders).lineTo(colXs[1], tableBottom).stroke();
      doc.moveTo(colXs[2], yHeaders).lineTo(colXs[2], tableBottom).stroke();
      doc.moveTo(colXs[3], yHeaders).lineTo(colXs[3], tableBottom).stroke();
      doc.moveTo(colXs[4], yHeaders).lineTo(colXs[4], tableBottom).stroke();
      doc.moveTo(colXs[5], yHeaders).lineTo(colXs[5], tableBottom).stroke();

      // Render Items
      doc.font('Helvetica').fontSize(9);
      let rowY = 245;
      let subTotal = 0;
      let totalGstAmount = 0;

      items.forEach((item, index) => {
        const baseAmount = item.qty * (item.rate || item.price || 0);
        const gstPct = item.gstPercent || item.gst_percent || 0;
        const gstAmt = baseAmount * (gstPct / 100);
        const lineTotal = baseAmount + gstAmt;
        subTotal += baseAmount;
        totalGstAmount += gstAmt;

        doc.text(`${index + 1}`, colXs[0] + 3, rowY, { width: colXs[1] - colXs[0] - 5, align: 'center' });
        doc.text(item.product, colXs[1] + 5, rowY, { width: colXs[2] - colXs[1] - 10 });
        doc.text(`${item.qty}`, colXs[2] + 5, rowY, { width: colXs[3] - colXs[2] - 10, align: 'center' });
        const itemRate = item.rate || item.price || 0;
        doc.text(itemRate.toFixed(2), colXs[3] + 5, rowY, { width: colXs[4] - colXs[3] - 10, align: 'right' });
        doc.text(`${gstPct}%`, colXs[4] + 3, rowY, { width: colXs[5] - colXs[4] - 6, align: 'center' });
        doc.text(lineTotal.toFixed(2), colXs[5] + 5, rowY, { width: colXs[6] - colXs[5] - 10, align: 'right' });

        rowY += 15;
      });

      // Total Amount row at bottom of items table
      const totalRowY = 595;
      doc.moveTo(margin, totalRowY).lineTo(margin + width, totalRowY).stroke();
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Total Amount', colXs[1] + 5, totalRowY + 3);
      doc.text(subTotal.toFixed(2), colXs[5] + 5, totalRowY + 3, { width: colXs[6] - colXs[5] - 10, align: 'right' });

      const afterTableY = 610;
      doc.moveTo(margin, afterTableY).lineTo(margin + width, afterTableY).stroke();

      // Lower Section: Terms (Left) and Taxes/Totals (Right)
      const midX = margin + 290;
      doc.moveTo(midX, afterTableY).lineTo(midX, 690).stroke(); // vertical divider

      // Left: Terms
      doc.font('Helvetica-Bold').fontSize(9).text('Terms & conditions', margin + 5, afterTableY + 5);
      doc.font('Helvetica').fontSize(8);
      doc.text('Goods once sold will not be taken back.', margin + 5, afterTableY + 18);
      doc.text("Subject to 'jodhpur' Jurisdiction only.", margin + 5, afterTableY + 28);
      doc.text('Please check goods at the time of delivery.', margin + 5, afterTableY + 38);
      doc.text('Interest @18% per annum will be charged on overdue.', margin + 5, afterTableY + 48);

      // Right: Taxes & Payment Summary
      doc.font('Helvetica-Bold').fontSize(9);
      const rightPadding = 5;
      const rightSpan = margin + width - midX - (rightPadding * 2);

      const taxesY = afterTableY + 5;
      const halfGst = totalGstAmount / 2;

      // CGST and SGST at the top
      doc.text('CGST', midX + rightPadding, taxesY);
      doc.text(halfGst.toFixed(2), midX + rightPadding, taxesY, { width: rightSpan, align: 'right' });
      doc.text('SGST', midX + rightPadding, taxesY + 11);
      doc.text(halfGst.toFixed(2), midX + rightPadding, taxesY + 11, { width: rightSpan, align: 'right' });

      // Line segment above Total Tax
      doc.moveTo(margin + width - 60, taxesY + 21).lineTo(margin + width, taxesY + 21).stroke();

      // Total Tax (CGST + SGST)
      doc.text('Total Tax', midX + rightPadding, taxesY + 23);
      doc.text(totalGstAmount.toFixed(2), midX + rightPadding, taxesY + 23, { width: rightSpan, align: 'right' });

      // Balance Paid
      doc.text('Balance Paid :', midX + rightPadding, taxesY + 37);
      doc.text((paidAmount || 0).toFixed(2), midX + rightPadding, taxesY + 37, { width: rightSpan, align: 'right' });

      // Discount (replaces Balance Due)
      doc.text('Discount :', midX + rightPadding, taxesY + 48);
      doc.text((discount || 0).toFixed(2), midX + rightPadding, taxesY + 48, { width: rightSpan, align: 'right' });

      // Grand Total: Total Amount + Total Tax
      const finalGrandTotal = subTotal + totalGstAmount;
      doc.rect(midX, 672, margin + width - midX, 18).fillAndStroke('#1a6b3c', '#000');
      doc.fillColor('#fff').text('Grand Total', midX + rightPadding, 677);
      doc.text(finalGrandTotal.toFixed(2), midX + rightPadding, 677, { width: rightSpan, align: 'right' });

      // Amount in Words Section
      doc.fillColor('#000');
      doc.moveTo(margin, 690).lineTo(margin + width, 690).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Total Amount (₹ - In Words) :', margin + 5, 695);
      doc.font('Helvetica').fontSize(9).text(numberToWords(Math.round(finalGrandTotal)), margin + 145, 695);

      // Business Signatory Section & Remarks
      doc.moveTo(margin, 730).lineTo(margin + width, 730).stroke();
      doc.font('Helvetica-Bold').fontSize(10).text('For : ASPORTS ZONE', margin + 5, 740);

      // Vertical line to separate signatory from Remarks on the right
      doc.moveTo(midX, 730).lineTo(midX, bottomY).stroke();

      if (showRemarks && remarks) {
        doc.font('Helvetica-Bold').fontSize(8).text('REMARKS:', midX + 5, 740);
        doc.font('Helvetica').fontSize(8).text(remarks, midX + 5, 750, { width: margin + width - midX - 10 });
      }

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
        try { return require('sharp'); } catch (e) { return null; }
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

// ─── Shopify Admin API ──────────────────────────────────────

// Helper: fetch with timeout + retry for Shopify API
async function shopifyFetch(url, token, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      console.log(`[Shopify] Attempt ${attempt}/${retries} — ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      console.error(`[Shopify] Attempt ${attempt} failed:`, err.message || err);

      if (attempt === retries) {
        // Final attempt failed — throw with helpful message
        if (err.name === 'AbortError') {
          throw new Error('Connection timed out — Shopify server did not respond within 15 seconds. Check your internet connection.');
        }
        if (err.message && err.message.includes('fetch failed')) {
          throw new Error('Network error — Could not reach Shopify. Please check your internet connection and verify the store domain in .env is correct.');
        }
        if (err.code === 'ENOTFOUND') {
          throw new Error(`DNS error — Could not resolve "${url}". Check if your store domain in .env is correct.`);
        }
        throw err;
      }

      // Wait before retrying (exponential backoff: 1s, 2s)
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

// Helper: POST to Shopify Admin API (for creating products)
async function shopifyPost(url, token, body, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      console.log(`[Shopify POST] Attempt ${attempt}/${retries} — ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      console.error(`[Shopify POST] Attempt ${attempt} failed:`, err.message || err);

      if (attempt === retries) {
        if (err.name === 'AbortError') {
          throw new Error('Connection timed out — Shopify server did not respond within 15 seconds.');
        }
        if (err.message && err.message.includes('fetch failed')) {
          throw new Error('Network error — Could not reach Shopify. Check your internet connection.');
        }
        throw err;
      }

      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

// Sync bill products to Shopify as DRAFT products
async function syncBillProductsToShopifyDraft(supplierName, invoiceNumber, items) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION || '2026-01';

  console.log('[Shopify Sync] === Starting Shopify Draft Product Sync ===');
  console.log('[Shopify Sync] Domain:', domain);
  console.log('[Shopify Sync] Token:', token ? token.substring(0, 12) + '...' : 'MISSING');
  console.log('[Shopify Sync] Version:', version);
  console.log('[Shopify Sync] Supplier:', supplierName, '| Invoice:', invoiceNumber);
  console.log('[Shopify Sync] Items count:', items.length);

  if (!domain || !token) {
    console.warn('[Shopify Sync] Skipped — API credentials not configured.');
    return { synced: false, reason: 'Shopify API credentials not configured.' };
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const url = `https://${cleanDomain}/admin/api/${version}/products.json`;
  console.log('[Shopify Sync] URL:', url);

  const results = [];

  for (const item of items) {
    try {
      const gst = item.gstPercent || 0;
      const baseTotal = (item.qty * item.rate).toFixed(2);
      const gstAmount = (item.qty * item.rate * gst / 100).toFixed(2);

      const productPayload = {
        product: {
          title: item.product,
          body_html: `<p><strong>Supplier:</strong> ${supplierName}</p><p><strong>Invoice:</strong> ${invoiceNumber}</p><p><strong>Qty:</strong> ${item.qty} | <strong>Rate:</strong> ₹${Number(item.rate).toFixed(2)} | <strong>GST:</strong> ${gst}%</p><p><strong>Base Total:</strong> ₹${baseTotal} | <strong>GST Amount:</strong> ₹${gstAmount}</p>`,
          vendor: supplierName,
          product_type: '',
          tags: `purchase-bill, invoice-${invoiceNumber}, gst-${gst}%, saved from billing update setup system`,
          status: 'draft',
          variants: [
            {
              price: Number(item.rate).toFixed(2),
              sku: `BILL-${invoiceNumber}-${item.product.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}`,
              taxable: gst > 0
            }
          ]
        }
      };

      console.log(`[Shopify Sync] Creating draft product: "${item.product}" — payload:`, JSON.stringify(productPayload).substring(0, 300));
      const response = await shopifyPost(url, token, productPayload);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Shopify Sync] FAILED for "${item.product}": HTTP ${response.status} — ${errText}`);
        results.push({ product: item.product, success: false, error: `HTTP ${response.status}: ${errText.substring(0, 200)}` });
      } else {
        const data = await response.json();
        console.log(`[Shopify Sync] SUCCESS — Created draft product ID: ${data.product.id} — "${item.product}"`);
        results.push({ product: item.product, success: true, shopifyId: data.product.id });
      }

      // Small delay to avoid rate-limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`[Shopify Sync] EXCEPTION for "${item.product}":`, err.message, err.stack);
      results.push({ product: item.product, success: false, error: err.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[Shopify Sync] === Done — ${successCount}/${items.length} products synced as draft ===`);
  return { synced: true, results, successCount, totalCount: items.length };
}

// Get all invoice IDs that were synced from Shopify
ipcMain.handle('get-shopify-synced-invoice-ids', async () => {
  try {
    // Always read from local SQLite (it's always up-to-date since we write to both local + cloud)
    const rows = db.prepare('SELECT invoice_id FROM shopify_synced_orders WHERE invoice_id IS NOT NULL').all();
    return { success: true, invoiceIds: rows.map(r => r.invoice_id) };
  } catch (error) {
    console.error('Error fetching shopify synced invoice IDs:', error);
    return { success: true, invoiceIds: [] };
  }
});

// ─── Shopify Order Sync (Auto-fetch new orders → create invoices) ──────────

let shopifyOrderPollInterval = null;

async function fetchNewShopifyOrders() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION || '2026-01';

  if (!domain || !token) {
    console.log('[Shopify Orders] Skipped — API credentials not configured.');
    return;
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  try {
    // Fetch recent orders (last 50, any financial status)
    const url = `https://${cleanDomain}/admin/api/${version}/orders.json?status=any&limit=50&order=created_at+desc`;
    console.log('[Shopify Orders] Polling for new orders...');
    const response = await shopifyFetch(url, token);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Shopify Orders] API error:', response.status, errText.substring(0, 200));
      return;
    }

    const data = await response.json();
    const orders = data.orders || [];
    console.log(`[Shopify Orders] Fetched ${orders.length} orders from Shopify.`);

    if (orders.length === 0) return;

    // Prepared statements for NEW orders (local SQLite)
    const checkSynced = db.prepare('SELECT shopify_order_id, invoice_id, shopify_updated_at FROM shopify_synced_orders WHERE shopify_order_id = ?');
    const insertInvoice = db.prepare(
      `INSERT INTO sales_invoices (customer_name, phone_number, email, billing_address, total_amount, invoice_number, paid_amount, due_amount, discount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertItem = db.prepare(
      'INSERT INTO sales_items (invoice_id, product, qty, price, gst_percent) VALUES (?, ?, ?, ?, ?)'
    );
    const insertSyncRecord = db.prepare('INSERT INTO shopify_synced_orders (shopify_order_id, invoice_id, shopify_updated_at) VALUES (?, ?, ?)');

    // Prepared statements for UPDATING existing invoices (local SQLite)
    const updateInvoice = db.prepare(
      `UPDATE sales_invoices SET customer_name = ?, phone_number = ?, email = ?, billing_address = ?, total_amount = ?, paid_amount = ?, due_amount = ?, discount = ? WHERE id = ?`
    );
    const deleteItems = db.prepare('DELETE FROM sales_items WHERE invoice_id = ?');
    const updateSyncTimestamp = db.prepare('UPDATE shopify_synced_orders SET shopify_updated_at = ? WHERE shopify_order_id = ?');

    // ── Helper: Check if order is synced (Supabase first, then local fallback) ──
    async function checkIfSynced(shopifyOrderId) {
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('shopify_synced_orders')
            .select('shopify_order_id, invoice_id, shopify_updated_at')
            .eq('shopify_order_id', shopifyOrderId)
            .maybeSingle();
          if (!error && data) return data;
          if (!error && !data) {
            // Not found in Supabase, check local as fallback
            return checkSynced.get(shopifyOrderId) || null;
          }
        } catch (e) {
          console.warn('[Supabase] Check failed, using local:', e.message);
        }
      }
      return checkSynced.get(shopifyOrderId) || null;
    }

    // ── Helper: Save sync record to Supabase ──
    async function saveSyncToSupabase(shopifyOrderId, invoiceId, shopifyUpdatedAt, orderData, lineItems) {
      if (!supabase) return;
      try {
        // 1. Upsert sync record
        await supabase
          .from('shopify_synced_orders')
          .upsert({
            shopify_order_id: shopifyOrderId,
            invoice_id: invoiceId,
            shopify_updated_at: shopifyUpdatedAt
          }, { onConflict: 'shopify_order_id' });

        // 2. Upsert invoice copy
        const { data: existingInv } = await supabase
          .from('shopify_invoices')
          .select('id')
          .eq('shopify_order_id', shopifyOrderId)
          .maybeSingle();

        let supaInvoiceId;
        if (existingInv) {
          // Update existing
          await supabase
            .from('shopify_invoices')
            .update({
              local_invoice_id: invoiceId,
              customer_name: orderData.customerName,
              phone_number: orderData.phone,
              email: orderData.email,
              billing_address: orderData.address,
              total_amount: orderData.totalAmount,
              invoice_number: orderData.invoiceNumber,
              paid_amount: orderData.paidAmount,
              due_amount: orderData.dueAmount,
              discount: orderData.discount
            })
            .eq('id', existingInv.id);
          supaInvoiceId = existingInv.id;

          // Delete old items and re-insert
          await supabase
            .from('shopify_invoice_items')
            .delete()
            .eq('shopify_invoice_id', supaInvoiceId);
        } else {
          // Insert new
          const { data: newInv } = await supabase
            .from('shopify_invoices')
            .insert({
              local_invoice_id: invoiceId,
              shopify_order_id: shopifyOrderId,
              customer_name: orderData.customerName,
              phone_number: orderData.phone,
              email: orderData.email,
              billing_address: orderData.address,
              total_amount: orderData.totalAmount,
              invoice_number: orderData.invoiceNumber,
              paid_amount: orderData.paidAmount,
              due_amount: orderData.dueAmount,
              discount: orderData.discount
            })
            .select('id')
            .single();
          supaInvoiceId = newInv?.id;
        }

        // 3. Insert line items
        if (supaInvoiceId && lineItems.length > 0) {
          const itemRows = lineItems.map(li => ({
            shopify_invoice_id: supaInvoiceId,
            product: li.product,
            qty: li.qty,
            price: li.price,
            gst_percent: li.gst_percent
          }));
          await supabase.from('shopify_invoice_items').insert(itemRows);
        }

        console.log(`[Supabase] ✅ Synced order ${shopifyOrderId} to cloud`);
      } catch (err) {
        console.error(`[Supabase] ❌ Failed to sync order ${shopifyOrderId}:`, err.message);
      }
    }

    let newCount = 0;
    let updatedCount = 0;

    for (const order of orders) {
      const shopifyOrderId = String(order.id);
      const shopifyUpdatedAt = order.updated_at || '';

      // Check if already synced (Supabase first, then local)
      const existing = await checkIfSynced(shopifyOrderId);

      // ── Extract common order data ──
      const customer = order.customer || {};
      const shippingAddr = order.shipping_address || order.billing_address || {};
      const customerName = customer.first_name && customer.last_name
        ? `${customer.first_name} ${customer.last_name}`.trim()
        : (shippingAddr.name || customer.email || `Shopify Order #${order.order_number}`);
      const phone = customer.phone || shippingAddr.phone || '';
      const email = customer.email || '';
      const address = [shippingAddr.address1, shippingAddr.address2, shippingAddr.city, shippingAddr.province, shippingAddr.zip, shippingAddr.country]
        .filter(Boolean).join(', ');

      // Calculate totals
      const totalAmount = parseFloat(order.total_price) || 0;
      const paidAmount = (order.financial_status === 'paid' || order.financial_status === 'partially_paid')
        ? totalAmount : 0;
      const dueAmount = totalAmount - paidAmount;
      const discount = parseFloat(order.total_discounts) || 0;

      if (existing) {
        // ── UPDATE existing invoice if Shopify order was modified ──
        try {
          const storedUpdatedAt = existing.shopify_updated_at || '';
          if (storedUpdatedAt === shopifyUpdatedAt) {
            // No changes since last sync
            continue;
          }

          const invoiceId = existing.invoice_id;
          if (!invoiceId) continue;

          // Update invoice header (local)
          updateInvoice.run(
            customerName, phone, email, address,
            totalAmount, paidAmount, dueAmount, discount,
            invoiceId
          );

          // Replace line items (local)
          deleteItems.run(invoiceId);
          const lineItems = order.line_items || [];
          const parsedItems = [];
          for (const li of lineItems) {
            const productName = li.title || li.name || 'Unknown Product';
            const qty = li.quantity || 1;
            const price = parseFloat(li.price) || 0;
            const taxRate = (li.tax_lines && li.tax_lines.length > 0)
              ? li.tax_lines.reduce((sum, t) => sum + (parseFloat(t.rate) || 0), 0) * 100
              : 0;
            insertItem.run(invoiceId, productName, qty, price, taxRate);
            parsedItems.push({ product: productName, qty, price, gst_percent: taxRate });
          }

          // Update the stored timestamp (local)
          updateSyncTimestamp.run(shopifyUpdatedAt, shopifyOrderId);
          updatedCount++;

          // ── Sync to Supabase (cloud) ──
          const invRow = db.prepare('SELECT invoice_number FROM sales_invoices WHERE id = ?').get(invoiceId);
          await saveSyncToSupabase(shopifyOrderId, invoiceId, shopifyUpdatedAt, {
            customerName, phone, email, address,
            totalAmount, paidAmount, dueAmount, discount,
            invoiceNumber: invRow?.invoice_number
          }, parsedItems);

          console.log(`[Shopify Orders] 🔄 Updated invoice for order #${order.order_number} (Invoice ID: ${invoiceId})`);
        } catch (updateErr) {
          console.error(`[Shopify Orders] Failed to update order #${order.order_number}:`, updateErr.message);
        }
      } else {
        // ── CREATE new invoice ──
        try {
          // Get next invoice number
          const lastInv = db.prepare('SELECT MAX(invoice_number) as max_inv FROM sales_invoices').get();
          const invoiceNumber = (lastInv && lastInv.max_inv && lastInv.max_inv >= 2026100001) ? lastInv.max_inv + 1 : 2026100001;

          // Use Shopify order creation date
          const createdAt = order.created_at
            ? new Date(order.created_at).toISOString().replace('T', ' ').substring(0, 19)
            : new Date().toISOString().replace('T', ' ').substring(0, 19);

          // Insert invoice (local)
          const invResult = insertInvoice.run(
            customerName, phone, email, address,
            totalAmount, invoiceNumber, paidAmount, dueAmount, discount,
            createdAt
          );
          const invoiceId = invResult.lastInsertRowid;

          // Insert line items (local)
          const lineItems = order.line_items || [];
          const parsedItems = [];
          for (const li of lineItems) {
            const productName = li.title || li.name || 'Unknown Product';
            const qty = li.quantity || 1;
            const price = parseFloat(li.price) || 0;
            const taxRate = (li.tax_lines && li.tax_lines.length > 0)
              ? li.tax_lines.reduce((sum, t) => sum + (parseFloat(t.rate) || 0), 0) * 100
              : 0;
            insertItem.run(invoiceId, productName, qty, price, taxRate);
            parsedItems.push({ product: productName, qty, price, gst_percent: taxRate });
          }

          // Mark as synced with the updated_at timestamp (local)
          insertSyncRecord.run(shopifyOrderId, invoiceId, shopifyUpdatedAt);
          newCount++;

          // ── Sync to Supabase (cloud) ──
          await saveSyncToSupabase(shopifyOrderId, invoiceId, shopifyUpdatedAt, {
            customerName, phone, email, address,
            totalAmount, paidAmount, dueAmount, discount,
            invoiceNumber
          }, parsedItems);

          console.log(`[Shopify Orders] ✅ Synced order #${order.order_number} → Invoice #${invoiceNumber} (${customerName})`);
        } catch (orderErr) {
          console.error(`[Shopify Orders] Failed to sync order #${order.order_number}:`, orderErr.message);
        }
      }
    }

    if (newCount > 0 || updatedCount > 0) {
      console.log(`[Shopify Orders] === ${newCount} new, ${updatedCount} updated order(s) synced ===`);
      // Notify the renderer to refresh if it's on the invoice/customer page
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shopify-orders-synced', { count: newCount, updated: updatedCount });
      }
    } else {
      console.log('[Shopify Orders] No new or updated orders to sync.');
    }
  } catch (err) {
    console.error('[Shopify Orders] Polling error:', err.message);
  }
}

function startShopifyOrderPolling() {
  // Run immediately on startup
  console.log('[Shopify Orders] Starting order sync polling (every 2 minutes)...');
  fetchNewShopifyOrders();

  // Then poll every 2 minutes
  shopifyOrderPollInterval = setInterval(fetchNewShopifyOrders, 2 * 60 * 1000);
}

function stopShopifyOrderPolling() {
  if (shopifyOrderPollInterval) {
    clearInterval(shopifyOrderPollInterval);
    shopifyOrderPollInterval = null;
  }
}

ipcMain.handle('shopify-search-products', async (event, { query, searchBy }) => {
  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2025-10';

    console.log('[Shopify] Domain:', domain);
    console.log('[Shopify] Token prefix:', token ? token.substring(0, 12) + '...' : 'MISSING');
    console.log('[Shopify] API Version:', version);

    if (!domain || !token) {
      return { success: false, error: 'Shopify API credentials not configured. Check your .env file.' };
    }

    // Sanitize domain — strip protocol and trailing slashes if user added them
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const url = `https://${cleanDomain}/admin/api/${version}/products.json?limit=250`;
    console.log('[Shopify] Request URL:', url);

    const response = await shopifyFetch(url, token);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Shopify API Error]', response.status, errText);

      if (response.status === 401) {
        return { success: false, error: '401 Unauthorized — Your Shopify Admin API token is invalid or expired. Generate a new token in Shopify Admin > Settings > Apps > Develop apps and update your .env file.' };
      }
      if (response.status === 403) {
        return { success: false, error: '403 Forbidden — Your API token does not have the "read_products" scope. Update the app permissions in Shopify Admin.' };
      }
      if (response.status === 404) {
        return { success: false, error: '404 Not Found — The store domain or API version is incorrect. Check SHOPIFY_STORE_DOMAIN and SHOPIFY_API_VERSION in your .env file.' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limited by Shopify — Too many requests. Please wait a moment and try again.' };
      }
      return { success: false, error: `Shopify API error: ${response.status} ${response.statusText}. Response: ${errText.substring(0, 200)}` };
    }

    const data = await response.json();
    let products = data.products || [];

    // Apply search filter
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      products = products.filter(p => {
        switch (searchBy) {
          case 'sku':
            return p.variants && p.variants.some(v => v.sku && v.sku.toLowerCase().includes(q));
          case 'barcode':
            return p.variants && p.variants.some(v => v.barcode && v.barcode.toLowerCase().includes(q));
          case 'product_type':
            return p.product_type && p.product_type.toLowerCase().includes(q);
          case 'vendor':
            return p.vendor && p.vendor.toLowerCase().includes(q);
          case 'tag':
            return p.tags && p.tags.toLowerCase().includes(q);
          case 'title':
          default:
            return p.title && p.title.toLowerCase().includes(q);
        }
      });
    }

    // Map to clean response
    const mapped = products.map(p => ({
      id: p.id,
      title: p.title,
      body_html: p.body_html,
      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags,
      status: p.status,
      image: p.image ? p.image.src : null,
      images: (p.images || []).map(img => img.src),
      variants: (p.variants || []).map(v => ({
        id: v.id,
        title: v.title,
        price: v.price,
        compare_at_price: v.compare_at_price,
        sku: v.sku,
        barcode: v.barcode,
        inventory_quantity: v.inventory_quantity,
        weight: v.weight,
        weight_unit: v.weight_unit
      }))
    }));

    return { success: true, products: mapped };
  } catch (error) {
    console.error('[Shopify Search Error]', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('shopify-get-product', async (event, productId) => {
  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2025-10';

    if (!domain || !token) {
      return { success: false, error: 'Shopify API credentials not configured.' };
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const url = `https://${cleanDomain}/admin/api/${version}/products/${productId}.json`;
    const response = await shopifyFetch(url, token);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Shopify Product API Error]', response.status, errText);
      return { success: false, error: `Shopify API error: ${response.status} — ${errText.substring(0, 200)}` };
    }

    const data = await response.json();
    const p = data.product;

    return {
      success: true,
      product: {
        id: p.id,
        title: p.title,
        body_html: p.body_html,
        vendor: p.vendor,
        product_type: p.product_type,
        tags: p.tags,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        image: p.image ? p.image.src : null,
        images: (p.images || []).map(img => img.src),
        variants: (p.variants || []).map(v => ({
          id: v.id,
          title: v.title,
          price: v.price,
          compare_at_price: v.compare_at_price,
          sku: v.sku,
          barcode: v.barcode,
          inventory_quantity: v.inventory_quantity,
          weight: v.weight,
          weight_unit: v.weight_unit,
          option1: v.option1,
          option2: v.option2,
          option3: v.option3
        }))
      }
    };
  } catch (error) {
    console.error('[Shopify Product Error]', error);
    return { success: false, error: error.message };
  }
});

// Get all supplier ledgers (grouped from purchase_bills)
ipcMain.handle('get-supplier-ledgers', async () => {
  try {
    const bills = db.prepare('SELECT * FROM purchase_bills ORDER BY created_at ASC').all();
    const allItems = db.prepare('SELECT * FROM purchase_items ORDER BY bill_id').all();

    // Group items by bill_id for fast lookup
    const itemsByBill = {};
    for (const item of allItems) {
      if (!itemsByBill[item.bill_id]) itemsByBill[item.bill_id] = [];
      itemsByBill[item.bill_id].push(item);
    }

    // Group bills by supplier name (case-insensitive)
    const supplierMap = {};
    for (const bill of bills) {
      const key = (bill.supplier_name || 'Unknown').trim().toLowerCase();
      if (!supplierMap[key]) {
        supplierMap[key] = {
          supplierName: bill.supplier_name || 'Unknown',
          phone: bill.phone_number || '',
          email: bill.email || '',
          address: bill.supplier_address || '',
          bills: [],
          totalAmount: 0,
          totalPaid: 0,
          totalDue: 0,
          billCount: 0
        };
      }
      // Update contact info from latest bill if available
      if (bill.phone_number) supplierMap[key].phone = bill.phone_number;
      if (bill.email) supplierMap[key].email = bill.email;
      if (bill.supplier_address) supplierMap[key].address = bill.supplier_address;

      supplierMap[key].bills.push({
        ...bill,
        items: itemsByBill[bill.id] || []
      });
      supplierMap[key].totalAmount += bill.total_amount || 0;
      supplierMap[key].totalPaid += bill.paid_amount || 0;
      supplierMap[key].totalDue += bill.due_amount || 0;
      supplierMap[key].billCount += 1;
    }

    const suppliers = Object.values(supplierMap).sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName, 'en', { sensitivity: 'base' })
    );

    return { success: true, suppliers };
  } catch (error) {
    console.error('Error fetching supplier ledgers:', error);
    return { success: false, error: error.message };
  }
});

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

      // ─── Auto-Updater Setup (Manual Logging) ─────────────
      const updateLogPath = path.join(app.getPath('userData'), 'update.log');
      const log = (msg) => {
        const entry = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(updateLogPath, entry);
        console.log(msg);
      };

      log('[ASPORTS] App starting...');

      // Force dev-app-update.yml for debugging
      if (!app.isPackaged) {
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml');
      }

      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;

      autoUpdater.on('checking-for-update', () => {
        log('[ASPORTS] Checking for update...');
      });

      autoUpdater.on('update-available', (info) => {
        log(`[ASPORTS] Update available: ${info.version}`);
        if (mainWindow) {
          mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
        }
      });

      autoUpdater.on('update-not-available', (info) => {
        log('[ASPORTS] App is up-to-date.');
      });

      autoUpdater.on('download-progress', (progress) => {
        log(`[ASPORTS] Download progress: ${Math.round(progress.percent)}%`);
        if (mainWindow) {
          mainWindow.webContents.send('update-status', {
            status: 'downloading',
            percent: Math.round(progress.percent)
          });
        }
      });

      autoUpdater.on('update-downloaded', (info) => {
        log(`[ASPORTS] Update downloaded: ${info.version}`);
        if (mainWindow) {
          mainWindow.webContents.send('update-status', { status: 'ready', version: info.version });
        }
      });

      autoUpdater.on('error', (err) => {
        log(`[ASPORTS] Auto-update error: ${err.message}`);
        if (mainWindow) {
          mainWindow.webContents.send('update-status', { status: 'error', message: err.message });
        }
      });

      // Check for updates on launch
      autoUpdater.checkForUpdates();

      // Re-check every 30 minutes
      setInterval(() => {
        autoUpdater.checkForUpdates();
      }, 30 * 60 * 1000);

      // ─── Start Shopify Order Sync ─────────────────────────
      startShopifyOrderPolling();

    } catch (err) {
      console.error('[ASPORTS] Failed to create window:', err);
      app.quit();
    }
  });


  app.on('window-all-closed', () => {
    stopShopifyOrderPolling();
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
