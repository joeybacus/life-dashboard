/* Ward Patients — the engine: your patient lists (Ward Patients, plus any you
   add), and for each one its patients, rounds, and changes waiting to be
   saved to its ward logsheet (through the sync script, which runs as you in
   your Google account).

   A list's name, headings and columns sync between your devices (store.js);
   they never hold patients. Each device links each list to its logsheet
   itself and keeps that link, the patients, unsaved changes and the rounds
   history to itself.

   Everything you do is saved on this device first, so nothing is lost when
   you're offline or the app closes. Changes wait in a queue and go to the
   logsheet with the next request. Each one carries what the cell held when
   the app loaded it: if someone has changed it since, the script reports a
   conflict and you choose which version to keep. Failed requests are retried
   automatically while the app is open. Adding a column and moving rows go
   straight to the logsheet instead (they need a connection).

   Screens listen with on('ward', …) and read wardList(id).view(). */
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';
import { SyncError, callSyncScript, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import {
  DEFAULT_LIST_ID, DEFAULT_LIST_NAME, FIXED_HEADINGS, LOAD_PROBLEMS, MAX_TEXT, cleanLocation, cleanName, cleanText, defaultColumns,
  fromSheetTime, hnKey, manilaDateKey, msUntilManilaMidnight, parseSheetLink, previousDateKey, priorityOf,
  CENSUS_SCRIPT_VERSION, LAYOUT_SCRIPT_VERSION, isDefaultLayout, layoutOf, locationsOf, scriptForColumn, sheetTimeDay, sortPatients, toSheetTime,
} from './model.js';
import * as store from './store.js';

const SEND_DELAY_MS = 700;               // quick taps go out together
const RETRY_MS = [15, 30, 60, 120, 300].map((s) => s * 1000);
const SESSION_MAX_MS = 12 * 3600e3;      // an unfinished rounds session older than this was forgotten
const RETRYABLE = new Set(['network', 'timeout', 'busy', 'server', 'bad-response']);
// The first list is the same on every device (a fixed, old date, so a renamed copy always wins)
const SEEDED_AT = '2020-01-01T00:00:00.000Z';
export const CENSUS_ID = 'census';

/** The referral census's columns at first (B Status, E Location, M Diagnosis, K Last rounds, L Next rounds); you can change them. */
export const CENSUS_ROLES = [
  { role: 'status', label: 'Status', col: 'B' },
  { role: 'location', label: 'Location', col: 'E' },
  { role: 'diagnosis', label: 'Diagnosis', col: 'M' },
  { role: 'last', label: 'Last rounds', col: 'K' },
  { role: 'next', label: 'Next rounds', col: 'L' },
  { role: 'waiting', label: 'Waiting for', col: '' },
  { role: 'notes', label: 'Notes', col: '' },
];
export const censusColumns = (roles) => roles.filter((r) => r.col).map((r) => ({
  id: r.role, col: r.col, label: r.label, role: r.role, ...(r.role === 'location' ? { location: true } : {}),
}));

const lists = new Map();  // list id → WardList, for every list not deleted
let order = [];           // those ids in the order you chose
const days = new Map();   // Manila date → rounds record of every list (today and yesterday, plus any touched)
let today = manilaDateKey();
let midnightTimer = null;

export class WardError extends Error {
  /** code: a LOAD_PROBLEMS key, a sync error code ('network', 'bad-token'…) or 'offline'. */
  constructor(code, { message, data = null, detail = '' } = {}) {
    super(message ?? LOAD_PROBLEMS[code] ?? 'Something went wrong. Please try again.');
    this.code = code;
    this.data = data;
    this.detail = detail; // Google's own words, when the sync script reported a problem
  }
}

function toWardError(err) {
  if (err instanceof WardError) return err;
  if (err instanceof SyncError) {
    if (err.reason === 'bad-action') return new WardError('script-outdated');
    if (LOAD_PROBLEMS[err.reason]) return new WardError(err.reason, { data: err.data });
    return new WardError(err.code, { message: err.message, detail: typeof err.detail === 'string' ? err.detail.slice(0, 300) : '' });
  }
  return new WardError('server', { detail: String(err?.message ?? '').slice(0, 300) });
}

const publish = (list = null) => emit('ward', { list });

/* ---------- Rounds records (one per Manila date, shared by the lists) ---------- */

const emptyDay = (date) => ({ date, lists: {}, updatedAt: null });
const NO_ROUNDS = Object.freeze({ sessions: Object.freeze([]), patients: Object.freeze({}) });

async function dayRecord(date) {
  if (!days.has(date)) days.set(date, (await store.loadDay(date)) ?? emptyDay(date));
  return days.get(date);
}

async function saveDayRecord(day) {
  day.updatedAt = nowISO();
  await store.saveDay(day);
}

/** One list's part of a day, to change (made if missing). */
const partOf = (day, list) => (day.lists[list] ??= { sessions: [], patients: {} });
/** One list's part of a day, to read. */
const peekPart = (date, list) => days.get(date)?.lists[list] ?? NO_ROUNDS;

/* ---------- One list ---------- */

const queueKey = (list, key, kind) => `${list}|${key}|${kind}`;
const sameCell = (c, a, b) => (c === 'E' ? Boolean(a) === Boolean(b) : String(a ?? '') === String(b ?? ''));

class WardList {
  constructor(def) {
    this.id = def.id;
    this.def = def;
    this.link = null;       // this device's logsheet for it (see store.js)
    this.cache = null;      // the last list loaded
    this.queue = new Map(); // queue key → change waiting to be saved
    this.phase = 'idle';    // 'idle' | 'loading'
    this.error = null;      // WardError from the last request, or null
    this.running = null;
    this.again = false;
    this.op = null;         // adding a column or moving rows: goes with the next request
    this.sendTimer = null;
    this.retryTimer = null;
    this.retryStep = 0;
    this.gone = false;
  }

  async load(items) {
    const [link, cache] = await Promise.all([store.loadLink(this.id), store.loadCache(this.id)]);
    this.link = link;
    this.cache = link && cache?.spreadsheetId === link.spreadsheetId ? upgradeCache(cache) : null;
    items.forEach((item) => this.queue.set(item.key, item));
  }

  dispose() {
    this.gone = true;
    clearTimeout(this.sendTimer);
    clearTimeout(this.retryTimer);
  }

  get name() { return this.def.name; }

  /** Where the name, hospital number and rounds are in the logsheet (letters). */
  layout() {
    return layoutOf(this.def);
  }

  /** What to send the sync script about the layout: nothing for the usual one (older scripts don't know it). */
  layoutField() {
    const L = this.layout();
    return isDefaultLayout(L) ? {} : { layout: L };
  }

  /** Rounded, Name and Hospital No. hidden in the app: { rounded, name, hn }. One of Name and Hospital No. always shows. */
  hidden() {
    const h = this.def.hidden ?? {};
    return { rounded: Boolean(h.rounded) || this.isCensus, name: Boolean(h.name) && !h.hn, hn: Boolean(h.hn) };
  }

  /** The referral census (Referrals): no rounds columns, days in its Last / Next rounds columns. */
  get isCensus() { return this.def.kind === 'referrals'; }

  /** Columns holding days (Last rounds, Next rounds): sent as dates. */
  dateCols() {
    return (this.def.columns ?? []).filter((c) => c.role === 'last' || c.role === 'next').map((c) => c.col);
  }

  /** Headings of Rounded, Name and Hospital No. (yours, or the usual ones). */
  headings() {
    const own = this.def.headings ?? {};
    return Object.fromEntries(Object.entries(FIXED_HEADINGS).map(([k, v]) => [k, cleanName(own[k]) || v]));
  }

  /**
   * The list's own columns, with whether the last load could read them —
   * readable — and, when not, whether that's only because it was added since
   * (loading: it comes with the next refresh) or the sync script is too old.
   */
  columns() {
    const read = this.cache?.cols ?? null;
    const v7 = Boolean(this.cache?.headings);
    return (this.def.columns ?? []).map((c) => {
      const readable = read ? read.includes(c.col) : c.col === 'C' || c.col === 'D';
      return { ...c, readable, loading: !readable && v7 };
    });
  }

  /** Letters to ask the logsheet for. */
  textCols() {
    return [...new Set((this.def.columns ?? []).map((c) => c.col))];
  }

  rowByKey(key) {
    return key ? this.cache?.rows.find((r) => r.key === key) ?? null : null;
  }

  outgoing() {
    return [...this.queue.values()].filter((item) => item.state !== 'conflict');
  }

  roundsToSheet() {
    return Boolean(this.link) && !this.link.roundsHere;
  }

  /** The rounds session in progress: { date, session } or null. */
  activeSession(now = Date.now()) {
    const key = manilaDateKey(now);
    for (const date of [key, previousDateKey(key)]) {
      const session = peekPart(date, this.id).sessions.findLast((s) => !s.end);
      if (session && now - Date.parse(session.start) < SESSION_MAX_MS) return { date, session };
    }
    return null;
  }

  /* ---------- What the screens draw ---------- */

  view(now = Date.now()) {
    const date = manilaDateKey(now);
    const part = peekPart(date, this.id);
    const active = this.activeSession(now);
    const timing = active?.session ?? part.sessions.at(-1) ?? null; // the session whose opened cards count
    const columns = this.columns();
    const priorityCol = columns.find((c) => c.priority)?.col ?? null;
    const locationCol = columns.find((c) => c.location && c.readable)?.col ?? null;
    const rows = this.cache?.rows ?? [];
    const counts = new Map();
    rows.forEach((r) => { if (r.key) counts.set(r.key, (counts.get(r.key) ?? 0) + 1); });

    const patients = rows.map((r) => {
      const cells = {};
      const items = {};
      for (const c of columns) {
        const item = r.key ? this.queue.get(queueKey(this.id, r.key, c.col)) ?? null : null;
        items[c.col] = item;
        cells[c.col] = item ? item.set[c.col] : r.cells?.[c.col] ?? '';
      }
      const roundsItem = r.key ? this.queue.get(queueKey(this.id, r.key, 'rounds')) ?? null : null;
      const entry = r.key ? part.patients[r.key] : null;
      const rounded = Boolean(entry?.rounded);
      const opened = !rounded && r.key ? timing?.starts?.[r.key] ?? null : null;
      const lastDay = sheetTimeDay(r.end);
      return {
        id: r.key || `row-${r.row}`,
        key: r.key,
        row: r.row,
        name: r.name,
        hn: r.hn,
        cells,     // column letter → text (your unsaved edit if there is one)
        items,     // column letter → change waiting to be saved, or null
        roundsItem,
        duplicate: counts.get(r.key) > 1,
        tickable: Boolean(r.key) && counts.get(r.key) === 1,
        priority: priorityCol ? priorityOf(cells[priorityCol]) : null, // { level, tag } or null
        location: locationCol ? cleanLocation(cells[locationCol]) : '',
        rounded,
        start: entry?.start ?? opened,
        end: rounded ? entry.end ?? null : null,
        durationMs: rounded ? entry.durationMs ?? null : null,
        opened,
        lastRounded: !rounded && lastDay && lastDay < date ? fromSheetTime(r.end) : null,
      };
    });

    const keys = new Set(rows.map((r) => r.key).filter(Boolean));
    const queued = [...this.queue.values()];
    const tickable = patients.filter((p) => p.tickable);
    return {
      id: this.id,
      name: this.def.name,
      headings: this.headings(),
      hidden: this.hidden(),
      layout: this.layout(),
      columns,
      locationCol,
      locations: locationsOf(patients),
      // 'location' groups the list by where patients are (once a column is marked location)
      arrange: this.def.arrange === 'location' && columns.some((c) => c.location) ? 'location' : 'rounds',
      date,
      link: this.link,
      cache: this.cache,
      phase: this.phase,
      error: this.error,
      online: navigator.onLine,
      patients: sortPatients(patients),
      total: tickable.length,
      roundedCount: tickable.filter((p) => p.rounded).length,
      noNumber: patients.filter((p) => !p.key).length,
      duplicates: [...new Set(patients.filter((p) => p.duplicate).map((p) => p.hn))],
      sessions: part.sessions,
      active,
      unsaved: queued.length,
      conflicts: queued.filter((i) => i.state === 'conflict'),
      blocked: queued.filter((i) => i.state === 'blocked'),
      orphans: queued.filter((i) => !keys.has(i.patient)),
      headersTaken: this.cache?.headers?.state === 'taken' && this.roundsToSheet(),
    };
  }

  /** A short summary for the Neurology tab and the dashboard card. */
  summary() {
    const base = { id: this.id, name: this.def.name, linked: Boolean(this.link) };
    if (!this.link) return base;
    const v = this.view();
    return { ...base, total: v.total, rounded: v.roundedCount, loaded: Boolean(this.cache), active: Boolean(v.active), unsaved: v.unsaved, noRounds: v.hidden.rounded };
  }

  /* ---------- Talking to the logsheet ---------- */

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    const delay = RETRY_MS[Math.min(this.retryStep, RETRY_MS.length - 1)];
    this.retryStep += 1;
    this.retryTimer = setTimeout(() => this.refresh(), delay);
  }

  /** Send changes (and fetch the list) shortly, so several quick taps go in one request. */
  sendSoon(delay = SEND_DELAY_MS) {
    if (!this.link || this.gone) return;
    clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      this.refresh();
    }, delay);
  }

  /** Save waiting changes, then load the list. Resolves true when the logsheet answered. */
  refresh() {
    if (!this.link || this.gone) return Promise.resolve(false);
    clearTimeout(this.sendTimer);
    this.sendTimer = null;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.request().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.sendSoon(300);
      }
    });
    return this.running;
  }

  /** Like refresh, but waits for a request already on its way first (so a change just made is included). */
  async flush() {
    if (this.running) await this.running.catch(() => {});
    return this.refresh();
  }

  async request() {
    const link = this.link;
    const date = manilaDateKey();
    const op = this.op; // adding a column or moving rows rides on this request (never retried later)
    this.op = null;
    const stop = (error) => {
      this.error = error;
      if (op) op.result = { status: error.code };
      publish(this.id);
      return false;
    };
    if (!navigator.onLine) return stop(new WardError('offline', { message: 'You’re offline.' }));
    if (!syncSnapshot().connected) return stop(new WardError('not-connected'));
    const version = syncScriptVersion() ?? 0;
    const layout = this.layout();
    if (!isDefaultLayout(layout) && version < (layout.rounds ? LAYOUT_SCRIPT_VERSION : CENSUS_SCRIPT_VERSION)) return stop(new WardError('script-outdated')); // it would read the wrong columns
    const waiting = this.outgoing();
    const held = waiting.filter((i) => i.kind !== 'rounds' && version < scriptForColumn(i.kind, layout));
    for (const item of held) {
      if (item.problem === 'needs-update') continue;
      Object.assign(item, { state: 'blocked', problem: 'needs-update' });
      await store.saveQueueItem(item);
    }
    const sent = waiting.filter((i) => !held.includes(i));
    const toSheet = !link.roundsHere && !this.hidden().rounded; // rounds hidden: never add the rounds headings
    const reset = toSheet && (this.cache?.resetDay !== date || sent.some((i) => i.kind === 'rounds' && i.day < date));
    const cols = this.textCols();
    this.phase = 'loading';
    publish(this.id);
    let res;
    try {
      res = await callSyncScript('wardSync', {
        spreadsheetId: link.spreadsheetId,
        tab: link.tab,
        ...this.layoutField(),
        writes: sent.map((i) => ({
          id: `${i.key}#${i.rev}`, hn: i.hn, expect: i.expect, set: i.set, quiet: i.day < date,
          // Columns other than C and D need sync script 7, which reads them as plain text (always, with your own layout)
          ...(i.kind === 'rounds' || ((i.kind === 'C' || i.kind === 'D') && isDefaultLayout(layout)) ? {} : { text: true }),
        })),
        claim: toSheet,
        resetBefore: reset ? date : undefined,
        cols,
        ...(this.dateCols().length ? { dates: this.dateCols() } : {}),
        ...(op?.addColumn ? { addColumn: op.addColumn } : {}),
        ...(op?.move ? { move: op.move } : {}),
      });
    } catch (err) {
      this.phase = 'idle';
      if (this.link !== link || this.gone) {
        if (op) op.result = { status: 'invalid' };
        return false;
      }
      this.error = toWardError(err);
      if (op) op.result = { status: this.error.code };
      if (RETRYABLE.has(this.error.code) && this.outgoing().length) this.scheduleRetry();
      publish(this.id);
      return false;
    }
    this.phase = 'idle';
    if (this.link !== link || this.gone) { // the logsheet was changed or removed meanwhile
      if (op) op.result = { status: 'invalid' };
      return false;
    }
    const added = res.added?.status === 'ok' && res.added.column ? res.added.column : null;
    await this.applyResponse(res, sent, date, reset, added ? [...cols, added] : cols);
    // An older script ignores what it doesn't know
    if (op) op.result = (op.addColumn ? res.added : res.moved) ?? { status: 'needs-update' };
    this.error = null;
    this.retryStep = 0;
    clearTimeout(this.retryTimer);
    publish(this.id);
    return true;
  }

  async applyResponse(res, sent, date, didReset, cols) {
    const link = this.link;
    // A referral census that suddenly comes back empty is usually still calculating (formulas,
    // IMPORTRANGE): keep the last list on screen and say so, rather than showing nobody
    const emptySince = Date.parse(this.cache?.emptyAt ?? '');
    this.emptyAnswer = this.isCensus && !(res.rows ?? []).length && (this.cache?.rows?.length ?? 0) > 0 && this.cache.spreadsheetId === link.spreadsheetId
      && !(Date.now() - emptySince > 15 * 60e3); // still empty after 15 minutes: it really is empty
    if (this.emptyAnswer) {
      this.cache = { ...this.cache, emptyAt: this.cache.emptyAt ?? nowISO() };
      return;
    }
    const v7 = Array.isArray(res.headings); // sync script 7 or later: reads the list's own columns
    const rows = (res.rows ?? []).map((r) => ({
      row: r.row,
      name: String(r.name ?? ''),
      hn: String(r.hn ?? ''),
      key: hnKey(r.hn),
      cells: v7 && r.cells && typeof r.cells === 'object'
        ? Object.fromEntries(Object.entries(r.cells).map(([c, text]) => [c, String(text ?? '')]))
        : { C: String(r.labs ?? ''), D: String(r.recs ?? '') },
      ...(typeof r.rounded === 'boolean' ? { rounded: r.rounded, start: String(r.start ?? ''), end: String(r.end ?? '') } : {}),
    }));
    this.cache = {
      spreadsheetId: link.spreadsheetId,
      tab: res.tab ?? link.tab,
      title: res.title ?? link.title,
      fetchedAt: nowISO(),
      headers: res.headers ?? null,
      canEdit: res.canEdit ?? null,
      truncated: Boolean(res.truncated),
      resetDay: didReset ? date : this.cache?.resetDay ?? null,
      cols: v7 ? (res.rows?.[0]?.cells ? Object.keys(res.rows[0].cells) : cols) : ['C', 'D'],
      headings: v7 ? res.headings.map((h) => String(h ?? '')) : null,
      lastColumn: v7 ? Number(res.lastColumn) || 0 : null,
      rows,
    };
    await store.saveCache(this.id, this.cache);
    if ((res.tab && res.tab !== link.tab) || (res.title && res.title !== link.title)) {
      this.link = { ...link, tab: res.tab ?? link.tab, title: res.title ?? link.title };
      await store.saveLink(this.id, this.link);
    }

    for (const item of sent) {
      const result = res.results?.[`${item.key}#${item.rev}`];
      const now = this.queue.get(item.key);
      if (!result || !now) continue;
      const unchanged = now.rev === item.rev;
      if (result.status === 'ok' || result.status === 'same' || result.status === 'skipped') {
        if (unchanged) await this.removeItem(item.key);
        else {
          // Changed again while this was on its way: the logsheet now holds what was sent
          now.expect = Object.fromEntries(Object.keys(now.expect).map((c) => [c, c in item.set ? item.set[c] : now.expect[c]]));
          await store.saveQueueItem(now);
        }
      } else if (unchanged && item.kind === 'rounds' && item.day < date && result.status !== 'conflict') {
        await this.removeItem(item.key); // a tick from an earlier day that can't be saved now: it's in the history
      } else if (unchanged) {
        now.state = result.status === 'conflict' ? 'conflict' : 'blocked';
        now.problem = result.status === 'conflict' ? null : result.status;
        now.current = result.current ?? null;
        await store.saveQueueItem(now);
      }
    }

    if (res.headers?.state === 'ours' && !this.link.roundsHere) {
      await this.recordLogsheetRounds(rows, date);
      await this.recordResetTicks(res.reset ?? [], date);
    }
  }

  /**
   * Keep today's rounds record in step with the logsheet: patients ticked (or
   * unticked) on another device or by someone else. Your own changes that
   * aren't saved yet win until they are.
   */
  async recordLogsheetRounds(rows, date) {
    const day = await dayRecord(date);
    const part = partOf(day, this.id);
    let changed = false;
    for (const r of rows) {
      if (!r.key || !('rounded' in r) || this.queue.has(queueKey(this.id, r.key, 'rounds'))) continue;
      const when = sheetTimeDay(r.end) || sheetTimeDay(r.start);
      const roundedToday = r.rounded && (!when || when === date);
      const entry = part.patients[r.key];
      if (roundedToday) {
        const end = fromSheetTime(r.end);
        if (entry?.rounded && (!end || toSheetTime(entry.end) === r.end)) continue;
        const start = fromSheetTime(r.start) ?? entry?.start ?? null;
        part.patients[r.key] = {
          hn: r.hn, rounded: true, start, end, durationMs: start && end ? Date.parse(end) - Date.parse(start) : null, source: 'logsheet',
        };
        changed = true;
      } else if (entry?.rounded) {
        part.patients[r.key] = { ...entry, rounded: false, end: null, durationMs: null, source: 'logsheet' };
        changed = true;
      }
    }
    if (changed) await saveDayRecord(day);
  }

  /** Ticks the daily reset just cleared in the logsheet: make sure their day's history has them. */
  async recordResetTicks(reset, date) {
    for (const tick of reset) {
      const when = sheetTimeDay(tick.end) || sheetTimeDay(tick.start);
      const key = hnKey(tick.hn);
      if (!when || when >= date || !key) continue;
      const day = await dayRecord(when);
      const part = partOf(day, this.id);
      if (part.patients[key]?.rounded) continue;
      const start = fromSheetTime(tick.start);
      const end = fromSheetTime(tick.end);
      part.patients[key] = { hn: tick.hn, rounded: true, start, end, durationMs: start && end ? Date.parse(end) - Date.parse(start) : null, source: 'logsheet' };
      await saveDayRecord(day);
    }
  }

  /* ---------- Changes waiting to be saved ---------- */

  async removeItem(key) {
    this.queue.delete(key);
    await store.deleteQueueItem(key);
  }

  /**
   * Queue a change to one patient: a column's text (kind: its letter, set: { H: … })
   * or rounds (kind 'rounds', set: { E, F, G }). A newer change to the same thing
   * replaces the waiting one but keeps what the logsheet held before, so conflicts
   * are still noticed.
   */
  async queueChange(r, kind, set, label = '') {
    const key = queueKey(this.id, r.key, kind);
    const existing = this.queue.get(key);
    const expect = existing?.expect ?? (kind === 'rounds'
      ? { E: Boolean(r.rounded), F: r.start ?? '', G: r.end ?? '' }
      : { [kind]: r.cells?.[kind] ?? '' });
    if (Object.keys(set).every((c) => sameCell(c, expect[c], set[c]))) {
      // Back to what the logsheet already has: nothing to save
      if (existing) await this.removeItem(key);
      return null;
    }
    const item = {
      key,
      list: this.id,
      kind,
      label: label || existing?.label || '',
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
    this.queue.set(key, item);
    await store.saveQueueItem(item);
    return item;
  }

  /* ---------- What you do ---------- */

  /** Opening a patient's card during rounds starts their timer (once, and only if not rounded yet). */
  async notePatientOpened(key) {
    const active = this.activeSession();
    if (!active || !this.rowByKey(key)) return;
    const part = partOf(await dayRecord(manilaDateKey()), this.id);
    if (part.patients[key]?.rounded || active.session.starts?.[key]) return;
    active.session.starts = { ...active.session.starts, [key]: nowISO() };
    await saveDayRecord(days.get(active.date));
    publish(this.id);
  }

  /** Tick (rounded = true) or untick a patient. Returns today's entry for them. */
  async setRounded(key, rounded) {
    const r = this.rowByKey(key);
    if (!r) return null;
    const date = manilaDateKey();
    const day = await dayRecord(date);
    const part = partOf(day, this.id);
    const now = nowISO();
    const entry = { hn: r.hn, rounded: false, start: null, end: null, durationMs: null, ...part.patients[key] };
    if (rounded) {
      const timing = this.activeSession()?.session ?? part.sessions.at(-1);
      const start = entry.start ?? timing?.starts?.[key] ?? null;
      Object.assign(entry, { hn: r.hn, rounded: true, start, end: now, durationMs: start ? Date.parse(now) - Date.parse(start) : null, source: 'app' });
    } else {
      Object.assign(entry, { rounded: false, end: null, durationMs: null, source: 'app' }); // the start time stays
    }
    part.patients[key] = entry;
    await saveDayRecord(day);
    if (this.roundsToSheet()) {
      await this.queueChange(r, 'rounds', { E: entry.rounded, F: toSheetTime(entry.start), G: entry.rounded ? toSheetTime(entry.end) : '' });
    }
    publish(this.id);
    this.sendSoon();
    return entry;
  }

  /** Save an edited column (e.g. 'C' lab results). Resolves with the change's state afterwards. */
  async saveText(key, col, text) {
    const r = this.rowByKey(key);
    if (!r) throw new WardError('not-found', { message: 'This patient is no longer in the logsheet.' });
    const label = this.def.columns.find((c) => c.col === col)?.label ?? `column ${col}`;
    await this.queueChange(r, col, { [col]: cleanText(text).slice(0, MAX_TEXT) }, label);
    publish(this.id);
    await this.flush();
    const item = this.queue.get(queueKey(this.id, key, col));
    return { saved: !item, state: item?.state ?? 'saved', problem: item?.problem ?? null };
  }

  async startRounds() {
    if (this.activeSession()) return;
    const day = await dayRecord(manilaDateKey());
    partOf(day, this.id).sessions.push({ id: uid(), start: nowISO(), end: null, starts: {} });
    await saveDayRecord(day);
    publish(this.id);
  }

  /** End the rounds session in progress. Returns it (with its end time), or null. */
  async endRounds() {
    const active = this.activeSession();
    if (!active) return null;
    active.session.end = nowISO();
    await saveDayRecord(days.get(active.date));
    publish(this.id);
    return active.session;
  }

  /**
   * A change someone else's edit got in the way of: keep yours ('mine' — it's
   * saved over theirs) or theirs ('theirs' — yours is dropped).
   */
  async resolveConflict(key, choice) {
    const item = this.queue.get(key);
    if (!item || item.state !== 'conflict') return;
    if (choice === 'mine') {
      item.expect = Object.fromEntries(Object.keys(item.expect).map((c) => [c, item.current && c in item.current ? item.current[c] : item.expect[c]]));
      Object.assign(item, { state: 'pending', current: null, rev: item.rev + 1, updatedAt: nowISO() });
      await store.saveQueueItem(item);
      publish(this.id);
      await this.flush();
      return;
    }
    await this.dropChange(key);
  }

  /** Forget a change that can't be saved (or the conflicting one you chose not to keep). */
  async dropChange(key) {
    const item = this.queue.get(key);
    if (!item) return;
    await this.removeItem(key);
    if (item.kind === 'rounds' && this.cache?.headers?.state === 'ours') await this.recordLogsheetRounds(this.cache.rows, manilaDateKey());
    publish(this.id);
  }

  /** Keep ticks on this device only (when columns E–G can't be used), or start saving them again. */
  async setRoundsHere(on) {
    if (!this.link) return;
    this.link = { ...this.link, roundsHere: on };
    await store.saveLink(this.id, this.link);
    if (on) {
      for (const item of [...this.queue.values()]) if (item.kind === 'rounds') await this.removeItem(item.key);
    } else {
      // Today's ticks so far were kept here: send them to the logsheet too
      const part = partOf(await dayRecord(manilaDateKey()), this.id);
      for (const [key, entry] of Object.entries(part.patients)) {
        const r = this.rowByKey(key);
        if (r && entry.rounded) await this.queueChange(r, 'rounds', { E: true, F: toSheetTime(entry.start), G: toSheetTime(entry.end) });
      }
    }
    publish(this.id);
    this.refresh();
  }

  /* ---------- The logsheet's shape: columns and row order ---------- */

  /** Run something that changes the logsheet itself with the next request. Resolves with its result: { status, … }. */
  async structural(fields) {
    if (!this.link) return { status: 'invalid' };
    const op = { ...fields, result: null };
    this.op = op;
    // A request already on its way was sent without it: wait, then send it with the next one
    for (let tries = 0; tries < 3 && !op.result && this.op === op; tries++) {
      if (this.running) await this.running.catch(() => {});
      if (!op.result && this.op === op) await this.refresh();
    }
    if (this.op === op) this.op = null; // it didn't go (e.g. the logsheet was removed)
    return op.result ?? { status: this.error?.code ?? 'invalid' };
  }

  /** Add a column to the logsheet after all the others, with this heading in row 1. Resolves { status, column }. */
  addLogsheetColumn(heading) {
    return this.structural({ addColumn: { heading: cleanName(heading) } });
  }

  /**
   * Put the patients' rows in the logsheet in a new order.
   * expect: every patient row as loaded ({ row, name, hn }); rowOrder: those row numbers in the new order.
   */
  moveRows(expect, rowOrder) {
    return this.structural({ move: { expect, order: rowOrder } });
  }

  /* ---------- The logsheet link ---------- */

  /** Use a checked logsheet for this list on this device. A different one replaces the old patients and unsaved changes. */
  async useLogsheet(check, { roundsHere = false, test = false } = {}) {
    clearTimeout(this.sendTimer);
    clearTimeout(this.retryTimer);
    const same = this.link?.spreadsheetId === check.spreadsheetId && this.link?.tab === check.tab;
    if (!same) {
      await store.clearLogsheet(this.id);
      this.cache = null;
      this.queue.clear();
    }
    this.link = { url: check.url, spreadsheetId: check.spreadsheetId, tab: check.tab, title: check.title, linkedAt: nowISO(), test, roundsHere };
    this.error = null;
    await store.saveLink(this.id, this.link);
    publish(this.id);
    return this.flush();
  }

  /** Make a practice logsheet with made-up patients in your Google Drive, and use it for this list. */
  async createTestLogsheet() {
    let res;
    try {
      res = await callSyncScript('wardCreateTest');
    } catch (err) {
      throw toWardError(err);
    }
    const check = await checkLogsheet({ url: res.url, tab: res.tab, layout: this.layout() });
    await this.useLogsheet(check, { test: true });
    return check;
  }

  /** Remove the logsheet from this device: link, patients and unsaved changes. The rounds history stays. */
  async forgetLogsheet() {
    clearTimeout(this.sendTimer);
    clearTimeout(this.retryTimer);
    this.link = null;
    this.cache = null;
    this.queue.clear();
    this.error = null;
    await store.clearLogsheet(this.id);
    publish(this.id);
  }

  /* ---------- History ---------- */

  /** Every day with rounds for this list on this device, newest first: [{ date, sessions, patients }]. */
  async history() {
    const byDate = new Map((await store.loadAllDays()).map((d) => [d.date, d]));
    days.forEach((d, date) => byDate.set(date, d));
    return [...byDate.values()]
      .map((d) => ({ date: d.date, ...(d.lists[this.id] ?? NO_ROUNDS) }))
      .filter((d) => d.sessions.length || Object.values(d.patients).some((p) => p.rounded))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async deleteHistory() {
    await store.clearHistory(this.id);
    days.forEach((d) => { delete d.lists[this.id]; });
    publish(this.id);
  }

  /** Names for hospital numbers, from the current list (the history keeps numbers only). */
  namesByKey() {
    return new Map((this.cache?.rows ?? []).filter((r) => r.key).map((r) => [r.key, r.name]));
  }
}

/** A list saved before 0.4.3.1 had labs and recs instead of cells. */
function upgradeCache(cache) {
  if (!cache || cache.cols) return cache;
  return { ...cache, cols: ['C', 'D'], headings: null, lastColumn: null, rows: (cache.rows ?? []).map(({ labs, recs, ...r }) => ({ ...r, cells: { C: labs ?? '', D: recs ?? '' } })) };
}

/* ---------- Your lists ---------- */

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));

