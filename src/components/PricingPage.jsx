import React from 'react';

const PRICE = '₹299';

const FEATURES = [
  'Upload multiple files: combine statements from multiple accounts',
  'Full category drill-down: click any category to see every transaction',
  'Session history: saved locally, reload without re-uploading',
  'Export to CSV & Excel: 4-sheet report download',
  'Unlimited date range: no statement date restrictions',
];

export default function PricingPage({ onBack, onUpgrade }) {
  return (
    <div className="content-wrap">
      <div className="contact-header">
        <button className="contact-back" onClick={onBack} type="button">
          ← Back
        </button>
        <div>
          <h2 className="contact-title">Pricing</h2>
          <div className="contact-subtitle">One-time payment, lifetime access.</div>
        </div>
      </div>

      <div className="contact-grid">
        <div className="card">
          <h2 style={{ marginBottom: '0.4rem' }}>CashScope Pro</h2>
          <div style={{ color: 'var(--muted)', marginBottom: '0.8rem' }}>
            Unlock exports, history, multi-account uploads, and unlimited ranges.
          </div>

          <div className="pricing-price">
            <div className="pricing-amount">{PRICE}</div>
            <div className="pricing-note">one-time · lifetime access · no subscription</div>
          </div>

          <ul className="legal-bullets" style={{ marginTop: '0.9rem' }}>
            {FEATURES.map((f, i) => <li key={i}>{f}</li>)}
          </ul>

          <button className="pricing-cta" onClick={onUpgrade} type="button">
            Upgrade to Pro
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '0.4rem' }}>Free</h2>
          <div style={{ color: 'var(--muted)', marginBottom: '0.8rem' }}>
            Try CashScope with core analysis features.
          </div>
          <ul className="legal-bullets">
            <li>Upload and analyze statements locally in your browser</li>
            <li>Category breakdown and recurring detection</li>
            <li>Clickable drilldowns for details</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
