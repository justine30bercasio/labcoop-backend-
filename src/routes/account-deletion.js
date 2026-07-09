const express = require('express');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/account-deletion/request — parent or child can request deletion
router.post('/request', authMiddleware, asyncHandler(async (req, res) => {
  const account = await store.getAccount(req.accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  const { reason } = req.body;
  await store.query(
    `INSERT INTO account_deletion_requests (request_id, account_id, requested_by, reason, status, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [require('uuid').v4(), req.accountId, req.body.requested_by || 'parent', reason || '', new Date().toISOString()]
  );
  // Notify linked parents
  const parentLinks2 = await store.query(
    'SELECT parent_id FROM parent_child_links WHERE child_account_id = $1 AND status = $2',
    [req.accountId, 'active']
  );
  for (const link of parentLinks2.rows) {
    await store.createParentNotification({
      parentId: link.parent_id,
      title: 'Account Deletion Request',
      body: `Your child requested account deletion. Reason: ${reason || 'Not specified'}.`,
      type: 'account_deletion',
    }).catch(() => {});
  }
  res.json({ message: 'Deletion request submitted. An admin will review it.' });
}));

// GET /api/account-deletion/status
router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  const result = await store.query(
    "SELECT * FROM account_deletion_requests WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1",
    [req.accountId]
  );
  res.json({ request: result.rows[0] || null });
}));

module.exports = router;
