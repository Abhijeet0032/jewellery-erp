// api-server.js — localhost integration API with strict retailer/tenant isolation.
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { db } = require('./db');
const { newId, logAudit } = require('./helpers');
const { exportToCSV, exportToJSON, exportToExcelBuffer, ALLOWED_TABLES } = require('./export');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' });
  const hashed = hashKey(key);
  const row = db.prepare(`
    SELECT id, tenant_id FROM api_keys
    WHERE key_hash=? AND active=1 AND tenant_id IS NOT NULL
  `).get(hashed);
  if (!row) return res.status(403).json({ error: 'Invalid or inactive API key' });
  req.apiKey = row;
  next();
}

function createApiServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api', requireApiKey);

  app.get('/api/tenant', (req, res) => {
    const tenant = db.prepare('SELECT id, tenant_code, business_name, active FROM tenants WHERE id=? AND active=1').get(req.apiKey.tenant_id);
    if (!tenant) return res.status(404).json({ error: 'Retailer not found' });
    res.json(tenant);
  });

  app.get('/api/items', (req, res) => {
    res.json(db.prepare('SELECT * FROM items WHERE tenant_id=? AND status != "melted"').all(req.apiKey.tenant_id));
  });

  app.get('/api/customers', (req, res) => {
    res.json(db.prepare('SELECT * FROM customers WHERE tenant_id=?').all(req.apiKey.tenant_id));
  });

  app.get('/api/invoices', (req, res) => {
    const { from, to, doc_type } = req.query;
    let q = 'SELECT * FROM invoices WHERE tenant_id=?';
    const params = [req.apiKey.tenant_id];
    if (from) { q += ' AND created_at >= ?'; params.push(from); }
    if (to) { q += ' AND created_at <= ?'; params.push(to); }
    if (doc_type) { q += ' AND doc_type = ?'; params.push(doc_type); }
    res.json(db.prepare(q).all(...params));
  });

  app.get('/api/invoices/:id', (req, res) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=? AND tenant_id=?').get(req.params.id, req.apiKey.tenant_id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    const lineItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=? AND tenant_id=?').all(req.params.id, req.apiKey.tenant_id);
    res.json({ ...invoice, line_items: lineItems });
  });

  app.get('/api/export/:table', (req, res) => {
    const { table } = req.params;
    const format = (req.query.format || 'json').toLowerCase();
    if (!ALLOWED_TABLES.includes(table)) return res.status(400).json({ error: 'Table not exportable' });
    const role = 'super_admin';
    const tenantId = req.apiKey.tenant_id;
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
      return res.send(exportToCSV(table, tenantId, 'api', role, null));
    }
    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${table}.xlsx"`);
      return res.send(exportToExcelBuffer(table, tenantId, 'api', role, null));
    }
    res.setHeader('Content-Type', 'application/json');
    res.send(exportToJSON(table, tenantId, 'api', role, null));
  });

  app.post('/api/customers', (req, res) => {
    const { name, phone, email, address, pan, gstin } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = newId();
    db.prepare(`INSERT INTO customers (id, tenant_id, name, phone, email, address, pan, gstin) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, req.apiKey.tenant_id, name, phone || null, email || null, address || null, pan || null, gstin || null);
    logAudit({ table: 'customers', recordId: id, action: 'insert', newValue: req.body, tenantId: req.apiKey.tenant_id });
    res.status(201).json({ id });
  });

  return app;
}

module.exports = { createApiServer };
