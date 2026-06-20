const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { store } = require('../db');

const router = express.Router();

// GET /api/quiz/questions?difficulty=easy — list questions
router.get('/questions',
  query('difficulty').optional().isIn(['easy','medium','hard','expert']),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const questions = store.getQuizQuestions(req.query.difficulty || null);
    res.json(questions.map(q => ({
      ...q,
      options: JSON.parse(q.options),
    })));
  }
);

// GET /api/quiz/questions/:id — single question
router.get('/questions/:id',
  param('id').isString().notEmpty(),
  (req, res) => {
    const q = store.getQuizQuestion(req.params.id);
    if (!q) return res.status(404).json({ message: 'Question not found' });
    q.options = JSON.parse(q.options);
    res.json(q);
  }
);

// POST /api/quiz/questions — create (admin)
router.post('/questions',
  body('question').isString().trim().isLength({ min: 3 }).withMessage('Question is required'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('correct_index').isInt({ min: 0 }).withMessage('correct_index is required'),
  body('difficulty_level').isIn(['easy','medium','hard','expert']).withMessage('Invalid difficulty'),
  body('category').optional().isString().trim(),
  body('explanation').optional().isString().trim(),
  body('xp_reward').optional().isInt({ min: 1 }),
  body('coin_reward').optional().isInt({ min: 1 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const q = store.createQuizQuestion(req.body);
    q.options = JSON.parse(q.options);
    res.status(201).json(q);
  }
);

// PUT /api/quiz/questions/:id — update (admin)
router.put('/questions/:id',
  param('id').isString().notEmpty(),
  body('difficulty_level').optional().isIn(['easy','medium','hard','expert']),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const existing = store.getQuizQuestion(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Question not found' });
    const updated = store.updateQuizQuestion(req.params.id, req.body);
    updated.options = JSON.parse(updated.options);
    res.json(updated);
  }
);

// DELETE /api/quiz/questions/:id — delete (admin)
router.delete('/questions/:id',
  param('id').isString().notEmpty(),
  (req, res) => {
    const existing = store.getQuizQuestion(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Question not found' });
    store.deleteQuizQuestion(req.params.id);
    res.status(204).send();
  }
);

module.exports = router;
