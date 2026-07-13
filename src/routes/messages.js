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
    `INSERT INTO support_messages (message_id, account_id, child_name, sender_type, sender_name, content, admin_read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [msgId, accountId, child.rows[0]?.child_name || '', 'child', name, content.trim(), 0, new Date().toISOString()]
  );

  res.json({ message: 'Sent', messageId: msgId });
}));

// ── Get messages for an account (child app) ──
router.get('/:accountId', asyncHandler(async (req, res) => {
  const msgs = await store.query(
    `SELECT * FROM support_messages WHERE account_id = $1 ORDER BY created_at ASC`,
    [req.params.accountId]
  );

  // Mark user's own messages as read by user
  await store.query(
    `UPDATE support_messages SET admin_read = 1 WHERE account_id = $1 AND sender_type = 'admin'`,
    [req.params.accountId]
  );

  res.json(msgs.rows);
}));

// ── Get unread count for an account (for badge on app) ──
router.get('/:accountId/unread', asyncHandler(async (req, res) => {
  const result = await store.query(
    `SELECT COUNT(*) as c FROM support_messages WHERE account_id = $1 AND sender_type = 'admin' AND admin_read = 0`,
    [req.params.accountId]
  );
  res.json({ unread: Number(result.rows[0]?.c || 0) });
}));

module.exports = router;
