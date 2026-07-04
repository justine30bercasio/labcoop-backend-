const express = require('express');
const router = express.Router();
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

// GET /api/board — public, returns all board members sorted by sort_order
router.get('/', asyncHandler(async (req, res) => {
  const result = await store.query('SELECT id, name, position, image_url, sort_order FROM board_members ORDER BY sort_order ASC, created_at ASC');
  res.json(result.rows);
}));

module.exports = router;
