const express = require('express');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');

const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many deposit attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

router.get('/:accountId',
  param('accountId').isString().notEmpty().trim().withMessage('accountId is required'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const account = await store.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json({
      ...account,
      actual_balance: Number(account.actual_balance),
      unallocated_balance: Number(account.unallocated_balance),
      current_xp: Number(account.current_xp),
    });
  })
);

router.put('/:accountId',
  param('accountId').isString().notEmpty().trim(),
  body('current_xp').optional().isInt({ min: 0 }).withMessage('current_xp must be >= 0'),
  body('child_name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('parent_phone').optional().isString().isLength({ max: 20 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { current_xp, child_name, parent_phone } = req.body;
    const updated = await store.updateAccount(req.params.accountId, {
      current_xp,
      child_name,
      parent_phone,
    });
    if (!updated) return res.status(404).json({ message: 'Account not found' });
    res.json(updated);
  })
);

router.put('/:accountId/deposit',
  depositLimiter,
  param('accountId').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount } = req.body;
    const runDeposit = async (tx) => {
      const account = await store.getAccount(req.params.accountId);
      if (!account) throw new Error('Account not found');

      const updated = await store.updateAccount(req.params.accountId, {
        actual_balance: Math.round((Number(account.actual_balance) + Number(amount)) * 100) / 100,
        unallocated_balance: Math.round((Number(account.unallocated_balance) + Number(amount)) * 100) / 100,
      });

      await store.addTransaction({
        account_id: req.params.accountId,
        type: 'deposit',
        amount: Number(amount),
        description: 'Teller cash deposit',
      });

      return updated;
    };

    try {
      const updated = isPostgres ? await store.transaction(async () => {
        const result = await runDeposit();
        return result;
      }) : await runDeposit();
      res.json(updated);
    } catch (e) {
      res.status(404).json({ message: e.message });
    }
  })
);

module.exports = router;
