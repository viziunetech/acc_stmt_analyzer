import { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import StatementUploader from './components/StatementUploader';
import UpgradeModal from './components/UpgradeModal';
import { loadLicense, clearLicense } from './utils/licenseDB';

function App() {
  const [isPro,          setIsPro]          = useState(false);
  const [proEmail,       setProEmail]       = useState('');
  const [upgradeOpen,    setUpgradeOpen]    = useState(false);

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
        <div className="content-wrap">
          <StatementUploader isPro={isPro} onUpgrade={() => setUpgradeOpen(true)} />
        </div>
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
