const express = require('express');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');

const PROFILE_DIR = path.join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILE_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `profile-${req.params.accountId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only .jpg, .jpeg, .png, .gif allowed'));
    cb(null, true);
  },
});

const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many deposit attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

router.get('/:accountId',
  param('accountId').isString().notEmpty().trim().withMessage('accountId is required'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const account = await store.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json({
      ...account,
      actual_balance: Number(account.actual_balance),
      unallocated_balance: Number(account.unallocated_balance),
      current_xp: Number(account.current_xp),
    });
  })
);

router.put('/:accountId',
  param('accountId').isString().notEmpty().trim(),
  body('child_name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('parent_phone').optional().isString().isLength({ max: 20 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { child_name, parent_phone } = req.body;
    const updated = await store.updateAccount(req.params.accountId, {
      child_name,
      parent_phone,
    });
    if (!updated) return res.status(404).json({ message: 'Account not found' });
    res.json(updated);
  })
);

router.put('/:accountId/deposit',
  depositLimiter,
  param('accountId').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount } = req.body;
    const runDeposit = async (tx) => {
      const account = await store.getAccount(req.params.accountId, tx);
      if (!account) throw new Error('Account not found');

      const updated = await store.updateAccount(req.params.accountId, {
        actual_balance: Math.round((Number(account.actual_balance) + Number(amount)) * 100) / 100,
        unallocated_balance: Math.round((Number(account.unallocated_balance) + Number(amount)) * 100) / 100,
      }, tx);

      await store.addTransaction({
        account_id: req.params.accountId,
        type: 'deposit',
        amount: Number(amount),
        description: 'Teller cash deposit',
      }, tx);

      return updated;
    };

    try {
      const updated = isPostgres ? await store.transaction(async (tx) => {
        const result = await runDeposit(tx);
        return result;
      }) : await runDeposit();
      res.json(updated);
    } catch (e) {
      res.status(404).json({ message: e.message });
    }
  })
);

router.post('/:accountId/profile-photo',
  profileUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const url = `/uploads/profiles/${req.file.filename}`;
    await store.updateAccount(req.params.accountId, { profile_pic_url: url });
    res.json({ profile_pic_url: url });
  })
);

module.exports = router;
