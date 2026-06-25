const { store } = require('../db');

const FCM_ENABLED = !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
let admin;

if (FCM_ENABLED) {
  try {
    admin = require('firebase-admin');
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    console.log('Firebase Admin initialized for push notifications');
  } catch (err) {
    console.warn('Firebase Admin init failed (notifications disabled):', err.message);
  }
}

async function sendPush(accountId, title, body, data) {
  if (!FCM_ENABLED || !admin) {
    console.log(`[NOTIFICATION SKIPPED - no Firebase] To ${accountId}: ${title} - ${body}`);
    return;
  }
  try {
    const tokens = await store.getFcmTokens(accountId);
    if (!tokens || tokens.length === 0) return;
    const message = {
      notification: { title, body },
      data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {},
      tokens: tokens.map(t => t.fcm_token),
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Push sent to ${accountId}: ${response.successCount} success, ${response.failureCount} failures`);
    for (let i = 0; i < response.responses.length; i++) {
      const resp = response.responses[i];
      if (!resp.success && resp.error) {
        console.error(`FCM error for token ${tokens[i]?.fcm_token?.slice(0, 20)}...:`, resp.error.message);
        if (resp.error.code === 'messaging/registration-token-not-registered') {
          await store.unregisterFcmToken(accountId, tokens[i].fcm_token);
        }
      }
    }
  } catch (err) {
    console.error('Failed to send push notification:', err.message);
  }
}

const NotifEvents = {
  WITHDRAWAL_APPROVED: (amount, reason) => ({
    title: 'Withdrawal Approved!',
    body: `PHP ${Number(amount).toFixed(2)} withdrawal has been approved.`,
    data: { type: 'withdrawal_approved', amount: String(amount) },
  }),
  WITHDRAWAL_REJECTED: (amount, reason) => ({
    title: 'Withdrawal Rejected',
    body: `PHP ${Number(amount).toFixed(2)} withdrawal request was rejected.`,
    data: { type: 'withdrawal_rejected', amount: String(amount) },
  }),
  WITHDRAWAL_PAID: (amount) => ({
    title: 'Withdrawal Paid Out!',
    body: `PHP ${Number(amount).toFixed(2)} has been paid out.`,
    data: { type: 'withdrawal_paid', amount: String(amount) },
  }),
  DEPOSIT_APPROVED: (amount, ref) => ({
    title: 'Deposit Approved!',
    body: `PHP ${Number(amount).toFixed(2)} deposit${ref ? ` (Ref: ${ref})` : ''} has been credited.`,
    data: { type: 'deposit_approved', amount: String(amount) },
  }),
  DEPOSIT_REJECTED: (amount, ref) => ({
    title: 'Deposit Rejected',
    body: `PHP ${Number(amount).toFixed(2)} deposit${ref ? ` (Ref: ${ref})` : ''} was rejected.`,
    data: { type: 'deposit_rejected', amount: String(amount) },
  }),
  PAYMONGO_PAYMENT_SUCCESS: (amount) => ({
    title: 'Payment Successful!',
    body: `PHP ${Number(amount).toFixed(2)} GCash payment confirmed. Your account has been credited.`,
    data: { type: 'paymongo_success', amount: String(amount) },
  }),
};

async function notifyWithdrawalApproved(accountId, amount, reason) {
  const ev = NotifEvents.WITHDRAWAL_APPROVED(amount, reason);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyWithdrawalRejected(accountId, amount, reason) {
  const ev = NotifEvents.WITHDRAWAL_REJECTED(amount, reason);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyWithdrawalPaid(accountId, amount) {
  const ev = NotifEvents.WITHDRAWAL_PAID(amount);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyDepositApproved(accountId, amount, ref) {
  const ev = NotifEvents.DEPOSIT_APPROVED(amount, ref);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyDepositRejected(accountId, amount, ref) {
  const ev = NotifEvents.DEPOSIT_REJECTED(amount, ref);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyPaymongoPaymentSuccess(accountId, amount) {
  const ev = NotifEvents.PAYMONGO_PAYMENT_SUCCESS(amount);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

module.exports = {
  sendPush,
  notifyWithdrawalApproved,
  notifyWithdrawalRejected,
  notifyWithdrawalPaid,
  notifyDepositApproved,
  notifyDepositRejected,
  notifyPaymongoPaymentSuccess,
};
