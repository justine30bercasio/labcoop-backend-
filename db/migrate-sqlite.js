const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');

function migrate() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_init_sqlite.sql'),
      'utf8'
    );
    db.exec(sql);
    console.log('SQLite migration 001_init_sqlite completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
