const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../async-handler');
const { store, sqlite } = require('../db');
const sql = (q, ...p) => store.query(q, p).then(r => r.rows);
const one = (q, ...p) => store.query(q, p).then(r => r.rows[0]);
router.post('/shop/create', requireSession, shopUpload.single('image'), asyncHandler(async (req, res) => {
  try {

    const { name, type, cost, rarity, emoji } = req.body;
    if (!name || !type) return res.redirect('/admin/shop?error=Name+and+type+required');
    const id = `shop_${require('crypto').randomBytes(4).toString('hex')}`;
    await store.query(`
      INSERT INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
    `, [id, name.trim(), type, Number(cost) || 0, emoji || '', rarity || 'Common', '#2E7D32', '#2E7D32', '']);
    const { v4: uuidv4 } = require('uuid');
    if (req.file) {
      const ext = require('path').extname(req.file.originalname).toLowerCase();
      const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
      const dest = require('path').join(__dirname, '..', 'uploads', 'shop', filename);
      require('fs').renameSync(req.file.path, dest);
      const imageUrl = '/uploads/shop/' + filename;
      await store.query("UPDATE shop_items SET image_url=$1 WHERE id=$2", [imageUrl, id]);
    }
    res.redirect('/admin/shop?added=ok');
  } catch (err) {
    res.redirect(`/admin/shop?error=${encodeURIComponent(err.message)}`);
  }
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
      const filePath = require('path').join(__dirname, '..', existing.image_url);
module.exports = router;
