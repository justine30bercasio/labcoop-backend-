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
const { layout } = require('./admin-lib');

const _p = (...p) => p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
const sql = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows);
const one = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows[0]);

const router = express.Router();

function requireSession(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.redirect('/admin/login');
  }
  next();
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

router.post('/upload', requireSession, upload.single('file'), (req, res) => {
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

router.post('/upload-and-seed', requireSession, upload.single('file'), (req, res) => {
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
              store.updateAccount(row.account_id || row.accountId, {
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
              store.createGoal({
                account_id: row.account_id || row.accountId,
                title: row.title,
                target_amount: Number(row.target_amount || row.targetAmount || 0),
                current_allocated: Number(row.current_allocated || row.currentAllocated || 0),
                category_icon: row.category_icon || row.categoryIcon || 'savings',
              });
              goals++;
              break;
            case 'badges':
              store.unlockBadges(row.account_id || row.accountId, Number(row.current_xp || row.currentXp || 0));
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
});

router.get('/', requireSession, asyncHandler(async (req, res) => {
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
  const pendingSavingsApps = Number((await one("SELECT COUNT(*) as c FROM savings_applications WHERE status='pending'")).c);
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
  const maxDaily = Math.max(...dayDeposits.concat(dayWithdrawals), 1);

  const topAccounts = [...accounts].sort((a,b) => Number(b.actual_balance) - Number(a.actual_balance)).slice(0, 8);
  const topBalances = topAccounts.map(a => Number(a.actual_balance));
  const balanceTotal = topBalances.reduce((s,v) => s + v, 0) || 1;
  const pieColors = ['#22c55e','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#14b8a6'];

  const xpTop = [...accounts].sort((a,b) => Number(b.current_xp) - Number(a.current_xp)).slice(0, 6);
  const maxXp = Math.max(...xpTop.map(a => Number(a.current_xp)), 1);

  const cashIn = transactions.filter(t => ['deposit','loan_disbursement','interest_credit','interest'].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const cashOut = transactions.filter(t => ['withdrawal','loan_payment'].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const netFlow = cashIn - cashOut;

  const pendingTotal = pendingLoans + pendingWithdrawals + pendingSavingsApps;

  // ── SVG chart builders ──

  function barChart(data, labels, colors, opts) {
    const h = opts?.height || 160;
    const w = opts?.width || '100%';
    const barW = Math.max(8, Math.min(28, Math.floor(260 / data.length)));
    const gap = 4;
    const max = Math.max(...data, 1);
    const bars = data.map((v, i) => {
      const bh = Math.max(2, (v / max) * (h - 28));
      const x = i * (barW + gap) + 8;
      return `<rect x="${x}" y="${h - 16 - bh}" width="${barW}" height="${bh}" fill="${colors[i % colors.length]}" rx="2"><title>${labels[i]}: &#x20B1;${v.toFixed(0)}</title></rect>`;
    }).join('');
    const labelsEl = labels.map((l, i) => {
      const x = i * (barW + gap) + 8 + barW / 2;
      return `<text x="${x}" y="${h - 2}" text-anchor="middle" font-size="8" fill="#94a3b8" transform="rotate(-20,${x},${h-2})">${l.split(' ')[0]}</text>`;
    }).join('');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${data.length * (barW + gap) + 16} ${h}" style="display:block;margin:0 auto">${bars}${labelsEl}</svg>`;
  }

  function pieChart(values, labels, colors, total) {
    const cx = 60, cy = 60, r = 48, ir = 28;
    const t = total || values.reduce((s,v) => s + v, 0) || 1;
    let offset = 0;
    const circ = 2 * Math.PI * r;
    const slices = values.map((v, i) => {
      const pct = v / t;
      const len = circ * pct;
      const o = offset; offset += len;
      // Simple approach: use stroke-dasharray
      if (pct < 0.001) return '';
      const dash = `${len} ${circ - len}`;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="${r - ir}" stroke-dasharray="${dash}" stroke-dashoffset="${-o}" transform="rotate(-90,${cx},${cy})"><title>${labels[i]}: ${(pct*100).toFixed(1)}%</title></circle>`;
    }).join('');
    return `<svg width="180" height="120" viewBox="0 0 120 120"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${r - ir}"/>${slices}<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text)">${t.toFixed(0)}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="8" fill="#94a3b8">total</text></svg>`;
  }

  function hBar(data, labels, colors, max) {
    const m = max || Math.max(...data, 1);
    const h = 20;
    const labelW = 80;
    const barArea = 160;
    const bars = data.map((v, i) => {
      const bw = Math.max(4, (v / m) * (barArea - 10));
      return `<g transform="translate(${labelW + 4}, ${i * (h + 4) + 4})">
        <rect x="0" y="0" width="${bw}" height="16" fill="${colors[i % colors.length]}" rx="3"><title>${v}</title></rect>
        <text x="${bw + 4}" y="12" font-size="10" font-weight="600" fill="var(--text)">${v > 999 ? (v/1000).toFixed(1) + 'k' : v}</text>
      </g>`;
    }).join('');
    const lbls = labels.map((l, i) => `<text x="0" y="${i * (h + 4) + 16}" font-size="11" fill="#94a3b8" text-anchor="end">${l}</text>`).join('');
    return `<svg width="${labelW + barArea + 40}" height="${data.length * (h + 4) + 8}" viewBox="0 0 ${labelW + barArea + 40} ${data.length * (h + 4) + 8}">${lbls}${bars}</svg>`;
  }

  // ── Build HTML ──

  const content = `
  <style>
  .dash-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
  .dash-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:20px; }
  .dash-grid-full { grid-column:1/-1; }
  .section-title { font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:12px; display:flex; align-items:center; gap:6px; padding-top:8px; }
  .section-title:after { content:''; flex:1; height:1px; background:var(--border); margin-left:8px; }
  .quick-actions { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; margin-bottom:20px; }
  .quick-action-btn { display:flex; flex-direction:column; align-items:center; gap:5px; padding:12px 6px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); text-decoration:none; color:var(--text); font-size:10px; font-weight:500; transition:all 0.2s; position:relative; }
  .quick-action-btn:hover { border-color:var(--accent); transform:translateY(-3px); box-shadow:0 4px 16px rgba(46,125,50,0.15); }
  .quick-action-btn .qa-icon { font-size:20px; }
  .quick-action-btn .qa-badge { position:absolute; top:-4px; right:-4px; background:var(--red); color:#fff; font-size:9px; padding:1px 5px; border-radius:8px; min-width:18px; text-align:center; }
  .pending-alert { background:linear-gradient(135deg,#fff8e1,#fff3cd); border:1px solid #ffe082; border-radius:var(--radius); padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; animation:slideDown 0.3s ease; }
  @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
  .pending-alert .pa-icon { font-size:18px; }
  .pending-alert .pa-text { font-size:13px; color:#F57F17; font-weight:500; flex:1; }
  .chart-card { background:var(--card); border-radius:var(--radius); box-shadow:var(--shadow); border:1px solid var(--border); padding:16px; }
  .chart-card .chart-title { font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; }
  .chart-card .chart-title .chart-badge { font-size:18px; font-weight:700; color:var(--text); text-transform:none; letter-spacing:0; }
  .chart-card svg { max-width:100%; }
  .mini-legend { display:flex; gap:12px; margin-top:6px; font-size:10px; color:var(--text-muted); flex-wrap:wrap; }
  .mini-legend span { display:flex; align-items:center; gap:4px; }
  .mini-legend .dot { width:8px; height:8px; border-radius:2px; display:inline-block; }
  .insight-banner { background:linear-gradient(135deg,#e8f5e9,#c8e6c9); border:1px solid #a5d6a7; border-radius:var(--radius); padding:14px 18px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:16px; }
  .insight-banner .ib-icon { font-size:22px; }
  .insight-banner .ib-text { flex:1; font-size:13px; color:#1B5E20; }
  .insight-banner .ib-stat { font-size:22px; font-weight:700; color:#1B5E20; text-align:center; }
  .insight-banner .ib-stat small { display:block; font-size:10px; font-weight:400; opacity:0.7; }
  .insight-red { background:linear-gradient(135deg,#fce4ec,#f8bbd0); border-color:#ef9a9a; }
  .insight-red .ib-text, .insight-red .ib-stat { color:#b71c1c; }
  .insight-amber { background:linear-gradient(135deg,#fff8e1,#ffecb3); border-color:#ffe082; }
  .insight-amber .ib-text, .insight-amber .ib-stat { color:#e65100; }
  .trend-up { color:#16a34a; }
  .trend-down { color:#dc2626; }
  .dash-table-wrap { max-height:260px; overflow-y:auto; }
  .dash-table-wrap::-webkit-scrollbar { width:4px; }
  .dash-table-wrap::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:2px; }
  .no-data { padding:24px; text-align:center; color:var(--text-muted); font-size:13px; }
  </style>

  ${pendingTotal > 0 ? `
  <div class="pending-alert">
    <span class="pa-icon">&#x26A0;&#xFE0F;</span>
    <span class="pa-text">${pendingLoans} pending loan${pendingLoans !== 1 ? 's' : ''} &middot; ${pendingWithdrawals} withdrawal${pendingWithdrawals !== 1 ? 's' : ''} &middot; ${pendingSavingsApps} savings app${pendingSavingsApps !== 1 ? 's' : ''}</span>
    ${pendingLoans > 0 ? `<a href="/admin/loans?status=pending" class="btn btn-amber btn-xs">Review Loans</a>` : ''}
    ${pendingWithdrawals > 0 ? `<a href="/admin/withdrawal-requests?status=pending" class="btn btn-amber btn-xs">Review Withdrawals</a>` : ''}
    ${pendingSavingsApps > 0 ? `<a href="/admin/savings-applications?status=pending" class="btn btn-amber btn-xs">Review Apps</a>` : ''}
  </div>` : ''}

  <!-- Quick Actions -->
  <div class="section-title">Quick Actions</div>
  <div class="quick-actions">
    <a href="/admin/teller" class="quick-action-btn"><span class="qa-icon">&#x1F3E6;</span><span class="qa-label">Teller</span></a>
    <a href="/admin/accounts" class="quick-action-btn"><span class="qa-icon">&#x2795;</span><span class="qa-label">New Account</span></a>
    <a href="/admin/loans" class="quick-action-btn"><span class="qa-icon">&#x1F4B0;</span><span class="qa-label">Loans${pendingLoans > 0 ? `<span class="qa-badge">${pendingLoans}</span>` : ''}</span></a>
    <a href="/admin/withdrawal-requests" class="quick-action-btn"><span class="qa-icon">&#x1F4B8;</span><span class="qa-label">Withdrawals${pendingWithdrawals > 0 ? `<span class="qa-badge">${pendingWithdrawals}</span>` : ''}</span></a>
    <a href="/admin/savings-applications" class="quick-action-btn"><span class="qa-icon">&#x1F4B1;</span><span class="qa-label">Savings Apps${pendingSavingsApps > 0 ? `<span class="qa-badge">${pendingSavingsApps}</span>` : ''}</span></a>
    <a href="/admin/gl/trial-balance" class="quick-action-btn"><span class="qa-icon">&#x2696;</span><span class="qa-label">GL Reports</span></a>
    <a href="/admin/audit" class="quick-action-btn"><span class="qa-icon">&#x1F4DC;</span><span class="qa-label">Audit</span></a>
    <a href="/api/excel/export/all" class="quick-action-btn"><span class="qa-icon">&#x1F4E5;</span><span class="qa-label">Export</span></a>
  </div>

  <!-- Insight Banner -->
  ${accounts.length > 0 ? `
  <div class="insight-banner">
    <span class="ib-icon">&#x1F4CA;</span>
    <div class="ib-text">
      <strong>System Summary</strong> &mdash;
      ${accounts.length} member${accounts.length !== 1 ? 's' : ''} with &#x20B1;${totalBalance.toFixed(2)} total savings
      ${accounts.length > 0 ? `&middot; Avg &#x20B1;${(totalBalance / accounts.length).toFixed(0)}/member` : ''}
      &middot; ${transactions.length} recent transactions
    </div>
    <div class="ib-stat">${netFlow >= 0 ? '+' : ''}&#x20B1;${netFlow.toFixed(0)}<small>Net Cash Flow</small></div>
  </div>` : ''}

  <!-- Stats Row -->
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F464;</div><div class="stat-value">${accounts.length}</div><div class="stat-label">Total Members</div><div class="stat-sub">${accounts.filter(a => Number(a.actual_balance) > 0).length} active savers</div></div>
    <div class="stat-card" style="border-left:3px solid var(--accent)"><div class="stat-icon">&#x1F4B0;</div><div class="stat-value">&#x20B1;${totalBalance.toFixed(0)}</div><div class="stat-label">Total Deposits</div><div class="stat-sub">&#x20B1;${(totalBalance / (accounts.length || 1)).toFixed(0)} avg per member</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value">${transactions.length}</div><div class="stat-label">Transactions</div><div class="stat-sub">${dayCounts[6] || 0} today</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F3AF;</div><div class="stat-value">${goals.length}</div><div class="stat-label">Goal Jars</div><div class="stat-sub">${completedGoals} completed (${goals.length > 0 ? (completedGoals / goals.length * 100).toFixed(0) : 0}%)</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F3C6;</div><div class="stat-value">${unlockedBadges}<span style="font-size:13px;color:var(--text-muted)">/${totalBadges}</span></div><div class="stat-label">Badges Unlocked</div><div class="stat-bar"><div class="stat-bar-fill" style="width:${totalBadges > 0 ? (unlockedBadges/totalBadges*100).toFixed(0) : 0}%;background:var(--purple)"></div></div></div>
    <div class="stat-card"><div class="stat-icon">&#x2728;</div><div class="stat-value">${totalXp.toLocaleString()}</div><div class="stat-label">Total XP Earned</div><div class="stat-sub">${accounts.length > 0 ? (totalXp / accounts.length).toFixed(0) : 0} avg per member</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B0;</div><div class="stat-value">${Number(loanStats.total_loans || 0)}</div><div class="stat-label">Loan Portfolio</div><div class="stat-sub">&#x20B1;${Number(loanStats.outstanding || 0).toFixed(0)} outstanding</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4CA;</div><div class="stat-value">${activeLoanProducts + shopItemsCount}</div><div class="stat-label">Active Products</div><div class="stat-sub">${activeLoanProducts} loan &middot; ${shopItemsCount} shop</div></div>
  </div>

  <!-- Charts Row -->
  <div class="section-title">Analytics</div>
  <div class="dash-grid">
    <div class="chart-card">
      <div class="chart-title">Daily Transaction Volume <span class="chart-badge">&#x20B1;${(dayDeposits.reduce((s,v) => s+v, 0) + dayWithdrawals.reduce((s,v) => s+v, 0)).toFixed(0)}</span></div>
      ${dayDeposits.reduce((s,v) => s+v, 0) + dayWithdrawals.reduce((s,v) => s+v, 0) > 0 ? barChart(dayDeposits, dayLabels, ['#22c55e','#3b82f6']) : '<div class="no-data">No transaction data in the last 7 days</div>'}
      <div class="mini-legend"><span><span class="dot" style="background:#22c55e"></span> Deposits (&#x20B1;${dayDeposits.reduce((s,v) => s+v, 0).toFixed(0)})</span><span><span class="dot" style="background:#3b82f6"></span> Withdrawals (&#x20B1;${dayWithdrawals.reduce((s,v) => s+v, 0).toFixed(0)})</span></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Balance Distribution <span class="chart-badge">${topAccounts.length} members</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        ${topAccounts.length > 0 ? pieChart(topBalances, topAccounts.map(a => a.child_name), pieColors, balanceTotal) : '<div class="no-data" style="flex:1">No accounts</div>'}
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
      ${xpTop.length > 0 ? hBar(xpTop.map(a => Number(a.current_xp)), xpTop.map(a => a.child_name), ['#f59e0b','#3b82f6','#22c55e','#8b5cf6','#ef4444','#06b6d4'], maxXp) : '<div class="no-data">No XP data</div>'}
    </div>

    <div class="chart-card">
      <div class="chart-title">Cash Flow <span class="chart-badge">${netFlow >= 0 ? '+' : ''}&#x20B1;${netFlow.toFixed(0)}</span></div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0">
        <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:700;color:#16a34a">&#x20B1;${cashIn.toFixed(0)}</div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Cash In</div></div>
        <div style="width:40px;height:40px;border-radius:50%;background:${netFlow >= 0 ? '#e8f5e9' : '#fce4ec'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${netFlow >= 0 ? '&#x2191;' : '&#x2193;'}</div>
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
      <div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 0">
        ${['deposit','withdrawal','loan_disbursement','loan_payment','interest_credit','allocation'].map(type => {
          const count = transactions.filter(t => t.type === type).length;
          const total = transactions.filter(t => t.type === type).reduce((s,t) => s + Number(t.amount), 0);
          if (count === 0) return '';
          const colors = {deposit:'#22c55e',withdrawal:'#ef4444',loan_disbursement:'#f59e0b',loan_payment:'#3b82f6',interest_credit:'#8b5cf6',allocation:'#06b6d4'};
          return `<div style="flex:1;min-width:80px;background:${colors[type]}15;border:1px solid ${colors[type]}30;border-radius:8px;padding:8px 10px;text-align:center">
            <div style="font-size:11px;font-weight:600;color:${colors[type]}">${type.replace(/_/g,' ')}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">${count}</div>
            <div style="font-size:9px;color:var(--text-muted)">&#x20B1;${total.toFixed(0)}</div>
          </div>`;
        }).filter(Boolean).join('') || '<div class="no-data">No activity</div>'}
      </div>
    </div>
  </div>

  <!-- Excel Import + Tables -->
  <div class="section-title">Data Management</div>
  <div class="dash-grid">
    <div class="card">
      <div class="card-header"><h3>&#x1F4C4; Excel Import</h3></div>
      <div class="card-body-padded">
      <form method="post" enctype="multipart/form-data" style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="file" name="file" accept=".xlsx,.xls,.csv" required style="flex:1;min-width:140px;padding:6px;border:2px solid var(--border);border-radius:6px;font-size:12px">
        <button type="submit" formaction="/admin/upload" class="btn btn-secondary btn-xs">Parse</button>
        <button type="submit" formaction="/admin/upload-and-seed" class="btn btn-primary btn-xs">Parse &amp; Seed</button>
      </form>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>&#x1F91D; Co-op Goals</h3><span class="count">${completedCoopGoals}/${totalCoopGoals}</span></div>
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

  <div class="section-title">Members & Activity</div>
  <div class="dash-grid">
    <div class="card">
      <div class="card-header"><h3>&#x1F464; Members</h3><span class="count">${accounts.length} total</span><a href="/admin/accounts" class="btn btn-outline btn-xs">Manage</a></div>
      <div class="card-body dash-table-wrap">
      <table><tr><th>Name</th><th>Balance</th><th>XP</th><th>Goals</th></tr>
      ${accounts.length === 0 ? '<tr><td colspan="4" class="no-data">No accounts</td></tr>' : accounts.map(a => {
        const goalCount = goals.filter(g => g.account_id === a.account_id).length;
        return `<tr>
        <td><b>${a.child_name}</b></td>
        <td class="num">&#x20B1;${Number(a.actual_balance).toFixed(2)}</td>
        <td class="num">${a.current_xp}</td>
        <td class="num">${goalCount}</td>
      </tr>`;}).join('')}
      </table></div>
    </div>

    <div class="card">
      <div class="card-header"><h3>&#x1F4B3; Recent Transactions</h3><span class="count">recent ${Math.min(transactions.length, 8)}</span><a href="/admin/transactions" class="btn btn-outline btn-xs">View All</a></div>
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
  `;

  res.type('html').send(layout('Dashboard', 'dashboard', content, {
    subtitle: now.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    headerActions: '<a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x2696; Trial Balance</a><a href="/api/excel/export/all" class="btn btn-secondary btn-sm">&#x1F4E5; Export</a>',
  }));
}));

router.get('/shop', requireSession, asyncHandler(async (req, res) => {

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
.card-body { overflow-x:auto; padding:0; }

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
    <a href="/admin/savings-applications"><span class="icon">&#x1F4B1;</span> <span>Savings Apps</span></a>
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
        <form method="post" action="/admin/shop/delete/${item.id}" onsubmit="return confirm('Delete ${item.name}?')">
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

router.post('/shop/create', requireSession, shopUpload.single('image'), asyncHandler(async (req, res) => {
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

router.post('/shop/update/:id', requireSession, asyncHandler(async (req, res) => {
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

router.post('/shop/delete/:id', requireSession, asyncHandler(async (req, res) => {
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

router.post('/shop/upload/:id', requireSession, shopUpload.single('image'), asyncHandler(async (req, res) => {
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

router.get('/quiz', requireSession, asyncHandler(async (req, res) => {

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
          <form class="inline" method="post" action="/admin/quiz/delete/${qu.id}" onsubmit="return confirm('Delete this question?')">
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

router.post('/quiz/create', requireSession, asyncHandler(async (req, res) => {
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

router.post('/quiz/update/:id', requireSession, asyncHandler(async (req, res) => {
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

router.post('/quiz/delete/:id', requireSession, asyncHandler(async (req, res) => {
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

router.get('/accounts', requireSession, asyncHandler(async (req, res) => {

  const accounts = await sql('SELECT * FROM accounts ORDER BY child_name ASC');
  const q = req.query;
  const toast = q.added ? 'success:Account created.'
    : q.updated ? 'success:Account updated.'
    : q.deleted ? 'success:Account deleted.'
    : q.deposited ? 'success:Deposit added.'
    : q.withdrawn ? 'success:Withdrawal completed.'
    : q.error ? `error:${q.error}`
    : '';

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F464;</div><div class="stat-value">${accounts.length}</div><div class="stat-label">Total Accounts</div></div>
    <div class="stat-card"><div class="stat-icon">&#x20B1;</div><div class="stat-value">${accounts.reduce((s,a)=>s+Number(a.actual_balance),0).toFixed(0)}</div><div class="stat-label">Combined Balance</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2728;</div><div class="stat-value">${accounts.reduce((s,a)=>s+Number(a.current_xp),0)}</div><div class="stat-label">Total XP</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F464; All Accounts</h3>
      <div><a href="#add-account" class="btn btn-primary btn-sm">&#x2795; New Account</a></div>
    </div>
    <div class="card-body">
    <table><tr><th>Name</th><th>Member ID</th><th>Age</th><th>Gender</th><th>Schedule</th><th>Balance</th><th>XP</th><th>Password</th><th>Phone</th><th>Created</th><th>Actions</th></tr>
    ${accounts.map(a => `<tr>
      <td><b>${a.child_name}</b>${a.last_name ? `<br><small style="color:var(--text-muted)">${a.last_name}, ${a.first_name}${a.middle_name ? ' ' + a.middle_name : ''}</small>` : ''}</td>
      <td class="mono">${a.member_id || '-'}</td>
      <td class="num">${a.age || '-'}</td>
      <td>${a.gender || '-'}</td>
      <td>${a.savings_schedule || '-'}</td>
      <td class="num">&#x20B1;${Number(a.actual_balance).toFixed(2)}</td>
      <td class="num">${a.current_xp}</td>
      <td><span class="badge ${a.password_changed ? 'badge-green' : 'badge-red'}">${a.password_changed ? 'Changed' : 'Default'}</span></td>
      <td>${a.parent_phone || '-'}</td>
      <td class="mono">${(a.created_at || '').slice(0, 10)}</td>
      <td><div style="display:flex;gap:4px">
        <a href="#edit-${a.account_id}" class="btn btn-secondary btn-xs">&#x270F;</a>
        <a href="#deposit-${a.account_id}" class="btn btn-amber btn-xs">&#x1F4B5;</a>
        <a href="#withdraw-${a.account_id}" class="btn btn-outline btn-xs">&#x1F4B8;</a>
        <form class="inline" method="post" action="/admin/accounts/delete/${a.account_id}" onsubmit="return confirm('Delete ${a.child_name}?')">
          <button type="submit" class="btn btn-danger btn-xs">&#x1F5D1;</button>
        </form>
      </div></td>
    </tr>`).join('')}
    </table></div>
  </div>

  <div id="add-account" class="modal-overlay">
  <div class="modal" style="max-width:520px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Account</h2>
  <form method="post" action="/admin/accounts/create">
    <label for="aname">Child Name (display name)</label>
    <input type="text" id="aname" name="child_name" placeholder="e.g. Juan" required>
    <div class="form-row">
      <div><label for="alast">Last Name</label><input type="text" id="alast" name="last_name" placeholder="Dela Cruz"></div>
      <div><label for="afirst">First Name</label><input type="text" id="afirst" name="first_name" placeholder="Juan"></div>
      <div><label for="amid">Middle Name</label><input type="text" id="amid" name="middle_name" placeholder="Optional"></div>
    </div>
    <div class="form-row">
      <div><label for="abday">Birthday</label><input type="date" id="abday" name="birthday"></div>
      <div><label for="agender">Gender</label><select id="agender" name="gender"><option value="">--</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
      <div><label for="asched">Savings Schedule</label><select id="asched" name="savings_schedule"><option value="">--</option><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option><option value="Monthly">Monthly</option><option value="Every Quarter">Every Quarter</option></select></div>
    </div>
    <label for="abalance">Initial Balance (&#x20B1;)</label>
    <input type="number" id="abalance" name="actual_balance" min="0" value="0">
    <label for="axp">Initial XP</label>
    <input type="number" id="axp" name="current_xp" min="0" value="0">
    <label for="aphone">Parent Phone</label>
    <input type="text" id="aphone" name="parent_phone" placeholder="Optional">
    <button type="submit" class="btn btn-primary">&#x2795; Create Account</button>
  </form>
  </div>
  </div>

  ${accounts.map(a => `
  <div id="edit-${a.account_id}" class="modal-overlay">
  <div class="modal" style="max-width:520px">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${a.child_name}</h2>
  <form method="post" action="/admin/accounts/update/${a.account_id}">
    <label for="en_${a.account_id}">Child Name</label>
    <input type="text" id="en_${a.account_id}" name="child_name" value="${a.child_name}" required>
    <div class="form-row">
      <div><label for="elast_${a.account_id}">Last Name</label><input type="text" id="elast_${a.account_id}" name="last_name" value="${a.last_name || ''}"></div>
      <div><label for="efirst_${a.account_id}">First Name</label><input type="text" id="efirst_${a.account_id}" name="first_name" value="${a.first_name || ''}"></div>
      <div><label for="emid_${a.account_id}">Middle Name</label><input type="text" id="emid_${a.account_id}" name="middle_name" value="${a.middle_name || ''}"></div>
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
    <label for="exp_${a.account_id}">XP</label>
    <input type="number" id="exp_${a.account_id}" name="current_xp" min="0" value="${a.current_xp}">
    <label for="ephone_${a.account_id}">Parent Phone</label>
    <input type="text" id="ephone_${a.account_id}" name="parent_phone" value="${a.parent_phone || ''}">
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save Changes</button>
  </form>
  </div>
  </div>

  <div id="deposit-${a.account_id}" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x1F4B5; Deposit to ${a.child_name}</h2>
  <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Current balance: &#x20B1;${Number(a.actual_balance).toFixed(2)}</p>
  <form method="post" action="/admin/accounts/deposit/${a.account_id}">
    <label for="damount_${a.account_id}">Amount (&#x20B1;)</label>
    <input type="number" id="damount_${a.account_id}" name="amount" min="1" step="0.01" placeholder="e.g. 100" required>
    <label for="ddesc_${a.account_id}">Description</label>
    <input type="text" id="ddesc_${a.account_id}" name="description" placeholder="e.g. Allowance" value="Admin deposit">
    <button type="submit" class="btn btn-amber">&#x1F4B5; Deposit</button>
  </form>
  </div>
  </div>

  <div id="withdraw-${a.account_id}" class="modal-overlay">
  <div class="modal">
  <a href="#" class="close">&times;</a>
  <h2>&#x1F4B8; Withdraw from ${a.child_name}</h2>
  <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Current balance: &#x20B1;${Number(a.actual_balance).toFixed(2)} &middot; Available: &#x20B1;${Number(a.unallocated_balance).toFixed(2)}</p>
  <form method="post" action="/admin/accounts/withdraw/${a.account_id}">
    <label for="wamount_${a.account_id}">Amount (&#x20B1;)</label>
    <input type="number" id="wamount_${a.account_id}" name="amount" min="1" step="0.01" placeholder="e.g. 50" required>
    <label for="wdesc_${a.account_id}">Description</label>
    <input type="text" id="wdesc_${a.account_id}" name="description" placeholder="e.g. Cash withdrawal" value="Admin withdrawal">
    <button type="submit" class="btn btn-danger">&#x1F4B8; Withdraw</button>
  </form>
  </div>
  </div>`).join('')}
  `;

  res.type('html').send(layout('Accounts', 'accounts', content, {
    toast,
    subtitle: `${accounts.length} accounts registered`,
  }));
}));

router.post('/accounts/create', requireSession, asyncHandler(async (req, res) => {
  try {
    const { child_name, actual_balance, current_xp, parent_phone, last_name, first_name, middle_name, birthday, gender, savings_schedule } = req.body;
    if (!child_name) return res.redirect('/admin/accounts?error=Name+required');

    const maxResult = await store.query("SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts");
    const maxMember = parseInt(maxResult.rows[0]?.m || '0', 10);
    const account = await store.createAccount({
      child_name: child_name.trim().toUpperCase(),
      last_name: (last_name || '').trim().toUpperCase(),
      first_name: (first_name || '').trim().toUpperCase(),
      middle_name: (middle_name || '').trim().toUpperCase(),
      birthday: birthday || '',
      gender: gender || '',
      savings_schedule: savings_schedule || '',
      actual_balance: Number(actual_balance) || 0,
      unallocated_balance: Number(actual_balance) || 0,
      current_xp: Number(current_xp) || 0,
      parent_phone: parent_phone || '',
      password: bcrypt.hashSync('0000', 10),
    });
    await store.query('UPDATE accounts SET member_id=$1 WHERE account_id=$2', [String(maxMember + 1).padStart(6, '0'), account.account_id]);
    try { const audit = require('../services/audit'); await audit.log(req, 'ACCOUNT_CREATE', 'account', account.account_id, { child_name: child_name.trim(), initial_balance: Number(actual_balance) || 0 }); } catch (e) {}
    res.redirect('/admin/accounts?added=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/update/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const { child_name, actual_balance, unallocated_balance, current_xp, parent_phone, last_name, first_name, middle_name, birthday, gender, savings_schedule } = req.body;
    store.updateAccount(req.params.id, {
      child_name: child_name?.trim().toUpperCase(),
      actual_balance: Number(actual_balance),
      unallocated_balance: Number(unallocated_balance),
      current_xp: Number(current_xp),
      parent_phone: parent_phone || '',
      last_name: (last_name || '').trim().toUpperCase(),
      first_name: (first_name || '').trim().toUpperCase(),
      middle_name: (middle_name || '').trim().toUpperCase(),
      birthday: birthday || '',
      gender: gender || '',
      savings_schedule: savings_schedule || '',
    });
    res.redirect('/admin/accounts?updated=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/deposit/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/accounts?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    const newBalance = Number(account.actual_balance) + val;
    await store.query('UPDATE accounts SET actual_balance=$1, unallocated_balance=unallocated_balance+$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3', [newBalance, val, req.params.id]);
    const result = store.addTransaction({
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
      ]);
      const audit = require('../services/audit');
      await audit.log(req, 'ADMIN_DEPOSIT', 'account', req.params.id, { amount: val, txId, desc: description || 'Admin deposit' });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    res.redirect('/admin/accounts?deposited=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/withdraw/:id', requireSession, asyncHandler(async (req, res) => {
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
    const result = store.addTransaction({
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
      ]);
      const audit = require('../services/audit');
      await audit.log(req, 'ADMIN_WITHDRAWAL', 'account', req.params.id, { amount: val, txId, desc: description || 'Admin withdrawal' });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    res.redirect('/admin/accounts?withdrawn=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/accounts/delete/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/accounts?error=Account+not+found');
    await store.query('DELETE FROM accounts WHERE account_id = $1', [req.params.id]);
    res.redirect('/admin/accounts?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Goals Management ──

router.get('/goals', requireSession, asyncHandler(async (req, res) => {

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
        <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
          <option value="">All Accounts</option>
          ${accounts.map(a => `<option value="${a.account_id}"${a.account_id===filterAccount?' selected':''}>${a.child_name}</option>`).join('')}
        </select>
        <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
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
        <form class="inline" method="post" action="/admin/goals/delete/${g.goal_id}" onsubmit="return confirm('Delete goal ${g.title}?')">
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

router.post('/goals/create', requireSession, asyncHandler(async (req, res) => {
  try {
    const { account_id, title, target_amount, current_allocated, category_icon } = req.body;
    if (!account_id || !title) return res.redirect('/admin/goals?error=Account+and+title+required');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [account_id]);
    if (!account) return res.redirect('/admin/goals?error=Account+not+found');
    store.createGoal({
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

router.post('/goals/update/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/goals?error=Goal+not+found');
    const { title, target_amount, current_allocated, category_icon } = req.body;
    store.updateGoal(req.params.id, {
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

router.post('/goals/toggle/:id', requireSession, asyncHandler(async (req, res) => {
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

router.post('/goals/delete/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/goals?error=Goal+not+found');
    store.deleteGoal(req.params.id);
    res.redirect('/admin/goals?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/goals?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Badges Management ──

router.get('/badges', requireSession, asyncHandler(async (req, res) => {

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
        <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
          <option value="">All Accounts</option>
          ${accounts.map(a => `<option value="${a.account_id}"${a.account_id===filterAccount?' selected':''}>${a.child_name}</option>`).join('')}
        </select>
        <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
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
        <form class="inline" method="post" action="/admin/badges/delete/${b.badge_id}" onsubmit="return confirm('Delete badge ${b.name}?')">
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

router.post('/badges/create', requireSession, asyncHandler(async (req, res) => {
  try {

    const { account_id, name, description, required_xp, is_unlocked } = req.body;
    if (!account_id || !name) return res.redirect('/admin/badges?error=Account+and+name+required');
    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [account_id]);
    if (!account) return res.redirect('/admin/badges?error=Account+not+found');
    store.createBadge({
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

router.post('/badges/update/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM badges WHERE badge_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/badges?error=Badge+not+found');
    const { name, description, required_xp, is_unlocked } = req.body;
    store.updateBadge(req.params.id, {
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

router.post('/badges/toggle/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM badges WHERE badge_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/badges?error=Badge+not+found');
    const newStatus = existing.is_unlocked ? 0 : 1;
    store.updateBadge(req.params.id, { is_unlocked: newStatus });
    res.redirect('/admin/badges?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/badges?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/badges/delete/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM badges WHERE badge_id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/badges?error=Badge+not+found');
    store.deleteBadge(req.params.id);
    res.redirect('/admin/badges?deleted=ok');
  } catch (err) {
    res.redirect(`/admin/badges?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Loans Management ──

router.get('/loans', requireSession, asyncHandler(async (req, res) => {

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
          <select name="account" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
            <option value="">All Accounts</option>
            ${accounts.map(a => `<option value="${a.account_id}"${a.account_id === filterAccount ? ' selected' : ''}>${a.child_name}</option>`).join('')}
          </select>
          <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
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
            <form method="post" action="/admin/loans/reject/${l.loan_id}" style="display:inline" onsubmit="return confirm('Reject this loan?')">
              <button type="submit" class="btn btn-danger btn-xs">&#x274C; Reject</button>
            </form>
          ` : l.status === 'approved' ? `
            <form method="post" action="/admin/loans/disburse/${l.loan_id}" style="display:inline" onsubmit="return confirm('Disburse &#x20B1;${Number(l.principal).toFixed(2)} to ${l.child_name}?')">
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
    ${(() => {
      const products = store.getLoanProducts();
      return products.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text-muted)">No loan products configured.</div>' : `
      <table><tr><th>Name</th><th>Rate</th><th>Type</th><th>Min</th><th>Max</th><th>Min Term</th><th>Max Term</th><th>Status</th></tr>
      ${products.map(p => `<tr>
        <td><b>${p.name}</b></td>
        <td>${(Number(p.interest_rate) * 100).toFixed(1)}%</td>
        <td><span class="badge badge-blue">${p.interest_type === 'flat' ? 'Flat' : 'Diminishing'}</span></td>
        <td class="num">&#x20B1;${Number(p.min_amount).toFixed(0)}</td>
        <td class="num">&#x20B1;${Number(p.max_amount).toFixed(0)}</td>
        <td class="num">${p.min_term}mo</td>
        <td class="num">${p.max_term}mo</td>
        <td><span class="badge ${p.is_active ? 'badge-green' : 'badge-gray'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
      </tr>`).join('')}
      </table>`;
    })()}
    </div>
  </div>
  `;

  res.type('html').send(layout('Loans', 'loans', content, {
    toast,
    subtitle: `${filtered.length} loans shown`,
    counts: { loans: pendingCount },
  }));
}));

router.post('/loans/approve/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const loan = store.getLoan(req.params.id);
    if (!loan) return res.redirect('/admin/loans?error=Loan+not+found');
    if (loan.status !== 'pending') return res.redirect('/admin/loans?error=Loan+is+not+pending');
    store.updateLoan(req.params.id, { status: 'approved', approved_by: 'admin', approved_at: new Date().toISOString() });
    try { const audit = require('../services/audit'); await audit.log(req, 'LOAN_APPROVE', 'loan', req.params.id, { amount: loan.principal, member: loan.account_id }); } catch (e) {}
    res.redirect('/admin/loans?approved=ok');
  } catch (err) {
    res.redirect(`/admin/loans?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/loans/reject/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const loan = store.getLoan(req.params.id);
    if (!loan) return res.redirect('/admin/loans?error=Loan+not+found');
    if (loan.status !== 'pending') return res.redirect('/admin/loans?error=Loan+is+not+pending');
    store.updateLoan(req.params.id, { status: 'rejected' });
    try { const audit = require('../services/audit'); await audit.log(req, 'LOAN_REJECT', 'loan', req.params.id, { amount: loan.principal, member: loan.account_id }); } catch (e) {}
    res.redirect('/admin/loans?rejected=ok');
  } catch (err) {
    res.redirect(`/admin/loans?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/loans/disburse/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const loan = store.getLoan(req.params.id);
    if (!loan) return res.redirect('/admin/loans?error=Loan+not+found');
    if (loan.status !== 'approved') return res.redirect('/admin/loans?error=Loan+must+be+approved+first');

    const account = store.getAccount(loan.account_id);
    if (!account) return res.redirect('/admin/loans?error=Account+not+found');

    const newBalance = Math.round((Number(account.actual_balance) + Number(loan.principal)) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) + Number(loan.principal)) * 100) / 100;

    await store.query('UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=datetime(\'now\') WHERE account_id=$3', [newBalance, newUnallocated, loan.account_id]);
    store.addTransaction({
      account_id: loan.account_id,
      type: 'loan_disbursement',
      amount: Number(loan.principal),
      description: `Loan disbursement: ${loan.purpose || 'Loan'}`,
      reference_type: 'loan',
      reference_id: loan.loan_id,
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    store.updateLoan(req.params.id, { status: 'active', disbursed_at: new Date().toISOString() });
    try {
      const gl = require('../services/gl');
      await gl.postDoubleEntry(loan.loan_id, [
        { account_code: '1100', debit: Number(loan.principal), description: 'Loan disbursement: ' + (loan.purpose || 'Loan') },
        { account_code: '1000', credit: Number(loan.principal), description: 'Loan disbursement to member' },
      ]);
      const audit = require('../services/audit');
      await audit.log(req, 'LOAN_DISBURSE', 'loan', req.params.id, { principal: loan.principal, account: loan.account_id });
    } catch (e) { console.error('GL post failed (non-fatal):', e.message); }
    res.redirect('/admin/loans?disbursed=ok');
  } catch (err) {
    res.redirect(`/admin/loans?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Transactions Viewer ──

router.get('/transactions', requireSession, asyncHandler(async (req, res) => {

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

router.get('/settings', requireSession, asyncHandler(async (req, res) => {

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

  const tip = isPostgres ? '' : `<div class="card" style="margin-top:20px"><div class="card-body-padded"><b>&#x26A0; SQLite:</b> Database file is <code>${(dbSize / 1024).toFixed(1)} KB</code> on disk at <code>backend/labcoop.db</code></div></div>`;

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4CA;</div><div class="stat-value">${tableInfo.length}</div><div class="stat-label">Tables</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F504;</div><div class="stat-value">${tableInfo.reduce((s,t)=>s+t.rows,0)}</div><div class="stat-label">Total Rows</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4C5;</div><div class="stat-value">Node ${process.version}</div><div class="stat-label">Runtime</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4E1;</div><div class="stat-value">${isPostgres ? 'PostgreSQL' : 'SQLite'}</div><div class="stat-label">Database</div></div>
  </div>
  ${tip}

  <div class="card">
    <div class="card-header"><h3>&#x1F4CA; Database Tables</h3></div>
    <div class="card-body">
    <table><tr><th>Table Name</th><th>Rows</th></tr>
    ${tableInfo.map(t => `<tr><td><b>${t.name}</b></td><td>${t.rows}</td></tr>`).join('')}
    </table></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x2699; Environment</h3></div>
    <div class="card-body">
    <table><tr><th>Key</th><th>Value</th></tr>
    ${envVars.map(e => `<tr><td class="mono">${e.key}</td><td class="mono">${e.val}</td></tr>`).join('')}
    </table></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F527; Tools</h3></div>
    <div class="card-body-padded" style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="/api/excel/export/all" class="btn btn-secondary">&#x1F4E5; Export All Data</a>
      <a href="/api/excel/template" class="btn btn-outline">&#x1F4C4; Download Template</a>
      <a href="/api/health" target="_blank" class="btn btn-outline">&#x1F4C8; Health Check</a>
      <button class="btn btn-danger" onclick="if(confirm('Reset ALL data? This cannot be undone.')){fetch('/admin/reset-data',{method:'POST'}).then(r=>r.json()).then(d=>alert(d.message)||location.reload())}">&#x26A0; Reset All Data</button>
    </div>
  </div>
  `;

  res.type('html').send(layout('Settings', 'settings', content, {
    subtitle: 'System information and configuration',
  }));
}));

router.post('/reset-data', requireSession, asyncHandler(async (req, res) => {
  const tables = isPostgres
    ? await sql("SELECT table_name as name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")
    : await sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  for (const t of tables) {
    if (t.name === 'sqlite_sequence') continue;
    await store.query(`DELETE FROM "${t.name}"`);
    if (!isPostgres) await store.query(`DELETE FROM sqlite_sequence WHERE name='${t.name}'`);
  }
  res.json({ message: 'All data reset. Tables are empty.' });
}));

// ── Loan Products Management ──

router.get('/loan-products', requireSession, asyncHandler(async (req, res) => {

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
        <form method="post" action="/admin/loan-products/toggle/${p.product_id}" style="display:inline" onsubmit="return confirm('${p.is_active ? 'Deactivate' : 'Activate'} ${p.name}?')">
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

router.post('/loan-products/create', requireSession, asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term } = req.body;
    if (!name) return res.redirect('/admin/loan-products?error=Name+required');
    store.createLoanProduct({
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

router.post('/loan-products/update/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term } = req.body;
    store.updateLoanProduct(req.params.id, {
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

router.post('/loan-products/toggle/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const product = store.getLoanProduct(req.params.id);
    if (!product) return res.redirect('/admin/loan-products?error=Product+not+found');
    store.updateLoanProduct(req.params.id, { is_active: product.is_active ? 0 : 1 });
    res.redirect('/admin/loan-products?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/loan-products?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Savings Products Management ──

router.get('/savings-products', requireSession, asyncHandler(async (req, res) => {

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
        <form method="post" action="/admin/savings-products/toggle/${p.product_id}" style="display:inline" onsubmit="return confirm('${p.is_active ? 'Deactivate' : 'Activate'} ${p.name}?')">
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

router.post('/savings-products/create', requireSession, asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit } = req.body;
    if (!name) return res.redirect('/admin/savings-products?error=Name+required');
    store.createSavingsProduct({
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

router.post('/savings-products/update/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const { name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit } = req.body;
    store.updateSavingsProduct(req.params.id, {
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

router.post('/savings-products/toggle/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const product = store.getSavingsProduct(req.params.id);
    if (!product) return res.redirect('/admin/savings-products?error=Product+not+found');
    store.updateSavingsProduct(req.params.id, { is_active: product.is_active ? 0 : 1 });
    res.redirect('/admin/savings-products?toggled=ok');
  } catch (err) {
    res.redirect(`/admin/savings-products?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Withdrawal Requests Management ──

router.get('/withdrawal-requests', requireSession, asyncHandler(async (req, res) => {

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
          <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
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
          <form method="post" action="/admin/withdrawal-requests/approve/${r.request_id}" style="display:inline" onsubmit="return confirm('Approve withdrawal of &#x20B1;${Number(r.amount).toFixed(2)}?')">
            <button type="submit" class="btn btn-primary btn-xs">&#x2705; Approve</button>
          </form>
          <form method="post" action="/admin/withdrawal-requests/reject/${r.request_id}" style="display:inline" onsubmit="return confirm('Reject this request?')">
            <button type="submit" class="btn btn-danger btn-xs">&#x274C; Reject</button>
          </form>
        ` : r.status === 'approved' ? `
          <form method="post" action="/admin/withdrawal-requests/pay/${r.request_id}" style="display:inline" onsubmit="return confirm('Process payment of &#x20B1;${Number(r.amount).toFixed(2)} to ${r.child_name}? This will deduct from their balance.')">
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

router.post('/withdrawal-requests/approve/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const reqData = store.getWithdrawalRequest(req.params.id);
    if (!reqData) return res.redirect('/admin/withdrawal-requests?error=Request+not+found');
    if (reqData.status !== 'pending') return res.redirect('/admin/withdrawal-requests?error=Request+is+not+pending');
    store.updateWithdrawalRequest(req.params.id, { status: 'approved', resolved_at: new Date().toISOString() });
    res.redirect('/admin/withdrawal-requests?approved=ok');
  } catch (err) {
    res.redirect(`/admin/withdrawal-requests?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/withdrawal-requests/reject/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const reqData = store.getWithdrawalRequest(req.params.id);
    if (!reqData) return res.redirect('/admin/withdrawal-requests?error=Request+not+found');
    if (reqData.status !== 'pending') return res.redirect('/admin/withdrawal-requests?error=Request+is+not+pending');
    store.updateWithdrawalRequest(req.params.id, { status: 'rejected', resolved_at: new Date().toISOString() });
    res.redirect('/admin/withdrawal-requests?rejected=ok');
  } catch (err) {
    res.redirect(`/admin/withdrawal-requests?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/withdrawal-requests/pay/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const reqData = store.getWithdrawalRequest(req.params.id);
    if (!reqData) return res.redirect('/admin/withdrawal-requests?error=Request+not+found');
    if (reqData.status !== 'approved') return res.redirect('/admin/withdrawal-requests?error=Request+must+be+approved+first');

    const account = store.getAccount(reqData.account_id);
    if (!account) return res.redirect('/admin/withdrawal-requests?error=Account+not+found');
    if (Number(account.actual_balance) < Number(reqData.amount)) {
      return res.redirect('/admin/withdrawal-requests?error=Insufficient+balance');
    }

    const val = Number(reqData.amount);
    const newBalance = Math.round((Number(account.actual_balance) - val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) - val) * 100) / 100;

    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, Math.max(0, newUnallocated), reqData.account_id]);
    store.addTransaction({
      account_id: reqData.account_id,
      type: 'withdrawal',
      amount: val,
      description: `Withdrawal request: ${reqData.reason || 'Cash withdrawal'}`,
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    store.updateWithdrawalRequest(req.params.id, { status: 'paid', resolved_at: new Date().toISOString() });
    res.redirect('/admin/withdrawal-requests?paid=ok');
  } catch (err) {
    res.redirect(`/admin/withdrawal-requests?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Savings Applications Management ──

router.get('/savings-applications', requireSession, asyncHandler(async (req, res) => {

  const apps = await sql(`
    SELECT sa.*, a.child_name, a.member_id, sp.name as product_name, sp.interest_rate, sp.interest_frequency
    FROM savings_applications sa
    LEFT JOIN accounts a ON sa.account_id = a.account_id
    LEFT JOIN savings_products sp ON sa.product_id = sp.product_id
    ORDER BY sa.created_at DESC
  `);
  const q = req.query;

  const filterStatus = q.status || '';
  const filtered = filterStatus ? apps.filter(a => a.status === filterStatus) : apps;

  const toast = q.approved ? 'success:Savings application approved.'
    : q.rejected ? 'success:Savings application rejected.'
    : q.error ? `error:${q.error}`
    : '';

  const pendingCount = apps.filter(a => a.status === 'pending').length;

  const statusColors = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red' };
  const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4B1;</div><div class="stat-value">${apps.length}</div><div class="stat-label">Total Applications</div></div>
    <div class="stat-card"><div class="stat-icon">&#x23F3;</div><div class="stat-value">${pendingCount}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2705;</div><div class="stat-value">${apps.filter(a => a.status === 'approved').length}</div><div class="stat-label">Approved</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4B1; Savings Account Applications</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <form method="get" action="/admin/savings-applications" style="display:flex;gap:6px;align-items:center">
          <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="this.form.submit()">
            <option value="">All Status</option>
            <option value="pending"${filterStatus === 'pending' ? ' selected' : ''}>Pending</option>
            <option value="approved"${filterStatus === 'approved' ? ' selected' : ''}>Approved</option>
            <option value="rejected"${filterStatus === 'rejected' ? ' selected' : ''}>Rejected</option>
          </select>
          ${filterStatus ? `<a href="/admin/savings-applications" class="btn btn-outline btn-xs">&#x2716; Clear</a>` : ''}
        </form>
      </div>
    </div>
    <div class="card-body">
    ${filtered.length === 0 ? '<div style="padding:32px;text-align:center;color:var(--text-muted)">No applications found.</div>' : `
    <table><tr>
      <th>Child</th><th>Member ID</th><th>Product</th><th>Rate</th><th>Frequency</th><th>Status</th><th>Applied</th><th>Actions</th>
    </tr>
    ${filtered.map(a => `
    <tr>
      <td><b>${a.child_name || 'Unknown'}</b></td>
      <td class="mono">${a.member_id || '-'}</td>
      <td><b>${a.product_name || 'Unknown'}</b></td>
      <td class="num">${a.interest_rate ? (Number(a.interest_rate) * 100).toFixed(1) + '%' : '-'}</td>
      <td><span class="badge badge-purple">${a.interest_frequency || '-'}</span></td>
      <td><span class="badge ${statusColors[a.status] || 'badge-gray'}">${statusLabels[a.status] || a.status}</span></td>
      <td class="mono">${(a.created_at || '').slice(0, 10)}</td>
      <td><div class="actions-cell">
        ${a.status === 'pending' ? `
          <form method="post" action="/admin/savings-applications/approve/${a.application_id}" style="display:inline" onsubmit="return confirm('Approve ${a.child_name}\'s application for ${a.product_name}?')">
            <button type="submit" class="btn btn-primary btn-xs">&#x2705; Approve</button>
          </form>
          <form method="post" action="/admin/savings-applications/reject/${a.application_id}" style="display:inline" onsubmit="return confirm('Reject this application?')">
            <button type="submit" class="btn btn-danger btn-xs">&#x274C; Reject</button>
          </form>
        ` : '<span style="font-size:11px;color:var(--text-muted)">—</span>'}
      </div></td>
    </tr>`).join('')}
    </table>`}
    </div>
  </div>
  `;

  res.type('html').send(layout('Savings Applications', 'savings-applications', content, {
    toast,
    subtitle: `${pendingCount} pending`,
    counts: { 'savings-applications': pendingCount },
  }));
}));

router.post('/savings-applications/approve/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const app = await one('SELECT * FROM savings_applications WHERE application_id = $1', [req.params.id]);
    if (!app) return res.redirect('/admin/savings-applications?error=Application+not+found');
    if (app.status !== 'pending') return res.redirect('/admin/savings-applications?error=Application+is+not+pending');

    // Assign the savings product to the account
    await store.query("UPDATE accounts SET savings_product_id = $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2", [app.product_id, app.account_id]);
    store.updateSavingsApplication(req.params.id, { status: 'approved', resolved_at: new Date().toISOString() });
    res.redirect('/admin/savings-applications?approved=ok');
  } catch (err) {
    res.redirect(`/admin/savings-applications?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/savings-applications/reject/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const app = await one('SELECT * FROM savings_applications WHERE application_id = $1', [req.params.id]);
    if (!app) return res.redirect('/admin/savings-applications?error=Application+not+found');
    if (app.status !== 'pending') return res.redirect('/admin/savings-applications?error=Application+is+not+pending');
    store.updateSavingsApplication(req.params.id, { status: 'rejected', resolved_at: new Date().toISOString() });
    res.redirect('/admin/savings-applications?rejected=ok');
  } catch (err) {
    res.redirect(`/admin/savings-applications?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Teller Counter ──

router.get('/teller', requireSession, asyncHandler(async (req, res) => {

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
      recentTxs = await sql('SELECT * FROM transactions WHERE account_id = $1 ORDER BY created_at DESC LIMIT 20', [selectedId]);
      const activeLoans = await sql("SELECT * FROM loans WHERE account_id = $1 AND status = 'active' ORDER BY created_at DESC", [selectedId]);
      loanOptionsHtml = activeLoans.map(function(l) {
        return '<option value="' + l.loan_id + '">' + (l.purpose || 'Loan') + ' - \u20B1' + Number(l.remaining_balance).toFixed(2) + ' remaining</option>';
      }).join('');
    }
  }

  const toast = qry.deposited ? 'success:Deposit completed. Receipt #' + (qry.receipt || '')
    : qry.withdrawn ? 'success:Withdrawal completed. Receipt #' + (qry.receipt || '')
    : qry.loanpaid ? 'success:Loan payment collected. Receipt #' + (qry.receipt || '')
    : qry.error ? `error:${qry.error}`
    : '';

  const receipt = qry.receipt ? (await one("SELECT t.*, a.child_name, a.member_id FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id WHERE t.transaction_id = $1", [qry.receipt])) : null;

  const bankStyle = `<style>
  .teller-bar { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 24px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .teller-search { display:flex; gap:12px; }
  .teller-search input { flex:1; padding:12px 16px; border:2px solid var(--border); border-radius:10px; font-size:15px; outline:none; background:var(--card); transition:border-color 0.2s; }
  .teller-search input:focus { border-color:var(--accent); }
  .search-results { margin:-8px 0 16px 0; }
  .search-result-item { display:flex; align-items:center; gap:12px; padding:10px 16px; border-radius:8px; cursor:pointer; transition:background 0.15s; text-decoration:none; color:var(--text); }
  .search-result-item:hover { background:var(--bg-alt); }
  .search-result-item .sra { width:36px; height:36px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; flex-shrink:0; }
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
    var isCredit = r.type === 'deposit' || r.type === 'loan_disbursement';
    return '<div class="receipt-inline" id="rinline"><div class="ri-header"><strong>LABCOOP PASSBOOK</strong><br><span style="font-size:10px;color:#999">Official Transaction Receipt</span></div><div class="ri-body"><div class="ri-row"><span class="ri-label">Receipt No.</span><span class="ri-value">RCP-' + (r.transaction_id || '').slice(0,8).toUpperCase() + '</span></div><div class="ri-row"><span class="ri-label">Date</span><span class="ri-value">' + (r.created_at || '').slice(0,19).replace('T',' ') + '</span></div><div class="ri-row"><span class="ri-label">Member</span><span class="ri-value">' + (r.child_name||'N/A') + ' (' + (r.member_id||'---') + ')</span></div><div class="ri-divider"></div><div class="ri-row"><span class="ri-label">Transaction</span><span class="ri-value" style="text-transform:uppercase">' + r.type.replace(/_/g,' ') + '</span></div><div class="ri-row"><span class="ri-label">Amount</span><span class="ri-value ' + (isCredit ? 'ri-credit' : 'ri-debit') + '">' + (isCredit ? '+' : '-') + ' \u20B1' + Number(r.amount).toFixed(2) + '</span></div><div class="ri-row"><span class="ri-label">Description</span><span class="ri-value">' + (r.description||'-') + '</span></div><div class="ri-divider"></div><div class="ri-row"><span class="ri-label">Balance Before</span><span class="ri-value">\u20B1' + Number(r.balance_before || 0).toFixed(2) + '</span></div><div class="ri-row"><span class="ri-label">Balance After</span><span class="ri-value">\u20B1' + Number(r.balance_after || 0).toFixed(2) + '</span></div></div><div class="ri-footer"><button onclick="window.print()" class="btn btn-outline btn-xs">\uD83D\uDDA8 Print</button> &nbsp; <button onclick="document.getElementById(\'rinline\').remove()" class="btn btn-outline btn-xs">\u2716 Close</button></div></div>';
  }

  function searchResultItem(a) {
    var initial = (a.child_name || '?')[0].toUpperCase();
    return '<a href="/admin/teller?account=' + a.account_id + (searchQ ? '&q=' + encodeURIComponent(searchQ) : '') + '" class="search-result-item"><div class="sra">' + initial + '</div><div><div class="srn">' + a.child_name + '</div><div class="srm">' + (a.member_id || '---') + '</div></div></a>';
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
          <div class="customer-avatar">${(selectedAccount.child_name || '?')[0].toUpperCase()}</div>
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
          <button class="tx-tab active" onclick="switchTxTab('deposit')" id="tab-deposit">&#x1F4B5; Deposit</button>
          <button class="tx-tab" onclick="switchTxTab('withdraw')" id="tab-withdraw">&#x1F4B8; Withdraw</button>
          <button class="tx-tab" onclick="switchTxTab('loan')" id="tab-loan">&#x1F3E6; Loan Pay</button>
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
        ${recentTxs.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-muted)">No transactions yet.</div>' : `
        <table class="tx-table">
          <tr><th>Type</th><th>Amount</th><th>Description</th><th>Date</th><th></th></tr>
          ${recentTxs.map(tx => {
            var tc = ({deposit:'deposit',withdrawal:'withdrawal',loan_payment:'loan_payment',loan_disbursement:'loan_disbursement',interest:'interest',interest_credit:'interest',allocation:'allocation'})[tx.type] || 'deposit';
            var sign = tx.type === 'deposit' || tx.type === 'loan_disbursement' ? '+' : '-';
            var col = tx.type === 'deposit' || tx.type === 'loan_disbursement' ? '#16a34a' : tx.type === 'withdrawal' ? '#dc2626' : 'var(--text)';
            return '<tr><td><span class="tx-type-badge ' + tc + '">' + tx.type.replace(/_/g,' ') + '</span></td><td class="tx-amt" style="color:' + col + '">' + sign + '&#x20B1;' + Number(tx.amount).toFixed(2) + '</td><td class="tx-desc">' + (tx.description||'-') + '</td><td class="tx-date">' + (tx.created_at||'').slice(0,16).replace('T',' ') + '</td><td><a class="rcpt-link" href="?account=' + selectedId + '&receipt=' + tx.transaction_id + (searchQ ? '&q=' + encodeURIComponent(searchQ) : '') + '" title="View receipt">&#x1F5A8;</a></td></tr>';
          }).join('')}
        </table>`}
      </div>
    </div>

  </div>
  `}

  <script>
  function switchTxTab(tab) {
    document.querySelectorAll('.tx-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tx-panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
  }
  </script>
  `;

  var toastHtml = toast ? '<div class="toast ' + (toast.startsWith('error:') ? 'error' : 'success') + '">' + (toast.startsWith('error:') ? '&#x274C; ' + toast.slice(6) : '&#x2705; ' + toast.slice(8)) + '</div>' : '';
  const tellerContent = toastHtml + bankContent;

  res.type('html').send(layout('Teller Counter', 'teller', tellerContent, { toast: toast || undefined }));
}));

router.post('/teller/deposit/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/teller?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/teller?error=Account+not+found');
    const newBalance = Number(account.actual_balance) + val;
    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=unallocated_balance+$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, val, req.params.id]);
    const result = store.addTransaction({
      account_id: req.params.id,
      type: 'deposit',
      amount: val,
      description: description || 'Counter deposit',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const txId = result?.transaction_id || '';
    try {
      const gl = require('../services/gl');
      await gl.postDoubleEntry(txId, [
        { account_code: '1000', debit: val, description: 'Counter deposit: ' + account.child_name },
        { account_code: '2000', credit: val, description: 'Counter deposit: ' + account.child_name },
      ]);
      const audit = require('../services/audit');
      await audit.log(req, 'TELLER_DEPOSIT', 'account', req.params.id, { amount: val, txId, desc: description || 'Counter deposit' });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?deposited=ok&receipt=${txId}&account=${req.params.id}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/teller/withdraw/:id', requireSession, asyncHandler(async (req, res) => {
  try {
    const { amount, description } = req.body;
    const val = Number(amount);
    if (!val || val <= 0) return res.redirect('/admin/teller?error=Invalid+amount');

    const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (!account) return res.redirect('/admin/teller?error=Account+not+found');
    if (Number(account.actual_balance) < val) return res.redirect('/admin/teller?error=Insufficient+balance');
    const newBalance = Math.round((Number(account.actual_balance) - val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) - val) * 100) / 100;
    await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3", [newBalance, Math.max(0, newUnallocated), req.params.id]);
    const result = store.addTransaction({
      account_id: req.params.id,
      type: 'withdrawal',
      amount: val,
      description: description || 'Counter withdrawal',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    const txId = result?.transaction_id || '';
    try {
      const gl = require('../services/gl');
      await gl.postDoubleEntry(txId, [
        { account_code: '2000', debit: val, description: 'Counter withdrawal: ' + account.child_name },
        { account_code: '1000', credit: val, description: 'Counter withdrawal: ' + account.child_name },
      ]);
      const audit = require('../services/audit');
      await audit.log(req, 'TELLER_WITHDRAWAL', 'account', req.params.id, { amount: val, txId, desc: description || 'Counter withdrawal' });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?withdrawn=ok&receipt=${txId}&account=${req.params.id}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/teller/loan-pay/:id', requireSession, asyncHandler(async (req, res) => {
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

    // Record loan payment
    store.addLoanPayment({
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

    // Record transaction (no balance change since it's over-the-counter collection)
    const txResult = store.addTransaction({
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
    try {
      const gl = require('../services/gl');
      const entries = [
        { account_code: '1000', debit: val, description: 'Loan payment: ' + (loan.purpose || 'Loan') },
        { account_code: '1100', credit: principalPortion, description: 'Principal repayment' },
      ];
      if (interestPortion > 0) {
        entries.push({ account_code: '4000', credit: interestPortion, description: 'Interest income' });
      }
      await gl.postDoubleEntry(txId, entries);
      const audit = require('../services/audit');
      await audit.log(req, 'TELLER_LOAN_PAYMENT', 'loan', loan_id, { amount: val, principalPortion, interestPortion, txId });
    } catch (glErr) { console.error('GL post failed (non-fatal):', glErr.message); }
    const sq = req.body.q ? '&q=' + encodeURIComponent(req.body.q) : '';
    res.redirect(`/admin/teller?loanpaid=ok&receipt=${txId}&account=${accountId}${sq}`);
  } catch (err) {
    res.redirect(`/admin/teller?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── Audit Reports ──

router.get('/audit', requireSession, asyncHandler(async (req, res) => {

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
  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Stats
  const stats = await one(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN t.type IN ('deposit','loan_disbursement','interest_credit') THEN t.amount ELSE 0 END) as credits,
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

  const typeOpts = ['deposit','withdrawal','loan_disbursement','loan_payment','interest_credit','interest','allocation','transfer'];
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
        const sign = (t.type==='deposit'||t.type==='loan_disbursement'||t.type==='interest_credit') ? '+' : '-';
        const col = (t.type==='deposit'||t.type==='loan_disbursement'||t.type==='interest_credit') ? '#16a34a' : '#dc2626';
        const delta = t.balance_before != null ? '<span style="color:' + col + '">' + sign + '&#x20B1;' + Number(t.amount).toFixed(2) + '</span>' : '-';
        const bg = ({deposit:'badge-green',withdrawal:'badge-red',loan_disbursement:'badge-amber',loan_payment:'badge-blue',interest_credit:'badge-purple',interest:'badge-purple',allocation:'badge-gray'})[t.type] || 'badge-gray';
        return '<tr><td class="mono"><a href="/admin/teller?account=' + t.account_id + '&receipt=' + t.transaction_id + '" style="color:var(--accent);text-decoration:none">' + (t.transaction_id||'').slice(0,8).toUpperCase() + '</a></td><td class="mono" style="font-size:11px">' + (t.created_at||'').slice(0,19).replace('T',' ') + '</td><td>' + (t.child_name||'') + '</td><td class="mono" style="font-size:11px;color:var(--text-muted)">' + (t.member_id||'-') + '</td><td><span class="badge ' + bg + '">' + t.type.replace(/_/g,' ') + '</span></td><td class="num mono" style="color:' + col + '">' + sign + '&#x20B1;' + Number(t.amount).toFixed(2) + '</td><td class="num mono">' + delta + '</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">' + (t.description||'-') + '</td><td class="mono" style="font-size:11px;color:var(--text-muted)">' + (t.reference_id ? (t.reference_type||'') + ':' + (t.reference_id||'').slice(0,8) : '-') + '</td></tr>';
      }).join('') + '</table>'}
    </div>
  </div>`;

  res.type('html').send(layout('Audit Reports', 'audit', content, { subtitle: 'Compliance-ready transaction register with date range filtering' }));
}));

// ── Audit CSV Export ──

router.get('/audit/csv', requireSession, asyncHandler(async (req, res) => {

  const q = req.query;
  let where = [];
  let params = [];
  let p = 1;
  if (q.from) { where.push('t.created_at >= $' + p++); params.push(q.from + ' 00:00:00'); }
  if (q.to) { where.push('t.created_at <= $' + p++); params.push(q.to + ' 23:59:59'); }
  if (q.account) { where.push('t.account_id = $' + p++); params.push(q.account); }
  if (q.type) { where.push('t.type = $' + p++); params.push(q.type); }
  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = await sql(`
    SELECT t.transaction_id, t.created_at, a.child_name, a.member_id, t.type, t.amount,
      t.balance_before, t.balance_after, t.description, t.reference_type, t.reference_id
    FROM transactions t LEFT JOIN accounts a ON t.account_id = a.account_id
    ${wc} ORDER BY t.created_at DESC
  `, params);

  let csv = 'Receipt No,Date & Time,Member Name,Member ID,Type,Amount,Balance Before,Balance After,Description,Reference\n';
  csv += rows.map(r => {
    return [
      r.transaction_id,
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

// ── Clear All User Data (keep reference tables) ──
router.post('/reset-database', requireSession, asyncHandler(async (req, res) => {
  // Order respects FK dependencies: children before parents
  const tables = [
    'loan_payments',
    'transactions',
    'badges',
    'goal_jars',
    'loans',
    'withdrawal_requests',
    'standing_orders',
    'savings_applications',
    'coop_contributions',
    'coop_goals',
    'accounts',
  ];
  try {
    await store.query('BEGIN');
    for (const t of tables) {
      await store.query(`DELETE FROM ${t}`);
    }
    await store.query('COMMIT');
  } catch (err) {
    await store.query('ROLLBACK');
    return res.redirect('/admin?error=' + encodeURIComponent('Reset failed: ' + err.message));
  }
  res.redirect('/admin?msg=Database+reset+successful');
}));

// ── GL Reports ──

router.get('/gl/trial-balance', requireSession, asyncHandler(async (req, res) => {
  const { getTrialBalance } = require('../services/gl');
  const date = req.query.date || '';
  const result = await getTrialBalance(date || null);
  const totalD = result.rows.reduce((s, r) => s + r.debit, 0);
  const totalC = result.rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalD - totalC) < 0.01;
  const content = `
  <form method="get" action="/admin/gl/trial-balance" style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
    <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">As of date</label><input type="date" name="date" value="${date}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
    <button type="submit" class="btn btn-primary btn-sm">&#x1F50D; View</button>
    <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F504; Reset</a>
    <div style="margin-left:auto;display:flex;gap:8px">
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
      <tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>
      ${result.rows.map(r => `<tr>
        <td class="mono">${r.code}</td><td>${r.name}</td>
        <td><span class="badge ${r.type === 'asset' || r.type === 'expense' ? 'badge-red' : r.type === 'liability' || r.type === 'equity' ? 'badge-blue' : 'badge-green'}">${r.type}</span></td>
        <td class="num mono">${r.debit ? '&#x20B1;' + r.debit.toFixed(2) : '-'}</td>
        <td class="num mono">${r.credit ? '&#x20B1;' + r.credit.toFixed(2) : '-'}</td>
        <td class="num mono" style="color:${r.balance >= 0 ? '#16a34a' : '#dc2626'};font-weight:600">&#x20B1;${Math.abs(r.balance).toFixed(2)} ${r.balance < 0 ? 'CR' : 'DR'}</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--bg2)"><td colspan="3">TOTAL</td>
        <td class="num mono">&#x20B1;${totalD.toFixed(2)}</td>
        <td class="num mono">&#x20B1;${totalC.toFixed(2)}</td>
        <td class="num mono" style="color:${balanced ? '#16a34a' : '#dc2626'}">${balanced ? '&#x2705;' : '&#x26A0; Diff: &#x20B1;' + Math.abs(totalD - totalC).toFixed(2)}</td>
      </tr>
    </table></div>
  </div>`;
  res.type('html').send(layout('Trial Balance', 'gl', content, { subtitle: 'All GL accounts with debit/credit totals' }));
}));

router.get('/gl/balance-sheet', requireSession, asyncHandler(async (req, res) => {
  const { getBalanceSheet } = require('../services/gl');
  const date = req.query.date || '';
  const result = await getBalanceSheet(date || null);
  const diff = result.totalAssets - (result.totalLiabilities + result.totalEquity);
  const section = (title, items, total, color) => `
    <div class="card">
      <div class="card-header"><h4>${title}</h4><span class="count">${items.length} accounts</span></div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>Account</th><th class="num">Amount</th></tr>
        ${items.map(r => `<tr><td>${r.name}</td><td class="num mono" style="color:${color};font-weight:600">&#x20B1;${Math.abs(r.balance).toFixed(2)}</td></tr>`).join('')}
        <tr style="font-weight:700;background:var(--bg2)"><td>TOTAL ${title.toUpperCase()}</td><td class="num mono" style="color:${color}">&#x20B1;${total.toFixed(2)}</td></tr>
      </table></div>
    </div>`;
  const content = `
    <form method="get" action="/admin/gl/balance-sheet" style="display:flex;gap:8px;align-items:end;margin-bottom:16px">
      <div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">As of date</label><input type="date" name="date" value="${date}" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px"></div>
      <button type="submit" class="btn btn-primary btn-sm">&#x1F50D; View</button>
      <a href="/admin/gl/balance-sheet" class="btn btn-outline btn-sm">&#x1F504; Reset</a>
      <div style="margin-left:auto;display:flex;gap:8px">
        <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F4CA; Trial Balance</a>
        <a href="/admin/gl/profit-and-loss" class="btn btn-outline btn-sm">&#x1F4C9; P&amp;L</a>
      </div>
    </form>
    <div class="stats-grid">
      <div class="stat-card" style="border-left:3px solid var(--accent)"><div class="stat-icon">&#x1F4B0;</div><div class="stat-value" style="color:#16a34a">&#x20B1;${result.totalAssets.toFixed(2)}</div><div class="stat-label">Total Assets</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value" style="color:#dc2626">&#x20B1;${result.totalLiabilities.toFixed(2)}</div><div class="stat-label">Total Liabilities</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F511;</div><div class="stat-value" style="color:#2563eb">&#x20B1;${result.totalEquity.toFixed(2)}</div><div class="stat-label">Total Equity</div></div>
      <div class="stat-card"><div class="stat-icon">&#x2696;</div><div class="stat-value" style="color:${diff === 0 ? '#16a34a' : '#dc2626'}">${diff === 0 ? '&#x2705; A = L + E' : '&#x26A0; Off by &#x20B1;' + diff.toFixed(2)}</div><div class="stat-label">Accounting Equation</div></div>
    </div>
    ${section('Assets', result.assets, result.totalAssets, '#16a34a')}
    ${section('Liabilities', result.liabilities, result.totalLiabilities, '#dc2626')}
    ${section('Equity', result.equity, result.totalEquity, '#2563eb')}`;
  res.type('html').send(layout('Balance Sheet', 'gl', content, { subtitle: 'Assets = Liabilities + Equity' }));
}));

router.get('/gl/profit-and-loss', requireSession, asyncHandler(async (req, res) => {
  const { getProfitAndLoss } = require('../services/gl');
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const todayStr = now.toISOString().slice(0,10);
  const from = req.query.from || firstDay;
  const to = req.query.to || todayStr;
  const result = await getProfitAndLoss(from, to);
  const section = (title, items, total, color) => `
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
        <a href="/admin/gl/trial-balance" class="btn btn-outline btn-sm">&#x1F4CA; Trial Balance</a>
        <a href="/admin/gl/balance-sheet" class="btn btn-outline btn-sm">&#x1F4C8; Balance Sheet</a>
      </div>
    </form>
    <div class="stats-grid">
      <div class="stat-card" style="border-left:3px solid #16a34a"><div class="stat-icon">&#x1F4B5;</div><div class="stat-value" style="color:#16a34a">&#x20B1;${result.totalIncome.toFixed(2)}</div><div class="stat-label">Total Income</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F4B8;</div><div class="stat-value" style="color:#dc2626">&#x20B1;${result.totalExpense.toFixed(2)}</div><div class="stat-label">Total Expenses</div></div>
      <div class="stat-card"><div class="stat-icon">&#x1F3C6;</div><div class="stat-value" style="color:${result.netProfit >= 0 ? '#16a34a' : '#dc2626'}">${result.netProfit >= 0 ? '+' : ''}&#x20B1;${result.netProfit.toFixed(2)}</div><div class="stat-label">Net ${result.netProfit >= 0 ? 'Profit' : 'Loss'}</div></div>
    </div>
    ${result.income.length ? section('Income', result.income, result.totalIncome, '#16a34a') : ''}
    ${result.expense.length ? section('Expenses', result.expense, result.totalExpense, '#dc2626') : ''}`;
  res.type('html').send(layout('Profit & Loss', 'gl', content, { subtitle: 'Income - Expenses = Net Profit/Loss' }));
}));

router.get('/gl/ledger', requireSession, asyncHandler(async (req, res) => {
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
      <tr><th>Date</th><th>Transaction</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Running Balance</th></tr>
      ${entries.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-muted)">No entries for this account</td></tr>' :
        entries.map((e, i) => {
          const d = Number(e.debit), c = Number(e.credit);
          const isAssetExpense = ['asset','expense'].includes(accounts.find(x => x.code === selected)?.type);
          const balance = d - c;
          return `<tr>
            <td class="mono" style="font-size:11px">${(e.created_at||'').slice(0,16).replace('T',' ')}</td>
            <td class="mono" style="font-size:10px;color:var(--text-muted)">${(e.transaction_id||'').slice(0,8)}</td>
            <td>${e.description || '-'}</td>
            <td class="num mono" style="color:#16a34a">${d ? '&#x20B1;' + d.toFixed(2) : '-'}</td>
            <td class="num mono" style="color:#dc2626">${c ? '&#x20B1;' + c.toFixed(2) : '-'}</td>
            <td class="num mono" style="font-weight:600;color:${balance >= 0 ? '#16a34a' : '#dc2626'}">${balance >= 0 ? '' : '-'}&#x20B1;${Math.abs(balance).toFixed(2)}</td>
          </tr>`;
        }).join('')}
    </table></div>
  </div>` : '<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:14px">&#x1F4CB; Select a GL account above to view its ledger entries</div>'}`;
  res.type('html').send(layout('General Ledger', 'gl', content, { subtitle: 'View individual account entries' }));
}));

// ── Audit Log ──

router.get('/audit-log', requireSession, asyncHandler(async (req, res) => {
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

router.get('/users', requireSession, asyncHandler(async (req, res) => {
  const users = await sql('SELECT * FROM admin_users ORDER BY created_at ASC');
  const q = req.query;
  const toast = q.created ? 'success:Admin user created.'
    : q.updated ? 'success:Admin user updated.'
    : q.error ? `error:${q.error}`
    : '';
  const roleColors = { super_admin:'badge-red', manager:'badge-blue', teller:'badge-green', auditor:'badge-orange' };
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
      <tr><th>Username</th><th>Display Name</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr>
      ${users.map(u => `
      <tr>
        <td class="mono"><b>${u.username}</b></td>
        <td>${u.display_name || '-'}</td>
        <td><span class="badge ${roleColors[u.role] || 'badge-gray'}">${u.role.replace(/_/g,' ')}</span></td>
        <td>${u.is_active ? '<span style="color:#16a34a;font-weight:600">&#x2705; Active</span>' : '<span style="color:#dc2626;font-weight:600">&#x274C; Inactive</span>'}</td>
        <td class="mono" style="font-size:11px;color:var(--text-muted)">${(u.created_at||'').slice(0,10)}</td>
        <td><a href="/admin/users/deactivate/${u.admin_id}" class="btn ${u.is_active ? 'btn-danger' : 'btn-secondary'} btn-xs" onclick="return confirm('${u.is_active ? 'Deactivate' : 'Activate'} ${u.username}?')">${u.is_active ? 'Deactivate' : 'Activate'}</a></td>
      </tr>`).join('')}
    </table></div>
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x2795; Create New Admin</h3></div>
    <div class="card-body-padded">
    <form method="post" action="/admin/users/create" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:500px">
      <div class="field"><label>Username</label><input type="text" name="username" placeholder="e.g. teller1" required></div>
      <div class="field"><label>Display Name</label><input type="text" name="display_name" placeholder="e.g. Juan Dela Cruz"></div>
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

router.post('/users/create', requireSession, asyncHandler(async (req, res) => {
  const { username, display_name, password, role } = req.body;
  if (!username || !password) return res.redirect('/admin/users?error=Username+and+password+required');
  const existing = await one('SELECT * FROM admin_users WHERE username = $1', [username]);
  if (existing) return res.redirect('/admin/users?error=Username+already+exists');
  const hash = bcrypt.hashSync(password, 10);
  await store.query(
    'INSERT INTO admin_users (admin_id, username, password_hash, role, display_name, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [uuidv4(), username, hash, role || 'teller', display_name || username, new Date().toISOString()]
  );
  res.redirect('/admin/users?created=ok');
}));

router.get('/users/deactivate/:id', requireSession, asyncHandler(async (req, res) => {
  await store.query('UPDATE admin_users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE admin_id = $1', [req.params.id]);
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
