const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const router = express.Router();

// Rate limit XP adds (quiz/game rewards) to prevent self-minting abuse:
// 50 per 15 minutes per account — generous for gameplay, blocks automated spam.
const xpAddLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.params?.accountId || ipKeyGenerator(req.ip),
  message: { message: 'Too many XP reward requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/xp/:accountId/add — add XP (quiz/game rewards)
router.post('/:accountId/add',
  xpAddLimiter,
  param('accountId').isString().notEmpty().trim(),
  body('amount').isInt({ min: 1 }).withMessage('amount must be a positive integer'),
  body('reason').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, reason } = req.body;
    const newXp = await store.addXp(req.params.accountId, Number(amount));
    res.json({ xp: newXp, amount: Number(amount), reason: reason || 'xp_reward' });
  })
);

module.exports = router;
