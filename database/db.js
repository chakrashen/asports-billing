const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

// Use userData path for packaged app, or local path for dev
const isDev = !app.isPackaged;
const dbPath = isDev
  ? path.join(__dirname, '..', 'billing.db')
  : path.join(app.getPath('userData'), 'billing.db');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sales_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sales_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS purchase_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// Migration: Add status column if it doesn't exist (for existing databases)
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
} catch (e) {
  // Column likely already exists
}

// Migration: Add customer detail columns to sales_invoices
try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN phone_number TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN email TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN billing_address TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN invoice_number INTEGER");
} catch (e) { }
try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN paid_amount REAL DEFAULT 0");
} catch (e) { }
try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN due_amount REAL DEFAULT 0");
} catch (e) { }

// Migration: Add supplier detail columns to purchase_orders
try {
  db.exec("ALTER TABLE purchase_orders ADD COLUMN phone_number TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_orders ADD COLUMN email TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_orders ADD COLUMN supplier_address TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_orders ADD COLUMN order_number INTEGER");
} catch (e) { }
// Migration: Add supplier detail columns to purchase_bills
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN phone_number TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN email TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN supplier_address TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN bill_date TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN due_date TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount REAL DEFAULT 0");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN due_amount REAL DEFAULT 0");
} catch (e) { }

// Migration: Add gst_percent column to purchase_items (Try adding it first in case table exists)
try {
  db.exec("ALTER TABLE purchase_items ADD COLUMN gst_percent REAL DEFAULT 0");
} catch (e) { }

db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    rate REAL NOT NULL DEFAULT 0,
    gst_percent REAL DEFAULT 0,
    FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE
  );
`);

module.exports = db;
