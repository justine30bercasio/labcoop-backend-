const { store, isPostgres } = require('./src/db');

async function main() {
  if (!isPostgres) { console.log('Not connected to PostgreSQL'); return; }
  
  const result = await store.query('SELECT account_id, child_name, member_id FROM accounts ORDER BY created_at');
  console.log('Found ' + result.rows.length + ' accounts');
  
  let nextId = 1;
  for (const a of result.rows) {
    if (!a.member_id) {
      const newId = String(nextId).padStart(6, '0');
      await store.query('UPDATE accounts SET member_id = $1 WHERE account_id = $2', [newId, a.account_id]);
      console.log('Assigned ' + newId + ' to ' + a.child_name);
      nextId++;
    } else {
      const num = parseInt(a.member_id, 10);
      if (num >= nextId) nextId = num + 1;
    }
  }
  
  const final = await store.query('SELECT child_name, member_id, actual_balance FROM accounts ORDER BY created_at');
  console.log('\nFinal:');
  final.rows.forEach(r => console.log('  ' + r.child_name + ' -> ' + r.member_id));
}

main().catch(e => console.error('Error:', e.message));
