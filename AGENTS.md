# LabCoop — Developer Notes

## Flutter Commands
```bash
# Analyze Dart code
flutter analyze

# Run tests
flutter test

# Generate JSON serialization code
dart run build_runner build --delete-conflicting-outputs

# Run Flutter app
flutter run
```

## Backend Commands
```bash
cd backend

# Start dev server with auto-reload
npm run dev

# Run database migration
npm run migrate

# Seed sample data
npm run seed

# Start production
npm start
```

## Architecture
- Domain layer (`lib/domain/`): Pure Dart, no Flutter imports — entities + usecases
- Data layer (`lib/data/`): Models, datasources (remote/local), repository impls
- Presentation layer (`lib/presentation/`): BLoC state management, pages, widgets
- Backend (`backend/`): Node.js + Express + PostgreSQL

## Removed Features
- Battle system (Flame game engine + 3D arena) was completely removed on 2026-06-15 per user request

=====
## IMPORTANT — Session Summary
=====

## Goal
Build a gamified cooperative passbook for children with team savings, virtual pet, town builder, financial quiz, and XP/reward progression.

## Progress
### Done
- Core architecture: domain entities (savings, goals, badges, pet, town buildings, quiz), data layer (Hive local DB, remote API, repository), presentation (BLoC, pages, widgets)
- Dashboard: savings overview, XP bar, piggy widget, goal jars, badges, challenges, savings tips, streak, growth projection
- Co-op team goals: shared progress bars, team member display, invite codes
- Virtual pet piggy: 7 evolution stages, happiness, feeding, rename, evolution popup
- Dream Town builder: 10 purchasable buildings with passive bonuses, town map grid
- Financial literacy quiz: 15 questions across 4 categories, streak, high scores
- Rare unlocks: 6 milestones in Profile and Rewards
- MBwin-style advanced reports: Loan Aging (with provision calc), Daily Collection, Deposit Summary, Member Ledger, Loan Portfolio — all with Chart.js, CSV export, print view
- Configurable savings interest rate via admin Settings page (default 2% monthly)
- Auto-seeded `sp_regular` savings product so all children earn interest by default
- Sidebar reorganized: Savings Reports → Financial Reports → Loan Reports (Future) → Audit & Admin
- CSP connect-src fixed to allow Chart.js source maps

### Removed
- Battle system (Flame game engine + 3D arena) — removed 2026-06-15 per user request
- Chores module — removed 2026-06-27 per user request

### In Progress
- (none — awaiting user direction)

### Blocked
- (none)

## Navigation (Post-Battle Removal)
- HomePage has 4 tabs now: Dashboard (0), Rewards (1), Play (2), Profile (3)

## Data Persistence Fix (2026-06-22)
### Problem
Flutter app data disappeared on logout/refresh because:
1. `clearAll()` on the Flutter side only cleared 3 of 10 Hive boxes
2. `getTransactions()` had a race condition — would clear box then re-save before API response arrived
3. `getAccount`/`getGoals`/`getBadges` always fetched API first — no cache-first, so offline = blank
4. Backend on Render (free tier) uses ephemeral filesystem — SQLite data wiped on every deploy/restart

### Fixes Applied
#### Flutter (lib/data/)
- `local_db_source.dart:413` — `clearAll()` now clears all 10 Hive boxes
- `banking_repository_impl.dart:36` — `getTransactions()` checks `_isOnline` first, clears only after API success
- `savings_repository_impl.dart` — `getAccount`/`getGoals`/`getBadges` changed to server-first: fetch API → save cache → return; fall back to cache only when offline (2026-07-04, was cache-first before which caused stale kycStatus not updating)

