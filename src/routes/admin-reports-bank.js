// ═══════════════════════════════════════════════════════════════
// BANK-GRADE PROFESSIONAL REPORTS
// ═══════════════════════════════════════════════════════════════
// Produces reports that match the format and quality of
// BDO, BPI, Metrobank, and other Philippine bank statements.
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { layout, printLayout, h, reportTable, reportSection, reportStats, fmt, fmtTrn, ROLE_LEVELS, ORG_TEMPLATE_URL } = require('./admin-lib');

const requireRole = (minLevel) => (req, res, next) => {
  if (!req.session || !req.session.adminId) return res.redirect('/admin/login');
  const level = ROLE_LEVELS[req.session.adminRole] ?? 0;
  if (level < minLevel) return res.status(403).send('Forbidden');
  next();
};

// ── Shared Styles for Bank Reports ──
const BANK_REPORT_STYLE = `
<style>
  /* ── FULL-VIEW BANK-GRADE LAYOUT ── */
  .br-container { width:100%; max-width:none; padding:0; position:relative; }
  .br-container::before {
    content:'';
    position:absolute;
    inset:-12px 0 0 0;
    background: url('${ORG_TEMPLATE_URL}') center top / 100% auto no-repeat;
    opacity:0.08;
    pointer-events:none;
    z-index:0;
  }
  .br-container > * { position:relative; z-index:1; }
  .br-org-banner { margin-bottom:18px; }
  .br-org-banner img { display:block; width:100%; height:170px; object-fit:cover; object-position:top center; border-radius:16px; box-shadow:0 4px 20px rgba(0,0,0,0.08); background:#fff; }
  .br-card { width:100%; background:rgba(255,255,255,0.96); border:1px solid var(--border); border-radius:16px; margin-bottom:24px; box-shadow:0 4px 24px rgba(0,0,0,0.06); overflow:hidden; }

  /* ── HEADER WITH GOLD ACCENT ── */
  .br-header { background:linear-gradient(135deg,#0d2818 0%,#1a5c2a 50%,#0d2818 100%); color:#fff; padding:28px 36px; position:relative; border-bottom:3px solid #c8a84e; }
  .br-header::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg,#c8a84e,#f0d78c,#c8a84e); }
  .br-header .br-bank-row { display:flex; justify-content:space-between; align-items:flex-start; }
  .br-header .br-bank-left { }
  .br-header .br-bank-name { font-size:22px; font-weight:800; letter-spacing:1.5px; }
  .br-header .br-bank-sub { font-size:11px; opacity:0.75; margin-top:3px; }
  .br-header .br-report-title { font-size:16px; font-weight:700; letter-spacing:2px; text-transform:uppercase; margin-top:8px; color:#f0d78c; }
  .br-header .br-bank-right { text-align:right; font-size:10px; opacity:0.7; line-height:1.5; }

  /* ── BODY ── */
  .br-body { padding:32px 36px; }

  /* ── MEMBER INFO PANEL ── */
  .br-member-panel { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; padding:20px 24px; background:linear-gradient(135deg,#f8fafc,#f0fdf4); border-radius:12px; border:1px solid var(--border); }
  .br-member-panel .br-member-left { display:grid; grid-template-columns:1fr 1fr; gap:8px 32px; }
  .br-member-panel .br-field { display:flex; flex-direction:column; }
  .br-member-panel .br-label { font-size:9px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700; }
  .br-member-panel .br-value { font-size:14px; font-weight:700; color:var(--text); margin-top:2px; }
  .br-member-panel .br-value.mono { font-family:var(--mono); }
  .br-member-panel .br-status-badge { display:inline-flex; align-items:center; gap:6px; padding:6px 16px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
  .br-member-panel .br-status-badge.active { background:#dcfce7; color:#16a34a; border:1px solid #bbf7d0; }
  .br-member-panel .br-status-badge.inactive { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
  [data-theme="dark"] .br-member-panel { background:linear-gradient(135deg,#1a231c,#0f2012); }
  [data-theme="dark"] .br-member-panel .br-status-badge.active { background:#052e16; color:#4ade80; }

  /* ── SUMMARY CARDS ── */
  .br-summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
  .br-summary-item { background:var(--card); border-radius:12px; padding:18px 20px; text-align:center; position:relative; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
  .br-summary-item::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
  .br-summary-item.blue::before { background:linear-gradient(90deg,#2563eb,#60a5fa); }
  .br-summary-item.green::before { background:linear-gradient(90deg,#16a34a,#4ade80); }
  .br-summary-item.red::before { background:linear-gradient(90deg,#dc2626,#f87171); }
  .br-summary-item.gold::before { background:linear-gradient(90deg,#c8a84e,#f0d78c); }
  .br-summary-item .br-sum-icon { font-size:18px; margin-bottom:4px; opacity:0.6; }
  .br-summary-item .br-sum-label { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:700; }
  .br-summary-item .br-sum-value { font-size:24px; font-weight:800; font-family:var(--mono); margin-top:4px; }
  .br-summary-item .br-sum-value.green { color:#16a34a; }
  .br-summary-item .br-sum-value.red { color:#dc2626; }
  .br-summary-item .br-sum-value.blue { color:#2563eb; }
  .br-summary-item .br-sum-value.gold { color:#c8a84e; }

  /* ── TRANSACTION TABLE ── */
  .br-table-wrap { border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:8px; }
  .br-table { width:100%; border-collapse:collapse; font-size:13px; }
  .br-table thead { background:linear-gradient(135deg,#f8fafc,#f0fdf4); }
  .br-table th { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:700; padding:12px 16px; text-align:left; border-bottom:2px solid var(--border); }
  .br-table th.right { text-align:right; }
  .br-table td { padding:12px 16px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
  .br-table td.right { text-align:right; font-family:var(--mono); font-weight:600; }
  .br-table td.mono { font-family:var(--mono); font-size:12px; }
  .br-table tbody tr { transition:background 0.15s ease; }
  .br-table tbody tr:nth-child(even) { background:rgba(0,0,0,0.015); }
  .br-table tbody tr:hover { background:rgba(22,163,74,0.04); }
  .br-table tbody tr.total-row { background:linear-gradient(135deg,#f0fdf4,#dcfce7) !important; }
  .br-table tbody tr.total-row td { font-weight:800; border-top:2px solid #16a34a; font-size:13px; color:var(--text); }
  .br-table .credit { color:#16a34a; font-weight:700; }
  .br-table .debit { color:#dc2626; font-weight:700; }
  .br-table .info-row { color:var(--text-muted); font-style:italic; }
  .br-table .info-row td { font-size:12px; }
  .br-table td .tx-type { display:inline-block; padding:2px 10px; border-radius:4px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
  .br-table td .tx-type.deposit { background:#dcfce7; color:#16a34a; }
  .br-table td .tx-type.withdrawal { background:#fef2f2; color:#dc2626; }
  .br-table td .tx-type.fee { background:#fefce8; color:#a16207; }
  .br-table td .tx-type.penalty { background:#fef2f2; color:#dc2626; }
  .br-table td .tx-type.loan_payment { background:#e0f2fe; color:#0284c7; }
  .br-table td .tx-type.interest_credit { background:#f0fdf4; color:#16a34a; }
  .br-table td .tx-type.auto_save { background:#f3e8ff; color:#7c3aed; }
  .br-table td .tx-type.purchase { background:#fce7f3; color:#db2777; }
  .br-table td .tx-type.default { background:var(--bg); color:var(--text-muted); }

  /* ── TOOLBAR ── */
  .br-toolbar { width:100%; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:24px; padding:16px 20px; background:var(--card); border:1px solid var(--border); border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.03); }
  .br-toolbar .field { display:flex; flex-direction:column; min-width:160px; }
  .br-toolbar .field label { font-size:9px; font-weight:700; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px; }
  .br-toolbar .field input, .br-toolbar .field select { padding:8px 14px; border:2px solid var(--border); border-radius:8px; font-size:13px; outline:none; background:var(--card); transition:border-color 0.2s; }
  .br-toolbar .field input:focus, .br-toolbar .field select:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(46,125,50,0.1); }

  /* ── LEGAL / FOOTER ── */
  .br-footer { width:100%; margin-top:24px; padding:16px 20px; background:var(--bg); border-radius:12px; border:1px solid var(--border); }
  .br-footer .br-legal { font-size:10px; color:var(--text-muted); text-align:center; line-height:1.6; }
  .br-footer .br-legal strong { color:var(--text); }

  /* ── CERTIFICATE (unchanged structure) ── */
  .br-cert { max-width:720px; margin:0 auto; background:var(--card); border:2px solid var(--accent); border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .br-cert-header { background:linear-gradient(135deg,#0d2818,#1a5c2a); color:#fff; text-align:center; padding:24px; border-bottom:3px solid #c8a84e; }
  .br-cert-header h2 { font-size:20px; font-weight:800; letter-spacing:3px; margin:0; }
  .br-cert-header .br-cert-sub { font-size:11px; opacity:0.85; margin-top:4px; }
  .br-cert-body { padding:32px 36px; }
  .br-cert-body .br-cert-greeting { font-size:12px; color:var(--text-muted); margin-bottom:16px; }
  .br-cert-body .br-cert-name { font-size:24px; font-weight:800; color:var(--text); margin-bottom:16px; }
  .br-cert-body .br-cert-amount { text-align:center; font-size:32px; font-weight:800; color:var(--accent); font-family:var(--mono); padding:20px; border:2px dashed var(--border); border-radius:12px; margin-bottom:16px; background:linear-gradient(135deg,#f0fdf4,#f8fafc); }
  .br-cert-body .br-cert-words { text-align:center; font-size:13px; color:var(--text-muted); margin-bottom:24px; font-style:italic; }
  .br-cert-body .br-cert-details { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:24px; }
  .br-cert-body .br-cert-details .br-field { display:flex; flex-direction:column; padding:8px 12px; background:var(--bg); border-radius:8px; }
  .br-cert-body .br-cert-details .br-label { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:700; }
  .br-cert-body .br-cert-details .br-value { font-size:14px; font-weight:700; margin-top:2px; }
  .br-cert-body .br-cert-footer { display:flex; justify-content:space-between; padding-top:20px; border-top:2px solid var(--border); }
  .br-cert-body .br-cert-footer .br-signature { text-align:center; flex:1; }
  .br-cert-body .br-cert-footer .br-signature .br-sig-line { width:160px; border-top:1px solid #000; margin:36px auto 4px auto; }
  .br-cert-body .br-cert-footer .br-signature .br-sig-label { font-size:10px; color:var(--text-muted); font-weight:600; }

  /* ── CERTIFICATE AMOUNT BOX (new prominent design) ── */
  .br-cert-amount-box { text-align:center; padding:28px 20px; border:2px dashed #c8a84e; border-radius:16px; margin-bottom:24px; background:linear-gradient(135deg,#fefce8,#fffef0,#fefce8); }
  .br-cert-amount-box .br-cert-amount-label { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#8b7d3c; font-weight:700; margin-bottom:8px; }
  .br-cert-amount-box .br-cert-amount-figure { font-size:38px; font-weight:800; color:#0d2818; font-family:var(--mono); }
  .br-cert-amount-box .br-cert-amount-words { font-size:12px; color:#8b7d3c; font-style:italic; margin-top:6px; }
  [data-theme="dark"] .br-cert-amount-box { background:linear-gradient(135deg,#1a1a0e,#0f2012,#1a1a0e); }
  [data-theme="dark"] .br-cert-amount-box .br-cert-amount-figure { color:#f0d78c; }

  /* ── SIGNATURES ── */
  .br-signatures { display:flex; justify-content:space-around; margin-top:28px; padding-top:24px; border-top:2px solid var(--border); }
  .br-signatures .br-sig-block { text-align:center; flex:1; }
  .br-signatures .br-sig-block .br-sig-line { width:160px; border-top:1px solid #000; margin:40px auto 4px auto; }
  .br-signatures .br-sig-block .br-sig-label { font-size:10px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }

  @media print {
    .br-toolbar, .br-toolbar *, .btn, button, input, select, .sidebar, .sidebar *, .page-header { display:none !important; }
    .br-card { break-inside:avoid; border:1px solid #000; box-shadow:none; border-radius:0; }
    .br-header { background:#0d2818 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-summary-item { border:1px solid #999; }
    .br-summary-item::before { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-cert { border:2px solid #000; }
    .br-cert-header { background:#0d2818 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-cert-amount-box { border:2px dashed #000 !important; }
    .br-table-wrap { border:1px solid #999; border-radius:0; }
    .br-table th { background:#f0f0f0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-table tbody tr.total-row { background:#e8e8e8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-member-panel { background:#f8fafc !important; border:1px solid #999; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-footer { border:1px solid #999; }
    .br-signatures .br-sig-block .br-sig-line { padding-top:0; }
  }
</style>`;

