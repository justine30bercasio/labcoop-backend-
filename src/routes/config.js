const express = require('express');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const raw = await store.getSetting('feature_flags') || '{}';
  res.json({ feature_flags: JSON.parse(raw) });
}));

module.exports = router;
