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

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || 'support@cashscope.app';

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
            <td style="padding:8px 4px;font-weight:600">${orderId || 'N/A'}</td>
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
          Keep this key safe. It works on any browser or device.
          Lost it? Reply to this email quoting your Order ID and we'll resend it.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="font-size:0.78rem;color:#9ca3af">CashScope · Your spending, crystal clear · <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
      </div>
    `,
  });
  console.log(`✅ License email sent via Resend to ${email}`);
}

async function sendContactEmail({ name = '', email = '', subject = '', message = '' }) {
  const cleanedEmail = String(email || '').trim();
  const cleanedName  = String(name || '').trim();
  const cleanedSubj  = String(subject || '').trim();
  const cleanedMsg   = String(message || '').trim();

  if (!resendConfigured) {
    console.log('📧 Contact email skipped (Resend not configured)', {
      from: cleanedEmail,
      name: cleanedName,
      subject: cleanedSubj,
      message: cleanedMsg,
    });
    return { delivered: false };
  }

  const appUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://cashscope.app';
  const from   = process.env.EMAIL_FROM || 'CashScope <noreply@cashscope.app>';
  const to     = SUPPORT_EMAIL;

  const finalSubject = cleanedSubj
    ? `[CashScope] ${cleanedSubj}`
    : '[CashScope] Contact form message';

  const replyTo = cleanedEmail || undefined;

  await resend.emails.send({
    from,
    to,
    subject: finalSubject,
    replyTo,
    html: `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1b2230">
        <h2 style="margin:0 0 12px">New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:0.92rem;color:#374151">
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 6px;color:#6b7280;width:120px">Name</td>
            <td style="padding:8px 6px;font-weight:600">${cleanedName || 'N/A'}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 6px;color:#6b7280">Email</td>
            <td style="padding:8px 6px;font-weight:600">${cleanedEmail || 'N/A'}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 6px;color:#6b7280">Site</td>
            <td style="padding:8px 6px">${appUrl}</td>
          </tr>
        </table>
        <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;line-height:1.55">
${cleanedMsg || '(empty)'}
        </div>
      </div>
    `,
  });

  // Lightweight acknowledgement to the user (optional but helpful)
  if (cleanedEmail) {
    resend.emails.send({
      from,
      to: cleanedEmail,
      subject: 'We received your message (CashScope)',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b2230">
          <h2 style="margin:0 0 10px">Thanks for reaching out</h2>
          <p style="color:#374151;line-height:1.6;margin:0 0 12px">
            We’ve received your message and will get back to you as soon as we can.
          </p>
          <p style="color:#6b7280;font-size:0.9rem;line-height:1.6;margin:0">
            If you need to follow up, just reply to this email.
          </p>
        </div>
      `,
    }).catch(() => {});
  }

  return { delivered: true };
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

// 5. Contact form — sends an email to support
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body || {};

    // Honeypot anti-spam: if filled, pretend success
    if (website) return res.json({ ok: true });

    const cleanedEmail = String(email || '').trim();
    const cleanedMsg   = String(message || '').trim();
    const cleanedSubj  = String(subject || '').trim();
    const cleanedName  = String(name || '').trim();

    if (!cleanedEmail || !cleanedEmail.includes('@'))
      return res.status(400).json({ ok: false, error: 'Valid email required' });
    if (!cleanedMsg)
      return res.status(400).json({ ok: false, error: 'Message required' });
    if (cleanedMsg.length > 8000)
      return res.status(400).json({ ok: false, error: 'Message too long' });
    if (cleanedSubj.length > 140)
      return res.status(400).json({ ok: false, error: 'Subject too long' });

    await sendContactEmail({
      name: cleanedName,
      email: cleanedEmail,
      subject: cleanedSubj,
      message: cleanedMsg,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('contact error:', err);
    res.status(500).json({ ok: false, error: 'Could not send message' });
  }
});

// 6. Email report — send CSV as email attachment (Pro feature)
app.post('/api/email-report', async (req, res) => {
  try {
    const { email, csvBase64, filename, summary } = req.body || {};

    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@'))
      return res.status(400).json({ ok: false, error: 'Valid email required' });
    if (!csvBase64 || typeof csvBase64 !== 'string')
      return res.status(400).json({ ok: false, error: 'No report data provided' });
    // ~750 KB base64 ≈ 500 KB CSV — enough for large statements
    if (csvBase64.length > 800_000)
      return res.status(400).json({ ok: false, error: 'Report too large to email (try fewer rows)' });
    if (!resendConfigured)
      return res.status(503).json({ ok: false, error: 'Email delivery is not configured on the server' });

    const appUrl       = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://cashscope.app';
    const from         = process.env.EMAIL_FROM || 'CashScope <noreply@cashscope.app>';
    const cleanFilename = String(filename || 'expense-report.csv').replace(/[^a-z0-9._-]/gi, '-');
    const s            = summary || {};

    const fmt = (n) => '\u20b9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    const catRows = (s.topCategories || []).slice(0, 6).map(c =>
      `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:6px 10px">${c.emoji || ''} ${c.name || ''}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600;color:#1b2230">${fmt(c.total)}</td>
      </tr>`
    ).join('');

    await resend.emails.send({
      from,
      to:          cleanEmail,
      subject:     `Your CashScope Expense Report${s.dateRange ? ' \u00b7 ' + s.dateRange : ''}`,
      attachments: [{ filename: cleanFilename, content: Buffer.from(csvBase64, 'base64') }],
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1b2230">
          <img src="${appUrl}/logo.svg" width="36" style="border-radius:8px;margin-bottom:14px" />
          <h2 style="margin:0 0 6px">Your Expense Report</h2>
          <p style="color:#6b7280;font-size:0.9rem;margin:0 0 20px">
            Generated by <a href="${appUrl}" style="color:#4e54c8">CashScope</a>
            ${s.dateRange ? '&nbsp;&middot;&nbsp;' + s.dateRange : ''}
          </p>

          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;overflow:hidden;font-size:0.88rem;margin-bottom:22px">
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:9px 12px;color:#6b7280">Total debited</td>
              <td style="padding:9px 12px;font-weight:700;color:#e53935;text-align:right">${fmt(s.totalSpent)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:9px 12px;color:#6b7280">Total credited</td>
              <td style="padding:9px 12px;font-weight:700;color:#2e7d32;text-align:right">${fmt(s.totalReceived)}</td>
            </tr>
            ${s.recurringCount ? `<tr><td style="padding:9px 12px;color:#6b7280">Recurring / subscriptions</td><td style="padding:9px 12px;font-weight:600;text-align:right">${s.recurringCount} merchants</td></tr>` : ''}
          </table>

          ${catRows ? `
          <p style="font-size:0.82rem;font-weight:700;color:#374151;margin:0 0 6px">Top spending categories</p>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-bottom:22px;background:#fff;border-radius:10px;overflow:hidden">
            ${catRows}
          </table>` : ''}

          <p style="font-size:0.78rem;color:#9ca3af">
            The full transaction list is in the attached CSV file.<br/>
            Your data is processed locally by CashScope and is not stored on our servers.
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
          <p style="font-size:0.76rem;color:#9ca3af">CashScope &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
        </div>
      `,
    });

    console.log(`📧 Email report sent to ${cleanEmail}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('email-report error:', err);
    res.status(500).json({ ok: false, error: 'Failed to send report' });
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
