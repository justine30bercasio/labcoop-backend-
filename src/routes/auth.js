const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { store, getDb } = require('../db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'labcoop-dev-secret';

router.get('/accounts', (req, res) => {
  const db = getDb();
  const accounts = db.prepare('SELECT account_id, member_id, child_name, created_at FROM accounts ORDER BY child_name ASC').all();
  res.json(accounts);
});

router.post('/login', (req, res) => {
  const { childName, accountId, memberId, password } = req.body;
  let account;
  try {
    if ((!childName || typeof childName !== 'string' || childName.trim().length === 0) &&
        (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) &&
        (!memberId || typeof memberId !== 'string' || memberId.trim().length === 0)) {
      return res.status(400).json({ message: 'childName, accountId, or memberId is required' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'password is required' });
    }

    const db = getDb();
    if (memberId && memberId.trim()) {
      const padded = memberId.trim().padStart(6, '0');
      account = db.prepare('SELECT * FROM accounts WHERE member_id = ?').get(padded);
      if (!account) console.warn(`Login failed: no account for member_id="${padded}"`);
    } else if (accountId && accountId.trim()) {
      account = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accountId.trim());
    } else {
      account = db.prepare('SELECT * FROM accounts WHERE child_name = ?').get(childName.trim());
    }
    if (!account) {
      const identifier = memberId || accountId || childName;
      return res.status(404).json({ message: `No account found for "${identifier}"` });
    }

    const valid = bcrypt.compareSync(password, account.password);
    if (!valid) {
      console.warn(`Login failed: wrong password for account="${account.child_name}" (member_id=${account.member_id})`);
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const token = jwt.sign(
      { accountId: account.account_id, childName: account.child_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const passwordChanged = account.password_changed === 1;

    res.json({
      token,
      passwordChanged,
      account: {
        account_id: account.account_id,
        child_name: account.child_name,
        actual_balance: account.actual_balance,
        unallocated_balance: account.unallocated_balance,
        current_xp: account.current_xp,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Internal server error during login' });
  }
});

router.post('/register', (req, res) => {
  const { childName, password, parentPhone } = req.body;
  if (!childName || typeof childName !== 'string' || childName.trim().length === 0) {
    return res.status(400).json({ message: 'childName is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ message: 'password is required (min 4 characters)' });
  }

  const existing = store.getAccountByName(childName.trim());
  if (existing) {
    return res.status(409).json({ message: `Account "${childName}" already exists. Please login.` });
  }

  const db2 = getDb();
  const account = store.createAccount({
    child_name: childName.trim(),
    parent_phone: parentPhone || '',
    password: bcrypt.hashSync(password, 10),
  });
  const maxMember = db2.prepare("SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts").get().m || 0;
  const newMemberId = String(maxMember + 1).padStart(6, '0');
  db2.prepare('UPDATE accounts SET member_id = ?, password_changed = 1 WHERE account_id = ?').run(newMemberId, account.account_id);
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
});

router.post('/change-password', (req, res) => {
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

    const db = getDb();
    const account = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(decoded.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const valid = bcrypt.compareSync(oldPassword, account.password);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE accounts SET password = ?, password_changed = 1 WHERE account_id = ?').run(hash, decoded.accountId);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

module.exports = router;
