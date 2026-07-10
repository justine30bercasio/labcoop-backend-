const { store } = require('../db');

// Support two methods:
// 1. FIREBASE_SERVICE_ACCOUNT_JSON — entire JSON content as env var (simplest, just paste)
// 2. FIREBASE_SERVICE_ACCOUNT_PATH — path to JSON file (for Render secret files)
const FCM_ENABLED = !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
let _app;

if (FCM_ENABLED) {
  try {
    const admin = require('firebase-admin');
    const { cert } = require('firebase-admin/app');
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      console.log('Firebase Admin: loaded from FIREBASE_SERVICE_ACCOUNT_JSON env var');
    } else {
      serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      console.log('Firebase Admin: loaded from file ' + process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    }
    if (!admin.apps || admin.apps.length === 0) {
      _app = admin.initializeApp({ credential: cert(serviceAccount) });
    } else {
      _app = admin.apps[0];
    }
    console.log('Firebase Admin initialized for push notifications');
  } catch (err) {
    console.warn('Firebase Admin init failed (notifications disabled):', err.message);
    console.warn('Firebase Admin init error details:', err.stack);
  }
}

function _getMessaging() {
  if (!_app) return null;
  const { getMessaging } = require('firebase-admin/messaging');
  return getMessaging(_app);
}

async function sendParentPush(parentId, title, body, data) {
  const messaging = _getMessaging();
  if (!FCM_ENABLED || !messaging) {
    console.error(`[NOTIFICATION] Parent push skipped — Firebase not configured (target parent: ${parentId})`);
    return;
  }
  const tokens = await store.getParentFcmTokens(parentId);
  if (!tokens || tokens.length === 0) {
    console.error(`[NOTIFICATION] No parent FCM tokens for parent ${parentId}`);
    return;
  }
  const message = {
    data: {
      title,
      body,
      ...(data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {}),
    },
    tokens: tokens.map(t => t.fcm_token),
  };
  const response = await messaging.sendEachForMulticast(message);
  console.log(`Parent push sent to ${parentId}: ${response.successCount} success, ${response.failureCount} failures`);
  let firstError = null;
  for (let i = 0; i < response.responses.length; i++) {
    const resp = response.responses[i];
    if (!resp.success && resp.error) {
      console.error(`Parent FCM error for token ${tokens[i]?.fcm_token?.slice(0, 20)}...:`, resp.error.message);
      if (resp.error.code === 'messaging/registration-token-not-registered') {
        // Parent FCM tokens don't have an unregister method yet, just log
        console.warn(`Parent FCM token ${tokens[i]?.fcm_token?.slice(0, 20)}... is no longer registered`);
      }
      if (!firstError) firstError = resp.error.message;
    }
  }
}

