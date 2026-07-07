const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { layout, printLayout } = require('./admin-lib');
const notifs = require('../services/notifications');
const FCM_ENABLED = !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

const _p = (...p) => p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
const sql = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows);
const one = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows[0]);
const fmt = v => '₱' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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



// ═══════════════════════════════════════════════════════════════
// 1. CHART OF ACCOUNTS UI
// ═══════════════════════════════════════════════════════════════
router.get('/gl/accounts', requireRole(2), asyncHandler(async (req, res) => {
  const accounts = await sql('SELECT * FROM gl_accounts ORDER BY code');
  const types = ['asset', 'liability', 'equity', 'income', 'expense'];
  const typeColors = { asset: 'badge-red', liability: 'badge-blue', equity: 'badge-orange', income: 'badge-green', expense: 'badge-purple' };
  const q = req.query;
  const toast = q.created ? 'success:GL account created.'
    : q.updated ? 'success:GL account updated.'
    : q.deactivated ? 'success:GL account deactivated.'
    : q.activated ? 'success:GL account reactivated.'
    : q.error ? 'error:' + q.error : '';
  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4CB;</div><div class="stat-value">${accounts.length}</div><div class="stat-label">Total Accounts</div></div>
    ${types.map(t => `<div class="stat-card"><div class="stat-value" style="font-size:18px">${accounts.filter(a => a.type === t).length}</div><div class="stat-label" style="text-transform:capitalize">${t}</div></div>`).join('')}
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x1F4CB; Chart of Accounts</h3>
      <div><a href="#add-gl" class="btn btn-primary btn-sm">&#x2795; New Account</a></div>
    </div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Code</th><th>Account Name</th><th>Type</th><th>Status</th><th></th></tr>
      ${accounts.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No GL accounts defined</td></tr>' :
        accounts.map(a => `<tr>
          <td class="mono"><b>${a.code}</b></td>
          <td>${a.name}</td>
          <td><span class="badge ${typeColors[a.type] || 'badge-gray'}">${a.type}</span></td>
          <td>${a.is_active ? '<span style="color:#16a34a;font-weight:600">&#x2705; Active</span>' : '<span style="color:#dc2626;font-weight:600">&#x274C; Inactive</span>'}</td>
          <td style="display:flex;gap:6px">
            <a href="#edit-gl-${a.code}" class="btn btn-secondary btn-xs">&#x270F; Edit</a>
            <a href="/admin/gl/accounts/toggle/${a.code}" class="btn ${a.is_active ? 'btn-danger' : 'btn-secondary'} btn-xs" data-confirm="${a.is_active ? 'Deactivate' : 'Activate'} ${a.name}?">${a.is_active ? 'Deactivate' : 'Activate'}</a>
          </td>
        </tr>`).join('')}
    </table></div>
  </div>

  <div id="add-gl" class="modal-overlay">
  <div class="modal" style="max-width:420px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New GL Account</h2>
  <form method="post" action="/admin/gl/accounts/create">
    <label for="gl_code">Account Code</label>
    <input type="text" id="gl_code" name="code" placeholder="e.g. 1300" required>
    <label for="gl_name">Account Name</label>
    <input type="text" id="gl_name" name="name" placeholder="e.g. Accounts Receivable" required>
    <label for="gl_type">Type</label>
    <select id="gl_type" name="type" required>
      <option value="">-- Select type --</option>
      <option value="asset">Asset</option>
      <option value="liability">Liability</option>
      <option value="equity">Equity</option>
      <option value="income">Income</option>
      <option value="expense">Expense</option>
    </select>
    <button type="submit" class="btn btn-primary">&#x2795; Create Account</button>
  </form>
  </div>
  </div>

  ${accounts.map(a => `
  <div id="edit-gl-${a.code}" class="modal-overlay">
  <div class="modal" style="max-width:420px">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${a.code} — ${a.name}</h2>
  <form method="post" action="/admin/gl/accounts/update/${a.code}">
    <label for="gen_${a.code}">Account Code</label>
    <input type="text" id="gen_${a.code}" name="code" value="${a.code}" required>
    <label for="gn_${a.code}">Account Name</label>
    <input type="text" id="gn_${a.code}" name="name" value="${a.name}" required>
    <label for="gt_${a.code}">Type</label>
    <select id="gt_${a.code}" name="type" required>
      ${types.map(t => `<option value="${t}" ${a.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
    </select>
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}`;
  res.type('html').send(layout('Chart of Accounts', 'gl-accounts', content, { subtitle: 'Manage GL account codes and types', toast }));
}));

router.post('/gl/accounts/create', requireRole(3), asyncHandler(async (req, res) => {
  const { code, name, type } = req.body;
  if (!code || !name || !type) return res.redirect('/admin/gl/accounts?error=All+fields+required');
  const exists = await one('SELECT * FROM gl_accounts WHERE code = $1', [code]);
  if (exists) return res.redirect('/admin/gl/accounts?error=Code+already+exists');
  await store.query('INSERT INTO gl_accounts (code, name, type, is_active) VALUES ($1,$2,$3,1)', [code.toUpperCase(), name, type]);
  res.redirect('/admin/gl/accounts?created=ok');
}));

router.post('/gl/accounts/update/:code', requireRole(3), asyncHandler(async (req, res) => {
  const { code, name, type } = req.body;
  if (!code || !name || !type) return res.redirect('/admin/gl/accounts?error=All+fields+required');
  const dup = await one('SELECT * FROM gl_accounts WHERE code = $1 AND code != $2', [code, req.params.code]);
  if (dup) return res.redirect('/admin/gl/accounts?error=Code+already+taken');
  await store.query('UPDATE gl_accounts SET code=$1, name=$2, type=$3 WHERE code=$4', [code.toUpperCase(), name, type, req.params.code]);
  res.redirect('/admin/gl/accounts?updated=ok');
}));

router.get('/gl/accounts/toggle/:code', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE gl_accounts SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE code = $1', [req.params.code]);
  res.redirect('/admin/gl/accounts');
}));

// ═══════════════════════════════════════════════════════════════
// 2. TELLER CASH MANAGEMENT
// ═══════════════════════════════════════════════════════════════
router.get('/teller-cash', requireRole(2), asyncHandler(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const tellers = await sql('SELECT * FROM admin_users WHERE role IN ($1,$2) ORDER BY display_name', ['teller', 'manager']);
  const cashFunds = await sql(`SELECT tc.*, au.display_name as teller_name, b.name as branch_name
    FROM teller_cash tc LEFT JOIN admin_users au ON tc.teller_id = au.admin_id
    LEFT JOIN branches b ON tc.branch_id = b.branch_id ORDER BY tc.created_at DESC`);
  const openFunds = cashFunds.filter(f => f.status === 'open');
  const q = req.query;
  const toast = q.opened ? 'success:Cash fund opened.'
    : q.closed ? 'success:Cash fund closed successfully.'
    : q.updated ? 'success:Cash fund updated.'
    : q.error ? 'error:' + q.error : '';
  const content = `
  <style>
  .tf-balanced { color:#16a34a;font-weight:700 }
  .tf-short { color:#dc2626;font-weight:700 }
  .tf-over { color:#f59e0b;font-weight:700 }
  </style>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F3E6;</div><div class="stat-value">${openFunds.length}</div><div class="stat-label">Open Funds</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4B0;</div><div class="stat-value">${fmt(openFunds.reduce((s,f) => s + Number(f.current_balance), 0))}</div><div class="stat-label">Total Cash</div></div>
  </div>

  <div class="card">
    <div class="card-header"><h3>&#x1F4B0; Cash Funds</h3><div><a href="#open-fund" class="btn btn-primary btn-sm">&#x2795; Open Fund</a></div></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Teller</th><th>Branch</th><th>Date</th><th class="num">Opening</th><th class="num">Current</th><th>Status</th><th></th></tr>
      ${cashFunds.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No cash funds yet</td></tr>' :
        cashFunds.map(f => {
          const diff = Number(f.current_balance) - Number(f.opening_balance);
          const statusClass = diff === 0 ? 'tf-balanced' : diff < 0 ? 'tf-short' : 'tf-over';
          return `<tr>
            <td>${f.teller_name || f.teller_id.slice(0,8)}</td>
            <td>${f.branch_name || 'Main'}</td>
            <td class="mono" style="font-size:11px">${(f.date||'').slice(0,10)}</td>
            <td class="num mono">${fmt(f.opening_balance)}</td>
            <td class="num mono">${fmt(f.current_balance)}</td>
            <td><span class="badge ${f.status === 'open' ? 'badge-green' : 'badge-gray'}">${f.status}</span></td>
            <td>${f.status === 'open' ? `<a href="/admin/teller-cash/close/${f.cash_id}" class="btn btn-sm btn-danger" data-confirm="Close this cash fund?">Close</a>` : `<span class="mono" style="font-size:10px;color:var(--text-muted);">${(f.closed_at||'').slice(0,16).replace('T',' ')}</span>`}</td>
          </tr>`;
        }).join('')}
    </table></div>
  </div>

  <div id="open-fund" class="modal-overlay">
  <div class="modal" style="max-width:420px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; Open Cash Fund</h2>
  <form method="post" action="/admin/teller-cash/open">
    <label for="tf_teller">Teller</label>
    <select id="tf_teller" name="teller_id" required>
      <option value="">-- Select teller --</option>
      ${tellers.map(t => `<option value="${t.admin_id}">${t.display_name || t.username}</option>`).join('')}
    </select>
    <label for="tf_branch">Branch</label>
    <select id="tf_branch" name="branch_id">
      ${(await sql('SELECT * FROM branches WHERE is_active = 1 ORDER BY name')).map(b => `<option value="${b.branch_id}">${b.name}</option>`).join('')}
    </select>
    <label for="tf_amount">Opening Balance (&#x20B1;)</label>
    <input type="number" id="tf_amount" name="opening_balance" min="0" step="0.01" value="0" required>
    <label for="tf_notes">Notes</label>
    <input type="text" id="tf_notes" name="notes" placeholder="Optional">
    <button type="submit" class="btn btn-primary">&#x2795; Open Fund</button>
  </form>
  </div>
  </div>`;
  res.type('html').send(layout('Teller Cash Management', 'teller-cash', content, { subtitle: 'Per-teller cash fund tracking and balancing', toast }));
}));

router.post('/teller-cash/open', requireRole(2), asyncHandler(async (req, res) => {
  const { teller_id, branch_id, opening_balance, notes } = req.body;
  if (!teller_id) return res.redirect('/admin/teller-cash?error=Teller+required');
  const today = new Date().toISOString().slice(0, 10);
  const existing = await one('SELECT * FROM teller_cash WHERE teller_id=$1 AND date=$2 AND status=$3', [teller_id, today, 'open']);
  if (existing) return res.redirect('/admin/teller-cash?error=Teller+already+has+open+fund+today');
  await store.query(
    'INSERT INTO teller_cash (cash_id, teller_id, branch_id, opening_balance, current_balance, date, status, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [uuidv4(), teller_id, branch_id || 'main', Number(opening_balance) || 0, Number(opening_balance) || 0, today, 'open', notes || '', new Date().toISOString()]
  );
  res.redirect('/admin/teller-cash?opened=ok');
}));

router.get('/teller-cash/close/:id', requireRole(2), asyncHandler(async (req, res) => {
  const fund = await one('SELECT * FROM teller_cash WHERE cash_id = $1', [req.params.id]);
  if (!fund) return res.redirect('/admin/teller-cash?error=Fund+not+found');
  await store.query('UPDATE teller_cash SET status=$1, closed_at=$2 WHERE cash_id=$3', ['closed', new Date().toISOString(), req.params.id]);
  res.redirect('/admin/teller-cash?closed=ok');
}));

// ═══════════════════════════════════════════════════════════════
// 3. MEMBER KYC — Selfie + Birth Cert Upload + Approval
// ═══════════════════════════════════════════════════════════════
router.get('/kyc', requireRole(1), asyncHandler(async (req, res) => {
  const tab = req.query.tab || 'pending';
  const statusFilter = tab === 'all' ? '' : `WHERE kyc_status = '${tab === 'verified' ? 'verified' : tab === 'rejected' ? 'rejected' : 'pending'}'`;
  const allAccounts = await sql('SELECT * FROM accounts ORDER BY child_name');
  const accounts = tab === 'all' ? allAccounts : allAccounts.filter(a => {
    if (tab === 'pending') return a.kyc_status === 'pending';
    if (tab === 'verified') return a.kyc_status === 'verified';
    if (tab === 'rejected') return a.kyc_status === 'rejected';
    return true;
  });
  const q = req.query;
  const toast = q.approved ? 'success:' + q.approved
    : q.rejected ? 'success:' + q.rejected
    : q.error ? 'error:' + q.error : '';

  const pendingCount = allAccounts.filter(a => a.kyc_status === 'pending').length;
  const verifiedCount = allAccounts.filter(a => a.kyc_status === 'verified').length;
  const rejectedCount = allAccounts.filter(a => a.kyc_status === 'rejected').length;
  const noKycCount = allAccounts.filter(a => !a.kyc_status).length;

  const tabs = (current) => `
  <div class="tabs" style="display:flex;gap:4px;margin-bottom:16px">
    <a href="/admin/kyc?tab=pending" class="btn ${current === 'pending' ? 'btn-primary' : 'btn-outline'} btn-sm">&#x23F3; Pending (${pendingCount})</a>
    <a href="/admin/kyc?tab=verified" class="btn ${current === 'verified' ? 'btn-primary' : 'btn-outline'} btn-sm">&#x2705; Verified (${verifiedCount})</a>
    <a href="/admin/kyc?tab=rejected" class="btn ${current === 'rejected' ? 'btn-primary' : 'btn-outline'} btn-sm">&#x274C; Rejected (${rejectedCount})</a>
    <a href="/admin/kyc?tab=all" class="btn ${current === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm">&#x1F4CB; All (${allAccounts.length})</a>
  </div>`;

  const statsRow = `
  <div class="stats-grid" style="margin-bottom:16px">
    <div class="stat-card"><div class="stat-icon">&#x1F464;</div><div class="stat-value">${allAccounts.length}</div><div class="stat-label">Total Members</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:var(--warning)">&#x23F3;</div><div class="stat-value">${pendingCount}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:var(--success)">&#x2705;</div><div class="stat-value">${verifiedCount}</div><div class="stat-label">Verified</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:var(--danger)">&#x274C;</div><div class="stat-value">${rejectedCount}</div><div class="stat-label">Rejected</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F4ED;</div><div class="stat-value">${noKycCount}</div><div class="stat-label">Not Submitted</div></div>
  </div>`;

  const firebaseWarning = !process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? `
  <div class="alert alert-warning" style="margin-bottom:16px;padding:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;color:#856404">
    <strong>&#x26A0;&#xFE0F; Push notifications disabled.</strong> 
    Set <code>FIREBASE_SERVICE_ACCOUNT_PATH</code> environment variable to enable KYC approval/rejection push notifications.
    <a href="https://render.com/docs/secret-files" target="_blank" style="color:#856404;text-decoration:underline">Learn how</a>
  </div>` : '';

  const content = tabs(tab) + statsRow + firebaseWarning + `
  <div class="card">
    <div class="card-header"><h3>&#x1F9D1;&#x200D;&#x1F4BC; ${tab.charAt(0).toUpperCase() + tab.slice(1)} KYC Verification</h3></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Member</th><th>Member ID</th><th>Selfie</th><th>Birth Cert</th><th>Status</th><th>Submitted</th><th>Action</th></tr>
      ${accounts.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No members in this category</td></tr>' :
        accounts.map(a => {
          const statusBadge = !a.kyc_status ? '<span class="badge badge-gray">Not Submitted</span>'
            : a.kyc_status === 'pending' ? '<span class="badge badge-warning">Pending</span>'
            : a.kyc_status === 'verified' ? '<span class="badge badge-green">Verified</span>'
            : '<span class="badge badge-red">Rejected</span>';
          const selfieHtml = a.selfie_url
            ? `<a href="${a.selfie_url}" target="_blank"><img src="${a.selfie_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid var(--border)" alt="selfie"></a>`
            : '<span style="color:var(--text-muted)">--</span>';
          const birthHtml = a.birth_cert_url
            ? `<a href="${a.birth_cert_url}" target="_blank"><img src="${a.birth_cert_url}" style="width:50px;height:50px;border-radius:4px;object-fit:cover;border:2px solid var(--border)" alt="birth cert"></a>`
            : '<span style="color:var(--text-muted)">--</span>';
          const submittedDate = a.kyc_submitted_at ? new Date(a.kyc_submitted_at).toLocaleDateString() : '-';
          const rejectReason = a.kyc_rejected_reason ? `<div style="font-size:11px;color:var(--danger);margin-top:4px">${a.kyc_rejected_reason}</div>` : '';

          let actions = '';
          if (a.kyc_status === 'pending') {
            actions = `
              <form method="post" action="/admin/kyc/approve/${a.account_id}" style="display:inline">
                <button class="btn btn-sm btn-success">&#x2705; Approve</button>
              </form>
              <button class="btn btn-sm btn-danger" onclick="document.getElementById('reject-${a.account_id}').style.display='block'">&#x274C; Reject</button>
              <div id="reject-${a.account_id}" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999;display:none;align-items:center;justify-content:center" onclick="if(event.target===this)this.style.display='none'">
                <div style="background:var(--card);padding:24px;border-radius:12px;max-width:400px;width:90%" onclick="event.stopPropagation()">
                  <h3 style="margin-bottom:12px">&#x274C; Reject KYC — ${a.child_name}</h3>
                  <form method="post" action="/admin/kyc/reject/${a.account_id}">
                    <div class="field">
                      <label>Reason for rejection</label>
                      <textarea name="reason" rows="3" required style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:inherit"></textarea>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:12px">
                      <button type="submit" class="btn btn-danger">&#x274C; Confirm Reject</button>
                      <button type="button" class="btn btn-cancel" onclick="document.getElementById('reject-${a.account_id}').style.display='none'">Cancel</button>
                    </div>
                  </form>
                </div>
              </div>`;
          } else if (a.kyc_status === 'verified') {
            const verifiedDate = a.kyc_verified_at ? new Date(a.kyc_verified_at).toLocaleDateString() : '';
            actions =               `<span style="font-size:12px;color:var(--success)">Verified ${verifiedDate}</span>
              <form method="post" action="/admin/kyc/test-notify/${a.account_id}" style="display:inline">
                <button class="btn btn-sm btn-outline" title="Send test push notification" style="margin-left:4px">&#x1F514; Test</button>
              </form>`;
          } else if (a.kyc_status === 'rejected') {
            actions = `<button class="btn btn-sm btn-outline" onclick="document.getElementById('reject-${a.account_id}').style.display='block'">&#x1F4C4; View Reason</button>
              <div id="reject-${a.account_id}" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999;display:none;align-items:center;justify-content:center" onclick="if(event.target===this)this.style.display='none'">
                <div style="background:var(--card);padding:24px;border-radius:12px;max-width:400px;width:90%" onclick="event.stopPropagation()">
                  <h3 style="margin-bottom:12px">&#x274C; Rejection Reason — ${a.child_name}</h3>
                  <p style="color:var(--danger);background:var(--bg-danger);padding:12px;border-radius:8px">${a.kyc_rejected_reason || 'No reason provided'}</p>
                  <button class="btn btn-cancel" onclick="this.closest('div[style]').style.display='none'" style="margin-top:12px">Close</button>
                </div>
              </div>`;
          }

          return `<tr>
            <td><b>${a.child_name}</b></td>
            <td class="mono">${a.member_id || '-'}</td>
            <td style="text-align:center">${selfieHtml}</td>
            <td style="text-align:center">${birthHtml}</td>
            <td>${statusBadge}${rejectReason}</td>
            <td style="font-size:12px">${submittedDate}</td>
            <td style="white-space:nowrap">${actions}</td>
          </tr>`;
        }).join('')}
    </table></div>
  </div>`;
  res.type('html').send(layout('KYC Verification', 'kyc', content, { subtitle: 'Review and approve member identity verification', toast }));
}));

router.post('/kyc/approve/:id', requireRole(2), asyncHandler(async (req, res) => {
  await store.updateAccount(req.params.id, { kyc_status: 'verified', kyc_verified_at: new Date().toISOString() });
  const account = await one('SELECT child_name FROM accounts WHERE account_id = $1', [req.params.id]);
  notifs.notifyKycApproved(req.params.id).catch(() => {});
  res.redirect('/admin/kyc?tab=pending&approved=KYC+approved+for+' + encodeURIComponent(account?.child_name || ''));
}));

router.post('/kyc/reject/:id', requireRole(2), asyncHandler(async (req, res) => {
  const reason = req.body.reason || 'No reason provided';
  await store.updateAccount(req.params.id, { kyc_status: 'rejected', kyc_rejected_reason: reason });
  const account = await one('SELECT child_name FROM accounts WHERE account_id = $1', [req.params.id]);
  notifs.notifyKycRejected(req.params.id, reason).catch(() => {});
  res.redirect('/admin/kyc?tab=pending&rejected=KYC+rejected+for+' + encodeURIComponent(account?.child_name || ''));
}));

router.post('/kyc/test-notify/:id', requireRole(2), asyncHandler(async (req, res) => {
  const account = await one('SELECT child_name, account_id FROM accounts WHERE account_id = $1', [req.params.id]);
  if (!account) return res.redirect('/admin/kyc?error=Account+not+found');
  try {
    await notifs.notifyKycApproved(req.params.id);
    const accountName = account.child_name || 'User';
    res.redirect('/admin/kyc?tab=verified&approved=Test+notification+sent+to+' + encodeURIComponent(accountName));
  } catch (err) {
    res.redirect('/admin/kyc?error=Notification+failed:+' + encodeURIComponent(err.message));
  }
}));

// ═══════════════════════════════════════════════════════════════
// 4. PASSBOOK PRINTING
// ═══════════════════════════════════════════════════════════════
router.get('/passbook/:id', requireRole(1), asyncHandler(async (req, res) => {
  const account = await one('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
  if (!account) return res.status(404).send('Account not found');
  const txns = await sql('SELECT * FROM transactions WHERE account_id = $1 ORDER BY created_at ASC LIMIT 50', [req.params.id]);
  const interest = await sql('SELECT * FROM transactions WHERE account_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1', [req.params.id, 'interest_credit']);
  let balance = 0;
  const rows = txns.map(t => {
    const amt = Number(t.amount);
    const isCredit = ['deposit', 'interest_credit', 'interest', 'loan_disbursement', 'td_maturity', 'fee', 'penalty', 'reward', 'loan_payment'].includes(t.type);
    if (isCredit) balance += amt; else balance -= amt;
    const now = new Date().toISOString().slice(0, 10);
    return `<tr>
      <td class="mono" style="font-size:10px">${(t.created_at||now).slice(0,10)}</td>
      <td style="font-size:11px">${t.description || t.type.replace(/_/g,' ')}</td>
      <td class="num mono" style="font-size:11px">${isCredit ? fmt(amt) : '-'}</td>
      <td class="num mono" style="font-size:11px">${!isCredit ? fmt(amt) : '-'}</td>
      <td class="num mono" style="font-size:11px;font-weight:600">${fmt(balance)}</td>
    </tr>`;
  }).join('');
  const content = `
  <style>
  @media print { body { background:#fff } .sidebar,.btn-print,.page-header { display:none!important } }
  .pb-page { max-width:700px;margin:0 auto;border:2px solid #333;padding:24px 32px;background:#fff }
  .pb-header { text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px }
  .pb-header h1 { font-size:18px;margin:0;letter-spacing:2px;text-transform:uppercase }
  .pb-header .pb-sub { font-size:11px;color:#666;margin-top:4px }
  .pb-member { display:flex;justify-content:space-between;font-size:12px;margin-bottom:16px;padding:8px 0;border-bottom:1px dashed #999 }
  .pb-member b { font-size:14px }
  .pb-table { width:100%;border-collapse:collapse;font-size:11px }
  .pb-table th { border-bottom:2px solid #333;padding:6px 4px;text-align:left;font-size:10px;text-transform:uppercase }
  .pb-table td { border-bottom:1px solid #ddd;padding:5px 4px }
  .pb-table tr:last-child td { border-bottom:2px solid #333 }
  .pb-footer { text-align:center;font-size:9px;color:#999;margin-top:16px;padding-top:8px;border-top:1px dashed #999 }
  </style>
  <div style="text-align:right;margin-bottom:8px"><button onclick="window.print()" class="btn btn-primary btn-sm">&#x1F5A8; Print Passbook</button></div>
  <div class="pb-page">
    <div class="pb-header">
      <h1>LabCoop Savings Bank</h1>
      <div class="pb-sub">Member Savings Passbook</div>
    </div>
    <div class="pb-member">
      <div><b>${account.child_name}</b><br>Member ID: ${account.member_id || '---'}</div>
      <div style="text-align:right">Interest Rate: ${interest.length ? '2% monthly' : 'N/A'}<br>Last Interest: ${interest.length ? (interest[0].created_at||'').slice(0,10) : '---'}</div>
    </div>
    <table class="pb-table">
      <tr><th>Date</th><th>Description</th><th class="num">Deposit</th><th class="num">Withdrawal</th><th class="num">Balance</th></tr>
      ${rows || '<tr><td colspan="5" style="text-align:center;padding:12px;color:#999">No transactions yet</td></tr>'}
    </table>
    <div class="pb-footer">
      LabCoop Savings Bank &middot; Printed on ${new Date().toLocaleDateString()} &middot; Page 1 of 1
    </div>
  </div>`;
  res.type('html').send(printLayout('Passbook — ' + account.child_name, content));
}));

// ═══════════════════════════════════════════════════════════════
// 5. CHECK PROCESSING
// ═══════════════════════════════════════════════════════════════
router.get('/checks', requireRole(2), asyncHandler(async (req, res) => {
  const checks = await sql(`SELECT c.*, a.child_name, a.member_id
    FROM checks c LEFT JOIN accounts a ON c.account_id = a.account_id ORDER BY c.created_at DESC`);
  const q = req.query;
  const toast = q.created ? 'success:Check recorded.'
    : q.cleared ? 'success:Check cleared.'
    : q.bounced ? 'success:Check marked as bounced.'
    : q.error ? 'error:' + q.error : '';
  const statusColors = { pending: 'badge-amber', cleared: 'badge-green', bounced: 'badge-red', deposited: 'badge-blue' };
  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F4B3;</div><div class="stat-value">${checks.length}</div><div class="stat-label">Total Checks</div></div>
    <div class="stat-card"><div class="stat-icon">&#x23F3;</div><div class="stat-value">${checks.filter(c => c.status === 'pending').length}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-icon">&#x2705;</div><div class="stat-value">${checks.filter(c => c.status === 'cleared').length}</div><div class="stat-label">Cleared</div></div>
    <div class="stat-card"><div class="stat-icon">&#x274C;</div><div class="stat-value">${checks.filter(c => c.status === 'bounced').length}</div><div class="stat-label">Bounced</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x1F4B3; Check Register</h3><div><a href="#add-check" class="btn btn-primary btn-sm">&#x2795; Record Check</a></div></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Check #</th><th>Member</th><th>Bank</th><th class="num">Amount</th><th>Status</th><th>Deposit Date</th><th>Clear Date</th><th></th></tr>
      ${checks.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No checks recorded</td></tr>' :
        checks.map(c => `<tr>
          <td class="mono"><b>${c.check_number}</b></td>
          <td>${c.child_name || c.account_id.slice(0,8)}</td>
          <td style="font-size:12px">${c.bank_name || '-'}</td>
          <td class="num mono">${fmt(c.amount)}</td>
          <td><span class="badge ${statusColors[c.status] || 'badge-gray'}">${c.status}</span></td>
          <td class="mono" style="font-size:11px">${(c.deposit_date||'').slice(0,10) || '-'}</td>
          <td class="mono" style="font-size:11px">${(c.clear_date||'').slice(0,10) || '-'}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap">
            ${c.status === 'pending' ? `<a href="/admin/checks/clear/${c.check_id}" class="btn btn-success btn-xs" data-confirm="Clear check ${c.check_number}?">&#x2705; Clear</a>
            <a href="/admin/checks/bounce/${c.check_id}" class="btn btn-danger btn-xs" data-confirm="Mark check ${c.check_number} as bounced?">&#x274C; Bounce</a>` : ''}
          </td>
        </tr>`).join('')}
    </table></div>
  </div>

  <div id="add-check" class="modal-overlay">
  <div class="modal" style="max-width:440px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; Record Check Deposit</h2>
  <form method="post" action="/admin/checks/create">
    <label for="ch_account">Member</label>
    <select id="ch_account" name="account_id" required>
      <option value="">-- Select member --</option>
      ${(await sql('SELECT account_id, child_name, member_id FROM accounts ORDER BY child_name')).map(a => `<option value="${a.account_id}">${a.child_name} (${a.member_id || '---'})</option>`).join('')}
    </select>
    <div class="form-row">
      <div><label for="ch_num">Check Number</label><input type="text" id="ch_num" name="check_number" placeholder="e.g. 000123456" required></div>
      <div><label for="ch_amount">Amount (&#x20B1;)</label><input type="number" id="ch_amount" name="amount" min="0" step="0.01" required></div>
    </div>
    <label for="ch_bank">Bank Name</label>
    <input type="text" id="ch_bank" name="bank_name" placeholder="e.g. BDO, BPI">
    <button type="submit" class="btn btn-primary">&#x1F4B3; Record Check</button>
  </form>
  </div>
  </div>`;
  res.type('html').send(layout('Check Processing', 'checks', content, { subtitle: 'Check deposit, clearing, and bounce management', toast }));
}));

router.post('/checks/create', requireRole(2), asyncHandler(async (req, res) => {
  const { account_id, check_number, amount, bank_name } = req.body;
  if (!account_id || !check_number || !amount) return res.redirect('/admin/checks?error=Missing+required+fields');
  const today = new Date().toISOString();
  const checkId = uuidv4();
  await store.query(
    'INSERT INTO checks (check_id, account_id, check_number, bank_name, amount, status, deposit_date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [checkId, account_id, check_number, bank_name || '', Number(amount), 'pending', today, today]
  );
  // Auto-post deposit to account + GL (pending clearance)
  const account = await one('SELECT * FROM accounts WHERE account_id = $1', [account_id]);
  const newBalance = Number(account.actual_balance) + Number(amount);
  const txId = uuidv4();
  await store.query('INSERT INTO transactions (transaction_id, account_id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [txId, account_id, 'deposit', Number(amount), Number(account.actual_balance), newBalance, 'Check deposit #' + check_number + ' (pending clearance)', 'check', checkId, today]);
  await store.query('UPDATE accounts SET actual_balance = $1 WHERE account_id = $2', [newBalance, account_id]);
  res.redirect('/admin/checks?created=ok');
}));

router.get('/checks/clear/:id', requireRole(3), asyncHandler(async (req, res) => {
  const check = await one('SELECT * FROM checks WHERE check_id = $1', [req.params.id]);
  if (!check) return res.redirect('/admin/checks?error=Check+not+found');
  await store.query('UPDATE checks SET status=$1, clear_date=$2 WHERE check_id=$3', ['cleared', new Date().toISOString(), req.params.id]);
  // Post GL entry
  const gl = require('../services/gl');
  const txId = uuidv4();
  await gl.postDoubleEntry(txId, [
    { account_code: '1000', debit: Number(check.amount), description: 'Check cleared #' + check.check_number },
    { account_code: '2000', credit: Number(check.amount), description: 'Check deposit #' + check.check_number },
  ], { postedBy: req.session.adminName || 'admin', referenceType: 'check' });
  res.redirect('/admin/checks?cleared=ok');
}));

router.get('/checks/bounce/:id', requireRole(3), asyncHandler(async (req, res) => {
  const check = await one('SELECT * FROM checks WHERE check_id = $1', [req.params.id]);
  if (!check) return res.redirect('/admin/checks?error=Check+not+found');
  await store.query('UPDATE checks SET status=$1 WHERE check_id=$2', ['bounced', req.params.id]);
  // Reverse the deposit
  const account = await one('SELECT * FROM accounts WHERE account_id = $1', [check.account_id]);
  const newBalance = Number(account.actual_balance) - Number(check.amount);
  const txId = uuidv4();
  await store.query('INSERT INTO transactions (transaction_id, account_id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [txId, check.account_id, 'withdrawal', Number(check.amount), Number(account.actual_balance), newBalance, 'Check bounced #' + check.check_number, 'check', check.check_id, new Date().toISOString()]);
  await store.query('UPDATE accounts SET actual_balance = $1 WHERE account_id = $2', [newBalance, check.account_id]);
  res.redirect('/admin/checks?bounced=ok');
}));

// ═══════════════════════════════════════════════════════════════
// 6. FEE CONFIGURATION UI
// ═══════════════════════════════════════════════════════════════
router.get('/fees', requireRole(3), asyncHandler(async (req, res) => {
  const fees = await sql(`SELECT f.*, g.name as gl_name FROM fees f LEFT JOIN gl_accounts g ON f.gl_account_code = g.code ORDER BY f.name`);
  const glAccounts = await sql('SELECT * FROM gl_accounts WHERE is_active = 1 ORDER BY code');
  const q = req.query;
  const toast = q.created ? 'success:Fee configured.'
    : q.updated ? 'success:Fee updated.'
    : q.deactivated ? 'success:Fee deactivated.'
    : q.error ? 'error:' + q.error : '';
  const content = `
  <div class="card">
    <div class="card-header"><h3>&#x1F4B0; Fee Configuration</h3><div><a href="#add-fee" class="btn btn-primary btn-sm">&#x2795; New Fee</a></div></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Fee Name</th><th class="num">Amount</th><th>Type</th><th>GL Account</th><th>Status</th><th></th></tr>
      ${fees.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No fees configured</td></tr>' :
        fees.map(f => `<tr>
          <td><b>${f.name}</b></td>
          <td class="num mono">${f.fee_type === 'percentage' ? f.amount + '%' : fmt(f.amount)}</td>
          <td><span class="badge ${f.fee_type === 'fixed' ? 'badge-blue' : 'badge-green'}">${f.fee_type}</span></td>
          <td style="font-size:12px">${f.gl_account_code ? f.gl_account_code + ' — ' + (f.gl_name || '') : '-'}</td>
          <td>${f.is_active ? '<span style="color:#16a34a;font-weight:600">&#x2705; Active</span>' : '<span style="color:#dc2626;font-weight:600">&#x274C; Inactive</span>'}</td>
          <td style="display:flex;gap:6px">
            <a href="#edit-fee-${f.fee_id}" class="btn btn-secondary btn-xs">&#x270F; Edit</a>
            <a href="/admin/fees/toggle/${f.fee_id}" class="btn ${f.is_active ? 'btn-danger' : 'btn-secondary'} btn-xs" data-confirm="${f.is_active ? 'Deactivate' : 'Activate'} ${f.name}?">${f.is_active ? 'Deactivate' : 'Activate'}</a>
          </td>
        </tr>`).join('')}
    </table></div>
  </div>

  <div id="add-fee" class="modal-overlay">
  <div class="modal" style="max-width:420px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Fee</h2>
  <form method="post" action="/admin/fees/create">
    <label for="fee_name">Fee Name</label>
    <input type="text" id="fee_name" name="name" placeholder="e.g. Account Maintenance" required>
    <div class="form-row">
      <div><label for="fee_amount">Amount</label><input type="number" id="fee_amount" name="amount" min="0" step="0.01" value="0" required></div>
      <div><label for="fee_type">Type</label>
        <select id="fee_type" name="fee_type">
          <option value="fixed">Fixed (&#x20B1;)</option>
          <option value="percentage">Percentage (%)</option>
        </select></div>
    </div>
    <label for="fee_gl">GL Account (Fee Income)</label>
    <select id="fee_gl" name="gl_account_code">
      <option value="">-- Select --</option>
      ${glAccounts.map(g => `<option value="${g.code}">${g.code} — ${g.name}</option>`).join('')}
    </select>
    <label for="fee_desc">Description</label>
    <input type="text" id="fee_desc" name="description" placeholder="Optional description">
    <button type="submit" class="btn btn-primary">&#x2795; Create Fee</button>
  </form>
  </div>
  </div>

  ${fees.map(f => `
  <div id="edit-fee-${f.fee_id}" class="modal-overlay">
  <div class="modal" style="max-width:420px">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${f.name}</h2>
  <form method="post" action="/admin/fees/update/${f.fee_id}">
    <label for="fen_${f.fee_id}">Fee Name</label>
    <input type="text" id="fen_${f.fee_id}" name="name" value="${f.name}" required>
    <div class="form-row">
      <div><label for="fea_${f.fee_id}">Amount</label><input type="number" id="fea_${f.fee_id}" name="amount" min="0" step="0.01" value="${f.amount}" required></div>
      <div><label for="fet_${f.fee_id}">Type</label>
        <select id="fet_${f.fee_id}" name="fee_type">
          <option value="fixed" ${f.fee_type === 'fixed' ? 'selected' : ''}>Fixed (&#x20B1;)</option>
          <option value="percentage" ${f.fee_type === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
        </select></div>
    </div>
    <label for="feg_${f.fee_id}">GL Account</label>
    <select id="feg_${f.fee_id}" name="gl_account_code">
      <option value="">-- Select --</option>
      ${glAccounts.map(g => `<option value="${g.code}" ${f.gl_account_code === g.code ? 'selected' : ''}>${g.code} — ${g.name}</option>`).join('')}
    </select>
    <label for="fed_${f.fee_id}">Description</label>
    <input type="text" id="fed_${f.fee_id}" name="description" value="${f.description || ''}">
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}`;
  res.type('html').send(layout('Fee Configuration', 'fees', content, { subtitle: 'Configure fees and charges', toast }));
}));

router.post('/fees/create', requireRole(3), asyncHandler(async (req, res) => {
  const { name, amount, fee_type, gl_account_code, description } = req.body;
  if (!name) return res.redirect('/admin/fees?error=Name+required');
  const exists = await one('SELECT * FROM fees WHERE name = $1', [name]);
  if (exists) return res.redirect('/admin/fees?error=Fee+already+exists');
  await store.query(
    'INSERT INTO fees (fee_id, name, amount, fee_type, gl_account_code, description, is_active, created_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7)',
    [uuidv4(), name, Number(amount) || 0, fee_type || 'fixed', gl_account_code || null, description || '', new Date().toISOString()]
  );
  res.redirect('/admin/fees?created=ok');
}));

router.post('/fees/update/:id', requireRole(3), asyncHandler(async (req, res) => {
  const { name, amount, fee_type, gl_account_code, description } = req.body;
  if (!name) return res.redirect('/admin/fees?error=Name+required');
  const dup = await one('SELECT * FROM fees WHERE name = $1 AND fee_id != $2', [name, req.params.id]);
  if (dup) return res.redirect('/admin/fees?error=Name+already+taken');
  await store.query('UPDATE fees SET name=$1, amount=$2, fee_type=$3, gl_account_code=$4, description=$5 WHERE fee_id=$6',
    [name, Number(amount) || 0, fee_type || 'fixed', gl_account_code || null, description || '', req.params.id]);
  res.redirect('/admin/fees?updated=ok');
}));

router.get('/fees/toggle/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE fees SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE fee_id = $1', [req.params.id]);
  res.redirect('/admin/fees');
}));

// ═══════════════════════════════════════════════════════════════
// 7. BRANCH MANAGEMENT
// ═══════════════════════════════════════════════════════════════
router.get('/branches', requireRole(3), asyncHandler(async (req, res) => {
  const branches = await sql(`SELECT b.*,
    (SELECT COUNT(*) FROM accounts WHERE branch_id = b.branch_id) as member_count,
    (SELECT COUNT(*) FROM admin_users WHERE branch_id = b.branch_id) as staff_count
    FROM branches b ORDER BY b.name`);
  const q = req.query;
  const toast = q.created ? 'success:Branch created.'
    : q.updated ? 'success:Branch updated.'
    : q.deactivated ? 'success:Branch deactivated.'
    : q.error ? 'error:' + q.error : '';
  const content = `
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">&#x1F3E2;</div><div class="stat-value">${branches.length}</div><div class="stat-label">Total Branches</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F464;</div><div class="stat-value">${branches.reduce((s,b) => s + b.member_count, 0)}</div><div class="stat-label">Total Members</div></div>
    <div class="stat-card"><div class="stat-icon">&#x1F465;</div><div class="stat-value">${branches.reduce((s,b) => s + b.staff_count, 0)}</div><div class="stat-label">Total Staff</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h3>&#x1F3E2; Branch List</h3><div><a href="#add-branch" class="btn btn-primary btn-sm">&#x2795; New Branch</a></div></div>
    <div class="card-body" style="padding:0">
    <table>
      <tr><th>Name</th><th>Code</th><th>Address</th><th>Contact</th><th>Manager</th><th class="num">Members</th><th class="num">Staff</th><th>Status</th><th></th></tr>
      ${branches.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No branches</td></tr>' :
        branches.map(b => `<tr>
          <td><b>${b.name}</b></td>
          <td class="mono">${b.code || '-'}</td>
          <td style="font-size:12px">${b.address || '-'}</td>
          <td class="mono" style="font-size:12px">${b.contact_number || '-'}</td>
          <td>${b.manager_name || '-'}</td>
          <td class="num">${b.member_count}</td>
          <td class="num">${b.staff_count}</td>
          <td>${b.is_active ? '<span style="color:#16a34a;font-weight:600">&#x2705; Active</span>' : '<span style="color:#dc2626;font-weight:600">&#x274C; Inactive</span>'}</td>
          <td style="display:flex;gap:6px">
            <a href="#edit-branch-${b.branch_id}" class="btn btn-secondary btn-xs">&#x270F; Edit</a>
            <a href="/admin/branches/toggle/${b.branch_id}" class="btn ${b.is_active ? 'btn-danger' : 'btn-secondary'} btn-xs" data-confirm="${b.is_active ? 'Deactivate' : 'Activate'} ${b.name}?">${b.is_active ? 'Deactivate' : 'Activate'}</a>
          </td>
        </tr>`).join('')}
    </table></div>
  </div>

  <div id="add-branch" class="modal-overlay">
  <div class="modal" style="max-width:480px">
  <a href="#" class="close">&times;</a>
  <h2>&#x2795; New Branch</h2>
  <form method="post" action="/admin/branches/create">
    <div class="form-row">
      <div><label for="br_name">Branch Name</label><input type="text" id="br_name" name="name" placeholder="e.g. Main Branch" required></div>
      <div><label for="br_code">Code</label><input type="text" id="br_code" name="code" placeholder="e.g. MAIN" style="text-transform:uppercase"></div>
    </div>
    <label for="br_addr">Address</label>
    <input type="text" id="br_addr" name="address" placeholder="e.g. 123 Rizal St, Manila">
    <div class="form-row">
      <div><label for="br_contact">Contact Number</label><input type="text" id="br_contact" name="contact_number" placeholder="e.g. 09171234567"></div>
      <div><label for="br_mgr">Manager Name</label><input type="text" id="br_mgr" name="manager_name" placeholder="e.g. Juan Dela Cruz"></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x2795; Create Branch</button>
  </form>
  </div>
  </div>

  ${branches.map(b => `
  <div id="edit-branch-${b.branch_id}" class="modal-overlay">
  <div class="modal" style="max-width:480px">
  <a href="#" class="close">&times;</a>
  <h2>&#x270F; ${b.name}</h2>
  <form method="post" action="/admin/branches/update/${b.branch_id}">
    <div class="form-row">
      <div><label for="ben_${b.branch_id}">Branch Name</label><input type="text" id="ben_${b.branch_id}" name="name" value="${b.name}" required></div>
      <div><label for="bec_${b.branch_id}">Code</label><input type="text" id="bec_${b.branch_id}" name="code" value="${b.code || ''}" style="text-transform:uppercase"></div>
    </div>
    <label for="bea_${b.branch_id}">Address</label>
    <input type="text" id="bea_${b.branch_id}" name="address" value="${b.address || ''}">
    <div class="form-row">
      <div><label for="beph_${b.branch_id}">Contact</label><input type="text" id="beph_${b.branch_id}" name="contact_number" value="${b.contact_number || ''}"></div>
      <div><label for="bem_${b.branch_id}">Manager</label><input type="text" id="bem_${b.branch_id}" name="manager_name" value="${b.manager_name || ''}"></div>
    </div>
    <button type="submit" class="btn btn-primary">&#x1F4BE; Save</button>
  </form>
  </div>
  </div>`).join('')}`;
  res.type('html').send(layout('Branch Management', 'branches', content, { subtitle: 'Manage bank branches and locations', toast }));
}));

router.post('/branches/create', requireRole(3), asyncHandler(async (req, res) => {
  const { name, code, address, contact_number, manager_name } = req.body;
  if (!name) return res.redirect('/admin/branches?error=Name+required');
  const exists = await one('SELECT * FROM branches WHERE name = $1', [name]);
  if (exists) return res.redirect('/admin/branches?error=Branch+already+exists');
  await store.query(
    'INSERT INTO branches (branch_id, name, code, address, contact_number, manager_name, is_active, created_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7)',
    [uuidv4(), name, (code || name.slice(0,4)).toUpperCase(), address || '', contact_number || '', manager_name || '', new Date().toISOString()]
  );
  res.redirect('/admin/branches?created=ok');
}));

router.post('/branches/update/:id', requireRole(3), asyncHandler(async (req, res) => {
  const { name, code, address, contact_number, manager_name } = req.body;
  if (!name) return res.redirect('/admin/branches?error=Name+required');
  const dup = await one('SELECT * FROM branches WHERE name = $1 AND branch_id != $2', [name, req.params.id]);
  if (dup) return res.redirect('/admin/branches?error=Name+already+taken');
  await store.query('UPDATE branches SET name=$1, code=$2, address=$3, contact_number=$4, manager_name=$5 WHERE branch_id=$6',
    [name, (code || '').toUpperCase(), address || '', contact_number || '', manager_name || '', req.params.id]);
  res.redirect('/admin/branches?updated=ok');
}));

router.get('/branches/toggle/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.query('UPDATE branches SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE branch_id = $1', [req.params.id]);
  res.redirect('/admin/branches');
}));

module.exports = router;
