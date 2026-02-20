import React, { useState } from 'react';
import Card from './Card';
import { FaFileCsv, FaCheckCircle, FaExclamationCircle, FaChevronDown, FaChevronRight, FaWallet, FaArrowDown, FaArrowUp, FaExchangeAlt, FaStore } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const cleanString = (val) => (typeof val === 'string' ? val.replace(/\*/g, '').trim() : val);
const normalizeKey = (key) =>
  (typeof key === 'string' ? key.replace(/\*/g, '').trim().toLowerCase().replace(/\s+/g, ' ') : '');
const buildNorm = (tx) => Object.fromEntries(Object.entries(tx).map(([k, v]) => [normalizeKey(k), cleanString(v)]));
const parseAmount = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

function parseCSV(text) {
  // Use PapaParse for robust CSV parsing
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data.map(row => buildNorm(row));
}

function detectRecurring(transactions) {
  // Use normalized keys (lowercase, trimmed)
  const descKeys = ['description', 'desc', 'narration', 'remarks', 'particulars'];
  const amtKeys = ['amount', 'amt', 'withdrawal amt.', 'withdrawal', 'debit', 'dr', 'deposit amt.', 'credit', 'cr'];
  const dateKeys = ['transaction date', 'value date', 'value dt', 'date', 'txn date'];
  const filtered = transactions.filter(tx => {
    const norm = buildNorm(tx);
    const desc = descKeys.map(k => norm[k]).find(v => (typeof v === 'string' ? v.trim() : v));
    // For amount, use withdrawal if present, else deposit, else amount
    const amtCandidate =
      norm['withdrawal amt.'] ?? norm['withdrawal'] ?? norm['debit'] ?? norm['dr'] ??
      norm['deposit amt.'] ?? norm['credit'] ?? norm['cr'] ??
      norm['amount'] ?? norm['amt'];
    const amt = parseAmount(amtCandidate);
    return desc && amt !== null;
  });
  const map = {};
  filtered.forEach(tx => {
    const norm = buildNorm(tx);
    const desc = descKeys.map(k => norm[k]).find(v => (typeof v === 'string' ? v.trim() : v)) || 'Unknown';
    const date = dateKeys.map(k => norm[k]).find(v => (typeof v === 'string' ? v.trim() : v)) || '';
    const amtCandidate =
      norm['withdrawal amt.'] ?? norm['withdrawal'] ?? norm['debit'] ?? norm['dr'] ??
      norm['deposit amt.'] ?? norm['credit'] ?? norm['cr'] ??
      norm['amount'] ?? norm['amt'];
    const amount = parseAmount(amtCandidate);
    map[desc] = map[desc] || [];
    map[desc].push({ ...norm, _date: date, _amount: amount });
  });
  return Object.entries(map)
    .filter(([_, arr]) => arr.length > 1)
    .map(([desc, arr]) => ({
      description: desc,
      count: arr.length,
      total: arr.reduce((sum, tx) => {
        // For amount, use withdrawal if present, else deposit, else amount
        const amtCandidate =
          tx['withdrawal amt.'] ?? tx['withdrawal'] ?? tx['debit'] ?? tx['dr'] ??
          tx['deposit amt.'] ?? tx['credit'] ?? tx['cr'] ??
          tx['amount'] ?? tx['amt'];
        const amt = parseAmount(amtCandidate) || 0;
        return sum + amt;
      }, 0),
      lastDate:
        dateKeys.map(k => arr[arr.length - 1][k]).find(v => (typeof v === 'string' ? v.trim() : v)) || '',
      details: arr
        .map(tx => ({
          date: tx._date || '',
          amount: typeof tx._amount === 'number' ? tx._amount : null,
        }))
        .filter(item => item.date || typeof item.amount === 'number'),
    }));
}

const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatCard = ({ icon, label, value, sub, color }) => (
  <div className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
    <div className="stat-card-icon" style={{ color }}>{icon}</div>
    <div className="stat-card-body">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  </div>
);

const MiniBar = ({ label, value, max }) => (
  <div className="mini-bar-row">
    <div className="mini-bar-label" title={label}>{label}</div>
    <div className="mini-bar-track">
      <div className="mini-bar-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} />
    </div>
    <div className="mini-bar-value">{fmt(value)}</div>
  </div>
);

