const express = require('express');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { store, isPostgres } = require('../db');
const { asyncHandler } = require('../async-handler');
const { requireConsent } = require('../middleware/auth');
const fileStorage = require('../services/file-storage');

const profileUpload = multer({
  storage: multer.memoryStorage(),
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
  body('parent_email').optional().isString().isEmail(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { child_name, parent_phone, parent_email } = req.body;
    const updates = {};
    if (child_name !== undefined) updates.child_name = child_name;
    if (parent_phone !== undefined) updates.parent_phone = parent_phone;
    if (parent_email !== undefined) updates.parent_email = parent_email;
    const updated = await store.updateAccount(req.params.accountId, updates);
    if (!updated) return res.status(404).json({ message: 'Account not found' });
    res.json(updated);
  })
);

router.put('/:accountId/deposit',
  depositLimiter,
  requireConsent,
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

      const txRecord = await store.addTransaction({
        account_id: req.params.accountId,
        type: 'deposit',
        amount: Number(amount),
        description: 'Teller cash deposit',
      }, tx);

      // Post GL entry
      const gl = require('../services/gl');
      const glTxId = txRecord?.transaction_id || uuidv4();
      const orNumber = await store.assignOrNumber('deposit');
      await gl.postDoubleEntry(glTxId, [
        { account_code: '1000', debit: Number(amount), description: 'API deposit: ' + (account.child_name || 'Member') },
        { account_code: '2000', credit: Number(amount), description: 'API deposit: ' + (account.child_name || 'Member') }
      ], { postedBy: 'api', referenceType: 'deposit', referenceNumber: orNumber, tx });

      return { ...updated, transaction_id: txRecord?.transaction_id || glTxId };
    };

    try {
      const result = isPostgres ? await store.transaction(async (tx) => {
        return await runDeposit(tx);
      }) : await runDeposit();
      // Audit log
      try {
        const audit = require('../services/audit');
        await audit.log(req, 'API_DEPOSIT', 'account', req.params.accountId, { amount: Number(amount) }, req.params.accountId);
      } catch (auditErr) {
        console.error('[Accounts] Audit log failed:', auditErr.message);
      }
      res.json(result);
    } catch (e) {
      res.status(404).json({ message: e.message });
    }
  })
);

// ── Generate temporary link code for parent linking ──
router.post('/:accountId/generate-link-code',
  param('accountId').isString().notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const account = await store.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await store.query(
      'UPDATE accounts SET link_code = $1, link_code_expires_at = $2 WHERE account_id = $3',
      [code, expiresAt, req.params.accountId]
    );
    res.json({ linkCode: code, expiresAt, message: 'Share this code with your parent. It expires in 5 minutes.' });
  })
);

router.post('/:accountId/profile-photo',
  profileUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `profile-${req.params.accountId}-${Date.now()}${ext}`;
    await fileStorage.uploadFile(req.file.buffer, 'profiles/' + filename, req.file.mimetype);
    const oldAccount = await store.getAccount(req.params.accountId);
    if (oldAccount && oldAccount.profile_pic_url) {
      const oldKey = fileStorage.keyFromUrl(oldAccount.profile_pic_url);
      if (oldKey) fileStorage.deleteFile(oldKey);
    }
    const url = '/uploads/profiles/' + filename;
    await store.updateAccount(req.params.accountId, { profile_pic_url: url });
    res.json({ profile_pic_url: url });
  })
);

module.exports = router;
