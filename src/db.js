const sqlite = require('./sqlite-store');

module.exports = { store: sqlite, getDb: sqlite.getDb };
