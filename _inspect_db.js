const { getDb } = require('./src/sqlite-store');
const db = getDb();
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
for (const t of tables) {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM "' + t.name + '"').get();
  console.log('=== ' + t.name + ' (' + cnt.c + ' rows) ===');
  console.log(t.sql);
  console.log();
}
