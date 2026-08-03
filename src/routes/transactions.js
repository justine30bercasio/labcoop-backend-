const express = require('express');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limit raw transaction creation: 10 per 15 minutes per IP
const txCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many transaction requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/account/:accountId', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const txns = await store.getTransactions(req.params.accountId, Number(limit), Number(offset));
  res.json(txns);
}));

// Raw transaction creation is intentionally locked down (S9):
// - Only the account owner may record a transaction (defense-in-depth on top of requireOwnership).
// - Only informational, non-balance-affecting types are allowed. Balance-affecting types
//   (deposit, withdrawal, interest, loan_*, auto_save, void, etc.) are created exclusively by
//   server-side business logic (admin teller, loan engine, interest scheduler) to prevent a child
//   from fabricating ledger history that could later be voided into a real balance deduction.
const CLIENT_SAFE_TYPES = ['allocation', 'deallocation'];

router.post('/', txCreateLimiter, asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Ownership: account_id in body must match the authenticated child.
  if (!body.account_id || body.account_id !== req.accountId) {
    return res.status(403).json({ message: 'Forbidden: you can only record transactions on your own account' });
  }

  // Type whitelist — reject balance-affecting or unknown types.
  if (!CLIENT_SAFE_TYPES.includes(body.type)) {
    return res.status(400).json({
      message: `Transaction type '${body.type}' is not allowed here. Use the appropriate banking flow instead.`,
    });
  }

  // Strip client-supplied running balances; the store recomputes them from the actual account balance.
  const { balance_before, balance_after, ...safeBody } = body;

  const tx = await store.addTransaction(safeBody);
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
