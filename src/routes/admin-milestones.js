const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const adminLib = require('./admin-lib');
const { layout, h } = adminLib;

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

const _p = (...p) => p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
const sql = (q, ...p) => store.query(q, _p(...p)).then(r => r.rows);

const REWARD_TYPES = [
  { value: 'coins', label: '🪙 Bonus Coins' },
  { value: 'xp', label: '⭐ Bonus XP' },
  { value: 'border', label: '🖼️ Free Shop Border' },
  { value: 'certificate', label: '🏅 Certificate / Title' },
];

function rewardLabel(m) {
  const rt = REWARD_TYPES.find(r => r.value === m.reward_type);
  const base = rt ? rt.label : m.reward_type;
  if (m.reward_type === 'coins' && Number(m.reward_value) > 0) return `${base} (+${Number(m.reward_value)})`;
  if (m.reward_type === 'xp' && Number(m.reward_value) > 0) return `${base} (+${Number(m.reward_value)})`;
  if (m.reward_type === 'border' && m.reward_item_name) return `${base} (${h(m.reward_item_name)})`;
  return base;
}

async function getBorders() {
  return sql("SELECT id, name, emoji, cost FROM shop_items WHERE type = 'border' ORDER BY cost ASC");
}

router.get('/milestones', requireRole(2), asyncHandler(async (req, res) => {
  const milestones = await store.getMilestones();
  const borders = await getBorders();
  const certificates = await sql('SELECT c.*, a.member_id FROM certificates c LEFT JOIN accounts a ON c.account_id = a.account_id ORDER BY c.issued_at DESC').catch(() => []);
  const editId = req.query.edit || null;
  const toast = req.query.created ? 'success:Milestone created.' :
    req.query.updated ? 'success:Milestone updated.' :
    req.query.deleted ? 'success:Milestone deleted.' :
    req.query.error ? 'error:' + req.query.error : '';

  const borderOptions = borders.map(b =>
    `<option value="${h(b.id)}">${h(b.emoji)} ${h(b.name)} (${Number(b.cost).toLocaleString()} coins)</option>`
  ).join('');

  const activeCount = milestones.filter(m => Number(m.is_active) !== 0).length;
  const claimedCount = await sql('SELECT COUNT(*) AS c FROM milestone_claims').then(r => Number(r[0]?.c) || 0);

  const formFields = (m = {}) => `
    <div class="form-row">
      <div class="field"><label>Threshold (₱)</label>
        <input type="number" step="0.01" min="0" name="threshold_amount" value="${m.threshold_amount ?? ''}" required></div>
      <div class="field"><label>Title</label>
        <input type="text" name="title" value="${h(m.title ?? '')}" required placeholder="e.g. First ₱1,000 Saved"></div>
      <div class="field"><label>Icon (emoji)</label>
        <input type="text" name="icon" value="${h(m.icon ?? '')}" placeholder="🏆"></div>
      <div class="field"><label>Sort Order</label>
        <input type="number" name="sort_order" value="${m.sort_order ?? ''}"></div>
    </div>
    <div class="field"><label>Description</label>
      <input type="text" name="description" value="${h(m.description ?? '')}" placeholder="Shown to the child in the app"></div>
    <div class="form-row">
      <div class="field"><label>Reward Type</label>
        <select name="reward_type" class="reward-type-select">
          ${REWARD_TYPES.map(r => `<option value="${r.value}" ${m.reward_type === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select></div>
      <div class="field reward-value-field"><label>Reward Amount (coins / XP)</label>
        <input type="number" min="0" name="reward_value" value="${m.reward_value ?? 0}"></div>
      <div class="field reward-item-field" style="display:${m.reward_type === 'border' ? '' : 'none'}"><label>Free Border Item</label>
        <select name="reward_item_id">
          <option value="">— Select border —</option>
          ${borderOptions}
        </select></div>
    </div>
  `;

  const addForm = `
    <form method="post" action="/admin/milestones/create" class="card" style="padding:20px;margin-bottom:20px">
      <h3 style="margin:0 0 4px">➕ Add Milestone</h3>
      <p style="margin:0 0 14px;color:var(--text-muted);font-size:13px">A child is recognized in the app when their total savings reaches the threshold.</p>
      ${formFields()}
      <div style="margin-top:14px"><button type="submit" class="btn btn-success">Create Milestone</button></div>
    </form>
  `;

  const rows = milestones.map(m => {
    const editForm = editId === m.id ? `
      <form method="post" action="/admin/milestones/update/${m.id}" class="card" style="padding:16px;margin-top:12px;background:var(--bg-card)">
        <h4 style="margin:0 0 10px">✏️ Edit</h4>
        ${formFields(m)}
        <div style="margin-top:12px">
          <button type="submit" class="btn btn-success btn-xs">Save</button>
          <a href="/admin/milestones" class="btn btn-secondary btn-xs">Cancel</a>
        </div>
      </form>` : '';
    return `
      <tr>
        <td>${h(m.icon || '🏆')}</td>
        <td><strong>${h(m.title)}</strong><br><span style="color:var(--text-muted);font-size:12px">${h(m.description || '')}</span></td>
        <td class="mono">₱${Number(m.threshold_amount).toLocaleString()}</td>
        <td>${rewardLabel(m)}</td>
        <td>${Number(m.is_active) !== 0 ? '<span class="badge-green">Active</span>' : '<span class="badge-amber">Inactive</span>'}</td>
        <td style="white-space:nowrap">
          <a href="/admin/milestones?edit=${m.id}" class="btn btn-secondary btn-xs">Edit</a>
          <a href="/admin/milestones/toggle/${m.id}" class="btn btn-amber btn-xs">${Number(m.is_active) !== 0 ? 'Disable' : 'Enable'}</a>
          <a href="/admin/milestones/delete/${m.id}" class="btn btn-danger btn-xs" onclick="return confirm('Delete this milestone and its claims?')">Delete</a>
        </td>
      </tr>${editForm ? `<tr><td colspan="6" style="padding:0">${editForm}</td></tr>` : ''}`;
  }).join('');

  const content = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${activeCount}</div><div class="stat-label">Active Milestones</div></div>
      <div class="stat-card"><div class="stat-value">${milestones.filter(m => m.reward_type === 'border').length}</div><div class="stat-label">Free Border Rewards</div></div>
      <div class="stat-card"><div class="stat-value">${claimedCount}</div><div class="stat-label">Rewards Claimed</div></div>
    </div>
    <div style="height:18px"></div>
    ${addForm}
    <div class="card" style="padding:0;overflow:hidden">
      <table class="table table-striped" style="margin:0">
        <thead><tr>
          <th>Icon</th><th>Milestone</th><th>Threshold</th><th>Reward</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${milestones.length ? rows : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No milestones yet. Add one above.</td></tr>'}</tbody>
      </table>
    </div>
    <div style="height:22px"></div>
    <div class="card" style="padding:18px">
      <h3 style="margin:0 0 12px">🏅 Issued Certificates</h3>
      ${certificates.length ? `
        <table class="table table-striped" style="margin:0">
          <thead><tr><th>Cert #</th><th>Child</th><th>Title</th><th>Issued</th></tr></thead>
          <tbody>${certificates.map(c => `
            <tr>
              <td class="mono">${h(c.certificate_number)}</td>
              <td><b>${h(c.child_name)}</b><br><span style="color:var(--text-muted);font-size:11px">${c.member_id || ''}</span></td>
              <td>${h(c.title)}</td>
              <td class="mono" style="font-size:11px">${new Date(c.issued_at).toLocaleString()}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<p style="color:var(--text-muted);margin:0">No certificates issued yet. Certificates are auto-created in the child\'s name when they claim a "Certificate / Title" milestone.</p>'}
    </div>
    <script>
      document.addEventListener('change', function(e) {
        if (e.target.classList.contains('reward-type-select')) {
          const row = e.target.closest('form');
          const showItem = e.target.value === 'border';
          const showValue = e.target.value === 'coins' || e.target.value === 'xp';
          if (row) {
            const itemField = row.querySelector('.reward-item-field');
            const valueField = row.querySelector('.reward-value-field');
            if (itemField) itemField.style.display = showItem ? '' : 'none';
            if (valueField) valueField.style.display = showValue ? '' : 'none';
          }
        }
      });
    </script>
  `;

  res.type('html').send(layout('Savings Milestones', 'milestones', content, { subtitle: 'Milestone recognition & rewards', toast }));
}));

router.post('/milestones/create', requireRole(2), asyncHandler(async (req, res) => {
  await store.createMilestone({
    threshold_amount: req.body.threshold_amount,
    title: req.body.title,
    description: req.body.description,
    icon: req.body.icon,
    reward_type: req.body.reward_type,
    reward_value: req.body.reward_value,
    reward_item_id: req.body.reward_type === 'border' ? req.body.reward_item_id : null,
    sort_order: req.body.sort_order,
  });
  try {
    const { log } = require('../services/audit');
    await log(req, 'milestone_created', 'milestone', null, { title: req.body.title });
  } catch (_) {}
  res.redirect('/admin/milestones?created=ok');
}));

router.post('/milestones/update/:id', requireRole(2), asyncHandler(async (req, res) => {
  await store.updateMilestone(req.params.id, {
    threshold_amount: req.body.threshold_amount,
    title: req.body.title,
    description: req.body.description,
    icon: req.body.icon,
    reward_type: req.body.reward_type,
    reward_value: req.body.reward_value,
    reward_item_id: req.body.reward_type === 'border' ? req.body.reward_item_id : null,
    sort_order: req.body.sort_order,
  });
  try {
    const { log } = require('../services/audit');
    await log(req, 'milestone_updated', 'milestone', req.params.id, {});
  } catch (_) {}
  res.redirect('/admin/milestones?updated=ok');
}));

router.get('/milestones/delete/:id', requireRole(3), asyncHandler(async (req, res) => {
  await store.deleteMilestone(req.params.id);
  try {
    const { log } = require('../services/audit');
    await log(req, 'milestone_deleted', 'milestone', req.params.id, {});
  } catch (_) {}
  res.redirect('/admin/milestones?deleted=ok');
}));

router.get('/milestones/toggle/:id', requireRole(2), asyncHandler(async (req, res) => {
  const m = await store.getMilestone(req.params.id);
  if (m) await store.updateMilestone(req.params.id, { is_active: Number(m.is_active) === 0 });
  res.redirect('/admin/milestones');
}));

module.exports = router;
