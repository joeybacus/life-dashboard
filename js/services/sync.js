/* Google Sheets sync, through a Google Apps Script web app the user deploys
   from apps-script/Code.gs.

   Local-first: the app always works from this device's database. Each sync
   (1) sends local changes, (2) fetches changes from other devices, and keeps
   the newest version of anything changed in both places; the Sheet's
   Conflicts tab keeps the other version. Sample data never syncs.

   When a device syncs for the first time, the profile and settings already in
   the Sheet win, so a new device can't overwrite them with its defaults. */
import { db, tx, promisify } from '../core/db.js';
import { SCRIPT_STORES, SYNC_STORES } from '../core/schema.js';
import { isPristine, outboxKey, sameContent } from '../core/records.js';
import { on, emit } from '../core/events.js';
import { reloadFromDatabase, state, updateProfile } from '../core/state.js';
import { uid } from '../core/ids.js';
import { formatAgo, nowISO } from '../core/dates.js';
import { deviceName } from '../core/platform.js';
import { ensureSampleData } from './sample-data.js';
import { fitPhotoForSync } from './images.js';

const PROTOCOL = 1;
const META_KEY = 'sync';
const GROUP_STORES = ['profile', 'settings']; // one shared copy for all devices
const BATCH = 200;
const AFTER_CHANGE_MS = 4000;
const AFTER_QUIET_CHANGE_MS = 30_000; // sets logged during a workout
const EVERY_MS = 5 * 60 * 1000;
const RETRY_MS = [30, 120, 300, 600].map((s) => s * 1000);
const REQUEST_TIMEOUT_MS = 45_000;

const MESSAGES = {
  network: 'Couldn’t reach Google. Check your internet connection.',
  timeout: 'Google took too long to answer. It will try again shortly.',
  busy: 'Your Google Sheet was busy. It will try again shortly.',
  'bad-response': 'That link didn’t answer like the Life Dashboard sync script. Check the Web app URL and that “Who has access” is set to Anyone. Just updated the script? In Apps Script choose setup, click Run and allow access.',
  'bad-token': 'The secret token doesn’t match. Copy it again from the Connection tab of your Google Sheet.',
  'not-set-up': 'The sync script isn’t set up yet. In Apps Script, choose “setup” and click Run once.',
  protocol: 'The sync script needs updating: paste the latest code into Apps Script and deploy a new version.',
  'bad-url': 'That doesn’t look like a Web app URL. It should start with https://script.google.com/ and end with /exec.',
  'dev-url': 'That’s the test link (it ends with /dev). Use the Web app URL from Deploy → New deployment, which ends with /exec.',
  'no-token': 'Enter the secret token from the Connection tab of your Google Sheet.',
  'not-connected': 'Set up Google Sheets sync first (Settings → Sync).',
  server: 'Your Google Sheet reported a problem. It will try again shortly.',
};
const RETRYABLE = new Set(['network', 'timeout', 'busy', 'server', 'bad-response']);

/* The sync script (apps-script/Code.gs) reports its version. Older scripts
   don't have tabs for newer kinds of data: those wait on this device (nothing
   is lost) until the script is updated. Version 3 adds Ward Patients; 4 lets it
   edit lab results; 5 adds the to-do tabs (readable columns, subtasks) and the
   Google Calendar link — tasks wait for it too, so they always arrive with
   their subtasks; 6 shows subtasks' own date, time and reminders in the Sheet
   and can put them in Google Calendar (version 5 already syncs them); 7 syncs
   your patient lists (Ward lists tab) and lets them show your own logsheet
   columns, add columns and move rows; 8 adds the Referrals tab and reads a
   logsheet's names, hospital numbers and rounds from the columns you choose;
   9 reads a referral census (no rounds columns, days as dates); 10 knows dropdown
   columns (writes their own values; a value they refuse fails only that change);
   11 ticks and unticks real checkboxes (a list's tick columns, e.g. column A);
   12 takes weights from Apple Health, sent by an Apple Shortcut (healthWeight). */
export const LATEST_SCRIPT_VERSION = 12;
const STORE_SCRIPT_VERSION = { exercises: 2, templates: 2, tasks: 5, subtasks: 5, wardLists: 7, referrals: 8, focusSessions: 5, habits: 5, habitLogs: 5 };
const scriptVersion = (config = sync.config) => config?.scriptVersion ?? 1;
/* A device that synced with an older app skipped the kinds of data that app
   didn't know yet (their changes were pulled and ignored). The first sync
   after an update fetches those kinds again from the start, once. Devices
   from before this was recorded knew every kind but the patient lists. */
