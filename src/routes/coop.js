const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.get('/goals', (req, res) => {
  const db = getDb();
  const coopGoals = db.prepare('SELECT * FROM coop_goals ORDER BY created_at DESC').all();
  const coopContributions = db.prepare('SELECT * FROM coop_contributions ORDER BY created_at DESC').all();
  res.json({ goals: coopGoals, contributions: coopContributions });
});

router.post('/goals',
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('title is required (1-200 chars)'),
  body('targetAmount').isFloat({ min: 1 }).withMessage('targetAmount must be > 0'),
  body('categoryIcon').optional().isString().trim(),
  body('createdBy').optional().isString().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, targetAmount, categoryIcon, createdBy } = req.body;
    const db = getDb();
    const goal = {
      goal_id: uuidv4(),
      title: title.trim(),
      target_amount: Number(targetAmount),
      current_allocated: 0,
      category_icon: categoryIcon || '🎯',
      is_completed: 0,
      created_by: createdBy || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO coop_goals (goal_id, title, target_amount, current_allocated, category_icon, is_completed, created_by, created_at, updated_at)
      VALUES (@goal_id, @title, @target_amount, @current_allocated, @category_icon, @is_completed, @created_by, @created_at, @updated_at)
    `).run(goal);

    res.status(201).json(goal);
  }
);

router.post('/goals/:goalId/contribute',
  param('goalId').isString().notEmpty().trim(),
  body('accountId').isString().notEmpty().trim().withMessage('accountId is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { accountId, amount } = req.body;
    const db = getDb();
    const goal = db.prepare('SELECT * FROM coop_goals WHERE goal_id = ?').get(req.params.goalId);
    if (!goal) return res.status(404).json({ message: 'Co-op goal not found' });

    const account = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (account.unallocated_balance < Number(amount)) {
      return res.status(400).json({ message: 'Insufficient unallocated balance' });
    }

    const newAllocated = goal.current_allocated + Number(amount);
    const completed = newAllocated >= goal.target_amount ? 1 : 0;
    db.prepare('UPDATE coop_goals SET current_allocated = ?, is_completed = ?, updated_at = ? WHERE goal_id = ?')
      .run(newAllocated, completed, new Date().toISOString(), req.params.goalId);

    const contribution = {
      contribution_id: uuidv4(),
      goal_id: req.params.goalId,
      account_id: accountId,
      amount: Number(amount),
      created_at: new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO coop_contributions (contribution_id, goal_id, account_id, amount, created_at)
      VALUES (@contribution_id, @goal_id, @account_id, @amount, @created_at)
    `).run(contribution);

    db.prepare('UPDATE accounts SET unallocated_balance = ROUND(unallocated_balance - ?, 2), current_xp = current_xp + ? WHERE account_id = ?')
      .run(Number(amount), Math.floor(Number(amount) / 10), accountId);

    const updatedGoal = db.prepare('SELECT * FROM coop_goals WHERE goal_id = ?').get(req.params.goalId);

    res.json({
      goal: updatedGoal,
      contribution,
    });
  }
);

router.delete('/goals/:goalId',
  param('goalId').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const db = getDb();
    db.prepare('DELETE FROM coop_contributions WHERE goal_id = ?').run(req.params.goalId);
    db.prepare('DELETE FROM coop_goals WHERE goal_id = ?').run(req.params.goalId);
    res.status(204).send();
  }
);

module.exports = router;
