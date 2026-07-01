const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');
const { layout, printLayout, reportTable, reportSection, reportStats } = require('./admin-lib');

const _p = (...p) => p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
const sql = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows);
const one = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows[0]);
const fmt = v => '\u20B1' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const router = express.Router();
const ROLE_LEVELS = { super_admin: 4, manager: 3, teller: 2, auditor: 1 };
function requireRole(minLevel) {
  return (req, res, next) => {
    if (!req.session || !req.session.adminId) return res.redirect('/admin/login');
    const level = ROLE_LEVELS[req.session.adminRole] ?? 0;
    if (level < minLevel) return res.status(403).send('Forbidden');
    next();
  };
}

// ============================================================
// 1. LOAN RESTRUCTURING
// ============================================================
router.get('/loan-restructure', requireRole(3), asyncHandler(async (req, res) => {
  const loans = await sql("SELECT l.*, a.child_name FROM loans l LEFT JOIN accounts a ON l.account_id = a.account_id WHERE l.status IN ($1,$2,$3) ORDER BY l.created_at DESC", ['approved','disbursed','active']);
  const restructures = await sql("SELECT r.*, l.loan_id, a.child_name FROM loan_restructuring r LEFT JOIN loans l ON r.loan_id = l.loan_id LEFT JOIN accounts a ON l.account_id = a.account_id ORDER BY r.created_at DESC");
  const q = req.query; const toast = q.done ? 'success:Loan restructured.' : q.error ? 'error:' + q.error : '';
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${restructures.length}</div><div>Restructures Done</div></div>
    <div class="stat-card"><div>${loans.length}</div><div>Restructurable Loans</div></div>
  </div>
  <div class="card"><div class="card-header"><h3>Loan Restructuring</h3><div><a href="#add-restructure" class="btn btn-primary btn-sm">+ Restructure Loan</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Loan ID</th><th>Member</th><th class="num">Old Principal</th><th class="num">New Principal</th><th class="num">Old Rate</th><th class="num">New Rate</th><th>Reason</th><th>Date</th></tr>
    ${restructures.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No restructures yet</td></tr>' :
      restructures.map(r => `<tr><td class="mono" style="font-size:10px">${(r.loan_id||"").slice(0,8)}</td><td>${r.child_name || '-'}</td>
        <td class="num mono">${fmt(r.old_principal)}</td><td class="num mono">${fmt(r.new_principal)}</td>
        <td class="num mono">${r.old_interest_rate}%</td><td class="num mono">${r.new_interest_rate}%</td>
        <td style="font-size:12px">${r.reason || '-'}</td><td class="mono" style="font-size:11px">${(r.created_at||"").slice(0,10)}</td></tr>`).join('')}
  </table></div></div>
  <div id="add-restructure" class="modal-overlay"><div class="modal" style="max-width:520px"><a href="#" class="close">&times;</a>
  <h2>Restructure Loan</h2>
  <form method="post" action="/admin/loan-restructure/create">
    <label for="rl_loan">Loan</label>
    <select id="rl_loan" name="loan_id" required>
      <option value="">-- Select loan --</option>
      ${loans.map(l => `<option value="${l.loan_id}">${l.child_name} -- ${fmt(l.principal)} (${l.status})</option>`).join('')}
    </select>
    <div class="form-row"><div><label>New Principal</label><input type="number" name="new_principal" min="0" step="0.01" required></div>
      <div><label>New Rate (%)</label><input type="number" name="new_interest_rate" min="0" step="0.01" required></div></div>
    <div class="form-row"><div><label>New Term (months)</label><input type="number" name="new_term_months" min="1" required></div>
      <div><label>Reason</label><input type="text" name="reason" placeholder="e.g. Financial hardship" required></div></div>
    <button type="submit" class="btn btn-primary">Restructure</button>
  </form></div></div>`;
  res.type('html').send(layout('Loan Restructuring', 'loan-restructure', content, { subtitle: 'Modify loan terms mid-life', toast }));
}));

router.post('/loan-restructure/create', requireRole(3), asyncHandler(async (req, res) => {
  const { loan_id, new_principal, new_interest_rate, new_term_months, reason } = req.body;
  if (!loan_id || !new_principal) return res.redirect('/admin/loan-restructure?error=Missing+fields');
  const loan = await one('SELECT * FROM loans WHERE loan_id = $1', [loan_id]);
  if (!loan) return res.redirect('/admin/loan-restructure?error=Loan+not+found');
  await store.query('INSERT INTO loan_restructuring VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [uuidv4(), loan_id, Number(loan.principal), Number(new_principal), Number(loan.interest_rate), Number(new_interest_rate), Number(loan.term_months), Number(new_term_months), reason || '', req.session.adminName || req.session.adminId, new Date().toISOString()]);
  const mr = Number(new_interest_rate)/100/12; const n = Number(new_term_months);
  const amort = mr > 0 ? Number(new_principal)*mr*Math.pow(1+mr,n)/(Math.pow(1+mr,n)-1) : Number(new_principal)/n;
  await store.query('UPDATE loans SET principal=$1, interest_rate=$2, term_months=$3, monthly_amortization=$4, total_payable=$5 WHERE loan_id=$6',
    [Number(new_principal), Number(new_interest_rate), Number(new_term_months), amort, amort*n, loan_id]);
  res.redirect('/admin/loan-restructure?done=ok');
}));

// ============================================================
// 2. COLLATERAL MANAGEMENT
// ============================================================
router.get('/collateral', requireRole(2), asyncHandler(async (req, res) => {
  const cols = await sql("SELECT c.*, l.loan_id, a.child_name FROM loan_collateral c LEFT JOIN loans l ON c.loan_id = l.loan_id LEFT JOIN accounts a ON l.account_id = a.account_id ORDER BY c.created_at DESC");
  const loans = await sql("SELECT l.*, a.child_name FROM loans l LEFT JOIN accounts a ON l.account_id = a.account_id WHERE l.status IN ($1,$2) ORDER BY l.created_at DESC", ['approved','disbursed']);
  const q = req.query; const toast = q.created ? 'success:Collateral recorded.' : q.released ? 'success:Collateral released.' : q.error ? 'error:'+q.error : '';
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${cols.length}</div><div>Total Collaterals</div></div>
    <div class="stat-card"><div>${cols.filter(c=>!c.is_released).length}</div><div>Held</div></div>
    <div class="stat-card"><div>${cols.filter(c=>c.is_released).length}</div><div>Released</div></div>
  </div><div class="card"><div class="card-header"><h3>Collateral Registry</h3><div><a href="#add-collateral" class="btn btn-primary btn-sm">+ Add</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Loan</th><th>Member</th><th>Type</th><th>Description</th><th class="num">Est. Value</th><th class="num">Appraised</th><th>Status</th><th></th></tr>
    ${cols.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No collateral</td></tr>' :
      cols.map(c => `<tr><td class="mono">${(c.loan_id||"").slice(0,8)}</td><td>${c.child_name||'-'}</td>
        <td>${c.type}</td><td style="font-size:12px">${c.description||'-'}</td><td class="num mono">${fmt(c.estimated_value)}</td>
        <td class="num mono">${c.appraised_value?fmt(c.appraised_value):'-'}</td>
        <td>${c.is_released?'<span style="color:#16a34a">Released</span>':'<span style="color:#f59e0b">Held</span>'}</td>
        <td>${c.is_released?'':`<a href="/admin/collateral/release/${c.collateral_id}" class="btn btn-success btn-xs" data-confirm="Release this collateral?">Release</a>`}</td></tr>`).join('')}
  </table></div></div>
  <div id="add-collateral" class="modal-overlay"><div class="modal" style="max-width:480px"><a href="#" class="close">&times;</a>
  <h2>Add Collateral</h2>
  <form method="post" action="/admin/collateral/create">
    <label>Loan</label><select name="loan_id" required>${loans.map(l=>`<option value="${l.loan_id}">${l.child_name}</option>`).join('')}</select>
    <div class="form-row"><div><label>Type</label><select name="type" required><option>Real Estate</option><option>Vehicle</option><option>Jewelry</option><option>Equipment</option><option>Cash Bond</option><option>Other</option></select></div>
      <div><label>Est. Value</label><input type="number" name="estimated_value" min="0" step="0.01" required></div></div>
    <label>Description</label><input type="text" name="description" placeholder="e.g. Lot at Brgy. San Jose">
    <button type="submit" class="btn btn-primary">Save Collateral</button>
  </form></div></div>`;
  res.type('html').send(layout('Collateral Management', 'collateral', content, { subtitle: 'Loan collateral registry', toast }));
}));

router.post('/collateral/create', requireRole(2), asyncHandler(async (req, res) => {
  const { loan_id, type, estimated_value, description } = req.body;
  if (!loan_id||!type) return res.redirect('/admin/collateral?error=Missing+fields');
  await store.query('INSERT INTO loan_collateral (collateral_id,loan_id,type,description,estimated_value,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [uuidv4(), loan_id, type, description||'', Number(estimated_value)||0, new Date().toISOString()]);
  res.redirect('/admin/collateral?created=ok');
}));

router.get('/collateral/release/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE loan_collateral SET is_released=1 WHERE collateral_id=$1', [req.params.id]);
  res.redirect('/admin/collateral?released=ok');
}));

// ============================================================
// 3. CO-MAKER / GUARANTOR MANAGEMENT
// ============================================================
router.get('/guarantors', requireRole(2), asyncHandler(async (req, res) => {
  const gs = await sql("SELECT g.*, l.loan_id, a.child_name FROM loan_guarantors g LEFT JOIN loans l ON g.loan_id = l.loan_id LEFT JOIN accounts a ON l.account_id = a.account_id ORDER BY g.created_at DESC");
  const loans = await sql("SELECT l.*, a.child_name FROM loans l LEFT JOIN accounts a ON l.account_id = a.account_id WHERE l.status IN ($1,$2,$3) ORDER BY l.created_at DESC", ['pending','approved','disbursed']);
  const q = req.query; const toast = q.created?'success:Guarantor added.':q.error?'error:'+q.error:'';
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${gs.length}</div><div>Total Guarantors</div></div>
    <div class="stat-card"><div>${gs.filter(g=>g.income>0).length}</div><div>With Income Data</div></div>
  </div><div class="card"><div class="card-header"><h3>Guarantors / Co-Makers</h3><div><a href="#add-guarantor" class="btn btn-primary btn-sm">+ Add Guarantor</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Loan</th><th>Member</th><th>Name</th><th>Relationship</th><th>Contact</th><th class="num">Income</th></tr>
    ${gs.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No guarantors recorded</td></tr>' :
      gs.map(g => `<tr><td class="mono">${(g.loan_id||"").slice(0,8)}</td><td>${g.child_name||'-'}</td>
        <td>${g.name}</td><td>${g.relationship||'-'}</td><td class="mono">${g.contact_number||'-'}</td>
        <td class="num mono">${g.income?fmt(g.income):'-'}</td></tr>`).join('')}
  </table></div></div>
  <div id="add-guarantor" class="modal-overlay"><div class="modal" style="max-width:480px"><a href="#" class="close">&times;</a>
  <h2>Add Guarantor</h2>
  <form method="post" action="/admin/guarantors/create">
    <label>Loan</label><select name="loan_id" required>${loans.map(l=>`<option value="${l.loan_id}">${l.child_name}</option>`).join('')}</select>
    <div class="form-row"><div><label>Guarantor Name</label><input type="text" name="name" required></div>
      <div><label>Relationship</label><input type="text" name="relationship" placeholder="e.g. Parent"></div></div>
    <div class="form-row"><div><label>Contact</label><input type="text" name="contact_number"></div>
      <div><label>Monthly Income</label><input type="number" name="income" min="0" step="0.01"></div></div>
    <label>Address</label><input type="text" name="address">
    <button type="submit" class="btn btn-primary">Save Guarantor</button>
  </form></div></div>`;
  res.type('html').send(layout('Guarantors', 'guarantors', content, { subtitle: 'Co-maker / guarantor tracking', toast }));
}));

router.post('/guarantors/create', requireRole(2), asyncHandler(async (req, res) => {
  const { loan_id, name, relationship, contact_number, income, address } = req.body;
  if (!loan_id||!name) return res.redirect('/admin/guarantors?error=Missing+fields');
  await store.query('INSERT INTO loan_guarantors (guarantor_id,loan_id,name,relationship,contact_number,address,income,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [uuidv4(), loan_id, name, relationship||'', contact_number||'', address||'', Number(income)||0, new Date().toISOString()]);
  res.redirect('/admin/guarantors?created=ok');
}));

// ============================================================
// 4. ASSET CLASSIFICATION (BSP-style)
// ============================================================
router.get('/asset-classification', requireRole(2), asyncHandler(async (req, res) => {
  const loans = await sql("SELECT l.*, a.child_name FROM loans l LEFT JOIN accounts a ON l.account_id = a.account_id ORDER BY l.created_at DESC");
  const classes = ['current','monitored','past_due','non_performing','restructured','loss'];
  const classColors = {current:'badge-green',monitored:'badge-amber',past_due:'badge-orange',non_performing:'badge-red',restructured:'badge-blue',loss:'badge-gray'};
  const q = req.query; const toast = q.updated?'success:Classification updated.':q.error?'error:'+q.error:'';
  const content = `<div class="stats-grid">
    ${classes.map(c => `<div class="stat-card"><div>${loans.filter(l=>(l.asset_classification||'current')===c).length}</div><div style="text-transform:capitalize">${c.replace(/_/g,' ')}</div></div>`).join('')}
  </div><div class="card"><div class="card-header"><h3>Asset Classification</h3></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Loan ID</th><th>Member</th><th class="num">Principal</th><th class="num">Balance</th><th>Classification</th><th>Days Past Due</th><th></th></tr>
    ${loans.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No loans</td></tr>' :
      loans.map(l => `<tr><td class="mono">${(l.loan_id||"").slice(0,8)}</td><td>${l.child_name||'-'}</td>
        <td class="num mono">${fmt(l.principal)}</td><td class="num mono">${fmt(l.remaining_balance)}</td>
        <td><span class="badge ${classColors[l.asset_classification]||'badge-green'}">${(l.asset_classification||'current').replace(/_/g,' ')}</span></td>
        <td class="num">${l.days_past_due||0}</td>
        <td><a href="#classify-${l.loan_id}" class="btn btn-secondary btn-xs">Change</a></td></tr>`).join('')}
  </table></div></div>
  ${loans.map(l => `<div id="classify-${l.loan_id}" class="modal-overlay"><div class="modal" style="max-width:400px"><a href="#" class="close">&times;</a>
  <h2>Classify: ${l.child_name||''}</h2>
  <form method="post" action="/admin/asset-classification/update/${l.loan_id}">
    <label>Classification</label><select name="classification" required>
      ${classes.map(c => `<option value="${c}" ${(l.asset_classification||'current')===c?'selected':''}>${c.replace(/_/g,' ').replace(/\b\w/g,cc=>cc.toUpperCase())}</option>`).join('')}
    </select>
    <label>Days Past Due</label><input type="number" name="days_past_due" value="${l.days_past_due||0}">
    <button type="submit" class="btn btn-primary">Update</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Asset Classification', 'asset-classification', content, { subtitle: 'BSP-style loan classification', toast }));
}));

router.post('/asset-classification/update/:id', requireRole(3), asyncHandler(async (req, res) => {
  const { classification, days_past_due } = req.body;
  await store.query('UPDATE loans SET asset_classification=$1, days_past_due=$2 WHERE loan_id=$3', [classification||'current', Number(days_past_due)||0, req.params.id]);
  res.redirect('/admin/asset-classification?updated=ok');
}));

// ============================================================
// 5. LATE FEE AUTO-CALCULATION
// ============================================================
router.get('/late-fees', requireRole(2), asyncHandler(async (req, res) => {
  const loans = await sql("SELECT l.*, a.child_name FROM loans l LEFT JOIN accounts a ON l.account_id = a.account_id WHERE l.status IN ($1,$2,$3) ORDER BY l.created_at DESC", ['approved','disbursed','active']);
  const q = req.query; const toast = q.charged?'success:Late fees charged.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Late Fee Assessment</h3>
    <div><a href="/admin/late-fees/charge-all" class="btn btn-primary btn-sm" data-confirm="Charge late fees on all overdue loans?">Charge All</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Loan ID</th><th>Member</th><th class="num">Principal</th><th class="num">Remaining</th><th>Due Date</th><th class="num">Days Overdue</th><th class="num">Late Fee Accrued</th><th></th></tr>
    ${loans.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No active loans</td></tr>' :
      loans.map(l => `<tr><td class="mono">${(l.loan_id||"").slice(0,8)}</td><td>${l.child_name||'-'}</td>
        <td class="num mono">${fmt(l.principal)}</td><td class="num mono">${fmt(l.remaining_balance)}</td>
        <td class="mono" style="font-size:11px">${(l.due_date||"").slice(0,10)}</td>
        <td class="num">${l.days_overdue||0}</td>
        <td class="num mono">${fmt(l.late_fee_accrued||0)}</td>
        <td><a href="/admin/late-fees/charge/${l.loan_id}" class="btn btn-sm btn-secondary" data-confirm="Charge late fee for ${l.child_name}?">Charge</a></td></tr>`).join('')}
  </table></div></div>`;
  res.type('html').send(layout('Late Fees', 'late-fees', content, { subtitle: 'Assess and charge late payment fees', toast }));
}));

router.get('/late-fees/charge/:id', requireRole(2), asyncHandler(async (req, res) => {
  const loan = await one('SELECT * FROM loans WHERE loan_id = $1', [req.params.id]);
  if (!loan) return res.redirect('/admin/late-fees?error=Loan+not+found');
  const fee = 50; // flat late fee per occurrence
  const newAccrued = Number(loan.late_fee_accrued||0) + fee;
  await store.query('UPDATE loans SET late_fee_accrued=$1, last_late_fee_date=$2 WHERE loan_id=$3', [newAccrued, new Date().toISOString(), req.params.id]);
  // Post fee to account
  const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [loan.account_id]);
  const txId = uuidv4();
  await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [txId, loan.account_id, 'fee', fee, Number(acc.actual_balance), Number(acc.actual_balance)-fee, 'Late payment fee - Loan '+loan.loan_id.slice(0,8), new Date().toISOString()]);
  await store.query('UPDATE accounts SET actual_balance = actual_balance - $1 WHERE account_id = $2', [fee, loan.account_id]);
  const gl = require('../services/gl');
  await gl.postDoubleEntry(txId, [{account_code:'1000',credit:fee,description:'Late fee charged'},{account_code:'4100',debit:fee,description:'Late fee income'}], { postedBy: req.session.adminName || 'admin', referenceType: 'late_fee' });
  res.redirect('/admin/late-fees?charged=ok');
}));

