const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { app } = require('electron');

const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '..', '.devdata');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
const DB_PATH = path.join(userDataPath, 'jewellery-erp.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columnExists(table, column) {
  return !!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

function addColumn(table, definition) {
  const column = definition.trim().split(/\s+/)[0];
  if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')), description TEXT NOT NULL)`);
  // Core tenant table. A tenant represents one independent retailer/business.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      tenant_code TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Original tables are created first so this migration works for both a new DB
  // and the old single-retailer DB that already exists on a customer's machine.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL CHECK(role IN ('super_admin','branch_manager','accountant','sales_staff','inventory_staff','karigar_coordinator','auditor')),
      branch_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      must_change_password INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gstin TEXT,
      address TEXT,
      state_code TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rate_master (
      id TEXT PRIMARY KEY,
      metal TEXT NOT NULL,
      purity TEXT NOT NULL,
      rate_per_gram REAL NOT NULL,
      effective_from TEXT NOT NULL DEFAULT (datetime('now')),
      set_by TEXT,
      FOREIGN KEY (set_by) REFERENCES users(id),
      UNIQUE(metal, purity, effective_from)
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      huid TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      metal TEXT NOT NULL,
      purity TEXT NOT NULL,
      gross_weight REAL NOT NULL,
      stone_weight REAL NOT NULL DEFAULT 0,
      net_weight REAL NOT NULL,
      stone_details TEXT,
      making_charge_type TEXT NOT NULL CHECK(making_charge_type IN ('per_gram','fixed','percentage')),
      making_charge_value REAL NOT NULL DEFAULT 0,
      wastage_percent REAL NOT NULL DEFAULT 0,
      hsn_code TEXT NOT NULL DEFAULT '7113',
      branch_id TEXT,
      status TEXT NOT NULL DEFAULT 'in_stock' CHECK(status IN ('in_stock','sold','with_karigar','melted','transferred')),
      photo_path TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      pan TEXT,
      gstin TEXT,
      birthday TEXT,
      subscribe_marketing INTEGER NOT NULL DEFAULT 0,
      loyalty_points REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE,
      doc_type TEXT NOT NULL CHECK(doc_type IN ('estimate','tax_invoice')),
      converted_from_estimate_id TEXT,
      customer_id TEXT,
      branch_id TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      taxable_value REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      round_off REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      old_gold_exchange_value REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','partial','paid')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
      cancel_reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      item_id TEXT,
      description TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      gross_weight REAL NOT NULL,
      net_weight REAL NOT NULL,
      rate_per_gram REAL NOT NULL,
      making_charge REAL NOT NULL DEFAULT 0,
      taxable_value REAL NOT NULL,
      cgst_rate REAL NOT NULL DEFAULT 0,
      sgst_rate REAL NOT NULL DEFAULT 0,
      igst_rate REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('cash','card','online','cheque','bank_transfer','upi','other')),
      amount REAL NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS old_gold_transactions (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      customer_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      weight_received REAL NOT NULL,
      purity_claimed TEXT NOT NULL,
      rate_applied REAL NOT NULL,
      amount_credited REAL NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('opening','purchase','sale','sale_cancel','transfer_out','transfer_in','karigar_out','karigar_in','melt','adjustment')),
      quantity INTEGER NOT NULL DEFAULT 1,
      gross_weight REAL NOT NULL DEFAULT 0,
      net_weight REAL NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      user_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      target_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Additive migrations for databases created by earlier versions.
  const tenantTables = [
    'users', 'branches', 'rate_master', 'items', 'customers', 'invoices',
    'invoice_items', 'payments', 'old_gold_transactions', 'audit_log',
    'sync_queue', 'webhooks', 'api_keys'
  ];
  for (const table of tenantTables) addColumn(table, 'tenant_id TEXT');
  addColumn('users', 'must_change_password INTEGER NOT NULL DEFAULT 0');
  addColumn('sync_queue', "status TEXT NOT NULL DEFAULT 'pending'");
  addColumn('sync_queue', 'attempts INTEGER NOT NULL DEFAULT 0');
  addColumn('sync_queue', 'last_error TEXT');
  addColumn('sync_queue', 'synced_at TEXT');
  addColumn('sync_queue', 'payload_hash TEXT');
  addColumn('sync_queue', 'next_attempt_at TEXT');

  // The old settings table had a global primary key. Keep that schema for now,
  // but scope every setting key with the tenant in application code using a
  // tenant-specific key prefix. A later migration can normalize this to a
  // composite primary key without breaking current installations.

  const defaultTenantId = 'seed-tenant-default';
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, tenant_code, business_name)
    VALUES (?, 'MAIN', 'Your Jewellery Shop')
  `).run(defaultTenantId);

  // Existing single-tenant data is safely assigned to the default tenant.
  for (const table of tenantTables) {
    db.prepare(`UPDATE ${table} SET tenant_id = ? WHERE tenant_id IS NULL`).run(defaultTenantId);
  }

  // New databases and old databases both get a deterministic default branch.
  const branchId = 'seed-branch-main';
  db.prepare(`
    INSERT OR IGNORE INTO branches (id, tenant_id, name, gstin, address, state_code)
    VALUES (?, ?, 'Main Branch', NULL, NULL, '27')
  `).run(branchId, defaultTenantId);
  db.prepare(`UPDATE branches SET tenant_id=? WHERE id=? AND tenant_id IS NULL`).run(defaultTenantId, branchId);

  // Existing admin becomes a tenant Super Admin. We do not force an unexpected
  // password reset on an existing installation; new users are flagged instead.
  const bcrypt = require('bcryptjs');
  const passwordHash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT OR IGNORE INTO users
      (id, tenant_id, username, password_hash, full_name, role, branch_id, active, must_change_password)
    VALUES (?, ?, 'admin', ?, 'Admin', 'super_admin', ?, 1, 0)
  `).run('seed-admin-user', defaultTenantId, passwordHash, branchId);
  db.prepare(`UPDATE users SET tenant_id=? WHERE id='seed-admin-user' AND tenant_id IS NULL`).run(defaultTenantId);

  // Make the existing seed settings available to the default tenant installation.
  const defaults = [
    ['print_paper_size', 'a4'],
    ['company_name', 'Your Jewellery Shop'],
    ['company_address', ''],
    ['company_phone', ''],
    ['company_gstin', ''],
    ['print_show_logo', 'true'],
    ['print_show_qr', 'true'],
  ];
  for (const [key, value] of defaults) {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run(`${defaultTenantId}:${key}`, value);
  }

  // Index every tenant-scoped table. These are also useful when cloud sync is introduced.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_rate_master_tenant ON rate_master(tenant_id, metal, purity, effective_from);
    CREATE INDEX IF NOT EXISTS idx_items_tenant ON items(tenant_id, branch_id, status);
    CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, branch_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant ON invoice_items(tenant_id, invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id, invoice_id);
    CREATE INDEX IF NOT EXISTS idx_old_gold_tenant ON old_gold_transactions(tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_sync_tenant ON sync_queue(tenant_id, synced, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(tenant_id, status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id, active);
    CREATE INDEX IF NOT EXISTS idx_stock_tenant_item ON stock_movements(tenant_id, item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_tenant_branch ON stock_movements(tenant_id, branch_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_customers_search ON customers(tenant_id, phone);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(tenant_id, invoice_number);
  `);
  const migrationVersions = [
    [1, 'multi-tenant foundation'],
    [2, 'sync queue lifecycle metadata and stock movement ledger'],
  ];
  const markMigration = db.prepare('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)');
  for (const [version, description] of migrationVersions) markMigration.run(version, description);
}

migrate();
console.log('[DB] Migration complete. Using database at:', DB_PATH);

module.exports = { db, DB_PATH };
