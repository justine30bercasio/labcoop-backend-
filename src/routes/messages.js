const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

// ── Child sends a message ──
router.post('/send', asyncHandler(async (req, res) => {
  const { accountId, content, senderName } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ message: 'Content is required' });
  if (!accountId) return res.status(400).json({ message: 'Account ID is required' });

  const msgId = uuidv4();
  const child = await store.query('SELECT child_name FROM accounts WHERE account_id = $1', [accountId]);
  const name = senderName || (child.rows[0]?.child_name || 'Child');

  await store.query(
    `INSERT INTO support_messages (message_id, account_id, child_name, sender_type, sender_name, content, admin_read, child_read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [msgId, accountId, child.rows[0]?.child_name || '', 'child', name, content.trim(), 0, 0, new Date().toISOString()]
  );

  res.json({ message: 'Sent', messageId: msgId });
}));

// ── Get messages for an account (child app) ──
router.get('/:accountId', asyncHandler(async (req, res) => {
  const msgs = await store.query(
    `SELECT * FROM support_messages WHERE account_id = $1 ORDER BY created_at ASC`,
    [req.params.accountId]
  );

  // Mark admin's messages as read by child
  await store.query(
    `UPDATE support_messages SET child_read = 1 WHERE account_id = $1 AND sender_type = 'admin' AND child_read = 0`,
    [req.params.accountId]
  );

  res.json(msgs.rows);
}));

// ── Get unread count for an account (badge on app — admin replies child hasn't read) ──
router.get('/:accountId/unread', asyncHandler(async (req, res) => {
  const result = await store.query(
    `SELECT COUNT(*) as c FROM support_messages WHERE account_id = $1 AND sender_type = 'admin' AND child_read = 0`,
    [req.params.accountId]
  );
  res.json({ unread: Number(result.rows[0]?.c || 0) });
}));

// ── Child typing heartbeat ──
router.post('/typing', asyncHandler(async (req, res) => {
  const { accountId, isTyping } = req.body;
  if (!accountId) return res.status(400).json({ message: 'Account ID is required' });
  await store.query(
    `INSERT INTO typing_status (account_id, is_typing, last_heartbeat) VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET is_typing = $2, last_heartbeat = $3`,
    [accountId, isTyping ? 1 : 0, new Date().toISOString()]
  );
  res.json({ ok: true });
}));

// ── Admin typing heartbeat ──
router.post('/admin-typing', asyncHandler(async (req, res) => {
  const { accountId, isTyping } = req.body;
  if (!accountId) return res.status(400).json({ message: 'Account ID is required' });
  await store.query(
    `INSERT INTO typing_status (account_id, is_typing, last_heartbeat) VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET is_typing = $2, last_heartbeat = $3`,
    ['admin:' + accountId, isTyping ? 1 : 0, new Date().toISOString()]
  );
  res.json({ ok: true });
}));

// ── Flutter checks if admin is typing ──
router.get('/admin-typing/:accountId', asyncHandler(async (req, res) => {
  const row = await store.query(
    `SELECT is_typing, last_heartbeat FROM typing_status WHERE account_id = $1`,
    ['admin:' + req.params.accountId]
  );
  const r = row.rows[0];
  if (!r) return res.json({ isTyping: false });
  const expired = Date.now() - new Date(r.last_heartbeat).getTime() > 5000;
  res.json({ isTyping: !expired && Number(r.is_typing) === 1 });
}));

// ── Admin checks if child is typing ──
router.get('/typing/:accountId', asyncHandler(async (req, res) => {
  const row = await store.query(
    `SELECT is_typing, last_heartbeat FROM typing_status WHERE account_id = $1`,
    [req.params.accountId]
  );
  const r = row.rows[0];
  if (!r) return res.json({ isTyping: false });
  // Expire after 5 seconds of no heartbeat
  const expired = Date.now() - new Date(r.last_heartbeat).getTime() > 5000;
  res.json({ isTyping: !expired && Number(r.is_typing) === 1 });
}));

module.exports = router;
