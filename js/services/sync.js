/* Google Sheets sync, through a Google Apps Script web app the user deploys
   from apps-script/Code.gs.

   Local-first: the app always works from this device's database. Each sync
   (1) sends local changes, (2) fetches changes from other devices, and keeps
   the newest version of anything changed in both places; the Sheet's
   Conflicts tab keeps the other version. Sample data never syncs.

   When a device syncs for the first time, the profile and settings already in
   the Sheet win, so a new device can't overwrite them with its defaults. */
import { db, tx, promisify } from '../core/db.js';
import { SYNC_STORES } from '../core/schema.js';
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
const EVERY_MS = 5 * 60 * 1000;
const RETRY_MS = [30, 120, 300, 600].map((s) => s * 1000);
const REQUEST_TIMEOUT_MS = 45_000;

const MESSAGES = {
  network: 'Couldn’t reach Google. Check your internet connection.',
  timeout: 'Google took too long to answer. It will try again shortly.',
  busy: 'Your Google Sheet was busy. It will try again shortly.',
  'bad-response': 'That link didn’t answer like the Life Dashboard sync script. Check the Web app URL, and that “Who has access” is set to Anyone.',
  'bad-token': 'The secret token doesn’t match. Copy it again from the Connection tab of your Google Sheet.',
  'not-set-up': 'The sync script isn’t set up yet. In Apps Script, choose “setup” and click Run once.',
  protocol: 'The sync script needs updating: paste the latest code into Apps Script and deploy a new version.',
  'bad-url': 'That doesn’t look like a Web app URL. It should start with https://script.google.com/ and end with /exec.',
  'dev-url': 'That’s the test link (it ends with /dev). Use the Web app URL from Deploy → New deployment, which ends with /exec.',
  'no-token': 'Enter the secret token from the Connection tab of your Google Sheet.',
  server: 'Your Google Sheet reported a problem. It will try again shortly.',
};
const RETRYABLE = new Set(['network', 'timeout', 'busy', 'server', 'bad-response']);

export class SyncError extends Error {
  constructor(code, detail) {
    super(MESSAGES[code] ?? MESSAGES.server);
    this.code = MESSAGES[code] ? code : 'server';
    this.detail = detail;
  }
}

const sync = {
  config: null,  // { url, token, deviceId, auto, pullSeq, firstSyncDone, lastSyncAt, connectedAt }
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
    let data;
    try { data = await response.json(); } catch { throw new SyncError('bad-response'); }
    if (!data || data.ok !== true) throw new SyncError(data?.error ?? 'server', data?.message);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

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

async function push(items, logs = []) {
  const results = {};
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
  for (const change of changes) {
    const record = change?.record;
    if (SYNC_STORES.includes(change?.store) && record && typeof record.id === 'string') byKey.set(outboxKey(change.store, record.id), change);
  }
  const items = [...byKey.values()];
  const touched = new Set();
  const logs = [];
  if (!items.length) return Promise.resolve({ touched, logs });

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
      }));
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
    await fitProfilePhoto();

    const results = await push(await collectOutgoing(firstSync));
    const pulled = await call('pull', { sinceSeq: config.pullSeq ?? 0 });
    const { touched, logs } = await applyRemote(pulled.changes ?? [], firstSync);

    if (firstSync) {
      const present = new Set((pulled.changes ?? []).map((c) => c.store));
      const extra = await localGroupRecords(present);
      if (extra.length || logs.length) Object.assign(results, await push(extra, logs));
    }

    config.pullSeq = Number(pulled.seq) || config.pullSeq || 0;
    config.firstSyncDone = true;
    config.lastSyncAt = nowISO();
    await saveConfig();
    await refreshAfterSync(touched);
    await countPending();
    retryStep = 0;
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

/** Sync soon, if automatic sync is on (or when forced). */
export function requestSync(delay = AFTER_CHANGE_MS, { force = false } = {}) {
  if (!sync.config || (!sync.config.auto && !force)) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

const isStale = (ms) => !sync.config?.lastSyncAt || Date.now() - Date.parse(sync.config.lastSyncAt) > ms;

/* ---------- Public controls ---------- */

export async function initSync() {
  sync.config = (await db.get('meta', META_KEY))?.value ?? null;
  await countPending();
  sync.phase = !sync.config ? 'off' : navigator.onLine ? 'idle' : 'offline';

  on('local-change', () => {
    countPending().then(publish);
    requestSync();
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
  clearTimeout(retryTimer);
  sync.config = null;
  await db.delete('meta', META_KEY);
  setPhase('off');
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
  return `Synced ${formatAgo(s.lastSyncAt)}${s.error?.code === 'too-large' ? ' · one item was too large' : ''}`;
}
