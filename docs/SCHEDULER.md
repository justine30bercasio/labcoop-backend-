# LabCoop — Background Job System (Scheduler)

> **Files**: `backend/src/services/scheduler.js` (170 lines), `backend/src/routes/scheduler-tick.js` (35 lines)
> **Trigger**: QStash HTTP cron (production) / `setInterval` hourly (development)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Job: Interest Credits](#3-job-interest-credits)
4. [Job: Standing Orders Processing](#4-job-standing-orders-processing)
5. [Job: Monthly Accrual Accounting](#5-job-monthly-accrual-accounting)
6. [Locking Mechanism](#6-locking-mechanism)
7. [Configuration](#7-configuration)
8. [Monitoring & Troubleshooting](#8-monitoring--troubleshooting)

---

## 1. Overview

The scheduler runs a series of automated financial jobs on an hourly cadence. In production it is triggered via QStash HTTP cron; in development it runs via `setInterval`.

### What It Does

| Job | Frequency | Description |
|-----|-----------|-------------|
| **Interest Credits** | Per account schedule (daily/monthly/yearly) | Calculates and credits interest on savings balances, with withholding tax |
| **Standing Orders** | Per order schedule (daily/weekly/monthly) | Processes auto-save transfers from accounts to goals |
| **Monthly Accrual** | 1st of month, ~3:00-3:30 AM | Accrues interest receivable on loans and interest payable on savings/term deposits |

---

## 2. Architecture

### Production Flow

```
QStash (Upstash)
  │
  │  Cron: 0 * * * *  (every hour)
  │  URL: POST https://api.labcoop.icdec.ph/api/scheduler/tick
  │  Headers: upstash-signature
  ▼
scheduler-tick.js
  │
  │  1. Extract upstash-signature header
  │  2. Initialize @upstash/qstash Receiver
  │  3. Verify signature against QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY
  │  4. In production: reject if signature invalid
  │  5. In development: accept any signature (for testing)
  ▼
scheduler.js → runAllJobs()
  │
  │  1. Acquire scheduler lock
  │  2. Execute interest credits
  │  3. Execute standing orders
  │  4. Execute monthly accrual (if conditions met)
  │  5. Release scheduler lock
  ▼
Returns JSON results to QStash
```

### Development Flow

```
Backend startup (index.js:762)
  │
  │  if (NODE_ENV !== 'production') {
  │    startScheduler();  // setInterval-based fallback
  │  }
  ▼
scheduler.js → startScheduler()
  │
  │  setInterval(runAllJobs, 60 * 60 * 1000)  // Every 60 minutes
  ▼
  Logs results to console
```

### Key Decision: QStash vs setInterval

| Aspect | Production | Development |
|--------|-----------|-------------|
| **Trigger** | QStash HTTP POST | `setInterval` (Node.js) |
| **Reliability** | Managed retry, no data loss on crash | Lost on server restart |
| **Concurrency** | QStash manages cron timing | Single-process, simple |
| **Security** | HMAC-SHA256 signature verification | No auth needed (localhost) |

---

## 3. Job: Interest Credits

**File**: `backend/src/services/scheduler.js` (line 23)

### Process Flow

```
For each account with actual_balance > 0:
  │
  │  1. Get savings product (linked or default sp_regular)
  │  2. Determine interest_frequency (daily/monthly/yearly)
  │  3. Check if interest is due:
  │     - Daily: always apply (rate/365 per day)
  │     - Monthly: only if last interest was in a different month
  │     - Yearly: only if last interest was in a different year
  │
  │  4. Calculate grossInterest = balance × rate
  │     Example: ₱1,000 × 2% / 12 = ₱1.67 (monthly on sp_regular)
  │
  │  5. Check tax_config for active interest tax
  │     Default: tax_interest = 20% withholding
  │
  │  6. Calculate:
  │     taxAmount = grossInterest × 0.20
  │     netInterest = grossInterest - taxAmount
  │
  │  7. Execute:
  │     a. store.creditInterest() → insert transaction
  │     b. postDoubleEntry:
  │        5000 (Interest Expense)     debit: grossInterest
  │        2400 (Income Tax Payable)   credit: taxAmount
  │        2000 (Savings Deposits)     credit: netInterest
```

### GL Entry Example

For a ₱100 interest credit with 20% withholding tax:

| Account | Debit | Credit |
|---------|-------|--------|
| 5000 — Interest Expense | ₱100.00 | |
| 2400 — Income Tax Payable | | ₱20.00 |
| 2000 — Savings Deposits | | ₱80.00 |

### Account Balance Updates

The child's account receives only `netInterest`. The `actual_balance` is incremented by the net amount. The `interest_earned` cumulative counter is also updated.

### Error Handling

```javascript
try {
  const gl = require('./gl');
  await gl.postDoubleEntry(...);
} catch (glErr) {
  results.errors.push('GL interest post failed account_id=' + account.account_id + ': ' + glErr.message);
  // Interest is still credited to the account
  // GL entry failure is non-fatal — reported in results
}
```

---

## 4. Job: Standing Orders Processing

**File**: `backend/src/services/scheduler.js` (line 77)

Standing orders (also called "Auto-Save") are recurring transfer rules set up by children.

### Process Flow

```
Query: SELECT so.*, a.* FROM standing_orders so
       JOIN accounts a ON so.account_id = a.account_id
       WHERE so.is_active = 1 AND so.next_run <= CURRENT_TIMESTAMP

For each due order:
  │
  │  1. Check: actual_balance >= order.amount
  │     Skip if insufficient funds
  │
  │  2. Check: actual_balance - amount >= maintaining_balance
  │     Skip if would drop below minimum balance (default ₱100)
  │
  │  3. If linked to a goal:
  │     UPDATE goal_jars SET current_allocated += amount
  │
  │  4. Execute transfer:
  │     UPDATE accounts SET actual_balance -= amount,
  │                         unallocated_balance -= amount
  │     INSERT INTO transactions (type='auto_save')
  │     postDoubleEntry:
  │       5100 (Other Operating Expenses) debit: amount
  │       1000 (Cash on Hand)             credit: amount
  │
  │  5. Calculate next_run:
  │     daily:   +1 day
  │     weekly:  +7 days
  │     monthly: +1 month
  │     UPDATE standing_orders SET next_run = new_date
```

### Standing Order Schema Reminder

| Column | Description |
|--------|-------------|
| `order_id` | UUID primary key |
| `account_id` | Owner account |
| `type` | Always `transfer` |
| `target_goal_id` | Optional goal destination |
| `amount` | Transfer amount |
| `frequency` | `daily`, `weekly`, `monthly` |
| `next_run` | Next execution timestamp |
| `is_active` | 1 = active |

### Skip Conditions Logging

Orders that are skipped (insufficient funds, maintaining balance) are silently skipped — no error is raised. Only unexpected failures (e.g., database errors) are captured in `results.errors`.

---

## 5. Job: Monthly Accrual Accounting

**File**: `backend/src/services/scheduler.js` (line 111)

This job runs only when **all three conditions** are met:
1. Current date is **1st of the month** (`now.getDate() === 1`)
2. Current hour is **3 AM** (`now.getHours() === 3`)
3. Current minute is between **0 and 29** (`now.getMinutes() >= 0 && now.getMinutes() < 30`)

### 5.1 Loan Interest Accrual

```
For each active loan with principal > 0:
  │
  │  monthlyInterest = principal × interest_rate / 100 / 12
  │
  │  postDoubleEntry:
  │    1300 (Accrued Interest Receivable)  debit: monthlyInterest
  │    4000 (Interest Income)              credit: monthlyInterest
```

### 5.2 Savings Interest Accrual

```
For each account with actual_balance > 0:
  │
  │  monthlyInterest = balance × savings_interest_rate / 12
  │  savings_interest_rate = settings['savings_interest_rate'] (default 2%)
  │
  │  postDoubleEntry:
  │    5000 (Interest Expense)       debit: monthlyInterest
  │    2500 (Accrued Expenses)       credit: monthlyInterest
```

### 5.3 Term Deposit Interest Accrual

```
For each active term deposit:
  │
  │  monthlyInterest = amount × interest_rate / 100 / 12
  │
  │  postDoubleEntry:
  │    5000 (Interest Expense)       debit: monthlyInterest
  │    2500 (Accrued Expenses)       credit: monthlyInterest
```

### 5.4 Period Protection

```javascript
const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const p = await one("SELECT * FROM accounting_periods WHERE period_id=$1", [period]);
if (p && p.is_closed) return results;  // Skip if period is closed

// Also skip if already run this period
const lastAccrual = await store.getSetting('last_accrual_run') || '';
if (lastAccrual === period) return results;
```

### 5.5 Last-Run Tracking

After successful accrual:
```javascript
await store.setSetting('last_accrual_run', period);
// Value: '2026-07' (YYYY-MM format)
```

---

## 6. Locking Mechanism

To prevent concurrent scheduler executions (e.g., if QStash retries before the previous run completes):

### Lock Acquisition

```javascript
const lockCheck = await one("SELECT value FROM settings WHERE key = 'scheduler_lock'");
if (lockCheck && lockCheck.value === '1') {
  const lockAge = await one("SELECT created_at FROM settings WHERE key = 'scheduler_lock_updated'");
  if (lockAge && (Date.now() - new Date(lockAge.created_at).getTime()) < 7200000) {
    return { skipped: true, reason: 'Lock held by another instance (< 2h old)' };
  }
}
await store.setSetting('scheduler_lock', '1');
await store.setSetting('scheduler_lock_updated', new Date().toISOString());
```

### Lock Release

```javascript
try {
  // ... all jobs ...
} finally {
  await store.setSetting('scheduler_lock', '0');
}
```

### Stale Lock Handling

If the lock is older than 2 hours (7200000ms), it's considered stale and overwritten. This prevents permanent lockout if a job crashes without releasing the lock.

---

## 7. Configuration

### Environment Variables

| Variable | Purpose | Where to Set |
|----------|---------|-------------|
| `QSTASH_CURRENT_SIGNING_KEY` | Verify QStash signature (current key) | Render env vars |
| `QSTASH_NEXT_SIGNING_KEY` | Verify QStash signature (rotation key) | Render env vars |

### QStash Cron Setup

```bash
# Create hourly cron
curl -X POST https://qstash.upstash.io/v1/schedules \
  -H "Authorization: Bearer <QSTASH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "cron": "0 * * * *",
    "url": "https://labcoop-backend.onrender.com/api/scheduler/tick",
    "method": "POST"
  }'
```

### Configurable Interest Rate

The default savings interest rate is configurable via the admin Settings page:

1. Go to `/admin/settings`
2. Edit `savings_interest_rate` (default: `2` = 2% per annum)
3. Changes take effect on the next scheduler tick

### Tax Configuration

| Tax ID | Rate | Applies To | Configurable? |
|--------|------|-----------|---------------|
| `tax_interest` | 20% | Interest credits | Admin settings |
| `tax_dividend` | 10% | Dividend declarations | Admin settings |

---

## 8. Monitoring & Troubleshooting

### Job Return Value

```javascript
// runAllJobs() returns:
{
  interest: 5,           // Number of accounts credited
  standingOrders: 3,     // Number of standing orders processed
  accrual: false,        // Whether monthly accrual ran
  skipped: false,        // Whether execution was skipped (lock held)
  reason: null,          // If skipped, why
  errors: [
    'GL interest post failed account_id=xxx: Period closed',
    'Standing order yyy: Insufficient funds exception'
  ]
}
```

### Log Output (Development)

```
[Scheduler] Credited 5 accounts
[Scheduler] Processed 3 standing orders
[Scheduler] Accrual accounting complete
[Scheduler] Errors: GL interest post failed account_id=xxx: Period closed
```

### Diagnostics

| Symptom | Likely Cause | Resolution |
|---------|-------------|-----------|
| "Lock held by another instance" | Previous job still running or crashed with lock | Wait 2 hours for stale lock timeout, or reset via admin |
| "Period X is closed" | GL period manually closed | Open the period via `/admin/accounting-periods` |
| "Standing order skipped" | Insufficient funds or maintaining balance | Check account balance and minimum balance setting |
| Scheduler not running in production | QStash cron not set up | Verify QStash dashboard, check cron schedule exists |
| Scheduler not running in dev | `NODE_ENV=production` | Set `NODE_ENV=development` or configure QStash |

### Manual Trigger

In development, you can trigger the scheduler manually at any time:

```bash
# From the server's console (if Node is accessible)
# Or restart the server (scheduler will run on the next interval)

# Or directly via API in production:
curl -X POST https://labcoop-backend.onrender.com/api/scheduler/tick \
  -H "upstash-signature: <valid-signature>"
```

> **Note**: The manual API call in production requires a valid QStash signature. For testing, set `NODE_ENV=development` to bypass signature verification.