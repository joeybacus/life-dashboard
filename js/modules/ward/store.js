/* Ward Patients — what this device keeps. None of it is synced or backed up:
     meta 'ward'       the logsheet link: { url, spreadsheetId, tab, title, linkedAt, test, roundsHere }
     meta 'wardCache'  the last list loaded, for when you're offline
     wardQueue         changes waiting to be saved to the logsheet
     wardDays          rounds history, one record per Manila date:
                       { date, sessions: [{ id, start, end, starts: { key: ISO } }],
                         patients: { key: { hn, rounded, start, end, durationMs, source } }, updatedAt }
   ("key" is the hospital number in capitals — see hnKey in model.js.) */
import { db, tx } from '../../core/db.js';

export const loadLink = async () => (await db.get('meta', 'ward'))?.value ?? null;
export const saveLink = (link) => db.put('meta', { key: 'ward', value: link });

export const loadCache = async () => (await db.get('meta', 'wardCache'))?.value ?? null;
export const saveCache = (cache) => db.put('meta', { key: 'wardCache', value: cache });

export const loadQueue = () => db.all('wardQueue');
export const saveQueueItem = (item) => db.put('wardQueue', item);
export const deleteQueueItem = (key) => db.delete('wardQueue', key);

export const loadDay = (date) => db.get('wardDays', date);
export const saveDay = (day) => db.put('wardDays', day);
export const loadAllDays = () => db.all('wardDays');

/** Forget the logsheet: its link, the patient list and unsaved changes (the rounds history stays). */
export function clearLogsheet() {
  return tx(['meta', 'wardQueue'], 'readwrite', (s) => {
    s.meta.delete('ward');
    s.meta.delete('wardCache');
    s.wardQueue.clear();
  });
}

export function clearHistory() {
  return tx('wardDays', 'readwrite', (s) => { s.clear(); });
}
