const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'faces');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Ensure face_templates table exists (in case batch schema didn't create it)
store.query(`CREATE TABLE IF NOT EXISTS face_templates (
  template_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  face_descriptor TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT
)`).catch(err => console.error('Face: create table error:', err.message));

const faceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'face-' + uniqueSuffix + '.jpg');
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .jpg, .jpeg, and .png files are allowed'));
    }
    cb(null, true);
  },
});

function parseSignature(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

function compareSignatures(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let totalDiff = 0;
  for (let i = 0; i < a.length; i++) {
    totalDiff += Math.abs(a[i] - b[i]);
  }
  const avgDiff = totalDiff / a.length;
  const score = Math.max(0, 1 - avgDiff * 2);
  return Math.round(score * 100) / 100;
}

// POST /api/face/enroll
router.post('/enroll', faceUpload.single('selfie'), asyncHandler(async (req, res) => {
  try {
    const accountId = req.accountId;
    console.log(`Face enroll: attempt for accountId=${accountId}, hasFile=${!!req.file}, sig=${req.body.face_signature ? req.body.face_signature.substring(0,40) : 'none'}`);
    if (!accountId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Selfie image is required' });
    }

    let signature = parseSignature(req.body.face_signature);
    if (!signature) {
      console.warn(`Face enroll: invalid signature for ${accountId}`);
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Valid face signature is required' });
    }

    const imageUrl = '/uploads/faces/' + req.file.filename;
    const now = new Date().toISOString();

    let existing;
    try {
      existing = await store.query('SELECT template_id FROM face_templates WHERE account_id = $1', [accountId]);
    } catch (err) {
      console.error('Face enroll: query face_templates failed:', err.message);
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ message: 'Database error: face_templates table may not exist' });
    }

    try {
      if (existing.rows.length > 0) {
        await store.query(
          'UPDATE face_templates SET face_descriptor = $1, image_url = $2, updated_at = $3 WHERE account_id = $4',
          [JSON.stringify(signature), imageUrl, now, accountId]
        );
        console.log(`Face enroll: UPDATED template for ${accountId}`);
      } else {
        const templateId = uuidv4();
        await store.query(
          'INSERT INTO face_templates (template_id, account_id, face_descriptor, image_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [templateId, accountId, JSON.stringify(signature), imageUrl, now, now]
        );
        console.log(`Face enroll: INSERTED template for ${accountId} (${templateId})`);
      }
    } catch (err) {
      console.error('Face enroll: write failed:', err.message);
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ message: 'Failed to save face template: ' + err.message });
    }

    res.json({ success: true, message: 'Face enrolled successfully' });
  } catch (err) {
    console.error('Face enroll error:', err);
    res.status(500).json({ message: 'Server error during enrollment' });
  }
}));

// POST /api/face/verify
router.post('/verify', faceUpload.single('selfie'), asyncHandler(async (req, res) => {
  const accountId = req.accountId;
  if (!accountId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Selfie image is required' });
  }

  const signature = parseSignature(req.body.face_signature);
  if (!signature) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: 'Valid face signature is required' });
  }

  const result = await store.query(
    'SELECT face_descriptor FROM face_templates WHERE account_id = $1',
    [accountId]
  );

  if (result.rows.length === 0) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ message: 'No face enrolled for this account. Please enroll first.' });
  }

  const storedSignature = JSON.parse(result.rows[0].face_descriptor);
  const score = compareSignatures(signature, storedSignature);

  let verdict;
  if (score >= 0.85) {
    verdict = 'VERIFIED';
  } else if (score >= 0.70) {
    verdict = 'REVIEW';
  } else {
    verdict = 'REJECT';
  }

  res.json({
    success: verdict === 'VERIFIED',
    similarity: score,
    verdict,
    message: verdict === 'VERIFIED'
      ? 'Face verified successfully'
      : verdict === 'REVIEW'
        ? 'Low confidence match. Please try again with better lighting.'
        : 'Face does not match. Access denied.',
  });
}));

router.get('/status/:accountId', asyncHandler(async (req, res) => {
  try {
    const result = await store.query(
      'SELECT created_at, updated_at FROM face_templates WHERE account_id = $1',
      [req.params.accountId]
    );
    const enrolled = result.rows.length > 0;
    return res.json({
      enrolled,
      enrolledAt: enrolled ? result.rows[0].created_at : null,
      updatedAt: enrolled ? result.rows[0].updated_at : null,
    });
  } catch (err) {
    console.error('Face status error:', err.message);
    return res.json({ enrolled: false, enrolledAt: null, updatedAt: null });
  }
}));

router.delete('/:accountId', asyncHandler(async (req, res) => {
  await store.query('DELETE FROM face_templates WHERE account_id = $1', [req.params.accountId]);
  res.json({ success: true, message: 'Face template removed' });
}));

module.exports = router;