#### Backend (backend/src/)
- `pg-store.js` — full PostgreSQL store (async, `pg.Pool`) mirroring sqlite-store.js API
- `db.js` — auto-detects PostgreSQL (`DATABASE_URL` starting with `postgresql://` or `postgres://`) vs SQLite
- `async-handler.js` — Express async error wrapper
- `index.js` — server startup wrapped in `startServer()`, uses async store for seed, health + debug-login endpoints fixed
- `routes/auth.js` — all endpoints converted to async store calls
- `routes/accounts.js` — async deposit with `store.transaction()`
- `routes/goals.js` — async CRUD with `store.transaction()`
- `routes/loans.js` — async with `store.transaction()`
- `routes/coop.js` — async with `store.query()`
- `routes/shop.js` — async with `store.query()`
- `routes/banking-features.js` — all 13 endpoints converted to async (+ interest & receipt which were already converted)
- `routes/transactions.js` — async with `store.getTransactions()` / `store.getStatement()`
- `routes/badges.js` — async with `store.getBadges()` / `store.unlockBadges()`
- `routes/quiz.js` — async CRUD with option parsing, all 5 endpoints converted
- `routes/games.js` — no store calls (static data), no change needed
- `sqlite-store.js` — added `query()` method that converts `$1, $2` → `?` and returns `{ rows }`

### Remaining
- `admin.js` (~40+ `getDb()` calls) and `excel.js` not converted — admin-only, lower priority
- `.env` has `DATABASE_URL` commented out for local SQLite dev; uncomment for local PostgreSQL testing

### To Deploy on Render
1. Add a PostgreSQL database (Starter plan $7/mo minimum) in Render Dashboard
2. Copy the "Internal Database URL" and set as `DATABASE_URL` environment variable
3. Deploy this branch — backend will auto-detect PG and create schema on startup
4. Flutter app: rebuild APK and install on device

### Key Design Decisions
- All route handlers are async (`asyncHandler(async (req, res) => { ... await store.xxx() })`) — works for both PG (truly async) and SQLite (`await` on sync = no-op)
- `PgStore._ensureSchema()` auto-creates all tables on connect — no manual migration needed
- SQLite remains default for local dev; PostgreSQL auto-detected via `DATABASE_URL`

=====
### Session Completed 2026-06-29
- Fixed Loan Aging and Loan Portfolio reports: changed `a.name` → `a.child_name` (admin.js:3843,4272)
- Restructured admin sidebar into 10 clean groups: Members, Savings & Deposits, Loans, Teller & Payments, Reports, Accounting, Operations, Gamification, Administration (admin-lib.js)
- Fixed GL sidebar keys from duplicate `'gl'` to unique keys: `gl-trial`, `gl-bsheet`, `gl-pnl`, `gl-ledger` (admin.js GL routes)
- Removed `opacity:0.55` dimming from loan reports (they now work)
- Flutter: Fixed `SavingsOpenPage` grey screen freeze — moved all data processing from build() to _load(), used typed lists with safe iteration, added loading/error/content states. All savings-related pages now use white background.
- Flutter: `CelebrationOverlay` grey overlay now tappable to dismiss
- Flutter: Dashboard keeps cached content visible during auto-refresh (instead of full-screen spinner)
- Flutter: `SavingsBloc` skips `SavingsLoading` when data already loaded
- APK rebuilt (26.7MB)

=====
### Session Completed 2026-07-01
- Removed **savings application feature** entirely:
  - Flutter: Deleted `savings_open_page.dart`, removed navigation chip from `banking_page.dart`, removed `applySavingsAccount()`/`getSavingsApplications()` from API service
  - Admin (`admin_converted.js`): Removed GET listing, POST approve/reject routes, sidebar link, dashboard pending count + quick-action card, export table reference
  - Backend routes (`banking-features.js`): Removed POST `/savings/apply` + GET `/savings/applications/:accountId`
  - Stores (`pg-store.js`, `sqlite-store.js`): Removed `getSavingsApplications`, `createSavingsApplication`, `updateSavingsApplication` methods + CREATE TABLE schema
  - Table name kept in `clean-db.js`, `aiven-clean.js`, `index.js:reset-database` for backward compat with existing databases
- All changes commited and deployed to Render

