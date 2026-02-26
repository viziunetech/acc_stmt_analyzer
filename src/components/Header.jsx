import React, { useState, useRef, useEffect } from 'react';
import { FaCrown, FaSignOutAlt } from 'react-icons/fa';

const Header = ({ isPro, proEmail, onUpgrade, onDeactivate }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDeactivate = () => {
    if (window.confirm('Remove Pro license from this browser?\n\nYou can re-activate anytime with your key.')) {
      setMenuOpen(false);
      onDeactivate();
    }
  };

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-title">
          <img src="/logo.svg" alt="SpendLens logo" className="header-logo" />
          <span className="brand-name">SpendLens</span>
          <span className="app-subtitle">See exactly where your money goes</span>
        </div>
        <div className="app-actions">
          {isPro ? (
            <div style={{ position: 'relative' }} ref={menuRef}>
              <div className="pro-badge" title={`Pro · ${proEmail}`} onClick={() => setMenuOpen(o => !o)} style={{ cursor: 'pointer' }}>
                <FaCrown size={12} /> PRO
              </div>
              {menuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '200px',
                  zIndex: 9999, padding: '8px 0',
                }}>
                  <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '2px' }}>Signed in as</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1b2230', wordBreak: 'break-all' }}>{proEmail || 'Pro user'}</div>
                    <div style={{ fontSize: '0.72rem', color: '#4e54c8', marginTop: '3px' }}>✓ Lifetime Pro</div>
                  </div>
                  <button
                    onClick={handleDeactivate}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 14px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.83rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '7px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <FaSignOutAlt size={12} /> Deactivate on this browser
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="header-upgrade-btn" onClick={onUpgrade}>
              <FaCrown size={11} /> Upgrade
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
