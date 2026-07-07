const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const safeHeader = v => String(v || '').replace(/[\r\n]/g, '').trim();

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

async function sheetToJson(worksheet) {
  const rows = [];
  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell((cell) => headers.push(cell.text));
  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    row.eachCell((cell, colNum) => {
      obj[headers[colNum - 1]] = cell.text;
    });
    rows.push(obj);
  });
  return rows;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const result = {};

    for (const worksheet of workbook.worksheets) {
      result[worksheet.name] = await sheetToJson(worksheet);
    }

    fs.unlinkSync(req.file.path);

    const rowCount = Object.values(result).reduce((sum, rows) => sum + rows.length, 0);
    res.json({
      message: 'File parsed successfully',
      filename: req.file.originalname,
      sheets: workbook.worksheets.map(w => w.name),
      rowCount,
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

router.post('/upload-and-seed', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const { store } = require('../db');
    const results = { accounts: 0, goals: 0, badges: 0, transactions: 0, errors: [] };

    for (const worksheet of workbook.worksheets) {
      const rows = await sheetToJson(worksheet);
      const sheetName = worksheet.name;

      for (const row of rows) {
        try {
          switch (sheetName.toLowerCase()) {
            case 'accounts':
              await store.updateAccount(row.account_id || row.accountId, {
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
              await store.createGoal({
                account_id: row.account_id || row.accountId,
                title: row.title,
                target_amount: Number(row.target_amount || row.targetAmount || 0),
                current_allocated: Number(row.current_allocated || row.currentAllocated || 0),
                category_icon: row.category_icon || row.categoryIcon || 'savings',
              });
              results.goals++;
              break;
            case 'badges':
              await store.unlockBadges(row.account_id || row.accountId, Number(row.current_xp || row.currentXp || 0));
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

async function addJsonToSheet(workbook, name, data) {
  const ws = workbook.addWorksheet(name);
  if (!data || data.length === 0) { ws.addRow(['no_data']); return; }
  const columns = Object.keys(data[0]);
  ws.addRow(columns);
  for (const item of data) {
    ws.addRow(columns.map(c => item[c] !== undefined ? String(item[c]) : ''));
  }
}

router.get('/template', async (req, res) => {
  const workbook = new ExcelJS.Workbook();

  const accountsData = [
    { account_id: '', child_name: '', actual_balance: 0, unallocated_balance: 0, current_xp: 0, parent_phone: '' },
  ];
  const goalsData = [
    { account_id: '', title: '', target_amount: 0, current_allocated: 0, category_icon: 'savings' },
  ];
  const badgesData = [
    { account_id: '', name: '', description: '', icon_url: '', required_xp: 0 },
  ];

  await addJsonToSheet(workbook, 'Accounts', accountsData);
  await addJsonToSheet(workbook, 'Goals', goalsData);
  await addJsonToSheet(workbook, 'Badges', badgesData);

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=labcoop-template.xlsx');
  res.send(buffer);
});

router.get('/export/all', async (req, res) => {
  try {
    const { store } = require('../db');
    const [accounts, goals, badges, transactions] = await Promise.all([
      store.query('SELECT * FROM accounts').then(r => r.rows),
      store.query('SELECT * FROM goal_jars').then(r => r.rows),
      store.query('SELECT * FROM badges').then(r => r.rows),
      store.query('SELECT * FROM transactions ORDER BY created_at DESC').then(r => r.rows),
    ]);

    const workbook = new ExcelJS.Workbook();
    await addJsonToSheet(workbook, 'Accounts', accounts);
    await addJsonToSheet(workbook, 'Goals', goals.length > 0 ? goals : [{ title: '' }]);
    await addJsonToSheet(workbook, 'Badges', badges.length > 0 ? badges : [{ name: '' }]);
    await addJsonToSheet(workbook, 'Transactions', transactions.length > 0 ? transactions : [{ type: '' }]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=labcoop-all-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) {
    console.error('Excel export all error:', err);
    res.status(500).json({ message: 'Failed to export data', error: err.message });
  }
});

router.get('/export/:accountId', async (req, res) => {
  try {
    const { store } = require('../db');
    const accountId = req.params.accountId;

    const account = await store.getAccount(accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const [goals, badges, transactions] = await Promise.all([
      store.getGoals(accountId),
      store.getBadges(accountId),
      store.getTransactions(accountId, 1000, 0),
    ]);

    const workbook = new ExcelJS.Workbook();
    await addJsonToSheet(workbook, 'Account', [account]);
    await addJsonToSheet(workbook, 'Goals', goals.length > 0 ? goals : [{ goal_id: '', title: '', target_amount: 0, current_allocated: 0, category_icon: '', is_completed: 0 }]);
    await addJsonToSheet(workbook, 'Badges', badges.length > 0 ? badges : [{ name: '', description: '', required_xp: 0, is_unlocked: 0 }]);
    await addJsonToSheet(workbook, 'Transactions', transactions.length > 0 ? transactions : [{ type: '', amount: 0, description: '' }]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=labcoop-${safeHeader(account.child_name)}-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ message: 'Failed to export data', error: err.message });
  }
});

module.exports = router;
