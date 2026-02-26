import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from './Card';
import { FaFileCsv, FaCheckCircle, FaExclamationCircle, FaChevronDown, FaChevronRight, FaWallet, FaArrowDown, FaArrowUp, FaExchangeAlt, FaStore, FaDownload, FaFileExcel, FaHistory } from 'react-icons/fa';
import * as XLSX from '@e965/xlsx';
import Papa from 'papaparse';
import { saveSession, getAllSessions, deleteSession, clearAllSessions } from '../utils/historyDB';
import HistoryPanel from './HistoryPanel';

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

// Colors assigned per loaded file (index-based)
const FILE_PALETTE = ['#4e54c8','#e53935','#2e7d32','#f57c00','#6a1b9a','#0891b2'];

// ── Spending category map ─────────────────────────────────────────────────────
// [pattern, label, emoji, color]
const CATEGORY_MAP = [
  // Streaming
  [/netflix/i,                         'Streaming',    '📺', '#e50914'],
  [/spotify/i,                         'Streaming',    '📺', '#1db954'],
  [/hotstar|disney/i,                  'Streaming',    '📺', '#1a2b6d'],
  [/zee5/i,                            'Streaming',    '📺', '#7b2ff7'],
  [/sonyliv/i,                         'Streaming',    '📺', '#0066cc'],
  [/amazon\s*prime|primevideo/i,       'Streaming',    '📺', '#ff9900'],
  [/youtube\s*premium/i,               'Streaming',    '📺', '#ff0000'],
  [/jio\s*cinema|jiocinema/i,          'Streaming',    '📺', '#0a6ebd'],
  [/mxplayer|mx\s*player/i,            'Streaming',    '📺', '#ff6b35'],
  [/apple\s*tv|appletv/i,              'Streaming',    '📺', '#555555'],
  // Food & Dining
  [/swiggy/i,                          'Food & Dining','🍔', '#fc8019'],
  [/zomato/i,                          'Food & Dining','🍔', '#e23744'],
  [/dominos?\b/i,                      'Food & Dining','🍔', '#006491'],
  [/pizza\s*hut/i,                     'Food & Dining','🍔', '#ee3124'],
  [/mcdonalds?|\bmcd\b/i,              'Food & Dining','🍔', '#ffbc0d'],
  [/\bkfc\b/i,                         'Food & Dining','🍔', '#f40027'],
  [/\bsubway\b/i,                      'Food & Dining','🍔', '#008c15'],
  [/burger\s*king/i,                   'Food & Dining','🍔', '#f5821f'],
  [/starbucks|ccd\b|barista|cafe|coffee/i, 'Food & Dining','☕', '#6f4e37'],
  [/restaurant|dining|canteen|eatery|food\s*court/i, 'Food & Dining','🍔', '#e53935'],
  // Groceries
  [/bigbasket|bb\s*now/i,              'Groceries',    '🛒', '#84c225'],
  [/blinkit|grofers/i,                 'Groceries',    '🛒', '#f8d100'],
  [/zepto/i,                           'Groceries',    '🛒', '#8b5cf6'],
  [/\bdmart\b|d-mart/i,                'Groceries',    '🛒', '#e53935'],
  [/reliance\s*(fresh|smart)/i,        'Groceries',    '🛒', '#1565c0'],
  [/jiomart/i,                         'Groceries',    '🛒', '#0a6ebd'],
  [/more\s*(supermarket|retail)/i,     'Groceries',    '🛒', '#e53935'],
  [/nature\s*basket|godrej\s*nature/i, 'Groceries',    '🛒', '#4caf50'],
  [/grocery|supermarket|hypermarket/i, 'Groceries',    '🛒', '#4caf50'],
  // Shopping
  [/amazon(?!\s*prime)/i,              'Shopping',     '🛍️', '#ff9900'],
  [/flipkart/i,                        'Shopping',     '🛍️', '#2874f0'],
  [/myntra/i,                          'Shopping',     '🛍️', '#ff3f6c'],
  [/nykaa/i,                           'Shopping',     '🛍️', '#fc2779'],
  [/\bajio\b/i,                        'Shopping',     '🛍️', '#e53935'],
  [/meesho/i,                          'Shopping',     '🛍️', '#9b59b6'],
  [/tata\s*cliq/i,                     'Shopping',     '🛍️', '#1a1a2e'],
  [/snapdeal/i,                        'Shopping',     '🛍️', '#e40000'],
  [/lenskart/i,                        'Shopping',     '🛍️', '#ff6b35'],
  [/firstcry/i,                        'Shopping',     '🛍️', '#ff6b35'],
  // Travel & Transport
  [/\buber\b/i,                        'Travel',       '🚗', '#1a1a1a'],
  [/\bola\b/i,                         'Travel',       '🚗', '#5bb300'],
  [/rapido/i,                          'Travel',       '🚗', '#ffd700'],
  [/redbus/i,                          'Travel',       '🚌', '#d84f20'],
  [/makemytrip|\bmmt\b/i,              'Travel',       '✈️', '#e53935'],
  [/goibibo/i,                         'Travel',       '✈️', '#0d9fdd'],
  [/yatra\.com|yatra\b/i,              'Travel',       '✈️', '#e53935'],
  [/irctc/i,                           'Travel',       '🚆', '#e91e63'],
  [/indigo|spicejet|air\s*india|vistara|go\s*first|akasa/i, 'Travel','✈️','#1565c0'],
  [/\boyo\b/i,                         'Travel',       '🏨', '#ee2e24'],
  [/airbnb/i,                          'Travel',       '🏨', '#ff5a5f'],
  [/hotel|resort|lodge/i,              'Travel',       '🏨', '#795548'],
  [/\bcab\b|taxi/i,                    'Travel',       '🚗', '#607d8b'],
  // Fuel
  [/petrol|diesel|\bfuel\b/i,          'Fuel',         '⛽', '#795548'],
  [/bpcl|bharat\s*petro/i,             'Fuel',         '⛽', '#ff6b00'],
  [/hpcl|hindustan\s*petro/i,          'Fuel',         '⛽', '#0055a4'],
  [/iocl|indian\s*oil/i,               'Fuel',         '⛽', '#e63329'],
  [/\bshell\b/i,                       'Fuel',         '⛽', '#f5d600'],
  [/nayara/i,                          'Fuel',         '⛽', '#e91e63'],
  // Health & Medical
  [/medplus/i,                         'Health',       '💊', '#00897b'],
  [/netmeds/i,                         'Health',       '💊', '#0077c8'],
  [/1mg|tata\s*1mg/i,                  'Health',       '💊', '#e53935'],
  [/practo/i,                          'Health',       '💊', '#5c6bc0'],
  [/apollo\s*(pharm|hosp)/i,           'Health',       '🏥', '#003d7c'],
  [/fortis|max\s*hosp|manipal\s*hosp/i,'Health',       '🏥', '#e53935'],
  [/pharmacy|chemist|medical\s*store|med\s*shop/i, 'Health','💊','#e91e63'],
  [/hospital|clinic|diagnostic|lab\s*test|pathology/i, 'Health','🏥','#e91e63'],
  // Education
  [/udemy/i,                           'Education',    '📚', '#a435f0'],
  [/coursera/i,                        'Education',    '📚', '#0056d2'],
  [/byju/i,                            'Education',    '📚', '#6b48ff'],
  [/unacademy/i,                       'Education',    '📚', '#08bd80'],
  [/upgrad/i,                          'Education',    '📚', '#e53935'],
  [/skillshare/i,                      'Education',    '📚', '#002333'],
  [/school\s*fee|college\s*fee|tuition|exam\s*fee/i, 'Education','📚','#1565c0'],
  // Utilities & Bills
  [/electricity|bescom|tneb|msedcl|\bcesc\b|adani\s*elec|tata\s*power/i, 'Utilities','💡','#f57c00'],
  [/water\s*bill|bwssb/i,              'Utilities',    '💧', '#0288d1'],
  [/piped\s*gas|\bmgl\b|\bigl\b|mahanagar\s*gas/i, 'Utilities','🔥','#f44336'],
  [/indane|bharat\s*gas|hp\s*gas|\blpg\b/i, 'Utilities','🔥','#ff7043'],
  [/broadband|internet\s*bill|wi.?fi/i,'Utilities',    '🌐', '#0288d1'],
  [/bill\s*pay|utility\s*pay/i,        'Utilities',    '💡', '#f57c00'],
  // Telecom
  [/jio(?!mart|cinema)/i,              'Telecom',      '📱', '#0a6ebd'],
  [/airtel/i,                          'Telecom',      '📱', '#e53935'],
  [/vodafone|\bvi\b/i,                 'Telecom',      '📱', '#e40000'],
  [/\bbsnl\b/i,                        'Telecom',      '📱', '#003366'],
  [/mobile\s*bill|postpaid|prepaid\s*recharge|recharge/i, 'Telecom','📱','#607d8b'],
  // Insurance
  [/\blic\b|life\s*insur/i,            'Insurance',    '🛡️', '#003d7c'],
  [/hdfc\s*(ergo|life|insur)/i,        'Insurance',    '🛡️', '#004c8c'],
  [/icici\s*(lombard|pru)/i,           'Insurance',    '🛡️', '#f37021'],
  [/star\s*health|care\s*health|niva\s*bupa/i, 'Insurance','🛡️','#e53935'],
  [/bajaj\s*allianz/i,                 'Insurance',    '🛡️', '#003d7c'],
  [/insurance\s*prem|policy\s*prem/i,  'Insurance',    '🛡️', '#1565c0'],
  // Investments
  [/groww/i,                           'Investments',  '📈', '#00d09c'],
  [/zerodha|\bkite\b/i,                'Investments',  '📈', '#387ed1'],
  [/upstox/i,                          'Investments',  '📈', '#7c4dff'],
  [/kuvera/i,                          'Investments',  '📈', '#5c6bc0'],
  [/smallcase/i,                       'Investments',  '📈', '#2bb793'],
  [/mutual\s*fund|\bmf\b.*sip|\bsip\b|\bnps\b|\bppf\b|\belss\b/i, 'Investments','📈','#1565c0'],
  [/demat|brokerage|equity|\bnse\b|\bbse\b/i, 'Investments','📈','#1565c0'],
  // EMI & Loans
  [/\bemi\b/i,                         'EMI & Loans',  '💰', '#6a1b9a'],
  [/loan\s*(emi|inst|repay)/i,         'EMI & Loans',  '💰', '#6a1b9a'],
  [/bajaj\s*finance/i,                 'EMI & Loans',  '💰', '#6a1b9a'],
  [/home\s*loan|car\s*loan|personal\s*loan|education\s*loan/i, 'EMI & Loans','💰','#6a1b9a'],
  // ATM & Cash
  [/atm\s*(wd|wdl|cash|with)|cash\s*with|\bnwd\b|\biwd\b|\beaw\b|\batw\b/i, 'ATM & Cash','🏧','#455a64'],
  // Wallet & UPI apps (top-ups, wallet debits)
  [/paytm/i,                           'Wallet & UPI', '📲', '#00b9f1'],
  [/mobikwik/i,                        'Wallet & UPI', '📲', '#6739b7'],
  [/freecharge/i,                      'Wallet & UPI', '📲', '#f6c000'],
  [/\bbhim\b/i,                        'Wallet & UPI', '📲', '#00897b'],
  // Credit Card payments
  [/credit\s*card\s*(pay|bill|due)|\bcc\s*(pay|bill|due|emi)\b/i, 'Credit Card','💳','#c62828'],
  [/(hdfc|icici|sbi|axis|kotak|amex|citi)\s*(cc|credit\s*card|visa|master|rupay)/i, 'Credit Card','💳','#c62828'],
  // NACH / ECS / auto-debit mandates
  [/\bnach\b|\becs\b|\bmandatepay|\bautopay\b|\bauto\s*debit\b/i, 'Auto Debit',  '🔁', '#5c6bc0'],
  // Cheque & self transfers
  [/\bself\b|\bown\s*a\/c\b|chq\s*paid|cheque\s*paid|\bcheque\b.*issued/i, 'Transfers','🔄','#607d8b'],
  [/\bimps\b/i,                        'Transfers',    '🔄', '#607d8b'],
  // More EMI patterns
  [/bajaj.*fin|bajajfinotp|\bbfl\d/i,  'EMI & Loans',  '💰', '#6a1b9a'],
  [/\bnach.*emi\b|\bemi.*nach\b/i,     'EMI & Loans',  '💰', '#6a1b9a'],
  // More Food & Dining
  [/caterer|catering|\bdhaba\b|\bdabha\b|tiffin|bhojan|bhojanalay/i, 'Food & Dining','🍔','#e53935'],
  [/\bchai\b|tea\s*(house|stall|shop)|snack\s*bar|fast\s*food/i,    'Food & Dining','☕','#6f4e37'],
  [/bakery|sweet\s*(shop|mart)|mithai|confection/i,                   'Food & Dining','🍰','#e53935'],
  // More Groceries
  [/kirana|provision\s*(store|shop)|general\s*store/i, 'Groceries',  '🛒', '#4caf50'],
  // Housing & Rent
  [/\brent\b|\blease\b|\btenancy\b/i,    'Housing & Rent', '🏠', '#795548'],
  [/\bpg\b.*rent|paying\s*guest/i,        'Housing & Rent', '🏠', '#795548'],
  [/society|maintenance\s*(fee|charg)|hsg\s*soc|housing\s*soc|apartment|flat\s*no/i, 'Housing & Rent','🏠','#795548'],
  [/property\s*tax|house\s*tax|municipal\s*tax|\bbrihanmumbai\b|\bnmc\b|\bbmc\b/i, 'Housing & Rent','🏠','#795548'],
  [/stampduty|stamp\s*duty|registration\s*fee|home\s*regist/i, 'Housing & Rent','🏠','#795548'],
  // Fees & Charges (bank fees, forex, penalties)
  [/\bcharge\b|\bfee\b.*bank|bank.*\bfee\b|annual\s*fee|service\s*charge|\bpenalty\b/i, 'Bank Charges','🏦','#607d8b'],
  [/\bgst\b|tax\s*deduct|\btds\b|\btcs\b/i, 'Taxes & Govt',  '🏛️', '#546e7a'],
  [/passport|visa\s*fee|\brto\b|\bvahan\b|driving\s*licen|traffic\s*fine|\bechallan\b/i, 'Taxes & Govt','🏛️','#546e7a'],
  // Charity & Donations
  [/donat|charity|\bngo\b|foundation|trust\s*(fund)?|relief\s*fund|pm\s*(cares|relief)/i, 'Donations','🤍','#e91e63'],
  // Transfers (broad — keep near bottom)
  [/neft|rtgs/i,                       'Transfers',    '🔄', '#607d8b'],
  [/self\s*transfer|own\s*acct/i,      'Transfers',    '🔄', '#607d8b'],
  [/sent\s*to|transfer\s*to|trf\s*to/i,'Transfers',   '🔄', '#607d8b'],
];

