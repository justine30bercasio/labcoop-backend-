const { store } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function postDoubleEntry(transactionId, entries) {
  let totalDebit = 0, totalCredit = 0;
  for (const e of entries) {
    totalDebit += Number(e.debit || 0);
    totalCredit += Number(e.credit || 0);
  }
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error('GL entries not balanced: debits=' + totalDebit + ' credits=' + totalCredit);
  }
  for (const e of entries) {
    await store.query(
      'INSERT INTO gl_entries (entry_id, transaction_id, account_code, debit, credit, description, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uuidv4(), transactionId || null, e.account_code, e.debit || 0, e.credit || 0, e.description || '', new Date().toISOString()]
    );
  }
}

async function getTrialBalance(asOf) {
  const where = asOf ? 'WHERE created_at <= $1' : '';
  const params = asOf ? [asOf] : [];
  const res = await store.query(
    `SELECT g.code, g.name, g.type,
       COALESCE(SUM(e.debit),0) as total_debit,
       COALESCE(SUM(e.credit),0) as total_credit
     FROM gl_accounts g
     LEFT JOIN gl_entries e ON g.code = e.account_code ${where}
     GROUP BY g.code, g.name, g.type
     ORDER BY g.code`, params
  );
  const rows = res.rows.map(r => ({
    code: r.code, name: r.name, type: r.type,
    debit: Number(r.total_debit), credit: Number(r.total_credit),
    balance: (r.type === 'asset' || r.type === 'expense')
      ? Number(r.total_debit) - Number(r.total_credit)
      : Number(r.total_credit) - Number(r.total_debit),
  }));
  const totalD = rows.reduce((s, r) => s + r.debit, 0);
  const totalC = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit: totalD, totalCredit: totalC };
}

async function getBalanceSheet(asOf) {
  const { rows } = await getTrialBalance(asOf);
  const assets = rows.filter(r => r.type === 'asset');
  const liabilities = rows.filter(r => r.type === 'liability');
  const equity = rows.filter(r => r.type === 'equity');
  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0);
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity };
}

async function getProfitAndLoss(fromDate, toDate) {
  const where = [];
  const params = [];
  if (fromDate) { where.push('e.created_at >= $' + (params.length + 1)); params.push(fromDate); }
  if (toDate) { where.push('e.created_at <= $' + (params.length + 1)); params.push(toDate); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const res = await store.query(
    `SELECT g.code, g.name, g.type,
       COALESCE(SUM(e.debit),0) as total_debit,
       COALESCE(SUM(e.credit),0) as total_credit
     FROM gl_accounts g
     JOIN gl_entries e ON g.code = e.account_code ${whereClause}
     WHERE g.type IN ('income','expense')
     GROUP BY g.code, g.name, g.type
     ORDER BY g.code`, params
  );
  const income = [];
  const expense = [];
  let totalIncome = 0, totalExpense = 0;
  for (const r of res.rows) {
    const balance = r.type === 'income'
      ? Number(r.total_credit) - Number(r.total_debit)
      : Number(r.total_debit) - Number(r.total_credit);
    if (r.type === 'income') { income.push({ code: r.code, name: r.name, amount: balance }); totalIncome += balance; }
    else { expense.push({ code: r.code, name: r.name, amount: balance }); totalExpense += balance; }
  }
  return { income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
}

async function getAccountLedger(accountCode, limit = 100, offset = 0) {
  const res = await store.query(
    'SELECT e.*, g.name as account_name FROM gl_entries e JOIN gl_accounts g ON e.account_code = g.code WHERE e.account_code = $1 ORDER BY e.created_at DESC LIMIT $2 OFFSET $3',
    [accountCode, Number(limit), Number(offset)]
  );
  return res.rows;
}

module.exports = { postDoubleEntry, getTrialBalance, getBalanceSheet, getProfitAndLoss, getAccountLedger };
