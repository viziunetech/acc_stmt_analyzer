import React from 'react';

const Footer = () => (
  <footer className="app-footer">
    <div className="footer-inner">
      <img src="/logo.svg" alt="SpendLens" className="footer-logo" />
      <span><strong>SpendLens</strong> &copy; {new Date().getFullYear()} &mdash; Your data never leaves your device</span>
    </div>
  </footer>
);

export default Footer;
