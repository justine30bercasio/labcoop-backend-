const express = require('express');
const { param, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

const REWARDS = [
  { label: '5 Coins', coins: 5, xp: 0, weight: 20 },
  { label: '10 XP', coins: 0, xp: 10, weight: 20 },
  { label: '10 Coins', coins: 10, xp: 0, weight: 18 },
  { label: '15 XP', coins: 0, xp: 15, weight: 18 },
  { label: '20 Coins', coins: 20, xp: 0, weight: 8 },
  { label: '25 XP', coins: 0, xp: 25, weight: 8 },
  { label: 'Streak +3', coins: 10, xp: 0, weight: 4, streakBonus: 3 },
  { label: 'Jackpot!', coins: 50, xp: 30, weight: 4 },
];

function pickReward() {
  const totalWeight = REWARDS.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < REWARDS.length; i++) {
    roll -= REWARDS[i].weight;
    if (roll <= 0) return { index: i, ...REWARDS[i] };
  }
  return { index: 0, ...REWARDS[0] };
}

// GET /api/spin/:accountId/can-spin — check daily eligibility
router.get('/:accountId/can-spin',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const lastSpin = await store.getLastSpinDate(accountId);
    const today = new Date().toISOString().slice(0, 10);
    res.json({ canSpin: lastSpin !== today, lastSpinDate: lastSpin });
  })
);

// POST /api/spin/:accountId — spin the wheel
router.post('/:accountId',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { accountId } = req.params;

    const lastSpin = await store.getLastSpinDate(accountId);
    const today = new Date().toISOString().slice(0, 10);
    if (lastSpin === today) {
      return res.status(429).json({ message: 'Already spun today' });
    }

    const reward = pickReward();
    let newCoins = null;
    let newXp = null;

    if (reward.coins > 0) {
      newCoins = await store.addCoins(accountId, reward.coins, `spin_wheel_${reward.label.toLowerCase().replace(/\s+/g, '_')}`);
    }
    if (reward.xp > 0) {
      newXp = await store.addXp(accountId, reward.xp);
    }

    await store.recordSpin(accountId, today);

    res.json({
      reward: {
        label: reward.label,
        coins: reward.coins,
        xp: reward.xp,
        streakBonus: reward.streakBonus || 0,
        index: reward.index,
      },
      newCoins,
      newXp,
    });
  })
);

module.exports = router;
