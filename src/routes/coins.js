const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

// GET /api/coins/:accountId — get current coin balance
router.get('/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const balance = await store.getCoins(req.params.accountId);
    res.json({ coins: balance });
  })
);

// POST /api/coins/:accountId/add — add coins (quiz/game rewards)
router.post('/:accountId/add',
  param('accountId').isString().notEmpty().trim(),
  body('amount').isInt({ min: 1 }).withMessage('amount must be a positive integer'),
  body('reason').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, reason } = req.body;
    const newBalance = await store.addCoins(req.params.accountId, Number(amount), reason || 'coin_reward');
    res.json({ coins: newBalance, amount: Number(amount) });
  })
);

// POST /api/coins/:accountId/spend — spend coins (shop purchases)
router.post('/:accountId/spend',
  param('accountId').isString().notEmpty().trim(),
  body('amount').isInt({ min: 1 }).withMessage('amount must be a positive integer'),
  body('reason').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, reason } = req.body;
    try {
      const newBalance = await store.spendCoins(req.params.accountId, Number(amount), reason || 'coin_spend');
      res.json({ coins: newBalance, amount: Number(amount) });
    } catch (e) {
      if (e.message === 'Insufficient coins') {
        return res.status(400).json({ message: 'Insufficient coins' });
      }
      throw e;
    }
  })
);

// GET /api/coins/:accountId/history — coin transaction log
router.get('/:accountId/history',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const history = await store.getCoinHistory(req.params.accountId);
    res.json(history);
  })
);

module.exports = router;