router.get('/late-fees/charge-all', requireRole(3), asyncHandler(async (req, res) => {
  const loans = await sql("SELECT * FROM loans WHERE status IN ($1,$2,$3)", ['approved','disbursed','active']);
  for (const loan of loans) {
    const newAccrued = Number(loan.late_fee_accrued||0) + 50;
    await store.query('UPDATE loans SET late_fee_accrued=$1, last_late_fee_date=$2 WHERE loan_id=$3', [newAccrued, new Date().toISOString(), loan.loan_id]);
  }
  res.redirect('/admin/late-fees?charged=ok');
}));

// ============================================================
// 6. TERM DEPOSITS / TIME DEPOSITS
// ============================================================
router.get('/term-deposits', requireRole(2), asyncHandler(async (req, res) => {
  const tds = await sql("SELECT t.*, a.child_name FROM term_deposits t LEFT JOIN accounts a ON t.account_id = a.account_id ORDER BY t.created_at DESC");
  const accounts = await sql('SELECT account_id, child_name, member_id FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.created?'success:Term deposit opened.':q.matured?'success:Term deposit matured.':q.closed?'success:Term deposit closed.':q.error?'error:'+q.error:'';
  const statusColors = {active:'badge-green',matured:'badge-amber',closed:'badge-gray',renewed:'badge-blue'};
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${tds.length}</div><div>Total TDs</div></div>
    <div class="stat-card"><div>${fmt(tds.reduce((s,t)=>s+Number(t.amount),0))}</div><div>Total Amount</div></div>
    <div class="stat-card"><div>${tds.filter(t=>t.status==='active').length}</div><div>Active</div></div>
    <div class="stat-card"><div>${tds.filter(t=>t.status==='matured').length}</div><div>Matured</div></div>
  </div><div class="card"><div class="card-header"><h3>Term Deposits</h3><div><a href="#add-td" class="btn btn-primary btn-sm">+ New TD</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>TD #</th><th>Member</th><th class="num">Amount</th><th class="num">Rate</th><th class="num">Term (days)</th><th>Maturity</th><th>Status</th><th class="num">Interest</th><th></th></tr>
    ${tds.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No term deposits</td></tr>' :
      tds.map(t => `<tr><td class="mono">${t.td_number||(t.td_id||"").slice(0,8)}</td><td>${t.child_name||'-'}</td>
        <td class="num mono">${fmt(t.amount)}</td><td class="num mono">${t.interest_rate}%</td><td class="num">${t.term_days}</td>
        <td class="mono" style="font-size:11px">${(t.maturity_date||"").slice(0,10)}</td>
        <td><span class="badge ${statusColors[t.status]||'badge-gray'}">${t.status}</span></td>
        <td class="num mono">${fmt(t.interest_earned)}</td>
        <td>${t.status==='matured'?`<a href="/admin/term-deposits/close/${t.td_id}" class="btn btn-success btn-xs">Close & Payout</a>`:''}
          ${t.status==='active'?`<a href="/admin/term-deposits/mature/${t.td_id}" class="btn btn-amber btn-xs">Mark Matured</a>`:''}</td></tr>`).join('')}
  </table></div></div>
  <div id="add-td" class="modal-overlay"><div class="modal" style="max-width:480px"><a href="#" class="close">&times;</a>
  <h2>New Term Deposit</h2>
  <form method="post" action="/admin/term-deposits/create">
    <label>Member</label><select name="account_id" required>
      <option value="">-- Select --</option>${accounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select>
    <div class="form-row"><div><label>Amount</label><input type="number" name="amount" min="0" step="0.01" required></div>
      <div><label>Interest Rate (%)</label><input type="number" name="interest_rate" min="0" step="0.01" value="6" required></div></div>
    <div class="form-row"><div><label>Term (days)</label><select name="term_days" required>
      <option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option>
      <option value="180">180 days</option><option value="365">365 days</option></select></div>
      <div><label>Renew</label><select name="auto_renew"><option value="0">Mature (no renew)</option><option value="1">Auto-renew</option></select></div></div>
    <button type="submit" class="btn btn-primary">Open Term Deposit</button>
  </form></div></div>`;
  res.type('html').send(layout('Term Deposits', 'term-deposits', content, { subtitle: 'Time deposit management', toast }));
}));

router.post('/term-deposits/create', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, amount, interest_rate, term_days, auto_renew } = req.body;
  if (!account_id||!amount) return res.redirect('/admin/term-deposits?error=Missing+fields');
  const tdNumber = 'TD-' + Date.now().toString(36).toUpperCase();
  const maturity = new Date(Date.now() + Number(term_days)*86400000).toISOString();
  await store.query('INSERT INTO term_deposits (td_id,account_id,td_number,amount,term_days,interest_rate,maturity_date,status,auto_renew,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [uuidv4(), account_id, tdNumber, Number(amount), Number(term_days), Number(interest_rate), maturity, 'active', Number(auto_renew)||0, new Date().toISOString()]);
  // Debit from savings
  const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [account_id]);
  const txId = uuidv4();
  await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [txId, account_id, 'td_placement', Number(amount), Number(acc.actual_balance), Number(acc.actual_balance)-Number(amount), 'Time deposit placement '+tdNumber, new Date().toISOString()]);
  await store.query('UPDATE accounts SET actual_balance = actual_balance - $1 WHERE account_id = $2', [Number(amount), account_id]);
  res.redirect('/admin/term-deposits?created=ok');
}));

router.get('/term-deposits/mature/:id', requireRole(2), asyncHandler(async (req, res) => {
  const td = await one('SELECT * FROM term_deposits WHERE td_id=$1', [req.params.id]);
  if (!td) return res.redirect('/admin/term-deposits?error=TD+not+found');
  const interest = Number(td.amount) * Number(td.interest_rate)/100 * Number(td.term_days)/365;
  await store.query('UPDATE term_deposits SET status=$1, interest_earned=$2 WHERE td_id=$3', ['matured', interest, req.params.id]);
  res.redirect('/admin/term-deposits?matured=ok');
}));

router.get('/term-deposits/close/:id', requireRole(2), asyncHandler(async (req, res) => {
  const td = await one('SELECT * FROM term_deposits WHERE td_id=$1', [req.params.id]);
  if (!td) return res.redirect('/admin/term-deposits?error=TD+not+found');
  const payout = Number(td.amount) + Number(td.interest_earned);
  await store.query('UPDATE term_deposits SET status=$1, closed_at=$2 WHERE td_id=$3', ['closed', new Date().toISOString(), req.params.id]);
  // Credit back to savings
  const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [td.account_id]);
  const txId = uuidv4();
  await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [txId, td.account_id, 'td_maturity', payout, Number(acc.actual_balance), Number(acc.actual_balance)+payout, 'Time deposit maturity payout '+td.td_number, new Date().toISOString()]);
  await store.query('UPDATE accounts SET actual_balance = actual_balance + $1 WHERE account_id = $2', [payout, td.account_id]);
  res.redirect('/admin/term-deposits?closed=ok');
}));

// ============================================================
// 7. SHARE CAPITAL MANAGEMENT
// ============================================================
router.get('/share-capital', requireRole(2), asyncHandler(async (req, res) => {
  const accounts = await sql('SELECT account_id, child_name, member_id, total_shares, share_capital_balance FROM accounts WHERE COALESCE(total_shares,0) > 0 OR COALESCE(share_capital_balance,0) > 0 ORDER BY child_name');
  const allAccounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name');
  const totalShares = accounts.reduce((s,a)=>s+Number(a.total_shares),0);
  const totalCapital = accounts.reduce((s,a)=>s+Number(a.share_capital_balance),0);
  const q = req.query; const toast = q.subscribed?'success:Shares subscribed.':q.error?'error:'+q.error:'';
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${accounts.length}</div><div>Shareholders</div></div>
    <div class="stat-card"><div>${totalShares}</div><div>Total Shares</div></div>
    <div class="stat-card"><div>${fmt(totalCapital)}</div><div>Total Capital</div></div>
  </div><div class="card"><div class="card-header"><h3>Share Capital</h3><div><a href="#subscribe" class="btn btn-primary btn-sm">+ Subscribe Shares</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Member</th><th>Member ID</th><th class="num">Shares</th><th class="num">Capital Balance</th><th></th></tr>
    ${accounts.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No share capital records</td></tr>' :
      accounts.map(a => `<tr><td><b>${a.child_name}</b></td><td class="mono">${a.member_id||'-'}</td>
        <td class="num">${Number(a.total_shares)}</td><td class="num mono">${fmt(a.share_capital_balance)}</td>
        <td><a href="#subscribe-${a.account_id}" class="btn btn-secondary btn-xs">+ Subscribe</a></td></tr>`).join('')}
  </table></div></div>
  <div id="subscribe" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>Subscribe Shares</h2>
  <form method="post" action="/admin/share-capital/subscribe">
    <label>Member</label><select name="account_id" required>${allAccounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select>
    <div class="form-row"><div><label>No. of Shares</label><input type="number" name="shares" min="1" required></div>
      <div><label>Share Value (each)</label><input type="number" name="share_value" min="0" step="0.01" value="100"></div></div>
    <label>Notes</label><input type="text" name="notes" placeholder="Optional">
    <button type="submit" class="btn btn-primary">Subscribe</button>
  </form></div></div>
  ${accounts.map(a => `<div id="subscribe-${a.account_id}" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>Subscribe: ${a.child_name}</h2>
  <form method="post" action="/admin/share-capital/subscribe">
    <input type="hidden" name="account_id" value="${a.account_id}">
    <div class="form-row"><div><label>Shares</label><input type="number" name="shares" min="1" required></div>
      <div><label>Share Value</label><input type="number" name="share_value" min="0" step="0.01" value="100"></div></div>
    <button type="submit" class="btn btn-primary">Subscribe</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Share Capital', 'share-capital', content, { subtitle: 'Member share capital tracking and subscription', toast }));
}));

router.post('/share-capital/subscribe', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, shares, share_value, notes } = req.body;
  if (!account_id||!shares) return res.redirect('/admin/share-capital?error=Missing+fields');
  const total = Number(shares) * Number(share_value||100);
  const txId = uuidv4();
  await store.query('INSERT INTO share_capital (share_id,account_id,shares,share_value,total_amount,transaction_type,notes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [uuidv4(), account_id, Number(shares), Number(share_value||100), total, 'subscription', notes||'', new Date().toISOString()]);
  await store.query('UPDATE accounts SET total_shares = COALESCE(total_shares,0)+$1, share_capital_balance = COALESCE(share_capital_balance,0)+$2 WHERE account_id=$3',
    [Number(shares), total, account_id]);
  // Debit from savings
  const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [account_id]);
  await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [txId, account_id, 'share_subscription', total, Number(acc.actual_balance), Number(acc.actual_balance)-total, 'Share subscription - '+shares+' shares', new Date().toISOString()]);
  await store.query('UPDATE accounts SET actual_balance = actual_balance - $1 WHERE account_id = $2', [total, account_id]);
  res.redirect('/admin/share-capital?subscribed=ok');
}));

