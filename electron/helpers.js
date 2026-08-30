const { randomUUID } = require('crypto');
const { db } = require('./db');

function newId() {
  return randomUUID();
}

function logAudit({ table, recordId, action, oldValue, newValue, userId, tenantId }) {
  const stmt = db.prepare(`
    INSERT INTO audit_log (id, tenant_id, table_name, record_id, action, old_value, new_value, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    newId(),
    tenantId || null,
    table,
    recordId,
    action,
    oldValue !== undefined && oldValue !== null ? JSON.stringify(oldValue) : null,
    newValue !== undefined && newValue !== null ? JSON.stringify(newValue) : null,
    userId || null
  );
}

function queueSync({ table, recordId, operation, payload, tenantId }) {
  const stmt = db.prepare(`
    INSERT INTO sync_queue (id, tenant_id, table_name, record_id, operation, payload, payload_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  const serialized = JSON.stringify(payload);
  const crypto = require('crypto');
  stmt.run(newId(), tenantId || null, table, recordId, operation, serialized, crypto.createHash('sha256').update(serialized).digest('hex'));
}

module.exports = { newId, logAudit, queueSync };
