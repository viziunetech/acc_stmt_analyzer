import React from 'react';
import { FaBell, FaUserCircle, FaCog } from 'react-icons/fa';

const Header = () => (
  <header className="app-header">
    <div className="app-header-inner">
      <div className="app-title">
        <span>Subscription & Expense Intelligence</span>
        <span className="app-subtitle">Turn statements into savings insights</span>
      </div>
      <div className="app-actions">
        <FaBell size={18} title="Alerts" />
        <FaCog size={18} title="Settings" />
        <FaUserCircle size={22} title="Profile" />
      </div>
    </div>
  </header>
);

export default Header;
