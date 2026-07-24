# LabCoop — Environment Variables Reference

> **File location**: `backend/.env`
> **Template**: `backend/.env.example`

---

## Required Environment Variables

### Database

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (starts with `postgres://` or `postgresql://`). Leave empty for SQLite dev mode. | Production | (empty → SQLite) |

### Security Secrets

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `JWT_SECRET` | JWT signing key. Generate with `openssl rand -hex 32`. **Production fails if unset or default**. | **Yes** | Auto-generated in dev |
| `SESSION_SECRET` | Express session key. Generate with `openssl rand -hex 32`. **Production fails if unset or default**. | **Yes** | Auto-generated in dev |

**Production validation** (`backend/src/index.js:270-290`):
```javascript
if (isProduction) {
  if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-secure-random-string-in-production') {
    process.exit(1);
  }
}
```

### Email (SendGrid)

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SENDGRID_API_KEY` | SendGrid API key (starts with `SG.`) | **Yes** | — |
| `SENDGRID_FROM_EMAIL` | Verified sender email address | **Yes** | `itsmejus10its@gmail.com` |

> SendGrid is used for OTP delivery, forgot-pin emails, and parental consent emails.
> Render blocks outbound SMTP (ports 465, 587) — SendGrid's HTTPS API on port 443 works.

### File Storage (Cloudflare R2)

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID (found in R2 dashboard) | **Yes** | — |
| `R2_ACCESS_KEY_ID` | R2 API access key ID | **Yes** | — |
| `R2_SECRET_ACCESS_KEY` | R2 API secret key | **Yes** | — |
| `R2_BUCKET_NAME` | R2 bucket name | No | `labcoop` |
| `R2_PUBLIC_URL` | Public URL for R2 bucket (e.g., `https://pub-xxxxx.r2.dev`) | **Yes** | — |

### Background Jobs (QStash)

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `QSTASH_CURRENT_SIGNING_KEY` | QStash current signing key (found in QStash dashboard → Settings) | **Yes** | — |
| `QSTASH_NEXT_SIGNING_KEY` | QStash next signing key (for key rotation) | **Yes** | — |

---

## Optional Environment Variables

### Payments (PayMongo)

| Variable | Description | Default |
|----------|-------------|---------|
| `PAYMONGO_SECRET` | PayMongo secret key (`sk_live_xxx` or `sk_test_xxx`) | — |
| `PAYMONGO_PUBLIC` | PayMongo public key (`pk_live_xxx` or `pk_test_xxx`) | — |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signature secret (`whsec_xxx`) | — |

If unset, PayMongo features return `"PayMongo not configured"`.

### Push Notifications (Firebase)

| Variable | Description | Default |
|----------|-------------|---------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase Admin SDK service account JSON as a single-line string | — |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON file (alternative to env var) | — |

If both unset, push notifications are disabled. A warning is logged on startup.

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment: `development` or `production` | `development` |
| `CORS_ORIGIN` | Comma-separated allowed CORS origins | `http://localhost:3000,https://labcoop-backend.onrender.com` |

### Backup

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_S3_BUCKET` | S3 bucket for offsite backup storage (used by `scripts/backup.sh`) | — |
| `BACKUP_RETENTION_DAYS` | Days to retain local backup files | `30` |

---

## Complete .env Template

```env
# ── Environment ──
NODE_ENV=development
PORT=3000

# ── Database ──
# PostgreSQL: DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
# SQLite (local dev): Leave commented out
DATABASE_URL=

# ── Security Secrets ──
# Generate: openssl rand -hex 32
JWT_SECRET=change-this-to-a-secure-random-string-in-production
SESSION_SECRET=labcoop-session-secret-2026

# ── SendGrid (Email) ──
SENDGRID_API_KEY=SG.your-api-key-here
SENDGRID_FROM_EMAIL=itsmejus10its@gmail.com

# ── Cloudflare R2 (File Storage) ──
R2_ACCOUNT_ID=your-r2-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=labcoop
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# ── QStash (Background Jobs) ──
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# ── PayMongo (Payments) ──
PAYMONGO_SECRET=
PAYMONGO_PUBLIC=
PAYMONGO_WEBHOOK_SECRET=

# ── Firebase (Push Notifications) ──
# Option A: Paste entire service account JSON as a single line
FIREBASE_SERVICE_ACCOUNT_JSON=

# Option B: Path to service account file
# FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json

# ── CORS ──
CORS_ORIGIN=http://localhost:3000,https://labcoop-backend.onrender.com
```

---

## Render Dashboard Variable Setup

When deploying on Render, set these as **Environment Variables** (not as a `.env` file):

| Variable | Render Type | Notes |
|----------|-------------|-------|
| `NODE_ENV` | plain text | Set to `production` |
| `DATABASE_URL` | plain text | From Aiven connection details |
| `JWT_SECRET` | secret | Generate with `openssl rand -hex 32` |
| `SESSION_SECRET` | secret | Generate with `openssl rand -hex 32` |
| `SENDGRID_API_KEY` | secret | From SendGrid |
| `SENDGRID_FROM_EMAIL` | plain text | Must be verified in SendGrid |
| `R2_ACCOUNT_ID` | plain text | From R2 dashboard |
| `R2_ACCESS_KEY_ID` | secret | R2 API token |
| `R2_SECRET_ACCESS_KEY` | secret | R2 API token |
| `R2_BUCKET_NAME` | plain text | `labcoop` |
| `R2_PUBLIC_URL` | plain text | Your R2 public URL |
| `QSTASH_CURRENT_SIGNING_KEY` | secret | From Upstash |
| `QSTASH_NEXT_SIGNING_KEY` | secret | From Upstash |
| `PAYMONGO_SECRET` | secret | From PayMongo |
| `PAYMONGO_PUBLIC` | plain text | From PayMongo |
| `PAYMONGO_WEBHOOK_SECRET` | secret | From PayMongo |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | Paste full Firebase JSON |

> **Render Secret Files** (alternative for large values like Firebase JSON):
> Render supports mounting secret files. Use `FIREBASE_SERVICE_ACCOUNT_PATH` to point to the mounted file path instead.

---

## Validation on Startup

When the server starts, it validates critical environment variables:

```javascript
// Production: fails hard if missing
if (isProduction) {
  if (!JWT_SECRET || default) process.exit(1);
  if (!SESSION_SECRET || default) process.exit(1);
}

// Warnings for optional but recommended
if (!SENDGRID_API_KEY) console.warn('Email notifications disabled');
if (!FIREBASE_SERVICE_ACCOUNT_JSON) console.warn('Push notifications disabled');
if (!PAYMONGO_SECRET) console.warn('Online deposits disabled');
if (!R2_ACCOUNT_ID) {
  console.warn('File uploads disabled (uploads will fall back to local disk)');
}
```

---

## Flutter Build Variables

Set at Flutter build time via `--dart-define`:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://labcoop-backend.onrender.com` | Backend API base URL |

```bash
# Override for development
flutter run --dart-define=BASE_URL=http://localhost:3000

# Production build
flutter build apk --dart-define=BASE_URL=https://api.labcoop.icdec.ph
```