const interestPosting = require('../jobs/interestPosting.job');
const standingOrders = require('../jobs/standingOrders.job');
const accrualAccounting = require('../jobs/accrualAccounting.job');
const backup = require('../jobs/backup.job');

const registry = [
  interestPosting,
  standingOrders,
  accrualAccounting,
  backup,
];

module.exports = registry;
