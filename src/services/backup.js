const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

const fileStorage = require('./file-storage');
const { store, isPostgres } = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

function phTimestamp() {
  const d = new Date();
  const parts = d.toLocaleString('en-CA', { timeZone: 'Asia/Manila', hour12: false }).replace(',', '').split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00-00-00';
  return `${datePart}_${timePart.replace(/:/g, '-')}`;
}

function pgDumpAvailable() {
  try {
    execSync('pg_dump --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch { return false; }
}

async function pgDumpBackup(filepath) {
  const dbUrl = process.env.DATABASE_URL || '';
  execSync(
    `pg_dump "${dbUrl}" --format=custom --file="${filepath}" --no-owner --no-acl`,
    { timeout: 300000, stdio: 'pipe' }
  );
}

async function nodePgDumpBackup(filepath) {
  const { Pool } = require('pg');
  const dbUrl = process.env.DATABASE_URL || '';
  const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 10000 });
  try {
    const tablesRes = await pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    const dump = {};
    for (const row of tablesRes.rows) {
      const tableName = row.tablename;
      const dataRes = await pool.query(`SELECT * FROM "${tableName}"`);
      dump[tableName] = dataRes.rows;
    }
    fs.writeFileSync(filepath, JSON.stringify(dump, null, 2), 'utf8');
  } finally {
    await pool.end();
  }
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
  let filename, filepath, backupType, stats;

  try {
    if (isPostgres) {
      if (pgDumpAvailable()) {
        backupType = 'pg_dump';
        filename = `labcoop-backup-${timestamp}.pgdump`;
        filepath = path.join(BACKUP_DIR, filename);
        await pgDumpBackup(filepath);
      } else {
        backupType = 'node_dump';
        filename = `labcoop-backup-${timestamp}.json`;
        filepath = path.join(BACKUP_DIR, filename);
        await nodePgDumpBackup(filepath);
      }
    } else {
      backupType = 'sqlite_copy';
      filename = `labcoop-backup-${timestamp}.db`;
      filepath = path.join(BACKUP_DIR, filename);
      const sqlitePath = path.join(__dirname, '..', 'labcoop.db');
      if (!fs.existsSync(sqlitePath)) {
        throw new Error('SQLite database file not found at ' + sqlitePath);
      }
      const walPath = sqlitePath + '-wal';
      const shmPath = sqlitePath + '-shm';
      if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch {} }
      if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch {} }
      fs.copyFileSync(sqlitePath, filepath);
    }

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
    await fileStorage.uploadFile(content, r2Key, backupType === 'node_dump' ? 'application/json' : 'application/octet-stream');
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
