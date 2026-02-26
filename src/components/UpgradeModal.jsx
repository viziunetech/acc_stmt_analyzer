import React, { useState } from 'react';
import { createOrder, verifyPayment, validateKeyOnServer, saveLicense, devActivate } from '../utils/licenseDB';

const IS_DEV = import.meta.env.DEV;

const PRICE    = '₹299';
const FEATURES = [
  'Upload multiple files — combine statements from multiple accounts',
  'Full category drill-down — click any category to see every transaction',
  'Session history — saved locally, reload without re-uploading',
  'Export to CSV & Excel — 4-sheet report download',
  'Unlimited date range — no statement date restrictions',
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

// ── One-time success screen ───────────────────────────────────────────────
const SuccessScreen = ({ licenseKey, email, onClose }) => {
  const [copied,   setCopied]   = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(licenseKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="upgrade-success">
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'linear-gradient(135deg,#4e54c8,#8f94fb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1rem',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h3 className="upgrade-success-title">Pro License Activated</h3>

      {/* One-time warning banner */}
      <div style={{
        background: '#fafafa', border: '1px solid #e5e7eb',
        borderRadius: '8px', padding: '10px 14px', margin: '8px 0 12px',
        fontSize: '0.81rem', color: '#374151', textAlign: 'left', lineHeight: '1.6',
      }}>
        <strong>Save this key.</strong> It will not be shown again after you close this window.
        A copy has been sent to <strong>{email}</strong>.
      </div>

      {/* Key display + copy */}
      <div style={{ position: 'relative', margin: '0 0 10px' }}>
        <div className="upgrade-key-display" style={{ paddingRight: '5rem' }}>{licenseKey}</div>
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
            background: copied ? '#059669' : '#4e54c8', color: '#fff',
            border: 'none', borderRadius: '6px', padding: '4px 14px',
            fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, transition: 'background 0.2s',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Acknowledgement checkbox */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#374151', cursor: 'pointer', margin: '4px 0 16px' }}>
        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
        I have saved my license key
      </label>

      <button
        className="upgrade-pay-btn"
        disabled={!accepted}
        style={{ opacity: accepted ? 1 : 0.4, cursor: accepted ? 'pointer' : 'not-allowed' }}
        onClick={onClose}
      >
        Start using Pro
      </button>
    </div>
  );
};

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
            onSuccess(result.key, email, 'buy');
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
        {FEATURES.map((feat, i) => (
          <div key={i} className="upgrade-feature-row">
            <span className="upgrade-feature-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4e54c8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <div className="upgrade-feature-title">{feat}</div>
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
        Secured by Razorpay &middot; UPI, cards &amp; netbanking accepted &middot; Key delivered instantly
      </p>

      {IS_DEV && (
        <button
          className="upgrade-pay-btn"
          style={{ marginTop: '0.5rem', background: '#059669', fontSize: '0.78rem', padding: '0.45rem' }}
          onClick={async () => {
            if (!email || !email.includes('@')) return onError('Enter a valid email first');
            try {
              const r = await devActivate(email);
              await saveLicense({ key: r.key, email, since: new Date().toISOString() });
              onSuccess(r.key, email, 'buy');
            } catch(e) { onError(e.message); }
          }}
        >
          Dev: Activate test license
        </button>
      )}
    </div>
  );
};

// ── Tab 2: Activate existing key ─────────────────────────────────────────
const ActivateTab = ({ onSuccess, onError }) => {
  const [key,     setKey]     = useState('');
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);

  const handleActivate = async () => {
    const cleaned = key.trim().toUpperCase();
    if (!cleaned) return onError('Enter your license key');
    setLoading(true);
    try {
      const result = await validateKeyOnServer(cleaned);
      if (!result.valid) throw new Error('Invalid or expired key. Check for typos or contact support.');
      await saveLicense({ key: cleaned, email: result.email, since: result.since });
      onSuccess(cleaned, result.email, 'activate');
      setActivated(true);
      setTimeout(() => onClose(), 2200);
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (activated) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg,#4e54c8,#8f94fb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 0.4rem', color: '#1b2230', fontSize: '1.1rem' }}>Pro Activated</h3>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
          All Pro features are now unlocked.
        </p>
      </div>
    );
  }

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
  const [success, setSuccess] = useState(null);    // { key, email, source }

  const handleSuccess = (key, email, source = 'buy') => {
    setError('');
    onActivated({ key, email });
    // For 'activate': ActivateTab shows its own success screen + calls onClose after delay
    // For 'buy': show the one-time key display screen here in the modal
    if (source !== 'activate') {
      setSuccess({ key, email });
    }
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
          <SuccessScreen licenseKey={success.key} email={success.email} onClose={onClose} />
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
