const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

function parseOptions(q) {
  if (!q) return null;
  try { q.options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch (_) {}
  return q;
}

router.get('/questions',
  query('difficulty').optional().isIn(['easy','medium','hard','expert']),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const questions = await store.getQuizQuestions(req.query.difficulty || null);
    res.json(questions.map(parseOptions));
  })
);

router.get('/questions/:id',
  param('id').isString().notEmpty(),
  asyncHandler(async (req, res) => {
    const q = parseOptions(await store.getQuizQuestion(req.params.id));
    if (!q) return res.status(404).json({ message: 'Question not found' });
    res.json(q);
  })
);

router.post('/questions',
  body('question').isString().trim().isLength({ min: 3 }).withMessage('Question is required'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('correct_index').isInt({ min: 0 }).withMessage('correct_index is required'),
  body('difficulty_level').isIn(['easy','medium','hard','expert']).withMessage('Invalid difficulty'),
  body('category').optional().isString().trim(),
  body('explanation').optional().isString().trim(),
  body('xp_reward').optional().isInt({ min: 1 }),
  body('coin_reward').optional().isInt({ min: 1 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const q = parseOptions(await store.createQuizQuestion(req.body));
    res.status(201).json(q);
  })
);

router.put('/questions/:id',
  param('id').isString().notEmpty(),
  body('difficulty_level').optional().isIn(['easy','medium','hard','expert']),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const existing = await store.getQuizQuestion(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Question not found' });
    const updated = parseOptions(await store.updateQuizQuestion(req.params.id, req.body));
    res.json(updated);
  })
);

router.delete('/questions/:id',
  param('id').isString().notEmpty(),
  asyncHandler(async (req, res) => {
    const existing = await store.getQuizQuestion(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Question not found' });
    await store.deleteQuizQuestion(req.params.id);
    res.status(204).send();
  })
);

module.exports = router;
