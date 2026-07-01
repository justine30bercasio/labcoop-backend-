const { store } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function postDoubleEntry(transactionId, entries, opts = {}) {
  const { postedBy, referenceType, referenceNumber } = opts;
  let totalDebit = 0, totalCredit = 0;
  const now = new Date().toISOString();

  // Check period is not closed
  if (await store.isPeriodClosed(now)) {
    const d = new Date(now);
    const periodId = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    throw new Error('Period ' + periodId + ' is closed — cannot post GL entries');
  }
  const period = await store.getOrCreatePeriod(now);
  const periodId = period ? period.period_id : null;

  for (const e of entries) {
    totalDebit += Number(e.debit || 0);
    totalCredit += Number(e.credit || 0);
  }
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error('GL entries not balanced: debits=' + totalDebit + ' credits=' + totalCredit);
  }
  const doInserts = async (tx) => {
    const q = (tx && tx.query) ? tx.query.bind(tx) : (sql, p) => store.query(sql, p);
    for (const e of entries) {
      await q(
        'INSERT INTO gl_entries (entry_id, transaction_id, account_code, debit, credit, description, posted_by, reference_type, reference_number, period_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [uuidv4(), transactionId || null, e.account_code, e.debit || 0, e.credit || 0, e.description || '', postedBy || null, referenceType || null, referenceNumber || null, periodId, now]
      );
    }
  };
  if (typeof store.transaction === 'function') {
    await store.transaction(doInserts);
  } else {
    await doInserts();
  }
}

async function getTrialBalance(asOf) {
  const params = [];
  const onClause = asOf ? 'AND e.created_at <= $' + (params.length + 1) : '';
  if (asOf) params.push(asOf);
  const res = await store.query(
    `SELECT g.code, g.name, g.type, g.category,
       COALESCE(SUM(e.debit),0) as total_debit,
       COALESCE(SUM(e.credit),0) as total_credit
     FROM gl_accounts g
     LEFT JOIN gl_entries e ON g.code = e.account_code ${onClause}
     GROUP BY g.code, g.name, g.type, g.category
     ORDER BY g.code`, params
  );
  const rows = res.rows.map(r => ({
    code: r.code, name: r.name, type: r.type, category: r.category || '',
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
  const currentAssets = rows.filter(r => r.type === 'asset' && r.category === 'current_asset');
  const nonCurrentAssets = rows.filter(r => r.type === 'asset' && r.category === 'non_current_asset');
  const currentLiabilities = rows.filter(r => r.type === 'liability' && r.category === 'current_liability');
  const nonCurrentLiabilities = rows.filter(r => r.type === 'liability' && r.category === 'non_current_liability');
  const equity = rows.filter(r => r.type === 'equity');
  // Calculate net income from income/expense accounts not yet closed to retained earnings
  const income = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.balance, 0);
  const expense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.balance, 0);
  const netIncome = income - expense;
  const totalCurrentAssets = currentAssets.reduce((s, r) => s + r.balance, 0);
  const totalNonCurrentAssets = nonCurrentAssets.reduce((s, r) => s + r.balance, 0);
  const totalCurrentLiabilities = currentLiabilities.reduce((s, r) => s + r.balance, 0);
  const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0) + netIncome;
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
  const equityItems = netIncome !== 0
    ? [...equity, { code: 'net_income', name: 'Current Year Earnings', type: 'equity', category: 'equity', balance: netIncome }]
    : equity;
  return { currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, equity: equityItems,
    totalCurrentAssets, totalNonCurrentAssets, totalCurrentLiabilities, totalNonCurrentLiabilities,
    totalEquity, totalAssets, totalLiabilities, netIncome };
}

