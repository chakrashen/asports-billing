// ─── Supabase Cloud Sync Helper ─────────────────────────────────────
// Every create/update/delete in local SQLite is mirrored to Supabase.
// All functions are fire-and-forget (non-blocking, never crash the app).

const supabase = require('./supabase');

// ═══════════════════════════════════════════════════════════════
// SALES INVOICES
// ═══════════════════════════════════════════════════════════════

async function syncSaveInvoice(localId, data, items) {
  if (!supabase) return;
  try {
    // Upsert invoice
    await supabase.from('sales_invoices').upsert({
      local_id: localId,
      customer_name: data.customerName,
      phone_number: data.phone || null,
      email: data.email || null,
      billing_address: data.address || null,
      total_amount: data.totalAmount,
      invoice_number: data.invoiceNumber,
      paid_amount: data.paidAmount || 0,
      due_amount: data.dueAmount || 0,
      discount: data.discount || 0
    }, { onConflict: 'local_id' });

    // Replace items
    await supabase.from('sales_items').delete().eq('local_invoice_id', localId);
    if (items.length > 0) {
      await supabase.from('sales_items').insert(
        items.map(it => ({
          local_invoice_id: localId,
          product: it.product,
          qty: it.qty,
          price: it.price,
          gst_percent: it.gstPercent || it.gst_percent || 0
        }))
      );
    }
    console.log(`[Supabase] ✅ Invoice ${localId} synced`);
  } catch (err) {
    console.error(`[Supabase] ❌ Invoice ${localId} sync failed:`, err.message);
  }
}

async function syncUpdateInvoicePayment(localId, paidAmount, dueAmount) {
  if (!supabase) return;
  try {
    await supabase.from('sales_invoices')
      .update({ paid_amount: paidAmount, due_amount: dueAmount })
      .eq('local_id', localId);
    console.log(`[Supabase] ✅ Invoice ${localId} payment updated`);
  } catch (err) {
    console.error(`[Supabase] ❌ Invoice ${localId} payment sync failed:`, err.message);
  }
}

async function syncClearCustomerDues(name, phone) {
  if (!supabase) return;
  try {
    let query = supabase.from('sales_invoices')
      .update({ due_amount: 0, paid_amount: supabase.rpc ? undefined : 0 })
      .ilike('customer_name', name);
    // Simple approach: just update by name match
    await supabase.from('sales_invoices')
      .update({ due_amount: 0 })
      .ilike('customer_name', name);
    // We also need paid_amount = total_amount, but supabase client can't do column references
    // So fetch matching rows and update each
    const { data: rows } = await supabase.from('sales_invoices')
      .select('local_id, total_amount')
      .ilike('customer_name', name);
    if (rows) {
      for (const row of rows) {
        await supabase.from('sales_invoices')
          .update({ paid_amount: row.total_amount, due_amount: 0 })
          .eq('local_id', row.local_id);
      }
    }
    console.log(`[Supabase] ✅ Customer dues cleared for ${name}`);
  } catch (err) {
    console.error(`[Supabase] ❌ Customer dues clear failed:`, err.message);
  }
}

async function syncClearInvoiceDues(localId) {
  if (!supabase) return;
  try {
    const { data: row } = await supabase.from('sales_invoices')
      .select('total_amount')
      .eq('local_id', localId)
      .maybeSingle();
    if (row) {
      await supabase.from('sales_invoices')
        .update({ paid_amount: row.total_amount, due_amount: 0 })
        .eq('local_id', localId);
    }
    console.log(`[Supabase] ✅ Invoice ${localId} dues cleared`);
  } catch (err) {
    console.error(`[Supabase] ❌ Invoice ${localId} dues clear failed:`, err.message);
  }
}

