const express = require('express');
const router = express.Router();
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

// GET /api/leaderboard — returns all accounts sorted by savings balance DESC
// Child names are pseudo-anonymized for privacy — shows "Player 1", "Player 2", etc.
router.get('/', asyncHandler(async (req, res) => {
  const result = await store.query(
    `SELECT account_id, child_name, CAST(actual_balance AS FLOAT8) AS actual_balance, current_xp, profile_pic_url
     FROM accounts
     WHERE is_active = 1
     ORDER BY actual_balance DESC, child_name ASC`
  );
  const entries = result.rows.map((r, i) => ({
    rank: i + 1,
    account_id: r.account_id,
    display_name: `Player ${i + 1}`,
    actual_balance: r.actual_balance,
    current_xp: r.current_xp,
    profile_pic_url: r.profile_pic_url,
  }));
  res.json(entries);
}));

module.exports = router;