async function sendPush(accountId, title, body, data) {
  const messaging = _getMessaging();
  if (!FCM_ENABLED || !messaging) {
    const msg = `Push skipped — Firebase not configured (set FIREBASE_SERVICE_ACCOUNT_JSON env var with your service account JSON)`;
    console.error(`[NOTIFICATION] ${msg} (target: ${accountId})`);
    throw new Error(msg);
  }
  const tokens = await store.getFcmTokens(accountId);
  if (!tokens || tokens.length === 0) {
    const msg = `No FCM tokens registered for account ${accountId}`;
    console.error(`[NOTIFICATION] ${msg}`);
    throw new Error(msg);
  }
  const message = {
    data: {
      title,
      body,
      ...(data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {}),
    },
    tokens: tokens.map(t => t.fcm_token),
  };
  const response = await messaging.sendEachForMulticast(message);
  console.log(`Push sent to ${accountId}: ${response.successCount} success, ${response.failureCount} failures`);
  let firstError = null;
  for (let i = 0; i < response.responses.length; i++) {
    const resp = response.responses[i];
    if (!resp.success && resp.error) {
      console.error(`FCM error for token ${tokens[i]?.fcm_token?.slice(0, 20)}...:`, resp.error.message);
      if (resp.error.code === 'messaging/registration-token-not-registered') {
        await store.unregisterFcmToken(accountId, tokens[i].fcm_token);
      }
      if (!firstError) firstError = resp.error.message;
    }
  }
  if (response.successCount === 0 && firstError) {
    throw new Error(`Push failed: ${firstError}`);
  }

  // Persist to notifications table for in-app display
  try {
    const { v4: uuidv4 } = require('uuid');
    await store.query(
      `INSERT INTO notifications (notif_id, account_id, title, body, type, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6)`,
      [uuidv4(), accountId, title, body || '', 'push', new Date().toISOString()]
    );
  } catch (_) {
    // notifications table might not exist yet — create it
    try {
      await store.query(
        'CREATE TABLE IF NOT EXISTS notifications (notif_id TEXT PRIMARY KEY, account_id TEXT, title TEXT NOT NULL, body TEXT DEFAULT \'\', type TEXT DEFAULT \'info\', is_read INTEGER DEFAULT 0, created_at TEXT)'
      );
      const { v4: uuidv4 } = require('uuid');
      await store.query(
        `INSERT INTO notifications (notif_id, account_id, title, body, type, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, 0, $6)`,
        [uuidv4(), accountId, title, body || '', 'push', new Date().toISOString()]
      );
    } catch (e2) {
      console.error('Failed to persist notification:', e2.message);
    }
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
  KYC_APPROVED: () => ({
    title: 'KYC Verified!',
    body: 'Your identity verification has been approved. You now have full access.',
    data: { type: 'kyc_approved' },
  }),
  KYC_REJECTED: (reason) => ({
    title: 'KYC Rejected',
    body: `Your identity verification was rejected: ${reason || 'No reason provided'}`,
    data: { type: 'kyc_rejected', reason: reason || '' },
  }),
  PAYMONGO_PAYMENT_SUCCESS: (amount) => ({
    title: 'Payment Successful!',
    body: `PHP ${Number(amount).toFixed(2)} GCash payment confirmed. Your account has been credited.`,
    data: { type: 'paymongo_success', amount: String(amount) },
  }),
  CONSENT_APPROVED: () => ({
    title: 'Parent Consent Approved!',
    body: 'Your parent has approved your KYC consent. You can now submit your identification documents.',
    data: { type: 'consent_approved' },
  }),
  CONSENT_REJECTED: (reason) => ({
    title: 'Parent Consent Rejected',
    body: `Your parent did not approve your KYC consent${reason ? ': ' + reason : ''}.`,
    data: { type: 'consent_rejected', reason: reason || '' },
  }),
  LOAN_APPROVED_BY_PARENT: (amount) => ({
    title: 'Loan Pre-Approved by Parent!',
    body: `Your loan application for PHP ${Number(amount).toFixed(2)} has been pre-approved by your parent. An admin will process disbursement.`,
    data: { type: 'loan_parent_approved', amount: String(amount) },
  }),
  LOAN_REJECTED_BY_PARENT: (amount) => ({
    title: 'Loan Rejected by Parent',
    body: `Your loan application for PHP ${Number(amount).toFixed(2)} was not approved by your parent.`,
    data: { type: 'loan_parent_rejected', amount: String(amount) },
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

async function notifyKycApproved(accountId) {
  const ev = NotifEvents.KYC_APPROVED();
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyKycRejected(accountId, reason) {
  const ev = NotifEvents.KYC_REJECTED(reason);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyConsentApproved(accountId) {
  const ev = NotifEvents.CONSENT_APPROVED();
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyConsentRejected(accountId, reason) {
  const ev = NotifEvents.CONSENT_REJECTED(reason);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyLoanApprovedByParent(accountId, amount) {
  const ev = NotifEvents.LOAN_APPROVED_BY_PARENT(amount);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

async function notifyLoanRejectedByParent(accountId, amount) {
  const ev = NotifEvents.LOAN_REJECTED_BY_PARENT(amount);
  await sendPush(accountId, ev.title, ev.body, ev.data);
}

function isFirebaseReady() {
  return !!_app;
}

function getDiagnostics() {
  return {
    configured: FCM_ENABLED,
    initialized: !!_app,
    hasJsonEnvVar: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasPathEnvVar: !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    jsonEnvLength: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.length || 0,
  };
}

module.exports = {
  sendPush,
  sendParentPush,
  notifyWithdrawalApproved,
  notifyWithdrawalRejected,
  notifyWithdrawalPaid,
  notifyDepositApproved,
  notifyDepositRejected,
  notifyPaymongoPaymentSuccess,
  notifyKycApproved,
  notifyKycRejected,
  notifyConsentApproved,
  notifyConsentRejected,
  notifyLoanApprovedByParent,
  notifyLoanRejectedByParent,
  isFirebaseReady,
  getDiagnostics,
};
