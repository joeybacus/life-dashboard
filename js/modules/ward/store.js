/* Ward Patients — what's saved.

   Synced between your devices, like tasks: the wardLists store (the "Ward
   lists" tab of your Google Sheet) — each list's name, order, headings and
   columns. Never patients.

   On this device only (never synced or backed up), for each list:
     meta 'ward' / 'ward:<list id>'            its logsheet link: { url, spreadsheetId, tab, title, linkedAt, test, roundsHere }
     meta 'wardCache' / 'wardCache:<list id>'  the last patient list loaded, for when you're offline
     wardQueue    changes waiting to be saved to a logsheet: { key: "<list id>|<HN key>|<column or 'rounds'>", list, … }
     wardDays     the rounds history, one record per Manila date:
                  { date, updatedAt, lists: { <list id>: {
                      sessions: [{ id, start, end, starts: { key: ISO } }],
                      patients: { key: { hn, rounded, start, end, durationMs, source } } } } }
   ("key" is the hospital number in capitals — see hnKey in model.js.) The
   first list, Ward Patients, has the id "ward" and keeps the meta keys it
   had before there could be several lists. */
import { db, promisify, tx } from '../../core/db.js';
import { saveRecord, saveRecords } from '../../core/records.js';
import { DEFAULT_LIST_ID } from './model.js';

/* ---------- Lists (synced) ---------- */

export const loadLists = () => db.all('wardLists');

/** Create the first list once, without queueing it for sync (every device makes the same one). */
export function seedList(record) {
  return tx('wardLists', 'readwrite', (s) => promisify(s.get(record.id)).then((found) => {
    if (!found) s.put(record);
  }));
}

export const saveList = (record) => saveRecord('wardLists', record);
export const saveLists = (records) => saveRecords(records.map((record) => ({ store: 'wardLists', record })));

/* ---------- One list's logsheet, on this device ---------- */

const linkKey = (list) => (list === DEFAULT_LIST_ID ? 'ward' : `ward:${list}`);
const cacheKey = (list) => (list === DEFAULT_LIST_ID ? 'wardCache' : `wardCache:${list}`);

/** Meta keys that belong to Ward Patients (kept on this device only). */
export const isWardMeta = (key) => /^ward(Cache)?(:|$)/.test(String(key));

export const loadLink = async (list) => (await db.get('meta', linkKey(list)))?.value ?? null;
export const saveLink = (list, link) => db.put('meta', { key: linkKey(list), value: link });

export const loadCache = async (list) => (await db.get('meta', cacheKey(list)))?.value ?? null;
export const saveCache = (list, cache) => db.put('meta', { key: cacheKey(list), value: cache });

/* ---------- Changes waiting to be saved ---------- */

export const loadQueue = () => db.all('wardQueue');
export const saveQueueItem = (item) => db.put('wardQueue', item);
export const deleteQueueItem = (key) => db.delete('wardQueue', key);

/**
 * Changes saved before there could be several lists belong to the first one:
 * give them its id, and their column ("labs" → C, "recs" → D).
 */
export async function upgradeQueue() {
  const items = await loadQueue();
  const old = items.filter((item) => !item.list);
  if (!old.length) return items;
  const column = { labs: 'C', recs: 'D' };
  const moved = old.map((item) => {
    const kind = column[item.kind] ?? item.kind;
    return { ...item, key: `${DEFAULT_LIST_ID}|${item.patient}|${kind}`, list: DEFAULT_LIST_ID, kind };
  });
  await tx('wardQueue', 'readwrite', (s) => {
    old.forEach((item) => s.delete(item.key));
    moved.forEach((item) => s.put(item));
  });
  return [...items.filter((item) => item.list), ...moved];
}

/** Forget a list's logsheet on this device: its link, patient list and unsaved changes (the rounds history stays). */
export function clearLogsheet(list) {
  return tx(['meta', 'wardQueue'], 'readwrite', (s) => {
    s.meta.delete(linkKey(list));
    s.meta.delete(cacheKey(list));
    return promisify(s.wardQueue.getAll()).then((items) => {
      items.filter((item) => item.list === list).forEach((item) => s.wardQueue.delete(item.key));
    });
  });
}

/* ---------- Rounds history ---------- */

/** Days saved before there could be several lists hold the first list's rounds. */
function upgradeDay(day) {
  if (!day || day.lists) return day ?? null;
  const part = { sessions: day.sessions ?? [], patients: day.patients ?? {} };
  const used = part.sessions.length || Object.keys(part.patients).length;
  return { date: day.date, lists: used ? { [DEFAULT_LIST_ID]: part } : {}, updatedAt: day.updatedAt ?? null };
}

export const loadDay = async (date) => upgradeDay(await db.get('wardDays', date));
export const saveDay = (day) => db.put('wardDays', day);
export const loadAllDays = async () => (await db.all('wardDays')).map(upgradeDay);

/** Delete one list's rounds history (every day), keeping the other lists'. */
export function clearHistory(list) {
  return tx('wardDays', 'readwrite', (s) => promisify(s.getAll()).then((days) => {
    days.map(upgradeDay).forEach((day) => {
      if (!day.lists[list]) return;
      delete day.lists[list];
      if (Object.keys(day.lists).length) s.put(day);
      else s.delete(day.date);
    });
  }));
}
