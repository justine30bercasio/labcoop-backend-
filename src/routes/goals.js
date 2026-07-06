const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

router.get('/account/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const goals = await store.getGoals(req.params.accountId);
    res.json(goals);
  })
);

router.post('/',
  body('account_id').isString().notEmpty().trim().withMessage('account_id is required'),
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('title is required (1-200 chars)'),
  body('target_amount').isFloat({ min: 1 }).withMessage('target_amount must be > 0'),
  body('category_icon').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, title, target_amount, category_icon } = req.body;
    const goal = await store.createGoal({ account_id, title, target_amount: Number(target_amount), category_icon: category_icon || 'savings' });
    res.status(201).json(goal);
  })
);

router.put('/:goalId',
  param('goalId').isString().notEmpty().trim(),
  body('current_allocated').optional().isFloat({ min: 0 }).withMessage('current_allocated must be >= 0'),
  body('title').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('target_amount').optional().isFloat({ min: 1 }).withMessage('target_amount must be > 0'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { current_allocated, title, target_amount, category_icon } = req.body;
    const oldGoal = await store.getGoal(req.params.goalId);
    if (!oldGoal) return res.status(404).json({ message: 'Goal not found' });

    const diff = current_allocated !== undefined ? Number(current_allocated) - Number(oldGoal.current_allocated) : 0;

    const doUpdate = async () => {
      // If allocating, deduct from account's unallocated_balance server-side
      // (client also sends PUT /api/accounts/:id but we don't allow unallocated_balance there anymore)
      if (diff > 0) {
        const account = await store.getAccount(oldGoal.account_id);
        if (!account) throw new Error('Account not found');
        const amount = Math.abs(diff);
        if (Number(account.unallocated_balance) < amount) {
          throw new Error('Insufficient unallocated balance');
        }
        // Use raw query to update unallocated_balance — bypasses allowed-fields check
        await store.query(
          'UPDATE accounts SET unallocated_balance = unallocated_balance - $1, updated_at = $2 WHERE account_id = $3',
          [amount, new Date().toISOString(), oldGoal.account_id]
        );
      } else if (diff < 0) {
        // Deallocation — add back to unallocated_balance
        const amount = Math.abs(diff);
        await store.query(
          'UPDATE accounts SET unallocated_balance = unallocated_balance + $1, updated_at = $2 WHERE account_id = $3',
          [amount, new Date().toISOString(), oldGoal.account_id]
        );
      }

      const updated = await store.updateGoal(req.params.goalId, {
        current_allocated: current_allocated !== undefined ? Number(current_allocated) : undefined,
        title,
        target_amount: target_amount !== undefined ? Number(target_amount) : undefined,
        category_icon,
      });
      if (!updated) throw new Error('Goal not found');

      if (diff !== 0) {
        await store.addTransaction({
          account_id: oldGoal.account_id,
          goal_id: req.params.goalId,
          type: diff > 0 ? 'allocation' : 'deallocation',
          amount: Math.abs(diff),
          description: diff > 0 ? 'Allocated to goal' : 'Withdrawn from goal',
        });
      }
      return store.getGoal(req.params.goalId);
    };

    const updated = isPostgres ? await store.transaction(async () => doUpdate()) : await doUpdate();
    res.json(updated);
  })
);

router.delete('/:goalId',
  param('goalId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await store.deleteGoal(req.params.goalId);
    res.status(204).send();
  })
);

module.exports = router;
