const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

router.get('/gcash',
  asyncHandler(async (req, res) => {
    const gcashNumber = await store.getSetting('gcash_number');
    const gcashName = await store.getSetting('gcash_name');
    res.json({
      gcash_number: gcashNumber || '09171234567',
      gcash_name: gcashName || 'LabCoop Savings',
    });
  })
);

// GCash settings are managed via admin Settings page only — no user-facing PUT endpoint
// Users can only read the GCash info for reference purposes via GET /api/settings/gcash

module.exports = router;