// ── Helper: number to words (Philippine Peso) ──
function numberToWords(n) {
  if (typeof n !== 'number' || isNaN(n)) return 'Zero Pesos';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scales = ['','Thousand','Million','Billion'];
  const peso = Math.floor(n);
  const centavos = Math.round((n - peso) * 100);
  function convertHundreds(num) {
    if (num === 0) return '';
    let s = '';
    if (num >= 100) { s += ones[Math.floor(num / 100)] + ' Hundred '; num %= 100; }
    if (num >= 20) { s += tens[Math.floor(num / 10)] + ' '; num %= 10; }
    if (num > 0) s += ones[num] + ' ';
    return s;
  }
  function convert(num) {
    if (num === 0) return 'Zero';
    let s = '', scaleIdx = 0;
    while (num > 0) {
      const chunk = num % 1000;
      if (chunk > 0) {
        s = convertHundreds(chunk) + scales[scaleIdx] + ' ' + s;
      }
      num = Math.floor(num / 1000);
      scaleIdx++;
    }
    return s.trim();
  }
  const pesoWords = peso === 0 ? 'Zero' : convert(peso);
  const centavoWords = centavos > 0 ? ' and ' + convert(centavos) + ' Centavos' : '';
  return pesoWords + ' Pesos' + centavoWords;
}

