const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

function fail(message) {
  console.error(`FAIL: ${message}`);
  app.quit();
  process.exit(1);
}

app.whenReady().then(() => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jewellery-erp-retailer-')
  );

  app.setPath('userData', dir);

  const { db } = require('../electron/db');
  const {
    getCompany,
    updateCompany,
    validateGSTIN,
    validatePAN,
  } = require('../electron/retailer');

  const tenantA = 'tenant-retailer-a';
  const tenantB = 'tenant-retailer-b';

  try {
    // Create isolated test tenants.
    db.prepare(`
      INSERT INTO tenants
        (id, tenant_code, business_name, active)
      VALUES (?, ?, ?, 1)
    `).run(
      tenantA,
      'RETAILERA',
      'Retailer A'
    );

    db.prepare(`
      INSERT INTO tenants
        (id, tenant_code, business_name, active)
      VALUES (?, ?, ?, 1)
    `).run(
      tenantB,
      'RETAILERB',
      'Retailer B'
    );

    const userA = {
      id: 'retailer-admin-a',
      tenant_id: tenantA,
      branch_id: null,
      role: 'super_admin',
      must_change_password: 0,
    };

    const userB = {
      id: 'retailer-admin-b',
      tenant_id: tenantB,
      branch_id: null,
      role: 'super_admin',
      must_change_password: 0,
    };

    // CREATE / READ
    const created = updateCompany(userA, {
      legal_name: 'Retailer A Jewellery Private Limited',
      display_name: 'Retailer A Jewellery',
      phone: '9876543210',
      email: 'a@example.com',
      address: 'Main Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      gstin: '27ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
    });

    if (created.tenant_code !== 'RETAILERA') {
      throw new Error('Company update returned wrong tenant');
    }

    const ownCompany = getCompany(userA);

    if (
      ownCompany.business_name !==
      'Retailer A Jewellery Private Limited'
    ) {
      throw new Error('Own company could not be read');
    }

    console.log('PASS: create and read own company');

    // UPDATE
    const updated = updateCompany(userA, {
      legal_name: 'Retailer A Jewellery Updated Private Limited',
      display_name: 'Retailer A Updated',
      phone: '9876543210',
      email: 'updated@example.com',
      address: 'Updated Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411002',
      gstin: '27ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
    });

    if (
      updated.business_name !==
      'Retailer A Jewellery Updated Private Limited'
    ) {
      throw new Error('Company update failed');
    }

    console.log('PASS: update own company');

    // CROSS-TENANT ISOLATION
    const companyB = updateCompany(userB, {
      legal_name: 'Retailer B Jewellery',
      display_name: 'Retailer B',
      phone: '9999999999',
      email: 'b@example.com',
      gstin: '27BCDEF2345G1Z6',
      pan: 'BCDEF2345G',
    });

    if (companyB.tenant_code !== 'RETAILERB') {
      throw new Error('Tenant B setup failed');
    }

    const companyAAfterBUpdate = getCompany(userA);

    if (
      companyAAfterBUpdate.business_name !==
      'Retailer A Jewellery Updated Private Limited'
    ) {
      throw new Error('TENANT ISOLATION FAILURE');
    }

    console.log('PASS: retailer A cannot affect retailer B');

    // VALIDATION
    if (validateGSTIN('INVALID-GST')) {
      throw new Error('Invalid GSTIN was accepted');
    }

    if (validatePAN('INVALID-PAN')) {
      throw new Error('Invalid PAN was accepted');
    }

    try {
      updateCompany(userA, {
        legal_name: 'Invalid GST Test',
        gstin: 'INVALID-GST',
      });

      throw new Error('Invalid GSTIN was accepted by updateCompany');
    } catch (error) {
      if (!error.message.includes('Invalid GSTIN')) {
        throw error;
      }
    }

    try {
      updateCompany(userA, {
        legal_name: 'Invalid PAN Test',
        pan: 'INVALID-PAN',
      });

      throw new Error('Invalid PAN was accepted by updateCompany');
    } catch (error) {
      if (!error.message.includes('Invalid PAN')) {
        throw error;
      }
    }

    console.log('PASS: GSTIN and PAN validation');

    // INACTIVE RETAILER
    db.prepare(`
      UPDATE tenants
      SET active = 0
      WHERE id = ?
    `).run(tenantA);

    try {
      getCompany(userA);
      throw new Error('Inactive retailer was accessible');
    } catch (error) {
      if (!error.message.includes('Retailer is inactive')) {
        throw error;
      }
    }

    console.log('PASS: inactive retailer blocked');

    // MIGRATION
    const migration = db.prepare(`
      SELECT version
      FROM schema_migrations
      WHERE version = 4
    `).get();

    if (!migration) {
      throw new Error('Migration 4 was not recorded');
    }

    const columns = db
      .prepare('PRAGMA table_info(tenants)')
      .all()
      .map((column) => column.name);

    for (const requiredColumn of [
      'legal_name',
      'display_name',
      'phone',
      'email',
      'gstin',
      'pan',
      'currency',
      'timezone',
    ]) {
      if (!columns.includes(requiredColumn)) {
        throw new Error(
          `Migration missing column: ${requiredColumn}`
        );
      }
    }

    console.log('PASS: retailer company migration');

    console.log('');
    console.log('PASS: retailer/company isolation, validation, inactive protection and migration');
    console.log(`Schema migrations: ${db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c}`);
    console.log(`Test DB: ${dir}`);

    db.close();
    app.quit();
  } catch (error) {
    fail(error.stack || error.message);
  }
}).catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
