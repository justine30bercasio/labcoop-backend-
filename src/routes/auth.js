const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sgMail = require('@sendgrid/mail');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const fileStorage = require('../services/file-storage');
const otpStore = new Map();

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// Rate limiter for change-pin: 10 attempts per 15 minutes per account
const changePinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.accountId || 'global';
      }
    } catch (_) {}
    return 'global';
  },
  message: { message: 'Too many PIN change attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for PIN login: 10 attempts per minute per IP (brute force protection)
const pinLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const regUpload = multer({
  storage: multer.memoryStorage(),
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

router.post('/login', pinLoginLimiter, asyncHandler(async (req, res) => {
  const { childName, accountId, memberId, password, pin } = req.body;
  if ((!childName || typeof childName !== 'string' || childName.trim().length === 0) &&
      (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) &&
      (!memberId || typeof memberId !== 'string' || memberId.trim().length === 0)) {
    return res.status(400).json({ message: 'childName, accountId, or memberId is required' });
  }
  if (!pin && !password) {
    return res.status(400).json({ message: 'PIN (6 digits) or password is required' });
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

  // Account lockout check — 5 failed attempts locks for 15 minutes
  const LOCKOUT_THRESHOLD = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
  const failedAttempts = Number(account.failed_login_attempts) || 0;
  if (failedAttempts >= LOCKOUT_THRESHOLD && account.locked_until) {
    const lockedUntil = new Date(account.locked_until).getTime();
    if (lockedUntil > Date.now()) {
      const remainingMinutes = Math.ceil((lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        message: `Account temporarily locked. Try again in ${remainingMinutes} minute(s).`,
        locked: true,
        retryAfterMinutes: remainingMinutes,
      });
    }
    // Lockout period has expired — reset counter
    await store.query(
      'UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL WHERE account_id = $1',
      [account.account_id]
    );
    account.failed_login_attempts = 0;
    account.locked_until = null;
  }

  // Authenticate via PIN first (primary), fallback to password (legacy)
  let valid = false;
  if (pin) {
    if (account.pin_hash) {
      valid = bcrypt.compareSync(pin, account.pin_hash);
    }
  } else if (password) {
    valid = bcrypt.compareSync(password, account.password);
  }

  if (!valid) {
    // Increment failed attempts and optionally lock
    const newAttempts = failedAttempts + 1;
    if (newAttempts >= LOCKOUT_THRESHOLD) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await store.query(
        'UPDATE accounts SET failed_login_attempts = $1, locked_until = $2 WHERE account_id = $3',
        [newAttempts, lockedUntil, account.account_id]
      );
    } else {
      await store.query(
        'UPDATE accounts SET failed_login_attempts = $1 WHERE account_id = $2',
        [newAttempts, account.account_id]
      );
    }
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Successful login — always reset failed attempts
  await store.query(
    'UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL WHERE account_id = $1',
    [account.account_id]
  );

  const token = jwt.sign(
    { accountId: account.account_id },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Generate refresh token (7 days)
  const refreshTokenValue = crypto.randomBytes(48).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await store.saveRefreshToken(account.account_id, refreshTokenHash, refreshExpiresAt);

  res.json({
    token,
    refreshToken: refreshTokenValue,
    passwordChanged: account.password_changed ? true : false,
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
      profile_pic_url: account.profile_pic_url || '',
      actual_balance: Number(account.actual_balance),
      unallocated_balance: Number(account.unallocated_balance),
      current_xp: Number(account.current_xp),
      member_id: account.member_id,
      savings_product_id: account.savings_product_id,
      maintaining_balance: Number(account.maintaining_balance || 0),
      regular_savings_number: account.regular_savings_number,
      consent_status: account.consent_status || 'none',
      parent_email: account.parent_email || '',
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
    pin, parentPhone,
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
  // Validate PIN: exactly 6 digits
  if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ message: 'PIN must be exactly 6 digits (0-9)' });
  }

  // Validate parent email
  const parentEmail = (req.body.parentEmail || '').trim();
  if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return res.status(400).json({ message: 'A valid parent email address is required for parental consent' });
  }

  const ulast = lastName.trim().toUpperCase();
  const ufirst = firstName.trim().toUpperCase();
  const umid = middleName ? middleName.trim().toUpperCase() : '';
  const displayName = umid ? `${ufirst} ${umid[0]}. ${ulast}` : `${ufirst} ${ulast}`;

  const existing = await store.getAccountByName(displayName);
  if (existing) {
    // Generic message prevents username/account enumeration
    return res.status(409).json({ message: 'Unable to create account. Please try different information or contact support.' });
  }

  const files = req.files || {};
  const uploadField = async (field, prefix) => {
    if (!files[field]?.[0]) return '';
    const f = files[field][0];
    const ext = path.extname(f.originalname);
    const filename = field + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    await fileStorage.uploadFile(f.buffer, 'registration/' + filename, f.mimetype);
    return '/uploads/registration/' + filename;
  };
  const photo2x2Url = await uploadField('photo_2x2');
  const birthCertUrl = await uploadField('birth_cert');
  const idPhotoUrl = await uploadField('id_photo');

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
    parent_email: parentEmail,
    birthday: birthday || '',
    savings_schedule: savingsSchedule || '',
    photo_2x2_url: photo2x2Url,
    birth_cert_url: birthCertUrl,
    id_photo_url: idPhotoUrl,
    password: bcrypt.hashSync(pin, 10), // store PIN hash as password for backward compat
    pin_hash: bcrypt.hashSync(pin, 10),
    savings_product_id: 'sp_regular',
    maintaining_balance: maintainingBalance,
    consent_status: 'none',
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

  // Auto-trigger parental consent request via email
  try {
    const consentToken = crypto.randomBytes(32).toString('hex');
    await store.query(
      `INSERT INTO parental_consent (consent_id, account_id, parent_phone, parent_email, consent_token, status, ip_address, created_at)
       VALUES ($1, $2, '', $3, $4, 'pending', $5, $6)`,
      [crypto.randomUUID(), account.account_id, parentEmail, consentToken, req.ip, new Date().toISOString()]
    );
    await store.query(
      'UPDATE accounts SET consent_status = $1 WHERE account_id = $2',
      ['pending', account.account_id]
    );
    account.consent_status = 'pending';
    // Try to send consent email
    const consentLink = `https://labcoop-backend.onrender.com/api/parental-consent/approve?token=${consentToken}`;
    try {
      const sgMail = require('@sendgrid/mail');
      if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'labcoopcooperative@gmail.com';
        await sgMail.send({
          to: parentEmail,
          from: fromEmail,
          subject: `LabCoop: Parental Consent Request for ${displayName}`,
          html: `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#f0fdf4;border-radius:16px;overflow:hidden;border:1px solid #86efac;">
              <div style="background:#166534;padding:24px;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">🐷 LabCoop</h1>
                <p style="color:#bbf7d0;margin:4px 0 0;font-size:14px;">Children's Cooperative Savings</p>
              </div>
              <div style="padding:32px 24px;">
                <h2 style="color:#166534;margin:0 0 12px;font-size:20px;">Hello Parent of ${displayName}!</h2>
                <p style="color:#374151;line-height:1.6;margin:0 0 16px;">
                  Your child <strong>${displayName}</strong> has registered for a LabCoop savings account.
                  To activate their account, we need your consent.
                </p>
                <a href="${consentLink}" style="display:block;background:#16a34a;color:#fff;text-align:center;padding:16px 24px;border-radius:12px;text-decoration:none;font-size:18px;font-weight:600;margin:24px 0;">✅ Approve Consent</a>
                <p style="color:#64748b;font-size:13px;line-height:1.5;margin:16px 0 0;">
                  By clicking approve, you confirm you are the parent or legal guardian of ${displayName}.
                  You may revoke consent at any time.
                </p>
              </div>
            </div>`,
        });
        console.log(`[REGISTER] Consent email sent to ${parentEmail}`);
      } else {
        console.log(`[REGISTER] SENDGRID_API_KEY not set. Consent link: ${consentLink}`);
      }
    } catch (emailErr) {
      console.error('[REGISTER] Failed to send consent email:', emailErr.message);
    }
  } catch (consentErr) {
    console.error('[REGISTER] Failed to create consent request:', consentErr.message);
    // Non-fatal — account still created, admin can trigger consent manually
  }

  const token = jwt.sign(
    { accountId: account.account_id, childName: account.child_name },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Generate refresh token
  const refreshTokenValue = crypto.randomBytes(48).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await store.saveRefreshToken(account.account_id, refreshTokenHash, refreshExpiresAt);

  res.status(201).json({
    token,
    refreshToken: refreshTokenValue,
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
      coins: Number(account.coins) || 0,
      consent_status: 'pending',
      parent_email: parentEmail,
    },
  });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await store.getRefreshToken(tokenHash);

  if (!stored) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
  if (stored.revoked === 1) {
    return res.status(401).json({ message: 'Refresh token has been revoked' });
  }
  if (new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ message: 'Refresh token has expired' });
  }

  // Rotate: revoke old, issue new
  await store.revokeRefreshToken(tokenHash);

  // Look up account to include in new access token
  const account = await store.getAccount(stored.account_id);

  const newAccessToken = jwt.sign(
    { accountId: stored.account_id },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const newRefreshTokenValue = crypto.randomBytes(48).toString('hex');
  const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshTokenValue).digest('hex');
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await store.saveRefreshToken(stored.account_id, newRefreshTokenHash, refreshExpiresAt);

  res.json({
    token: newAccessToken,
    refreshToken: newRefreshTokenValue,
    account: account ? {
      account_id: account.account_id,
      child_name: account.child_name,
      kyc_status: account.kyc_status || '',
      actual_balance: Number(account.actual_balance),
      unallocated_balance: Number(account.unallocated_balance),
      current_xp: Number(account.current_xp),
      coins: Number(account.coins) || 0,
      consent_status: account.consent_status || 'none',
      parent_email: account.parent_email || '',
    } : undefined,
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken && typeof refreshToken === 'string') {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await store.revokeRefreshToken(tokenHash);
  }
  res.json({ message: 'Logged out successfully' });
}));

router.post('/change-pin', changePinLimiter, asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { oldPin, newPin } = req.body;
    if (!oldPin || !/^\d{6}$/.test(oldPin)) {
      return res.status(400).json({ message: 'Current PIN is required and must be exactly 6 digits' });
    }
    if (!newPin || !/^\d{6}$/.test(newPin)) {
      return res.status(400).json({ message: 'New PIN is required and must be exactly 6 digits' });
    }

    const account = await store.getAccount(decoded.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Check either pin_hash or password for old PIN
    const hashToCheck = account.pin_hash || account.password;
    const valid = bcrypt.compareSync(oldPin, hashToCheck);
    if (!valid) return res.status(401).json({ message: 'Current PIN is incorrect' });

    const hash = bcrypt.hashSync(newPin, 10);
    await store.query(
      'UPDATE accounts SET pin_hash = $1, password = $2, password_changed = 1 WHERE account_id = $3',
      [hash, hash, decoded.accountId]
    );
    res.json({ message: 'PIN changed successfully' });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}));