/** The patient lists (not deleted), in order — not the referral census, which has its own page. */
export const wardLists = () => order.map((id) => lists.get(id)).filter((l) => l && !l.isCensus);
/** The referral census behind Referrals. */
export const censusList = () => lists.get(CENSUS_ID) ?? null;
/** One list, or null. */
export const wardList = (id) => lists.get(id) ?? null;
/** Summaries of every list, in order. */
export const wardSummaries = () => wardLists().map((l) => l.summary());

let reconciling = Promise.resolve();

/** Bring the lists in memory in line with the saved ones (after a change here, a sync or a restore). */
function reconcile() {
  reconciling = reconciling.then(async () => {
    const all = await store.loadLists();
    const live = all.filter((d) => !d.deletedAt).sort(byOrder);
    const items = live.some((d) => !lists.has(d.id)) ? await store.loadQueue() : [];
    for (const def of live) {
      const existing = lists.get(def.id);
      if (existing) {
        const before = existing.textCols().join();
        existing.def = def;
        if (existing.link && existing.textCols().join() !== before) existing.sendSoon(500); // e.g. a column added on another device
        continue;
      }
      const list = new WardList(def);
      await list.load(items.filter((item) => item.list === def.id));
      lists.set(def.id, list);
      if (list.link && list.outgoing().length) list.sendSoon(4000); // changes left from last time
    }
    for (const [id, list] of lists) {
      if (live.some((d) => d.id === id)) continue;
      list.dispose();
      lists.delete(id);
      // Deleted (here or on another device): its logsheet link, patients, changes and history go too
      if (all.some((d) => d.id === id && d.deletedAt)) await forgetList(id);
    }
    order = live.map((d) => d.id);
    publish();
  }).catch((err) => console.error('Ward lists', err));
  return reconciling;
}

