# LabCoop — System Architecture

> **Gamified Cooperative Passbook for Children**
> Version 1.0.3 | Last updated: 2026-07-11

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Component Diagram](#component-diagram)
4. [Layered Architecture](#layered-architecture)
   - [Backend Layer](#backend-layer)
   - [Flutter Frontend Layer](#flutter-frontend-layer)
   - [Data Layer](#data-layer)
5. [Data Flow](#data-flow)
6. [Module Directory Structure](#module-directory-structure)
7. [Key Design Decisions](#key-design-decisions)
8. [External Service Integration](#external-service-integration)

---

## System Overview

LabCoop is a gamified cooperative passbook system designed to teach children financial literacy through hands-on saving, goal tracking, and cooperative team challenges. The system combines a traditional savings passbook with gamification elements (XP, badges, pet evolution, town building) and a full BIR-compliant accounting backend.

### Core Domains

| Domain | Description |
|--------|-------------|
| **Savings & Banking** | Deposit/withdrawal, interest accrual, standing orders, savings products, term deposits |
| **Goal Tracking** | Personal goal jars with allocation, co-op team goals |
| **Lending** | Loan products, amortization, disbursement, payments, loan aging |
| **Gamification** | XP progression, badges, pet evolution (7 stages), Dream Town builder, daily spin |
| **Financial Literacy** | Quiz engine (80 questions, 4 difficulty levels, 4 categories) |
| **Parent Portal** | Parent account linking, spending limits, consent flow, chat with admin |
| **Accounting** | BIR-compliant double-entry GL (25 accounts), period locking, withholding tax, financial reports |
| **Admin Dashboard** | Server-rendered HTML, role-based access (super_admin, manager, teller, auditor) |

---

## Technology Stack

### Production Deployment

```
┌─────────────────────────────────────────────────────────┐
│                    Render (Web Service)                   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Node.js 18 + Express                                │ │
│  │  • API router (JSON)                                 │ │
│  │  • Admin dashboard (server-rendered HTML)             │ │
│  │  • Socket.IO (real-time chat)                         │ │
│  │  • QStash HTTP cron receiver                          │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐    ┌──────────────────────┐
│  Aiven PostgreSQL │    │  Cloudflare R2        │
│  (Managed PG 15)  │    │  (File/Object Store)  │
└──────────────────┘    └──────────────────────┘
```

### Stack Details

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend Runtime** | Node.js 18-alpine | Express HTTP server |
| **Database** | PostgreSQL 15 (Aiven) / SQLite (dev) | Relational data store |
| **Object Storage** | Cloudflare R2 | Uploaded files (KYC, profile photos, shop images, board photos) |
| **Background Jobs** | QStash (Upstash) | HTTP cron → `POST /api/scheduler/tick` every hour |
| **Push Notifications** | Firebase Cloud Messaging | Child & parent push notifications |
| **Email** | SendGrid API | OTP delivery, forgot-pin, parental consent, admin alerts |
| **Payments** | PayMongo | GCash online deposits via checkout sessions |
| **Real-time Chat** | Socket.IO | Admin-child-parent messaging |
| **Frontend** | Flutter 3.x (Dart) | Mobile app (Android + iOS) |
| **Build Tools** | Docker, PM2, Nginx | Containerization, process management, reverse proxy |
| **CI/CD** | Render auto-deploy | GitHub-connected deployment |

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUTTER MOBILE APP                               │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Dashboard │  │ Rewards  │  │  Play    │  │ Profile  │  │ Banking  │  │
│  │   Page    │  │   Page   │  │   Page   │  │   Page   │  │   Page   │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│        │              │             │             │              │        │
│  ┌─────┴──────────────┴─────────────┴─────────────┴──────────────┴─────┐ │
│  │                        BLoC Layer                                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │ │
│  │  │SavingsBloc│ │ GoalBloc │ │BankingBloc│ │ LoanBloc │ │ ...      │   │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│        │              │             │             │                      │
│  ┌─────┴──────────────┴─────────────┴─────────────┴────────────────────┐ │
│  │                     Repository Layer                                  │ │
│  │  ┌────────────────────────┐  ┌──────────────────────────────────┐    │ │
│  │  │  SavingsRepositoryImpl  │  │  BankingRepositoryImpl           │    │ │
│  │  └───────────┬────────────┘  └───────────────┬──────────────────┘    │ │
│  └──────────────┼───────────────────────────────┼───────────────────────┘ │
│                 │                               │                         │
│  ┌──────────────┼───────────────┐  ┌────────────┼──────────────────┐     │
│  │   Local Hive DB (Cache)      │  │   Remote API (Dio + JWT)       │     │
│  │   • accounts box             │  │   • BankingApiService          │     │
│  │   • transactions box         │  │   • DioClient (interceptors)   │     │
│  │   • goals box / badges box   │  │   • Token refresh              │     │
│  │   • pet box / town box / etc │  │   • Cert pinning               │     │
│  └──────────────────────────────┘  └──────────────┬──────────────────┘     │
└───────────────────────────────────────────────────┼────────────────────────┘
                                                    │
                    HTTPS + JWT Bearer              │
┌───────────────────────────────────────────────────┼────────────────────────┐
│                         EXPRESS BACKEND           │                        │
│                                                    ▼                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Middleware Stack                                                      │  │
│  │  helmet → cors → json/urlencoded → morgan → session →               │  │
│  │  globalLimiter → [router-specific middleware]                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│        │              │             │             │                        │
│  ┌─────┴──────────────┴─────────────┴─────────────┴────────────────────┐  │
│  │  Routes                                                                 │
│  │  /api/auth/*       /api/accounts/*   /api/goals/*    /api/loans/*     │  │
│  │  /api/transactions/*   /api/quiz/*   /api/coop/*     /api/shop/*      │  │
│  │  /api/parent/*     /api/kyc/*        /api/spin/*     /api/coins/*     │  │
│  │  /api/standing-orders/*   /api/fcm/*  /api/paymongo/*                 │  │
│  │  /admin/*          (server-rendered HTML dashboard)                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│        │                                                                   │
│  ┌─────┴────────────────────────────────────────────────────────────────┐  │
│  │  Services                                                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │   GL     │ │Scheduler │ │Notifs(FCM)│ │  Audit   │ │ PayMongo │   │  │
│  │  │(Accounting)│ │(Jobs)   │ │          │ │(Logging) │ │(Payments)│   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                             │  │
│  │  │  Socket  │ │FileStore│ │ Interest │                             │  │
│  │  │  (IO)   │ │  (R2)   │ │(Calc)    │                             │  │
│  │  └──────────┘ └──────────┘ └──────────┘                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│        │                                                                   │
│  ┌─────┴────────────────────────────────────────────────────────────────┐  │
│  │  Data Stores                                                           │  │
│  │  ┌────────────────────┐           ┌────────────────────────────┐     │  │
│  │  │ PgStore (PostgreSQL)│   OR     │ SqliteStore (SQLite WAL)   │     │  │
│  │  │ • Pool-based async │           │ • better-sqlite3 sync      │     │  │
│  │  │ • Auto-schema       │           │ • query() auto-converts   │     │  │
│  │  │ • Transactions      │           │   $1,$2 → ?,? params      │     │  │
│  │  └────────────────────┘           └────────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Layered Architecture

### Backend Layer

```
backend/src/
├── index.js              # Entry point, Express setup, middleware, route mounting
├── db.js                 # Database auto-detection (PG vs SQLite)
├── pg-store.js           # PostgreSQL store (~1829 lines, full schema + methods)
├── sqlite-store.js       # SQLite store (mirrors pg-store API)
├── async-handler.js      # Express async error wrapper
├── services/             # Business logic services
│   ├── gl.js             # Double-entry accounting engine
│   ├── scheduler.js      # Background job runner
│   ├── notifications.js  # FCM push service
│   ├── audit.js          # Audit logging
│   ├── socket.js         # Socket.IO real-time chat
│   ├── file-storage.js   # Cloudflare R2 S3-compatible storage
│   ├── paymongo.js       # PayMongo payment gateway
│   └── interest.js       # Loan amortization calculation
├── middleware/
│   └── auth.js           # JWT auth, role-based, ownership, consent gate
└── routes/               # Express routers (API + admin HTML)
    ├── auth.js           # Child login, register, forgot/change pin
    ├── accounts.js       # Account CRUD, deposit, profile photo
    ├── admin.js          # ~9300-line server-rendered admin dashboard
    ├── admin-auth.js     # Admin login with OTP
    ├── admin-lib.js      # Layout helper, sidebar, print layouts, role levels
    ├── admin-advanced.js # Term deposits, dividends, share capital, etc.
    ├── admin-microbank.js # GL accounts, teller cash, checks, fees, branches
    ├── admin-reports-bank.js # Bank-specific reports
    ├── banking-features.js  # Interest, OR series, standing orders
    ├── transactions.js   # Transactions + statements + void
    ├── goals.js          # Goal CRUD
    ├── loans.js          # Loan CRUD + payments + preview
    ├── coop.js           # Co-op team goals
    ├── shop.js           # Shop items + image upload
    ├── quiz.js           # Quiz questions CRUD
    ├── kyc.js            # KYC submission
    ├── parent.js         # Parent auth, linking, limits, chat
    ├── parental-consent.js # Consent flow with SendGrid
    ├── account-deletion.js # Deletion request flow
    ├── messages.js       # Support messages CRUD + typing
    ├── legal.js          # Privacy + terms pages
    ├── scheduler-tick.js # QStash-triggered job endpoint
    ├── excel.js          # Excel import/export
    ├── settings.js       # Key-value settings
    ├── leaderboard.js    # Pseudonym-protected leaderboard
    ├── fcm.js            # FCM token registration
    ├── paymongo.js       # Payment webhook handler
    ├── coins.js          # Coin transactions
    ├── spin.js           # Daily spin wheel
    ├── games.js          # Static game data
    ├── board.js          # Board of directors listing
    └── badges.js         # Badge unlock
```

### Flutter Frontend Layer

```
lib/
├── main.dart                  # App entry, Hive init, Firebase init, BLoC providers
├── firebase_options.dart      # Firebase platform config
├── core/
│   ├── constants/
│   │   └── app_constants.dart # Base URL, icon map, badge thresholds, pet evolution, town buildings, quiz questions
│   ├── di/
│   │   └── injection.dart     # Dependency injection (get_it)
│   ├── errors/
│   │   └── exceptions.dart    # Custom exceptions (NetworkException, etc.)
│   ├── network/
│   │   ├── dio_client.dart    # Dio HTTP client with auth interceptors, token refresh, cert pinning
│   │   └── banking_api_service.dart # All API methods (754 lines)
│   ├── services/
│   │   ├── inactivity_timer.dart # Auto-logout on inactivity
│   │   └── notification_service.dart # FCM token registration
│   └── theme/
│       └── app_theme.dart     # Material theme config
├── data/
│   ├── datasources/
│   │   ├── local_db_source.dart   # Hive local storage (10 boxes)
│   │   └── remote_api_source.dart # Remote API calls
│   ├── models/                # JSON serializable models
│   └── repositories/          # Repository implementations (cache-first / server-first)
├── domain/
│   ├── entities/              # Pure Dart entities (no Flutter imports)
│   └── usecases/              # Business logic use cases
└── presentation/
    ├── blocs/                 # BLoC (savings, goal, banking, loan)
    ├── pages/                 # 39 pages (dashboard, banking, play, profile, etc.)
    └── widgets/               # Reusable widgets
```

### Data Layer

**Server-First Strategy** (cache as fallback):

```
┌──────────────┐     Online?     ┌──────────────┐
│  User Action  │ ──────────────▶ │ API Call (Dio) │
└──────┬───────┘                 └──────┬─────────┘
       │                                │ Success
       │                                ▼
       │                         ┌──────────────────┐
       │                         │ Save to Hive Cache │
       │                         └────────┬─────────┘
       │                                  │
       ▼                                  ▼
┌────────────────┐           ┌─────────────────────┐
│ Return API Data │           │ Return Cached Data   │
└────────────────┘           └─────────────────────┘
       │                              ▲
       │      Offline                 │
       └─────────────────────────────┘
```

---

## Data Flow

### Deposit Flow (Complete Path)

```
Flutter App
   │
   │  PUT /api/accounts/{id}/deposit
   │  Headers: Authorization: Bearer <JWT>
   ▼
Express Backend
   │
   │  1. authMiddleware → verify JWT, extract accountId
   │  2. requireOwnership → req.accountId === req.params.accountId
   │  3. requireConsent → check consent_status !== 'none'
   │  4. depositLimiter → max 10 requests per 15 min
   │  5. express-validator → validate amount > 0
   │  6. Run in store.transaction():
   │     a. SELECT account FOR UPDATE (lock row)
   │     b. UPDATE actual_balance += amount
   │     c. UPDATE unallocated_balance += amount
   │     d. INSERT transaction record
   │     e. INSERT GL double-entry (1000 debit / 2000 credit)
   │  7. Response: { success, newBalance, transaction }
   ▼
Flutter App
   │
   │  a. Update Hive cache with new balance
   │  b. Refresh dashboard (SavingsBloc)
   ▼
User sees updated balance + celebration animation
```

### Interest Credit Flow (Scheduled Job)

```
QStash (every hour)
   │
   │  POST /api/scheduler/tick
   │  Headers: upstash-signature
   ▼
scheduler.js → runAllJobs()
   │
   │  1. Acquire scheduler_lock (prevent concurrent runs)
   │  2. For each account with balance > 0:
   │     a. Get savings_product (or sp_regular default)
   │     b. Check interest_frequency (daily/monthly/yearly)
   │     c. Check last interest date vs current period
   │     d. Calculate grossInterest = balance × rate
   │     e. Get tax_config (20% withholding if active)
   │     f. Calculate netInterest = grossInterest × (1 - taxRate)
   │     g. creditInterest() → INSERT transaction
   │     h. postDoubleEntry:
   │        5000 (Interest Expense) debit: grossInterest
   │        2400 (Tax Payable) credit: taxAmount
   │        2000 (Savings Deposits) credit: netInterest
   │  3. Process standing orders due
   │  4. If month start (1st, 3AM): run monthly accrual
   │  5. Release scheduler_lock
   ▼
Results logged, errors captured
```

---

## Module Directory Structure

### Backend (`backend/`)

```
backend/
├── .env                      # Environment variables
├── package.json              # Dependencies
├── src/
│   ├── index.js              # Entry point (~770 lines)
│   ├── db.js                 # DB auto-detection
│   ├── pg-store.js           # PostgreSQL store (~1829 lines)
│   ├── sqlite-store.js       # SQLite store
│   ├── async-handler.js      # Error wrapper
│   ├── services/
│   │   ├── gl.js             # Double-entry accounting (217 lines)
│   │   ├── scheduler.js      # Background jobs (170 lines)
│   │   ├── notifications.js  # FCM push (292 lines)
│   │   ├── audit.js          # Audit logging (21 lines)
│   │   ├── socket.js         # Socket.IO chat (193 lines)
│   │   ├── file-storage.js   # Cloudflare R2 (62 lines)
│   │   ├── paymongo.js       # PayMongo gateway (142 lines)
│   │   └── interest.js       # Loan amortization
│   ├── middleware/
│   │   └── auth.js           # Auth middleware (76 lines)
│   ├── routes/
│   │   ├── auth.js           # Child auth (587 lines)
│   │   ├── accounts.js       # Account CRUD (160 lines)
│   │   ├── admin.js          # Admin dashboard (~9300 lines)
│   │   ├── admin-auth.js     # Admin login (294 lines)
│   │   ├── admin-lib.js      # Admin layout helpers
│   │   ├── admin-advanced.js # Advanced banking
│   │   ├── admin-microbank.js # Microbanking
│   │   ├── admin-reports-bank.js # Bank reports
│   │   ├── banking-features.js # Standing orders, OR series (545 lines)
│   │   ├── transactions.js   # Transactions
│   │   ├── goals.js          # Goal CRUD
│   │   ├── loans.js          # Loan CRUD (362 lines)
│   │   ├── coop.js           # Co-op goals
│   │   ├── shop.js           # Shop items
│   │   ├── quiz.js           # Quiz CRUD
│   │   ├── kyc.js            # KYC submission
│   │   ├── parent.js         # Parent portal (975 lines)
│   │   ├── parental-consent.js # Consent flow
│   │   ├── account-deletion.js # Deletion flow
│   │   ├── messages.js       # Support messages
│   │   ├── legal.js          # Legal pages
│   │   ├── scheduler-tick.js # QStash endpoint (35 lines)
│   │   ├── excel.js          # Excel import/export
│   │   ├── settings.js       # Key-value settings
│   │   ├── leaderboard.js    # Leaderboard
│   │   ├── fcm.js            # FCM token
│   │   ├── paymongo.js       # Payment webhook (281 lines)
│   │   ├── coins.js          # Coin transactions
│   │   ├── spin.js           # Daily spin
│   │   ├── games.js          # Static game data
│   │   ├── board.js          # Board of directors
│   │   └── badges.js         # Badge unlock
│   └── public/               # Static assets (404.json, templates)
├── db/                       # Migration scripts
├── scripts/
│   └── backup.sh             # pg_dump + gzip backup
└── .env.example              # Env template
```

### Flutter (`lib/`)

```
lib/
├── main.dart                 # App entry
├── firebase_options.dart     # Firebase config
├── core/
│   ├── constants/
│   │   └── app_constants.dart
│   ├── di/
│   │   └── injection.dart
│   ├── errors/
│   │   └── exceptions.dart
│   ├── network/
│   │   ├── dio_client.dart
│   │   └── banking_api_service.dart
│   ├── services/
│   │   ├── inactivity_timer.dart
│   │   └── notification_service.dart
│   └── theme/
│       └── app_theme.dart
├── data/
│   ├── datasources/
│   │   ├── local_db_source.dart
│   │   └── remote_api_source.dart
│   ├── models/
│   └── repositories/
├── domain/
│   ├── entities/
│   └── usecases/
└── presentation/
    ├── blocs/
    │   ├── savings_bloc.dart
    │   ├── goal_bloc.dart
    │   ├── banking_bloc.dart
    │   └── loan_bloc.dart
    ├── pages/ (39 files)
    └── widgets/
```

---

## Key Design Decisions

### 1. Dual Database Support (PostgreSQL + SQLite)

**File**: `backend/src/db.js`
**Decision**: Auto-detect via `DATABASE_URL` prefix. Production uses PostgreSQL (Aiven), local dev uses SQLite.

```javascript
if (DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://')) {
  // Use PgStore
} else {
  // Use SqliteStore
}
```

The stores share a common API surface (`query()`, `transaction()`, `getAccount()`, etc.). The `sqlite-store.js` `query()` method auto-converts `$1, $2` → `?, ?` parameter placeholders, making all route code database-agnostic.

### 2. Server-First Data Strategy

**Files**: `lib/data/repositories/savings_repository_impl.dart`, `banking_repository_impl.dart`
**Decision**: All reads go to API first → cache response → return. Fall back to Hive cache only when offline. This ensures KYC status, balances, and other critical data are always fresh.

**Previous approach (cache-first) caused stale KYC status bugs** — changed to server-first on 2026-07-04.

### 3. GL Double-Entry with Period Locking

**File**: `backend/src/services/gl.js`
**Decision**: Every financial transaction posts balanced debit/credit entries with period lock enforcement. The `postDoubleEntry()` function:
- Validates all account codes exist and are active
- Checks the accounting period is not closed
- Auto-creates period if needed
- Enforces balanced entries (debits = credits, within 0.001 tolerance)
- Stores audit trail (posted_by, approved_by, reference_type, reference_number, period_id)

### 4. Account Locking via `store.transaction()`

All balance-modifying operations (deposits, transfers, loan payments) use `store.transaction()` with row-level locking (`SELECT ... FOR UPDATE` in PostgreSQL) to prevent race conditions.

### 5. Withholding Tax on Interest

Interest credits are split into gross interest (expensed to 5000), withholding tax (credited to 2400), and net amount (credited to 2000). Tax rates are configurable via the `tax_config` table.

---

## External Service Integration

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| **Aiven PostgreSQL** | Managed production database | `pg-store.js` via `pg.Pool` with `rejectUnauthorized: false` SSL |
| **Cloudflare R2** | File/object storage | `file-storage.js` via `@aws-sdk/client-s3` S3-compatible API |
| **SendGrid** | Transactional email (OTP, consent) | `@sendgrid/mail` — HTTPS API port 443 (Render blocks SMTP) |
| **QStash (Upstash)** | HTTP cron scheduler | `@upstash/qstash` Receiver for signature verification |
| **Firebase Cloud Messaging** | Push notifications | `firebase-admin` with service account JSON |
| **PayMongo** | GCash payment gateway | Custom `https` client, checkout sessions + webhook |
| **Socket.IO** | Real-time admin/parent/child chat | `socket.io` with session + JWT auth |

---

## Ports & URLs

| Environment | URL | Port |
|-------------|-----|------|
| **API (Production)** | `https://api.labcoop.icdec.ph` | 443 (Render) |
| **API (Dev)** | `http://localhost:3000` | 3000 |
| **Admin (Prod)** | `https://admin.labcoop.icdec.ph` | 443 (same Express) |
| **PostgreSQL (Prod)** | Aiven connection string | 5432 |
| **PostgreSQL (Docker)** | `postgres://labcoop:labcoop_secret@postgres:5432/labcoop` | 5432 |

---

## Related Documentation

- [API.md](./API.md) — Complete API endpoint reference
- [DATABASE.md](./DATABASE.md) — Database schema and relationships
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Deployment instructions
- [ENV.md](./ENV.md) — Environment variables reference
- [SECURITY.md](./SECURITY.md) — Security architecture
- [SCHEDULER.md](./SCHEDULER.md) — Background job system