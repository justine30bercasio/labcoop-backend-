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
const { layout, printLayout, h, reportTable, reportSection, reportStats, fmt, fmtTrn, ROLE_LEVELS } = require('./admin-lib');

const requireRole = (minLevel) => (req, res, next) => {
  if (!req.session || !req.session.adminId) return res.redirect('/admin/login');
  const level = ROLE_LEVELS[req.session.adminRole] ?? 0;
  if (level < minLevel) return res.status(403).send('Forbidden');
  next();
};

// ── Shared Styles for Bank Reports ──
const BANK_REPORT_STYLE = `
<style>
  .br-container { max-width:900px; margin:0 auto; }
  .br-card { background:var(--card); border:1px solid var(--border); border-radius:12px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); overflow:hidden; }
  .br-header { background:linear-gradient(135deg,#0d2818,#1a5c2a); color:#fff; padding:20px 28px; }
  .br-header .br-bank-name { font-size:20px; font-weight:800; letter-spacing:1px; }
  .br-header .br-bank-sub { font-size:11px; opacity:0.8; margin-top:2px; }
  .br-header .br-report-title { font-size:13px; opacity:0.9; margin-top:6px; text-transform:uppercase; letter-spacing:0.5px; }
  .br-body { padding:24px 28px; }
  .br-member-info { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid var(--border); }
  .br-member-info .br-field { display:flex; flex-direction:column; }
  .br-member-info .br-label { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600; }
  .br-member-info .br-value { font-size:13px; font-weight:600; color:var(--text); margin-top:1px; }
  .br-summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
  .br-summary-item { background:var(--bg); border-radius:8px; padding:12px 16px; text-align:center; border:1px solid var(--border); }
  .br-summary-item .br-sum-label { font-size:9px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted); font-weight:600; }
  .br-summary-item .br-sum-value { font-size:18px; font-weight:800; font-family:var(--mono); margin-top:2px; }
  .br-summary-item .br-sum-value.green { color:#16a34a; }
  .br-summary-item .br-sum-value.red { color:#dc2626; }
  .br-summary-item .br-sum-value.blue { color:#2563eb; }
  .br-table { width:100%; border-collapse:collapse; font-size:12px; }
  .br-table th { background:var(--bg); font-size:10px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted); font-weight:600; padding:8px 12px; text-align:left; border-bottom:2px solid var(--border); }
  .br-table th.right { text-align:right; }
  .br-table td { padding:8px 12px; border-bottom:1px solid var(--border); font-size:12px; }
  .br-table td.right { text-align:right; font-family:var(--mono); font-weight:600; }
  .br-table td.mono { font-family:var(--mono); font-size:11px; }
  .br-table tr:hover td { background:rgba(0,0,0,0.02); }
  .br-table tr.total-row td { font-weight:700; background:var(--bg); border-top:2px solid var(--accent); font-size:12px; }
  .br-table .credit { color:#16a34a; }
  .br-table .debit { color:#dc2626; }
  .br-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:16px; }
  .br-toolbar .field { display:flex; flex-direction:column; }
  .br-toolbar .field label { font-size:10px; font-weight:600; color:var(--text-muted); margin-bottom:2px; text-transform:uppercase; letter-spacing:0.3px; }
  .br-toolbar .field input, .br-toolbar .field select { padding:7px 12px; border:2px solid var(--border); border-radius:6px; font-size:12px; outline:none; background:var(--card); }
  .br-toolbar .field input:focus, .br-toolbar .field select:focus { border-color:var(--accent); }
  .br-cert { max-width:680px; margin:0 auto; background:var(--card); border:2px solid var(--accent); border-radius:12px; overflow:hidden; }
  .br-cert-header { background:var(--accent); color:#fff; text-align:center; padding:20px; }
  .br-cert-header h2 { font-size:18px; font-weight:800; letter-spacing:2px; margin:0; }
  .br-cert-header .br-cert-sub { font-size:11px; opacity:0.85; margin-top:3px; }
  .br-cert-body { padding:28px 32px; }
  .br-cert-body .br-cert-greeting { font-size:12px; color:var(--text-muted); margin-bottom:16px; }
  .br-cert-body .br-cert-name { font-size:22px; font-weight:800; color:var(--text); margin-bottom:16px; }
  .br-cert-body .br-cert-amount { text-align:center; font-size:28px; font-weight:800; color:var(--accent); font-family:var(--mono); padding:16px; border:2px dashed var(--border); border-radius:8px; margin-bottom:16px; }
  .br-cert-body .br-cert-words { text-align:center; font-size:13px; color:var(--text-muted); margin-bottom:20px; font-style:italic; }
  .br-cert-body .br-cert-details { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:20px; }
  .br-cert-body .br-cert-details .br-field { display:flex; flex-direction:column; }
  .br-cert-body .br-cert-details .br-label { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600; }
  .br-cert-body .br-cert-details .br-value { font-size:13px; font-weight:600; margin-top:1px; }
  .br-cert-body .br-cert-footer { display:flex; justify-content:space-between; padding-top:16px; border-top:1px solid var(--border); }
  .br-cert-body .br-cert-footer .br-signature { text-align:center; }
  .br-cert-body .br-cert-footer .br-signature .br-sig-line { width:180px; border-top:1px solid #000; margin:32px auto 4px auto; }
  .br-cert-body .br-cert-footer .br-signature .br-sig-label { font-size:10px; color:var(--text-muted); }
  .br-legal { font-size:9px; color:var(--text-muted); text-align:center; margin-top:12px; line-height:1.4; }
  @media print {
    .br-toolbar, .br-toolbar *, .btn, button, input, select, .sidebar, .sidebar *, .page-header { display:none !important; }
    .br-card { break-inside:avoid; border:1px solid #000; box-shadow:none; }
    .br-header { background:#0d2818 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-summary-item { border:1px solid #999; }
    .br-cert { border:2px solid #000; }
    .br-cert-header { background:#2E7D32 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-table th { background:#f0f0f0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .br-table tr.total-row td { background:#e8e8e8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
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
      const balBefore = await one(`
        SELECT COALESCE(SUM(CASE WHEN type IN ('deposit','interest_credit','interest','interest_income','loan_disbursement','td_maturity','reward') THEN amount
          WHEN type IN ('withdrawal','fee','penalty','loan_payment','auto_save','purchase','td_placement') THEN -amount ELSE 0 END), 0) as bal
        FROM transactions WHERE account_id = $1 AND DATE(created_at) < $2
      `, [account.account_id, fromDate]);
      openingBalance = Number(balBefore?.bal || 0);

      // Get transactions for the period
      transactions = await sql(`
        SELECT * FROM transactions
        WHERE account_id = $1 AND DATE(created_at) >= $2 AND DATE(created_at) <= $3
        ORDER BY created_at ASC
      `, [account.account_id, fromDate, toDate]);

      // Calculate totals using FIXED classification
      totalCredits = transactions.filter(t =>
        ['deposit','interest_credit','interest','interest_income','loan_disbursement','td_maturity','reward'].includes(t.type)
      ).reduce((s, t) => s + Number(t.amount), 0);

      totalDebits = transactions.filter(t =>
        ['withdrawal','fee','penalty','loan_payment','auto_save','purchase','td_placement'].includes(t.type)
      ).reduce((s, t) => s + Number(t.amount), 0);

      closingBalance = openingBalance + totalCredits - totalDebits;
    }
  }

  // Build transaction rows
  let runningBalance = openingBalance;
  const txRows = transactions.map(t => {
    const amt = Number(t.amount);
    const isCredit = ['deposit','interest_credit','interest','interest_income','loan_disbursement','td_maturity','reward'].includes(t.type);
    if (isCredit) runningBalance += amt; else runningBalance -= amt;
    const typeLabel = t.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const dateStr = (t.created_at || '').slice(0, 10);
    const refStr = t.reference_id ? (t.reference_id).slice(0, 8).toUpperCase() : '-';
    return `<tr>
      <td class="mono">${dateStr}</td>
      <td class="mono">${refStr}</td>
      <td><span class="br-type-badge type-${t.type}">${typeLabel}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(t.description || typeLabel)}</td>
      <td class="right credit">${isCredit ? '₱' + amt.toFixed(2) : ''}</td>
      <td class="right debit">${!isCredit ? '₱' + amt.toFixed(2) : ''}</td>
      <td class="right" style="font-weight:700">₱${runningBalance.toFixed(2)}</td>
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
      <div class="br-body" style="text-align:center;padding:60px">
        <i class="fas fa-hand-point-left" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i>
        <h3 style="color:var(--text-muted);font-weight:400">Select a member to view their bank statement</h3>
      </div>
    </div>` : account ? `
    <!-- Bank Statement Header -->
    <div class="br-card">
      <div class="br-header">
        <div class="br-bank-name">LABCOOP SAVINGS BANK</div>
        <div class="br-bank-sub">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000</div>
        <div class="br-report-title">Statement of Account</div>
      </div>
      <div class="br-body">
        <!-- Member Information -->
        <div class="br-member-info">
          <div class="br-field">
            <span class="br-label">Account Holder</span>
            <span class="br-value">${h(account.child_name)}</span>
          </div>
          <div class="br-field">
            <span class="br-label">Member ID</span>
            <span class="br-value">${h(account.member_id)}</span>
          </div>
          <div class="br-field">
            <span class="br-label">Account Number</span>
            <span class="br-value">${h(account.regular_savings_number || account.member_id)}</span>
          </div>
          <div class="br-field">
            <span class="br-label">Statement Period</span>
            <span class="br-value">${fromDate} to ${toDate}</span>
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="br-summary-grid">
          <div class="br-summary-item">
            <div class="br-sum-label">Opening Balance</div>
            <div class="br-sum-value blue">₱${openingBalance.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #16a34a">
            <div class="br-sum-label">Total Deposits</div>
            <div class="br-sum-value green">₱${totalCredits.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #dc2626">
            <div class="br-sum-label">Total Withdrawals/Charges</div>
            <div class="br-sum-value red">₱${totalDebits.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #2563eb">
            <div class="br-sum-label">Closing Balance</div>
            <div class="br-sum-value blue">₱${closingBalance.toFixed(2)}</div>
          </div>
        </div>

        <!-- Transactions Table -->
        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px">Transaction History</h4>
        ${transactions.length === 0 ? '<p style="text-align:center;padding:24px;color:var(--text-muted)">No transactions for this period.</p>' : `
        <table class="br-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref #</th>
              <th>Type</th>
              <th>Description</th>
              <th class="right">Deposits (₱)</th>
              <th class="right">Withdrawals (₱)</th>
              <th class="right">Balance (₱)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="font-weight:600;background:var(--bg)">
              <td colspan="4">Opening Balance</td>
              <td></td><td></td>
              <td class="right" style="font-weight:700">₱${openingBalance.toFixed(2)}</td>
            </tr>
            ${txRows}
            <tr class="total-row">
              <td colspan="4"><strong>TOTAL</strong></td>
              <td class="right credit">₱${totalCredits.toFixed(2)}</td>
              <td class="right debit">₱${totalDebits.toFixed(2)}</td>
              <td class="right" style="color:#2563eb">₱${closingBalance.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>`}

        <div class="br-legal">
          This statement is a computer-generated document and does not require a physical signature.<br>
          For inquiries, please contact LabCoop Savings Bank at (02) 1234-5678 or email support@labcoop.com.<br>
          Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>` : `
    <div class="br-card">
      <div class="br-body" style="text-align:center;padding:60px">
        <i class="fas fa-user-slash" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i>
        <h3 style="color:var(--text-muted);font-weight:400">Member not found or inactive</h3>
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
          const isCredit = ['deposit','interest_credit','interest','interest_income','loan_disbursement','td_maturity','reward'].includes(t.type);
          const typeLabel = t.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `<tr>
            <td>${(t.created_at||'').slice(0,10)}</td>
            <td class="mono">${t.reference_id ? t.reference_id.slice(0,8).toUpperCase() : '-'}</td>
            <td>${typeLabel}</td>
            <td style="max-width:100px">${h(t.description || typeLabel)}</td>
            <td class="num">${isCredit ? '₱' + amt.toFixed(2) : ''}</td>
            <td class="num">${!isCredit ? '₱' + amt.toFixed(2) : ''}</td>
            <td class="num">₱${(function(){ let b=openingBalance; transactions.slice(0,transactions.indexOf(t)+1).forEach(tx => { const a=Number(tx.amount); const ic=['deposit','interest_credit','interest','interest_income','loan_disbursement','td_maturity','reward'].includes(tx.type); if(ic) b+=a; else b-=a; }); return b.toFixed(2); })()}</td>
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
      const isCredit = ['deposit','interest_credit','interest','interest_income','loan_disbursement','td_maturity','reward'].includes(t.type);
      if (isCredit) rb += amt; else rb -= amt;
      const typeLabel = t.type.replace(/_/g,' ');
      csv += `"${(t.created_at||'').slice(0,10)}","${t.reference_id ? t.reference_id.slice(0,8).toUpperCase() : '-'}",${typeLabel},"${(t.description||'').replace(/"/g,'""')}",${isCredit ? amt.toFixed(2) : ''},${!isCredit ? amt.toFixed(2) : ''},₱${rb.toFixed(2)}\n`;
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
    <div class="br-card"><div class="br-body" style="text-align:center;padding:60px">
      <i class="fas fa-hand-point-left" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i>
      <h3 style="color:var(--text-muted);font-weight:400">Select a member to issue a certificate</h3>
    </div></div>` : account ? `
    <div class="br-cert">
      <div class="br-cert-header">
        <h2>CERTIFICATE OF DEPOSIT BALANCE</h2>
        <div class="br-cert-sub">LabCoop Savings Bank ● Member Savings Account</div>
      </div>
      <div class="br-cert-body">
        <div class="br-cert-greeting">TO WHOM IT MAY CONCERN:</div>
        <div class="br-cert-name">${h(account.child_name)}</div>
        <div class="br-cert-amount">₱ ${balance.toFixed(2)}</div>
        <div class="br-cert-words">${balanceWords}</div>
        <div class="br-cert-details">
          <div class="br-field"><span class="br-label">Member ID</span><span class="br-value">${h(account.member_id)}</span></div>
          <div class="br-field"><span class="br-label">Account Number</span><span class="br-value">${h(account.regular_savings_number || account.member_id)}</span></div>
          <div class="br-field"><span class="br-label">Date Issued</span><span class="br-value">${today}</span></div>
          <div class="br-field"><span class="br-label">Account Status</span><span class="br-value" style="color:${account.is_active == 1 ? '#16a34a' : '#dc2626'}">${account.is_active == 1 ? 'Active' : 'Inactive'}</span></div>
          <div class="br-field"><span class="br-label">Date Opened</span><span class="br-value">${(account.created_at || '').slice(0, 10) || '-'}</span></div>
          <div class="br-field"><span class="br-label">Interest Rate</span><span class="br-value">${account.savings_product_id ? '2% per month' : 'Standard Rate'}</span></div>
        </div>
        <div class="br-cert-footer">
          <div class="br-signature">
            <div class="br-sig-line"></div>
            <div class="br-sig-label">Branch Manager</div>
          </div>
          <div class="br-signature">
            <div class="br-sig-line"></div>
            <div class="br-sig-label">Account Officer</div>
          </div>
          <div class="br-signature">
            <div class="br-sig-line"></div>
            <div class="br-sig-label">Member Services</div>
          </div>
        </div>
        <div class="br-legal" style="margin-top:20px">
          This certificate is issued upon request and reflects the savings balance as of the date indicated.<br>
          LabCoop Savings Bank ● 123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000
        </div>
      </div>
    </div>` : `
    <div class="br-card"><div class="br-body" style="text-align:center;padding:60px">
      <i class="fas fa-user-slash" style="font-size:48px;opacity:0.3;display:block;margin-bottom:12px"></i>
      <h3 style="color:var(--text-muted);font-weight:400">Member not found or inactive</h3>
    </div></div>`}
  </div>`;

  if (req.query.print === '1' && account) {
    const printContent = `
    <div style="text-align:center;margin-bottom:4mm">
      <h2 style="font-size:14pt;font-weight:800;letter-spacing:2px">LABCOOP SAVINGS BANK</h2>
      <p style="font-size:9pt">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000</p>
    </div>
    <div style="text-align:center;margin:6mm 0;border:2px solid #000;padding:20px 0">
      <h1 style="font-size:16pt;font-weight:800;letter-spacing:2px;margin-bottom:2mm">CERTIFICATE OF DEPOSIT BALANCE</h1>
      <p style="font-size:9pt;color:#555">Member Savings Account</p>
    </div>
    <p style="margin-bottom:3mm">TO WHOM IT MAY CONCERN:</p>
    <p style="font-size:13pt;font-weight:700;margin-bottom:3mm">${h(account.child_name)}</p>
    <p style="font-size:18pt;font-weight:800;text-align:center;padding:4mm;border:2px dashed #000;margin-bottom:2mm">₱ ${balance.toFixed(2)}</p>
    <p style="font-size:10pt;text-align:center;font-style:italic;margin-bottom:4mm">${balanceWords}</p>
    <table style="width:100%;font-size:9pt;margin-bottom:4mm">
      <tr><td style="width:50%"><b>Member ID:</b> ${h(account.member_id)}</td><td><b>Date Issued:</b> ${today}</td></tr>
      <tr><td><b>Account #:</b> ${h(account.regular_savings_number || account.member_id)}</td><td><b>Status:</b> ${account.is_active == 1 ? 'Active' : 'Inactive'}</td></tr>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:8mm">
      <div style="text-align:center;width:30%"><div style="border-top:1px solid #000;margin-bottom:1mm;padding-top:20mm"></div><div style="font-size:8pt">Branch Manager</div></div>
      <div style="text-align:center;width:30%"><div style="border-top:1px solid #000;margin-bottom:1mm;padding-top:20mm"></div><div style="font-size:8pt">Account Officer</div></div>
      <div style="text-align:center;width:30%"><div style="border-top:1px solid #000;margin-bottom:1mm;padding-top:20mm"></div><div style="font-size:8pt">Member Services</div></div>
    </div>
    <div style="text-align:center;font-size:7pt;color:#666;margin-top:4mm;border-top:1px solid #ccc;padding-top:2mm">
      This certificate is issued upon request and reflects the savings balance as of the date indicated.<br>
      LabCoop Savings Bank ● 123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000
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
        <div class="br-bank-name">LABCOOP SAVINGS BANK</div>
        <div class="br-bank-sub">123 Rizal Street, Barangay Poblacion ● TIN: 123-456-789-000</div>
        <div class="br-report-title">Daily Cash Position Report</div>
      </div>
      <div class="br-body">
        <div style="margin-bottom:16px;font-size:11px;color:var(--text-muted)">
          <strong>Report Date:</strong> ${date}
        </div>

        <!-- Cash Position Summary -->
        <div class="br-summary-grid" style="grid-template-columns:repeat(5,1fr)">
          <div class="br-summary-item" style="border-left:3px solid #2563eb">
            <div class="br-sum-label">Opening Cash</div>
            <div class="br-sum-value blue">₱${openingCash.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #16a34a">
            <div class="br-sum-label">Cash In (Collections)</div>
            <div class="br-sum-value green">+₱${cashIn.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #dc2626">
            <div class="br-sum-label">Cash Out (Disbursements)</div>
            <div class="br-sum-value red">-₱${cashOut.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #f59e0b">
            <div class="br-sum-label">Net Cash Flow</div>
            <div class="br-sum-value" style="color:${netCashFlow >= 0 ? '#16a34a' : '#dc2626'}">${netCashFlow >= 0 ? '+' : ''}₱${netCashFlow.toFixed(2)}</div>
          </div>
          <div class="br-summary-item" style="border-left:3px solid #2563eb;background:#eff6ff">
            <div class="br-sum-label" style="font-weight:800">Closing Cash</div>
            <div class="br-sum-value blue" style="font-size:22px">₱${closingCash.toFixed(2)}</div>
          </div>
        </div>

        <!-- Breakdown Table -->
        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin:16px 0 8px 0">Transaction Breakdown</h4>
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
              <td class="right" style="color:#16a34a">₱${cashIn.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3"><strong>CASH OUT (Disbursements)</strong></td>
              <td class="right" style="color:#dc2626">₱${cashOut.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3"><strong>NON-CASH ENTRIES</strong></td>
              <td class="right" style="color:#8b5cf6">₱${nonCash.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="br-legal">
          This report reflects the daily cash position based on posted transactions.<br>
          Non-cash entries (interest credits, rewards) are shown separately and do not affect the cash balance.<br>
          Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  </div>`;

  if (req.query.print === '1') {
    const printContent = `
    <div style="margin-bottom:3mm">
      <table style="width:100%;font-size:9pt">
        <tr><td><b>Report Date:</b> ${date}</td><td style="text-align:right"><b>Opening Cash:</b> ₱${openingCash.toFixed(2)}</td></tr>
      </table>
    </div>
    <div style="display:flex;gap:2mm;margin-bottom:3mm">
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Cash In</b><br>₱${cashIn.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Cash Out</b><br>₱${cashOut.toFixed(2)}</div>
      <div style="flex:1;border:1px solid #999;padding:2mm;text-align:center"><b>Net Flow</b><br>${netCashFlow >= 0 ? '+' : ''}₱${netCashFlow.toFixed(2)}</div>
      <div style="flex:1;border:2px solid #000;padding:2mm;text-align:center;font-weight:700"><b>Closing Cash</b><br>₱${closingCash.toFixed(2)}</div>
    </div>
    <table>
      <thead><tr><th>Type</th><th>Category</th><th class="num">Count</th><th class="num">Amount</th></tr></thead>
      <tbody>${typeRows}</tbody>
      <tfoot>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="2">TOTAL</td><td class="num">${txs.length}</td><td class="num">₱${txs.reduce((s,t) => s + Number(t.amount), 0).toFixed(2)}</td></tr>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="3">CASH IN (Collections)</td><td class="num" style="color:#16a34a">₱${cashIn.toFixed(2)}</td></tr>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="3">CASH OUT (Disbursements)</td><td class="num" style="color:#dc2626">₱${cashOut.toFixed(2)}</td></tr>
        <tr style="font-weight:700;background:#e8e8e8"><td colspan="3">NON-CASH ENTRIES</td><td class="num" style="color:#8b5cf6">₱${nonCash.toFixed(2)}</td></tr>
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
    csv += 'Cash In (Collections),₱' + cashIn.toFixed(2) + '\n';
    csv += 'Cash Out (Disbursements),₱' + cashOut.toFixed(2) + '\n';
    csv += 'Net Cash Flow,₱' + netCashFlow.toFixed(2) + '\n';
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
