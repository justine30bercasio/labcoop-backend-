const logger = require('./logger');

async function runAllJobs() {
  const { runAll } = require('../scheduler/dispatcher');
  return runAll();
}

function startScheduler() {
  setInterval(async () => {
    const results = await runAllJobs().catch(e => ({ errors: [e.message] }));
    if (results?.interest) logger.info('[Scheduler] Interest credited', { count: results.interest });
    if (results?.standingOrders) logger.info('[Scheduler] Standing orders processed', { count: results.standingOrders });
    if (results?.accrual) logger.info('[Scheduler] Accrual accounting complete');
    if (results?.backup) logger.info('[Scheduler] Database backup completed');
    if (results?.errors?.length) logger.error('[Scheduler] Errors', { errors: results.errors });
  }, 60 * 60 * 1000);
  logger.info('[Scheduler] Started (hourly, dev-mode setInterval)');
}

module.exports = { startScheduler, runAllJobs };
