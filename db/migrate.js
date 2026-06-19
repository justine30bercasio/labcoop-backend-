const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_init.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('Migration 001_init completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
