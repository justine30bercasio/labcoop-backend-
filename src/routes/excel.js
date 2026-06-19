const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ('.xlsx,.xls,.csv'.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetNames = workbook.SheetNames;
    const result = {};

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      result[sheetName] = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    }

    fs.unlinkSync(req.file.path);

    res.json({
      message: 'File parsed successfully',
      filename: req.file.originalname,
      sheets: sheetNames,
      rowCount: Object.values(result).reduce((sum, rows) => sum + rows.length, 0),
      data: result,
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Excel parse error:', err);
    res.status(500).json({ message: 'Failed to parse Excel file', error: err.message });
  }
});

router.post('/upload-and-seed', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const { store } = require('../db');
    const results = { accounts: 0, goals: 0, badges: 0, transactions: 0, errors: [] };

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      for (const row of rows) {
        try {
          switch (sheetName.toLowerCase()) {
            case 'accounts':
              store.updateAccount(row.account_id, {
                child_name: row.child_name || row.childName,
                actual_balance: Number(row.actual_balance || row.actualBalance || 0),
                unallocated_balance: Number(row.unallocated_balance || row.unallocatedBalance || 0),
                current_xp: Number(row.current_xp || row.currentXp || 0),
                parent_phone: row.parent_phone || row.parentPhone || '',
              });
              results.accounts++;
              break;
            case 'goals':
            case 'goal_jars':
              store.createGoal({
                account_id: row.account_id || row.accountId,
                title: row.title,
                target_amount: Number(row.target_amount || row.targetAmount || 0),
                current_allocated: Number(row.current_allocated || row.currentAllocated || 0),
                category_icon: row.category_icon || row.categoryIcon || 'savings',
              });
              results.goals++;
              break;
            case 'badges':
              store.unlockBadges(row.account_id || row.accountId, Number(row.current_xp || row.currentXp || 0));
              results.badges++;
              break;
          }
        } catch (e) {
          results.errors.push({ sheet: sheetName, row, error: e.message });
        }
      }
    }

    fs.unlinkSync(req.file.path);

    res.json({
      message: 'File processed and data seeded',
      filename: req.file.originalname,
      results,
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Excel seed error:', err);
    res.status(500).json({ message: 'Failed to seed from Excel', error: err.message });
  }
});

router.get('/template', (req, res) => {
  const wb = xlsx.utils.book_new();

  const accountsData = [
    { account_id: '', child_name: '', actual_balance: 0, unallocated_balance: 0, current_xp: 0, parent_phone: '' },
  ];
  const goalsData = [
    { account_id: '', title: '', target_amount: 0, current_allocated: 0, category_icon: 'savings' },
  ];
  const badgesData = [
    { account_id: '', name: '', description: '', icon_url: '', required_xp: 0 },
  ];

  const ws1 = xlsx.utils.json_to_sheet(accountsData);
  const ws2 = xlsx.utils.json_to_sheet(goalsData);
  const ws3 = xlsx.utils.json_to_sheet(badgesData);

  xlsx.utils.book_append_sheet(wb, ws1, 'Accounts');
  xlsx.utils.book_append_sheet(wb, ws2, 'Goals');
  xlsx.utils.book_append_sheet(wb, ws3, 'Badges');

  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=labcoop-template.xlsx');
  res.send(buffer);
});

router.get('/export/all', (req, res) => {
  try {
    const { getDb } = require('../db');
    const db = getDb();
    const accounts = db.prepare('SELECT * FROM accounts').all();
    const goals = db.prepare('SELECT * FROM goal_jars').all();
    const badges = db.prepare('SELECT * FROM badges').all();
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(accounts), 'Accounts');
    xlsx.utils.book_append_sheet(wb, goals.length > 0 ? xlsx.utils.json_to_sheet(goals) : xlsx.utils.json_to_sheet([{ title: '' }]), 'Goals');
    xlsx.utils.book_append_sheet(wb, badges.length > 0 ? xlsx.utils.json_to_sheet(badges) : xlsx.utils.json_to_sheet([{ name: '' }]), 'Badges');
    xlsx.utils.book_append_sheet(wb, transactions.length > 0 ? xlsx.utils.json_to_sheet(transactions) : xlsx.utils.json_to_sheet([{ type: '' }]), 'Transactions');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=labcoop-all-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) {
    console.error('Excel export all error:', err);
    res.status(500).json({ message: 'Failed to export data', error: err.message });
  }
});

router.get('/export/:accountId', (req, res) => {
  try {
    const { store, getDb } = require('../db');
    const db = getDb();
    const accountId = req.params.accountId;

    const account = store.getAccount(accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const goals = store.getGoals(accountId);
    const badges = store.getBadges(accountId);
    const transactions = store.getTransactions(accountId, 1000, 0);

    const wb = xlsx.utils.book_new();

    const wsAccount = xlsx.utils.json_to_sheet([account]);
    xlsx.utils.book_append_sheet(wb, wsAccount, 'Account');

    const wsGoals = goals.length > 0 ? xlsx.utils.json_to_sheet(goals) : xlsx.utils.json_to_sheet([{ goal_id: '', title: '', target_amount: 0, current_allocated: 0, category_icon: '', is_completed: 0 }]);
    xlsx.utils.book_append_sheet(wb, wsGoals, 'Goals');

    const wsBadges = badges.length > 0 ? xlsx.utils.json_to_sheet(badges) : xlsx.utils.json_to_sheet([{ name: '', description: '', required_xp: 0, is_unlocked: 0 }]);
    xlsx.utils.book_append_sheet(wb, wsBadges, 'Badges');

    const wsTxns = transactions.length > 0 ? xlsx.utils.json_to_sheet(transactions) : xlsx.utils.json_to_sheet([{ type: '', amount: 0, description: '' }]);
    xlsx.utils.book_append_sheet(wb, wsTxns, 'Transactions');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=labcoop-${account.child_name}-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ message: 'Failed to export data', error: err.message });
  }
});

module.exports = router;