async function forgetList(id) {
  await store.clearLogsheet(id);
  await store.clearHistory(id);
  days.forEach((d) => { delete d.lists[id]; });
}

const stamped = (def, now = nowISO()) => ({ ...def, updatedAt: now });

/** Make a new list (it opens without a logsheet). Resolves with its id. */
export async function createList(name) {
  const now = nowISO();
  const last = wardLists().at(-1)?.def.order ?? -1;
  const def = { id: uid(), name: cleanName(name) || 'Patients', order: last + 1, headings: {}, columns: defaultColumns(), createdAt: now, updatedAt: now, deletedAt: null };
  await store.saveList(def);
  await reconcile();
  return def.id;
}

/** Change a list's name, headings or columns: mutate(def) edits a copy. */
export async function updateList(id, mutate) {
  const list = lists.get(id);
  if (!list) return null;
  const next = structuredClone(list.def);
  mutate(next);
  next.name = cleanName(next.name) || list.def.name;
  await store.saveList(stamped(next));
  await reconcile();
  return list;
}

/** Move a list up (dir -1) or down (1) on the Neurology tab. */
export async function moveList(id, dir) {
  const ids = wardLists().map((l) => l.id);
  const from = ids.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  const now = nowISO();
  const changed = ids.map((lid, i) => ({ def: lists.get(lid).def, i })).filter(({ def, i }) => def.order !== i);
  await store.saveLists(changed.map(({ def, i }) => ({ ...def, order: i, updatedAt: now })));
  await reconcile();
}

