import React, { useMemo, useState } from 'react';
import { sendContactMessage } from '../utils/contactApi';
import { SUPPORT_EMAIL } from '../content/sitePages';

export default function ContactPage({ onBack }) {
  const siteUrl = (import.meta.env.VITE_SITE_URL || import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/$/, '');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const canSend = useMemo(() => {
    if (!email || !email.includes('@')) return false;
    if (!message.trim()) return false;
    return true;
  }, [email, message]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSent(false);

    if (!canSend) {
      setError('Please enter a valid email and message.');
      return;
    }

    setLoading(true);
    try {
      await sendContactMessage({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        website,
      });
      setSent(true);
      setMessage('');
      setSubject('');
    } catch (err) {
      setError(err.message || 'Could not send message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content-wrap">
      <div className="contact-header">
        <button className="contact-back" onClick={onBack} type="button">
          ← Back
        </button>
        <div>
          <h2 className="contact-title">Contact Us</h2>
          <div className="contact-subtitle">Questions, billing help, or feedback. We read every message.</div>
        </div>
      </div>

      <div className="contact-grid">
        <div className="card">
          <h2 style={{ marginBottom: '0.5rem' }}>Send a message</h2>

          {error && <div className="error">{error}</div>}
          {sent && (
            <div className="contact-success">
              Message sent. If you provided an email, you'll also receive a quick confirmation.
            </div>
          )}

          <form onSubmit={handleSubmit} className="contact-form">
            <div className="contact-row">
              <label className="contact-label">
                Name (optional)
                <input
                  className="contact-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </label>

              <label className="contact-label">
                Email
                <input
                  className="contact-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  type="email"
                  required
                />
              </label>
            </div>

            <label className="contact-label">
              Subject (optional)
              <input
                className="contact-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Billing / License / Feedback"
                maxLength={140}
              />
            </label>

            <label className="contact-label">
              Message
              <textarea
                className="contact-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what you need help with..."
                rows={7}
                maxLength={8000}
                required
              />
            </label>

            {/* Honeypot field */}
            <div style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
              <label>
                Website
                <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <button className="contact-send" type="submit" disabled={loading || !canSend}>
              {loading ? 'Sending…' : 'Send message'}
            </button>

            <div className="contact-fine">
              For license issues, include your email and Order ID (if available).
            </div>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '0.5rem' }}>Contact details</h2>
          <div className="contact-details">
            <div className="contact-detail-row">
              <div className="contact-detail-label">Email</div>
              <div className="contact-detail-value">
                <a href={`mailto:${SUPPORT_EMAIL}`} className="contact-link">{SUPPORT_EMAIL}</a>
              </div>
            </div>
            <div className="contact-detail-row">
              <div className="contact-detail-label">Website</div>
              <div className="contact-detail-value">
                <a href={siteUrl} className="contact-link">{siteUrl}</a>
              </div>
            </div>
            <div className="contact-detail-row">
              <div className="contact-detail-label">Response time</div>
              <div className="contact-detail-value">Usually within 1–2 business days</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
