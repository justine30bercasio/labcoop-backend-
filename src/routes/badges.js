const express = require('express');
const { store } = require('../db');

const router = express.Router();

router.get('/account/:accountId', (req, res) => {
  const badges = store.getBadges(req.params.accountId);
  res.json(badges);
});

router.post('/check-unlocks', (req, res) => {
  const { accountId } = req.body;
  const account = store.getAccount(accountId);
  if (!account) return res.status(404).json({ message: 'Account not found' });

  const unlocked = store.unlockBadges(accountId, account.current_xp);
  res.json(unlocked);
});

module.exports = router;