const STORES_KNOWN_BEFORE = SYNC_STORES.filter((name) => name !== 'wardLists');
const scriptSupports = (store, config) => (STORE_SCRIPT_VERSION[store] ?? 1) <= scriptVersion(config);

export class SyncError extends Error {
  /** reason: the script's own error code (e.g. 'ward-no-tab'); data: its full answer. */
  constructor(code, detail, data = null) {
    super(MESSAGES[code] ?? MESSAGES.server);
    this.code = MESSAGES[code] ? code : 'server';
    this.reason = code;
    this.detail = detail;
    this.data = data;
  }
}

const sync = {
  config: null,  // { url, token, deviceId, auto, pullSeq, knownStores, firstSyncDone, lastSyncAt, connectedAt }
  phase: 'off',  // off | idle | syncing | offline | error
  error: null,   // { code, message }
  pending: 0,    // changes waiting to be sent
};

export function syncSnapshot() {
  return {
    connected: Boolean(sync.config),
    auto: Boolean(sync.config?.auto),
    phase: sync.phase,
    error: sync.error,
    pending: sync.pending,
    lastSyncAt: sync.config?.lastSyncAt ?? null,
    scriptOutdated: Boolean(sync.config) && scriptVersion() < LATEST_SCRIPT_VERSION,
  };
}

function publish() { emit('sync', syncSnapshot()); }

function setPhase(phase, error = null) {
  sync.phase = phase;
  sync.error = error;
  publish();
}

async function saveConfig() {
  await db.put('meta', { key: META_KEY, value: sync.config });
}

async function countPending() {
  sync.pending = (await db.all('outbox')).length;
}

/* ---------- Connection details ---------- */

export function normalizeToken(value) {
  const clean = String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}

export function checkUrl(input) {
  let url;
  try { url = new URL(String(input ?? '').trim()); } catch { throw new SyncError('bad-url'); }
  // Local test server (tools/sync-test) — only accepted while the app itself runs locally
  const local = ['localhost', '127.0.0.1'];
  const testing = local.includes(location.hostname) && local.includes(url.hostname);
  if (!testing && (url.protocol !== 'https:' || url.hostname !== 'script.google.com')) throw new SyncError('bad-url');
  const path = url.pathname.replace(/\/$/, '');
  if (/\/dev$/.test(path)) throw new SyncError('dev-url');
  if (!/^\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/.test(path)) throw new SyncError('bad-url');
  return `${url.origin}${path}`;
}

/* ---------- Talking to the Apps Script web app ---------- */

/** What Google's own error page says (e.g. "Exceeded maximum execution time"), in a line. */
function googleWords(page) {
  const text = String(page ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 300);
}

