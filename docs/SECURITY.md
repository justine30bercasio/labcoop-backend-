# LabCoop — Security Architecture

> **Last audit**: 2026-07-06
> **Status**: 4 CRITICAL, 7 HIGH, 8 MEDIUM, 5 LOW findings (all resolved per audit)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Authorization](#2-authorization)
3. [CSRF Protection](#3-csrf-protection)
4. [Rate Limiting](#4-rate-limiting)
5. [Data Protection](#5-data-protection)
6. [Network Security](#6-network-security)
7. [Input Validation](#7-input-validation)
8. [Audit Logging](#8-audit-logging)
9. [Parental Consent Gate](#9-parental-consent-gate)
10. [Session Security](#10-session-security)
11. [Security Compliance](#11-security-compliance)
12. [Incident Response](#12-incident-response)

---

## 1. Authentication

### 1.1 Child Authentication (JWT)

**File**: `backend/src/routes/auth.js` (line 67)

Children authenticate via:
- **PIN** (6-digit numeric) — preferred for quick mobile login
- **Password** — fallback for setup/login

**Login Flow**:
```
1. POST /api/auth/login { childName, memberId, pin }
2. Validate input → rate limit check (10/min per IP)
3. Lookup account by member_id, account_id, or child_name
4. Verify bcrypt hash of PIN/password
5. Check failed_login_attempts (lock if > 5)
6. Generate JWT (24h expiry) + refresh token (7 days)
7. Store refresh token hash in refresh_tokens table
8. Return { token, refreshToken, accountId, ... }
```

**JWT Structure**:
```javascript
{ accountId: "uuid", iat: timestamp, exp: timestamp + 24h }
```

**Token Refresh** (`POST /api/auth/refresh`):
```javascript
// Client sends refreshToken
// Server verifies hash against refresh_tokens table
// Issues new access token (15m) + new refresh token (7d rotation)
// Old refresh token revoked to prevent replay
```

### 1.2 Admin Authentication (Session + OTP)

**File**: `backend/src/routes/admin-auth.js`

```
1. GET /admin/login → login form
2. POST /admin/login { username, password }
   → Verify bcrypt hash against admin_users
   → If valid, generate 6-digit OTP, send via SendGrid
   → Store OTP in in-memory Map (15 min expiry)
3. POST /admin/login/otp { otp }
   → Verify OTP, create session
   → Log successful/attempted login to audit_log
4. Session cookie: httpOnly, secure (production), sameSite: strict, 24h expiry
```

### 1.3 Parent Authentication (JWT)

**File**: `backend/src/routes/parent.js`

Parent login uses a separate JWT system:
```javascript
{ parentId: "uuid", email: "parent@example.com", iat, exp: 24h }
```

**Rate Limits**:
- PIN login: 10 requests/min per IP
- OTP send: 3 requests/15 min per email
- Account enumeration prevented — generic response whether user exists or not

### 1.4 Forgot PIN Flow

Both children and parents have a 3-step forgot-pin flow:

1. `POST /auth/forgot-pin/send-otp` — SendGrid email with OTP to parent email
2. `POST /auth/forgot-pin/verify-otp` — Verify OTP, return reset token
3. `POST /auth/forgot-pin/reset` — Reset PIN using token

OTPs are:
- 6 digits, numeric
- Stored in memory (Map), 15-minute expiry
- Rate-limited: 3 requests/15 min per email
- Response never reveals whether email exists (prevents enumeration)

---

## 2. Authorization

### 2.1 Middleware Chain

**File**: `backend/src/middleware/auth.js`

```javascript
// Route mounting order determines auth requirements:
router.use('/accounts', authMiddleware, requireOwnership, accountsRouter);
router.use('/loans', authMiddleware, requireOwnership, loansRouter);

// Public routes (no auth):
router.use('/fcm', fcmRouter);
router.use('/kyc', kycRouter);
```

### 2.2 Middleware Functions

| Middleware | Checks | Returns |
|-----------|--------|---------|
| `authMiddleware` | JWT validity (`Authorization: Bearer <token>`) | 401 if invalid/expired |
| `requireOwnership` | `req.accountId === req.params.accountId` | 403 if mismatch |
| `requireRole(...)` | `req.session.adminRole` in allowed list | 401/403 if missing |
| `requireConsent` | `account.consent_status !== 'none'` | 403 with consentRequired: true |

### 2.3 Admin Role Levels

| Role | Level | Permissions |
|------|-------|-------------|
| `super_admin` | 4 | Full access — reset database, manage admins, system settings |
| `manager` | 3 | All operations except system/super_admin functions |
| `teller` | 2 | Daily operations — deposits, withdrawals, loan payments |
| `auditor` | 1 | Read-only — reports, audit log, statements |

**Enforcement pattern** (`backend/src/routes/admin.js`):
```javascript
const level = adminLib.ROLE_LEVELS[req.session.adminRole] ?? 4;
adminLib.setRoleLevel(level);
// Sidebar items filtered by minimum required level
```

### 2.4 Ownership Checks

- Children can only access their own accounts
- Parents can only access their linked children
- Admins can access all accounts (via session role)

### 2.5 Balance Field Protection

**File**: `backend/src/routes/accounts.js` (line 50)

The `PUT /api/accounts/:id` endpoint explicitly **excludes** financial fields:

```javascript
const { child_name, parent_phone, parent_email } = req.body;
// actual_balance, unallocated_balance are never writable via API
```

---

## 3. CSRF Protection

### 3.1 Double-Submit Cookie Pattern

**File**: `backend/src/index.js` (line 649)

```javascript
function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const headerToken = req.headers['x-csrf-token'];
  const bodyToken = req.body?._csrf || req.query?._csrf;
  const cookieToken = req.session?.csrfToken;
  const token = headerToken || bodyToken;
  if (!cookieToken || !token || token !== cookieToken) {
    return res.status(403).json({ message: 'CSRF token mismatch' });
  }
  next();
}
```

### 3.2 Token Injection

**File**: `backend/src/index.js` (line 661)

- CSRF token generated on first request: `crypto.randomBytes(32).toString('hex')`
- Token embedded into all HTML forms via client-side script:
```javascript
document.querySelectorAll('form').forEach(f => {
  const i = document.createElement('input');
  i.type = 'hidden'; i.name = '_csrf';
  i.value = '<csrfToken>';
  f.appendChild(i);
});
```

### 3.3 Multipart Form Workaround

For `multipart/form-data` forms (file uploads), the `_csrf` token is sent as a query parameter because `req.body._csrf` is empty until multer processes the body:

```html
<form action="/admin/shop/create?_csrf=<token>" method="post" enctype="multipart/form-data">
```

---

## 4. Rate Limiting

### 4.1 Global Limits

**File**: `backend/src/index.js`

| Limit | Window | Max | Scope |
|-------|--------|-----|-------|
| Global | 15 min | 500 requests | All routes |
| Login | 15 min | 20 requests | `/api/auth/*` |

### 4.2 Route-Specific Limits

| Limit | Window | Max | Route |
|-------|--------|-----|-------|
| Deposit | 15 min | 10 requests | `PUT /api/accounts/:id/deposit` |
| PIN Login | 1 min | 10 requests | `POST /api/auth/login` |
| Change PIN | 15 min | 10 requests | `POST /api/auth/change-pin` |
| OTP Send | 15 min | 3 requests | Per email (forgot-password) |

### 4.3 NGINX Rate Limits (Optional)

**File**: `nginx.conf`

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
```

---

## 5. Data Protection

### 5.1 Password Hashing

All passwords and PINs are hashed with **bcryptjs** (cost factor 10):

```javascript
const hash = bcrypt.hashSync(password, 10);  // ~10ms per hash
const valid = bcrypt.compareSync(input, storedHash);
```

### 5.2 Token Storage

- **JWT**: Stored client-side in `flutter_secure_storage` (encrypted keychain/keystore)
- **Refresh tokens**: Stored as SHA-256 hash in `refresh_tokens` table
- **Session tokens**: httpOnly, secure, sameSite cookies

### 5.3 File Upload Security

**File**: `backend/src/routes/accounts.js` (line 12)

```javascript
const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },  // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only .jpg, .jpeg, .png, .gif allowed'));
    cb(null, true);
  },
});
```

- **File type whitelist** — only image extensions allowed
- **File size limit** — 5MB maximum per upload
- **No direct filesystem access** — files go through R2 proxy with auth gating

### 5.4 KYC Document Protection

KYC documents (photos, birth certificates, IDs) are served through **auth-gated middleware only**:

```javascript
// index.js:631
// Public dirs (shop, board, parents): no auth
// Sensitive dirs (kyc, profiles, registration): auth required
if (!PUBLIC_UPLOAD_DIRS.includes(dir)) {
  return authMiddleware(req, res, () => redirectToR2(req, res, dir, file));
}
```

---

## 6. Network Security

### 6.1 HTTP Security Headers

**File**: `backend/src/index.js` (line 299)

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      formAction: ["'self'"],
      // ...
    },
  },
  frameguard: { action: 'deny' },
  strictTransportSecurity: isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));
```

### 6.2 CORS Configuration

```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'https://labcoop-backend.onrender.com'],
  credentials: true,
}));
```

### 6.3 Session Cookies

```javascript
cookie: {
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
  httpOnly: true,                                   // Not accessible via JS
  maxAge: 86400000,                                 // 24 hours
  sameSite: 'strict',                               // Same-site requests only
}
```

### 6.4 Certificate Pinning (Flutter)

**File**: `lib/core/network/dio_client.dart` (line 20)

```dart
const _pinnedCertHashes = <String>[
  // SHA-256 fingerprints of server certificates
];
```

When hashes are configured, the app validates server certificates against pinned fingerprints. Otherwise, the OS trust store is used (rejecting untrusted CAs by default).

---

## 7. Input Validation

### 7.1 Server-Side Validation

All routes use **express-validator** for input validation:

```javascript
router.put('/:accountId',
  param('accountId').isString().notEmpty().trim(),
  body('child_name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('parent_email').optional().isString().isEmail(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    // ...
  })
);
```

### 7.2 SQL Injection Prevention

All database queries use **parameterized queries** (`$1, $2` placeholders):

```javascript
// Good — parameterized
await store.query('SELECT * FROM accounts WHERE account_id = $1', [id]);

// This pattern is NEVER used:
// await store.query(`SELECT * FROM accounts WHERE account_id = '${id}'`);  // BAD
```

### 7.3 XSS Prevention

- Admin dashboard uses `textContent` instead of `innerHTML` (post-audit fix)
- User display names are HTML-escaped via `escHtml()` in admin routes
- JSON API responses use `Content-Type: application/json` (no HTML injection)

---

## 8. Audit Logging

**File**: `backend/src/services/audit.js`

All security-sensitive actions are logged:

```javascript
// Example: admin login
await log(req, 'admin_login', 'admin', adminId, { username });

// Example: failed login attempt
await log(req, 'admin_login_failed', 'admin', null, { username, reason: 'wrong_password' });

// Example: database reset
await log(req, 'reset_database', 'system', null, { tables: [...] });
```

### Logged Events

| Event | Entity Type | When |
|-------|------------|------|
| Admin login (success) | `admin` | On successful OTP verification |
| Admin login (failed) | `admin` | On wrong password or OTP |
| OTP sent | `admin` | On OTP email delivery |
| Database reset | `system` | On successful reset |
| Transaction void | `transaction` | On void operation |
| Balance changes | `account` | On deposit/withdrawal/transfer |

Audit log can be viewed at `/admin/audit-log` (requires `auditor+` role).

---

## 9. Parental Consent Gate

**File**: `backend/src/middleware/auth.js` (line 41)

Two financial operations require parental consent:
- `PUT /api/accounts/:id/deposit` — parental consent gate
- `POST /api/loans/apply` — parental consent gate

**Consent Flow**:
```
1. Child provides parent email → POST /api/parental-consent/request
2. SendGrid sends email with approval link: /approve?token=xxx
3. Parent clicks link → status = 'approved'
4. Subsequent deposit/loan requests pass through requireConsent
```

**Consent statuses**: `none` (initial) → `pending` (email sent) → `approved` | `rejected`

**API response when consent required**:
```json
{
  "message": "Parental consent required. Please submit a consent request with a parent email.",
  "consent_status": "none",
  "consentRequired": true
}
```

---

## 10. Session Security

### 10.1 Admin Sessions

- **Store**: PostgreSQL (`connect-pg-simple`) in production, memory in dev
- **Expiry**: 24 hours (`maxAge: 86400000`)
- **Renewal**: Session refreshed on each request (rolling)
- **Logout**: Session destroyed on `/admin/logout`

### 10.2 JWT Refresh Token Rotation

- Access token: 15 minutes (short-lived)
- Refresh token: 7 days (stored as SHA-256 hash)
- Rotation: Each refresh issues a new refresh token and revokes the old one
- Revocation prevents replay attacks

### 10.3 Secret Validation

```javascript
// Production refuses to start without proper secrets
if (isProduction) {
  if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-secure-random-string-in-production') {
    console.error('FATAL: JWT_SECRET must be set in production');
    process.exit(1);
  }
}
```

---

## 11. Security Compliance

### 11.1 COPPA (Children's Online Privacy Protection)

- Parental consent required before financial operations
- Privacy policy at `/legal/privacy` (COPPA-compliant)
- Terms of service at `/legal/terms`
- Account deletion request flow available
- Parent can request child data deletion

### 11.2 BIR Compliance (Philippines)

- Double-entry accounting with audit trail
- Withholding tax on interest (20%) and dividends (10%)
- Official Receipt (OR) series management
- BIR-format financial reports (General Journal, Trial Balance, etc.)
- Period locking prevents back-dated entries

### 11.3 Child Privacy

- **Leaderboard pseudonyms**: All entrants displayed as "Player N" (not real names)
- **Profile photos**: Child's face visible only to linked parent and authorized admins
- **No public profiles**: All account data requires authentication
- **Flutter Secure Storage**: Tokens stored in encrypted keychain/keystore

---

## 12. Incident Response

### 12.1 Security Audit Findings (2026-07-06)

| Severity | Count | Examples | Status |
|----------|-------|----------|--------|
| CRITICAL | 4 | Live credentials in code, xlsx RCE (migrated to exceljs), SSRF (games proxy hostname validation), balance manipulation (locked fields) | **Resolved** |
| HIGH | 7 | CSRF, OT P logging, HSTS, XSS, account enumeration | **Resolved** |
| MEDIUM | 8 | GCash API exposure, KYC file serving, JWT expiry, dependencies | **Resolved** |
| LOW | 5 | Missing headers, debug endpoints, password policy | **Resolved** |

### 12.2 Emergency Procedures

1. **Compromised JWT_SECRET**: Rotate immediately in Render env vars, restart service. All existing tokens invalidated.
2. **Breach detected**: Run audit log query to identify affected accounts. Force password reset.
3. **Rate limit abuse**: Adjust limits in Express/NGINX config. Add IP blocklist.
4. **Database compromise**: Restore from latest backup (`scripts/backup.sh`). Rotate all secrets.

### 12.3 Monitoring

- Health endpoint: `GET /api/health` (monitored by Render)
- Audit log: `/admin/audit-log` (daily review recommended for super_admin)
- Failed logins: Logged in audit_log with IP address
- Scheduler errors: Captured in `runAllJobs()` results, logged to console