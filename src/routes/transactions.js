const express = require('express');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

router.get('/account/:accountId', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const txns = await store.getTransactions(req.params.accountId, Number(limit), Number(offset));
  res.json(txns);
}));

router.post('/', asyncHandler(async (req, res) => {
  const tx = await store.addTransaction(req.body);
  res.status(201).json(tx);
}));

router.get('/statement/:accountId', asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const txns = await store.getStatement(req.params.accountId, Number(limit), Number(offset));
  const account = await store.getAccount(req.params.accountId);
  const goals = await store.getGoals(req.params.accountId);
  const loans = await store.getLoans(req.params.accountId);
  const interest = await store.getInterestSummary ? await store.getInterestSummary(req.params.accountId) : null;
  res.json({
    account: account ? {
      child_name: account.child_name,
      member_id: account.member_id,
      balance: account.actual_balance,
      unallocated: account.unallocated_balance,
      xp: account.current_xp,
      savings_product: interest?.savings_product?.name || null,
      interest_earned: interest?.interest_earned || 0,
    } : null,
    transactions: txns,
    goals: (goals || []).map(g => ({
      title: g.title,
      target: g.target_amount,
      allocated: g.current_allocated,
      progress: g.target_amount > 0 ? Math.min(g.current_allocated / g.target_amount, 1) : 0,
      completed: !!g.is_completed,
    })),
    loans: (loans || []).map(l => ({
      loan_id: l.loan_id,
      purpose: l.purpose,
      principal: l.principal,
      remaining: l.remaining_balance,
      status: l.status,
      monthly: l.monthly_amortization,
    })),
    total: txns.length,
    limit: Number(limit),
    offset: Number(offset),
  });
}));

module.exports = router;
