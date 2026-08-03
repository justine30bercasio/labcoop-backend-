const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

const fileStorage = require('./file-storage');
const { store, isPostgres } = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

// System tables excluded from backup/restore (mirrors admin.js)
const SYSTEM_TABLES = new Set(['sequences', 'audit_log', 'admin_users', 'fcm_tokens', 'gl_accounts', 'backup_logs']);

function phTimestamp() {
  const d = new Date();
  const parts = d.toLocaleString('en-CA', { timeZone: 'Asia/Manila', hour12: false }).replace(',', '').split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00-00-00';
  return `${datePart}_${timePart.replace(/:/g, '-')}`;
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

async function getAllTables() {
  let tables;
  if (isPostgres) {
    const r = await store.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    tables = r.rows.map(t => t.table_name);
  } else {
    const r = await store.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", []);
    tables = r.rows.map(t => t.name);
  }
  return tables.filter(t => !SYSTEM_TABLES.has(t));
}

// Produce the same JSON structure as the admin "Download Backup" (/admin/backup),
// so auto-backups can be restored through the web UI's Restore page.
async function nodeDumpBackup(filepath) {
  const tables = await getAllTables();
  const backup = {
    manifest: {
      app: 'LabCoop',
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      tables: tables,
      total_tables: tables.length,
      total_rows: 0,
      db_type: isPostgres ? 'postgresql' : 'sqlite',
    },
    data: {},
  };
  for (const t of tables) {
    let rows = [];
    try {
      const res = await store.query(`SELECT * FROM "${t}"`);
      rows = res.rows || [];
    } catch (err) {
      logger.warn('[Backup] Skipping table ' + t + ': ' + err.message);
    }
    backup.data[t] = rows;
    backup.manifest.total_rows += rows.length;
  }
  const jsonStr = JSON.stringify(backup, null, 2);
  backup.manifest.checksum = sha256(jsonStr);
  const finalJson = JSON.stringify(backup, null, 2);
  fs.writeFileSync(filepath, finalJson, 'utf8');
}

async function runDatabaseBackup() {
  if (!fileStorage.isConfigured()) {
    logger.warn('[Backup] R2 not configured — skipping database backup');
    return { success: false, reason: 'R2 not configured' };
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = phTimestamp();
  const filename = `labcoop-backup-${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const backupType = 'node_dump';
  let stats;

  try {
    await nodeDumpBackup(filepath);
    stats = fs.statSync(filepath);
    if (stats.size === 0) throw new Error('Backup file is empty (0 bytes)');
    logger.info('[Backup] Dump completed', { type: backupType, size: stats.size, filename });
  } catch (err) {
    logger.error('[Backup] Dump failed', { error: err.message });
    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
    return { success: false, reason: err.message };
  }

  const r2Key = `backups/${filename}`;
  try {
    const content = fs.readFileSync(filepath);
    await fileStorage.uploadFile(content, r2Key, 'application/json');
    logger.info('[Backup] Uploaded to R2', { key: r2Key, size: content.length });
  } catch (err) {
    logger.error('[Backup] R2 upload failed', { error: err.message });
    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
    return { success: false, reason: 'R2 upload: ' + err.message };
  }

  try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}

  try {
    const backupId = uuidv4();
    const r2Url = fileStorage.getPublicUrl(r2Key);
    await store.query(
      'INSERT INTO backup_logs (backup_id, filename, file_size, status, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [backupId, filename, stats.size, 'completed', JSON.stringify({ r2_url: r2Url, type: backupType }), new Date().toISOString()]
    );
  } catch (logErr) {
    logger.warn('[Backup] Failed to log backup', { error: logErr.message });
  }

  return { success: true, filename, type: backupType };
}

async function cleanupOldBackups() {
  const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '30', 10);
  try {
    const rows = await store.query('SELECT * FROM backup_logs ORDER BY created_at DESC');
    if (rows.rows.length > MAX_BACKUPS) {
      const toDelete = rows.rows.slice(MAX_BACKUPS);
      for (const b of toDelete) {
        const notes = typeof b.notes === 'string' ? (() => { try { return JSON.parse(b.notes); } catch { return {}; } })() : (b.notes || {});
        const r2Url = notes.r2_url || '';
        const key = fileStorage.keyFromUrl(r2Url);
        if (key) {
          try { await fileStorage.deleteFile(key); } catch (e) { logger.warn('[Backup] Cleanup delete failed', { key, error: e.message }); }
        }
        await store.query('DELETE FROM backup_logs WHERE backup_id = $1', [b.backup_id]);
      }
      logger.info('[Backup] Cleanup removed ' + toDelete.length + ' old backups');
    }
  } catch (err) {
    logger.warn('[Backup] Cleanup failed', { error: err.message });
  }
}

module.exports = { runDatabaseBackup, cleanupOldBackups };
