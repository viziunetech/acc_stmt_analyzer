require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path       = require('path');
const express    = require('express');
const cors       = require('cors');
const crypto     = require('crypto');
const Razorpay   = require('razorpay');
const { Resend }  = require('resend');
const { Redis }   = require('@upstash/redis');
const { mountSeo } = require('./seoPages');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Upstash Redis license store ───────────────────────────────────────────
const redisConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = redisConfigured
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

if (!redisConfigured) console.warn('⚠️  Upstash Redis not configured — license keys will NOT persist across restarts');
else console.log('🔴 Upstash Redis connected');

// Each license stored as:  license:<KEY>  →  JSON object
async function setLicense(key, record) {
  if (!redis) return; // graceful no-op if not configured
  await redis.set(`license:${key}`, JSON.stringify(record));
}

async function getLicense(key) {
  if (!redis) return null;
  const data = await redis.get(`license:${key}`);
  if (!data) return null;
  // Upstash auto-parses JSON — handle both string and object
  return typeof data === 'string' ? JSON.parse(data) : data;
}

// ── Razorpay instance ────────────────────────────────────────────────────
const razorpayConfigured =
  process.env.RAZORPAY_KEY_ID   && !process.env.RAZORPAY_KEY_ID.includes('REPLACE') &&
  process.env.RAZORPAY_KEY_SECRET && !process.env.RAZORPAY_KEY_SECRET.includes('REPLACE');

const razorpay = razorpayConfigured
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

if (!razorpayConfigured) console.warn('⚠️  Razorpay keys not configured — /create-order will return 503');

// ── Mailer (Resend) ─────────────────────────────────────────────────────
const resendConfigured = !!(process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('REPLACE'));
const resend = resendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

if (!resendConfigured) console.warn('⚠️  Resend API key not configured — license keys will NOT be emailed');
else console.log('📧 Resend mailer ready');

// ── Middleware ───────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Raw body needed for Razorpay webhook signature verification
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────
function generateLicenseKey(email, orderId) {
  const payload = `${email}:${orderId}:${Date.now()}`;
  const hmac    = crypto.createHmac('sha256', process.env.LICENSE_SECRET || 'changeme');
  hmac.update(payload);
  const raw = hmac.digest('hex').toUpperCase();
  // Format as XXXX-XXXX-XXXX-XXXX (16 hex chars grouped)
  return [raw.slice(0,4), raw.slice(4,8), raw.slice(8,12), raw.slice(12,16)].join('-');
}

