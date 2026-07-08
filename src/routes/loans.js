const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');
const { calculateLoanSummary } = require('../services/interest');
const gl = require('../services/gl');
const { requireConsent } = require('../middleware/auth');

const router = express.Router();

// ── Loan Products ──

router.get('/loan-products', asyncHandler(async (req, res) => {
  const products = await store.getLoanProducts();
  res.json(products);
}));

router.get('/loan-products/:id', asyncHandler(async (req, res) => {
  const product = await store.getLoanProduct(req.params.id);
  if (!product) return res.status(404).json({ message: 'Loan product not found' });
  res.json(product);
}));

// ── Savings Products ──

router.get('/savings-products', asyncHandler(async (req, res) => {
  const products = await store.getSavingsProducts();
  res.json(products);
}));

// ── Preview loan calculation ──

router.post('/loans/preview',
  body('principal').isFloat({ min: 1 }),
  body('interest_rate').isFloat({ min: 0 }),
  body('interest_type').isIn(['flat', 'diminishing']),
  body('term_months').isInt({ min: 1 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { principal, interest_rate, interest_type, term_months } = req.body;
    const summary = calculateLoanSummary(principal, interest_rate, term_months, interest_type);
    res.json(summary);
  }
);

// ── Loans CRUD ──

router.get('/loans',
  query('account_id').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loans = await store.getLoans(req.query.account_id);
    res.json(loans);
  })
);

router.get('/loans/:loanId',
  param('loanId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loan = await store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    res.json(loan);
  })
);

router.post('/loans/apply',
  requireConsent,
  body('account_id').isString().notEmpty().trim(),
  body('product_id').optional().isString(),
  body('principal').isFloat({ min: 1 }),
  body('interest_rate').isFloat({ min: 0 }),
  body('interest_type').isIn(['flat', 'diminishing']),
  body('term_months').isInt({ min: 1 }),
  body('purpose').optional().isString().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, product_id, principal, interest_rate, interest_type, term_months, purpose } = req.body;

    const account = await store.getAccount(account_id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    if (product_id) {
      const product = await store.getLoanProduct(product_id);
      if (!product) return res.status(400).json({ message: 'Loan product not found' });
      if (!product.is_active) return res.status(400).json({ message: 'Loan product is not active' });
      if (Number(principal) < Number(product.min_amount)) {
        return res.status(400).json({ message: `Minimum loan amount is PHP ${Number(product.min_amount).toFixed(2)}` });
      }
      if (Number(product.max_amount) > 0 && Number(principal) > Number(product.max_amount)) {
        return res.status(400).json({ message: `Maximum loan amount is PHP ${Number(product.max_amount).toFixed(2)}` });
      }
    }

    const existingLoans = await store.getLoans(account_id);
    const activeLoan = existingLoans.find(l => l.status === 'active' || l.status === 'approved');
    if (activeLoan) {
      return res.status(400).json({ message: 'You already have an active or approved loan. Settle it first before applying for a new one.' });
    }

    const summary = calculateLoanSummary(principal, interest_rate, term_months, interest_type);

    const loan = await store.createLoan({
      account_id,
      product_id: product_id || null,
      principal,
      interest_rate,
      interest_type,
      term_months,
      monthly_amortization: summary.monthlyAmortization,
      total_payable: summary.totalPayable,
      purpose: purpose || '',
    });

    res.status(201).json(loan);
  })
);

router.put('/loans/:loanId/approve',
  param('loanId').isString().notEmpty().trim(),
  body('approved_by').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loan = await store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status !== 'pending') return res.status(400).json({ message: 'Loan is not in pending status' });

    const updated = await store.updateLoan(req.params.loanId, {
      status: 'approved',
      approved_by: req.body.approved_by,
      approved_at: new Date().toISOString(),
    });
    res.json(updated);
  })
);

router.put('/loans/:loanId/reject',
  param('loanId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const loan = await store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status !== 'pending') return res.status(400).json({ message: 'Loan is not in pending status' });

    const updated = await store.updateLoan(req.params.loanId, { status: 'rejected' });
    res.json(updated);
  })
);

