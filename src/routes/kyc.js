const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { store } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../async-handler');

const KYC_DIR = path.join(__dirname, '..', 'uploads', 'kyc');
if (!fs.existsSync(KYC_DIR)) {
  fs.mkdirSync(KYC_DIR, { recursive: true });
}

const kycUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, KYC_DIR),
    filename: (req, file, cb) => {
      const prefix = file.fieldname === 'selfie' ? 'selfie' : 'birth_cert';
      cb(null, `${prefix}_${req.accountId}_${Date.now()}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only JPG and PNG files are allowed'));
  }
});

router.post('/submit', authMiddleware, (req, res) => {
  kycUpload.fields([
    { name: 'selfie', maxCount: 1 },
    { name: 'birth_cert', maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    try {
      const accountId = req.accountId;
      if (!accountId) return res.status(401).json({ message: 'Authentication required' });

      const account = await store.query('SELECT * FROM accounts WHERE account_id = $1', [accountId]).then(r => r.rows[0]);
      if (!account) return res.status(404).json({ message: 'Account not found' });

      const updates = { kyc_status: 'pending', kyc_submitted_at: new Date().toISOString() };
      if (req.files?.selfie?.[0]) updates.selfie_url = '/uploads/kyc/' + req.files.selfie[0].filename;
      if (req.files?.birth_cert?.[0]) updates.birth_cert_url = '/uploads/kyc/' + req.files.birth_cert[0].filename;
      if (!updates.selfie_url) {
        return res.status(400).json({ message: 'Selfie image is required for face verification' });
      }

      await store.updateAccount(accountId, updates);
      res.json({ message: 'KYC documents submitted for review', kyc_status: 'pending' });
    } catch (e) {
      console.error('KYC submit error:', e);
      res.status(500).json({ message: 'Failed to submit KYC documents. Please try again.' });
    }
  });
});

router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  if (!req.accountId) return res.status(401).json({ message: 'Authentication required' });
  const account = await store.query(
    'SELECT kyc_status, selfie_url, birth_cert_url, photo_2x2_url, kyc_submitted_at, kyc_verified_at, kyc_rejected_reason FROM accounts WHERE account_id = $1',
    [req.accountId]
  ).then(r => r.rows[0]);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  res.json({
    kyc_status: account.kyc_status || '',
    selfie_url: account.selfie_url || '',
    birth_cert_url: account.birth_cert_url || '',
    photo_2x2_url: account.photo_2x2_url || '',
    kyc_submitted_at: account.kyc_submitted_at || '',
    kyc_verified_at: account.kyc_verified_at || '',
    kyc_rejected_reason: account.kyc_rejected_reason || '',
  });
}));

module.exports = router;
