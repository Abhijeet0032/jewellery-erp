const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jewellery-erp-foundation-'));
  app.setPath('userData', dir);

  const { db } = require('../electron/db');
  const { login, requireBranchAccess, requireTenantRecord } = require('../electron/auth');

  const tenantA = 'seed-tenant-default';
  const tenantB = 'tenant-test-b';
  const branchA = 'seed-branch-main';
  const branchB = 'branch-test-b';
  const userB = 'user-test-b';
  const customerA = 'customer-test-a';
  const customerB = 'customer-test-b';

  db.prepare(`INSERT INTO tenants (id, tenant_code, business_name) VALUES (?, ?, ?)`).run(tenantB, 'TESTB', 'Test Retailer B');
  db.prepare(`INSERT INTO branches (id, tenant_id, name, state_code) VALUES (?, ?, ?, ?)`).run(branchB, tenantB, 'B Main', '27');
  db.prepare(`INSERT INTO users (id, tenant_id, username, password_hash, full_name, role, branch_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(userB, tenantB, 'admin_b', bcrypt.hashSync('testpass123', 10), 'Test B Admin', 'super_admin', branchB);
  db.prepare(`INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)`).run(customerA, tenantA, 'Customer A');
  db.prepare(`INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)`).run(customerB, tenantB, 'Customer B');

  const a = login('MAIN', 'admin', 'admin123');
  const b = login('TESTB', 'admin_b', 'testpass123');
  if (a.tenant_id === b.tenant_id) throw new Error('Tenant isolation failed: same tenant');

  const aCustomers = db.prepare('SELECT * FROM customers WHERE tenant_id=?').all(a.tenant_id);
  const bCustomers = db.prepare('SELECT * FROM customers WHERE tenant_id=?').all(b.tenant_id);
  if (!aCustomers.some(c => c.id === customerA) || aCustomers.some(c => c.id === customerB)) throw new Error('Customer isolation failed');
  if (!bCustomers.some(c => c.id === customerB) || bCustomers.some(c => c.id === customerA)) throw new Error('Customer isolation failed');

  requireBranchAccess(a.id, branchA);
  let denied = false;
  try { requireBranchAccess(a.id, branchB); } catch (_) { denied = true; }
  if (!denied) throw new Error('Cross-tenant branch access was not denied');

  let recordDenied = false;
  try { requireTenantRecord(a.id, 'customers', customerB); } catch (_) { recordDenied = true; }
  if (!recordDenied) throw new Error('Cross-tenant record access was not denied');

  const migrationCount = db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c;
  if (migrationCount < 2) throw new Error('Schema migration history missing');

  const stockCols = db.prepare('PRAGMA table_info(stock_movements)').all();
  if (!stockCols.some(c => c.name === 'tenant_id')) throw new Error('Stock movement tenant_id missing');
  const syncCols = db.prepare('PRAGMA table_info(sync_queue)').all();
  for (const name of ['status', 'attempts', 'payload_hash', 'last_error', 'synced_at']) {
    if (!syncCols.some(c => c.name === name)) throw new Error(`sync_queue column missing: ${name}`);
  }

  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (!integrity || integrity.integrity_check !== 'ok') throw new Error('SQLite integrity check failed');

  console.log('PASS: multi-tenant, branch isolation, migration, sync and DB integrity');
  console.log(`Tenant A: ${a.tenant_code}`);
  console.log(`Tenant B: ${b.tenant_code}`);
  console.log(`Schema migrations: ${migrationCount}`);
  console.log(`Test DB: ${dir}`);
  db.close();
  app.quit();
}).catch(err => {
  console.error('FAIL:', err.stack || err.message);
  app.quit();
  process.exitCode = 1;
});
