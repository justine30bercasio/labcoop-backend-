}));

router.post('/shop/update/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/shop?error=Item+not+found');
    const { name, cost, rarity, emoji, color1, color2, is_active } = req.body;
    await store.query(`
      UPDATE shop_items SET name=$1, cost=$2, emoji=$3, rarity=$4, color1=$5, color2=$6, is_active=$7, updated_at=datetime('now')
      WHERE id=$8
    `, [
      name ?? existing.name, Number(cost ?? existing.cost),
      emoji ?? existing.emoji, rarity ?? existing.rarity,
      color1 ?? existing.color1, color2 ?? existing.color2,
      is_active !== undefined ? (is_active === '1' ? 1 : 0) : existing.is_active,
      req.params.id
    );
    res.redirect('/admin/shop?updated=ok');
  } catch (err) {
    res.redirect(`/admin/shop?error=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/shop/delete/:id', requireSession, asyncHandler(async (req, res) => {
  try {

    const existing = await one('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
    if (!existing) return res.redirect('/admin/shop?error=Item+not+found');
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
