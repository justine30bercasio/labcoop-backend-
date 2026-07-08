const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '24h';

// ── Upload dirs ──
const PARENT_PHOTO_DIR = path.join(__dirname, '..', 'uploads', 'parents');
if (!fs.existsSync(PARENT_PHOTO_DIR)) fs.mkdirSync(PARENT_PHOTO_DIR, { recursive: true });

const parentPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PARENT_PHOTO_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `parent_${uuidv4().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files allowed'));
    cb(null, true);
  },
});

const pinLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const ID_TYPES = ['Passport', "Driver's License", "National ID", "UMID", "SSS ID", "GSIS ID", "PRC ID", "Postal ID", "Voter's ID", "Barangay ID", "School ID", "Company ID", "Other"];

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

// ── Parent Registration (with optional photo upload) ──
router.post('/register', parentPhotoUpload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'idPhoto', maxCount: 1 },
]), asyncHandler(async (req, res) => {
  const { email, pin, displayName, phone, idType, idNumber } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email is required' });
  }
  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ message: 'PIN must be exactly 6 digits' });
  }
  if (!idType) {
    return res.status(400).json({ message: 'ID type is required' });
  }
  if (!idNumber || !/^[a-zA-Z0-9\- ]{4,}$/.test(idNumber)) {
    return res.status(400).json({ message: 'Valid ID number is required' });
  }
  const existing = await store.query('SELECT * FROM parents WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ message: 'Email already registered. Please login.' });
  }
  const parentId = uuidv4();
  const pinHash = bcrypt.hashSync(pin, 10);
  const photoUrl = req.files?.photo?.[0] ? '/uploads/parents/' + req.files.photo[0].filename : '';
  const idPhotoUrl = req.files?.idPhoto?.[0] ? '/uploads/parents/' + req.files.idPhoto[0].filename : '';
  await store.query(
    `INSERT INTO parents (parent_id, email, pin_hash, display_name, phone, photo_url, id_type, id_number, id_photo_url, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)`,
    [parentId, email.toLowerCase().trim(), pinHash, displayName || 'Parent', phone || '',
     photoUrl, idType, idNumber, idPhotoUrl, new Date().toISOString()]
  );
  res.status(201).json({
    message: 'Registration submitted! An admin will review and approve your account.',
    status: 'pending',
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
  if (parent.status === 'pending') {
    return res.status(403).json({ message: 'Your registration is pending admin approval.', status: 'pending' });
  }
  if (parent.status === 'rejected') {
    return res.status(403).json({ message: 'Your registration was rejected. Contact support.', status: 'rejected' });
  }
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
      photo_url: parent.photo_url || '',
      status: parent.status,
    },
  });
}));

// ── Check registration status (no auth needed) ──
router.post('/status', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const result = await store.query('SELECT parent_id, email, display_name, status, created_at FROM parents WHERE email = $1', [email.toLowerCase().trim()]);
  if (result.rows.length === 0) return res.json({ registered: false });
  const p = result.rows[0];
  res.json({ registered: true, status: p.status, email: p.email, display_name: p.display_name });
}));

// ── Upload parent photo (update after registration) ──
router.post('/upload-photo', parentAuth, parentPhotoUpload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = '/uploads/parents/' + req.file.filename;
  await store.query('UPDATE parents SET photo_url = $1 WHERE parent_id = $2', [url, req.parentId]);
  res.json({ photo_url: url });
}));

// ── Upload ID photo (update after registration) ──
router.post('/upload-id-photo', parentAuth, parentPhotoUpload.single('idPhoto'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = '/uploads/parents/' + req.file.filename;
  await store.query('UPDATE parents SET id_photo_url = $1 WHERE parent_id = $2', [url, req.parentId]);
  res.json({ id_photo_url: url });
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
  const result = await store.query(
    "SELECT * FROM accounts WHERE link_code = $1 AND link_code_expires_at > $2 AND link_code_expires_at != ''",
    [code, now]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Invalid or expired code. Ask your child to generate a new code in their app Settings → Link Parent.' });
  }
  const child = result.rows[0];
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
  const withdrawals = await store.query(
    `SELECT w.*, a.child_name, a.member_id
     FROM withdrawal_requests w
     JOIN accounts a ON a.account_id = w.account_id
     WHERE w.account_id IN (${placeholders}) AND w.status = 'pending'
     ORDER BY w.created_at DESC`,
    ids
  );
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
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, wr.account_id, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'This child is not linked to your account' });
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
  const link = await store.query(
    'SELECT * FROM parent_child_links WHERE parent_id = $1 AND child_account_id = $2 AND status = $3',
    [req.parentId, childAccountId, 'active']
  );
  if (link.rows.length === 0) return res.status(403).json({ message: 'Child not linked to your account' });
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
  res.json({
    parent_id: p.parent_id, email: p.email, display_name: p.display_name,
    phone: p.phone || '', photo_url: p.photo_url || '',
    id_type: p.id_type || '', id_number: p.id_number || '',
    id_photo_url: p.id_photo_url || '', status: p.status,
  });
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

// ── Admin: List pending parent registrations ──
router.get('/admin/pending', authMiddleware, requireRole(3, 4), asyncHandler(async (req, res) => {
  const parents = await store.query(
    "SELECT * FROM parents WHERE status = 'pending' ORDER BY created_at DESC"
  );
  res.json(parents.rows);
}));

// ── Admin: List all parents (for management page) ──
router.get('/admin/all', authMiddleware, requireRole(2, 3, 4), asyncHandler(async (req, res) => {
  const q = req.query.q || '';
  let parents;
  if (q) {
    parents = await store.query(
      'SELECT * FROM parents WHERE email LIKE $1 OR display_name LIKE $1 OR id_number LIKE $1 ORDER BY created_at DESC',
      [`%${q}%`]
    );
  } else {
    parents = await store.query('SELECT * FROM parents ORDER BY created_at DESC');
  }
  res.json(parents.rows);
}));

// ── Admin: Approve parent registration ──
router.post('/admin/approve/:parentId', authMiddleware, requireRole(3, 4), asyncHandler(async (req, res) => {
  const result = await store.query('SELECT * FROM parents WHERE parent_id = $1', [req.params.parentId]);
  if (result.rows.length === 0) return res.status(404).json({ message: 'Parent not found' });
  const parent = result.rows[0];
  if (parent.status !== 'pending') return res.status(400).json({ message: 'Parent registration already processed' });
  await store.query("UPDATE parents SET status = 'approved' WHERE parent_id = $1", [req.params.parentId]);
  res.json({ message: `Parent "${parent.display_name || parent.email}" approved successfully` });
}));

// ── Admin: Reject parent registration ──
router.post('/admin/reject/:parentId', authMiddleware, requireRole(3, 4), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await store.query('SELECT * FROM parents WHERE parent_id = $1', [req.params.parentId]);
  if (result.rows.length === 0) return res.status(404).json({ message: 'Parent not found' });
  const parent = result.rows[0];
  if (parent.status !== 'pending') return res.status(400).json({ message: 'Parent registration already processed' });
  await store.query("UPDATE parents SET status = 'rejected', admin_notes = $1 WHERE parent_id = $2",
    [reason || 'Registration rejected', req.params.parentId]);
  res.json({ message: `Parent "${parent.display_name || parent.email}" rejected` });
}));

// ── Admin: Get ID types ──
router.get('/id-types', (_req, res) => {
  res.json(ID_TYPES);
});

module.exports = { router, parentAuth };
