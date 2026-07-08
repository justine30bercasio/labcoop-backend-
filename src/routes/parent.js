const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '24h';

const pinLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Parent Auth Middleware ──
function parentAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    if (!decoded.parentId) {
      return res.status(401).json({ message: 'Not a parent token' });
    }
    req.parentId = decoded.parentId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ── Register Parent ──
router.post('/register', asyncHandler(async (req, res) => {
  const { email, pin, displayName, phone } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email is required' });
  }
  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ message: 'PIN must be exactly 6 digits' });
  }
  const existing = await store.query('SELECT * FROM parents WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ message: 'Email already registered. Please login.' });
  }
  const parentId = uuidv4();
  const pinHash = bcrypt.hashSync(pin, 10);
  await store.query(
    `INSERT INTO parents (parent_id, email, pin_hash, display_name, phone, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [parentId, email.toLowerCase().trim(), pinHash, displayName || 'Parent', phone || '', new Date().toISOString()]
  );
  const token = jwt.sign({ parentId, role: 'parent' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  res.status(201).json({
    token,
    parent: { parent_id: parentId, email: email.toLowerCase().trim(), display_name: displayName || 'Parent' },
  });
}));

// ── Parent Login ──
router.post('/login', pinLoginLimiter, asyncHandler(async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) {
    return res.status(400).json({ message: 'Email and PIN are required' });
  }
  const result = await store.query('SELECT * FROM parents WHERE email = $1', [email.toLowerCase().trim()]);
  if (result.rows.length === 0) {
    return res.status(401).json({ message: 'Invalid email or PIN' });
  }
  const parent = result.rows[0];
  const valid = bcrypt.compareSync(pin, parent.pin_hash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid email or PIN' });
  }
  const token = jwt.sign({ parentId: parent.parent_id, role: 'parent' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  res.json({
    token,
    parent: {
      parent_id: parent.parent_id,
      email: parent.email,
      display_name: parent.display_name,
      phone: parent.phone || '',
    },
  });
}));

// ── Change Parent PIN ──
router.post('/change-pin', parentAuth, asyncHandler(async (req, res) => {
  const { oldPin, newPin } = req.body;
  if (!oldPin || !/^\d{6}$/.test(oldPin)) {
    return res.status(400).json({ message: 'Current PIN must be exactly 6 digits' });
  }
  if (!newPin || !/^\d{6}$/.test(newPin)) {
    return res.status(400).json({ message: 'New PIN must be exactly 6 digits' });
  }
  const result = await store.query('SELECT * FROM parents WHERE parent_id = $1', [req.parentId]);
  if (result.rows.length === 0) return res.status(404).json({ message: 'Parent not found' });
  const parent = result.rows[0];
  if (!bcrypt.compareSync(oldPin, parent.pin_hash)) {
    return res.status(401).json({ message: 'Current PIN is incorrect' });
  }
  await store.query('UPDATE parents SET pin_hash = $1 WHERE parent_id = $2', [bcrypt.hashSync(newPin, 10), req.parentId]);
  res.json({ message: 'PIN changed successfully' });
}));

// ── Link Child Account (via temporary code from child's app) ──
router.post('/link-child', parentAuth, asyncHandler(async (req, res) => {
  const { linkingCode } = req.body;
  if (!linkingCode || typeof linkingCode !== 'string' || !/^\d{6}$/.test(linkingCode.trim())) {
    return res.status(400).json({ message: 'A valid 6-digit linking code is required. Ask your child to generate one in their app settings.' });
  }
  const code = linkingCode.trim();
  const now = new Date().toISOString();
  // Find child with matching non-expired code
  const result = await store.query(
    "SELECT * FROM accounts WHERE link_code = $1 AND link_code_expires_at > $2 AND link_code_expires_at != ''",
    [code, now]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Invalid or expired code. Ask your child to generate a new code in their app Settings → Link Parent.' });
  }
  const child = result.rows[0];
  // Check if already linked
  const existingLink = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2',
    [req.parentId, child.account_id]
  );
  if (existingLink.rows.length > 0) {
    return res.status(409).json({ message: `Child "${child.child_name}" is already linked to your account` });
  }
  const linkId = uuidv4();
  await store.query(
    `INSERT INTO parent_child_links (link_id, parent_id, child_account_id, linking_code, status, created_at)
     VALUES ($1, $2, $3, $4, 'active', $5)`,
    [linkId, req.parentId, child.account_id, code, new Date().toISOString()]
  );
  // Clear the temporary code
  await store.query(
    "UPDATE accounts SET link_code = '', link_code_expires_at = '' WHERE account_id = $1",
    [child.account_id]
  );
  res.status(201).json({
    message: `Child "${child.child_name}" linked successfully!`,
    child: { account_id: child.account_id, child_name: child.child_name, member_id: child.member_id },
  });
}));

// ── Get Linked Children ──
router.get('/children', parentAuth, asyncHandler(async (req, res) => {
  const links = await store.query(
    `SELECT l.*, a.child_name, a.member_id, a.actual_balance, a.unallocated_balance, a.current_xp, a.kyc_status
     FROM parent_child_links l
     JOIN accounts a ON a.account_id = l.child_account_id
     WHERE l.parent_id = $1 AND l.status = 'active'`,
    [req.parentId]
  );
  res.json(links.rows.map(c => ({
    account_id: c.account_id,
    child_name: c.child_name,
    member_id: c.member_id,
    actual_balance: Number(c.actual_balance),
    unallocated_balance: Number(c.unallocated_balance),
    current_xp: Number(c.current_xp),
    kyc_status: c.kyc_status,
    linked_at: c.created_at,
  })));
}));

// ── Get Pending Approvals (withdrawals + loans) ──
router.get('/pending', parentAuth, asyncHandler(async (req, res) => {
  const childIds = await store.query(
    'SELECT child_account_id FROM parent_child_links WHERE parent_id = $1 AND status = $2',
    [req.parentId, 'active']
  );
  const ids = childIds.rows.map(r => r.child_account_id);
  if (ids.length === 0) return res.json({ withdrawals: [], loans: [] });
  const placeholders = ids.map((_, i) => '$' + (i + 1)).join(',');
  // Pending withdrawal requests
  const withdrawals = await store.query(
    `SELECT w.*, a.child_name, a.member_id
     FROM withdrawal_requests w
     JOIN accounts a ON a.account_id = w.account_id
     WHERE w.account_id IN (${placeholders}) AND w.status = 'pending'
     ORDER BY w.created_at DESC`,
    ids
  );
  // Pending loan applications
  const loans = await store.query(
    `SELECT l.*, a.child_name, a.member_id, lp.name as product_name
     FROM loans l
     JOIN accounts a ON a.account_id = l.account_id
     LEFT JOIN loan_products lp ON lp.id = l.product_id
     WHERE l.account_id IN (${placeholders}) AND l.status = 'pending'
     ORDER BY l.created_at DESC`,
    ids
  );
  res.json({
    withdrawals: withdrawals.rows.map(w => ({ ...w, amount: Number(w.amount) })),
    loans: loans.rows.map(l => ({ ...l, principal: Number(l.principal), amount: Number(l.principal) })),
  });
}));

// ── Approve Withdrawal Request (as parent) ──
router.post('/approve-withdrawal/:requestId', parentAuth, asyncHandler(async (req, res) => {
  const wrResult = await store.query('SELECT * FROM withdrawal_requests WHERE request_id = $1', [req.params.requestId]);
  if (wrResult.rows.length === 0) return res.status(404).json({ message: 'Withdrawal request not found' });
  const wr = wrResult.rows[0];
  if (wr.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });
  // Verify this parent owns the child
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, wr.account_id, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'This child is not linked to your account' });
  // Process the withdrawal (same logic as admin approval)
  const account = await store.getAccount(wr.account_id);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  const maintainingBalance = Number(account.maintaining_balance || 0);
  if (Number(account.actual_balance) - Number(wr.amount) < maintainingBalance) {
    await store.query('UPDATE withdrawal_requests SET status = $1 WHERE request_id = $2', ['rejected', req.params.requestId]);
    return res.status(400).json({ message: `Insufficient balance after maintaining ₱${maintainingBalance.toFixed(2)}` });
  }
  const newBalance = Math.round((Number(account.actual_balance) - Number(wr.amount)) * 100) / 100;
  const newUnallocated = Math.round((Number(account.unallocated_balance) - Number(wr.amount)) * 100) / 100;
  await store.query('UPDATE accounts SET actual_balance = $1, unallocated_balance = $2 WHERE account_id = $3',
    [newBalance, newUnallocated, wr.account_id]);
  await store.addTransaction({
    account_id: wr.account_id,
    type: 'withdrawal',
    amount: Number(wr.amount),
    description: 'Withdrawal (parent approved): ' + (wr.reason || ''),
  });
  await store.query('UPDATE withdrawal_requests SET status = $1 WHERE request_id = $2', ['approved', req.params.requestId]);
  res.json({ message: 'Withdrawal approved and processed', amount: Number(wr.amount) });
}));

// ── Reject Withdrawal Request ──
router.post('/reject-withdrawal/:requestId', parentAuth, asyncHandler(async (req, res) => {
  const wrResult = await store.query('SELECT * FROM withdrawal_requests WHERE request_id = $1', [req.params.requestId]);
  if (wrResult.rows.length === 0) return res.status(404).json({ message: 'Withdrawal request not found' });
  const wr = wrResult.rows[0];
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, wr.account_id, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'This child is not linked to your account' });
  await store.query('UPDATE withdrawal_requests SET status = $1 WHERE request_id = $2', ['rejected', req.params.requestId]);
  res.json({ message: 'Withdrawal request rejected' });
}));

// ── Approve Loan Application ──
router.post('/approve-loan/:loanId', parentAuth, asyncHandler(async (req, res) => {
  const loanResult = await store.query('SELECT * FROM loans WHERE loan_id = $1', [req.params.loanId]);
  if (loanResult.rows.length === 0) return res.status(404).json({ message: 'Loan not found' });
  const loan = loanResult.rows[0];
  if (loan.status !== 'pending') return res.status(400).json({ message: 'Loan already processed' });
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, loan.account_id, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'This child is not linked to your account' });
  // Mark as approved_by_parent — admin still needs to disburse
  await store.query('UPDATE loans SET status = $1 WHERE loan_id = $2', ['approved_by_parent', req.params.loanId]);
  res.json({ message: 'Loan pre-approved by parent. An admin will process disbursement.' });
}));

// ── Reject Loan Application ──
router.post('/reject-loan/:loanId', parentAuth, asyncHandler(async (req, res) => {
  const loanResult = await store.query('SELECT * FROM loans WHERE loan_id = $1', [req.params.loanId]);
  if (loanResult.rows.length === 0) return res.status(404).json({ message: 'Loan not found' });
  const loan = loanResult.rows[0];
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, loan.account_id, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'This child is not linked to your account' });
  await store.query('UPDATE loans SET status = $1 WHERE loan_id = $2', ['rejected_by_parent', req.params.loanId]);
  res.json({ message: 'Loan application rejected' });
}));

// ── Get Limits ──
router.get('/limits', parentAuth, asyncHandler(async (req, res) => {
  const limits = await store.query(
    'SELECT l.*, a.child_name FROM parent_limits l JOIN accounts a ON a.account_id = l.child_account_id WHERE l.parent_id = $1',
    [req.parentId]
  );
  res.json(limits.rows.map(l => ({
    ...l,
    max_daily_withdrawal: Number(l.max_daily_withdrawal),
    max_loan_amount: Number(l.max_loan_amount),
  })));
}));

// ── Save Limits ──
router.post('/limits', parentAuth, asyncHandler(async (req, res) => {
  const { childAccountId, maxDailyWithdrawal, maxLoanAmount, requireApprovalFor } = req.body;
  if (!childAccountId) return res.status(400).json({ message: 'childAccountId is required' });
  // Verify link
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, childAccountId, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'Child not linked to your account' });
  // Upsert
  const existing = await store.query(
    'SELECT * FROM parent_limits WHERE parent_id = $1 AND child_account_id = $2',
    [req.parentId, childAccountId]
  );
  if (existing.rows.length > 0) {
    await store.query(
      `UPDATE parent_limits SET max_daily_withdrawal = $1, max_loan_amount = $2, require_approval_for = $3
       WHERE parent_id = $4 AND child_account_id = $5`,
      [maxDailyWithdrawal || 0, maxLoanAmount || 0, requireApprovalFor || 'all', req.parentId, childAccountId]
    );
  } else {
    await store.query(
      `INSERT INTO parent_limits (limit_id, parent_id, child_account_id, max_daily_withdrawal, max_loan_amount, require_approval_for)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), req.parentId, childAccountId, maxDailyWithdrawal || 0, maxLoanAmount || 0, requireApprovalFor || 'all']
    );
  }
  res.json({ message: 'Limits saved' });
}));

// ── Get Parent Info ──
router.get('/me', parentAuth, asyncHandler(async (req, res) => {
  const result = await store.query('SELECT * FROM parents WHERE parent_id = $1', [req.parentId]);
  if (result.rows.length === 0) return res.status(404).json({ message: 'Parent not found' });
  const p = result.rows[0];
  res.json({ parent_id: p.parent_id, email: p.email, display_name: p.display_name, phone: p.phone || '' });
}));

// ── Update Parent Profile ──
router.post('/me', parentAuth, asyncHandler(async (req, res) => {
  const { displayName, phone } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;
  if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); values.push(displayName); }
  if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone); }
  if (updates.length === 0) return res.json({ message: 'Nothing to update' });
  values.push(req.parentId);
  await store.query(`UPDATE parents SET ${updates.join(', ')} WHERE parent_id = $${idx}`, values);
  res.json({ message: 'Profile updated' });
}));

module.exports = { router, parentAuth };