async function call(action, payload = {}, config = sync.config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response;
    try {
      // text/plain keeps this a "simple" request: Apps Script can't answer CORS preflights
      response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, protocol: PROTOCOL, token: config.token, deviceId: config.deviceId, ...payload }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (err) {
      throw new SyncError(err?.name === 'AbortError' ? 'timeout' : 'network');
    }
    let text = '';
    try { text = await response.text(); } catch { /* nothing came back */ }
    let data;
    try { data = JSON.parse(text); } catch { throw new SyncError('bad-response', googleWords(text)); }
    if (!data || data.ok !== true) throw new SyncError(data?.error ?? 'server', data?.message, data);
    config.scriptVersion = Number(data.version) || 1;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the sync script to do something besides syncing (Ward Patients uses
 * this to reach the ward logsheet). Uses this device's sync connection.
 * Throws SyncError: code 'not-connected' without one; reason holds the
 * script's own error code.
 */
export async function callSyncScript(action, payload = {}) {
  const config = sync.config;
  if (!config) throw new SyncError('not-connected');
  const before = scriptVersion(config);
  let data;
  try {
    data = await call(action, payload, config);
  } catch (err) {
    // Scripts older than version 3 don't know the action
    if (err.reason === 'bad-action' && before >= LATEST_SCRIPT_VERSION) config.scriptVersion = LATEST_SCRIPT_VERSION - 1;
    throw err;
  } finally {
    if (sync.config === config && scriptVersion(config) !== before) {
      await saveConfig();
      publish();
    }
  }
  return data;
}

/** The sync script's version, as last reported (null when not connected). */
export const syncScriptVersion = () => (sync.config ? scriptVersion() : null);

/** What an Apple Shortcut needs to send weights to the sync script: { url, token, version }, or null when not connected. */
export const shortcutDetails = () => (sync.config ? { url: sync.config.url, token: sync.config.token, version: scriptVersion() } : null);

/* ---------- One sync round ---------- */

/** Local records to send. First sync: everything real except profile/settings (the Sheet's copy wins). */
function collectOutgoing(firstSync) {
  return tx([...SYNC_STORES, 'outbox'], 'readwrite', (s) => {
    if (firstSync) {
      const stores = SYNC_STORES.filter((name) => !GROUP_STORES.includes(name));
      return Promise.all(stores.map((name) => promisify(s[name].getAll())))
        .then((all) => stores.flatMap((name, i) => all[i]
          .filter((r) => !r.sample)
          .map((record) => ({ store: name, record }))));
    }
    return promisify(s.outbox.getAll()).then((entries) => Promise.all(entries.map((entry) => {
      if (!SYNC_STORES.includes(entry.store)) {
        s.outbox.delete(entry.key);
        return null;
      }
      return promisify(s[entry.store].get(entry.id)).then((record) => {
        if (!record || record.sample) {
          s.outbox.delete(entry.key);
          return null;
        }
        return { store: entry.store, record };
      });
    }))).then((items) => items.filter(Boolean));
  });
}

/** After a push, forget changes that reached the Sheet (unless edited again meanwhile). */
function settleOutbox(batch, results) {
  return tx('outbox', 'readwrite', (outbox) => Promise.all(batch.map(({ store, record }) => {
    const key = outboxKey(store, record.id);
    if (!['applied', 'same', 'stale'].includes(results[key])) return null;
    return promisify(outbox.get(key)).then((entry) => {
      if (entry && entry.updatedAt === record.updatedAt) outbox.delete(key);
    });
  })));
}

async function push(allItems, logs = []) {
  const results = {};
  const items = allItems.filter(({ store }) => scriptSupports(store));
  for (let i = 0; i < items.length || (i === 0 && logs.length); i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const res = await call('push', {
      sinceSeq: sync.config.pullSeq ?? 0,
      records: batch.map(({ store, record }) => ({ store, record })),
      logs: i === 0 ? logs : [],
    });
    Object.assign(results, res.results ?? {});
    await settleOutbox(batch, res.results ?? {});
  }
  return results;
}

/**
 * Save changes from other devices. Newest updatedAt wins. On a device's first
 * sync the Sheet's profile/settings win outright; replaced local versions are
 * returned as logs for the Conflicts tab.
 */
function applyRemote(changes, firstSync) {
  const byKey = new Map();
  const scriptItems = new Map();
  for (const change of changes) {
    const record = change?.record;
    if (!record || typeof record.id !== 'string') continue;
    if (SYNC_STORES.includes(change?.store)) byKey.set(outboxKey(change.store, record.id), change);
    else if (SCRIPT_STORES.includes(change?.store)) scriptItems.set(outboxKey(change.store, record.id), change);
  }
  const items = [...byKey.values()];
  const touched = new Set();
  const logs = [];
  if (!items.length) return applyScriptRecords([...scriptItems.values()], touched).then(() => ({ touched, logs }));

  return tx([...SYNC_STORES, 'outbox'], 'readwrite', (s) =>
    Promise.all(items.map(({ store, record }) => Promise.all([
      promisify(s[store].get(record.id)),
      promisify(s.outbox.get(outboxKey(store, record.id))),
    ]).then(([local, pending]) => ({ store, remote: record, local, pending }))))
      .then((rows) => {
        for (const { store, remote, local, pending } of rows) {
          if (local?.sample) continue;
          const remoteAt = String(remote.updatedAt ?? '');
          const localAt = String(local?.updatedAt ?? '');
          const sheetWins = firstSync && GROUP_STORES.includes(store);
          if (local && (remoteAt === localAt || sameContent(local, remote))) {
            if (pending) s.outbox.delete(pending.key); // nothing different to send
            continue;
          }
          if (!local || sheetWins || isPristine(store, local) || remoteAt > localAt) {
            if (sheetWins && local && !isPristine(store, local)) {
              logs.push({ store, id: local.id, reason: 'Replaced by the Sheet’s version when this device joined sync', keptUpdatedAt: remoteAt, lostUpdatedAt: localAt, json: JSON.stringify(local) });
            }
            s[store].put(remote);
            if (pending) s.outbox.delete(pending.key);
            touched.add(store);
          } else if (!pending) {
            // This device has a newer version: make sure it gets sent
            s.outbox.put({ key: outboxKey(store, local.id), store, id: local.id, updatedAt: local.updatedAt });
          }
        }
        return { touched, logs };
      }))
    .then((result) => applyScriptRecords([...scriptItems.values()], touched).then(() => result));
}

/**
 * What the sync script keeps itself (the Google Calendar link of each task):
 * the newest copy is simply kept — this device never changes or sends them.
 */
export function applyScriptRecords(changes, touched = new Set()) {
  if (!changes.length) return Promise.resolve(touched);
  const stores = [...new Set(changes.map((c) => c.store))];
  return tx(stores, 'readwrite', (s) => Promise.all(changes.map(({ store, record }) => promisify(s[store].get(record.id)).then((local) => {
    if (local && String(local.updatedAt ?? '') >= String(record.updatedAt ?? '')) return;
    s[store].put(record);
    touched.add(store);
  })))).then(() => touched);
}

/** First sync: send this device's profile/settings only if the Sheet had none yet. */
function localGroupRecords(present) {
  const stores = GROUP_STORES.filter((name) => !present.has(name));
  if (!stores.length) return Promise.resolve([]);
  return tx(stores, 'readonly', (s) => Promise.all(stores.map((name) => promisify(s[name].getAll())))
    .then((all) => stores.flatMap((name, i) => all[i]
      .filter((r) => !isPristine(name, r))
      .map((record) => ({ store: name, record })))));
}

async function refreshAfterSync(touched) {
  if (!touched.size) return;
  const sampleBefore = JSON.stringify(state.settings.sampleData);
  if (touched.has('settings') || touched.has('profile')) await reloadFromDatabase('sync');
  if (JSON.stringify(state.settings.sampleData) !== sampleBefore) await ensureSampleData();
  emit('data', { reason: 'sync' });
}

/** Photos saved by v0.1 could be too large for a Sheet cell: shrink before sending. */
async function fitProfilePhoto() {
  const photo = state.profile?.photo;
  if (!photo || photo.length <= 40000) return;
  const smaller = await fitPhotoForSync(photo).catch(() => null);
  if (smaller && smaller !== photo) await updateProfile({ photo: smaller }, { source: 'sync' });
}

async function runSync() {
  if (!sync.config) return false;
  if (!navigator.onLine) {
    setPhase('offline');
    return false;
  }
  clearTimeout(retryTimer);
  setPhase('syncing');
  try {
    const config = sync.config;
    const firstSync = !config.firstSyncDone;
    const versionBefore = scriptVersion(config);
    await fitProfilePhoto();

    const outgoing = await collectOutgoing(firstSync);
    const results = await push(outgoing);
    if (outgoing.length) emit('sync:pushed', { items: outgoing.filter(({ store }) => scriptSupports(store)) }); // e.g. the Calendar link updates events
    const pulled = await call('pull', { sinceSeq: config.pullSeq ?? 0 });
    let changes = pulled.changes ?? [];
    const known = config.knownStores ?? STORES_KNOWN_BEFORE;
    const skipped = firstSync ? [] : SYNC_STORES.filter((name) => !known.includes(name));
    if (skipped.some((name) => scriptSupports(name))) {
      const everything = await call('pull', { sinceSeq: 0 });
      changes = [...(everything.changes ?? []).filter((c) => skipped.includes(c.store)), ...changes]; // newer ones last, so they win
    }
    const { touched, logs } = await applyRemote(changes, firstSync);

    if (firstSync) {
      const present = new Set((pulled.changes ?? []).map((c) => c.store));
      const extra = await localGroupRecords(present);
      if (extra.length || logs.length) Object.assign(results, await push(extra, logs));
    }

    config.pullSeq = Number(pulled.seq) || config.pullSeq || 0;
    config.knownStores = [...SYNC_STORES];
    config.firstSyncDone = true;
    config.lastSyncAt = nowISO();
    await saveConfig();
    await refreshAfterSync(touched);
    await countPending();
    retryStep = 0;
    // The script was just updated: send what was waiting for it straight away
    if (scriptVersion(config) > versionBefore && outgoing.some(({ store }) => !scriptSupports(store, { scriptVersion: versionBefore }))) {
      again = true;
    }
    const tooLarge = Object.values(results).includes('too-large');
    setPhase('idle', tooLarge ? { code: 'too-large', message: 'One item was too large to sync.' } : null);
    return true;
  } catch (err) {
    const error = err instanceof SyncError ? err : new SyncError('server', err?.message);
    console.warn('Sync failed:', error.code, error.detail ?? '');
    await countPending().catch(() => {});
    if (error.code === 'network' && !navigator.onLine) setPhase('offline');
    else setPhase('error', { code: error.code, message: error.message });
    if (RETRYABLE.has(error.code) && sync.config?.auto) scheduleRetry();
    return false;
  }
}

/* ---------- Scheduling ---------- */

let timer = null;
let dueAt = 0;
let retryTimer = null;
let retryStep = 0;
let running = null;
let again = false;

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = RETRY_MS[Math.min(retryStep, RETRY_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => syncNow(), delay);
}

/** Sync right away (also used by the "Sync now" button). Resolves true on success. */
export function syncNow() {
  if (!sync.config) return Promise.resolve(false);
  clearTimeout(timer);
  timer = null;
  if (running) {
    again = true;
    return running;
  }
  running = runSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      requestSync(800, { force: true });
    }
  });
  return running;
}

