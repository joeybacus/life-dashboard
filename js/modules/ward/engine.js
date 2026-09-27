/* Ward Patients — the engine: the patient list, rounds, and changes waiting
   to be saved to the ward logsheet (through the sync script, which runs as
   you in your Google account).

   Everything you do is saved on this device first, so nothing is lost when
   you're offline or the app closes. Changes wait in a queue and go to the
   logsheet with the next request. Each one carries what the cell held when
   the app loaded it: if someone has changed it since, the script reports a
   conflict and you choose which version to keep. Failed requests are retried
   automatically while the app is open.

   Screens listen with on('ward', …) and read wardView(). */
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';
import { SyncError, callSyncScript, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import {
  LOAD_PROBLEMS, MAX_RECS, cleanText, fromSheetTime, hnKey, manilaDateKey, msUntilManilaMidnight, priorityOf,
  parseSheetLink, previousDateKey, sheetTimeDay, sortPatients, toSheetTime,
} from './model.js';
import * as store from './store.js';

const SEND_DELAY_MS = 700;               // quick taps go out together
const RETRY_MS = [15, 30, 60, 120, 300].map((s) => s * 1000);
const SESSION_MAX_MS = 12 * 3600e3;      // an unfinished rounds session older than this was forgotten
const RETRYABLE = new Set(['network', 'timeout', 'busy', 'server', 'bad-response']);
const LABS_SCRIPT_VERSION = 4;           // sync scripts older than this can't save lab results

/* What you can edit in the app, and the logsheet column each one is saved to */
export const EDITABLE = {
  labs: { column: 'C', label: 'lab results' },
  recs: { column: 'D', label: 'recommendations' },
};

const ward = {
  link: null,        // the logsheet on this device (see store.js)
  cache: null,       // the last list loaded
  queue: new Map(),  // "KEY|recs" / "KEY|rounds" → change waiting to be saved
  days: new Map(),   // Manila date → rounds record (today and yesterday, plus any touched)
  phase: 'idle',     // 'idle' | 'loading'
  error: null,       // WardError from the last request, or null
};

let running = null;
let again = false;
let sendTimer = null;
let retryTimer = null;
let retryStep = 0;
let midnightTimer = null;
let today = manilaDateKey();

export class WardError extends Error {
  /** code: a LOAD_PROBLEMS key, a sync error code ('network', 'bad-token'…) or 'offline'. */
  constructor(code, { message, data = null } = {}) {
    super(message ?? LOAD_PROBLEMS[code] ?? 'Something went wrong. Please try again.');
    this.code = code;
    this.data = data;
  }
}

function toWardError(err) {
  if (err instanceof WardError) return err;
  if (err instanceof SyncError) {
    if (err.reason === 'bad-action') return new WardError('script-outdated');
    if (LOAD_PROBLEMS[err.reason]) return new WardError(err.reason, { data: err.data });
    return new WardError(err.code, { message: err.message });
  }
  return new WardError('server');
}

function publish() {
  emit('ward', {});
}

/* ---------- Rounds records ---------- */

const emptyDay = (date) => ({ date, sessions: [], patients: {}, updatedAt: null });

async function dayRecord(date) {
  if (!ward.days.has(date)) ward.days.set(date, (await store.loadDay(date)) ?? emptyDay(date));
  return ward.days.get(date);
}

async function saveDayRecord(day) {
  day.updatedAt = nowISO();
  await store.saveDay(day);
}

/** The rounds session in progress: { date, session } or null. */
function activeSession(now = Date.now()) {
  const key = manilaDateKey(now);
  for (const date of [key, previousDateKey(key)]) {
    const session = ward.days.get(date)?.sessions.findLast((s) => !s.end);
    if (session && now - Date.parse(session.start) < SESSION_MAX_MS) return { date, session };
  }
  return null;
}

/* ---------- The view the screens draw ---------- */

const rowByKey = (key) => (key ? ward.cache?.rows.find((r) => r.key === key) ?? null : null);
const outgoing = () => [...ward.queue.values()].filter((item) => item.state !== 'conflict');
const roundsToSheet = () => Boolean(ward.link) && !ward.link.roundsHere;

/**
 * Everything the Ward screen shows, worked out from the list, today's rounds
 * record and the changes not saved yet.
 */
export function wardView(now = Date.now()) {
  const date = manilaDateKey(now);
  const day = ward.days.get(date) ?? emptyDay(date);
  const active = activeSession(now);
  const timing = active?.session ?? day.sessions.at(-1) ?? null; // the session whose opened cards count
  const rows = ward.cache?.rows ?? [];
  const counts = new Map();
  rows.forEach((r) => { if (r.key) counts.set(r.key, (counts.get(r.key) ?? 0) + 1); });

  const patients = rows.map((r) => {
    const labsItem = r.key ? ward.queue.get(`${r.key}|labs`) ?? null : null;
    const recsItem = r.key ? ward.queue.get(`${r.key}|recs`) ?? null : null;
    const roundsItem = r.key ? ward.queue.get(`${r.key}|rounds`) ?? null : null;
    const recs = recsItem ? recsItem.set.D : r.recs;
    const entry = r.key ? day.patients[r.key] : null;
    const rounded = Boolean(entry?.rounded);
    const opened = !rounded && r.key ? timing?.starts?.[r.key] ?? null : null;
    const lastDay = sheetTimeDay(r.end);
    return {
      id: r.key || `row-${r.row}`,
      key: r.key,
      row: r.row,
      name: r.name,
      hn: r.hn,
      labs: labsItem ? labsItem.set.C : r.labs,
      recs,
      duplicate: counts.get(r.key) > 1,
      tickable: Boolean(r.key) && counts.get(r.key) === 1,
      priority: priorityOf(recs), // { level, tag } or null
      rounded,
      start: entry?.start ?? opened,
      end: rounded ? entry.end ?? null : null,
      durationMs: rounded ? entry.durationMs ?? null : null,
      opened,
      lastRounded: !rounded && lastDay && lastDay < date ? fromSheetTime(r.end) : null,
      labsItem,
      recsItem,
      roundsItem,
    };
  });

  const keys = new Set(rows.map((r) => r.key).filter(Boolean));
  const items = [...ward.queue.values()];
  const tickable = patients.filter((p) => p.tickable);
  return {
    date,
    link: ward.link,
    cache: ward.cache,
    phase: ward.phase,
    error: ward.error,
    online: navigator.onLine,
    patients: sortPatients(patients),
    total: tickable.length,
    roundedCount: tickable.filter((p) => p.rounded).length,
    noNumber: patients.filter((p) => !p.key).length,
    duplicates: [...new Set(patients.filter((p) => p.duplicate).map((p) => p.hn))],
    sessions: day.sessions,
    active,
    unsaved: items.length,
    conflicts: items.filter((i) => i.state === 'conflict'),
    blocked: items.filter((i) => i.state === 'blocked'),
    orphans: items.filter((i) => !keys.has(i.patient)),
    headersTaken: ward.cache?.headers?.state === 'taken' && roundsToSheet(),
  };
}

/** A short summary for the dashboard card. */
export function wardSummary() {
  if (!ward.link) return { linked: false };
  const v = wardView();
  return { linked: true, total: v.total, rounded: v.roundedCount, loaded: Boolean(ward.cache), active: Boolean(v.active), unsaved: v.unsaved };
}

/* ---------- Talking to the logsheet ---------- */

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = RETRY_MS[Math.min(retryStep, RETRY_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => refreshWard(), delay);
}

/** Send changes (and fetch the list) shortly, so several quick taps go in one request. */
function sendSoon(delay = SEND_DELAY_MS) {
  if (!ward.link) return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    sendTimer = null;
    refreshWard();
  }, delay);
}

