const Database = require('better-sqlite3');
const path = require('path');
const db = new Database('billing.db');

console.log('--- Top 10 Sales Invoices ---');
const topSales = db.prepare('SELECT id, customer_name, total_amount, created_at FROM sales_invoices ORDER BY total_amount DESC LIMIT 10').all();
console.log(JSON.stringify(topSales, null, 2));

console.log('--- Sales Trend (Last 30 Days) ---');
const trend = db.prepare("SELECT date(created_at) as date, SUM(total_amount) as total FROM sales_invoices GROUP BY date(created_at) ORDER BY date DESC LIMIT 30").all();
console.log(JSON.stringify(trend, null, 2));
