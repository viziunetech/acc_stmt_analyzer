import React from 'react';
import { FaUserCircle, FaCrown } from 'react-icons/fa';

const Header = ({ isPro, proEmail, onUpgrade, onDeactivate }) => (
  <header className="app-header">
    <div className="app-header-inner">
      <div className="app-title">
        <img src="/logo.svg" alt="SpendLens logo" className="header-logo" />
        <span className="brand-name">SpendLens</span>
        <span className="app-subtitle">See exactly where your money goes</span>
      </div>
      <div className="app-actions">
        {isPro ? (
          <div className="pro-badge" title={`Pro · ${proEmail}`} onClick={onDeactivate} style={{ cursor: 'pointer' }}>
            <FaCrown size={12} /> PRO
          </div>
        ) : (
          <button className="header-upgrade-btn" onClick={onUpgrade}>
            <FaCrown size={11} /> Upgrade
          </button>
        )}
        <FaUserCircle size={22} title={isPro ? proEmail : 'Profile'} style={{ opacity: 0.85 }} />
      </div>
    </div>
  </header>
);

export default Header;
