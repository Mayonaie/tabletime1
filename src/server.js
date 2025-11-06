// server.cjs (CommonJS)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// Load environment variables from .env
try { require('dotenv').config(); } catch {}

const app = express();
app.use(cors());
app.use(express.json());

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

// Note: Don't warn on startup; allow server to run for non-PayPal features like reviews API.

// Node 18+ has global fetch. If your Node is older, install node-fetch and do:
const fetch =
  global.fetch ||
  ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Auth failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Simple health and root routes so hitting the server in a browser shows something useful
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: process.env.PAYPAL_MODE || 'sandbox' });
});

app.get('/', (req, res) => {
  res.type('text/plain').send('Reservation PayPal API is running. POST /api/paypal/create-order or /api/paypal/capture-order');
});

app.post('/api/paypal/create-order', async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
    return res.status(503).json({ error: 'paypal-config-missing', message: 'Set PAYPAL_CLIENT_ID and PAYPAL_SECRET in your .env to enable PayPal.' });
  }
  try {
    const { amount, description, currency } = req.body;
    if (!amount) return res.status(400).json({ error: 'missing-amount' });

    const accessToken = await getAccessToken();
    const currencyCode = (currency || process.env.PAYPAL_CURRENCY || 'USD').toUpperCase();
    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currencyCode,
            value: String(Number(amount).toFixed(2))
          },
          description
        }],
      }),
    });

    const text = await orderRes.text();
    if (!orderRes.ok) {
      let payload;
      try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
      console.error('PayPal create-order failed:', orderRes.status, JSON.stringify(payload, null, 2));
      return res.status(orderRes.status).json({ error: 'create-order-failed', detail: payload });
    }
    const order = JSON.parse(text);
    res.json({ id: order.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create-order-failed' });
  }
});

app.post('/api/paypal/capture-order', async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
    return res.status(503).json({ error: 'paypal-config-missing', message: 'Set PAYPAL_CLIENT_ID and PAYPAL_SECRET in your .env to enable PayPal.' });
  }
  try {
    const { orderID } = req.body;
    if (!orderID) return res.status(400).json({ error: 'missing-orderID' });

    const accessToken = await getAccessToken();
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({}), // PayPal accepts empty JSON body on capture
});

    const text = await captureRes.text();
    if (!captureRes.ok) return res.status(captureRes.status).json({ error: 'capture-order-failed', detail: text });
    const details = JSON.parse(text);
    res.json(details);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'capture-order-failed' });
  }
});

// ---- Reviews API (simple JSON file persistence) ----
const REVIEWS_FILE = path.join(__dirname, 'reviews.data.json');

function loadReviews() {
  try {
    if (!fs.existsSync(REVIEWS_FILE)) return [];
    const raw = fs.readFileSync(REVIEWS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[server] Failed to load reviews file:', e.message);
    return [];
  }
}

function saveReviews(list) {
  try {
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.warn('[server] Failed to save reviews file:', e.message);
  }
}

let REVIEWS = loadReviews();

app.get('/api/reviews', (req, res) => {
  // newest first
  const sorted = REVIEWS.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(sorted);
});

app.post('/api/reviews', (req, res) => {
  const { name, rating, comment, createdAt } = req.body || {};
  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) errors.push('name');
  const rNum = Number(rating);
  if (!Number.isFinite(rNum) || rNum < 1 || rNum > 5) errors.push('rating(1-5)');
  if (!comment || typeof comment !== 'string' || !comment.trim()) errors.push('comment');
  if (errors.length) return res.status(400).json({ error: 'invalid-payload', fields: errors });

  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name).trim(),
    rating: rNum,
    comment: String(comment).trim(),
    createdAt: createdAt || new Date().toISOString(),
  };

  REVIEWS.unshift(item);
  saveReviews(REVIEWS);
  res.status(201).json(item);
});

app.listen(4000, () => console.log('PayPal API server on http://localhost:4000'));