/** Save waiting changes, then load the list. Resolves true when the logsheet answered. */
export function refreshWard() {
  if (!ward.link) return Promise.resolve(false);
  clearTimeout(sendTimer);
  sendTimer = null;
  if (running) {
    again = true;
    return running;
  }
  running = request().finally(() => {
    running = null;
    if (again) {
      again = false;
      sendSoon(300);
    }
  });
  return running;
}

/** Like refreshWard, but waits for a request already on its way first (so a change just made is included). */
export async function flushWard() {
  if (running) await running.catch(() => {});
  return refreshWard();
}

async function request() {
  const link = ward.link;
  const date = manilaDateKey();
  if (!navigator.onLine) {
    ward.error = new WardError('offline', { message: 'You’re offline.' });
    publish();
    return false;
  }
  if (!syncSnapshot().connected) {
    ward.error = new WardError('not-connected');
    publish();
    return false;
  }
  const waiting = outgoing();
  const held = (syncScriptVersion() ?? 0) < LABS_SCRIPT_VERSION ? waiting.filter((i) => i.kind === 'labs') : [];
  for (const item of held) {
    if (item.problem === 'needs-update') continue;
    Object.assign(item, { state: 'blocked', problem: 'needs-update' });
    await store.saveQueueItem(item);
  }
  const sent = waiting.filter((i) => !held.includes(i));
  const toSheet = !link.roundsHere;
  const reset = toSheet && (ward.cache?.resetDay !== date || sent.some((i) => i.kind === 'rounds' && i.day < date));
  ward.phase = 'loading';
  publish();
  let res;
  try {
    res = await callSyncScript('wardSync', {
      spreadsheetId: link.spreadsheetId,
      tab: link.tab,
      writes: sent.map((i) => ({ id: `${i.key}#${i.rev}`, hn: i.hn, expect: i.expect, set: i.set, quiet: i.day < date })),
      claim: toSheet,
      resetBefore: reset ? date : undefined,
    });
  } catch (err) {
    ward.phase = 'idle';
    if (ward.link !== link) return false;
    ward.error = toWardError(err);
    if (RETRYABLE.has(ward.error.code) && outgoing().length) scheduleRetry();
    publish();
    return false;
  }
  ward.phase = 'idle';
  if (ward.link !== link) return false; // the logsheet was changed or removed meanwhile
  await applyResponse(res, sent, date, reset);
  ward.error = null;
  retryStep = 0;
  clearTimeout(retryTimer);
  publish();
  return true;
}

