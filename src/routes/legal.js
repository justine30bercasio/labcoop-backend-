const express = require('express');
const router = express.Router();

const PRIVACY_POLICY = `
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Privacy Policy — LabCoop</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#1e293b;line-height:1.6}h1{color:#2E7D32}h2{color:#1B5E20;margin-top:32px}.date{color:#64748b;font-size:14px}</style>
</head><body>
<h1>Privacy Policy</h1>
<p class="date">Last updated: July 2026</p>

<h2>1. Information We Collect</h2>
<p>LabCoop collects the following information from child users: name, birthdate, parent/guardian phone number, savings account balance, transaction history, and KYC documents (selfie photo, birth certificate, ID photo) for identity verification.</p>

<h2>2. How We Use Information</h2>
<p>We use this information solely to operate the cooperative savings program: maintaining account balances, processing deposits and withdrawals, verifying identity, calculating interest, and providing gamified financial literacy features (XP, badges, pet evolution, town builder).</p>

<h2>3. Parental Rights</h2>
<p>Parents or legal guardians have the right to: (a) review their child's data, (b) request correction of inaccurate data, (c) request deletion of their child's account and associated data, (d) withdraw consent at any time. To exercise these rights, contact the cooperative manager or use the account deletion feature in the app.</p>

<h2>4. Data Sharing</h2>
<p>We do not sell, trade, or share children's personal information with third parties. Data is only accessible to authorized cooperative administrators for operational purposes.</p>

<h2>5. Data Retention</h2>
<p>Account data is retained while the account is active. Inactive accounts (no activity for 12 months) will be flagged for review. Upon account deletion request, data will be permanently removed within 30 days, except where retention is required by law.</p>

<h2>6. Security</h2>
<p>We implement appropriate technical measures including encryption, access controls, and secure storage to protect children's data. All financial transactions are logged and auditable.</p>

<h2>7. Contact</h2>
<p>For privacy-related inquiries, contact the cooperative administrator through the cooperative's official communication channels.</p>

<h2>8. COPPA Compliance</h2>
<p>LabCoop complies with the Children's Online Privacy Protection Act (COPPA). We obtain verifiable parental consent before collecting personal information from children under 13. Parents may review, delete, or refuse further collection of their child's data at any time.</p>
</body></html>`;

const TERMS_OF_SERVICE = `
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Terms of Service — LabCoop</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#1e293b;line-height:1.6}h1{color:#2E7D32}h2{color:#1B5E20;margin-top:32px}.date{color:#64748b;font-size:14px}</style>
</head><body>
<h1>Terms of Service</h1>
<p class="date">Last updated: July 2026</p>

<h2>1. Acceptance</h2>
<p>By creating an account, you agree to these terms. Parental consent is required for users under 18.</p>

<h2>2. Account Types</h2>
<p>Savings accounts are opened and managed by the cooperative. Funds are held in trust for the child member.</p>

<h2>3. Deposits & Withdrawals</h2>
<p>Deposits may be made via cash, GCash, or other authorized payment methods. Withdrawals require maintaining balance compliance and may be subject to processing time.</p>

<h2>4. Interest</h2>
<p>Interest is credited monthly at the cooperative's published rate. Rates may change with notice.</p>

<h2>5. Limitation of Liability</h2>
<p>The cooperative is not liable for losses due to force majeure, system downtime, or unauthorized access where reasonable security measures were in place.</p>

<h2>6. Termination</h2>
<p>The cooperative may close accounts with 30 days notice. Users may request account closure at any time.</p>
</body></html>`;

router.get('/privacy', (req, res) => res.type('html').send(PRIVACY_POLICY));
router.get('/terms', (req, res) => res.type('html').send(TERMS_OF_SERVICE));

module.exports = { router, PRIVACY_POLICY, TERMS_OF_SERVICE };
