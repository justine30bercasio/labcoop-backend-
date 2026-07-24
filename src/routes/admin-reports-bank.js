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
const { layout, printLayout, h, phTime, phDate, reportTable, reportSection, reportStats, fmt, fmtTrn, ROLE_LEVELS, ORG_TEMPLATE_URL, ORG_LOGO_URL } = require('./admin-lib');

const requireRole = (minLevel) => (req, res, next) => {
  if (!req.session || !req.session.adminId) return res.redirect('/admin/login');
  const level = ROLE_LEVELS[req.session.adminRole] ?? 0;
  if (level < minLevel) return res.status(403).send('Forbidden');
  next();
};

// ── Shared Styles for Bank Reports ──
const BANK_REPORT_STYLE = `
<style>
  /* ── GREEN GEOMETRIC THEME ── */
  :root { --forest: #1a4a1a; --olive: #6b8e23; --mint: #98d49b; --light-mint: #d8f0d8; --accent-green: #2d5a27; }

  .br-container { width:100%; max-width:none; padding:0; position:relative; }
  .br-card { width:100%; background:#fff; border:1px solid #d0dcd0; margin-bottom:24px; box-shadow:0 4px 24px rgba(0,0,0,0.06); overflow:hidden; }

  /* ── HEADER CONTENT ── */
  .br-header-content { padding:20px 36px 16px; background:#fff; border-bottom:1px solid #e0e8e0; }
  .br-header-row { display:flex; align-items:center; gap:16px; }
  .br-header-logo { flex-shrink:0; width:56px; height:56px; }
  .br-header-logo img { width:100%; height:100%; object-fit:contain; }
  .br-company-name { font-size:20px; font-weight:800; color:#000; letter-spacing:1px; }
  .br-company-address { font-size:10px; color:#666; margin-top:1px; }
  .br-title-row { display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
  .br-report-title { font-size:13px; font-weight:700; color:var(--forest); letter-spacing:1px; text-transform:uppercase; }
  .br-report-meta { font-size:9px; color:#888; }

  /* ── BODY ── */
  .br-body { padding:24px 36px; }

  /* ── MEMBER INFO PANEL ── */
  .br-member-panel { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; padding:16px 20px; background:#f6faf6; border:1px solid #dce8dc; border-radius:8px; }
  .br-member-panel .br-member-left { display:grid; grid-template-columns:1fr 1fr; gap:6px 28px; }
  .br-member-panel .br-field { display:flex; flex-direction:column; }
  .br-member-panel .br-label { font-size:8px; text-transform:uppercase; letter-spacing:0.6px; color:#888; font-weight:700; }
  .br-member-panel .br-value { font-size:13px; font-weight:700; color:#1a1a1a; margin-top:1px; }
  .br-member-panel .br-value.mono { font-family:'Courier New',monospace; }
  .br-member-panel .br-status-badge { display:inline-flex; align-items:center; gap:5px; padding:5px 14px; border-radius:16px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; }
  .br-member-panel .br-status-badge.active { background:#dcfce7; color:#16a34a; border:1px solid #bbf7d0; }
  .br-member-panel .br-status-badge.inactive { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }

  /* ── SUMMARY CARDS ── */
  .br-summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
  .br-summary-item { background:#fff; border:1px solid #dce8dc; border-radius:8px; padding:16px; text-align:center; }
  .br-summary-item .br-sum-label { font-size:8px; text-transform:uppercase; letter-spacing:0.4px; color:#888; font-weight:700; }
  .br-summary-item .br-sum-value { font-size:22px; font-weight:800; font-family:'Courier New',monospace; margin-top:3px; }
  .br-summary-item .br-sum-value.green { color:#16a34a; }
  .br-summary-item .br-sum-value.red { color:#dc2626; }
  .br-summary-item .br-sum-value.blue { color:#2563eb; }
  .br-summary-item .br-sum-value.forest { color:var(--forest); }

  /* ── TRANSACTION TABLE ── */
  .br-table-wrap { border:1px solid #dce8dc; overflow:hidden; margin-bottom:8px; }
  .br-table { width:100%; border-collapse:collapse; font-size:12px; }
  .br-table thead { background:#f0f6f0; }
  .br-table th { font-size:9px; text-transform:uppercase; letter-spacing:0.4px; color:#555; font-weight:700; padding:10px 14px; text-align:left; border-bottom:2px solid #d0dcd0; }
  .br-table th.right { text-align:right; }
  .br-table td { padding:10px 14px; border-bottom:1px solid #e8eee8; font-size:12px; vertical-align:middle; }
  .br-table td.right { text-align:right; font-family:'Courier New',monospace; font-weight:600; }
  .br-table td.mono { font-family:'Courier New',monospace; font-size:11px; }
  .br-table tbody tr:nth-child(even) { background:#fafcfa; }
  .br-table tbody tr.total-row { background:#eaf5ea !important; }
  .br-table tbody tr.total-row td { font-weight:800; border-top:2px solid var(--forest); }
  .br-table .credit { color:#16a34a; font-weight:700; }
  .br-table .debit { color:#dc2626; font-weight:700; }
  .br-table td .tx-type { display:inline-block; padding:2px 8px; border-radius:3px; font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
  .br-table td .tx-type.deposit { background:#dcfce7; color:#16a34a; }
  .br-table td .tx-type.withdrawal { background:#fef2f2; color:#dc2626; }
  .br-table td .tx-type.fee { background:#fefce8; color:#a16207; }
  .br-table td .tx-type.penalty { background:#fef2f2; color:#dc2626; }
  .br-table td .tx-type.loan_payment { background:#e0f2fe; color:#0284c7; }
  .br-table td .tx-type.interest_credit { background:#f0fdf4; color:#16a34a; }
  .br-table td .tx-type.auto_save { background:#f3e8ff; color:#7c3aed; }
  .br-table td .tx-type.purchase { background:#fce7f3; color:#db2777; }
  .br-table td .tx-type.default { background:#f0f0f0; color:#888; }

  /* ── TOOLBAR ── */
  .br-toolbar { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:20px; padding:14px 18px; background:#f8faf8; border:1px solid #dce8dc; }
  .br-toolbar .field { display:flex; flex-direction:column; min-width:150px; }
  .br-toolbar .field label { font-size:8px; font-weight:700; color:#888; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.4px; }
  .br-toolbar .field input, .br-toolbar .field select { padding:7px 12px; border:1.5px solid #d0dcd0; font-size:12px; outline:none; background:#fff; }
  .br-toolbar .field input:focus, .br-toolbar .field select:focus { border-color:var(--olive); }

  /* ── FOOTER CONTACT BAR ── */
  .br-footer-contact { display:flex; justify-content:center; gap:28px; padding:12px 20px; background:#f6faf6; border-top:1px solid #dce8dc; }
  .br-footer-item { display:flex; align-items:center; gap:5px; font-size:10px; color:#444; }
  .br-footer-item .fas, .br-footer-item .far { color:var(--forest); font-size:13px; width:16px; text-align:center; }
  .br-footer-bar { height:1px; background:#d0dcd0; }

  /* ── LEGAL ── */
  .br-legal { font-size:9px; color:#999; text-align:center; padding:10px 20px; line-height:1.5; border-top:1px solid #e8eee8; }

  /* ── CERTIFICATE ── */
  .br-cert { max-width:680px; margin:0 auto; background:#fff; border:2px solid var(--forest); overflow:hidden; }
  .br-cert-header { text-align:center; padding:20px; border-bottom:1px solid var(--mint); }
  .br-cert-header h2 { font-size:18px; font-weight:800; letter-spacing:2px; color:var(--forest); margin:0; }
  .br-cert-header .br-cert-sub { font-size:10px; color:#888; margin-top:3px; }
  .br-cert-body { padding:24px 28px; }
  .br-cert-amount-box { text-align:center; padding:24px 20px; border:2px dashed var(--mint); margin-bottom:20px; background:#f6faf6; }
  .br-cert-amount-box .br-cert-amount-label { font-size:8px; text-transform:uppercase; letter-spacing:1.2px; color:var(--olive); font-weight:700; margin-bottom:6px; }
  .br-cert-amount-box .br-cert-amount-figure { font-size:34px; font-weight:800; color:var(--forest); font-family:'Courier New',monospace; }
  .br-cert-amount-box .br-cert-amount-words { font-size:11px; color:var(--olive); font-style:italic; margin-top:5px; }

  /* ── SIGNATURES ── */
  .br-signatures { display:flex; justify-content:space-around; margin-top:24px; padding-top:20px; border-top:1px solid #dce8dc; }
  .br-signatures .br-sig-block { text-align:center; flex:1; }
  .br-signatures .br-sig-block .br-sig-line { width:140px; border-top:1px solid #000; margin:36px auto 3px auto; }
  .br-signatures .br-sig-block .br-sig-label { font-size:9px; color:#888; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; }

  @media print {
    .br-toolbar, .br-toolbar *, .btn, button, input, select, .sidebar, .sidebar *, .page-header { display:none !important; }
    .br-card { break-inside:avoid; border:1px solid #000; }
    .br-summary-item { border:1px solid #999; }
    .br-cert { border:2px solid #000; }
    .br-table-wrap { border:1px solid #999; }
    .br-table th { background:#e8eee8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-table tbody tr.total-row { background:#e0f0e0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-member-panel { background:#f4f8f4 !important; border:1px solid #999; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
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
    const dateStr = phDate(t.created_at);
    const refStr = t.trn_number ? 'TXN-' + (t.created_at || '').slice(0,4) + '-' + String(t.trn_number).padStart(6,'0') : t.reference_id ? (t.reference_id).slice(0, 8).toUpperCase() : '-';
    return `<tr>
      <td class="mono">${dateStr}</td>
      <td class="mono">${refStr}</td>
      <td><span class="br-type-badge type-${t.type}">${typeLabel}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(t.description || typeLabel)}</td>
      <td class="right credit">${isBalanceCredit ? fmt(amt) : ''}</td>
      <td class="right debit">${isBalanceDebit ? fmt(amt) : ''}</td>
      <td class="right" style="font-weight:700">${affectsBalance ? fmt(runningBalance) : '—'}</td>
    </tr>`;
  }).join('');

  const content = BANK_REPORT_STYLE + `
  <div class="br-container">
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
      <div class="br-header-content">
        <div class="br-header-row">
          <div class="br-header-logo"><img src="${ORG_LOGO_URL}" alt="Logo"></div>
          <div>
            <div class="br-company-name">AYSIDEK LAB COOP</div>
            <div class="br-company-address">50 20 de Julio corner Bonifacio Sts, 4336</div>
          </div>
        </div>
        <div class="br-title-row">
          <div class="br-report-title">Statement of Account</div>
          <div class="br-report-meta">Member Since: ${(account.created_at || '').slice(0, 7) || '-'}</div>
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
            <div class="br-sum-value blue">${fmt(openingBalance)}</div>
          </div>
          <div class="br-summary-item green">
            <div class="br-sum-icon"><i class="fas fa-arrow-down"></i></div>
            <div class="br-sum-label">Total Deposits</div>
            <div class="br-sum-value green">+${fmt(totalCredits)}</div>
          </div>
          <div class="br-summary-item red">
            <div class="br-sum-icon"><i class="fas fa-arrow-up"></i></div>
            <div class="br-sum-label">Total Withdrawals</div>
            <div class="br-sum-value red">−${fmt(totalDebits)}</div>
          </div>
          <div class="br-summary-item gold">
            <div class="br-sum-icon"><i class="fas fa-landmark"></i></div>
            <div class="br-sum-label">Closing Balance</div>
            <div class="br-sum-value gold">${fmt(closingBalance)}</div>
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
                <td class="right">${fmt(openingBalance)}</td>
              </tr>
              ${txRows}
              <tr class="total-row">
                <td colspan="4"><strong>TOTAL</strong></td>
                <td class="right credit">${fmt(totalCredits)}</td>
                <td class="right debit">${fmt(totalDebits)}</td>
                <td class="right">${fmt(closingBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer Contact Bar -->
        <div class="br-footer-contact">
          <div class="br-footer-item"><i class="fas fa-globe"></i> https://icdec.ph</div>
          <div class="br-footer-item"><i class="fas fa-phone-alt"></i> 0949 860 2193</div>
          <div class="br-footer-item"><i class="far fa-envelope"></i> aysideklabcoop@gmail.com</div>
        </div>
        <div class="br-legal">
          <strong>Disclaimer:</strong> This statement is a computer-generated document and does not require a physical signature.<br>
          Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} &mdash; PH Time
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
    // Build print transaction rows with running balance
    let rb = openingBalance;
    const printTxRows = transactions.map(t => {
      const amt = Number(t.amount);
      const isCredit = BALANCE_CREDIT.includes(t.type);
      const isDebit = BALANCE_DEBIT.includes(t.type);
      const affects = isCredit || isDebit;
      if (isCredit) rb += amt;
      else if (isDebit) rb -= amt;
      const typeLabel = t.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const refStr = t.trn_number ? 'TXN-' + (t.created_at || '').slice(0,4) + '-' + String(t.trn_number).padStart(6,'0') : t.reference_id ? t.reference_id.slice(0, 8).toUpperCase() : '-';
      return `<tr>
        <td class="mono">${(t.created_at || '').slice(0, 10)}</td>
        <td class="mono">${refStr}</td>
        <td>${typeLabel}</td>
        <td style="max-width:160px">${h(t.description || typeLabel)}</td>
        <td class="right">${isCredit ? fmt(amt) : ''}</td>
        <td class="right">${isDebit ? fmt(amt) : ''}</td>
        <td class="right" style="font-weight:700">${affects ? fmt(rb) : '—'}</td>
      </tr>`;
    }).join('');

    const printContent = `
    <style>
      .print-info-grid { margin-bottom:1.5mm !important; gap:0.5mm 1.5mm !important; }
      .print-info-item { padding:0.4mm 1mm !important; font-size:6.5pt !important; }
      .print-summary-strip { margin-bottom:1.5mm !important; gap:1mm !important; }
      .print-summary-item { padding:0.6mm 1mm !important; font-size:5.5pt !important; }
      .print-summary-item .val { font-size:7.5pt !important; }
      table { margin-bottom:1.5mm !important; }
      thead th { padding:0.8mm 1mm !important; font-size:6pt !important; }
      tbody td { padding:0.4mm 1mm !important; font-size:6.5pt !important; }
      .print-company-header { margin-bottom:1.5mm !important; padding-bottom:1mm !important; }
      .print-company-header .report-title { font-size:9pt !important; }
      .print-header-logo { width:12mm !important; height:12mm !important; }
      .print-header-info .bank-name { font-size:12pt !important; }
      .print-header-info .bank-sub { font-size:7pt !important; }
      .report-meta-bar { font-size:6pt !important; margin-bottom:1.5mm !important; padding:0.3mm 0 !important; }
      .print-signature-block { margin-top:2mm !important; }
      .print-signature-block .sig-line { margin-top:8mm !important; }
      .print-signature-block .sig-label { font-size:6.5pt !important; }
      .disclaimer-text { font-size:5.5pt !important; margin-top:1.5mm !important; padding-top:0.8mm !important; }
    </style>
    <div class="print-info-grid">
      <div class="print-info-item"><span class="label">Account Holder</span><br>${h(account.child_name)}</div>
      <div class="print-info-item"><span class="label">Period</span><br>${fromDate} to ${toDate}</div>
      <div class="print-info-item"><span class="label">Member ID</span><br>${h(account.member_id)}</div>
      <div class="print-info-item"><span class="label">Account #</span><br>${h(account.regular_savings_number || account.member_id)}</div>
    </div>
    <div class="print-summary-strip">
      <div class="print-summary-item"><b>Opening Balance</b><div class="val blue">${fmt(openingBalance)}</div></div>
      <div class="print-summary-item"><b>Total Deposits</b><div class="val green">+${fmt(totalCredits)}</div></div>
      <div class="print-summary-item"><b>Total Withdrawals</b><div class="val red">−${fmt(totalDebits)}</div></div>
      <div class="print-summary-item"><b>Closing Balance</b><div class="val gold">${fmt(closingBalance)}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:80px">Date</th>
          <th style="width:70px">Ref#</th>
          <th style="width:90px">Type</th>
          <th>Description</th>
          <th class="right" style="width:100px">Deposits</th>
          <th class="right" style="width:100px">Withdrawals</th>
          <th class="right" style="width:100px">Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr style="font-weight:700;background:#f0f4f0">
          <td colspan="4">Opening Balance</td>
          <td></td><td></td>
          <td class="right">${fmt(openingBalance)}</td>
        </tr>
        ${printTxRows}
        <tr class="total-row">
          <td colspan="4"><b>TOTAL</b></td>
          <td class="right">${fmt(totalCredits)}</td>
          <td class="right">${fmt(totalDebits)}</td>
          <td class="right">${fmt(closingBalance)}</td>
        </tr>
      </tbody>
    </table>
    <div class="print-signature-block">
      <div><div class="sig-line"></div><div class="sig-label">Prepared by:</div></div>
      <div><div class="sig-line"></div><div class="sig-label">Reviewed by:</div></div>
      <div><div class="sig-line"></div><div class="sig-label">Approved by:</div></div>
    </div>`;
    return res.type('html').send(printLayout('Statement of Account', printContent, {
      subtitle: 'Official Bank Statement',
      dateRange: fromDate + ' to ' + toDate,
      pageMargin: '12mm 12mm 18mm 12mm',
      showSignatures: false,
      showDisclaimer: true,
      disclaimer: 'This statement is a computer-generated document and does not require a physical signature. For inquiries, contact AYSIDEK Lab Coop at (+63) 949-860-2193 or email aysideklabcoop@gmail.com'
    }));
  }

  if (req.query.format === 'csv' && account) {
    let csv = 'Date,Ref#,Type,Description,Deposit,Withdrawal,Balance\n';
    let rb = openingBalance;
    csv += `,,,Opening Balance,,,${fmt(rb)}\n`;
    transactions.forEach(t => {
      const amt = Number(t.amount);
      const isBalCredit = ['deposit','interest_credit','interest'].includes(t.type);
      const isBalDebit = ['withdrawal','loan_payment','auto_save','purchase','td_placement'].includes(t.type);
      const affectsBal = isBalCredit || isBalDebit;
      if (isBalCredit) rb += amt;
      else if (isBalDebit) rb -= amt;
      const typeLabel = t.type.replace(/_/g,' ');
            const csvRef = t.trn_number ? 'TXN-' + (t.created_at || '').slice(0,4) + '-' + String(t.trn_number).padStart(6,'0') : (t.reference_id || '-');
csv += `"${(t.created_at||'').slice(0,10)}","${csvRef}",${typeLabel},"${(t.description||'').replace(/"/g,'""')}",${isBalCredit ? amt.toFixed(2) : ''},${isBalDebit ? amt.toFixed(2) : ''},${affectsBal ? fmt(rb) : '—'}\n`;
    });
    csv += `,,,,${fmt(totalCredits)},${fmt(totalDebits)},${fmt(closingBalance)}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bank_statement_' + (account.member_id || 'export') + '_' + fromDate + '_' + toDate + '.csv"');
    return res.send(csv);
  }

  res.type('html').send(layout('Bank Statement', 'bank-statement', content, { subtitle: 'Professional bank-grade statement of account' }));
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
      <td class="right mono">${fmt(t.total)}</td>
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
      <div class="br-header-content">
        <div class="br-header-row">
          <div class="br-header-logo"><img src="${ORG_LOGO_URL}" alt="Logo"></div>
          <div>
            <div class="br-company-name">AYSIDEK LAB COOP</div>
            <div class="br-company-address">50 20 de Julio corner Bonifacio Sts, 4336</div>
          </div>
        </div>
        <div class="br-title-row">
          <div class="br-report-title">Daily Cash Position Report</div>
          <div class="br-report-meta">Report Date: ${date}</div>
        </div>
      </div>
      <div class="br-body">

        <!-- Cash Position Summary -->
        <div class="br-summary-grid" style="grid-template-columns:repeat(5,1fr)">
          <div class="br-summary-item blue">
            <div class="br-sum-icon"><i class="fas fa-wallet"></i></div>
            <div class="br-sum-label">Opening Cash</div>
            <div class="br-sum-value blue">${fmt(openingCash)}</div>
          </div>
          <div class="br-summary-item green">
            <div class="br-sum-icon"><i class="fas fa-arrow-down"></i></div>
            <div class="br-sum-label">Cash In (Collections)</div>
            <div class="br-sum-value green">+${fmt(cashIn)}</div>
          </div>
          <div class="br-summary-item red">
            <div class="br-sum-icon"><i class="fas fa-arrow-up"></i></div>
            <div class="br-sum-label">Cash Out (Disbursements)</div>
            <div class="br-sum-value red">−${fmt(cashOut)}</div>
          </div>
          <div class="br-summary-item gold">
            <div class="br-sum-icon"><i class="fas fa-chart-line"></i></div>
            <div class="br-sum-label">Net Cash Flow</div>
            <div class="br-sum-value" style="color:${netCashFlow >= 0 ? '#16a34a' : '#dc2626'}">${netCashFlow >= 0 ? '+' : '−'}${fmt(Math.abs(netCashFlow))}</div>
          </div>
          <div class="br-summary-item blue" style="background:#eff6ff">
            <div class="br-sum-icon"><i class="fas fa-landmark"></i></div>
            <div class="br-sum-label" style="font-weight:800">Closing Cash</div>
            <div class="br-sum-value blue">${fmt(closingCash)}</div>
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
                <td class="right">${fmt(txs.reduce((s,t) => s + Number(t.amount), 0))}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3"><strong>CASH IN (Collections)</strong></td>
                <td class="right credit">${fmt(cashIn)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3"><strong>CASH OUT (Disbursements)</strong></td>
                <td class="right debit">${fmt(cashOut)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3"><strong>NON-CASH ENTRIES</strong></td>
                <td class="right" style="color:#8b5cf6;font-weight:700">${fmt(nonCash)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer Contact Bar -->
        <div class="br-footer-contact">
          <div class="br-footer-item"><i class="fas fa-globe"></i> https://icdec.ph</div>
          <div class="br-footer-item"><i class="fas fa-phone-alt"></i> 0949 860 2193</div>
          <div class="br-footer-item"><i class="far fa-envelope"></i> aysideklabcoop@gmail.com</div>
        </div>
        <div class="br-legal">
          <strong>Disclaimer:</strong> This report reflects the daily cash position based on posted transactions. Non-cash entries (interest credits, rewards) are shown separately and do not affect the cash balance.
        </div>
      </div>
    </div>
  </div>`;

  if (req.query.print === '1') {
    const printContent = `
    <div style="display:flex;justify-content:space-between;margin-bottom:2mm;font-size:8pt;color:#555">
      <span><b>Report Date:</b> ${date}</span>
      <span><b>Generated:</b> ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="print-summary-strip">
      <div class="print-summary-item"><b>Opening Cash</b><div class="val blue">${fmt(openingCash)}</div></div>
      <div class="print-summary-item"><b>Cash In</b><div class="val green">+${fmt(cashIn)}</div></div>
      <div class="print-summary-item"><b>Cash Out</b><div class="val red">−${fmt(cashOut)}</div></div>
      <div class="print-summary-item"><b>Net Cash Flow</b><div class="val" style="color:${netCashFlow >= 0 ? '#16a34a' : '#dc2626'}">${netCashFlow >= 0 ? '+' : '−'}${fmt(Math.abs(netCashFlow))}</div></div>
      <div class="print-summary-item" style="background:#f0f4ff"><b style="font-weight:800">Closing Cash</b><div class="val blue">${fmt(closingCash)}</div></div>
    </div>
    <table>
      <thead><tr><th>Transaction Type</th><th>Category</th><th class="right">Count</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${typeRows}
        <tr class="total-row"><td colspan="2"><b>TOTAL TRANSACTIONS</b></td><td class="right">${txs.length}</td><td class="right">${fmt(txs.reduce((s,t) => s + Number(t.amount), 0))}</td></tr>
      </tbody>
      <tfoot>
        <tr class="total-row"><td colspan="3" style="color:#16a34a"><b>CASH IN (Collections)</b></td><td class="right" style="color:#16a34a;font-weight:700">${fmt(cashIn)}</td></tr>
        <tr class="total-row"><td colspan="3" style="color:#dc2626"><b>CASH OUT (Disbursements)</b></td><td class="right" style="color:#dc2626;font-weight:700">${fmt(cashOut)}</td></tr>
        <tr class="total-row"><td colspan="3" style="color:#8b5cf6"><b>NON-CASH ENTRIES</b></td><td class="right" style="color:#8b5cf6;font-weight:700">${fmt(nonCash)}</td></tr>
      </tfoot>
    </table>
    <div class="print-signature-block" style="margin-top:4mm">
      <div><div class="sig-line"></div><div class="sig-label">Prepared by:</div></div>
      <div><div class="sig-line"></div><div class="sig-label">Reviewed by:</div></div>
      <div><div class="sig-line"></div><div class="sig-label">Approved by:</div></div>
    </div>`;
    return res.type('html').send(printLayout('Daily Cash Position Report', printContent, {
      subtitle: 'CASH POSITION REPORT',
      dateRange: date,
      orientation: 'landscape',
      showSignatures: false,
      showDisclaimer: true,
      disclaimer: 'Non-cash entries (interest credits, rewards) are shown separately and do not affect the cash balance. This report reflects the daily cash position based on posted transactions.'
    }));
  }

  if (req.query.format === 'csv') {
    let csv = 'Daily Cash Position Report,' + date + '\n\n';
    csv += 'Opening Cash,' + fmt(openingCash) + '\n';
    csv += 'Cash In (Collections),' + '+' + fmt(cashIn) + '\n';
    csv += 'Cash Out (Disbursements),' + '−' + fmt(cashOut) + '\n';
    csv += 'Net Cash Flow,' + (netCashFlow >= 0 ? '+' : '−') + fmt(Math.abs(netCashFlow)) + '\n';
    csv += 'Closing Cash,' + fmt(closingCash) + '\n\n';
    csv += 'Type,Category,Count,Amount\n';
    Object.keys(byType).sort().forEach(type => {
      const t = byType[type];
      const isCashIn = ['deposit','fee','penalty','loan_payment','interest_income'].includes(type);
      const isCashOut = ['withdrawal','loan_disbursement','td_maturity'].includes(type);
      const cat = isCashIn ? 'Cash In' : isCashOut ? 'Cash Out' : 'Non-Cash';
      csv += `${type},${cat},${t.count},${fmt(t.total)}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cash_position_' + date + '.csv"');
    return res.send(csv);
  }

  res.type('html').send(layout('Daily Cash Position', 'bank-cash-position', content, { subtitle: 'Professional bank cash position report' }));
}));

module.exports = router;
