const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');
const { authMiddleware, requireOwnership } = require('../middleware/auth');
const paymongo = require('../services/paymongo');
const { notifyPaymongoPaymentSuccess } = require('../services/notifications');

const router = express.Router();

router.post('/create-payment',
  authMiddleware, requireOwnership,
  body('account_id').isString().notEmpty().trim(),
  body('amount').isFloat({ min: 1 }),
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      if (!paymongo.isPaymongoConfigured()) {
        return res.status(400).json({ message: 'PayMongo not configured. Please set PAYMONGO_SECRET in .env' });
      }

      const { account_id, amount } = req.body;
      const account = await store.getAccount(account_id);
      if (!account) return res.status(404).json({ message: 'Account not found' });

      const depositId = uuidv4();
      const result = await paymongo.createGcashCheckout(
        Number(amount),
        'LabCoop Savings Deposit',
        account_id,
        depositId
      );

      const piId = result.paymentIntent.data.id;
      const checkoutUrl = result.checkoutUrl;
      const clientKey = result.clientKey;

      if (!checkoutUrl) {
        return res.status(500).json({
          message: 'Failed to get checkout URL from PayMongo',
          pi_id: piId,
          has_client_key: !!clientKey,
        });
      }

      await store.query(
        `INSERT INTO online_deposits (deposit_id, account_id, amount, reference_number, sender_name, payment_method, status, admin_notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [depositId, account_id, Number(amount), `PI-${piId}`, account.child_name || '', 'paymongo_gcash', 'paymongo_pending', JSON.stringify({ payment_intent_id: piId }), new Date().toISOString()]
      );

      res.json({
        deposit_id: depositId,
        payment_intent_id: piId,
        checkout_url: checkoutUrl,
        client_key: clientKey,
        amount: Number(amount),
      });
    } catch (err) {
      console.error('PayMongo create-payment error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  })
);

router.get('/payment-status/:depositId',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const result = await store.query('SELECT * FROM online_deposits WHERE deposit_id = $1', [req.params.depositId]);
    const deposit = result.rows[0];
    if (!deposit) return res.status(404).json({ message: 'Deposit not found' });

    let paymongoStatus = null;
    if (deposit.admin_notes) {
      try {
        const notes = JSON.parse(deposit.admin_notes);
        if (notes.payment_intent_id) {
          const pi = await paymongo.retrievePaymentIntent(notes.payment_intent_id);
          paymongoStatus = pi.data.attributes.status;
        }
      } catch (_) {}
    }

    res.json({
      deposit_id: deposit.deposit_id,
      status: deposit.status,
      paymongo_status: paymongoStatus,
      amount: deposit.amount,
      created_at: deposit.created_at,
      resolved_at: deposit.resolved_at,
    });
  })
);

module.exports = router;

const crypto = require('crypto');

const webhookRouter = express.Router();

webhookRouter.post('/paymongo', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const rawBody = req.body;
  if (!rawBody || rawBody.length === 0) {
    return res.status(400).json({ error: 'Empty payload' });
  }

  const whSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (whSecret) {
    const sigHeader = req.headers['paymongo-signature'] || '';
    const sig = crypto.createHmac('sha256', whSecret).update(rawBody).digest('hex');
    const received = sigHeader.replace(/^v1=/, '').split(',').map(s => s.trim());
    if (!received.includes(sig)) {
      console.error('PayMongo webhook: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || !event.data || !event.data.attributes) {
    return res.status(400).json({ error: 'Invalid payload structure' });
  }

  const eventType = event.data.attributes.type || '';
  console.log('PayMongo webhook received:', eventType);

  async function handlePaymentSuccess(paymentId, amount, metadata) {
    const accountId = metadata.account_id || '';
    const depositId = metadata.deposit_id || '';

    let deposit;
    if (depositId) {
      const existing = await store.query('SELECT * FROM online_deposits WHERE deposit_id = $1', [depositId]);
      deposit = existing.rows[0];
    }

    if (!deposit && paymentId) {
      const byPi = await store.query("SELECT * FROM online_deposits WHERE admin_notes LIKE '%' || $1 || '%'", [paymentId]);
      deposit = byPi.rows[0];
    }

    if (!deposit) {
      console.warn('PayMongo webhook: no matching deposit found for', paymentId);
      return;
    }
    if (deposit.status !== 'paymongo_pending') return;

    const val = Number(deposit.amount);
    const accId = deposit.account_id;
    const account = await store.getAccount(accId);
    if (!account) {
      console.warn('PayMongo webhook: account not found:', accId);
      return;
    }

    const newBalance = Math.round((Number(account.actual_balance) + val) * 100) / 100;
    const newUnallocated = Math.round((Number(account.unallocated_balance) + val) * 100) / 100;

    await store.query(
      "UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=CURRENT_TIMESTAMP WHERE account_id=$3",
      [newBalance, newUnallocated, accId]
    );

    const txId = uuidv4();
    await store.query(
      `INSERT INTO transactions (transaction_id, account_id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [txId, accId, 'deposit', val, Number(account.actual_balance), newBalance,
       `GCash deposit via PayMongo (Ref: ${paymentId})`, 'paymongo', paymentId, new Date().toISOString()]
    );

    await store.query(
      "UPDATE online_deposits SET status='approved', resolved_at=$1 WHERE deposit_id=$2",
      [new Date().toISOString(), deposit.deposit_id]
    );

    await notifyPaymongoPaymentSuccess(accId, val);
    console.log(`PayMongo payment credited: PHP ${val} -> account ${accId}`);
  }

  if (eventType === 'payment_intent.payment_succeeded') {
    const eventData = event.data.attributes.data || {};
    const piId = eventData.id || '';
    const metadata = eventData.attributes?.metadata || eventData.metadata || {};
    await handlePaymentSuccess(piId, eventData.attributes?.amount || 0, metadata);
  } else if (eventType === 'payment.paid') {
    const eventData = event.data.attributes.data || {};
    const paymentId = eventData.id || '';
    const attrs = eventData.attributes || {};
    const metadata = attrs.metadata || {};
    const piId = attrs.payment_intent_id || '';
    if (!metadata.account_id && piId) {
      metadata.account_id = '';
      metadata.deposit_id = '';
    }
    await handlePaymentSuccess(piId || paymentId, attrs.amount || 0, metadata);
  }

  res.json({ received: true });
}));

module.exports = router;
module.exports.webhookRouter = webhookRouter;
