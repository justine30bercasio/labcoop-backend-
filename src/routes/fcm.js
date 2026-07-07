const express = require('express');
const { body, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register',
  authMiddleware,
  body('fcm_token').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fcm_token, device_platform } = req.body;
    await store.registerFcmToken(req.accountId, fcm_token, device_platform || '');
    res.json({ success: true });
  })
);

router.post('/unregister',
  authMiddleware,
  body('fcm_token').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    await store.unregisterFcmToken(req.accountId, req.body.fcm_token);
    res.json({ success: true });
  })
);

// Notifications list for Flutter
router.get('/notifications',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const rows = await store.query(
      `SELECT notif_id, title, body, type, is_read, created_at
       FROM notifications WHERE account_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [req.accountId, limit]
    );
    res.json({ notifications: rows.rows, unreadCount: rows.rows.filter(r => !r.is_read).length });
  })
);

// Mark notification as read
router.post('/notifications/:notifId/read',
  authMiddleware,
  asyncHandler(async (req, res) => {
    await store.query(
      `UPDATE notifications SET is_read = 1 WHERE notif_id = $1 AND account_id = $2`,
      [req.params.notifId, req.accountId]
    );
    res.json({ success: true });
  })
);

// Mark all notifications as read for this account
router.post('/notifications/read-all',
  authMiddleware,
  asyncHandler(async (req, res) => {
    await store.query(
      `UPDATE notifications SET is_read = 1 WHERE account_id = $1 AND is_read = 0`,
      [req.accountId]
    );
    res.json({ success: true });
  })
);

module.exports = router;