// ============================================================
// 8. DIVIDEND COMPUTATION
// ============================================================
router.get('/dividends', requireRole(3), asyncHandler(async (req, res) => {
  const divs = await sql('SELECT * FROM dividends ORDER BY year DESC');
  const totalShares = await one('SELECT COALESCE(SUM(total_shares),0) as ts, COALESCE(SUM(share_capital_balance),0) as tc FROM accounts');
  const q = req.query; const toast = q.declared?'success:Dividend declared.':q.paid?'success:Dividend paid.':q.error?'error:'+q.error:'';
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${divs.length}</div><div>Declarations</div></div>
    <div class="stat-card"><div>${fmt(divs.reduce((s,d)=>s+Number(d.total_amount),0))}</div><div>Total Distributed</div></div>
    <div class="stat-card"><div>${Number(totalShares.ts)}</div><div>Total Shares</div></div>
  </div><div class="card"><div class="card-header"><h3>Dividend Declarations</h3><div><a href="#declare-dividend" class="btn btn-primary btn-sm">+ Declare Dividend</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Year</th><th class="num">Total Amount</th><th class="num">Rate</th><th class="num">Per Share</th><th>Declared</th><th>Paid</th><th>Status</th><th></th></tr>
    ${divs.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No dividends declared</td></tr>' :
      divs.map(d => `<tr><td><b>${d.year}</b></td><td class="num mono">${fmt(d.total_amount)}</td>
        <td class="num mono">${d.rate}%</td><td class="num mono">${fmt(d.per_share)}</td>
        <td class="mono" style="font-size:11px">${(d.declared_date||"").slice(0,10)}</td>
        <td class="mono" style="font-size:11px">${d.paid_date?(d.paid_date||"").slice(0,10):'-'}</td>
        <td><span class="badge ${d.status==='declared'?'badge-amber':'badge-green'}">${d.status}</span></td>
        <td>${d.status==='declared'?`<a href="/admin/dividends/pay/${d.dividend_id}" class="btn btn-success btn-xs" data-confirm="Pay dividend for ${d.year}?">Pay Out</a>`:''}</td></tr>`).join('')}
  </table></div></div>
  <div id="declare-dividend" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>Declare Dividend</h2>
  <form method="post" action="/admin/dividends/declare">
    <div class="form-row"><div><label>Year</label><input type="number" name="year" value="${new Date().getFullYear()}" required></div>
      <div><label>Rate (%)</label><input type="number" name="rate" min="0" step="0.01" required></div></div>
    <div class="form-row"><div><label>Total Amount</label><input type="number" name="total_amount" min="0" step="0.01" required></div>
      <div><label>Per Share</label><input type="number" name="per_share" min="0" step="0.0001" required></div></div>
    <button type="submit" class="btn btn-primary">Declare Dividend</button>
  </form></div></div>`;
  res.type('html').send(layout('Dividends', 'dividends', content, { subtitle: 'Shareholder dividend computation and payout', toast }));
}));

router.post('/dividends/declare', requireRole(3), asyncHandler(async (req, res) => {
  const { year, rate, total_amount, per_share } = req.body;
  if (!year||!rate) return res.redirect('/admin/dividends?error=Missing+fields');
  const totalAmt = Number(total_amount) || 0;
  await store.query('INSERT INTO dividends (dividend_id,year,total_amount,rate,per_share,declared_date,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [uuidv4(), Number(year), totalAmt, Number(rate), Number(per_share)||0, new Date().toISOString(), 'declared', new Date().toISOString()]);
  // Withholding tax on dividends (10% per tax_config)
  const taxConfig = await one("SELECT * FROM tax_config WHERE applies_to = 'dividend' AND is_active = 1 LIMIT 1");
  const taxRate = taxConfig ? Number(taxConfig.rate) / 100 : 0;
  const taxAmount = Math.round(totalAmt * taxRate * 100) / 100;
  const netDividend = Math.round((totalAmt - taxAmount) * 100) / 100;
  const gl = require('../services/gl');
  await gl.postDoubleEntry(uuidv4(), [
    {account_code:'3100', debit: totalAmt, description:'Dividend declared (gross) '+year},
    {account_code:'2400', credit: taxAmount, description:'Dividend withholding tax '+year},
    {account_code:'3000', credit: netDividend, description:'Dividend payable (net) '+year},
  ], { postedBy: req.session.adminName || 'admin', referenceType: 'dividend' });
  res.redirect('/admin/dividends?declared=ok');
}));

router.get('/dividends/pay/:id', requireRole(3), asyncHandler(async (req, res) => {
  const div = await one('SELECT * FROM dividends WHERE dividend_id=$1', [req.params.id]);
  if (!div) return res.redirect('/admin/dividends?error=Not+found');
  const shareholders = await sql('SELECT account_id, child_name, total_shares, share_capital_balance FROM accounts WHERE COALESCE(total_shares,0) > 0');
  for (const sh of shareholders) {
    const amount = Number(sh.total_shares) * Number(div.per_share);
    if (amount <= 0) continue;
    await store.query('INSERT INTO share_capital (share_id,account_id,shares,share_value,total_amount,transaction_type,notes,created_at) VALUES ($1,$2,0,0,$3,$4,$5,$6)',
      [uuidv4(), sh.account_id, amount, 'dividend', 'Dividend payout '+div.year, new Date().toISOString()]);
    await store.query('UPDATE accounts SET actual_balance = actual_balance + $1 WHERE account_id = $2', [amount, sh.account_id]);
  }
  await store.query('UPDATE dividends SET status=$1, paid_date=$2 WHERE dividend_id=$3', ['paid', new Date().toISOString(), req.params.id]);
  res.redirect('/admin/dividends?paid=ok');
}));

// ============================================================
// 9. OVERDRAFT PROCESSING
// ============================================================
router.get('/overdrafts', requireRole(2), asyncHandler(async (req, res) => {
  const accounts = await sql("SELECT account_id, child_name, member_id, actual_balance, overdraft_limit, overdraft_interest_rate FROM accounts WHERE COALESCE(overdraft_limit,0) > 0 ORDER BY child_name");
  const allAccounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.updated?'success:Overdraft updated.':q.error?'error:'+q.error:'';
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${accounts.length}</div><div>With OD Facility</div></div>
    <div class="stat-card"><div>${fmt(accounts.reduce((s,a)=>s+Number(a.overdraft_limit),0))}</div><div>Total OD Limit</div></div>
  </div><div class="card"><div class="card-header"><h3>Overdraft Facilities</h3></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Member</th><th class="num">Balance</th><th class="num">OD Limit</th><th class="num">Rate</th><th class="num">Available OD</th><th></th></tr>
    ${accounts.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No overdraft accounts</td></tr>' :
      accounts.map(a => { const avail = Number(a.overdraft_limit) + Math.min(0, Number(a.actual_balance)); return `<tr>
        <td><b>${a.child_name}</b></td><td class="num mono">${fmt(a.actual_balance)}</td>
        <td class="num mono">${fmt(a.overdraft_limit)}</td><td class="num mono">${a.overdraft_interest_rate||0}%</td>
        <td class="num mono" style="color:${avail>0?'#16a34a':'#dc2626'}">${fmt(avail)}</td>
        <td><a href="/admin/overdrafts/setup/${a.account_id}" class="btn btn-secondary btn-xs">Edit</a></td></tr>`}).join('')}
  </table></div></div>`;
  res.type('html').send(layout('Overdrafts', 'overdrafts', content, { subtitle: 'Overdraft facility management', toast }));
}));

router.get('/overdrafts/setup/:id', requireRole(3), asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM accounts WHERE account_id=$1', [req.params.id]);
  if (!a) return res.redirect('/admin/overdrafts?error=Not+found');
  const content = `<div class="card" style="max-width:500px;margin:0 auto"><div class="card-header"><h3>Overdraft: ${a.child_name}</h3></div>
  <div class="card-body-padded"><form method="post" action="/admin/overdrafts/save/${a.account_id}">
    <label>Overdraft Limit</label><input type="number" name="overdraft_limit" min="0" step="0.01" value="${a.overdraft_limit||0}">
    <label>Interest Rate (%)</label><input type="number" name="overdraft_interest_rate" min="0" step="0.01" value="${a.overdraft_interest_rate||0}">
    <button type="submit" class="btn btn-primary">Save</button>
    <a href="/admin/overdrafts" class="btn btn-cancel">Cancel</a>
  </form></div></div>`;
  res.type('html').send(layout('Overdraft Setup', 'overdrafts', content));
}));

router.post('/overdrafts/save/:id', requireRole(3), asyncHandler(async (req, res) => {
  const { overdraft_limit, overdraft_interest_rate } = req.body;
  await store.query('UPDATE accounts SET overdraft_limit=$1, overdraft_interest_rate=$2 WHERE account_id=$3',
    [Number(overdraft_limit)||0, Number(overdraft_interest_rate)||0, req.params.id]);
  res.redirect('/admin/overdrafts?updated=ok');
}));

