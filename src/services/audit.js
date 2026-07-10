const { store } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function log(req, action, entityType, entityId, details, accountId) {
  const adminId = req.session?.adminId || accountId || 'system';
  const adminName = req.session?.adminName || (accountId ? 'user:' + String(accountId).substring(0, 8) : 'System');
  await store.query(
    'INSERT INTO audit_log (log_id, admin_id, admin_name, action, entity_type, entity_id, details, ip_address, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [uuidv4(), adminId, adminName, action, entityType || null, entityId || null, JSON.stringify(details || {}), req.ip || '', new Date().toISOString()]
  );
}

async function getLogs(limit = 100, offset = 0) {
  const res = await store.query(
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [Number(limit), Number(offset)]
  );
  return res.rows;
}

module.exports = { log, getLogs };
