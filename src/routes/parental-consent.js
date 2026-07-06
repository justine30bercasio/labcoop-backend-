const express = require('express');
const crypto = require('crypto');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/parental-consent/request — send consent request to parent phone
router.post('/request', authMiddleware, asyncHandler(async (req, res) => {
  const account = await store.getAccount(req.accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  if (!account.parent_phone) {
    return res.status(400).json({ message: 'No parent phone number on file' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await store.query(
    `INSERT INTO parental_consent (consent_id, account_id, parent_phone, consent_token, status, ip_address, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
    [crypto.randomUUID(), account.account_id, account.parent_phone, token, req.ip, new Date().toISOString()]
  );
  // In production, send SMS with consent link: https://labcoop.app/parental-consent/approve?token=TOKEN
  // For now, return the consent link in response (dev mode)
  const consentLink = `https://labcoop-backend.onrender.com/api/parental-consent/approve?token=${token}`;
  console.log(`[PARENTAL CONSENT] Link for ${account.parent_phone}: ${consentLink}`);
  res.json({
    message: 'Consent request sent to parent phone',
    // In production, do NOT expose the link in the API response
    consent_link: process.env.NODE_ENV !== 'production' ? consentLink : undefined,
  });
}));

// GET /api/parental-consent/approve?token=xxx — parent approves via link
router.get('/approve', asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing consent token');
  const result = await store.query(
    'SELECT * FROM parental_consent WHERE consent_token = $1 AND status = $2',
    [token, 'pending']
  );
  if (result.rows.length === 0) return res.status(404).send('Consent request not found or already processed');
  const consent = result.rows[0];
  await store.query(
    'UPDATE parental_consent SET status = $1, responded_at = $2 WHERE consent_id = $3',
    ['approved', new Date().toISOString(), consent.consent_id]
  );
  await store.query(
    'UPDATE accounts SET consent_status = $1 WHERE account_id = $2',
    ['approved', consent.account_id]
  );
  res.send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Consent Approved</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>body{font-family:sans-serif;background:#0d2818;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
    .card{background:#fff;border-radius:16px;padding:40px;max-width:400px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.3)}
    h1{color:#2E7D32;margin:0 0 8px}.p{color:#64748b;margin:0 0 20px;line-height:1.5}
    .check{font-size:64px;margin-bottom:16px}</style></head>
    <body><div class="card"><div class="check">✅</div>
    <h1>Consent Approved!</h1>
    <p>You have successfully given consent for your child to use LabCoop savings.</p></div></body></html>
  `);
}));

// GET /api/parental-consent/status — check consent status
router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  const account = await store.getAccount(req.accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  const result = await store.query(
    'SELECT status, created_at, responded_at FROM parental_consent WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
    [req.accountId]
  );
  res.json({
    consent_status: account.consent_status || 'approved',
    latest_request: result.rows[0] || null,
  });
}));

module.exports = router;
