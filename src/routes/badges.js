const express = require('express');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

router.get('/account/:accountId', asyncHandler(async (req, res) => {
  const badges = await store.getBadges(req.params.accountId);
  res.json(badges);
}));

router.post('/check-unlocks', asyncHandler(async (req, res) => {
  const { accountId } = req.body;
  const account = await store.getAccount(accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });

  const unlocked = await store.unlockBadges(accountId, account.current_xp);
  res.json(unlocked);
}));

module.exports = router;
