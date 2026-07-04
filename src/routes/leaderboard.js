const express = require('express');
const router = express.Router();
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

// GET /api/leaderboard — returns all accounts sorted by savings balance DESC
router.get('/', asyncHandler(async (req, res) => {
  const result = await store.query(
    `SELECT account_id, child_name, actual_balance, current_xp, profile_pic_url
     FROM accounts
     WHERE is_active = 1
     ORDER BY actual_balance DESC, child_name ASC`
  );
  res.json(result.rows);
}));

module.exports = router;
