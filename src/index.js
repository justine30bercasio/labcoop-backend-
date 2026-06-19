require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
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
    version: '1.0.0',
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
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch (_) {}
  res.json({ status: 'ok', dbConnected: dbOk, timestamp: new Date().toISOString() });
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
