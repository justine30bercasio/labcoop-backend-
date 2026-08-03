const express = require('express');
const rateLimit = require('express-rate-limit');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many claims. Try again later.' },
});

const CREDIT_TYPES = ['deposit', 'interest_credit', 'interest', 'auto_save'];

async function getTotalSaved(accountId) {
  const res = await store.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE account_id = $1 AND type IN ('deposit','interest_credit','interest','auto_save')`,
    [accountId]
  );
  return Number(res.rows[0]?.total) || 0;
}

async function buildMilestones(accountId) {
  const totalSaved = await store.getTotalSaved(accountId);
  const claims = await store.getMilestoneClaims(accountId);
  const claimedSet = new Set(claims.map(c => c.milestone_id));
  const claimedAt = {};
  for (const c of claims) claimedAt[c.milestone_id] = c.claimed_at || null;

  const all = await store.getMilestones();
  const active = (all || [])
    .filter(m => Number(m.is_active) !== 0)
    .sort((a, b) => Number(a.threshold_amount) - Number(b.threshold_amount));

  const items = [];
  for (const m of active) {
    let rewardItemName = null;
    let rewardItemEmoji = null;
    if (m.reward_type === 'border' && m.reward_item_id) {
      const r = await store.query('SELECT name, emoji FROM shop_items WHERE id = $1', [m.reward_item_id]);
      const item = r.rows[0];
      rewardItemName = item ? item.name : null;
      rewardItemEmoji = item ? item.emoji : null;
    }
    items.push({
      id: m.id,
      threshold: Number(m.threshold_amount),
      title: m.title || 'Milestone',
      description: m.description || '',
      icon: m.icon || '🏆',
      reward_type: m.reward_type || 'coins',
      reward_value: Number(m.reward_value) || 0,
      reward_item_id: m.reward_item_id || null,
      reward_item_name: rewardItemName,
      reward_item_emoji: rewardItemEmoji,
      achieved: totalSaved >= Number(m.threshold_amount),
      claimed: claimedSet.has(m.id),
      claimed_at: claimedAt[m.id] || null,
    });
  }

  return { total_saved: totalSaved, milestones: items };
}

// GET /api/milestones/:accountId — milestones + child progress + claim status
router.get('/:accountId', asyncHandler(async (req, res) => {
  const data = await buildMilestones(req.params.accountId);
  res.json(data);
}));

// POST /api/milestones/:accountId/claim — grant the milestone reward
router.post('/:accountId/claim', claimLimiter, asyncHandler(async (req, res) => {
  const accountId = req.params.accountId;
  const milestoneId = req.body.milestone_id;
  if (!milestoneId) return res.status(400).json({ message: 'milestone_id required' });

  const milestone = await store.getMilestone(milestoneId);
  if (!milestone || Number(milestone.is_active) === 0) {
    return res.status(404).json({ message: 'Milestone not found' });
  }

  const totalSaved = await getTotalSaved(accountId);
  if (totalSaved < Number(milestone.threshold_amount)) {
    return res.status(403).json({ message: 'Milestone not yet achieved' });
  }

  const claims = await store.getMilestoneClaims(accountId);
  if (claims.some(c => c.milestone_id === milestoneId)) {
    return res.status(400).json({ message: 'Already claimed' });
  }

  const granted = { coins: 0, xp: 0, border: null, certificate: null };
  try {
    if (milestone.reward_type === 'coins' && Number(milestone.reward_value) > 0) {
      granted.coins = await store.addCoins(accountId, Number(milestone.reward_value), `milestone_${String(milestoneId).slice(0, 8)}`);
    } else if (milestone.reward_type === 'xp' && Number(milestone.reward_value) > 0) {
      granted.xp = await store.addXp(accountId, Number(milestone.reward_value));
    } else if (milestone.reward_type === 'border' && milestone.reward_item_id) {
      await store.grantShopItem(accountId, milestone.reward_item_id, 'milestone');
      granted.border = milestone.reward_item_id;
    } else if (milestone.reward_type === 'certificate') {
      granted.certificate = milestone.title || 'Milestone Champion';
    }
    await store.claimMilestone(accountId, milestoneId);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }

  try {
    const audit = require('../services/audit');
    await audit.log(req, 'milestone_claimed', 'account', accountId, { milestone_id: milestoneId, granted }, accountId);
  } catch (_) {}

  const data = await buildMilestones(accountId);
  res.json({ success: true, granted, ...data });
}));

module.exports = router;
