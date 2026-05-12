-- ═══════════════════════════════════════════════════════════════
-- ASPORTS Billing — Supabase FULL Table Setup
-- Run this SQL in: Supabase Dashboard → SQL Editor → New Query
-- This creates ALL tables to mirror local SQLite data
-- ═══════════════════════════════════════════════════════════════

-- ─── SALES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_invoices (
  id BIGSERIAL PRIMARY KEY,
  local_id BIGINT UNIQUE,
  customer_name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  billing_address TEXT,
  total_amount NUMERIC DEFAULT 0,
  invoice_number BIGINT,
  paid_amount NUMERIC DEFAULT 0,
  due_amount NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_items (
  id BIGSERIAL PRIMARY KEY,
  local_invoice_id BIGINT,
  product TEXT NOT NULL,
  qty INT DEFAULT 1,
  price NUMERIC DEFAULT 0,
  gst_percent NUMERIC DEFAULT 0
);

-- ─── PURCHASE ORDERS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  local_id BIGINT UNIQUE,
  supplier_name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  supplier_address TEXT,
  order_number BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGSERIAL PRIMARY KEY,
  local_order_id BIGINT,
  product TEXT NOT NULL,
  qty INT DEFAULT 1
);

-- ─── PURCHASE BILLS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_bills (
  id BIGSERIAL PRIMARY KEY,
  local_id BIGINT UNIQUE,
  supplier_name TEXT NOT NULL,
  supplier_address TEXT,
  phone_number TEXT,
  email TEXT,
  invoice_number TEXT,
  bill_date TEXT,
  due_date TEXT,
  total_amount NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  due_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  remarks TEXT,
  show_remarks_pdf INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGSERIAL PRIMARY KEY,
  local_bill_id BIGINT,
  product TEXT NOT NULL,
  qty INT DEFAULT 1,
  rate NUMERIC DEFAULT 0,
  gst_percent NUMERIC DEFAULT 0
);

-- ─── AUDIT TRAIL ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bill_edit_history (
  id BIGSERIAL PRIMARY KEY,
  local_bill_id BIGINT,
  edit_group TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- ─── APP SETTINGS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies — Allow anon key to read/write all tables
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sales_invoices FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sales_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_bills FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE bill_edit_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON bill_edit_history FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
