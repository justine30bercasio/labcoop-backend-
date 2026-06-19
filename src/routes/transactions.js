const express = require('express');
const { store } = require('../db');

const router = express.Router();

router.get('/account/:accountId', (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const txns = store.getTransactions(req.params.accountId, Number(limit), Number(offset));
  res.json(txns);
});

router.post('/', (req, res) => {
  const tx = store.addTransaction(req.body);
  res.status(201).json(tx);
});

module.exports = router;
