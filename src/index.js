require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');

function ensureDb() {
  // Force fresh database to avoid stale schema issues
  if (fs.existsSync(DB_PATH)) {
    try { fs.unlinkSync(DB_PATH); } catch(e) { console.error('Could not delete old DB:', e.message); }
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch(e) {}
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch(e) {}
    console.log('Deleted old database.');
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '001_init_sqlite.sql'), 'utf8');
    db.exec(sql);
    console.log('Migration applied.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
  try {
    const insertAccount = db.prepare(`
      INSERT OR IGNORE INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const defaultHash = bcrypt.hashSync('0000', 10);
    insertAccount.run('00000000-0000-0000-0000-000000000001', 'Juan', '000001', defaultHash, 0, 1500.00, 200.00, 45, '09171234567', '2025-01-15T08:00:00.000Z', '2025-06-10T10:30:00.000Z');
    insertAccount.run('00000000-0000-0000-0000-000000000002', 'Maria', '000002', defaultHash, 0, 2500.00, 500.00, 120, '09179876543', '2025-02-01T09:00:00.000Z', '2025-06-10T11:00:00.000Z');
    // Set default password and member_id for any existing accounts
    db.prepare("UPDATE accounts SET password = ?, password_changed = 0 WHERE password = '' OR password IS NULL").run(defaultHash);
    // Set member_id for existing accounts that don't have one
    const nullMember = db.prepare("SELECT account_id, child_name FROM accounts WHERE member_id IS NULL").all();
    for (const a of nullMember) {
      const maxMember = db.prepare("SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts").get().m || 0;
      const newId = String(maxMember + 1).padStart(6, '0');
      db.prepare("UPDATE accounts SET member_id = ? WHERE account_id = ?").run(newId, a.account_id);
    }

    const insertGoal = db.prepare(`
      INSERT OR IGNORE INTO goal_jars (goal_id, account_id, title, target_amount, current_allocated, category_icon, is_completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertGoal.run('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'New School Shoes', 1000.00, 650.00, 'shoes', 0, '2025-01-20T08:00:00.000Z', '2025-06-01T10:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bicycle', 3000.00, 450.00, 'bike', 0, '2025-02-10T08:00:00.000Z', '2025-06-05T14:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Video Game', 500.00, 200.00, 'game', 0, '2025-03-01T08:00:00.000Z', '2025-06-08T16:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Art Set', 800.00, 600.00, 'toy', 0, '2025-02-15T09:00:00.000Z', '2025-06-07T12:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Birthday Gift for Mama', 2000.00, 1400.00, 'savings', 0, '2025-03-10T09:00:00.000Z', '2025-06-09T15:00:00.000Z');

    const insertShopItem = db.prepare(`
      INSERT OR IGNORE INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const a of [
      ['av_cat', 'Kitty', 'avatar', 0, '🐱', 'Common', '#2E7D32', '#2E7D32', ''],
      ['av_dog', 'Puppy', 'avatar', 5, '🐶', 'Common', '#2E7D32', '#2E7D32', ''],
      ['av_lion', 'Lion', 'avatar', 10, '🦁', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_tiger', 'Tiger', 'avatar', 10, '🐯', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_bear', 'Bear', 'avatar', 15, '🐻', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_panda', 'Panda', 'avatar', 15, '🐼', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_fox', 'Fox', 'avatar', 20, '🦊', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_unicorn', 'Unicorn', 'avatar', 30, '🦄', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_monkey', 'Monkey', 'avatar', 20, '🐵', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_frog', 'Frog', 'avatar', 25, '🐸', 'Epic', '#D32F2F', '#D32F2F', ''],
      ['av_owl', 'Owl', 'avatar', 25, '🦉', 'Epic', '#D32F2F', '#D32F2F', ''],
      ['av_dino', 'Dino', 'avatar', 40, '🦖', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_robot', 'Robot', 'avatar', 50, '🤖', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_ghost', 'Ghost', 'avatar', 45, '👻', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_alien', 'Alien', 'avatar', 55, '👽', 'Mythic', '#E91E63', '#E91E63', ''],
      ['av_dragon', 'Dragon', 'avatar', 80, '🐉', 'Mythic', '#E91E63', '#E91E63', ''],
    ]) insertShopItem.run(...a);
    for (const b of [
      ['b_default', 'Basic', 'border', 0, '', 'Common', '#2E7D32', '#2E7D32', ''],
      ['b_silver', 'Silver', 'border', 10, '', 'Uncommon', '#C0C0C0', '#9E9E9E', ''],
      ['b_gold', 'Gold', 'border', 25, '', 'Rare', '#FFD700', '#FFA000', ''],
      ['b_purple', 'Epic', 'border', 40, '', 'Epic', '#9C27B0', '#6A1B9A', ''],
      ['b_legendary', 'Legendary', 'border', 60, '', 'Legendary', '#D32F2F', '#FF6F00', ''],
      ['b_rainbow', 'Rainbow', 'border', 85, '', 'Special', '#E91E63', '#2196F3', ''],
      ['b_mythic', 'Mythic', 'border', 120, '', 'Mythic', '#00BCD4', '#304FFE', ''],
    ]) insertShopItem.run(...b);
    console.log('Seed data ensured.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

ensureDb();
const accountsRouter = require('./routes/accounts');
const goalsRouter = require('./routes/goals');
const badgesRouter = require('./routes/badges');
const transactionsRouter = require('./routes/transactions');
const excelRouter = require('./routes/excel');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const coopRouter = require('./routes/coop');
const gamesRouter = require('./routes/games');
const shopRouter = require('./routes/shop');
const adminAuthRouter = require('./routes/admin-auth');
const { authMiddleware } = require('./middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-secure-random-string-in-production') {
  console.error('FATAL: JWT_SECRET environment variable is not set or is the default value.');
  console.error('Set a secure random string in .env or environment before starting.');
  process.exit(1);
}
if (!process.env.PORT) {
  console.warn('PORT not set, defaulting to 3000');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'labcoop-session-default',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 86400000 },
}));

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/', (req, res) => {
  res.json({
    name: 'LabCoop API',
    version: '1.0.3',
    build: Date.now(),
    endpoints: {
      health: 'GET /api/health',
      accounts: {
        get: 'GET /api/accounts/:accountId',
        update: 'PUT /api/accounts/:accountId',
        deposit: 'PUT /api/accounts/:accountId/deposit',
      },
      goals: {
        list: 'GET /api/accounts/:accountId/goals',
        create: 'POST /api/goals',
        update: 'PUT /api/goals/:goalId',
        delete: 'DELETE /api/goals/:goalId',
      },
      badges: {
        list: 'GET /api/accounts/:accountId/badges',
        checkUnlocks: 'POST /api/badges/check-unlocks',
      },
      transactions: {
        list: 'GET /api/accounts/:accountId/transactions',
        create: 'POST /api/transactions',
      },
      excel: {
        upload: 'POST /api/excel/upload',
        uploadAndSeed: 'POST /api/excel/upload-and-seed',
        template: 'GET /api/excel/template',
        exportAll: 'GET /api/excel/export/all',
      },
      admin: 'GET /admin',
      coop: {
        goals: 'GET /api/coop/goals',
        create: 'POST /api/coop/goals',
        contribute: 'POST /api/coop/goals/:goalId/contribute',
      },
      games: {
        list: 'GET /api/games',
        categories: 'GET /api/games/categories',
        detail: 'GET /api/games/:id',
      },
    },
  });
});

app.get('/api/health', (req, res) => {
  const { getDb } = require('./db');
  let dbOk = false;
  let accountCount = 0;
  let sampleAccount = null;
  let loginTest = null;
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    dbOk = true;
    accountCount = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
    sampleAccount = db.prepare('SELECT account_id, child_name, member_id, password_changed FROM accounts LIMIT 1').get();
    // Test the exact login query
    const testAccount = db.prepare('SELECT * FROM accounts WHERE member_id = ?').get('000001');
    if (testAccount) {
      const bcrypt = require('bcryptjs');
      loginTest = {
        found: true,
        childName: testAccount.child_name,
        passwordHashLength: testAccount.password ? testAccount.password.length : 0,
        bcryptResult: bcrypt.compareSync('0000', testAccount.password),
      };
    } else {
      loginTest = { found: false };
    }
  } catch (e) { loginTest = { error: e.message }; }
  res.json({ status: 'ok', dbConnected: dbOk, accountCount, sampleAccount, loginTest, timestamp: new Date().toISOString() });
});

// Debug login endpoint (bypasses rate limiter)
app.post('/api/debug-login', express.json(), (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const { getDb } = require('./db');
    const { memberId, password } = req.body;
    const db = getDb();
    const padded = (memberId || '').trim().padStart(6, '0');
    const account = db.prepare('SELECT * FROM accounts WHERE member_id = ?').get(padded);
    if (!account) return res.status(404).json({ message: 'Not found' });
    const valid = bcrypt.compareSync(password || '', account.password);
    if (!valid) return res.status(401).json({ message: 'Wrong password', pwLen: account.password.length });
    const token = jwt.sign(
      { accountId: account.account_id, childName: account.child_name },
      process.env.JWT_SECRET || 'labcoop-dev-secret',
      { expiresIn: '7d' }
    );
    res.json({ token, passwordChanged: account.password_changed === 1, account: { account_id: account.account_id, child_name: account.child_name } });
  } catch (e) {
    res.status(500).json({ message: 'Error', detail: e.message, stack: e.stack });
  }
});

app.use('/api/auth', loginLimiter, authRouter);

app.use('/api/accounts', authMiddleware, accountsRouter);
app.get('/api/accounts/:accountId/goals', (req, res, next) => {
  req.url = `/account/${req.params.accountId}`;
  next();
}, goalsRouter);
app.use('/api/goals', authMiddleware, goalsRouter);
app.get('/api/accounts/:accountId/badges', authMiddleware, (req, res, next) => {
  req.url = `/account/${req.params.accountId}`;
  next();
}, badgesRouter);
app.use('/api/badges', authMiddleware, badgesRouter);
app.get('/api/accounts/:accountId/transactions', authMiddleware, (req, res, next) => {
  req.url = `/account/${req.params.accountId}`;
  next();
}, transactionsRouter);
app.use('/api/transactions', authMiddleware, transactionsRouter);
app.use('/api/excel', authMiddleware, excelRouter);
app.use('/api/coop', authMiddleware, coopRouter);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/shop', shopRouter);
app.use('/api/games', gamesRouter);
app.use('/admin', adminAuthRouter);
app.use('/admin', adminRouter);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`LabCoop API server running on port ${PORT}`);
});

module.exports = app;
