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
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN remarks TEXT");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN discount REAL DEFAULT 0");
} catch (e) { }
try {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN show_remarks_pdf INTEGER DEFAULT 1");
} catch (e) { }

// Migration: Add gst_percent column to sales_items (Try adding it first in case table exists)
try {
  db.exec("ALTER TABLE sales_items ADD COLUMN gst_percent REAL DEFAULT 0");
} catch (e) { }

try {
  db.exec("ALTER TABLE sales_invoices ADD COLUMN discount REAL DEFAULT 0");
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

// ─── Bill Edit History (Audit Trail) ─────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bill_edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    edit_group TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE
  );
`);
// ─── App Settings (password, email config) ───────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed defaults if not present
const seedSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
seedSetting.run('edit_password', 'asports@2026');
// Config values — always update to match code on restart from .env
const updateSetting = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
updateSetting.run('registered_email', process.env.REGISTERED_EMAIL || '');
updateSetting.run('smtp_app_password', process.env.SMTP_APP_PASSWORD || '');


// ─── Shopify Order Sync Tracking ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS shopify_synced_orders (
    shopify_order_id TEXT PRIMARY KEY,
    invoice_id INTEGER,
    synced_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// Migration: Add shopify_updated_at column to track Shopify order changes
try {
  db.exec("ALTER TABLE shopify_synced_orders ADD COLUMN shopify_updated_at TEXT");
} catch (e) { }

// ─── Inventory Management System ────────────────────────────

// Product Master — product information only, no stock quantity stored
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    purchase_price REAL DEFAULT 0,
    selling_price REAL DEFAULT 0,
    gst_percent REAL DEFAULT 0,
    description TEXT,
    barcode_prefix TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
`);

// Inventory Items — each physical item with a unique barcode
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    barcode TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'IN_STOCK',
    purchase_price REAL DEFAULT 0,
    selling_price REAL DEFAULT 0,
    purchase_date TEXT,
    sale_date TEXT,
    invoice_id INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory_items(barcode);
  CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_items(status);
  CREATE INDEX IF NOT EXISTS idx_inventory_invoice ON inventory_items(invoice_id);
`);

// Inventory Movements — immutable transaction log for every inventory action
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_item_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    invoice_id INTEGER,
    remarks TEXT,
    user_name TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
  );
  CREATE INDEX IF NOT EXISTS idx_movements_item ON inventory_movements(inventory_item_id);
  CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(movement_type);
  CREATE INDEX IF NOT EXISTS idx_movements_date ON inventory_movements(created_at);
  CREATE INDEX IF NOT EXISTS idx_movements_invoice ON inventory_movements(invoice_id);
`);

// ─── CCTV / IP Camera Management ────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS cctv_cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rtsp_url TEXT NOT NULL,
    username TEXT,
    password TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_cctv_name ON cctv_cameras(name);
`);

// ─── Video Recordings ───────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    camera_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_seconds INTEGER DEFAULT 0,
    file_path TEXT,
    file_size INTEGER DEFAULT 0,
    status TEXT DEFAULT 'RECORDING',
    cctv_camera_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cctv_camera_id) REFERENCES cctv_cameras(id)
  );
  CREATE INDEX IF NOT EXISTS idx_recordings_source ON recordings(source_type);
  CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
  CREATE INDEX IF NOT EXISTS idx_recordings_date ON recordings(created_at);
  CREATE INDEX IF NOT EXISTS idx_recordings_camera ON recordings(cctv_camera_id);
`);

// Migration: Add invoice_id to recordings to link recordings to specific invoices
try {
  db.exec("ALTER TABLE recordings ADD COLUMN invoice_id INTEGER");
} catch (e) { }

// ─── Universal Product Barcodes ──────────────────────────────
// Maps a manufacturer/universal barcode (UPC/EAN/QR) to a product master.
// This is separate from inventory_items.barcode which tracks individual physical pieces.
db.exec(`
  CREATE TABLE IF NOT EXISTS product_barcodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL UNIQUE,
    product_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_barcode ON product_barcodes(barcode);
  CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON product_barcodes(product_id);
`);

module.exports = db;
