import { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import StatementUploader from './components/StatementUploader';
import UpgradeModal from './components/UpgradeModal';
import ContactPage from './components/ContactPage';
import PricingPage from './components/PricingPage';
import LegalPage from './components/LegalPage';
import { LEGAL_PAGES } from './content/sitePages';
import { loadLicense, clearLicense } from './utils/licenseDB';

function getRouteFromHash() {
  const h = (window.location.hash || '').replace('#', '').trim().toLowerCase();
  if (!h) return { name: 'home' };
  if (h === 'contact') return { name: 'contact' };
  if (h === 'pricing') return { name: 'pricing' };
  if (h === 'privacy') return { name: 'legal', key: 'privacy' };
  if (h === 'terms') return { name: 'legal', key: 'terms' };
  if (h === 'refund') return { name: 'legal', key: 'refund' };
  return { name: 'home' };
}

function App() {
  const [isPro,          setIsPro]          = useState(false);
  const [proEmail,       setProEmail]       = useState('');
  const [upgradeOpen,    setUpgradeOpen]    = useState(false);
  const [route,          setRoute]          = useState(() => getRouteFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Restore Pro status from IndexedDB on mount
  useEffect(() => {
    loadLicense().then(rec => {
      if (rec?.key) { setIsPro(true); setProEmail(rec.email || ''); }
    }).catch(() => {});
  }, []);

  const handleActivated = ({ key, email }) => {
    setIsPro(true);
    setProEmail(email);
    // Don't close modal here — SuccessScreen inside the modal shows the key
    // and closes itself only after the user acknowledges
  };

  const handleDeactivate = () => {
    clearLicense().catch(() => {});
    setIsPro(false);
    setProEmail('');
  };

  return (
    <div className="app">
      <Header
        isPro={isPro}
        proEmail={proEmail}
        onUpgrade={() => setUpgradeOpen(true)}
        onDeactivate={handleDeactivate}
      />
      <main className="app-main">
        {route.name === 'contact' && (
          <ContactPage onBack={() => { window.location.hash = ''; }} />
        )}

        {route.name === 'pricing' && (
          <PricingPage
            onBack={() => { window.location.hash = ''; }}
            onUpgrade={() => setUpgradeOpen(true)}
          />
        )}

        {route.name === 'legal' && (
          <LegalPage
            page={LEGAL_PAGES[route.key]}
            onBack={() => { window.location.hash = ''; }}
          />
        )}

        {route.name === 'home' && (
          <div className="content-wrap">
            <StatementUploader isPro={isPro} onUpgrade={() => setUpgradeOpen(true)} />
          </div>
        )}
      </main>
      <Footer />
      {upgradeOpen && (
        <UpgradeModal
          onClose={() => setUpgradeOpen(false)}
          onActivated={handleActivated}
        />
      )}
    </div>
  );
}

export default App;