// ── 1. BANK-GRADE STATEMENT OF ACCOUNT ──
router.get('/reports/bank/statement', requireRole(1), asyncHandler(async (req, res) => {
  const sql = (s, p) => store.query(s, p || []).then(r => r.rows);
  const one = (s, p) => store.query(s, p || []).then(r => r.rows[0]);

  const memberId = (req.query.member_id || '').replace(/[^0-9a-f\-]/gi, '');
  const from = (req.query.from || '').replace(/[^0-9\-]/g, '').slice(0, 10);
  const to = (req.query.to || '').replace(/[^0-9\-]/g, '').slice(0, 10);
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);

  const fromDate = from || defaultFrom;
  const toDate = to || defaultTo;

  // Get all active members for dropdown
  const members = await sql("SELECT account_id, child_name, member_id FROM accounts WHERE is_active = 1 ORDER BY child_name ASC");

  let account = null;
  let transactions = [];
  let openingBalance = 0;
  let closingBalance = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  if (memberId) {
    account = await one("SELECT * FROM accounts WHERE member_id = $1 AND is_active = 1", [memberId]);
    if (account) {
      // Get opening balance before the period
      // Note: fee/penalty do NOT affect actual_balance (savings balance) — they are informational/income entries
      const balBefore = await one(`
        SELECT COALESCE(SUM(CASE WHEN type IN ('deposit','interest_credit','interest','loan_disbursement','td_maturity','reward') THEN amount
          WHEN type IN ('withdrawal','loan_payment','auto_save','purchase','td_placement') THEN -amount ELSE 0 END), 0) as bal
        FROM transactions WHERE account_id = $1 AND DATE(created_at) < $2
      `, [account.account_id, fromDate]);
      openingBalance = Number(balBefore?.bal || 0);

      // Get transactions for the period
      transactions = await sql(`
        SELECT * FROM transactions
        WHERE account_id = $1 AND DATE(created_at) >= $2 AND DATE(created_at) <= $3
        ORDER BY created_at ASC
      `, [account.account_id, fromDate, toDate]);

      // Calculate totals — only include types that affect actual_balance (savings balance)
      // fee/penalty do NOT deduct from savings — they are informational/income entries
      totalCredits = transactions.filter(t =>
        ['deposit','interest_credit','interest'].includes(t.type)
      ).reduce((s, t) => s + Number(t.amount), 0);

      totalDebits = transactions.filter(t =>
        ['withdrawal','loan_payment','auto_save','purchase','td_placement'].includes(t.type)
      ).reduce((s, t) => s + Number(t.amount), 0);

      closingBalance = openingBalance + totalCredits - totalDebits;
    }
  }

  // Build transaction rows
  // isBalanceAffecting: only types that change actual_balance (savings balance)
  // fee/penalty do NOT affect savings balance — they are informational/income entries
  const BALANCE_CREDIT = ['deposit','interest_credit','interest'];
  const BALANCE_DEBIT = ['withdrawal','loan_payment','auto_save','purchase','td_placement'];
  let runningBalance = openingBalance;
  const txRows = transactions.map(t => {
    const amt = Number(t.amount);
    const isBalanceCredit = BALANCE_CREDIT.includes(t.type);
    const isBalanceDebit = BALANCE_DEBIT.includes(t.type);
    const affectsBalance = isBalanceCredit || isBalanceDebit;
    if (isBalanceCredit) runningBalance += amt;
    else if (isBalanceDebit) runningBalance -= amt;
    const typeLabel = t.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const dateStr = (t.created_at || '').slice(0, 10);
    const refStr = t.reference_id ? (t.reference_id).slice(0, 8).toUpperCase() : '-';
    return `<tr>
      <td class="mono">${dateStr}</td>
      <td class="mono">${refStr}</td>
      <td><span class="br-type-badge type-${t.type}">${typeLabel}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(t.description || typeLabel)}</td>
      <td class="right credit">${isBalanceCredit ? '₱' + amt.toFixed(2) : ''}</td>
      <td class="right debit">${isBalanceDebit ? '₱' + amt.toFixed(2) : ''}</td>
      <td class="right" style="font-weight:700">${affectsBalance ? '₱' + runningBalance.toFixed(2) : '—'}</td>
    </tr>`;
  }).join('');

  const content = BANK_REPORT_STYLE + `
  <div class="br-container">
    <div class="br-org-banner"><img src="${ORG_TEMPLATE_URL}" alt="Org template header"></div>
    <div class="br-toolbar">
      <div class="field"><label>Member</label>
        <select id="brMember" onchange="location.href='/admin/reports/bank/statement?member_id='+this.value+'&from='+document.getElementById('brFrom').value+'&to='+document.getElementById('brTo').value">
          <option value="">Select member...</option>
          ${members.map(m => '<option value="' + m.member_id + '" ' + (memberId === m.member_id ? 'selected' : '') + '>' + h(m.child_name) + ' (' + m.member_id + ')</option>').join('')}
        </select>
      </div>
      <div class="field"><label>From</label><input type="date" id="brFrom" value="${fromDate}"></div>
      <div class="field"><label>To</label><input type="date" id="brTo" value="${toDate}"></div>
      <button class="btn btn-primary btn-sm" onclick="location.href='/admin/reports/bank/statement?member_id=${memberId}&from='+document.getElementById('brFrom').value+'&to='+document.getElementById('brTo').value"><i class="fas fa-search"></i> View</button>
      ${memberId ? `
        <a href="/admin/reports/bank/statement?member_id=${memberId}&from=${fromDate}&to=${toDate}&print=1" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-print"></i> Print Statement</a>
        <a href="/admin/reports/bank/statement?member_id=${memberId}&from=${fromDate}&to=${toDate}&format=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
      ` : ''}
    </div>
    ${!memberId ? `
    <div class="br-card">
      <div class="br-body" style="text-align:center;padding:80px">
        <i class="fas fa-hand-point-left" style="font-size:56px;opacity:0.2;display:block;margin-bottom:16px;color:var(--accent)"></i>
        <h3 style="color:var(--text-muted);font-weight:400;font-size:16px">Select a member to view their bank statement</h3>
      </div>
    </div>` : account ? `
    <!-- ── BANK STATEMENT ── -->
    <div class="br-card">
      <!-- Header with Gold Accent -->
      <div class="br-header">
        <div class="br-bank-row">
          <div class="br-bank-left">
            <div class="br-bank-name">🏦 LABCOOP SAVINGS BANK</div>
            <div class="br-bank-sub">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678</div>
            <div class="br-report-title">Statement of Account</div>
          </div>
          <div class="br-bank-right">
            <div>Member Since: ${(account.created_at || '').slice(0, 7) || '-'}</div>
            <div>Page 1 of 1</div>
          </div>
        </div>
      </div>

      <div class="br-body">
        <!-- Member Information Panel -->
        <div class="br-member-panel">
          <div class="br-member-left">
            <div class="br-field">
              <span class="br-label">Account Holder</span>
              <span class="br-value">${h(account.child_name)}</span>
            </div>
            <div class="br-field">
              <span class="br-label">Member ID</span>
              <span class="br-value mono">${h(account.member_id)}</span>
            </div>
            <div class="br-field">
              <span class="br-label">Account Number</span>
              <span class="br-value mono">${h(account.regular_savings_number || account.member_id)}</span>
            </div>
            <div class="br-field">
              <span class="br-label">Statement Period</span>
              <span class="br-value mono">${fromDate} — ${toDate}</span>
            </div>
          </div>
          <div class="br-status-badge ${account.is_active == 1 ? 'active' : 'inactive'}">
            <i class="fas ${account.is_active == 1 ? 'fa-check-circle' : 'fa-times-circle'}"></i>
            ${account.is_active == 1 ? 'Active' : 'Inactive'}
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="br-summary-grid">
          <div class="br-summary-item blue">
            <div class="br-sum-icon"><i class="fas fa-wallet"></i></div>
            <div class="br-sum-label">Opening Balance</div>
            <div class="br-sum-value blue">₱${openingBalance.toFixed(2)}</div>
          </div>
          <div class="br-summary-item green">
            <div class="br-sum-icon"><i class="fas fa-arrow-down"></i></div>
            <div class="br-sum-label">Total Deposits</div>
            <div class="br-sum-value green">+₱${totalCredits.toFixed(2)}</div>
          </div>
          <div class="br-summary-item red">
            <div class="br-sum-icon"><i class="fas fa-arrow-up"></i></div>
            <div class="br-sum-label">Total Withdrawals</div>
            <div class="br-sum-value red">−₱${totalDebits.toFixed(2)}</div>
          </div>
          <div class="br-summary-item gold">
            <div class="br-sum-icon"><i class="fas fa-landmark"></i></div>
            <div class="br-sum-label">Closing Balance</div>
            <div class="br-sum-value gold">₱${closingBalance.toFixed(2)}</div>
          </div>
        </div>

        <!-- Transactions Table -->
        <div class="br-table-wrap">
          <table class="br-table">
            <thead>
              <tr>
                <th style="width:100px">Date</th>
                <th style="width:90px">Ref #</th>
                <th style="width:120px">Type</th>
                <th>Description</th>
                <th class="right" style="width:130px">Deposits (₱)</th>
                <th class="right" style="width:130px">Withdrawals (₱)</th>
                <th class="right" style="width:130px">Balance (₱)</th>
              </tr>
            </thead>
            <tbody>
              <tr style="font-weight:700;background:var(--bg)">
                <td colspan="4">Opening Balance</td>
                <td></td><td></td>
                <td class="right">₱${openingBalance.toFixed(2)}</td>
              </tr>
              ${txRows}
              <tr class="total-row">
                <td colspan="4"><strong>TOTAL</strong></td>
                <td class="right credit">₱${totalCredits.toFixed(2)}</td>
                <td class="right debit">₱${totalDebits.toFixed(2)}</td>
                <td class="right">₱${closingBalance.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="br-footer">
          <div class="br-legal">
            <strong>Disclaimer:</strong> This statement is a computer-generated document and does not require a physical signature.<br>
            For inquiries, please contact LabCoop Savings Bank at <strong>(02) 1234-5678</strong> or email <strong>support@labcoop.com</strong><br>
            Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — PH Time
          </div>
        </div>
      </div>
    </div>` : `
    <div class="br-card">
      <div class="br-body" style="text-align:center;padding:80px">
        <i class="fas fa-user-slash" style="font-size:56px;opacity:0.2;display:block;margin-bottom:16px;color:var(--accent)"></i>
        <h3 style="color:var(--text-muted);font-weight:400;font-size:16px">Member not found or inactive</h3>
      </div>
    </div>`}
  </div>`;

  if (req.query.print === '1' && account) {
    const printContent = `
    <div style="margin-bottom:4mm">
      <h3 style="font-size:12pt;font-weight:700">Account Holder: ${h(account.child_name)}</h3>
      <table style="width:100%;font-size:9pt;margin-bottom:3mm">
        <tr><td style="width:50%"><b>Member ID:</b> ${h(account.member_id)}</td><td><b>Period:</b> ${fromDate} to ${toDate}</td></tr>
        <tr><td><b>Account #:</b> ${h(account.regular_savings_number || account.member_id)}</td><td><b>Status:</b> ${account.is_active == 1 ? 'Active' : 'Inactive'}</td></tr>
      </table>
    </div>
    <div style="display:flex;gap:3mm;margin-bottom:3mm">
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Opening</b><br>₱${openingBalance.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Deposits</b><br>₱${totalCredits.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Withdrawals</b><br>₱${totalDebits.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Closing</b><br>₱${closingBalance.toFixed(2)}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Ref#</th><th>Type</th><th>Description</th><th class="num">Deposit</th><th class="num">Withdrawal</th><th class="num">Balance</th></tr></thead>
      <tbody>
        <tr><td colspan="4" style="font-weight:600">Opening Balance</td><td></td><td></td><td class="num" style="font-weight:600">₱${openingBalance.toFixed(2)}</td></tr>
        ${transactions.map(t => {
          const amt = Number(t.amount);
          const isBalCredit = ['deposit','interest_credit','interest'].includes(t.type);
          const isBalDebit = ['withdrawal','loan_payment','auto_save','purchase','td_placement'].includes(t.type);
          const affectsBal = isBalCredit || isBalDebit;
          const typeLabel = t.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `<tr>
            <td>${(t.created_at||'').slice(0,10)}</td>
            <td class="mono">${t.reference_id ? t.reference_id.slice(0,8).toUpperCase() : '-'}</td>
            <td>${typeLabel}</td>
            <td style="max-width:100px">${h(t.description || typeLabel)}</td>
            <td class="num">${isBalCredit ? '₱' + amt.toFixed(2) : ''}</td>
            <td class="num">${isBalDebit ? '₱' + amt.toFixed(2) : ''}</td>
            <td class="num">${affectsBal ? '₱' + (function(){ let b=openingBalance; transactions.slice(0,transactions.indexOf(t)+1).forEach(tx => { const a=Number(tx.amount); const c=['deposit','interest_credit','interest'].includes(tx.type); const d=['withdrawal','loan_payment','auto_save','purchase','td_placement'].includes(tx.type); if(c) b+=a; else if(d) b-=a; }); return b.toFixed(2); })() : '—'}</td>
          </tr>`;
        }).join('')}
        <tr style="font-weight:700;background:#e8e8e8">
          <td colspan="4">TOTAL</td>
          <td class="num">₱${totalCredits.toFixed(2)}</td>
          <td class="num">₱${totalDebits.toFixed(2)}</td>
          <td class="num">₱${closingBalance.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>`;
    return res.type('html').send(printLayout('Statement of Account — ' + (account.child_name || ''), printContent, {
      subtitle: 'Official Bank Statement',
      dateRange: fromDate + ' to ' + toDate,
      showSignatures: true
    }));
  }

  if (req.query.format === 'csv' && account) {
    let csv = 'Date,Ref#,Type,Description,Deposit,Withdrawal,Balance\n';
    let rb = openingBalance;
    csv += `,,,Opening Balance,,,₱${rb.toFixed(2)}\n`;
    transactions.forEach(t => {
      const amt = Number(t.amount);
      const isBalCredit = ['deposit','interest_credit','interest'].includes(t.type);
      const isBalDebit = ['withdrawal','loan_payment','auto_save','purchase','td_placement'].includes(t.type);
      const affectsBal = isBalCredit || isBalDebit;
      if (isBalCredit) rb += amt;
      else if (isBalDebit) rb -= amt;
      const typeLabel = t.type.replace(/_/g,' ');
      csv += `"${(t.created_at||'').slice(0,10)}","${t.reference_id ? t.reference_id.slice(0,8).toUpperCase() : '-'}",${typeLabel},"${(t.description||'').replace(/"/g,'""')}",${isBalCredit ? amt.toFixed(2) : ''},${isBalDebit ? amt.toFixed(2) : ''},${affectsBal ? '₱' + rb.toFixed(2) : '—'}\n`;
    });
    csv += `,,,,₱${totalCredits.toFixed(2)},₱${totalDebits.toFixed(2)},₱${closingBalance.toFixed(2)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bank_statement_' + (account.member_id || 'export') + '_' + fromDate + '_' + toDate + '.csv"');
    return res.send(csv);
  }

  res.type('html').send(layout('Bank Statement', 'bank-statement', content, { subtitle: 'Professional bank-grade statement of account' }));
}));

// ── 2. CERTIFICATE OF DEPOSIT BALANCE ──
router.get('/reports/bank/certificate', requireRole(1), asyncHandler(async (req, res) => {
  const sql = (s, p) => store.query(s, p || []).then(r => r.rows);
  const one = (s, p) => store.query(s, p || []).then(r => r.rows[0]);

  const memberId = (req.query.member_id || '').replace(/[^0-9a-f\-]/gi, '');
  const members = await sql("SELECT account_id, child_name, member_id FROM accounts WHERE is_active = 1 ORDER BY child_name ASC");
  let account = null;

  if (memberId) {
    account = await one("SELECT * FROM accounts WHERE member_id = $1 AND is_active = 1", [memberId]);
  }

  const balance = account ? Number(account.actual_balance) : 0;
  const balanceWords = numberToWords(balance);
  const today = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });

  const content = BANK_REPORT_STYLE + `
  <div class="br-container">
    <div class="br-toolbar">
      <div class="field"><label>Member</label>
        <select onchange="location.href='/admin/reports/bank/certificate?member_id='+this.value">
          <option value="">Select member...</option>
          ${members.map(m => '<option value="' + m.member_id + '" ' + (memberId === m.member_id ? 'selected' : '') + '>' + h(m.child_name) + ' (' + m.member_id + ')</option>').join('')}
        </select>
      </div>
      ${account ? '<a href="/admin/reports/bank/certificate?member_id=' + memberId + '&print=1" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-print"></i> Print Certificate</a>' : ''}
    </div>
    ${!memberId ? `
    <div class="br-card"><div class="br-body" style="text-align:center;padding:80px">
      <i class="fas fa-hand-point-left" style="font-size:56px;opacity:0.2;display:block;margin-bottom:16px;color:var(--accent)"></i>
      <h3 style="color:var(--text-muted);font-weight:400;font-size:16px">Select a member to issue a certificate</h3>
    </div></div>` : account ? `
    <!-- ── CERTIFICATE OF DEPOSIT BALANCE ── -->
    <div class="br-card">
      <div class="br-header">
        <div class="br-bank-row">
          <div class="br-bank-left">
            <div class="br-bank-name">🏦 LABCOOP SAVINGS BANK</div>
            <div class="br-bank-sub">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678</div>
            <div class="br-report-title">Certificate of Deposit Balance</div>
          </div>
          <div class="br-bank-right">
            <div>Date Issued: ${today}</div>
          </div>
        </div>
      </div>
      <div class="br-body">
        <!-- Account Summary Cards -->
        <div class="br-summary-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="br-summary-item blue">
            <div class="br-sum-icon"><i class="fas fa-user"></i></div>
            <div class="br-sum-label">Account Holder</div>
            <div class="br-sum-value" style="font-size:16px;color:var(--text);font-family:inherit">${h(account.child_name)}</div>
          </div>
          <div class="br-summary-item gold">
            <div class="br-sum-icon"><i class="fas fa-coins"></i></div>
            <div class="br-sum-label">Current Balance</div>
            <div class="br-sum-value gold">₱${balance.toFixed(2)}</div>
          </div>
          <div class="br-summary-item green">
            <div class="br-sum-icon"><i class="fas fa-check-circle"></i></div>
            <div class="br-sum-label">Account Status</div>
            <div class="br-sum-value" style="font-size:14px;color:${account.is_active == 1 ? '#16a34a' : '#dc2626'};font-family:inherit">${account.is_active == 1 ? '● Active' : '● Inactive'}</div>
          </div>
        </div>

        <!-- Amount Display (Prominent) -->
        <div class="br-cert-amount-box">
          <div class="br-cert-amount-label">SAVINGS BALANCE</div>
          <div class="br-cert-amount-figure">₱ ${balance.toFixed(2)}</div>
          <div class="br-cert-amount-words">${balanceWords}</div>
        </div>

        <!-- Details Grid -->
        <div class="br-member-panel" style="margin-top:0">
          <div class="br-member-left" style="grid-template-columns:1fr 1fr 1fr">
            <div class="br-field">
              <span class="br-label">Member ID</span>
              <span class="br-value mono">${h(account.member_id)}</span>
            </div>
            <div class="br-field">
              <span class="br-label">Account Number</span>
              <span class="br-value mono">${h(account.regular_savings_number || account.member_id)}</span>
            </div>
            <div class="br-field">
              <span class="br-label">Date Opened</span>
              <span class="br-value">${(account.created_at || '').slice(0, 10) || '-'}</span>
            </div>
            <div class="br-field">
              <span class="br-label">Interest Rate</span>
              <span class="br-value">${account.savings_product_id ? '2% per month' : 'Standard Rate'}</span>
            </div>
            <div class="br-field">
              <span class="br-label">TIN</span>
              <span class="br-value mono">123-456-789-000</span>
            </div>
            <div class="br-field">
              <span class="br-label">Certificate No.</span>
              <span class="br-value mono">CDB-${(account.member_id || '').slice(0,8).toUpperCase() || '0000'}-${date.replace(/-/g,'')}</span>
            </div>
          </div>
        </div>

        <!-- Signatures -->
        <div class="br-signatures">
          <div class="br-sig-block">
            <div class="br-sig-line"></div>
            <div class="br-sig-label">Branch Manager</div>
          </div>
          <div class="br-sig-block">
            <div class="br-sig-line"></div>
            <div class="br-sig-label">Account Officer</div>
          </div>
          <div class="br-sig-block">
            <div class="br-sig-line"></div>
            <div class="br-sig-label">Member Services</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="br-footer">
          <div class="br-legal">
            <strong>Disclaimer:</strong> This certificate is issued upon request and reflects the savings balance as of <strong>${today}</strong>.<br>
            LabCoop Savings Bank ● 123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678
          </div>
        </div>
      </div>
    </div>` : `
    <div class="br-card"><div class="br-body" style="text-align:center;padding:80px">
      <i class="fas fa-user-slash" style="font-size:56px;opacity:0.2;display:block;margin-bottom:16px;color:var(--accent)"></i>
      <h3 style="color:var(--text-muted);font-weight:400;font-size:16px">Member not found or inactive</h3>
    </div></div>`}
  </div>`;

  if (req.query.print === '1' && account) {
    const printContent = `
    <div style="border-bottom:3px solid #c8a84e;margin-bottom:4mm;padding-bottom:2mm">
      <h2 style="font-size:14pt;font-weight:800;letter-spacing:2px;color:#0d2818">LABCOOP SAVINGS BANK</h2>
      <p style="font-size:8pt;color:#555">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678</p>
    </div>
    <div style="text-align:center;margin:4mm 0;border:2px solid #c8a84e;padding:12px 0;background:linear-gradient(135deg,#fefce8,#fffef0)">
      <h1 style="font-size:16pt;font-weight:800;letter-spacing:2px;color:#0d2818">CERTIFICATE OF DEPOSIT BALANCE</h1>
      <p style="font-size:9pt;color:#666">Member Savings Account</p>
    </div>
    <p style="font-size:10pt;margin-bottom:2mm"><b>TO WHOM IT MAY CONCERN:</b></p>
    <p style="font-size:14pt;font-weight:700;margin-bottom:3mm;color:#0d2818">${h(account.child_name)}</p>
    <table style="width:100%;font-size:9pt;margin-bottom:3mm">
      <tr><td style="width:50%"><b>Member ID:</b> ${h(account.member_id)}</td><td><b>Date Issued:</b> ${today}</td></tr>
      <tr><td><b>Account #:</b> ${h(account.regular_savings_number || account.member_id)}</td><td><b>Status:</b> ${account.is_active == 1 ? 'Active' : 'Inactive'}</td></tr>
    </table>
    <p style="font-size:10pt;font-weight:600;margin-bottom:1mm">SAVINGS BALANCE</p>
    <p style="font-size:22pt;font-weight:800;text-align:center;padding:3mm;border:2px dashed #c8a84e;background:#fefce8;margin-bottom:2mm">₱ ${balance.toFixed(2)}</p>
    <p style="font-size:10pt;text-align:center;font-style:italic;color:#555;margin-bottom:4mm">${balanceWords}</p>
    <div style="display:flex;justify-content:space-between;margin-top:6mm">
      <div style="text-align:center;width:30%"><div style="border-top:1px solid #000;margin-bottom:1mm;padding-top:15mm"></div><div style="font-size:8pt">Branch Manager</div></div>
      <div style="text-align:center;width:30%"><div style="border-top:1px solid #000;margin-bottom:1mm;padding-top:15mm"></div><div style="font-size:8pt">Account Officer</div></div>
      <div style="text-align:center;width:30%"><div style="border-top:1px solid #000;margin-bottom:1mm;padding-top:15mm"></div><div style="font-size:8pt">Member Services</div></div>
    </div>
    <div style="text-align:center;font-size:7pt;color:#666;margin-top:4mm;border-top:1px solid #c8a84e;padding-top:2mm">
      This certificate is issued upon request and reflects the savings balance as of <b>${today}</b>.<br>
      LabCoop Savings Bank ● 123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678
    </div>`;
    return res.type('html').send(printLayout('Certificate of Deposit Balance — ' + (account.child_name || ''), printContent, {
      subtitle: 'OFFICIAL CERTIFICATE',
      showSignatures: false
    }));
  }

  res.type('html').send(layout('Certificate of Deposit Balance', 'bank-certificate', content, { subtitle: 'Official certificate of savings balance' }));
}));

// ── 3. DAILY CASH POSITION REPORT ──
router.get('/reports/bank/cash-position', requireRole(2), asyncHandler(async (req, res) => {
  const sql = (s, p) => store.query(s, p || []).then(r => r.rows);
  const one = (s, p) => store.query(s, p || []).then(r => r.rows[0]);

  const date = (req.query.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9\-]/g, '').slice(0, 10);

  // Get previous day's close
  const prevClose = await one("SELECT * FROM eod_logs WHERE date < $1 ORDER BY date DESC LIMIT 1", [date]);
  const openingCash = prevClose ? Number(prevClose.closing_cash) : 0;

  // Today's cash transactions
  const txs = await sql(`
    SELECT t.*, a.child_name, a.member_id FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.account_id
    WHERE DATE(t.created_at) = $1 ORDER BY t.created_at ASC
  `, [date]);

  // Cash IN (actual cash received by coop)
  const cashIn = txs.filter(t => ['deposit','fee','penalty','loan_payment','interest_income'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);

  // Cash OUT (actual cash paid by coop)
  const cashOut = txs.filter(t => ['withdrawal','loan_disbursement','td_maturity'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);

  // Non-cash book entries
  const nonCash = txs.filter(t => ['interest_credit','interest','reward'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);

  const closingCash = openingCash + cashIn - cashOut;
  const netCashFlow = cashIn - cashOut;

  // Break down by type
  const byType = {};
  txs.forEach(t => {
    if (!byType[t.type]) byType[t.type] = { count: 0, total: 0 };
    byType[t.type].count++;
    byType[t.type].total += Number(t.amount);
  });

  const typeRows = Object.keys(byType).sort().map(type => {
    const t = byType[type];
    const isCashIn = ['deposit','fee','penalty','loan_payment','interest_income'].includes(type);
    const isCashOut = ['withdrawal','loan_disbursement','td_maturity'].includes(type);
    const cat = isCashIn ? 'Cash In' : isCashOut ? 'Cash Out' : 'Non-Cash';
    const color = isCashIn ? '#16a34a' : isCashOut ? '#dc2626' : '#8b5cf6';
    return `<tr>
      <td><span style="color:${color};font-weight:600">${type.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</span></td>
      <td style="color:${color};font-size:10px">${cat}</td>
      <td class="right">${t.count}</td>
      <td class="right mono">₱${t.total.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const content = BANK_REPORT_STYLE + `
  <div class="br-container">
    <div class="br-toolbar">
      <div class="field"><label>Date</label><input type="date" id="cpDate" value="${date}"></div>
      <button class="btn btn-primary btn-sm" onclick="location.href='/admin/reports/bank/cash-position?date='+document.getElementById('cpDate').value"><i class="fas fa-search"></i> View</button>
      <a href="/admin/reports/bank/cash-position?date=${date}&print=1" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-print"></i> Print Report</a>
      <a href="/admin/reports/bank/cash-position?date=${date}&format=csv" class="btn btn-outline btn-sm"><i class="fas fa-file-csv"></i> CSV</a>
    </div>

    <div class="br-card">
      <div class="br-header">
        <div class="br-bank-row">
          <div class="br-bank-left">
            <div class="br-bank-name">🏦 LABCOOP SAVINGS BANK</div>
            <div class="br-bank-sub">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678</div>
            <div class="br-report-title">Daily Cash Position Report</div>
          </div>
          <div class="br-bank-right">
            <div>Report Date: ${date}</div>
          </div>
        </div>
      </div>
      <div class="br-body">

        <!-- Cash Position Summary -->
        <div class="br-summary-grid" style="grid-template-columns:repeat(5,1fr)">
          <div class="br-summary-item blue">
            <div class="br-sum-icon"><i class="fas fa-wallet"></i></div>
            <div class="br-sum-label">Opening Cash</div>
            <div class="br-sum-value blue">₱${openingCash.toFixed(2)}</div>
          </div>
          <div class="br-summary-item green">
            <div class="br-sum-icon"><i class="fas fa-arrow-down"></i></div>
            <div class="br-sum-label">Cash In (Collections)</div>
            <div class="br-sum-value green">+₱${cashIn.toFixed(2)}</div>
          </div>
          <div class="br-summary-item red">
            <div class="br-sum-icon"><i class="fas fa-arrow-up"></i></div>
            <div class="br-sum-label">Cash Out (Disbursements)</div>
            <div class="br-sum-value red">−₱${cashOut.toFixed(2)}</div>
          </div>
          <div class="br-summary-item gold">
            <div class="br-sum-icon"><i class="fas fa-chart-line"></i></div>
            <div class="br-sum-label">Net Cash Flow</div>
            <div class="br-sum-value" style="color:${netCashFlow >= 0 ? '#16a34a' : '#dc2626'}">${netCashFlow >= 0 ? '+₱' : '−₱'}${Math.abs(netCashFlow).toFixed(2)}</div>
          </div>
          <div class="br-summary-item blue" style="background:#eff6ff">
            <div class="br-sum-icon"><i class="fas fa-landmark"></i></div>
            <div class="br-sum-label" style="font-weight:800">Closing Cash</div>
            <div class="br-sum-value blue">₱${closingCash.toFixed(2)}</div>
          </div>
        </div>

        <!-- Breakdown Table -->
        <div class="br-table-wrap">
          <table class="br-table">
            <thead>
              <tr>
                <th>Transaction Type</th>
                <th>Category</th>
                <th class="right">Count</th>
                <th class="right">Amount (₱)</th>
              </tr>
            </thead>
            <tbody>
              ${typeRows}
              <tr class="total-row">
                <td colspan="2"><strong>TOTAL TRANSACTIONS</strong></td>
                <td class="right">${txs.length}</td>
                <td class="right">₱${txs.reduce((s,t) => s + Number(t.amount), 0).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3"><strong>CASH IN (Collections)</strong></td>
                <td class="right credit">₱${cashIn.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3"><strong>CASH OUT (Disbursements)</strong></td>
                <td class="right debit">₱${cashOut.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3"><strong>NON-CASH ENTRIES</strong></td>
                <td class="right" style="color:#8b5cf6;font-weight:700">₱${nonCash.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="br-footer">
          <div class="br-legal">
            <strong>Disclaimer:</strong> This report reflects the daily cash position based on posted transactions.<br>
            Non-cash entries (interest credits, rewards) are shown separately and do not affect the cash balance.<br>
            Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — PH Time
          </div>
        </div>
      </div>
    </div>
  </div>`;

  if (req.query.print === '1') {
    const printContent = `
    <div style="border-bottom:3px solid #c8a84e;margin-bottom:3mm;padding-bottom:2mm">
      <h2 style="font-size:14pt;font-weight:800;letter-spacing:2px;color:#0d2818">LABCOOP SAVINGS BANK</h2>
      <p style="font-size:8pt;color:#555">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000 ● (02) 1234-5678</p>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:3mm">
      <div><b>Report Date:</b> ${date}</div>
      <div><b>Opening Cash:</b> ₱${openingCash.toFixed(2)}</div>
    </div>
    <div style="display:flex;gap:2mm;margin-bottom:3mm">
      <div style="flex:1;border:1px solid #16a34a;padding:2mm;text-align:center"><b style="color:#16a34a">Cash In</b><br>₱${cashIn.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #dc2626;padding:2mm;text-align:center"><b style="color:#dc2626">Cash Out</b><br>₱${cashOut.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #f59e0b;padding:2mm;text-align:center"><b style="color:#f59e0b">Net Flow</b><br>₱${netCashFlow.toFixed(2)}</div>
      <div style="flex:1;border:2px solid #2563eb;padding:2mm;text-align:center;font-weight:700"><b style="color:#2563eb">Closing Cash</b><br>₱${closingCash.toFixed(2)}</div>
    </div>
    <table>
      <thead><tr><th>Type</th><th>Category</th><th class="num">Count</th><th class="num">Amount</th></tr></thead>
      <tbody>${typeRows}</tbody>
      <tfoot>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="2">TOTAL</td><td class="num">${txs.length}</td><td class="num">₱${txs.reduce((s,t) => s + Number(t.amount), 0).toFixed(2)}</td></tr>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="3" style="color:#16a34a">CASH IN (Collections)</td><td class="num" style="color:#16a34a;font-weight:700">₱${cashIn.toFixed(2)}</td></tr>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="3" style="color:#dc2626">CASH OUT (Disbursements)</td><td class="num" style="color:#dc2626;font-weight:700">₱${cashOut.toFixed(2)}</td></tr>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="3" style="color:#8b5cf6">NON-CASH ENTRIES</td><td class="num" style="color:#8b5cf6;font-weight:700">₱${nonCash.toFixed(2)}</td></tr>
      </tfoot>
    </table>`;
    return res.type('html').send(printLayout('Daily Cash Position Report — ' + date, printContent, {
      subtitle: 'CASH POSITION REPORT',
      dateRange: date,
      orientation: 'landscape',
      showSignatures: true
    }));
  }

  if (req.query.format === 'csv') {
    let csv = 'Daily Cash Position Report,' + date + '\n\n';
    csv += 'Opening Cash,₱' + openingCash.toFixed(2) + '\n';
    csv += 'Cash In (Collections),+₱' + cashIn.toFixed(2) + '\n';
    csv += 'Cash Out (Disbursements),−₱' + cashOut.toFixed(2) + '\n';
    csv += 'Net Cash Flow,' + (netCashFlow >= 0 ? '+₱' : '−₱') + Math.abs(netCashFlow).toFixed(2) + '\n';
    csv += 'Closing Cash,₱' + closingCash.toFixed(2) + '\n\n';
    csv += 'Type,Category,Count,Amount\n';
    Object.keys(byType).sort().forEach(type => {
      const t = byType[type];
      const isCashIn = ['deposit','fee','penalty','loan_payment','interest_income'].includes(type);
      const isCashOut = ['withdrawal','loan_disbursement','td_maturity'].includes(type);
      const cat = isCashIn ? 'Cash In' : isCashOut ? 'Cash Out' : 'Non-Cash';
      csv += `${type},${cat},${t.count},₱${t.total.toFixed(2)}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cash_position_' + date + '.csv"');
    return res.send(csv);
  }

  res.type('html').send(layout('Daily Cash Position', 'bank-cash-position', content, { subtitle: 'Professional bank cash position report' }));
}));

module.exports = router;
