import React from 'react';

function spaNav(e, hash) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  window.location.hash = hash;
}

const Footer = () => (
  <footer className="app-footer">
    <div className="footer-inner">
      <img src="/logo.svg" alt="CashScope" className="footer-logo" />
      <span>
        <strong>CashScope</strong> &copy; {new Date().getFullYear()} <span className="footer-sep">&middot;</span> Your data never leaves your device
        <span className="footer-sep">&middot;</span>
        <a className="footer-link" href="/pricing" onClick={(e) => spaNav(e, '#pricing')}>Pricing</a>
        <span className="footer-sep">&middot;</span>
        <a className="footer-link" href="/privacy-policy" onClick={(e) => spaNav(e, '#privacy')}>Privacy Policy</a>
        <span className="footer-sep">&middot;</span>
        <a className="footer-link" href="/terms" onClick={(e) => spaNav(e, '#terms')}>Terms</a>
        <span className="footer-sep">&middot;</span>
        <a className="footer-link" href="/refund-policy" onClick={(e) => spaNav(e, '#refund')}>Refunds</a>
        <span className="footer-sep">&middot;</span>
        <a className="footer-link" href="/contact" onClick={(e) => spaNav(e, '#contact')}>Contact</a>
      </span>
    </div>
  </footer>
);

export default Footer;
