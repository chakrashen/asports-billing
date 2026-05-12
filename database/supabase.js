// ─── Supabase Client for Shopify Order Sync (Cloud Storage) ──────────
// Only Shopify-fetched data goes to Supabase. All other data stays in local SQLite.

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load env (already loaded by main.js, but just in case this is imported standalone)
const envPath = require('electron')?.app?.isPackaged
  ? path.join(process.resourcesPath, '..', '.env')
  : path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('[Supabase] ✅ Client initialized —', supabaseUrl);
} else {
  console.warn('[Supabase] ⚠️ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env — Shopify cloud sync disabled.');
}

module.exports = supabase;
