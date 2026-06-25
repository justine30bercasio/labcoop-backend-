const https = require('https');

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET || '';
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET || '';
const API_BASE = 'api.paymongo.com';
const API_VERSION = 'v1';

if (PAYMONGO_SECRET) {
  console.log('PayMongo configured (secret key found, length=' + PAYMONGO_SECRET.length + ')');
} else {
  console.log('PayMongo NOT configured — set PAYMONGO_SECRET in .env or Render env vars');
}

function getAuth() {
  return Buffer.from(PAYMONGO_SECRET + ':').toString('base64');
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: API_BASE,
      path: `/${API_VERSION}${path}`,
      method,
      headers: {
        'Authorization': `Basic ${getAuth()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.errors?.[0]?.detail || `PayMongo HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`PayMongo parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function createGcashPayment(amount, description, accountId, depositId) {
  const amountCentavos = Math.round(Number(amount) * 100);
  const paymentIntent = await apiRequest('POST', '/payment_intents', {
    data: {
      attributes: {
        amount: amountCentavos,
        currency: 'PHP',
        payment_method_allowed: ['gcash'],
        description: description || 'LabCoop Savings Deposit',
        statement_descriptor: 'LabCoop',
        metadata: {
          account_id: accountId,
          deposit_id: depositId,
        },
      },
    },
  });
  return paymentIntent;
}

async function retrievePaymentIntent(paymentIntentId) {
  return await apiRequest('GET', `/payment_intents/${paymentIntentId}`);
}

async function createPaymentIntent(amount, description, accountId, depositId) {
  const amountCentavos = Math.round(Number(amount) * 100);
  const result = await apiRequest('POST', '/payment_intents', {
    data: {
      attributes: {
        amount: amountCentavos,
        currency: 'PHP',
        payment_method_allowed: ['gcash'],
        description: description || 'LabCoop Savings Deposit',
        statement_descriptor: 'LabCoop',
        metadata: {
          account_id: accountId,
          deposit_id: depositId,
        },
      },
    },
  });
  return result;
}

async function createGcashCheckout(amount, description, accountId, depositId) {
  const pi = await createPaymentIntent(amount, description, accountId, depositId);
  const piId = pi.data.id;
  const clientKey = pi.data.attributes?.client_key || '';
  // Use client_key as the checkout URL — PayMongo checkout path
  const checkoutUrl = clientKey ? `https://checkout.paymongo.com/${clientKey}` : '';
  return { paymentIntent: pi, checkoutUrl, clientKey };
}

function isPaymongoConfigured() {
  return !!PAYMONGO_SECRET;
}

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  createGcashPayment,
  createGcashCheckout,
  isPaymongoConfigured,
};
