const express = require('express');
const crypto = require('crypto');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Send consent email via SendGrid
async function sendConsentEmail(parentEmail, childName, consentLink) {
  try {
    const sgMail = require('@sendgrid/mail');
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'labcoopcooperative@gmail.com';
    if (!apiKey) {
      console.warn('[PARENTAL CONSENT] SENDGRID_API_KEY not set — email not sent. Link:', consentLink);
      return false;
    }
    sgMail.setApiKey(apiKey);
    const msg = {
      to: parentEmail,
      from: fromEmail,
      subject: `LabCoop: Parental Consent Request for ${childName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f0fdf4; border-radius: 16px; overflow: hidden; border: 1px solid #86efac;">
          <div style="background: #166534; padding: 24px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 22px; letter-spacing: -0.5px;">🐷 LabCoop</h1>
            <p style="color: #bbf7d0; margin: 4px 0 0; font-size: 14px;">Children's Cooperative Savings</p>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #166534; margin: 0 0 12px; font-size: 20px;">Hello Parent of ${childName}!</h2>
            <p style="color: #374151; line-height: 1.6; margin: 0 0 16px;">
              Your child <strong>${childName}</strong> has registered for a LabCoop savings account.
              To activate their account and allow them to use all features including deposits, withdrawals, and loans,
              we need your consent.
            </p>
            <div style="background: #e6f7ec; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">
                ✅ <strong>Track savings goals in real-time</strong><br>
                ✅ <strong>Learn financial literacy through fun quizzes</strong><br>
                ✅ <strong>Virtual pet piggy that grows with savings</strong><br>
                ✅ <strong>All data is encrypted and secure</strong>
              </p>
            </div>
            <a href="${consentLink}" style="display: block; background: #16a34a; color: #fff; text-align: center; padding: 16px 24px; border-radius: 12px; text-decoration: none; font-size: 18px; font-weight: 600; margin: 24px 0;">✅ Approve Consent</a>
            <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 16px 0 0;">
              By clicking approve, you confirm that you are the parent or legal guardian of ${childName}
              and consent to their participation in the LabCoop cooperative savings program.
              You may revoke this consent at any time.
            </p>
          </div>
          <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              LabCoop Cooperative &bull; <a href="https://labcoop-backend.onrender.com/legal/privacy" style="color: #16a34a;">Privacy Policy</a> &bull; <a href="https://labcoop-backend.onrender.com/legal/terms" style="color: #16a34a;">Terms of Service</a>
            </p>
          </div>
        </div>
      `,
    };
    await sgMail.send(msg);
    console.log(`[PARENTAL CONSENT] Email sent to ${parentEmail} for ${childName}`);
    return true;
  } catch (err) {
    console.error('[PARENTAL CONSENT] Failed to send email:', err.message);
    // Continue even if email fails — admin can manually verify
    return false;
  }
}

// POST /api/parental-consent/request — send consent request to parent email
router.post('/request', authMiddleware, asyncHandler(async (req, res) => {
  const account = await store.getAccount(req.accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  const parentEmail = account.parent_email || req.body.parentEmail;
  if (!parentEmail) {
    return res.status(400).json({ message: 'No parent email on file. Please set a parent email in Settings first.' });
  }
  // Check for existing pending request
  const existing = await store.query(
    "SELECT * FROM parental_consent WHERE account_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [req.accountId]
  );
  if (existing.rows.length > 0) {
    // Re-send the existing token
    const token = existing.rows[0].consent_token;
    const consentLink = `https://labcoop-backend.onrender.com/api/parental-consent/approve?token=${token}`;
    await sendConsentEmail(parentEmail, account.child_name, consentLink);
    return res.json({ message: 'Consent email re-sent to parent email.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await store.query(
    `INSERT INTO parental_consent (consent_id, account_id, parent_phone, parent_email, consent_token, status, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
    [crypto.randomUUID(), account.account_id, (account.parent_phone || '').toString(), parentEmail, token, req.ip, new Date().toISOString()]
  );
  // Update account consent status
  await store.query(
    'UPDATE accounts SET consent_status = $1 WHERE account_id = $2',
    ['pending', req.accountId]
  );
  const consentLink = `https://labcoop-backend.onrender.com/api/parental-consent/approve?token=${token}`;
  const emailSent = await sendConsentEmail(parentEmail, account.child_name, consentLink);
  res.json({
    message: emailSent ? 'Consent request sent to parent email' : 'Consent request created (email delivery pending — check SendGrid config)',
    consent_status: 'pending',
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
    <p>You have successfully given consent for <strong>${consent.account_id}</strong> to use LabCoop savings.</p>
    <p style="color:#64748b;font-size:13px;">They can now use all features: savings, goals, loans, and more.</p></div></body></html>
  `);
}));

// GET /api/parental-consent/status — check consent status
router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  const account = await store.getAccount(req.accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });
  const result = await store.query(
    'SELECT status, parent_email, created_at, responded_at FROM parental_consent WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
    [req.accountId]
  );
  res.json({
    consent_status: account.consent_status || 'none',
    parent_email: account.parent_email || (result.rows[0]?.parent_email || ''),
    latest_request: result.rows[0] || null,
  });
}));

module.exports = router;
