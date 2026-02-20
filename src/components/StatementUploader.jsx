import React, { useState } from 'react';
import Card from './Card';
import { FaFileCsv, FaCheckCircle, FaExclamationCircle, FaChevronDown, FaChevronRight, FaWallet, FaArrowDown, FaArrowUp, FaExchangeAlt, FaStore } from 'react-icons/fa';
import * as XLSX from '@e965/xlsx';
import Papa from 'papaparse';

const cleanString = (val) => (typeof val === 'string' ? val.replace(/\*/g, '').trim() : val);
const normalizeKey = (key) =>
  (typeof key === 'string' ? key.replace(/\*/g, '').trim().toLowerCase().replace(/\s+/g, ' ') : '');
const buildNorm = (tx) => Object.fromEntries(Object.entries(tx).map(([k, v]) => [normalizeKey(k), cleanString(v)]));
const parseAmount = (val) => {
  if (typeof val === 'number') return isFinite(val) ? val : null;
  if (val instanceof Date) return null;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

// Find a value in norm by trying exact keys, then partial-name fallback
const findColVal = (norm, ...keys) => {
  for (const k of keys) {
    if (norm[k] !== undefined && norm[k] !== null) return norm[k];
  }
  // Partial match — handles variants like "Withdrawal Amt. (INR)"
  for (const k of keys) {
    const base = k.replace(/[.()]+$/, '').trim();
    const found = Object.keys(norm).find(nk => nk.startsWith(base));
    if (found !== undefined) return norm[found];
  }
  return undefined;
};

const getDebitAmt  = (norm) => findColVal(norm,
  'withdrawal amt.', 'withdrawal', 'debit amt.', 'debit amount', 'debit', 'dr amt.', 'dr', 'amount', 'amt'
);
const getCreditAmt = (norm) => findColVal(norm,
  'deposit amt.', 'deposit', 'credit amt.', 'credit amount', 'credit', 'cr amt.', 'cr'
);
const getDrCr = (norm) =>
  (norm['dr / cr'] || norm['dr/cr'] || norm['drcr'] || norm['cr/dr'] ||
   norm['txn type'] || norm['transaction type'] || norm['type'] || '').toString().toUpperCase();
const getTxDate = (norm) => {
  const raw = findColVal(norm,
    'txn date', 'transaction date', 'value date', 'value dt', 'date', 'posting date', 'book date'
  );
  if (!raw) return '';
  // Excel serial date → DD/MM/YYYY string
  if (typeof raw === 'number' && raw > 1000) {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
  }
  if (raw instanceof Date) {
    const dd = String(raw.getDate()).padStart(2, '0');
    const mm = String(raw.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${raw.getFullYear()}`;
  }
  return raw.toString();
};
const getTxDesc = (norm) => findColVal(norm,
  'narration', 'description', 'desc', 'remarks', 'particulars', 'transaction details', 'details'
) || '';

// Determine if a tx is a debit (withdrawal)
const isDebit = (norm) => {
  const drcr = getDrCr(norm);
  if (drcr) return drcr === 'DR' || drcr === 'DEBIT';
  // Separate withdrawal/deposit columns
  const w = findColVal(norm, 'withdrawal amt.', 'withdrawal', 'debit amt.', 'debit amount', 'debit', 'dr amt.', 'dr');
  return parseAmount(w) > 0;
};
const isCredit = (norm) => {
  const drcr = getDrCr(norm);
  if (drcr) return drcr === 'CR' || drcr === 'CREDIT';
  const c = getCreditAmt(norm);
  return parseAmount(c) > 0;
};

// Shared footer/summary keywords — used for both CSV and Excel parsing
const FOOTER_KEYWORDS = [
  'statement summary', 'opening balance', 'closing balance',
  'generated on', 'dr count', 'cr count', 'total debit', 'total credit',
  'account summary', 'note :', 'note:', 'disclaimer',
];

// Returns true if a normalized row looks like a summary/footer row (not a real transaction)
const isSummaryTx = (norm) => {
  const desc   = (getTxDesc(norm) || '').toLowerCase().trim();
  // Also check the raw first non-empty value in the row (handles CSV where summary text lands in any column)
  const firstVal = Object.values(norm)
    .map(v => (v || '').toString().toLowerCase().trim())
    .find(v => v.length > 0) || '';
  return FOOTER_KEYWORDS.some(kw => desc.startsWith(kw) || firstVal.startsWith(kw));
};

// ── Merchant display-name cleanup ────────────────────
const MERCHANT_MAP = [
  [/netflix/i, 'Netflix'],          [/spotify/i, 'Spotify'],
  [/hotstar|disney/i, 'Disney+ Hotstar'], [/amazon\s*prime|primevideo/i, 'Amazon Prime'],
  [/youtube\s*premium/i, 'YouTube Premium'], [/zee5/i, 'Zee5'], [/sonyliv/i, 'SonyLIV'],
  [/render\.com/i, 'Render.com'],   [/github/i, 'GitHub'],    [/notion/i, 'Notion'],
  [/figma/i, 'Figma'],              [/openai|chatgpt/i, 'OpenAI'], [/slack/i, 'Slack'],
  [/zoom/i, 'Zoom'],                [/google/i, 'Google'],    [/microsoft|msft/i, 'Microsoft'],
  [/dropbox/i, 'Dropbox'],          [/apple/i, 'Apple'],      [/jio/i, 'Jio'],
  [/airtel/i, 'Airtel'],            [/bsnl/i, 'BSNL'],        [/vodafone/i, 'Vodafone'],
  [/bajaj\s*finance/i, 'Bajaj Finance'], [/hdfc/i, 'HDFC'],  [/icici/i, 'ICICI'],
  [/swiggy/i, 'Swiggy'],            [/zomato/i, 'Zomato'],    [/amazon/i, 'Amazon'],
  [/flipkart/i, 'Flipkart'],        [/myntra/i, 'Myntra'],    [/paytm/i, 'Paytm'],
  [/phonepe/i, 'PhonePe'],          [/razorpay/i, 'Razorpay'],[/ola\b/i, 'Ola'],
  [/uber/i, 'Uber'],                [/irctc/i, 'IRCTC'],      [/bookmyshow/i, 'BookMyShow'],
];

const SUBSCRIPTION_PATTERNS = [
  /netflix/i, /spotify/i, /hotstar/i, /disney/i, /prime\s*video/i, /amazon\s*prime/i,
  /youtube\s*premium/i, /zee5/i, /sonyliv/i, /render\.com/i, /github/i, /notion/i,
  /figma/i, /openai/i, /chatgpt/i, /slack/i, /\bzoom\b/i,
  /google\s*(one|workspace)/i, /microsoft\s*(365|office)/i, /dropbox/i,
  /net\s*banking\s*si/i, /standing\s*instruct/i, /si\s*[-\u2013]\s*monthly/i,
  /\bemi\b/i, /loan\s*(emi|inst)/i,
];

const cleanMerchantName = (raw) => {
  if (!raw) return 'Unknown';
  // Known merchant map tested on the full raw string
  for (const [pattern, name] of MERCHANT_MAP) {
    if (pattern.test(raw)) return name;
  }
  // Strip common bank prefixes + long numeric/masked IDs
  let clean = raw
    .replace(/^\d+\s+/i, '')                                  // leading numeric ID
    .replace(/^(UPI|IMPS|NEFT|RTGS|ACH\s*DR|IB\s*BILLPAY\s*DR)[-\s:]+/i, '')
    .replace(/^(EAW|ATW|NWD|IWD)[-\s][^-]+-[^-]+-/i, '')     // ATM prefix
    .replace(/^POS\s+[\dX\s]*/i, '')                          // POS prefix
    .replace(/^\d+[-\s]+/i, '')                               // remaining leading digits
    .replace(/[-_][\dX]{6,}/g, '')                            // long masked IDs
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean.length > 2 ? clean.charAt(0).toUpperCase() + clean.slice(1) : raw.slice(0, 32);
};

const isLikelySubscription = (desc) =>
  SUBSCRIPTION_PATTERNS.some(p => p.test(desc));

function parseCSV(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = result.data.map(row => buildNorm(row));
  // Truncate at the first summary/footer row so bank statement totals are never counted
  const endIdx = rows.findIndex(row => isSummaryTx(row));
  return endIdx === -1 ? rows : rows.slice(0, endIdx);
}

function detectRecurring(transactions) {
  const filtered = transactions.filter(tx => {
    const norm = buildNorm(tx);
    const desc = getTxDesc(norm);
    const amt = parseAmount(getDebitAmt(norm) ?? getCreditAmt(norm));
    return desc && amt !== null && amt > 0;
  });
  const map = {};
  filtered.forEach(tx => {
    const norm = buildNorm(tx);
    const desc = getTxDesc(norm) || 'Unknown';
    const date = getTxDate(norm);
    const amount = parseAmount(getDebitAmt(norm) ?? getCreditAmt(norm));
    map[desc] = map[desc] || [];
    map[desc].push({ ...norm, _date: date, _amount: amount });
  });
  return Object.entries(map)
    .filter(([_, arr]) => arr.length > 1)
    .map(([desc, arr]) => ({
      description: cleanMerchantName(desc),
      rawDescription: desc,
      isSubscription: isLikelySubscription(desc),
      count: arr.length,
      total: arr.reduce((sum, tx) => sum + (parseAmount(getDebitAmt(tx) ?? getCreditAmt(tx)) || 0), 0),
      lastDate: getTxDate(arr[arr.length - 1]),
      details: arr
        .map(tx => ({ date: tx._date || '', amount: typeof tx._amount === 'number' ? tx._amount : null }))
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

const MiniBar = ({ label, value, max, onClick, isOpen }) => (
  <div className={`mini-bar-row${onClick ? ' mini-bar-clickable' : ''}${isOpen ? ' mini-bar-active' : ''}`} onClick={onClick}>
    <div className="mini-bar-label" title={label}>
      {onClick && <span className="expand-icon">{isOpen ? <FaChevronDown size={9}/> : <FaChevronRight size={9}/>}</span>}
      {label}
    </div>
    <div className="mini-bar-track">
      <div className="mini-bar-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} />
    </div>
    <div className="mini-bar-value">{fmt(value)}</div>
  </div>
);

const HeroState = () => (
  <div className="hero-state">
    <div className="hero-headline">Turn your bank statement into savings insights</div>
    <div className="hero-sub">Instantly see subscriptions, top spending categories and biggest payments — processed privately, right here in your browser.</div>
    <div className="hero-features">
      <div className="hero-feature">
        <div className="hero-feature-icon">💳</div>
        <div className="hero-feature-title">Detect Subscriptions</div>
        <div className="hero-feature-desc">Spots Netflix, Spotify, EMIs and hidden recurring charges automatically</div>
      </div>
      <div className="hero-feature">
        <div className="hero-feature-icon">📊</div>
        <div className="hero-feature-title">Spending Patterns</div>
        <div className="hero-feature-desc">Top payees, monthly trends and largest payments at a glance</div>
      </div>
      <div className="hero-feature">
        <div className="hero-feature-icon">🔒</div>
        <div className="hero-feature-title">100% Private</div>
        <div className="hero-feature-desc">Your bank data never leaves your browser. No accounts, no server uploads</div>
      </div>
    </div>
    <div className="hero-cta-hint">↑ Upload your bank statement above to get started</div>
  </div>
);

const Insights = ({ recurring, payments, userStats, hasData }) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [openSubIndex, setOpenSubIndex] = useState(null);
  const [openPaymentIndex, setOpenPaymentIndex] = useState(null);
  const [openPayeeIndex, setOpenPayeeIndex] = useState(null);
  if (!hasData) return null;

  const subscriptions  = recurring.filter(r => r.isSubscription);
  const otherRecurring = recurring.filter(r => !r.isSubscription);
  const subMonthlyEst  = subscriptions.reduce((s, r) => s + (r.total / Math.max(r.count, 1)), 0);

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

      {/* Subscriptions & EMIs — shown only when detected */}
      {subscriptions.length > 0 && (
        <div className="section-block subscription-block">
          <div className="section-header">
            <span>💳</span>
            <span>Subscriptions &amp; EMIs</span>
            <span className="count-badge">{subscriptions.length}</span>
            <span className="sub-monthly-est">~{fmt(subMonthlyEst)}/mo avg</span>
          </div>
          <table className="table-compact">
            <thead><tr><th style={{width:'55%'}}>Service</th><th>Occurrences</th><th>Total Paid</th><th>Last Date</th></tr></thead>
            <tbody>
              {subscriptions.sort((a,b) => b.total - a.total).map((r, i) => (
                <React.Fragment key={i}>
                  <tr onClick={() => setOpenSubIndex(openSubIndex === i ? null : i)} className="clickable-row">
                    <td>
                      <span className="expand-icon">{openSubIndex === i ? <FaChevronDown size={10}/> : <FaChevronRight size={10}/>}</span>
                      <span className="sub-service-name">{r.description}</span>
                    </td>
                    <td><span className="occ-badge">{r.count}×</span></td>
                    <td className="amt-debit">{fmt(r.total)}</td>
                    <td className="date-cell">{r.lastDate}</td>
                  </tr>
                  {openSubIndex === i && (
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
        </div>
      )}

      {/* Other Recurring (or all Recurring when no subscriptions found) */}
      <div className="section-block">
        <div className="section-header">
          <FaCheckCircle color="#4e54c8" />
          <span>{subscriptions.length > 0 ? 'Other Recurring' : 'Recurring Payments'}</span>
          {otherRecurring.length > 0 && <span className="count-badge">{otherRecurring.length}</span>}
        </div>
        {otherRecurring.length === 0 ? (
          <p className="badge-muted">{subscriptions.length > 0 ? 'No other recurring payments.' : 'No recurring payments found.'}</p>
        ) : (
          <table className="table-compact">
            <thead><tr><th style={{width:'55%'}}>Description</th><th>Occurrences</th><th>Total Spent</th><th>Last Date</th></tr></thead>
            <tbody>
              {otherRecurring.sort((a,b) => b.total - a.total).map((r, i) => (
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
                  <React.Fragment key={i}>
                    <tr onClick={() => setOpenPaymentIndex(openPaymentIndex === i ? null : i)} className="clickable-row">
                      <td><span className="expand-icon">{openPaymentIndex === i ? <FaChevronDown size={10}/> : <FaChevronRight size={10}/>}</span>{p.displayName.slice(0, 38)}{p.displayName.length > 38 ? '\u2026' : ''}</td>
                      <td className="amt-debit">{fmt(p.amount)}</td>
                      <td className="date-cell">{p.date}</td>
                    </tr>
                    {openPaymentIndex === i && (
                      <tr className="detail-row">
                        <td colSpan={3}>
                          <div className="payment-detail">
                            <div className="payment-detail-item"><span className="detail-label">Full Description</span><span>{p.description}</span></div>
                            {p.reference && <div className="payment-detail-item"><span className="detail-label">Reference / Cheque No.</span><span>{p.reference}</span></div>}
                            {p.type && <div className="payment-detail-item"><span className="detail-label">Transaction Type</span><span>{p.type}</span></div>}
                            {p.balance && <div className="payment-detail-item"><span className="detail-label">Balance After</span><span className="amt-debit">{p.balance}</span></div>}
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

        {/* Right column: merchants + monthly */}
        <div style={{display:'flex',flexDirection:'column',gap:'0.8rem'}}>

          {/* Top Merchants */}
          {userStats.topMerchants?.length > 0 && (
            <div className="section-block">
              <div className="section-header"><FaStore color="#f57c00" /><span>Top Payees by Spend</span></div>
              <div className="mini-bars">
                {userStats.topMerchants.map((m, i) => (
                  <React.Fragment key={i}>
                    <MiniBar
                      label={m.name.slice(0, 32)}
                      value={m.total}
                      max={maxMerchant}
                      onClick={() => setOpenPayeeIndex(openPayeeIndex === i ? null : i)}
                      isOpen={openPayeeIndex === i}
                    />
                    {openPayeeIndex === i && m.transactions && (
                      <div className="payee-detail">
                        <table className="table-compact">
                          <thead><tr><th>Date</th><th>Amount</th></tr></thead>
                          <tbody>
                            {[...m.transactions].sort((a, b) => b.amount - a.amount).map((t, idx) => (
                              <tr key={idx}>
                                <td className="date-cell">{t.date || '\u2014'}</td>
                                <td className="amt-debit">{fmt(t.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </React.Fragment>
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
    const debits = data
      .map(tx => ({ tx, norm: buildNorm(tx) }))
      .filter(({ norm }) => {
        const amt = parseAmount(getDebitAmt(norm));
        return amt !== null && amt > 0 && isDebit(norm);
      })
      .sort((a, b) => (parseAmount(getDebitAmt(b.norm)) || 0) - (parseAmount(getDebitAmt(a.norm)) || 0));
    return debits.slice(0, 5).map(({ norm }) => ({
      description: getTxDesc(norm),
      displayName: cleanMerchantName(getTxDesc(norm)),
      amount: parseAmount(getDebitAmt(norm)) || 0,
      date: getTxDate(norm),
      reference: findColVal(norm, 'ref no./cheque no.', 'chq/ref no.', 'chq / ref no.', 'reference no.', 'transaction id', 'txn id') || '',
      balance: findColVal(norm, 'balance', 'closing balance', 'bal') || '',
      type: findColVal(norm, 'transaction type', 'type', 'mode', 'transaction mode') || '',
    }));
  }

  function getUserStats(data) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const normed = data.map(tx => buildNorm(tx));
    const debits  = normed.filter(norm => isDebit(norm)  && parseAmount(getDebitAmt(norm))  > 0);
    const credits = normed.filter(norm => isCredit(norm) && parseAmount(getCreditAmt(norm)) > 0);

    const totalSpent    = debits.reduce((s, n)  => s + (parseAmount(getDebitAmt(n))  || 0), 0);
    const totalReceived = credits.reduce((s, n) => s + (parseAmount(getCreditAmt(n)) || 0), 0);

    const largestPayment = debits.reduce((max, norm) => {
      const amt = parseAmount(getDebitAmt(norm)) || 0;
      return amt > max.amount ? { amount: amt, description: cleanMerchantName(getTxDesc(norm)) } : max;
    }, { amount: 0, description: '' });

    // Top merchants
    const merchantMap = {};
    debits.forEach(norm => {
      const desc = getTxDesc(norm) || 'Unknown';
      const amt  = parseAmount(getDebitAmt(norm)) || 0;
      const date = getTxDate(norm);
      if (!merchantMap[desc]) merchantMap[desc] = { total: 0, transactions: [] };
      merchantMap[desc].total += amt;
      merchantMap[desc].transactions.push({ date, amount: amt });
    });
    const topMerchants = Object.entries(merchantMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([name, d]) => ({ name: cleanMerchantName(name), total: d.total, transactions: d.transactions }));

    // Monthly spend — date is already "DD/MM/YYYY" string from getTxDate
    const monthMap = {};
    debits.forEach(norm => {
      const dateStr = getTxDate(norm);
      const amt = parseAmount(getDebitAmt(norm)) || 0;
      const parts = dateStr.split('/');
      if (parts.length >= 3) {
        const month = parseInt(parts[1]);
        const year  = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        const label = month >= 1 && month <= 12 ? `${monthNames[month - 1]} ${year}` : '';
        if (label) monthMap[label] = (monthMap[label] || 0) + amt;
      }
    });
    const monthlySpend = Object.entries(monthMap)
      .sort((a, b) => {
        const [aM, aY] = a[0].split(' ');
        const [bM, bY] = b[0].split(' ');
        return aY !== bY ? Number(aY) - Number(bY) : monthNames.indexOf(aM) - monthNames.indexOf(bM);
      })
      .slice(-6)
      .map(([month, total]) => ({ month, total }));

    return {
      totalSpent,
      totalReceived,
      largestPayment,
      paymentCount: debits.length,
      creditCount: credits.length,
      avgTransaction: debits.length ? totalSpent / debits.length : 0,
      topMerchants,
      monthlySpend,
    };
  }

  const handleFile = async (e) => {
    setError('');
    setFileName('');
    const file = e.target.files[0];
    if (!file) return;

    // File size limit: 20 MB
    const MAX_SIZE_MB = 20;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Please upload a file under ${MAX_SIZE_MB} MB.`);
      return;
    }

    // MIME type + extension validation
    const allowedMime = [
      'text/csv', 'text/plain', 'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExt = ['csv', 'xlsx', 'xls'];
    if (!allowedExt.includes(ext) || (file.type && !allowedMime.includes(file.type) && file.type !== '')) {
      setError('Invalid file type. Only .csv, .xlsx, and .xls bank statements are accepted.');
      return;
    }

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

          // Detect footer/summary section — stop before it
          const isSummaryRow = (row) => {
            const cells = row.map(c => (c || '').toString().toLowerCase().trim());
            const nonEmpty = cells.filter(c => c.length > 0);
            const firstCell = nonEmpty[0] || '';
            return FOOTER_KEYWORDS.some(kw => firstCell.startsWith(kw));
          };

          const rawDataRows = rows.slice(headerRowIdx + 1);
          // Find first footer row index and truncate
          let endIdx = rawDataRows.length;
          for (let i = 0; i < rawDataRows.length; i++) {
            if (isSummaryRow(rawDataRows[i])) { endIdx = i; break; }
          }
          const dataRows = rawDataRows.slice(0, endIdx);

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
            const norm = buildNorm(row);
            const date = getTxDate(norm);
            const desc = getTxDesc(norm);
            return date && desc && date.length > 0 && desc.toString().trim().length > 0;
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
      console.error('Statement parse error:', err);
      setError('Failed to parse file. Please check the file is a valid bank statement.');
    }
  };

  return (
    <Card>
      <h2 className="upload-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FaFileCsv color="#4e54c8" /> Upload Bank Statement <span className="badge-muted">CSV or Excel → detect recurring payments → dashboard + renewal alerts</span>
      </h2>

      {/* Privacy notice */}
      <div className="privacy-notice">
        🔒 <strong>Your data never leaves your device.</strong> All processing happens locally in your browser. Nothing is uploaded to any server.
      </div>
      <label htmlFor="statement-upload" className="upload-box">
        <input id="statement-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
        {fileName ? `Selected: ${fileName}` : 'Click to select a bank statement  (.csv, .xlsx, .xls)'}
      </label>
      {error && (
        <div className="error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaExclamationCircle color="#d32f2f" /> {error}
        </div>
      )}
      {!hasData && <HeroState />}
      <Insights recurring={recurring} payments={payments} userStats={userStats} hasData={hasData} />
    </Card>
  );
};

export default StatementUploader;