// ============================================================
// 10. FULL MEMBER DEMOGRAPHICS
// ============================================================
router.get('/member-demographics', requireRole(1), asyncHandler(async (req, res) => {
  const accounts = await sql('SELECT account_id, child_name, member_id, birthday, age, gender, civil_status, occupation, employer, monthly_income, address, city, province, postal_code, parent_phone, email FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.updated?'success:Demographics updated.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Member Demographics</h3></div>
  <div class="card-body" style="padding:0"><table><tr><th>Name</th><th>Member ID</th><th>Birthday</th><th>Age</th><th>Gender</th><th>Civil Status</th><th>Occupation</th><th>City</th><th></th></tr>
    ${accounts.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No members</td></tr>' :
      accounts.map(a => `<tr><td><b>${a.child_name}</b></td><td class="mono">${a.member_id||'-'}</td>
        <td class="mono">${a.birthday||'-'}</td><td class="num">${a.age||'-'}</td><td>${a.gender||'-'}</td>
        <td>${a.civil_status||'-'}</td><td style="font-size:12px">${a.occupation||'-'}</td><td>${a.city||'-'}</td>
        <td><a href="#demo-${a.account_id}" class="btn btn-secondary btn-xs">Edit</a></td></tr>`).join('')}
  </table></div></div>
  ${accounts.map(a => `<div id="demo-${a.account_id}" class="modal-overlay"><div class="modal" style="max-width:560px"><a href="#" class="close">&times;</a>
  <h2>Demographics: ${a.child_name}</h2>
  <form method="post" action="/admin/member-demographics/update/${a.account_id}">
    <div class="form-row"><div><label>Civil Status</label><select name="civil_status"><option value="">--</option>
      <option value="Single" ${a.civil_status==='Single'?'selected':''}>Single</option><option value="Married" ${a.civil_status==='Married'?'selected':''}>Married</option>
      <option value="Divorced" ${a.civil_status==='Divorced'?'selected':''}>Divorced</option><option value="Widowed" ${a.civil_status==='Widowed'?'selected':''}>Widowed</option></select></div>
      <div><label>Occupation</label><input type="text" name="occupation" value="${a.occupation||''}"></div></div>
    <div class="form-row"><div><label>Employer</label><input type="text" name="employer" value="${a.employer||''}"></div>
      <div><label>Monthly Income</label><input type="number" name="monthly_income" min="0" step="0.01" value="${a.monthly_income||0}"></div></div>
    <label>Address</label><input type="text" name="address" value="${a.address||''}">
    <div class="form-row"><div><label>City</label><input type="text" name="city" value="${a.city||''}"></div>
      <div><label>Province</label><input type="text" name="province" value="${a.province||''}"></div>
      <div><label>Postal Code</label><input type="text" name="postal_code" value="${a.postal_code||''}"></div></div>
    <button type="submit" class="btn btn-primary">Save</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Member Demographics', 'member-demographics', content, { subtitle: 'Full member information', toast }));
}));

router.post('/member-demographics/update/:id', requireRole(1), asyncHandler(async (req, res) => {
  const { civil_status, occupation, employer, monthly_income, address, city, province, postal_code } = req.body;
  await store.query('UPDATE accounts SET civil_status=$1, occupation=$2, employer=$3, monthly_income=$4, address=$5, city=$6, province=$7, postal_code=$8 WHERE account_id=$9',
    [civil_status||'', occupation||'', employer||'', Number(monthly_income)||0, address||'', city||'', province||'', postal_code||'', req.params.id]);
  res.redirect('/admin/member-demographics?updated=ok');
}));

// ============================================================
// 11. CASH FLOW STATEMENT
// ============================================================
router.get('/cash-flow', requireRole(1), asyncHandler(async (req, res) => {
  const now = new Date(); const firstDay = new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
  const today = now.toISOString().slice(0,10);
  const from = req.query.from || firstDay; const to = req.query.to || today;
  const deposits = await one("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type IN ($1,$2,$3) AND created_at BETWEEN $4 AND $5", ['deposit','interest_credit','fee', from+'T00:00:00', to+'T23:59:59']);
  const withdrawals = await one("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type IN ($1,$2) AND created_at BETWEEN $3 AND $4", ['withdrawal','loan_payment', from+'T00:00:00', to+'T23:59:59']);
  const loanDisb = await one("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type=$1 AND created_at BETWEEN $2 AND $3", ['loan_disbursement', from+'T00:00:00', to+'T23:59:59']);
  const opCash = await one("SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) as bal FROM gl_entries WHERE account_code='1000' AND created_at < $1", [from+'T00:00:00']);
  const op = Number(opCash?.bal||0);
  const dep = Number(deposits.total||0); const wd = Number(withdrawals.total||0); const ld = Number(loanDisb.total||0);
  const totalIn = dep; const totalOut = wd + ld;
  const net = totalIn - totalOut; const cl = op + net;

  // Category breakdown
  const categories = await sql(`
    SELECT type, COALESCE(SUM(amount),0) as total FROM transactions
    WHERE created_at BETWEEN $1 AND $2 GROUP BY type ORDER BY total DESC
  `, [from+'T00:00:00', to+'T23:59:59']);
  const breakdown = { withdrawals: wd, loan_payments: 0, fees: 0 };
  categories.forEach(c => { if (c.type === 'loan_payment') breakdown.loan_payments = Number(c.total); if (c.type === 'fee') breakdown.fees = Number(c.total); });

  // Monthly breakdown
  const monthExpr = isPostgres ? "to_char(created_at::timestamp, 'YYYY-MM')" : "strftime('%Y-%m', created_at)";
  const monthly = await sql(`
    SELECT ${monthExpr} as month,
      COALESCE(SUM(CASE WHEN type IN ('deposit','interest_credit','fee') THEN amount ELSE 0 END),0) as inflows,
      COALESCE(SUM(CASE WHEN type IN ('withdrawal','loan_payment','loan_disbursement') THEN amount ELSE 0 END),0) as outflows
    FROM transactions WHERE created_at BETWEEN $1 AND $2 GROUP BY month ORDER BY month
  `, [from+'T00:00:00', to+'T23:59:59']);

  const catLabels = JSON.stringify(categories.map(c => c.type.replace(/_/g,' ')));
  const catData = JSON.stringify(categories.map(c => Number(c.total)));
  const catColors = JSON.stringify(categories.map(c => {
    const m = { deposit:'#16a34a', withdrawal:'#dc2626', loan_payment:'#3b82f6', loan_disbursement:'#f59e0b', interest_credit:'#8b5cf6', fee:'#ef4444' };
    return m[c.type] || '#6b7280';
  }));

  const monthLabels = JSON.stringify(monthly.map(m => m.month));
  const monthIn = JSON.stringify(monthly.map(m => Number(m.inflows)));
  const monthOut = JSON.stringify(monthly.map(m => Number(m.outflows)));

  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 180px"><label>From</label>
        <input type="date" id="cfFrom" value="${from}" onchange="updateCashFlow()">
      </div>
      <div class="field" style="flex:0 0 180px"><label>To</label>
        <input type="date" id="cfTo" value="${to}" onchange="updateCashFlow()">
      </div>
      <button class="btn btn-primary btn-sm" onclick="updateCashFlow()"><i class="fas fa-search"></i> View</button>
      <a href="/admin/cash-flow" class="btn btn-outline btn-sm"><i class="fas fa-undo"></i> Reset</a>
      <div style="flex:1;text-align:right">
        <a href="/admin/cash-flow?from=${from}&to=${to}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> Export CSV</a>
        <a href="/admin/cash-flow?from=${from}&to=${to}&print=1" class="btn btn-outline btn-sm" target="_blank"><i class="fas fa-print"></i> Print</a>
      </div>
    </div>
  </div>
  <script>
  function updateCashFlow() {
    var f = document.getElementById('cfFrom').value;
    var t = document.getElementById('cfTo').value;
    location.href = '/admin/cash-flow?from=' + f + '&to=' + t;
  }
  </script>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-piggy-bank"></i></div><div class="stat-value">${fmt(op)}</div><div class="stat-label">Opening Balance</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-arrow-down"></i></div><div class="stat-value" style="color:#16a34a">+${fmt(totalIn)}</div><div class="stat-label">Total Inflows</div></div>
    <div class="stat-card" style="border-left:4px solid #dc2626"><div class="stat-icon"><i class="fas fa-arrow-up"></i></div><div class="stat-value" style="color:#dc2626">-${fmt(totalOut)}</div><div class="stat-label">Total Outflows</div></div>
    <div class="stat-card" style="border-left:4px solid ${net>=0?'#16a34a':'#dc2626'}"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-value" style="color:${net>=0?'#16a34a':'#dc2626'}">${net>=0?'+':''}${fmt(net)}</div><div class="stat-label">Net Cash Flow</div></div>
    <div class="stat-card" style="border-left:4px solid #2563eb"><div class="stat-icon"><i class="fas fa-wallet"></i></div><div class="stat-value" style="color:#2563eb">${fmt(cl)}</div><div class="stat-label">Closing Balance</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-list"></i> Cash Flow Statement</h3></div>
    <div class="card-body-padded">
    <table style="width:100%;max-width:600px">
      <tr><td style="font-weight:600;padding:10px 12px">Opening Cash Balance</td><td class="num mono" style="font-weight:600">${fmt(op)}</td></tr>
      <tr style="background:var(--bg-secondary)"><td colspan="2" style="font-weight:600;padding:8px 12px"><i class="fas fa-arrow-down" style="color:#16a34a"></i> Cash Inflows</td></tr>
      <tr><td style="padding-left:28px">Deposits & Interest Credits</td><td class="num mono" style="color:#16a34a">+${fmt(dep)}</td></tr>
      <tr><td style="padding-left:28px;font-weight:600">Total Inflows</td><td class="num mono" style="color:#16a34a;font-weight:600">+${fmt(totalIn)}</td></tr>
      <tr style="background:var(--bg-secondary)"><td colspan="2" style="font-weight:600;padding:8px 12px"><i class="fas fa-arrow-up" style="color:#dc2626"></i> Cash Outflows</td></tr>
      <tr><td style="padding-left:28px">Withdrawals</td><td class="num mono" style="color:#dc2626">-${fmt(breakdown.withdrawals)}</td></tr>
      <tr><td style="padding-left:28px">Loan Payments</td><td class="num mono" style="color:#dc2626">-${fmt(breakdown.loan_payments)}</td></tr>
      <tr><td style="padding-left:28px">Fees</td><td class="num mono" style="color:#dc2626">-${fmt(breakdown.fees)}</td></tr>
      <tr><td style="padding-left:28px">Loan Disbursements</td><td class="num mono" style="color:#dc2626">-${fmt(ld)}</td></tr>
      <tr><td style="padding-left:28px;font-weight:600">Total Outflows</td><td class="num mono" style="color:#dc2626;font-weight:600">-${fmt(totalOut)}</td></tr>
      <tr style="border-top:2px solid var(--border)"><td style="font-weight:700;padding:10px 12px">Net Cash Flow</td>
        <td class="num mono" style="font-weight:700;color:${net>=0?'#16a34a':'#dc2626'}">${net>=0?'+':''}${fmt(net)}</td></tr>
      <tr style="border-top:2px solid var(--border)"><td style="font-weight:700;font-size:14px;padding:10px 12px">Closing Cash Balance</td>
        <td class="num mono" style="font-weight:700;font-size:14px;color:${cl>=0?'#16a34a':'#dc2626'}">${fmt(cl)}</td></tr>
    </table></div></div>
  ${monthly.length > 0 ? `
  <div class="stats-grid" style="grid-template-columns:1fr 1fr">
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-chart-area"></i> Monthly Trend</h3></div>
      <div class="card-body"><canvas id="cfTrendChart" height="140"></canvas></div>
    </div>
    <div class="card" style="padding:0">
      <div class="card-header"><h3><i class="fas fa-chart-pie"></i> Category Breakdown</h3></div>
      <div class="card-body"><canvas id="cfPieChart" height="140"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-table"></i> Monthly Breakdown</h3><span class="count">${monthly.length} months</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Month</th><th class="num">Inflows</th><th class="num">Outflows</th><th class="num">Net</th></tr>
      ${monthly.map(m => { const n = Number(m.inflows) - Number(m.outflows); return `
      <tr>
        <td><b>${m.month}</b></td>
        <td class="num mono" style="color:#16a34a">+${fmt(m.inflows)}</td>
        <td class="num mono" style="color:#dc2626">-${fmt(m.outflows)}</td>
        <td class="num mono" style="font-weight:600;color:${n>=0?'#16a34a':'#dc2626'}">${n>=0?'+':''}${fmt(n)}</td>
      </tr>`; }).join('')}
      <tr style="font-weight:700;background:var(--bg-muted)">
        <td>TOTAL</td><td class="num mono" style="color:#16a34a">+${fmt(totalIn)}</td>
        <td class="num mono" style="color:#dc2626">-${fmt(totalOut)}</td>
        <td class="num mono" style="color:${net>=0?'#16a34a':'#dc2626'}">${net>=0?'+':''}${fmt(net)}</td>
      </tr>
    </table></div>
  </div>
  <script>
  new Chart(document.getElementById('cfTrendChart'), {
    type: 'line',
    data: {
      labels: ${monthLabels},
      datasets: [
        { label: 'Inflows', data: ${monthIn}, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', fill: true, tension: 0.3 },
        { label: 'Outflows', data: ${monthOut}, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.1)', fill: true, tension: 0.3 }
      ]
    },
    options: {
      responsive: true, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { position: 'top', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#fff', font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₱'+v.toLocaleString() } } }
    }
  });
  new Chart(document.getElementById('cfPieChart'), {
    type: 'doughnut',
    data: { labels: ${catLabels}, datasets: [{ data: ${catData}, backgroundColor: ${catColors} }] },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#fff', font: { size: 11 } } } } }
  });
  </script>` : '<div class="card"><div class="card-body-padded" style="text-align:center;color:var(--text-muted);padding:40px"><i class="fas fa-chart-line" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i> No transactions found for this period.</div></div>'}`;
  if (req.query.export === 'csv') {
    let csv = 'Month,Inflows,Outflows,Net\n';
    monthly.forEach(m => { const n = Number(m.inflows) - Number(m.outflows); csv += `${m.month},${Number(m.inflows).toFixed(2)},${Number(m.outflows).toFixed(2)},${n.toFixed(2)}\n`; });
    csv += `TOTAL,${totalIn.toFixed(2)},${totalOut.toFixed(2)},${net.toFixed(2)}\n`;
    csv += `\nOpening Balance,${op.toFixed(2)}\nClosing Balance,${cl.toFixed(2)}\n`;
    csv += `\nCategory,Amount\n`;
    categories.forEach(c => { csv += `${c.type},${Number(c.total).toFixed(2)}\n`; });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cash_flow_${from}_${to}.csv"`);
    return res.send(csv);
  }
  if (req.query.print) {
    const fmtAmt = v => '\u20B1' + Number(v || 0).toFixed(2);
    const signedCat = (types, signs) => categories.filter(c => types.includes(c.type)).map(c => ({ name: c.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), amount: Number(c.total) * (signs[c.type] || 1) }));
    const s = { deposit: 1, interest_credit: 1, fee: -1, withdrawal: -1, loan_disbursement: -1, loan_payment: 1 };
    const operating = signedCat(['deposit','interest_credit','fee','withdrawal'], s);
    const investing = signedCat(['loan_disbursement'], s);
    const financing = signedCat(['loan_payment'], s);
    const operatingTotal = operating.reduce((a, i) => a + i.amount, 0);
    const investingTotal = investing.reduce((a, i) => a + i.amount, 0);
    const financingTotal = financing.reduce((a, i) => a + i.amount, 0);
    let printContent = '';
    const makeSection = (title, items, total, color) => {
      const rows = items.map(i => ({ cells: [i.name, i.amount < 0 ? '(' + fmtAmt(Math.abs(i.amount)) + ')' : fmtAmt(i.amount)] }));
      printContent += `<div class="section-title">${title}</div>` + reportTable(['Item', 'Amount'], rows, { totalCells: ['TOTAL ' + title.toUpperCase(), '<span style="color:' + color + ';font-weight:700">' + fmtAmt(total) + '</span>'] });
    };
    makeSection('Operating Activities', operating, operatingTotal, '#16a34a');
    makeSection('Investing Activities', investing, investingTotal, '#2563eb');
    makeSection('Financing Activities', financing, financingTotal, '#8b5cf6');
    printContent += '<div class="section-title">Net Cash Flow</div>' + reportTable(['', 'Amount'], [
      { cells: ['Net Cash from Operations', fmtAmt(operatingTotal)] },
      { cells: ['Net Cash from Investing', fmtAmt(investingTotal)] },
      { cells: ['Net Cash from Financing', fmtAmt(financingTotal)] },
      { cells: ['NET CASH FLOW', '<span style="font-weight:700;color:' + (net >= 0 ? '#16a34a' : '#dc2626') + '">' + (net < 0 ? '(' + fmtAmt(Math.abs(net)) + ')' : fmtAmt(net)) + '</span>'], cls: 'total-row' },
    ], { totalCells: false });
    printContent += '<div class="section-title">Beg/End Cash</div>' + reportTable(['', 'Amount'], [
      { cells: ['Beginning Cash Balance', fmtAmt(op)] },
      { cells: ['Net Cash Flow', fmtAmt(net)] },
      { cells: ['ENDING CASH BALANCE', '<span style="font-weight:700;color:#2563eb">' + fmtAmt(cl) + '</span>'], cls: 'total-row' },
    ], { totalCells: false });
    return res.type('html').send(printLayout('Cash Flow Statement', printContent, { subtitle: from + ' to ' + to, dateRange: from + ' to ' + to, orientation: 'portrait', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'General Manager' }));
  }
  res.type('html').send(layout('Cash Flow Statement', 'cash-flow', content, { subtitle: from + ' to ' + to }));
}));

// ============================================================
// 12. BUDGET vs ACTUAL
// ============================================================
router.get('/budget', requireRole(3), asyncHandler(async (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  // Get actuals from GL for ALL income/expense accounts
  const actuals = await sql(`SELECT g.code, g.name, g.type, g.category,
    COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN
      CASE WHEN g.type='income' THEN e.credit - e.debit ELSE e.debit - e.credit END
    ELSE 0 END),0) as bal
    FROM gl_accounts g LEFT JOIN gl_entries e ON g.code = e.account_code AND e.created_at LIKE $1
    WHERE g.type IN ('income','expense') GROUP BY g.code, g.name, g.type, g.category ORDER BY g.code`,
    [year + '%']);

  // Get budgets from settings (stored as JSON)
  const budgetJson = await store.getSetting('budget_' + year) || '{}';
  let budgets = {};
  try { budgets = JSON.parse(budgetJson); } catch(e) {}

  const incTotal = actuals.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.bal), 0);
  const expTotal = actuals.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.bal), 0);
  const incBudget = actuals.filter(r => r.type === 'income').reduce((s, r) => s + Number(budgets[r.code] || 0), 0);
  const expBudget = actuals.filter(r => r.type === 'expense').reduce((s, r) => s + Number(budgets[r.code] || 0), 0);

  const budgetForm = actuals.map(r => {
    const b = Number(budgets[r.code] || 0);
    const a = Number(r.bal);
    const v = b - a;
    const color = r.type === 'income' ? (a >= b ? '#16a34a' : '#dc2626') : (a <= b ? '#16a34a' : '#dc2626');
    return `<tr>
      <td>${r.code} — ${r.name}</td>
      <td class="num mono"><input type="number" name="budget_${r.code}" value="${b.toFixed(2)}" step="0.01" style="width:100px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;text-align:right"></td>
      <td class="num mono" style="color:#16a34a">${fmt(a)}</td>
      <td class="num mono" style="color:${color};font-weight:600">${v >= 0 ? '+' : ''}${fmt(v)}</td>
    </tr>`;
  }).join('');

  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 160px"><label>Year</label>
        <select id="bYear" onchange="location.href='/admin/budget?year='+this.value">
          ${Array.from({length: 5}, (_, i) => { const y = new Date().getFullYear() - i; return '<option value="' + y + '" ' + (Number(year) === y ? 'selected' : '') + '>' + y + '</option>'; }).join('')}
        </select>
      </div>
      <div style="flex:1;text-align:right">
        <a href="/admin/budget?year=${year}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
      </div>
    </div>
  </div>
  <div class="stats-grid">
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-arrow-trend-up"></i></div><div class="stat-value" style="color:#16a34a">${fmt(incBudget)}</div><div class="stat-label">Budgeted Income</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-arrow-trend-up"></i></div><div class="stat-value" style="color:#16a34a">${fmt(incTotal)}</div><div class="stat-label">Actual Income</div></div>
    <div class="stat-card" style="border-left:4px solid #dc2626"><div class="stat-icon"><i class="fas fa-arrow-trend-down"></i></div><div class="stat-value" style="color:#dc2626">${fmt(expBudget)}</div><div class="stat-label">Budgeted Expenses</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-arrow-trend-down"></i></div><div class="stat-value" style="color:#dc2626">${fmt(expTotal)}</div><div class="stat-label">Actual Expenses</div></div>
    <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-value" style="color:#8b5cf6">${fmt(incBudget - expBudget)}</div><div class="stat-label">Budgeted Net</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-value" style="color:${incTotal - expTotal >= 0 ? '#16a34a' : '#dc2626'}">${fmt(incTotal - expTotal)}</div><div class="stat-label">Actual Net</div></div>
  </div>
  <form method="post" action="/admin/budget/save">
    <input type="hidden" name="year" value="${year}">
    <div class="card">
      <div class="card-header"><h3>Budget vs Actual ${year}</h3>
        <button type="submit" class="btn btn-primary btn-xs"><i class="fas fa-save"></i> Save Budget</button>
      </div>
      <div class="card-body" style="padding:0">
      <table>
        <tr><th>Account</th><th class="num">Budget (&#x20B1;)</th><th class="num">Actual (&#x20B1;)</th><th class="num">Variance (&#x20B1;)</th></tr>
        ${budgetForm}
        <tr style="font-weight:700;background:var(--bg2)">
          <td>TOTAL INCOME</td>
          <td class="num mono" style="color:#16a34a">${fmt(incBudget)}</td>
          <td class="num mono" style="color:#16a34a">${fmt(incTotal)}</td>
          <td class="num mono" style="color:${incTotal - incBudget >= 0 ? '#16a34a' : '#dc2626'}">${incTotal - incBudget >= 0 ? '+' : ''}${fmt(incTotal - incBudget)}</td>
        </tr>
        <tr style="font-weight:700;background:var(--bg2)">
          <td>TOTAL EXPENSES</td>
          <td class="num mono" style="color:#dc2626">${fmt(expBudget)}</td>
          <td class="num mono" style="color:#dc2626">${fmt(expTotal)}</td>
          <td class="num mono" style="color:${expTotal - expBudget <= 0 ? '#16a34a' : '#dc2626'}">${expTotal - expBudget >= 0 ? '+' : ''}${fmt(expTotal - expBudget)}</td>
        </tr>
        <tr style="font-weight:700;border-top:2px solid var(--border)">
          <td>NET SURPLUS/(DEFICIT)</td>
          <td class="num mono" style="color:#8b5cf6">${fmt(incBudget - expBudget)}</td>
          <td class="num mono" style="color:${incTotal - expTotal >= 0 ? '#16a34a' : '#dc2626'}">${fmt(incTotal - expTotal)}</td>
          <td class="num mono" style="color:#8b5cf6">${fmt((incTotal - expTotal) - (incBudget - expBudget)) >= 0 ? '+' : ''}${fmt((incTotal - expTotal) - (incBudget - expBudget))}</td>
        </tr>
      </table></div>
    </div>
  </form>`;

  if (req.query.export === 'csv') {
    let csv = 'Account,Budget,Actual,Variance\n';
    actuals.forEach(r => {
      const b = Number(budgets[r.code] || 0);
      const a = Number(r.bal);
      csv += `${r.code} - ${r.name},${b.toFixed(2)},${a.toFixed(2)},${(a-b).toFixed(2)}\n`;
    });
    csv += `TOTAL INCOME,${incBudget.toFixed(2)},${incTotal.toFixed(2)},${(incTotal-incBudget).toFixed(2)}\n`;
    csv += `TOTAL EXPENSES,${expBudget.toFixed(2)},${expTotal.toFixed(2)},${(expTotal-expBudget).toFixed(2)}\n`;
    csv += `NET,,,${(incTotal-expTotal).toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="budget_${year}.csv"`);
    return res.send(csv);
  }

  if (req.query.print) {
    const fmtAmt = v => '\u20B1' + Number(v || 0).toFixed(2);
    const rows = actuals.map(r => {
      const b = Number(budgets[r.code] || 0);
      const a = Number(r.bal);
      const v = b - a;
      return { cells: [r.code + ' \u2014 ' + r.name, fmtAmt(b), fmtAmt(a), (v >= 0 ? '+' : '') + fmtAmt(v)] };
    });
    const printContent = reportStats([
      { label: 'Budgeted Income', value: fmtAmt(incBudget) },
      { label: 'Actual Income', value: fmtAmt(incTotal) },
      { label: 'Budgeted Expenses', value: fmtAmt(expBudget) },
      { label: 'Actual Expenses', value: fmtAmt(expTotal) },
      { label: 'Budgeted Net', value: fmtAmt(incBudget - expBudget) },
      { label: 'Actual Net', value: fmtAmt(incTotal - expTotal) },
    ]) + reportTable(['Account', 'Budget', 'Actual', 'Variance'], rows, { totalCells: ['TOTAL INCOME', fmtAmt(incBudget), fmtAmt(incTotal), (incTotal - incBudget >= 0 ? '+' : '') + fmtAmt(incTotal - incBudget)] })
      + reportTable(['', '', '', ''], [
        { cells: ['TOTAL EXPENSES', fmtAmt(expBudget), fmtAmt(expTotal), (expTotal - expBudget >= 0 ? '+' : '') + fmtAmt(expTotal - expBudget)] }
      ], { totalCells: ['NET SURPLUS/(DEFICIT)', fmtAmt(incBudget - expBudget), fmtAmt(incTotal - expTotal), fmtAmt((incTotal - expTotal) - (incBudget - expBudget))] });
    return res.type('html').send(printLayout('Budget vs Actual', printContent, { subtitle: 'Year ' + year, asOf: String(year), orientation: 'portrait', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'General Manager' }));
  }
  res.type('html').send(layout('Budget vs Actual', 'budget', content, { subtitle: 'Year ' + year }));
}));

router.post('/budget/save', requireRole(3), asyncHandler(async (req, res) => {
  const year = req.body.year || new Date().getFullYear();
  const budgets = {};
  const glAccounts = await sql('SELECT code FROM gl_accounts WHERE type IN ($1,$2)', ['income','expense']);
  for (const a of glAccounts) {
    const val = req.body['budget_' + a.code];
    if (val !== undefined) budgets[a.code] = Number(val) || 0;
  }
  await store.setSetting('budget_' + year, JSON.stringify(budgets));
  res.redirect('/admin/budget?year=' + year + '&saved=ok');
}));

// ============================================================
// 13. REGULATORY COMPLIANCE REPORTS (BSP)
// ============================================================
router.get('/regulatory-reports', requireRole(3), asyncHandler(async (req, res) => {
  const totalAssets = await one("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) as bal FROM gl_entries WHERE account_code IN (SELECT code FROM gl_accounts WHERE type='asset')");
  const totalLoans = await one("SELECT COALESCE(SUM(principal),0) as total FROM loans WHERE status IN ($1,$2,$3)", ['approved','disbursed','active']);
  const totalDeposits = await one("SELECT COALESCE(SUM(actual_balance),0) as total FROM accounts WHERE is_active=1");
  const nplLoans = await sql("SELECT COUNT(*) as cnt, COALESCE(SUM(remaining_balance),0) as total FROM loans WHERE asset_classification IN ($1,$2)", ['non_performing','loss']);
  const pastDue = await sql("SELECT COUNT(*) as cnt, COALESCE(SUM(remaining_balance),0) as total FROM loans WHERE asset_classification IN ($1,$2)", ['past_due','monitored']);
  const capital = await one("SELECT COALESCE(SUM(share_capital_balance),0) as total FROM accounts");
  const npl = Number(nplLoans[0]?.cnt||0); const nplAmt = Number(nplLoans[0]?.total||0);
  const pd = Number(pastDue[0]?.cnt||0); const pdAmt = Number(pastDue[0]?.total||0);
  const ta = Number(totalAssets?.bal||0); const tl = Number(totalLoans?.total||0);
  const td = Number(totalDeposits?.total||0); const cap = Number(capital?.total||0);
  const car = ta > 0 ? ((cap / ta) * 100).toFixed(2) : '0.00';
  const nplRatio = tl > 0 ? ((nplAmt / tl) * 100).toFixed(2) : '0.00';
  const ada = ta > 0 ? ((tl / ta) * 100).toFixed(2) : '0.00';
  const content = `<div class="card"><div class="card-header"><h3>Regulatory Compliance Dashboard</h3></div>
  <div class="card-body-padded">
  <table style="width:100%;max-width:600px">
    <tr><th>Indicator</th><th>Value</th><th>Threshold</th><th>Status</th></tr>
    <tr><td>Capital Adequacy Ratio (CAR)</td><td class="num mono"><b>${car}%</b></td><td class="num mono">10%</td>
      <td>${Number(car)>=10?'<span style="color:#16a34a">Compliant</span>':'<span style="color:#dc2626">Non-Compliant</span>'}</td></tr>
    <tr><td>NPL Ratio</td><td class="num mono"><b>${nplRatio}%</b></td><td class="num mono">5%</td>
      <td>${Number(nplRatio)<=5?'<span style="color:#16a34a">Compliant</span>':'<span style="color:#dc2626">Above Threshold</span>'}</td></tr>
    <tr><td>Asset to Deposit Ratio (ADA)</td><td class="num mono"><b>${ada}%</b></td><td class="num mono">75%</td>
      <td>${Number(ada)<=75?'<span style="color:#16a34a">Compliant</span>':'<span style="color:#dc2626">Above Threshold</span>'}</td></tr>
    <tr><td>Total Assets</td><td class="num mono">${fmt(ta)}</td><td colspan="2"></td></tr>
    <tr><td>Total Loans</td><td class="num mono">${fmt(tl)}</td><td colspan="2"></td></tr>
    <tr><td>Total Deposits</td><td class="num mono">${fmt(td)}</td><td colspan="2"></td></tr>
    <tr><td>Share Capital</td><td class="num mono">${fmt(cap)}</td><td colspan="2"></td></tr>
    <tr><td>NPL Count / Amount</td><td class="num mono">${npl} / ${fmt(nplAmt)}</td><td colspan="2"></td></tr>
    <tr><td>Past Due Count / Amount</td><td class="num mono">${pd} / ${fmt(pdAmt)}</td><td colspan="2"></td></tr>
  </table></div></div>`;
  res.type('html').send(layout('Regulatory Reports', 'regulatory-reports', content, { subtitle: 'BSP compliance and regulatory reporting' }));
}));

// ============================================================
// ── Withholding Tax Report ──

router.get('/withholding-tax', requireRole(3), asyncHandler(async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);

  // Total interest credited (gross)
  const interest = await one("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='interest_credit' AND created_at LIKE $1", [year + '%']);
  const interestGross = Number(interest.total);

  // Total dividends declared
  const divs = await one("SELECT COALESCE(SUM(total_amount),0) as total FROM dividends WHERE year=$1", [Number(year)]);
  const divGross = Number(divs.total);

  // Tax rates from config
  const interestTax = await one("SELECT rate FROM tax_config WHERE tax_id='tax_interest'");
  const divTax = await one("SELECT rate FROM tax_config WHERE tax_id='tax_dividend'");
  const iRate = interestTax ? Number(interestTax.rate) : 20;
  const dRate = divTax ? Number(divTax.rate) : 10;

  const interestWithheld = Math.round(interestGross * iRate / 100 * 100) / 100;
  const divWithheld = Math.round(divGross * dRate / 100 * 100) / 100;
  const totalWithheld = interestWithheld + divWithheld;

  // GL balances for tax payable
  const taxPayable = await one("SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) as bal FROM gl_entries WHERE account_code='2400' AND created_at LIKE $1", [year + '%']);
  const glBalance = Number(taxPayable.bal);

  const content = `
  <div class="card">
    <div class="card-body-padded" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 160px"><label>Year</label>
        <select id="wtYear" onchange="location.href='/admin/withholding-tax?year='+this.value">
          ${Array.from({length: 5}, (_, i) => { const y = new Date().getFullYear() - i; return '<option value="' + y + '" ' + (Number(year) === y ? 'selected' : '') + '>' + y + '</option>'; }).join('')}
        </select>
      </div>
      <div style="flex:1;text-align:right">
        <a href="/admin/withholding-tax?year=${year}&export=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> Export CSV</a>
      </div>
    </div>
  </div>
  <div class="stats-grid">
    <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-value">${iRate}%</div><div class="stat-label">Interest Tax Rate</div></div>
    <div class="stat-card" style="border-left:4px solid #f59e0b"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-value">${dRate}%</div><div class="stat-label">Dividend Tax Rate</div></div>
    <div class="stat-card" style="border-left:4px solid #16a34a"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-value">${fmt(interestGross)}</div><div class="stat-label">Gross Interest Credited</div></div>
    <div class="stat-card" style="border-left:4px solid #dc2626"><div class="stat-icon"><i class="fas fa-money-bill-transfer"></i></div><div class="stat-value">${fmt(interestWithheld)}</div><div class="stat-label">Interest Tax Withheld (${iRate}%)</div></div>
    <div class="stat-card" style="border-left:4px solid #2563eb"><div class="stat-icon"><i class="fas fa-building-columns"></i></div><div class="stat-value">${fmt(divGross)}</div><div class="stat-label">Gross Dividends Declared</div></div>
    <div class="stat-card" style="border-left:4px solid #ef4444"><div class="stat-icon"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-value">${fmt(divWithheld)}</div><div class="stat-label">Dividend Tax Withheld (${dRate}%)</div></div>
    <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="stat-icon"><i class="fas fa-file-invoice"></i></div><div class="stat-value">${fmt(totalWithheld)}</div><div class="stat-label">Total Tax Withheld</div></div>
    <div class="stat-card" style="border-left:4px solid #f59e0b"><div class="stat-icon"><i class="fas fa-wallet"></i></div><div class="stat-value">${fmt(glBalance)}</div><div class="stat-label">GL Balance (2400 Tax Payable)</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3><i class="fas fa-list"></i> Withholding Tax Summary — BIR Form 2307 Equivalent</h3><span class="count">Year ${year}</span></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Income Type</th><th>Gross Amount</th><th>Tax Rate</th><th>Tax Withheld</th><th>Net Amount</th></tr>
      <tr><td><b>Interest Income</b></td>
        <td class="num mono">${fmt(interestGross)}</td>
        <td class="num mono">${iRate}%</td>
        <td class="num mono" style="color:#dc2626">${fmt(interestWithheld)}</td>
        <td class="num mono" style="color:#16a34a">${fmt(interestGross - interestWithheld)}</td>
      </tr>
      <tr><td><b>Dividend Income</b></td>
        <td class="num mono">${fmt(divGross)}</td>
        <td class="num mono">${dRate}%</td>
        <td class="num mono" style="color:#dc2626">${fmt(divWithheld)}</td>
        <td class="num mono" style="color:#16a34a">${fmt(divGross - divWithheld)}</td>
      </tr>
      <tr style="font-weight:700;background:var(--bg2)">
        <td>TOTAL</td><td class="num mono">${fmt(interestGross + divGross)}</td>
        <td></td>
        <td class="num mono" style="color:#dc2626">${fmt(totalWithheld)}</td>
        <td class="num mono" style="color:#16a34a">${fmt(interestGross + divGross - totalWithheld)}</td>
      </tr>
    </table></div>
  </div>`;

  if (req.query.export === 'csv') {
    let csv = 'IncomeType,GrossAmount,TaxRate,TaxWithheld,NetAmount\n';
    csv += `Interest Income,${interestGross.toFixed(2)},${iRate}%,${interestWithheld.toFixed(2)},${(interestGross - interestWithheld).toFixed(2)}\n`;
    csv += `Dividend Income,${divGross.toFixed(2)},${dRate}%,${divWithheld.toFixed(2)},${(divGross - divWithheld).toFixed(2)}\n`;
    csv += `TOTAL,${(interestGross + divGross).toFixed(2)},,${totalWithheld.toFixed(2)},${(interestGross + divGross - totalWithheld).toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="withholding_tax_${year}.csv"`);
    return res.send(csv);
  }

  if (req.query.print) {
    const fmtAmt = v => '\u20B1' + Number(v || 0).toFixed(2);
    const printContent = reportStats([
      { label: 'Interest Tax Rate', value: iRate + '%' },
      { label: 'Dividend Tax Rate', value: dRate + '%' },
      { label: 'Gross Interest', value: fmtAmt(interestGross) },
      { label: 'Gross Dividends', value: fmtAmt(divGross) },
      { label: 'Total Tax Withheld', value: fmtAmt(totalWithheld) },
      { label: 'GL Balance (2400)', value: fmtAmt(glBalance) },
    ]) + reportTable(['Income Type', 'Gross Amount', 'Tax Rate', 'Tax Withheld', 'Net Amount'], [
      { cells: ['Interest Income', fmtAmt(interestGross), iRate + '%', fmtAmt(interestWithheld), fmtAmt(interestGross - interestWithheld)] },
      { cells: ['Dividend Income', fmtAmt(divGross), dRate + '%', fmtAmt(divWithheld), fmtAmt(divGross - divWithheld)] },
    ], { totalCells: ['TOTAL', fmtAmt(interestGross + divGross), '', fmtAmt(totalWithheld), fmtAmt(interestGross + divGross - totalWithheld)] });
    return res.type('html').send(printLayout('Withholding Tax Report', printContent, { subtitle: 'BIR Form 2307 Equivalent', asOf: String(year), orientation: 'portrait', signatureLine1: 'Prepared by:', signatureLine2: 'Accountant', signatureLine3: 'Auditor' }));
  }
res.type('html').send(layout('Withholding Tax', 'withholding-tax', content, { subtitle: 'BIR Form 2307 equivalent — tax withheld on interest & dividends' }));
}));

// ============================================================
// 14. AUDIT TRAIL ENHANCED
// ============================================================
router.get('/enhanced-audit', requireRole(3), asyncHandler(async (req, res) => {
  const { getLogs } = require('../services/audit');
  const action = req.query.action || ''; const admin = req.query.admin || '';
  let logs = await getLogs(200, 0);
  if (action) logs = logs.filter(l => l.action === action);
  if (admin) logs = logs.filter(l => l.admin_name?.includes(admin) || l.admin_id?.includes(admin));
  const actions = [...new Set(logs.map(l => l.action))];
  const admins = [...new Set(logs.map(l => l.admin_name||l.admin_id||'').filter(Boolean))];
  const content = `<form method="get" action="/admin/enhanced-audit" style="display:flex;gap:8px;margin-bottom:12px">
    <select name="action" style="padding:6px 10px;font-size:12px"><option value="">All Actions</option>
      ${actions.map(a => `<option value="${a}" ${action===a?'selected':''}>${a.replace(/_/g,' ')}</option>`).join('')}</select>
    <select name="admin" style="padding:6px 10px;font-size:12px"><option value="">All Admins</option>
      ${admins.map(a => `<option value="${a}" ${admin===a?'selected':''}>${a}</option>`).join('')}</select>
    <button type="submit" class="btn btn-primary btn-sm">Filter</button>
    <a href="/admin/enhanced-audit" class="btn btn-outline btn-sm">Clear</a></form>
  <div class="card"><div class="card-header"><h3>Enhanced Audit Trail</h3><span>${logs.length} entries</span></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Date/Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>ID</th><th>IP</th><th>Details</th></tr>
    ${logs.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No entries</td></tr>' :
      logs.slice(0,100).map(l => `<tr><td class="mono" style="font-size:10px">${(l.created_at||"").slice(0,19).replace('T',' ')}</td>
        <td>${l.admin_name||l.admin_id||'-'}</td>
        <td><span class="badge badge-blue">${l.action.replace(/_/g,' ')}</span></td>
        <td>${l.entity_type||'-'}</td><td class="mono" style="font-size:10px;color:var(--text-muted)">${(l.entity_id||"").slice(0,8)}</td>
        <td class="mono" style="font-size:10px;color:var(--text-muted)">${l.ip_address||'-'}</td>
        <td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.details||'-'}</td></tr>`).join('')}
  </table></div></div>`;
  res.type('html').send(layout('Enhanced Audit Trail', 'enhanced-audit', content, { subtitle: 'Filterable audit log with details' }));
}));

// ============================================================
// 15. CHECKBOOK MANAGEMENT
// ============================================================
router.get('/checkbooks', requireRole(2), asyncHandler(async (req, res) => {
  const cbs = await sql("SELECT c.*, a.child_name FROM checkbooks c LEFT JOIN accounts a ON c.account_id = a.account_id ORDER BY c.created_at DESC");
  const accounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.created?'success:Checkbook issued.':q.updated?'success:Checkbook updated.':q.error?'error:'+q.error:'';
  const statusColors = {active:'badge-green',fully_used:'badge-gray',cancelled:'badge-red',stopped:'badge-amber'};
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${cbs.length}</div><div>Checkbooks</div></div>
    <div class="stat-card"><div>${cbs.filter(c=>c.status==='active').length}</div><div>Active</div></div>
  </div><div class="card"><div class="card-header"><h3>Checkbook Registry</h3><div><a href="#add-checkbook" class="btn btn-primary btn-sm">+ Issue Checkbook</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Member</th><th>Bank</th><th>Range</th><th>Next Check</th><th>Status</th><th></th></tr>
    ${cbs.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No checkbooks issued</td></tr>' :
      cbs.map(c => `<tr><td><b>${c.child_name||'-'}</b></td><td>${c.bank_name||'-'}</td>
        <td class="mono">${c.start_number} - ${c.end_number}</td>
        <td class="mono">${c.next_check_number||c.start_number}</td>
        <td><span class="badge ${statusColors[c.status]||'badge-gray'}">${c.status.replace(/_/g,' ')}</span></td>
        <td>${c.status==='active'?`<a href="/admin/checkbooks/cancel/${c.checkbook_id}" class="btn btn-danger btn-xs" data-confirm="Cancel checkbook?">Cancel</a>
          <a href="/admin/checkbooks/stop/${c.checkbook_id}" class="btn btn-amber btn-xs" data-confirm="Stop payment on this checkbook?">Stop</a>`:''}</td></tr>`).join('')}
  </table></div></div>
  <div id="add-checkbook" class="modal-overlay"><div class="modal" style="max-width:480px"><a href="#" class="close">&times;</a>
  <h2>Issue Checkbook</h2>
  <form method="post" action="/admin/checkbooks/create">
    <label>Member</label><select name="account_id" required>${accounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select>
    <div class="form-row"><div><label>Bank</label><input type="text" name="bank_name" placeholder="e.g. BDO"></div>
      <div><label>Start Number</label><input type="text" name="start_number" required></div>
      <div><label>End Number</label><input type="text" name="end_number" required></div></div>
    <button type="submit" class="btn btn-primary">Issue Checkbook</button>
  </form></div></div>`;
  res.type('html').send(layout('Checkbook Management', 'checkbooks', content, { subtitle: 'Checkbook issuance and tracking', toast }));
}));

router.post('/checkbooks/create', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, bank_name, start_number, end_number } = req.body;
  if (!account_id||!start_number) return res.redirect('/admin/checkbooks?error=Missing+fields');
  await store.query('INSERT INTO checkbooks (checkbook_id,account_id,bank_name,start_number,end_number,issue_date,status,next_check_number,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [uuidv4(), account_id, bank_name||'', start_number, end_number||start_number, new Date().toISOString(), 'active', start_number, new Date().toISOString()]);
  res.redirect('/admin/checkbooks?created=ok');
}));

router.get('/checkbooks/cancel/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE checkbooks SET status=$1 WHERE checkbook_id=$2', ['cancelled', req.params.id]);
  res.redirect('/admin/checkbooks?updated=ok');
}));