async function sendLicenseEmail(email, key, orderId = '') {
  if (!resendConfigured) {
    console.log(`📧 Email skipped (Resend not configured) — key for ${email}: ${key}`);
    return;
  }
  const appUrl  = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://cashscope.app';
  const from    = process.env.EMAIL_FROM   || 'CashScope <noreply@cashscope.app>';
  const issuedOn = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  await resend.emails.send({
    from,
    to:      email,
    subject: '🔑 Your CashScope Pro License Key',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b2230">
        <img src="${appUrl}/logo.svg" width="40" style="border-radius:8px;margin-bottom:12px" />
        <h2 style="margin:0 0 8px">Welcome to CashScope Pro! 🎉</h2>
        <p style="color:#6b7280">Here is your lifetime license key:</p>
        <div style="background:#f3f4ff;border:1.5px solid #c7d2fe;border-radius:10px;padding:16px 20px;margin:16px 0;font-size:1.4rem;font-weight:700;letter-spacing:2px;color:#4e54c8;text-align:center">
          ${key}
        </div>
        <p style="font-size:0.9rem;color:#374151">
          To activate, open <a href="${appUrl}" style="color:#4e54c8">${appUrl}</a>,
          click <strong>Activate Pro</strong> and paste this key.
        </p>

        <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:0.82rem;color:#374151">
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 4px;color:#9ca3af">Order ID</td>
            <td style="padding:8px 4px;font-weight:600">${orderId || '—'}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 4px;color:#9ca3af">Issued to</td>
            <td style="padding:8px 4px;font-weight:600">${email}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 4px;color:#9ca3af">Date</td>
            <td style="padding:8px 4px">${issuedOn}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 4px;color:#9ca3af">Plan</td>
            <td style="padding:8px 4px">Lifetime Pro</td>
          </tr>
        </table>

        <p style="font-size:0.82rem;color:#9ca3af;margin-top:20px">
          Keep this key safe — it works on any browser or device.
          Lost it? Reply to this email quoting your Order ID and we'll resend it.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="font-size:0.78rem;color:#9ca3af">CashScope · Your spending, crystal clear · <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
      </div>
    `,
  });
  console.log(`✅ License email sent via Resend to ${email}`);
}

// ── Routes ───────────────────────────────────────────────────────────────

// SEO landing pages (server-rendered HTML)
mountSeo(app);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Dev-only: instantly issue a license key without going through Razorpay
// Disabled automatically when DEV_MODE is not 'true'
app.post('/api/dev-activate', async (req, res) => {
  if (process.env.DEV_MODE !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  const { email } = req.body;
  if (!email || !email.includes('@'))
    return res.status(400).json({ error: 'Valid email required' });

  const key = generateLicenseKey(email, 'dev_' + Date.now());
  await setLicense(key, { email, orderId: 'DEV', createdAt: new Date().toISOString(), valid: true });
  console.log(`🧪 Dev license issued: ${key} → ${email}`);
  res.json({ ok: true, key });
});

// 1. Create Razorpay order
app.post('/api/create-order', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@'))
      return res.status(400).json({ error: 'Valid email required' });

    if (!razorpay)
      return res.status(503).json({ error: 'Payment not configured yet. Add Razorpay keys to server/.env' });

    const order = await razorpay.orders.create({
      amount:   29900,     // ₹299 in paise
      currency: 'INR',
      receipt:  `sl_${Date.now()}`,
      notes:    { email },
    });

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

// 2. Razorpay payment webhook (auto-triggered after payment)
app.post('/api/webhook', async (req, res) => {
  const sig      = req.headers['x-razorpay-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
    .update(req.body)
    .digest('hex');

  if (sig !== expected) {
    console.warn('Webhook signature mismatch');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body.toString());
  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity;
    const email   = payment.notes?.email || payment.email;
    const orderId = payment.order_id;

    const key = generateLicenseKey(email, orderId);
    await setLicense(key, { email, orderId, createdAt: new Date().toISOString(), valid: true });
    console.log(`✅ License issued: ${key} → ${email}`);

    sendLicenseEmail(email, key, orderId).catch(err => console.error('Email error:', err));
  }

  res.json({ ok: true });
});

// 3. Validate a license key
app.post('/api/validate-key', async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ valid: false, error: 'Key required' });

    const record = await getLicense(key.trim().toUpperCase());
    if (!record) return res.json({ valid: false });

    res.json({ valid: record.valid, email: record.email, since: record.createdAt });
  } catch (err) {
    console.error('validate-key error:', err);
    res.status(500).json({ valid: false, error: 'Internal error' });
  }
});

// 4. Verify payment signature on client-side (after Razorpay checkout callback)
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email } = req.body;

    const body    = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== razorpay_signature)
      return res.status(400).json({ error: 'Signature mismatch' });

    // Payment verified — issue key
    const key = generateLicenseKey(email, razorpay_order_id);
    await setLicense(key, { email, orderId: razorpay_order_id, createdAt: new Date().toISOString(), valid: true });
    console.log(`✅ License issued (verify): ${key} → ${email}`);

    sendLicenseEmail(email, key, razorpay_order_id).catch(err => console.error('Email error:', err));

    res.json({ ok: true, key });
  } catch (err) {
    console.error('verify-payment error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Static frontend (production) ───────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
// SPA fallback — serve index.html for any non-API route
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

// ── Global error handler — always returns JSON, never empty body ──────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`CashScope running on :${PORT}  (API + UI)`));;