router.put('/loans/:loanId/disburse',
  param('loanId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doDisburse = async (tx) => {
      const loan = await store.getLoan(req.params.loanId, tx);
      if (!loan) throw new Error('Loan not found');
      if (loan.status !== 'approved') throw new Error('Loan must be approved before disbursement');

      const account = await store.getAccount(loan.account_id, tx);
      const newBalance = Math.round((Number(account.actual_balance) + Number(loan.principal)) * 100) / 100;
      await store.updateAccount(loan.account_id, {
        actual_balance: newBalance,
        unallocated_balance: Math.round((Number(account.unallocated_balance) + Number(loan.principal)) * 100) / 100,
      }, tx);

      const txRecord = await store.addTransaction({
        account_id: loan.account_id,
        type: 'loan_disbursement',
        amount: loan.principal,
        description: `Loan disbursement: ${loan.purpose || 'Loan'}`,
        reference_type: 'loan',
        reference_id: loan.loan_id,
        balance_before: account.actual_balance,
        balance_after: newBalance,
      }, tx);

      // Post double-entry GL: Debit Loans Receivable, Credit Cash
      try {
        await gl.postDoubleEntry(txRecord.transaction_id, [
          { account_code: '1100', debit: Number(loan.principal), description: `Loan disbursement: ${loan.purpose || 'Loan'} — ${account.child_name}` },
          { account_code: '1000', credit: Number(loan.principal), description: `Loan disbursement: ${loan.purpose || 'Loan'} — ${account.child_name}` },
        ], { postedBy: req.body.approved_by || 'system', referenceType: 'loan_disbursement', referenceNumber: txRecord.transaction_id, tx });
      } catch (glErr) {
        console.error('[Loans] GL post for disbursement failed:', glErr.message);
      }

      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + Number(loan.term_months));
      return store.updateLoan(req.params.loanId, {
        status: 'active',
        disbursed_at: new Date().toISOString(),
        due_date: dueDate.toISOString().slice(0, 10),
      }, tx);
    };

    try {
      const result = isPostgres ? await store.transaction(async (tx) => doDisburse(tx)) : await doDisburse();
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  })
);

router.post('/loans/:loanId/pay',
  param('loanId').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 0.01 }),
  body('account_id').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doPay = async (tx) => {
      const loan = await store.getLoan(req.params.loanId, tx);
      if (!loan) throw new Error('Loan not found');
      if (loan.status !== 'active') throw new Error('Loan is not active');

      const { amount, account_id } = req.body;
      const account = await store.getAccount(account_id, tx);
      if (!account) throw new Error('Account not found');
      if (Number(account.actual_balance) < amount) throw new Error('Insufficient balance');

      const interestService = require('../services/interest');
      const schedule = interestService.generateAmortizationSchedule(
        loan.principal, loan.interest_rate, loan.term_months, loan.interest_type
      );
      const existingPayments = await store.getLoanPayments(req.params.loanId, tx);
      const paymentNum = existingPayments.length + 1;
      const scheduleEntry = schedule[paymentNum - 1] || schedule[schedule.length - 1];

      const interestPortion = Math.min(scheduleEntry.interestPortion, amount);
      const principalPortion = amount - interestPortion;
      const newAmountPaid = Math.round((Number(loan.amount_paid) + Number(amount)) * 100) / 100;
      const newRemainingBalance = Math.max(0, Math.round((Number(loan.remaining_balance) - Number(amount)) * 100) / 100);

      const newBalance = Math.round((Number(account.actual_balance) - Number(amount)) * 100) / 100;
      await store.updateAccount(account_id, {
        actual_balance: newBalance,
        unallocated_balance: Math.round((Number(account.unallocated_balance) - Number(amount)) * 100) / 100,
      }, tx);

      await store.addLoanPayment({
        loan_id: loan.loan_id,
        amount,
        principal_paid: principalPortion,
        interest_paid: interestPortion,
        balance_before: loan.remaining_balance,
        balance_after: newRemainingBalance,
        due_date: null,
      }, tx);

      const txRecord = await store.addTransaction({
        account_id,
        type: 'loan_payment',
        amount,
        description: `Loan payment for ${loan.purpose || 'Loan'}`,
        reference_type: 'loan',
        reference_id: loan.loan_id,
        balance_before: account.actual_balance,
        balance_after: newBalance,
      }, tx);

      // Post double-entry GL: Debit Cash, Credit Loans Receivable (principal) + Interest Income (interest)
      try {
        await gl.postDoubleEntry(txRecord.transaction_id, [
          { account_code: '1000', debit: Number(amount), description: `Loan payment: ${loan.purpose || 'Loan'} — ${account.child_name}` },
          { account_code: '1100', credit: Number(principalPortion), description: `Loan principal payment: ${loan.purpose || 'Loan'} — ${account.child_name}` },
          { account_code: '4000', credit: Number(interestPortion), description: `Loan interest payment: ${loan.purpose || 'Loan'} — ${account.child_name}` },
        ], { postedBy: 'system', referenceType: 'loan_payment', referenceNumber: txRecord.transaction_id, tx });
      } catch (glErr) {
        console.error('[Loans] GL post for payment failed:', glErr.message);
      }

      const newStatus = newRemainingBalance <= 0 ? 'paid' : 'active';
      return store.updateLoan(req.params.loanId, {
        amount_paid: newAmountPaid,
        remaining_balance: newRemainingBalance,
        status: newStatus,
      }, tx);
    };

    try {
      const updatedLoan = isPostgres ? await store.transaction(async (tx) => doPay(tx)) : await doPay();
      const payments = await store.getLoanPayments(req.params.loanId);
      res.json({ loan: updatedLoan, payments });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  })
);

router.get('/loans/:loanId/payments',
  param('loanId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const payments = await store.getLoanPayments(req.params.loanId);
    res.json(payments);
  })
);

// ── Account Summary ──

router.get('/accounts/:accountId/summary',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const summary = await store.getAccountSummary(req.params.accountId);
    if (!summary) return res.status(404).json({ message: 'Account not found' });
    res.json(summary);
  })
);

module.exports = router;
