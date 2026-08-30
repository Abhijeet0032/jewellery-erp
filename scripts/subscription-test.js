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
    path.join(os.tmpdir(), 'jewellery-erp-subscription-')
  );

  app.setPath('userData', dir);

  const { db } = require('../electron/db');
  const {
    getEntitlements,
    requireFeature,
    getLimits,
    requireLimit,
  } = require('../electron/subscriptions');
  const { getAuthenticatedUser } = require('../electron/auth');

  const tenantId = 'seed-tenant-default';
  const user = getAuthenticatedUser('seed-admin-user');

  const tables = [
    'features',
    'subscription_plans',
    'plan_features',
    'tenant_subscriptions',
    'tenant_feature_overrides',
  ];

  for (const table of tables) {
    const exists = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
      )
      .get(table);

    if (!exists) fail(`Subscription table missing: ${table}`);
  }

  const migration = db
    .prepare(
      'SELECT version FROM schema_migrations WHERE version=3'
    )
    .get();

  if (!migration) fail('Subscription migration 3 missing');

  const entitlement = getEntitlements(user);

  if (entitlement.subscription.plan_code !== 'pro') {
    fail(
      `Default tenant should be Pro, got ${entitlement.subscription.plan_code}`
    );
  }

  const billing = entitlement.features.find(
    f => f.feature_key === 'billing'
  );

  const advancedReports = entitlement.features.find(
    f => f.feature_key === 'advanced_reports'
  );

  if (!billing?.enabled) {
    fail('Pro billing feature should be enabled');
  }

  if (!advancedReports?.enabled) {
    fail('Pro advanced_reports feature should be enabled');
  }

  requireFeature(user, 'billing');
  requireFeature(user, 'advanced_reports');

  const limits = getLimits(user);

  if (limits.users !== 25 || limits.branches !== 10) {
    fail('Pro limits are incorrect');
  }

  requireLimit(user, 'users', 24);

  let denied = false;

  try {
    requireLimit(user, 'users', 25);
  } catch (_) {
    denied = true;
  }

  if (!denied) {
    fail('User limit was not enforced');
  }

  db.prepare(`
    INSERT OR REPLACE INTO tenant_feature_overrides
      (tenant_id, feature_id, enabled, expires_at, reason, updated_at)
    VALUES (
      ?,
      (SELECT id FROM features WHERE feature_key='advanced_reports'),
      0,
      NULL,
      'test',
      datetime('now')
    )
  `).run(tenantId);

  const overridden = getEntitlements(user);

  if (
    overridden.features.find(
      f => f.feature_key === 'advanced_reports'
    )?.enabled
  ) {
    fail('Tenant feature disable override was not enforced');
  }

  let featureDenied = false;

  try {
    requireFeature(user, 'advanced_reports');
  } catch (_) {
    featureDenied = true;
  }

  if (!featureDenied) {
    fail('Disabled feature access was not denied');
  }

  db.prepare(`
    INSERT OR REPLACE INTO tenant_feature_overrides
      (tenant_id, feature_id, enabled, expires_at, reason, updated_at)
    VALUES (
      ?,
      (SELECT id FROM features WHERE feature_key='advanced_reports'),
      1,
      datetime('now', '-1 day'),
      'expired test',
      datetime('now')
    )
  `).run(tenantId);

  const expiredOverride = getEntitlements(user);

  if (
    !expiredOverride.features.find(
      f => f.feature_key === 'advanced_reports'
    )?.enabled
  ) {
    fail('Expired override should fall back to plan entitlement');
  }

  db.prepare(`
    UPDATE tenant_subscriptions
    SET status='expired', updated_at=datetime('now')
    WHERE tenant_id=?
  `).run(tenantId);

  const expiredSubscription = getEntitlements(user);

  if (expiredSubscription.subscription.active) {
    fail('Expired subscription still active');
  }

  if (expiredSubscription.features.some(f => f.enabled)) {
    fail('Expired subscription retained enabled features');
  }

  let expiredDenied = false;

  try {
    requireFeature(user, 'billing');
  } catch (_) {
    expiredDenied = true;
  }

  if (!expiredDenied) {
    fail('Expired subscription feature access was not denied');
  }

  const integrity = db
    .prepare('PRAGMA integrity_check')
    .get();

  if (!integrity || integrity.integrity_check !== 'ok') {
    fail('SQLite integrity check failed');
  }

  console.log(
    'PASS: subscription schema, plans, entitlements, overrides, limits and expiry'
  );

  console.log(
    `Plan: ${entitlement.subscription.plan_code}`
  );

  console.log(
    `Features checked: ${entitlement.features.length}`
  );

  console.log(`Test DB: ${dir}`);

  db.close();
  app.quit();
}).catch(err => {
  console.error(err);
  app.quit();
  process.exit(1);
});
