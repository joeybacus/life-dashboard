/* Saving data that syncs. Every local change is also noted in the "outbox",
   so Google Sheets sync knows exactly what to send (even after the app was
   closed or offline). Sample data never syncs. */
import { tx } from './db.js';
import { SYNC_STORES } from './schema.js';
import { emit } from './events.js';

export const outboxKey = (store, id) => `${store}:${id}`;

/** Settings/profile that were created automatically and never changed. */
export const isPristine = (store, record) =>
  (store === 'settings' || store === 'profile') && Boolean(record?.createdAt) && record.updatedAt === record.createdAt;

/** Same item apart from its timestamps (e.g. default categories created on two devices). */
export function sameContent(a, b) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort()
        .filter((k) => k !== 'updatedAt' && k !== 'createdAt')
        .map((k) => [k, canonical(value[k])]));
    }
    return value;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Inside an open transaction that includes 'outbox': remember that this record changed. */
export function noteChange(stores, store, record) {
  if (!SYNC_STORES.includes(store) || record.sample) return;
  stores.outbox.put({ key: outboxKey(store, record.id), store, id: record.id, updatedAt: record.updatedAt });
}

/** Save one record and queue it for sync. */
export async function saveRecord(store, record, { source = 'local' } = {}) {
  await tx([store, 'outbox'], 'readwrite', (s) => {
    s[store].put(record);
    noteChange(s, store, record);
  });
  if (source !== 'sync') emit('local-change', { store, id: record.id });
  return record;
}
