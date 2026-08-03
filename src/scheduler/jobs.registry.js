const interestPosting = require('../jobs/interestPosting.job');
// Standing orders (auto-save) processing is DISABLED: auto-save is a reminder
// feature only — deposits are done in-office, online deposits are not used for
// kids. Enabling the job previously crashed on PostgreSQL (SQLite-only
// datetime('now')) and could double-count unallocated balance.
// const standingOrders = require('../jobs/standingOrders.job');
const accrualAccounting = require('../jobs/accrualAccounting.job');
const backup = require('../jobs/backup.job');

const registry = [
  interestPosting,
  accrualAccounting,
  backup,
];

module.exports = registry;
