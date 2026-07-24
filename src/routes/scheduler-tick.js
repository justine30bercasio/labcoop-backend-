const express = require('express');
const { asyncHandler } = require('../async-handler');
const { runAllJobs } = require('../services/scheduler');
const logger = require('../services/logger');

const router = express.Router();

router.post('/tick', asyncHandler(async (req, res) => {
  const signature = req.headers['upstash-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing Upstash signature' });
  }

  const { Receiver } = require('@upstash/qstash');
  const r = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
  });

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const isValid = await r.verify({
    signature,
    body,
    url: req.protocol + '://' + req.get('host') + req.originalUrl,
  }).catch(() => false);

  if (!isValid && process.env.NODE_ENV === 'production') {
    logger.warn('[SchedulerTick] Invalid QStash signature');
    return res.status(401).json({ error: 'Invalid Upstash signature' });
  }

  const startTime = Date.now();
  const results = await runAllJobs();
  const duration = Date.now() - startTime;

  logger.info('[SchedulerTick] Run completed', {
    duration_ms: duration,
    interest: results.interest,
    standingOrders: results.standingOrders,
    accrual: results.accrual,
    backup: results.backup,
    errors: results.errors?.length || 0,
  });

  if (results.errors?.length) {
    return res.status(200).json({ ...results, duration_ms: duration, warning: 'Partial errors' });
  }
  res.json({ ...results, duration_ms: duration });
}));

module.exports = router;