async function applyResponse(res, sent, date, didReset) {
  const link = ward.link;
  const rows = (res.rows ?? []).map((r) => ({
    row: r.row,
    name: String(r.name ?? ''),
    hn: String(r.hn ?? ''),
    key: hnKey(r.hn),
    labs: String(r.labs ?? ''),
    recs: String(r.recs ?? ''),
    ...(typeof r.rounded === 'boolean' ? { rounded: r.rounded, start: String(r.start ?? ''), end: String(r.end ?? '') } : {}),
  }));
  ward.cache = {
    spreadsheetId: link.spreadsheetId,
    tab: res.tab ?? link.tab,
    title: res.title ?? link.title,
    fetchedAt: nowISO(),
    headers: res.headers ?? null,
    canEdit: res.canEdit ?? null,
    truncated: Boolean(res.truncated),
    resetDay: didReset ? date : ward.cache?.resetDay ?? null,
    rows,
  };
  await store.saveCache(ward.cache);
  if ((res.tab && res.tab !== link.tab) || (res.title && res.title !== link.title)) {
    ward.link = { ...link, tab: res.tab ?? link.tab, title: res.title ?? link.title };
    await store.saveLink(ward.link);
  }

  for (const item of sent) {
    const result = res.results?.[`${item.key}#${item.rev}`];
    const now = ward.queue.get(item.key);
    if (!result || !now) continue;
    const unchanged = now.rev === item.rev;
    if (result.status === 'ok' || result.status === 'same' || result.status === 'skipped') {
      if (unchanged) await removeItem(item.key);
      else {
        // Changed again while this was on its way: the logsheet now holds what was sent
        now.expect = Object.fromEntries(Object.keys(now.expect).map((c) => [c, c in item.set ? item.set[c] : now.expect[c]]));
        await store.saveQueueItem(now);
      }
    } else if (unchanged && item.kind === 'rounds' && item.day < date && result.status !== 'conflict') {
      await removeItem(item.key); // a tick from an earlier day that can't be saved now: it's in the history
    } else if (unchanged) {
      now.state = result.status === 'conflict' ? 'conflict' : 'blocked';
      now.problem = result.status === 'conflict' ? null : result.status;
      now.current = result.current ?? null;
      await store.saveQueueItem(now);
    }
  }

  if (res.headers?.state === 'ours' && !ward.link.roundsHere) {
    await recordLogsheetRounds(rows, date);
    await recordResetTicks(res.reset ?? [], date);
  }
}

/**
 * Keep today's rounds record in step with the logsheet: patients ticked (or
 * unticked) on another device or by someone else. Your own changes that
 * aren't saved yet win until they are.
 */
