# LabCoop — API Reference

> **Base URL**: `https://api.labcoop.icdec.ph` (production) / `http://localhost:3000` (development)
> All API routes are mounted at both `/api` and `/api/v1`.

---

## Table of Contents

1. [Authentication & Accounts](#1-authentication--accounts)
2. [Savings & Banking Features](#2-savings--banking-features)
3. [Loans](#3-loans)
4. [Transactions](#4-transactions)
5. [Goals](#5-goals)
6. [Badges](#6-badges)
7. [Quiz](#7-quiz)
8. [Co-op Goals](#8-co-op-goals)
9. [Shop](#9-shop)
10. [Gamification](#10-gamification)
11. [Parent Portal](#11-parent-portal)
12. [KYC & Compliance](#12-kyc--compliance)
13. [Payments (PayMongo)](#13-payments-paymongo)
14. [Admin Dashboard (HTML)](#14-admin-dashboard-html)
15. [Utilities](#15-utilities)

---

## Authentication

All authenticated API requests (except auth endpoints) require:

```
Authorization: Bearer <jwt_token>
```

Token expiry: **24 hours**. Refresh via `POST /api/auth/refresh`.

---

## 1. Authentication & Accounts

### `POST /api/auth/login`
Authenticate a child account via PIN or password.

**Rate Limit**: 10 requests/minute per IP (brute force protection).

**Request Body**:
```json
{
  "childName": "Juan",
  "memberId": "000001",
  "pin": "123456"
}
```
`childName`, `accountId`, or `memberId` required. `pin` or `password` required.

**Response** (200):
```json
{
  "token": "eyJhbG...",
  "refreshToken": "...",
  "accountId": "uuid",
  "childName": "Juan",
  "actual_balance": 1500.00,
  "unallocated_balance": 200.00,
  "current_xp": 45,
  "kycStatus": "",
  "password_changed": 0,
  "consent_status": "approved"
}
```

### `POST /api/auth/register`
Register a new child account.

**Request Body** (multipart/form-data):
| Field | Type | Required |
|-------|------|----------|
| `child_name` | string | yes |
| `member_id` | string | yes |
| `password` | string | yes |
| `parent_phone` | string | yes |
| `parent_email` | string | yes |
| `photo_2x2` | file | no |
| `birth_cert` | file | no |

### `POST /api/auth/register-with-photos`
Same as register, but accepts photos in a separate multipart field structure.

### `POST /api/auth/refresh`
Refresh JWT access token.

**Request Body**: `{ "refreshToken": "..." }`

### `POST /api/auth/change-pin`
Change account PIN.

**Rate Limit**: 10 attempts/15 min per account.

**Headers**: `Authorization: Bearer <token>`

**Request Body**: `{ "currentPin": "1234", "newPin": "5678" }`

### `POST /api/auth/forgot-pin/send-otp`
Send OTP to parent email for PIN reset.

**Request Body**: `{ "childName": "Juan", "memberId": "000001" }`

### `POST /api/auth/forgot-pin/verify-otp`
Verify OTP and get reset token.

**Request Body**: `{ "childName": "Juan", "memberId": "000001", "otp": "123456" }`

### `POST /api/auth/forgot-pin/reset`
Reset PIN using verified OTP token.

**Request Body**: `{ "childName": "Juan", "memberId": "000001", "token": "...", "newPin": "5678" }`

### `GET /api/accounts`
List all accounts (returns id, member_id, child_name, created_at).

**Auth**: JWT required.

### `GET /api/accounts/:accountId`
Get full account details.

**Auth**: JWT + Own account.

### `PUT /api/accounts/:accountId`
Update account profile fields.

**Auth**: JWT + Own account.

**Request Body** (partial):
```json
{
  "child_name": "New Name",
  "parent_phone": "09171234567",
  "parent_email": "parent@example.com"
}
```

> **Note**: `actual_balance`, `unallocated_balance`, and financial fields are never writable via this endpoint.

### `PUT /api/accounts/:accountId/deposit`
Deposit money into account.

**Rate Limit**: 10 requests/15 min.

**Auth**: JWT + Own account + Parental consent required.

**Request Body**: `{ "amount": 100.00 }`

### `POST /api/accounts/:accountId/profile-photo`
Upload profile photo.

**Auth**: JWT + Own account.

**Request Body**: multipart/form-data with `photo` field (jpg/png/gif, max 5MB).

### `GET /api/accounts/:accountId/goals`
List goals for account.

### `GET /api/accounts/:accountId/badges`
List badges for account.

### `GET /api/accounts/:accountId/transactions`
List transactions for account (paginated, last 50 by default).

### `GET /api/accounts/:accountId/statement`
Get account statement (paginated).

**Query Params**: `?page=1&limit=20`

### `GET /api/accounts/:accountId/savings`
Get savings information (linked product + interest summary).

### `GET /api/accounts/:accountId/summary`
Get full account summary (balance, loans, goals, XP).

---

## 2. Savings & Banking Features

### Standing Orders (Auto-Save)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/standing-orders/:accountId` | List standing orders |
| `POST` | `/api/standing-orders` | Create standing order |
| `PUT` | `/api/standing-orders/:orderId` | Update standing order |
| `DELETE` | `/api/standing-orders/:orderId` | Delete standing order |

**POST Request Body**:
```json
{
  "account_id": "uuid",
  "amount": 50.00,
  "frequency": "weekly",
  "target_goal_id": "uuid (optional)",
  "description": "Auto-save for toy"
}
```
`frequency`: `daily`, `weekly`, or `monthly`

### OR Series

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/or-series` | List all OR series |
| `POST` | `/api/or-series` | Create new OR series |
| `PUT` | `/api/or-series/:seriesId` | Update OR series |
| `POST` | `/api/or-series/:seriesId/assign` | Assign next OR number |

### Savings Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/savings-products` | List all savings products |
| `GET` | `/api/savings-products/:id` | Get savings product details |

### Interest

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/accounts/:accountId/apply-interest` | Manually apply interest to account |
| `POST` | `/api/bulk-apply-interest` | Apply interest to all eligible accounts |
| `GET` | `/api/accounts/:accountId/interest-history` | Get interest history |

### Online Deposits

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts/:accountId/online-deposits` | List online deposits |
| `POST` | `/api/online-deposits` | Create online deposit (manual) |
| `DELETE` | `/api/online-deposits/:depositId` | Cancel pending deposit |

### Withdrawal Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/withdrawal-requests` | Request a withdrawal |
| `GET` | `/api/accounts/:accountId/withdrawal-requests` | List withdrawal requests |

**POST Request Body**:
```json
{
  "account_id": "uuid",
  "amount": 200.00,
  "reason": "School supplies"
}
```

---

## 3. Loans

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/loan-products` | List loan products |
| `GET` | `/api/loan-products/:id` | Get loan product |
| `POST` | `/api/loans/preview` | Preview loan calculation |
| `GET` | `/api/loans?account_id=xxx` | List loans for account |
| `GET` | `/api/loans/:loanId` | Get loan details |
| `POST` | `/api/loans/apply` | Apply for a loan |
| `PUT` | `/api/loans/:loanId/approve` | Approve loan (admin) |
| `PUT` | `/api/loans/:loanId/disburse` | Disburse loan (admin) |
| `POST` | `/api/loans/:loanId/pay` | Make loan payment |
| `GET` | `/api/loans/:loanId/payments` | List loan payments |
| `GET` | `/api/loans/:loanId/schedule` | Get amortization schedule |

### `POST /api/loans/preview`

**Request Body**:
```json
{
  "principal": 5000,
  "interest_rate": 5.0,
  "interest_type": "flat",
  "term_months": 6
}
```

**Response**:
```json
{
  "monthly_amortization": 958.33,
  "total_interest": 750.00,
  "total_payable": 5750.00,
  "schedule": [...]
}
```

### `POST /api/loans/apply`
**Auth**: JWT + Parental consent required.

**Request Body**:
```json
{
  "account_id": "uuid",
  "product_id": "uuid (optional)",
  "principal": 5000,
  "interest_rate": 5.0,
  "interest_type": "flat",
  "term_months": 6,
  "purpose": "School supplies"
}
```

---

## 4. Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts/:accountId/transactions` | List transactions (paginated) |
| `GET` | `/api/accounts/:accountId/statement` | Get statement (paginated) |
| `POST` | `/api/transactions` | Create manual transaction |
| `POST` | `/api/transactions/:txId/void` | Void a transaction with GL reversal |

### `POST /api/transactions/:txId/void`
**Auth**: Admin only.

**Request Body**: `{ "reason": "Duplicate entry" }`

Creates a reversal GL entry, restores balances, and logs to audit.

---

## 5. Goals

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts/:accountId/goals` | List goals for account |
| `POST` | `/api/goals` | Create goal |
| `PUT` | `/api/goals/:goalId` | Update goal |
| `DELETE` | `/api/goals/:goalId` | Delete goal |
| `POST` | `/api/goals/:goalId/allocate` | Allocate funds to goal |
| `POST` | `/api/goals/:goalId/deallocate` | Deallocate funds from goal |

### `POST /api/goals`

```json
{
  "account_id": "uuid",
  "title": "New School Shoes",
  "target_amount": 1000,
  "category_icon": "shoes"
}
```

### `POST /api/goals/:goalId/allocate`
**Auth**: JWT + Own account.

```json
{
  "amount": 100.00
}
```

The amount is deducted from `unallocated_balance` atomically.

---

## 6. Badges

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts/:accountId/badges` | List badges for account |
| `POST` | `/api/badges/check-unlocks` | Check and unlock earned badges |

**Badge Thresholds** (in `app_constants.dart`):

| Badge | XP Required |
|-------|-------------|
| First Saver | 10 |
| Steady Saver | 50 |
| Goal Getter | 100 |
| Penny Pincher | 200 |
| Super Saver | 500 |
| Savings Champion | 1,000 |
| Century Club | 2,500 |
| Millionaire Mindset | 5,000 |

---

## 7. Quiz

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/quiz/questions` | List questions (filterable) |
| `POST` | `/api/quiz/questions` | Create question (admin) |
| `PUT` | `/api/quiz/questions/:id` | Update question (admin) |
| `DELETE` | `/api/quiz/questions/:id` | Delete question (admin) |
| `POST` | `/api/quiz/submit` | Submit quiz answer |

**GET Query Params**: `?difficulty=easy&category=Savings&limit=10`

**Difficulty Levels**: `easy`, `medium`, `hard`, `expert`

**Categories**: `Savings`, `Banking`, `Budgeting`, `Math`, `Investing`

### `POST /api/quiz/submit`

```json
{
  "account_id": "uuid",
  "question_id": "q_e01",
  "selected_index": 1
}
```

---

## 8. Co-op Goals

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/coop/goals` | List co-op goals |
| `POST` | `/api/coop/goals` | Create co-op goal |
| `PUT` | `/api/coop/goals/:goalId` | Update co-op goal |
| `DELETE` | `/api/coop/goals/:goalId` | Delete co-op goal |
| `POST` | `/api/coop/goals/:goalId/contribute` | Contribute to co-op goal |

### `POST /api/coop/goals/:goalId/contribute`

```json
{
  "account_id": "uuid",
  "amount": 50.00
}
```

---

## 9. Shop

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/shop` | List all shop items |
| `POST` | `/api/shop` | Create shop item (admin) |
| `PUT` | `/api/shop/:itemId` | Update shop item (admin) |
| `POST` | `/api/shop/:itemId/upload` | Upload item image |
| `POST` | `/api/shop/:itemId/purchase` | Purchase item |

Shop item types: `avatar`, `border`

---

## 10. Gamification

### Coins

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/coins/:accountId` | Get coin balance |
| `POST` | `/api/coins` | Add coins |
| `POST` | `/api/coins/spend` | Spend coins |

### Daily Spin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/spin/:accountId` | Get spin status |
| `POST` | `/api/spin` | Perform a spin |

### Games

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/games` | List games |
| `GET` | `/api/games/categories` | List game categories |
| `GET` | `/api/games/:id` | Get game details |

### Leaderboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/leaderboard` | Get XP leaderboard (pseudonyms) |

> All entrants are displayed as "Player N" to protect child privacy.

---

## 11. Parent Portal

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/parent/login` | Parent login (PIN or password) |
| `POST` | `/api/parent/send-otp` | Send OTP to parent email |
| `POST` | `/api/parent/verify-otp` | Verify OTP |
| `POST` | `/api/parent/register` | Register parent account |
| `POST` | `/api/parent/register-with-photos` | Register with ID photos |
| `POST` | `/api/parent/forgot-pin/send-otp` | Forgot PIN - send OTP |
| `POST` | `/api/parent/forgot-pin/verify-otp` | Forgot PIN - verify OTP |
| `POST` | `/api/parent/forgot-pin/reset` | Forgot PIN - reset |

### Child Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/parent/children` | List linked children |
| `POST` | `/api/parent/link-child` | Link child via code |
| `POST` | `/api/parent/approve-loan/:loanId` | Approve child loan |
| `POST` | `/api/parent/reject-loan/:loanId` | Reject child loan |
| `PUT` | `/api/parent/limits/:childId` | Set spending limits |

### Limits Structure

```json
{
  "max_daily_withdrawal": 500.00,
  "max_loan_amount": 3000.00,
  "require_approval_for": "all"
}
```

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/parent/notifications` | List parent notifications |
| `PUT` | `/api/parent/notifications/:id/read` | Mark as read |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/parent/messages` | List parent support messages |
| `POST` | `/api/parent/messages` | Send support message |

---

## 12. KYC & Compliance

### Parental Consent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/parental-consent/request` | Request parental consent |
| `GET` | `/api/parental-consent/status` | Get consent status |
| `GET` | `/approve?token=xxx` | Parent approves via email link |
| `GET` | `/api/parental-consent/resend` | Resend consent email |

### KYC Submission

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/kyc/submit` | Submit KYC documents |
| `GET` | `/api/kyc/status` | Get KYC status |

### Account Deletion

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/account-deletion/request` | Request account deletion |
| `GET` | `/api/account-deletion/status` | Get deletion status |

---

## 13. Payments (PayMongo)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/paymongo/create-payment` | Create GCash checkout session |
| `GET` | `/api/paymongo/payment-status/:depositId` | Check payment status |
| `DELETE` | `/api/paymongo/cancel-pending/:depositId` | Cancel pending payment |
| `POST` | `/api/webhooks/paymongo` | PayMongo webhook receiver |

### `POST /api/paymongo/create-payment`

```json
{
  "account_id": "uuid",
  "amount": 500.00
}
```

**Response**:
```json
{
  "deposit_id": "uuid",
  "checkout_url": "https://checkout.paymongo.com/xxx",
  "amount": 500.00
}
```

### Webhook Security

The PayMongo webhook (`/api/webhooks/paymongo`) verifies the HMAC-SHA256 signature from the `paymongo-signature` header against `PAYMONGO_WEBHOOK_SECRET`.

---

## 14. Admin Dashboard (HTML)

The admin dashboard is server-rendered HTML (not JSON API). All admin routes are mounted under `/admin` and protected by session-based authentication.

### Admin Login Flow

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/login` | Login page |
| `POST` | `/admin/login` | Submit credentials → sends OTP email |
| `POST` | `/admin/login/otp` | Verify OTP code |
| `GET` | `/admin/logout` | Logout |
| `GET` | `/admin/login/forgot` | Forgot password page |
| `POST` | `/admin/login/forgot` | Send forgot-password OTP |

### Admin Dashboard Sections

| Route | Description | Required Role |
|-------|-------------|---------------|
| `/admin` | Dashboard home | All roles |
| `/admin/members` | Member management | teller+ |
| `/admin/accounts` | Account list | teller+ |
| `/admin/deposits` | Deposit management | teller+ |
| `/admin/withdrawals` | Withdrawal management | teller+ |
| `/admin/online-deposits` | Online deposit management | manager+ |
| `/admin/loans` | Loan management | teller+ |
| `/admin/loan-products` | Loan product management | manager+ |
| `/admin/savings-products` | Savings product management | manager+ |
| `/admin/goals` | Goal management | teller+ |
| `/admin/badges` | Badge management | manager+ |
| `/admin/quiz` | Quiz management | manager+ |
| `/admin/shop` | Shop management | manager+ |
| `/admin/coop` | Co-op goals | teller+ |
| `/admin/games` | Games management | manager+ |
| `/admin/spin` | Daily spin config | manager+ |
| `/admin/transactions` | Transaction history | teller+ |
| `/admin/statement` | Account statement | teller+ |
| `/admin/kyc` | KYC verification | manager+ |
| `/admin/parents` | Parent management | teller+ |
| `/admin/parental-consent` | Consent requests | manager+ |
| `/admin/account-deletion` | Deletion requests | manager+ |
| `/admin/messages` | Support messages | teller+ |
| `/admin/board` | Board of directors | manager+ |
| `/admin/settings` | System settings | super_admin |
| `/admin/audit-log` | Audit log viewer | auditor+ |
| `/admin/backup` | Backup management | super_admin |

### Reports

| Route | Description |
|-------|-------------|
| `/admin/reports/loan-aging` | Loan aging with provision calculation |
| `/admin/reports/daily-collection` | Daily collection report |
| `/admin/reports/deposit-summary` | Deposit summary |
| `/admin/reports/member-ledger` | Member ledger |
| `/admin/reports/loan-portfolio` | Loan portfolio summary |
| `/admin/gl/trial-balance` | Trial balance |
| `/admin/gl/balance-sheet` | Balance sheet |
| `/admin/gl/profit-loss` | Profit & loss |
| `/admin/gl/journal` | General journal (BIR format) |
| `/admin/gl/ledger` | GL account ledger |
| `/admin/gl/subsidiary-ledger` | Subsidiary ledger |
| `/admin/gl/cash-flow` | Cash flow statement |
| `/admin/withholding-tax` | Withholding tax report (BIR Form 2307 equivalent) |
| `/admin/budget` | Budget vs actual |

All reports support:
- CSV export (`?export=csv`)
- Professional print layout (A4 portrait/landscape)
- Date range filtering
- BIR-compliant formatting for audit reports

---

## 15. Utilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (no auth) |
| `GET` | `/api/test-paymongo-key` | Test PayMongo connectivity |
| `GET` | `/parent/debug-smtp` | Debug email config |
| `GET` | `/legal/privacy` | Privacy policy (COPPA-compliant) |
| `GET` | `/legal/terms` | Terms of service |
| `POST` | `/api/fcm/register` | Register FCM push token |
| `POST` | `/api/fcm/unregister` | Unregister FCM push token |
| `POST` | `/api/excel/upload` | Upload Excel file for processing |
| `POST` | `/api/excel/upload-and-seed` | Upload and seed data from Excel |
| `GET` | `/api/excel/template` | Download Excel template |
| `GET` | `/api/excel/export/all` | Export all data to Excel |
| `GET` | `/api/board` | List board of directors |
| `GET` | `/api/settings/:key` | Get a setting value |
| `POST` | `/api/scheduler/tick` | QStash cron trigger (production) |

### Health Check Response

```json
{
  "status": "ok",
  "dbConnected": true,
  "paymongoConfigured": true,
  "firebase": {
    "configured": true,
    "initialized": true,
    "hasJsonEnvVar": true,
    "hasPathEnvVar": false,
    "jsonEnvLength": 2345
  },
  "timestamp": "2026-07-24T10:00:00.000Z"
}
```

---

## Error Response Format

All API errors follow this structure:

```json
{
  "message": "Human-readable error description"
}
```

Validation errors (express-validator):

```json
{
  "errors": [
    { "msg": "amount must be > 0", "param": "amount", "location": "body" }
  ]
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / Validation error |
| 401 | Missing or invalid JWT |
| 403 | Forbidden (ownership mismatch, role insufficient, consent required) |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Internal server error |