const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.whenReady().then(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jewellery-erp-isolation-'));
  app.setPath('userData', dir);

  const { db } = require('../electron/db');
  const { login } = require('../electron/auth');
  const bcrypt = require('bcryptjs');

  const tenantB = 'tenant-test-b';
  const branchB = 'branch-test-b';
  const userB = 'user-test-b';
  const customerA = 'customer-test-a';
  const customerB = 'customer-test-b';

  db.prepare(`INSERT INTO tenants (id, tenant_code, business_name) VALUES (?, ?, ?)`).run(tenantB, 'TESTB', 'Test Retailer B');
  db.prepare(`INSERT INTO branches (id, tenant_id, name, state_code) VALUES (?, ?, ?, ?)`).run(branchB, tenantB, 'B Main', '27');
  db.prepare(`INSERT INTO users (id, tenant_id, username, password_hash, full_name, role, branch_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(userB, tenantB, 'admin_b', bcrypt.hashSync('testpass123', 10), 'Test B Admin', 'super_admin', branchB);
  db.prepare(`INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)`).run(customerA, 'seed-tenant-default', 'Customer A');
  db.prepare(`INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)`).run(customerB, tenantB, 'Customer B');

  const a = login('MAIN', 'admin', 'admin123');
  const b = login('TESTB', 'admin_b', 'testpass123');
  if (a.tenant_id === b.tenant_id) throw new Error('FAIL: tenants resolved to the same tenant');
  if (a.tenant_code !== 'MAIN' || b.tenant_code !== 'TESTB') throw new Error('FAIL: tenant codes incorrect');

  const aCustomers = db.prepare('SELECT * FROM customers WHERE tenant_id=?').all(a.tenant_id);
  const bCustomers = db.prepare('SELECT * FROM customers WHERE tenant_id=?').all(b.tenant_id);
  if (!aCustomers.some(c => c.id === customerA) || aCustomers.some(c => c.id === customerB)) throw new Error('FAIL: Tenant A customer isolation');
  if (!bCustomers.some(c => c.id === customerB) || bCustomers.some(c => c.id === customerA)) throw new Error('FAIL: Tenant B customer isolation');

  console.log('PASS: tenant login and customer isolation');
  console.log(`Tenant A: ${a.tenant_code} (${a.business_name})`);
  console.log(`Tenant B: ${b.tenant_code} (${b.business_name})`);
  db.close();
  app.quit();
}).catch(err => {
  console.error('FAIL:', err.message);
  app.quit();
  process.exitCode = 1;
});
