const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { store } = require('../db');
const { calculateLoanSummary } = require('../services/interest');

const router = express.Router();

// ── Loan Products ──

router.get('/loan-products', (req, res) => {
  const products = store.getLoanProducts();
  res.json(products);
});

router.get('/loan-products/:id', (req, res) => {
  const product = store.getLoanProduct(req.params.id);
  if (!product) return res.status(404).json({ message: 'Loan product not found' });
  res.json(product);
});

// ── Savings Products ──

router.get('/savings-products', (req, res) => {
  const products = store.getSavingsProducts();
  res.json(products);
});

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
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loans = store.getLoans(req.query.account_id);
    res.json(loans);
  }
);

router.get('/loans/:loanId',
  param('loanId').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loan = store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    res.json(loan);
  }
);

router.post('/loans/apply',
  body('account_id').isString().notEmpty().trim(),
  body('product_id').optional().isString(),
  body('principal').isFloat({ min: 1 }),
  body('interest_rate').isFloat({ min: 0 }),
  body('interest_type').isIn(['flat', 'diminishing']),
  body('term_months').isInt({ min: 1 }),
  body('purpose').optional().isString().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_id, product_id, principal, interest_rate, interest_type, term_months, purpose } = req.body;

    const account = store.getAccount(account_id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Validate against product if provided
    if (product_id) {
      const product = store.getLoanProduct(product_id);
      if (!product) return res.status(400).json({ message: 'Loan product not found' });
      if (!product.is_active) return res.status(400).json({ message: 'Loan product is not active' });
      if (Number(principal) < Number(product.min_amount)) {
        return res.status(400).json({ message: `Minimum loan amount is PHP ${Number(product.min_amount).toFixed(2)}` });
      }
      if (Number(product.max_amount) > 0 && Number(principal) > Number(product.max_amount)) {
        return res.status(400).json({ message: `Maximum loan amount is PHP ${Number(product.max_amount).toFixed(2)}` });
      }
    }

    // Check for existing active loans
    const existingLoans = store.getLoans(account_id);
    const activeLoan = existingLoans.find(l => l.status === 'active' || l.status === 'approved');
    if (activeLoan) {
      return res.status(400).json({ message: 'You already have an active or approved loan. Settle it first before applying for a new one.' });
    }

    const summary = calculateLoanSummary(principal, interest_rate, term_months, interest_type);

    const loan = store.createLoan({
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
  }
);

router.put('/loans/:loanId/approve',
  param('loanId').isString().notEmpty().trim(),
  body('approved_by').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const loan = store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status !== 'pending') return res.status(400).json({ message: 'Loan is not in pending status' });

    const updated = store.updateLoan(req.params.loanId, {
      status: 'approved',
      approved_by: req.body.approved_by,
      approved_at: new Date().toISOString(),
    });
    res.json(updated);
  }
);

router.put('/loans/:loanId/reject',
  param('loanId').isString().notEmpty().trim(),
  (req, res) => {
    const loan = store.getLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status !== 'pending') return res.status(400).json({ message: 'Loan is not in pending status' });

    const updated = store.updateLoan(req.params.loanId, { status: 'rejected' });
    res.json(updated);
  }
);

router.put('/loans/:loanId/disburse',
  param('loanId').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const db = require('../db').getDb();
    const transaction = db.transaction(() => {
      const loan = store.getLoan(req.params.loanId);
      if (!loan) throw new Error('Loan not found');
      if (loan.status !== 'approved') throw new Error('Loan must be approved before disbursement');

      // Credit the account
      const account = store.getAccount(loan.account_id);
      const newBalance = Math.round((account.actual_balance + loan.principal) * 100) / 100;
      store.updateAccount(loan.account_id, {
        actual_balance: newBalance,
        unallocated_balance: Math.round((account.unallocated_balance + loan.principal) * 100) / 100,
      });

      // Record transaction
      store.addTransaction({
        account_id: loan.account_id,
        type: 'loan_disbursement',
        amount: loan.principal,
        description: `Loan disbursement: ${loan.purpose || 'Loan'}`,
        reference_type: 'loan',
        reference_id: loan.loan_id,
        balance_before: account.actual_balance,
        balance_after: newBalance,
      });

      // Update loan status
      return store.updateLoan(req.params.loanId, {
        status: 'active',
        disbursed_at: new Date().toISOString(),
      });
    });

    try {
      const result = transaction();
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
);

router.post('/loans/:loanId/pay',
  param('loanId').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 0.01 }),
  body('account_id').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const db = require('../db').getDb();
    const transaction = db.transaction(() => {
      const loan = store.getLoan(req.params.loanId);
      if (!loan) throw new Error('Loan not found');
      if (loan.status !== 'active') throw new Error('Loan is not active');

      const { amount, account_id } = req.body;
      const account = store.getAccount(account_id);
      if (!account) throw new Error('Account not found');
      if (account.actual_balance < amount) throw new Error('Insufficient balance');

      // Calculate interest portion for this payment
      const interestService = require('../services/interest');
      const schedule = interestService.generateAmortizationSchedule(
        loan.principal, loan.interest_rate, loan.term_months, loan.interest_type
      );
      const paymentNum = store.getLoanPayments(req.params.loanId).length + 1;
      const scheduleEntry = schedule[paymentNum - 1] || schedule[schedule.length - 1];

      const interestPortion = Math.min(scheduleEntry.interestPortion, amount);
      const principalPortion = amount - interestPortion;
      const newAmountPaid = Math.round((loan.amount_paid + amount) * 100) / 100;
      const newRemainingBalance = Math.max(0, Math.round((loan.remaining_balance - amount) * 100) / 100);

      // Debit the account
      const newBalance = Math.round((account.actual_balance - amount) * 100) / 100;
      store.updateAccount(account_id, {
        actual_balance: newBalance,
        unallocated_balance: Math.round((account.unallocated_balance - amount) * 100) / 100,
      });

      // Record loan payment
      store.addLoanPayment({
        loan_id: loan.loan_id,
        amount,
        principal_paid: principalPortion,
        interest_paid: interestPortion,
        balance_before: loan.remaining_balance,
        balance_after: newRemainingBalance,
        due_date: null,
      });

      // Record transaction
      store.addTransaction({
        account_id,
        type: 'loan_payment',
        amount,
        description: `Loan payment for ${loan.purpose || 'Loan'}`,
        reference_type: 'loan',
        reference_id: loan.loan_id,
        balance_before: account.actual_balance,
        balance_after: newBalance,
      });

      // Determine new status
      const newStatus = newRemainingBalance <= 0 ? 'paid' : 'active';

      return store.updateLoan(req.params.loanId, {
        amount_paid: newAmountPaid,
        remaining_balance: newRemainingBalance,
        status: newStatus,
      });
    });

    try {
      const updatedLoan = transaction();
      const payments = store.getLoanPayments(req.params.loanId);
      res.json({ loan: updatedLoan, payments });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
);

router.get('/loans/:loanId/payments',
  param('loanId').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const payments = store.getLoanPayments(req.params.loanId);
    res.json(payments);
  }
);

// ── Account Summary ──

router.get('/accounts/:accountId/summary',
  param('accountId').isString().notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const summary = store.getAccountSummary(req.params.accountId);
    if (!summary) return res.status(404).json({ message: 'Account not found' });
    res.json(summary);
  }
);

module.exports = router;
