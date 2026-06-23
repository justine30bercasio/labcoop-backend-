// Test if template literal with SQL works
async function test() {
  const store = { query: (q, arr) => ({ rows: [] }) };
  const existing = { name: 'test', cost: 10, emoji: 'x', rarity: 'Common', color1: '#000', color2: '#fff', is_active: 1 };
  const is_active = '1';
  const name = 'newname';
  const cost = '15';
  const emoji = 'y';
  const rarity = 'Rare';
  const color1 = '#111';
  const color2 = '#222';
  await store.query(`
    UPDATE shop_items SET name=$1, cost=$2, emoji=$3, rarity=$4, color1=$5, color2=$6, is_active=$7, updated_at=datetime('now')
    WHERE id=$8
  `, [
    name ?? existing.name, Number(cost ?? existing.cost),
    emoji ?? existing.emoji, rarity ?? existing.rarity,
    color1 ?? existing.color1, color2 ?? existing.color2,
    is_active !== undefined ? (is_active === '1' ? 1 : 0) : existing.is_active,
    'abc123'
  ]);
  console.log('OK');
}
test().catch(e => console.log('Error:', e.message));
