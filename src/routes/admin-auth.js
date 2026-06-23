const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { store } = require('../db');

const router = express.Router();

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.MAIL_HOST || !process.env.MAIL_USERNAME || !process.env.MAIL_PASSWORD) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT) || 465,
    secure: (process.env.MAIL_SCHEME || 'smtps') === 'smtps',
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
  });
  return transporter;
}

const otpStore = new Map();

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — Admin Login</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0d2818; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.bg-pattern { position:fixed; top:0; left:0; right:0; bottom:0; background:radial-gradient(ellipse at 20% 50%, rgba(46,125,50,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(46,125,50,0.08) 0%, transparent 50%); pointer-events:none; z-index:0; }
.card { position:relative; z-index:1; background:#fff; border-radius:20px; padding:40px; width:100%; max-width:400px; box-shadow:0 8px 40px rgba(0,0,0,0.3); animation:fadeUp 0.5s ease; }
@keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
.logo { width:52px; height:52px; background:linear-gradient(135deg,#2E7D32,#1B5E20); border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:16px; }
h1 { font-size:20px; font-weight:700; color:#1e293b; }
.sub { color:#64748b; font-size:13px; margin-bottom:24px; }
label { display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:4px; margin-top:14px; }
input[type=text], input[type=password] { width:100%; padding:10px 14px; border:2px solid #e2e8f0; border-radius:10px; font-size:14px; outline:none; transition:border-color 0.2s; font-family:inherit; }
input:focus { border-color:#2E7D32; }
.btn { width:100%; padding:12px; background:#2E7D32; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; margin-top:20px; transition:background 0.2s; }
.btn:hover { background:#1B5E20; }
.error { background:#fce4ec; color:#b71c1c; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
.success { background:#e8f5e9; color:#1B5E20; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
.alt-link { text-align:center; margin-top:16px; font-size:13px; }
.alt-link a { color:#2E7D32; text-decoration:none; font-weight:500; }
.alt-link a:hover { text-decoration:underline; }
.footer { text-align:center; margin-top:20px; font-size:11px; color:#64748b; }
</style>
</head>
<body>
<div class="bg-pattern"></div>
<div class="card">
  <div class="logo">&#x1F3E6;</div>
  <h1>LabCoop Admin</h1>
  <p class="sub">${error && error.startsWith('otp:') ? 'Check your email for the OTP code' : 'Sign in to manage your application'}</p>
  ${error && !error.startsWith('otp:') ? `<div class="error">${error}</div>` : ''}
  ${error && error.startsWith('otp:') ? `<div class="success">OTP sent to ${error.slice(4)}</div>` : ''}
  <form method="post" action="/admin/login">
    <label for="username">Username</label>
    <input type="text" id="username" name="username" placeholder="admin" required autocomplete="username">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" placeholder="Enter your password" required autocomplete="current-password">
    <button type="submit" class="btn">Sign In</button>
  </form>
  <div class="alt-link"><a href="/admin/login/forgot">Forgot password?</a></div>
  <div class="footer">LabCoop v1.0 &middot; Admin Dashboard</div>
</div>
</body>
</html>`;
}

function forgotPage(msg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — Forgot Password</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0d2818; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.bg-pattern { position:fixed; top:0; left:0; right:0; bottom:0; background:radial-gradient(ellipse at 20% 50%, rgba(46,125,50,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(46,125,50,0.08) 0%, transparent 50%); pointer-events:none; z-index:0; }
.card { position:relative; z-index:1; background:#fff; border-radius:20px; padding:40px; width:100%; max-width:400px; box-shadow:0 8px 40px rgba(0,0,0,0.3); animation:fadeUp 0.5s ease; }
@keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
h1 { font-size:20px; font-weight:700; color:#1e293b; margin-bottom:4px; }
.sub { color:#64748b; font-size:13px; margin-bottom:24px; }
label { display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:4px; margin-top:14px; }
input[type=email], input[type=text] { width:100%; padding:10px 14px; border:2px solid #e2e8f0; border-radius:10px; font-size:14px; outline:none; font-family:inherit; transition:border-color 0.2s; }
input:focus { border-color:#2E7D32; }
.btn { width:100%; padding:12px; background:#2E7D32; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; margin-top:20px; transition:background 0.2s; }
.btn:hover { background:#1B5E20; }
.msg { background:#e8f5e9; color:#1B5E20; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
.error { background:#fce4ec; color:#b71c1c; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
.alt-link { text-align:center; margin-top:16px; font-size:13px; }
.alt-link a { color:#2E7D32; text-decoration:none; font-weight:500; }
.alt-link a:hover { text-decoration:underline; }
</style>
</head>
<body>
<div class="bg-pattern"></div>
<div class="card">
  <h1>&#x1F511; Reset Password</h1>
  <p class="sub">Enter your username to receive a reset OTP at the registered email</p>
  ${msg ? (msg.startsWith('err:') ? `<div class="error">${msg.slice(4)}</div>` : `<div class="msg">${msg}</div>`) : ''}
  <form method="post" action="/admin/login/forgot">
    <label for="email">Username</label>
    <input type="text" id="email" name="email" placeholder="admin" required>
    <button type="submit" class="btn">Send OTP</button>
  </form>
  <div class="alt-link"><a href="/admin/login">Back to Sign In</a></div>
</div>
</body>
</html>`;
}

function showOtpPage(email) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — Verify OTP</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0d2818; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.bg-pattern { position:fixed; top:0; left:0; right:0; bottom:0; background:radial-gradient(ellipse at 20% 50%, rgba(46,125,50,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(46,125,50,0.08) 0%, transparent 50%); pointer-events:none; z-index:0; }
.card { position:relative; z-index:1; background:#fff; border-radius:20px; padding:40px; width:100%; max-width:400px; box-shadow:0 8px 40px rgba(0,0,0,0.3); animation:fadeUp 0.5s ease; text-align:center; }
@keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
h1 { font-size:20px; font-weight:700; color:#1e293b; margin-bottom:4px; }
.sub { color:#64748b; font-size:13px; margin-bottom:24px; }
label { display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:4px; }
input[type=text] { width:100%; padding:12px; border:2px solid #e2e8f0; border-radius:10px; font-size:26px; text-align:center; letter-spacing:10px; outline:none; font-family:monospace; transition:border-color 0.2s; }
input:focus { border-color:#2E7D32; }
.btn { width:100%; padding:12px; background:#2E7D32; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; margin-top:20px; transition:background 0.2s; }
.btn:hover { background:#1B5E20; }
.alt-link { margin-top:16px; font-size:13px; }
.alt-link a { color:#2E7D32; text-decoration:none; font-weight:500; }
.alt-link a:hover { text-decoration:underline; }
</style>
</head>
<body>
<div class="bg-pattern"></div>
<div class="card">
  <h1>&#x1F4E7; Verify OTP</h1>
  <p class="sub">Enter the 6-digit code sent to ${email}</p>
  <form method="post" action="/admin/login/verify-otp">
    <input type="hidden" name="email" value="${email}">
    <label for="otp">OTP Code</label>
    <input type="text" id="otp" name="otp" placeholder="000000" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" required>
    <button type="submit" class="btn">Verify &amp; Sign In</button>
  </form>
  <div class="alt-link"><a href="/admin/login">Back to Sign In</a></div>
</div>
</body>
</html>`;
}

function sendOtpEmail(email, otp) {
  const t = getTransporter();
  if (!t) return false;
  t.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || 'LabCoop Admin'}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME}>`,
    to: email,
    subject: 'Your LabCoop Admin OTP Code',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#2E7D32">🔐 Admin Login OTP</h2>
      <p>Use the code below to complete your sign in:</p>
      <div style="background:#e8f5e9;padding:20px;border-radius:12px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700;color:#1B5E20;margin:16px 0">${otp}</div>
      <p style="color:#888;font-size:13px">This code expires in 10 minutes.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#999;font-size:12px">If you didn't request this, you can ignore this email.</p>
    </div>`,
  }).catch(() => {});
  return true;
}

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const error = req.query.error || '';
  res.type('html').send(loginPage(error));
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.type('html').send(loginPage('Please enter both username and password.'));
  }
  let adminUser;
  try {
    const result = await store.query('SELECT * FROM admin_users WHERE username = $1 AND is_active = 1', [username]);
    adminUser = result.rows[0];
  } catch (e) {
    return res.type('html').send(loginPage('Database error. Ensure admin_users table exists.'));
  }
  if (!adminUser) {
    return res.type('html').send(loginPage('Invalid username or password.'));
  }
  const match = await bcrypt.compare(password, adminUser.password_hash);
  if (!match) {
    return res.type('html').send(loginPage('Invalid username or password.'));
  }
  req.session.regenerate((err) => {
    if (err) return res.type('html').send(loginPage('Session error. Please try again.'));
    req.session.adminId = adminUser.admin_id;
    req.session.adminName = adminUser.display_name || adminUser.username;
    req.session.adminRole = adminUser.role;
    res.redirect('/admin');
  });
});

router.get('/login/forgot', (req, res) => {
  res.type('html').send(forgotPage(''));
});

router.post('/login/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.type('html').send(forgotPage('err:Please enter your email.'));
  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore.set(email, { otp, expires: Date.now() + 600000 });
  const sent = sendOtpEmail(email, otp);
  if (!sent) {
    console.log(`[OTP] Password reset requested for ${email}. OTP: ${otp} (server log only)`);
    return res.type('html').send(forgotPage('err:Cannot send email — SMTP is not configured. Contact your administrator to reset your password.'));
  }
  res.type('html').send(forgotPage(`OTP sent to ${email}. Check your inbox.`));
});

router.post('/login/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.type('html').send(loginPage('Missing email or OTP.'));
  const stored = otpStore.get(email);
  if (!stored) return res.type('html').send(loginPage('No OTP requested for this email.'));
  if (Date.now() > stored.expires) {
    otpStore.delete(email);
    return res.type('html').send(loginPage('OTP expired. Please request a new one.'));
  }
  if (stored.otp !== otp.trim()) {
    return res.type('html').send(loginPage('Invalid OTP.'));
  }
  otpStore.delete(email);
  // Look up the actual admin user from the database
  const result = await store.query('SELECT admin_id, display_name, role FROM admin_users WHERE username = $1', [email]);
  if (result.rows.length === 0) {
    return res.type('html').send(loginPage('No admin account found for this email.'));
  }
  const adminUser = result.rows[0];
  req.session.regenerate((err) => {
    if (err) return res.type('html').send(loginPage('Session error. Please try again.'));
    req.session.adminId = adminUser.admin_id;
    req.session.adminName = adminUser.display_name || email;
    req.session.adminRole = adminUser.role;
    res.redirect('/admin');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;
