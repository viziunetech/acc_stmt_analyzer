import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import StatementUploader from './components/StatementUploader';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <div className="content-wrap">
          <StatementUploader />
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default App;
