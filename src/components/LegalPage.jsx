import React from 'react';
import { SUPPORT_EMAIL } from '../content/sitePages';

export default function LegalPage({ page, onBack }) {
  if (!page) return null;

  return (
    <div className="content-wrap">
      <div className="contact-header">
        <button className="contact-back" onClick={onBack} type="button">
          ← Back
        </button>
        <div>
          <h2 className="contact-title">{page.title}</h2>
          <div className="contact-subtitle">Effective date: {page.effectiveDate}</div>
        </div>
      </div>

      <div className="legal-stack">
        {page.sections.map((sec, idx) => (
          <div className="card" key={idx}>
            <h2 style={{ marginBottom: '0.6rem' }}>{sec.title}</h2>

            {Array.isArray(sec.text) && sec.text.length > 0 && (
              <div className="legal-text">
                {sec.text.map((p, i) => (
                  <p key={i} style={{ marginTop: i === 0 ? 0 : '0.55rem' }}>{p}{sec.contactEmail && i === sec.text.length - 1 ? (
                    <a className="contact-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                  ) : null}</p>
                ))}
              </div>
            )}

            {Array.isArray(sec.bullets) && sec.bullets.length > 0 && (
              <ul className="legal-bullets">
                {sec.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}

            {sec.contactEmail && (!sec.text || sec.text.length === 0) && (
              <div style={{ marginTop: '0.4rem' }}>
                <a className="contact-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </div>
            )}
          </div>
        ))}

        <div className="legal-note">
          These documents are provided for general informational purposes and may need adjustment for your specific business/jurisdiction.
        </div>
      </div>
    </div>
  );
}
