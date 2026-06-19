const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

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

router.get('/items', (req, res) => {
  try {
    const db = getDb();
    const type = req.query.type;
    let items;
    if (type && (type === 'avatar' || type === 'border')) {
      items = db.prepare('SELECT * FROM shop_items WHERE type = ? AND is_active = 1 ORDER BY cost ASC').all(type);
    } else {
      items = db.prepare('SELECT * FROM shop_items WHERE is_active = 1 ORDER BY type, cost ASC').all();
    }
    res.json(items.map(shopItemRow));
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch shop items', error: err.message });
  }
});

router.get('/items/all', (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare('SELECT * FROM shop_items ORDER BY type, cost ASC').all();
    res.json(items.map(shopItemRow));
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch shop items', error: err.message });
  }
});

router.post('/items', (req, res) => {
  try {
    const db = getDb();
    const { name, type, cost, emoji, rarity, color1, color2, image_url } = req.body;
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }
    if (!['avatar', 'border'].includes(type)) {
      return res.status(400).json({ message: 'Type must be avatar or border' });
    }
    const id = `shop_${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, name, type, Number(cost) || 0, emoji || '', rarity || 'Common', color1 || '#2E7D32', color2 || '#2E7D32', image_url || '');
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id);
    res.status(201).json(shopItemRow(item));
  } catch (err) {
    res.status(500).json({ message: 'Failed to create shop item', error: err.message });
  }
});

router.put('/items/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Shop item not found' });
    const { name, cost, emoji, rarity, color1, color2, image_url, is_active } = req.body;
    db.prepare(`
      UPDATE shop_items SET name=?, cost=?, emoji=?, rarity=?, color1=?, color2=?, image_url=?, is_active=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      name ?? existing.name, Number(cost ?? existing.cost), emoji ?? existing.emoji,
      rarity ?? existing.rarity, color1 ?? existing.color1, color2 ?? existing.color2,
      image_url ?? existing.image_url, is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      req.params.id
    );
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    res.json(shopItemRow(item));
  } catch (err) {
    res.status(500).json({ message: 'Failed to update shop item', error: err.message });
  }
});

router.delete('/items/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Shop item not found' });
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', existing.image_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM shop_items WHERE id = ?').run(req.params.id);
    res.json({ message: 'Shop item deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete shop item', error: err.message });
  }
});

router.post('/items/:id/upload', upload.single('image'), (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Shop item not found' });
    if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });
    const imageUrl = '/uploads/shop/' + req.file.filename;
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const oldFile = path.join(__dirname, '..', existing.image_url);
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }
    db.prepare("UPDATE shop_items SET image_url=?, updated_at=datetime('now') WHERE id=?").run(imageUrl, req.params.id);
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    res.json(shopItemRow(item));
  } catch (err) {
    res.status(500).json({ message: 'Failed to upload image', error: err.message });
  }
});

module.exports = router;
