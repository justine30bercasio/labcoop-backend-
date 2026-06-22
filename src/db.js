const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL || '';

if (DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://')) {
  const PgStore = require('./pg-store');
  const pgStore = new PgStore(DATABASE_URL);

  async function getDb() {
    await pgStore._ensureSchema();
    return pgStore;
  }

  module.exports = { store: pgStore, getDb, isPostgres: true };
} else {
  const sqlite = require('./sqlite-store');
  module.exports = { store: sqlite, getDb: sqlite.getDb, isPostgres: false };
}