/**
 * Sync soon, if automatic sync is on (or when forced). A sync that's already
 * scheduled sooner is kept, so a stream of changes can't keep postponing it.
 */
export function requestSync(delay = AFTER_CHANGE_MS, { force = false } = {}) {
  if (!sync.config || (!sync.config.auto && !force)) return;
  const at = Date.now() + delay;
  if (timer && dueAt <= at) return;
  clearTimeout(timer);
  dueAt = at;
  timer = setTimeout(() => {
    timer = null;
    syncNow();
  }, delay);
}

const isStale = (ms) => !sync.config?.lastSyncAt || Date.now() - Date.parse(sync.config.lastSyncAt) > ms;

/* ---------- Public controls ---------- */

export async function initSync() {
  sync.config = (await db.get('meta', META_KEY))?.value ?? null;
  await countPending();
  sync.phase = !sync.config ? 'off' : navigator.onLine ? 'idle' : 'offline';

  on('local-change', ({ quiet } = {}) => {
    countPending().then(publish);
    requestSync(quiet ? AFTER_QUIET_CHANGE_MS : AFTER_CHANGE_MS);
  });
  window.addEventListener('online', () => {
    if (sync.config) setPhase('idle');
    requestSync(1000);
  });
  window.addEventListener('offline', () => { if (sync.config) setPhase('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isStale(60_000)) requestSync(500);
  });
  setInterval(() => { if (document.visibilityState === 'visible') requestSync(0); }, EVERY_MS);

  publish();
  requestSync(1500); // catch up when the app opens
}

/** Check the connection, save it, then do the first sync. Throws SyncError if the details are wrong. */
export async function connectSync({ url, token }) {
  const cleanUrl = checkUrl(url);
  const cleanToken = normalizeToken(token);
  if (cleanToken.replace(/-/g, '').length < 12) throw new SyncError('no-token');
  const config = {
    url: cleanUrl,
    token: cleanToken,
    deviceId: `${deviceName().replace(/\s+/g, '')}-${uid().slice(0, 6)}`,
    auto: true,
    pullSeq: 0,
    firstSyncDone: false,
    lastSyncAt: null,
    connectedAt: nowISO(),
  };
  try {
    await call('ping', {}, config); // nothing is saved unless this works
  } catch (err) {
    // Online but unreachable usually means a wrong link or "Who has access" isn't "Anyone"
    if (err.code === 'network' && navigator.onLine) throw new SyncError('bad-response');
    throw err;
  }
  sync.config = config;
  await saveConfig();
  setPhase('idle');
  return syncNow();
}

export async function disconnectSync() {
  clearTimeout(timer);
  timer = null;
  clearTimeout(retryTimer);
  sync.config = null;
  await db.delete('meta', META_KEY);
  // What the old Sheet's script reported (Google Calendar links) means nothing without it
  await tx(SCRIPT_STORES, 'readwrite', (s) => { SCRIPT_STORES.forEach((name) => s[name].clear()); });
  setPhase('off');
  emit('data', { reason: 'sync' });
}

export async function setAutoSync(enabled) {
  if (!sync.config) return;
  sync.config.auto = enabled;
  await saveConfig();
  publish();
  if (enabled) requestSync(500);
}

/** One-line status for Settings and the dashboard. */
export function syncStatusText(s = syncSnapshot()) {
  if (!s.connected) return 'Not connected';
  if (s.phase === 'syncing') return 'Syncing…';
  const waiting = s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'}` : '';
  if (s.phase === 'offline') return waiting ? `Offline — ${waiting} will sync when you’re back online` : 'Offline — will sync when you’re back online';
  if (s.phase === 'error') return s.error?.message ?? 'Sync problem';
  if (waiting && !s.auto) return `${waiting} not synced yet`;
  if (!s.lastSyncAt) return 'Waiting to sync';
  const note = s.scriptOutdated ? ' · the sync script needs an update'
    : s.error?.code === 'too-large' ? ' · one item was too large' : '';
  return `Synced ${formatAgo(s.lastSyncAt)}${note}`;
}
