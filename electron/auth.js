// auth.js — authentication, tenant resolution and backend authorization.
// The renderer supplies a username/password and a tenant code only to identify
// the login target. Every subsequent tenant/branch decision is derived from
// the authenticated user record in SQLite; the renderer cannot choose a tenant.

const bcrypt = require('bcryptjs');
const { db } = require('./db');
const ROLES = require('../roles.json');

function login(tenantCode, username, password) {
  const code = String(tenantCode || '').trim().toUpperCase();
  const name = String(username || '').trim();
  if (!code || !name || !password) throw new Error('Tenant code, username, and password are required');

  const user = db.prepare(`
    SELECT u.*, t.tenant_code, t.business_name, t.active AS tenant_active
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE t.tenant_code = ? AND t.active = 1 AND u.username = ? AND u.active = 1
  `).get(code, name);

  if (!user) throw new Error('Invalid tenant code, username or password');
  if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('Invalid tenant code, username or password');
  }

  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function getUserById(userId) {
  return db.prepare(`
    SELECT u.*, t.tenant_code, t.business_name, t.active AS tenant_active
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ?
  `).get(userId);
}

function getAuthenticatedUser(userId) {
  const user = getUserById(userId);
  if (!user || !user.active || !user.tenant_active) {
    throw new Error('Not authorized: invalid or inactive user/retailer');
  }
  if (user.branch_id) {
    const branch = db.prepare('SELECT id, tenant_id, active FROM branches WHERE id=? AND tenant_id=?').get(user.branch_id, user.tenant_id);
    if (!branch || !branch.active) throw new Error('Not authorized: user branch is invalid or inactive');
  }
  const roleConfig = ROLES[user.role];
  if (!roleConfig) throw new Error(`Not authorized: unknown role "${user.role}"`);
  return user;
}

function hashPassword(plainPassword) {
  return bcrypt.hashSync(plainPassword, 10);
}

function requirePermission(userId, permissionKey) {
  const user = getAuthenticatedUser(userId);
  const roleConfig = ROLES[user.role];
  if (!roleConfig[permissionKey]) {
    throw new Error(`Not authorized: role "${user.role}" cannot perform this action`);
  }
  return user;
}

function requireModuleAccess(userId, moduleKey) {
  const user = getAuthenticatedUser(userId);
  const roleConfig = ROLES[user.role];
  if (!roleConfig.modules.includes(moduleKey)) {
    throw new Error(`Not authorized: role "${user.role}" has no access to "${moduleKey}"`);
  }
  return user;
}

function canAccessBranch(user, branchId) {
  if (!branchId) return false;
  if (user.role === 'super_admin' || user.role === 'auditor') return true;
  return user.branch_id === branchId;
}

function requireBranchAccess(userId, branchId) {
  const user = getAuthenticatedUser(userId);
  const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND active = 1').get(branchId, user.tenant_id);
  if (!branch) throw new Error('Branch not found for this retailer');
  if (!canAccessBranch(user, branchId)) {
    throw new Error('Not authorized: you cannot access this branch');
  }
  return { user, branch };
}

function requireTenantRecord(userId, table, recordId) {
  const user = getAuthenticatedUser(userId);
  const allowed = new Set([
    'users', 'branches', 'rate_master', 'items', 'customers', 'invoices',
    'invoice_items', 'payments', 'old_gold_transactions', 'audit_log',
    'sync_queue', 'webhooks', 'api_keys'
  ]);
  if (!allowed.has(table)) throw new Error('Invalid tenant-scoped table');
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`).get(recordId, user.tenant_id);
  if (!row) throw new Error('Record not found for this retailer');
  return { user, row };
}

function requirePasswordChangeComplete(userId, newPassword) {
  const user = getAuthenticatedUser(userId);
  if (!user.must_change_password) throw new Error('Password change is not required');
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    throw new Error('New password must be 8 to 128 characters');
  }
  db.prepare(`UPDATE users SET password_hash=?, must_change_password=0, updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(hashPassword(newPassword), user.id, user.tenant_id);
  return { success: true };
}

module.exports = {
  login,
  getUserById,
  getAuthenticatedUser,
  hashPassword,
  requirePermission,
  requireModuleAccess,
  requireBranchAccess,
  requireTenantRecord,
  requirePasswordChangeComplete,
  ROLES,
};