router.get('/checkbooks/stop/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE checkbooks SET status=$1 WHERE checkbook_id=$2', ['stopped', req.params.id]);
  await store.query('UPDATE checks SET stop_payment=1 WHERE checkbook_id=$1', [req.params.id]);
  res.redirect('/admin/checkbooks?updated=ok');
}));

// ============================================================
// 16. DEMAND DRAFT / MANAGER'S CHECK
// ============================================================
router.get('/demand-drafts', requireRole(2), asyncHandler(async (req, res) => {
  const dds = await sql("SELECT d.*, a.child_name FROM demand_drafts d LEFT JOIN accounts a ON d.account_id = a.account_id ORDER BY d.created_at DESC");
  const accounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.created?'success:Demand draft issued.':q.cancelled?'success:Demand draft cancelled.':q.error?'error:'+q.error:'';
  const statusColors = {issued:'badge-blue',cancelled:'badge-red',paid:'badge-green'};
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${dds.length}</div><div>Total DDs</div></div>
    <div class="stat-card"><div>${fmt(dds.reduce((s,d)=>s+Number(d.amount),0))}</div><div>Total Amount</div></div>
  </div><div class="card"><div class="card-header"><h3>Demand Drafts / Manager's Checks</h3><div><a href="#add-dd" class="btn btn-primary btn-sm">+ Issue DD</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>DD #</th><th>Member</th><th>Payee</th><th class="num">Amount</th><th>Charge</th><th>Status</th><th></th></tr>
    ${dds.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No demand drafts</td></tr>' :
      dds.map(d => `<tr><td class="mono"><b>${d.dd_number||(d.dd_id||"").slice(0,8)}</b></td><td>${d.child_name||'-'}</td>
        <td>${d.payee}</td><td class="num mono">${fmt(d.amount)}</td><td>${d.charge_type}</td>
        <td><span class="badge ${statusColors[d.status]||'badge-gray'}">${d.status}</span></td>
        <td>${d.status==='issued'?`<a href="/admin/demand-drafts/cancel/${d.dd_id}" class="btn btn-danger btn-xs" data-confirm="Cancel this DD?">Cancel</a>`:''}</td></tr>`).join('')}
  </table></div></div>
  <div id="add-dd" class="modal-overlay"><div class="modal" style="max-width:480px"><a href="#" class="close">&times;</a>
  <h2>Issue Demand Draft</h2>
  <form method="post" action="/admin/demand-drafts/create">
    <label>Member (Debit from)</label><select name="account_id" required>${accounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select>
    <label>Payee</label><input type="text" name="payee" required>
    <div class="form-row"><div><label>Amount</label><input type="number" name="amount" min="0" step="0.01" required></div>
      <div><label>Charge Type</label><select name="charge_type"><option value="debit">Debit Account</option><option value="cash">Cash</option></select></div></div>
    <button type="submit" class="btn btn-primary">Issue DD</button>
  </form></div></div>`;
  res.type('html').send(layout('Demand Drafts', 'demand-drafts', content, { subtitle: 'Manager\'s check issuance', toast }));
}));

router.post('/demand-drafts/create', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, payee, amount, charge_type } = req.body;
  if (!account_id||!payee||!amount) return res.redirect('/admin/demand-drafts?error=Missing+fields');
  const ddNum = 'DD-' + Date.now().toString(36).toUpperCase();
  const ddId = uuidv4();
  await store.query('INSERT INTO demand_drafts (dd_id,account_id,dd_number,payee,amount,charge_type,status,created_at,issued_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [ddId, account_id, ddNum, payee, Number(amount), charge_type||'debit', 'issued', new Date().toISOString(), req.session.adminName||req.session.adminId]);
  if (charge_type !== 'cash') {
    const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [account_id]);
    const txId = uuidv4();
    await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [txId, account_id, 'withdrawal', Number(amount), Number(acc.actual_balance), Number(acc.actual_balance)-Number(amount), 'Demand draft issued: '+ddNum+' to '+payee, new Date().toISOString()]);
    await store.query('UPDATE accounts SET actual_balance = actual_balance - $1 WHERE account_id=$2', [Number(amount), account_id]);
  }
  res.redirect('/admin/demand-drafts?created=ok');
}));

router.get('/demand-drafts/cancel/:id', requireRole(3), asyncHandler(async (req, res) => {
  const dd = await one('SELECT * FROM demand_drafts WHERE dd_id=$1', [req.params.id]);
  if (!dd) return res.redirect('/admin/demand-drafts?error=Not+found');
  await store.query('UPDATE demand_drafts SET status=$1 WHERE dd_id=$2', ['cancelled', req.params.id]);
  if (dd.charge_type !== 'cash') {
    const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [dd.account_id]);
    await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [uuidv4(), dd.account_id, 'deposit', Number(dd.amount), Number(acc.actual_balance), Number(acc.actual_balance)+Number(dd.amount), 'DD cancelled: '+dd.dd_number, new Date().toISOString()]);
    await store.query('UPDATE accounts SET actual_balance = actual_balance + $1 WHERE account_id=$2', [Number(dd.amount), dd.account_id]);
  }
  res.redirect('/admin/demand-drafts?cancelled=ok');
}));

// ============================================================
// 17. CREDIT SCORING
// ============================================================
router.get('/credit-scores', requireRole(2), asyncHandler(async (req, res) => {
  const scores = await sql("SELECT s.*, a.child_name FROM credit_scores s LEFT JOIN accounts a ON s.account_id = a.account_id ORDER BY s.last_updated DESC");
  const allAccounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.updated?'success:Credit score updated.':q.error?'error:'+q.error:'';
  const ratingColors = {poor:'badge-red',fair:'badge-amber',good:'badge-green',very_good:'badge-blue',excellent:'badge-purple'};
  const content = `<div class="stats-grid">
    <div class="stat-card"><div>${scores.length}</div><div>Scored Members</div></div>
    <div class="stat-card"><div>${scores.filter(s=>s.rating==='good'||s.rating==='very_good'||s.rating==='excellent').length}</div><div>Good+ Ratings</div></div>
  </div><div class="card"><div class="card-header"><h3>Credit Scoring</h3><div><a href="#add-score" class="btn btn-primary btn-sm">+ Score Member</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Member</th><th class="num">Score</th><th>Rating</th><th class="num">Total Loans</th><th class="num">Late Payments</th><th>Last Updated</th><th></th></tr>
    ${scores.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No scores recorded</td></tr>' :
      scores.map(s => `<tr><td><b>${s.child_name||'-'}</b></td><td class="num mono" style="font-size:16px;font-weight:700">${s.score}</td>
        <td><span class="badge ${ratingColors[s.rating]||'badge-gray'}">${(s.rating||'fair').replace(/_/g,' ')}</span></td>
        <td class="num">${s.total_loans}</td><td class="num" style="color:${Number(s.late_payments)>0?'#dc2626':'#16a34a'}">${s.late_payments||0}</td>
        <td class="mono" style="font-size:10px">${(s.last_updated||"").slice(0,10)}</td>
        <td><a href="#score-${s.score_id}" class="btn btn-secondary btn-xs">Edit</a></td></tr>`).join('')}
  </table></div></div>
  <div id="add-score" class="modal-overlay"><div class="modal" style="max-width:440px"><a href="#" class="close">&times;</a>
  <h2>Score Member</h2>
  <form method="post" action="/admin/credit-scores/create">
    <label>Member</label><select name="account_id" required>${allAccounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select>
    <div class="form-row"><div><label>Score (300-900)</label><input type="number" name="score" min="300" max="900" value="500" required></div>
      <div><label>Rating</label><select name="rating" required>
        <option value="poor">Poor</option><option value="fair">Fair</option>
        <option value="good">Good</option><option value="very_good">Very Good</option><option value="excellent">Excellent</option></select></div></div>
    <button type="submit" class="btn btn-primary">Save Score</button>
  </form></div></div>
  ${scores.map(s => `<div id="score-${s.score_id}" class="modal-overlay"><div class="modal" style="max-width:440px"><a href="#" class="close">&times;</a>
  <h2>Score: ${s.child_name||''}</h2>
  <form method="post" action="/admin/credit-scores/update/${s.score_id}">
    <div class="form-row"><div><label>Score</label><input type="number" name="score" min="300" max="900" value="${s.score}" required></div>
      <div><label>Rating</label><select name="rating" required>
        ${['poor','fair','good','very_good','excellent'].map(r => `<option value="${r}" ${s.rating===r?'selected':''}>${r.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}</select></div></div>
    <div class="form-row"><div><label>Total Loans</label><input type="number" name="total_loans" value="${s.total_loans||0}"></div>
      <div><label>Late Payments</label><input type="number" name="late_payments" value="${s.late_payments||0}"></div></div>
    <button type="submit" class="btn btn-primary">Update</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Credit Scoring', 'credit-scores', content, { subtitle: 'Member credit scoring and rating', toast }));
}));

router.post('/credit-scores/create', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, score, rating } = req.body;
  if (!account_id) return res.redirect('/admin/credit-scores?error=Missing+fields');
  const existing = await one('SELECT * FROM credit_scores WHERE account_id=$1', [account_id]);
  if (existing) return res.redirect('/admin/credit-scores?error=Already+scored');
  await store.query('INSERT INTO credit_scores (score_id,account_id,score,rating,last_updated,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [uuidv4(), account_id, Number(score)||500, rating||'fair', new Date().toISOString(), new Date().toISOString()]);
  res.redirect('/admin/credit-scores?updated=ok');
}));

router.post('/credit-scores/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  const { score, rating, total_loans, late_payments } = req.body;
  await store.query('UPDATE credit_scores SET score=$1, rating=$2, total_loans=$3, late_payments=$4, last_updated=$5 WHERE score_id=$6',
    [Number(score)||500, rating||'fair', Number(total_loans)||0, Number(late_payments)||0, new Date().toISOString(), req.params.id]);
  res.redirect('/admin/credit-scores?updated=ok');
}));

