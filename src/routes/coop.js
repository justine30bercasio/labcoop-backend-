const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.get('/goals', asyncHandler(async (req, res) => {
  const coopGoals = await store.query('SELECT * FROM coop_goals ORDER BY created_at DESC');
  const coopContributions = await store.query('SELECT * FROM coop_contributions ORDER BY created_at DESC');
  res.json({ goals: coopGoals.rows, contributions: coopContributions.rows });
}));

router.post('/goals',
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('title is required (1-200 chars)'),
  body('targetAmount').isFloat({ min: 1 }).withMessage('targetAmount must be > 0'),
  body('categoryIcon').optional().isString().trim(),
  body('createdBy').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, targetAmount, categoryIcon, createdBy } = req.body;
    const goal = {
      goal_id: uuidv4(),
      title: title.trim(),
      target_amount: Number(targetAmount),
      current_allocated: 0,
      category_icon: categoryIcon || '\u{1F3AF}',
      is_completed: 0,
      created_by: createdBy || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await store.query(`
      INSERT INTO coop_goals (goal_id, title, target_amount, current_allocated, category_icon, is_completed, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      goal.goal_id, goal.title, goal.target_amount, goal.current_allocated,
      goal.category_icon, goal.is_completed, goal.created_by, goal.created_at, goal.updated_at,
    ]);

    res.status(201).json(goal);
  })
);

router.post('/goals/:goalId/contribute',
  param('goalId').isString().notEmpty().trim(),
  body('accountId').isString().notEmpty().trim().withMessage('accountId is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { accountId, amount } = req.body;
    const goalResult = await store.query('SELECT * FROM coop_goals WHERE goal_id = $1', [req.params.goalId]);
    const goal = goalResult.rows[0];
    if (!goal) return res.status(404).json({ message: 'Co-op goal not found' });

    const account = await store.getAccount(accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (Number(account.unallocated_balance) < Number(amount)) {
      return res.status(400).json({ message: 'Insufficient unallocated balance' });
    }

    const newAllocated = Number(goal.current_allocated) + Number(amount);
    const completed = newAllocated >= Number(goal.target_amount) ? 1 : 0;
    await store.query('UPDATE coop_goals SET current_allocated = $1, is_completed = $2, updated_at = $3 WHERE goal_id = $4',
      [newAllocated, completed, new Date().toISOString(), req.params.goalId]);

    const contribution = {
      contribution_id: uuidv4(),
      goal_id: req.params.goalId,
      account_id: accountId,
      amount: Number(amount),
      created_at: new Date().toISOString(),
    };
    await store.query(`
      INSERT INTO coop_contributions (contribution_id, goal_id, account_id, amount, created_at)
      VALUES ($1,$2,$3,$4,$5)
    `, [
      contribution.contribution_id, contribution.goal_id,
      contribution.account_id, contribution.amount, contribution.created_at,
    ]);

    await store.query(
      'UPDATE accounts SET unallocated_balance = ROUND(unallocated_balance - $1, 2), current_xp = current_xp + $2 WHERE account_id = $3',
      [Number(amount), Math.floor(Number(amount) / 10), accountId]
    );

    const updatedGoalResult = await store.query('SELECT * FROM coop_goals WHERE goal_id = $1', [req.params.goalId]);
    res.json({ goal: updatedGoalResult.rows[0], contribution });
  })
);

router.delete('/goals/:goalId',
  param('goalId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await store.query('DELETE FROM coop_contributions WHERE goal_id = $1', [req.params.goalId]);
    await store.query('DELETE FROM coop_goals WHERE goal_id = $1', [req.params.goalId]);
    res.status(204).send();
  })
);

module.exports = router;
