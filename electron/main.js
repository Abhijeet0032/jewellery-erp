const { app, BrowserWindow, ipcMain } = require('electron');

// Authentication is bound to the Electron renderer session. Renderer code must
// never be trusted to choose the user/tenant/branch used for authorization.
const rendererSessions = new Map();
const path = require('path');
const { createApiServer } = require('./api-server');
const { startAutoBackup, manualBackupTo } = require('./backup');
const { db } = require('./db');
const { newId, logAudit } = require('./helpers');
const { calculateLineTax, summarizeInvoice, isInterState } = require('./tax');
const { exportTableToFile } = require('./export');
const {
  login,
  hashPassword,
  getAuthenticatedUser,
  requirePermission,
  requireModuleAccess,
  requireBranchAccess,
  requireTenantRecord,
  requirePasswordChangeComplete,
  requireFeature,
  ROLES,
} = require('./auth');
const { getEntitlements, getLimits, requireLimit } = require('./subscriptions');
const { getCompany, updateCompany } = require('./retailer');

const API_PORT = 5051;
let mainWindow;

function clearSession(event) {
  rendererSessions.delete(event.sender.id);
}

function getSessionUser(event, options = {}) {
  const userId = rendererSessions.get(event.sender.id);
  if (!userId) throw new Error('Not authenticated');
  const user = getAuthenticatedUser(userId);
  if (user.must_change_password && !options.allowPasswordChange) {
    throw new Error('Password change required before continuing');
  }
  return user;
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = 'http://localhost:5173';
  const prodUrl = `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
  mainWindow.loadURL(process.env.NODE_ENV === 'development' ? devUrl : prodUrl);
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('destroyed', () => rendererSessions.delete(contents.id));
});

app.whenReady().then(() => {
  createWindow();
  startAutoBackup();

  const apiApp = createApiServer();
  apiApp.listen(API_PORT, '127.0.0.1', () => {
    console.log(`Local integration API listening on http://127.0.0.1:${API_PORT}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===================== AUTH =====================
ipcMain.handle('auth:login', (event, { tenantCode, username, password }) => {
  clearSession(event);
  const user = login(tenantCode, username, password);
  rendererSessions.set(event.sender.id, user.id);
  return user;
});

ipcMain.handle('auth:logout', (event) => {
  clearSession(event);
  return { success: true };
});

ipcMain.handle('auth:roles', () => ROLES);

ipcMain.handle('auth:changePassword', (event, { newPassword }) => {
  const user = getSessionUser(event, { allowPasswordChange: true });
  return requirePasswordChangeComplete(user.id, newPassword);
});

ipcMain.handle('subscription:current', (event) => {
  const user = getSessionUser(event);
  return getEntitlements(user);
});

ipcMain.handle('subscription:feature', (event, { featureKey }) => {
  const user = getSessionUser(event);
  return requireFeature(user, featureKey);
});

ipcMain.handle('subscription:limits', (event) => {
  const user = getSessionUser(event);
  return getLimits(user);
});

ipcMain.handle('tenant:current', (event) => {
  const user = getSessionUser(event);
  const company = getCompany(user);

  return {
    ...company,
    user_branch_id: user.branch_id,
  };
});

ipcMain.handle('tenant:update', (event, { data }) => {
  const user = getSessionUser(event);

  if (
    user.role !== 'super_admin' &&
    user.role !== 'branch_manager'
  ) {
    throw new Error('Not authorized to update company profile');
  }

  return updateCompany(user, data);
});
// ===================== USER MANAGEMENT =====================
ipcMain.handle('users:list', (event) => {
  const user = requirePermission(getSessionUser(event), 'canManageUsers');
  return db.prepare(`
    SELECT id, username, full_name, role, branch_id, active, must_change_password, created_at
    FROM users
    WHERE tenant_id=?
    ORDER BY created_at DESC
  `).all(user.tenant_id);
});

ipcMain.handle('users:create', (event, { data }) => {
  const user = requirePermission(getSessionUser(event), 'canManageUsers');
  if (!data || !data.username || !data.password || !data.role) {
    throw new Error('Username, temporary password, and role are required');
  }
  if (!ROLES[data.role]) throw new Error('Invalid role');
  if (String(data.password).length < 8) throw new Error('Temporary password must be at least 8 characters');

  const branchId = data.branch_id || user.branch_id || null;
  if (branchId) requireBranchAccess(user, branchId);
  const currentUsers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE tenant_id=? AND active=1').get(user.tenant_id).c;
  requireLimit(user, 'users', currentUsers);

  const id = newId();
  try {
    db.prepare(`
      INSERT INTO users (id, tenant_id, username, password_hash, full_name, role, branch_id, active, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
    `).run(id, user.tenant_id, String(data.username).trim(), hashPassword(data.password), data.full_name || null, data.role, branchId);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new Error('Username already exists');
    throw err;
  }

  logAudit({
    table: 'users', recordId: id, action: 'insert',
    newValue: { ...data, password: '[redacted]', tenant_id: user.tenant_id },
    userId: user.id, tenantId: user.tenant_id,
  });
  return { id };
});

ipcMain.handle('users:setActive', (event, { userId, active }) => {
  const admin = requirePermission(getSessionUser(event), 'canManageUsers');
  const { row } = requireTenantRecord(admin, 'users', userId);
  if (userId === admin.id) throw new Error('You cannot disable your own account');
  db.prepare('UPDATE users SET active=?, updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?')
    .run(active ? 1 : 0, userId, admin.tenant_id);
  logAudit({ table: 'users', recordId: userId, action: 'update', oldValue: { active: row.active }, newValue: { active: !!active }, userId: admin.id, tenantId: admin.tenant_id });
  return { success: true };
});

ipcMain.handle('users:resetPassword', (event, { userId, temporaryPassword }) => {
  const admin = requirePermission(getSessionUser(event), 'canManageUsers');
  if (!temporaryPassword || String(temporaryPassword).length < 8) throw new Error('Temporary password must be at least 8 characters');
  const { row } = requireTenantRecord(admin, 'users', userId);
  db.prepare(`UPDATE users SET password_hash=?, must_change_password=1, updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(hashPassword(temporaryPassword), userId, admin.tenant_id);
  logAudit({ table: 'users', recordId: userId, action: 'password_reset', oldValue: { must_change_password: row.must_change_password }, newValue: { must_change_password: 1 }, userId: admin.id, tenantId: admin.tenant_id });
  return { success: true };
});

// ===================== BRANCHES =====================
ipcMain.handle('branches:list', (event) => {
  const user = getSessionUser(event);
  if (user.role === 'super_admin' || user.role === 'auditor') {
    return db.prepare('SELECT * FROM branches WHERE tenant_id=? AND active=1 ORDER BY name').all(user.tenant_id);
  }
  return db.prepare('SELECT * FROM branches WHERE tenant_id=? AND id=? AND active=1').all(user.tenant_id, user.branch_id);
});

// ===================== ITEM MASTER =====================
ipcMain.handle('items:list', (event) => {
  const user = requireModuleAccess(getSessionUser(event), 'item_master');
  if (user.role === 'super_admin' || user.role === 'auditor') {
    return db.prepare('SELECT * FROM items WHERE tenant_id=? ORDER BY created_at DESC').all(user.tenant_id);
  }
  return db.prepare('SELECT * FROM items WHERE tenant_id=? AND branch_id=? ORDER BY created_at DESC').all(user.tenant_id, user.branch_id);
});

ipcMain.handle('items:create', (event, { data }) => {
  const user = requireModuleAccess(getSessionUser(event), 'item_master');
  const branchId = data.branch_id || user.branch_id;
  if (!branchId) throw new Error('A branch is required for stock');
  requireBranchAccess(user, branchId);

  const grossWeight = Number(data.gross_weight);
  const stoneWeight = Number(data.stone_weight || 0);
  if (!Number.isFinite(grossWeight) || grossWeight <= 0) throw new Error('Gross weight must be greater than 0');
  if (!Number.isFinite(stoneWeight) || stoneWeight < 0 || stoneWeight >= grossWeight) throw new Error('Stone weight must be >= 0 and less than gross weight');
  const netWeight = grossWeight - stoneWeight;
  const id = newId();

  try {
    db.prepare(`
      INSERT INTO items (id, tenant_id, sku, barcode, huid, name, category, metal, purity, gross_weight,
        stone_weight, net_weight, stone_details, making_charge_type, making_charge_value,
        wastage_percent, hsn_code, branch_id, created_by)
      VALUES (@id, @tenant_id, @sku, @barcode, @huid, @name, @category, @metal, @purity, @gross_weight,
        @stone_weight, @net_weight, @stone_details, @making_charge_type, @making_charge_value,
        @wastage_percent, @hsn_code, @branch_id, @created_by)
    `).run({
      id, tenant_id: user.tenant_id, sku: data.sku, barcode: data.barcode || null, huid: data.huid || null,
      name: data.name, category: data.category, metal: data.metal, purity: data.purity,
      gross_weight: grossWeight, stone_weight: stoneWeight, net_weight: netWeight,
      stone_details: data.stone_details || null, making_charge_type: data.making_charge_type,
      making_charge_value: Number(data.making_charge_value || 0), wastage_percent: Number(data.wastage_percent || 0),
      hsn_code: data.hsn_code || '7113', branch_id: branchId, created_by: user.id,
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new Error('SKU or barcode already exists for this installation');
    throw err;
  }

  logAudit({ table: 'items', recordId: id, action: 'insert', newValue: data, userId: user.id, tenantId: user.tenant_id });
  return { id };
});

ipcMain.handle('items:update', (event, { id, data }) => {
  const user = requireModuleAccess(getSessionUser(event), 'item_master');
  const { row: oldValue } = requireTenantRecord(user, 'items', id);
  if (user.role !== 'super_admin' && user.role !== 'auditor' && oldValue.branch_id !== user.branch_id) {
    throw new Error('Not authorized: item belongs to another branch');
  }
  if (user.role === 'auditor') throw new Error('Auditor is read-only');
  const branchId = data.branch_id || oldValue.branch_id || user.branch_id;
  requireBranchAccess(user, branchId);
  const grossWeight = Number(data.gross_weight);
  const stoneWeight = Number(data.stone_weight || 0);
  if (!Number.isFinite(grossWeight) || grossWeight <= 0) throw new Error('Gross weight must be greater than 0');
  if (!Number.isFinite(stoneWeight) || stoneWeight < 0 || stoneWeight >= grossWeight) throw new Error('Stone weight must be >= 0 and less than gross weight');
  const netWeight = grossWeight - stoneWeight;

  db.prepare(`
    UPDATE items SET sku=@sku, barcode=@barcode, huid=@huid, name=@name, category=@category,
      metal=@metal, purity=@purity, gross_weight=@gross_weight, stone_weight=@stone_weight,
      net_weight=@net_weight, stone_details=@stone_details, making_charge_type=@making_charge_type,
      making_charge_value=@making_charge_value, wastage_percent=@wastage_percent,
      hsn_code=@hsn_code, branch_id=@branch_id, status=@status, updated_at=datetime('now')
    WHERE id=@id AND tenant_id=@tenant_id
  `).run({
    ...data, id, tenant_id: user.tenant_id, net_weight: netWeight, gross_weight: grossWeight,
    stone_weight: stoneWeight, making_charge_value: Number(data.making_charge_value || 0),
    wastage_percent: Number(data.wastage_percent || 0), branch_id: branchId,
  });
  logAudit({ table: 'items', recordId: id, action: 'update', oldValue, newValue: data, userId: user.id, tenantId: user.tenant_id });
  return { success: true };
});

// ===================== CUSTOMERS =====================
ipcMain.handle('customers:list', (event) => {
  const user = requireModuleAccess(getSessionUser(event), 'customers');
  return db.prepare('SELECT * FROM customers WHERE tenant_id=? ORDER BY created_at DESC').all(user.tenant_id);
});

ipcMain.handle('customers:search', (event, { query }) => {
  const user = requireModuleAccess(getSessionUser(event), 'customers');
  const q = `%${String(query || '').trim()}%`;
  return db.prepare(`
    SELECT * FROM customers
    WHERE tenant_id=? AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR gstin LIKE ?)
    ORDER BY name LIMIT 50
  `).all(user.tenant_id, q, q, q, q);
});

ipcMain.handle('customers:create', (event, { data }) => {
  const user = requireModuleAccess(getSessionUser(event), 'customers');
  const id = newId();
  db.prepare(`INSERT INTO customers (id, tenant_id, name, phone, email, address, pan, gstin) VALUES (@id,@tenant_id,@name,@phone,@email,@address,@pan,@gstin)`)
    .run({ id, tenant_id: user.tenant_id, phone: null, email: null, address: null, pan: null, gstin: null, ...data });
  logAudit({ table: 'customers', recordId: id, action: 'insert', newValue: data, userId: user.id, tenantId: user.tenant_id });
  return { id };
});

// ===================== RATES =====================
ipcMain.handle('rates:latest', (event) => {
  const user = requireModuleAccess(getSessionUser(event), 'rates');
  return db.prepare(`
    SELECT r.* FROM rate_master r
    WHERE r.tenant_id=?
      AND r.effective_from = (
        SELECT MAX(r2.effective_from) FROM rate_master r2
        WHERE r2.tenant_id=r.tenant_id AND r2.metal=r.metal AND r2.purity=r.purity
      )
    ORDER BY r.metal, r.purity
  `).all(user.tenant_id);
});

ipcMain.handle('rates:set', (event, { metal, purity, rate_per_gram }) => {
  const user = requirePermission(getSessionUser(event), 'canSetRates');
  if (user.role !== 'super_admin' && user.role !== 'auditor') requireBranchAccess(user, user.branch_id);
  if (user.role === 'auditor') throw new Error('Auditor is read-only');
  const rate = Number(rate_per_gram);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Rate must be greater than 0');
  const id = newId();
  db.prepare(`INSERT INTO rate_master (id, tenant_id, metal, purity, rate_per_gram, set_by) VALUES (?,?,?,?,?,?)`)
    .run(id, user.tenant_id, metal, purity, rate, user.id);
  logAudit({ table: 'rate_master', recordId: id, action: 'insert', newValue: { metal, purity, rate_per_gram: rate }, userId: user.id, tenantId: user.tenant_id });
  return { id };
});

// ===================== BILLING =====================
ipcMain.handle('invoices:create', (event, { docType, customerId, branchId, lines, discount, oldGoldExchangeValue, convertedFromEstimateId }) => {
  const user = requireModuleAccess(getSessionUser(event), 'billing');
  if (user.role === 'auditor') throw new Error('Auditor is read-only');
  const { branch } = requireBranchAccess(user, branchId || user.branch_id);
  const effectiveBranchId = branch.id;
  const customer = customerId ? requireTenantRecord(user, 'customers', customerId).row : null;
  const interState = isInterState(branch.state_code, customer ? customer.gstin : null);

  const safeLines = Array.isArray(lines) ? lines : [];
  if (safeLines.length === 0) throw new Error('At least one invoice line is required');
  const taxedLines = safeLines.map(line => {
    if (line.item_id) {
      const item = requireTenantRecord(user, 'items', line.item_id).row;
      if (item.branch_id !== effectiveBranchId && user.role !== 'super_admin') throw new Error('Item belongs to another branch');
    }
    const metalValue = Number(line.net_weight) * Number(line.rate_per_gram);
    if (!Number.isFinite(metalValue) || metalValue <= 0) throw new Error('Invalid weight or rate on invoice line');
    const taxResult = calculateLineTax({ metalValue, makingCharge: Number(line.making_charge || 0), lineType: line.lineType || 'gold_jewellery', interState });
    return { ...line, metalValue, ...taxResult };
  });

  const totals = summarizeInvoice(taxedLines, Number(discount || 0), Number(oldGoldExchangeValue || 0));
  const invoiceId = newId();
  const invoiceNumber = docType === 'tax_invoice' ? generateInvoiceNumber(user.tenant_id, effectiveBranchId) : null;

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (id, tenant_id, invoice_number, doc_type, converted_from_estimate_id, customer_id, branch_id, subtotal, discount,
      taxable_value, cgst_amount, sgst_amount, igst_amount, round_off, grand_total, old_gold_exchange_value, created_by)
    VALUES (@id, @tenant_id, @invoice_number, @doc_type, @converted_from_estimate_id, @customer_id, @branch_id, @subtotal, @discount,
      @taxable_value, @cgst_amount, @sgst_amount, @igst_amount, @round_off, @grand_total, @old_gold_exchange_value, @created_by)
  `);

  const insertLine = db.prepare(`
    INSERT INTO invoice_items (id, tenant_id, invoice_id, item_id, description, hsn_code, qty, gross_weight,
      net_weight, rate_per_gram, making_charge, taxable_value, cgst_rate, sgst_rate, igst_rate,
      cgst_amount, sgst_amount, igst_amount, line_total)
    VALUES (@id, @tenant_id, @invoice_id, @item_id, @description, @hsn_code, @qty, @gross_weight, @net_weight, @rate_per_gram,
      @making_charge, @taxable_value, @cgst_rate, @sgst_rate, @igst_rate, @cgst_amount, @sgst_amount, @igst_amount, @line_total)
  `);

  const tx = db.transaction(() => {
    insertInvoice.run({ id: invoiceId, tenant_id: user.tenant_id, invoice_number: invoiceNumber, doc_type: docType,
      converted_from_estimate_id: convertedFromEstimateId || null, customer_id: customerId || null, branch_id: effectiveBranchId,
      created_by: user.id, ...totals });
    for (const line of taxedLines) {
      insertLine.run({
        id: newId(), tenant_id: user.tenant_id, invoice_id: invoiceId, item_id: line.item_id || null,
        description: line.description || 'Item', hsn_code: line.hsn_code || '7113', qty: line.qty || 1,
        gross_weight: Number(line.gross_weight), net_weight: Number(line.net_weight), rate_per_gram: Number(line.rate_per_gram),
        making_charge: Number(line.making_charge || 0), taxable_value: line.taxable_value,
        cgst_rate: line.cgst_rate, sgst_rate: line.sgst_rate, igst_rate: line.igst_rate,
        cgst_amount: line.cgst_amount, sgst_amount: line.sgst_amount, igst_amount: line.igst_amount, line_total: line.line_total,
      });
      if (line.item_id && docType === 'tax_invoice') {
        db.prepare(`UPDATE items SET status='sold', updated_at=datetime('now') WHERE id=? AND tenant_id=?`).run(line.item_id, user.tenant_id);
      }
    }
  });
  tx();
  logAudit({ table: 'invoices', recordId: invoiceId, action: 'insert', newValue: { docType, totals }, userId: user.id, tenantId: user.tenant_id });
  return { id: invoiceId, invoice_number: invoiceNumber, ...totals };
});

