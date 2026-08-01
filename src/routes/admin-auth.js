const express = require('express');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { store } = require('../db');
const { log } = require('../services/audit');

const router = express.Router();

const otpStore = new Map();
const otpRateLimit = new Map();

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

async function clearLoginAttempts(username) {
  await store.query('UPDATE admin_users SET login_attempts = 0, locked_until = NULL WHERE username = $1', [username]);
}

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — Sign In</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; }
body {
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:linear-gradient(135deg,#0a1f12 0%,#0d2818 30%,#0f3320 60%,#0a1f12 100%);
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  position:relative;
  overflow:hidden;
}
.bg-shape-1 {
  position:fixed;
  top:-20%; left:-10%;
  width:60vw; height:60vw;
  background:radial-gradient(circle,rgba(46,125,50,0.12) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-2 {
  position:fixed;
  bottom:-15%; right:-10%;
  width:50vw; height:50vw;
  background:radial-gradient(circle,rgba(27,94,32,0.15) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-3 {
  position:fixed;
  top:40%; left:50%;
  transform:translate(-50%,-50%);
  width:40vw; height:40vw;
  background:radial-gradient(circle,rgba(56,142,60,0.06) 0%,transparent 70%);
  border-radius:50%;
  filter:blur(60px);
  pointer-events:none;
  z-index:0;
}
.card {
  position:relative;
  z-index:1;
  background:#fff;
  border-radius:24px;
  padding:44px 40px 36px;
  width:100%;
  max-width:420px;
  box-shadow:0 25px 80px rgba(0,0,0,0.35),0 8px 24px rgba(0,0,0,0.15);
  animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1);
}
@keyframes fadeUp { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
.logo-wrap {
  display:flex;
  align-items:center;
  justify-content:center;
  margin-bottom:20px;
}
.logo {
  width:56px; height:56px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:28px;
  box-shadow:0 4px 12px rgba(46,125,50,0.3);
}
h1 {
  font-size:24px;
  font-weight:800;
  color:#0f172a;
  text-align:center;
  letter-spacing:-0.3px;
}
.sub {
  color:#64748b;
  font-size:14px;
  text-align:center;
  margin-top:6px;
  margin-bottom:28px;
  line-height:1.5;
}
.error {
  background:#fef2f2;
  color:#b91c1c;
  padding:12px 16px;
  border-radius:12px;
  font-size:13px;
  margin-bottom:20px;
  border-left:3px solid #ef4444;
  display:flex;
  align-items:center;
  gap:8px;
}
.error::before { content:'\\F33F'; font-family:'bootstrap-icons'; font-size:16px; }
.success {
  background:#f0fdf4;
  color:#166534;
  padding:12px 16px;
  border-radius:12px;
  font-size:13px;
  margin-bottom:20px;
  border-left:3px solid #22c55e;
  display:flex;
  align-items:center;
  gap:8px;
}
.success::before { content:'\\F26E'; font-family:'bootstrap-icons'; font-size:16px; color:#22c55e; }
.field-group {
  position:relative;
  margin-bottom:18px;
}
.field-group .icon {
  position:absolute;
  left:14px;
  top:50%;
  transform:translateY(-50%);
  color:#94a3b8;
  font-size:18px;
  transition:color 0.25s;
  pointer-events:none;
  z-index:2;
}
.field-group input {
  width:100%;
  padding:14px 14px 14px 46px;
  border:2px solid #e2e8f0;
  border-radius:14px;
  font-size:14px;
  font-family:inherit;
  outline:none;
  transition:border-color 0.25s, box-shadow 0.25s;
  background:#f8fafc;
  color:#0f172a;
}
.field-group input::placeholder { color:#94a3b8; font-weight:400; }
.field-group input:focus {
  border-color:#2E7D32;
  box-shadow:0 0 0 4px rgba(46,125,50,0.1);
  background:#fff;
}
.field-group input:focus + .icon,
.field-group input:focus ~ .icon { color:#2E7D32; }
.field-group .toggle-pw {
  position:absolute;
  right:14px;
  top:50%;
  transform:translateY(-50%);
  color:#94a3b8;
  font-size:18px;
  cursor:pointer;
  transition:color 0.2s;
  z-index:2;
  background:transparent;
  border:none;
  padding:4px;
}
.field-group .toggle-pw:hover { color:#475569; }
.btn {
  width:100%;
  padding:14px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  color:#fff;
  border:none;
  border-radius:14px;
  font-size:15px;
  font-weight:600;
  font-family:inherit;
  cursor:pointer;
  margin-top:6px;
  transition:transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  box-shadow:0 4px 16px rgba(46,125,50,0.3);
  position:relative;
  overflow:hidden;
}
.btn:hover {
  transform:translateY(-1px);
  box-shadow:0 6px 24px rgba(46,125,50,0.4);
}
.btn:active {
  transform:translateY(0);
  box-shadow:0 2px 8px rgba(46,125,50,0.3);
}
.btn:disabled {
  opacity:0.7;
  cursor:not-allowed;
  transform:none;
}
.btn .spinner {
  display:none;
  width:20px; height:20px;
  border:2.5px solid rgba(255,255,255,0.3);
  border-top-color:#fff;
  border-radius:50%;
  animation:spin 0.6s linear infinite;
  position:absolute;
  left:50%; top:50%;
  margin:-10px 0 0 -10px;
}
.btn.loading { color:transparent; }
.btn.loading .spinner { display:block; }
@keyframes spin { to{transform:rotate(360deg)} }
.alt-link {
  text-align:center;
  margin-top:18px;
}
.alt-link a {
  color:#64748b;
  text-decoration:none;
  font-size:13px;
  font-weight:500;
  transition:color 0.2s;
}
.alt-link a:hover { color:#2E7D32; }
.security-badge {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  margin-top:22px;
  padding-top:18px;
  border-top:1px solid #f1f5f9;
  font-size:12px;
  color:#94a3b8;
}
.security-badge .lock { font-size:14px; }
.footer {
  text-align:center;
  margin-top:18px;
  font-size:11px;
  color:#94a3b8;
  line-height:1.7;
}
.footer a { color:#94a3b8; text-decoration:none; }
.footer a:hover { color:#64748b; }
@media (max-width:480px) {
  .card { padding:32px 24px 28px; border-radius:20px; }
  h1 { font-size:21px; }
  .bg-shape-1, .bg-shape-2, .bg-shape-3 { opacity:0.5; }
}
</style>
</head>
<body>
<div class="bg-shape-1"></div>
<div class="bg-shape-2"></div>
<div class="bg-shape-3"></div>
<div class="card">
  <div class="logo-wrap"><div class="logo">&#x1F3E6;</div></div>
  <h1>LabCoop</h1>
  <p class="sub">${error && error.startsWith('otp:') ? 'Check your email for the OTP code' : 'Sign in to access the Labcoop Bank Management.'}</p>
  ${error && !error.startsWith('otp:') ? `<div class="error">${error}</div>` : ''}
  ${error && error.startsWith('otp:') ? `<div class="success">OTP sent to ${error.slice(4)}</div>` : ''}
  <form method="post" action="/admin/login" id="loginForm">
    <div class="field-group">
      <input type="text" id="username" name="username" placeholder="Username" required autocomplete="username">
      <i class="bi bi-person icon"></i>
    </div>
    <div class="field-group">
      <input type="password" id="password" name="password" placeholder="Password" required autocomplete="current-password">
      <i class="bi bi-lock icon"></i>
      <button type="button" class="toggle-pw" id="togglePw" aria-label="Toggle password visibility"><i class="bi bi-eye"></i></button>
    </div>
    <button type="submit" class="btn" id="signInBtn">Sign In<div class="spinner"></div></button>
  </form>
  <div class="alt-link"><a href="/admin/login/forgot">Forgot password?</a></div>
  <div class="security-badge"><span class="lock">&#x1F512;</span> Secure Login &middot; 2FA available</div>
  <div class="footer">
    LabCoop &copy; 2026<br>
    Developed By CodeCraft Software Sulotion<br>
    Version 1.0
  </div>
</div>
<script>
(function() {
  var pwInput = document.getElementById('password');
  var toggleBtn = document.getElementById('togglePw');
  if (pwInput && toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      var isPw = pwInput.getAttribute('type') === 'password';
      pwInput.setAttribute('type', isPw ? 'text' : 'password');
      this.querySelector('i').className = isPw ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
  }
  var form = document.getElementById('loginForm');
  var btn = document.getElementById('signInBtn');
  if (form && btn) {
    form.addEventListener('submit', function() {
      btn.classList.add('loading');
      btn.disabled = true;
    });
  }
})();
</script>
</body>
</html>`;
}

function totpPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — Two-Factor Auth</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; }
body {
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:linear-gradient(135deg,#0a1f12 0%,#0d2818 30%,#0f3320 60%,#0a1f12 100%);
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  position:relative;
  overflow:hidden;
}
.bg-shape-1 {
  position:fixed;
  top:-20%; left:-10%;
  width:60vw; height:60vw;
  background:radial-gradient(circle,rgba(46,125,50,0.12) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-2 {
  position:fixed;
  bottom:-15%; right:-10%;
  width:50vw; height:50vw;
  background:radial-gradient(circle,rgba(27,94,32,0.15) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-3 {
  position:fixed;
  top:40%; left:50%;
  transform:translate(-50%,-50%);
  width:40vw; height:40vw;
  background:radial-gradient(circle,rgba(56,142,60,0.06) 0%,transparent 70%);
  border-radius:50%;
  filter:blur(60px);
  pointer-events:none;
  z-index:0;
}
.card {
  position:relative;
  z-index:1;
  background:#fff;
  border-radius:24px;
  padding:44px 40px 36px;
  width:100%;
  max-width:420px;
  box-shadow:0 25px 80px rgba(0,0,0,0.35),0 8px 24px rgba(0,0,0,0.15);
  animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1);
  text-align:center;
}
@keyframes fadeUp { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
.logo-wrap {
  display:flex;
  align-items:center;
  justify-content:center;
  margin-bottom:20px;
}
.logo {
  width:56px; height:56px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:28px;
  box-shadow:0 4px 12px rgba(46,125,50,0.3);
}
h1 {
  font-size:24px;
  font-weight:800;
  color:#0f172a;
  text-align:center;
  letter-spacing:-0.3px;
}
.sub {
  color:#64748b;
  font-size:14px;
  text-align:center;
  margin-top:6px;
  margin-bottom:28px;
  line-height:1.5;
}
.error {
  background:#fef2f2;
  color:#b91c1c;
  padding:12px 16px;
  border-radius:12px;
  font-size:13px;
  margin-bottom:20px;
  border-left:3px solid #ef4444;
  display:flex;
  align-items:center;
  gap:8px;
}
.error::before { content:'\\F33F'; font-family:'bootstrap-icons'; font-size:16px; }
.field-group {
  position:relative;
  margin-bottom:18px;
}
.field-group input {
  width:100%;
  padding:16px 20px;
  border:2px solid #e2e8f0;
  border-radius:14px;
  font-size:28px;
  text-align:center;
  letter-spacing:12px;
  outline:none;
  font-family:'Inter',monospace;
  transition:border-color 0.25s, box-shadow 0.25s;
  background:#f8fafc;
  color:#0f172a;
  font-weight:700;
}
.field-group input::placeholder { color:#cbd5e1; font-weight:400; font-size:20px; }
.field-group input:focus {
  border-color:#2E7D32;
  box-shadow:0 0 0 4px rgba(46,125,50,0.1);
  background:#fff;
}
.btn {
  width:100%;
  padding:14px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  color:#fff;
  border:none;
  border-radius:14px;
  font-size:15px;
  font-weight:600;
  font-family:inherit;
  cursor:pointer;
  margin-top:6px;
  transition:transform 0.15s, box-shadow 0.2s;
  box-shadow:0 4px 16px rgba(46,125,50,0.3);
}
.btn:hover {
  transform:translateY(-1px);
  box-shadow:0 6px 24px rgba(46,125,50,0.4);
}
.btn:active {
  transform:translateY(0);
  box-shadow:0 2px 8px rgba(46,125,50,0.3);
}
.btn:disabled {
  opacity:0.7;
  cursor:not-allowed;
  transform:none;
}
.alt-link {
  text-align:center;
  margin-top:20px;
}
.alt-link a {
  color:#64748b;
  text-decoration:none;
  font-size:13px;
  font-weight:500;
  transition:color 0.2s;
}
.alt-link a:hover { color:#2E7D32; }
.footer {
  text-align:center;
  margin-top:18px;
  font-size:11px;
  color:#94a3b8;
  line-height:1.7;
}
@media (max-width:480px) {
  .card { padding:32px 24px 28px; border-radius:20px; }
  h1 { font-size:21px; }
  .bg-shape-1, .bg-shape-2, .bg-shape-3 { opacity:0.5; }
}
</style>
</head>
<body>
<div class="bg-shape-1"></div>
<div class="bg-shape-2"></div>
<div class="bg-shape-3"></div>
<div class="card">
  <div class="logo-wrap"><div class="logo">&#x1F510;</div></div>
  <h1>Two-Factor Auth</h1>
  <p class="sub">Enter the 6-digit code from your authenticator app</p>
  ${error ? `<div class="error">${error}</div>` : ''}
  <form method="post" action="/admin/login/totp" id="totpForm">
    <div class="field-group">
      <input type="text" id="totp" name="totp" placeholder="000000" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" required>
    </div>
    <button type="submit" class="btn" id="totpBtn">Verify &amp; Sign In</button>
  </form>
  <div class="alt-link"><a href="/admin/login"><i class="bi bi-arrow-left"></i> Back to Sign In</a></div>
  <div class="footer">LabCoop &copy; 2026 &middot; Version 1.0</div>
</div>
<script>
(function() {
  var form = document.getElementById('totpForm');
  var btn = document.getElementById('totpBtn');
  if (form && btn) {
    form.addEventListener('submit', function() {
      btn.disabled = true;
      btn.textContent = 'Verifying...';
    });
  }
})();
</script>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; }
body {
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:linear-gradient(135deg,#0a1f12 0%,#0d2818 30%,#0f3320 60%,#0a1f12 100%);
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  position:relative;
  overflow:hidden;
}
.bg-shape-1 {
  position:fixed;
  top:-20%; left:-10%;
  width:60vw; height:60vw;
  background:radial-gradient(circle,rgba(46,125,50,0.12) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-2 {
  position:fixed;
  bottom:-15%; right:-10%;
  width:50vw; height:50vw;
  background:radial-gradient(circle,rgba(27,94,32,0.15) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-3 {
  position:fixed;
  top:40%; left:50%;
  transform:translate(-50%,-50%);
  width:40vw; height:40vw;
  background:radial-gradient(circle,rgba(56,142,60,0.06) 0%,transparent 70%);
  border-radius:50%;
  filter:blur(60px);
  pointer-events:none;
  z-index:0;
}
.card {
  position:relative;
  z-index:1;
  background:#fff;
  border-radius:24px;
  padding:44px 40px 36px;
  width:100%;
  max-width:420px;
  box-shadow:0 25px 80px rgba(0,0,0,0.35),0 8px 24px rgba(0,0,0,0.15);
  animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1);
}
@keyframes fadeUp { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
.logo-wrap {
  display:flex;
  align-items:center;
  justify-content:center;
  margin-bottom:20px;
}
.logo {
  width:56px; height:56px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:28px;
  box-shadow:0 4px 12px rgba(46,125,50,0.3);
}
h1 {
  font-size:24px;
  font-weight:800;
  color:#0f172a;
  text-align:center;
  letter-spacing:-0.3px;
}
.sub {
  color:#64748b;
  font-size:14px;
  text-align:center;
  margin-top:6px;
  margin-bottom:28px;
  line-height:1.5;
}
.msg {
  background:#f0fdf4;
  color:#166534;
  padding:12px 16px;
  border-radius:12px;
  font-size:13px;
  margin-bottom:20px;
  border-left:3px solid #22c55e;
  display:flex;
  align-items:center;
  gap:8px;
}
.msg::before { content:'\\F26E'; font-family:'bootstrap-icons'; font-size:16px; color:#22c55e; }
.error {
  background:#fef2f2;
  color:#b91c1c;
  padding:12px 16px;
  border-radius:12px;
  font-size:13px;
  margin-bottom:20px;
  border-left:3px solid #ef4444;
  display:flex;
  align-items:center;
  gap:8px;
}
.error::before { content:'\\F33F'; font-family:'bootstrap-icons'; font-size:16px; }
.field-group {
  position:relative;
  margin-bottom:18px;
}
.field-group .icon {
  position:absolute;
  left:14px;
  top:50%;
  transform:translateY(-50%);
  color:#94a3b8;
  font-size:18px;
  pointer-events:none;
  z-index:2;
}
.field-group input {
  width:100%;
  padding:14px 14px 14px 46px;
  border:2px solid #e2e8f0;
  border-radius:14px;
  font-size:14px;
  font-family:inherit;
  outline:none;
  transition:border-color 0.25s, box-shadow 0.25s;
  background:#f8fafc;
  color:#0f172a;
}
.field-group input::placeholder { color:#94a3b8; font-weight:400; }
.field-group input:focus {
  border-color:#2E7D32;
  box-shadow:0 0 0 4px rgba(46,125,50,0.1);
  background:#fff;
}
.btn {
  width:100%;
  padding:14px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  color:#fff;
  border:none;
  border-radius:14px;
  font-size:15px;
  font-weight:600;
  font-family:inherit;
  cursor:pointer;
  margin-top:6px;
  transition:transform 0.15s, box-shadow 0.2s;
  box-shadow:0 4px 16px rgba(46,125,50,0.3);
}
.btn:hover {
  transform:translateY(-1px);
  box-shadow:0 6px 24px rgba(46,125,50,0.4);
}
.btn:active {
  transform:translateY(0);
  box-shadow:0 2px 8px rgba(46,125,50,0.3);
}
.alt-link {
  text-align:center;
  margin-top:20px;
}
.alt-link a {
  color:#64748b;
  text-decoration:none;
  font-size:13px;
  font-weight:500;
  transition:color 0.2s;
}
.alt-link a:hover { color:#2E7D32; }
.footer {
  text-align:center;
  margin-top:18px;
  font-size:11px;
  color:#94a3b8;
  line-height:1.7;
}
@media (max-width:480px) {
  .card { padding:32px 24px 28px; border-radius:20px; }
  h1 { font-size:21px; }
  .bg-shape-1, .bg-shape-2, .bg-shape-3 { opacity:0.5; }
}
</style>
</head>
<body>
<div class="bg-shape-1"></div>
<div class="bg-shape-2"></div>
<div class="bg-shape-3"></div>
<div class="card">
  <div class="logo-wrap"><div class="logo">&#x1F511;</div></div>
  <h1>Reset Password</h1>
  <p class="sub">Enter your username to receive a reset OTP at the registered email</p>
  ${msg ? (msg.startsWith('err:') ? `<div class="error">${msg.slice(4)}</div>` : `<div class="msg">${msg}</div>`) : ''}
  <form method="post" action="/admin/login/forgot">
    <div class="field-group">
      <input type="text" id="email" name="email" placeholder="Username" required>
      <i class="bi bi-person icon"></i>
    </div>
    <button type="submit" class="btn">Send OTP</button>
  </form>
  <div class="alt-link"><a href="/admin/login"><i class="bi bi-arrow-left"></i> Back to Sign In</a></div>
  <div class="footer">LabCoop &copy; 2026 &middot; Version 1.0</div>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; }
body {
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:linear-gradient(135deg,#0a1f12 0%,#0d2818 30%,#0f3320 60%,#0a1f12 100%);
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  position:relative;
  overflow:hidden;
}
.bg-shape-1 {
  position:fixed;
  top:-20%; left:-10%;
  width:60vw; height:60vw;
  background:radial-gradient(circle,rgba(46,125,50,0.12) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-2 {
  position:fixed;
  bottom:-15%; right:-10%;
  width:50vw; height:50vw;
  background:radial-gradient(circle,rgba(27,94,32,0.15) 0%,transparent 70%);
  border-radius:50%;
  pointer-events:none;
  z-index:0;
}
.bg-shape-3 {
  position:fixed;
  top:40%; left:50%;
  transform:translate(-50%,-50%);
  width:40vw; height:40vw;
  background:radial-gradient(circle,rgba(56,142,60,0.06) 0%,transparent 70%);
  border-radius:50%;
  filter:blur(60px);
  pointer-events:none;
  z-index:0;
}
.card {
  position:relative;
  z-index:1;
  background:#fff;
  border-radius:24px;
  padding:44px 40px 36px;
  width:100%;
  max-width:420px;
  box-shadow:0 25px 80px rgba(0,0,0,0.35),0 8px 24px rgba(0,0,0,0.15);
  animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1);
  text-align:center;
}
@keyframes fadeUp { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
.logo-wrap {
  display:flex;
  align-items:center;
  justify-content:center;
  margin-bottom:20px;
}
.logo {
  width:56px; height:56px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:28px;
  box-shadow:0 4px 12px rgba(46,125,50,0.3);
}
h1 {
  font-size:24px;
  font-weight:800;
  color:#0f172a;
  text-align:center;
  letter-spacing:-0.3px;
}
.sub {
  color:#64748b;
  font-size:14px;
  text-align:center;
  margin-top:6px;
  margin-bottom:28px;
  line-height:1.5;
  word-break:break-word;
}
.field-group {
  position:relative;
  margin-bottom:18px;
}
.field-group input {
  width:100%;
  padding:16px 20px;
  border:2px solid #e2e8f0;
  border-radius:14px;
  font-size:28px;
  text-align:center;
  letter-spacing:12px;
  outline:none;
  font-family:'Inter',monospace;
  transition:border-color 0.25s, box-shadow 0.25s;
  background:#f8fafc;
  color:#0f172a;
  font-weight:700;
}
.field-group input::placeholder { color:#cbd5e1; font-weight:400; font-size:20px; }
.field-group input:focus {
  border-color:#2E7D32;
  box-shadow:0 0 0 4px rgba(46,125,50,0.1);
  background:#fff;
}
.btn {
  width:100%;
  padding:14px;
  background:linear-gradient(135deg,#2E7D32,#1B5E20);
  color:#fff;
  border:none;
  border-radius:14px;
  font-size:15px;
  font-weight:600;
  font-family:inherit;
  cursor:pointer;
  margin-top:6px;
  transition:transform 0.15s, box-shadow 0.2s;
  box-shadow:0 4px 16px rgba(46,125,50,0.3);
}
.btn:hover {
  transform:translateY(-1px);
  box-shadow:0 6px 24px rgba(46,125,50,0.4);
}
.btn:active {
  transform:translateY(0);
  box-shadow:0 2px 8px rgba(46,125,50,0.3);
}
.btn:disabled {
  opacity:0.7;
  cursor:not-allowed;
  transform:none;
}
.alt-link {
  text-align:center;
  margin-top:20px;
}
.alt-link a {
  color:#64748b;
  text-decoration:none;
  font-size:13px;
  font-weight:500;
  transition:color 0.2s;
}
.alt-link a:hover { color:#2E7D32; }
.footer {
  text-align:center;
  margin-top:18px;
  font-size:11px;
  color:#94a3b8;
  line-height:1.7;
}
@media (max-width:480px) {
  .card { padding:32px 24px 28px; border-radius:20px; }
  h1 { font-size:21px; }
  .bg-shape-1, .bg-shape-2, .bg-shape-3 { opacity:0.5; }
}
</style>
</head>
<body>
<div class="bg-shape-1"></div>
<div class="bg-shape-2"></div>
<div class="bg-shape-3"></div>
<div class="card">
  <div class="logo-wrap"><div class="logo">&#x1F4E7;</div></div>
  <h1>Verify OTP</h1>
  <p class="sub">Enter the 6-digit code sent to ${email}</p>
  <form method="post" action="/admin/login/verify-otp" id="otpForm">
    <input type="hidden" name="email" value="${email}">
    <div class="field-group">
      <input type="text" id="otp" name="otp" placeholder="000000" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" required>
    </div>
    <button type="submit" class="btn" id="otpBtn">Verify &amp; Sign In</button>
  </form>
  <div class="alt-link"><a href="/admin/login"><i class="bi bi-arrow-left"></i> Back to Sign In</a></div>
  <div class="footer">LabCoop &copy; 2026 &middot; Version 1.0</div>
</div>
<script>
(function() {
  var form = document.getElementById('otpForm');
  var btn = document.getElementById('otpBtn');
  if (form && btn) {
    form.addEventListener('submit', function() {
      btn.disabled = true;
      btn.textContent = 'Verifying...';
    });
  }
})();
</script>
</body>
</html>`;
}

function sendOtpEmail(email, otp) {
  if (!process.env.RESEND_API_KEY) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddr = process.env.RESEND_FROM_EMAIL || process.env.MAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  const fromName = process.env.MAIL_FROM_NAME || 'MYCOOPPIGGY Admin';
  const from = fromName ? `${fromName} <${fromAddr}>` : fromAddr;
  resend.emails.send({
    from,
    to: email,
    subject: 'Your LabCoop Admin OTP Code',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#2E7D32">Admin Login OTP</h2>
      <p>Use the code below to complete your sign in:</p>
      <div style="background:#e8f5e9;padding:20px;border-radius:12px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700;color:#1B5E20;margin:16px 0">${otp}</div>
      <p style="color:#888;font-size:13px">This code expires in 10 minutes.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#999;font-size:12px">If you didn't request this, you can ignore this email.</p>
    </div>`,
  }).catch(e => console.error('[AdminAuth] Resend error:', e.message));
  return true;
}

async function sendAlertEmail(subject, bodyHtml) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const admins = await store.query("SELECT email FROM admin_users WHERE role = 'super_admin' AND email != ''");
    if (!admins.rows.length) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddr = process.env.RESEND_FROM_EMAIL || process.env.MAIL_FROM_ADDRESS || 'onboarding@resend.dev';
    const fromName = process.env.MAIL_FROM_NAME || 'LabCoop Security';
    const from = fromName ? `${fromName} <${fromAddr}>` : fromAddr;
    for (const admin of admins.rows) {
      resend.emails.send({ from, to: admin.email, subject, html: bodyHtml })
        .catch(e => console.error('[AlertEmail] Error sending to', admin.email, e.message));
    }
  } catch (e) {
    console.error('[AlertEmail] Error:', e.message);
  }
}

// ── Routes ──

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const error = req.query.error || '';
  res.type('html').send(loginPage(error));
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5,
  handler: (req, res) => {
    res.redirect('/admin/login?error=' + encodeURIComponent('Too many login attempts. Try again in 15 minutes.'));
  },
  standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, async (req, res) => {
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

  // ── Account lockout check ──
  const attempts = Number(adminUser.login_attempts) || 0;
  const lockedUntil = adminUser.locked_until;
  if (lockedUntil && new Date(lockedUntil) > new Date()) {
    const remaining = Math.ceil((new Date(lockedUntil) - new Date()) / 60000);
    return res.type('html').send(loginPage(`Account locked due to too many failed attempts. Try again in ${remaining} minute(s).`));
  }

  const match = await bcrypt.compare(password, adminUser.password_hash);
  if (!match) {
    await log(req, 'admin_login_failed', 'admin_user', adminUser.admin_id, { username, reason: 'wrong_password' });
    const newAttempts = attempts + 1;
    if (newAttempts >= LOCK_THRESHOLD) {
      const lockTime = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      await store.query('UPDATE admin_users SET login_attempts = $1, locked_until = $2 WHERE admin_id = $3',
        [newAttempts, lockTime, adminUser.admin_id]);
      await sendAlertEmail(
        'Security Alert: Admin Account Locked',
        `<p>The admin account <b>${username}</b> has been locked due to ${newAttempts} failed login attempts.</p><p>IP: ${req.ip}</p><p>Time: ${new Date().toISOString()}</p>`
      );
      return res.type('html').send(loginPage(`Account locked after ${newAttempts} failed attempts. Try again in 15 minutes.`));
    }
    await store.query('UPDATE admin_users SET login_attempts = $1 WHERE admin_id = $2', [newAttempts, adminUser.admin_id]);
    return res.type('html').send(loginPage('Invalid username or password.'));
  }

  // Check if 2FA is enabled
  if (adminUser.totp_enabled) {
    req.session.totpAuthId = adminUser.admin_id;
    req.session.totpAuthName = username;
    await store.query('UPDATE admin_users SET login_attempts = 0, locked_until = NULL WHERE admin_id = $1', [adminUser.admin_id]);
    return res.type('html').send(totpPage(''));
  }

  // ── Login success (no 2FA) ──
  await clearLoginAttempts(username);
  await store.query('UPDATE admin_users SET last_login_at = $1, last_login_ip = $2 WHERE admin_id = $3',
    [new Date().toISOString(), req.ip || '', adminUser.admin_id]);

  req.session.regenerate(async (err) => {
    if (err) return res.type('html').send(loginPage('Session error. Please try again.'));
    req.session.adminId = adminUser.admin_id;
    req.session.adminName = adminUser.display_name || adminUser.username;
    req.session.adminRole = adminUser.role;
    await log(req, 'admin_login', 'admin_user', adminUser.admin_id, { username: adminUser.username, role: adminUser.role });
    res.redirect('/admin');
  });
});

// ── TOTP Verification ──

router.get('/login/totp', (req, res) => {
  if (!req.session.totpAuthId) return res.redirect('/admin/login');
  res.type('html').send(totpPage(''));
});

// Rate limiter for 2FA TOTP attempts: 5 per 15 minutes per pending-login session
const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.session?.totpAuthId || ipKeyGenerator(req.ip),
  handler: (req, res) => {
    res.type('html').send(totpPage('Too many 2FA code attempts. Try again in 15 minutes.'));
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login/totp', totpLimiter, async (req, res) => {
  if (!req.session.totpAuthId) return res.type('html').send(loginPage('Session expired. Please login again.'));
  const { totp } = req.body;
  if (!totp) return res.type('html').send(totpPage('Please enter the 6-digit code.'));

  const adminUser = (await store.query('SELECT * FROM admin_users WHERE admin_id = $1', [req.session.totpAuthId])).rows[0];
  if (!adminUser || !adminUser.totp_secret) {
    req.session.totpAuthId = null;
    return res.type('html').send(loginPage('2FA not configured. Please login again.'));
  }

  const verified = speakeasy.totp.verify({
    secret: adminUser.totp_secret,
    encoding: 'base32',
    token: totp.trim(),
    window: 1,
  });

  if (!verified) {
    await log(req, 'admin_totp_failed', 'admin_user', adminUser.admin_id, { username: adminUser.username });
    return res.type('html').send(totpPage('Invalid code. Try again.'));
  }

  await clearLoginAttempts(adminUser.username);
  await store.query('UPDATE admin_users SET last_login_at = $1, last_login_ip = $2 WHERE admin_id = $3',
    [new Date().toISOString(), req.ip || '', adminUser.admin_id]);

  const authId = req.session.totpAuthId;
  const authName = req.session.totpAuthName;
  req.session.totpAuthId = null;
  req.session.totpAuthName = null;

  req.session.regenerate(async (err) => {
    if (err) return res.type('html').send(loginPage('Session error. Please try again.'));
    req.session.adminId = authId;
    req.session.adminName = authName || adminUser.display_name || adminUser.username;
    req.session.adminRole = adminUser.role;
    await log(req, 'admin_totp_login', 'admin_user', authId, { username: authName || adminUser.username, role: adminUser.role });
    await sendAlertEmail(
      'Security Alert: Admin Login with 2FA',
      `<p>Admin account <b>${authName || adminUser.username}</b> logged in successfully with 2FA.</p><p>IP: ${req.ip}</p><p>Time: ${new Date().toISOString()}</p>`
    );
    res.redirect('/admin');
  });
});

router.get('/login/forgot', (req, res) => {
  res.type('html').send(forgotPage(''));
});

router.post('/login/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.type('html').send(forgotPage('err:Please enter your email.'));
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = otpRateLimit.get(email);
  if (entry && entry.count >= 3 && (now - entry.windowStart) < windowMs) {
    return res.type('html').send(forgotPage('Too many OTP requests. Try again later.'));
  }
  if (!entry || (now - entry.windowStart) >= windowMs) {
    otpRateLimit.set(email, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
  const userResult = await store.query('SELECT admin_id, email FROM admin_users WHERE username = $1', [email]);
  if (userResult.rows.length === 0) {
    return res.type('html').send(forgotPage('If that username exists, an OTP has been sent to the registered email.'));
  }
  const adminUser = userResult.rows[0];
  const targetEmail = adminUser.email || email;
  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore.set(email, { otp, expires: now + 600000 });
  const sent = sendOtpEmail(targetEmail, otp);
  if (!sent) {
    return res.type('html').send(forgotPage('err:Cannot send email — SMTP is not configured. Contact your administrator to reset your password.'));
  }
  res.type('html').send(forgotPage('If that username exists, an OTP has been sent to the registered email.'));
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    res.type('html').send(loginPage('Too many OTP verification attempts. Try again in 15 minutes.'));
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login/verify-otp', otpVerifyLimiter, async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.type('html').send(loginPage('Missing email or OTP.'));
  const stored = otpStore.get(email);
  if (!stored) return res.type('html').send(loginPage('No OTP requested for this email.'));
  if (Date.now() > stored.expires) {
    otpStore.delete(email);
    return res.type('html').send(loginPage('OTP expired. Please request a new one.'));
  }
  if (stored.otp !== otp.trim()) {
    await log(req, 'otp_verify_failed', 'admin_user', null, { email, reason: 'invalid_otp' });
    return res.type('html').send(loginPage('Invalid OTP.'));
  }
  otpStore.delete(email);
  otpRateLimit.delete(email);
  const result = await store.query('SELECT * FROM admin_users WHERE username = $1', [email]);
  if (result.rows.length === 0) {
    return res.type('html').send(loginPage('No admin account found for this email.'));
  }
  const adminUser = result.rows[0];

  await clearLoginAttempts(email);
  await store.query('UPDATE admin_users SET last_login_at = $1, last_login_ip = $2 WHERE admin_id = $3',
    [new Date().toISOString(), req.ip || '', adminUser.admin_id]);

  req.session.regenerate(async (err) => {
    if (err) return res.type('html').send(loginPage('Session error. Please try again.'));
    req.session.adminId = adminUser.admin_id;
    req.session.adminName = adminUser.display_name || email;
    req.session.adminRole = adminUser.role;
    await log(req, 'admin_otp_login', 'admin_user', adminUser.admin_id, { username: email, role: adminUser.role });
    res.redirect('/admin');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;
