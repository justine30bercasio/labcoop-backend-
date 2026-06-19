const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

try {
  const cols = db.prepare('PRAGMA table_info(accounts)').all();
  
  const hasPwChanged = cols.some(c => c.name === 'password_changed');
  if (!hasPwChanged) {
    db.exec("ALTER TABLE accounts ADD COLUMN password_changed INTEGER NOT NULL DEFAULT 0");
    console.log('Added password_changed column');
  }

  const hasMemberId = cols.some(c => c.name === 'member_id');
  if (!hasMemberId) {
    db.exec("ALTER TABLE accounts ADD COLUMN member_id TEXT");
    console.log('Added member_id column');

    const accounts = db.prepare('SELECT account_id FROM accounts ORDER BY rowid ASC').all();
    const update = db.prepare('UPDATE accounts SET member_id = ? WHERE account_id = ?');
    accounts.forEach((acc, i) => {
      const mid = String(i + 1).padStart(6, '0');
      update.run(mid, acc.account_id);
      console.log(`  ${acc.account_id} -> ${mid}`);
    });
  } else {
    console.log('member_id column already exists');
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE password_changed = 0').get().c;
  console.log(`${count} account(s) need password change`);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
