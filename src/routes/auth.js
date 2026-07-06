const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'registration');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const regUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .jpg, .jpeg, .png, .gif, and .pdf files are allowed'));
    }
    cb(null, true);
  },
});

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
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, account.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { accountId: account.account_id },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({
    token,
    passwordChanged: account.password_changed === 1,
    account: {
      account_id: account.account_id,
      child_name: account.child_name,
      last_name: account.last_name || '',
      first_name: account.first_name || '',
      middle_name: account.middle_name || '',
      birthday: account.birthday || '',
      age: account.age || 0,
      gender: account.gender || '',
      savings_schedule: account.savings_schedule || '',
      photo_2x2_url: account.photo_2x2_url || '',
      birth_cert_url: account.birth_cert_url || '',
      id_photo_url: account.id_photo_url || '',
      kyc_status: account.kyc_status || '',
      selfie_url: account.selfie_url || '',
      actual_balance: Number(account.actual_balance),
      unallocated_balance: Number(account.unallocated_balance),
      current_xp: Number(account.current_xp),
      member_id: account.member_id,
      savings_product_id: account.savings_product_id,
      maintaining_balance: Number(account.maintaining_balance || 0),
      regular_savings_number: account.regular_savings_number,
    },
  });
}));

router.post('/register', regUpload.fields([
  { name: 'photo_2x2', maxCount: 1 },
  { name: 'birth_cert', maxCount: 1 },
  { name: 'id_photo', maxCount: 1 },
]), asyncHandler(async (req, res) => {
  const {
    lastName, firstName, middleName,
    birthday, gender,
    password, parentPhone,
    savingsSchedule,
  } = req.body;

  if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
    return res.status(400).json({ message: 'lastName is required' });
  }
  if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
    return res.status(400).json({ message: 'firstName is required' });
  }
  if (!birthday || typeof birthday !== 'string' || birthday.trim().length === 0) {
    return res.status(400).json({ message: 'birthday is required' });
  }
  if (!gender || typeof gender !== 'string' || gender.trim().length === 0) {
    return res.status(400).json({ message: 'gender is required' });
  }
  if (!savingsSchedule || typeof savingsSchedule !== 'string' || savingsSchedule.trim().length === 0) {
    return res.status(400).json({ message: 'savingsSchedule is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'password is required (min 8 characters)' });
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ message: 'password must contain uppercase, lowercase, and a digit' });
  }

  const ulast = lastName.trim().toUpperCase();
  const ufirst = firstName.trim().toUpperCase();
  const umid = middleName ? middleName.trim().toUpperCase() : '';
  const displayName = umid ? `${ufirst} ${umid[0]}. ${ulast}` : `${ufirst} ${ulast}`;

  const existing = await store.getAccountByName(displayName);
  if (existing) {
    // Generic message prevents username/account enumeration
    return res.status(409).json({ message: 'An account with this information already exists. Please login or use different details.' });
  }

  const files = req.files || {};
  const photo2x2Url = files.photo_2x2 ? '/uploads/registration/' + files.photo_2x2[0].filename : '';
  const birthCertUrl = files.birth_cert ? '/uploads/registration/' + files.birth_cert[0].filename : '';
  const idPhotoUrl = files.id_photo ? '/uploads/registration/' + files.id_photo[0].filename : '';

  // Get default maintaining balance from settings
  const defaultMaintaining = await store.getSetting('default_maintaining_balance');
  const maintainingBalance = parseFloat(defaultMaintaining) || 100;

  const account = await store.createAccount({
    child_name: displayName,
    last_name: ulast,
    first_name: ufirst,
    middle_name: umid,
    age: 0, // computed from birthday by store
    gender: gender || '',
    parent_phone: parentPhone || '',
    birthday: birthday || '',
    savings_schedule: savingsSchedule || '',
    photo_2x2_url: photo2x2Url,
    birth_cert_url: birthCertUrl,
    id_photo_url: idPhotoUrl,
    password: bcrypt.hashSync(password, 10),
    savings_product_id: 'sp_regular',
    maintaining_balance: maintainingBalance,
  });
  const maxResult = await store.query("SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts");
  const maxMember = parseInt(maxResult.rows[0]?.m || '0', 10);
  const newMemberId = String(maxMember + 1).padStart(6, '0');
  // Generate regular savings account number
  const accountResult = await store.query("SELECT branch_id FROM accounts WHERE account_id = $1", [account.account_id]);
  const branchCode = accountResult.rows[0]?.branch_id || '01';
  let savingsNumber;
  if (store.generateSavingsAccountNumber) {
    savingsNumber = await store.generateSavingsAccountNumber(branchCode);
  }
  await store.query('UPDATE accounts SET member_id = $1, password_changed = 1, savings_product_id = $2, maintaining_balance = $3, regular_savings_number = $4 WHERE account_id = $5',
    [newMemberId, 'sp_regular', maintainingBalance, savingsNumber || null, account.account_id]);
  account.member_id = newMemberId;
  account.savings_product_id = 'sp_regular';
  account.maintaining_balance = maintainingBalance;
  account.regular_savings_number = savingsNumber;

  const token = jwt.sign(
    { accountId: account.account_id, childName: account.child_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.status(201).json({
    token,
    passwordChanged: true,
    account: {
      account_id: account.account_id,
      member_id: account.member_id,
      child_name: account.child_name,
      last_name: account.last_name,
      first_name: account.first_name,
      middle_name: account.middle_name,
      birthday: account.birthday,
      age: account.age,
      gender: account.gender,
      savings_schedule: account.savings_schedule,
      photo_2x2_url: account.photo_2x2_url,
      birth_cert_url: account.birth_cert_url,
      id_photo_url: account.id_photo_url,
      kyc_status: account.kyc_status || '',
      selfie_url: account.selfie_url || '',
      actual_balance: account.actual_balance,
      unallocated_balance: account.unallocated_balance,
      current_xp: account.current_xp,
      savings_product_id: account.savings_product_id,
      maintaining_balance: account.maintaining_balance,
      regular_savings_number: account.regular_savings_number,
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
    if (!oldPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'oldPassword and newPassword (min 8 chars) are required' });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ message: 'newPassword must contain uppercase, lowercase, and a digit' });
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
