const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      INSERT INTO accounts (account_id, child_name, actual_balance, unallocated_balance, current_xp)
      VALUES
        ('00000000-0000-0000-0000-000000000001', 'Juan', 1500.00, 200.00, 45),
        ('00000000-0000-0000-0000-000000000002', 'Maria', 2500.00, 500.00, 120)
      ON CONFLICT (account_id) DO NOTHING;

      INSERT INTO goal_jars (goal_id, account_id, title, target_amount, current_allocated, category_icon)
      VALUES
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'New School Shoes', 1000.00, 650.00, 'shoes'),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bicycle', 3000.00, 450.00, 'bike'),
        ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Video Game', 500.00, 200.00, 'game'),
        ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Art Set', 800.00, 600.00, 'toy'),
        ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Birthday Gift for Mama', 2000.00, 1400.00, 'savings')
      ON CONFLICT (goal_id) DO NOTHING;

      INSERT INTO badges (badge_id, account_id, name, description, icon_url, required_xp, is_unlocked)
      VALUES
        ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'First Saver', 'Made your first deposit', '/badges/first_saver.png', 10, true),
        ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Steady Saver', 'Saved consistently for a month', '/badges/steady_saver.png', 50, false),
        ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Goal Getter', 'Completed your first savings goal', '/badges/goal_getter.png', 100, false),
        ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'First Saver', 'Made your first deposit', '/badges/first_saver.png', 10, true),
        ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Steady Saver', 'Saved consistently for a month', '/badges/steady_saver.png', 50, true),
        ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'Goal Getter', 'Completed your first savings goal', '/badges/goal_getter.png', 100, false)
      ON CONFLICT (badge_id) DO NOTHING;
    `);

    console.log('Seed data inserted successfully.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
