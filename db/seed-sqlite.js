const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');

function seed() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  try {
    const insertAccount = db.prepare(`
      INSERT OR IGNORE INTO accounts (account_id, child_name, actual_balance, unallocated_balance, current_xp, parent_phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAccount.run('00000000-0000-0000-0000-000000000001', 'Juan', 1500.00, 200.00, 45, '09171234567', '2025-01-15T08:00:00.000Z', '2025-06-10T10:30:00.000Z');
    insertAccount.run('00000000-0000-0000-0000-000000000002', 'Maria', 2500.00, 500.00, 120, '09179876543', '2025-02-01T09:00:00.000Z', '2025-06-10T11:00:00.000Z');

    const insertGoal = db.prepare(`
      INSERT OR IGNORE INTO goal_jars (goal_id, account_id, title, target_amount, current_allocated, category_icon, is_completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertGoal.run('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'New School Shoes', 1000.00, 650.00, 'shoes', 0, '2025-01-20T08:00:00.000Z', '2025-06-01T10:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bicycle', 3000.00, 450.00, 'bike', 0, '2025-02-10T08:00:00.000Z', '2025-06-05T14:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Video Game', 500.00, 200.00, 'game', 0, '2025-03-01T08:00:00.000Z', '2025-06-08T16:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Art Set', 800.00, 600.00, 'toy', 0, '2025-02-15T09:00:00.000Z', '2025-06-07T12:00:00.000Z');
    insertGoal.run('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Birthday Gift for Mama', 2000.00, 1400.00, 'savings', 0, '2025-03-10T09:00:00.000Z', '2025-06-09T15:00:00.000Z');

    const insertBadge = db.prepare(`
      INSERT OR IGNORE INTO badges (badge_id, account_id, name, description, icon_url, required_xp, is_unlocked, unlocked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertBadge.run('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'First Saver', 'Made your first deposit', '/badges/first_saver.png', 10, 1, '2025-01-15T08:05:00.000Z', '2025-01-15T08:00:00.000Z');
    insertBadge.run('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Steady Saver', 'Saved consistently for a month', '/badges/steady_saver.png', 50, 0, null, '2025-01-15T08:00:00.000Z');
    insertBadge.run('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Goal Getter', 'Completed your first savings goal', '/badges/goal_getter.png', 100, 0, null, '2025-01-15T08:00:00.000Z');
    insertBadge.run('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'First Saver', 'Made your first deposit', '/badges/first_saver.png', 10, 1, '2025-02-01T09:05:00.000Z', '2025-02-01T09:00:00.000Z');
    insertBadge.run('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Steady Saver', 'Saved consistently for a month', '/badges/steady_saver.png', 50, 1, '2025-03-01T09:00:00.000Z', '2025-02-01T09:00:00.000Z');
    insertBadge.run('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'Goal Getter', 'Completed your first savings goal', '/badges/goal_getter.png', 100, 0, null, '2025-02-01T09:00:00.000Z');

    const insertShopItem = db.prepare(`
      INSERT OR IGNORE INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const avatars = [
      ['av_cat', 'Kitty', 'avatar', 0, '🐱', 'Common', '#2E7D32', '#2E7D32', ''],
      ['av_dog', 'Puppy', 'avatar', 5, '🐶', 'Common', '#2E7D32', '#2E7D32', ''],
      ['av_lion', 'Lion', 'avatar', 10, '🦁', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_tiger', 'Tiger', 'avatar', 10, '🐯', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_bear', 'Bear', 'avatar', 15, '🐻', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_panda', 'Panda', 'avatar', 15, '🐼', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_fox', 'Fox', 'avatar', 20, '🦊', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_unicorn', 'Unicorn', 'avatar', 30, '🦄', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_monkey', 'Monkey', 'avatar', 20, '🐵', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_frog', 'Frog', 'avatar', 25, '🐸', 'Epic', '#D32F2F', '#D32F2F', ''],
      ['av_owl', 'Owl', 'avatar', 25, '🦉', 'Epic', '#D32F2F', '#D32F2F', ''],
      ['av_dino', 'Dino', 'avatar', 40, '🦖', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_robot', 'Robot', 'avatar', 50, '🤖', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_ghost', 'Ghost', 'avatar', 45, '👻', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_alien', 'Alien', 'avatar', 55, '👽', 'Mythic', '#E91E63', '#E91E63', ''],
      ['av_dragon', 'Dragon', 'avatar', 80, '🐉', 'Mythic', '#E91E63', '#E91E63', ''],
    ];

    const borders = [
      ['b_default', 'Basic', 'border', 0, '', 'Common', '#2E7D32', '#2E7D32', ''],
      ['b_silver', 'Silver', 'border', 10, '', 'Uncommon', '#C0C0C0', '#9E9E9E', ''],
      ['b_gold', 'Gold', 'border', 25, '', 'Rare', '#FFD700', '#FFA000', ''],
      ['b_purple', 'Epic', 'border', 40, '', 'Epic', '#9C27B0', '#6A1B9A', ''],
      ['b_legendary', 'Legendary', 'border', 60, '', 'Legendary', '#D32F2F', '#FF6F00', ''],
      ['b_rainbow', 'Rainbow', 'border', 85, '', 'Special', '#E91E63', '#2196F3', ''],
      ['b_mythic', 'Mythic', 'border', 120, '', 'Mythic', '#00BCD4', '#304FFE', ''],
    ];

    for (const a of avatars) insertShopItem.run(...a);
    for (const b of borders) insertShopItem.run(...b);

    console.log('Shop items seeded successfully.');
    console.log('SQLite seed data inserted successfully.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

seed();
