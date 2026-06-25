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

router.put('/gcash',
  body('gcash_number').isString().notEmpty().trim(),
  body('gcash_name').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await store.setSetting('gcash_number', req.body.gcash_number);
    await store.setSetting('gcash_name', req.body.gcash_name);
    res.json({ success: true, gcash_number: req.body.gcash_number, gcash_name: req.body.gcash_name });
  })
);

module.exports = router;
