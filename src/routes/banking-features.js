const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { generateAmortizationSchedule } = require('../services/interest');

const router = express.Router();

// ── Loan Amortization Schedule ──

router.get('/loans/:loanId/schedule',
  param('loanId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loan = await store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    const schedule = generateAmortizationSchedule(
      loan.principal, loan.interest_rate, loan.term_months, loan.interest_type
    );
    const payments = await store.getLoanPayments(req.params.loanId);

    res.json({
      loan_id: loan.loan_id,
      principal: loan.principal,
      interest_rate: loan.interest_rate,
      interest_type: loan.interest_type,
      term_months: loan.term_months,
      monthly_amortization: loan.monthly_amortization,
      total_payable: loan.total_payable,
      amount_paid: loan.amount_paid,
      remaining_balance: loan.remaining_balance,
      status: loan.status,
      schedule,
      payments_made: payments,
    });
  })
);

// ── Savings Account Application ──

router.post('/savings/apply',
  body('account_id').isString().notEmpty().trim(),
  body('product_id').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, product_id } = req.body;
    const account = await store.getAccount(account_id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const product = await store.getSavingsProduct(product_id);
    if (!product) return res.status(404).json({ message: 'Savings product not found' });

    // Check if already has a savings product or pending application
    if (account.savings_product_id) {
      return res.status(400).json({ message: 'Account already has a savings product assigned' });
    }
    const existingApps = await store.getSavingsApplications(account_id);
    if (existingApps.some(a => a.status === 'pending')) {
      return res.status(400).json({ message: 'You already have a pending application' });
    }

    const app = await store.createSavingsApplication({ account_id, product_id });
    res.status(201).json(app);
  })
);

router.get('/savings/applications/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const apps = await store.getSavingsApplications(req.params.accountId);
    res.json(apps);
  })
);

// ── Account Savings Info (linked product + interest) ──

router.get('/accounts/:accountId/savings',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const account = await store.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const interestSummary = await store.getInterestSummary(req.params.accountId);
    res.json(interestSummary);
  })
);

// ── Standing Orders (Auto-Save) ──

router.get('/standing-orders/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const orders = await store.getStandingOrders(req.params.accountId);
    res.json(orders);
  })
);

router.post('/standing-orders',
  body('account_id').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 1 }),
  body('frequency').isIn(['daily', 'weekly', 'monthly']),
  body('target_goal_id').optional().isString(),
  body('description').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, amount, frequency, target_goal_id, description } = req.body;
    const account = await store.getAccount(account_id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Calculate next run date
    const nextRun = new Date();
    switch (frequency) {
      case 'daily': nextRun.setDate(nextRun.getDate() + 1); break;
      case 'weekly': nextRun.setDate(nextRun.getDate() + 7); break;
      case 'monthly': nextRun.setMonth(nextRun.getMonth() + 1); break;
    }

    const order = await store.createStandingOrder({
      account_id,
      type: 'transfer',
      target_goal_id: target_goal_id || null,
      amount: Number(amount),
      frequency,
      next_run: nextRun.toISOString(),
      description: description || `Auto-save ${frequency}`,
    });
    res.status(201).json(order);
  })
);

router.put('/standing-orders/:orderId',
  param('orderId').isString().notEmpty().trim(),
  body('amount').optional().isFloat({ min: 1 }),
  body('frequency').optional().isIn(['daily', 'weekly', 'monthly']),
  body('is_active').optional().isIn(['0', '1']),
  body('description').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const existing = await store.getStandingOrder(req.params.orderId);
    if (!existing) return res.status(404).json({ message: 'Standing order not found' });

    const updates = {};
    if (req.body.amount) updates.amount = Number(req.body.amount);
    if (req.body.frequency) {
      updates.frequency = req.body.frequency;
      const nextRun = new Date();
      switch (req.body.frequency) {
        case 'daily': nextRun.setDate(nextRun.getDate() + 1); break;
        case 'weekly': nextRun.setDate(nextRun.getDate() + 7); break;
        case 'monthly': nextRun.setMonth(nextRun.getMonth() + 1); break;
      }
      updates.next_run = nextRun.toISOString();
    }
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active === '1' ? 1 : 0;
    if (req.body.description !== undefined) updates.description = req.body.description;

    const updated = await store.updateStandingOrder(req.params.orderId, updates);
    res.json(updated);
  })
);