/** Delete a list on every device (its logsheet isn't touched). */
export async function deleteList(id) {
  const list = lists.get(id);
  if (!list) return;
  const now = nowISO();
  await store.saveList({ ...list.def, deletedAt: now, updatedAt: now });
  await reconcile();
}

/* ---------- The logsheet link (any list) ---------- */

/** Check a pasted link and tab before using them. Throws WardError. */
export async function checkLogsheet({ url, tab, layout = null }) {
  const parsed = parseSheetLink(url);
  if (parsed.error) throw new WardError({ empty: 'link-empty', published: 'link-published' }[parsed.error] ?? 'ward-bad-id');
  if (layout && !isDefaultLayout(layout) && (syncScriptVersion() ?? 0) < (layout.rounds ? LAYOUT_SCRIPT_VERSION : CENSUS_SCRIPT_VERSION)) throw new WardError('script-outdated');
  try {
    const res = await callSyncScript('wardCheck', { spreadsheetId: parsed.id, tab: String(tab ?? '').trim() || 'Sheet1', ...(layout && !isDefaultLayout(layout) ? { layout } : {}) });
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

/* ---------- Start-up, midnight ---------- */

async function checkNewDay() {
  const key = manilaDateKey();
  if (key !== today) {
    today = key;
    // Ticks reset at midnight (Manila): today starts with a fresh record
    for (const date of [...days.keys()]) if (date < previousDateKey(key)) days.delete(date);
    await Promise.all([dayRecord(key), dayRecord(previousDateKey(key))]);
    publish();
    wardLists().forEach((list) => list.sendSoon(2000)); // and yesterday's ticks are cleared in the logsheets
  }
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(checkNewDay, msUntilManilaMidnight() + 1500);
}

export async function initWard() {
  // The first list: what Ward Patients was before there could be several
  await store.seedList({
    id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, order: 0, headings: {}, columns: defaultColumns(),
    createdAt: SEEDED_AT, updatedAt: SEEDED_AT, deletedAt: null,
  });
  // Referrals: the link to your referral census (each device links it itself; its columns sync)
  await store.seedList({
    id: CENSUS_ID, kind: 'referrals', name: 'Referral census', order: 999, headings: {},
    layout: { name: 'I', hn: 'J', rounds: '' }, columns: censusColumns(CENSUS_ROLES), hidden: { rounded: true },
    createdAt: SEEDED_AT, updatedAt: SEEDED_AT, deletedAt: null,
  });
  await store.upgradeQueue();
  today = manilaDateKey();
  await Promise.all([dayRecord(today), dayRecord(previousDateKey(today))]);
  await reconcile();
  // A list deleted on another device while this one was closed: tidy up what's left here
  const deleted = (await store.loadLists()).filter((d) => d.deletedAt);
  for (const d of deleted) if (await store.loadLink(d.id)) await forgetList(d.id);

  const sendWaiting = (delay) => [...lists.values()].forEach((list) => { if (list.link && list.outgoing().length) list.sendSoon(delay); });
  window.addEventListener('online', () => {
    publish();
    sendWaiting(1000);
  });
  window.addEventListener('offline', () => publish());
  on('sync', (s) => {
    if (s.scriptOutdated) return;
    [...lists.values()].forEach((list) => {
      if (list.link && [...list.queue.values()].some((i) => i.problem === 'needs-update')) list.sendSoon(800);
    });
  });
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore') reconcile(); }); // lists changed on another device, or a backup was restored
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkNewDay();
    sendWaiting(800);
  });
  checkNewDay();
}

/** A list's logsheet link on this device ({ url, spreadsheetId, tab, title, test, roundsHere }), or null. */
export const wardLinkInfo = (id) => lists.get(id)?.link ?? null;