// ============================================================
// 18. GROUP LENDING
// ============================================================
router.get('/groups', requireRole(2), asyncHandler(async (req, res) => {
  const groups = await sql("SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id=g.group_id) as cur_members FROM groups g ORDER BY g.name");
  const allAccounts = await sql('SELECT account_id, child_name FROM accounts ORDER BY child_name');
  const q = req.query; const toast = q.created?'success:Group created.':q.updated?'success:Group updated.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Lending Groups</h3><div><a href="#add-group" class="btn btn-primary btn-sm">+ New Group</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Name</th><th>Description</th><th class="num">Members</th><th></th></tr>
    ${groups.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">No groups</td></tr>' :
      groups.map(g => `<tr><td><b>${g.name}</b></td><td style="font-size:12px">${g.description||'-'}</td>
        <td class="num">${g.cur_members||g.member_count||0}</td>
        <td><a href="#group-${g.group_id}" class="btn btn-secondary btn-xs">Manage</a>
          <a href="/admin/groups/members/${g.group_id}" class="btn btn-outline btn-xs">Members</a></td></tr>`).join('')}
  </table></div></div>
  <div id="add-group" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>New Group</h2>
  <form method="post" action="/admin/groups/create">
    <label>Group Name</label><input type="text" name="name" required>
    <label>Description</label><textarea name="description" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></textarea>
    <button type="submit" class="btn btn-primary">Create Group</button>
  </form></div></div>
  ${groups.map(g => `<div id="group-${g.group_id}" class="modal-overlay"><div class="modal" style="max-width:440px"><a href="#" class="close">&times;</a>
  <h2>${g.name}</h2>
  <form method="post" action="/admin/groups/update/${g.group_id}">
    <label>Name</label><input type="text" name="name" value="${g.name}" required>
    <label>Description</label><textarea name="description" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px">${g.description||''}</textarea>
    <button type="submit" class="btn btn-primary">Save</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Lending Groups', 'groups', content, { subtitle: 'Group lending and community groups', toast }));
}));

router.post('/groups/create', requireRole(2), asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.redirect('/admin/groups?error=Name+required');
  await store.query('INSERT INTO groups (group_id,name,description,created_at) VALUES ($1,$2,$3,$4)', [uuidv4(), name, description||'', new Date().toISOString()]);
  res.redirect('/admin/groups?created=ok');
}));

router.post('/groups/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.redirect('/admin/groups?error=Name+required');
  await store.query('UPDATE groups SET name=$1, description=$2 WHERE group_id=$3', [name, description||'', req.params.id]);
  res.redirect('/admin/groups?updated=ok');
}));

router.get('/groups/members/:id', requireRole(2), asyncHandler(async (req, res) => {
  const group = await one('SELECT * FROM groups WHERE group_id=$1', [req.params.id]);
  if (!group) return res.redirect('/admin/groups?error=Not+found');
  const members = await sql("SELECT gm.*, a.child_name FROM group_members gm LEFT JOIN accounts a ON gm.account_id = a.account_id WHERE gm.group_id=$1", [req.params.id]);
  const allAccounts = await sql("SELECT account_id, child_name FROM accounts WHERE account_id NOT IN (SELECT account_id FROM group_members WHERE group_id=$1)", [req.params.id]);
  const q = req.query; const toast = q.added?'success:Member added.':q.removed?'success:Member removed.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Members of ${group.name}</h3>
    <div><a href="/admin/groups" class="btn btn-outline btn-sm">&larr; Back</a>
    <a href="#add-member" class="btn btn-primary btn-sm">+ Add Member</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Name</th><th>Role</th><th>Joined</th><th></th></tr>
    ${members.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">No members in group</td></tr>' :
      members.map(m => `<tr><td><b>${m.child_name||'-'}</b></td><td><span class="badge ${m.role==='leader'?'badge-red':'badge-blue'}">${m.role}</span></td>
        <td class="mono" style="font-size:11px">${(m.joined_at||"").slice(0,10)}</td>
        <td><a href="/admin/groups/members/remove/${m.gm_id}" class="btn btn-danger btn-xs" data-confirm="Remove ${m.child_name} from group?">Remove</a></td></tr>`).join('')}
  </table></div></div>
  <div id="add-member" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>Add Member to ${group.name}</h2>
  <form method="post" action="/admin/groups/members/add/${req.params.id}">
    <label>Member</label><select name="account_id" required>
      <option value="">-- Select --</option>${allAccounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select>
    <label>Role</label><select name="role"><option value="member">Member</option><option value="leader">Leader</option></select>
    <button type="submit" class="btn btn-primary">Add Member</button>
  </form></div></div>`;
  res.type('html').send(layout('Group Members', 'groups', content, { toast }));
}));

router.post('/groups/members/add/:id', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, role } = req.body;
  if (!account_id) return res.redirect(`/admin/groups/members/${req.params.id}?error=Select+member`);
  await store.query('INSERT INTO group_members (gm_id,group_id,account_id,role,joined_at) VALUES ($1,$2,$3,$4,$5)',
    [uuidv4(), req.params.id, account_id, role||'member', new Date().toISOString()]);
  await store.query('UPDATE groups SET member_count = member_count + 1 WHERE group_id = $1', [req.params.id]);
  res.redirect(`/admin/groups/members/${req.params.id}?added=ok`);
}));

