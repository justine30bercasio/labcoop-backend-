const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { store } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../async-handler');
const notifs = require('../services/notifications');
const fileStorage = require('../services/file-storage');

const kycUpload = multer({
  storage: multer.memoryStorage(),
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

      const acctResult = await store.query('SELECT * FROM accounts WHERE account_id = $1', [accountId]);
      const account = acctResult.rows[0];
      if (!account) return res.status(404).json({ message: 'Account not found' });

      const updates = { kyc_status: 'pending', kyc_submitted_at: new Date().toISOString() };
      if (req.files?.selfie?.[0]) {
        const f = req.files.selfie[0];
        const fn = `selfie_${accountId}_${Date.now()}${path.extname(f.originalname)}`;
        await fileStorage.uploadFile(f.buffer, 'kyc/' + fn, f.mimetype);
        updates.selfie_url = '/uploads/kyc/' + fn;
      }
      if (req.files?.birth_cert?.[0]) {
        const f = req.files.birth_cert[0];
        const fn = `birth_cert_${accountId}_${Date.now()}${path.extname(f.originalname)}`;
        await fileStorage.uploadFile(f.buffer, 'kyc/' + fn, f.mimetype);
        updates.birth_cert_url = '/uploads/kyc/' + fn;
      }
      if (!updates.selfie_url) {
        return res.status(400).json({ message: 'Selfie image is required for face verification' });
      }

      await store.updateAccount(accountId, updates);
      notifs.sendPush(accountId, 'KYC Submitted', 'Your documents are under review.', { type: 'kyc_submitted' }).catch(() => {});
      res.json({ message: 'KYC documents submitted for review', kyc_status: 'pending' });
    } catch (e) {
      console.error('KYC submit error:', e);
      res.status(500).json({ message: 'Failed to submit KYC documents. Please try again.' });
    }
  });
});

router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  if (!req.accountId) return res.status(401).json({ message: 'Authentication required' });
  let account, consentResult;
  try {
    const acctResult = await store.query(
      'SELECT kyc_status, selfie_url, birth_cert_url, photo_2x2_url, kyc_submitted_at, kyc_verified_at, kyc_rejected_reason, consent_status, parent_email FROM accounts WHERE account_id = $1',
      [req.accountId]
    );
    account = acctResult.rows[0];
    if (!account) return res.status(404).json({ message: 'Account not found' });
    const cResult = await store.query(
      "SELECT status FROM parental_consent WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.accountId]
    );
    consentResult = cResult.rows[0] || null;
  } catch (e) {
    console.error('KYC status error:', e);
    return res.status(500).json({ message: 'Failed to check status. Please try again.' });
  }
  res.json({
    kyc_status: account.kyc_status || '',
    selfie_url: account.selfie_url || '',
    birth_cert_url: account.birth_cert_url || '',
    photo_2x2_url: account.photo_2x2_url || '',
    kyc_submitted_at: account.kyc_submitted_at || '',
    kyc_verified_at: account.kyc_verified_at || '',
    kyc_rejected_reason: account.kyc_rejected_reason || '',
    consent_status: account.consent_status || 'none',
    parent_email: account.parent_email || '',
    latest_consent: consentResult,
  });
}));

// ── Request Parental Consent (notifies parent via notification system) ──
router.post('/request-consent', authMiddleware, asyncHandler(async (req, res) => {
  if (!req.accountId) return res.status(401).json({ message: 'Authentication required' });
  const account = await store.getAccount(req.accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  if (account.consent_status === 'approved') {
    return res.json({ message: 'Consent already approved.', consent_status: 'approved' });
  }
  try {
    const existing = await store.query(
      "SELECT * FROM parental_consent WHERE account_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [req.accountId]
    );
    if (existing.rows.length === 0) {
      const token = require('crypto').randomBytes(32).toString('hex');
      await store.query(
        `INSERT INTO parental_consent (consent_id, account_id, parent_phone, parent_email, consent_token, status, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
        [require('uuid').v4(), req.accountId, (account.parent_phone || '').toString(), account.parent_email || '', token, req.ip, new Date().toISOString()]
      );
      await store.query(
        'UPDATE accounts SET consent_status = $1 WHERE account_id = $2',
        ['pending', req.accountId]
      );
    }
  } catch (e) {
    console.error('Failed to create/update consent record:', e);
    return res.status(500).json({ message: 'Failed to process consent request.' });
  }
  // Notify linked parents
  let notifiedCount = 0;
  try {
    const links = await store.query(
      'SELECT parent_id FROM parent_child_links WHERE child_account_id = $1 AND status = $2',
      [req.accountId, 'active']
    );
    for (const link of links.rows) {
      try {
        await store.createParentNotification({
          parentId: link.parent_id,
          title: `${account.child_name} needs your consent`,
          body: 'Review and approve so they can submit KYC documents.',
          type: 'consent_request',
        });
        // Send FCM push to parent
        try {
          await notifs.sendParentPush(link.parent_id, `${account.child_name} needs your consent`, 'Review and approve so they can submit KYC documents.', { type: 'consent_request', childAccountId: req.accountId });
        } catch (_) {}
        notifiedCount++;
      } catch (e) {
        console.error('Failed to create parent notification:', e);
      }
    }
  } catch (e) {
    console.error('Failed to query parent links:', e);
  }
  if (notifiedCount === 0) {
    return res.json({ message: 'No parent linked yet. Go to Settings → Link Parent first.', consent_status: 'pending', noParentLinked: true });
  }
  res.json({ message: 'Consent request sent to parent.', consent_status: 'pending' });
}));

module.exports = router;
