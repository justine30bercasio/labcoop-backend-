const registry = require('./jobs.registry');
const { store } = require('../db');
const logger = require('../services/logger');

async function runSingle(jobName) {
  const job = registry.find(j => j.name === jobName);
  if (!job) throw new Error('Unknown job: ' + jobName);

  const key = job.executionKey();
  const done = await store.getSuccessfulJob(jobName, key);
  if (done) {
    logger.info('[Dispatcher] Job already completed, skipping', { job: jobName, key });
    return { skipped: jobName };
  }

  const jobId = await store.createJob(jobName, key);
  const startTime = Date.now();

  try {
    const result = (await job.handler()) || {};
    const duration = Date.now() - startTime;
    await store.updateJob(jobId, {
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_ms: duration,
      result_summary: JSON.stringify(result),
    });
    logger.info('[Dispatcher] Job completed', { job: jobName, key, duration_ms: duration });
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    await store.updateJob(jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_ms: duration,
      failed_reason: err.message,
    });
    logger.error('[Dispatcher] Job failed', { job: jobName, key, error: err.message });
    throw err;
  }
}

async function runAll() {
  const results = { interest: 0, standingOrders: 0, accrual: false, backup: false, errors: [] };

  for (const job of registry) {
    try {
      const r = await runSingle(job.name);
      if (r && r.skipped) continue;
      if (r.interest !== undefined) results.interest = r.interest;
      if (r.standingOrders !== undefined) results.standingOrders = r.standingOrders;
      if (r.accrual) results.accrual = true;
      if (r.backup) results.backup = true;
      if (r.errors) results.errors.push(...r.errors);
    } catch (err) {
      results.errors.push(job.name + ': ' + err.message);
    }
  }

  return results;
}

async function runNamed(names) {
  const results = { interest: 0, standingOrders: 0, accrual: false, backup: false, errors: [] };
  const nameSet = new Set(names);

  for (const job of registry) {
    if (!nameSet.has(job.name)) continue;
    try {
      const r = await runSingle(job.name);
      if (r && r.skipped) continue;
      if (r.interest !== undefined) results.interest = r.interest;
      if (r.standingOrders !== undefined) results.standingOrders = r.standingOrders;
      if (r.accrual) results.accrual = true;
      if (r.backup) results.backup = true;
      if (r.errors) results.errors.push(...r.errors);
    } catch (err) {
      results.errors.push(job.name + ': ' + err.message);
    }
  }

  return results;
}

module.exports = { runSingle, runAll, runNamed };
