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
    const maintainingBalance = Number(account.maintaining_balance || 0);
    if (Number(account.actual_balance) - Number(amount) < maintainingBalance) {
      return res.status(400).json({ message: `Cannot withdraw below maintaining balance of ₱${maintainingBalance.toFixed(2)}` });
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

// ── Transaction Void / Reversal ──

const VOIDABLE_TYPES = ['deposit', 'withdrawal', 'loan_payment', 'interest_credit', 'auto_save', 'fee', 'penalty'];

router.post('/transactions/:txId/void',
  param('txId').isString().notEmpty().trim(),
  body('reason').isString().isLength({ min: 5 }).trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const txId = req.params.txId;
    const { reason } = req.body;

    // Fetch original transaction
    const txRows = await store.query('SELECT * FROM transactions WHERE transaction_id = $1', [txId]);
    const tx = txRows.rows[0];
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    // Validate not already voided
    if (tx.voided_at) return res.status(400).json({ message: 'Transaction already voided' });

    // Validate voidable type
    if (!VOIDABLE_TYPES.includes(tx.type)) {
      return res.status(400).json({ message: 'This transaction type cannot be voided' });
    }

    // Check age limit (30 days)
    const txDate = new Date(tx.created_at);
    const daysSince = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) return res.status(400).json({ message: 'Cannot void transactions older than 30 days' });

    // Fetch account
    const accountRows = await store.query('SELECT * FROM accounts WHERE account_id = $1', [tx.account_id]);
    const account = accountRows.rows[0];
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const val = Number(tx.amount);
    const now = new Date().toISOString();
    const voidDesc = 'VOID: ' + (tx.description || '') + ' — ' + reason;

    // Determine reversal effect on balance
    let reversedBalance = Number(account.actual_balance);
    if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
      reversedBalance = Math.round((reversedBalance - val) * 100) / 100;
    } else if (['withdrawal', 'loan_payment', 'fee', 'auto_save'].includes(tx.type)) {
      reversedBalance = Math.round((reversedBalance + val) * 100) / 100;
    }
    if (reversedBalance < 0) return res.status(400).json({ message: 'Void would cause negative balance' });

    // ── Post reversing GL entries ──
    const gl = require('../services/gl');
    const glTxId = uuidv4();
    if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
      await gl.postDoubleEntry(glTxId, [
        { account_code: '2000', debit: val, description: 'VOID reversal: ' + voidDesc },
        { account_code: '1000', credit: val, description: 'VOID reversal: ' + voidDesc },
      ], { postedBy: 'api', referenceType: 'void' });
    } else if (['withdrawal', 'fee', 'auto_save'].includes(tx.type)) {
      await gl.postDoubleEntry(glTxId, [
        { account_code: '1000', debit: val, description: 'VOID reversal: ' + voidDesc },
        { account_code: '2000', credit: val, description: 'VOID reversal: ' + voidDesc },
      ], { postedBy: 'api', referenceType: 'void' });
    } else if (tx.type === 'loan_payment') {
      const loanPayments = await store.query('SELECT * FROM loan_payments WHERE transaction_id = $1 ORDER BY created_at DESC LIMIT 1', [txId]);
      const lp = loanPayments.rows[0];
      const principalPortion = lp ? Number(lp.principal_paid) : val;
      const interestPortion = lp ? Number(lp.interest_paid) : 0;
      const entries = [
        { account_code: '1100', debit: principalPortion, description: 'VOID reversal: principal' },
        { account_code: '1000', credit: val, description: 'VOID reversal: ' + voidDesc },
      ];
      if (interestPortion > 0) {
        entries.push({ account_code: '4000', debit: interestPortion, description: 'VOID reversal: interest income' });
      }
      await gl.postDoubleEntry(glTxId, entries, { postedBy: 'api', referenceType: 'void' });

      // Restore the loan balance
      if (tx.reference_id) {
        const loanRows = await store.query('SELECT * FROM loans WHERE loan_id = $1', [tx.reference_id]);
        const loan = loanRows.rows[0];
        if (loan) {
          const restoredAmountPaid = Math.max(0, Math.round((Number(loan.amount_paid) - val) * 100) / 100);
          const restoredRemaining = Math.round((Number(loan.remaining_balance) + val) * 100) / 100;
          await store.query("UPDATE loans SET amount_paid = $1, remaining_balance = $2, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE loan_id = $3",
            [restoredAmountPaid, restoredRemaining, loan.loan_id]);
        }
      }
    }

    // ── Update account balance ──
    if (tx.type !== 'loan_payment') {
      if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
        const newUnallocated = Math.max(0, Number(account.unallocated_balance) - val);
        await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3",
          [reversedBalance, newUnallocated, tx.account_id]);
      } else {
        const newUnallocated = Number(account.unallocated_balance) + val;
        await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3",
          [reversedBalance, newUnallocated, tx.account_id]);
      }
    }

    // ── Create reversal transaction ──
    const revResult = await store.addTransaction({
      account_id: tx.account_id,
      type: 'void',
      amount: val,
      description: voidDesc,
      reference_type: 'void',
      reference_id: txId,
      balance_before: Number(account.actual_balance),
      balance_after: reversedBalance,
    });
    const revTxId = revResult?.transaction_id || '';
    await store.query('UPDATE gl_entries SET transaction_id = $1 WHERE entry_id = $2', [revTxId, glTxId]).catch(() => {});

    // ── Mark original as voided ──
    await store.query(
      "UPDATE transactions SET voided_by=$1, void_reason=$2, voided_at=$3 WHERE transaction_id=$4",
      ['api', reason, now, txId]
    );

    // ── Audit log ──
    const audit = require('../services/audit');
    await audit.log(req, 'TRANSACTION_VOID', 'transaction', txId, {
      amount: val, reason, reversalTxId: revTxId, originalType: tx.type,
      reversedBalance, voidedBy: 'api'
    });

    res.json({
      message: 'Transaction voided successfully',
      reversal_transaction_id: revTxId,
      reversed_balance: reversedBalance,
    });
  })
);

module.exports = router;
