const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { getDb, store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');
const { layout, printLayout, h, reportTable, reportSection, reportStats } = require('./admin-lib');
const notifs = require('../services/notifications');

const _p = (...p) => p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
const sql = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows);
const one = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows[0]);
const fmt = v => '₱' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTrn = (tx, fallback) => {
  if (tx && tx.trn_number) {
    const y = new Date(tx.created_at || Date.now()).getFullYear();
    return 'TXN-' + y + '-' + String(tx.trn_number).padStart(6, '0');
  }
  return fallback || '-';
};

const router = express.Router();

const ROLE_LEVELS = { super_admin: 4, manager: 3, teller: 2, auditor: 1 };

function requireSession(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.redirect('/admin/login');
  }
  next();
}

function requireRole(minLevel) {
  return (req, res, next) => {
    if (!req.session || !req.session.adminId) {
      return res.redirect('/admin/login');
    }
    const level = ROLE_LEVELS[req.session.adminRole] ?? 0;
    if (level < minLevel) {
      return res.status(403).send('Forbidden: insufficient role level');
    }
    next();
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
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

router.post('/upload', requireRole(2), upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/admin?error=No+file+uploaded');
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    let totalRows = 0;
    for (const name of sheetNames) {
      totalRows += xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: '' }).length;
    }
    res.redirect(`/admin?import=ok&rows=${totalRows}&sheets=${sheetNames.length}&sheetNames=${encodeURIComponent(sheetNames.join(', '))}&mode=parse`);
  } catch (err) {
    res.redirect(`/admin?error=${encodeURIComponent(err.message)}`);
  }
});

router.post('/upload-and-seed', requireRole(3), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.redirect('/admin?error=No+file+uploaded');
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    let totalRows = 0;
    let accounts = 0, goals = 0, badges = 0, errorCount = 0;

    for (const sheetName of sheetNames) {
      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      totalRows += rows.length;

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
              accounts++;
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
              goals++;
              break;
            case 'badges':
              await store.unlockBadges(row.account_id || row.accountId, Number(row.current_xp || row.currentXp || 0));
              badges++;
              break;
          }
        } catch (_) {
          errorCount++;
        }
      }
    }

    res.redirect(`/admin?import=ok&rows=${totalRows}&sheets=${sheetNames.length}&sheetNames=${encodeURIComponent(sheetNames.join(', '))}&mode=seed&accountWrites=${accounts}&goalWrites=${goals}&badgeWrites=${badges}&errors=${errorCount}`);
  } catch (err) {
    res.redirect(`/admin?error=${encodeURIComponent(err.message)}`);
  }
}));

router.get('/', requireRole(1), asyncHandler(async (req, res) => {
  const sql = (s, p) => store.query(s, p || []).then(r => r.rows);
  const one = (s, p) => store.query(s, p || []).then(r => r.rows[0]);

  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [accounts, goals, badges, transactions, coopGoals, coopContribs, loans, loanProducts, shopItems] = await Promise.all([
    sql('SELECT * FROM accounts ORDER BY child_name ASC'),
    sql('SELECT g.*, a.child_name FROM goal_jars g LEFT JOIN accounts a ON g.account_id = a.account_id ORDER BY g.created_at ASC'),
    sql('SELECT b.*, a.child_name FROM badges b LEFT JOIN accounts a ON b.account_id = a.account_id ORDER BY b.created_at ASC'),
    sql('SELECT t.*, a.child_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id ORDER BY t.created_at DESC LIMIT 200'),
    sql('SELECT cg.*, (SELECT COALESCE(SUM(amount),0) FROM coop_contributions WHERE goal_id=cg.goal_id) as contributed FROM coop_goals cg ORDER BY cg.created_at ASC'),
    sql('SELECT cc.*, a.child_name FROM coop_contributions cc LEFT JOIN accounts a ON cc.account_id = a.account_id ORDER BY cc.created_at DESC LIMIT 50'),
    sql('SELECT COUNT(*) as total_loans, COALESCE(SUM(principal),0) as total_principal, COALESCE(SUM(remaining_balance),0) as outstanding, COUNT(CASE WHEN status=\'active\' THEN 1 END) as active_loans, COUNT(CASE WHEN status=\'paid\' THEN 1 END) as paid_loans FROM loans'),
    sql('SELECT COUNT(*) as c FROM loan_products WHERE is_active=1'),
    sql('SELECT COUNT(*) as c FROM shop_items'),
  ]);

  const totalBalance = Number((await one('SELECT COALESCE(SUM(actual_balance),0) as s FROM accounts')).s);
  const totalXp = Number((await one('SELECT COALESCE(SUM(current_xp),0) as s FROM accounts')).s);
  const completedGoals = Number((await one('SELECT COUNT(*) as c FROM goal_jars WHERE is_completed=1')).c);
  const totalBadges = Number((await one('SELECT COUNT(*) as c FROM badges')).c);
  const unlockedBadges = Number((await one('SELECT COUNT(*) as c FROM badges WHERE is_unlocked=1')).c);
  const pendingLoans = Number((await one("SELECT COUNT(*) as c FROM loans WHERE status='pending'")).c);
  const pendingWithdrawals = Number((await one("SELECT COUNT(*) as c FROM withdrawal_requests WHERE status='pending'")).c);
  const pendingOnlineDeposits = Number((await one("SELECT COUNT(*) as c FROM online_deposits WHERE status='pending'")).c);
  const activeLoanProducts = Number(loanProducts[0]?.c || 0);
  const shopItemsCount = Number(shopItems[0]?.c || 0);
  const loanStats = loans[0] || {};
  const totalCoopGoals = coopGoals.length;
  const completedCoopGoals = coopGoals.filter(g => g.is_completed).length;

  // ── Chart data computations ──

  const dayLabels = []; const dayDeposits = []; const dayWithdrawals = []; const dayCounts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    dayLabels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',',''));
    const dayStr = d.toISOString().slice(0,10);
    const dayTxs = transactions.filter(t => t.created_at && t.created_at.slice(0,10) === dayStr);
    const deps = dayTxs.filter(t => t.type === 'deposit').reduce((s,t) => s + Number(t.amount), 0);
    const wds = dayTxs.filter(t => t.type === 'withdrawal').reduce((s,t) => s + Number(t.amount), 0);
    dayDeposits.push(deps); dayWithdrawals.push(wds); dayCounts.push(dayTxs.length);
  }

  const topAccounts = [...accounts].sort((a,b) => Number(b.actual_balance) - Number(a.actual_balance)).slice(0, 8);
  const topBalances = topAccounts.map(a => Number(a.actual_balance));
  const balanceTotal = topBalances.reduce((s,v) => s + v, 0) || 1;
  const pieColors = ['#22c55e','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#14b8a6'];

  const xpTop = [...accounts].sort((a,b) => Number(b.current_xp) - Number(a.current_xp)).slice(0, 6);
  const maxXp = Math.max(...xpTop.map(a => Number(a.current_xp)), 1);

  const cashIn = transactions.filter(t => ['deposit','loan_disbursement','interest_credit','interest'].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const cashOut = transactions.filter(t => ['withdrawal','loan_payment'].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const netFlow = cashIn - cashOut;

  const pendingTotal = pendingLoans + pendingWithdrawals + pendingOnlineDeposits;

  // Compute trend percentages
  const weekAgoDeps = dayDeposits.slice(0, 3).reduce((s, v) => s + v, 0);
  const weekRecentDeps = dayDeposits.slice(3).reduce((s, v) => s + v, 0);
  const depositTrend = weekRecentDeps > weekAgoDeps ? 'up' : weekRecentDeps < weekAgoDeps ? 'down' : 'flat';
  const depositTrendPct = weekAgoDeps > 0 ? ((weekRecentDeps - weekAgoDeps) / weekAgoDeps * 100).toFixed(1) : '0';

  const memberGrowth = accounts.length;

  // ── Build HTML ──

  const content = `
  <style>
  .dash-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
  .dash-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:20px; }
  .dash-grid-4 { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:16px; margin-bottom:20px; }
  .section-title { font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:12px; display:flex; align-items:center; gap:6px; padding-top:8px; }
  .section-title:after { content:''; flex:1; height:1px; background:var(--border); margin-left:8px; }
  .quick-actions { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; margin-bottom:20px; }
  .quick-action-btn { display:flex; flex-direction:column; align-items:center; gap:5px; padding:12px 6px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); text-decoration:none; color:var(--text); font-size:10px; font-weight:500; transition:all 0.2s; position:relative; }
  .quick-action-btn:hover { border-color:var(--accent); transform:translateY(-3px); box-shadow:0 4px 16px rgba(46,125,50,0.15); }
  .quick-action-btn .qa-icon { font-size:18px; }
  .quick-action-btn .qa-badge { position:absolute; top:-4px; right:-4px; background:var(--red); color:#fff; font-size:9px; padding:1px 5px; border-radius:8px; min-width:18px; text-align:center; }
  .pending-alert { background:linear-gradient(135deg,#fff8e1,#fff3cd); border:1px solid #ffe082; border-radius:var(--radius); padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; animation:slideDown 0.3s ease; }
  @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
  .pending-alert .pa-icon { font-size:18px; }
  .pending-alert .pa-text { font-size:13px; color:#F57F17; font-weight:500; flex:1; }
  .chart-card { background:var(--card); border-radius:var(--radius); box-shadow:var(--shadow); border:1px solid var(--border); padding:16px; }
  .chart-card .chart-title { font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; }
  .chart-card .chart-title .chart-badge { font-size:18px; font-weight:700; color:var(--text); text-transform:none; letter-spacing:0; }
  .mini-legend { display:flex; gap:12px; margin-top:6px; font-size:10px; color:var(--text-muted); flex-wrap:wrap; }
  .mini-legend span { display:flex; align-items:center; gap:4px; }
  .mini-legend .dot { width:8px; height:8px; border-radius:2px; display:inline-block; }
  .insight-banner { background:linear-gradient(135deg,#e8f5e9,#c8e6c9); border:1px solid #a5d6a7; border-radius:var(--radius); padding:14px 18px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:16px; }
  .insight-banner .ib-icon { font-size:22px; }
  .insight-banner .ib-text { flex:1; font-size:13px; color:#1B5E20; }
  .insight-banner .ib-stat { font-size:22px; font-weight:700; color:#1B5E20; text-align:center; }
  .insight-banner .ib-stat small { display:block; font-size:10px; font-weight:400; opacity:0.7; }
  .trend-up { color:#16a34a; } .trend-down { color:#dc2626; } .trend-flat { color:var(--text-muted); }
  .dash-table-wrap { max-height:260px; overflow-y:auto; }
  .dash-table-wrap::-webkit-scrollbar { width:4px; }
  .dash-table-wrap::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:2px; }
  .no-data { padding:24px; text-align:center; color:var(--text-muted); font-size:13px; }
  .chart-container { position:relative; height:180px; width:100%; }
  .chart-container-sm { position:relative; height:150px; width:100%; }
  </style>

  ${pendingTotal > 0 ? `
  <div class="pending-alert">
    <span class="pa-icon"><i class="fas fa-triangle-exclamation" style="color:#F57F17"></i></span>
    <span class="pa-text">${pendingLoans} loan pending &middot; ${pendingWithdrawals} withdrawal pending &middot; ${pendingOnlineDeposits} deposit pending</span>
    ${pendingLoans > 0 ? `<a href="/admin/loans?status=pending" class="btn btn-amber btn-xs">Review Loans</a>` : ''}
    ${pendingWithdrawals > 0 ? `<a href="/admin/withdrawal-requests?status=pending" class="btn btn-amber btn-xs">Review Withdrawals</a>` : ''}
    ${pendingOnlineDeposits > 0 ? `<a href="/admin/online-deposits?status=pending" class="btn btn-amber btn-xs">Review Deposits</a>` : ''}
  </div>` : ''}

  <!-- Quick Actions -->
  <div class="section-title"><i class="fas fa-bolt"></i> Quick Actions</div>
  <div class="quick-actions">
    <a href="/admin/teller" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-hand-holding-dollar"></i></span><span class="qa-label">Teller</span></a>
    <a href="/admin/accounts" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-user-plus"></i></span><span class="qa-label">New Account</span></a>
    <a href="/admin/loans" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-sack-dollar"></i></span><span class="qa-label">Loans${pendingLoans > 0 ? `<span class="qa-badge">${pendingLoans}</span>` : ''}</span></a>
    <a href="/admin/withdrawal-requests" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-money-bill-transfer"></i></span><span class="qa-label">Withdrawals${pendingWithdrawals > 0 ? `<span class="qa-badge">${pendingWithdrawals}</span>` : ''}</span></a>
    <a href="/admin/online-deposits" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-circle-dollar"></i></span><span class="qa-label">Deposits${pendingOnlineDeposits > 0 ? `<span class="qa-badge">${pendingOnlineDeposits}</span>` : ''}</span></a>
    <a href="/admin/gl/trial-balance" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-scale-balanced"></i></span><span class="qa-label">GL Reports</span></a>
    <a href="/admin/audit" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-file-lines"></i></span><span class="qa-label">Audit</span></a>
    <a href="/api/excel/export/all" class="quick-action-btn"><span class="qa-icon"><i class="fas fa-download"></i></span><span class="qa-label">Export</span></a>
  </div>

  <!-- Insight Banner -->
  ${accounts.length > 0 ? `
  <div class="insight-banner">
    <span class="ib-icon"><i class="fas fa-chart-line"></i></span>
    <div class="ib-text">
      <strong>System Summary</strong> &mdash;
      ${accounts.length} member${accounts.length !== 1 ? 's' : ''} &middot; &#x20B1;${totalBalance.toFixed(2)} total savings
      &middot; Avg &#x20B1;${(totalBalance / accounts.length).toFixed(0)}/member
      &middot; ${transactions.length} transactions
      &middot; <span class="${depositTrend === 'up' ? 'trend-up' : depositTrend === 'down' ? 'trend-down' : 'trend-flat'}"><i class="fas fa-arrow-${depositTrend === 'up' ? 'up' : depositTrend === 'down' ? 'down' : 'right'}"></i> ${depositTrendPct}% deposit trend</span>
    </div>
    <div class="ib-stat">${netFlow >= 0 ? '+' : ''}&#x20B1;${netFlow.toFixed(0)}<small>Net Cash Flow</small></div>
  </div>` : ''}

  <!-- Stats Row with FA icons -->
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-users" style="color:var(--blue)"></i></div><div class="stat-value">${accounts.length}</div><div class="stat-label">Total Members</div><div class="stat-sub">${accounts.filter(a => Number(a.actual_balance) > 0).length} active savers</div></div>
    <div class="stat-card" style="border-left:3px solid var(--accent)"><div class="stat-icon"><i class="fas fa-piggy-bank" style="color:var(--accent)"></i></div><div class="stat-value">&#x20B1;${totalBalance.toFixed(0)}</div><div class="stat-label">Total Deposits</div><div class="stat-sub">&#x20B1;${(totalBalance / (accounts.length || 1)).toFixed(0)} avg/member</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-arrows-spin" style="color:var(--purple)"></i></div><div class="stat-value">${transactions.length}</div><div class="stat-label">Transactions</div><div class="stat-sub">${dayCounts[6] || 0} today</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-bullseye" style="color:var(--amber)"></i></div><div class="stat-value">${goals.length}</div><div class="stat-label">Goal Jars</div><div class="stat-sub">${completedGoals} completed (${goals.length > 0 ? (completedGoals / goals.length * 100).toFixed(0) : 0}%)</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-medal" style="color:var(--purple)"></i></div><div class="stat-value">${unlockedBadges}<span style="font-size:13px;color:var(--text-muted)">/${totalBadges}</span></div><div class="stat-label">Badges Unlocked</div><div class="stat-bar"><div class="stat-bar-fill" style="width:${totalBadges > 0 ? (unlockedBadges/totalBadges*100).toFixed(0) : 0}%;background:var(--purple)"></div></div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-star" style="color:var(--amber)"></i></div><div class="stat-value">${totalXp.toLocaleString()}</div><div class="stat-label">Total XP Earned</div><div class="stat-sub">${accounts.length > 0 ? (totalXp / accounts.length).toFixed(0) : 0} avg/member</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-sack-dollar" style="color:var(--teal)"></i></div><div class="stat-value">${Number(loanStats.total_loans || 0)}</div><div class="stat-label">Loan Portfolio</div><div class="stat-sub">&#x20B1;${Number(loanStats.outstanding || 0).toFixed(0)} outstanding</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-boxes-stacked" style="color:var(--pink)"></i></div><div class="stat-value">${activeLoanProducts + shopItemsCount}</div><div class="stat-label">Active Products</div><div class="stat-sub">${activeLoanProducts} loan &middot; ${shopItemsCount} shop</div></div>
  </div>

  <!-- Charts Row - Chart.js -->
  <div class="section-title"><i class="fas fa-chart-simple"></i> Analytics</div>
  <div class="dash-grid">
    <div class="chart-card">
      <div class="chart-title">Daily Transaction Volume <span class="chart-badge">&#x20B1;${(dayDeposits.reduce((s,v) => s+v, 0) + dayWithdrawals.reduce((s,v) => s+v, 0)).toFixed(0)}</span></div>
      <div class="chart-container"><canvas id="dailyVolumeChart"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Balance Distribution <span class="chart-badge">${topAccounts.length} members</span></div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:140px;height:140px"><canvas id="balanceDistChart"></canvas></div>
        <div style="flex:1;min-width:0">
          ${topAccounts.slice(0, 5).map((a, i) => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px">
            <span style="width:10px;height:10px;border-radius:2px;background:${pieColors[i]};flex-shrink:0"></span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.child_name}</span>
            <span style="font-weight:600">&#x20B1;${Number(a.actual_balance).toFixed(0)}</span>
            <span style="color:var(--text-muted)">(${(Number(a.actual_balance) / balanceTotal * 100).toFixed(1)}%)</span>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <div class="dash-grid-3">
    <div class="chart-card">
      <div class="chart-title">XP Leaderboard</div>
      <div class="chart-container-sm"><canvas id="xpChart"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Cash Flow <span class="chart-badge">${netFlow >= 0 ? '+' : ''}&#x20B1;${netFlow.toFixed(0)}</span></div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0">
        <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:700;color:#16a34a">&#x20B1;${cashIn.toFixed(0)}</div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Cash In</div></div>
        <div style="width:40px;height:40px;border-radius:50%;background:${netFlow >= 0 ? '#e8f5e9' : '#fce4ec'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0"><i class="fas fa-arrow-${netFlow >= 0 ? 'up' : 'down'}" style="color:${netFlow >= 0 ? '#16a34a' : '#dc2626'}"></i></div>
        <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:700;color:#dc2626">&#x20B1;${cashOut.toFixed(0)}</div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Cash Out</div></div>
      </div>
      <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;display:flex">
        <div style="width:${cashIn + cashOut > 0 ? (cashIn / (cashIn + cashOut) * 100).toFixed(1) : 50}%;height:100%;background:var(--accent);border-radius:3px 0 0 3px"></div>
        <div style="flex:1;height:100%;background:#ef4444;border-radius:0 3px 3px 0"></div>
      </div>
      <div class="mini-legend" style="margin-top:4px"><span style="color:#16a34a">${(cashIn + cashOut > 0 ? (cashIn / (cashIn + cashOut) * 100).toFixed(0) : 0)}% deposits</span><span style="color:#dc2626">${(cashIn + cashOut > 0 ? (cashOut / (cashIn + cashOut) * 100).toFixed(0) : 0)}% withdrawals</span></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Transaction Activity</div>
      <div class="chart-container-sm"><canvas id="activityChart"></canvas></div>
    </div>
  </div>

  <!-- Excel Import + Tables -->
  <div class="section-title"><i class="fas fa-database"></i> Data Management</div>
  <div class="dash-grid">
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-file-excel"></i> Excel Import</h3></div>
      <div class="card-body-padded">
      <form method="post" enctype="multipart/form-data" style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="file" name="file" accept=".xlsx,.xls,.csv" required style="flex:1;min-width:140px;padding:6px;border:2px solid var(--border);border-radius:6px;font-size:12px">
        <button type="submit" formaction="/admin/upload" class="btn btn-secondary btn-xs"><i class="fas fa-file-import"></i> Parse</button>
        <button type="submit" formaction="/admin/upload-and-seed" class="btn btn-primary btn-xs"><i class="fas fa-seedling"></i> Parse &amp; Seed</button>
      </form>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-handshake"></i> Co-op Goals</h3><span class="count">${completedCoopGoals}/${totalCoopGoals}</span></div>
      <div class="card-body dash-table-wrap">
      ${totalCoopGoals === 0 ? '<div class="no-data">No co-op goals</div>' : `<table><tr><th>Goal</th><th>Progress</th><th>Status</th></tr>
      ${coopGoals.slice(0, 5).map(g => {
        const raised = Number(g.contributed || 0);
        const pct = g.target_amount > 0 ? Math.min((raised / g.target_amount) * 100, 100) : 0;
        return `<tr><td><b>${g.title}</b></td><td><span class="bar"><span class="bar-track"><span class="bar-fill blue" style="width:${pct}%"></span></span>${pct.toFixed(0)}%</span></td><td><span class="badge ${g.is_completed ? 'badge-green' : pct > 0 ? 'badge-blue' : 'badge-gray'}">${g.is_completed ? 'Done' : pct > 0 ? 'Active' : 'New'}</span></td></tr>`;
      }).join('')}
      </table>`}
      </div>
    </div>
  </div>

  <div class="section-title"><i class="fas fa-users"></i> Members & Activity</div>
  <div class="dash-grid">
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-users"></i> Members</h3><span class="count">${accounts.length} total</span><a href="/admin/accounts" class="btn btn-outline btn-xs"><i class="fas fa-gear"></i> Manage</a></div>
      <div class="card-body dash-table-wrap">
      <table><tr><th>Name</th><th>Balance</th><th>XP</th><th>Goals</th></tr>
      ${accounts.length === 0 ? '<tr><td colspan="4" class="no-data">No accounts</td></tr>' : accounts.map(a => {
        const goalCount = goals.filter(g => g.account_id === a.account_id).length;
        return `<tr>
        <td><b>${a.child_name}</b></td>
      <td>&#x20B1;${Number(a.actual_balance).toFixed(2)}</td>
        <td class="num">${a.current_xp}</td>
        <td class="num">${goalCount}</td>
      </tr>`;}).join('')}
      </table></div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-arrows-spin"></i> Recent Transactions</h3><span class="count">recent ${Math.min(transactions.length, 8)}</span><a href="/admin/transactions" class="btn btn-outline btn-xs"><i class="fas fa-eye"></i> View All</a></div>
      <div class="card-body dash-table-wrap">
      ${transactions.length === 0 ? '<div class="no-data">No transactions</div>' : `<table><tr><th>Child</th><th>Type</th><th>Amount</th><th>Date</th></tr>
      ${transactions.slice(0, 8).map(t => {
        const dateStr = t.created_at ? t.created_at.slice(0, 10) : '';
        const badgeCls = ({deposit:'badge-green',withdrawal:'badge-red',loan_disbursement:'badge-amber',loan_payment:'badge-blue',interest_credit:'badge-purple',interest:'badge-purple',allocation:'badge-purple'})[t.type] || 'badge-gray';
        const isInflow = ['deposit','loan_disbursement','interest_credit','interest'].includes(t.type);
        return `<tr>
        <td>${t.child_name || '-'}</td>
        <td><span class="badge ${badgeCls}">${t.type.replace(/_/g,' ')}</span></td>
        <td class="num" style="color:${isInflow ? 'var(--accent)' : 'var(--red)'}">${isInflow ? '+' : '-'}&#x20B1;${Number(t.amount).toFixed(2)}</td>
        <td class="mono" style="font-size:10px">${dateStr}</td>
      </tr>`;}).join('')}
      </table>`}
      </div>
    </div>
  </div>

  <script>
  document.addEventListener('DOMContentLoaded', function() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var textColor = isDark ? '#94a3b8' : '#64748b';
    var gridColor = isDark ? '#2a3a2e' : '#e2e8f0';

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";

    // Daily Volume Chart
    var ctx1 = document.getElementById('dailyVolumeChart');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(dayLabels)},
          datasets: [
            { label: 'Deposits', data: ${JSON.stringify(dayDeposits)}, backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 3 },
            { label: 'Withdrawals', data: ${JSON.stringify(dayWithdrawals)}, backgroundColor: 'rgba(59,130,246,0.7)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 3 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } },
          scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor }, ticks: { callback: function(v) { return '₱' + v.toLocaleString(); } } } } }
      });
    }

    // Balance Distribution Doughnut
    var ctx2 = document.getElementById('balanceDistChart');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ${JSON.stringify(topAccounts.map(a => a.child_name))},
          datasets: [{ data: ${JSON.stringify(topBalances)}, backgroundColor: ${JSON.stringify(pieColors)}, borderWidth: 2, borderColor: isDark ? '#1a231c' : '#fff' }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
      });
    }

    // XP Leaderboard Horizontal Bar
    var ctx3 = document.getElementById('xpChart');
    if (ctx3) {
      new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(xpTop.map(a => a.child_name))},
          datasets: [{ label: 'XP', data: ${JSON.stringify(xpTop.map(a => Number(a.current_xp)))}, backgroundColor: ['rgba(245,158,11,0.7)','rgba(59,130,246,0.7)','rgba(34,197,94,0.7)','rgba(139,92,246,0.7)','rgba(239,68,68,0.7)','rgba(6,182,212,0.7)'], borderRadius: 3 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { grid: { color: gridColor } }, y: { grid: { display: false } } } }
      });
    }

    // Transaction Activity Doughnut
    var ctx4 = document.getElementById('activityChart');
    if (ctx4) {
      var activityTypes = ${JSON.stringify(['deposit','withdrawal','loan_disbursement','loan_payment','interest_credit','allocation'])};
      var activityCounts = activityTypes.map(function(t) { return transactions.filter(function(x) { return x.type === t; }).length; });
      var activityColors = ['rgba(34,197,94,0.7)','rgba(239,68,68,0.7)','rgba(245,158,11,0.7)','rgba(59,130,246,0.7)','rgba(139,92,246,0.7)','rgba(6,182,212,0.7)'];
      new Chart(ctx4, {
        type: 'doughnut',
        data: {
          labels: activityTypes.map(function(t) { return t.replace(/_/g,' '); }),
          datasets: [{ data: activityCounts, backgroundColor: activityColors, borderWidth: 2, borderColor: isDark ? '#1a231c' : '#fff' }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 10 } } } } }
      });
    }
  });
  </script>
  `;

  // Inject transaction data as a global variable for the chart script
  const chartDataScript = `<script>var transactions = ${JSON.stringify(transactions.map(t => ({ type: t.type, amount: t.amount })))};<\/script>`;

  res.type('html').send(layout('Dashboard', 'dashboard', chartDataScript + content, {
    subtitle: now.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    headerActions: '<a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm"><i class="fas fa-scale-balanced"></i> Trial Balance</a><a href="/api/excel/export/all" class="btn btn-secondary btn-sm"><i class="fas fa-download"></i> Export</a>',
  }));
}));

router.get('/shop', requireRole(1), asyncHandler(async (req, res) => {

  const items = await sql('SELECT * FROM shop_items ORDER BY type, cost ASC');

  const q = req.query;

  const banner = q.added === 'ok' ? 'success:Item added successfully.'
    : q.updated === 'ok' ? 'success:Item updated successfully.'
    : q.deleted === 'ok' ? 'success:Item deleted successfully.'
    : q.uploaded === 'ok' ? 'success:Image uploaded successfully.'
    : q.error ? `error:${q.error}`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — Shop Manager</title>
<style>
:root {
  --sidebar: #0d2818; --sidebar-hover: #1a3d2a; --sidebar-active: #2E7D32;
  --sidebar-text: #94a3b8; --sidebar-text-active: #ffffff;
  --bg: #f0f4f8; --card: #ffffff; --border: #e2e8f0;
  --text: #1e293b; --text-muted: #64748b;
  --accent: #2E7D32; --accent-hover: #1B5E20;
  --green: #22c55e; --blue: #3b82f6; --amber: #f59e0b; --purple: #8b5cf6; --red: #ef4444;
  --radius: 12px; --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-lg: 0 4px 24px rgba(0,0,0,0.08);
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
}
* { margin:0; padding:0; box-sizing:border-box; }
html { font-size:14px; }
body { font-family:var(--font); background:var(--bg); color:var(--text); display:flex; min-height:100vh; }

.sidebar { width:240px; background:var(--sidebar); display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:50; }
.sidebar-brand { padding:20px 20px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
.sidebar-brand h1 { font-size:18px; color:#fff; font-weight:700; }
.sidebar-brand span { font-size:11px; color:var(--sidebar-text); display:block; margin-top:2px; }
.sidebar-nav { flex:1; padding:12px 10px; display:flex; flex-direction:column; gap:2px; }
.sidebar-nav a { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:var(--sidebar-text); text-decoration:none; font-size:13px; font-weight:500; transition:all 0.15s; }
.sidebar-nav a:hover { background:var(--sidebar-hover); color:#fff; }
.sidebar-nav a.active { background:var(--sidebar-active); color:#fff; font-weight:600; }
.sidebar-nav a .icon { font-size:16px; width:20px; text-align:center; }
.sidebar-nav a .badge-count { margin-left:auto; background:rgba(255,255,255,0.1); padding:1px 8px; border-radius:10px; font-size:11px; }
.sidebar-footer { padding:12px 10px; border-top:1px solid rgba(255,255,255,0.06); }
.sidebar-footer a { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:var(--sidebar-text); text-decoration:none; font-size:13px; transition:all 0.15s; }
.sidebar-footer a:hover { background:var(--sidebar-hover); color:#fff; }

.main { margin-left:240px; flex:1; padding:24px 28px; }
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:12px; }
.page-header h2 { font-size:20px; font-weight:700; }
.page-header .meta { font-size:12px; color:var(--text-muted); }
.header-actions { display:flex; gap:8px; flex-wrap:wrap; }

.toast { position:fixed; top:20px; right:20px; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:500; z-index:999; box-shadow:var(--shadow-lg); animation:slideIn 0.3s ease; max-width:400px; }
.toast.success { background:#e8f5e9; color:#1B5E20; border:1px solid #a5d6a7; }
.toast.error { background:#fce4ec; color:#b71c1c; border:1px solid #ef9a9a; }
@keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }

.btn { display:inline-flex; align-items:center; gap:6px; padding:8px 18px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:all 0.15s; white-space:nowrap; }
.btn-primary { background:var(--accent); color:#fff; }
.btn-primary:hover { background:var(--accent-hover); }
.btn-secondary { background:#e8f5e9; color:var(--accent); }
.btn-secondary:hover { background:#c8e6c9; }
.btn-outline { background:transparent; color:var(--text); border:1px solid var(--border); }
.btn-outline:hover { background:var(--bg); }
.btn-danger { background:var(--red); color:#fff; }
.btn-danger:hover { background:#dc2626; }
.btn-amber { background:var(--amber); color:#fff; }
.btn-amber:hover { background:#d97706; }
.btn-xs { padding:4px 10px; font-size:11px; }

.card { background:var(--card); border-radius:var(--radius); box-shadow:var(--shadow); border:1px solid var(--border); margin-bottom:20px; overflow:hidden; }
.card-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); }
.card-header h3 { font-size:15px; font-weight:600; display:flex; align-items:center; gap:8px; }
.card-body { overflow-x:auto; overflow-y:visible; padding:0; }

table { width:100%; border-collapse:collapse; }
th { background:#f8fafc; color:var(--text-muted); padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; white-space:nowrap; border-bottom:1px solid var(--border); }
td { padding:9px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; vertical-align:middle; }
tr:last-child td { border-bottom:none; }
tr:hover td { background:#f8fafc; }
td.mono { font-family:var(--mono); font-size:12px; }

.preview-cell { display:flex; align-items:center; gap:8px; }
.preview-emoji { font-size:26px; line-height:1; }
.preview-img { width:34px; height:34px; border-radius:50%; object-fit:cover; }
.preview-img-border { width:48px; height:48px; border-radius:8px; object-fit:contain; background:#f1f5f9; display:inline-flex; align-items:center; justify-content:center; }
.preview-border { display:inline-block; width:34px; height:34px; border-radius:8px; }

.badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600; }
.badge-green { background:#e8f5e9; color:var(--accent); }
.badge-red { background:#fce4ec; color:var(--red); }
.badge-purple { background:#f3e5f5; color:var(--purple); }
.badge-blue { background:#e3f2fd; color:var(--blue); }
.badge-gray { background:#f1f5f9; color:var(--text-muted); }

.rarity-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; }

.actions-cell { display:flex; gap:4px; flex-wrap:nowrap; }
.actions-cell form { display:inline; }

.modal-overlay { display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:100; align-items:center; justify-content:center; }
.modal-overlay:target { display:flex; }
.modal { background:var(--card); border-radius:16px; padding:28px; width:100%; max-width:480px; max-height:90vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.2); }
.modal h2 { font-size:17px; font-weight:700; margin-bottom:16px; color:var(--text); }
.modal label { display:block; font-size:12px; font-weight:600; color:var(--text-muted); margin-top:12px; margin-bottom:3px; }
.modal input, .modal select { width:100%; padding:9px 12px; border:2px solid var(--border); border-radius:8px; font-size:14px; outline:none; }
.modal input:focus, .modal select:focus { border-color:var(--accent); }
.modal .btn { margin-top:14px; }
.modal .close { float:right; color:#999; text-decoration:none; font-size:24px; line-height:1; }
.modal .close:hover { color:#333; }
.form-row { display:flex; gap:12px; }
.form-row > div { flex:1; }

@media(max-width:768px) {
  .sidebar { width:60px; }
  .sidebar-brand h1, .sidebar-brand span, .sidebar-nav a span, .sidebar-footer a span { display:none; }
  .sidebar-nav a { justify-content:center; padding:10px; }
  .sidebar-footer a { justify-content:center; padding:10px; }
  .sidebar-nav a .badge-count { display:none; }
  .main { margin-left:60px; padding:16px; }
}
</style>
</head>
<body>

<div class="sidebar">
  <div class="sidebar-brand">
    <h1>&#x1F3E6; LabCoop</h1>
    <span>Admin Dashboard</span>
  </div>
  <div class="sidebar-nav">
    <a href="/admin"><span class="icon">&#x1F4CA;</span> <span>Dashboard</span></a>
    <a href="/admin/teller"><span class="icon">&#x1F3E6;</span> <span>Teller</span></a>
    <a href="/admin/accounts"><span class="icon">&#x1F465;</span> <span>Accounts</span></a>
    <a href="/admin/loans"><span class="icon">&#x1F4B0;</span> <span>Loans</span></a>
    <a href="/admin/withdrawal-requests"><span class="icon">&#x1F4B8;</span> <span>Withdrawals</span></a>
    <a href="/admin/online-deposits"><span class="icon">&#x1F4B0;</span> <span>Online Deposits</span></a>
    <a href="/admin/loan-products"><span class="icon">&#x1F3ED;</span> <span>Loan Products</span></a>
    <a href="/admin/savings-products"><span class="icon">&#x1F4E6;</span> <span>Savings Products</span></a>
    <a href="/admin/goals"><span class="icon">&#x1F3AF;</span> <span>Goals</span></a>
    <a href="/admin/badges"><span class="icon">&#x1F3C6;</span> <span>Badges</span></a>
    <a href="/admin/transactions"><span class="icon">&#x1F4B3;</span> <span>Transactions</span></a>
    <a href="/admin/shop" class="active"><span class="icon">&#x1F6D2;</span> <span>Shop</span><span class="badge-count">${items.length}</span></a>
    <a href="/admin/quiz"><span class="icon">&#x1F4DD;</span> <span>Quiz</span></a>
    <a href="/admin/settings"><span class="icon">&#x2699;</span> <span>Settings</span></a>
  </div>
  <div class="sidebar-footer">
    <a href="/admin/logout"><span class="icon">&#x1F6AA;</span> <span>Logout</span></a>
  </div>
</div>

<div class="main">
  <div class="page-header">
    <div>
      <h2>&#x1F6D2; Shop Manager</h2>
      <div class="meta">${items.filter(i=>i.type==='avatar').length} avatars &middot; ${items.filter(i=>i.type==='border').length} borders &middot; ${items.length} total items</div>
    </div>
    <div class="header-actions">
      <a href="#add-modal" class="btn btn-primary">&#x2795; Add Item</a>
      <a href="/api/shop/items" target="_blank" class="btn btn-outline">&#x1F4EC; API</a>
    </div>
  </div>

  ${banner ? `<div class="toast ${banner.startsWith('error:') ? 'error' : 'success'}">${banner.startsWith('error:') ? '&#x274C; ' + banner.slice(6) : '&#x2705; ' + banner.slice(8)}</div>` : ''}

  <div class="card">
    <div class="card-header"><h3>&#x1F4E6; All Items</h3><span class="badge badge-green">${items.length} total</span></div>
    <div class="card-body">
    <table><tr><th>Preview</th><th>Type</th><th>ID</th><th>Name</th><th>Cost</th><th>Rarity</th><th>Status</th><th>Actions</th></tr>
    ${items.map(item => {
      const isAvatar = item.type === 'avatar';
      return `<tr>
      <td><div class="preview-cell">${isAvatar
        ? (item.image_url
          ? `<img src="${item.image_url}" class="preview-img">`
          : `<span class="preview-emoji">${item.emoji || '&#x2753;'}</span>`)
          : (item.image_url
          ? `<img src="${item.image_url}" class="preview-img-border">`
          : `<span class="preview-border" style="background:linear-gradient(135deg,${item.color1||'#2E7D32'},${item.color2||'#2E7D32'})"></span>`)
       }</div></td>
      <td><span class="badge ${item.type==='avatar'?'badge-blue':'badge-purple'}">${item.type}</span></td>
      <td class="mono">${item.id}</td>
      <td><b>${item.name}</b></td>
      <td><strong>${item.cost}</strong> <span style="color:var(--amber);font-size:11px">&#x2B50;</span></td>
      <td><span class="rarity-dot" style="background:${item.rarity==='Common'?'#9E9E9E':item.rarity==='Uncommon'?'#4CAF50':item.rarity==='Rare'?'#2196F3':item.rarity==='Epic'?'#9C27B0':item.rarity==='Legendary'?'#FF6F00':item.rarity==='Mythic'?'#D32F2F':'#2E7D32'}"></span>${item.rarity}</td>
      <td><span class="badge ${item.is_active ? 'badge-green' : 'badge-gray'}">${item.is_active ? 'Active' : 'Inactive'}</span></td>
      <td><div class="actions-cell">
        <a href="#edit-${item.id}" class="btn btn-secondary btn-xs">&#x270F;</a>
        <a href="#upload-${item.id}" class="btn btn-amber btn-xs">&#x1F4F7;</a>
        <form method="post" action="/admin/shop/delete/${item.id}" data-confirm="Delete ${item.name}?">
          <button type="submit" class="btn btn-danger btn-xs">&#x1F5D1;</button>
        </form>
      </div></td>
    </tr>`;
    }).join('')}
    </table></div>
  </div>
</div>

<!-- Add modal -->
<div id="add-modal" class="modal-overlay">
<div class="modal">
<a href="#" class="close">&times;</a>
<h2>&#x2795; Add New Item</h2>
<form method="post" action="/admin/shop/create" enctype="multipart/form-data">
  <div class="form-row">
    <div><label for="type">Type</label><select id="type" name="type" required><option value="">Select...</option><option value="avatar">Avatar</option><option value="border">Border</option></select></div>
    <div><label for="name">Name</label><input type="text" id="name" name="name" placeholder="e.g. Dragon" required></div>
  </div>
  <div class="form-row">
    <div><label for="cost">Cost (&#x2B50;)</label><input type="number" id="cost" name="cost" min="0" value="10" required></div>
    <div><label for="rarity">Rarity</label><select id="rarity" name="rarity">${['Common','Uncommon','Rare','Epic','Legendary','Mythic','Special'].map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div>
  </div>
  <label for="emoji">Emoji (for avatars)</label>
  <input type="text" id="emoji" name="emoji" placeholder="e.g. 🐉" maxlength="4">
  <label for="image">Image file (for avatars, optional)</label>
  <input type="file" id="image" name="image" accept=".png,.jpg,.jpeg,.gif,.webp">
  <button type="submit" class="btn btn-primary">&#x2795; Add Item</button>
</form>
</div>
</div>

<!-- Edit modals -->
${items.map(item => {
  const isAvatar = item.type === 'avatar';
  return `<div id="edit-${item.id}" class="modal-overlay">
<div class="modal">
<a href="#" class="close">&times;</a>
<h2>&#x270F; ${item.name}</h2>
<form method="post" action="/admin/shop/update/${item.id}">
  <div class="form-row">
    <div><label for="ename_${item.id}">Name</label><input type="text" id="ename_${item.id}" name="name" value="${item.name}" required></div>
    <div><label for="ecost_${item.id}">Cost</label><input type="number" id="ecost_${item.id}" name="cost" min="0" value="${item.cost}"></div>
  </div>
  <div class="form-row">
    <div><label for="erarity_${item.id}">Rarity</label><select id="erarity_${item.id}" name="rarity">${['Common','Uncommon','Rare','Epic','Legendary','Mythic','Special'].map(r=>`<option value="${r}"${r===item.rarity?' selected':''}>${r}</option>`).join('')}</select></div>
    <div><label for="eactive_${item.id}">Status</label><select id="eactive_${item.id}" name="is_active"><option value="1"${item.is_active?' selected':''}>Active</option><option value="0"${!item.is_active?' selected':''}>Inactive</option></select></div>
  </div>
  ${item.image_url ? `<p style="margin-bottom:12px">Current image: <img src="${item.image_url}" style="width:48px;height:48px;border-radius:${isAvatar?'50%':'8px'};object-fit:${isAvatar?'cover':'contain'};background:#f1f5f9;vertical-align:middle"></p>` : ''}
  ${isAvatar ? `<label for="eemoji_${item.id}">Emoji</label><input type="text" id="eemoji_${item.id}" name="emoji" value="${item.emoji||''}" maxlength="4">` : `<div class="form-row"><div><label for="ecolor1_${item.id}">Color 1</label><input type="color" id="ecolor1_${item.id}" name="color1" value="${item.color1}"></div><div><label for="ecolor2_${item.id}">Color 2</label><input type="color" id="ecolor2_${item.id}" name="color2" value="${item.color2}"></div></div>`}
  <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
</form>
</div>
</div>`;
}).join('')}

<!-- Upload modals -->
${items.map(item => `<div id="upload-${item.id}" class="modal-overlay">
<div class="modal">
<a href="#" class="close">&times;</a>
<h2>&#x1F4F7; ${item.name}</h2>
${item.image_url ? `<p style="margin-bottom:12px">Current: <img src="${item.image_url}" style="width:48px;height:48px;border-radius:${item.type==='avatar'?'50%':'8px'};object-fit:${item.type==='avatar'?'cover':'contain'};background:#f1f5f9;vertical-align:middle"></p>` : ''}
<form method="post" action="/admin/shop/upload/${item.id}" enctype="multipart/form-data">
  <label for="uimage_${item.id}">Image (png, jpg, webp)</label>
  <input type="file" id="uimage_${item.id}" name="image" accept=".png,.jpg,.jpeg,.gif,.webp" required>
  <button type="submit" class="btn btn-amber">&#x1F4F7; Upload</button>
</form>
</div>
</div>`).join('')}

<script>
const toast = document.querySelector('.toast');
if (toast) setTimeout(()=>{toast.style.opacity='0';toast.style.transition='opacity 0.5s';setTimeout(()=>toast.remove(),500)},3500);
document.querySelectorAll('.sidebar-nav a').forEach(a=>{if(a.href===location.href||a.href===location.href.split('?')[0])a.classList.add('active')});
</script>
</body>
</html>`;

  res.type('html').send(html);
}));

const shopUpload = require('multer')({
  dest: require('path').join(__dirname, '..', 'uploads', 'shop'),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/shop/create', requireRole(2), shopUpload.single('image'), asyncHandler(async (req, res) => {
  try {

    const { name, type, cost, rarity, emoji } = req.body;
    if (!name || !type) return res.redirect('/admin/shop?error=Name+and+type+required');
    const id = `shop_${require('crypto').randomBytes(4).toString('hex')}`;
    await store.query(`
      INSERT INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
    `, [id, name.trim(), type, Number(cost) || 0, emoji || '', rarity || 'Common', '#2E7D32', '#2E7D32', '']);
    const { v4: uuidv4 } = require('uuid');
    if (req.file) {
      const ext = require('path').extname(req.file.originalname).toLowerCase();
      const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
      const dest = require('path').join(__dirname, '..', 'uploads', 'shop', filename);
      require('fs').renameSync(req.file.path, dest);
      const imageUrl = '/uploads/shop/' + filename;
      await store.query("UPDATE shop_items SET image_url=$1 WHERE id=$2", [imageUrl, id]);
    }
    res.redirect('/admin/shop?added=ok');
  } catch (err) {
    res.redirect(`/admin/shop?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/shop/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/shop?error=Item+not+found');
    const { name, cost, rarity, emoji, color1, color2, is_active } = req.body;
    await store.query(`
      UPDATE shop_items SET name=$1, cost=$2, emoji=$3, rarity=$4, color1=$5, color2=$6, is_active=$7, updated_at=CURRENT_TIMESTAMP
      WHERE id=$8
    `, [
      name ?? existing.name, Number(cost ?? existing.cost),
      emoji ?? existing.emoji, rarity ?? existing.rarity,
      color1 ?? existing.color1, color2 ?? existing.color2,
      is_active !== undefined ? (is_active === '1' ? 1 : 0) : existing.is_active,
      req.params.id
    ]);
    res.redirect('/admin/shop?updated=ok');
  } catch (err) {
    res.redirect(`/admin/shop?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/shop/delete/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/shop?error=Item+not+found');
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const filePath = require('path').join(__dirname, '..', existing.image_url);
      if (require('fs').existsSync(filePath)) require('fs').unlinkSync(filePath);
    }
    await store.query('DELETE FROM shop_items WHERE id = $1', [req.params.id]);
    res.redirect('/admin/shop?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/shop?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/shop/upload/:id', requireRole(2), shopUpload.single('image'), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/shop?error=Item+not+found');
    if (!req.file) return res.redirect('/admin/shop?error=No+file');
    const ext = require('path').extname(req.file.originalname).toLowerCase();
    if (!'.png.jpg.jpeg.gif.webp'.includes(ext)) {
      require('fs').unlinkSync(req.file.path);
      return res.redirect('/admin/shop?error=Invalid+file+type');
    }
    const { v4: uuidv4 } = require('uuid');
    const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    const dest = require('path').join(__dirname, '..', 'uploads', 'shop', filename);
    require('fs').renameSync(req.file.path, dest);
    const imageUrl = '/uploads/shop/' + filename;
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const oldFile = require('path').join(__dirname, '..', existing.image_url);
      if (require('fs').existsSync(oldFile)) require('fs').unlinkSync(oldFile);
    }
    await store.query("UPDATE shop_items SET image_url=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [imageUrl, req.params.id]);
    res.redirect('/admin/shop?uploaded=ok');
  } catch (err) {
    res.redirect(`/admin/shop?error=${encodeURIComponent(err.message)}`);
  }
}));
// ── Quiz Management ──

router.get('/quiz', requireRole(1), asyncHandler(async (req, res) => {

  const questions = await sql('SELECT * FROM quiz_questions ORDER BY difficulty_level, category, question');
  const q = req.query;
  const toast = q.added ? 'success:Question created.'
    : q.updated ? 'success:Question updated.'
    : q.deleted ? 'success:Question deleted.'
    : q.error ? `error:${q.error}`
    : '';

  const difficultyColors = { easy: 'badge-green', medium: 'badge-amber', hard: 'badge-red', expert: 'badge-purple' };

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4DD;</div><div class="stat-value">${questions.length}</div><div class="stat-label">Total Questions</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F331;</div><div class="stat-value">${questions.filter(x => x.difficulty_level === 'easy').length}</div><div class="stat-label">Easy</div></div>
    <div class="stat-card"><div class="stat-icon">&#x26A1;</div><div class="stat-value">${questions.filter(x => x.difficulty_level === 'medium').length}</div><div class="stat-label">Medium</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F525;</div><div class="stat-value">${questions.filter(x => x.difficulty_level === 'hard').length}</div><div class="stat-label">Hard</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4A1;</div><div class="stat-value">${questions.filter(x => x.difficulty_level === 'expert').length}</div><div class="stat-label">Expert</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4DD; Quiz Questions</h3>
      <div><a href="#add-question" class="btn btn-primary btn-sm">&#x2795; New Question</a></div>
    </div>
    <div class="card-body">
    <table><tr><th>Question</th><th>Category</th><th>Level</th><th>Options</th><th>Answer</th><th>XP</th><th>Coins</th><th>Active</th><th>Actions</th></tr>
    ${questions.map(qu => {
      const opts = JSON.parse(qu.options || '[]');
      return `<tr>
        <td><b>${qu.question}</b></td>
        <td><span class="badge badge-blue">${qu.category}</span></td>
        <td><span class="badge ${difficultyColors[qu.difficulty_level] || 'badge-gray'}">${qu.difficulty_level}</span></td>
        <td style="font-size:12px">${opts.map((o, i) => `${i === qu.correct_index ? '<b>' : ''}${i+1}. ${o}${i === qu.correct_index ? ' ✓</b>' : ''}`).join('<br>')}</td>
        <td class="num">${qu.correct_index + 1}</td>
        <td class="num">${qu.xp_reward}</td>
        <td class="num">${qu.coin_reward}</td>
        <td>${qu.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
        <td><div style="display:flex;gap:4px">
          <a href="#edit-${qu.id}" class="btn btn-secondary btn-xs">&#x270F;</a>
          <form class="inline" method="post" action="/admin/quiz/delete/${qu.id}" data-confirm="Delete this question?">
            <button type="submit" class="btn btn-danger btn-xs">&#x1F5D1;</button>
          </form>
        </div></td>
      </tr>`;
    }).join('')}
    </table></div>
  </div>

  <!-- Add Question Modal -->
  <div id="add-question" class="modal-overlay">
  <div class="modal" style="max-width:600px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Question</h2>
  <form method="post" action="/admin/quiz/create">
    <label for="qquestion">Question</label>
    <textarea id="qquestion" name="question" rows="2" required style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font)"></textarea>
    <div class="form-row">
      <div><label for="qcat">Category</label>
        <select id="qcat" name="category">
          <option value="Savings">Savings</option><option value="Budgeting">Budgeting</option>
          <option value="Banking">Banking</option><option value="Investing">Investing</option><option value="Math">Math</option>
        </select></div>
      <div><label for="qdiff">Difficulty</label>
        <select id="qdiff" name="difficulty_level">
          <option value="easy">Easy</option><option value="medium">Medium</option>
          <option value="hard">Hard</option><option value="expert">Expert</option>
        </select></div>
    </div>
    <label>Options (4 choices)</label>
    <div class="form-row"><div><input type="text" name="opt0" placeholder="Option 1" required></div><div><input type="text" name="opt1" placeholder="Option 2" required></div></div>
    <div class="form-row"><div><input type="text" name="opt2" placeholder="Option 3" required></div><div><input type="text" name="opt3" placeholder="Option 4" required></div></div>
    <div class="form-row">
      <div><label for="qcorrect">Correct Answer (1-4)</label><input type="number" id="qcorrect" name="correct_index" min="0" max="3" value="0" required></div>
      <div><label for="qxp">XP Reward</label><input type="number" id="qxp" name="xp_reward" min="1" value="10"></div>
      <div><label for="qcoin">Coin Reward</label><input type="number" id="qcoin" name="coin_reward" min="1" value="5"></div>
    </div>
    <label for="qexp">Explanation</label>
    <textarea id="qexp" name="explanation" rows="2" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font)"></textarea>
    <button type="submit" class="btn btn-primary">&#x2795; Create Question</button>
  </form>
  </div>
  </div>

  ${questions.map(qu => {
    const opts = JSON.parse(qu.options || '[]');
    return `
  <div id="edit-${qu.id}" class="modal-overlay">
  <div class="modal" style="max-width:600px">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; Edit Question</h2>
  <form method="post" action="/admin/quiz/update/${qu.id}">
    <label for="eqq_${qu.id}">Question</label>
    <textarea id="eqq_${qu.id}" name="question" rows="2" required style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font)">${qu.question}</textarea>
    <div class="form-row">
      <div><label for="eqc_${qu.id}">Category</label>
        <select id="eqc_${qu.id}" name="category">
          ${['Savings','Budgeting','Banking','Investing','Math'].map(c => `<option value="${c}"${c === qu.category ? ' selected' : ''}>${c}</option>`).join('')}
        </select></div>
      <div><label for="eqd_${qu.id}">Difficulty</label>
        <select id="eqd_${qu.id}" name="difficulty_level">
          ${['easy','medium','hard','expert'].map(d => `<option value="${d}"${d === qu.difficulty_level ? ' selected' : ''}>${d.charAt(0).toUpperCase() + d.slice(1)}</option>`).join('')}
        </select></div>
    </div>
    <label>Options</label>
    <div class="form-row"><div><input type="text" name="opt0" value="${opts[0] || ''}" required></div><div><input type="text" name="opt1" value="${opts[1] || ''}" required></div></div>
    <div class="form-row"><div><input type="text" name="opt2" value="${opts[2] || ''}" required></div><div><input type="text" name="opt3" value="${opts[3] || ''}" required></div></div>
    <div class="form-row">
      <div><label for="eqi_${qu.id}">Correct Answer (1-4)</label><input type="number" id="eqi_${qu.id}" name="correct_index" min="0" max="3" value="${qu.correct_index}"></div>
      <div><label for="eqx_${qu.id}">XP</label><input type="number" id="eqx_${qu.id}" name="xp_reward" min="1" value="${qu.xp_reward}"></div>
      <div><label for="eqc2_${qu.id}">Coins</label><input type="number" id="eqc2_${qu.id}" name="coin_reward" min="1" value="${qu.coin_reward}"></div>
    </div>
    <div><label><input type="checkbox" name="is_active" value="1" ${qu.is_active ? 'checked' : ''}> Active</label></div>
    <label for="eqe_${qu.id}">Explanation</label>
    <textarea id="eqe_${qu.id}" name="explanation" rows="2" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font)">${qu.explanation || ''}</textarea>
    <button type="submit" class="btn btn-primary">&#x270F; Update</button>
  </form>
  </div>
  </div>`;
  }).join('')}
  `;

  res.type('html').send(layout('Quiz Questions', 'quiz', content, { toast: toast || undefined }));
}));

router.post('/quiz/create', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const { question, category, difficulty_level, opt0, opt1, opt2, opt3, correct_index, xp_reward, coin_reward, explanation } = req.body;
    if (!question || !opt0 || !opt1) return res.redirect('/admin/quiz?error=Question+and+at+least+2+options+required');
    const options = JSON.stringify([opt0, opt1, opt2 || '', opt3 || '']);
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await store.query(`
      INSERT INTO quiz_questions (id, question, options, correct_index, explanation, category, difficulty_level, xp_reward, coin_reward, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
    `, [id, question.trim(), options, Number(correct_index) || 0, explanation || '', category || 'General', difficulty_level || 'easy', Number(xp_reward) || 10, Number(coin_reward) || 5]);
    res.redirect('/admin/quiz?added=ok');
  } catch (err) {
    res.redirect(`/admin/quiz?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/quiz/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM quiz_questions WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/quiz?error=Question+not+found');
    const { question, category, difficulty_level, opt0, opt1, opt2, opt3, correct_index, xp_reward, coin_reward, explanation, is_active } = req.body;
    const options = opt0 || opt1 ? JSON.stringify([opt0 || existing.options[0], opt1 || '', opt2 || '', opt3 || '']) : existing.options;
    await store.query(`
      UPDATE quiz_questions SET question=$1, options=$2, correct_index=$3, explanation=$4, category=$5, difficulty_level=$6, xp_reward=$7, coin_reward=$8, is_active=$9, updated_at=CURRENT_TIMESTAMP
      WHERE id=$10
    `, [
      question ?? existing.question, options, Number(correct_index ?? existing.correct_index),
      explanation ?? existing.explanation, category ?? existing.category,
      difficulty_level ?? existing.difficulty_level, Number(xp_reward ?? existing.xp_reward),
      Number(coin_reward ?? existing.coin_reward), is_active === '1' ? 1 : 0,
      req.params.id
    ]);
    res.redirect('/admin/quiz?updated=ok');
  } catch (err) {
    res.redirect(`/admin/quiz?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/quiz/delete/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM quiz_questions WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/quiz?error=Question+not+found');
    await store.query('DELETE FROM quiz_questions WHERE id = $1', [req.params.id]);
    res.redirect('/admin/quiz?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/quiz?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Accounts Management ──

router.get('/accounts', requireRole(1), asyncHandler(async (req, res) => {

  const accounts = await sql('SELECT * FROM accounts ORDER BY child_name ASC');
  const q = req.query;
  const toast = q.added ? 'success:Account created.'
    : q.updated ? 'success:Account updated.'
    : q.deleted ? 'success:Account deleted.'
    : q.toggled ? 'success:Account status changed.'
    : q.uploaded ? 'success:Photo uploaded.'
    : q.error ? `error:${q.error}`
    : '';
  const membershipFee = await store.getSetting('membership_fee') || '100';
  const insuranceFee = await store.getSetting('insurance_fee') || '50';
  const initialSavings = await store.getSetting('initial_savings') || '100';

  const content = `
  <style>
  .profile-upload-area { cursor:pointer; display:flex; align-items:center; gap:16px; margin-bottom:16px; padding:16px; background:var(--bg-secondary); border-radius:12px; position:relative }
  .profile-upload-area .av-wrap { position:relative; width:72px; height:72px; flex-shrink:0 }
  .profile-upload-area .av-wrap img, .profile-upload-area .av-wrap .empty-avatar { width:100%; height:100%; border-radius:50%; object-fit:cover }
  .profile-upload-area .av-wrap .empty-avatar { background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700 }
  .profile-upload-area .av-wrap .upload-overlay { position:absolute; inset:0; border-radius:50%; background:rgba(0,0,0,0.4); color:#fff; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.2s; font-size:18px; cursor:pointer }
  .profile-upload-area .av-wrap:hover .upload-overlay { opacity:1 }
  .profile-upload-area input[type=file] { display:none }
  .vcard { text-align:center; padding:24px 16px 16px }
  .vcard .vc-av { position:relative; width:120px; height:120px; border-radius:50%; margin:0 auto 12px; cursor:pointer; overflow:hidden }
  .vcard .vc-av img { width:100%; height:100%; object-fit:cover }
  .vcard .vc-av .empty-avatar { width:100%; height:100%; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:48px; font-weight:700 }
  .vcard .vc-av .upload-overlay { position:absolute; inset:0; border-radius:50%; background:rgba(0,0,0,0.45); color:#fff; display:flex; align-items:center; justify-content:center; flex-direction:column; opacity:0; transition:opacity 0.25s; font-size:14px; cursor:pointer }
  .vcard .vc-av .upload-overlay i { font-size:24px; margin-bottom:4px }
  .vcard .vc-av:hover .upload-overlay { opacity:1 }
  .vcard .vc-av input[type=file] { display:none }
  .vcard h2 { font-size:22px; margin:0 0 2px }
  .vcard .vc-meta { font-size:13px; color:var(--text-muted); margin-bottom:12px }
  .vcard .vc-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; text-align:left; margin-bottom:16px }
  .vcard .vc-grid .vc-item { padding:8px 12px; background:var(--bg-secondary); border-radius:8px }
  .vcard .vc-grid .vc-item .vcl { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600 }
  .vcard .vc-grid .vc-item .vcv { font-size:14px; font-weight:600; color:var(--text) }
  .vc-actions { display:flex; gap:8px; justify-content:center }
  .name-link { cursor:pointer; color:var(--accent); font-weight:600 }
  .name-link:hover { text-decoration:underline }
  .zoom-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:9999; display:none; align-items:center; justify-content:center; cursor:pointer }
  .zoom-overlay img { max-width:90vw; max-height:90vh; border-radius:12px; box-shadow:0 8px 40px rgba(0,0,0,0.5) }
  .zoom-overlay .close-zoom { position:absolute; top:20px; right:30px; font-size:36px; color:#fff; cursor:pointer; opacity:0.7 }
  .zoom-overlay .close-zoom:hover { opacity:1 }
  </style>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F464;</div><div class="stat-value">${accounts.length}</div><div class="stat-label">Total Accounts</div></div>
    <div class="stat-card"><div class="stat-icon">&#x20B1;</div><div class="stat-value">${accounts.reduce((s,a)=>s+Number(a.actual_balance),0).toFixed(0)}</div><div class="stat-label">Combined Balance</div></div>
  </div>

  <div class="card" style="overflow:visible">
    <div class="card-header"><h3>&#x1F464; All Accounts</h3>
      <div><a href="#add-account" class="btn btn-primary btn-sm">&#x2795; New Account</a></div>
    </div>
    <div class="card-body">
    <table class="dt-accounts-table">
    <thead><tr><th>Name</th><th>Member ID</th><th>Balance</th><th>Status</th><th>Password</th><th>Action</th></tr></thead>
    <tbody>
    ${accounts.map(a => {
      const statusNum = Number(a.is_active);
      const statusLabel = statusNum === 1 ? 'Active' : statusNum === 0 ? 'Inactive' : 'Closed';
      const statusBadge = statusNum === 1 ? 'badge-green' : statusNum === 0 ? 'badge-gray' : 'badge-red';
      return `<tr>
      <td><a href="/admin/member/${a.account_id}" class="name-link">${a.child_name}</a></td>
      <td class="mono">${a.member_id || '-'}</td>
      <td>&#x20B1;${Number(a.actual_balance).toFixed(2)}</td>
      <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      <td><span class="badge ${a.password_changed ? 'badge-green' : 'badge-red'}">${a.password_changed ? 'Changed' : 'Default'}</span></td>
      <td><details class="action-menu">
        <summary>&#x22EE;</summary>
        <div class="action-dropdown">
          <a href="#edit-${a.account_id}">&#x270F; Edit</a>
          ${statusNum === 1 ? `<form method="post" action="/admin/accounts/toggle/${a.account_id}" data-confirm="Deactivate ${a.child_name}?"><button type="submit" class="text-amber">&#x1F4A4; Deactivate</button></form>` : ''}
          ${statusNum === 0 ? `<form method="post" action="/admin/accounts/toggle/${a.account_id}"><button type="submit" class="text-green">&#x2705; Reactivate</button></form>` : ''}
          ${statusNum === 1 ? `<form method="post" action="/admin/accounts/close/${a.account_id}" data-confirm="Close ${a.child_name} permanently? This cannot be undone."><button type="submit" class="text-red">&#x1F6AB; Close Account</button></form>` : ''}
          <hr>
          <form method="post" action="/admin/accounts/delete/${a.account_id}" data-confirm="Delete ${a.child_name}?">
            <button type="submit" class="text-red">&#x1F5D1; Delete</button>
          </form>
        </div>
      </details></td>
    </tr>`}).join('')}
    </table></div>
  </div>

  <div id="add-account" class="modal-overlay">
  <div class="modal" style="max-width:520px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Account</h2>
  <div class="info-box" style="margin-bottom:12px;padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:13px;color:#1B5E20">
    <i class="fas fa-piggy-bank"></i> Regular Savings (sp_regular) will be auto-opened with a generated account number.
  </div>
  <form method="post" action="/admin/accounts/create">
    <input type="hidden" name="child_name" value="auto">
    <div class="info-box" style="margin-bottom:12px;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;font-size:13px">Display name auto-composed as: <b>FIRSTNAME M. LASTNAME</b></div>
    <div class="form-row">
      <div><label for="alast">Last Name <span class="required">*</span></label><input type="text" id="alast" name="last_name" placeholder="Dela Cruz" required style="text-transform:uppercase"></div>
      <div><label for="afirst">First Name <span class="required">*</span></label><input type="text" id="afirst" name="first_name" placeholder="Juan" required style="text-transform:uppercase"></div>
      <div><label for="amid">Middle Name</label><input type="text" id="amid" name="middle_name" placeholder="Optional" style="text-transform:uppercase"></div>
    </div>
    <div class="form-row">
      <div><label for="abday">Birthday <span class="required">*</span></label><input type="date" id="abday" name="birthday" required></div>
      <div><label for="agender">Gender <span class="required">*</span></label><select id="agender" name="gender" required><option value="">--</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
      <div><label for="asched">Savings Schedule <span class="required">*</span></label><select id="asched" name="savings_schedule" required><option value="">--</option><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option><option value="Monthly">Monthly</option><option value="Every Quarter">Every Quarter</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="amembershipFee"><i class="fas fa-id-card"></i> Membership Fee (&#x20B1;)</label>
        <input type="number" id="amembershipFee" name="membership_fee" min="0" value="${membershipFee || '100'}" step="0.01" required oninput="calcTotal()"></div>
      <div><label for="ainsuranceFee"><i class="fas fa-shield"></i> Insurance Fee (&#x20B1;)</label>
        <input type="number" id="ainsuranceFee" name="insurance_fee" min="0" value="${insuranceFee || '50'}" step="0.01" required oninput="calcTotal()"></div>
      <div><label for="ainitialSavings"><i class="fas fa-piggy-bank"></i> Initial Savings (&#x20B1;)</label>
        <input type="number" id="ainitialSavings" name="savings_deposit" min="0" value="${initialSavings || '100'}" step="0.01" required oninput="calcTotal()"></div>
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin:4px 0 8px">
      <i class="fas fa-info-circle"></i> Total Payment: <b id="totalDisplay">&#x20B1;${(parseFloat(membershipFee||100) + parseFloat(insuranceFee||50) + parseFloat(initialSavings||100)).toFixed(2)}</b>
      &nbsp;|&nbsp; Membership fee (income) + Insurance fee (income) + Initial savings (liability)
      <br>Savings account number is auto-generated as SAVC-BRANCH-MMDDYY-SEQ.
    </p>
    <script>
    function calcTotal(){
      var mf = parseFloat(document.getElementById('amembershipFee').value) || 0;
      var ins = parseFloat(document.getElementById('ainsuranceFee').value) || 0;
      var sav = parseFloat(document.getElementById('ainitialSavings').value) || 0;
      document.getElementById('totalDisplay').textContent = '\u20B1' + (mf+ins+sav).toFixed(2);
    }
    </script>
    <button type="submit" class="btn btn-primary">&#x2795; Create Account</button>
  </form>
  </div>
  </div>

  ${accounts.map(a => `
  <div id="edit-${a.account_id}" class="modal-overlay">
  <div class="modal" style="max-width:520px">
  <a href="#" class="close">&times;</a>
  <h2><i class="fas fa-pen"></i> ${a.child_name}</h2>
  <div class="profile-upload-area" onclick="document.getElementById('efi_${a.account_id}').click()">
    <div class="av-wrap">
      ${a.profile_pic_url ? '<img src="' + a.profile_pic_url + '" id="ep_' + a.account_id + '" onclick="event.stopPropagation();zoomPhoto(this.src)" alt="">' : '<div class="empty-avatar">' + (a.child_name || '?')[0].toUpperCase() + '</div>'}
      <div class="upload-overlay"><i class="fas fa-camera"></i></div>
    </div>
    <span style="font-size:13px;color:var(--text-muted)">Click avatar to upload photo</span>
    <form method="post" action="/admin/accounts/upload-photo/${a.account_id}" enctype="multipart/form-data" id="ef_${a.account_id}">
      <input type="file" name="photo" accept="image/*" onchange="this.form.submit()" id="efi_${a.account_id}">
    </form>
  </div>
  <form method="post" action="/admin/accounts/update/${a.account_id}">
    <label for="en_${a.account_id}">Child Name</label>
    <input type="text" id="en_${a.account_id}" name="child_name" value="${a.child_name}" required style="text-transform:uppercase">
    <div class="form-row">
      <div><label for="elast_${a.account_id}">Last Name</label><input type="text" id="elast_${a.account_id}" name="last_name" value="${a.last_name || ''}" style="text-transform:uppercase"></div>
      <div><label for="efirst_${a.account_id}">First Name</label><input type="text" id="efirst_${a.account_id}" name="first_name" value="${a.first_name || ''}" style="text-transform:uppercase"></div>
      <div><label for="emid_${a.account_id}">Middle Name</label><input type="text" id="emid_${a.account_id}" name="middle_name" value="${a.middle_name || ''}" style="text-transform:uppercase"></div>
    </div>
    <div class="form-row">
      <div><label for="ebday_${a.account_id}">Birthday</label><input type="date" id="ebday_${a.account_id}" name="birthday" value="${a.birthday || ''}"></div>
      <div><label for="egender_${a.account_id}">Gender</label><select id="egender_${a.account_id}" name="gender"><option value="">--</option><option value="Male"${a.gender === 'Male' ? ' selected' : ''}>Male</option><option value="Female"${a.gender === 'Female' ? ' selected' : ''}>Female</option></select></div>
      <div><label for="esched_${a.account_id}">Savings Schedule</label><select id="esched_${a.account_id}" name="savings_schedule"><option value="">--</option><option value="Daily"${a.savings_schedule === 'Daily' ? ' selected' : ''}>Daily</option><option value="Weekly"${a.savings_schedule === 'Weekly' ? ' selected' : ''}>Weekly</option><option value="Bi-Weekly"${a.savings_schedule === 'Bi-Weekly' ? ' selected' : ''}>Bi-Weekly</option><option value="Monthly"${a.savings_schedule === 'Monthly' ? ' selected' : ''}>Monthly</option><option value="Every Quarter"${a.savings_schedule === 'Every Quarter' ? ' selected' : ''}>Every Quarter</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="eb_${a.account_id}">Balance (&#x20B1;)</label><input type="number" id="eb_${a.account_id}" name="actual_balance" min="0" step="0.01" value="${a.actual_balance}"></div>
      <div><label for="eu_${a.account_id}">Unallocated (&#x20B1;)</label><input type="number" id="eu_${a.account_id}" name="unallocated_balance" min="0" step="0.01" value="${a.unallocated_balance}"></div>
    </div>
    <div class="form-row">
      <div><label for="estatus_${a.account_id}">Status</label><select id="estatus_${a.account_id}" name="is_active"><option value="1"${Number(a.is_active) === 1 ? ' selected' : ''}>Active</option><option value="0"${Number(a.is_active) === 0 ? ' selected' : ''}>Inactive</option><option value="-1"${Number(a.is_active) === -1 ? ' selected' : ''}>Closed</option></select></div>
      <div><label for="ephone_${a.account_id}">Phone</label><input type="text" id="ephone_${a.account_id}" name="parent_phone" value="${a.parent_phone || ''}"></div>
    </div>
    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
  </form>
  </div>
  </div>`).join('')}
  <div id="zoom-modal" class="zoom-overlay" onclick="closeZoom()">
    <span class="close-zoom">&times;</span>
    <img id="zoom-img" src="" alt="">
  </div>
  <script>
  function zoomPhoto(src) {
    document.getElementById('zoom-img').src = src;
    document.getElementById('zoom-modal').style.display = 'flex';
  }
  function closeZoom() {
    document.getElementById('zoom-modal').style.display = 'none';
  }
  </script>
  `;

  res.type('html').send(layout('Accounts', 'accounts', content, {
    toast,
    subtitle: `${accounts.length} accounts registered`,
  }));
}));

// ── Member 360 — Full Member Detail Page ──

router.get('/member/:accountId', requireRole(1), asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const account = await one('SELECT * FROM accounts WHERE account_id = $1', [accountId]);
  if (!account) return res.type('html').send(layout('Member Not Found', 'accounts', '<div class="card"><div class="card-body-padded"><p style="color:var(--danger)">Account not found.</p><a href="/admin/accounts" class="btn btn-outline">&larr; Back to Accounts</a></div></div>'));

  const transactions = await sql('SELECT t.*, g.title as goal_title FROM transactions t LEFT JOIN goal_jars g ON t.goal_id = g.goal_id WHERE t.account_id = $1 ORDER BY t.created_at DESC LIMIT 500', [accountId]);
  const loans = await sql('SELECT * FROM loans WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
  const tds = await sql("SELECT t.* FROM term_deposits t WHERE t.account_id = $1 ORDER BY t.created_at DESC", [accountId]);
  const goals = await sql('SELECT * FROM goal_jars WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
  const badges = await sql('SELECT * FROM badges WHERE account_id = $1 ORDER BY unlocked_at DESC', [accountId]);

  const statusNum = Number(account.is_active);
  const statusLabel = statusNum === 1 ? 'Active' : statusNum === 0 ? 'Inactive' : 'Closed';
  const statusBadge = statusNum === 1 ? 'badge-green' : statusNum === 0 ? 'badge-gray' : 'badge-red';

  const fmt = (v) => '&#x20B1;' + Number(v).toFixed(2);
  const dateFmt = (d) => d ? String(d).slice(0, 10) : '-';
  const initial = (account.child_name || '?')[0].toUpperCase();

  const txRows = transactions.length === 0
    ? '<tr><td colspan="6" class="no-data">No transactions yet</td></tr>'
    : transactions.map(t => {
        const badgeCls = ({deposit:'badge-green',withdrawal:'badge-red',loan_disbursement:'badge-amber',loan_payment:'badge-blue',interest_credit:'badge-purple',interest:'badge-purple',allocation:'badge-purple',td_placement:'badge-amber',td_maturity:'badge-blue',fee:'badge-red',reward:'badge-green',purchase:'badge-gray'})[t.type] || 'badge-gray';
        const isInflow = ['deposit','loan_disbursement','interest_credit','interest','td_maturity','reward','fee'].includes(t.type);
        const sign = isInflow ? '+' : '-';
        const col = isInflow ? 'var(--accent)' : 'var(--red)';
        return `<tr>
          <td class="mono" style="font-size:11px">${dateFmt(t.created_at)}</td>
          <td><span class="badge ${badgeCls}">${t.type.replace(/_/g,' ')}</span></td>
          <td class="mono" style="text-align:right;color:var(--red);font-weight:600">${isInflow ? '' : fmt(t.amount)}</td>
          <td class="mono" style="text-align:right;color:var(--accent);font-weight:600">${isInflow ? fmt(t.amount) : ''}</td>
          <td class="mono" style="font-size:12px;text-align:right;font-weight:500">${t.balance_after ? fmt(t.balance_after) : '-'}</td>
          <td style="text-align:center"><button class="btn btn-xs btn-outline" onclick="showTxDetail('${t.transaction_id}','${t.type}','${fmt(t.amount)}','${isInflow ? '+' : '-'}','${t.balance_before ? fmt(t.balance_before) : '-'}','${t.balance_after ? fmt(t.balance_after) : '-'}','${dateFmt(t.created_at)}','${String(t.created_at||'').slice(11,19)}','${(t.description||'-').replace(/'/g,"\\'")}','${t.reference_type||'-'}','${t.reference_id||'-'}','${t.goal_title||''}','${t.transaction_id}')">View</button></td>
        </tr>`;
      }).join('');

  const loanRows = loans.length === 0
    ? '<tr><td colspan="7"><div class="m360-empty"><i class="fas fa-sack-dollar"></i>No loans</div></td></tr>'
    : loans.map(l => {
        const ls = ({pending:'badge-amber',approved:'badge-blue',active:'badge-green',paid:'badge-gray',rejected:'badge-red',defaulted:'badge-red'})[l.status] || 'badge-gray';
        return `<tr>
          <td class="mono" style="font-size:11px">${(l.loan_id||'').slice(0,8).toUpperCase()}</td>
          <td>${l.product_id || '-'}</td>
          <td style="text-align:right">${fmt(l.principal)}</td>
          <td style="text-align:right">${fmt(l.remaining_balance || l.principal)}</td>
          <td>${l.interest_rate}% ${l.interest_type||'flat'}</td>
          <td>${l.term_months || '-'}mo</td>
          <td><span class="badge ${ls}">${l.status}</span></td>
        </tr>`;
      }).join('');

  const tdRows = tds.length === 0
    ? '<tr><td colspan="6"><div class="m360-empty"><i class="fas fa-clock"></i>No term deposits</div></td></tr>'
    : tds.map(d => {
        const ds = ({active:'badge-green',matured:'badge-blue',closed:'badge-gray',renewed:'badge-purple'})[d.status] || 'badge-gray';
        return `<tr>
          <td class="mono" style="font-size:11px">${d.td_number || (d.td_id||'').slice(0,8).toUpperCase()}</td>
          <td style="text-align:right">${fmt(d.amount)}</td>
          <td>${d.term_days || '-'}d</td>
          <td>${d.interest_rate || 0}%</td>
          <td>${dateFmt(d.maturity_date)}</td>
          <td><span class="badge ${ds}">${d.status}</span></td>
        </tr>`;
      }).join('');

  const goalHtml = goals.length === 0
    ? '<div class="m360-empty"><i class="fas fa-bullseye"></i>No goals set</div>'
    : goals.map(g => {
        const pct = g.target_amount > 0 ? Math.min((Number(g.current_allocated) / Number(g.target_amount)) * 100, 100) : 0;
        return `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px">
          <div style="flex:1"><b style="font-size:14px">${g.title}</b><br><span style="font-size:11px;color:var(--text-muted)">${fmt(g.current_allocated||0)} of ${fmt(g.target_amount)}</span></div>
          <div style="width:100px"><span class="bar"><span class="bar-track"><span class="bar-fill blue" style="width:${pct}%"></span></span>${pct.toFixed(0)}%</span></div>
        </div>`;
      }).join('');

  const badgeHtml = badges.length === 0
    ? '<div class="m360-empty"><i class="fas fa-medal"></i>No badges earned</div>'
    : badges.map(b => `<span class="badge badge-purple" style="margin:2px;font-size:12px">${b.badge_name || b.badge_type || 'Badge'}</span>`).join('');

  const content = `
  <style>
  .m360-top { display:flex; align-items:center; gap:20px; background:var(--bg-secondary); border-radius:16px; padding:20px 28px; margin-bottom:20px }
  .m360-av { width:72px; height:72px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700; color:#fff; flex-shrink:0; overflow:hidden }
  .m360-av img { width:100%; height:100%; object-fit:cover }
  .m360-info { flex:1; min-width:0 }
  .m360-info h1 { font-size:20px; margin:0; font-weight:700 }
  .m360-info .sub { font-size:13px; color:var(--text-muted); margin:2px 0 }
  .m360-info .bal-row { display:flex; align-items:center; gap:16px; margin-top:6px }
  .m360-info .bal-row .bal { font-size:26px; font-weight:700 }
  .m360-actions { display:flex; gap:6px; flex-shrink:0 }
  .m360-actions a { white-space:nowrap }

  .m360-metrics { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:8px; margin-bottom:20px }
  .m360-metric { background:var(--bg-secondary); border-radius:10px; padding:10px 14px }
  .m360-metric .ml { font-size:10px; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-muted); font-weight:600 }
  .m360-metric .mv { font-size:14px; font-weight:600; margin-top:1px }

  .m360-panel { margin-bottom:16px }
  .m360-panel .card { overflow:visible }
  .m360-panel .card-header { display:flex; align-items:center; gap:10px; padding:12px 16px }
  .m360-panel .card-header h3 { margin:0; font-size:14px; font-weight:600 }
  .m360-panel .card-header .count { margin-left:auto; font-size:11px; color:var(--text-muted) }

  .m360-table { width:100%; border-collapse:collapse }
  .m360-table th { text-align:left; padding:9px 12px; font-size:10px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted); font-weight:600; border-bottom:1px solid var(--border); background:var(--bg-primary) }
  .m360-table td { padding:9px 12px; font-size:13px; border-bottom:1px solid var(--border); transition:background 0.15s }
  .m360-table tbody tr:hover td { background:var(--bg-secondary) }

  .m360-panel .dataTables_wrapper .dataTables_filter input { margin-left:6px; padding:5px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px; background:transparent; color:var(--text); outline:none }
  .m360-panel .dataTables_wrapper .dataTables_filter input:focus { border-color:var(--accent) }
  .m360-panel .dataTables_wrapper .dataTables_length select { margin:0 4px; padding:3px 6px; border:1px solid var(--border); border-radius:4px; background:transparent; color:var(--text); font-size:12px; outline:none }
  .m360-panel .dataTables_wrapper .dataTables_paginate .paginate_button { padding:4px 10px; margin:0 2px; border:1px solid var(--border); border-radius:6px; font-size:12px; background:transparent; color:var(--text); cursor:pointer; display:inline-block }
  .m360-panel .dataTables_wrapper .dataTables_paginate .paginate_button:hover { background:var(--bg-secondary); border-color:var(--accent); color:var(--accent) }
  .m360-panel .dataTables_wrapper .dataTables_paginate .paginate_button.current { background:var(--accent); color:#fff; border-color:var(--accent) }
  .m360-panel .dataTables_wrapper .dataTables_paginate .paginate_button.disabled { opacity:0.4; cursor:default }
  .m360-panel table.dataTable td { padding:9px 12px }

  .m360-empty { text-align:center; padding:32px 16px; color:var(--text-muted); font-size:13px }
  .m360-empty i { font-size:32px; margin-bottom:8px; opacity:0.4; display:block }

  .m360-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px }

  .goal-item { display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg-secondary); border-radius:10px; margin-bottom:6px; transition:background 0.15s }
  .goal-item:hover { background:var(--bg-primary) }
  .goal-item .gi-info { flex:1; min-width:0 }
  .goal-item .gi-info b { font-size:14px; display:block }
  .goal-item .gi-info span { font-size:11px; color:var(--text-muted) }
  .goal-item .gi-bar { width:120px }

  .badge-pill { display:inline-flex; align-items:center; gap:4px; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:500; background:#f3e8ff; color:#7c3aed; margin:3px }
  .badge-pill i { font-size:11px }

  .tx-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:9999; align-items:center; justify-content:center; backdrop-filter:blur(2px) }
  .tx-modal.show { display:flex }
  .tx-modal .modal { max-width:420px; width:90%; border-radius:16px; padding:24px }
  .tx-details { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:16px }
  .tx-details .td-item { padding:8px 12px; background:var(--bg-secondary); border-radius:8px }
  .tx-details .td-item .tdl { font-size:10px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted); font-weight:600 }
  .tx-details .td-item .tdv { font-size:14px; font-weight:600; margin-top:2px }

  @media (max-width:768px){
    .m360-top { flex-direction:column; text-align:center; padding:16px }
    .m360-info .bal-row { justify-content:center; flex-wrap:wrap }
    .m360-actions { width:100%; justify-content:center }
    .m360-row { grid-template-columns:1fr }
    .m360-metrics { grid-template-columns:repeat(auto-fill,minmax(100px,1fr)) }
  }
  </style>

  <!-- Header -->
  <div class="m360-top">
    <div class="m360-av">
      ${account.profile_pic_url ? '<img src="' + account.profile_pic_url + '" alt="">' : initial}
    </div>
    <div class="m360-info">
      <h1>${account.child_name}</h1>
      <div class="sub">${account.member_id || 'No ID'} &middot; ${account.gender || '--'} &middot; ${account.age || '--'} yo &middot; Member since ${dateFmt(account.created_at)}</div>
      <div class="bal-row">
        <span class="bal">${fmt(account.actual_balance)}</span>
        <span class="badge ${statusBadge}" style="font-size:12px">${statusLabel}</span>
      </div>
    </div>
    <div class="m360-actions">
      <a href="/admin/accounts" class="btn btn-outline btn-xs"><i class="fas fa-arrow-left"></i></a>
      <a href="#edit-${account.account_id}" class="btn btn-primary btn-xs"><i class="fas fa-pen"></i> Edit</a>
      <a href="/admin/teller?account=${account.account_id}" class="btn btn-secondary btn-xs"><i class="fas fa-cash-register"></i> Teller</a>
    </div>
  </div>

  <!-- Metrics -->
  <div class="m360-metrics">
    <div class="m360-metric"><div class="ml">Savings #</div><div class="mv mono" style="font-size:12px">${account.regular_savings_number || '-'}</div></div>
    <div class="m360-metric"><div class="ml">Balance</div><div class="mv">${fmt(account.actual_balance)}</div></div>
    <div class="m360-metric"><div class="ml">Unallocated</div><div class="mv">${fmt(account.unallocated_balance)}</div></div>
    <div class="m360-metric"><div class="ml">Maintaining</div><div class="mv" style="color:var(--accent-color)">${fmt(account.maintaining_balance || 0)}</div></div>
    <div class="m360-metric"><div class="ml">Schedule</div><div class="mv">${account.savings_schedule || '-'}</div></div>
    <div class="m360-metric"><div class="ml">Phone</div><div class="mv">${account.parent_phone || '-'}</div></div>
    <div class="m360-metric"><div class="ml">Birthday</div><div class="mv">${account.birthday || '-'}</div></div>
    <div class="m360-metric"><div class="ml">XP</div><div class="mv">${account.current_xp || 0}</div></div>
  </div>

  <!-- Transactions -->
  <div class="m360-panel">
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-arrows-spin" style="color:var(--accent)"></i> Transactions</h3><span class="count">${transactions.length} entries</span></div>
      <div class="card-body">
      <table class="m360-table" id="txTable">
        <thead><tr><th>Date</th><th>Type</th><th style="text-align:right;color:var(--red)">Debit</th><th style="text-align:right;color:var(--accent)">Credit</th><th style="text-align:right">Balance</th><th style="width:50px"></th></tr></thead>
        <tbody>${txRows}</tbody>
      </table>
      </div>
    </div>
  </div>

  <!-- Loans + TD -->
  <div class="m360-row">
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-sack-dollar" style="color:#d97706"></i> Loans</h3><span class="count">${loans.length}</span></div>
      <div class="card-body" style="padding:0;overflow-x:auto">
      <table class="m360-table">
        <thead><tr><th>Loan #</th><th>Product</th><th style="text-align:right">Principal</th><th style="text-align:right">Balance</th><th>Rate</th><th>Term</th><th>Status</th></tr></thead>
        <tbody>${loanRows}</tbody>
      </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-clock" style="color:#2563eb"></i> Term Deposits</h3><span class="count">${tds.length}</span></div>
      <div class="card-body" style="padding:0;overflow-x:auto">
      <table class="m360-table">
        <thead><tr><th>TD #</th><th style="text-align:right">Amount</th><th>Term</th><th>Rate</th><th>Maturity</th><th>Status</th></tr></thead>
        <tbody>${tdRows}</tbody>
      </table>
      </div>
    </div>
  </div>

  <!-- Goals + Badges -->
  <div class="m360-row">
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-bullseye" style="color:#059669"></i> Goals</h3><span class="count">${goals.length}</span></div>
      <div class="card-body-padded">${goalHtml}</div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-medal" style="color:#7c3aed"></i> Badges</h3><span class="count">${badges.length}</span></div>
      <div class="card-body-padded">${badgeHtml}</div>
    </div>
  </div>

  <!-- TX Detail Modal -->
  <div class="tx-modal" id="txModal" onclick="if(event.target===this)closeTxModal()">
    <div class="modal">
      <a href="#" class="close" onclick="closeTxModal();return false">&times;</a>
      <h3 style="margin:0"><i class="fas fa-receipt"></i> Transaction Details</h3>
      <div class="tx-details">
        <div class="td-item" style="grid-column:1/-1"><div class="tdl">Type</div><div class="tdv" id="txd_type"></div></div>
        <div class="td-item"><div class="tdl">Amount</div><div class="tdv" id="txd_amount"></div></div>
        <div class="td-item"><div class="tdl">Balance After</div><div class="tdv" id="txd_bal_after"></div></div>
        <div class="td-item"><div class="tdl">Date</div><div class="tdv" id="txd_date"></div></div>
        <div class="td-item"><div class="tdl">Time</div><div class="tdv" id="txd_time"></div></div>
        <div class="td-item" style="grid-column:1/-1"><div class="tdl">Description</div><div class="tdv" id="txd_desc"></div></div>
        <div class="td-item"><div class="tdl">Reference</div><div class="tdv mono" style="font-size:12px" id="txd_ref"></div></div>
        <div class="td-item"><div class="tdl">Goal</div><div class="tdv" id="txd_goal"></div></div>
      </div>
      <div style="text-align:right;margin-top:16px">
        <button class="btn btn-outline" onclick="closeTxModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div id="edit-${account.account_id}" class="modal-overlay">
  <div class="modal" style="max-width:520px">
  <a href="#" class="close">&times;</a>
  <h2><i class="fas fa-pen"></i> ${account.child_name}</h2>
  <form method="post" action="/admin/accounts/update/${account.account_id}">
    <label for="en_${account.account_id}">Child Name</label>
    <input type="text" id="en_${account.account_id}" name="child_name" value="${account.child_name}" required style="text-transform:uppercase">
    <div class="form-row">
      <div><label for="elast_${account.account_id}">Last Name</label><input type="text" id="elast_${account.account_id}" name="last_name" value="${account.last_name || ''}" style="text-transform:uppercase"></div>
      <div><label for="efirst_${account.account_id}">First Name</label><input type="text" id="efirst_${account.account_id}" name="first_name" value="${account.first_name || ''}" style="text-transform:uppercase"></div>
      <div><label for="emid_${account.account_id}">Middle Name</label><input type="text" id="emid_${account.account_id}" name="middle_name" value="${account.middle_name || ''}" style="text-transform:uppercase"></div>
    </div>
    <div class="form-row">
      <div><label for="ebday_${account.account_id}">Birthday</label><input type="date" id="ebday_${account.account_id}" name="birthday" value="${account.birthday || ''}"></div>
      <div><label for="egender_${account.account_id}">Gender</label><select id="egender_${account.account_id}" name="gender"><option value="">--</option><option value="Male"${account.gender === 'Male' ? ' selected' : ''}>Male</option><option value="Female"${account.gender === 'Female' ? ' selected' : ''}>Female</option></select></div>
      <div><label for="esched_${account.account_id}">Savings Schedule</label><select id="esched_${account.account_id}" name="savings_schedule"><option value="">--</option><option value="Daily"${account.savings_schedule === 'Daily' ? ' selected' : ''}>Daily</option><option value="Weekly"${account.savings_schedule === 'Weekly' ? ' selected' : ''}>Weekly</option><option value="Bi-Weekly"${account.savings_schedule === 'Bi-Weekly' ? ' selected' : ''}>Bi-Weekly</option><option value="Monthly"${account.savings_schedule === 'Monthly' ? ' selected' : ''}>Monthly</option><option value="Every Quarter"${account.savings_schedule === 'Every Quarter' ? ' selected' : ''}>Every Quarter</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="eb_${account.account_id}">Balance (&#x20B1;)</label><input type="number" id="eb_${account.account_id}" name="actual_balance" min="0" step="0.01" value="${account.actual_balance}"></div>
      <div><label for="eu_${account.account_id}">Unallocated (&#x20B1;)</label><input type="number" id="eu_${account.account_id}" name="unallocated_balance" min="0" step="0.01" value="${account.unallocated_balance}"></div>
    </div>
    <div class="form-row">
      <div><label for="estatus_${account.account_id}">Status</label><select id="estatus_${account.account_id}" name="is_active"><option value="1"${Number(account.is_active) === 1 ? ' selected' : ''}>Active</option><option value="0"${Number(account.is_active) === 0 ? ' selected' : ''}>Inactive</option><option value="-1"${Number(account.is_active) === -1 ? ' selected' : ''}>Closed</option></select></div>
      <div><label for="ephone_${account.account_id}">Phone</label><input type="text" id="ephone_${account.account_id}" name="parent_phone" value="${account.parent_phone || ''}"></div>
    </div>
    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
  </form>
  </div>
  </div>

  <script>
  function showTxDetail(id,type,amount,sign,balBefore,balAfter,date,time,desc,refType,refId,goal,txid) {
    var typeLabel = type.replace(/_/g,' ');
    var colors = {deposit:'badge-green',withdrawal:'badge-red',loan_disbursement:'badge-amber',loan_payment:'badge-blue',interest_credit:'badge-purple',interest:'badge-purple',allocation:'badge-blue',td_placement:'badge-amber',td_maturity:'badge-blue',fee:'badge-amber',reward:'badge-green',purchase:'badge-gray'};
    document.getElementById('txd_type').innerHTML = '<span class="badge ' + (colors[type]||'badge-gray') + '">' + typeLabel + '</span>';
    document.getElementById('txd_amount').innerHTML = '<span style="color:' + (sign === '+' ? 'var(--accent)' : 'var(--red)') + ';font-size:20px;font-weight:700">' + sign + amount + '</span>';
    document.getElementById('txd_bal_after').innerHTML = balAfter + (balBefore !== '-' ? ' <span style="font-size:11px;color:var(--text-muted);font-weight:400">from ' + balBefore + '</span>' : '');
    document.getElementById('txd_date').textContent = date;
    document.getElementById('txd_time').textContent = time;
    document.getElementById('txd_desc').textContent = desc;
    document.getElementById('txd_ref').innerHTML = (refType !== '-' ? '<span style="font-size:11px;color:var(--text-muted)">' + refType + ':</span> ' : '') + refId;
    document.getElementById('txd_goal').textContent = goal || '-';
    document.getElementById('txModal').classList.add('show');
  }
  function closeTxModal() {
    document.getElementById('txModal').classList.remove('show');
  }
  </script>
  `;

  res.type('html').send(layout(`Member: ${account.child_name}`, 'accounts', content, {
    subtitle: `Member 360 &middot; ${account.member_id || 'No ID'}`,
  }));
}));

router.post('/accounts/create', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { child_name, current_xp, parent_phone, last_name, first_name, middle_name, birthday, gender, savings_schedule, membership_fee, insurance_fee, savings_deposit } = req.body;
    if (!child_name) return res.redirect('/admin/accounts?error=Name+required');
    if (!last_name || !first_name || !birthday || !gender || !savings_schedule) {
      return res.redirect('/admin/accounts?error=All+required+fields+must+be+filled');
    }

    const ulast = (last_name || '').trim().toUpperCase();
    const ufirst = (first_name || '').trim().toUpperCase();
    const umid = (middle_name || '').trim().toUpperCase();
    const displayName = umid ? `${ufirst} ${umid[0]}. ${ulast}` : `${ufirst} ${ulast}`;

    const membershipAmt = Number(membership_fee) || 0;
    const insuranceAmt = Number(insurance_fee) || 0;
    const savingsAmt = Number(savings_deposit) || 0;
    const totalPayment = membershipAmt + insuranceAmt + savingsAmt;

    const maxResult = await store.query("SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts");
    const maxMember = parseInt(maxResult.rows[0]?.m || '0', 10);

    const defaultMaintaining = await store.getSetting('default_maintaining_balance');
    const maintainingBalance = parseFloat(defaultMaintaining) || savingsAmt;

    const account = await store.createAccount({
      child_name: displayName,
      last_name: ulast,
      first_name: ufirst,
      middle_name: umid,
      birthday: birthday || '',
      gender: gender || '',
      savings_schedule: savings_schedule || '',
      actual_balance: savingsAmt,
      unallocated_balance: savingsAmt,
      current_xp: Number(current_xp) || 0,
      parent_phone: parent_phone || '',
      password: bcrypt.hashSync('0000', 10),
      savings_product_id: 'sp_regular',
      maintaining_balance: maintainingBalance,
    });

    const branchCode = account.branch_id || '01';
    const savingsNumber = await store.generateSavingsAccountNumber(branchCode);

    await store.query('UPDATE accounts SET member_id=$1, regular_savings_number=$2, savings_product_id=$3, maintaining_balance=$4 WHERE account_id=$5',
      [String(maxMember + 1).padStart(6, '0'), savingsNumber, 'sp_regular', maintainingBalance, account.account_id]);
    try { const audit = require('../services/audit'); await audit.log(req, 'ACCOUNT_CREATE', 'account', account.account_id, { child_name: child_name.trim(), membership_fee: membershipAmt, insurance_fee: insuranceAmt, savings_deposit: savingsAmt, total_payment: totalPayment, regular_savings_number: savingsNumber }); } catch (e) {}

    // Membership fee transaction + GL
    if (membershipAmt > 0) {
      const mfTx = await store.addTransaction({
        account_id: account.account_id,
        type: 'fee',
        amount: membershipAmt,
        description: 'Membership fee',
        reference_type: 'account_create',
        reference_id: account.account_id,
        balance_before: 0,
        balance_after: savingsAmt,
      });
      try {
        const gl = require('../services/gl');
        await gl.postDoubleEntry(mfTx.transaction_id, [
          { account_code: '1000', debit: membershipAmt, description: 'Membership fee: ' + displayName },
          { account_code: '4100', credit: membershipAmt, description: 'Membership fee: ' + displayName },
        ], { postedBy: req.session.adminName || 'admin', referenceType: 'fee', referenceNumber: mfTx.transaction_id });
      } catch (e) { console.error('Membership fee GL posting error', e); }
    }

    // Insurance fee transaction + GL
    if (insuranceAmt > 0) {
      const insTx = await store.addTransaction({
        account_id: account.account_id,
        type: 'fee',
        amount: insuranceAmt,
        description: 'Insurance fee',
        reference_type: 'account_create',
        reference_id: account.account_id,
        balance_before: savingsAmt,
        balance_after: savingsAmt,
      });
      try {
        const gl = require('../services/gl');
        await gl.postDoubleEntry(insTx.transaction_id, [
          { account_code: '1000', debit: insuranceAmt, description: 'Insurance fee: ' + displayName },
          { account_code: '4200', credit: insuranceAmt, description: 'Insurance fee: ' + displayName },
        ], { postedBy: req.session.adminName || 'admin', referenceType: 'fee', referenceNumber: insTx.transaction_id });
      } catch (e) { console.error('Insurance fee GL posting error', e); }
    }

    // Initial savings deposit transaction + GL
    if (savingsAmt > 0) {
      const depTx = await store.addTransaction({
        account_id: account.account_id,
        type: 'deposit',
        amount: savingsAmt,
        description: 'Initial savings deposit',
        reference_type: 'account_create',
        reference_id: account.account_id,
        balance_before: 0,
        balance_after: savingsAmt,
      });
      try {
        const gl = require('../services/gl');
        await gl.postDoubleEntry(depTx.transaction_id, [
          { account_code: '1000', debit: savingsAmt, description: 'Initial savings deposit: ' + displayName },
          { account_code: '2000', credit: savingsAmt, description: 'Initial savings deposit: ' + displayName },
        ], { postedBy: req.session.adminName || 'admin', referenceType: 'tx', referenceNumber: depTx.transaction_id });
      } catch (e) { console.error('Savings deposit GL posting error', e); }
    }

    res.redirect('/admin/accounts?added=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { child_name, actual_balance, unallocated_balance, current_xp, parent_phone, last_name, first_name, middle_name, birthday, gender, savings_schedule, is_active } = req.body;
    const ulast = (last_name || '').trim().toUpperCase();
    const ufirst = (first_name || '').trim().toUpperCase();
    const umid = (middle_name || '').trim().toUpperCase();
    const displayName = umid ? `${ufirst} ${umid[0]}. ${ulast}` : `${ufirst} ${ulast}`;
    await store.updateAccount(req.params.id, {
      child_name: child_name?.trim() ? child_name.trim().toUpperCase() : displayName,
      actual_balance: Number(actual_balance),
      unallocated_balance: Number(unallocated_balance),
      current_xp: Number(current_xp) || 0,
      parent_phone: parent_phone || '',
      last_name: ulast,
      first_name: ufirst,
      middle_name: umid,
      birthday: birthday || '',
      gender: gender || '',
      savings_schedule: savings_schedule || '',
      is_active: is_active !== undefined ? Number(is_active) : 1,
    });
    res.redirect('/admin/accounts?updated=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/toggle/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    await store.updateAccount(req.params.id, { is_active: Number(account.is_active) === 1 ? 0 : 1 });
    res.redirect('/admin/accounts?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/close/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    await store.updateAccount(req.params.id, { is_active: -1 });
    res.redirect('/admin/accounts?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/deposit/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/accounts?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    const newBalance = Number(account.actual_balance) + val;
    await store.query('UPDATE accounts SET actual_balance=$1, unallocated_balance=unallocated_balance+$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3', [newBalance, val, req.params.id]);
    const result = await store.addTransaction({
      account_id: req.params.id,
      type: 'deposit',
      amount: val,
      description: description || 'Admin deposit',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const txId = result?.transaction_id || '';
    try {
      const gl = require('../services/gl');
      await gl.postDoubleEntry(txId, [
        { account_code: '1000', debit: val, description: 'Admin deposit: ' + account.child_name },
        { account_code: '2000', credit: val, description: 'Admin deposit: ' + account.child_name },
      ], { postedBy: req.session.adminName || 'admin', referenceType: 'tx', referenceNumber: txId });
      const audit = require('../services/audit');
      await audit.log(req, 'ADMIN_DEPOSIT', 'account', req.params.id, { amount: val, txId, desc: description || 'Admin deposit' });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    res.redirect('/admin/accounts?deposited=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/withdraw/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/accounts?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    if (Number(account.actual_balance) < val) return res.redirect('/admin/accounts?error=Insufficient+balance');
    const newBalance = Math.round((Number(account.actual_balance) - val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) - val) * 100) / 100;
    await store.query('UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3', [newBalance, Math.max(0, newUnallocated), req.params.id]);
    const result = await store.addTransaction({
      account_id: req.params.id,
      type: 'withdrawal',
      amount: val,
      description: description || 'Admin withdrawal',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const txId = result?.transaction_id || '';
    try {
      const gl = require('../services/gl');
      await gl.postDoubleEntry(txId, [
        { account_code: '2000', debit: val, description: 'Admin withdrawal: ' + account.child_name },
        { account_code: '1000', credit: val, description: 'Admin withdrawal: ' + account.child_name },
      ], { postedBy: req.session.adminName || 'admin', referenceType: 'tx', referenceNumber: txId });
      const audit = require('../services/audit');
      await audit.log(req, 'ADMIN_WITHDRAWAL', 'account', req.params.id, { amount: val, txId, desc: description || 'Admin withdrawal' });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    res.redirect('/admin/accounts?withdrawn=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/delete/:id', requireRole(4), asyncHandler(async (req, res) => {
  try {

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    await store.query('DELETE FROM accounts WHERE account_id = $1', [req.params.id]);
    res.redirect('/admin/accounts?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

const profilesDir = require('path').join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
const profileUpload = require('multer')({
  dest: profilesDir,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/accounts/upload-photo/:id', requireRole(2), profileUpload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    if (!req.file) return res.redirect(`/admin/accounts?error=No+file`);
    const ext = require('path').extname(req.file.originalname).toLowerCase();
    if (!'.png.jpg.jpeg.gif.webp'.includes(ext)) {
      require('fs').unlinkSync(req.file.path);
      return res.redirect(`/admin/accounts?error=Invalid+file+type`);
    }
    const { v4: uuidv4 } = require('uuid');
    const filename = `${Date.now()}-${uuidv4().slice(0,8)}${ext}`;
    const dest = require('path').join(__dirname, '..', 'uploads', 'profiles', filename);
    require('fs').renameSync(req.file.path, dest);
    const imageUrl = '/uploads/profiles/' + filename;
    if (account.profile_pic_url && account.profile_pic_url.startsWith('/uploads/')) {
      const oldFile = require('path').join(__dirname, '..', account.profile_pic_url);
      if (require('fs').existsSync(oldFile)) require('fs').unlinkSync(oldFile);
    }
    await store.updateAccount(req.params.id, { profile_pic_url: imageUrl });
    res.redirect(`/admin/accounts?updated=ok#edit-${req.params.id}`);
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Goals Management ──

router.get('/goals', requireRole(1), asyncHandler(async (req, res) => {

  const goals = await sql('SELECT g.*, a.child_name FROM goal_jars g LEFT JOIN accounts a ON g.account_id = a.account_id ORDER BY g.created_at ASC');
  const accounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name ASC');
  const q = req.query;
  const toast = q.added ? 'success:Goal created.'
    : q.updated ? 'success:Goal updated.'
    : q.deleted ? 'success:Goal deleted.'
    : q.toggled ? 'success:Goal status toggled.'
    : q.error ? `error:${q.error}`
    : '';

  const filterAccount = q.account || '';
  const filterStatus = q.status || '';
  const filtered = goals.filter(g => {
    if (filterAccount && g.account_id !== filterAccount) return false;
    if (filterStatus === 'done' && !g.is_completed) return false;
    if (filterStatus === 'active' && g.is_completed) return false;
    return true;
  });

  const completedCount = filtered.filter(g => g.is_completed).length;
  const totalAllocated = filtered.reduce((s, g) => s + Number(g.current_allocated), 0);
  const totalTarget = filtered.reduce((s, g) => s + Number(g.target_amount), 0);

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F3AF;</div><div class="stat-value" data-count="${filtered.length}">0</div><div class="stat-label">Goals Shown</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2705;</div><div class="stat-value" data-count="${completedCount}">0</div><div class="stat-label">Completed</div><div class="stat-bar"><div class="stat-bar-fill" style="width:${filtered.length > 0 ? (completedCount/filtered.length*100).toFixed(0) : 0}%;background:var(--accent)"></div></div></div>
    <div class="stat-card"><div class="stat-icon">&#x20B1;</div><div class="stat-value">${Number(totalAllocated).toFixed(0)}</div><div class="stat-label">Allocated</div><div class="stat-sub">of &#x20B1;${Number(totalTarget).toFixed(0)} target</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F3AF; Goal Jars</h3>
      <div><a href="#add-goal" class="btn btn-primary btn-sm">&#x2795; New Goal</a></div>
    </div>
    <div class="card-body">
    <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:#fafcfa">
      <form method="get" action="/admin/goals" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
          <option value="">All Accounts</option>
          ${accounts.map(a => `<option value="${a.account_id}"${a.account_id===filterAccount?' selected':''}>${a.child_name}</option>`).join('')}
        </select>
        <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
          <option value="">All Status</option>
          <option value="active"${filterStatus==='active'?' selected':''}>Active</option>
          <option value="done"${filterStatus==='done'?' selected':''}>Completed</option>
        </select>
        ${filterAccount || filterStatus ? `<a href="/admin/goals" class="btn btn-outline btn-xs">&#x2716; Clear</a>` : ''}
      </form>
    </div>
    <table><tr><th>Child</th><th>Title</th><th>Target</th><th>Allocated</th><th>Progress</th><th>Icon</th><th>Status</th><th>Actions</th></tr>
    ${filtered.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No goals found.</td></tr>' : filtered.map(g => {
      const pct = g.target_amount > 0 ? Math.min((g.current_allocated / g.target_amount) * 100, 100) : 0;
      return `<tr>
      <td><b>${g.child_name || '-'}</b></td>
      <td>${g.title}</td>
      <td class="num">&#x20B1;${Number(g.target_amount).toFixed(2)}</td>
      <td class="num">&#x20B1;${Number(g.current_allocated).toFixed(2)}</td>
      <td><span class="bar"><span class="bar-track"><span class="bar-fill ${g.is_completed ? 'green' : 'blue'}" style="width:${pct}%"></span></span>${pct.toFixed(0)}%</span></td>
      <td style="font-size:18px;text-align:center">${g.category_icon}</td>
      <td><span class="badge ${g.is_completed ? 'badge-green' : 'badge-blue'}">${g.is_completed ? 'Done' : 'Active'}</span></td>
      <td><div style="display:flex;gap:4px">
        <a href="#edit-${g.goal_id}" class="btn btn-secondary btn-xs">&#x270F;</a>
        <form class="inline" method="post" action="/admin/goals/toggle/${g.goal_id}">
          <button type="submit" class="btn btn-${g.is_completed ? 'amber' : 'green'} btn-xs">${g.is_completed ? '&#x21A9;' : '&#x2705;'}</button>
        </form>
        <form class="inline" method="post" action="/admin/goals/delete/${g.goal_id}" data-confirm="Delete goal ${g.title}?">
          <button type="submit" class="btn btn-danger btn-xs">&#x1F5D1;</button>
        </form>
      </div></td>
    </tr>`;}).join('')}
    </table></div>
  </div>

  <div id="add-goal" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Goal</h2>
  <form method="post" action="/admin/goals/create">
    <label for="gaccount">Account</label>
    <select id="gaccount" name="account_id" required>
      <option value="">Select account...</option>
      ${accounts.map(a => `<option value="${a.account_id}">${a.child_name}</option>`).join('')}
    </select>
    <div class="form-row">
      <div><label for="gtitle">Title</label><input type="text" id="gtitle" name="title" placeholder="e.g. New Bike" required></div>
      <div><label for="gtarget">Target (&#x20B1;)</label><input type="number" id="gtarget" name="target_amount" min="1" value="100" required></div>
    </div>
    <div class="form-row">
      <div><label for="galloc">Allocated (&#x20B1;)</label><input type="number" id="galloc" name="current_allocated" min="0" value="0"></div>
      <div><label for="gicon">Icon</label><input type="text" id="gicon" name="category_icon" placeholder="e.g. 🚲" value="&#x1F3AF;" maxlength="4"></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x2795; Create Goal</button>
  </form>
  </div>
  </div>

  ${filtered.map(g => `
  <div id="edit-${g.goal_id}" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${g.title}</h2>
  <form method="post" action="/admin/goals/update/${g.goal_id}">
    <label for="etitle_${g.goal_id}">Title</label>
    <input type="text" id="etitle_${g.goal_id}" name="title" value="${g.title}" required>
    <div class="form-row">
      <div><label for="etarget_${g.goal_id}">Target (&#x20B1;)</label><input type="number" id="etarget_${g.goal_id}" name="target_amount" min="1" value="${g.target_amount}"></div>
      <div><label for="ealloc_${g.goal_id}">Allocated (&#x20B1;)</label><input type="number" id="ealloc_${g.goal_id}" name="current_allocated" min="0" value="${g.current_allocated}"></div>
    </div>
    <label for="eicon_${g.goal_id}">Icon</label>
    <input type="text" id="eicon_${g.goal_id}" name="category_icon" value="${g.category_icon}" maxlength="4">
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}
  `;

  res.type('html').send(layout('Goals', 'goals', content, {
    toast, subtitle: `${filtered.length} goals shown`,
    counts: { goals: goals.length },
  }));
}));

router.post('/goals/create', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { account_id, title, target_amount, current_allocated, category_icon } = req.body;
    if (!account_id || !title) return res.redirect('/admin/goals?error=Account+and+title+required');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [account_id]);
    if (!account) return res.redirect('/admin/goals?error=Account+not+found');
    await store.createGoal({
      account_id,
      title: title.trim(),
      target_amount: Number(target_amount) || 0,
      current_allocated: Number(current_allocated) || 0,
      category_icon: category_icon || '🎯',
    });
    res.redirect('/admin/goals?added=ok');
  } catch (err) {
    res.redirect(`/admin/goals?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/goals/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/goals?error=Goal+not+found');
    const { title, target_amount, current_allocated, category_icon } = req.body;
    await store.updateGoal(req.params.id, {
      title: title?.trim(),
      target_amount: Number(target_amount),
      current_allocated: Number(current_allocated),
      category_icon: category_icon || existing.category_icon,
    });
    res.redirect('/admin/goals?updated=ok');
  } catch (err) {
    res.redirect(`/admin/goals?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/goals/toggle/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const goal = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [req.params.id]);
    if (!goal) return res.redirect('/admin/goals?error=Goal+not+found');
    const newStatus = goal.is_completed ? 0 : 1;
    await store.query('UPDATE goal_jars SET is_completed=$1, updated_at=datetime(\'now\') WHERE goal_id=$2', [newStatus, req.params.id]);
    res.redirect('/admin/goals?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/goals?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/goals/delete/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/goals?error=Goal+not+found');
    await store.deleteGoal(req.params.id);
    res.redirect('/admin/goals?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/goals?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Badges Management ──

router.get('/badges', requireRole(1), asyncHandler(async (req, res) => {

  const badges = await sql('SELECT b.*, a.child_name FROM badges b LEFT JOIN accounts a ON b.account_id = a.account_id ORDER BY b.created_at ASC');
  const accounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name ASC');
  const q = req.query;
  const toast = q.added ? 'success:Badge created.'
    : q.updated ? 'success:Badge updated.'
    : q.deleted ? 'success:Badge deleted.'
    : q.toggled ? 'success:Badge status toggled.'
    : q.error ? `error:${q.error}`
    : '';

  const filterAccount = q.account || '';
  const filterStatus = q.status || '';
  const filtered = badges.filter(b => {
    if (filterAccount && b.account_id !== filterAccount) return false;
    if (filterStatus === 'unlocked' && !b.is_unlocked) return false;
    if (filterStatus === 'locked' && b.is_unlocked) return false;
    return true;
  });

  const unlockedCount = filtered.filter(b => b.is_unlocked).length;

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F3C6;</div><div class="stat-value" data-count="${filtered.length}">0</div><div class="stat-label">Badges Shown</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F513;</div><div class="stat-value" data-count="${unlockedCount}">0</div><div class="stat-label">Unlocked</div><div class="stat-bar"><div class="stat-bar-fill" style="width:${filtered.length > 0 ? (unlockedCount/filtered.length*100).toFixed(0) : 0}%;background:var(--accent)"></div></div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F512;</div><div class="stat-value" data-count="${filtered.length - unlockedCount}">0</div><div class="stat-label">Locked</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F3C6; Badges</h3>
      <div><a href="#add-badge" class="btn btn-primary btn-sm">&#x2795; New Badge</a></div>
    </div>
    <div class="card-body">
    <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:#fafcfa">
      <form method="get" action="/admin/badges" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
          <option value="">All Accounts</option>
          ${accounts.map(a => `<option value="${a.account_id}"${a.account_id===filterAccount?' selected':''}>${a.child_name}</option>`).join('')}
        </select>
        <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
          <option value="">All Status</option>
          <option value="unlocked"${filterStatus==='unlocked'?' selected':''}>Unlocked</option>
          <option value="locked"${filterStatus==='locked'?' selected':''}>Locked</option>
        </select>
        ${filterAccount || filterStatus ? `<a href="/admin/badges" class="btn btn-outline btn-xs">&#x2716; Clear</a>` : ''}
      </form>
    </div>
    <table><tr><th>Child</th><th>Name</th><th>Description</th><th>Required XP</th><th>Status</th><th>Unlocked At</th><th>Actions</th></tr>
    ${filtered.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No badges found.</td></tr>' : filtered.map(b => `<tr>
      <td><b>${b.child_name || '-'}</b></td>
      <td>${b.name}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.description || '-'}</td>
      <td class="num">${b.required_xp} <span class="badge badge-purple">XP</span></td>
      <td><span class="badge ${b.is_unlocked ? 'badge-green' : 'badge-red'}">${b.is_unlocked ? 'Unlocked' : 'Locked'}</span></td>
      <td class="mono">${b.unlocked_at ? b.unlocked_at.slice(0, 19).replace('T', ' ') : '-'}</td>
      <td><div style="display:flex;gap:4px">
        <a href="#edit-${b.badge_id}" class="btn btn-secondary btn-xs">&#x270F;</a>
        <form class="inline" method="post" action="/admin/badges/toggle/${b.badge_id}">
          <button type="submit" class="btn btn-${b.is_unlocked ? 'amber' : 'green'} btn-xs">${b.is_unlocked ? '&#x1F512;' : '&#x1F513;'}</button>
        </form>
        <form class="inline" method="post" action="/admin/badges/delete/${b.badge_id}" data-confirm="Delete badge ${b.name}?">
          <button type="submit" class="btn btn-danger btn-xs">&#x1F5D1;</button>
        </form>
      </div></td>
    </tr>`).join('')}
    </table></div>
  </div>

  <div id="add-badge" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Badge</h2>
  <form method="post" action="/admin/badges/create">
    <label for="baccount">Account</label>
    <select id="baccount" name="account_id" required>
      <option value="">Select account...</option>
      ${accounts.map(a => `<option value="${a.account_id}">${a.child_name}</option>`).join('')}
    </select>
    <div class="form-row">
      <div><label for="bname">Name</label><input type="text" id="bname" name="name" placeholder="e.g. Super Saver" required></div>
      <div><label for="bxp">Required XP</label><input type="number" id="bxp" name="required_xp" min="0" value="100"></div>
    </div>
    <label for="bdesc">Description</label>
    <input type="text" id="bdesc" name="description" placeholder="e.g. Saved over ₱500">
    <label for="bunlock">Status</label>
    <select id="bunlock" name="is_unlocked">
      <option value="0">Locked</option>
      <option value="1">Unlocked</option>
    </select>
    <button type="submit" class="btn btn-primary">&#x2795; Create Badge</button>
  </form>
  </div>
  </div>

  ${filtered.map(b => `
  <div id="edit-${b.badge_id}" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${b.name}</h2>
  <form method="post" action="/admin/badges/update/${b.badge_id}">
    <label for="enb_${b.badge_id}">Name</label>
    <input type="text" id="enb_${b.badge_id}" name="name" value="${b.name}" required>
    <div class="form-row">
      <div><label for="exp_${b.badge_id}">Required XP</label><input type="number" id="exp_${b.badge_id}" name="required_xp" min="0" value="${b.required_xp}"></div>
      <div><label for="eunlock_${b.badge_id}">Status</label><select id="eunlock_${b.badge_id}" name="is_unlocked"><option value="0"${!b.is_unlocked?' selected':''}>Locked</option><option value="1"${b.is_unlocked?' selected':''}>Unlocked</option></select></div>
    </div>
    <label for="edesc_${b.badge_id}">Description</label>
    <input type="text" id="edesc_${b.badge_id}" name="description" value="${b.description || ''}">
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}
  `;

  res.type('html').send(layout('Badges', 'badges', content, {
    toast, subtitle: `${filtered.length} badges shown`,
    counts: { badges: badges.length },
  }));
}));

router.post('/badges/create', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const { account_id, name, description, required_xp, is_unlocked } = req.body;
    if (!account_id || !name) return res.redirect('/admin/badges?error=Account+and+name+required');
    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [account_id]);
    if (!account) return res.redirect('/admin/badges?error=Account+not+found');
    await store.createBadge({
      account_id,
      name: name.trim(),
      description: description || '',
      required_xp: Number(required_xp) || 0,
      is_unlocked: is_unlocked === '1',
    });
    res.redirect('/admin/badges?added=ok');
  } catch (err) {
    res.redirect(`/admin/badges?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/badges/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM badges WHERE badge_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/badges?error=Badge+not+found');
    const { name, description, required_xp, is_unlocked } = req.body;
    await store.updateBadge(req.params.id, {
      name: name?.trim(),
      description: description || '',
      required_xp: Number(required_xp),
      is_unlocked: is_unlocked !== undefined ? (is_unlocked === '1' ? 1 : 0) : undefined,
    });
    res.redirect('/admin/badges?updated=ok');
  } catch (err) {
    res.redirect(`/admin/badges?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/badges/toggle/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM badges WHERE badge_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/badges?error=Badge+not+found');
    const newStatus = existing.is_unlocked ? 0 : 1;
    await store.updateBadge(req.params.id, { is_unlocked: newStatus });
    res.redirect('/admin/badges?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/badges?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/badges/delete/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM badges WHERE badge_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/badges?error=Badge+not+found');
    await store.deleteBadge(req.params.id);
    res.redirect('/admin/badges?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/badges?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Loans Management ──

router.get('/loans', requireRole(1), asyncHandler(async (req, res) => {

  const accounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name ASC');
  const loans = await sql(`
    SELECT l.*, a.child_name, a.member_id
    FROM loans l
    LEFT JOIN accounts a ON l.account_id = a.account_id
    ORDER BY l.created_at DESC
  `);
  const q = req.query;

  const filterAccount = q.account || '';
  const filterStatus = q.status || '';
  const filtered = loans.filter(l => {
    if (filterAccount && l.account_id !== filterAccount) return false;
    if (filterStatus && l.status !== filterStatus) return false;
    return true;
  });

  const pendingCount = loans.filter(l => l.status === 'pending').length;
  const activeCount = loans.filter(l => l.status === 'active').length;

  const loanProducts = await store.getLoanProducts();

  const toast = q.approved ? 'success:Loan approved.'
    : q.disbursed ? 'success:Loan disbursed (account credited).'
    : q.rejected ? 'success:Loan rejected.'
    : q.error ? `error:${q.error}`
    : '';

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4B0;</div><div class="stat-value">${loans.length}</div><div class="stat-label">Total Loans</div></div>
    <div class="stat-card"><div class="stat-icon">&#x23F3;</div><div class="stat-value">${pendingCount}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value">${activeCount}</div><div class="stat-label">Active</div></div>
    <div class="stat-card"><div class="stat-icon">&#x20B1;</div><div class="stat-value">${loans.reduce((s, l) => s + Number(l.remaining_balance), 0).toFixed(0)}</div><div class="stat-label">Outstanding</div></div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3>&#x1F4B0; Loan Applications</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <form method="get" action="/admin/loans" style="display:flex;gap:6px;align-items:center">
          <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
            <option value="">All Accounts</option>
            ${accounts.map(a => `<option value="${a.account_id}"${a.account_id === filterAccount ? ' selected' : ''}>${a.child_name}</option>`).join('')}
          </select>
          <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
            <option value="">All Status</option>
            <option value="pending"${filterStatus === 'pending' ? ' selected' : ''}>Pending</option>
            <option value="approved"${filterStatus === 'approved' ? ' selected' : ''}>Approved</option>
            <option value="active"${filterStatus === 'active' ? ' selected' : ''}>Active</option>
            <option value="paid"${filterStatus === 'paid' ? ' selected' : ''}>Paid</option>
            <option value="rejected"${filterStatus === 'rejected' ? ' selected' : ''}>Rejected</option>
            <option value="defaulted"${filterStatus === 'defaulted' ? ' selected' : ''}>Defaulted</option>
          </select>
        </form>
      </div>
    </div>
    <div class="card-body">
    ${filtered.length === 0 ? '<div style="padding:32px;text-align:center;color:var(--text-muted)">No loan applications found.</div>' : `
    <table><tr>
      <th>Child</th><th>Amount</th><th>Interest</th><th>Term</th><th>Monthly</th><th>Paid</th><th>Balance</th><th>Status</th><th>Applied</th><th>Actions</th>
    </tr>
    ${filtered.map(l => {
      const statusColors = { pending: 'badge-amber', approved: 'badge-blue', active: 'badge-green', paid: 'badge-gray', rejected: 'badge-red', defaulted: 'badge-red' };
      const statusLabels = { pending: 'Pending', approved: 'Approved', active: 'Active', paid: 'Paid', rejected: 'Rejected', defaulted: 'Defaulted' };
      return `<tr>
        <td><b>${l.child_name || 'Unknown'}</b><br><span class="mono" style="font-size:11px;color:var(--text-muted)">${l.member_id || ''}</span></td>
        <td class="num">&#x20B1;${Number(l.principal).toFixed(2)}</td>
        <td class="num">${(Number(l.interest_rate) * 100).toFixed(1)}% ${l.interest_type === 'flat' ? 'F' : 'D'}</td>
        <td class="num">${l.term_months}mo</td>
        <td class="num">&#x20B1;${Number(l.monthly_amortization).toFixed(2)}</td>
        <td class="num">&#x20B1;${Number(l.amount_paid).toFixed(2)}</td>
        <td class="num">&#x20B1;${Number(l.remaining_balance).toFixed(2)}</td>
        <td><span class="badge ${statusColors[l.status] || 'badge-gray'}">${statusLabels[l.status] || l.status}</span></td>
        <td class="mono">${(l.created_at || '').slice(0, 10)}</td>
        <td><div class="actions-cell">
          ${l.status === 'pending' ? `
            <form method="post" action="/admin/loans/approve/${l.loan_id}" style="display:inline">
              <button type="submit" class="btn btn-primary btn-xs">&#x2705; Approve</button>
            </form>
            <form method="post" action="/admin/loans/reject/${l.loan_id}" style="display:inline" data-confirm="Reject this loan?">
              <button type="submit" class="btn btn-danger btn-xs">&#x274C; Reject</button>
            </form>
          ` : l.status === 'approved' ? `
            <form method="post" action="/admin/loans/disburse/${l.loan_id}" style="display:inline" data-confirm="Disburse &#x20B1;${Number(l.principal).toFixed(2)} to ${l.child_name}?">
              <button type="submit" class="btn btn-amber btn-xs">&#x1F4B5; Disburse</button>
            </form>
          ` : '<span style="font-size:11px;color:var(--text-muted)">—</span>'}
        </div></td>
      </tr>`;
    }).join('')}
    </table>`}
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4CB; Loan Products</h3></div>
    <div class="card-body">
    ${loanProducts.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text-muted)">No loan products configured.</div>' : `
      <table><tr><th>Name</th><th>Rate</th><th>Type</th><th>Min</th><th>Max</th><th>Min Term</th><th>Max Term</th><th>Status</th></tr>
      ${loanProducts.map(p => `<tr>
        <td><b>${p.name}</b></td>
        <td>${(Number(p.interest_rate) * 100).toFixed(1)}%</td>
        <td><span class="badge badge-blue">${p.interest_type === 'flat' ? 'Flat' : 'Diminishing'}</span></td>
        <td class="num">&#x20B1;${Number(p.min_amount).toFixed(0)}</td>
        <td class="num">&#x20B1;${Number(p.max_amount).toFixed(0)}</td>
        <td class="num">${p.min_term}mo</td>
        <td class="num">${p.max_term}mo</td>
        <td><span class="badge ${p.is_active ? 'badge-green' : 'badge-gray'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
      </tr>`).join('')}
      </table>`}
    </div>
  </div>
  `;

  res.type('html').send(layout('Loans', 'loans', content, {
    toast,
    subtitle: `${filtered.length} loans shown`,
    counts: { loans: pendingCount },
  }));
}));

router.post('/loans/approve/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const loan = await store.getLoan(req.params.id);
    if (!loan) return res.redirect('/admin/loans?error=Loan+not+found');
    if (loan.status !== 'pending') return res.redirect('/admin/loans?error=Loan+is+not+pending');
    await store.updateLoan(req.params.id, { status: 'approved', approved_by: 'admin', approved_at: new Date().toISOString() });
    try { const audit = require('../services/audit'); await audit.log(req, 'LOAN_APPROVE', 'loan', req.params.id, { amount: loan.principal, member: loan.account_id }); } catch (e) {}
    res.redirect('/admin/loans?approved=ok');
  } catch (err) {
    res.redirect(`/admin/loans?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/loans/reject/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const loan = await store.getLoan(req.params.id);
    if (!loan) return res.redirect('/admin/loans?error=Loan+not+found');
    if (loan.status !== 'pending') return res.redirect('/admin/loans?error=Loan+is+not+pending');
    await store.updateLoan(req.params.id, { status: 'rejected' });
    try { const audit = require('../services/audit'); await audit.log(req, 'LOAN_REJECT', 'loan', req.params.id, { amount: loan.principal, member: loan.account_id }); } catch (e) {}
    res.redirect('/admin/loans?rejected=ok');
  } catch (err) {
    res.redirect(`/admin/loans?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/loans/disburse/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {

    const loan = await store.getLoan(req.params.id);
    if (!loan) return res.redirect('/admin/loans?error=Loan+not+found');
    if (loan.status !== 'approved') return res.redirect('/admin/loans?error=Loan+must+be+approved+first');

    const account = await store.getAccount(loan.account_id);
    if (!account) return res.redirect('/admin/loans?error=Account+not+found');

    const newBalance = Math.round((Number(account.actual_balance) + Number(loan.principal)) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) + Number(loan.principal)) * 100) / 100;

    await store.query('UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=datetime(\'now\') WHERE account_id=$3', [newBalance, newUnallocated, loan.account_id]);
    await store.addTransaction({
      account_id: loan.account_id,
      type: 'loan_disbursement',
      amount: Number(loan.principal),
      description: `Loan disbursement: ${loan.purpose || 'Loan'}`,
      reference_type: 'loan',
      reference_id: loan.loan_id,
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + Number(loan.term_months));
    await store.updateLoan(req.params.id, { status: 'active', disbursed_at: new Date().toISOString(), due_date: dueDate.toISOString().slice(0, 10) });
    try {
      const gl = require('../services/gl');
      await gl.postDoubleEntry(loan.loan_id, [
        { account_code: '1100', debit: Number(loan.principal), description: 'Loan disbursement: ' + (loan.purpose || 'Loan') },
        { account_code: '1000', credit: Number(loan.principal), description: 'Loan disbursement to member' },
      ], { postedBy: req.session.adminName || 'admin', referenceType: 'loan', referenceNumber: loan.loan_id });
      const audit = require('../services/audit');
      await audit.log(req, 'LOAN_DISBURSE', 'loan', req.params.id, { principal: loan.principal, account: loan.account_id });
    } catch (e) { console.error('GL post failed (non-fatal):', e.message); }
    res.redirect('/admin/loans?disbursed=ok');
  } catch (err) {
    res.redirect(`/admin/loans?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Transactions Viewer ──

router.get('/transactions', requireRole(1), asyncHandler(async (req, res) => {

  const accounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name ASC');
  const q = req.query;

  const filterAccount = q.account || '';
  const filterType = q.type || '';
  const filterSearch = q.search || '';
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = 50;
  const offset = (page - 1) * perPage;

  let where = [];
  let params = [];

  if (filterAccount) {
    where.push('t.account_id = ?');
    params.push(filterAccount);
  }
  if (filterType) {
    where.push('t.type = ?');
    params.push(filterType);
  }
  if (filterSearch) {
    where.push('(t.description LIKE ? OR t.transaction_id LIKE ?)');
    params.push(`%${filterSearch}%`, `%${filterSearch}%`);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const total = await one(`SELECT COUNT(*) as c FROM transactions t ${whereClause}`, [...params]).c;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const transactions = await sql(`
    SELECT t.*, a.child_name FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.account_id
    ${whereClause}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `, ...params, perPage, offset);

  const typedCounts = await sql('SELECT type, COUNT(*) as c FROM transactions GROUP BY type');
  const typeSummary = typedCounts.map(t => `${t.type}: ${t.c}`).join(' &middot; ');

  const toast = q.error ? `error:${q.error}` : '';

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value" data-count="${total}">0</div><div class="stat-label">Total Transactions</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F504;</div><div class="stat-value">${page}<span style="font-size:14px;color:var(--text-muted)">/${totalPages}</span></div><div class="stat-label">Current Page</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4C4;</div><div class="stat-value">${perPage}</div><div class="stat-label">Per Page</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4B3; Transactions</h3><span class="count">${total} total</span></div>
    <div class="card-body">
    <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:#fafcfa;align-items:center">
      <form method="get" action="/admin/transactions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:1">
        <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
          <option value="">All Accounts</option>
          ${accounts.map(a => `<option value="${a.account_id}"${a.account_id===filterAccount?' selected':''}>${a.child_name}</option>`).join('')}
        </select>
        <select name="type" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
          <option value="">All Types</option>
          ${['deposit','allocation','withdrawal','purchase','reward','transfer'].map(t => `<option value="${t}"${t===filterType?' selected':''}>${t}</option>`).join('')}
        </select>
        <input type="text" name="search" placeholder="Search description..." value="${filterSearch}" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;min-width:160px;flex:1">
        <button type="submit" class="btn btn-secondary btn-xs">&#x1F50D; Filter</button>
        ${filterAccount || filterType || filterSearch ? `<a href="/admin/transactions" class="btn btn-outline btn-xs">&#x2716; Clear</a>` : ''}
      </form>
    </div>
    ${transactions.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text-muted)">No transactions found.</div>' : `
    <table><tr><th>Child</th><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr>
    ${transactions.map(t => `<tr>
      <td><b>${t.child_name || '-'}</b></td>
      <td><span class="badge ${t.type === 'deposit' ? 'badge-green' : t.type === 'allocation' ? 'badge-purple' : t.type === 'withdrawal' ? 'badge-red' : t.type === 'purchase' ? 'badge-amber' : t.type === 'reward' ? 'badge-blue' : 'badge-gray'}">${t.type}</span></td>
      <td class="num">&#x20B1;${Number(t.amount).toFixed(2)}</td>
      <td>${t.description || '-'}</td>
      <td class="mono">${(t.created_at || '').slice(0, 19).replace('T', ' ')}</td>
    </tr>`).join('')}
    </table>
    ${totalPages > 1 ? `
    <div style="padding:12px 14px;display:flex;justify-content:center;gap:6px;border-top:1px solid var(--border)">
      ${page > 1 ? `<a href="/admin/transactions?page=${page-1}${filterAccount?'&account='+filterAccount:''}${filterType?'&type='+filterType:''}${filterSearch?'&search='+encodeURIComponent(filterSearch):''}" class="btn btn-outline btn-xs">&#x25C0; Prev</a>` : ''}
      ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
        let p;
        if (totalPages <= 7) { p = i + 1; }
        else if (page <= 4) { p = i + 1; }
        else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
        else { p = page - 3 + i; }
        const url = `/admin/transactions?page=${p}${filterAccount?'&account='+filterAccount:''}${filterType?'&type='+filterType:''}${filterSearch?'&search='+encodeURIComponent(filterSearch):''}`;
        return `<a href="${url}" class="btn ${p === page ? 'btn-primary' : 'btn-outline'} btn-xs">${p}</a>`;
      }).join('')}
      ${page < totalPages ? `<a href="/admin/transactions?page=${page+1}${filterAccount?'&account='+filterAccount:''}${filterType?'&type='+filterType:''}${filterSearch?'&search='+encodeURIComponent(filterSearch):''}" class="btn btn-outline btn-xs">Next &#x25B6;</a>` : ''}
    </div>` : ''}
    `}
    <div style="padding:8px 14px;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border)">
      ${typeSummary || 'No transaction data'}
    </div>
    </div>
  </div>
  `;

  res.type('html').send(layout('Transactions', 'transactions', content, {
    toast: toast || undefined,
    subtitle: `Page ${page} of ${totalPages} — ${total} total`,
    counts: { transactions: total },
  }));
}));

// ── Settings ──

router.get('/settings', requireRole(1), asyncHandler(async (req, res) => {

  let dbSize = 0;
  if (!isPostgres) {
    const dbPath = path.join(__dirname, '..', 'labcoop.db');
    dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  }

  let tables;
  if (isPostgres) {
    tables = await sql("SELECT table_name as name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
  } else {
    tables = await sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  }
  const tableInfo = [];
  for (const t of tables) {
    const cnt = await one(`SELECT COUNT(*) as c FROM "${t.name}"`);
    tableInfo.push({ name: t.name, rows: cnt.c });
  }

  const envVars = [
    { key: 'PORT', val: process.env.PORT || '3000' },
    { key: 'NODE_ENV', val: process.env.NODE_ENV || 'development' },
    { key: 'JWT_SECRET', val: process.env.JWT_SECRET ? '*****' : '(not set)' },
    { key: 'MAIL_HOST', val: process.env.MAIL_HOST || '(not set)' },
    { key: 'DB_TYPE', val: isPostgres ? 'PostgreSQL (Aiven)' : 'SQLite (better-sqlite3)' },
  ];

  const totalRows = tableInfo.reduce((s, t) => s + t.rows, 0);
  const dbLabel = isPostgres ? 'PostgreSQL' : 'SQLite';
  const dbIcon = isPostgres ? 'server' : 'database';

  const content = `
  <style>
  .settings-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px }
  .settings-grid .stat-card { cursor:default }
  .settings-grid .stat-card .stat-icon { width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:10px }
  .settings-grid .stat-card:nth-child(1) .stat-icon { background:#e0f2fe;color:#0369a1 }
  .settings-grid .stat-card:nth-child(2) .stat-icon { background:#dcfce7;color:#15803d }
  .settings-grid .stat-card:nth-child(3) .stat-icon { background:#fef3c7;color:#b45309 }
  .settings-grid .stat-card:nth-child(4) .stat-icon { background:#f3e8ff;color:#7c3aed }

  .table-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px }
  .table-chip { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg); border-radius:var(--radius-sm); border:1px solid var(--border); transition:all var(--transition) }
  .table-chip:hover { border-color:var(--accent); background:#f0fdf4; transform:translateY(-1px); box-shadow:0 2px 8px rgba(46,125,50,0.08) }
  .table-chip .name { font-size:13px; font-weight:500; color:var(--text) }
  .table-chip .count { font-size:12px; font-weight:600; color:var(--accent); background:#e8f5e9; padding:2px 10px; border-radius:20px; white-space:nowrap }
  .table-chip .count.zero { color:var(--text-muted); background:#f1f5f9 }

  .env-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px }
  .env-item { padding:14px 16px; background:var(--bg); border-radius:var(--radius-sm); border:1px solid var(--border); transition:all var(--transition) }
  .env-item:hover { border-color:var(--accent); box-shadow:0 2px 8px rgba(46,125,50,0.06) }
  .env-item .key { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:4px }
  .env-item .val { font-size:14px; font-weight:500; font-family:var(--mono); color:var(--text); word-break:break-all }
  .env-item .val.masked { color:var(--text-muted); font-style:italic }

  .action-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px }
  .action-card { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:24px 16px; background:var(--bg); border-radius:var(--radius-sm); border:1px solid var(--border); text-decoration:none; color:var(--text); transition:all var(--transition); cursor:pointer }
  .action-card:hover { border-color:var(--accent); background:#f0fdf4; transform:translateY(-2px); box-shadow:0 4px 16px rgba(46,125,50,0.1) }
  .action-card .icon { font-size:28px }
  .action-card .label { font-size:13px; font-weight:500 }
  .action-card .desc { font-size:11px; color:var(--text-muted); text-align:center; line-height:1.4 }
  .action-card.danger:hover { border-color:var(--red); background:#fef2f2 }
  .action-card.danger .icon { color:var(--red) }

  .db-tip { display:flex; align-items:center; gap:12px; padding:14px 18px; background:#fffbeb; border:1px solid #fde68a; border-radius:var(--radius-sm); color:#92400e; font-size:13px }
  .db-tip code { background:#fef3c7; padding:2px 8px; border-radius:4px; font-size:12px }

  [data-theme="dark"] .table-chip:hover { background:#1a2e1a }
  [data-theme="dark"] .env-item:hover { background:#1a1a2e }
  [data-theme="dark"] .action-card:hover { background:#1a2e1a }
  [data-theme="dark"] .db-tip { background:#1e1b0e; border-color:#5c4a1a; color:#fbbf24 }
  [data-theme="dark"] .db-tip code { background:#2a2410 }
  [data-theme="dark"] .table-chip .count { background:#1a3a1a }
  [data-theme="dark"] .table-chip .count.zero { background:#1e1e1e }
  [data-theme="dark"] .action-card.danger:hover { background:#2e1a1a }
  </style>

  <div class="settings-grid">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-table"></i></div><div class="stat-value">${tableInfo.length}</div><div class="stat-label">Tables</div><div class="stat-sub">database entities</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-database"></i></div><div class="stat-value">${totalRows.toLocaleString()}</div><div class="stat-label">Total Rows</div><div class="stat-sub">across all tables</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fab fa-node-js"></i></div><div class="stat-value">${process.version}</div><div class="stat-label">Node.js</div><div class="stat-sub">runtime version</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-${dbIcon}"></i></div><div class="stat-value">${dbLabel}</div><div class="stat-label">Database</div><div class="stat-sub">${isPostgres ? 'Aiven Cloud' : 'local file'}</div></div>
  </div>

  ${!isPostgres ? `
  <div class="db-tip" style="margin-top:14px">
    <i class="fas fa-info-circle" style="font-size:18px"></i>
    <span><b>SQLite</b> &mdash; Database file <code>${(dbSize / 1024).toFixed(1)} KB</code> at <code>backend/labcoop.db</code></span>
  </div>` : ''}

  <div class="card" style="margin-top:20px">
    <div class="card-header">
      <h3><i class="fas fa-table"></i> Database Tables</h3>
      <span class="count">${tableInfo.length} tables &middot; ${totalRows.toLocaleString()} rows</span>
    </div>
    <div class="card-body-padded">
      <div class="table-grid" id="tableGrid">
        ${tableInfo.map((t, idx) => `
        <div class="table-chip" style="animation:fadeUp 0.3s ease ${idx * 0.03}s both">
          <span class="name">${t.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
          <span class="count ${t.rows === 0 ? 'zero' : ''}">${t.rows.toLocaleString()}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3><i class="fas fa-cog"></i> Environment</h3>
      <span class="count">${envVars.length} variables</span>
    </div>
    <div class="card-body-padded">
      <div class="env-grid">
        ${envVars.map(e => `
        <div class="env-item">
          <div class="key">${e.key}</div>
          <div class="val ${e.val.includes('*****') || e.val === '(not set)' ? 'masked' : ''}">${e.val}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3><i class="fas fa-tools"></i> Actions</h3>
      <span class="count">utility tools</span>
    </div>
    <div class="card-body-padded">
      <div class="action-grid">
        <a href="/admin/backup" class="action-card">
          <div class="icon"><i class="fas fa-download"></i></div>
          <div class="label">Backup Manager</div>
          <div class="desc">Download full data backup with integrity checksum</div>
        </a>
        <a href="/api/excel/export/all" class="action-card">
          <div class="icon"><i class="fas fa-file-excel"></i></div>
          <div class="label">Export All Data</div>
          <div class="desc">Export all records to Excel spreadsheet</div>
        </a>
        <a href="/api/excel/template" class="action-card">
          <div class="icon"><i class="fas fa-file-import"></i></div>
          <div class="label">Download Template</div>
          <div class="desc">Get Excel template for bulk imports</div>
        </a>
        <a href="/api/health" target="_blank" class="action-card">
          <div class="icon"><i class="fas fa-heartbeat"></i></div>
          <div class="label">Health Check</div>
          <div class="desc">View system health status endpoint</div>
        </a>
        <a href="/admin/reset-data/confirm" class="action-card danger" onclick="return confirmAction('Reset all data? This cannot be undone.')">
          <div class="icon"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="label">Reset All Data</div>
          <div class="desc">Permanently delete all member data</div>
        </a>
      </div>
    </div>
  </div>

  <script>
  // Search/filter table chips
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search tables...';
  searchInput.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;margin-bottom:12px;background:var(--bg);color:var(--text);outline:none;transition:border var(--transition)';
  searchInput.addEventListener('focus', function(){ this.style.borderColor = 'var(--accent)'; });
  searchInput.addEventListener('blur', function(){ this.style.borderColor = 'var(--border)'; });
  searchInput.addEventListener('input', function(){
    var q = this.value.toLowerCase();
    document.querySelectorAll('.table-chip').forEach(function(chip){
      chip.style.display = chip.querySelector('.name').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  document.getElementById('tableGrid').parentNode.insertBefore(searchInput, document.getElementById('tableGrid'));
  </script>
  `;

  res.type('html').send(layout('Settings', 'settings', content, {
    subtitle: 'System information and configuration',
  }));
}));

// ── Savings Settings (Interest Rate + Maintaining Balance + GCash) ──

router.get('/savings-settings', requireRole(1), asyncHandler(async (req, res) => {
  const gcashNumber = await store.getSetting('gcash_number');
  const gcashName = await store.getSetting('gcash_name');
  const savingsProduct = await one("SELECT * FROM savings_products WHERE product_id = 'sp_regular'");
  const savingsRate = savingsProduct ? (parseFloat(savingsProduct.interest_rate) * 100).toFixed(1) : '2.0';
  const savingsFrequency = savingsProduct?.interest_frequency || 'monthly';
  const defaultMaintaining = await store.getSetting('default_maintaining_balance');
  const membershipFee = await store.getSetting('membership_fee');
  const insuranceFee = await store.getSetting('insurance_fee');
  const initialSavings = await store.getSetting('initial_savings');

  const content = `
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-piggy-bank"></i> Savings Interest Rate</h3></div>
    <div class="card-body-padded">
      <form id="savingsRateForm" style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end">
        <div class="field"><label><i class="fas fa-percent"></i> Interest Rate (%)</label>
          <input type="number" id="savingsRate" value="${savingsRate}" min="0" max="100" step="0.1" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px">
        </div>
        <div class="field"><label><i class="fas fa-calendar"></i> Frequency</label>
          <select id="savingsFrequency" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px">
            <option value="daily" ${savingsFrequency === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="monthly" ${savingsFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="yearly" ${savingsFrequency === 'yearly' ? 'selected' : ''}>Yearly</option>
          </select>
        </div>
        <button type="submit" class="btn btn-secondary"><i class="fas fa-floppy-disk"></i> Save Rate</button>
      </form>
      <p style="margin-top:10px;font-size:12px;color:var(--text-muted)">
        <i class="fas fa-info-circle"></i> Applies to all children without a specific savings product assigned.
        Interest is calculated as: balance &times; rate. Current scheduler runs hourly.
        <a href="/admin/savings-products" style="margin-left:6px"><i class="fas fa-external-link-alt"></i> Manage products</a>
      </p>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h3><i class="fas fa-shield-alt"></i> Maintaining Balance</h3></div>
    <div class="card-body-padded">
      <form id="maintainingBalanceForm" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end">
        <div class="field"><label><i class="fas fa-coins"></i> Default Maintaining Balance (&#x20B1;)</label>
          <input type="number" id="defaultMaintaining" value="${parseFloat(defaultMaintaining || '100').toFixed(2)}" min="0" step="0.01" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px">
        </div>
        <button type="submit" class="btn btn-secondary"><i class="fas fa-floppy-disk"></i> Save</button>
      </form>
      <p style="margin-top:10px;font-size:12px;color:var(--text-muted)">
        <i class="fas fa-info-circle"></i> This is the minimum balance every new account must maintain. Withdrawals that would drop the balance below this amount are blocked.
      </p>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h3><i class="fas fa-file-invoice"></i> Account Opening Fees</h3></div>
    <div class="card-body-padded">
      <form id="openingFeesForm" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end">
        <div class="field"><label><i class="fas fa-id-card"></i> Membership Fee (&#x20B1;)</label>
          <input type="number" id="membershipFee" value="${parseFloat(membershipFee || '100').toFixed(2)}" min="0" step="0.01" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px">
        </div>
        <div class="field"><label><i class="fas fa-shield"></i> Insurance Fee (&#x20B1;)</label>
          <input type="number" id="insuranceFee" value="${parseFloat(insuranceFee || '50').toFixed(2)}" min="0" step="0.01" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px">
        </div>
        <div class="field"><label><i class="fas fa-piggy-bank"></i> Initial Savings (&#x20B1;)</label>
          <input type="number" id="initialSavings" value="${parseFloat(initialSavings || '100').toFixed(2)}" min="0" step="0.01" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px">
        </div>
        <button type="submit" class="btn btn-secondary"><i class="fas fa-floppy-disk"></i> Save</button>
      </form>
      <p style="margin-top:10px;font-size:12px;color:var(--text-muted)">
        <i class="fas fa-info-circle"></i> These amounts are the default fees charged when opening a new account. Total payment = Membership Fee + Insurance Fee + Initial Savings.
      </p>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h3><i class="fas fa-mobile-alt"></i> GCash Settings</h3></div>
    <div class="card-body">
      <form id="gcashForm" style="display:flex;flex-direction:column;gap:12px">
        <div><label style="font-weight:600;display:block;margin-bottom:4px">GCash Number</label>
        <input type="text" id="gcashNumber" value="${gcashNumber || '09171234567'}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"></div>
        <div><label style="font-weight:600;display:block;margin-bottom:4px">GCash Account Name</label>
        <input type="text" id="gcashName" value="${gcashName || 'LabCoop Savings'}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"></div>
        <div><button type="submit" class="btn btn-primary">Save GCash Settings</button></div>
      </form>
    </div>
  </div>

  <script>
  function showGcashToast(msg, isError){
    var t = document.createElement('div');
    t.className = 'toast ' + (isError ? 'error' : 'success');
    t.textContent = (isError ? '\u274C ' : '\u2705 ') + msg;
    t.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 24px rgba(0,0,0,0.08);animation:slideIn 0.3s ease;max-width:420px;' + (isError ? 'background:#fce4ec;color:#b71c1c;border:1px solid #ef9a9a' : 'background:#e8f5e9;color:#1B5E20;border:1px solid #a5d6a7');
    document.body.appendChild(t);
    setTimeout(function(){t.style.opacity='0';t.style.transition='opacity 0.5s';setTimeout(function(){t.remove()},500)},4000);
  }
  document.getElementById('gcashForm').addEventListener('submit', function(e){
    e.preventDefault();
    var num = document.getElementById('gcashNumber').value.trim();
    var name = document.getElementById('gcashName').value.trim();
    if(!num || !name){ showGcashToast('Both fields required', true); return; }
    fetch('/admin/settings/gcash', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ gcash_number: num, gcash_name: name })
    }).then(function(r){ return r.json(); }).then(function(d){
      showGcashToast(d.success ? 'GCash settings saved!' : d.message||'Error', !d.success);
    }).catch(function(e){ showGcashToast(e.message, true); });
  });
  document.getElementById('maintainingBalanceForm').addEventListener('submit', function(e){
    e.preventDefault();
    var val = parseFloat(document.getElementById('defaultMaintaining').value);
    if(isNaN(val) || val < 0){ showGcashToast('Enter a valid amount', true); return; }
    fetch('/admin/settings/maintaining-balance', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ amount: val })
    }).then(function(r){ return r.json(); }).then(function(d){
      showGcashToast(d.success ? 'Maintaining balance saved!' : d.message||'Error', !d.success);
    }).catch(function(e){ showGcashToast(e.message, true); });
  });
  document.getElementById('savingsRateForm').addEventListener('submit', function(e){
    e.preventDefault();
    var rate = parseFloat(document.getElementById('savingsRate').value);
    var freq = document.getElementById('savingsFrequency').value;
    if(isNaN(rate) || rate < 0){ showGcashToast('Enter a valid interest rate', true); return; }
    fetch('/admin/settings/savings-rate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ rate: rate / 100, frequency: freq })
    }).then(function(r){ return r.json(); }).then(function(d){
      showGcashToast(d.success ? 'Savings rate updated!' : d.message||'Error', !d.success);
    }).catch(function(e){ showGcashToast(e.message, true); });
  });
  document.getElementById('openingFeesForm').addEventListener('submit', function(e){
    e.preventDefault();
    var mf = parseFloat(document.getElementById('membershipFee').value);
    var ins = parseFloat(document.getElementById('insuranceFee').value);
    var sav = parseFloat(document.getElementById('initialSavings').value);
    if(isNaN(mf) || mf < 0 || isNaN(ins) || ins < 0 || isNaN(sav) || sav < 0){ showGcashToast('Enter valid amounts', true); return; }
    fetch('/admin/settings/opening-fees', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ membership_fee: mf, insurance_fee: ins, initial_savings: sav })
    }).then(function(r){ return r.json(); }).then(function(d){
      showGcashToast(d.success ? 'Opening fees saved!' : d.message||'Error', !d.success);
    }).catch(function(e){ showGcashToast(e.message, true); });
  });
  </script>
  `;

  res.type('html').send(layout('Savings Settings', 'savings-settings', content, {
    subtitle: 'Interest rate, maintaining balance, and GCash configuration',
  }));
}));

router.post('/settings/gcash', requireRole(3), asyncHandler(async (req, res) => {
  if (!req.body.gcash_number || !req.body.gcash_name) {
    return res.status(400).json({ success: false, message: 'Both gcash_number and gcash_name are required' });
  }
  await store.setSetting('gcash_number', req.body.gcash_number.trim());
  await store.setSetting('gcash_name', req.body.gcash_name.trim());
  res.json({ success: true });
}));

router.post('/settings/maintaining-balance', requireRole(3), asyncHandler(async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount < 0) {
    return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
  }
  await store.setSetting('default_maintaining_balance', String(amount));
  res.json({ success: true, amount });
}));

router.post('/settings/savings-rate', requireRole(3), asyncHandler(async (req, res) => {
  const rate = parseFloat(req.body.rate);
  const frequency = req.body.frequency || 'monthly';
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return res.status(400).json({ success: false, message: 'Rate must be between 0 and 1 (0% to 100%)' });
  }
  if (!['daily', 'monthly', 'yearly'].includes(frequency)) {
    return res.status(400).json({ success: false, message: 'Invalid frequency' });
  }
  await store.query(
    'UPDATE savings_products SET interest_rate = $1, interest_frequency = $2 WHERE product_id = $3',
    [rate, frequency, 'sp_regular']
  );
  if ((await store.query("SELECT COUNT(*) as c FROM savings_products WHERE product_id = 'sp_regular'")).rows[0].c === '0') {
    await store.query(
      `INSERT INTO savings_products (product_id, name, description, interest_rate, interest_frequency, min_balance, is_active, created_at)
       VALUES ('sp_regular', 'Regular Savings', 'Default savings account with automatic interest', $1, $2, 0, 1, $3)`,
      [rate, frequency, new Date().toISOString()]
    );
  }
  res.json({ success: true, rate, frequency });
}));

router.post('/settings/opening-fees', requireRole(3), asyncHandler(async (req, res) => {
  const { membership_fee, insurance_fee, initial_savings } = req.body;
  if (membership_fee !== undefined) await store.setSetting('membership_fee', String(Number(membership_fee).toFixed(2)));
  if (insurance_fee !== undefined) await store.setSetting('insurance_fee', String(Number(insurance_fee).toFixed(2)));
  if (initial_savings !== undefined) await store.setSetting('initial_savings', String(Number(initial_savings).toFixed(2)));
  res.json({ success: true });
}));

router.get('/reset-data/confirm', requireRole(4), asyncHandler(async (req, res) => {
  const err = req.query.error ? req.query.error : '';
  const content = `
  <div class="card" style="max-width:500px;margin:0 auto">
    <div class="card-header"><h3>&#x26A0;&#xFE0F; Reset All Data</h3></div>
    <div class="card-body-padded">
      <p style="color:var(--danger);font-weight:600;margin-bottom:16px">This will permanently delete ALL member accounts, transactions, goals, badges, loans, and audit data. Reference tables (GL accounts, shop items, quiz questions) will be kept.</p>
      <p style="margin-bottom:16px">Enter your password to confirm this destructive action.</p>
      ${err ? `<p style="color:var(--danger);font-weight:600;margin-bottom:12px">&#x274C; ${err}</p>` : ''}
      <form method="post" action="/admin/reset-data" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label>Your Password</label><input type="password" name="password" required></div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-danger">&#x26A0;&#xFE0F; Confirm Reset All Data</button>
          <a href="/admin/settings" class="btn btn-cancel">Cancel</a>
        </div>
      </form>
    </div>
  </div>`;
  res.type('html').send(layout('Confirm Reset', 'settings', content, { subtitle: 'Password required' }));
}));

router.post('/reset-data', requireRole(4), asyncHandler(async (req, res) => {
  const { password } = req.body;
  const adminUser = await one('SELECT * FROM admin_users WHERE admin_id = $1', [req.session.adminId]);
  if (!adminUser || !bcrypt.compareSync(password, adminUser.password_hash)) {
    return res.redirect('/admin/reset-data/confirm?error=Incorrect+password');
  }
  // Keep reference tables — only clear user/transaction data
  const tables = [
    'gl_entries',
    'loan_payments',
    'transactions',
    'badges',
    'goal_jars',
    'loans',
    'withdrawal_requests',
    'standing_orders',
    'coop_contributions',
    'coop_goals',
    'accounts',
  ];
  if (isPostgres) {
    const existing = await store.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const existingSet = new Set(existing.rows.map(r => r.table_name));
    await store.transaction(async (tx) => {
      for (const t of tables) {
        if (existingSet.has(t)) {
          await tx.query(`DELETE FROM "${t}"`);
        }
      }
    });
  } else {
    for (const t of tables) {
      try { store.query(`DELETE FROM ${t}`); } catch (_) {}
    }
    try { store.query("DELETE FROM sqlite_sequence WHERE name IN ('" + tables.join("','") + "')"); } catch (_) {}
  }
  res.redirect('/admin?msg=All+data+reset+successful');
}));

// ── Loan Products Management ──

router.get('/loan-products', requireRole(1), asyncHandler(async (req, res) => {

  const products = await sql('SELECT * FROM loan_products ORDER BY min_amount ASC');
  const q = req.query;
  const toast = q.created ? 'success:Loan product created.'
    : q.updated ? 'success:Loan product updated.'
    : q.toggled ? 'success:Loan product status toggled.'
    : q.error ? `error:${q.error}`
    : '';

  const activeCount = products.filter(p => p.is_active).length;

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F3ED;</div><div class="stat-value">${products.length}</div><div class="stat-label">Total Products</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2705;</div><div class="stat-value">${activeCount}</div><div class="stat-label">Active</div><div class="stat-bar"><div class="stat-bar-fill" style="width:${products.length > 0 ? (activeCount/products.length*100).toFixed(0) : 0}%;background:var(--accent)"></div></div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F3ED; Loan Products</h3>
      <div><a href="#add-product" class="btn btn-primary btn-sm">&#x2795; New Product</a></div>
    </div>
    <div class="card-body">
    <table><tr>
      <th>Name</th><th>Rate</th><th>Type</th><th>Min Amount</th><th>Max Amount</th><th>Min Term</th><th>Max Term</th><th>Status</th><th>Actions</th>
    </tr>
    ${products.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No loan products yet.</td></tr>' : products.map(p => `
    <tr>
      <td><b>${p.name}</b><br><span style="font-size:11px;color:var(--text-muted)">${p.description || ''}</span></td>
      <td class="num">${(Number(p.interest_rate) * 100).toFixed(1)}%</td>
      <td><span class="badge badge-blue">${p.interest_type === 'flat' ? 'Flat' : 'Diminishing'}</span></td>
      <td class="num">&#x20B1;${Number(p.min_amount).toFixed(0)}</td>
      <td class="num">&#x20B1;${Number(p.max_amount).toFixed(0)}</td>
      <td class="num">${p.min_term}mo</td>
      <td class="num">${p.max_term}mo</td>
      <td><span class="badge ${p.is_active ? 'badge-green' : 'badge-gray'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
      <td><div class="actions-cell">
        <a href="#edit-${p.product_id}" class="btn btn-secondary btn-xs">&#x270F;</a>
        <form method="post" action="/admin/loan-products/toggle/${p.product_id}" style="display:inline" data-confirm="${p.is_active ? 'Deactivate' : 'Activate'} ${p.name}?">
          <button type="submit" class="btn btn-${p.is_active ? 'danger' : 'primary'} btn-xs">${p.is_active ? '&#x1F4A4;' : '&#x2705;'}</button>
        </form>
      </div></td>
    </tr>`).join('')}
    </table></div>
  </div>

  <!-- Add Modal -->
  <div id="add-product" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Loan Product</h2>
  <form method="post" action="/admin/loan-products/create">
    <label for="lpname">Name</label>
    <input type="text" id="lpname" name="name" placeholder="e.g. Education Loan" required>
    <label for="lpdesc">Description</label>
    <input type="text" id="lpdesc" name="description" placeholder="Brief description">
    <div class="form-row">
      <div><label for="lprate">Interest Rate (%)</label><input type="number" id="lprate" name="interest_rate" min="0" max="1" step="0.01" value="0.05" required></div>
      <div><label for="lptype">Interest Type</label><select id="lptype" name="interest_type"><option value="flat">Flat</option><option value="diminishing">Diminishing</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="lpminamt">Min Amount (&#x20B1;)</label><input type="number" id="lpminamt" name="min_amount" min="1" value="100"></div>
      <div><label for="lpmaxamt">Max Amount (&#x20B1;)</label><input type="number" id="lpmaxamt" name="max_amount" min="1" value="10000"></div>
    </div>
    <div class="form-row">
      <div><label for="lpmint">Min Term (months)</label><input type="number" id="lpmint" name="min_term" min="1" value="1"></div>
      <div><label for="lpmaxt">Max Term (months)</label><input type="number" id="lpmaxt" name="max_term" min="1" value="12"></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x2795; Create Product</button>
  </form>
  </div>
  </div>

  <!-- Edit Modals -->
  ${products.map(p => `
  <div id="edit-${p.product_id}" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${p.name}</h2>
  <form method="post" action="/admin/loan-products/update/${p.product_id}">
    <label for="en_${p.product_id}">Name</label>
    <input type="text" id="en_${p.product_id}" name="name" value="${p.name}" required>
    <label for="ed_${p.product_id}">Description</label>
    <input type="text" id="ed_${p.product_id}" name="description" value="${p.description || ''}">
    <div class="form-row">
      <div><label for="er_${p.product_id}">Interest Rate (%)</label><input type="number" id="er_${p.product_id}" name="interest_rate" min="0" max="1" step="0.01" value="${p.interest_rate}"></div>
      <div><label for="et_${p.product_id}">Type</label><select id="et_${p.product_id}" name="interest_type"><option value="flat"${p.interest_type==='flat'?' selected':''}>Flat</option><option value="diminishing"${p.interest_type==='diminishing'?' selected':''}>Diminishing</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="emina_${p.product_id}">Min Amount</label><input type="number" id="emina_${p.product_id}" name="min_amount" min="1" value="${p.min_amount}"></div>
      <div><label for="emaxa_${p.product_id}">Max Amount</label><input type="number" id="emaxa_${p.product_id}" name="max_amount" min="1" value="${p.max_amount}"></div>
    </div>
    <div class="form-row">
      <div><label for="emint_${p.product_id}">Min Term</label><input type="number" id="emint_${p.product_id}" name="min_term" min="1" value="${p.min_term}"></div>
      <div><label for="emaxt_${p.product_id}">Max Term</label><input type="number" id="emaxt_${p.product_id}" name="max_term" min="1" value="${p.max_term}"></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}
  `;

  res.type('html').send(layout('Loan Products', 'loan-products', content, {
    toast,
    subtitle: `${activeCount} active of ${products.length} total`,
  }));
}));

router.post('/loan-products/create', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term } = req.body;
    if (!name) return res.redirect('/admin/loan-products?error=Name+required');
    await store.createLoanProduct({
      name: name.trim(),
      description: description || '',
      interest_rate: Number(interest_rate) || 0,
      interest_type: interest_type || 'flat',
      min_amount: Number(min_amount) || 100,
      max_amount: Number(max_amount) || 10000,
      min_term: Number(min_term) || 1,
      max_term: Number(max_term) || 12,
    });
    res.redirect('/admin/loan-products?created=ok');
  } catch (err) {
    res.redirect(`/admin/loan-products?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/loan-products/update/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term } = req.body;
    await store.updateLoanProduct(req.params.id, {
      name: name?.trim(),
      description,
      interest_rate: interest_rate !== undefined ? Number(interest_rate) : undefined,
      interest_type,
      min_amount: min_amount !== undefined ? Number(min_amount) : undefined,
      max_amount: max_amount !== undefined ? Number(max_amount) : undefined,
      min_term: min_term !== undefined ? Number(min_term) : undefined,
      max_term: max_term !== undefined ? Number(max_term) : undefined,
    });
    res.redirect('/admin/loan-products?updated=ok');
  } catch (err) {
    res.redirect(`/admin/loan-products?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/loan-products/toggle/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const product = await store.getLoanProduct(req.params.id);
    if (!product) return res.redirect('/admin/loan-products?error=Product+not+found');
    await store.updateLoanProduct(req.params.id, { is_active: product.is_active ? 0 : 1 });
    res.redirect('/admin/loan-products?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/loan-products?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Savings Products Management ──

router.get('/savings-products', requireRole(1), asyncHandler(async (req, res) => {

  const products = await sql('SELECT * FROM savings_products ORDER BY name ASC');
  const q = req.query;
  const toast = q.created ? 'success:Savings product created.'
    : q.updated ? 'success:Savings product updated.'
    : q.toggled ? 'success:Savings product status toggled.'
    : q.error ? `error:${q.error}`
    : '';

  const activeCount = products.filter(p => p.is_active).length;

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4B1;</div><div class="stat-value">${products.length}</div><div class="stat-label">Total Products</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2705;</div><div class="stat-value">${activeCount}</div><div class="stat-label">Active</div><div class="stat-bar"><div class="stat-bar-fill" style="width:${products.length > 0 ? (activeCount/products.length*100).toFixed(0) : 0}%;background:var(--accent)"></div></div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4B1; Savings Products</h3>
      <div><a href="#add-product" class="btn btn-primary btn-sm">&#x2795; New Product</a></div>
    </div>
    <div class="card-body">
    <table><tr>
      <th>Name</th><th>Rate</th><th>Frequency</th><th>Min Balance</th><th>Withdrawal Limit</th><th>Status</th><th>Actions</th>
    </tr>
    ${products.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No savings products yet.</td></tr>' : products.map(p => `
    <tr>
      <td><b>${p.name}</b><br><span style="font-size:11px;color:var(--text-muted)">${p.description || ''}</span></td>
      <td class="num">${(Number(p.interest_rate) * 100).toFixed(1)}%</td>
      <td><span class="badge badge-purple">${p.interest_frequency}</span></td>
      <td class="num">&#x20B1;${Number(p.min_balance).toFixed(0)}</td>
      <td class="num">${p.withdrawal_limit !== null ? '&#x20B1;' + Number(p.withdrawal_limit).toFixed(0) : '<span style="color:var(--text-muted)">No limit</span>'}</td>
      <td><span class="badge ${p.is_active ? 'badge-green' : 'badge-gray'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
      <td><div class="actions-cell">
        <a href="#edit-${p.product_id}" class="btn btn-secondary btn-xs">&#x270F;</a>
        <form method="post" action="/admin/savings-products/toggle/${p.product_id}" style="display:inline" data-confirm="${p.is_active ? 'Deactivate' : 'Activate'} ${p.name}?">
          <button type="submit" class="btn btn-${p.is_active ? 'danger' : 'primary'} btn-xs">${p.is_active ? '&#x1F4A4;' : '&#x2705;'}</button>
        </form>
      </div></td>
    </tr>`).join('')}
    </table></div>
  </div>

  <!-- Add Modal -->
  <div id="add-product" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Savings Product</h2>
  <form method="post" action="/admin/savings-products/create">
    <label for="spname">Name</label>
    <input type="text" id="spname" name="name" placeholder="e.g. Premium Savings" required>
    <label for="spdesc">Description</label>
    <input type="text" id="spdesc" name="description" placeholder="Brief description">
    <div class="form-row">
      <div><label for="sprate">Interest Rate (%)</label><input type="number" id="sprate" name="interest_rate" min="0" max="1" step="0.01" value="0.02" required></div>
      <div><label for="spfreq">Frequency</label><select id="spfreq" name="interest_frequency"><option value="daily">Daily</option><option value="monthly" selected>Monthly</option><option value="yearly">Yearly</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="spminbal">Min Balance (&#x20B1;)</label><input type="number" id="spminbal" name="min_balance" min="0" value="0"></div>
      <div><label for="spwlimit">Withdrawal Limit (&#x20B1;)</label><input type="number" id="spwlimit" name="withdrawal_limit" min="0" placeholder="No limit" value=""></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x2795; Create Product</button>
  </form>
  </div>
  </div>

  <!-- Edit Modals -->
  ${products.map(p => `
  <div id="edit-${p.product_id}" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${p.name}</h2>
  <form method="post" action="/admin/savings-products/update/${p.product_id}">
    <label for="en_${p.product_id}">Name</label>
    <input type="text" id="en_${p.product_id}" name="name" value="${p.name}" required>
    <label for="ed_${p.product_id}">Description</label>
    <input type="text" id="ed_${p.product_id}" name="description" value="${p.description || ''}">
    <div class="form-row">
      <div><label for="er_${p.product_id}">Interest Rate (%)</label><input type="number" id="er_${p.product_id}" name="interest_rate" min="0" max="1" step="0.01" value="${p.interest_rate}"></div>
      <div><label for="ef_${p.product_id}">Frequency</label><select id="ef_${p.product_id}" name="interest_frequency"><option value="daily"${p.interest_frequency==='daily'?' selected':''}>Daily</option><option value="monthly"${p.interest_frequency==='monthly'?' selected':''}>Monthly</option><option value="yearly"${p.interest_frequency==='yearly'?' selected':''}>Yearly</option></select></div>
    </div>
    <div class="form-row">
      <div><label for="emb_${p.product_id}">Min Balance</label><input type="number" id="emb_${p.product_id}" name="min_balance" min="0" value="${p.min_balance}"></div>
      <div><label for="ewl_${p.product_id}">Withdrawal Limit</label><input type="number" id="ewl_${p.product_id}" name="withdrawal_limit" min="0" placeholder="No limit" value="${p.withdrawal_limit !== null ? p.withdrawal_limit : ''}"></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}
  `;

  res.type('html').send(layout('Savings Products', 'savings-products', content, {
    toast,
    subtitle: `${activeCount} active of ${products.length} total`,
  }));
}));

router.post('/savings-products/create', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit } = req.body;
    if (!name) return res.redirect('/admin/savings-products?error=Name+required');
    await store.createSavingsProduct({
      name: name.trim(),
      description: description || '',
      interest_rate: Number(interest_rate) || 0,
      interest_frequency: interest_frequency || 'monthly',
      min_balance: Number(min_balance) || 0,
      withdrawal_limit: withdrawal_limit !== '' ? Number(withdrawal_limit) : undefined,
    });
    res.redirect('/admin/savings-products?created=ok');
  } catch (err) {
    res.redirect(`/admin/savings-products?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/savings-products/update/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit } = req.body;
    await store.updateSavingsProduct(req.params.id, {
      name: name?.trim(),
      description,
      interest_rate: interest_rate !== undefined ? Number(interest_rate) : undefined,
      interest_frequency,
      min_balance: min_balance !== undefined ? Number(min_balance) : undefined,
      withdrawal_limit: withdrawal_limit !== '' && withdrawal_limit !== undefined ? Number(withdrawal_limit) : null,
    });
    res.redirect('/admin/savings-products?updated=ok');
  } catch (err) {
    res.redirect(`/admin/savings-products?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/savings-products/toggle/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const product = await store.getSavingsProduct(req.params.id);
    if (!product) return res.redirect('/admin/savings-products?error=Product+not+found');
    await store.updateSavingsProduct(req.params.id, { is_active: product.is_active ? 0 : 1 });
    res.redirect('/admin/savings-products?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/savings-products?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Withdrawal Requests Management ──

router.get('/withdrawal-requests', requireRole(1), asyncHandler(async (req, res) => {

  const requests = await sql('SELECT w.*, a.child_name, a.member_id FROM withdrawal_requests w LEFT JOIN accounts a ON w.account_id = a.account_id ORDER BY w.created_at DESC');
  const q = req.query;

  const filterStatus = q.status || '';
  const filtered = filterStatus ? requests.filter(r => r.status === filterStatus) : requests;

  const toast = q.approved ? 'success:Withdrawal approved.'
    : q.rejected ? 'success:Withdrawal rejected.'
    : q.paid ? 'success:Withdrawal marked as paid.'
    : q.error ? `error:${q.error}`
    : '';

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusColors = { pending: 'badge-amber', approved: 'badge-blue', rejected: 'badge-red', paid: 'badge-gray' };
  const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', paid: 'Paid' };

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4B8;</div><div class="stat-value">${requests.length}</div><div class="stat-label">Total Requests</div></div>
    <div class="stat-card"><div class="stat-icon">&#x23F3;</div><div class="stat-value">${pendingCount}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-icon">&#x20B1;</div><div class="stat-value">${requests.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0).toFixed(0)}</div><div class="stat-label">Pending Amount</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4B8; Withdrawal Requests</h3>
      <div style="display:flex;gap:8px;align-items-center">
        <form method="get" action="/admin/withdrawal-requests" style="display:flex;gap:6px;align-items:center">
          <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" data-auto-submit="true">
            <option value="">All Status</option>
            <option value="pending"${filterStatus === 'pending' ? ' selected' : ''}>Pending</option>
            <option value="approved"${filterStatus === 'approved' ? ' selected' : ''}>Approved</option>
            <option value="rejected"${filterStatus === 'rejected' ? ' selected' : ''}>Rejected</option>
            <option value="paid"${filterStatus === 'paid' ? ' selected' : ''}>Paid</option>
          </select>
          ${filterStatus ? `<a href="/admin/withdrawal-requests" class="btn btn-outline btn-xs">&#x2716; Clear</a>` : ''}
        </form>
      </div>
    </div>
    <div class="card-body">
    ${filtered.length === 0 ? '<div style="padding:32px;text-align:center;color:var(--text-muted)">No withdrawal requests found.</div>' : `
    <table><tr>
      <th>Child</th><th>Member ID</th><th>Amount</th><th>Reason</th><th>Status</th><th>Requested</th><th>Actions</th>
    </tr>
    ${filtered.map(r => `
    <tr>
      <td><b>${r.child_name || 'Unknown'}</b></td>
      <td class="mono">${r.member_id || '-'}</td>
      <td class="num">&#x20B1;${Number(r.amount).toFixed(2)}</td>
      <td>${r.reason || '-'}</td>
      <td><span class="badge ${statusColors[r.status] || 'badge-gray'}">${statusLabels[r.status] || r.status}</span></td>
      <td class="mono">${(r.created_at || '').slice(0, 10)}</td>
      <td><div class="actions-cell">
        ${r.status === 'pending' ? `
          <form method="post" action="/admin/withdrawal-requests/approve/${r.request_id}" style="display:inline" data-confirm="Approve withdrawal of &#x20B1;${Number(r.amount).toFixed(2)}?">
            <button type="submit" class="btn btn-primary btn-xs">&#x2705; Approve</button>
          </form>
          <form method="post" action="/admin/withdrawal-requests/reject/${r.request_id}" style="display:inline" data-confirm="Reject this request?">
            <button type="submit" class="btn btn-danger btn-xs">&#x274C; Reject</button>
          </form>
        ` : r.status === 'approved' ? `
          <form method="post" action="/admin/withdrawal-requests/pay/${r.request_id}" style="display:inline" data-confirm="Process payment of &#x20B1;${Number(r.amount).toFixed(2)} to ${r.child_name}? This will deduct from their balance.">
            <button type="submit" class="btn btn-amber btn-xs">&#x1F4B5; Pay Out</button>
          </form>
        ` : '<span style="font-size:11px;color:var(--text-muted)">—</span>'}
      </div></td>
    </tr>`).join('')}
    </table>`}
    </div>
  </div>
  `;

  res.type('html').send(layout('Withdrawal Requests', 'withdrawal-requests', content, {
    toast,
    subtitle: `${pendingCount} pending`,
    counts: { 'withdrawal-requests': pendingCount },
  }));
}));

router.post('/withdrawal-requests/approve/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const reqData = await store.getWithdrawalRequest(req.params.id);
    if (!reqData) return res.redirect('/admin/withdrawal-requests?error=Request+not+found');
    if (reqData.status !== 'pending') return res.redirect('/admin/withdrawal-requests?error=Request+is+not+pending');
    await store.updateWithdrawalRequest(req.params.id, { status: 'approved', resolved_at: new Date().toISOString() });
    notifs.notifyWithdrawalApproved(reqData.account_id, reqData.amount, reqData.reason).catch(() => {});
    res.redirect('/admin/withdrawal-requests?approved=ok');
  } catch (err) {
    res.redirect(`/admin/withdrawal-requests?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/withdrawal-requests/reject/:id', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const reqData = await store.getWithdrawalRequest(req.params.id);
    if (!reqData) return res.redirect('/admin/withdrawal-requests?error=Request+not+found');
    if (reqData.status !== 'pending') return res.redirect('/admin/withdrawal-requests?error=Request+is+not+pending');
    await store.updateWithdrawalRequest(req.params.id, { status: 'rejected', resolved_at: new Date().toISOString() });
    notifs.notifyWithdrawalRejected(reqData.account_id, reqData.amount, reqData.reason).catch(() => {});
    res.redirect('/admin/withdrawal-requests?rejected=ok');
  } catch (err) {
    res.redirect(`/admin/withdrawal-requests?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/withdrawal-requests/pay/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {

    const reqData = await store.getWithdrawalRequest(req.params.id);
    if (!reqData) return res.redirect('/admin/withdrawal-requests?error=Request+not+found');
    if (reqData.status !== 'approved') return res.redirect('/admin/withdrawal-requests?error=Request+must+be+approved+first');

    const account = await store.getAccount(reqData.account_id);
    if (!account) return res.redirect('/admin/withdrawal-requests?error=Account+not+found');
    if (Number(account.actual_balance) < Number(reqData.amount)) {
      return res.redirect('/admin/withdrawal-requests?error=Insufficient+balance');
    }
    const maintainingBalance = Number(account.maintaining_balance || 0);
    if (Number(account.actual_balance) - Number(reqData.amount) < maintainingBalance) {
      return res.redirect(`/admin/withdrawal-requests?error=Cannot+withdraw+below+maintaining+balance+of+%E2%82%B1${maintainingBalance.toFixed(2)}`);
    }

    const val = Number(reqData.amount);
    const newBalance = Math.round((Number(account.actual_balance) - val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) - val) * 100) / 100;

    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, Math.max(0, newUnallocated), reqData.account_id]);
    await store.addTransaction({
      account_id: reqData.account_id,
      type: 'withdrawal',
      amount: val,
      description: `Withdrawal request: ${reqData.reason || 'Cash withdrawal'}`,
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    await store.updateWithdrawalRequest(req.params.id, { status: 'paid', resolved_at: new Date().toISOString() });
    notifs.notifyWithdrawalPaid(reqData.account_id, reqData.amount).catch(() => {});
    res.redirect('/admin/withdrawal-requests?paid=ok');
  } catch (err) {
    res.redirect(`/admin/withdrawal-requests?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Online Deposits (GCash) Management ──

router.get('/online-deposits', requireRole(1), asyncHandler(async (req, res) => {
  const deposits = await store.getOnlineDeposits(null);
  const pendingCount = deposits.filter(d => d.status === 'pending').length;
  const filterStatus = req.query.status || '';
  const filtered = filterStatus ? deposits.filter(d => d.status === filterStatus) : deposits;

  let rows = '';
  for (const d of filtered) {
    const statusClass = d.status === 'approved' ? 'badge-green' : d.status === 'rejected' ? 'badge-red' : 'badge-yellow';
    const resolved = d.resolved_at ? new Date(d.resolved_at).toLocaleDateString() : '—';
    rows += `
    <tr>
      <td><span class="date-cell">${new Date(d.created_at).toLocaleDateString()}</span></td>
      <td>${d.child_name || '—'}</td>
      <td>₱${Number(d.amount).toFixed(2)}</td>
      <td>${d.reference_number || '—'}</td>
      <td>${d.sender_name || '—'}</td>
      <td>${d.payment_method || 'gcash'}</td>
      <td><span class="badge ${statusClass}">${d.status}</span></td>
      <td>${d.admin_notes || '—'}</td>
      <td>${resolved}</td>
      <td class="actions-cell">
        ${d.status === 'pending' ? `
          <form method="POST" action="/admin/online-deposits/approve/${d.deposit_id}" style="display:inline">
            <input type="hidden" name="admin_notes" value="Approved via admin">
            <button type="submit" class="btn btn-green btn-xs" onclick="return confirm('Confirm deposit of ₱${Number(d.amount).toFixed(2)}?')">Approve</button>
          </form>
          <form method="POST" action="/admin/online-deposits/reject/${d.deposit_id}" style="display:inline">
            <input type="hidden" name="admin_notes" value="Rejected by admin">
            <button type="submit" class="btn btn-red btn-xs" onclick="return confirm('Reject this deposit?')">Reject</button>
          </form>
        ` : '—'}
      </td>
    </tr>`;
  }
  if (!rows) rows = '<tr><td colspan="10" class="empty-state">No online deposits found</td></tr>';

  const filterHtml = ['', 'pending', 'approved', 'rejected'].map(s => {
    const label = s || 'All';
    const active = filterStatus === s ? 'btn-primary' : 'btn-outline';
    return `<a href="/admin/online-deposits${s ? '?status=' + s : ''}" class="btn ${active} btn-xs">${label}</a>`;
  }).join(' ');

  const featureStatusHtml = `
    <div class="feature-status-card" style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="toggleFeatureDetails()">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:#c7d2fe;border-radius:6px;padding:6px;line-height:1;">&#x2728;</span>
          <div>
            <strong style="color:#4338ca;font-size:14px;">Auto-Credit Deposit Coming Soon</strong>
            <div style="color:#6366f1;font-size:11px;">One-tap GCash via PayMongo</div>
          </div>
        </div>
        <span id="featureToggleIcon" style="color:#6366f1;font-size:18px;">&#x25BC;</span>
      </div>
      <div id="featureDetails" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid #c7d2fe;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div style="background:white;border-radius:6px;padding:10px;border:1px solid #e0e7ff;">
            <div style="color:#4338ca;font-weight:600;font-size:12px;">&#x1F4F1; QR Code Checkout</div>
            <div style="color:#6366f1;font-size:11px;">Scan & pay via GCash app — no reference number needed</div>
          </div>
          <div style="background:white;border-radius:6px;padding:10px;border:1px solid #e0e7ff;">
            <div style="color:#4338ca;font-weight:600;font-size:12px;">&#x26A1; Instant Credit</div>
            <div style="color:#6366f1;font-size:11px;">Auto-approved in seconds, no admin approval needed</div>
          </div>
          <div style="background:white;border-radius:6px;padding:10px;border:1px solid #e0e7ff;">
            <div style="color:#4338ca;font-weight:600;font-size:12px;">&#x1F4CB; Payment History</div>
            <div style="color:#6366f1;font-size:11px;">All transactions tracked in one place</div>
          </div>
          <div style="background:white;border-radius:6px;padding:10px;border:1px solid #e0e7ff;">
            <div style="color:#4338ca;font-weight:600;font-size:12px;">&#x1F512; Secure</div>
            <div style="color:#6366f1;font-size:11px;">Powered by PayMongo with bank-grade encryption</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#6366f1;font-size:11px;">Fee: 2.75% + PHP 15 per transaction</span>
          <span style="background:#dbeafe;color:#2563eb;border-radius:4px;padding:2px 8px;font-size:11px;">Awaiting BSP docs</span>
        </div>
      </div>
    </div>
    <script>
      function toggleFeatureDetails() {
        const details = document.getElementById('featureDetails');
        const icon = document.getElementById('featureToggleIcon');
        const isOpen = details.style.display === 'block';
        details.style.display = isOpen ? 'none' : 'block';
        icon.innerHTML = isOpen ? '&#x25BC;' : '&#x25B2;';
      }
    </script>
  `;

  const content = `
    <div class="page-header">
      <h2><span class="icon">&#x1F4B0;</span> Online Deposits (GCash)</h2>
      <div class="header-actions">${filterHtml}</div>
    </div>
    ${featureStatusHtml}
    <div class="table-container">
      <table class="data-table">
        <thead><tr>
          <th>Date</th><th>Child</th><th>Amount</th><th>Reference #</th><th>Sender</th><th>Method</th><th>Status</th><th>Notes</th><th>Resolved</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  res.type('html').send(layout('Online Deposits', 'online-deposits', content, {
    toast: req.query.paid === 'ok' ? 'Deposit approved successfully' : req.query.error ? 'Error: ' + req.query.error : '',
    subtitle: `${pendingCount} pending`,
    counts: { 'online-deposits': pendingCount },
  }));
}));

router.post('/online-deposits/approve/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const deposit = await store.getOnlineDeposit(req.params.id);
    if (!deposit) return res.redirect('/admin/online-deposits?error=Deposit+not+found');
    if (deposit.status !== 'pending') return res.redirect('/admin/online-deposits?error=Deposit+already+resolved');

    const account = await store.getAccount(deposit.account_id);
    if (!account) return res.redirect('/admin/online-deposits?error=Account+not+found');

    const val = Number(deposit.amount);
    const newBalance = Math.round((Number(account.actual_balance) + val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) + val) * 100) / 100;

    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, newUnallocated, deposit.account_id]);
    await store.addTransaction({
      account_id: deposit.account_id,
      type: 'deposit',
      amount: val,
      description: `GCash deposit: ${deposit.reference_number || 'No ref'} (${deposit.sender_name || 'Unknown sender'})`,
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    await store.updateOnlineDeposit(req.params.id, { status: 'approved', admin_notes: req.body.admin_notes || 'Approved via admin', resolved_at: new Date().toISOString() });
    notifs.notifyDepositApproved(deposit.account_id, val, deposit.reference_number).catch(() => {});
    res.redirect('/admin/online-deposits?paid=ok');
  } catch (err) {
    res.redirect(`/admin/online-deposits?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/online-deposits/reject/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const deposit = await store.getOnlineDeposit(req.params.id);
    if (!deposit) return res.redirect('/admin/online-deposits?error=Deposit+not+found');
    if (deposit.status !== 'pending') return res.redirect('/admin/online-deposits?error=Deposit+already+resolved');

    await store.updateOnlineDeposit(req.params.id, { status: 'rejected', admin_notes: req.body.admin_notes || 'Rejected by admin', resolved_at: new Date().toISOString() });
    notifs.notifyDepositRejected(deposit.account_id, deposit.amount, deposit.reference_number).catch(() => {});
    res.redirect('/admin/online-deposits');
  } catch (err) {
    res.redirect(`/admin/online-deposits?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Teller Counter ──

router.get('/teller', requireRole(1), asyncHandler(async (req, res) => {

  const qry = req.query;
  const selectedId = qry.account || '';
  const searchQ = (qry.q || '').trim().toLowerCase();

  let accounts = await sql('SELECT * FROM accounts ORDER BY child_name ASC');
  if (searchQ) {
    accounts = accounts.filter(function(a) {
      return (a.child_name || '').toLowerCase().indexOf(searchQ) !== -1
        || (a.member_id || '').toLowerCase().indexOf(searchQ) !== -1;
    });
  }

  let selectedAccount = null;
  let recentTxs = [];
  let loanOptionsHtml = '';
  if (selectedId) {
    selectedAccount = await one('SELECT * FROM accounts WHERE account_id = $1', [selectedId]);
    if (selectedAccount) {
      recentTxs = await sql('SELECT * FROM transactions WHERE account_id = $1 AND type != \'allocation\' ORDER BY created_at DESC LIMIT 20', [selectedId]);
      const activeLoans = await sql("SELECT * FROM loans WHERE account_id = $1 AND status = 'active' ORDER BY created_at DESC", [selectedId]);
      loanOptionsHtml = activeLoans.map(function(l) {
        return '<option value="' + l.loan_id + '">' + (l.purpose || 'Loan') + ' - \u20B1' + Number(l.remaining_balance).toFixed(2) + ' remaining</option>';
      }).join('');
    }
  }

  const toast = qry.deposited ? 'success:Deposit completed. Receipt #' + (qry.receipt || '')
    : qry.withdrawn ? 'success:Withdrawal completed. Receipt #' + (qry.receipt || '')
    : qry.loanpaid ? 'success:Loan payment collected. Receipt #' + (qry.receipt || '')
    : qry.voided ? 'success:Transaction voided. Reversal receipt #' + (qry.receipt || '')
    : qry.error ? 'error:' + qry.error
    : '';

  const receipt = qry.receipt ? (await one("SELECT t.*, a.child_name, a.member_id FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id WHERE t.transaction_id = $1", [qry.receipt])) : null;
  const adminRole = Number(req.session.role) || 0;

  const bankStyle = `<style>
  .teller-bar { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 24px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .teller-search { display:flex; gap:12px; }
  .teller-search input { flex:1; padding:12px 16px; border:2px solid var(--border); border-radius:10px; font-size:15px; outline:none; background:var(--card); transition:border-color 0.2s; }
  .teller-search input:focus { border-color:var(--accent); }
  .search-results { margin:-8px 0 16px 0; }
  .search-result-item { display:flex; align-items:center; gap:12px; padding:10px 16px; border-radius:8px; cursor:pointer; transition:background 0.15s; text-decoration:none; color:var(--text); }
  .search-result-item:hover { background:var(--bg-alt); }
  .search-result-item .sra { width:36px; height:36px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; flex-shrink:0; }
  .search-result-item .sra-img { width:36px; height:36px; border-radius:50%; object-fit:cover; flex-shrink:0; }
  .search-result-item .srn { font-weight:600; font-size:14px; }
  .search-result-item .srm { font-size:11px; color:var(--text-muted); font-family:var(--mono); }
  .teller-grid { display:grid; grid-template-columns: 1fr 1fr; gap:20px; }
  .teller-card { background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .teller-card-header { padding:14px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:#fafbfc; }
  .teller-card-header h3 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); }
  .teller-card-body { padding:20px; }
  .customer-header { display:flex; align-items:center; gap:16px; margin-bottom:16px; padding-bottom:16px; border-bottom:2px solid var(--accent); }
  .customer-avatar { width:48px; height:48px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:700; }
  .customer-info h2 { font-size:20px; font-weight:700; margin:0; }
  .customer-info .member { font-size:12px; color:var(--text-muted); font-family:var(--mono); }
  .balance-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:20px; }
  .balance-item { background:#f8fafc; border-radius:10px; padding:14px 16px; border:1px solid var(--border); }
  .balance-item .blabel { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600; }
  .balance-item .bvalue { font-size:22px; font-weight:800; margin-top:2px; font-family:var(--mono); }
  .balance-item .bvalue.green { color:#16a34a; }
  .balance-item .bvalue.gray { color:var(--text); }
  .tx-tabs { display:flex; gap:4px; margin-bottom:0; background:#f1f5f9; border-radius:10px; padding:4px; }
  .tx-tab { flex:1; text-align:center; padding:10px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:none; background:transparent; color:var(--text-muted); transition:all 0.2s; }
  .tx-tab:hover { color:var(--text); }
  .tx-tab.active { background:var(--card); color:var(--text); box-shadow:0 1px 3px rgba(0,0,0,0.1); }
  .tx-panel { display:none; margin-top:16px; }
  .tx-panel.active { display:block; }
  .tx-panel .field { margin-bottom:12px; }
  .tx-panel .field label { display:block; font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.3px; }
  .tx-panel .field input, .tx-panel .field select { width:100%; padding:10px 14px; border:2px solid var(--border); border-radius:8px; font-size:14px; outline:none; transition:border-color 0.2s; box-sizing:border-box; background:var(--card); }
  .tx-panel .field input:focus, .tx-panel .field select:focus { border-color:var(--accent); }
  .tx-panel .field .hint { font-size:11px; color:var(--text-muted); margin-top:2px; }
  .btn-action { color:#fff; border:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; width:100%; transition:background 0.2s; }
  .btn-green { background:#16a34a; } .btn-green:hover { background:#15803d; }
  .btn-orange { background:#ea580c; } .btn-orange:hover { background:#c2410c; }
  .btn-blue { background:#2563eb; } .btn-blue:hover { background:#1d4ed8; }
  .tx-table { width:100%; border-collapse:collapse; }
  .tx-table th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600; padding:8px 12px; border-bottom:2px solid var(--border); }
  .tx-table td { padding:10px 12px; font-size:13px; border-bottom:1px solid var(--border); }
  .tx-table tr:last-child td { border-bottom:none; }
  .tx-table .tx-amt { font-weight:700; font-family:var(--mono); text-align:right; }
  .tx-table .tx-date { font-size:11px; color:var(--text-muted); font-family:var(--mono); white-space:nowrap; }
  .tx-table .tx-desc { color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tx-type-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
  .tx-type-badge.deposit { background:#dcfce7; color:#166534; }
  .tx-type-badge.withdrawal { background:#fee2e2; color:#991b1b; }
  .tx-type-badge.loan_payment { background:#dbeafe; color:#1e40af; }
  .tx-type-badge.loan_disbursement { background:#fef3c7; color:#92400e; }
  .tx-type-badge.interest { background:#f3e8ff; color:#6b21a8; }
  .tx-type-badge.allocation { background:#e0f2fe; color:#075985; }
  .empty2 { text-align:center; padding:48px 20px; color:var(--text-muted); }
  .empty2 .icon { font-size:48px; margin-bottom:12px; }
  .empty2 h3 { font-size:18px; font-weight:600; color:var(--text); margin-bottom:4px; }
  .empty2 p { font-size:13px; }
  .rcpt-link { cursor:pointer; font-size:13px; color:var(--accent); text-decoration:none; opacity:0.6; transition:opacity 0.2s; }
  .rcpt-link:hover { opacity:1; text-decoration:underline; }
  .receipt-inline { background:#fff; border:1px solid #d0d0d0; border-radius:8px; margin-bottom:12px; font-family:'Courier New',monospace; font-size:12px; }
  .receipt-inline .ri-header { text-align:center; padding:10px; border-bottom:1px dashed #ccc; }
  .receipt-inline .ri-header strong { font-size:14px; }
  .receipt-inline .ri-body { padding:10px 14px; }
  .receipt-inline .ri-row { display:flex; justify-content:space-between; padding:3px 0; }
  .receipt-inline .ri-label { color:#888; }
  .receipt-inline .ri-value { font-weight:700; }
  .receipt-inline .ri-credit { color:#16a34a; }
  .receipt-inline .ri-debit { color:#dc2626; }
  .receipt-inline .ri-divider { border-top:1px dashed #e0e0e0; margin:5px 0; }
  .receipt-inline .ri-footer { text-align:center; padding:8px; border-top:1px dashed #ccc; font-size:10px; color:#999; }
  .badge-pill { display:inline-block; padding:0 8px; border-radius:10px; font-size:10px; font-weight:600; line-height:20px; }
  @media print { body * { visibility:hidden; } #rinline,#rinline * { visibility:visible; } #rinline { position:absolute; left:0; top:0; width:340px; margin:0; padding:24px; background:#fff; border:2px solid #000; } #rinline .ri-footer button:last-child { display:none; } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  </style>`;

  function receiptHtml(r) {
    if (!r) return '';
    var isCredit = r.type === 'deposit' || r.type === 'loan_disbursement' || r.type === 'interest' || r.type === 'interest_credit';
    var isVoided = r.voided_at ? true : false;
    var voidBanner = isVoided ? '<div style="background:#fef2f2;color:#dc2626;text-align:center;padding:6px;font-weight:700;font-size:13px;border-bottom:2px solid #dc2626"><i class="fas fa-ban"></i> VOIDED — ' + (r.void_reason || '') + '</div>' : '';
    var voidedByLine = isVoided ? '<div class="ri-row"><span class="ri-label">Voided By</span><span class="ri-value" style="color:#dc2626">' + (r.voided_by || '') + ' on ' + (r.voided_at || '').slice(0,10) + '</span></div><div class="ri-divider"></div>' : '';
    return '<div class="receipt-inline" id="rinline">' + voidBanner + '<div class="ri-header"><strong>LABCOOP PASSBOOK</strong><br><span style="font-size:10px;color:#999">Official Transaction Receipt</span></div><div class="ri-body"><div class="ri-row"><span class="ri-label">TRN#</span><span class="ri-value">' + fmtTrn(r, 'TXN-' + (r.transaction_id || '').slice(0,8).toUpperCase()) + '</span></div><div class="ri-row"><span class="ri-label">Date</span><span class="ri-value">' + (r.created_at || '').slice(0,19).replace('T',' ') + '</span></div><div class="ri-row"><span class="ri-label">Member</span><span class="ri-value">' + (r.child_name||'N/A') + ' (' + (r.member_id||'---') + ')</span></div><div class="ri-divider"></div><div class="ri-row"><span class="ri-label">Transaction</span><span class="ri-value" style="text-transform:uppercase">' + r.type.replace(/_/g,' ') + '</span></div><div class="ri-row"><span class="ri-label">Amount</span><span class="ri-value ' + (isCredit ? 'ri-credit' : 'ri-debit') + '">' + (isCredit ? '+' : '-') + ' \u20B1' + Number(r.amount).toFixed(2) + '</span></div><div class="ri-row"><span class="ri-label">Description</span><span class="ri-value">' + (r.description||'-') + '</span></div>' + voidedByLine + '<div class="ri-row"><span class="ri-label">Ext. Ref</span><span class="ri-value" style="font-size:11px">' + (r.reference_id ? (r.reference_type ? r.reference_type + ':' : '') + r.reference_id : '-') + '</span></div><div class="ri-divider"></div><div class="ri-row"><span class="ri-label">Balance Before</span><span class="ri-value">\u20B1' + Number(r.balance_before || 0).toFixed(2) + '</span></div><div class="ri-row"><span class="ri-label">Balance After</span><span class="ri-value">\u20B1' + Number(r.balance_after || 0).toFixed(2) + '</span></div></div><div class="ri-footer"><button data-action="print-receipt" class="btn btn-outline btn-xs">\uD83D\uDDA8 Print</button> &nbsp; <button data-action="close-receipt" class="btn btn-outline btn-xs">\u2716 Close</button></div></div>';
  }

  function searchResultItem(a) {
    var avatarHtml = a.profile_pic_url ? '<img src="' + a.profile_pic_url + '" class="sra-img">' : '<div class="sra">' + (a.child_name || '?')[0].toUpperCase() + '</div>';
    return '<a href="/admin/teller?account=' + a.account_id + (searchQ ? '&q=' + encodeURIComponent(searchQ) : '') + '" class="search-result-item">' + avatarHtml + '<div><div class="srn">' + a.child_name + '</div><div class="srm">' + (a.member_id || '---') + '</div></div></a>';
  }

  const bankContent = bankStyle + `
  <!-- Teller Top Bar -->
  <div class="teller-bar">
    <form method="get" action="/admin/teller" class="teller-search">
      <input type="text" name="q" placeholder="&#x1F50D; Search member by name or ID..." value="${searchQ}" autocomplete="off">
      <button type="submit" style="padding:12px 24px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer">Search</button>
    </form>
    ${selectedAccount ? '<div style="margin-top:8px"><span class="badge-pill" style="background:#dcfce7;color:#166534">&#x2705; ' + selectedAccount.child_name + ' (' + selectedAccount.member_id + ')</span></div>' : ''}
  </div>
  ${searchQ && !selectedId && accounts.length > 0 ? '<div class="search-results">' + accounts.map(searchResultItem).join('') + '</div>' : ''}
  ${searchQ && !selectedId && accounts.length === 0 ? '<div class="search-results" style="padding:16px;text-align:center;color:var(--text-muted)">No members found for "' + searchQ + '"</div>' : ''}

  ${!selectedAccount ? `
  <div class="teller-card">
    <div class="empty2">
      <div class="icon">&#x1F3E6;</div>
      <h3>Welcome to Teller Counter</h3>
      <p>Select a customer above to process deposits, withdrawals, and loan payments.</p>
    </div>
  </div>
  ` : `
  <div class="teller-grid">

    <!-- Left: Customer + Actions -->
    <div class="teller-card">
      <div class="teller-card-body">
          <div class="customer-header">
          <div class="customer-avatar">${selectedAccount.profile_pic_url ? '<img src="' + selectedAccount.profile_pic_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">' : (selectedAccount.child_name || '?')[0].toUpperCase()}</div>
          <div class="customer-info">
            <h2>${selectedAccount.child_name}</h2>
            <span class="member">ID: ${selectedAccount.member_id || '---'}</span>
          </div>
        </div>

        <div class="balance-grid">
          <div class="balance-item">
            <div class="blabel">Balance</div>
            <div class="bvalue green">&#x20B1;${Number(selectedAccount.actual_balance).toFixed(2)}</div>
          </div>
          <div class="balance-item">
            <div class="blabel">Available</div>
            <div class="bvalue gray">&#x20B1;${Number(selectedAccount.unallocated_balance).toFixed(2)}</div>
          </div>
        </div>

        <div class="tx-tabs">
          <button class="tx-tab active" data-tab="deposit" id="tab-deposit">&#x1F4B5; Deposit</button>
          <button class="tx-tab" data-tab="withdraw" id="tab-withdraw">&#x1F4B8; Withdraw</button>
          <button class="tx-tab" data-tab="loan" id="tab-loan">&#x1F3E6; Loan Pay</button>
        </div>

        <div class="tx-panel active" id="panel-deposit">
          <form method="post" action="/admin/teller/deposit/${selectedAccount.account_id}">
            <input type="hidden" name="q" value="${searchQ}">
            <div class="field">
              <label>Amount (&#x20B1;)</label>
              <input type="number" name="amount" min="1" step="0.01" placeholder="0.00" required>
            </div>
            <div class="field">
              <label>Description</label>
              <input type="text" name="description" placeholder="e.g. OTC deposit" value="Counter deposit">
            </div>
            <button type="submit" class="btn-action btn-green">&#x2795; Process Deposit</button>
          </form>
        </div>

        <div class="tx-panel" id="panel-withdraw">
          <form method="post" action="/admin/teller/withdraw/${selectedAccount.account_id}">
            <input type="hidden" name="q" value="${searchQ}">
            <div class="field">
              <label>Amount (&#x20B1;)</label>
              <input type="number" name="amount" min="1" step="0.01" placeholder="0.00" required>
            </div>
            <div class="field">
              <label>Description</label>
              <input type="text" name="description" placeholder="e.g. Cash withdrawal" value="Counter withdrawal">
            </div>
            <button type="submit" class="btn-action btn-orange">&#x1F4B8; Process Withdrawal</button>
          </form>
        </div>

        <div class="tx-panel" id="panel-loan">
          <form method="post" action="/admin/teller/loan-pay/${selectedAccount.account_id}">
            <input type="hidden" name="q" value="${searchQ}">
            <div class="field">
              <label>Select Loan</label>
              <select name="loan_id" required>
                <option value="">-- Choose active loan --</option>
                ${loanOptionsHtml}
              </select>
            </div>
            <div class="field">
              <label>Payment Amount (&#x20B1;)</label>
              <input type="number" name="amount" min="1" step="0.01" placeholder="0.00" required>
            </div>
            <button type="submit" class="btn-action btn-blue">&#x1F4B3; Process Payment</button>
          </form>
        </div>
      </div>
    </div>

    <!-- Right: Transaction History -->
    <div class="teller-card">
      <div class="teller-card-header">
        <h3>&#x1F4CB; History</h3>
        <span style="font-size:11px;color:var(--text-muted)">${recentTxs.length} entries</span>
      </div>
      <div class="teller-card-body" style="padding:0">
        ${receipt ? receiptHtml(receipt) : ''}
        ${recentTxs.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-muted)">No transactions yet.</div>' : '<table class="tx-table"><tr><th>Type</th><th>Amount</th><th>Description</th><th>Date</th><th></th></tr>' + recentTxs.map(tx => {
            var tc = ({deposit:'deposit',withdrawal:'withdrawal',loan_payment:'loan_payment',loan_disbursement:'loan_disbursement',interest:'interest',interest_credit:'interest',allocation:'allocation'})[tx.type] || 'deposit';
            var sign = tx.type === 'deposit' || tx.type === 'loan_disbursement' || tx.type === 'interest' || tx.type === 'interest_credit' ? '+' : '-';
            var col = tx.type === 'deposit' || tx.type === 'loan_disbursement' || tx.type === 'interest' || tx.type === 'interest_credit' ? '#16a34a' : tx.type === 'withdrawal' ? '#dc2626' : 'var(--text)';
            return '<tr><td><span class="tx-type-badge ' + tc + '">' + tx.type.replace(/_/g,' ') + (tx.voided_at ? ' VOIDED' : '') + '</span></td><td class="tx-amt" style="color:' + col + '">' + sign + '&#x20B1;' + Number(tx.amount).toFixed(2) + '</td><td class="tx-desc">' + (tx.description||'-') + (tx.voided_at ? '<br><span style="font-size:10px;color:#dc2626">Voided by ' + (tx.voided_by||'') + '</span>' : '') + '</td><td class="tx-date">' + (tx.created_at||'').slice(0,16).replace('T',' ') + '</td><td style="white-space:nowrap">' + (tx.voided_at ? '<span style="color:#dc2626;font-size:10px;font-weight:600"><i class="fas fa-ban"></i> VOIDED</span>' : '<a class="rcpt-link" href="?account=' + selectedId + '&receipt=' + tx.transaction_id + (searchQ ? '&q=' + encodeURIComponent(searchQ) : '') + '" title="View receipt"><i class="fas fa-receipt"></i></a>' + (adminRole >= 3 && ['deposit','withdrawal','loan_payment','interest','interest_credit','auto_save','fee'].includes(tx.type) ? ' <button class="btn btn-outline btn-xs" style="color:#dc2626;padding:2px 6px;font-size:10px" onclick="openVoidModal(\'' + tx.transaction_id + '\',\'' + tx.type.replace(/_/g,' ') + '\',\'' + Number(tx.amount).toFixed(2) + '\')"><i class="fas fa-ban"></i> Void</button>' : '')) + '</td></tr>';
          }).join('') + '</table>'}
      </div>
    </div>

  </div>
  `}

  <!-- Void Transaction Modal -->
  <div id="voidModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999;align-items:center;justify-content:center">
    <div style="background:var(--card);border-radius:12px;padding:24px;max-width:480px;width:90%;border:2px solid #dc2626">
      <h3 style="color:#dc2626;margin-bottom:12px"><i class="fas fa-ban"></i> Void Transaction</h3>
      <div style="background:#fef2f2;padding:12px;border-radius:8px;margin-bottom:16px">
        <div style="font-size:13px"><b>Transaction:</b> <span id="voidTxType"></span></div>
        <div style="font-size:13px"><b>Amount:</b> &#x20B1; <span id="voidTxAmount"></span></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">This will reverse the transaction, post reversing GL entries, and update the account balance.</div>
      </div>
      <form method="post" action="/admin/teller/void/PLACEHOLDER" id="voidForm">
        <div class="field" style="margin-bottom:12px">
          <label style="font-weight:600;display:block;margin-bottom:4px">Reason for void <span style="color:#dc2626">*</span></label>
          <textarea name="reason" id="voidReason" required minlength="5" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;min-height:60px" placeholder="Explain why this transaction is being voided (min 5 characters)"></textarea>
        </div>
        <div class="field" style="margin-bottom:16px">
          <label style="font-weight:600;display:block;margin-bottom:4px">Your password <span style="color:#dc2626">*</span></label>
          <input type="password" name="password" id="voidPassword" required style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px" placeholder="Enter your admin password to authorize">
        </div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-danger" style="flex:1"><i class="fas fa-ban"></i> Confirm Void</button>
          <button type="button" class="btn btn-cancel" onclick="closeVoidModal()">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <script>
  function openVoidModal(txId, type, amount) {
    document.getElementById('voidTxType').textContent = type;
    document.getElementById('voidTxAmount').textContent = amount;
    document.getElementById('voidForm').action = '/admin/teller/void/' + txId;
    document.getElementById('voidReason').value = '';
    document.getElementById('voidPassword').value = '';
    document.getElementById('voidModal').style.display = 'flex';
  }
  function closeVoidModal() {
    document.getElementById('voidModal').style.display = 'none';
  }
  document.getElementById('voidModal').addEventListener('click', function(e) {
    if (e.target === this) closeVoidModal();
  });
  </script>
  `;

  var toastHtml = toast ? '<div class="toast ' + (toast.startsWith('error:') ? 'error' : 'success') + '">' + (toast.startsWith('error:') ? '&#x274C; ' + toast.slice(6) : '&#x2705; ' + toast.slice(8)) + '</div>' : '';
  const tellerContent = toastHtml + bankContent;

  res.type('html').send(layout('Teller Counter', 'teller', tellerContent, { toast: toast || undefined }));
}));

router.post('/teller/deposit/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/teller?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/teller?error=Account+not+found');
    const newBalance = Number(account.actual_balance) + val;

    // Post GL FIRST — if this fails, nothing changes
    const gl = require('../services/gl');
    const audit = require('../services/audit');
    const glTxId = uuidv4();
    await gl.postDoubleEntry(glTxId, [
      { account_code: '1000', debit: val, description: 'Counter deposit: ' + account.child_name },
      { account_code: '2000', credit: val, description: 'Counter deposit: ' + account.child_name },
    ], { postedBy: req.session.adminName || 'admin', referenceType: 'teller', referenceNumber: glTxId });

    // Now update account and create transaction
    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=unallocated_balance+$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, val, req.params.id]);
    const result = await store.addTransaction({
      account_id: req.params.id,
      type: 'deposit',
      amount: val,
      description: description || 'Counter deposit',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const txId = result?.transaction_id || '';
    // Link GL entry to actual transaction
    await store.query('UPDATE gl_entries SET transaction_id = $1 WHERE entry_id = $2', [txId, glTxId]).catch(() => {});
    await audit.log(req, 'TELLER_DEPOSIT', 'account', req.params.id, { amount: val, txId, desc: description || 'Counter deposit' });
    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?deposited=ok&receipt=${txId}&account=${req.params.id}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/teller/withdraw/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/teller?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/teller?error=Account+not+found');
    if (Number(account.actual_balance) < val) return res.redirect('/admin/teller?error=Insufficient+balance');
    const maintainingBalance = Number(account.maintaining_balance || 0);
    if (Number(account.actual_balance) - val < maintainingBalance) {
      return res.redirect(`/admin/teller?error=Cannot+withdraw+below+maintaining+balance+of+%E2%82%B1${maintainingBalance.toFixed(2)}`);
    }
    const newBalance = Math.round((Number(account.actual_balance) - val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) - val) * 100) / 100;

    // Post GL FIRST
    const gl = require('../services/gl');
    const audit = require('../services/audit');
    const glTxId = uuidv4();
    await gl.postDoubleEntry(glTxId, [
      { account_code: '2000', debit: val, description: 'Counter withdrawal: ' + account.child_name },
      { account_code: '1000', credit: val, description: 'Counter withdrawal: ' + account.child_name },
    ], { postedBy: req.session.adminName || 'admin', referenceType: 'teller', referenceNumber: glTxId });

    // Then update account and create transaction
    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, Math.max(0, newUnallocated), req.params.id]);
    const result = await store.addTransaction({
      account_id: req.params.id,
      type: 'withdrawal',
      amount: val,
      description: description || 'Counter withdrawal',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const txId = result?.transaction_id || '';
    await store.query('UPDATE gl_entries SET transaction_id = $1 WHERE entry_id = $2', [txId, glTxId]).catch(() => {});
    await audit.log(req, 'TELLER_WITHDRAWAL', 'account', req.params.id, { amount: val, txId, desc: description || 'Counter withdrawal' });
    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?withdrawn=ok&receipt=${txId}&account=${req.params.id}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/teller/loan-pay/:id', requireRole(2), asyncHandler(async (req, res) => {
  try {
    const { loan_id, amount } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/teller?error=Invalid+amount');
    const accountId = req.params.id;

    const loan = await one('SELECT * FROM loans WHERE loan_id = $1', [loan_id]);
    if (!loan) return res.redirect(`/admin/teller?error=Loan+not+found&account=${accountId}`);
    if (loan.status !== 'active') return res.redirect(`/admin/teller?error=Loan+is+not+active&account=${accountId}`);

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [accountId]);
    if (!account) return res.redirect(`/admin/teller?error=Account+not+found&account=${accountId}`);

    // Calculate interest portion
    const interestService = require('../services/interest');
    const schedule = interestService.generateAmortizationSchedule(
      loan.principal, loan.interest_rate, loan.term_months, loan.interest_type
    );
    const paymentsMade = await one('SELECT COUNT(*) as cnt FROM loan_payments WHERE loan_id = $1', [loan_id]);
    const paymentNum = (paymentsMade?.cnt || 0) + 1;
    const scheduleEntry = schedule[paymentNum - 1] || schedule[schedule.length - 1];

    const interestPortion = Math.min(scheduleEntry?.interestPortion || 0, val);
    const principalPortion = val - interestPortion;
    const newAmountPaid = Math.round((loan.amount_paid + val) * 100) / 100;
    const newRemainingBalance = Math.max(0, Math.round((loan.remaining_balance - val) * 100) / 100);
    const newStatus = newRemainingBalance <= 0 ? 'paid' : 'active';

    // Post GL FIRST
    const gl = require('../services/gl');
    const audit = require('../services/audit');
    const glTxId = uuidv4();
    const entries = [
      { account_code: '1000', debit: val, description: 'Loan payment: ' + (loan.purpose || 'Loan') },
      { account_code: '1100', credit: principalPortion, description: 'Principal repayment' },
    ];
    if (interestPortion > 0) {
      entries.push({ account_code: '4000', credit: interestPortion, description: 'Interest income' });
    }
    await gl.postDoubleEntry(glTxId, entries, { postedBy: req.session.adminName || 'admin', referenceType: 'teller', referenceNumber: glTxId });

    // Record loan payment
    await store.addLoanPayment({
      loan_id: loan.loan_id,
      amount: val,
      principal_paid: principalPortion,
      interest_paid: interestPortion,
      balance_before: loan.remaining_balance,
      balance_after: newRemainingBalance,
      due_date: null,
    });

    // Update loan
    await store.query("UPDATE loans SET amount_paid = $1, remaining_balance = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE loan_id = $4", [newAmountPaid, newRemainingBalance, newStatus, loan_id]);

    // Record transaction
    const txResult = await store.addTransaction({
      account_id: accountId,
      type: 'loan_payment',
      amount: val,
      description: 'Loan payment (counter): ' + (loan.purpose || 'Loan'),
      reference_type: 'loan',
      reference_id: loan.loan_id,
      balance_before: Number(account.actual_balance),
      balance_after: Number(account.actual_balance),
    });
    const txId = txResult?.transaction_id || '';
    await store.query('UPDATE gl_entries SET transaction_id = $1 WHERE entry_id = $2', [txId, glTxId]).catch(() => {});
    await audit.log(req, 'TELLER_LOAN_PAYMENT', 'loan', loan_id, { amount: val, principalPortion, interestPortion, txId });
    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?loanpaid=ok&receipt=${txId}&account=${accountId}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Transaction Void / Reversal (Banking-Grade) ──

const VOIDABLE_TYPES = ['deposit', 'withdrawal', 'loan_payment', 'interest', 'interest_credit', 'auto_save', 'fee'];

router.post('/teller/void/:txId', requireRole(3), asyncHandler(async (req, res) => {
  try {
    const txId = req.params.txId;
    const { reason, password } = req.body;
    if (!reason || reason.trim().length < 5) return res.redirect('/admin/teller?error=Void+reason+must+be+at+least+5+characters');
    if (!password) return res.redirect('/admin/teller?error=Password+required');

    // Verify admin password
    const admin = await one('SELECT * FROM admin_users WHERE admin_id = $1', [req.session.adminId]);
    if (!admin) return res.redirect('/admin/teller?error=Admin+not+found');
    const bcrypt = require('bcryptjs');
    if (!bcrypt.compareSync(password, admin.password_hash)) return res.redirect('/admin/teller?error=Invalid+password');

    // Fetch original transaction
    const tx = await one('SELECT * FROM transactions WHERE transaction_id = $1', [txId]);
    if (!tx) return res.redirect('/admin/teller?error=Transaction+not+found');

    // Validate not already voided
    if (tx.voided_at) return res.redirect('/admin/teller?error=Transaction+already+voided');

    // Validate voidable type
    if (!VOIDABLE_TYPES.includes(tx.type)) return res.redirect('/admin/teller?error=Cannot+void+'+ tx.type + '+transactions');

    // Check age limit (30 days)
    const txDate = new Date(tx.created_at);
    const daysSince = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) return res.redirect('/admin/teller?error=Cannot+void+transactions+older+than+30+days');

    // Fetch account
    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [tx.account_id]);
    if (!account) return res.redirect('/admin/teller?error=Account+not+found');

    const val = Number(tx.amount);
    const now = new Date().toISOString();
    const voidDesc = 'VOID: ' + (tx.description || '') + ' — ' + reason;

    // Determine reversal effect on balance
    let reversedBalance = Number(account.actual_balance);
    if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
      // Original added to balance — subtract to reverse
      reversedBalance = Math.round((reversedBalance - val) * 100) / 100;
    } else if (['withdrawal', 'loan_payment', 'fee', 'auto_save'].includes(tx.type)) {
      // Original subtracted from balance — add back to reverse
      reversedBalance = Math.round((reversedBalance + val) * 100) / 100;
    }
    if (reversedBalance < 0) return res.redirect('/admin/teller?error=Void+would+cause+negative+balance');

    // ── Post reversing GL entries FIRST ──
    const gl = require('../services/gl');
    const glTxId = uuidv4();
    if (tx.type === 'deposit' || tx.type === 'interest_credit' || tx.type === 'loan_disbursement') {
      await gl.postDoubleEntry(glTxId, [
        { account_code: '2000', debit: val, description: 'VOID reversal: ' + voidDesc },
        { account_code: '1000', credit: val, description: 'VOID reversal: ' + voidDesc },
      ], { postedBy: req.session.adminName || 'admin', referenceType: 'void' });
    } else if (tx.type === 'withdrawal' || tx.type === 'fee' || tx.type === 'auto_save') {
      await gl.postDoubleEntry(glTxId, [
        { account_code: '1000', debit: val, description: 'VOID reversal: ' + voidDesc },
        { account_code: '2000', credit: val, description: 'VOID reversal: ' + voidDesc },
      ], { postedBy: req.session.adminName || 'admin', referenceType: 'void' });
    } else if (tx.type === 'loan_payment') {
      // Reverse loan payment: debit Loans Receivable, credit Cash, debit Interest Income
      const loanPayments = await store.query('SELECT * FROM loan_payments WHERE transaction_id = $1 ORDER BY created_at DESC LIMIT 1', [txId]);
      const lp = loanPayments.rows[0];
      const principalPortion = lp ? Number(lp.principal_paid) : val;
      const interestPortion = lp ? Number(lp.interest_paid) : 0;
      const entries = [
        { account_code: '1100', debit: principalPortion, description: 'VOID reversal: principal' },
        { account_code: '1000', credit: val, description: 'VOID reversal: ' + voidDesc },
      ];
      if (interestPortion > 0) {
        entries.push({ account_code: '4000', debit: interestPortion, description: 'VOID reversal: interest income' });
      }
    await gl.postDoubleEntry(glTxId, entries, { postedBy: req.session.adminName || 'admin', referenceType: 'void' });

      // Restore the loan balance
      const loan = await one('SELECT * FROM loans WHERE loan_id = $1', [tx.reference_id]);
      if (loan) {
        const restoredAmountPaid = Math.max(0, Math.round((Number(loan.amount_paid) - val) * 100) / 100);
        const restoredRemaining = Math.round((Number(loan.remaining_balance) + val) * 100) / 100;
        const restoredStatus = 'active';
        await store.query("UPDATE loans SET amount_paid = $1, remaining_balance = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE loan_id = $4",
          [restoredAmountPaid, restoredRemaining, restoredStatus, loan.loan_id]);
      }
    }

    // ── Update account balance ──
    if (tx.type !== 'loan_payment') {
      if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
        // Reverse: deduction from savings
        const newUnallocated = Math.max(0, Number(account.unallocated_balance) - val);
        await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3",
          [reversedBalance, newUnallocated, tx.account_id]);
      } else {
        // Reverse: add back
        const newUnallocated = Number(account.unallocated_balance) + val;
        await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3",
          [reversedBalance, newUnallocated, tx.account_id]);
      }
    }

    // ── Create reversal transaction ──
    const revResult = await store.addTransaction({
      account_id: tx.account_id,
      type: 'void',
      amount: val,
      description: voidDesc,
      reference_type: 'void',
      reference_id: txId,
      balance_before: tx.type === 'loan_payment' ? Number(account.actual_balance) : Number(account.actual_balance),
      balance_after: tx.type === 'loan_payment' ? Number(account.actual_balance) : reversedBalance,
    });
    const revTxId = revResult?.transaction_id || '';
    await store.query('UPDATE gl_entries SET transaction_id = $1 WHERE entry_id = $2', [revTxId, glTxId]).catch(() => {});

    // ── Mark original as voided ──
    await store.query(
      "UPDATE transactions SET voided_by=$1, void_reason=$2, voided_at=$3 WHERE transaction_id=$4",
      [req.session.adminName || 'admin', reason, now, txId]
    );

    // ── Audit log ──
    const audit = require('../services/audit');
    await audit.log(req, 'TRANSACTION_VOID', 'transaction', txId, {
      amount: val, reason, reversalTxId: revTxId, originalType: tx.type,
      reversedBalance, voidedBy: req.session.adminName || 'admin'
    });

    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?voided=ok&receipt=${revTxId}&account=${tx.account_id}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Audit Reports ──

router.get('/audit', requireRole(1), asyncHandler(async (req, res) => {

  const q = req.query;
  const fromDate = q.from || '';
  const toDate = q.to || '';
  const filterAccount = q.account || '';
  const filterType = q.type || '';
  const accounts = await sql('SELECT account_id, child_name, member_id FROM accounts ORDER BY child_name ASC');

  let where = [];
  let params = [];
  let p = 1;
  if (fromDate) { where.push('t.created_at >= $' + p++); params.push(fromDate + ' 00:00:00'); }
  if (toDate) { where.push('t.created_at <= $' + p++); params.push(toDate + ' 23:59:59'); }
  if (filterAccount) { where.push('t.account_id = $' + p++); params.push(filterAccount); }
  if (filterType) { where.push('t.type = $' + p++); params.push(filterType); }
  where.push("t.type NOT IN ('allocation','transfer')");
  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Stats
  const stats = await one(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN t.type IN ('deposit','loan_disbursement','interest_credit','interest') THEN t.amount ELSE 0 END) as credits,
      SUM(CASE WHEN t.type IN ('withdrawal','loan_payment') THEN t.amount ELSE 0 END) as debits,
      SUM(CASE WHEN t.type='deposit' THEN t.amount ELSE 0 END) as total_deposits,
      SUM(CASE WHEN t.type='withdrawal' THEN t.amount ELSE 0 END) as total_withdrawals,
      SUM(CASE WHEN t.type='loan_disbursement' THEN t.amount ELSE 0 END) as total_loans,
      SUM(CASE WHEN t.type='loan_payment' THEN t.amount ELSE 0 END) as total_loan_payments,
      SUM(CASE WHEN t.type LIKE 'interest%' THEN t.amount ELSE 0 END) as total_interest
    FROM transactions t ${wc}
  `, params);

  const txns = await sql(`
    SELECT t.*, a.child_name, a.member_id FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.account_id
    ${wc} ORDER BY t.created_at DESC LIMIT 500
  `, params);

  const csvParams = Object.keys(q).filter(k => k !== 'export').map(k => k + '=' + encodeURIComponent(q[k])).join('&');
  const csvLink = '/admin/audit/csv?' + csvParams;

  const typeOpts = ['deposit','withdrawal','loan_disbursement','loan_payment','interest_credit','interest'];
  const typeSummary = txns.reduce((acc, t) => { acc[t.type] = (acc[t.type]||0) + 1; return acc; }, {});
  const summaryStr = Object.keys(typeSummary).map(k => k + ': ' + typeSummary[k]).join(' &middot; ');

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4CA;</div><div class="stat-value">${stats.total||0}</div><div class="stat-label">Total Transactions</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:#16a34a">&#x2B06;</div><div class="stat-value" style="color:#16a34a">&#x20B1;${Number(stats.credits||0).toFixed(2)}</div><div class="stat-label">Total Credits (In)</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:#dc2626">&#x2B07;</div><div class="stat-value" style="color:#dc2626">&#x20B1;${Number(stats.debits||0).toFixed(2)}</div><div class="stat-label">Total Debits (Out)</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:#2563eb">&#x1F4B0;</div><div class="stat-value" style="color:#2563eb">&#x20B1;${Number((stats.credits||0)-(stats.debits||0)).toFixed(2)}</div><div class="stat-label">Net Cash Flow</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B5;</div><div class="stat-value">&#x20B1;${Number(stats.total_deposits||0).toFixed(2)}</div><div class="stat-label">Deposits</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B8;</div><div class="stat-value">&#x20B1;${Number(stats.total_withdrawals||0).toFixed(2)}</div><div class="stat-label">Withdrawals</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F3E6;</div><div class="stat-value">&#x20B1;${Number(stats.total_loans||0).toFixed(2)}</div><div class="stat-label">Loans Disbursed</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value">&#x20B1;${Number(stats.total_loan_payments||0).toFixed(2)}</div><div class="stat-label">Loan Payments</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F50D; Filter Transactions</h3></div>
    <div class="card-body-padded">
      <form method="get" action="/admin/audit" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
        <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">From</label><input type="date" name="from" value="${fromDate}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
        <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">To</label><input type="date" name="to" value="${toDate}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
        <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">Account</label>
          <select name="account" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            <option value="">All</option>
            ${accounts.map(a => '<option value="' + a.account_id + '"' + (a.account_id===filterAccount?' selected':'') + '>' + a.child_name + ' (' + (a.member_id||'') + ')</option>').join('')}
          </select>
        </div>
        <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">Type</label>
          <select name="type" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            <option value="">All</option>
            ${typeOpts.map(t => '<option value="' + t + '"' + (t===filterType?' selected':'') + '>' + t.replace(/_/g,' ') + '</option>').join('')}
          </select>
        </div>
        <div><button type="submit" class="btn btn-primary btn-sm">&#x1F50D; Filter</button> <a href="/admin/audit" class="btn btn-outline btn-sm">&#x1F504; Reset</a> <a href="${csvLink}" class="btn btn-outline btn-sm">&#x1F4E5; Export CSV</a></div>
      </form>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3>&#x1F4CB; Transaction Register</h3>
      <span class="count">${txns.length} entries ${summaryStr ? '&middot; ' + summaryStr : ''}</span>
    </div>
    <div class="card-body">
      ${txns.length === 0 ? '<div style="text-align:center;padding:48px;color:var(--text-muted)">No transactions found for the selected filters.</div>' : '<table><tr><th>Receipt #</th><th>Date &amp; Time</th><th>Member</th><th>ID</th><th>Type</th><th>Amount</th><th>Balance Delta</th><th>Description</th><th>Ref</th></tr>' + txns.map(t => {
        const sign = (t.type==='deposit'||t.type==='loan_disbursement'||t.type==='interest_credit'||t.type==='interest') ? '+' : '-';
        const col = (t.type==='deposit'||t.type==='loan_disbursement'||t.type==='interest_credit'||t.type==='interest') ? '#16a34a' : '#dc2626';
        const delta = t.balance_before != null ? '<span style="color:' + col + '">' + sign + '&#x20B1;' + Number(t.amount).toFixed(2) + '</span>' : '-';
        const bg = ({deposit:'badge-green',withdrawal:'badge-red',loan_disbursement:'badge-amber',loan_payment:'badge-blue',interest_credit:'badge-purple',interest:'badge-purple',allocation:'badge-gray'})[t.type] || 'badge-gray';
        return '<tr><td class="mono"><a href="/admin/teller?account=' + t.account_id + '&receipt=' + t.transaction_id + '" style="color:var(--accent);text-decoration:none">' + (t.transaction_id||'').slice(0,8).toUpperCase() + '</a></td><td class="mono" style="font-size:11px">' + (t.created_at||'').slice(0,19).replace('T',' ') + '</td><td>' + (t.child_name||'') + '</td><td class="mono" style="font-size:11px;color:var(--text-muted)">' + (t.member_id||'-') + '</td><td><span class="badge ' + bg + '">' + t.type.replace(/_/g,' ') + '</span></td><td class="num mono" style="color:' + col + '">' + sign + '&#x20B1;' + Number(t.amount).toFixed(2) + '</td><td class="num mono">' + delta + '</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">' + (t.description||'-') + '</td><td class="mono" style="font-size:11px;color:var(--text-muted)">' + (t.reference_id ? (t.reference_type||'') + ':' + (t.reference_id||'').slice(0,8) : '-') + '</td></tr>';
      }).join('') + '</table>'}
    </div>
  </div>`;

  res.type('html').send(layout('Audit Reports', 'audit', content, { subtitle: 'Compliance-ready transaction register with date range filtering' }));
}));

// ── Audit CSV Export ──

router.get('/audit/csv', requireRole(1), asyncHandler(async (req, res) => {

  const q = req.query;
  let where = [];
  let params = [];
  let p = 1;
  if (q.from) { where.push('t.created_at >= $' + p++); params.push(q.from + ' 00:00:00'); }
  if (q.to) { where.push('t.created_at <= $' + p++); params.push(q.to + ' 23:59:59'); }
  if (q.account) { where.push('t.account_id = $' + p++); params.push(q.account); }
  if (q.type) { where.push('t.type = $' + p++); params.push(q.type); }
  where.push("t.type NOT IN ('allocation','transfer')");
  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = await sql(`
    SELECT t.transaction_id, t.created_at, a.child_name, a.member_id, t.type, t.amount,
      t.balance_before, t.balance_after, t.description, t.reference_type, t.reference_id
    FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id
    ${wc} ORDER BY t.created_at DESC
  `, params);

  let csv = 'TRN#,Date & Time,Member Name,Member ID,Type,Amount,Balance Before,Balance After,Description,Ext. Ref\n';
  csv += rows.map(r => {
    const trn = fmtTrn(r, r.transaction_id);
    return [
      trn,
      r.created_at,
      '"' + (r.child_name||'').replace(/"/g,'""') + '"',
      r.member_id||'',
      r.type,
      r.amount,
      r.balance_before||'',
      r.balance_after||'',
      '"' + (r.description||'').replace(/"/g,'""') + '"',
      (r.reference_type||'') + ':' + (r.reference_id||'')
    ].join(',');
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="labcoop_audit_' + new Date().toISOString().slice(0,10) + '.csv"');
  res.send(csv);
}));

// ── MBwin-Style Advanced Reports ──

// ── 1. Loan Aging Report ──
router.get('/reports/loan-aging', requireRole(2), asyncHandler(async (req, res) => {
  const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
  const loans = await store.query(`
    SELECT l.*, a.child_name, a.member_id
    FROM loans l JOIN accounts a ON l.account_id = a.account_id
    WHERE l.status = 'active' OR l.status = 'overdue'
    ORDER BY l.due_date ASC
  `);
  let today = new Date(asOf);
  let totalPortfolio = 0, totalPrincipal = 0, totalInterest = 0;
  const agingBuckets = [
    { label: 'Current', range: [0, 0], icon: 'fa-check-circle', color: '#16a34a', loans: [], total: 0 },
    { label: '1-30 Days', range: [1, 30], icon: 'fa-exclamation-triangle', color: '#f59e0b', loans: [], total: 0 },
    { label: '31-60 Days', range: [31, 60], icon: 'fa-exclamation-circle', color: '#f97316', loans: [], total: 0 },
    { label: '61-90 Days', range: [61, 90], icon: 'fa-times-circle', color: '#ef4444', loans: [], total: 0 },
    { label: '91-120 Days', range: [91, 120], icon: 'fa-skull', color: '#dc2626', loans: [], total: 0 },
    { label: '120+ Days', range: [121, 9999], icon: 'fa-biohazard', color: '#7c3aed', loans: [], total: 0 },
  ];
  loans.rows.forEach(l => {
    const due = new Date(l.due_date);
    const daysOverdue = Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)));
    const principal = parseFloat(l.amount) || 0;
    const interest = parseFloat(l.interest) || 0;
    totalPortfolio += principal + interest;
    totalPrincipal += principal;
    totalInterest += interest;
    let bucket = agingBuckets.find(b => daysOverdue >= b.range[0] && daysOverdue <= b.range[1]);
    if (!bucket) bucket = agingBuckets[agingBuckets.length - 1];
    bucket.loans.push({ ...l, daysOverdue, principal, interest });
    bucket.total += principal + interest;
  });
  const provisionRate = [0, 0.02, 0.05, 0.10, 0.20, 0.50];
  let totalProvision = 0;
  agingBuckets.forEach((b, i) => {
    b.provision = b.total * provisionRate[i];
    totalProvision += b.provision;
  });
  const chartData = agingBuckets.map(b => ({ label: b.label, total: b.total, color: b.color }));
  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 200px"><label>As of Date</label>
        <input type="date" id="agingAsOf" value="${asOf}" onchange="location.href='/admin/reports/loan-aging?as_of='+this.value">
      </div>
      <div style="flex:1;text-align:right">
        <a href="/admin/reports/loan-aging?as_of=${asOf}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> Export CSV</a>
        <a href="/admin/reports/loan-aging?as_of=${asOf}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
      </div>
    </div>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-sack-dollar"></i></div><div class="stat-value">${fmt(totalPortfolio)}</div><div class="stat-label">Portfolio at Risk</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-value">${fmt(totalPrincipal)}</div><div class="stat-label">Total Principal</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-value">${(totalPrincipal ? ((totalPortfolio - totalPrincipal) / totalPrincipal * 100).toFixed(2) : 0)}%</div><div class="stat-label">Interest Ratio</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-shield-halved"></i></div><div class="stat-value">${fmt(totalProvision)}</div><div class="stat-label">Required Provision</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-chart-pie"></i> Aging Distribution</h3></div>
    <div class="card-body"><canvas id="agingPieChart" height="120"></canvas></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-table"></i> Aging Summary</h3><span class="count">${loans.rows.length} loans</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Aging Bucket</th><th>Loan Count</th><th>Total Amount</th><th>% of Portfolio</th><th>Provision Rate</th><th>Provision Amount</th></tr>
      ${agingBuckets.map((b, i) => `
      <tr ${i === 0 ? '' : 'style="border-top:2px solid var(--border)"'}>
        <td><span style="display:inline-flex;align-items:center;gap:8px;font-weight:600"><i class="fas ${b.icon}" style="color:${b.color}"></i> ${b.label}</span></td>
        <td><b>${b.loans.length}</b></td>
        <td class="mono">${fmt(b.total)}</td>
        <td>${totalPortfolio ? (b.total / totalPortfolio * 100).toFixed(1) : 0}%</td>
        <td>${(provisionRate[i] * 100).toFixed(0)}%</td>
        <td class="mono" style="color:${b.provision > 0 ? '#dc2626' : '#16a34a'}">${fmt(b.provision)}</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--bg-muted)">
        <td>TOTAL</td><td>${loans.rows.length}</td>
        <td class="mono">${fmt(totalPortfolio)}</td><td>100%</td><td></td>
        <td class="mono" style="color:#dc2626">${fmt(totalProvision)}</td>
      </tr>
    </table></div>
  </div>
  ${agingBuckets.slice(1).filter(b => b.loans.length > 0).map(b => `
  <div class="card">
    <div class="card-header"><h3><i class="fas ${b.icon}" style="color:${b.color}"></i> ${b.label} Overdue — ${b.loans.length} loans</h3><span class="count">${fmt(b.total)}</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Member</th><th>Loan ID</th><th>Principal</th><th>Interest</th><th>Due Date</th><th>Days Overdue</th><th>Balance</th></tr>
      ${b.loans.map(l => `
      <tr>
        <td><b>${l.child_name || 'Unknown'}</b><br><span class="mono" style="font-size:11px;color:var(--text-muted)">${l.member_id || ''}</span></td>
        <td class="mono" style="font-size:11px">${l.id?.slice(0,8)||''}</td>
        <td class="mono">${fmt(l.principal)}</td>
        <td class="mono">${fmt(l.interest)}</td>
        <td class="mono">${(l.due_date||'').slice(0,10)}</td>
        <td><span class="badge ${l.daysOverdue > 90 ? 'badge-red' : l.daysOverdue > 30 ? 'badge-orange' : 'badge-yellow'}">${l.daysOverdue} days</span></td>
        <td class="mono" style="font-weight:600">${fmt(l.principal + l.interest)}</td>
      </tr>`).join('')}
    </table></div>
  </div>`).join('')}
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-file-export"></i> Export Options</h3></div>
    <div class="card-body-padded" style="display:flex;gap:12px">
      <a href="/admin/reports/loan-aging?as_of=${asOf}&export=csv" class="btn btn-outline"><i class="fas fa-file-csv"></i> Download CSV</a>
      <button class="btn btn-outline" onclick="window.open('/admin/reports/loan-aging?as_of=${asOf}&print=1')"><i class="fas fa-print"></i> Print View</button>
    </div>
  </div>
  <script>
  new Chart(document.getElementById('agingPieChart'), {
    type: 'doughnut',
    data: { labels: ${JSON.stringify(chartData.map(d => d.label))}, datasets: [{ data: ${JSON.stringify(chartData.map(d => d.total))}, backgroundColor: ${JSON.stringify(chartData.map(d => d.color))} }] },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#fff', font: { size: 11 } } } } }
  });
  </script>`;
  if (req.query.export === 'csv') {
    let csv = 'Aging Bucket,Loan Count,Total Amount,% of Portfolio,Provision Rate,Provision Amount\n';
    agingBuckets.forEach((b, i) => {
      csv += `"${b.label}",${b.loans.length},${b.total.toFixed(2)},${totalPortfolio ? (b.total/totalPortfolio*100).toFixed(1) : 0},"${(provisionRate[i]*100).toFixed(0)}%",${b.provision.toFixed(2)}\n`;
    });
    csv += `"TOTAL",${loans.rows.length},${totalPortfolio.toFixed(2)},100%,"",${totalProvision.toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="loan_aging_' + asOf + '.csv"');
    return res.send(csv);
  }
  if (req.query.print) return res.type('html').send(printLayout('Loan Aging Report', content, { subtitle: 'As of ' + asOf }));
  res.type('html').send(layout('Loan Aging Report', 'loan-aging', content, { subtitle: 'As of ' + asOf }));
}));

// ── 2. Daily Collection Report ──
router.get('/reports/daily-collection', requireRole(2), asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { rows } = await store.query(`
    SELECT t.*, a.child_name as child_name, a.member_id
    FROM transactions t
    JOIN accounts a ON t.account_id = a.account_id
    WHERE t.type IN ('deposit','loan_payment','interest_income','penalty')
      AND DATE(t.created_at) = $1
    ORDER BY t.created_at ASC
  `, [date]);
  const summary = { deposit: 0, loan_payment: 0, interest_income: 0, penalty: 0, count: 0 };
  rows.forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    if (summary[r.type] !== undefined) summary[r.type] += amt;
    summary.count++;
  });
  summary.total = summary.deposit + summary.loan_payment + summary.interest_income + summary.penalty;
  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 200px"><label>Collection Date</label>
        <input type="date" id="collDate" value="${date}" onchange="location.href='/admin/reports/daily-collection?date='+this.value">
      </div>
      <div style="flex:1;text-align:right">
        <a href="/admin/reports/daily-collection?date=${date}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> Export CSV</a>
        <a href="/admin/reports/daily-collection?date=${date}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
      </div>
    </div>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-value">${fmt(summary.total)}</div><div class="stat-label">Total Collections</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-piggy-bank"></i></div><div class="stat-value">${fmt(summary.deposit)}</div><div class="stat-label">Deposits</div></div>
    <div class="stat-card" style="border-left:4px solid #3b82f6"><div class="stat-icon"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-value">${fmt(summary.loan_payment)}</div><div class="stat-label">Loan Payments</div></div>
    <div class="stat-card" style="border-left:4px solid #f59e0b"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-value">${fmt(summary.interest_income)}</div><div class="stat-label">Interest Income</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-value">${fmt(summary.penalty)}</div><div class="stat-label">Penalties</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="stat-value">${summary.count}</div><div class="stat-label">Transactions</div></div>
  </div>
  ${summary.count > 0 ? `
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-list"></i> Transaction Details</h3><span class="count">${summary.count} entries</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Time</th><th>Member</th><th>TRN#</th><th>Type</th><th>Amount</th><th>Ext. Ref</th><th>Description</th></tr>
      ${rows.map(r => `
      <tr>
        <td class="mono" style="font-size:11px">${(r.created_at||'').slice(11,19)}</td>
        <td><b>${r.child_name || 'Unknown'}</b><br><span style="font-size:11px;color:var(--text-muted)">${r.member_id || ''}</span></td>
        <td class="mono" style="font-size:11px;font-weight:600">${fmtTrn(r)}</td>
        <td><span class="badge ${r.type === 'deposit' ? 'badge-green' : r.type === 'loan_payment' ? 'badge-blue' : r.type === 'interest_income' ? 'badge-yellow' : 'badge-red'}">${r.type.replace(/_/g,' ')}</span></td>
        <td class="mono" style="font-weight:600">${fmt(r.amount)}</td>
        <td class="mono" style="font-size:10px;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.reference_id || '-'}</td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.description || ''}</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--bg-muted)">
        <td colspan="4">TOTAL</td><td class="mono">${fmt(summary.total)}</td><td colspan="2"></td>
      </tr>
    </table></div>
  </div>` : '<div class="card"><div class="card-body-padded" style="text-align:center;color:var(--text-muted);padding:40px"><i class="fas fa-inbox" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i> No collections recorded for this date.</div></div>'}
  <div class="stats-grid" style="grid-template-columns:1fr 1fr">
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-chart-pie"></i> Collection Mix</h3></div>
      <div class="card-body"><canvas id="collPieChart" height="120"></canvas></div>
    </div>
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-chart-bar"></i> Breakdown</h3></div>
      <div class="card-body"><canvas id="collBarChart" height="120"></canvas></div>
    </div>
  </div>
  <script>
  new Chart(document.getElementById('collPieChart'), {
    type: 'doughnut',
    data: { labels: ['Deposits','Loan Payments','Interest','Penalties'], datasets: [{ data: [${summary.deposit},${summary.loan_payment},${summary.interest_income},${summary.penalty}], backgroundColor: ['#16a34a','#3b82f6','#f59e0b','#ef4444'] }] },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#fff', font: { size: 11 } } } } }
  });
  new Chart(document.getElementById('collBarChart'), {
    type: 'bar',
    data: { labels: ['Deposits','Loan Payments','Interest','Penalties'], datasets: [{ label: 'Amount', data: [${summary.deposit},${summary.loan_payment},${summary.interest_income},${summary.penalty}], backgroundColor: ['#16a34a','#3b82f6','#f59e0b','#ef4444'] }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '₱'+v.toLocaleString() } } } }
  });
  </script>`;
  if (req.query.export === 'csv') {
    let csv = 'TRN#,Time,Member,Type,Amount,Ext. Ref,Description\n';
    rows.forEach(r => {
      csv += `"${fmtTrn(r)}","${r.created_at}","${r.child_name||''}",${r.type},${r.amount},"${r.reference_id||''}","${(r.description||'').replace(/"/g,'""')}"\n`;
    });
    csv += `"TOTAL","","",,${summary.total},"",""\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="daily_collection_' + date + '.csv"');
    return res.send(csv);
  }
  if (req.query.print) return res.type('html').send(printLayout('Daily Collection Report', content, { subtitle: date }));
  res.type('html').send(layout('Daily Collection Report', 'daily-collection', content, { subtitle: date }));
}));

// ── 3. Deposit Summary Report ──
router.get('/reports/deposit-summary', requireRole(2), asyncHandler(async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const { rows } = await store.query(`
    SELECT DATE(created_at) as d, COUNT(*) as cnt, SUM(CAST(amount AS DECIMAL(20,2))) as total
    FROM transactions WHERE type = 'deposit' AND DATE(created_at) >= $1 AND DATE(created_at) <= $2
    GROUP BY DATE(created_at) ORDER BY d ASC
  `, [from, to]);
  const totalDeposits = rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
  const totalCount = rows.reduce((s, r) => s + parseInt(r.cnt || 0), 0);
  const avgPerDay = rows.length ? totalDeposits / rows.length : 0;
  const fmtDate = d => d instanceof Date ? d.toISOString().slice(0,10) : String(d || '').slice(0,10);
  const labels = JSON.stringify(rows.map(r => fmtDate(r.d).slice(5)));
  const values = JSON.stringify(rows.map(r => parseFloat(r.total || 0)));
  const counts = JSON.stringify(rows.map(r => parseInt(r.cnt || 0)));
  // Top depositors
  const { rows: top } = await store.query(`
    SELECT a.child_name as name, a.member_id, SUM(CAST(t.amount AS DECIMAL(20,2))) as total, COUNT(*) as cnt
    FROM transactions t JOIN accounts a ON t.account_id = a.account_id
    WHERE t.type = 'deposit' AND DATE(t.created_at) >= $1 AND DATE(t.created_at) <= $2
    GROUP BY a.child_name, a.member_id ORDER BY total DESC LIMIT 10
  `, [from, to]);
  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 160px"><label>From</label><input type="date" id="depFrom" value="${from}" onchange="filterDep()"></div>
      <div class="field" style="flex:0 0 160px"><label>To</label><input type="date" id="depTo" value="${to}" onchange="filterDep()"></div>
      <script>function filterDep(){const f=document.getElementById('depFrom').value,t=document.getElementById('depTo').value;location.href='/admin/reports/deposit-summary?from='+f+'&to='+t}</script>
      <div style="flex:1;text-align:right">
        <a href="/admin/reports/deposit-summary?from=${from}&to=${to}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> Export CSV</a>
        <a href="/admin/reports/deposit-summary?from=${from}&to=${to}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
      </div>
    </div>
  </div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-piggy-bank"></i></div><div class="stat-value">${fmt(totalDeposits)}</div><div class="stat-label">Total Deposits</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-calculator"></i></div><div class="stat-value">${fmt(avgPerDay)}</div><div class="stat-label">Avg/Day</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="stat-value">${totalCount}</div><div class="stat-label">Transactions</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-value">${top.length}</div><div class="stat-label">Top Depositors</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-chart-area"></i> Daily Deposit Trend</h3></div>
    <div class="card-body"><canvas id="depTrendChart" height="100"></canvas></div>
  </div>
  <div class="stats-grid" style="grid-template-columns:1fr 1fr">
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-trophy"></i> Top Depositors</h3></div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>#</th><th>Member</th><th>Deposits</th><th>Count</th></tr>
        ${top.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${m.name || 'Unknown'}</b><br><span style="font-size:11px;color:var(--text-muted)">${m.member_id || ''}</span></td>
          <td class="mono" style="font-weight:600">${fmt(m.total)}</td>
          <td>${m.cnt}</td>
        </tr>`).join('')}
      </table></div>
    </div>
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-table"></i> Daily Breakdown</h3></div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>Date</th><th>Count</th><th>Amount</th></tr>
        ${rows.map(r => `
        <tr>
          <td class="mono">${fmtDate(r.d)}</td>
          <td>${r.cnt}</td>
          <td class="mono">${fmt(r.total)}</td>
        </tr>`).join('')}
        <tr style="font-weight:700;background:var(--bg-muted)">
          <td>TOTAL</td><td>${totalCount}</td><td class="mono">${fmt(totalDeposits)}</td>
        </tr>
      </table></div>
    </div>
  </div>
  <script>
  new Chart(document.getElementById('depTrendChart'), {
    type: 'line',
    data: { labels: ${labels}, datasets: [
      { label: 'Amount', data: ${values}, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
      { label: 'Count', data: ${counts}, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, yAxisID: 'y1' }
    ]},
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#fff', font: { size: 11 } } } },
      scales: {
        y: { type: 'linear', display: true, position: 'left', beginAtZero: true, ticks: { callback: v => '₱'+v.toLocaleString(), color: '#16a34a' } },
        y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: '#3b82f6' } }
      }
    }
  });
  </script>`;
  if (req.query.export === 'csv') {
    let csv = 'Date,Count,Amount\n';
    rows.forEach(r => { csv += `${fmtDate(r.d)},${r.cnt},${r.total}\n`; });
    csv += `TOTAL,${totalCount},${totalDeposits.toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="deposit_summary_' + from + '_to_' + to + '.csv"');
    return res.send(csv);
  }
  if (req.query.print) return res.type('html').send(printLayout('Deposit Summary Report', content, { subtitle: from + ' to ' + to }));
  res.type('html').send(layout('Deposit Summary Report', 'deposit-summary', content, { subtitle: from + ' to ' + to }));
}));

// ── 4. Member Ledger Report ──
router.get('/reports/member-ledger', requireRole(2), asyncHandler(async (req, res) => {
  const q = req.query.q || '';
  const memberId = req.query.member_id || '';
  const from = req.query.from || '';
  const to = req.query.to || '';
  let where = ['1=1'];
  let params = [];
  if (q) { where.push('(LOWER(a.child_name) LIKE LOWER($' + (params.length+1) + ') OR LOWER(a.member_id) LIKE LOWER($' + (params.length+1) + '))'); params.push('%' + q + '%'); }
  if (memberId) { where.push('a.member_id = $' + (params.length+1)); params.push(memberId); }
  if (from) { where.push('DATE(t.created_at) >= $' + (params.length+1)); params.push(from); }
  if (to) { where.push('DATE(t.created_at) <= $' + (params.length+1)); params.push(to); }
  const { rows: members } = await store.query('SELECT DISTINCT a.account_id, a.child_name as name, a.member_id FROM accounts a JOIN transactions t ON a.account_id = t.account_id WHERE a.is_active = 1 ORDER BY a.child_name ASC');
  const searchResults = q || memberId ? await store.query(`
    SELECT t.*, a.child_name as child_name, a.member_id, a.actual_balance as balance
    FROM transactions t JOIN accounts a ON t.account_id = a.account_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.created_at DESC LIMIT 500
  `, params) : { rows: [] };
  let memberSummary = null;
  if (searchResults.rows.length > 0) {
    const first = searchResults.rows[0];
    memberSummary = {
      name: first.child_name,
      memberId: first.member_id,
      balance: first.balance,
      totalIn: searchResults.rows.filter(r => r.type === 'deposit').reduce((s, r) => s + parseFloat(r.amount || 0), 0),
      totalOut: searchResults.rows.filter(r => ['withdrawal','loan_payment','penalty'].includes(r.type)).reduce((s, r) => s + parseFloat(r.amount || 0), 0),
      count: searchResults.rows.length
    };
  }
  const content = `
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-search"></i> Search Member Ledger</h3></div>
    <div class="card-body-padded">
    <form method="get" action="/admin/reports/member-ledger" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:end">
      <div class="field"><label><i class="fas fa-user"></i> Search Member</label><input type="text" name="q" placeholder="Name or ID..." value="${q}"></div>
      <div class="field"><label><i class="fas fa-calendar"></i> From</label><input type="date" name="from" value="${from}"></div>
      <div class="field"><label><i class="fas fa-calendar"></i> To</label><input type="date" name="to" value="${to}"></div>
      <div class="field"><label>&nbsp;</label>
        <select name="member_id">
          <option value="">All Members</option>
          ${members.map(m => '<option value="' + m.member_id + '" ' + (memberId === m.member_id ? 'selected' : '') + '>' + (m.name||'') + ' (' + m.member_id + ')</option>').join('')}
        </select>
      </div>
      <button type="submit" class="btn btn-secondary"><i class="fas fa-search"></i> Search</button>
    </form>
    </div>
  </div>
  ${memberSummary ? `
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-user"></i></div><div class="stat-value">${memberSummary.name}</div><div class="stat-label">${memberSummary.memberId}</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-piggy-bank"></i></div><div class="stat-value">${fmt(memberSummary.totalIn)}</div><div class="stat-label">Total Deposits</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-arrow-right-from-bracket"></i></div><div class="stat-value">${fmt(memberSummary.totalOut)}</div><div class="stat-label">Total Withdrawals/Charges</div></div>
    <div class="stat-card" style="border-left:4px solid #3b82f6"><div class="stat-icon"><i class="fas fa-wallet"></i></div><div class="stat-value">${fmt(memberSummary.balance)}</div><div class="stat-label">Current Balance</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-list"></i> Transaction History (${memberSummary.count})</h3>
      <span class="count">
        <a href="/admin/reports/member-ledger?q=${q}&member_id=${memberId}&from=${from}&to=${to}&export=csv" style="margin-right:12px"><i class="fas fa-file-csv"></i> CSV</a>
        <a href="/admin/reports/member-ledger?q=${q}&member_id=${memberId}&from=${from}&to=${to}&print=1" target="_blank"><i class="fas fa-print"></i> Print</a>
      </span>
    </div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Date</th><th>TRN#</th><th>Type</th><th>Description</th><th>Amount</th><th>Ext. Ref</th></tr>
      ${searchResults.rows.map(r => {
        const amt = parseFloat(r.amount || 0);
        const isCredit = ['deposit','interest_income','loan'].includes(r.type);
        return '<tr>' +
          '<td class="mono" style="font-size:11px">' + (r.created_at||'').slice(0,19).replace('T',' ') + '</td>' +
          '<td class="mono" style="font-size:11px;font-weight:600">' + fmtTrn(r) + '</td>' +
          '<td><span class="badge ' + (isCredit ? 'badge-green' : 'badge-red') + '">' + r.type.replace(/_/g,' ') + '</span></td>' +
          '<td style="font-size:12px">' + (r.description || '') + '</td>' +
          '<td class="mono" style="font-weight:600;color:' + (isCredit ? '#16a34a' : '#dc2626') + '">' + (isCredit ? '+' : '-') + fmt(amt) + '</td>' +
          '<td class="mono" style="font-size:10px;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.reference_id || '-') + '</td>' +
        '</tr>';
      }).join('')}
    </table></div>
  </div>` : (q || memberId ? '<div class="card"><div class="card-body-padded" style="text-align:center;color:var(--text-muted);padding:40px"><i class="fas fa-search" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i> No results found.</div></div>' : '<div class="card"><div class="card-body-padded" style="text-align:center;color:var(--text-muted);padding:40px"><i class="fas fa-hand-point-left" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i> Search for a member to view ledger.</div></div>')}
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-database"></i> Quick Member Select</h3></div>
    <div class="card-body-padded" style="display:flex;flex-wrap:wrap;gap:6px">
      ${members.slice(0, 50).map(m => '<a href="/admin/reports/member-ledger?q=' + encodeURIComponent(m.name||'') + '" class="btn btn-outline btn-xs">' + (m.name||'') + '</a>').join('')}
      ${members.length > 50 ? '<span style="color:var(--text-muted);font-size:12px;padding:4px">...and ' + (members.length-50) + ' more. Use search above.</span>' : ''}
    </div>
  </div>`;
  if (req.query.export === 'csv' && searchResults.rows.length) {
    let csv = 'TRN#,Date,Type,Description,Amount,Ext. Ref\n';
    searchResults.rows.forEach(r => {
      const isCredit = ['deposit','interest_income','loan'].includes(r.type);
      csv += `"${fmtTrn(r)}","${r.created_at}",${r.type},"${(r.description||'').replace(/"/g,'""')}",${isCredit ? '' : '-'}${r.amount},"${r.reference_id||''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="member_ledger_' + (q||'export') + '.csv"');
    return res.send(csv);
  }
  if (req.query.print && searchResults.rows.length) return res.type('html').send(printLayout('Member Ledger: ' + (memberSummary?.name || ''), content, { subtitle: '' }));
  res.type('html').send(layout('Member Ledger', 'member-ledger', content, { subtitle: 'Per-member transaction history' }));
}));

// ── 5. Loan Portfolio Report ──
router.get('/reports/loan-portfolio', requireRole(2), asyncHandler(async (req, res) => {
  const { rows: loans } = await store.query(`
    SELECT l.*, a.child_name, a.member_id
    FROM loans l JOIN accounts a ON l.account_id = a.account_id
    ORDER BY l.created_at DESC
  `);
  const stats = { total: 0, active: 0, paid: 0, overdue: 0, rejected: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0, totalInterest: 0 };
  const byMonth = {};
  loans.forEach(l => {
    const amt = parseFloat(l.amount) || 0;
    const interest = parseFloat(l.interest) || 0;
    stats.total++;
    stats.totalAmount += amt;
    stats.totalInterest += interest;
    if (l.status === 'active' || l.status === 'overdue') stats.totalOutstanding += amt + interest;
    if (l.status === 'paid') stats.totalPaid += amt + interest;
    if (l.status === 'active') stats.active++;
    else if (l.status === 'paid') stats.paid++;
    else if (l.status === 'overdue') stats.overdue++;
    else if (l.status === 'rejected') stats.rejected++;
    const month = (l.created_at||'').slice(0,7);
    if (month) { byMonth[month] = (byMonth[month] || 0) + amt; }
  });
  const monthLabels = JSON.stringify(Object.keys(byMonth).sort());
  const monthValues = JSON.stringify(Object.keys(byMonth).sort().map(m => byMonth[m]));
  const statusLabels = JSON.stringify(['Active','Overdue','Paid','Rejected']);
  const statusValues = JSON.stringify([stats.active, stats.overdue, stats.paid, stats.rejected]);
  const statusColors = JSON.stringify(['#3b82f6','#ef4444','#16a34a','#6b7280']);
  const outstandingRatio = stats.totalAmount ? ((stats.totalAmount - stats.totalPaid) / stats.totalAmount * 100).toFixed(1) : 0;

  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap">
      <a href="/admin/reports/loan-portfolio?export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> Export CSV</a>
      <a href="/admin/reports/loan-portfolio?print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
    </div>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-sack-dollar"></i></div><div class="stat-value">${stats.total}</div><div class="stat-label">Total Loans</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-value">${fmt(stats.totalAmount)}</div><div class="stat-label">Total Amount Loaned</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-value">${fmt(stats.totalPaid)}</div><div class="stat-label">Total Paid</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-clock"></i></div><div class="stat-value">${fmt(stats.totalOutstanding)}</div><div class="stat-label">Outstanding</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-value">${outstandingRatio}%</div><div class="stat-label">Outstanding Ratio</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-value">${stats.totalAmount ? (stats.totalInterest / stats.totalAmount * 100).toFixed(2) : 0}%</div><div class="stat-label">Avg Interest Rate</div></div>
  </div>
  <div class="stats-grid" style="grid-template-columns:1fr 1fr">
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-chart-pie"></i> Loan Status</h3></div>
      <div class="card-body"><canvas id="portfolioPie" height="120"></canvas></div>
    </div>
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-chart-bar"></i> Monthly Disbursement</h3></div>
      <div class="card-body"><canvas id="portfolioBar" height="120"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-list"></i> All Loans (${stats.total})</h3><span class="count">
      <span class="badge badge-blue">${stats.active} Active</span>
      <span class="badge badge-red">${stats.overdue} Overdue</span>
      <span class="badge badge-green">${stats.paid} Paid</span>
    </span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Member</th><th>Amount</th><th>Interest</th><th>Total Due</th><th>Issued</th><th>Due Date</th><th>Status</th></tr>
      ${loans.map(l => {
        const amt = parseFloat(l.amount) || 0;
        const interest = parseFloat(l.interest) || 0;
        const total = amt + interest;
        const s = l.status;
        const badgeClass = s === 'paid' ? 'badge-green' : s === 'active' ? 'badge-blue' : s === 'overdue' ? 'badge-red' : 'badge-gray';
        return '<tr>' +
          '<td><b>' + (l.child_name||'') + '</b><br><span class="mono" style="font-size:11px;color:var(--text-muted)">' + (l.member_id||'') + '</span></td>' +
          '<td class="mono">' + fmt(amt) + '</td>' +
          '<td class="mono">' + fmt(interest) + '</td>' +
          '<td class="mono" style="font-weight:600">' + fmt(total) + '</td>' +
          '<td class="mono" style="font-size:11px">' + (l.created_at||'').slice(0,10) + '</td>' +
          '<td class="mono" style="font-size:11px">' + (l.due_date||'').slice(0,10) + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + s + '</span></td>' +
        '</tr>';
      }).join('')}
    </table></div>
  </div>
  <script>
  new Chart(document.getElementById('portfolioPie'), {
    type: 'doughnut',
    data: { labels: ${statusLabels}, datasets: [{ data: ${statusValues}, backgroundColor: ${statusColors} }] },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#fff', font: { size: 11 } } } } }
  });
  new Chart(document.getElementById('portfolioBar'), {
    type: 'bar',
    data: { labels: ${monthLabels}, datasets: [{ label: 'Amount Loaned', data: ${monthValues}, backgroundColor: '#3b82f6' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '₱'+v.toLocaleString() } } } }
  });
  </script>`;
  if (req.query.export === 'csv') {
    let csv = 'Member,Amount,Interest,Total Due,Issued,Due Date,Status\n';
    loans.forEach(l => {
      const amt = parseFloat(l.amount) || 0;
      const interest = parseFloat(l.interest) || 0;
      csv += `"${l.child_name||''}","${l.member_id||''}",${amt},${interest},${amt+interest},${l.created_at.slice(0,10)},${l.due_date.slice(0,10)},${l.status}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="loan_portfolio_' + new Date().toISOString().slice(0,10) + '.csv"');
    return res.send(csv);
  }
  if (req.query.print) return res.type('html').send(printLayout('Loan Portfolio Report', content, { subtitle: '' }));
  res.type('html').send(layout('Loan Portfolio Report', 'loan-portfolio', content, { subtitle: 'Full loan portfolio breakdown' }));
}));

// ── End of Day (EOD) — MBwin Standard ──
router.get('/eod', requireRole(1), asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
  const { v4: uuidv4 } = require('uuid');

  // Check if today is already closed
  const closed = await one("SELECT * FROM eod_logs WHERE date = $1", [date]);

  // Today's transactions
  const txs = await sql(`SELECT t.*, a.child_name, a.member_id FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id WHERE DATE(t.created_at) = $1 ORDER BY t.created_at ASC`, [date]);
  const totalCollections = txs.filter(t => ['deposit','loan_payment','interest_income'].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const totalDisbursements = txs.filter(t => ['withdrawal','loan_disbursement','penalty','fee'].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const txCount = txs.length;

  // Previous day's closing cash = today's opening cash
  const prevClosed = await one("SELECT * FROM eod_logs WHERE date < $1 ORDER BY date DESC LIMIT 1", [date]);
  const openingCash = prevClosed ? Number(prevClosed.closing_cash) : 0;
  const closingCash = openingCash + totalCollections - totalDisbursements;

  // Last 30 EOD closes
  const history = await sql("SELECT * FROM eod_logs ORDER BY date DESC LIMIT 30");

  // Quick stats
  const totalMembers = Number((await one("SELECT COUNT(*) as c FROM accounts WHERE is_active=1")).c);
  const activeLoans = Number((await one("SELECT COUNT(*) as c FROM loans WHERE status='active' OR status='overdue'")).c);

  const toast = req.query.closed ? 'success:Day closed successfully.'
    : req.query.error ? `error:${req.query.error}`
    : '';

  const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2);

  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 200px"><label>Date</label>
        <input type="date" id="eodDate" value="${date}" onchange="location.href='/admin/eod?date='+this.value" ${closed ? 'disabled' : ''}>
      </div>
      <div style="flex:1;text-align:right">
        <span class="badge ${closed ? 'badge-green' : 'badge-yellow'}" style="font-size:14px;padding:6px 16px">
          <i class="fas ${closed ? 'fa-check-circle' : 'fa-clock'}"></i> ${closed ? 'CLOSED' : 'OPEN'}
        </span>
      </div>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <div class="stat-card" style="border-left:4px solid #3b82f6"><div class="stat-icon"><i class="fas fa-sun"></i></div><div class="stat-value">${fmt(openingCash)}</div><div class="stat-label">Opening Cash</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-arrow-up"></i></div><div class="stat-value" style="color:#16a34a">${fmt(totalCollections)}</div><div class="stat-label">Collections</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-arrow-down"></i></div><div class="stat-value" style="color:#ef4444">${fmt(totalDisbursements)}</div><div class="stat-label">Disbursements</div></div>
    <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="stat-icon"><i class="fas fa-check-double"></i></div><div class="stat-value">${fmt(closingCash)}</div><div class="stat-label">Closing Cash</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="stat-value">${txCount}</div><div class="stat-label">Transactions</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-value">${totalMembers}</div><div class="stat-label">Active Members</div></div>
  </div>

  ${!closed ? `
  <div class="card" style="border:2px solid var(--accent)">
    <div class="card-header"><h3><i class="fas fa-lock"></i> Close Day — ${date}</h3></div>
    <div class="card-body-padded">
      <p style="margin-bottom:12px;color:var(--text-muted)">Sealing this day will prevent further editing. Generate the final collection report and cash position.</p>
      <form method="post" action="/admin/eod/close" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <input type="hidden" name="date" value="${date}">
        <input type="hidden" name="opening_cash" value="${openingCash}">
        <input type="hidden" name="total_collections" value="${totalCollections}">
        <input type="hidden" name="total_disbursements" value="${totalDisbursements}">
        <input type="hidden" name="closing_cash" value="${closingCash}">
        <input type="hidden" name="tx_count" value="${txCount}">
        <div class="field" style="flex:1"><label>Closing Notes</label><input type="text" name="notes" placeholder="Optional notes for this day" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"></div>
        <button type="submit" class="btn btn-secondary" onclick="return confirm('Seal end of day for ${date}? Closing cash: ${fmt(closingCash)}')"><i class="fas fa-lock"></i> Close Day</button>
      </form>
    </div>
  </div>` : `
  <div class="card" style="border:2px solid #16a34a;background:var(--card)">
    <div class="card-header"><h3><i class="fas fa-check-circle" style="color:#16a34a"></i> Day Closed — ${date}</h3><span class="count">Closed by ${closed.closed_by || 'System'}</span></div>
    <div class="card-body-padded" style="display:flex;gap:16px;flex-wrap:wrap">
      <div><b>Opening:</b> ${fmt(Number(closed.opening_cash))}</div>
      <div><b>Collections:</b> <span style="color:#16a34a">${fmt(Number(closed.total_collections))}</span></div>
      <div><b>Disbursements:</b> <span style="color:#ef4444">${fmt(Number(closed.total_disbursements))}</span></div>
      <div><b>Closing:</b> ${fmt(Number(closed.closing_cash))}</div>
      <div><b>Transactions:</b> ${closed.tx_count}</div>
      ${closed.notes ? '<div><b>Notes:</b> ' + closed.notes + '</div>' : ''}
    </div>
  </div>`}

  <div class="stats-grid" style="grid-template-columns:2fr 1fr">
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-list"></i> Today's Transactions (${txCount})</h3>
        <span class="count"><a href="/admin/reports/daily-collection?date=${date}"><i class="fas fa-external-link-alt"></i> Full Report</a></span>
      </div>
      <div class="card-body" style="padding:0;max-height:400px;overflow-y:auto">
      <table>
        <tr><th>TRN#</th><th>Time</th><th>Member</th><th>Type</th><th>Amount</th></tr>
        ${txs.slice(0, 50).map(t => {
          const isCredit = ['deposit','loan_payment','interest_income'].includes(t.type);
          return '<tr>' +
            '<td class="mono" style="font-size:11px;font-weight:600">' + fmtTrn(t) + '</td>' +
            '<td class="mono" style="font-size:11px">' + (t.created_at||'').slice(11,19) + '</td>' +
            '<td style="font-size:12px">' + (t.child_name||'') + '</td>' +
            '<td><span class="badge ' + (isCredit ? 'badge-green' : 'badge-red') + '" style="font-size:10px">' + t.type.replace(/_/g,' ') + '</span></td>' +
            '<td class="mono" style="font-weight:600;color:' + (isCredit ? '#16a34a' : '#dc2626') + '">' + (isCredit ? '+' : '-') + fmt(t.amount) + '</td>' +
          '</tr>';
        }).join('')}
        ${txCount === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.4"></i> No transactions yet today.</td></tr>' : ''}
      </table></div>
    </div>
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-history"></i> Last 30 Day Closes</h3></div>
      <div class="card-body" style="padding:0;max-height:400px;overflow-y:auto">
      <table>
        <tr><th>Date</th><th>Closing Cash</th><th>Tx</th></tr>
        ${history.map(h => '<tr>' +
          '<td class="mono" style="font-size:12px;font-weight:600">' + h.date + '</td>' +
          '<td class="mono">' + fmt(Number(h.closing_cash)) + '</td>' +
          '<td>' + h.tx_count + '</td>' +
        '</tr>').join('')}
        ${history.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)">No days closed yet.</td></tr>' : ''}
      </table></div>
      <div class="card-body-padded" style="border-top:1px solid var(--border)">
        <a href="/admin/eod/history" class="btn btn-outline btn-sm"><i class="fas fa-calendar-alt"></i> Full History</a>
        <a href="/admin/reports/daily-collection?date=${date}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print Collection Report</a>
      </div>
    </div>
  </div>`;
  res.type('html').send(layout('End of Day', 'eod', content, { subtitle: date === new Date().toISOString().slice(0,10) ? 'Today\'s operations' : date, toast }));
}));

router.post('/eod/close', requireRole(2), asyncHandler(async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const { date, opening_cash, total_collections, total_disbursements, closing_cash, tx_count, notes } = req.body;
  if (!date) return res.redirect('/admin/eod?error=Date+required');
  const existing = await store.query("SELECT * FROM eod_logs WHERE date = $1", [date]);
  if (existing.rows.length > 0) return res.redirect('/admin/eod?error=Day+already+closed');
  await store.query(
    `INSERT INTO eod_logs (eod_id, date, opening_cash, total_collections, total_disbursements, closing_cash, tx_count, closed_by, notes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [uuidv4(), date, Number(opening_cash||0), Number(total_collections||0), Number(total_disbursements||0), Number(closing_cash||0), Number(tx_count||0), req.session.adminName || 'admin', notes || '', new Date().toISOString()]
  );
  // Auto-close accounting period if all days in month are closed
  const monthPrefix = date.slice(0, 7);
  const daysInMonth = new Date(Number(date.slice(0,4)), Number(date.slice(5,7)), 0).getDate();
  const closedDays = await store.query("SELECT COUNT(*) as c FROM eod_logs WHERE date LIKE $1", [monthPrefix + '%']).then(r => r.rows[0]);
  if (Number(closedDays.c) >= daysInMonth) {
    const periodId = monthPrefix;
    const existing = await store.query("SELECT * FROM accounting_periods WHERE period_id = $1", [periodId]).then(r => r.rows[0]);
    if (existing && !existing.is_closed) {
      await store.closePeriod(periodId, req.session.adminName || 'system');
    }
  }
  res.redirect('/admin/eod?date=' + date + '&closed=1');
}));

// ── EOD Full History ──
router.get('/eod/history', requireRole(1), asyncHandler(async (req, res) => {
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const logs = await sql("SELECT * FROM eod_logs ORDER BY date DESC LIMIT 365");
  const totalTx = logs.reduce((s, l) => s + Number(l.tx_count), 0);
  const totalCol = logs.reduce((s, l) => s + Number(l.total_collections), 0);
  const totalDis = logs.reduce((s, l) => s + Number(l.total_disbursements), 0);
  const content = `
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-calendar-alt"></i></div><div class="stat-value">${logs.length}</div><div class="stat-label">Days Closed</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="stat-value">${totalTx}</div><div class="stat-label">Total Transactions</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-arrow-up"></i></div><div class="stat-value" style="color:#16a34a">${fmt(totalCol)}</div><div class="stat-label">Total Collections</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-arrow-down"></i></div><div class="stat-value" style="color:#ef4444">${fmt(totalDis)}</div><div class="stat-label">Total Disbursements</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-history"></i> Full EOD History</h3></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Date</th><th>Opening</th><th>Collections</th><th>Disbursements</th><th>Closing Cash</th><th>Tx Count</th><th>Closed By</th><th>Notes</th></tr>
      ${logs.map(l => `
      <tr>
        <td class="mono" style="font-weight:600">${l.date}</td>
        <td class="mono">${fmt(Number(l.opening_cash))}</td>
        <td class="mono" style="color:#16a34a">${fmt(Number(l.total_collections))}</td>
        <td class="mono" style="color:#dc2626">${fmt(Number(l.total_disbursements))}</td>
        <td class="mono" style="font-weight:600">${fmt(Number(l.closing_cash))}</td>
        <td>${l.tx_count}</td>
        <td>${l.closed_by || '-'}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">${l.notes || '-'}</td>
      </tr>`).join('')}
      ${logs.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.4"></i> No days closed yet.</td></tr>' : ''}
    </table></div>
  </div>`;
  res.type('html').send(layout('EOD History', 'eod', content, { subtitle: logs.length + ' days recorded' }));
}));

// ── End of Month — Member Statements ──
router.get('/statements', requireRole(1), asyncHandler(async (req, res) => {
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
  const year = req.query.year || new Date().getFullYear();
  const month = req.query.month || new Date().getMonth() + 1;
  const memberId = req.query.member_id || '';
  const fromDate = year + '-' + String(month).padStart(2, '0') + '-01';
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const toDate = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  const members = await sql("SELECT account_id, child_name, member_id FROM accounts WHERE is_active = 1 ORDER BY child_name");

  let statements;
  if (memberId) {
    statements = await sql(`
      SELECT t.*, a.child_name, a.member_id FROM transactions t
      JOIN accounts a ON t.account_id = a.account_id
      WHERE a.member_id = $1 AND DATE(t.created_at) >= $2 AND DATE(t.created_at) <= $3
      ORDER BY t.created_at ASC
    `, [memberId, fromDate, toDate]);
  } else {
    statements = [];
  }

  // Balance before month
  let openingBalance = 0;
  if (memberId && statements.length > 0) {
    const balBefore = await one(`
      SELECT COALESCE(SUM(CASE WHEN type IN ('deposit','interest_credit','loan_disbursement','interest') THEN amount
        WHEN type IN ('withdrawal','loan_payment','fee') THEN -amount ELSE 0 END), 0) as bal
      FROM transactions t JOIN accounts a ON t.account_id = a.account_id
      WHERE a.member_id = $1 AND DATE(t.created_at) < $2
    `, [memberId, fromDate]);
    openingBalance = Number(balBefore?.bal || 0);
  }

  let runningBalance = openingBalance;
  const totalIn = statements.filter(t => ['deposit','interest_credit','interest','loan_disbursement'].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = statements.filter(t => ['withdrawal','loan_payment','fee'].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
  const closingBalance = openingBalance + totalIn - totalOut;

  const content = `
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-file-invoice"></i> Generate Monthly Statement</h3></div>
    <div class="card-body-padded">
    <form method="get" action="/admin/statements" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
      <div class="field"><label>Member</label>
        <select name="member_id" required>
          <option value="">Select member...</option>
          ${members.map(m => '<option value="' + m.member_id + '" ' + (memberId === m.member_id ? 'selected' : '') + '>' + (m.child_name||'') + ' (' + m.member_id + ')</option>').join('')}
        </select>
      </div>
      <div class="field"><label>Year</label><input type="number" name="year" value="${year}" min="2020" max="2030"></div>
      <div class="field"><label>Month</label>
        <select name="month">
          ${Array.from({length:12}, (_, i) => '<option value="' + (i+1) + '" ' + (Number(month) === i+1 ? 'selected' : '') + '>' + new Date(2000, i).toLocaleString('en', {month:'long'}) + '</option>').join('')}
        </select>
      </div>
      <button type="submit" class="btn btn-secondary"><i class="fas fa-search"></i> Generate</button>
    </form>
    </div>
  </div>
  ${memberId && statements.length >= 0 ? `
  <div class="card" style="border:2px solid var(--accent)">
    <div class="card-header">
      <h3><i class="fas fa-file-invoice"></i> Statement of Account</h3>
      <span class="count">${new Date(year, month-1).toLocaleString('en', {month:'long', year:'numeric'})}</span>
    </div>
    <div class="card-body-padded" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      <div><b>Member:</b> ${statements[0]?.child_name || '-'}</div>
      <div><b>Member ID:</b> ${memberId}</div>
      <div><b>Opening Balance:</b> ${fmt(openingBalance)}</div>
      <div><b>Total Deposits:</b> <span style="color:#16a34a">${fmt(totalIn)}</span></div>
      <div><b>Total Withdrawals:</b> <span style="color:#dc2626">${fmt(totalOut)}</span></div>
      <div><b>Closing Balance:</b> <b>${fmt(closingBalance)}</b></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-list"></i> Transaction Details</h3>
      <span class="count">
        <a href="/admin/statements?member_id=${memberId}&year=${year}&month=${month}&export=csv"><i class="fas fa-file-csv"></i> CSV</a>
        <a href="/admin/statements?member_id=${memberId}&year=${year}&month=${month}&print=1" target="_blank"><i class="fas fa-print"></i> Print</a>
      </span>
    </div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Date</th><th>TRN#</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>
      <tr style="font-weight:600;background:var(--bg-muted)">
        <td colspan="5">Opening Balance</td><td class="mono">${fmt(openingBalance)}</td>
      </tr>
      ${statements.map(t => {
        const amt = Number(t.amount);
        const isCredit = ['deposit','interest_credit','interest','loan_disbursement'].includes(t.type);
        runningBalance += isCredit ? amt : -amt;
        return '<tr>' +
          '<td class="mono" style="font-size:11px">' + (t.created_at||'').slice(0,10) + '</td>' +
          '<td class="mono" style="font-size:11px;font-weight:600">' + fmtTrn(t) + '</td>' +
          '<td style="font-size:12px">' + (t.description||t.type.replace(/_/g,' ')) + '</td>' +
          '<td class="mono" style="color:#dc2626">' + (!isCredit ? fmt(amt) : '') + '</td>' +
          '<td class="mono" style="color:#16a34a">' + (isCredit ? fmt(amt) : '') + '</td>' +
          '<td class="mono" style="font-weight:600">' + fmt(runningBalance) + '</td>' +
        '</tr>';
      }).join('')}
      <tr style="font-weight:700;background:var(--bg-muted)">
        <td colspan="3">TOTAL</td>
        <td class="mono" style="color:#dc2626">${fmt(totalOut)}</td>
        <td class="mono" style="color:#16a34a">${fmt(totalIn)}</td>
        <td class="mono">${fmt(closingBalance)}</td>
      </tr>
    </table></div>
  </div>` : memberId ? '<div class="card"><div class="card-body-padded" style="text-align:center;color:var(--text-muted);padding:40px"><i class="fas fa-inbox" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i> No transactions for this period.</div></div>' : ''}`;
  res.type('html').send(layout('Member Statements', 'statements', content, { subtitle: 'Monthly statement of account' }));
}));

// ── End of Year (EOY) — P&L Close + Archive ──
router.get('/eoy', requireRole(1), asyncHandler(async (req, res) => {
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
  const now = new Date();
  const currentYear = now.getFullYear();
  const selYear = parseInt(req.query.year) || currentYear;
  const gl = require('../services/gl');

  const closed = await one("SELECT * FROM eoy_logs WHERE year = $1", [selYear]);

  const txCount = Number((await one("SELECT COUNT(*) as c FROM transactions WHERE created_at LIKE $1", [selYear + '%'])).c || 0);
  const totalDeposits = Number((await one("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE type='deposit' AND created_at LIKE $1", [selYear + '%'])).s || 0);
  const totalWithdrawals = Number((await one("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE type='withdrawal' AND created_at LIKE $1", [selYear + '%'])).s || 0);
  const memberCount = Number((await one("SELECT COUNT(*) as c FROM accounts")).c);

  let income = [], expense = [], totalIncome = 0, totalExpense = 0, netProfit = 0;
  try {
    const pnl = await gl.getProfitAndLoss(selYear + '-01-01', selYear + '-12-31');
    income = pnl.income; expense = pnl.expense; totalIncome = pnl.totalIncome; totalExpense = pnl.totalExpense; netProfit = pnl.netProfit;
  } catch (e) {}

  const prevCloses = await sql("SELECT * FROM eoy_logs ORDER BY year DESC");
  const archivedCount = Number((await one("SELECT COUNT(*) as c FROM archived_transactions WHERE year = $1", [selYear])).c || 0);

  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 160px"><label>Year</label>
        <select id="eoyYear" onchange="location.href='/admin/eoy?year='+this.value">
          ${Array.from({length: 10}, (_, i) => { const y = currentYear - i; return '<option value="' + y + '" ' + (selYear === y ? 'selected' : '') + '>' + y + '</option>'; }).join('')}
        </select>
      </div>
      <div style="flex:1;text-align:right">
        <span class="badge ${closed ? 'badge-green' : selYear === currentYear ? 'badge-yellow' : 'badge-gray'}" style="font-size:14px;padding:6px 16px">
          <i class="fas ${closed ? 'fa-check-circle' : 'fa-clock'}"></i>
          ${closed ? 'CLOSED on ' + (closed.created_at||'').slice(0,10) : selYear === currentYear ? 'CURRENT YEAR' : 'PAST YEAR'}
        </span>
      </div>
    </div>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="stat-value">${txCount}</div><div class="stat-label">Transactions</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-arrow-up"></i></div><div class="stat-value" style="color:#16a34a">${fmt(totalDeposits)}</div><div class="stat-label">Total Deposits</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-arrow-down"></i></div><div class="stat-value" style="color:#ef4444">${fmt(totalWithdrawals)}</div><div class="stat-label">Total Withdrawals</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-value">${memberCount}</div><div class="stat-label">Members</div></div>
    <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="stat-icon"><i class="fas fa-file-invoice-dollar"></i></div><div class="stat-value" style="color:#8b5cf6">${fmt(totalIncome)}</div><div class="stat-label">Gross Income</div></div>
    <div class="stat-card" style="border-left:4px solid ${netProfit >= 0 ? '#16a34a' : '#ef4444'}"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-value" style="color:${netProfit >= 0 ? '#16a34a' : '#ef4444'}">${fmt(Math.abs(netProfit))}</div><div class="stat-label">${netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</div></div>
  </div>
  <div class="stats-grid" style="grid-template-columns:1fr 1fr">
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-arrow-trend-up" style="color:#16a34a"></i> Income (${income.length})</h3></div>
      <div class="card-body" style="padding:0">
      <table><tr><th>Account</th><th>Amount</th></tr>
        ${income.map(i => '<tr><td>' + i.code + ' — ' + i.name + '</td><td class="mono" style="color:#16a34a">' + fmt(i.amount) + '</td></tr>').join('')}
        <tr style="font-weight:700;background:var(--bg-muted)"><td>TOTAL INCOME</td><td class="mono" style="color:#16a34a">${fmt(totalIncome)}</td></tr>
      </table></div>
    </div>
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-arrow-trend-down" style="color:#ef4444"></i> Expenses (${expense.length})</h3></div>
      <div class="card-body" style="padding:0">
      <table><tr><th>Account</th><th>Amount</th></tr>
        ${expense.map(e => '<tr><td>' + e.code + ' — ' + e.name + '</td><td class="mono" style="color:#dc2626">' + fmt(e.amount) + '</td></tr>').join('')}
        <tr style="font-weight:700;background:var(--bg-muted)"><td>TOTAL EXPENSES</td><td class="mono" style="color:#dc2626">${fmt(totalExpense)}</td></tr>
      </table></div>
    </div>
  </div>
  ${!closed && selYear <= currentYear ? `
  <div class="card" style="border:2px solid #8b5cf6">
    <div class="card-header"><h3><i class="fas fa-file-export"></i> Year-End Close — ${selYear}</h3></div>
    <div class="card-body-padded">
      <p style="margin-bottom:12px;color:var(--text-muted)">Closing the year will:
        <ul style="margin:8px 0 12px 20px;line-height:1.8">
          <li>Post <b>P&L closing entries</b> — zero out income/expense, transfer net profit to Retained Earnings</li>
          <li><b>Archive</b> <b>${txCount}</b> transactions (preserved in archived_transactions table)</li>
          <li>Record the close in <b>eoy_logs</b></li>
          <li>TRN# sequence automatically resets each year</li>
        </ul>
      </p>
      <form method="post" action="/admin/eoy/close" onsubmit="return confirm('Close year ${selYear}? This will archive ${txCount} transactions and post P&L close of ${fmt(netProfit)} to Retained Earnings. Irreversible.')">
        <input type="hidden" name="year" value="${selYear}">
        <button type="submit" class="btn btn-secondary"><i class="fas fa-lock"></i> Close Year ${selYear}</button>
        ${selYear === currentYear ? '<span style="margin-left:12px;color:var(--amber);font-size:12px"><i class="fas fa-exclamation-triangle"></i> Current year — do this only after Dec 31</span>' : ''}
      </form>
    </div>
  </div>` : closed ? `
  <div class="card" style="border:2px solid #16a34a">
    <div class="card-header"><h3><i class="fas fa-check-circle" style="color:#16a34a"></i> ${selYear} Already Closed</h3><span class="count">${closed.closed_by || 'System'}</span></div>
    <div class="card-body-padded" style="display:flex;gap:16px;flex-wrap:wrap">
      <div><b>Net Profit:</b> ${fmt(Number(closed.net_profit))}</div>
      <div><b>Transactions:</b> ${closed.tx_count}</div>
      <div><b>Archived:</b> ${Number(closed.archived) ? 'Yes' : 'No'}</div>
      <div><b>Closed on:</b> ${(closed.created_at||'').slice(0,10)}</div>
    </div>
  </div>` : ''}
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-history"></i> Previous Year Closes</h3></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Year</th><th>Net Profit</th><th>Transactions</th><th>Archived</th><th>Closed By</th><th>Date</th></tr>
      ${prevCloses.map(c => '<tr><td class="mono" style="font-weight:600">' + c.year + '</td><td class="mono" style="color:' + (Number(c.net_profit) >= 0 ? '#16a34a' : '#dc2626') + '">' + fmt(Number(c.net_profit)) + '</td><td>' + c.tx_count + '</td><td>' + (Number(c.archived) ? '<i class="fas fa-check" style="color:#16a34a"></i>' : '<i class="fas fa-times"></i>') + '</td><td>' + (c.closed_by||'-') + '</td><td class="mono" style="font-size:11px">' + (c.created_at||'').slice(0,10) + '</td></tr>').join('')}
    </table></div>
  </div>`;
  res.type('html').send(layout('Year-End Close', 'eoy', content, { subtitle: 'P&L close, archive, and retained earnings' }));
}));

router.post('/eoy/close', requireRole(3), asyncHandler(async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const year = parseInt(req.body.year);
  if (!year) return res.redirect('/admin/eoy?error=Year+required');
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
  const gl = require('../services/gl');
  const existing = await one("SELECT * FROM eoy_logs WHERE year = $1", [year]);
  if (existing) return res.redirect('/admin/eoy?year=' + year + '&error=Year+already+closed');

  const fromDate = year + '-01-01', toDate = year + '-12-31';
  const pnl = await gl.getProfitAndLoss(fromDate, toDate);
  const closeTxId = 'eoy-' + uuidv4().slice(0,8);
  const entries = [];
  for (const inc of pnl.income) { if (inc.amount > 0) entries.push({ account_code: inc.code, debit: inc.amount, credit: 0, description: 'P&L close ' + year }); }
  for (const exp of pnl.expense) { if (exp.amount > 0) entries.push({ account_code: exp.code, debit: 0, credit: exp.amount, description: 'P&L close ' + year }); }
  if (pnl.netProfit >= 0) entries.push({ account_code: '3100', debit: 0, credit: pnl.netProfit, description: 'Net profit ' + year });
  else entries.push({ account_code: '3100', debit: Math.abs(pnl.netProfit), credit: 0, description: 'Net loss ' + year });
  await gl.postDoubleEntry(closeTxId, entries, { postedBy: req.session.adminName || 'admin', referenceType: 'eoy' });

  const txs = await sql("SELECT * FROM transactions WHERE created_at LIKE $1", [year + '%']);
  for (const tx of txs) {
    await store.query(
      `INSERT INTO archived_transactions (archive_id, transaction_id, trn_number, account_id, type, amount, description, reference_type, reference_id, original_created_at, archived_at, year)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [uuidv4(), tx.transaction_id, tx.trn_number || null, tx.account_id, tx.type, tx.amount, tx.description, tx.reference_type, tx.reference_id, tx.created_at, new Date().toISOString(), year]
    );
  }

  await store.query(
    `INSERT INTO eoy_logs (eoy_id, year, total_income, total_expense, net_profit, tx_count, archived, closed_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8)`,
    [uuidv4(), year, pnl.totalIncome, pnl.totalExpense, pnl.netProfit, txs.length, req.session.adminName || 'admin', new Date().toISOString()]
  );
  res.redirect('/admin/eoy?year=' + year + '&closed=1');
}));

// ── Accounting Periods Management ──

router.get('/accounting-periods', requireRole(3), asyncHandler(async (req, res) => {
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
  const periods = await sql('SELECT * FROM accounting_periods ORDER BY year DESC, month DESC');
  const content = `
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-calendar-lock"></i> Accounting Periods</h3></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Period</th><th>Year</th><th>Month</th><th>Status</th><th>Closed By</th><th>Closed At</th><th>Action</th></tr>
      ${periods.map(p => `
      <tr>
        <td class="mono" style="font-weight:600">${p.period_id}</td>
        <td>${p.year}</td>
        <td>${String(p.month).padStart(2,'0')}</td>
        <td>${p.is_closed ? '<span class="badge badge-green"><i class="fas fa-lock"></i> Closed</span>' : '<span class="badge badge-yellow"><i class="fas fa-lock-open"></i> Open</span>'}</td>
        <td>${p.closed_by || '-'}</td>
        <td class="mono" style="font-size:11px">${(p.closed_at||'').slice(0,16).replace('T',' ')}</td>
        <td>${p.is_closed ? '' : `<a href="/admin/accounting-periods/close/${p.period_id}" class="btn btn-danger btn-xs" data-confirm="Close period ${p.period_id}? This will prevent any new GL entries for this period."><i class="fas fa-lock"></i> Close</a>`}</td>
      </tr>`).join('')}
      ${periods.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No accounting periods found. They are auto-created when GL entries are posted.</td></tr>' : ''}
    </table></div>
  </div>`;
  res.type('html').send(layout('Accounting Periods', 'accounting-periods', content, { subtitle: 'Manage period locks for GL posting' }));
}));

router.get('/accounting-periods/close/:periodId', requireRole(3), asyncHandler(async (req, res) => {
  try {
    await store.closePeriod(req.params.periodId, req.session.adminName || 'admin');
    res.redirect('/admin/accounting-periods?closed=ok');
  } catch (err) {
    res.redirect('/admin/accounting-periods?error=' + encodeURIComponent(err.message));
  }
}));

// ── Backup & Restore — Advanced Data Security ──

// System tables excluded from backup/restore
const SYSTEM_TABLES = new Set(['sequences', 'audit_log', 'admin_users', 'fcm_tokens', 'gl_accounts', 'backup_logs']);

// Dynamically discover all user tables from the database schema
async function getAllTables() {
  let tables;
  if (isPostgres) {
    const r = await store.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    tables = r.rows.map(t => t.table_name);
  } else {
    const r = await store.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", []);
    tables = r.rows.map(t => t.name);
  }
  return tables.filter(t => !SYSTEM_TABLES.has(t));
}

// Helper: collect all data from a table
async function dumpTable(table) {
  const { rows } = await store.query(`SELECT * FROM "${table}"`);
  return rows;
}

// Helper: compute SHA-256 checksum of string
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// Helper: format size
const fmtSize = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';

// Temporarily disable FK checks so restore order doesn't matter
async function disableForeignKeys() {
  if (isPostgres) {
    await store.query("SET session_replication_role = 'replica'");
  } else {
    await store.query('PRAGMA foreign_keys = OFF');
  }
}
async function enableForeignKeys() {
  if (isPostgres) {
    await store.query("SET session_replication_role = 'origin'");
  } else {
    await store.query('PRAGMA foreign_keys = ON');
  }
}

router.get('/backup', requireRole(1), asyncHandler(async (req, res) => {
  const tables = await getAllTables();
  const toast = req.query.restored === 'ok' ? 'success:Data restored successfully. A snapshot of your previous data is saved in Backup History.'
    : req.query.failed ? `error:${req.query.failed}`
    : '';
  const lastBackup = (await store.query("SELECT * FROM backup_logs WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1")).rows[0];
  const backupHistory = (await store.query("SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 20")).rows;
  const stats = {};
  for (const t of tables) {
    const c = (await store.query(`SELECT COUNT(*) as c FROM "${t}"`)).rows[0];
    stats[t] = Number(c?.c || 0);
  }
  const totalRows = Object.values(stats).reduce((s, v) => s + v, 0);
  const content = `
  <style>
  .backup-card { border:2px solid var(--border); border-radius:var(--radius); padding:20px; margin-bottom:16px; background:var(--card); }
  .backup-card.highlight { border-color:var(--accent); background: linear-gradient(135deg, rgba(46,125,50,0.03) 0%, rgba(46,125,50,0.08) 100%); }
  .backup-card h3 { margin-bottom:12px; display:flex; align-items:center; gap:8px; }
  .backup-card .row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
  .backup-card .field { flex:1; min-width:200px; }
  .preview-table { max-height:300px; overflow-y:auto; margin:8px 0; }
  .preview-table table { font-size:11px; }
  .preview-table td, .preview-table th { padding:4px 8px; }
  </style>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-database"></i></div><div class="stat-value">${tables.length}</div><div class="stat-label">Tables</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div class="stat-value">${totalRows}</div><div class="stat-label">Total Records</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-history"></i></div><div class="stat-value">${backupHistory.length}</div><div class="stat-label">Past Backups</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-calendar"></i></div><div class="stat-value">${lastBackup ? (lastBackup.created_at||'').slice(0,10) : 'Never'}</div><div class="stat-label">Last Backup</div></div>
  </div>

  <div class="backup-card highlight">
    <h3><i class="fas fa-download" style="color:var(--accent)"></i> Download Backup</h3>
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px">Exports all user data as a signed JSON file. Includes verification checksum for integrity. <b>Auto-discovers all tables</b> — no manual list to maintain.</p>
    <div class="row">
      <div class="field">
        <label>Include tables (${tables.length} total):</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;max-height:200px;overflow-y:auto;padding:4px">
          ${tables.map(t => '<label style="font-size:12px;display:flex;align-items:center;gap:4px;background:var(--bg-muted);padding:4px 8px;border-radius:6px"><input type="checkbox" class="backup-tbl" value="' + t + '" checked> ' + t + ' <span style="color:var(--text-muted)">(' + stats[t] + ')</span></label>').join('')}
        </div>
      </div>
      <div style="flex-shrink:0">
        <button class="btn btn-secondary" onclick="downloadBackup()"><i class="fas fa-download"></i> Download Backup</button>
        <button class="btn btn-outline" style="margin-top:8px;display:block" onclick="document.querySelectorAll('.backup-tbl').forEach(c=>c.checked=true)">Select All</button>
      </div>
    </div>
  </div>

  <div class="backup-card">
    <h3><i class="fas fa-upload" style="color:#3b82f6"></i> Restore from Backup</h3>
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px">Upload a previously downloaded backup file. You will preview contents before committing.</p>
    <form id="restoreForm" enctype="multipart/form-data" method="post" action="/admin/backup/restore" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:250px">
        <input type="file" name="backup_file" accept=".json" required style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;background:var(--card)">
      </div>
      <button type="submit" class="btn btn-secondary"><i class="fas fa-upload"></i> Preview &amp; Restore</button>
    </form>
  </div>

  ${backupHistory.length > 0 ? `
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-history"></i> Backup History</h3></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Date</th><th>Filename</th><th>Size</th><th>Tables</th><th>Rows</th><th>Checksum</th><th>By</th></tr>
      ${backupHistory.map(b => '<tr>' +
        '<td class="mono" style="font-size:11px">' + (b.created_at||'').slice(0,19).replace('T',' ') + '</td>' +
        '<td style="font-size:12px">' + b.filename + '</td>' +
        '<td>' + fmtSize(Number(b.file_size)) + '</td>' +
        '<td>' + b.table_count + '</td>' +
        '<td>' + b.row_count + '</td>' +
        '<td class="mono" style="font-size:10px">' + (b.checksum||'').slice(0,16) + '...</td>' +
        '<td>' + (b.created_by||'-') + '</td>' +
      '</tr>').join('')}
    </table></div>
  </div>` : ''}
  <script>
  async function downloadBackup() {
    const checked = document.querySelectorAll('.backup-tbl:checked');
    if (checked.length === 0) { alert('Select at least one table.'); return; }
    const tables = Array.from(checked).map(c => c.value).join(',');
    window.location.href = '/admin/backup/download?tables=' + encodeURIComponent(tables);
  }
  </script>`;
  res.type('html').send(layout('Backup & Restore', 'backup', content, { subtitle: 'Dynamic schema discovery', toast }));
}));

router.get('/backup/download', requireRole(3), asyncHandler(async (req, res) => {
  const allTables = await getAllTables();
  const tables = (req.query.tables || allTables.join(',')).split(',').filter(t => allTables.includes(t));
  if (tables.length === 0) return res.status(400).json({ error: 'No valid tables selected' });
  const backup = {
    manifest: {
      app: 'LabCoop',
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      tables: tables,
      total_tables: tables.length,
      total_rows: 0,
      db_type: isPostgres ? 'postgresql' : 'sqlite',
    },
    data: {},
  };
  for (const t of tables) {
    const rows = await dumpTable(t);
    backup.data[t] = rows;
    backup.manifest.total_rows += rows.length;
  }
  const jsonStr = JSON.stringify(backup, null, 2);
  const checksum = sha256(jsonStr);
  backup.manifest.checksum = checksum;
  const finalJson = JSON.stringify(backup, null, 2);
  const filename = 'labcoop_backup_' + new Date().toISOString().slice(0,10) + '.json';
  const fileSize = Buffer.byteLength(finalJson, 'utf8');
  await store.query(
    'INSERT INTO backup_logs (backup_id, filename, file_size, checksum, table_count, row_count, status, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [uuidv4(), filename, fileSize, checksum, tables.length, backup.manifest.total_rows, 'completed', req.session.adminName || 'admin', new Date().toISOString()]
  );
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('X-Checksum-SHA256', checksum);
  res.send(finalJson);
}));

router.post('/backup/restore', requireRole(3), multer({ dest: path.join(__dirname, '..', 'uploads'), limits: { fileSize: 100 * 1024 * 1024 } }).single('backup_file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.redirect('/admin/backup?failed=No+file+uploaded');
  const filePath = req.file.path;
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    fs.unlinkSync(filePath);
    return res.redirect('/admin/backup?failed=Invalid+JSON+file');
  }
  if (!backup.manifest || !backup.data || typeof backup.data !== 'object') {
    fs.unlinkSync(filePath);
    return res.redirect('/admin/backup?failed=Invalid+backup+format');
  }
  // Verify checksum
  const originalChecksum = backup.manifest.checksum;
  delete backup.manifest.checksum;
  const jsonCheck = JSON.stringify(backup, null, 2);
  const computedChecksum = sha256(jsonCheck);
  backup.manifest.checksum = originalChecksum;
  if (originalChecksum && computedChecksum !== originalChecksum) {
    fs.unlinkSync(filePath);
    return res.redirect('/admin/backup?failed=Checksum+mismatch+—+file+may+be+corrupted');
  }
  // Match backup tables against current schema
  const allTables = await getAllTables();
  const tableNames = Object.keys(backup.data).filter(t => allTables.includes(t));
  let totalRows = 0;
  const preview = tableNames.map(t => {
    const rows = backup.data[t];
    if (!Array.isArray(rows)) return null;
    totalRows += rows.length;
    const sample = rows.slice(0, 3);
    const cols = sample.length > 0 ? Object.keys(sample[0]) : [];
    const visibleCols = cols.slice(0, 5);
    const extraCols = cols.length - 5;
    return { table: t, count: rows.length, sample, cols, visibleCols, extraCols };
  }).filter(Boolean);

  const fileSize = req.file.size;
  const filename = req.file.originalname;

  const previewHtml = preview.map(p => `
    <div style="margin-bottom:16px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;background:var(--bg-muted)">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;padding:0 0 8px 0;border-bottom:1px solid var(--border)">
        <span><i class="fas fa-table"></i> ${p.table} <span style="font-weight:400;color:var(--text-muted)">(${p.count.toLocaleString()} rows)</span></span>
        <span style="font-size:11px;color:var(--text-muted)">${p.cols.length} columns</span>
      </div>
      <div style="overflow-x:auto;margin-top:8px">
      <table style="font-size:11px;white-space:nowrap;min-width:100%">
        ${p.sample.length > 0 ? '<tr>' + p.visibleCols.map(k => '<th style="padding:4px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted)">' + k + '</th>').join('') + (p.extraCols > 0 ? '<th style="padding:4px 8px;font-size:10px;color:var(--text-muted)">+' + p.extraCols + ' more</th>' : '') + '</tr>' : ''}
        ${p.sample.map(row => '<tr>' + p.visibleCols.map(k => {
          const v = row[k];
          const s = v === null ? '<span style="color:var(--text-muted);font-style:italic">NULL</span>' : String(v).length > 25 ? String(v).slice(0,25) + '...' : String(v);
          return '<td style="padding:4px 8px;max-width:160px;overflow:hidden;text-overflow:ellipsis">' + s + '</td>';
        }).join('') + (p.extraCols > 0 ? '<td style="padding:4px 8px;color:var(--text-muted)"><i class="fas fa-ellipsis-h"></i></td>' : '') + '</tr>').join('')}
      </table>
      </div>
    </div>
  `).join('');

  const content = `
  <div class="card" style="border:2px solid #f59e0b">
    <div class="card-header"><h3><i class="fas fa-eye"></i> Restore Preview — ${filename}</h3></div>
    <div class="card-body-padded">
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px">
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-table"></i></div><div class="stat-value">${tableNames.length}</div><div class="stat-label">Tables</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div class="stat-value">${totalRows}</div><div class="stat-label">Total Records</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-file"></i></div><div class="stat-value">${fmtSize(fileSize)}</div><div class="stat-label">File Size</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle" style="color:${originalChecksum ? '#16a34a' : '#94a3b8'}"></i></div><div class="stat-value">${originalChecksum ? 'Verified' : 'No checksum'}</div><div class="stat-label">Integrity</div></div>
      </div>
      <p style="color:var(--amber);font-weight:600;margin-bottom:12px"><i class="fas fa-exclamation-triangle"></i> Restoring will <b>overwrite existing data</b> in the selected tables. FK constraints are temporarily disabled for safe restore. <span style="font-weight:400;color:var(--text-muted)">A snapshot of current data is auto-saved before restore so you can roll back.</span></p>
      ${previewHtml}
      <form id="restoreConfirmForm" method="post" action="/admin/backup/restore/confirm" style="display:flex;gap:12px;margin-top:12px">
        <input type="hidden" name="filepath" value="${filePath}">
        <input type="hidden" name="tables" value="${tableNames.join(',')}">
        <button type="submit" class="btn btn-secondary" id="confirmRestoreBtn" onclick="event.preventDefault();confirmRestore()"><i class="fas fa-exclamation-triangle"></i> Confirm &amp; Restore</button>
        <a href="/admin/backup" class="btn btn-cancel">Cancel</a>
      </form>
      <div id="restoreProgress" style="display:none;margin-top:16px">
        <div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--bg-muted);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div class="spinner" style="width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0"></div>
          <div>
            <div style="font-weight:600;font-size:14px">Restoring backup…</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">This may take a while for large datasets. Page will redirect when done.</div>
          </div>
        </div>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      <script>
      function confirmRestore() {
        var total = ${totalRows};
        if (!confirm('Are you ABSOLUTELY SURE? OVERWRITE ' + total.toLocaleString() + ' records across ' + ${tableNames.length} + ' tables? This is IRREVERSIBLE.')) return;
        document.getElementById('confirmRestoreBtn').disabled = true;
        document.getElementById('confirmRestoreBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restoring…';
        document.getElementById('restoreProgress').style.display = 'block';
        document.getElementById('restoreConfirmForm').submit();
      }
      </script>
    </div>
  </div>`;
  res.type('html').send(layout('Restore Preview', 'backup', content, { subtitle: 'Review before committing' }));
}));

router.post('/backup/restore/confirm', requireRole(3), asyncHandler(async (req, res) => {
  const filePath = req.body.filepath;
  const tablesStr = req.body.tables || '';
  if (!filePath || !fs.existsSync(filePath)) return res.redirect('/admin/backup?failed=Backup+file+not+found');
  const allTables = await getAllTables();
  const tables = tablesStr.split(',').filter(t => allTables.includes(t));
  if (tables.length === 0) return res.redirect('/admin/backup?failed=No+tables+to+restore');
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    fs.unlinkSync(filePath);
    return res.redirect('/admin/backup?failed=Invalid+backup+file');
  }
  try {
    // ── Auto-snapshot current data before restore ──
    const snapshotTables = await getAllTables();
    const snapshot = { manifest: { app: 'LabCoop', version: '1.0.0', generated_at: new Date().toISOString(), tables: snapshotTables, total_tables: snapshotTables.length, total_rows: 0, note: 'auto-backup before restore' }, data: {} };
    for (const st of snapshotTables) {
      try {
        const dump = await dumpTable(st);
        snapshot.data[st] = dump;
        snapshot.manifest.total_rows += dump.length;
      } catch (_) {}
    }
    const snapshotJson = JSON.stringify(snapshot, null, 2);
    const snapshotFile = path.join(__dirname, '..', 'uploads', 'pre_restore_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(snapshotFile, snapshotJson, 'utf8');
    const snapshotChecksum = sha256(snapshotJson);
    await store.query(
      'INSERT INTO backup_logs (backup_id, filename, file_size, checksum, table_count, row_count, status, notes, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [uuidv4(), path.basename(snapshotFile), Buffer.byteLength(snapshotJson, 'utf8'), snapshotChecksum, snapshotTables.length, snapshot.manifest.total_rows, 'pre_restore_snapshot', 'Auto-saved before restore', req.session.adminName || 'admin', new Date().toISOString()]
    );

    // ── Perform restore ──
    await disableForeignKeys();
    for (const t of tables) {
      const rows = backup.data[t];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // Clear existing data
      await store.query(`DELETE FROM "${t}"`);
      // Bulk insert
      for (const row of rows) {
        const cols = Object.keys(row).filter(k => row[k] !== undefined);
        const vals = cols.map(c => row[c]);
        const placeholders = cols.map((_, i) => '$' + (i + 1));
        const insertSql = `INSERT INTO "${t}" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${placeholders.join(',')})`;
        try {
          await store.query(insertSql, vals);
        } catch (insertErr) {
          console.warn('Skipped row in ' + t + ': ' + insertErr.message.slice(0, 100));
        }
      }
    }
    await enableForeignKeys();
    fs.unlinkSync(filePath);
    const totalRestored = Object.values(backup.data).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    await store.query(
      'INSERT INTO backup_logs (backup_id, filename, file_size, checksum, table_count, row_count, status, notes, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [uuidv4(), 'restore-' + new Date().toISOString().slice(0,10), 0, '', tables.length, totalRestored, 'restored', 'Restored from backup', req.session.adminName || 'admin', new Date().toISOString()]
    );
  } catch (e) {
    await enableForeignKeys().catch(() => {});
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.redirect('/admin/backup?failed=' + encodeURIComponent(e.message.slice(0, 200)));
  }
  res.redirect('/admin/backup?restored=ok');
}));

// ── Clear All User Data (keep reference tables) ──
router.get('/reset-database/confirm', requireRole(4), asyncHandler(async (req, res) => {
  const err = req.query.error ? req.query.error : '';
  const content = `
  <div class="card" style="max-width:500px;margin:0 auto">
    <div class="card-header"><h3>&#x26A0;&#xFE0F; Reset Database</h3></div>
    <div class="card-body-padded">
      <p style="color:var(--danger);font-weight:600;margin-bottom:16px">This will permanently delete ALL member accounts, transactions, goals, badges, loans, and audit data. Reference tables (GL accounts, shop items, quiz questions) will be kept.</p>
      <p style="margin-bottom:16px">Enter your password to confirm this destructive action.</p>
      ${err ? `<p style="color:var(--danger);font-weight:600;margin-bottom:12px">&#x274C; ${err}</p>` : ''}
      <form method="post" action="/admin/reset-database" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label>Your Password</label><input type="password" name="password" required></div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-danger">&#x26A0;&#xFE0F; Confirm Reset Database</button>
          <a href="/admin/settings" class="btn btn-cancel">Cancel</a>
        </div>
      </form>
    </div>
  </div>`;
  res.type('html').send(layout('Confirm Reset', 'settings', content, { subtitle: 'Password required' }));
}));

router.post('/reset-database', requireRole(4), asyncHandler(async (req, res) => {
  const { password } = req.body;
  const adminUser = await one('SELECT * FROM admin_users WHERE admin_id = $1', [req.session.adminId]);
  if (!adminUser || !bcrypt.compareSync(password, adminUser.password_hash)) {
    return res.redirect('/admin/reset-database/confirm?error=Incorrect+password');
  }
  // Order respects FK dependencies: children before parents
  const tables = [
    'gl_entries',
    'loan_payments',
    'transactions',
    'badges',
    'goal_jars',
    'loans',
    'withdrawal_requests',
    'standing_orders',
    'coop_contributions',
    'coop_goals',
    'accounts',
  ];
  if (isPostgres) {
    const existing = await store.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const existingSet = new Set(existing.rows.map(r => r.table_name));
    await store.transaction(async (tx) => {
      for (const t of tables) {
        if (existingSet.has(t)) {
          await tx.query(`DELETE FROM "${t}"`);
        }
      }
    });
  } else {
    for (const t of tables) {
      try { store.query(`DELETE FROM ${t}`); } catch (_) {}
    }
  }
  res.redirect('/admin?msg=Database+reset+successful');
}));

// ── GL Reports ──

function bsSection(title, items, total, color) {
  return `
    <div class="card">
      <div class="card-header"><h4>${title}</h4><span class="count">${items.length} accounts</span></div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>Account</th><th class="num">Amount</th></tr>
        ${items.map(r => `<tr><td>${r.name}</td><td class="num mono" style="color:${color};font-weight:600">&#x20B1;${Math.abs(r.balance).toFixed(2)}</td></tr>`).join('')}
        <tr style="font-weight:700;background:var(--bg2)"><td>TOTAL ${title.toUpperCase()}</td><td class="num mono" style="color:${color}">&#x20B1;${total.toFixed(2)}</td></tr>
      </table></div>
    </div>`;
}

router.get('/gl/trial-balance', requireRole(1), asyncHandler(async (req, res) => {
  const { getTrialBalance } = require('../services/gl');
  const date = req.query.date || '';
  const result = await getTrialBalance(date || null);
  const totalD = result.rows.reduce((s, r) => s + r.debit, 0);
  const totalC = result.rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalD - totalC) < 0.01;

  if (req.query.export === 'csv') {
    let csv = 'Code,Account,Type,Debit,Credit,Balance\n';
    result.rows.forEach(r => { csv += `${r.code},${r.name},${r.type},${r.debit.toFixed(2)},${r.credit.toFixed(2)},${r.balance.toFixed(2)}\n`; });
    csv += `TOTAL,,,${totalD.toFixed(2)},${totalC.toFixed(2)},${(totalD - totalC).toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trial_balance_${date||'all'}.csv"`);
    return res.send(csv);
  }

  const content = `
  <form method="get" action="/admin/gl/trial-balance" style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
    <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">As of date</label><input type="date" name="date" value="${date}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
    <button type="submit" class="btn btn-primary btn-sm">&#x1F50D; View</button>
    <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F504; Reset</a>
    <div style="margin-left:auto;display:flex;gap:8px">
      <a href="/admin/gl/trial-balance?${date ? 'date='+date+'&' : ''}export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
      <a href="/admin/gl/trial-balance?${date ? 'date='+date+'&' : ''}print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
      <a href="/admin/gl/balance-sheet" class="btn btn-outline btn-sm">&#x1F4C8; Balance Sheet</a>
      <a href="/admin/gl/profit-and-loss" class="btn btn-outline btn-sm">&#x1F4C9; P&amp;L</a>
      <a href="/admin/gl/ledger" class="btn btn-outline btn-sm">&#x1F4CB; Ledger</a>
    </div>
  </form>
  <div class="stats-grid" style="margin-bottom:16px">
    <div class="stat-card"><div class="stat-icon">&#x2696;</div><div class="stat-value">${result.rows.length}</div><div class="stat-label">GL Accounts</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B5;</div><div class="stat-value">&#x20B1;${totalD.toFixed(2)}</div><div class="stat-label">Total Debits</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B8;</div><div class="stat-value">&#x20B1;${totalC.toFixed(2)}</div><div class="stat-label">Total Credits</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2705;</div><div class="stat-value" style="color:${balanced ? '#16a34a' : '#dc2626'}">${balanced ? 'Balanced' : 'Unbalanced'}</div><div class="stat-label">Debits = Credits</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x1F4CA; Trial Balance${date ? ' as of ' + date : ''}</h3></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Code</th><th>Account</th><th>Type</th><th>Category</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>
      ${result.rows.map(r => `<tr>
        <td class="mono">${r.code}</td><td>${r.name}</td>
        <td><span class="badge ${r.type === 'asset' || r.type === 'expense' ? 'badge-red' : r.type === 'liability' || r.type === 'equity' ? 'badge-blue' : 'badge-green'}">${r.type}</span></td>
        <td><span class="badge badge-gray" style="font-size:10px">${r.category || '-'}</span></td>
        <td class="num mono">${r.debit ? '&#x20B1;' + r.debit.toFixed(2) : '-'}</td>
        <td class="num mono">${r.credit ? '&#x20B1;' + r.credit.toFixed(2) : '-'}</td>
        <td class="num mono" style="color:${r.balance >= 0 ? '#16a34a' : '#dc2626'};font-weight:600">&#x20B1;${Math.abs(r.balance).toFixed(2)} ${(r.type === 'asset' || r.type === 'expense') ? (r.balance >= 0 ? 'DR' : 'CR') : (r.balance >= 0 ? 'CR' : 'DR')}</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--bg2)"><td colspan="4">TOTAL</td>
        <td class="num mono">&#x20B1;${totalD.toFixed(2)}</td>
        <td class="num mono">&#x20B1;${totalC.toFixed(2)}</td>
        <td class="num mono" style="color:${balanced ? '#16a34a' : '#dc2626'}">${balanced ? '&#x2705;' : '&#x26A0; Diff: &#x20B1;' + Math.abs(totalD - totalC).toFixed(2)}</td>
      </tr>
    </table></div>
  </div>`;
  if (req.query.print) {
    const totalD = result.rows.reduce((s, r) => s + r.debit, 0);
    const totalC = result.rows.reduce((s, r) => s + r.credit, 0);
    const rows = result.rows.map(r => ({
      cells: [r.code, r.name, `<span class="badge badge-${r.type === 'asset' || r.type === 'expense' ? 'red' : r.type === 'liability' || r.type === 'equity' ? 'blue' : 'green'}">${r.type}</span>`, r.category || '-', fmt(r.debit), fmt(r.credit), (r.balance >= 0 ? '' : '-') + fmt(Math.abs(r.balance)), (r.type === 'asset' || r.type === 'expense') ? (r.balance >= 0 ? 'DR' : 'CR') : (r.balance >= 0 ? 'CR' : 'DR')]
    }));
    const printContent = reportStats([
      { label: 'GL Accounts', value: result.rows.length },
      { label: 'Total Debits', value: fmt(totalD) },
      { label: 'Total Credits', value: fmt(totalC) },
      { label: 'Status', value: Math.abs(totalD - totalC) < 0.01 ? '✓ Balanced' : '⚠ Unbalanced' },
    ]) + reportTable(
      ['Code', 'Account', 'Type', 'Category', 'Debit', 'Credit', 'Balance', 'DR/CR'],
      rows,
      { totalCells: ['TOTAL', '', '', '', fmt(totalD), fmt(totalC), fmt(Math.abs(totalD - totalC)), Math.abs(totalD - totalC) < 0.01 ? '✓' : '⚠'] }
    );
    return res.type('html').send(printLayout('Trial Balance', printContent, { subtitle: 'All GL accounts with debit/credit totals', asOf: date || undefined, orientation: 'landscape', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'General Manager' }));
  }
  res.type('html').send(layout('Trial Balance', 'gl-trial', content, { subtitle: 'All GL accounts with debit/credit totals' }));
}));

router.get('/gl/balance-sheet', requireRole(1), asyncHandler(async (req, res) => {
  const { getBalanceSheet } = require('../services/gl');
  const date = req.query.date || '';
  const result = await getBalanceSheet(date || null);

  // Prior year comparison
  let priorAssets = 0, priorLiabilities = 0, priorEquity = 0;
  if (date) {
    const priorDate = (Number(date.slice(0,4)) - 1) + date.slice(4);
    const prior = await getBalanceSheet(priorDate);
    priorAssets = prior.totalAssets;
    priorLiabilities = prior.totalLiabilities;
    priorEquity = prior.totalEquity;
  }

  // Notes text
  const notes = await store.getSetting('fs_notes_bs') || '';
  const diff = result.totalAssets - (result.totalLiabilities + result.totalEquity);

  const content = `
    <form method="get" action="/admin/gl/balance-sheet" style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
      <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">As of date</label><input type="date" name="date" value="${date}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
      <button type="submit" class="btn btn-primary btn-sm">&#x1F50D; View</button>
      <a href="/admin/gl/balance-sheet" class="btn btn-outline btn-sm">&#x1F504; Reset</a>
      <div style="margin-left:auto;display:flex;gap:8px">
        <a href="/admin/gl/balance-sheet?${date ? 'date='+date+'&' : ''}export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
        <a href="/admin/gl/balance-sheet?${date ? 'date='+date+'&' : ''}print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
        <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F4CA; Trial Balance</a>
        <a href="/admin/gl/profit-and-loss" class="btn btn-outline btn-sm">&#x1F4C9; P&amp;L</a>
      </div>
    </form>
    <div class="stats-grid">
      <div class="stat-card" style="border-left:3px solid var(--accent)"><div class="stat-icon">&#x1F4B0;</div><div class="stat-value" style="color:#16a34a">&#x20B1;${result.totalAssets.toFixed(2)}</div><div class="stat-label">Total Assets ${date ? '| Prior: &#x20B1;' + priorAssets.toFixed(2) : ''}</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value" style="color:#dc2626">&#x20B1;${result.totalLiabilities.toFixed(2)}</div><div class="stat-label">Total Liabilities ${date ? '| Prior: &#x20B1;' + priorLiabilities.toFixed(2) : ''}</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F511;</div><div class="stat-value" style="color:#2563eb">&#x20B1;${result.totalEquity.toFixed(2)}</div><div class="stat-label">Total Equity ${date ? '| Prior: &#x20B1;' + priorEquity.toFixed(2) : ''}</div></div>
      <div class="stat-card"><div class="stat-icon">&#x2696;</div><div class="stat-value" style="color:${diff === 0 ? '#16a34a' : '#dc2626'}">${diff === 0 ? '&#x2705; A = L + E' : '&#x26A0; Off by &#x20B1;' + diff.toFixed(2)}</div><div class="stat-label">Accounting Equation</div></div>
    </div>
    ${result.currentAssets.length ? bsSection('Current Assets', result.currentAssets, result.totalCurrentAssets, '#16a34a') : ''}
    ${result.nonCurrentAssets.length ? bsSection('Non-Current Assets', result.nonCurrentAssets, result.totalNonCurrentAssets, '#22c55e') : ''}
    ${result.currentLiabilities.length ? bsSection('Current Liabilities', result.currentLiabilities, result.totalCurrentLiabilities, '#dc2626') : ''}
    ${result.nonCurrentLiabilities.length ? bsSection('Non-Current Liabilities', result.nonCurrentLiabilities, result.totalNonCurrentLiabilities, '#ef4444') : ''}
    ${bsSection('Equity', result.equity, result.totalEquity, '#2563eb')}
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-sticky-note"></i> Notes to Financial Statements</h3></div>
      <div class="card-body-padded">
        <form method="post" action="/admin/gl/balance-sheet/notes" style="display:flex;flex-direction:column;gap:8px">
          <textarea name="notes" style="width:100%;min-height:80px;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px">${h(notes)}</textarea>
          <button type="submit" class="btn btn-primary btn-xs" style="align-self:flex-end"><i class="fas fa-save"></i> Save Notes</button>
        </form>
      </div>
    </div>`;

  if (req.query.export === 'csv') {
    let csv = 'Category,Account,Amount\n';
    const writeSection = (label, items) => items.forEach(i => { csv += `${label},${i.name},${i.balance.toFixed(2)}\n`; });
    writeSection('Current Assets', result.currentAssets);
    writeSection('Non-Current Assets', result.nonCurrentAssets);
    writeSection('Current Liabilities', result.currentLiabilities);
    writeSection('Non-Current Liabilities', result.nonCurrentLiabilities);
    writeSection('Equity', result.equity);
    csv += `TOTAL ASSETS,,${result.totalAssets.toFixed(2)}\nTOTAL LIABILITIES,,${result.totalLiabilities.toFixed(2)}\nTOTAL EQUITY,,${result.totalEquity.toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="balance_sheet_${date||'all'}.csv"`);
    return res.send(csv);
  }
  if (req.query.print) {
    const fmtAmt = v => '₱' + Number(v || 0).toFixed(2);
    let printContent = reportStats([
      { label: 'Total Assets', value: fmtAmt(result.totalAssets) },
      { label: 'Total Liabilities', value: fmtAmt(result.totalLiabilities) },
      { label: 'Total Equity', value: fmtAmt(result.totalEquity) },
      { label: 'Equation', value: Math.abs(result.totalAssets - (result.totalLiabilities + result.totalEquity)) < 0.01 ? '✓ A = L + E' : '⚠ Off by ₱' + (result.totalAssets - result.totalLiabilities - result.totalEquity).toFixed(2) },
    ]);
    if (result.currentAssets.length) printContent += reportSection('Current Assets', result.currentAssets, fmtAmt(result.totalCurrentAssets), { color: '#16a34a' });
    if (result.nonCurrentAssets.length) printContent += reportSection('Non-Current Assets', result.nonCurrentAssets, fmtAmt(result.totalNonCurrentAssets), { color: '#22c55e' });
    if (result.currentLiabilities.length) printContent += reportSection('Current Liabilities', result.currentLiabilities, fmtAmt(result.totalCurrentLiabilities), { color: '#dc2626' });
    if (result.nonCurrentLiabilities.length) printContent += reportSection('Non-Current Liabilities', result.nonCurrentLiabilities, fmtAmt(result.totalNonCurrentLiabilities), { color: '#ef4444' });
    printContent += reportSection('Equity', result.equity, fmtAmt(result.totalEquity), { color: '#2563eb' });
    const notes = await store.getSetting('fs_notes_bs') || '';
    if (notes) printContent += `<div class="section-title">Notes to Financial Statements</div><div style="font-size:8pt;line-height:1.6;margin-bottom:3mm;padding:2mm;border:1px solid #ccc;background:#fafafa">${h(notes)}</div>`;
    return res.type('html').send(printLayout('Balance Sheet', printContent, { subtitle: 'Assets = Liabilities + Equity', asOf: date || undefined, orientation: 'landscape', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'General Manager' }));
  }
  res.type('html').send(layout('Balance Sheet', 'gl-bsheet', content, { subtitle: 'Assets = Liabilities + Equity' }));
}));

router.post('/gl/balance-sheet/notes', requireRole(3), asyncHandler(async (req, res) => {
  await store.setSetting('fs_notes_bs', req.body.notes || '');
  res.redirect('/admin/gl/balance-sheet' + (req.query.date ? '?date=' + req.query.date : ''));
}));

router.get('/gl/profit-and-loss', requireRole(1), asyncHandler(async (req, res) => {
  const { getProfitAndLoss } = require('../services/gl');
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const todayStr = now.toISOString().slice(0,10);
  const from = req.query.from || firstDay;
  const to = req.query.to || todayStr;
  const result = await getProfitAndLoss(from, to);

  // Prior year comparison
  let priorIncome = 0, priorExpense = 0, priorNet = 0;
  if (from && to) {
    const priorFrom = (Number(from.slice(0,4)) - 1) + from.slice(4);
    const priorTo = (Number(to.slice(0,4)) - 1) + to.slice(4);
    const prior = await getProfitAndLoss(priorFrom, priorTo);
    priorIncome = prior.totalIncome;
    priorExpense = prior.totalExpense;
    priorNet = prior.netProfit;
  }

  const notes = await store.getSetting('fs_notes_pnl') || '';

  const pnlSection = (title, items, total, color) => `
    <div class="card">
      <div class="card-header"><h4>${title}</h4><span class="count">${items.length} accounts</span></div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>Account</th><th class="num">Amount</th></tr>
        ${items.map(r => `<tr><td>${r.name}</td><td class="num mono" style="color:${color};font-weight:600">&#x20B1;${r.amount.toFixed(2)}</td></tr>`).join('')}
        <tr style="font-weight:700;background:var(--bg2)"><td>TOTAL ${title.toUpperCase()}</td><td class="num mono" style="color:${color}">&#x20B1;${total.toFixed(2)}</td></tr>
      </table></div>
    </div>`;
  const content = `
    <form method="get" action="/admin/gl/profit-and-loss" style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
      <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">From</label><input type="date" name="from" value="${from}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
      <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">To</label><input type="date" name="to" value="${to}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
      <button type="submit" class="btn btn-primary btn-sm">&#x1F50D; View</button>
      <a href="/admin/gl/profit-and-loss" class="btn btn-outline btn-sm">&#x1F504; Reset</a>
      <div style="margin-left:auto;display:flex;gap:8px">
        <a href="/admin/gl/profit-and-loss?from=${from}&to=${to}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
        <a href="/admin/gl/profit-and-loss?from=${from}&to=${to}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
        <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F4CA; Trial Balance</a>
        <a href="/admin/gl/balance-sheet" class="btn btn-outline btn-sm">&#x1F4C8; Balance Sheet</a>
      </div>
    </form>
    <div class="stats-grid">
      <div class="stat-card" style="border-left:3px solid #16a34a"><div class="stat-icon">&#x1F4B5;</div><div class="stat-value" style="color:#16a34a">&#x20B1;${result.totalIncome.toFixed(2)}</div><div class="stat-label">Total Income ${priorIncome ? '| Prior: &#x20B1;' + priorIncome.toFixed(2) : ''}</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F4B8;</div><div class="stat-value" style="color:#dc2626">&#x20B1;${result.totalExpense.toFixed(2)}</div><div class="stat-label">Total Expenses ${priorExpense ? '| Prior: &#x20B1;' + priorExpense.toFixed(2) : ''}</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F3C6;</div><div class="stat-value" style="color:${result.netProfit >= 0 ? '#16a34a' : '#dc2626'}">${result.netProfit >= 0 ? '+' : ''}&#x20B1;${result.netProfit.toFixed(2)}</div><div class="stat-label">Net ${result.netProfit >= 0 ? 'Profit' : 'Loss'} ${priorNet ? '| Prior: &#x20B1;' + priorNet.toFixed(2) : ''}</div></div>
    </div>
    ${result.operatingIncome.length ? pnlSection('Operating Income', result.operatingIncome, result.totalOperatingIncome, '#16a34a') : ''}
    ${result.otherIncome.length ? pnlSection('Other Income', result.otherIncome, result.totalOtherIncome, '#22c55e') : ''}
    <div class="card">
      <div class="card-body-padded" style="display:flex;justify-content:space-between;font-size:15px;font-weight:600;background:var(--bg2)">
        <span>Gross Income (Total Income)</span><span style="color:#16a34a">&#x20B1;${result.totalIncome.toFixed(2)}</span>
      </div>
    </div>
    ${result.operatingExpense.length ? pnlSection('Operating Expenses', result.operatingExpense, result.totalOperatingExpense, '#dc2626') : ''}
    ${result.otherExpense.length ? pnlSection('Other Expenses', result.otherExpense, result.totalOtherExpense, '#ef4444') : ''}
    <div class="card" style="border:2px solid ${result.netProfit >= 0 ? '#16a34a' : '#dc2626'}">
      <div class="card-body-padded" style="display:flex;justify-content:space-between;font-size:18px;font-weight:700">
        <span>NET ${result.netProfit >= 0 ? 'PROFIT' : 'LOSS'}</span>
        <span style="color:${result.netProfit >= 0 ? '#16a34a' : '#dc2626'}">${result.netProfit >= 0 ? '+' : ''}&#x20B1;${result.netProfit.toFixed(2)}</span>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-sticky-note"></i> Notes to Financial Statements</h3></div>
      <div class="card-body-padded">
        <form method="post" action="/admin/gl/profit-and-loss/notes" style="display:flex;flex-direction:column;gap:8px">
          <input type="hidden" name="from" value="${from}">
          <input type="hidden" name="to" value="${to}">
          <textarea name="notes" style="width:100%;min-height:80px;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px">${h(notes)}</textarea>
          <button type="submit" class="btn btn-primary btn-xs" style="align-self:flex-end"><i class="fas fa-save"></i> Save Notes</button>
        </form>
      </div>
    </div>`;

  if (req.query.export === 'csv') {
    let csv = 'Category,Account,Amount\n';
    const w = (cat, items) => items.forEach(i => { csv += `${cat},${i.name},${i.amount.toFixed(2)}\n`; });
    w('Operating Income', result.operatingIncome);
    w('Other Income', result.otherIncome);
    w('Operating Expenses', result.operatingExpense);
    w('Other Expenses', result.otherExpense);
    csv += `NET PROFIT,,${result.netProfit.toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="pnl_${from}_${to}.csv"`);
    return res.send(csv);
  }
  if (req.query.print) {
    const fmtAmt = v => '₱' + Number(v || 0).toFixed(2);
    let printContent = reportStats([
      { label: 'Total Income', value: fmtAmt(result.totalIncome) },
      { label: 'Total Expenses', value: fmtAmt(result.totalExpense) },
      { label: 'Gross Profit', value: fmtAmt(result.grossProfit) },
      { label: 'Net Profit', value: fmtAmt(result.netProfit) },
    ]);
    if (result.operatingIncome.length) printContent += reportSection('Operating Income', result.operatingIncome.map(i => ({ name: i.code + ' — ' + i.name, amount: (i.amount >= 0 ? '' : '(') + fmtAmt(Math.abs(i.amount)) + (i.amount < 0 ? ')' : '') })), fmtAmt(result.totalOperatingIncome), { color: '#16a34a', totalLabel: 'TOTAL OPERATING INCOME' });
    if (result.otherIncome.length) printContent += reportSection('Other Income', result.otherIncome.map(i => ({ name: i.code + ' — ' + i.name, amount: (i.amount >= 0 ? '' : '(') + fmtAmt(Math.abs(i.amount)) + (i.amount < 0 ? ')' : '') })), fmtAmt(result.totalOtherIncome), { color: '#16a34a', totalLabel: 'TOTAL OTHER INCOME' });
    if (result.operatingExpense.length) printContent += reportSection('Operating Expenses', result.operatingExpense.map(i => ({ name: i.code + ' — ' + i.name, amount: (i.amount >= 0 ? '' : '(') + fmtAmt(Math.abs(i.amount)) + (i.amount < 0 ? ')' : '') })), fmtAmt(result.totalOperatingExpense), { color: '#dc2626', totalLabel: 'TOTAL OPERATING EXPENSES' });
    if (result.otherExpense.length) printContent += reportSection('Other Expenses', result.otherExpense.map(i => ({ name: i.code + ' — ' + i.name, amount: (i.amount >= 0 ? '' : '(') + fmtAmt(Math.abs(i.amount)) + (i.amount < 0 ? ')' : '') })), fmtAmt(result.totalOtherExpense), { color: '#dc2626', totalLabel: 'TOTAL OTHER EXPENSES' });
    printContent += `<div class="section-title">Summary</div>` + reportTable(['', 'Amount'], [
      { cells: ['Gross Profit (Operating Income)', fmtAmt(result.grossProfit)] },
      { cells: ['Operating Profit (Inc - Exp)', fmtAmt(result.operatingProfit)] },
      { cells: ['Net Profit Before Tax', fmtAmt(result.netProfit)] },
    ], { totalCells: false });
    const notes = await store.getSetting('fs_notes_pnl') || '';
    if (notes) printContent += `<div class="section-title">Notes to Financial Statements</div><div style="font-size:8pt;line-height:1.6;margin-bottom:3mm;padding:2mm;border:1px solid #ccc;background:#fafafa">${h(notes)}</div>`;
    return res.type('html').send(printLayout('Profit & Loss Statement', printContent, { subtitle: `${from} to ${to}`, dateRange: `${from} to ${to}`, orientation: 'landscape', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'General Manager' }));
  }
  res.type('html').send(layout('Profit & Loss', 'gl-pnl', content, { subtitle: 'Income - Expenses = Net Profit/Loss' }));
}));

router.post('/gl/profit-and-loss/notes', requireRole(3), asyncHandler(async (req, res) => {
  await store.setSetting('fs_notes_pnl', req.body.notes || '');
  res.redirect('/admin/gl/profit-and-loss?from=' + (req.body.from || '') + '&to=' + (req.body.to || ''));
}));

router.get('/gl/ledger', requireRole(1), asyncHandler(async (req, res) => {
  const { getAccountLedger } = require('../services/gl');
  const accounts = await sql('SELECT * FROM gl_accounts ORDER BY code');
  const selected = req.query.account || '';
  let entries = [];
  let accName = '';
  if (selected) {
    entries = await getAccountLedger(selected);
    const a = accounts.find(x => x.code === selected);
    accName = a ? a.name + ' (' + a.code + ') [' + a.type + ']' : selected;
  }
  const content = `
  <div style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
    <form method="get" action="/admin/gl/ledger" style="display:flex;gap:8px;flex:1">
      <div style="flex:1"><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">Account</label>
        <select name="account" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px">
          <option value="">-- Select GL account --</option>
          ${accounts.map(a => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${a.code} — ${a.name} [${a.type}]</option>`).join('')}
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-sm" style="margin-top:18px">&#x1F50D; View</button>
    </form>
    <div style="display:flex;gap:8px">
      <a href="/admin/gl/ledger?account=${selected}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
      <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F4CA; Trial Balance</a>
      <a href="/admin/gl/balance-sheet" class="btn btn-outline btn-sm">&#x1F4C8; Balance Sheet</a>
      <a href="/admin/gl/profit-and-loss" class="btn btn-outline btn-sm">&#x1F4C9; P&amp;L</a>
    </div>
  </div>
  ${selected ? `
  <div class="card">
    <div class="card-header"><h3>&#x1F4CB; ${accName}</h3><span class="count">${entries.length} entries</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Date</th><th>Transaction</th><th>Reference</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Running Balance</th></tr>
      ${entries.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text-muted)">No entries for this account</td></tr>' :
        entries.slice().reverse().map((e, i, arr) => {
          const d = Number(e.debit), c = Number(e.credit);
          const isAssetExpense = ['asset','expense'].includes(accounts.find(x => x.code === selected)?.type);
          const entryBalance = isAssetExpense ? d - c : c - d;
          return `<tr>
            <td class="mono" style="font-size:11px">${(e.created_at||'').slice(0,16).replace('T',' ')}</td>
            <td class="mono" style="font-size:10px;color:var(--text-muted)">${(e.transaction_id||'').slice(0,8)}</td>
            <td class="mono" style="font-size:10px;color:var(--text-muted)">${e.reference_number || '-'}</td>
            <td>${e.description || '-'}</td>
            <td class="num mono" style="color:#16a34a">${d ? '&#x20B1;' + d.toFixed(2) : '-'}</td>
            <td class="num mono" style="color:#dc2626">${c ? '&#x20B1;' + c.toFixed(2) : '-'}</td>
            <td class="num mono" style="font-weight:600;color:${entryBalance >= 0 ? '#16a34a' : '#dc2626'}">${entryBalance >= 0 ? '' : '-'}&#x20B1;${Math.abs(entryBalance).toFixed(2)}</td>
          </tr>`;
        }).join('')}
    </table></div>
  </div>` : '<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:14px">&#x1F4CB; Select a GL account above to view its ledger entries</div>'}`;

  if (req.query.export === 'csv' && selected) {
    let csv = 'Date,Transaction,Reference,Description,Debit,Credit,RunningBalance\n';
    entries.slice().reverse().forEach(e => {
      const d = Number(e.debit), c = Number(e.credit);
      const isAE = ['asset','expense'].includes(accounts.find(x => x.code === selected)?.type);
      const bal = isAE ? d - c : c - d;
      csv += `${(e.created_at||'').slice(0,10)},${(e.transaction_id||'').slice(0,8)},${e.reference_number||''},${e.description||''},${d.toFixed(2)},${c.toFixed(2)},${bal.toFixed(2)}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ledger_${selected}.csv"`);
    return res.send(csv);
  }

  if (req.query.print) {
    let runningBalance = 0;
    const rows = (entries || []).map(e => {
      runningBalance += (e.debit || 0) - (e.credit || 0);
      return { cells: [e.created_at ? e.created_at.slice(0,10) : '-', e.description || '-', e.reference_number || '-', e.posted_by || '-', fmt(e.debit || 0), fmt(e.credit || 0), fmt(runningBalance)] };
    });
    const printContent = reportTable(['Date', 'Description', 'Ref No', 'Posted By', 'Debit', 'Credit', 'Balance'], rows, { totalCells: ['', '', '', '', fmt(rows.reduce((s,r)=>s+Number(r.cells[4].replace(/[₱,]/g,'')),0)), fmt(rows.reduce((s,r)=>s+Number(r.cells[5].replace(/[₱,]/g,'')),0)), fmt(runningBalance)] });
    return res.type('html').send(printLayout('General Ledger', printContent, { subtitle: selected ? 'Account: ' + accName : 'All accounts', orientation: 'landscape', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'Auditor' }));
  }

  res.type('html').send(layout('General Ledger', 'gl-ledger', content, { subtitle: 'View individual account entries' }));
}));

// ── General Journal (BIR Format) ──

router.get('/gl/journal', requireRole(1), asyncHandler(async (req, res) => {
  const { getGeneralJournal } = require('../services/gl');
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const todayStr = now.toISOString().slice(0,10);
  const from = req.query.from || firstDay;
  const to = req.query.to || todayStr;
  const entries = await getGeneralJournal(from + 'T00:00:00', to + 'T23:59:59');

  // Group by transaction_id for folio
  const folios = {};
  entries.forEach(e => {
    const key = e.transaction_id || e.entry_id;
    if (!folios[key]) folios[key] = [];
    folios[key].push(e);
  });
  const folioKeys = Object.keys(folios);

  if (req.query.export === 'csv') {
    let csv = 'Date,Folio,AccountCode,AccountName,Debit,Credit,Reference,Description\n';
    entries.forEach(e => {
      csv += `${(e.created_at||'').slice(0,10)},${(e.transaction_id||'').slice(0,8)},${e.account_code},${e.account_name},${Number(e.debit).toFixed(2)},${Number(e.credit).toFixed(2)},${e.reference_number||''},${(e.description||'').replace(/"/g,'""')}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="general_journal_${from}_${to}.csv"`);
    return res.send(csv);
  }

  const content = `
  <form method="get" action="/admin/gl/journal" style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
    <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">From</label><input type="date" name="from" value="${from}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
    <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">To</label><input type="date" name="to" value="${to}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
    <button type="submit" class="btn btn-primary btn-sm">&#x1F50D; View</button>
    <a href="/admin/gl/journal" class="btn btn-outline btn-sm">&#x1F504; Reset</a>
    <div style="margin-left:auto;display:flex;gap:8px">
      <a href="/admin/gl/journal?from=${from}&to=${to}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
      <a href="/admin/gl/journal?from=${from}&to=${to}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
    </div>
  </form>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-book"></i></div><div class="stat-value">${entries.length}</div><div class="stat-label">Journal Entries</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div class="stat-value">${folioKeys.length}</div><div class="stat-label">Folios (Transactions)</div></div>
  </div>
  ${folioKeys.map(folio => {
    const folioEntries = folios[folio];
    const first = folioEntries[0];
    const dTotal = folioEntries.reduce((s, e) => s + Number(e.debit), 0);
    const cTotal = folioEntries.reduce((s, e) => s + Number(e.credit), 0);
    return `<div class="card">
      <div class="card-header">
        <h3><i class="fas fa-folder-open"></i> Folio: ${folio.slice(0,12)}</h3>
        <span class="count">${(first.created_at||'').slice(0,16).replace('T',' ')} | Posted by: ${first.posted_by || 'system'}</span>
      </div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>Account Code</th><th>Account Name</th><th class="num">Debit</th><th class="num">Credit</th><th>Reference</th><th>Description</th></tr>
        ${folioEntries.map(e => `<tr>
          <td class="mono">${e.account_code}</td>
          <td>${e.account_name}</td>
          <td class="num mono" style="color:#16a34a">${Number(e.debit) ? '&#x20B1;' + Number(e.debit).toFixed(2) : '-'}</td>
          <td class="num mono" style="color:#dc2626">${Number(e.credit) ? '&#x20B1;' + Number(e.credit).toFixed(2) : '-'}</td>
          <td class="mono" style="font-size:11px;color:var(--text-muted)">${e.reference_number || '-'}</td>
          <td>${e.description || '-'}</td>
        </tr>`).join('')}
        <tr style="font-weight:700;background:var(--bg2)">
          <td colspan="2">TOTAL</td>
          <td class="num mono" style="color:#16a34a">&#x20B1;${dTotal.toFixed(2)}</td>
          <td class="num mono" style="color:#dc2626">&#x20B1;${cTotal.toFixed(2)}</td>
          <td colspan="2"></td>
        </tr>
      </table></div>
    </div>`;
  }).join('') || '<div class="card"><div class="card-body-padded" style="text-align:center;padding:40px;color:var(--text-muted)">No journal entries for this period.</div></div>'}`;
  if (req.query.print) {
    let totalDebit = 0, totalCredit = 0;
    const rows = (entries || []).map(e => {
      totalDebit += Number(e.debit || 0);
      totalCredit += Number(e.credit || 0);
      return { cells: [e.transaction_id ? e.transaction_id.slice(0,8) : '-', e.account_code, e.account_name || '', e.description || '', e.reference_number || '-', e.posted_by || '-', e.created_at ? e.created_at.slice(0,10) : '-', fmt(e.debit || 0), fmt(e.credit || 0)] };
    });
    const printContent = reportTable(['Folio', 'Code', 'Account', 'Description', 'Ref No', 'Posted By', 'Date', 'Debit', 'Credit'], rows, { totalCells: ['', '', '', '', '', '', 'TOTAL', fmt(totalDebit), fmt(totalCredit)] });
    return res.type('html').send(printLayout('General Journal', printContent, { subtitle: 'BIR-compliant journal entries', dateRange: `${from} to ${to}`, orientation: 'landscape', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'Auditor' }));
  }
  res.type('html').send(layout('General Journal', 'gl-journal', content, { subtitle: `${from} to ${to}` }));
}));

// ── Audit Log ──

router.get('/audit-log', requireRole(1), asyncHandler(async (req, res) => {
  const { getLogs } = require('../services/audit');
  const limit = Number(req.query.limit) || 100;
  const offset = Number(req.query.offset) || 0;
  const logs = await getLogs(limit, offset);
  const actionColors = {
    TELLER_DEPOSIT:'badge-green',TELLER_WITHDRAWAL:'badge-red',
    LOAN_APPROVE:'badge-green',LOAN_REJECT:'badge-red',LOAN_DISBURSE:'badge-amber',
    ACCOUNT_CREATE:'badge-blue',ADMIN_DEPOSIT:'badge-green',ADMIN_WITHDRAWAL:'badge-red',
    TELLER_LOAN_PAYMENT:'badge-purple'
  };
  const content = `
  <div class="card">
    <div class="card-header"><h3>&#x1F4DD; Audit Log</h3><span class="count">${logs.length} entries</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Date</th><th>Admin</th><th>Action</th><th>Entity</th><th>ID</th><th>IP</th></tr>
      ${logs.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No audit entries yet</td></tr>' :
        logs.map(l => {
          const badge = actionColors[l.action] || 'badge-blue';
          return `<tr>
            <td class="mono" style="font-size:11px">${(l.created_at||'').slice(0,19).replace('T',' ')}</td>
            <td>${l.admin_name || l.admin_id || '-'}</td>
            <td><span class="badge ${badge}">${l.action.replace(/_/g,' ')}</span></td>
            <td>${l.entity_type || '-'}</td>
            <td class="mono" style="font-size:10px;color:var(--text-muted)">${l.entity_id ? l.entity_id.slice(0,8) : '-'}</td>
            <td class="mono" style="font-size:10px;color:var(--text-muted)">${l.ip_address || '-'}</td>
          </tr>`;
        }).join('')}
    </table></div>
  </div>
  <div style="display:flex;gap:8px;justify-content:center">
    ${offset > 0 ? `<a href="/admin/audit-log?limit=${limit}&offset=${Math.max(0, offset - limit)}" class="btn btn-outline btn-sm">&#x25C0; Previous ${limit}</a>` : ''}
    ${logs.length === limit ? `<a href="/admin/audit-log?limit=${limit}&offset=${offset + limit}" class="btn btn-outline btn-sm">Next ${limit} &#x25B6;</a>` : ''}
  </div>`;
  res.type('html').send(layout('Audit Log', 'audit-log', content, { subtitle: 'Track all admin actions with timestamps' }));
}));

// ── Admin Users ──

router.get('/users', requireRole(4), asyncHandler(async (req, res) => {
  const users = await sql('SELECT * FROM admin_users ORDER BY created_at ASC');
  const q = req.query;
  const toast = q.created ? 'success:Admin user created.'
    : q.updated ? 'success:Admin user updated.'
    : q.error ? `error:${q.error}`
    : '';
  const roleColors = { super_admin:'badge-red', manager:'badge-blue', teller:'badge-green', auditor:'badge-orange' };
  const membershipFee = await store.getSetting('membership_fee') || '100';
  const insuranceFee = await store.getSetting('insurance_fee') || '50';
  const initialSavings = await store.getSetting('initial_savings') || '100';

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F465;</div><div class="stat-value">${users.length}</div><div class="stat-label">Total Admins</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F451;</div><div class="stat-value">${users.filter(u => u.role === 'super_admin').length}</div><div class="stat-label">Super Admins</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4BC;</div><div class="stat-value">${users.filter(u => u.role === 'manager').length}</div><div class="stat-label">Managers</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F3E6;</div><div class="stat-value">${users.filter(u => u.role === 'teller').length}</div><div class="stat-label">Tellers</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x1F465; Admin Users</h3><span class="count">${users.filter(u => u.is_active).length} active</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Username</th><th>Display Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr>
      ${users.map(u => `
      <tr>
        <td class="mono"><b>${u.username}</b></td>
        <td>${u.display_name || '-'}</td>
        <td class="mono" style="font-size:12px">${u.email || '-'}</td>
        <td><span class="badge ${roleColors[u.role] || 'badge-gray'}">${u.role.replace(/_/g,' ')}</span></td>
        <td>${u.is_active ? '<span style="color:#16a34a;font-weight:600">&#x2705; Active</span>' : '<span style="color:#dc2626;font-weight:600">&#x274C; Inactive</span>'}</td>
        <td class="mono" style="font-size:11px;color:var(--text-muted)">${(u.created_at||'').slice(0,10)}</td>
        <td style="display:flex;gap:6px">
          <a href="/admin/users/edit/${u.admin_id}" class="btn btn-secondary btn-xs">&#x270F; Edit</a>
          <a href="/admin/users/deactivate/${u.admin_id}" class="btn ${u.is_active ? 'btn-danger' : 'btn-secondary'} btn-xs" data-confirm="${u.is_active ? 'Deactivate' : 'Activate'} ${u.username}?">${u.is_active ? 'Deactivate' : 'Activate'}</a>
        </td>
    </tr>`).join('')}
    </tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x2795; Create New Admin</h3></div>
    <div class="card-body-padded">
    <form method="post" action="/admin/users/create" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:500px">
      <div class="field"><label>Username</label><input type="text" name="username" placeholder="e.g. teller1" required></div>
      <div class="field"><label>Display Name</label><input type="text" name="display_name" placeholder="e.g. Juan Dela Cruz"></div>
      <div class="field"><label>Email</label><input type="email" name="email" placeholder="e.g. teller@labcoop.app"></div>
      <div class="field"><label>Password</label><input type="text" name="password" placeholder="Min 4 characters" required minlength="4"></div>
      <div class="field"><label>Role</label>
        <select name="role">
          <option value="teller">Teller (counter ops)</option>
          <option value="manager">Manager (approvals)</option>
          <option value="auditor">Auditor (read-only)</option>
          <option value="super_admin">Super Admin (full access)</option>
        </select>
      </div>
      <div style="grid-column:span 2"><button type="submit" class="btn btn-secondary">&#x2795; Create Admin User</button></div>
    </form>
    </div>
  </div>`;
  res.type('html').send(layout('Admin Users', 'users', content, { subtitle: 'Manage admin accounts and roles', toast }));
}));

router.post('/users/create', requireRole(4), asyncHandler(async (req, res) => {
  const { username, display_name, email, password, role } = req.body;
  if (!username || !password) return res.redirect('/admin/users?error=Username+and+password+required');
  const existing = await one('SELECT * FROM admin_users WHERE username = $1', [username]);
  if (existing) return res.redirect('/admin/users?error=Username+already+exists');
  const hash = bcrypt.hashSync(password, 10);
  await store.query(
    'INSERT INTO admin_users (admin_id, username, password_hash, role, display_name, email, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uuidv4(), username, hash, role || 'teller', display_name || username, email || '', new Date().toISOString()]
  );
  res.redirect('/admin/users?created=ok');
}));

router.get('/users/deactivate/:id', requireRole(4), asyncHandler(async (req, res) => {
  await store.query('UPDATE admin_users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE admin_id = $1', [req.params.id]);
  res.redirect('/admin/users?updated=ok');
}));

router.get('/users/edit/:id', requireRole(4), asyncHandler(async (req, res) => {
  const u = await one('SELECT * FROM admin_users WHERE admin_id = $1', [req.params.id]);
  if (!u) return res.redirect('/admin/users?error=User+not+found');
  const err = req.query.error ? req.query.error : '';
  const roleOptions = ['super_admin','manager','teller','auditor'];
  const content = `
  <div class="card" style="max-width:500px;margin:0 auto">
    <div class="card-header"><h3>&#x270F; Edit Admin: ${u.username}</h3></div>
    <div class="card-body-padded">
      ${err ? `<p style="color:var(--danger);font-weight:600;margin-bottom:12px">&#x274C; ${err}</p>` : ''}
      <form method="post" action="/admin/users/update/${u.admin_id}" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:500px">
        <div class="field"><label>Username</label><input type="text" name="username" value="${u.username}" required></div>
        <div class="field"><label>Display Name</label><input type="text" name="display_name" value="${u.display_name || ''}"></div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${u.email || ''}"></div>
        <div class="field"><label>New Password (leave blank to keep)</label><input type="password" name="password" placeholder="Min 4 characters" minlength="4"></div>
        <div class="field"><label>Role</label>
          <select name="role">
            ${roleOptions.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}
          </select>
        </div>
        <div style="grid-column:span 2;display:flex;gap:8px">
          <button type="submit" class="btn btn-secondary">&#x1F4BE; Save Changes</button>
          <a href="/admin/users" class="btn btn-cancel">Cancel</a>
        </div>
      </form>
    </div>
  </div>`;
  res.type('html').send(layout('Edit Admin', 'users', content, { subtitle: 'Update admin account details' }));
}));

router.post('/users/update/:id', requireRole(4), asyncHandler(async (req, res) => {
  const u = await one('SELECT * FROM admin_users WHERE admin_id = $1', [req.params.id]);
  if (!u) return res.redirect('/admin/users?error=User+not+found');
  const { username, display_name, email, role, password } = req.body;
  if (!username) return res.redirect(`/admin/users/edit/${req.params.id}?error=Username+required`);
  // Check unique username excluding current user
  const dup = await one('SELECT * FROM admin_users WHERE username = $1 AND admin_id != $2', [username, req.params.id]);
  if (dup) return res.redirect(`/admin/users/edit/${req.params.id}?error=Username+already+taken`);
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await store.query('UPDATE admin_users SET username=$1, display_name=$2, email=$3, role=$4, password_hash=$5 WHERE admin_id=$6',
      [username, display_name || username, email || '', role || 'teller', hash, req.params.id]);
  } else {
    await store.query('UPDATE admin_users SET username=$1, display_name=$2, email=$3, role=$4 WHERE admin_id=$5',
      [username, display_name || username, email || '', role || 'teller', req.params.id]);
  }
  res.redirect('/admin/users?updated=ok');
}));

// ── First-run setup (no session required) ──
router.get('/setup', asyncHandler(async (req, res) => {
  const result = await store.query('SELECT COUNT(*) as c FROM admin_users');
  if (parseInt(result.rows[0]?.c || '0', 10) > 0) {
    return res.type('html').send('<h2>Admin already exists. <a href="/admin/login">Login</a></h2>');
  }
  const hash = require('bcryptjs').hashSync('admin123', 10);
  await store.query(
    'INSERT INTO admin_users (admin_id, username, password_hash, role, display_name, is_active, created_at) VALUES ($1,$2,$3,$4,$5,1,$6)',
    [require('uuid').v4(), 'admin', hash, 'super_admin', 'Default Admin', new Date().toISOString()]
  );
  res.type('html').send('<h2 style="color:#16a34a">&#x2705; Admin created! <a href="/admin/login">Login</a> with <b>admin</b> / <b>admin123</b></h2>');
}));

module.exports = router;