async function getProfitAndLoss(fromDate, toDate) {
  const where = ["g.type IN ('income','expense')"];
  const params = [];
  if (fromDate) { where.push('e.created_at >= $' + (params.length + 1)); params.push(fromDate); }
  if (toDate) { where.push('e.created_at <= $' + (params.length + 1)); params.push(toDate); }
  const res = await store.query(
    `SELECT g.code, g.name, g.type, g.category,
       COALESCE(SUM(e.debit),0) as total_debit,
       COALESCE(SUM(e.credit),0) as total_credit
     FROM gl_accounts g
     JOIN gl_entries e ON g.code = e.account_code
     WHERE ${where.join(' AND ')}
     GROUP BY g.code, g.name, g.type, g.category
     ORDER BY g.code`, params
  );
  const operatingIncome = [];
  const otherIncome = [];
  const operatingExpense = [];
  const otherExpense = [];
  let totalOperatingIncome = 0, totalOtherIncome = 0, totalOperatingExpense = 0, totalOtherExpense = 0;
  for (const r of res.rows) {
    const balance = r.type === 'income'
      ? Number(r.total_credit) - Number(r.total_debit)
      : Number(r.total_debit) - Number(r.total_credit);
    const item = { code: r.code, name: r.name, amount: balance, category: r.category || '' };
    if (r.type === 'income') {
      if (r.category === 'other_income') {
        otherIncome.push(item);
        totalOtherIncome += balance;
      } else {
        operatingIncome.push(item);
        totalOperatingIncome += balance;
      }
    } else {
      if (r.category === 'other_expense') {
        otherExpense.push(item);
        totalOtherExpense += balance;
      } else {
        operatingExpense.push(item);
        totalOperatingExpense += balance;
      }
    }
  }
  const totalIncome = totalOperatingIncome + totalOtherIncome;
  const totalExpense = totalOperatingExpense + totalOtherExpense;
  return {
    operatingIncome, otherIncome, operatingExpense, otherExpense,
    totalOperatingIncome, totalOtherIncome, totalOperatingExpense, totalOtherExpense,
    totalIncome, totalExpense,
    grossProfit: totalOperatingIncome,
    operatingProfit: totalOperatingIncome - totalOperatingExpense,
    netProfit: totalIncome - totalExpense,
  };
}

async function getAccountLedger(accountCode, limit = 100, offset = 0) {
  const res = await store.query(
    'SELECT e.*, g.name as account_name FROM gl_entries e JOIN gl_accounts g ON e.account_code = g.code WHERE e.account_code = $1 ORDER BY e.created_at DESC LIMIT $2 OFFSET $3',
    [accountCode, Number(limit), Number(offset)]
  );
  return res.rows;
}

async function getGeneralJournal(fromDate, toDate) {
  const params = [];
  const where = [];
  if (fromDate) { where.push('e.created_at >= $' + (params.length + 1)); params.push(fromDate); }
  if (toDate) { where.push('e.created_at <= $' + (params.length + 1)); params.push(toDate); }
  const res = await store.query(
    `SELECT e.entry_id, e.transaction_id, e.account_code, g.name as account_name,
       e.debit, e.credit, e.description, e.reference_type, e.reference_number,
       e.posted_by, e.created_at
     FROM gl_entries e
     JOIN gl_accounts g ON e.account_code = g.code
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY e.created_at ASC`, params
  );
  return res.rows;
}

async function getSubsidiaryLedger(referenceType, accountCode, fromDate, toDate) {
  const params = [];
  const where = [];
  if (referenceType) { where.push('e.reference_type = $' + (params.length + 1)); params.push(referenceType); }
  if (accountCode) { where.push('e.account_code = $' + (params.length + 1)); params.push(accountCode); }
  if (fromDate) { where.push('e.created_at >= $' + (params.length + 1)); params.push(fromDate); }
  if (toDate) { where.push('e.created_at <= $' + (params.length + 1)); params.push(toDate); }
  const res = await store.query(
    `SELECT e.*, g.name as account_name FROM gl_entries e
     JOIN gl_accounts g ON e.account_code = g.code
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY e.created_at ASC`, params
  );
  return res.rows;
}

module.exports = { postDoubleEntry, getTrialBalance, getBalanceSheet, getProfitAndLoss, getAccountLedger, getGeneralJournal, getSubsidiaryLedger };
