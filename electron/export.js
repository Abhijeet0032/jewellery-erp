// export.js — tenant-scoped export layer.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { Parser } = require('json2csv');
const { db } = require('./db');

const ALLOWED_TABLES = [
  'items', 'customers', 'invoices', 'invoice_items',
  'payments', 'rate_master', 'branches', 'audit_log', 'old_gold_transactions',
];

function getTableRows(table, tenantId, userId, role, branchId) {
  if (!ALLOWED_TABLES.includes(table)) throw new Error(`Export not permitted for table: ${table}`);
  let sql = `SELECT * FROM ${table} WHERE tenant_id = ?`;
  const params = [tenantId];
  if (role !== 'super_admin' && role !== 'auditor' && ['items', 'invoices', 'branches'].includes(table)) {
    sql += ' AND branch_id = ?';
    params.push(branchId);
  }
  return db.prepare(sql).all(...params);
}

function exportToJSON(table, tenantId, userId, role, branchId) {
  return JSON.stringify(getTableRows(table, tenantId, userId, role, branchId), null, 2);
}

function exportToCSV(table, tenantId, userId, role, branchId) {
  const rows = getTableRows(table, tenantId, userId, role, branchId);
  if (rows.length === 0) return '';
  return new Parser().parse(rows);
}

function exportToExcelBuffer(table, tenantId, userId, role, branchId) {
  const rows = getTableRows(table, tenantId, userId, role, branchId);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, table.substring(0, 31));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function exportTableToFile(table, format, destDir, tenantId, userId, role, branchId) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let filePath, content;
  if (format === 'csv') {
    filePath = path.join(destDir, `${table}-${stamp}.csv`);
    content = exportToCSV(table, tenantId, userId, role, branchId);
    fs.writeFileSync(filePath, content, 'utf8');
  } else if (format === 'xlsx') {
    filePath = path.join(destDir, `${table}-${stamp}.xlsx`);
    content = exportToExcelBuffer(table, tenantId, userId, role, branchId);
    fs.writeFileSync(filePath, content);
  } else {
    filePath = path.join(destDir, `${table}-${stamp}.json`);
    content = exportToJSON(table, tenantId, userId, role, branchId);
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return filePath;
}

module.exports = { ALLOWED_TABLES, exportToJSON, exportToCSV, exportToExcelBuffer, exportTableToFile };