async function recordLogsheetRounds(rows, date) {
  const day = await dayRecord(date);
  let changed = false;
  for (const r of rows) {
    if (!r.key || !('rounded' in r) || ward.queue.has(`${r.key}|rounds`)) continue;
    const when = sheetTimeDay(r.end) || sheetTimeDay(r.start);
    const roundedToday = r.rounded && (!when || when === date);
    const entry = day.patients[r.key];
    if (roundedToday) {
      const end = fromSheetTime(r.end);
      if (entry?.rounded && (!end || toSheetTime(entry.end) === r.end)) continue;
      const start = fromSheetTime(r.start) ?? entry?.start ?? null;
      day.patients[r.key] = {
        hn: r.hn, rounded: true, start, end, durationMs: start && end ? Date.parse(end) - Date.parse(start) : null, source: 'logsheet',
      };
      changed = true;
    } else if (entry?.rounded) {
      day.patients[r.key] = { ...entry, rounded: false, end: null, durationMs: null, source: 'logsheet' };
      changed = true;
    }
  }
  if (changed) await saveDayRecord(day);
}

/** Ticks the daily reset just cleared in the logsheet: make sure their day's history has them. */
async function recordResetTicks(reset, date) {
  for (const tick of reset) {
    const when = sheetTimeDay(tick.end) || sheetTimeDay(tick.start);
    const key = hnKey(tick.hn);
    if (!when || when >= date || !key) continue;
    const day = await dayRecord(when);
    if (day.patients[key]?.rounded) continue;
    const start = fromSheetTime(tick.start);
    const end = fromSheetTime(tick.end);
    day.patients[key] = { hn: tick.hn, rounded: true, start, end, durationMs: start && end ? Date.parse(end) - Date.parse(start) : null, source: 'logsheet' };
    await saveDayRecord(day);
  }
}

/* ---------- Changes waiting to be saved ---------- */

async function removeItem(key) {
  ward.queue.delete(key);
  await store.deleteQueueItem(key);
}

const sameCell = (c, a, b) => (c === 'E' ? Boolean(a) === Boolean(b) : String(a ?? '') === String(b ?? ''));

/**
 * Queue a change to one patient's lab results (set: { C }), recommendations
 * (set: { D }) or rounds (set: { E, F, G }). A newer change to the same thing replaces the waiting
 * one but keeps what the logsheet held before, so conflicts are still noticed.
 */
async function queueChange(r, kind, set) {
  const key = `${r.key}|${kind}`;
  const existing = ward.queue.get(key);
  const expect = existing?.expect ?? (kind === 'rounds'
    ? { E: Boolean(r.rounded), F: r.start ?? '', G: r.end ?? '' }
    : { [EDITABLE[kind].column]: kind === 'labs' ? r.labs : r.recs });
  if (Object.keys(set).every((c) => sameCell(c, expect[c], set[c]))) {
    // Back to what the logsheet already has: nothing to save
    if (existing) await removeItem(key);
    return null;
  }
  const item = {
    key,
    kind,
    patient: r.key,
    hn: r.hn,
    name: r.name,
    day: manilaDateKey(),
    expect,
    set,
    state: existing?.state === 'conflict' ? 'conflict' : 'pending',
    problem: null,
    current: existing?.current ?? null,
    rev: (existing?.rev ?? 0) + 1,
    createdAt: existing?.createdAt ?? nowISO(),
    updatedAt: nowISO(),
  };
  ward.queue.set(key, item);
  await store.saveQueueItem(item);
  return item;
}

/* ---------- What you do ---------- */

/** Opening a patient's card during rounds starts their timer (once, and only if not rounded yet). */
export async function notePatientOpened(key) {
  const active = activeSession();
  const r = rowByKey(key);
  if (!active || !r) return;
  const day = await dayRecord(manilaDateKey());
  if (day.patients[key]?.rounded || active.session.starts?.[key]) return;
  active.session.starts = { ...active.session.starts, [key]: nowISO() };
  await saveDayRecord(ward.days.get(active.date));
  publish();
}