// Detects UPI VPA handle in a transaction description
const UPI_VPA_RE = /@(ok(?:axis|sbi|icici|hdfcbank)|ybl|idfcfirst|indus|federal|axisbank|apl|pthdfc|ptsbi|ptyes|okbizaxis|okhdfcbank)\b/i;

const getCategory = (rawDesc, amount) => {
  if (!rawDesc) return { name: 'Other', emoji: '❓', color: '#9e9e9e' };

  // Pass 1 — test the raw bank description as-is
  for (const [pattern, name, emoji, color] of CATEGORY_MAP) {
    if (pattern.test(rawDesc)) return { name, emoji, color };
  }

  // Pass 2 — UPI string detected: extract the payee name and re-test
  if (UPI_VPA_RE.test(rawDesc) || /\bUPI\b/i.test(rawDesc)) {
    const vpaName = rawDesc.split('@')[0]
      .replace(/-(GPAY|PAYTM|YBL|OKAXIS|OKSBI|OKICICI|OKHDFCBANK)$/i, '')
      .replace(/[-_][A-Z0-9]{6,}$/i, '')
      .replace(/[_-]/g, ' ')
      .trim();
    for (const [pattern, name, emoji, color] of CATEGORY_MAP) {
      if (pattern.test(vpaName)) return { name, emoji, color };
    }
    // Still no match → it's a person-to-person UPI payment
    return { name: 'UPI Transfer', emoji: '📲', color: '#0288d1' };
  }

  // Pass 3 — test the human-readable cleaned merchant name as fallback
  const cleaned = cleanMerchantName(rawDesc);
  for (const [pattern, name, emoji, color] of CATEGORY_MAP) {
    if (pattern.test(cleaned)) return { name, emoji, color };
  }

  // Pass 4 — large round-number heuristic
  // Amounts like 10000, 25000, 50000 etc. that are still uncategorized are
  // almost always rent, loan repayments, or personal transfers — not random purchases.
  if (amount && amount >= 5000) {
    const rounded = Math.round(amount);
    const isRound = rounded % 500 === 0;  // multiple of 500
    if (isRound) {
      // Check cleaned name for rent/housing hints one more time with looser match
      if (/flat|room|house|home|hostel|\bpg\b|plot|gala|office\s*rent/i.test(rawDesc))
        return { name: 'Housing & Rent', emoji: '🏠', color: '#795548' };
      // Cheque-based or IMPS large transfers are likely personal
      if (/\bchq\b|\bcheque\b|\bimps\b|\bclg\b|clearing/i.test(rawDesc))
        return { name: 'Transfers', emoji: '🔄', color: '#607d8b' };
      // Anything else large & round = likely a personal/business transfer
      return { name: 'Personal Transfer', emoji: '💸', color: '#0288d1' };
    }
  }

  return { name: 'Other', emoji: '❓', color: '#9e9e9e' };
};

