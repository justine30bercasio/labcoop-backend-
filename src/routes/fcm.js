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

module.exports = router;