router.delete('/standing-orders/:orderId',
  param('orderId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const existing = await store.getStandingOrder(req.params.orderId);
    if (!existing) return res.status(404).json({ message: 'Standing order not found' });

    await store.deleteStandingOrder(req.params.orderId);
    res.json({ message: 'Standing order deactivated' });
  })
);

// ── Withdrawal Requests ──

router.post('/withdrawals/request',
  body('account_id').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 1 }),
  body('reason').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, amount, reason } = req.body;
    const account = await store.getAccount(account_id);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (Number(account.actual_balance) < Number(amount)) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Check for existing pending withdrawal request
    const existing = await store.getWithdrawalRequests(account_id);
    if (existing.some(r => r.status === 'pending')) {
      return res.status(400).json({ message: 'You already have a pending withdrawal request. Wait for it to be resolved first.' });
    }

    const request = await store.createWithdrawalRequest({
      account_id,
      amount: Number(amount),
      reason: reason || '',
    });
    res.status(201).json(request);
  })
);

router.get('/withdrawals/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const requests = await store.getWithdrawalRequests(req.params.accountId);
    res.json(requests);
  })
);

// ── Account Statement (formatted) ──

router.get('/accounts/:accountId/statement',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const account = await store.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const transactions = await store.getTransactions(req.params.accountId, 100, 0);
    const goals = await store.getGoals(req.params.accountId);
    const loans = await store.getLoans(req.params.accountId);
    const interest = await store.getInterestSummary(req.params.accountId);

    res.json({
      account: {
        child_name: account.child_name,
        member_id: account.member_id,
        balance: account.actual_balance,
        unallocated: account.unallocated_balance,
        xp: account.current_xp,
        savings_product: interest?.savings_product?.name || null,
        interest_earned: interest?.interest_earned || 0,
      },
      transactions,
      goals: goals.map(g => ({
        title: g.title,
        target: g.target_amount,
        allocated: g.current_allocated,
        progress: g.target_amount > 0 ? Math.min(g.current_allocated / g.target_amount, 1) : 0,
        completed: !!g.is_completed,
      })),
      loans: loans.map(l => ({
        loan_id: l.loan_id,
        purpose: l.purpose,
        principal: l.principal,
        remaining: l.remaining_balance,
        status: l.status,
        monthly: l.monthly_amortization,
      })),
      generated_at: new Date().toISOString(),
    });
  })
);

// ── Interest Earned ──

router.get('/accounts/:accountId/interest',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const summary = await store.getInterestSummary(req.params.accountId);
    if (!summary) return res.status(404).json({ message: 'Account not found' });

    const result = await store.query(
      "SELECT * FROM transactions WHERE account_id = $1 AND type = 'interest' ORDER BY created_at DESC LIMIT 20",
      [req.params.accountId]
    );

    res.json({ ...summary, recent_interest: result.rows });
  })
);

// ── Transaction Receipt ──

router.get('/transactions/:txId/receipt',
  param('txId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const result = await store.query(
      'SELECT t.*, a.child_name, a.member_id FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id WHERE t.transaction_id = $1',
      [req.params.txId]
    );
    const tx = result.rows[0];
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    res.json({
      receipt_id: 'RCP-' + (tx.transaction_id || '').slice(0, 8).toUpperCase(),
      date: tx.created_at,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      child_name: tx.child_name,
      member_id: tx.member_id,
      balance_before: tx.balance_before,
      balance_after: tx.balance_after,
      reference_type: tx.reference_type,
      reference_id: tx.reference_id,
    });
  })
);

// ── Online Deposits (GCash / Digital Payments) ──

router.post('/online-deposits',
  body('account_id').isString().notEmpty().trim(),
  body('amount').isString().notEmpty().trim(),
  body('reference_number').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, amount, reference_number, sender_name } = req.body;
    const account = await store.getAccount(account_id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const deposit = await store.createOnlineDeposit({
      account_id,
      amount: Number(amount),
      reference_number,
      sender_name: sender_name || '',
    });
    res.status(201).json(deposit);
  })
);

router.get('/online-deposits/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const deposits = await store.getOnlineDeposits(req.params.accountId);
    res.json(deposits);
  })
);

module.exports = router;