const cleanMerchantName = (raw) => {
  if (!raw) return 'Unknown';
  // Known merchant map tested on the full raw string first
  for (const [pattern, name] of MERCHANT_MAP) {
    if (pattern.test(raw)) return name;
  }
  let s = raw.trim();

  // UPI string: extract the name part before the @handle
  // e.g. "KOMALBEN ASHOKBHAI M-KOMALMISTRYSHARMA@OKSBI-BKID0002043-UPI" → "Komalben Ashokbhai"
  // e.g. "JALSO THE FOOD COURT-GPAY@OKBIZAXIS-UTIB0000553-UPI"         → "Jalso The Food Court"
  const upiMatch = s.match(/^([^@]{2,40})@[A-Z0-9]+[-.]?[A-Z0-9]*[-.]?[A-Z0-9]*/i);
  if (upiMatch) {
    // The name part is everything before the @, minus any trailing UPI handle prefix
    let name = upiMatch[1]
      .replace(/-(GPAY|PAYTM|YBL|OKAXIS|OKSBI|OKICICI|OKHDFCBANK|YESB|IDFCFIRST|INDUS|FEDERAL|AXIS|SBI|HDFC|ICICI|KOTAK)$/i, '')
      .replace(/[\-_]([A-Z0-9]{8,})$/i, '')  // strip trailing UPI token
      .replace(/[_-]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (name.length > 2) return name.replace(/\b\w/g, c => c.toUpperCase());
  }

  // Strip GPAY@ / PhonePe@ prefixes
  s = s.replace(/^(GPAY|PHONEPE|PAYTM|BHIM)[\s@-]+/i, '');

  // Strip common bank prefixes
  s = s
    .replace(/^\d+\s+/i, '')                               // leading numeric ID
    .replace(/^(UPI|IMPS|NEFT|RTGS|ACH\s*DR|IB\s*BILLPAY\s*DR)[-\s:]+/i, '')
    .replace(/^(EAW|ATW|NWD|IWD)[-\s][^-]+-[^-]+-/i, '')  // ATM prefix
    .replace(/^POS\s+[\dX\s]*/i, '')                       // POS prefix
    .replace(/^\d+[-\s]+/i, '')                            // remaining leading digits
    .replace(/[-_][\dX]{6,}/g, '')                         // long masked IDs
    .replace(/@[\w.-]+$/i, '')                             // trailing @upi-handle
    .replace(/-?(UTIB|KKBK|SBIN|HDFC|ICIC|YESB|IDFB|INDB|FDRL|AXIS|PYTM)\d*[-\w]*/gi, '') // IFSC codes
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s.length > 2 ? s.charAt(0).toUpperCase() + s.slice(1) : raw.slice(0, 32);
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

// Deduplicate transactions that appear in multiple files (same date + amount + description).
// Keeps one copy but merges __srcs so the UI can show "in both files".
// Normalise any date string to DD/MM/YYYY so keys match across files
// Handles: "25/04/25", "25-04-2025", "25/04/2025", "2025-04-25" etc.
function canonicalDate(dateStr) {
  if (!dateStr) return '';
  const s = dateStr.toString().trim();
  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[3].padStart(2,'0')}/${iso[2].padStart(2,'0')}/${iso[1]}`;
  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
    return `${dmy[1].padStart(2,'0')}/${dmy[2].padStart(2,'0')}/${year}`;
  }
  return s;
}

function deduplicateData(flat) {
  const seen = new Map();
  const result = [];
  for (const tx of flat) {
    const norm = buildNorm(tx);
    const date = canonicalDate(getTxDate(norm));
    // Use cleaned merchant name so "POS NETFLIX.COM" and "UPI-NETFLIX" both key to "Netflix"
    const desc = cleanMerchantName(getTxDesc(norm) || '').toLowerCase().trim();
    const amt  = Math.round((parseAmount(getDebitAmt(norm) ?? getCreditAmt(norm)) ?? 0) * 100); // paise to avoid float drift
    // Skip rows we can't reliably key (no date AND no description)
    if (!date && !desc) { result.push(tx); continue; }
    const key = `${date}|${amt}|${desc}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      const newSrc = tx['__src'] || '';
      if (newSrc && !existing['__srcs'].includes(newSrc)) {
        existing['__srcs'].push(newSrc);
      }
    } else {
      const entry = { ...tx, '__srcs': tx['__srcs'] ? [...tx['__srcs']] : (tx['__src'] ? [tx['__src']] : []) };
      seen.set(key, entry);
      result.push(entry);
    }
  }
  return result;
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
    const rawDesc = getTxDesc(norm) || 'Unknown';
    // Group by cleaned name so "POS … NETFLIX.COM" and "POS … NETFLIX COM" merge
    const groupKey = cleanMerchantName(rawDesc);
    const date = getTxDate(norm);
    const amount = parseAmount(getDebitAmt(norm) ?? getCreditAmt(norm));
    if (!map[groupKey]) map[groupKey] = { rawDesc, txs: [] };
    map[groupKey].txs.push({ ...norm, _date: date, _amount: amount });
    // Keep rawDesc as the one that best identifies the subscription (for isLikelySubscription)
    // prefer whichever raw desc matches a subscription pattern
    if (isLikelySubscription(rawDesc)) map[groupKey].rawDesc = rawDesc;
  });
  return Object.entries(map)
    .filter(([_, { txs }]) => txs.length > 1)
    .map(([groupKey, { rawDesc, txs }]) => ({
      description: groupKey,
      rawDescription: rawDesc,
      isSubscription: isLikelySubscription(rawDesc) || isLikelySubscription(groupKey),
      count: txs.length,
      total: txs.reduce((sum, tx) => sum + (parseAmount(getDebitAmt(tx) ?? getCreditAmt(tx)) || 0), 0),
      lastDate: getTxDate(txs[txs.length - 1]),
      details: txs
        .map(tx => ({ date: tx._date || '', amount: typeof tx._amount === 'number' ? tx._amount : null, srcs: tx['__srcs'] || (tx['__src'] ? [tx['__src']] : []) }))
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

const MiniBar = ({ label, value, max, onClick, isOpen, barColor, prefix }) => (
  <div className={`mini-bar-row${onClick ? ' mini-bar-clickable' : ''}${isOpen ? ' mini-bar-active' : ''}`} onClick={onClick}>
    <div className="mini-bar-label" title={label}>
      {onClick && <span className="expand-icon">{isOpen ? <FaChevronDown size={9}/> : <FaChevronRight size={9}/>}</span>}
      {prefix && <span className="mini-bar-prefix">{prefix}</span>}
      {label}
    </div>
    <div className="mini-bar-track">
      <div className="mini-bar-fill" style={{ width: `${Math.round((value / max) * 100)}%`, ...(barColor ? { background: barColor } : {}) }} />
    </div>
    <div className="mini-bar-value">{fmt(value)}</div>
  </div>
);

const SourceTag = ({ srcs, colorMap, indexMap }) => {
  if (!srcs || !srcs.length) return null;
  return (
    <>
      {srcs.map((s, i) => {
        const color = colorMap[s] || '#6b7280';
        const num   = indexMap?.[s] ?? (i + 1);
        return <sup key={i} className="src-sup" style={{ color }} title={s.replace(/\.(csv|xlsx|xls)$/i, '')}>{num}</sup>;
      })}
    </>
  );
};

const FileLegend = ({ loadedFiles, colorMap, indexMap }) => (
  <div className="file-legend">
    {loadedFiles.map((f, i) => {
      const color = colorMap[f.name] || '#6b7280';
      const num   = indexMap[f.name] ?? (i + 1);
      const short = f.name.replace(/\.(csv|xlsx|xls)$/i, '');
      return (
        <span key={i} className="file-legend-item" style={{ color }}>
          <sup className="src-sup" style={{ color }}>{num}</sup>
          {short}
        </span>
      );
    })}
  </div>
);

const CategoryModal = ({ cat, onClose, multiFile, fileColorMap, fileIndexMap }) => {
  const [sort, setSort] = useState('amount');
  if (!cat) return null;

  const sorted = [...cat.transactions].sort((a, b) =>
    sort === 'amount' ? b.amount - a.amount :
    sort === 'date'   ? (b.date > a.date ? 1 : -1) :
    a.displayName.localeCompare(b.displayName)
  );

  const avg = cat.total / Math.max(cat.transactions.length, 1);
  const maxAmt = sorted[0]?.amount || 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: `3px solid ${cat.color}` }}>
          <span className="modal-title">
            <span className="modal-emoji">{cat.emoji}</span>
            {cat.name}
            <span className="modal-count">{cat.transactions.length} transactions</span>
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-stats">
          <div className="modal-stat">
            <div className="modal-stat-value" style={{ color: cat.color }}>{fmt(cat.total)}</div>
            <div className="modal-stat-label">Total spent</div>
          </div>
          <div className="modal-stat">
            <div className="modal-stat-value">{fmt(avg)}</div>
            <div className="modal-stat-label">Avg per txn</div>
          </div>
          <div className="modal-stat">
            <div className="modal-stat-value">{fmt(sorted[0]?.amount || 0)}</div>
            <div className="modal-stat-label">Largest</div>
          </div>
        </div>

        <div className="modal-toolbar">
          <span className="modal-toolbar-label">Sort by</span>
          {['amount','date','name'].map(s => (
            <button key={s} className={`sort-btn${sort === s ? ' active' : ''}`} onClick={() => setSort(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          <table className="table-compact">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Date</th>
                <th>Amount</th>
                <th style={{width:'30%'}}></th>
                {multiFile && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, idx) => (
                <tr key={idx}>
                  <td title={t.description}>{t.displayName}</td>
                  <td className="date-cell">{t.date || '—'}</td>
                  <td className="amt-debit">{fmt(t.amount)}</td>
                  <td>
                    <div className="modal-row-bar">
                      <div style={{ width: `${Math.round((t.amount / maxAmt) * 100)}%`, background: cat.color, opacity: 0.35, height: '100%', borderRadius: 99 }} />
                    </div>
                  </td>
                  {multiFile && <td>{t.srcs?.length > 0 && <SourceTag srcs={t.srcs} colorMap={fileColorMap} indexMap={fileIndexMap} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Reusable recurring table with search + show-more
const RecurringSection = ({ title, icon, items, multiFile, fileColorMap, fileIndexMap, emptyMsg, headerExtra, extraClass }) => {
  const [search, setSearch]   = useState('');
  const [showAll, setShowAll] = useState(false);
  const [openIdx, setOpenIdx] = useState(null);
  const PAGE = 12;

  const filtered = items
    .slice()
    .sort((a, b) => b.total - a.total)
    .filter(r => !search || r.description.toLowerCase().includes(search.toLowerCase()));
  const visible  = showAll ? filtered : filtered.slice(0, PAGE);
  const hasMore  = !showAll && filtered.length > PAGE;

  return (
    <div className={`section-block${extraClass ? ' ' + extraClass : ''}`}>
      <div className="section-header">
        {icon}
        {title && <span>{title}</span>}
        {items.length > 0 && <span className="count-badge">{items.length}</span>}
        {headerExtra}
      </div>
      {items.length === 0 ? (
        <p className="badge-muted">{emptyMsg}</p>
      ) : (
        <>
          {items.length > PAGE && (
            <div className="recurring-search-bar">
              <input
                className="recurring-search-input"
                type="text"
                placeholder="🔍 Search by name…"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowAll(true); setOpenIdx(null); }}
              />
              {search && (
                <button className="recurring-search-clear" onClick={() => { setSearch(''); setShowAll(false); setOpenIdx(null); }}>×</button>
              )}
            </div>
          )}
          <table className="table-compact">
            <thead><tr><th style={{width:'55%'}}>Description</th><th>Occurrences</th><th>Total Spent</th><th>Last Date</th></tr></thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={4} className="badge-muted" style={{textAlign:'center',padding:'0.8rem'}}>No results for &ldquo;{search}&rdquo;</td></tr>
              )}
              {visible.map((r, i) => (
                <React.Fragment key={i}>
                  <tr onClick={() => setOpenIdx(openIdx === i ? null : i)} className="clickable-row">
                    <td><span className="expand-icon">{openIdx === i ? <FaChevronDown size={10}/> : <FaChevronRight size={10}/>}</span>{r.description}</td>
                    <td><span className="occ-badge">{r.count}×</span></td>
                    <td className="amt-debit">{fmt(r.total)}</td>
                    <td className="date-cell">{r.lastDate}</td>
                  </tr>
                  {openIdx === i && (
                    <tr className="detail-row">
                      <td colSpan={4}>
                        <div className="detail-grid">
                          {r.details.map((d, idx) => (
                            <div key={idx} className="detail-chip">
                              <span>{d.date || '—'}</span>
                              {typeof d.amount === 'number' && <span className="amt-debit">{fmt(d.amount)}</span>}
                              {multiFile && d.srcs?.length > 0 && <SourceTag srcs={d.srcs} colorMap={fileColorMap} indexMap={fileIndexMap} />}
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
          {hasMore && (
            <button className="show-more-btn" onClick={() => setShowAll(true)}>
              Show {filtered.length - PAGE} more ▾
            </button>
          )}
          {showAll && !search && filtered.length > PAGE && (
            <button className="show-more-btn" onClick={() => { setShowAll(false); setOpenIdx(null); }}>
              Show less ▴
            </button>
          )}
        </>
      )}
    </div>
  );
};

const HeroState = () => (
  <div className="hero-state">
    <div className="hero-hints">
      <span>Detects subscriptions &amp; EMIs</span>
      <span className="hero-hint-sep">·</span>
      <span>Categorises spending</span>
      <span className="hero-hint-sep">·</span>
      <span>Largest payments</span>
      <span className="hero-hint-sep">·</span>
      <span>100% private — runs in your browser</span>
    </div>
  </div>
);

const Insights = ({ recurring, payments, userStats, hasData, loadedFiles, onExportCSV, onExportExcel, isPro, onUpgrade }) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [openSubIndex, setOpenSubIndex] = useState(null);
  const [openPaymentIndex, setOpenPaymentIndex] = useState(null);
  const [openPayeeIndex, setOpenPayeeIndex] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null); // holds the selected category object
  if (!hasData) return null;

  const multiFile    = loadedFiles.length > 1;
  const fileColorMap = Object.fromEntries(loadedFiles.map((f, i) => [f.name, FILE_PALETTE[i % FILE_PALETTE.length]]));
  const fileIndexMap = Object.fromEntries(loadedFiles.map((f, i) => [f.name, i + 1]));

  const subscriptions  = recurring.filter(r => r.isSubscription);
  const otherRecurring = recurring.filter(r => !r.isSubscription);
  const subMonthlyEst  = subscriptions.reduce((s, r) => s + (r.total / Math.max(r.count, 1)), 0);

  const maxMerchant = userStats.topMerchants?.[0]?.total || 1;
  const maxMonth = Math.max(...(userStats.monthlySpend?.map(m => m.total) || [1]), 1);

  return (
    <div className="insights-wrap">

      {/* Date range banner */}
      {userStats.dateRange && (
        <div className="date-range-bar">
          <span className="date-range-label">Statement period</span>
          <span className="date-range-value">{userStats.dateRange.from} &ndash; {userStats.dateRange.to}</span>
          <span className="date-range-days">{userStats.dateRange.days} days</span>
        </div>
      )}

      {/* File legend — only when multiple files loaded */}
      {multiFile && <FileLegend loadedFiles={loadedFiles} colorMap={fileColorMap} indexMap={fileIndexMap} />}

      {/* Export toolbar — Pro only */}
      {isPro ? (
        <div className="export-bar">
          <span className="export-bar-label"><FaDownload size={11}/> Export</span>
          <button className="export-btn export-btn-csv" onClick={onExportCSV} title="Download all transactions as CSV">
            <FaFileCsv size={13}/> CSV
          </button>
          <button className="export-btn export-btn-excel" onClick={onExportExcel} title="Download full report as Excel (4 sheets)">
            <FaFileExcel size={13}/> Excel Report
          </button>
        </div>
      ) : (
        <div className="pro-upsell-bar" onClick={onUpgrade}>
          <span>🔒 Export to CSV &amp; Excel is a <strong>Pro</strong> feature</span>
          <span className="pro-upsell-cta">Upgrade for ₹299 →</span>
        </div>
      )}
      <div className="stat-cards-row">
        <StatCard icon={<FaArrowDown size={16}/>} label="Total Debited" value={fmt(userStats.totalSpent)} sub={`${userStats.paymentCount} transactions`} color="#e53935" />
        <StatCard icon={<FaArrowUp size={16}/>} label="Total Credited" value={fmt(userStats.totalReceived)} sub={`${userStats.creditCount} transactions`} color="#2e7d32" />
        <StatCard icon={<FaExchangeAlt size={16}/>} label="Avg Debit" value={fmt(userStats.avgTransaction)} sub="per transaction" color="#1565c0" />
        <StatCard icon={<FaWallet size={16}/>} label="Largest Payment" value={fmt(userStats.largestPayment.amount)} sub={userStats.largestPayment.description?.slice(0, 28) || ''} color="#6a1b9a" />
      </div>

      {/* Spending by Category */}
      {userStats.categorySpend?.length > 0 && (
        <div className="section-block">
          <div className="section-header">
            <span>Spending by category</span>
            <span className="count-badge">{userStats.categorySpend.length}</span>
            <span className="section-hint">Click any row for details</span>
          </div>
          <div className="category-grid">
            {userStats.categorySpend.map((c, i) => (
              <div
                key={i}
                className="category-bar-row clickable-cat"
                onClick={() => setCategoryModal(c)}
                title={`View ${c.name} transactions`}
              >
                <div className="category-bar-label">
                  <span className="category-emoji">{c.emoji}</span>
                  <span>{c.name}</span>
                  <span className="cat-count">{c.transactions.length}×</span>
                </div>
                <div className="category-bar-track">
                  <div className="category-bar-fill" style={{ width: `${Math.round((c.total / userStats.categorySpend[0].total) * 100)}%`, background: c.color }} />
                </div>
                <div className="category-bar-value" style={{ color: c.color }}>{fmt(c.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category drill-down modal */}
      {categoryModal && (
        <CategoryModal
          cat={categoryModal}
          onClose={() => setCategoryModal(null)}
          multiFile={multiFile}
          fileColorMap={fileColorMap}
          fileIndexMap={fileIndexMap}
        />
      )}

      {/* Subscriptions & EMIs */}
      {subscriptions.length > 0 && (
        <RecurringSection
          title="Subscriptions & EMIs"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,color:'#4e54c8'}}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
          items={subscriptions}
          multiFile={multiFile}
          fileColorMap={fileColorMap}
          fileIndexMap={fileIndexMap}
          emptyMsg="No subscriptions found."
          headerExtra={<span className="sub-monthly-est">~{fmt(subMonthlyEst)}/mo avg</span>}
          extraClass="subscription-block"
        />
      )}

      {/* Other Recurring (or all Recurring when no subscriptions found) */}
      <RecurringSection
        title={subscriptions.length > 0 ? 'Other Recurring' : 'Recurring Payments'}
        icon={<FaCheckCircle color="#4e54c8" />}
        items={otherRecurring}
        multiFile={multiFile}
        fileColorMap={fileColorMap}
        fileIndexMap={fileIndexMap}
        emptyMsg={subscriptions.length > 0 ? 'No other recurring payments.' : 'No recurring payments found.'}
      />

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
                            {multiFile && p.srcs?.length > 0 && <div className="payment-detail-item"><span className="detail-label">Source Account</span><SourceTag srcs={p.srcs} colorMap={fileColorMap} indexMap={fileIndexMap} /></div>}
                            <div className="payment-detail-item"><span className="detail-label">Category</span><span className="cat-pill" style={{ background: p.category.color + '18', color: p.category.color, border: `1px solid ${p.category.color}40` }}>{p.category.emoji} {p.category.name}</span></div>
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
                                <td className="date-cell">{t.date || '—'}</td>
                                <td className="amt-debit">{fmt(t.amount)}{multiFile && t.srcs?.length > 0 && <SourceTag srcs={t.srcs} colorMap={fileColorMap} indexMap={fileIndexMap} />}</td>
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

const BANK_EXPORT_STEPS = [
  {
    bank: 'HDFC Bank',
    logo: '🟦',
    color: '#004c8c',
    steps: ['Login to NetBanking → My Accounts', 'Click “Download Statement”', 'Select date range → Format: “Excel” or “CSV”', 'Click Download'],
  },
  {
    bank: 'SBI',
    logo: '🟦',
    color: '#2563eb',
    steps: ['Login to OnlineSBI → Account Statement', 'Set From / To dates', 'Click “View” → then “Download” → choose “Excel”'],
  },
  {
    bank: 'ICICI Bank',
    logo: '🟧',
    color: '#f37021',
    steps: ['Login to iMobile or NetBanking', 'Accounts → Account Statement', 'Select date range → “Download” → Excel / CSV'],
  },
  {
    bank: 'Axis Bank',
    logo: '🟥',
    color: '#c62828',
    steps: ['Login to NetBanking → Accounts', '“e-Statement” or “Account Activity”', 'Select range → Download as CSV or XLS'],
  },
  {
    bank: 'Kotak Bank',
    logo: '🟥',
    color: '#c62828',
    steps: ['Login to NetBanking → My Accounts', 'Account Summary → Download Statement', 'Choose date range → XLS format'],
  },
  {
    bank: 'Yes Bank',
    logo: '🟦',
    color: '#1a237e',
    steps: ['Login to NetBanking → Accounts → Account Details', '“Download Statement” → Excel or CSV'],
  },
  {
    bank: 'IndusInd Bank',
    logo: '🟨',
    color: '#f57c00',
    steps: ['Login to NetBanking → Accounts', '“Account Statement” → Set dates → Download Excel'],
  },
  {
    bank: 'Federal Bank',
    logo: '🟦',
    color: '#1565c0',
    steps: ['Login to FedNet → Accounts → Statement of Account', 'Select period → Download as Excel'],
  },
];

const HowToExport = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="how-to-export">
      <button className="how-to-export-toggle" onClick={() => setOpen(o => !o)}>
        <span>How to download your bank statement</span>
        <span className="how-to-export-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="how-to-export-body">
          <p className="how-to-export-intro">
            Most banks let you download statements as <strong>CSV or Excel</strong> from net banking. Choose your bank below:
          </p>
          <div className="bank-steps-grid">
            {BANK_EXPORT_STEPS.map((b, i) => (
              <div key={i} className="bank-steps-card">
                <div className="bank-steps-header" style={{ borderLeft: `3px solid ${b.color}` }}>
                  <span className="bank-steps-logo">{b.logo}</span>
                  <span className="bank-steps-name" style={{ color: b.color }}>{b.bank}</span>
                </div>
                <ol className="bank-steps-list">
                  {b.steps.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
              </div>
            ))}
          </div>
          <div className="how-to-export-tip">
            💡 <strong>Tip:</strong> If your bank sends a password-protected PDF by email, login to net banking and download the <em>unprotected</em> Excel/CSV version instead.
          </div>
        </div>
      )}
    </div>
  );
};

const StatementUploader = ({ isPro = false, onUpgrade }) => {
  const [loadedFiles, setLoadedFiles] = useState([]);
  const [error, setError]             = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions]       = useState([]);
  const sessionIdRef                  = useRef(null);
  const loadingFromHistoryRef         = useRef(false);

  // Load existing sessions from IndexedDB on first render
  useEffect(() => {
    getAllSessions().then(setSessions).catch(console.error);
  }, []);

  // Auto-save the current set of loaded files as a history session
  useEffect(() => {
    if (loadedFiles.length === 0) {
      sessionIdRef.current = null;
      return;
    }
    // Don't re-save when we just restored from history
    if (loadingFromHistoryRef.current) {
      loadingFromHistoryRef.current = false;
      return;
    }
    if (!sessionIdRef.current) sessionIdRef.current = Date.now();
    // Compute minimal stats inline (avoids stale useMemo closure)
    const flat = loadedFiles.flatMap(f => f.data);
    let totalSpent = 0;
    flat.forEach(tx => {
      const norm = buildNorm(tx);
      if (isDebit(norm)) { const amt = parseAmount(getDebitAmt(norm)); if (amt > 0) totalSpent += amt; }
    });
    const session = {
      id:           sessionIdRef.current,
      savedAt:      new Date().toISOString(),
      files:        loadedFiles.map(f => ({ name: f.name, txCount: f.data.length })),
      totalTxCount: loadedFiles.length > 1 ? deduplicateData(flat).length : flat.length,
      totalSpent,
      dateRange:    null, // filled after stats compute below
      loadedFiles,
    };
    // Compute date range for the summary label
    const allDates = flat
      .map(tx => { const norm = buildNorm(tx); return getTxDate(norm); })
      .filter(d => d && d.includes('/'))
      .map(d => { const [dd, mm, yyyy] = d.split('/'); return new Date(`${yyyy}-${mm}-${dd}`); })
      .filter(d => !isNaN(d));
    if (allDates.length) {
      const minD = new Date(Math.min(...allDates));
      const maxD = new Date(Math.max(...allDates));
      const fmtD = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      session.dateRange = { from: fmtD(minD), to: fmtD(maxD), days: Math.round((maxD - minD) / 86400000) + 1 };
    }
    saveSession(session)
      .then(() => getAllSessions().then(setSessions))
      .catch(console.error);
  }, [loadedFiles]);

  const allData   = useMemo(() => {
    const flat = loadedFiles.flatMap(f => f.data);
    return loadedFiles.length > 1 ? deduplicateData(flat) : flat;
  }, [loadedFiles]);
  const hasData   = loadedFiles.length > 0;
  const recurring = useMemo(() => detectRecurring(allData), [allData]);
  const payments  = useMemo(() => getPayments(allData),     [allData]);
  const userStats = useMemo(() => getUserStats(allData),    [allData]);

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
      category: getCategory(getTxDesc(norm), parseAmount(getDebitAmt(norm)) || 0),
      amount: parseAmount(getDebitAmt(norm)) || 0,
      date: getTxDate(norm),
      reference: findColVal(norm, 'ref no./cheque no.', 'chq/ref no.', 'chq / ref no.', 'reference no.', 'transaction id', 'txn id') || '',
      balance: findColVal(norm, 'balance', 'closing balance', 'bal') || '',
      type: findColVal(norm, 'transaction type', 'type', 'mode', 'transaction mode') || '',
      srcs: norm['__srcs'] || (norm['__src'] ? [norm['__src']] : []),
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
      merchantMap[desc].transactions.push({ date, amount: amt, srcs: norm['__srcs'] || (norm['__src'] ? [norm['__src']] : []) });
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

    // Date range across all transactions
    const allDates = data
      .map(tx => getTxDate(buildNorm(tx)))
      .filter(d => d && d.includes('/'))
      .map(d => {
        const [dd, mm, yyyy] = d.split('/');
        return new Date(`${yyyy}-${mm}-${dd}`);
      })
      .filter(d => !isNaN(d));
    const minDate = allDates.length ? new Date(Math.min(...allDates)) : null;
    const maxDate = allDates.length ? new Date(Math.max(...allDates)) : null;
    const fmtDate = (d) => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    // Category breakdown
    const categoryMap = {};
    debits.forEach(norm => {
      const desc = getTxDesc(norm) || '';
      const amt  = parseAmount(getDebitAmt(norm)) || 0;
      const date = getTxDate(norm);
      const cat  = getCategory(desc, amt);
      if (!categoryMap[cat.name]) categoryMap[cat.name] = { total: 0, emoji: cat.emoji, color: cat.color, transactions: [] };
      categoryMap[cat.name].total += amt;
      categoryMap[cat.name].transactions.push({
        date,
        amount: amt,
        displayName: cleanMerchantName(desc),
        description: desc,
        srcs: norm['__srcs'] || (norm['__src'] ? [norm['__src']] : []),
      });
    });
    const categorySpend = Object.entries(categoryMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, d]) => ({ name, total: d.total, emoji: d.emoji, color: d.color, transactions: d.transactions }));

    return {
      totalSpent,
      totalReceived,
      largestPayment,
      paymentCount: debits.length,
      creditCount: credits.length,
      avgTransaction: debits.length ? totalSpent / debits.length : 0,
      topMerchants,
      monthlySpend,
      categorySpend,
      dateRange: minDate && maxDate ? { from: fmtDate(minDate), to: fmtDate(maxDate), days: Math.round((maxDate - minDate) / 86400000) + 1 } : null,
    };
  }

  // Parse a single File object → returns normalized transaction array (throws on error)
  const parseFileData = async (file) => {
    const MAX_SIZE_MB = 20;
    if (file.size > MAX_SIZE_MB * 1024 * 1024)
      throw new Error(`File too large. Max ${MAX_SIZE_MB} MB.`);

    const allowedMime = [
      'text/csv', 'text/plain', 'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext) ||
        (file.type && !allowedMime.includes(file.type) && file.type !== ''))
      throw new Error('Invalid file type. Only .csv, .xlsx, and .xls are accepted.');

    if (ext === 'csv') {
      const text = await file.text();
      return parseCSV(text);
    }

    // Excel (.xlsx / .xls)
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const expected = ['narration','description','desc','amount','withdrawal','deposit','date','value','transaction','dr','cr'];
    let headerRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(cell => normalizeKey((cell || '').toString()));
      const hasDate = row.some(c => c.includes('date') || c.includes('value'));
      const hasAmt  = row.some(c => c.includes('amount') || c.includes('withdrawal') || c.includes('deposit') || c.includes('debit') || c.includes('credit'));
      let matchCount = 0;
      for (const kw of expected) if (row.some(c => c.includes(kw))) matchCount++;
      if ((hasDate && hasAmt) || matchCount >= 3) { headerRowIdx = i; break; }
    }
    if (headerRowIdx === -1) throw new Error('Could not find header row in Excel file.');

    const headers = rows[headerRowIdx].map(h => normalizeKey(h));
    const isSummaryRow = (row) => {
      const nonEmpty = row.map(c => (c || '').toString().toLowerCase().trim()).filter(c => c.length > 0);
      return FOOTER_KEYWORDS.some(kw => (nonEmpty[0] || '').startsWith(kw));
    };
    const rawDataRows = rows.slice(headerRowIdx + 1);
    let endIdx = rawDataRows.length;
    for (let i = 0; i < rawDataRows.length; i++) {
      if (isSummaryRow(rawDataRows[i])) { endIdx = i; break; }
    }
    const raw = rawDataRows.slice(0, endIdx).map(row => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = cleanString(row[idx]); });
      return obj;
    });
    return raw
      .filter(row => {
        const norm = buildNorm(row);
        const date = getTxDate(norm), desc = getTxDesc(norm);
        return date && desc && date.length > 0 && desc.toString().trim().length > 0;
      })
      .map(row => buildNorm(row));
  };

  // ── Export helpers ───────────────────────────────────────────────────────────────
  function buildTxRows() {
    return allData.map(tx => {
      const norm     = buildNorm(tx);
      const desc     = getTxDesc(norm) || '';
      const debitTx  = isDebit(norm);
      const amt      = debitTx
        ? (parseAmount(getDebitAmt(norm))  || 0)
        : (parseAmount(getCreditAmt(norm)) || 0);
      const cat = getCategory(desc, amt);
      return {
        Date:        getTxDate(norm),
        Description: desc,
        Merchant:    cleanMerchantName(desc),
        Category:    cat.name,
        Amount:      parseFloat(amt.toFixed(2)),
        Type:        debitTx ? 'Debit' : 'Credit',
        Source:      tx['__src'] || '',
      };
    }).filter(r => r.Date || r.Description);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const rows = buildTxRows();
    const csv  = Papa.unparse(rows);
    // \uFEFF = UTF-8 BOM so Excel opens it correctly
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
      `transactions-${new Date().toISOString().slice(0,10)}.csv`);
  }

  function exportExcel() {
    const date = new Date().toISOString().slice(0, 10);

    // Sheet 1 — All Transactions
    const txSheet = XLSX.utils.json_to_sheet(buildTxRows());

    // Sheet 2 — By Category
    const catSheet = XLSX.utils.json_to_sheet(
      (userStats.categorySpend || []).map(c => ({
        Category:                    `${c.emoji} ${c.name}`,
        'Total Spent (\u20b9)':        parseFloat(c.total.toFixed(2)),
        'Transactions':              c.transactions.length,
        'Avg per Transaction (\u20b9)': parseFloat((c.total / Math.max(c.transactions.length, 1)).toFixed(2)),
      }))
    );

    // Sheet 3 — Recurring
    const recurSheet = XLSX.utils.json_to_sheet(
      recurring.map(r => ({
        Merchant:                   r.description,
        Type:                       r.isSubscription ? 'Subscription / EMI' : 'Recurring',
        Occurrences:                r.count,
        'Total Paid (\u20b9)':        parseFloat(r.total.toFixed(2)),
        'Avg per Occurrence (\u20b9)': parseFloat((r.total / Math.max(r.count, 1)).toFixed(2)),
        'Last Date':                r.lastDate,
      }))
    );

    // Sheet 4 — Monthly Spend
    const monthSheet = XLSX.utils.json_to_sheet(
      (userStats.monthlySpend || []).map(m => ({
        Month:               m.month,
        'Total Spent (\u20b9)': parseFloat(m.total.toFixed(2)),
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, txSheet,    'All Transactions');
    XLSX.utils.book_append_sheet(wb, catSheet,   'By Category');
    XLSX.utils.book_append_sheet(wb, recurSheet, 'Recurring');
    XLSX.utils.book_append_sheet(wb, monthSheet, 'Monthly Spend');
    XLSX.writeFile(wb, `expense-report-${date}.xlsx`);
  }

  // ── File handling ─────────────────────────────────────────────────────────────
  const handleFiles = async (e) => {
    setError('');
    const files = Array.from(e.target.files);
    e.target.value = '';
    // Free plan: only 1 file
    if (!isPro && loadedFiles.length >= 1) {
      if (onUpgrade) onUpgrade();
      return;
    }
    for (const file of files) {
      if (loadedFiles.some(f => f.name === file.name)) {
        setError(`"${file.name}" is already loaded.`);
        continue;
      }
      try {
        const data = await parseFileData(file);
        setLoadedFiles(prev => [...prev, { id: `${file.name}-${Date.now()}`, name: file.name, data: data.map(tx => ({ ...tx, '__src': file.name, '__srcs': [file.name] })) }]);
      } catch (err) {
        console.error('Parse error:', err);
        setError(`"${file.name}": ${err.message}`);
      }
    }
  };

  const removeFile = (id) => setLoadedFiles(prev => prev.filter(f => f.id !== id));

  const handleLoadSession = (session) => {
    loadingFromHistoryRef.current = true;
    sessionIdRef.current = session.id; // keep same id so we overwrite, not duplicate
    setLoadedFiles(session.loadedFiles);
    setError('');
    setHistoryOpen(false);
  };

  const handleDeleteSession = (id) => {
    deleteSession(id).catch(console.error);
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const handleClearAll = () => {
    clearAllSessions().catch(console.error);
    setSessions([]);
  };

  return (
    <>
    <Card>
      <h2 className="upload-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/logo.svg" alt="" style={{ width: 22, height: 22, borderRadius: 5 }} /> Upload to SpendLens
        <span className="badge-muted">CSV or Excel • multiple accounts → combined dashboard</span>
      </h2>

      <div className="trust-banner">
        <div className="trust-pill">
          <span className="trust-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <div>
            <div className="trust-title">100% Private</div>
            <div className="trust-desc">Data never leaves your device</div>
          </div>
        </div>
        <div className="trust-divider" />
        <div className="trust-pill">
          <span className="trust-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </span>
          <div>
            <div className="trust-title">Local Processing</div>
            <div className="trust-desc">Runs entirely in your browser</div>
          </div>
        </div>
        <div className="trust-divider" />
        <div className="trust-pill">
          <span className="trust-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </span>
          <div>
            <div className="trust-title">No Uploads</div>
            <div className="trust-desc">Zero server contact, ever</div>
          </div>
        </div>
      </div>

      <HowToExport />

      <div className="upload-row">
        <label htmlFor="statement-upload" className="upload-box">
          <input id="statement-upload" type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFiles} style={{ display: 'none' }} />
          {hasData
            ? isPro
              ? <>+ Add another account or statement</>
              : <><span style={{color:'#f59e0b'}}>🔒 Pro:</span> Add multiple accounts</>
            : <div className="dropzone-content">
                <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="dropzone-label">Drop or click to upload</span>
                <span className="dropzone-hint">.csv · .xlsx · .xls · multiple files</span>
              </div>}
        </label>
        <button
          className="history-open-btn"
          onClick={() => setHistoryOpen(true)}
          title="View previously uploaded statements"
        >
          <FaHistory size={12} />
          History
          {sessions.length > 0 && <span className="history-badge">{sessions.length}</span>}
        </button>
      </div>

      {/* Loaded file chips */}
      {loadedFiles.length > 0 && (
        <div className="file-chips">
          {loadedFiles.map(f => (
            <div key={f.id} className="file-chip">
              <FaFileCsv size={12} color="#4e54c8" />
              <span className="file-chip-name" title={f.name}>{f.name}</span>
              <span className="file-chip-count">{f.data.length} txns</span>
              <button className="file-chip-remove" onClick={() => removeFile(f.id)} title="Remove this file">×</button>
            </div>
          ))}
          {loadedFiles.length > 1 && (
            <div className="file-chip file-chip-combined">
              <FaExchangeAlt size={11} color="#1565c0" />
              <span>{allData.length} transactions across {loadedFiles.length} accounts</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaExclamationCircle color="#d32f2f" /> {error}
        </div>
      )}
      {!hasData && <HeroState />}
      <Insights recurring={recurring} payments={payments} userStats={userStats} hasData={hasData} loadedFiles={loadedFiles} onExportCSV={exportCSV} onExportExcel={exportExcel} isPro={isPro} onUpgrade={onUpgrade} />
    </Card>

    {historyOpen && (
      <HistoryPanel
        sessions={sessions}
        onLoad={handleLoadSession}
        onDelete={handleDeleteSession}
        onClearAll={handleClearAll}
        onClose={() => setHistoryOpen(false)}
      />
    )}
    </>
  );
};

export default StatementUploader;
