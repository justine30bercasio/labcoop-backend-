const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'test_scenario.db');
if (fs.existsSync(DB_PATH)) { 
  try { fs.unlinkSync(DB_PATH); } catch(e) {} 
  try { fs.unlinkSync(DB_PATH + '-wal'); } catch(e) {} 
  try { fs.unlinkSync(DB_PATH + '-shm'); } catch(e) {} 
}

// Simulate ensureDb
const db1 = new Database(DB_PATH);
db1.pragma('journal_mode = WAL');
db1.pragma('foreign_keys = ON');

db1.exec(`CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  child_name TEXT NOT NULL,
  member_id TEXT UNIQUE,
  password TEXT NOT NULL DEFAULT '',
  password_changed INTEGER NOT NULL DEFAULT 0,
  actual_balance REAL NOT NULL DEFAULT 0.00,
  unallocated_balance REAL NOT NULL DEFAULT 0.00,
  current_xp INTEGER NOT NULL DEFAULT 0,
  parent_phone TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`);

const hash = bcrypt.hashSync('0000', 10);
db1.prepare(`INSERT OR IGNORE INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  .run('00000000-0000-0000-0000-000000000001', 'Juan', '000001', hash, 0, 1500, 200, 45, '', '2025-01-15T08:00:00.000Z', '2025-06-10T10:30:00.000Z');

db1.prepare("UPDATE accounts SET password = ?, password_changed = 0 WHERE password = '' OR password IS NULL").run(hash);
db1.close();

console.log('db1 closed. Checking if data persists...');

// Simulate getDb() from sqlite-store.js
let db = null;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

const db2 = getDb();
try {
  const account = db2.prepare('SELECT * FROM accounts WHERE member_id = ?').get('000001');
  console.log('Account found:', !!account);
  if (account) {
    console.log('Password length:', account.password.length);
    const valid = bcrypt.compareSync('0000', account.password);
    console.log('Password valid:', valid);
  } else {
    console.log('No account found - trying direct query...');
    const all = db2.prepare('SELECT * FROM accounts').all();
    console.log('All accounts count:', all.length);
    if (all.length > 0) {
      console.log('First account:', JSON.stringify(all[0]));
    }
  }
} catch(e) {
  console.log('ERROR:', e.message);
}
db2.close();
fs.unlinkSync(DB_PATH);
console.log('DONE');
