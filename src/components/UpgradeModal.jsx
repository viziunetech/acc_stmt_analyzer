import React, { useState } from 'react';
import { createOrder, verifyPayment, validateKeyOnServer, saveLicense, devActivate } from '../utils/licenseDB';

const IS_DEV = import.meta.env.DEV;

const PRICE    = '₹299';
const FEATURES = [
  ['📁', 'Multiple files', 'Combine statements from multiple accounts'],
  ['📊', 'Full category drill-down', 'Click any category to see every transaction'],
  ['💾', 'Session history', 'Saved locally — reload without re-uploading'],
  ['⬇️', 'Export CSV & Excel', 'Download full reports with 4-sheet Excel'],
  ['📅', 'Unlimited history', 'No statement date restrictions'],
];

// Loads Razorpay checkout script once
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s    = document.createElement('script');
    s.src      = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload   = () => resolve(true);
    s.onerror  = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ── Tab 1: Buy via Razorpay ───────────────────────────────────────────────
const BuyTab = ({ onSuccess, onError }) => {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    if (!email || !email.includes('@')) return onError('Enter a valid email address');
    setLoading(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load Razorpay. Check your connection.');

      const order = await createOrder(email);

      const rzp = new window.Razorpay({
        key:         order.keyId,
        amount:      order.amount,
        currency:    order.currency,
        order_id:    order.orderId,
        name:        'SpendLens',
        description: 'Lifetime Pro License',
        image:       '/logo.svg',
        prefill:     { email },
        theme:       { color: '#4e54c8' },
        handler: async (response) => {
          try {
            const result = await verifyPayment({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              email,
            });
            await saveLicense({ key: result.key, email, since: new Date().toISOString() });
            onSuccess(result.key, email);
          } catch (e) {
            onError('Payment verified but key delivery failed. Email us with your payment ID: ' + response.razorpay_payment_id);
          }
        },
      });
      rzp.on('payment.failed', (r) => onError('Payment failed: ' + r.error.description));
      rzp.open();
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upgrade-buy-tab">
      <div className="upgrade-features">
        {FEATURES.map(([icon, title, desc], i) => (
          <div key={i} className="upgrade-feature-row">
            <span className="upgrade-feature-icon">{icon}</span>
            <div>
              <div className="upgrade-feature-title">{title}</div>
              <div className="upgrade-feature-desc">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="upgrade-price-row">
        <span className="upgrade-price">{PRICE}</span>
        <span className="upgrade-price-label">one-time · lifetime access · no subscription</span>
      </div>

      <input
        className="upgrade-email-input"
        type="email"
        placeholder="your@email.com  (we'll send your key here)"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleBuy()}
      />

      <button className="upgrade-pay-btn" onClick={handleBuy} disabled={loading}>
        {loading ? 'Opening checkout…' : `Pay ${PRICE} via Razorpay / UPI`}
      </button>

      <p className="upgrade-fine-print">
        🔒 Secure payment via Razorpay · UPI, cards, netbanking accepted · Key delivered instantly by email
      </p>

      {IS_DEV && (
        <button
          className="upgrade-pay-btn"
          style={{ marginTop: '0.5rem', background: 'linear-gradient(90deg,#059669,#34d399)', fontSize: '0.8rem', padding: '0.45rem' }}
          onClick={async () => {
            if (!email || !email.includes('@')) return onError('Enter a valid email first');
            try {
              const r = await devActivate(email);
              await saveLicense({ key: r.key, email, since: new Date().toISOString() });
              onSuccess(r.key, email);
            } catch(e) { onError(e.message); }
          }}
        >
          🧪 Dev: Get free test key
        </button>
      )}
    </div>
  );
};

// ── Tab 2: Activate existing key ─────────────────────────────────────────
const ActivateTab = ({ onSuccess, onError }) => {
  const [key,     setKey]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    const cleaned = key.trim().toUpperCase();
    if (!cleaned) return onError('Enter your license key');
    setLoading(true);
    try {
      const result = await validateKeyOnServer(cleaned);
      if (!result.valid) throw new Error('Invalid or expired key. Check for typos or contact support.');
      await saveLicense({ key: cleaned, email: result.email, since: result.since });
      onSuccess(cleaned, result.email);
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upgrade-activate-tab">
      <p style={{ color: '#6b7280', fontSize: '0.87rem', marginTop: 0 }}>
        Already purchased? Enter your license key below.
      </p>
      <input
        className="upgrade-email-input"
        type="text"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        value={key}
        onChange={e => setKey(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleActivate()}
        style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
      />
      <button className="upgrade-pay-btn upgrade-activate-btn" onClick={handleActivate} disabled={loading}>
        {loading ? 'Validating…' : 'Activate License'}
      </button>
    </div>
  );
};

// ── Main modal ────────────────────────────────────────────────────────────
const UpgradeModal = ({ onClose, onActivated }) => {
  const [tab,     setTab]     = useState('buy');   // 'buy' | 'activate'
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(null);    // { key, email }

  const handleSuccess = (key, email) => {
    setError('');
    setSuccess({ key, email });
    onActivated({ key, email });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel upgrade-modal-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header upgrade-modal-header">
          <span className="modal-title">
            <img src="/logo.svg" alt="" style={{ width: 22, height: 22, borderRadius: 5 }} />
            Upgrade to <span style={{ color: '#4e54c8' }}>SpendLens Pro</span>
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {success ? (
          /* ── Success screen ── */
          <div className="upgrade-success">
            <div className="upgrade-success-icon">🎉</div>
            <h3 className="upgrade-success-title">You're now Pro!</h3>
            <p style={{ color: '#6b7280', fontSize: '0.88rem' }}>Your license key:</p>
            <div className="upgrade-key-display">{success.key}</div>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              A copy has been emailed to <strong>{success.email}</strong>. Keep it safe — works on any device.
            </p>
            <button className="upgrade-pay-btn" onClick={onClose}>Start using Pro →</button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="upgrade-tabs">
              <button className={`upgrade-tab${tab === 'buy' ? ' active' : ''}`} onClick={() => { setTab('buy'); setError(''); }}>
                Buy — {PRICE} lifetime
              </button>
              <button className={`upgrade-tab${tab === 'activate' ? ' active' : ''}`} onClick={() => { setTab('activate'); setError(''); }}>
                Activate key
              </button>
            </div>

            <div className="upgrade-body">
              {error && <div className="upgrade-error">⚠️ {error}</div>}
              {tab === 'buy'
                ? <BuyTab onSuccess={handleSuccess} onError={setError} />
                : <ActivateTab onSuccess={handleSuccess} onError={setError} />
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UpgradeModal;
