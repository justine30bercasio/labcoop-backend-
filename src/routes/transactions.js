const express = require('express');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

router.get('/account/:accountId', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const txns = await store.getTransactions(req.params.accountId, Number(limit), Number(offset));
  res.json(txns);
}));

router.post('/', asyncHandler(async (req, res) => {
  const tx = await store.addTransaction(req.body);
  res.status(201).json(tx);
}));

router.get('/statement/:accountId', asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const txns = await store.getStatement(req.params.accountId, Number(limit), Number(offset));
  const account = await store.getAccount(req.params.accountId);
  res.json({
    account: account ? {
      account_id: account.account_id,
      child_name: account.child_name,
      member_id: account.member_id,
      actual_balance: account.actual_balance,
    } : null,
    transactions: txns,
    total: txns.length,
    limit: Number(limit),
    offset: Number(offset),
  });
}));

module.exports = router;
