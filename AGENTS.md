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
- `savings_repository_impl.dart` — `getAccount`/`getGoals`/`getBadges` changed to cache-first: read cache → return → API refresh in background

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
