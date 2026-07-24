const express = require('express');
const { asyncHandler } = require('../async-handler');
const logger = require('../services/logger');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  const { runAllJobs } = require('../services/scheduler');
  const startTime = Date.now();
  const results = await runAllJobs();
  const duration = Date.now() - startTime;
  logger.info('[SchedulerRun] Manual trigger', { duration_ms: duration, interest: results.interest, standingOrders: results.standingOrders, accrual: results.accrual, errors: results.errors?.length || 0 });
  res.json({ ...results, duration_ms: duration });
}));

module.exports = router;