router.get('/groups/members/remove/:gm_id', requireRole(2), asyncHandler(async (req, res) => {
  const gm = await one('SELECT * FROM group_members WHERE gm_id=$1', [req.params.id]);
  if (!gm) return res.redirect('/admin/groups?error=Not+found');
  await store.query('DELETE FROM group_members WHERE gm_id=$1', [req.params.id]);
  await store.query('UPDATE groups SET member_count = GREATEST(0, member_count - 1) WHERE group_id = $1', [gm.group_id]);
  res.redirect(`/admin/groups/members/${gm.group_id}?removed=ok`);
}));

// ============================================================
// 19. ACCOUNT CLOSURE WITH FULL SETTLEMENT
// ============================================================
router.get('/account-closure', requireRole(3), asyncHandler(async (req, res) => {
  const accounts = await sql("SELECT account_id, child_name, member_id, actual_balance, unallocated_balance, total_shares, share_capital_balance, is_active FROM accounts ORDER BY child_name");
  const q = req.query; const toast = q.closed?'success:Account closed with settlement.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Account Closure & Settlement</h3></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Member</th><th class="num">Balance</th><th class="num">Unallocated</th><th class="num">Share Capital</th><th>Status</th><th></th></tr>
    ${accounts.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No accounts</td></tr>' :
      accounts.filter(a => Number(a.is_active) !== -1).map(a => `<tr>
        <td><b>${a.child_name}</b></td><td class="num mono">${fmt(a.actual_balance)}</td>
        <td class="num mono">${fmt(a.unallocated_balance)}</td><td class="num mono">${fmt(a.share_capital_balance||0)}</td>
        <td>${a.is_active?'<span style="color:#16a34a">Active</span>':'<span style="color:#dc2626">Inactive</span>'}</td>
        <td><a href="#close-${a.account_id}" class="btn btn-danger btn-sm" data-confirm="Close account for ${a.child_name}? This will settle all balances.">Close & Settle</a></td></tr>`).join('')}
  </table></div></div>
  ${accounts.filter(a => Number(a.is_active) !== -1).map(a => `<div id="close-${a.account_id}" class="modal-overlay"><div class="modal" style="max-width:480px"><a href="#" class="close">&times;</a>
  <h2>Close: ${a.child_name}</h2>
  <form method="post" action="/admin/account-closure/settle/${a.account_id}">
    <div class="info-box" style="padding:12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:12px">
      Savings Balance: <b>${fmt(a.actual_balance)}</b><br>
      Share Capital: <b>${fmt(a.share_capital_balance||0)}</b><br>
      <hr style="margin:6px 0">Total Payout: <b>${fmt(Number(a.actual_balance)+Number(a.share_capital_balance||0))}</b>
    </div>
    <label>Reason for Closure</label>
    <select name="reason" required><option value="voluntary">Voluntary Closure</option><option value="dormant">Dormant Account</option><option value="violation">Policy Violation</option><option value="transfer">Transfer to Another Co-op</option><option value="deceased">Member Deceased</option></select>
    <label>Settlement Notes</label><input type="text" name="notes" placeholder="Optional notes">
    <p style="font-size:12px;color:var(--text-muted)">This will close the account, remove active status, and record all balances as settled.</p>
    <button type="submit" class="btn btn-danger">Confirm Closure & Settlement</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Account Closure', 'account-closure', content, { subtitle: 'Close accounts with full settlement', toast }));
}));

router.post('/account-closure/settle/:id', requireRole(3), asyncHandler(async (req, res) => {
  const { reason, notes } = req.body;
  const acc = await one('SELECT * FROM accounts WHERE account_id=$1', [req.params.id]);
  if (!acc) return res.redirect('/admin/account-closure?error=Not+found');
  const totalPayout = Number(acc.actual_balance) + Number(acc.share_capital_balance||0);
  const txId = uuidv4();
  await store.query('INSERT INTO transactions (transaction_id,account_id,type,amount,balance_before,balance_after,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [txId, req.params.id, 'account_closure', totalPayout, Number(acc.actual_balance), 0, 'Account closed: '+reason+'. Settlement: '+fmt(totalPayout)+'. '+notes, new Date().toISOString()]);
  await store.query('UPDATE accounts SET is_active=-1, actual_balance=0, unallocated_balance=0, share_capital_balance=0 WHERE account_id=$1', [req.params.id]);
  // Gl entries for closure
  const gl = require('../services/gl');
  if (totalPayout > 0) {
    await gl.postDoubleEntry(txId, [
      {account_code:'2000',debit:totalPayout,description:'Account closure payout - '+acc.child_name},
      {account_code:'1000',credit:totalPayout,description:'Account closure - '+acc.child_name}], { postedBy: req.session.adminName || 'admin', referenceType: 'closure' });
  }
  res.redirect('/admin/account-closure?closed=ok');
}));

// ============================================================
// 20. HOLIDAY CALENDAR
// ============================================================
router.get('/holidays', requireRole(3), asyncHandler(async (req, res) => {
  const holidays = await sql('SELECT * FROM holiday_calendar ORDER BY date DESC');
  const q = req.query; const toast = q.created?'success:Holiday added.':q.deleted?'success:Holiday deleted.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Holiday Calendar</h3><div><a href="#add-holiday" class="btn btn-primary btn-sm">+ Add Holiday</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Date</th><th>Name</th><th>Type</th><th>Recurring</th><th></th></tr>
    ${holidays.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No holidays set</td></tr>' :
      holidays.map(h => `<tr><td class="mono"><b>${(h.date||"").slice(0,10)}</b></td>
        <td>${h.name}</td><td><span class="badge ${h.type==='regular'?'badge-red':h.type==='special'?'badge-amber':'badge-blue'}">${h.type}</span></td>
        <td>${h.is_recurring?'<span style="color:#16a34a">Yes</span>':'<span style="color:var(--text-muted)">No</span>'}</td>
        <td><a href="/admin/holidays/delete/${h.holiday_id}" class="btn btn-danger btn-xs" data-confirm="Delete ${h.name}?">Delete</a></td></tr>`).join('')}
  </table></div></div>
  <div id="add-holiday" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>Add Holiday</h2>
  <form method="post" action="/admin/holidays/create">
    <div class="form-row"><div><label>Date</label><input type="date" name="date" required></div>
      <div><label>Type</label><select name="type"><option value="regular">Regular</option><option value="special">Special</option><option value="local">Local</option></select></div></div>
    <label>Holiday Name</label><input type="text" name="name" placeholder="e.g. Christmas Day" required>
    <label><input type="checkbox" name="is_recurring" value="1"> Recurring annually</label>
    <button type="submit" class="btn btn-primary">Add Holiday</button>
  </form></div></div>`;
  res.type('html').send(layout('Holiday Calendar', 'holidays', content, { subtitle: 'Non-working days and holiday schedule', toast }));
}));

router.post('/holidays/create', requireRole(3), asyncHandler(async (req, res) => {
  const { date, name, type, is_recurring } = req.body;
  if (!date||!name) return res.redirect('/admin/holidays?error=Missing+fields');
  await store.query('INSERT INTO holiday_calendar (holiday_id,name,date,type,is_recurring,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [uuidv4(), name, date, type||'regular', Number(is_recurring)||0, new Date().toISOString()]);
  res.redirect('/admin/holidays?created=ok');
}));

router.get('/holidays/delete/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('DELETE FROM holiday_calendar WHERE holiday_id=$1', [req.params.id]);
  res.redirect('/admin/holidays?deleted=ok');
}));

// ============================================================
// 21. TAX CONFIGURATION
// ============================================================
router.get('/taxes', requireRole(3), asyncHandler(async (req, res) => {
  const taxes = await sql('SELECT * FROM tax_config ORDER BY name');
  const q = req.query; const toast = q.created?'success:Tax rule created.':q.updated?'success:Tax rule updated.':q.error?'error:'+q.error:'';
  const content = `<div class="card"><div class="card-header"><h3>Tax Configuration</h3><div><a href="#add-tax" class="btn btn-primary btn-sm">+ Add Tax Rule</a></div></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Name</th><th class="num">Rate</th><th>Applies To</th><th>Status</th><th></th></tr>
    ${taxes.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No tax rules</td></tr>' :
      taxes.map(t => `<tr><td><b>${t.name}</b></td><td class="num mono">${t.rate}%</td>
        <td>${t.applies_to}</td><td>${t.is_active?'<span style="color:#16a34a">Active</span>':'<span style="color:#dc2626">Inactive</span>'}</td>
        <td><a href="#edit-tax-${t.tax_id}" class="btn btn-secondary btn-xs">Edit</a>
          <a href="/admin/taxes/toggle/${t.tax_id}" class="btn ${t.is_active?'btn-danger':'btn-secondary'} btn-xs">${t.is_active?'Disable':'Enable'}</a></td></tr>`).join('')}
  </table></div></div>
  <div id="add-tax" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>Add Tax Rule</h2>
  <form method="post" action="/admin/taxes/create">
    <div class="form-row"><div><label>Name</label><input type="text" name="name" placeholder="e.g. Withholding Tax" required></div>
      <div><label>Rate (%)</label><input type="number" name="rate" min="0" step="0.01" value="0" required></div></div>
    <label>Applies To</label><select name="applies_to"><option value="interest">Interest Income</option><option value="fee">Fees</option><option value="dividend">Dividends</option><option value="all">All</option></select>
    <button type="submit" class="btn btn-primary">Create Tax Rule</button>
  </form></div></div>
  ${taxes.map(t => `<div id="edit-tax-${t.tax_id}" class="modal-overlay"><div class="modal" style="max-width:420px"><a href="#" class="close">&times;</a>
  <h2>${t.name}</h2>
  <form method="post" action="/admin/taxes/update/${t.tax_id}">
    <div class="form-row"><div><label>Name</label><input type="text" name="name" value="${t.name}" required></div>
      <div><label>Rate (%)</label><input type="number" name="rate" min="0" step="0.01" value="${t.rate}" required></div></div>
    <label>Applies To</label><select name="applies_to">${['interest','fee','dividend','all'].map(a => `<option value="${a}" ${t.applies_to===a?'selected':''}>${a.charAt(0).toUpperCase()+a.slice(1)}</option>`).join('')}</select>
    <button type="submit" class="btn btn-primary">Save</button>
  </form></div></div>`).join('')}`;
  res.type('html').send(layout('Tax Configuration', 'taxes', content, { subtitle: 'Withholding tax and other tax rules', toast }));
}));

router.post('/taxes/create', requireRole(3), asyncHandler(async (req, res) => {
  const { name, rate, applies_to } = req.body;
  if (!name) return res.redirect('/admin/taxes?error=Name+required');
  await store.query('INSERT INTO tax_config (tax_id,name,rate,applies_to,is_active,created_at) VALUES ($1,$2,$3,$4,1,$5)',
    [uuidv4(), name, Number(rate)||0, applies_to||'interest', new Date().toISOString()]);
  res.redirect('/admin/taxes?created=ok');
}));

router.post('/taxes/update/:id', requireRole(3), asyncHandler(async (req, res) => {
  const { name, rate, applies_to } = req.body;
  if (!name) return res.redirect('/admin/taxes?error=Name+required');
  await store.query('UPDATE tax_config SET name=$1, rate=$2, applies_to=$3 WHERE tax_id=$4', [name, Number(rate)||0, applies_to||'interest', req.params.id]);
  res.redirect('/admin/taxes?updated=ok');
}));

router.get('/taxes/toggle/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE tax_config SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE tax_id = $1', [req.params.id]);
  res.redirect('/admin/taxes');
}));

