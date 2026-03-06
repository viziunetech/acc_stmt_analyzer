const escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function getSiteUrl(req) {
  const fromEnv = process.env.SITE_URL || process.env.FRONTEND_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0];
  const host  = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0];
  if (!host) return 'https://cashscope.in';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function renderPage({ siteUrl, path, title, description, h1, subtitle, bullets = [], sections = [], faqs = [] }) {
  const canonical = `${siteUrl}${path}`;

  const defaultFaqs = [
    {
      q: 'Do you upload my bank statement?'
      , a: 'No. Your statement is processed locally in your browser. CashScope does not receive or store your statement data.'
    },
    {
      q: 'What formats are supported?'
      , a: 'CSV and Excel (XLSX/XLS) statements are supported.'
    },
    {
      q: 'Is this financial advice?'
      , a: 'No. CashScope is a data analysis tool to help you review transactions and recurring spend.'
    },
  ];

  const mergedFaqs = (() => {
    const provided = Array.isArray(faqs) ? faqs : [];
    const seen = new Set(provided.map(f => (f?.q || '').trim().toLowerCase()).filter(Boolean));
    const extras = defaultFaqs.filter(f => {
      const k = (f.q || '').trim().toLowerCase();
      return k && !seen.has(k);
    });
    return provided.length ? [...provided, ...extras] : defaultFaqs;
  })();

  const bulletsHtml = bullets.length
    ? `<ul class="bullets">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';

  const sectionsHtml = sections.map(s => {
    const items = (s.items || []).map(it => `<li>${escapeHtml(it)}</li>`).join('');
    return `
      <section class="card">
        <h2>${escapeHtml(s.title)}</h2>
        ${s.text ? `<p>${escapeHtml(s.text)}</p>` : ''}
        ${items ? `<ul>${items}</ul>` : ''}
      </section>
    `;
  }).join('');

  const faqsHtml = mergedFaqs.length
    ? `
      <section class="card">
        <h2>FAQ</h2>
        <div class="faq">
          ${mergedFaqs.map(f => `
            <details>
              <summary>${escapeHtml(f.q)}</summary>
              <div class="faq-a">${escapeHtml(f.a)}</div>
            </details>
          `).join('')}
        </div>
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />

  <meta name="twitter:card" content="summary" />

  <style>
    :root { --brand:#4e54c8; --text:#111827; --muted:#6b7280; --border:#e5e7eb; --bg:#ffffff; --bg2:#f8f9ff; }
    *{ box-sizing:border-box; }
    body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:var(--text); background:linear-gradient(180deg,var(--bg2),var(--bg)); }
    a{ color:var(--brand); text-decoration:none; }
    a:hover{ text-decoration:underline; }
    .wrap{ max-width:980px; margin:0 auto; padding:28px 18px 56px; }
    .top{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .brand{ display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:0.2px; }
    .brand-badge{ width:34px; height:34px; border-radius:10px; background:var(--brand); display:inline-flex; align-items:center; justify-content:center; color:#fff; font-weight:900; }
    .cta{ display:flex; gap:10px; align-items:center; }
    .btn{ border:1px solid var(--border); background:#fff; border-radius:10px; padding:10px 12px; font-weight:700; cursor:pointer; }
    .btn-primary{ border-color:var(--brand); background:var(--brand); color:#fff; }
    .hero{ margin-top:28px; padding:22px; border:1px solid var(--border); background:#fff; border-radius:16px; }
    h1{ margin:0; font-size:1.8rem; line-height:1.15; }
    .sub{ margin-top:10px; color:var(--muted); font-size:1rem; line-height:1.55; }
    .pillrow{ margin-top:14px; display:flex; flex-wrap:wrap; gap:8px; }
    .pill{ font-size:0.85rem; border:1px solid var(--border); border-radius:999px; padding:6px 10px; background:var(--bg2); }
    .bullets{ margin:14px 0 0; padding-left:18px; }
    .grid{ margin-top:16px; display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; }
    .card{ border:1px solid var(--border); background:#fff; border-radius:16px; padding:16px; }
    .card h2{ margin:0 0 8px; font-size:1.05rem; }
    .card p{ margin:0 0 8px; color:var(--muted); line-height:1.55; }
    .card ul{ margin:0; padding-left:18px; color:var(--text); }
    .footer{ margin-top:22px; color:var(--muted); font-size:0.9rem; display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
    .faq details{ border-top:1px solid var(--border); padding:10px 0; }
    .faq details:first-child{ border-top:none; }
    .faq summary{ cursor:pointer; font-weight:700; }
    .faq-a{ margin-top:6px; color:var(--muted); line-height:1.55; }
    @media (max-width:760px){ .grid{ grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand">
        <span class="brand-badge">C</span>
        <span>CashScope</span>
      </div>
      <div class="cta">
        <a class="btn" href="/?sample=1">Try sample data</a>
        <a class="btn btn-primary" href="/">Upload statement</a>
      </div>
    </div>

    <div class="hero">
      <h1>${escapeHtml(h1)}</h1>
      <div class="sub">${escapeHtml(subtitle || description)}</div>
      <div class="pillrow">
        <span class="pill">Local processing</span>
        <span class="pill">No bank login</span>
        <span class="pill">CSV/XLSX supported</span>
        <span class="pill">Export + history (Pro)</span>
      </div>
      ${bulletsHtml}
    </div>

    <div class="grid">
      ${sectionsHtml}
      ${faqsHtml}
    </div>

    <div class="footer">
      <div>Privacy-first: your statement stays on your device.</div>
      <div><a href="/">Go to CashScope →</a></div>
    </div>
  </div>
</body>
</html>`;
}

const PAGES = [
  {
    path: '/bank-statement-analyzer',
    title: 'CashScope — Bank Statement Analyzer (Private, Local Processing)',
    description: 'Analyze a bank statement CSV/XLSX privately in your browser. Categorize spend, find subscriptions/recurring payments and EMIs, and export reports with CashScope Pro.',
    h1: 'Bank statement analyzer (private, local processing)',
    subtitle: 'Upload a CSV/XLSX statement and get instant spend categories, top merchants, monthly spend, and recurring/EMI detection — without uploading your data.',
    bullets: [
      'Instant spending by category + top merchants',
      'Find subscriptions, recurring payments, and EMIs',
      'Works with multiple banks and formats (CSV/XLSX)',
      'Export + multi-account + history available in Pro',
    ],
    sections: [
      { title: 'What you get in minutes', items: ['Category breakdown', 'Monthly spend view', 'Recurring payments & EMI list', 'Clickable drilldowns for details'] },
      { title: 'Why local processing matters', text: 'CashScope runs in your browser so you can review your statement without sending it to a third-party server.' },
    ],
    faqs: [
      { q: 'Do you upload my bank statement?', a: 'No. CashScope is designed for local processing, so your statement stays on your device.' },
      { q: 'What formats are supported?', a: 'CSV and Excel (XLSX/XLS) statements are supported.' },
    ],
  },
  {
    path: '/recurring-payments-tracker',
    title: 'CashScope — Recurring Payments Tracker (Subscriptions & Bills)',
    description: 'Find recurring payments and subscriptions from your bank statement. Spot hidden charges and understand monthly recurring spend with CashScope.',
    h1: 'Recurring payments tracker from your bank statement',
    subtitle: 'Identify subscriptions and repeating debits from statement descriptions—then review month-by-month totals.',
    bullets: ['Detect recurring subscriptions and auto-debits', 'See monthly recurring totals', 'Open details and review transactions'],
    sections: [
      { title: 'Common recurring items', items: ['Streaming subscriptions', 'Auto-debit mandates (NACH/ECS)', 'Bills and utilities', 'Memberships and software'] },
      { title: 'Best practice', text: 'Use the month filter to verify recurring charges and confirm amounts over time.' },
    ],
    faqs: [
      { q: 'Will this find all subscriptions?', a: 'It will find many common subscription patterns from statement descriptions. You can also edit category keywords to improve matching.' },
    ],
  },
  {
    path: '/subscription-tracker',
    title: 'CashScope — Subscription Tracker (From Bank Statement)',
    description: 'Track subscriptions from your bank statement and reduce unwanted recurring charges. CashScope runs locally for privacy.',
    h1: 'Subscription tracker (no bank login needed)',
    subtitle: 'Upload your statement and review subscription-like charges, totals, and transaction details.',
    bullets: ['Find subscription-looking merchants', 'Review transactions with dates/amounts', 'Export reports with Pro'],
    sections: [
      { title: 'Great for', items: ['Streaming', 'Software tools', 'Cloud services', 'Newsletters and memberships'] },
      { title: 'Privacy', text: 'Designed to avoid uploading your raw statement data.' },
    ],
  },
  {
    path: '/emi-tracker',
    title: 'CashScope — EMI Tracker (Loans & Direct Debit)',
    description: 'Track EMIs and loan repayments from statement patterns like ACH/NACH/DIRECT DEBIT. Review totals and transaction references with CashScope.',
    h1: 'EMI tracker from statement (ACH/NACH/DIRECT DEBIT)',
    subtitle: 'Group EMI/loan debits and review reference numbers when present in the narration.',
    bullets: ['Detect ACH/NACH/DIRECT DEBIT patterns', 'See totals and largest payments', 'Review transaction references (when available)'],
    sections: [
      { title: 'Covers common bank patterns', items: ['ACH debit', 'NACH debit', 'Direct debit', 'Loan/EMI narration variants'] },
      { title: 'Note', text: 'If a bank does not include an EMI reference/loan ID in the narration, CashScope cannot infer it.' },
    ],
  },
  {
    path: '/categorize-bank-transactions',
    title: 'CashScope — Categorize Bank Transactions Automatically',
    description: 'Auto-categorize bank statement transactions into groceries, food, travel, utilities, EMIs and more. Edit keywords to fit your statement style.',
    h1: 'Automatically categorize bank transactions',
    subtitle: 'CashScope matches transaction descriptions to keywords and categories. You can also edit and add your own keywords.',
    bullets: ['Category breakdown in seconds', 'Edit category keywords to improve accuracy', 'Works across multiple banks and formats'],
    sections: [
      { title: 'Editable rules', text: 'You can add/remove your own category keywords. Custom keywords override defaults.' },
      { title: 'Common categories', items: ['Groceries', 'Food & dining', 'Utilities', 'Travel', 'EMIs & loans', 'Credit card payments'] },
    ],
  },
  {
    path: '/expense-report-from-bank-statement',
    title: 'CashScope — Expense Report From Bank Statement (CSV/Excel Export)',
    description: 'Turn your bank statement into a clean expense report. Export categorized data as CSV and Excel with CashScope Pro.',
    h1: 'Create an expense report from your bank statement',
    subtitle: 'Generate a usable report for budgeting, reimbursements, or tax prep—then export with Pro.',
    bullets: ['Clean categorization', 'Clickable drilldowns for verification', 'CSV/Excel export (Pro)'],
    sections: [
      { title: 'Export options (Pro)', items: ['CSV for spreadsheets', 'Excel report with multiple sheets', 'Multi-account combined report'] },
    ],
  },
  {
    path: '/offline-bank-statement-analyzer',
    title: 'CashScope — Offline/Local Bank Statement Analyzer',
    description: 'A privacy-first bank statement analyzer designed for local processing in your browser. No uploads, no bank login.',
    h1: 'Offline-friendly bank statement analyzer',
    subtitle: 'CashScope is built around local processing so sensitive financial data doesn’t need to leave your device.',
    bullets: ['Local processing', 'No bank login', 'Fast insights', 'Works with CSV/XLSX'],
    sections: [
      { title: 'Who this is for', items: ['Privacy-conscious users', 'People analyzing personal finances', 'Anyone who wants fast clarity from statements'] },
    ],
  },
  {
    path: '/multi-account-statement-analyzer',
    title: 'CashScope — Multi Account Bank Statement Analyzer',
    description: 'Combine multiple bank accounts to see unified spending and recurring charges. Multi-account is available in CashScope Pro.',
    h1: 'Analyze multiple bank accounts together',
    subtitle: 'Upload multiple statements and see combined insights (deduplicated where possible).',
    bullets: ['Unified spend and recurring analysis', 'History to revisit later (Pro)', 'Exports for reporting (Pro)'],
    sections: [
      { title: 'Pro workflow', items: ['Upload multiple accounts', 'Review combined categories + recurring', 'Export consolidated report', 'Save as a history session'] },
    ],
  },
  {
    path: '/bank-statement-csv-analysis',
    title: 'CashScope — Analyze Bank Statement CSV',
    description: 'Upload a bank statement CSV and get instant insights: categories, recurring payments, and monthly spend. Works locally for privacy.',
    h1: 'Analyze a bank statement CSV in minutes',
    subtitle: 'If your bank provides CSV/Excel downloads, CashScope can turn them into a clean spend report quickly.',
    bullets: ['CSV/XLSX supported', 'Automatic category breakdown', 'Recurring/EMI detection'],
    sections: [
      { title: 'Tip', text: 'If your CSV has unusual column names, CashScope still attempts to map date/amount/description fields automatically.' },
    ],
  },
  {
    path: '/bank-statement-export',
    title: 'CashScope — Export Bank Statement Analysis (CSV/Excel)',
    description: 'Export categorized transactions and reports to CSV/Excel. Export and history are premium features in CashScope Pro.',
    h1: 'Export your bank statement analysis',
    subtitle: 'Turn insights into a file you can share, archive, or analyze further in spreadsheets.',
    bullets: ['CSV export (Pro)', 'Excel report export (Pro)', 'Save sessions in History (Pro)'],
    sections: [
      { title: 'Use cases', items: ['Budgeting', 'Reimbursements', 'Monthly reviews', 'Tax prep / expense summaries'] },
    ],
  },
];

function mountSeo(app) {
  // Main SEO pages
  for (const page of PAGES) {
    app.get(page.path, (req, res) => {
      const siteUrl = getSiteUrl(req);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderPage({ siteUrl, ...page }));
    });
  }

  // robots.txt
  app.get('/robots.txt', (req, res) => {
    const siteUrl = getSiteUrl(req);
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  });

  // sitemap.xml
  app.get('/sitemap.xml', (req, res) => {
    const siteUrl = getSiteUrl(req);
    const urls = PAGES.map(p => `
  <url>
    <loc>${escapeHtml(siteUrl + p.path)}</loc>
  </url>`).join('');

    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`);
  });
}

module.exports = { mountSeo, PAGES };
