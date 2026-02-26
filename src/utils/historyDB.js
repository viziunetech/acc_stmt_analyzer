/**
 * SpendLens — IndexedDB history store
 * Saves/restores uploaded statement sessions locally in the browser.
 * Uses IndexedDB (not localStorage) because transaction data can be several MB.
 */

const DB_NAME    = 'spendlens-history';
const DB_VERSION = 1;
const STORE      = 'sessions';
const MAX        = 10; // keep at most 10 sessions

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

/** Save (upsert) a session. Prunes oldest entries beyond MAX. */
export async function saveSession(session) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(session);
    // Prune oldest entries
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const sorted = allReq.result.sort((a, b) => b.id - a.id);
      sorted.slice(MAX).forEach(old => store.delete(old.id));
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** Return all sessions sorted newest-first. */
export async function getAllSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.id - a.id));
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** Delete one session by id. */
export async function deleteSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** Delete all sessions. */
export async function clearAllSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}
