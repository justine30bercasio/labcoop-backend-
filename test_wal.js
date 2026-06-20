const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'test_wal.db');
// Clean up any previous test files
for (const f of [DB_PATH, DB_PATH+'-wal', DB_PATH+'-shm']) {
  try { fs.unlinkSync(f); } catch(e) {}
}

// Simulate a PREVIOUS deploy: create table WITHOUT password, seed without password
const oldDb = new Database(DB_PATH);
oldDb.pragma('journal_mode = WAL');
oldDb.exec(`CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  child_name TEXT NOT NULL,
  actual_balance REAL NOT NULL DEFAULT 0.00,
  current_xp INTEGER NOT NULL DEFAULT 0,
  parent_phone TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`);
oldDb.prepare(`INSERT INTO accounts (account_id, child_name, actual_balance, current_xp) VALUES (?, ?, ?, ?)`)
  .run('00000000-0000-0000-0000-000000000001', 'Juan', 1500, 45);
oldDb.close();
console.log('Old deploy done, db closed.');

// Now simulate the NEW deploy: add columns, seed passwords
const newDb = new Database(DB_PATH);
newDb.pragma('journal_mode = WAL');
newDb.pragma('foreign_keys = ON');

// Check existing columns
const cols = newDb.prepare("PRAGMA table_info('accounts')").all().map(c => c.name);
console.log('Existing columns:', cols);

// Add missing columns
newDb.exec("ALTER TABLE accounts ADD COLUMN member_id TEXT UNIQUE");
newDb.exec("ALTER TABLE accounts ADD COLUMN password TEXT NOT NULL DEFAULT ''");
newDb.exec("ALTER TABLE accounts ADD COLUMN password_changed INTEGER NOT NULL DEFAULT 0");
console.log('Columns added.');

// Seed (INSERT OR IGNORE - should skip existing)
const hash = bcrypt.hashSync('0000', 10);
newDb.prepare(`INSERT OR IGNORE INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  .run('00000000-0000-0000-0000-000000000001', 'Juan', '000001', hash, 0, 1500, 200, 45, '', '2025-01-15T08:00:00.000Z', '2025-06-10T10:30:00.000Z');
console.log('Insert (IGNORE) done');

// UPDATE empty passwords
const info = newDb.prepare(`UPDATE accounts SET password = ?, password_changed = 0 WHERE password = '' OR password IS NULL`).run(hash);
console.log('Update result:', JSON.stringify(info));

newDb.close();
console.log('New deploy done, db closed.');

// Now simulate what getDb() does - open a NEW connection and query
let db = null;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}
const reader = getDb();
const account = reader.prepare('SELECT * FROM accounts WHERE member_id = ?').get('000001');
console.log('Account found:', !!account);
if (account) {
  console.log('Password length:', account.password.length);
  console.log('Password starts with $2b$:', account.password.startsWith('$2b$'));
  const valid = bcrypt.compareSync('0000', account.password);
  console.log('Password valid:', valid);
}
reader.close();

// Cleanup
for (const f of [DB_PATH, DB_PATH+'-wal', DB_PATH+'-shm']) {
  try { fs.unlinkSync(f); } catch(e) {}
}
console.log('DONE');
