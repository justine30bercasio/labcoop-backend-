const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'shop');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ('.png,.jpg,.jpeg,.gif,.webp,.svg'.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (png, jpg, gif, webp, svg) are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function shopItemRow(row) {
  return row ? { ...row, cost: Number(row.cost), is_active: Boolean(row.is_active) } : null;
}

router.get('/items', asyncHandler(async (req, res) => {
  const type = req.query.type;
  let items;
  if (type && (type === 'avatar' || type === 'border')) {
    const result = await store.query('SELECT * FROM shop_items WHERE type = $1 AND is_active = 1 ORDER BY cost ASC', [type]);
    items = result.rows;
  } else {
    const result = await store.query('SELECT * FROM shop_items WHERE is_active = 1 ORDER BY type, cost ASC');
    items = result.rows;
  }
  res.json(items.map(shopItemRow));
}));

router.get('/items/all', asyncHandler(async (req, res) => {
  const result = await store.query('SELECT * FROM shop_items ORDER BY type, cost ASC');
  res.json(result.rows.map(shopItemRow));
}));

router.post('/items', asyncHandler(async (req, res) => {
  const { name, type, cost, emoji, rarity, color1, color2, image_url } = req.body;
  if (!name || !type) {
    return res.status(400).json({ message: 'Name and type are required' });
  }
  if (!['avatar', 'border'].includes(type)) {
    return res.status(400).json({ message: 'Type must be avatar or border' });
  }
  const id = `shop_${uuidv4().slice(0, 8)}`;
  await store.query(
    'INSERT INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)',
    [id, name, type, Number(cost) || 0, emoji || '', rarity || 'Common', color1 || '#2E7D32', color2 || '#2E7D32', image_url || '']
  );
  const result = await store.query('SELECT * FROM shop_items WHERE id = $1', [id]);
  res.status(201).json(shopItemRow(result.rows[0]));
}));

router.put('/items/:id', asyncHandler(async (req, res) => {
  const existingResult = await store.query('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ message: 'Shop item not found' });
  const { name, cost, emoji, rarity, color1, color2, image_url, is_active } = req.body;
  await store.query(
    "UPDATE shop_items SET name=$1, cost=$2, emoji=$3, rarity=$4, color1=$5, color2=$6, image_url=$7, is_active=$8, updated_at=NOW() WHERE id=$9",
    [
      name ?? existing.name, Number(cost ?? existing.cost), emoji ?? existing.emoji,
      rarity ?? existing.rarity, color1 ?? existing.color1, color2 ?? existing.color2,
      image_url ?? existing.image_url, is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      req.params.id,
    ]
  );
  const result = await store.query('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
  res.json(shopItemRow(result.rows[0]));
}));

router.delete('/items/:id', asyncHandler(async (req, res) => {
  const existingResult = await store.query('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ message: 'Shop item not found' });
  if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', existing.image_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await store.query('DELETE FROM shop_items WHERE id = $1', [req.params.id]);
  res.json({ message: 'Shop item deleted' });
}));

router.post('/items/:id/upload', upload.single('image'), asyncHandler(async (req, res) => {
  const existingResult = await store.query('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ message: 'Shop item not found' });
  if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });
  const imageUrl = '/uploads/shop/' + req.file.filename;
  if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
    const oldFile = path.join(__dirname, '..', existing.image_url);
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }
  await store.query("UPDATE shop_items SET image_url=$1, updated_at=NOW() WHERE id=$2", [imageUrl, req.params.id]);
  const result = await store.query('SELECT * FROM shop_items WHERE id = $1', [req.params.id]);
  res.json(shopItemRow(result.rows[0]));
}));

module.exports = router;