/** Tick (rounded = true) or untick a patient. Returns today's entry for them. */
export async function setRounded(key, rounded) {
  const r = rowByKey(key);
  if (!r) return null;
  const date = manilaDateKey();
  const day = await dayRecord(date);
  const now = nowISO();
  const entry = { hn: r.hn, rounded: false, start: null, end: null, durationMs: null, ...day.patients[key] };
  if (rounded) {
    const timing = activeSession()?.session ?? day.sessions.at(-1);
    const start = entry.start ?? timing?.starts?.[key] ?? null;
    Object.assign(entry, { hn: r.hn, rounded: true, start, end: now, durationMs: start ? Date.parse(now) - Date.parse(start) : null, source: 'app' });
  } else {
    Object.assign(entry, { rounded: false, end: null, durationMs: null, source: 'app' }); // the start time stays
  }
  day.patients[key] = entry;
  await saveDayRecord(day);
  if (roundsToSheet()) {
    await queueChange(r, 'rounds', { E: entry.rounded, F: toSheetTime(entry.start), G: entry.rounded ? toSheetTime(entry.end) : '' });
  }
  publish();
  sendSoon();
  return entry;
}

/**
 * Save edited lab results (field 'labs', column C) or recommendations ('recs',
 * column D). Resolves with the change's state afterwards.
 */
export async function saveText(key, field, text) {
  const r = rowByKey(key);
  if (!r) throw new WardError('not-found', { message: 'This patient is no longer in the logsheet.' });
  await queueChange(r, field, { [EDITABLE[field].column]: cleanText(text).slice(0, MAX_RECS) });
  publish();
  await flushWard();
  const item = ward.queue.get(`${key}|${field}`);
  return { saved: !item, state: item?.state ?? 'saved', problem: item?.problem ?? null };
}

export async function startRounds() {
  if (activeSession()) return;
  const day = await dayRecord(manilaDateKey());
  day.sessions.push({ id: uid(), start: nowISO(), end: null, starts: {} });
  await saveDayRecord(day);
  publish();
}

/** End the rounds session in progress. Returns it (with its end time), or null. */
export async function endRounds() {
  const active = activeSession();
  if (!active) return null;
  active.session.end = nowISO();
  await saveDayRecord(ward.days.get(active.date));
  publish();
  return active.session;
}

/**
 * A change someone else's edit got in the way of: keep yours ('mine' — it's
 * saved over theirs) or theirs ('theirs' — yours is dropped).
 */
export async function resolveConflict(key, choice) {
  const item = ward.queue.get(key);
  if (!item || item.state !== 'conflict') return;
  if (choice === 'mine') {
    item.expect = Object.fromEntries(Object.keys(item.expect).map((c) => [c, item.current && c in item.current ? item.current[c] : item.expect[c]]));
    Object.assign(item, { state: 'pending', current: null, rev: item.rev + 1, updatedAt: nowISO() });
    await store.saveQueueItem(item);
    publish();
    await flushWard();
    return;
  }
  await dropChange(key);
}

/** Forget a change that can't be saved (or the conflicting one you chose not to keep). */
export async function dropChange(key) {
  const item = ward.queue.get(key);
  if (!item) return;
  await removeItem(key);
  if (item.kind === 'rounds' && ward.cache && ward.cache.headers?.state === 'ours') await recordLogsheetRounds(ward.cache.rows, manilaDateKey());
  publish();
}

/** Keep ticks on this device only (when columns E–G can't be used), or start saving them again. */
export async function setRoundsHere(on) {
  if (!ward.link) return;
  ward.link = { ...ward.link, roundsHere: on };
  await store.saveLink(ward.link);
  if (on) {
    for (const item of [...ward.queue.values()]) if (item.kind === 'rounds') await removeItem(item.key);
  } else {
    // Today's ticks so far were kept here: send them to the logsheet too
    const day = await dayRecord(manilaDateKey());
    for (const [key, entry] of Object.entries(day.patients)) {
      const r = rowByKey(key);
      if (r && entry.rounded) await queueChange(r, 'rounds', { E: true, F: toSheetTime(entry.start), G: toSheetTime(entry.end) });
    }
  }
  publish();
  refreshWard();
}

/* ---------- The logsheet link ---------- */

/** Check a pasted link and tab before using them. Throws WardError. */
export async function checkLogsheet({ url, tab }) {
  const parsed = parseSheetLink(url);
  if (parsed.error) throw new WardError({ empty: 'link-empty', published: 'link-published' }[parsed.error] ?? 'ward-bad-id');
  try {
    const res = await callSyncScript('wardCheck', { spreadsheetId: parsed.id, tab: String(tab ?? '').trim() || 'Sheet1' });
    return {
      url: String(url).trim(),
      spreadsheetId: parsed.id,
      tab: res.tab,
      title: res.title,
      tabs: res.tabs ?? [],
      headers: res.headers,
      canEdit: res.canEdit,
      patients: res.patients ?? 0,
    };
  } catch (err) {
    throw toWardError(err);
  }
}