function generateInvoiceNumber(tenantId, branchId) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE tenant_id=? AND doc_type='tax_invoice' AND branch_id=?`).get(tenantId, branchId).c;
  const year = new Date().getFullYear();
  return `INV-${branchId ? branchId.substring(0, 4).toUpperCase() : 'MAIN'}-${year}-${String(count + 1).padStart(5, '0')}`;
}

ipcMain.handle('invoices:preview', (event, { customerId, branchId, lines, discount, oldGoldExchangeValue }) => {
  const user = requireModuleAccess(getSessionUser(event), 'billing');
  const { branch } = requireBranchAccess(user, branchId || user.branch_id);
  const customer = customerId ? requireTenantRecord(user, 'customers', customerId).row : null;
  const interState = isInterState(branch.state_code, customer ? customer.gstin : null);
  const taxedLines = (lines || []).map(line => {
    const metalValue = Number(line.net_weight || 0) * Number(line.rate_per_gram || 0);
    const taxResult = calculateLineTax({ metalValue, makingCharge: Number(line.making_charge || 0), lineType: line.lineType || 'gold_jewellery', interState });
    return { ...line, metalValue, ...taxResult };
  });
  return { lines: taxedLines, totals: summarizeInvoice(taxedLines, Number(discount || 0), Number(oldGoldExchangeValue || 0)), interState };
});

ipcMain.handle('invoices:getWithLines', (event, { invoiceId }) => {
  const user = requireModuleAccess(getSessionUser(event), 'billing');
  const invoice = requireTenantRecord(user, 'invoices', invoiceId).row;
  if (user.role !== 'super_admin' && user.role !== 'auditor' && invoice.branch_id !== user.branch_id) throw new Error('Not authorized: invoice belongs to another branch');
  const lineItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=? AND tenant_id=?').all(invoiceId, user.tenant_id);
  return { ...invoice, line_items: lineItems };
});

ipcMain.handle('invoices:list', (event, { docType }) => {
  const user = requireModuleAccess(getSessionUser(event), 'billing');
  let q = 'SELECT * FROM invoices WHERE tenant_id=?';
  const params = [user.tenant_id];
  if (user.role !== 'super_admin' && user.role !== 'auditor') { q += ' AND branch_id=?'; params.push(user.branch_id); }
  if (docType) { q += ' AND doc_type=?'; params.push(docType); }
  q += ' ORDER BY created_at DESC';
  return db.prepare(q).all(...params);
});

ipcMain.handle('export:table', (event, { table, format }) => {
  const user = getSessionUser(event);
  const dest = path.join(app.getPath('documents'), 'Jewellery ERP Exports');
  return exportTableToFile(table, format, dest, user.tenant_id, user.id, user.role, user.branch_id);
});

ipcMain.handle('backup:manual', async (event, { destPath }) => {
  const user = requirePermission(getSessionUser(event), 'canManageUsers');
  const result = await manualBackupTo(destPath);
  logAudit({ table: 'database', recordId: user.tenant_id, action: 'backup', newValue: { path: destPath, sha256: result.sha256 }, userId: user.id, tenantId: user.tenant_id });
  return result;
});