=====
### Session Completed 2026-07-01 (Session 2)
- **BIR-compliant accounting system** — expanded chart of accounts to 25 accounts with category/is_contra classification (current_asset, non_current_asset, current_liability, etc.), added audit trail columns (`posted_by`, `approved_by`, `reference_type`, `reference_number`, `period_id`) on `gl_entries`, upgraded `gl.js` with period lock checking, category-aware Balance Sheet (current vs non-current + prior-year), category-aware P&L (operating vs other income/expense + prior-year), General Journal in BIR format (folio-grouped with per-transaction debit/credit totals), Subsidiary Ledger, Account Ledger with running balance
- **Withholding tax on interest credits**: Scheduler now splits interest into gross expense (5000) + 20% tax payable (2400) + net credit (2000). Configurable via `tax_config` table.
- **Withholding tax on dividends**: Dividend declaration now splits into gross (3100) + 10% tax (2400) + net payable (3000).
- **OR Series system**: `or_series` table with prefix/current_number/type, `assignOrNumber(type)` store method, `or_number` column on transactions. Seeds: `OR-` for deposits, `WT-` for withdrawals, `JV-` for journal vouchers.
- **Accounting Periods**: `accounting_periods` table with auto-create on GL post, period lock enforcement at GL engine level, management page at `/admin/accounting-periods`, EOD close auto-closes period when all days in month are closed.
- **General Journal route** (`/admin/gl/journal`): BIR format with date range filter, folio-grouped entries, reference number, posted by, CSV export with per-folio totals, print layout.
- **Withholding Tax report** (`/admin/withholding-tax`): BIR Form 2307 equivalent — gross interest/dividends, tax rates from config, tax withheld, net amounts, GL balance comparison, CSV export, year selector.
- **Budget vs Actual upgraded**: Editable budget form with per-account input fields for all 12 income/expense accounts, save via POST `/admin/budget/save`, budget stored as JSON in settings, CSV export, stat cards for budgeted vs actual totals and net.
- **Monthly accrual scheduler job**: Runs 1st of month at ~3:15 AM, accrues interest receivable (1300/4000) on outstanding loans and interest payable (5000/2500) on savings deposits, gated by period lock check and last-run tracking.
- **All report routes updated** with CSV export (Trial Balance, Balance Sheet, P&L, GL Ledger, General Journal, Cash Flow, Budget, Withholding Tax).
- **Dividend declaration fixed**: Now passes `referenceType: 'dividend'` to GL post.
- All 18+ `postDoubleEntry` call sites updated with audit opts.
- APK rebuilt (26.4MB).

=====
### Session 2026-07-01 (Session 3) — Professional Reports & Bug Fixes
- **Bug fix**: Imported `h` (HTML escape) in `admin.js` — was missing from `require('./admin-lib')`, causing 500 error on Balance Sheet and P&L notes textareas.
- **Bug fix**: Balance Sheet now includes net income in Equity as "Current Year Earnings" — fixes Assets ≠ Liabilities + Equity (Accounting Equation off by net income amount).
- **Professional report layouts**: Upgraded `printLayout()` in `admin-lib.js` with company header (name, address, TIN), report title/subtitle, date range, proper table formatting (Courier New monospace, alternating rows, total rows), 3-column signature blocks (Prepared by / Reviewed by / Approved by), page numbers via CSS counters, A4 portrait/landscape orientation support, disclaimer footer, PH timezone generation timestamp.
- **All 10 reports now use professional print layout**: Trial Balance, Balance Sheet, P&L, GL Ledger, General Journal, Cash Flow, Withholding Tax, Budget vs Actual (plus Loan reports too).
- Pushed to Render: backend `main` (a0f3661) + parent `master` (44adbb9).

=====
### Security Hardening (2026-07-02)
- **JWT_SECRET/SESSION_SECRET**: Production now refuses to start without proper secrets in env vars — `process.exit(1)` if unset or still default. Dev mode auto-generates as before.
- **Health endpoint**: Removed `paymongoKeyLength` leak from `/api/health` response.
- **Reset database**: Gated with `super_admin` role check + audit log.
- **CSRF protection**: Double-submit cookie pattern for all admin POST/PUT/DELETE routes. Token embedded in sessions, must match `X-CSRF-Token` header.
- **Role-based middleware**: `requireRole('super_admin', 'manager', ...)` available via `middleware/auth.js`.
- **Audit logging**: All admin logins (success + failure), OTP verifications, and reset-database events logged to `audit_log` table with IP and details.
- **OTP rate-limiting**: Max 3 forgot-password requests per email per 15 minutes. Username enumeration prevented — generic response whether user exists or not. OTP success message no longer reveals email.
- **AGENTS.md**: Separated into `Removed`, `In Progress`, `Blocked`, `Session History` sections for clarity.
