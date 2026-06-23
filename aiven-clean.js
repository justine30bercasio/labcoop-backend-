const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://avnadmin:AVNS_6WNd_89WakcXaqpzevt@jthedev-jbercasio30-f9f6.k.aivencloud.com:27185/defaultdb',
  ssl: { rejectUnauthorized: false }
});
async function main() {
  await client.connect();
  console.log('Connected to Aiven PG');
  
  // Check existing tables
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('Existing tables:', tables.rows.map(r => r.table_name).join(', '));
  
  if (tables.rows.length === 0) {
    console.log('No tables exist yet - the schema hasn been created.');
    console.log('Start the Render backend to let it create the schema, then run this again.');
    await client.end();
    return;
  }
  
  // Clean user data
  const toDelete = ['loan_payments','transactions','badges','goal_jars','loans','withdrawal_requests','standing_orders','savings_applications','coop_contributions','coop_goals','accounts'];
  await client.query('BEGIN');
  try {
    for (const t of toDelete) {
      const r = await client.query(`DELETE FROM "${t}"`);
      console.log(`  Deleted ${r.rowCount} from ${t}`);
    }
    await client.query('COMMIT');
    console.log('Database reset complete - all user data cleared');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Reset failed:', e.message);
  }
  await client.end();
}
main().catch(e => console.error('Failed:', e.message));
