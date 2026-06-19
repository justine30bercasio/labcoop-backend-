const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coop_goals (
      goal_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_allocated REAL NOT NULL DEFAULT 0.00,
      category_icon TEXT NOT NULL DEFAULT '🎯',
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('coop_goals table ready');

  db.exec(`
    CREATE TABLE IF NOT EXISTS coop_contributions (
      contribution_id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES coop_goals(goal_id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('coop_contributions table ready');

  db.exec('CREATE INDEX IF NOT EXISTS idx_coop_contributions_goal ON coop_contributions(goal_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_coop_contributions_account ON coop_contributions(account_id)');
  console.log('Indexes created');
} catch (e) {
  console.error('Error:', e.message);
}
db.close();