async function syncDeleteInvoice(localId) {
  if (!supabase) return;
  try {
    await supabase.from('sales_items').delete().eq('local_invoice_id', localId);
    await supabase.from('sales_invoices').delete().eq('local_id', localId);
    console.log(`[Supabase] ✅ Invoice ${localId} deleted`);
  } catch (err) {
    console.error(`[Supabase] ❌ Invoice ${localId} delete failed:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════

async function syncSaveOrder(localId, data, items) {
  if (!supabase) return;
  try {
    await supabase.from('purchase_orders').upsert({
      local_id: localId,
      supplier_name: data.supplierName,
      phone_number: data.phone || null,
      email: data.email || null,
      supplier_address: data.address || null,
      order_number: data.orderNumber
    }, { onConflict: 'local_id' });

    await supabase.from('purchase_order_items').delete().eq('local_order_id', localId);
    if (items.length > 0) {
      await supabase.from('purchase_order_items').insert(
        items.map(it => ({
          local_order_id: localId,
          product: it.product,
          qty: it.qty
        }))
      );
    }
    console.log(`[Supabase] ✅ Order ${localId} synced`);
  } catch (err) {
    console.error(`[Supabase] ❌ Order ${localId} sync failed:`, err.message);
  }
}

async function syncDeleteOrder(localId) {
  if (!supabase) return;
  try {
    await supabase.from('purchase_order_items').delete().eq('local_order_id', localId);
    await supabase.from('purchase_orders').delete().eq('local_id', localId);
    console.log(`[Supabase] ✅ Order ${localId} deleted`);
  } catch (err) {
    console.error(`[Supabase] ❌ Order ${localId} delete failed:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PURCHASE BILLS
// ═══════════════════════════════════════════════════════════════

async function syncSaveBill(localId, data, items) {
  if (!supabase) return;
  try {
    console.log(`[Supabase] 🔄 Syncing Bill ${localId} with ${items.length} products...`);
    
    // Upsert bill header
    const { error: billError } = await supabase.from('purchase_bills').upsert({
      local_id: localId,
      supplier_name: data.supplierName,
      supplier_address: data.supplierAddress || null,
      phone_number: data.phone || null,
      email: data.email || null,
      invoice_number: data.invoiceNumber,
      bill_date: data.billDate || null,
      due_date: data.dueDate || null,
      total_amount: data.totalAmount,
      discount: data.discount || 0,
      paid_amount: data.paidAmount || 0,
      due_amount: data.dueAmount || 0,
      status: data.status || 'pending',
      remarks: data.remarks || null,
      show_remarks_pdf: data.showRemarks ? 1 : 0
    }, { onConflict: 'local_id' });

    if (billError) throw billError;

    // Replace items
    await supabase.from('purchase_items').delete().eq('local_bill_id', localId);
    
    if (items && items.length > 0) {
      const { error: itemsError } = await supabase.from('purchase_items').insert(
        items.map(it => ({
          local_bill_id: localId,
          product: it.product,
          qty: it.qty,
          rate: it.rate || it.price || 0,
          gst_percent: it.gstPercent || it.gst_percent || 0
        }))
      );
      if (itemsError) throw itemsError;
      console.log(`[Supabase] ✅ Bill ${localId} and ${items.length} products synced successfully.`);
    } else {
      console.log(`[Supabase] ✅ Bill ${localId} synced (no products).`);
    }
  } catch (err) {
    console.error(`[Supabase] ❌ Bill ${localId} sync failed:`, err.message);
  }
}

async function syncUpdateBillStatus(localId, status) {
  if (!supabase) return;
  try {
    await supabase.from('purchase_bills')
      .update({ status })
      .eq('local_id', localId);
    console.log(`[Supabase] ✅ Bill ${localId} status → ${status}`);
  } catch (err) {
    console.error(`[Supabase] ❌ Bill ${localId} status sync failed:`, err.message);
  }
}

async function syncClearBillDues(localId, paidAmount) {
  if (!supabase) return;
  try {
    await supabase.from('purchase_bills')
      .update({ paid_amount: paidAmount, due_amount: 0, status: 'paid' })
      .eq('local_id', localId);
    console.log(`[Supabase] ✅ Bill ${localId} dues cleared`);
  } catch (err) {
    console.error(`[Supabase] ❌ Bill ${localId} dues clear failed:`, err.message);
  }
}

async function syncDeleteBill(localId) {
  if (!supabase) return;
  try {
    await supabase.from('purchase_items').delete().eq('local_bill_id', localId);
    await supabase.from('bill_edit_history').delete().eq('local_bill_id', localId);
    await supabase.from('purchase_bills').delete().eq('local_id', localId);
    console.log(`[Supabase] ✅ Bill ${localId} deleted`);
  } catch (err) {
    console.error(`[Supabase] ❌ Bill ${localId} delete failed:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// BILL EDIT HISTORY
// ═══════════════════════════════════════════════════════════════

async function syncBillEditHistory(localBillId, editGroup, changes) {
  if (!supabase) return;
  try {
    if (changes.length > 0) {
      await supabase.from('bill_edit_history').insert(
        changes.map(c => ({
          local_bill_id: localBillId,
          edit_group: editGroup,
          field_name: c.fieldName,
          old_value: c.oldValue,
          new_value: c.newValue
        }))
      );
    }
    console.log(`[Supabase] ✅ Bill ${localBillId} edit history synced (${changes.length} changes)`);
  } catch (err) {
    console.error(`[Supabase] ❌ Bill ${localBillId} edit history sync failed:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// APP SETTINGS
// ═══════════════════════════════════════════════════════════════

async function syncAppSetting(key, value) {
  if (!supabase) return;
  try {
    await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
    console.log(`[Supabase] ✅ Setting "${key}" synced`);
  } catch (err) {
    console.error(`[Supabase] ❌ Setting "${key}" sync failed:`, err.message);
  }
}

module.exports = {
  syncSaveInvoice,
  syncUpdateInvoicePayment,
  syncClearCustomerDues,
  syncClearInvoiceDues,
  syncDeleteInvoice,
  syncSaveOrder,
  syncDeleteOrder,
  syncSaveBill,
  syncUpdateBillStatus,
  syncClearBillDues,
  syncDeleteBill,
  syncBillEditHistory,
  syncAppSetting
};
