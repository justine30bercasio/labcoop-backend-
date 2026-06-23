const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://avnadmin:AVNS_6WNd_89WakcXaqpzevt@jthedev-jbercasio30-f9f6.k.aivencloud.com:27185/defaultdb',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const r = await client.query('SELECT COUNT(*) as cnt FROM accounts');
  console.log('Aiven accounts:', r.rows[0].cnt);
  const r2 = await client.query('SELECT child_name FROM accounts');
  r2.rows.forEach(r => console.log(' -', r.child_name));
  await client.end();
}).catch(e => console.error('Error:', e.message));
