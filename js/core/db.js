/* Promise-based IndexedDB helpers. All app data lives here, on the device. */
import { DB_NAME, DB_VERSION, migrate } from './schema.js';
import { uid } from './ids.js';
import { nowISO } from './dates.js';

let dbPromise = null;
let onBlockedHandler = () => {};
let onVersionChangeHandler = () => {};

/** Called when an older copy of the app (another tab) is holding the database open. */
export function onDatabaseBlocked(fn) { onBlockedHandler = fn; }
/** Called when a newer version of the app, opened elsewhere, needs to upgrade the database. */
export function onDatabaseVersionChange(fn) { onVersionChangeHandler = fn; }

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support offline storage (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => migrate(req.result, event.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        onVersionChangeHandler();
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Could not open the database.'));
    };
    req.onblocked = () => onBlockedHandler();
  });
  return dbPromise;
}

export function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Run work inside one transaction. `fn` receives the object store (or a map of
 * stores when given an array of names). Resolves with fn's result once the
 * transaction has committed; rejects (and rolls back) on any error.
 */
export async function tx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    const stores = Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map((name) => [name, t.objectStore(name)]))
      : t.objectStore(storeNames);
    const fail = (err) => {
      try { t.abort(); } catch { /* already finished */ }
      reject(err);
    };
    let returned;
    try {
      returned = fn(stores, t);
    } catch (err) {
      fail(err);
      return;
    }
    Promise.resolve(returned).then((value) => { result = value; }, fail);
  });
}

/** Stamp a record for saving: ensures id/createdAt/deletedAt and bumps updatedAt. */
export function stamp(record, now = nowISO()) {
  return {
    ...record,
    id: record.id ?? uid(),
    createdAt: record.createdAt ?? now,
    updatedAt: now,
    deletedAt: record.deletedAt ?? null,
  };
}

/** Delete every record in a store that matches the predicate (inside an open transaction). */
export function deleteWhere(store, predicate) {
  const req = store.openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    if (predicate(cursor.value)) cursor.delete();
    cursor.continue();
  };
}

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => promisify(s.get(key))),
  all: (store) => tx(store, 'readonly', (s) => promisify(s.getAll())),
  /** All records that are not soft-deleted. */
  live: async (store) => (await db.all(store)).filter((r) => !r.deletedAt),
  put: (store, value) => tx(store, 'readwrite', (s) => { s.put(value); return value; }),
  putMany: (store, values) => tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); }),
  delete: (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); }),
};
