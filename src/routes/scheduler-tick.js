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

  // req.rawBody is set by express.json() verify callback — keeps the exact raw bytes QStash signed
  const body = req.rawBody || '';
  const url = req.protocol + '://' + req.get('host') + req.originalUrl;
  const isValid = await r.verify({ signature, body, url }).catch(() => false);

  if (!isValid) {
    logger.warn('[SchedulerTick] Invalid QStash signature', { url, bodyLen: body.length, hasSig: !!signature });
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Invalid Upstash signature' });
    }
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