// ── Child Forgot PIN (uses parent email for OTP) ──
router.post('/forgot-pin-send-otp', asyncHandler(async (req, res) => {
  const { childName, accountId, memberId } = req.body;
  if (!childName && !accountId && !memberId) {
    return res.status(400).json({ message: 'childName, accountId, or memberId is required' });
  }
  let account;
  if (memberId) {
    const padded = memberId.trim().padStart(6, '0');
    const result = await store.query('SELECT * FROM accounts WHERE member_id = $1', [padded]);
    account = result.rows[0];
  } else if (accountId) {
    account = await store.getAccount(accountId.trim());
  } else {
    account = await store.getAccountByName(childName.trim());
  }
  if (!account || !account.parent_email) {
    return res.json({ message: 'If this account exists and has a parent email on file, an OTP has been sent.' });
  }
  const parentEmail = account.parent_email;
  // Rate limit
  const now = Date.now();
  const key = 'child_forgot_' + account.account_id;
  const existing = otpStore.get(key);
  if (existing && existing.attempts >= 3) {
    return res.status(429).json({ message: 'Too many requests. Try again in 15 minutes.' });
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore.set(key, { otp, expires: now + 600000, attempts: (existing?.attempts || 0) + 1, parentEmail });
  // Send OTP to parent email
  const apiKey = process.env.SENDGRID_API_KEY;
  if (apiKey) {
    try {
      sgMail.setApiKey(apiKey);
      const fromEmail = (process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM_ADDRESS || 'noreply@labcoop.app').replace(/^"|"$/g, '');
      const fromName = process.env.MAIL_FROM_NAME || 'MYCOOPPIGGY';
      await sgMail.send({
        to: parentEmail,
        from: { email: fromEmail, name: fromName },
        subject: 'MySYS — Child PIN Reset Request',
        html: `<div style="font-family:Arial;max-width:480px;margin:0 auto">
          <h2 style="color:#1a237e">Child PIN Reset</h2>
          <p style="color:#333">Your child <strong>${account.child_name}</strong> requested a PIN reset.</p>
          <p style="color:#333">Use this code to reset their PIN:</p>
          <div style="font-size:36px;letter-spacing:8px;font-weight:700;color:#1a237e;text-align:center;padding:20px;background:#f0f0ff;border-radius:8px;margin:16px 0">${otp}</div>
          <p style="color:#666;font-size:13px">This code expires in 10 minutes.</p>
          <hr style="border:none;border-top:1px solid #eee">
          <p style="color:#999;font-size:11px">MySYS Cooperative</p>
        </div>`,
      });
      console.log('[child/forgot-pin] OTP sent to parent:', parentEmail);
    } catch (e) {
      console.error('[child/forgot-pin] SendGrid error:', e.message);
      return res.status(500).json({ message: 'Failed to send OTP. Try again later.' });
    }
  } else {
    console.warn('[child/forgot-pin] SENDGRID_API_KEY not set. OTP:', otp);
  }
  res.json({ message: 'If the account exists, an OTP has been sent to the parent email.', accountId: account.account_id });
}));

router.post('/forgot-pin-verify-otp', asyncHandler(async (req, res) => {
  const { accountId, otp } = req.body;
  if (!accountId || !otp) return res.status(400).json({ message: 'Account ID and OTP are required' });
  const key = 'child_forgot_' + accountId;
  const stored = otpStore.get(key);
  if (!stored) return res.status(400).json({ message: 'No OTP requested' });
  if (stored.expires < Date.now()) return res.status(400).json({ message: 'OTP expired' });
  if (stored.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
  const resetToken = jwt.sign({ accountId, purpose: 'child_pin_reset' }, JWT_SECRET, { expiresIn: '10m' });
  res.json({ message: 'OTP verified', resetToken });
}));

router.post('/forgot-pin-reset', asyncHandler(async (req, res) => {
  const { resetToken, newPin } = req.body;
  if (!resetToken || !newPin || !/^\d{6}$/.test(newPin)) {
    return res.status(400).json({ message: 'Valid reset token and 6-digit PIN are required' });
  }
  let decoded;
  try {
    decoded = jwt.verify(resetToken, JWT_SECRET);
    if (decoded.purpose !== 'child_pin_reset') throw new Error('Invalid');
  } catch (e) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }
  const hash = bcrypt.hashSync(newPin, 10);
  await store.query('UPDATE accounts SET pin_hash = $1, password = $2 WHERE account_id = $3', [hash, hash, decoded.accountId]);
  otpStore.delete('child_forgot_' + decoded.accountId);
  res.json({ message: 'PIN reset successfully. You can now login with your new PIN.' });
}));

module.exports = router;