// ============================================================
// 22. FORM PRINTING (Deposit Slip, Withdrawal Slip, Loan App)
// ============================================================
router.get('/forms', requireRole(1), asyncHandler(async (req, res) => {
  const accounts = await sql('SELECT account_id, child_name, member_id FROM accounts ORDER BY child_name');
  const content = `<div class="card"><div class="card-header"><h3>Printable Forms</h3></div>
  <div class="card-body-padded" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px">
    <div style="padding:24px;background:var(--bg-secondary);border-radius:12px;text-align:center">
      <div style="font-size:40px;margin-bottom:8px">&#x1F4B5;</div>
      <h4>Deposit Slip</h4>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Member deposit transaction form</p>
      <div><select id="ds_account" style="width:100%;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px">
        <option value="">-- Select member --</option>${accounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select></div>
      <button onclick="var a=document.getElementById('ds_account').value;if(a)window.open('/admin/forms/deposit-slip/'+a,'_blank')" class="btn btn-primary">&#x1F5A8; Print</button>
    </div>
    <div style="padding:24px;background:var(--bg-secondary);border-radius:12px;text-align:center">
      <div style="font-size:40px;margin-bottom:8px">&#x1F4B8;</div>
      <h4>Withdrawal Slip</h4>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Member withdrawal transaction form</p>
      <div><select id="ws_account" style="width:100%;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px">
        <option value="">-- Select member --</option>${accounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select></div>
      <button onclick="var a=document.getElementById('ws_account').value;if(a)window.open('/admin/forms/withdrawal-slip/'+a,'_blank')" class="btn btn-primary">&#x1F5A8; Print</button>
    </div>
    <div style="padding:24px;background:var(--bg-secondary);border-radius:12px;text-align:center">
      <div style="font-size:40px;margin-bottom:8px">&#x1F91D;</div>
      <h4>Loan Application</h4>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Member loan application form</p>
      <div><select id="la_account" style="width:100%;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px">
        <option value="">-- Select member --</option>${accounts.map(a=>`<option value="${a.account_id}">${a.child_name}</option>`).join('')}</select></div>
      <button onclick="var a=document.getElementById('la_account').value;if(a)window.open('/admin/forms/loan-application/'+a,'_blank')" class="btn btn-primary">&#x1F5A8; Print</button>
    </div>
  </div></div>`;
  res.type('html').send(layout('Printable Forms', 'forms', content, { subtitle: 'Generate transaction forms for printing' }));
}));

function formLayout(title, content) {
  return `<html><head><style>
    body { font-family:'Courier New',monospace;font-size:12px;width:210mm;margin:0 auto;padding:10mm }
    @media print { body { margin:0;padding:5mm } }
    table { width:100%;border-collapse:collapse } td,th { padding:4px 6px;border:1px solid #333 }
    .ff { font-size:16px;font-weight:700;letter-spacing:2px;border:none;border-bottom:1px solid #333;width:100% }
    .sig-line { border-top:1px solid #333;width:200px;margin-top:30px;padding-top:4px;font-size:10px;text-align:center }
    h2 { text-align:center;margin:0 0 12px;font-size:16px;text-transform:uppercase;letter-spacing:2px }
  </style></head><body>${content}</body></html>`;
}

router.get('/forms/deposit-slip/:accountId', requireRole(1), asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM accounts WHERE account_id=$1', [req.params.accountId]);
  if (!a) return res.status(404).send('Not found');
  const now = new Date(); const dateStr = now.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
  const content = `<h2>LabCoop Savings Bank</h2><h2>Deposit Slip</h2>
  <p style="text-align:center;font-size:11px">${dateStr}</p>
  <p><b>Member:</b> ${a.child_name.toUpperCase()} &nbsp; <b>ID:</b> ${a.member_id||'---'} &nbsp; <b>Date:</b> ${dateStr}</p>
  <table><tr><td style="width:60%"><b>Amount Deposited</b></td><td style="width:40%"><b>&#x20B1;</b> _________________________________</td></tr>
    <tr><td><b>Mode of Payment:</b> Cash / Check / Online</td><td>&nbsp;</td></tr>
    <tr><td><b>Denominations:</b><br>1000 x ___ &nbsp; 500 x ___ &nbsp; 200 x ___ &nbsp; 100 x ___ &nbsp; 50 x ___ &nbsp; 20 x ___ &nbsp; Coins ___</td><td>&nbsp;</td></tr>
  </table>
  <p><b>Total Deposit:</b> &#x20B1; __________________</p>
  <div style="display:flex;justify-content:space-between;margin-top:40px">
    <div class="sig-line">Depositor Signature</div>
    <div class="sig-line">Teller Signature</div>
    <div class="sig-line">Authorized Signature</div>
  </div>
  <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;padding:10px 20px;font-size:14px;cursor:pointer">Print</button>`;
  res.type('html').send(formLayout('Deposit Slip - '+a.child_name, content));
}));

router.get('/forms/withdrawal-slip/:accountId', requireRole(1), asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM accounts WHERE account_id=$1', [req.params.accountId]);
  if (!a) return res.status(404).send('Not found');
  const now = new Date(); const dateStr = now.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
  const content = `<h2>LabCoop Savings Bank</h2><h2>Withdrawal Slip</h2>
  <p style="text-align:center;font-size:11px">${dateStr}</p>
  <p><b>Member:</b> ${a.child_name.toUpperCase()} &nbsp; <b>ID:</b> ${a.member_id||'---'}</p>
  <table><tr><td style="width:60%"><b>Amount to Withdraw</b></td><td style="width:40%"><b>&#x20B1;</b> _________________________________</td></tr>
    <tr><td><b>Available Balance:</b> &#x20B1;${Number(a.actual_balance).toFixed(2)}</td><td>&nbsp;</td></tr>
    <tr><td><b>Reason for Withdrawal:</b> ______________________________</td><td>&nbsp;</td></tr>
  </table>
  <p><b>Total Withdrawal:</b> &#x20B1; __________________</p>
  <div style="display:flex;justify-content:space-between;margin-top:40px">
    <div class="sig-line">Member Signature</div>
    <div class="sig-line">Teller Signature</div>
    <div class="sig-line">Authorized Signature</div>
  </div>
  <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;padding:10px 20px;font-size:14px;cursor:pointer">Print</button>`;
  res.type('html').send(formLayout('Withdrawal Slip - '+a.child_name, content));
}));

router.get('/forms/loan-application/:accountId', requireRole(1), asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM accounts WHERE account_id=$1', [req.params.accountId]);
  if (!a) return res.status(404).send('Not found');
  const products = await sql('SELECT * FROM loan_products WHERE is_active=1 ORDER BY name');
  const now = new Date(); const dateStr = now.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
  const content = `<h2>LabCoop Savings Bank</h2><h2>Loan Application Form</h2>
  <p style="text-align:center;font-size:11px">${dateStr}</p>
  <table><tr><td colspan="2"><b>I. MEMBER INFORMATION</b></td></tr>
    <tr><td style="width:50%">Name: <b>${a.child_name.toUpperCase()}</b></td><td>Member ID: <b>${a.member_id||'---'}</b></td></tr>
    <tr><td>Birthday: <b>${a.birthday||'---'}</b></td><td>Age: <b>${a.age||'---'}</b></td></tr>
    <tr><td>Civil Status: ________________</td><td>Occupation: ________________</td></tr>
    <tr><td colspan="2">Address: ______________________________________________________</td></tr>
    <tr><td colspan="2"><b>II. LOAN DETAILS</b></td></tr>
    <tr><td>Loan Type: _________________________________</td><td>Principal: &#x20B1; _______________</td></tr>
    <tr><td>Term: _____ months</td><td>Purpose: _______________________________</td></tr>
    <tr><td colspan="2"><b>III. CO-MAKER / GUARANTOR</b></td></tr>
    <tr><td>Name: _________________________________</td><td>Relationship: ________________</td></tr>
    <tr><td>Contact: ______________________________</td><td>Income: &#x20B1; _______________</td></tr>
  </table>
  <p style="font-size:10px;margin-top:12px">I hereby apply for a loan from LabCoop Savings Bank and certify that all information provided is true and correct.</p>
  <div style="display:flex;justify-content:space-between;margin-top:30px">
    <div class="sig-line">Applicant Signature</div>
    <div class="sig-line">Co-Maker Signature</div>
    <div class="sig-line">Approved By</div>
  </div>
  <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;padding:10px 20px;font-size:14px;cursor:pointer">Print</button>`;
  res.type('html').send(formLayout('Loan Application - '+a.child_name, content));
}));

// ============================================================
// 23. MULTI-CURRENCY (header indicator)
// ============================================================
// Currency support is column-based (accounts.currency defaults to PHP)
// This route provides a currency settings page
router.get('/currencies', requireRole(3), asyncHandler(async (req, res) => {
  const currencies = await sql('SELECT DISTINCT currency FROM accounts WHERE currency IS NOT NULL AND currency != \'\' ORDER BY currency');
  const content = `<div class="card"><div class="card-header"><h3>Currency Configuration</h3></div>
  <div class="card-body-padded">
  <p style="color:var(--text-muted);margin-bottom:12px">The system currently uses PHP (Philippine Peso) as default. Each member account has a currency field that can be set individually.</p>
  <table style="max-width:400px"><tr><th>Currency</th><th class="num">Accounts</th></tr>
    ${currencies.length === 0 ? '<tr><td colspan="2" style="text-align:center;padding:12px;color:var(--text-muted)">PHP only (default)</td></tr>' :
      currencies.map(c => { const cnt = accounts.filter(a=>a.currency===c).length; return `<tr><td><b>${c}</b></td><td class="num">${cnt}</td></tr>`; }).join('')}
  </table></div></div>`;
  res.type('html').send(layout('Currencies', 'currencies', content, { subtitle: 'Multi-currency account support' }));
}));

// ============================================================
// 24. NOTIFICATION LOG (Internal Alert History)
// ============================================================
router.get('/notifications-log', requireRole(2), asyncHandler(async (req, res) => {
  const logs = await sql("SELECT n.*, a.child_name FROM notifications n LEFT JOIN accounts a ON n.account_id = a.account_id ORDER BY n.created_at DESC LIMIT 100");
  const hasTable = await one("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'");
  if (!hasTable) {
    try { await store.query("CREATE TABLE IF NOT EXISTS notifications (notif_id TEXT PRIMARY KEY, account_id TEXT, title TEXT NOT NULL, body TEXT DEFAULT '', type TEXT DEFAULT 'info', is_read INTEGER DEFAULT 0, created_at TEXT)"); } catch(e) {}
  }
  const content = `<div class="card"><div class="card-header"><h3>Notification History</h3><span>${(logs||[]).length} sent</span></div>
  <div class="card-body" style="padding:0">
  <table><tr><th>Date</th><th>Member</th><th>Title</th><th>Body</th><th>Type</th><th>Read</th></tr>
    ${(logs||[]).length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No notifications sent yet</td></tr>' :
      logs.map(n => `<tr><td class="mono" style="font-size:10px">${(n.created_at||"").slice(0,16).replace('T',' ')}</td>
        <td>${n.child_name||'-'}</td><td><b>${n.title}</b></td><td style="font-size:12px">${n.body||'-'}</td>
        <td><span class="badge ${n.type==='alert'?'badge-red':n.type==='promo'?'badge-green':'badge-blue'}">${n.type||'info'}</span></td>
        <td>${n.is_read?'<span style="color:#16a34a">Read</span>':'<span style="color:var(--text-muted)">Unread</span>'}</td></tr>`).join('')}
  </table></div></div>`;
  res.type('html').send(layout('Notification Log', 'notifications-log', content, { subtitle: 'Internal alert and notification history' }));
}));

module.exports = router;
