/**
 * SpendLens — Pro license helpers (IndexedDB-backed)
 * Stores the validated license key locally so the user
 * doesn't need to re-enter it on every visit.
 */

const DB_NAME    = 'spendlens-pro';
const DB_VERSION = 1;
const STORE      = 'license';

// ── API base URL ─────────────────────────────────────────────────────────
// In development Vite proxies /api → localhost:3001 (see vite.config.js)
// In production this resolves to the deployed Render API URL.
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── IndexedDB helpers ─────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function saveLicense(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: 'license', ...record });
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

export async function loadLicense() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('license');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function clearLicense() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('license');
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

// ── Validate key against server ───────────────────────────────────────────
export async function validateKeyOnServer(key) {
  const res  = await fetch(`${API_BASE}/validate-key`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error('Server error');
  return res.json(); // { valid, email, since }
}

// ── Create Razorpay order ─────────────────────────────────────────────────
export async function createOrder(email) {
  const res  = await fetch(`${API_BASE}/create-order`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not create order');
  return data;
}

// ── Dev-only: get a free test license without Razorpay ───────────────────
export async function devActivate(email) {
  const res  = await fetch(`${API_BASE}/dev-activate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Dev activate failed');
  return data; // { ok, key }
}

// ── Verify payment + get key from server ──────────────────────────────────
export async function verifyPayment(payload) {
  const res  = await fetch(`${API_BASE}/verify-payment`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Payment verification failed');
  return res.json(); // { ok, key }
}
