const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'labcoop-dev-secret';

router.get('/accounts', asyncHandler(async (req, res) => {
  const result = await store.query('SELECT account_id, member_id, child_name, created_at FROM accounts ORDER BY child_name ASC');
  res.json(result.rows || []);
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { childName, accountId, memberId, password } = req.body;
  if ((!childName || typeof childName !== 'string' || childName.trim().length === 0) &&
      (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) &&
      (!memberId || typeof memberId !== 'string' || memberId.trim().length === 0)) {
    return res.status(400).json({ message: 'childName, accountId, or memberId is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ message: 'password is required' });
  }

  let account;
  if (memberId && memberId.trim()) {
    const padded = memberId.trim().padStart(6, '0');
    const result = await store.query('SELECT * FROM accounts WHERE member_id = $1', [padded]);
    account = result.rows[0];
  } else if (accountId && accountId.trim()) {
    account = await store.getAccount(accountId.trim());
  } else {
    account = await store.getAccountByName(childName.trim());
  }

  if (!account) {
    return res.status(404).json({ message: `No account found` });
  }

  const valid = bcrypt.compareSync(password, account.password);
  if (!valid) {
    return res.status(401).json({ message: 'Incorrect password' });
  }

  const token = jwt.sign(
    { accountId: account.account_id, childName: account.child_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    passwordChanged: account.password_changed === 1,
    account: {
      account_id: account.account_id,
      child_name: account.child_name,
      actual_balance: account.actual_balance,
      unallocated_balance: account.unallocated_balance,
      current_xp: account.current_xp,
    },
  });
}));

router.post('/register', asyncHandler(async (req, res) => {
  const { childName, password, parentPhone } = req.body;
  if (!childName || typeof childName !== 'string' || childName.trim().length === 0) {
    return res.status(400).json({ message: 'childName is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ message: 'password is required (min 4 characters)' });
  }

  const existing = await store.getAccountByName(childName.trim());
  if (existing) {
    return res.status(409).json({ message: `Account "${childName}" already exists. Please login.` });
  }

  const account = await store.createAccount({
    child_name: childName.trim(),
    parent_phone: parentPhone || '',
    password: bcrypt.hashSync(password, 10),
  });
  const maxResult = await store.query("SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts");
  const maxMember = parseInt(maxResult.rows[0]?.m || '0', 10);
  const newMemberId = String(maxMember + 1).padStart(6, '0');
  await store.query('UPDATE accounts SET member_id = $1, password_changed = 1 WHERE account_id = $2', [newMemberId, account.account_id]);
  account.member_id = newMemberId;

  const token = jwt.sign(
    { accountId: account.account_id, childName: account.child_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    token,
    passwordChanged: true,
    account: {
      account_id: account.account_id,
      member_id: account.member_id,
      child_name: account.child_name,
      actual_balance: account.actual_balance,
      unallocated_balance: account.unallocated_balance,
      current_xp: account.current_xp,
    },
  });
}));

router.post('/change-password', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'oldPassword and newPassword (min 4 chars) are required' });
    }

    const account = await store.getAccount(decoded.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const valid = bcrypt.compareSync(oldPassword, account.password);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });

    const hash = bcrypt.hashSync(newPassword, 10);
    await store.query('UPDATE accounts SET password = $1, password_changed = 1 WHERE account_id = $2', [hash, decoded.accountId]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}));

module.exports = router;
