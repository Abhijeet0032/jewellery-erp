// backup.js — local backup/recovery foundation.
// Uses SQLite's online backup API so WAL/shm state is captured consistently.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { db, DB_PATH } = require('./db');

const BACKUP_INTERVAL_MS = 30 * 60 * 1000;
const MAX_BACKUPS_KEPT = 96;

function getBackupDir() {
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function takeBackupSnapshot() {
  const dir = getBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `jewellery-erp-${stamp}.db`);
  await db.backup(dest);
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (!integrity || integrity.integrity_check !== 'ok') {
    try { fs.unlinkSync(dest); } catch (_) {}
    throw new Error('Database integrity check failed; backup discarded');
  }
  const hash = sha256(dest);
  fs.writeFileSync(`${dest}.sha256`, `${hash}  ${path.basename(dest)}\n`, 'utf8');
  pruneOldBackups(dir);
  return { path: dest, sha256: hash };
}

function pruneOldBackups(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  files.slice(MAX_BACKUPS_KEPT).forEach(({ f }) => {
    try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    try { fs.unlinkSync(path.join(dir, `${f}.sha256`)); } catch (_) {}
  });
}

function startAutoBackup() {
  takeBackupSnapshot().catch(err => console.error('[BACKUP] Startup backup failed:', err.message));
  setInterval(() => takeBackupSnapshot().catch(err => console.error('[BACKUP] Scheduled backup failed:', err.message)), BACKUP_INTERVAL_MS);
}

async function manualBackupTo(destPath) {
  if (!destPath) throw new Error('Backup destination is required');
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  await db.backup(destPath);
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (!integrity || integrity.integrity_check !== 'ok') throw new Error('Database integrity check failed after backup');
  const hash = sha256(destPath);
  fs.writeFileSync(`${destPath}.sha256`, `${hash}  ${path.basename(destPath)}\n`, 'utf8');
  return { path: destPath, sha256: hash };
}

module.exports = { startAutoBackup, takeBackupSnapshot, manualBackupTo, getBackupDir };