const Insights = ({ recurring, payments, userStats, hasData }) => {
  const [openIndex, setOpenIndex] = useState(null);
  if (!hasData) return null;

  const maxMerchant = userStats.topMerchants?.[0]?.total || 1;
  const maxMonth = Math.max(...(userStats.monthlySpend?.map(m => m.total) || [1]), 1);

  return (
    <div className="insights-wrap">

      {/* Summary Stat Cards */}
      <div className="stat-cards-row">
        <StatCard icon={<FaArrowDown size={16}/>} label="Total Debited" value={fmt(userStats.totalSpent)} sub={`${userStats.paymentCount} transactions`} color="#e53935" />
        <StatCard icon={<FaArrowUp size={16}/>} label="Total Credited" value={fmt(userStats.totalReceived)} sub={`${userStats.creditCount} transactions`} color="#2e7d32" />
        <StatCard icon={<FaExchangeAlt size={16}/>} label="Avg Debit" value={fmt(userStats.avgTransaction)} sub="per transaction" color="#1565c0" />
        <StatCard icon={<FaWallet size={16}/>} label="Largest Payment" value={fmt(userStats.largestPayment.amount)} sub={userStats.largestPayment.description?.slice(0, 28) || ''} color="#6a1b9a" />
      </div>

      {/* Recurring Payments */}
      <div className="section-block">
        <div className="section-header">
          <FaCheckCircle color="#4e54c8" />
          <span>Recurring Payments</span>
          {recurring.length > 0 && <span className="count-badge">{recurring.length}</span>}
        </div>
        {recurring.length === 0 ? (
          <p className="badge-muted">No recurring payments found.</p>
        ) : (
          <table className="table-compact">
            <thead><tr><th style={{width:'55%'}}>Description</th><th>Occurrences</th><th>Total Spent</th><th>Last Date</th></tr></thead>
            <tbody>
              {recurring.sort((a,b) => b.total - a.total).map((r, i) => (
                <React.Fragment key={i}>
                  <tr onClick={() => setOpenIndex(openIndex === i ? null : i)} className="clickable-row">
                    <td><span className="expand-icon">{openIndex === i ? <FaChevronDown size={10}/> : <FaChevronRight size={10}/>}</span>{r.description}</td>
                    <td><span className="occ-badge">{r.count}×</span></td>
                    <td className="amt-debit">{fmt(r.total)}</td>
                    <td className="date-cell">{r.lastDate}</td>
                  </tr>
                  {openIndex === i && (
                    <tr className="detail-row">
                      <td colSpan={4}>
                        <div className="detail-grid">
                          {r.details.map((d, idx) => (
                            <div key={idx} className="detail-chip">
                              <span>{d.date || '—'}</span>
                              {typeof d.amount === 'number' && <span className="amt-debit">{fmt(d.amount)}</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Two-column layout for bottom sections */}
      <div className="bottom-grid">

        {/* Top Payments */}
        <div className="section-block">
          <div className="section-header"><FaArrowDown color="#e53935" /><span>Largest Payments</span></div>
          {payments.length === 0 ? <p className="badge-muted">No major payments found.</p> : (
            <table className="table-compact">
              <thead><tr><th>Description</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i}>
                    <td style={{maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.description}</td>
                    <td className="amt-debit">{fmt(p.amount)}</td>
                    <td className="date-cell">{p.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column: merchants + monthly */}
        <div style={{display:'flex',flexDirection:'column',gap:'0.8rem'}}>

          {/* Top Merchants */}
          {userStats.topMerchants?.length > 0 && (
            <div className="section-block">
              <div className="section-header"><FaStore color="#f57c00" /><span>Top Payees by Spend</span></div>
              <div className="mini-bars">
                {userStats.topMerchants.map((m, i) => (
                  <MiniBar key={i} label={m.name.slice(0, 32)} value={m.total} max={maxMerchant} />
                ))}
              </div>
            </div>
          )}

          {/* Monthly Spend */}
          {userStats.monthlySpend?.length > 0 && (
            <div className="section-block">
              <div className="section-header"><FaExchangeAlt color="#1565c0" /><span>Monthly Spend (Last 6)</span></div>
              <div className="mini-bars">
                {userStats.monthlySpend.map((m, i) => (
                  <MiniBar key={i} label={m.month} value={m.total} max={maxMonth} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const StatementUploader = () => {
  const [recurring, setRecurring] = useState([]);
  const [payments, setPayments] = useState([]);
  const [userStats, setUserStats] = useState({ totalSpent: 0, totalReceived: 0, largestPayment: { amount: 0, description: '' }, paymentCount: 0, creditCount: 0, avgTransaction: 0, topMerchants: [], monthlySpend: [] });
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  function getPayments(data) {
    // Show top 5 largest debits (non-recurring), using normalized keys; if DR/CR absent, treat any withdrawal as debit
    const debits = data.filter(tx => {
      const norm = buildNorm(tx);
      const amtCandidate =
        norm['withdrawal amt.'] ?? norm['withdrawal'] ?? norm['debit'] ?? norm['dr'] ??
        norm['amount'] ?? norm['amt'];
      const amt = parseAmount(amtCandidate);
      if (amt === null) return false;
      const drcr = (norm['dr / cr'] || norm['drcr'] || '').toString().toUpperCase();
      if (drcr) return drcr === 'DR' || drcr === 'DEBIT';
      // If no DR/CR, assume withdrawal indicates debit
      return norm['withdrawal amt.'] || norm['withdrawal'] || norm['debit'] || norm['dr'];
    });
    const sorted = debits.sort((a, b) => {
      const aNorm = buildNorm(a);
      const bNorm = buildNorm(b);
      const aAmt = parseAmount(aNorm['withdrawal amt.'] ?? aNorm['withdrawal'] ?? aNorm['debit'] ?? aNorm['dr'] ?? aNorm['amount'] ?? aNorm['amt']) || 0;
      const bAmt = parseAmount(bNorm['withdrawal amt.'] ?? bNorm['withdrawal'] ?? bNorm['debit'] ?? bNorm['dr'] ?? bNorm['amount'] ?? bNorm['amt']) || 0;
      return bAmt - aAmt;
    });
    return sorted.slice(0, 5).map(tx => {
      const norm = buildNorm(tx);
      const amt = parseAmount(norm['withdrawal amt.'] ?? norm['withdrawal'] ?? norm['debit'] ?? norm['dr'] ?? norm['amount'] ?? norm['amt']) || 0;
      return {
        description: norm['description'] || norm['desc'] || norm['narration'] || norm['remarks'] || '',
        amount: amt,
        date: norm['transaction date'] || norm['value date'] || norm['value dt'] || norm['date'] || norm['txn date'] || '',
      };
    });
  }

  function getUserStats(data) {
    const dateKeys = ['transaction date', 'value date', 'value dt', 'date', 'txn date'];
    const getAmt = (norm, keys) => parseAmount(norm[keys[0]] ?? norm[keys[1]] ?? norm[keys[2]] ?? norm[keys[3]] ?? norm[keys[4]] ?? norm[keys[5]]) || 0;
    const debitKeys = ['withdrawal amt.', 'withdrawal', 'debit', 'dr', 'amount', 'amt'];
    const creditKeys = ['deposit amt.', 'deposit', 'credit', 'cr', 'amount', 'amt'];

    const debits = data.filter(tx => {
      const norm = buildNorm(tx);
      const amtCandidate = norm['withdrawal amt.'] ?? norm['withdrawal'] ?? norm['debit'] ?? norm['dr'] ?? norm['amount'] ?? norm['amt'];
      const amt = parseAmount(amtCandidate);
      if (amt === null) return false;
      const drcr = (norm['dr / cr'] || norm['drcr'] || '').toString().toUpperCase();
      if (drcr) return drcr === 'DR' || drcr === 'DEBIT';
      return norm['withdrawal amt.'] || norm['withdrawal'] || norm['debit'] || norm['dr'];
    });

    const credits = data.filter(tx => {
      const norm = buildNorm(tx);
      const amtCandidate = norm['deposit amt.'] ?? norm['deposit'] ?? norm['credit'] ?? norm['cr'];
      const amt = parseAmount(amtCandidate);
      if (amt === null || amt <= 0) return false;
      const drcr = (norm['dr / cr'] || norm['drcr'] || '').toString().toUpperCase();
      if (drcr) return drcr === 'CR' || drcr === 'CREDIT';
      return norm['deposit amt.'] || norm['deposit'] || norm['credit'] || norm['cr'];
    });

    const totalSpent = debits.reduce((sum, tx) => sum + getAmt(buildNorm(tx), debitKeys), 0);
    const totalReceived = credits.reduce((sum, tx) => {
      const norm = buildNorm(tx);
      return sum + (parseAmount(norm['deposit amt.'] ?? norm['deposit'] ?? norm['credit'] ?? norm['cr']) || 0);
    }, 0);

    const largestPayment = debits.reduce((max, tx) => {
      const norm = buildNorm(tx);
      const amt = getAmt(norm, debitKeys);
      const desc = norm['narration'] || norm['description'] || norm['desc'] || norm['remarks'] || '';
      return amt > max.amount ? { amount: amt, description: desc } : max;
    }, { amount: 0, description: '' });

    // Top merchants by total debit spend
    const merchantMap = {};
    debits.forEach(tx => {
      const norm = buildNorm(tx);
      const desc = norm['narration'] || norm['description'] || norm['desc'] || norm['remarks'] || 'Unknown';
      const amt = getAmt(norm, debitKeys);
      if (!desc) return;
      merchantMap[desc] = (merchantMap[desc] || 0) + amt;
    });
    const topMerchants = Object.entries(merchantMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));

    // Monthly spend breakdown
    const monthMap = {};
    debits.forEach(tx => {
      const norm = buildNorm(tx);
      const dateStr = dateKeys.map(k => norm[k]).find(v => v && v.toString().trim()) || '';
      const amt = getAmt(norm, debitKeys);
      // Try to extract month/year from date string
      const parts = dateStr.toString().split('/');
      let label = '';
      if (parts.length >= 2) {
        // dd/mm/yy or dd/mm/yyyy
        const month = parseInt(parts[1]);
        const year = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : '';
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        label = month >= 1 && month <= 12 ? `${monthNames[month - 1]} ${year}` : '';
      }
      if (label) monthMap[label] = (monthMap[label] || 0) + amt;
    });
    const monthlySpend = Object.entries(monthMap)
      .sort((a, b) => {
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [aM, aY] = a[0].split(' ');
        const [bM, bY] = b[0].split(' ');
        return aY !== bY ? Number(aY) - Number(bY) : monthNames.indexOf(aM) - monthNames.indexOf(bM);
      })
      .slice(-6)
      .map(([month, total]) => ({ month, total }));

    const avgTransaction = debits.length ? totalSpent / debits.length : 0;

    return {
      totalSpent,
      totalReceived,
      largestPayment,
      paymentCount: debits.length,
      creditCount: credits.length,
      avgTransaction,
      topMerchants,
      monthlySpend,
    };
  }

  const handleFile = async (e) => {
    setError('');
    setFileName('');
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    let data = [];
    try {
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        data = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // Find the header row dynamically
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        let headerRowIdx = -1;
        // Dynamic: match if expected keywords are present in a row
        const expected = ['narration', 'description', 'desc', 'amount', 'withdrawal', 'deposit', 'date', 'value', 'transaction', 'dr', 'cr'];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map(cell => normalizeKey((cell || '').toString()));
          const hasDate = row.some(cell => cell.includes('date') || cell.includes('value'));
          const hasDesc = row.some(cell => cell.includes('narration') || cell.includes('description') || cell.includes('desc') || cell.includes('remarks'));
          const hasAmt = row.some(cell => cell.includes('amount') || cell.includes('withdrawal') || cell.includes('deposit') || cell.includes('debit') || cell.includes('credit'));
          let matchCount = 0;
          for (const keyword of expected) {
            if (row.some(cell => cell.includes(keyword))) matchCount++;
          }
          if ((hasDate && hasAmt) || matchCount >= 3) {
            headerRowIdx = i;
            break;
          }
        }
        if (headerRowIdx === -1) {
          setError('Could not find header row in Excel file.');
          return;
        }
          // Clean headers: strip asterisks, trim, lower-case
          const headers = rows[headerRowIdx].map(h => normalizeKey(h));
          const dataRows = rows.slice(headerRowIdx + 1);
          // Convert to array of objects, clean data: strip asterisks, trim
          let raw = dataRows.map(row => {
            const obj = {};
            headers.forEach((h, idx) => {
              const val = row[idx];
              obj[h] = cleanString(val);
            });
            return obj;
          });
          // Filter out rows that don't have a valid date or narration
          data = raw.filter(row => {
            const date = row['date'] || row['value date'] || row['value dt'] || row['transaction date'] || row['txn date'];
            const narration = row['narration'] || row['description'] || row['desc'] || row['remarks'] || row['particulars'];
            return date && narration && date.toString().length > 0 && narration.toString().length > 0;
          }).map(row => buildNorm(row));
      } else {
        setError('Please upload a CSV or Excel file.');
        return;
      }
      const recurring = detectRecurring(data);
      setRecurring(recurring);
      setPayments(getPayments(data));
      setUserStats(getUserStats(data));
      setHasData(true);
    } catch (err) {
      setError('Failed to parse file.');
    }
  };

  return (
    <Card>
      <h2 className="upload-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FaFileCsv color="#4e54c8" /> Upload bank CSV <span className="badge-muted">→ detect recurring payments → dashboard + renewal alerts</span>
      </h2>
      <label htmlFor="csv-upload" className="upload-box">
        <input id="csv-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
        {fileName ? `Selected: ${fileName}` : 'Click to select a CSV or Excel file'}
      </label>
      {error && (
        <div className="error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaExclamationCircle color="#d32f2f" /> {error}
        </div>
      )}
      <Insights recurring={recurring} payments={payments} userStats={userStats} hasData={hasData} />
    </Card>
  );
};

export default StatementUploader;
