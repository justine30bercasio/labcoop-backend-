const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

try {
  const cols = db.prepare('PRAGMA table_info(accounts)').all();
  const hasPassword = cols.some(c => c.name === 'password');
  if (!hasPassword) {
    db.exec('ALTER TABLE accounts ADD COLUMN password TEXT NOT NULL DEFAULT \'\'');
    console.log('Added password column');
  } else {
    console.log('Password column already exists');
  }

  const defaultHash = bcrypt.hashSync('0000', 10);
  const accounts = db.prepare('SELECT account_id, child_name FROM accounts').all();
  for (const acc of accounts) {
    const existing = db.prepare('SELECT password FROM accounts WHERE account_id = ?').get(acc.account_id);
    if (!existing.password || existing.password === '') {
      db.prepare('UPDATE accounts SET password = ? WHERE account_id = ?').run(defaultHash, acc.account_id);
      console.log('Set password for ' + acc.child_name);
    }
  }
  console.log('Default passwords set to: 0000');
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
