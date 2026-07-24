# LabCoop — Deployment Guide

> **Production Environment**: Render (backend) + Aiven (PostgreSQL) + Cloudflare R2 (file storage)
> **CI/CD**: Auto-deploy from GitHub on push to `main` branch

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup](#2-local-development-setup)
3. [Production Deployment (Render + Aiven)](#3-production-deployment-render--aiven)
4. [File Storage (Cloudflare R2)](#4-file-storage-cloudflare-r2)
5. [Background Jobs (QStash)](#5-background-jobs-qstash)
6. [Push Notifications (Firebase)](#6-push-notifications-firebase)
7. [Email (SendGrid)](#7-email-sendgrid)
8. [Payments (PayMongo)](#8-payments-paymongo)
9. [Docker Deployment](#9-docker-deployment)
10. [PM2 Process Management](#10-pm2-process-management)
11. [Backup & Restore](#11-backup--restore)
12. [Flutter Build](#12-flutter-build)
13. [Monitoring & Health Checks](#13-monitoring--health-checks)

---

## 1. Prerequisites

### Software Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18.x LTS | Backend runtime |
| npm | 9.x+ | Package manager |
| PostgreSQL | 15.x | Production database |
| Flutter | 3.x | Mobile app build |
| Docker (optional) | 24.x+ | Containerized deployment |
| PM2 (optional) | 5.x+ | Process management |

### Accounts Required

| Service | Purpose | Cost |
|---------|---------|------|
| [Render](https://render.com) | Web service hosting | Free tier available |
| [Aiven](https://aiven.io) | Managed PostgreSQL | $7/mo minimum |
| [Cloudflare](https://cloudflare.com) | R2 object storage | Free tier (10GB) |
| [Upstash](https://upstash.com) | QStash HTTP cron | Free tier (10k req/mo) |
| [SendGrid](https://sendgrid.com) | Transactional email | Free tier (100/day) |
| [Firebase](https://firebase.google.com) | Push notifications | Free tier |
| [PayMongo](https://paymongo.com) | Payment gateway | Per-transaction fee |
| [GitHub](https://github.com) | Source control | Free |

---

## 2. Local Development Setup

### 2.1 Clone and Install

```bash
git clone <repo-url> labcoop
cd labcoop

# Install backend dependencies
cd backend
npm install
```

### 2.2 Configure Environment

Copy the template and customize:

```bash
cp .env.example .env
```

Edit `backend/.env` with your local settings. At minimum:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=  # Leave empty for SQLite
JWT_SECRET=  # Auto-generated if empty
SESSION_SECRET=  # Auto-generated if empty
```

### 2.3 Start Backend

```bash
# Development with auto-reload
npm run dev

# The server will:
# 1. Auto-create SQLite database (labcoop.db)
# 2. Seed demo accounts (Juan, Maria)
# 3. Seed shop items, quiz questions, GL accounts
# 4. Create default admin user (admin / admin123)
# 5. Start hourly scheduler (dev mode only)
```

Server starts at `http://localhost:3000`.

### 2.4 Test API

```bash
# Health check
curl http://localhost:3000/api/health

# Login as Juan
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"childName":"Juan","memberId":"000001","password":"<seed_password>"}'

# Admin dashboard
open http://localhost:3000/admin
```

### 2.5 Local PostgreSQL (via Docker)

```bash
# Start PostgreSQL + backend
docker-compose up -d

# Set DATABASE_URL in .env:
DATABASE_URL=postgres://labcoop:labcoop_secret@localhost:5432/labcoop

# Restart backend (will auto-create schema)
npm run dev
```

---

## 3. Production Deployment (Render + Aiven)

### 3.1 Aiven PostgreSQL Setup

1. **Create an Aiven account** at [console.aiven.io](https://console.aiven.io)
2. **Create a PostgreSQL service**:
   - Service: PostgreSQL
   - Plan: Startup (minimum $7/mo)
   - Cloud: Google Cloud (asiaeast1 preferred for PH)
   - Service name: `labcoop-pg`
3. **Get connection string**:
   - Go to Service Settings → Connection Information
   - Copy the `DATABASE_URI` (format: `postgres://user:pass@host:port/db?sslmode=require`)
4. **Add IP allowlist**:
   - Under Service Settings → IP Allowlist
   - Add Render's outbound IPs (or allow all for Render, 0.0.0.0/0)

### 3.2 Render Web Service Setup

1. **Create a new Web Service** in Render Dashboard
2. **Connect GitHub repo** — select the `labcoop` repository
3. **Configure service**:

| Setting | Value |
|---------|-------|
| **Name** | `labcoop-backend` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node src/index.js` |
| **Branch** | `main` |
| **Health Check Path** | `/api/health` |

4. **Add Environment Variables** (see [ENV.md](./ENV.md) for full list):

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your Aiven PostgreSQL connection string |
| `JWT_SECRET` | `openssl rand -hex 32` output |
| `SESSION_SECRET` | `openssl rand -hex 32` output |
| `SENDGRID_API_KEY` | Your SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Verified sender email |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | `labcoop` |
| `R2_PUBLIC_URL` | R2 public URL (e.g., `https://pub-xxx.r2.dev`) |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash signing key |
| `QSTASH_NEXT_SIGNING_KEY` | QStash next signing key |
| `PAYMONGO_SECRET` | PayMongo secret key (sk_live_...) |
| `PAYMONGO_PUBLIC` | PayMongo public key (pk_live_...) |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook secret |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service account JSON |

5. **Deploy** — Render will:
   - Pull code from GitHub
   - Install dependencies
   - Start the server
   - Monitor health endpoint for readiness

### 3.3 Custom Domain Setup

| Domain | Target | CNAME Record |
|--------|--------|-------------|
| `api.labcoop.icdec.ph` | Render service URL | CNAME to `labcoop-backend.onrender.com` |
| `admin.labcoop.icdec.ph` | Same Render service | CNAME to `labcoop-backend.onrender.com` |

Both domains point to the same Express server — routing is handled by the app (admin routes at `/admin`, API at `/api`).

---

## 4. File Storage (Cloudflare R2)

### 4.1 R2 Bucket Setup

1. Go to **Cloudflare Dashboard → R2**
2. Create bucket: `labcoop`
3. **Create API token**:
   - Permissions: Object Read & Write
4. **Configure public access** (optional, for images):
   - Set up a custom domain or use the `.r2.dev` URL
   - Enable public access on the bucket

### 4.2 Upload Directory Structure

Created on every server start:

```
uploads/
├── shop/         # Shop item images (public)
├── board/        # Board of directors photos (public)
├── parents/      # Parent ID photos (public)
├── profiles/     # Profile photos (auth required)
├── kyc/          # KYC documents (auth required)
└── registration/ # Registration documents (auth required)
```

### 4.3 File Serving Flow

```
Request: GET /uploads/shop/avatar.png
   │
   ├──> Public dir? (shop, board, parents)
   │      └── 302 Redirect → https://r2-public-url/shop/avatar.png
   │
   └──> Sensitive dir? (kyc, profiles, registration)
          └── JWT Auth Required → 302 Redirect → https://r2-public-url/kyc/doc.pdf
```

---

## 5. Background Jobs (QStash)

### 5.1 QStash Setup (Production)

1. Sign up at [upstash.com/qstash](https://upstash.com/qstash)
2. **Get signing keys**:
   - Go to QStash Dashboard → Settings → Signing Keys
   - Copy `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`
3. **Create a cron job**:
   ```bash
   curl -X POST https://qstash.upstash.io/v1/schedules \
     -H "Authorization: Bearer <QSTASH_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "cron": "0 * * * *",
       "url": "https://labcoop-backend.onrender.com/api/scheduler/tick",
       "method": "POST"
     }'
   ```
   The cron fires every hour (`0 * * * *`).

### 5.2 How It Works

```
QStash (every hour)
   │
   │ POST /api/scheduler/tick
   │ Headers: upstash-signature
   ▼
scheduler-tick.js
   │
   │ 1. Verify QStash signature via @upstash/qstash Receiver
   │ 2. Call runAllJobs()
   ▼
scheduler.js
   │
   │ 1. Acquire scheduler lock (prevents concurrent runs)
   │ 2. Process interest credits (daily/monthly/yearly)
   │ 3. Process standing orders due
   │ 4. On 1st of month at 3AM: run monthly accrual
   │ 5. Release scheduler lock
   ▼
Results returned as JSON response
```

### 5.3 Dev Mode Fallback

In `NODE_ENV !== 'production'`, the scheduler runs via `setInterval` every 60 minutes:

```javascript
// backend/src/index.js:763 (startup)
if (process.env.NODE_ENV !== 'production') {
  startScheduler();  // setInterval-based
} else {
  // QStash-based — no setInterval
}
```

---

## 6. Push Notifications (Firebase)

### 6.1 Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a project (or use existing)
3. **Get Service Account JSON**:
   - Project Settings → Service Accounts
   - Generate new private key
   - Copy the full JSON content
4. **Set environment variable**:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON=<paste entire JSON here>
   ```
   *Alternative:* Save to file and use `FIREBASE_SERVICE_ACCOUNT_PATH`.

### 6.2 Diagnostic Check

```bash
GET /api/health
# Response includes:
# firebase: {
#   configured: true,
#   initialized: true,
#   hasJsonEnvVar: true,
#   jsonEnvLength: 2345
# }
```

---

## 7. Email (SendGrid)

### 7.1 Setup

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. **Create API key**:
   - Settings → API Keys → Create Key
   - Full Access or Restricted to Mail Send
3. **Verify Sender**:
   - Settings → Sender Authentication
   - Verify single sender: `itsmejus10its@gmail.com` (in use) or your own email
4. **Set environment variables**:
   ```
   SENDGRID_API_KEY=SG.xxxxx
   SENDGRID_FROM_EMAIL=your-verified@email.com
   ```

### 7.2 Test Configuration

```bash
GET /parent/debug-smtp
# Response:
# {
#   "hasSendGridKey": "✓ set",
#   "fromEmail": "itsmejus10its@gmail.com",
#   "verifyResult": "✓ SendGrid OK"
# }
```

### 7.3 Why SendGrid (not SMTP)

Render's free tier blocks outbound SMTP (ports 465, 587 time out). SendGrid uses HTTPS API on port 443, which is allowed.

---

## 8. Payments (PayMongo)

### 8.1 Setup

1. Sign up at [paymongo.com](https://paymongo.com)
2. **Get API keys** from Dashboard → Developers → API Keys
3. **Set up webhook**:
   - URL: `https://labcoop-backend.onrender.com/api/webhooks/paymongo`
   - Events: `payment_intent.payment_succeeded`, `payment.paid`, `checkout_session.payment.paid`
   - Copy the webhook secret
4. **Set environment variables**:
   ```
   PAYMONGO_SECRET=sk_live_xxx
   PAYMONGO_PUBLIC=pk_live_xxx
   PAYMONGO_WEBHOOK_SECRET=whsec_xxx
   ```

### 8.2 Test

```bash
GET /api/test-paymongo-key
# Response:
# { "configured": true, "apiReachable": true, "message": "Key is valid (got 404 as expected)" }
```

---

## 9. Docker Deployment

### 9.1 Build & Run

```bash
# Build image
docker build -t labcoop-backend -f Dockerfile .

# Run with docker-compose (backend + PostgreSQL)
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

### 9.2 Dockerfile (Multi-stage)

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production && cp -r node_modules /prod_modules
COPY backend/ .

FROM node:18-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
USER appuser
CMD ["node", "src/index.js"]
```

### 9.3 Docker Compose

```yaml
services:
  backend:
    build: .
    ports: ["3000:3000"]
    depends_on:
      postgres: { condition: service_healthy }
    env_file: [backend/.env]
    volumes: [uploads:/app/uploads]

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: labcoop
      POSTGRES_USER: labcoop
      POSTGRES_PASSWORD: labcoop_secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U labcoop"]
```

---

## 10. PM2 Process Management

### 10.1 Production Process Config

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'labcoop-backend',
    script: 'src/index.js',
    cwd: './backend',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    max_restarts: 10,
    restart_delay: 5000,
    env: { NODE_ENV: 'production' },
  }]
};
```

### 10.2 PM2 Commands

```bash
# Start
npm run pm2:start

# Stop
npm run pm2:stop

# Monitor
pm2 monit

# Logs
pm2 logs labcoop-backend
```

---

## 11. Backup & Restore

### 11.1 Automated Backup Script

Location: `scripts/backup.sh`

```bash
# Manual backup
bash scripts/backup.sh

# Backup will create:
# backups/labcoop_20260724_030000.sql.gz
```

Configurable via environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `BACKUP_S3_BUCKET` | — | Optional S3 destination |
| `BACKUP_RETENTION_DAYS` | 30 | Local retention period |

### 11.2 Cron Setup (Server)

```bash
# Add to crontab (runs daily at 3 AM)
0 3 * * * /path/to/labcoop/scripts/backup.sh
```

### 11.3 Restore from Backup

```bash
# Find latest backup
ls -t backups/labcoop_*.sql.gz | head -1

# Restore
gunzip -c backups/labcoop_20260724_030000.sql.gz | psql "$DATABASE_URL"
```

---

## 12. Flutter Build

### 12.1 Prerequisites

```bash
# Install Flutter SDK 3.x
# Install platform tools (Android Studio / Xcode)

# Get dependencies
flutter pub get

# Generate JSON serialization code
dart run build_runner build --delete-conflicting-outputs
```

### 12.2 Build APK (Android)

```bash
# Development build
flutter run

# Production APK with custom backend URL
flutter build apk --dart-define=BASE_URL=https://labcoop-backend.onrender.com

# Release build (signed)
flutter build apk --release

# App Bundle (Play Store)
flutter build appbundle
```

### 12.3 Build IPA (iOS)

> **Note**: Requires macOS with Xcode.

```bash
flutter build ios
# Archive via Xcode or:
flutter build ipa
```

**iOS Dependency Note**: `firebase_core` upgraded to ^4.0.0 and `firebase_messaging` to ^16.0.0 to match Firebase iOS SDK 11.x, resolving `GoogleDataTransport` CocoaPods conflict with MLKit.

### 12.4 Code Quality

```bash
# Analyze
flutter analyze

# Tests
flutter test
```

---

## 13. Monitoring & Health Checks

### 13.1 Health Endpoint

```json
GET /api/health

{
  "status": "ok",
  "dbConnected": true,
  "paymongoConfigured": true,
  "firebase": {
    "configured": true,
    "initialized": true,
    "hasJsonEnvVar": true,
    "jsonEnvLength": 2345
  },
  "timestamp": "2026-07-24T10:00:00.000Z"
}
```

### 13.2 NGINX Configuration (Self-Hosted)

If deploying behind nginx (see `nginx.conf`):

```nginx
# Features:
# - Static asset serving
# - Public uploads (shop, board) served directly
# - All other uploads proxied through auth-gated Node
# - Rate limiting (30r/s API, 5r/m login)
# - Security headers (HSTS, X-Frame-Options, CSP)
# - Deny .env / .git / node_modules access

# Enable HTTPS section and configure SSL certificates for production
```

### 13.3 Render-Specific Notes

- **Ephemeral filesystem**: Upload directories are recreated on every deploy. Persistent files MUST use Cloudflare R2.
- **Free tier sleep**: Free web services spin down after inactivity. $7+/mo services stay awake.
- **SSL**: Render provides automatic SSL certificates via Let's Encrypt.