/** Use a checked logsheet on this device. A different logsheet replaces the old list and unsaved changes. */
export async function useLogsheet(check, { roundsHere = false, test = false } = {}) {
  clearTimeout(sendTimer);
  clearTimeout(retryTimer);
  const same = ward.link?.spreadsheetId === check.spreadsheetId && ward.link?.tab === check.tab;
  if (!same) {
    await store.clearLogsheet();
    ward.cache = null;
    ward.queue.clear();
  }
  ward.link = { url: check.url, spreadsheetId: check.spreadsheetId, tab: check.tab, title: check.title, linkedAt: nowISO(), test, roundsHere };
  ward.error = null;
  await store.saveLink(ward.link);
  publish();
  return flushWard();
}

/** Make a practice logsheet with made-up patients in your Google Drive, and use it. */
export async function createTestLogsheet() {
  let res;
  try {
    res = await callSyncScript('wardCreateTest');
  } catch (err) {
    throw toWardError(err);
  }
  const check = await checkLogsheet({ url: res.url, tab: res.tab });
  await useLogsheet(check, { test: true });
  return check;
}

/** Remove the logsheet from this device: link, patient list and unsaved changes. The rounds history stays. */
export async function forgetLogsheet() {
  clearTimeout(sendTimer);
  clearTimeout(retryTimer);
  ward.link = null;
  ward.cache = null;
  ward.queue.clear();
  ward.error = null;
  await store.clearLogsheet();
  publish();
}

/* ---------- History ---------- */

/** Every day with rounds on this device, newest first. */
export async function loadHistory() {
  const byDate = new Map((await store.loadAllDays()).map((d) => [d.date, d]));
  ward.days.forEach((d, date) => byDate.set(date, d));
  return [...byDate.values()]
    .filter((d) => d.sessions.length || Object.values(d.patients).some((p) => p.rounded))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function deleteHistory() {
  await store.clearHistory();
  ward.days.clear();
  await Promise.all([dayRecord(today), dayRecord(previousDateKey(today))]);
  publish();
}

/** Names for hospital numbers, from the current list (history keeps numbers only). */
export function namesByKey() {
  return new Map((ward.cache?.rows ?? []).filter((r) => r.key).map((r) => [r.key, r.name]));
}

/* ---------- Start-up, midnight ---------- */

async function checkNewDay() {
  const key = manilaDateKey();
  if (key !== today) {
    today = key;
    // Ticks reset at midnight (Manila): today starts with a fresh record
    for (const date of [...ward.days.keys()]) if (date < previousDateKey(key)) ward.days.delete(date);
    await Promise.all([dayRecord(key), dayRecord(previousDateKey(key))]);
    publish();
    if (ward.link) sendSoon(2000); // and yesterday's ticks are cleared in the logsheet
  }
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(checkNewDay, msUntilManilaMidnight() + 1500);
}

export async function initWard() {
  const [link, cache, queue] = await Promise.all([store.loadLink(), store.loadCache(), store.loadQueue()]);
  ward.link = link;
  ward.cache = link && cache?.spreadsheetId === link.spreadsheetId ? cache : null;
  queue.forEach((item) => ward.queue.set(item.key, item));
  today = manilaDateKey();
  await Promise.all([dayRecord(today), dayRecord(previousDateKey(today))]);

  window.addEventListener('online', () => {
    publish();
    if (ward.link && outgoing().length) sendSoon(1000);
  });
  window.addEventListener('offline', publish);
  on('sync', (s) => {
    if (ward.link && !s.scriptOutdated && [...ward.queue.values()].some((i) => i.problem === 'needs-update')) sendSoon(800);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkNewDay();
    if (ward.link && outgoing().length) sendSoon(800);
  });
  checkNewDay();
  if (ward.link && outgoing().length) sendSoon(4000); // changes left from last time
}

/** When the list was last loaded (ISO), or null. */
export const lastLoadedAt = () => ward.cache?.fetchedAt ?? null;
/** This device's logsheet link ({ url, spreadsheetId, tab, title, test, roundsHere }), or null. */
export const wardLinkInfo = () => ward.link;
