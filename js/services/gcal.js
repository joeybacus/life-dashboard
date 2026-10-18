/* Google Calendar events (sync script 16), for the Calendar page and the
   dashboard; adding, changing and deleting them (script 17); and Apple
   Calendar public links, read by the script too (17, read only). The script reads them live from your Google account; this file
   asks for one Manila month at a time and keeps each month on this device
   (store calendarCache — never synced or backed up) so the calendar opens
   instantly and works offline. A month is asked for again after FRESH_MS.

   Event (as the app uses it): { id, gid, cal, title, allDay, start: Date,
   end: Date, date, endDate (all-day: Manila days, end not included),
   location, description, color, url, task, recurring, alerts } */
import { db, tx } from '../core/db.js';
import { emit } from '../core/events.js';
import { state } from '../core/state.js';
import { addDays, at, todayKey } from '../core/manila.js';
import { callSyncScript, syncScriptVersion, syncSnapshot } from './sync.js';

export const GCAL_SCRIPT_VERSION = 16;
export const GCAL_EDIT_VERSION = 17; // adding and changing events, Apple Calendar
const FRESH_MS = 5 * 60e3;
const RETRY_MS = 60e3;   // after a failure, wait this long before asking again

// Google Calendar's own event colours (an event's colour is a number 1–11)
const EVENT_COLORS = {
  1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e',
  7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000',
};
export const CAL_SWATCHES = ['#4285f4', '#039be5', '#33b679', '#0b8043', '#f6bf26', '#f4511e', '#d50000', '#e67c73', '#8e24aa', '#7986cb', '#616161'];

const months = new Map();   // "YYYY-MM" → { fetchedAt, events }
const inflight = new Map();
let calendars = null;       // [{ id, name, color, primary, owned, shown, tasks }]
let lastError = null;       // 'calendar-needs-auth' | 'failed' | null
let failedAt = 0;
let loadedCals = false;
let appleErrors = {};       // 'apple:<id>' → 'apple-bad-link' | 'apple-not-public' | 'apple-needs-auth' | 'apple-failed'

const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));

/** Can the app read Google Calendar now (sync connected, script 16 or later)? */
export const gcalAvailable = () => syncSnapshot().connected && (syncScriptVersion() ?? 0) >= GCAL_SCRIPT_VERSION;

/** Can events be added and changed from the app here (script 17 or later)? */
export const gcalCanEdit = () => gcalAvailable() && (syncScriptVersion() ?? 0) >= GCAL_EDIT_VERSION;

/** Your Apple Calendar links (Calendars → Apple Calendar). */
export const appleLinks = () => (Array.isArray(state.settings.calendar?.apple) ? state.settings.calendar.apple : [])
  .filter((l) => l && l.id && l.url).slice(0, 6);
/** The months kept here were read with these Apple links: a change reads them again. */
const appleSig = () => appleLinks().map((l) => `${l.id}=${l.url}`).join('|');
/** What went wrong reading an Apple link, by calendar id ('apple:<id>'). */
export const gcalAppleErrors = () => appleErrors;

/** Why there are no Google events: 'not-connected' | 'outdated' | 'needs-auth' | 'failed' | null. */
export function gcalProblem() {
  if (!syncSnapshot().connected) return 'not-connected';
  if ((syncScriptVersion() ?? 0) < GCAL_SCRIPT_VERSION) return 'outdated';
  if (lastError === 'calendar-needs-auth') return 'needs-auth';
  return lastError ? 'failed' : null;
}

/** Your Google calendars (from the last answer), or []. */
export const gcalCalendars = () => calendars ?? [];

/** Is a calendar shown? Until you choose, the ones ticked in Google Calendar itself. */
export function calendarShown(cal) {
  const hidden = state.settings.calendar?.hidden;
  return Array.isArray(hidden) ? !hidden.includes(cal.id) : cal.shown !== false;
}

/** A calendar's colour: yours, else Google's. */
export function calendarColor(cal) {
  const own = state.settings.calendar?.colors?.[cal?.id];
  return isHex(own) ? own : isHex(cal?.color) ? cal.color : '#4285f4';
}

/** When the months on screen were last brought up to date (the oldest of them), or null. */
export function gcalUpdatedAt(fromKey, toKey) {
  const times = monthsBetween(fromKey, toKey).map((m) => months.get(m)?.fetchedAt).filter(Boolean);
  return times.length ? times.sort()[0] : null;
}

function monthsBetween(fromKey, toKey) {
  const out = [];
  let m = fromKey.slice(0, 7);
  const last = addDays(toKey, -1).slice(0, 7);
  while (m <= last && out.length < 24) {
    out.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  return out;
}

const monthStart = (m) => `${m}-01`;
function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

function normalize(e) {
  const allDay = Boolean(e.allDay);
  const date = allDay && /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') ? e.date : null;
  const endDate = allDay ? (/^\d{4}-\d{2}-\d{2}$/.test(e.endDate ?? '') && e.endDate > date ? e.endDate : date && addDays(date, 1)) : null;
  const start = allDay && date ? at(date) : new Date(e.start);
  const end = allDay && endDate ? at(endDate) : new Date(e.end);
  return {
    id: `${e.cal}|${e.id}|${e.start}`,
    gid: String(e.id ?? ''),
    cal: String(e.cal ?? ''),
    title: String(e.title ?? '').trim() || '(No title)',
    allDay: allDay && Boolean(date),
    start,
    end: end > start ? end : new Date(start.getTime() + 30 * 60e3),
    date,
    endDate,
    location: String(e.location ?? ''),
    description: String(e.description ?? ''),
    eventColor: EVENT_COLORS[e.color] ?? null,
    url: /^https:\/\/calendar\.google\.com\//.test(e.url ?? '') ? e.url : null,
    task: String(e.task ?? ''),
    recurring: Boolean(e.recurring),
    alerts: Array.isArray(e.alerts) ? e.alerts.filter(Number.isFinite) : null,
  };
}

async function loadCalendarsOnce() {
  if (loadedCals) return;
  loadedCals = true;
  try {
    const saved = await db.get('calendarCache', 'calendars');
    if (!calendars && Array.isArray(saved?.calendars)) calendars = saved.calendars;
  } catch { /* first time */ }
}

async function cachedMonth(m) {
  if (months.has(m)) return months.get(m);
  try {
    const saved = await db.get('calendarCache', m);
    if (saved && Array.isArray(saved.events)) {
      const month = { fetchedAt: saved.fetchedAt, sig: saved.sig ?? '', raw: saved.events, events: saved.events.map(normalize) };
      months.set(m, month);
      return month;
    }
  } catch { /* not saved yet */ }
  return null;
}

function fetchMonth(m) {
  if (inflight.has(m)) return inflight.get(m);
  const run = (async () => {
    try {
      const sig = appleSig();
      const apple = (syncScriptVersion() ?? 0) >= GCAL_EDIT_VERSION ? appleLinks().map(({ id, url, name }) => ({ id, url, name })) : [];
      const res = await callSyncScript('calendarEvents', { from: at(monthStart(m)).toISOString(), to: at(monthStart(nextMonth(m))).toISOString(), apple });
      if (!res?.ok) throw Object.assign(new Error(res?.error || 'failed'), { reason: res?.error });
      const fetchedAt = new Date().toISOString();
      const raw = Array.isArray(res.events) ? res.events : [];
      months.set(m, { fetchedAt, sig, raw, events: raw.map(normalize) });
      if (res.appleErrors && typeof res.appleErrors === 'object') appleErrors = res.appleErrors;
      if (Array.isArray(res.calendars)) {
        calendars = res.calendars.map((c) => ({
          id: String(c.id), name: String(c.name || 'Calendar'), color: isHex(c.color) ? c.color : '',
          primary: Boolean(c.primary), owned: c.owned !== false, shown: c.shown !== false, tasks: Boolean(c.tasks),
          readOnly: c.readOnly === undefined ? c.owned === false : Boolean(c.readOnly), apple: Boolean(c.apple),
        }));
        await db.put('calendarCache', { key: 'calendars', calendars });
      }
      await db.put('calendarCache', { key: m, fetchedAt, sig, events: raw });
      lastError = null;
    } catch (err) {
      lastError = err.reason === 'calendar-needs-auth' ? 'calendar-needs-auth' : 'failed';
      failedAt = Date.now();
    } finally {
      inflight.delete(m);
      emit('calendar');
    }
  })();
  inflight.set(m, run);
  return run;
}

/**
 * Google events between two Manila days (to not included), from the calendars
 * you show. wait: false answers at once from what's kept here and brings the
 * months up to date in the background (an 'calendar' event says when).
 */
export async function gcalEvents(fromKey, toKey, { wait = false, force = false, all = false } = {}) {
  if (!syncSnapshot().connected) return []; // disconnected: what's kept here isn't shown
  await loadCalendarsOnce();
  const list = monthsBetween(fromKey, toKey);
  const stale = [];
  for (const m of list) {
    const month = await cachedMonth(m);
    const old = !month || Date.now() - Date.parse(month.fetchedAt) > FRESH_MS || (month.sig ?? '') !== appleSig();
    if ((force || old) && gcalAvailable() && navigator.onLine !== false && (force || Date.now() - failedAt > RETRY_MS)) stale.push(m);
  }
  const fetching = stale.map(fetchMonth);
  if (wait) await Promise.all(fetching);
  const from = at(fromKey);
  const to = at(toKey);
  const seen = new Set();
  const byId = new Map(gcalCalendars().map((c) => [c.id, c]));
  const out = [];
  for (const m of list) {
    for (const e of months.get(m)?.events ?? []) {
      if (seen.has(e.id) || e.end <= from || e.start >= to) continue;
      seen.add(e.id);
      const cal = byId.get(e.cal) ?? { id: e.cal, name: 'Calendar', shown: true };
      if (!all && !calendarShown(cal)) continue;
      out.push({ ...e, calendar: cal.name, color: e.eventColor ?? calendarColor(cal) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Forget every kept event (when sync is disconnected). */
export async function clearGcal() {
  months.clear();
  calendars = null;
  try { await tx('calendarCache', 'readwrite', (s) => { s.clear(); }); } catch { /* nothing kept */ }
  emit('calendar');
}

/** Dashboard provider: today's and the coming week's events, from what's kept (fetched in the background). */
export const googleProvider = {
  id: 'google',
  label: 'Google Calendar',
  connected: true,
  async getEvents(from, to) {
    const fromKey = todayKey(from.getTime());
    const toKey = addDays(todayKey(to.getTime() - 1), 1);
    const events = await gcalEvents(fromKey, toKey);
    return events.filter((e) => !e.task && e.end > from && e.start < to)
      .map((e) => ({ ...e, sample: false }));
  },
};


/* ---------- Adding, changing and deleting events (sync script 17) ---------- */

/** Plain words for why an event couldn't be saved or deleted. */
export const EDIT_REASONS = {
  'calendar-read-only': 'That calendar can’t be changed from here (you subscribe to it). Choose one of your own.',
  'calendar-missing': 'That calendar can’t be found any more. Choose another one.',
  'calendar-needs-auth': 'The sync script needs permission for Google Calendar: in Apps Script choose setup, click Run and allow access.',
  'event-missing': 'This event is no longer in Google Calendar.',
  'event-gone': 'This event was already deleted in Google Calendar.',
  'event-recurring': 'Repeating events are changed in Google Calendar itself.',
  'event-is-task': 'This is one of your to-dos: change the to-do instead.',
  'event-no-title': 'Give the event a name.',
  'event-bad-time': 'Check the start and end — the end has to be after the start.',
  offline: 'You’re offline. Saving an event needs the internet.',
  failed: 'Google Calendar didn’t answer. Please try again.',
};

/** Your calendars that new events can go into (your own; not subscribed or Apple ones). */
export function writableCalendars() {
  return gcalCalendars().filter((c) => c.owned && !c.readOnly && !c.apple);
}

/** Where a new event goes: the one you chose last, else your main calendar. */
export function defaultEventCalendar() {
  const list = writableCalendars();
  const chosen = list.find((c) => c.id === state.settings.calendar?.newEventCal);
  return chosen ?? list.find((c) => c.primary) ?? list.find((c) => !c.tasks) ?? list[0] ?? null;
}

/** Can this event be changed from the app? { ok, reason } */
export function editableEvent(e) {
  if (!e || e.sample) return { ok: false, reason: '' };
  if (!gcalCanEdit()) return { ok: false, reason: 'update' };
  const cal = gcalCalendars().find((c) => c.id === e.cal);
  if (cal?.apple) return { ok: false, reason: 'apple' };
  if (!cal || !cal.owned || cal.readOnly) return { ok: false, reason: 'calendar-read-only' };
  if (e.task) return { ok: false, reason: 'event-is-task' };
  if (e.recurring) return { ok: false, reason: 'event-recurring' };
  return { ok: true, reason: '' };
}

/** Take an event out of what's kept here (every month it was on). */
async function forget(cal, gid) {
  for (const [m, month] of months) {
    const keep = (month.raw ?? []).filter((r) => !(String(r.cal) === cal && String(r.id) === gid));
    if (keep.length === (month.raw ?? []).length) continue;
    months.set(m, { ...month, raw: keep, events: keep.map(normalize) });
    await db.put('calendarCache', { key: m, fetchedAt: month.fetchedAt, sig: month.sig ?? '', events: keep });
  }
}

/** Put a saved event into what's kept here, so it shows straight away. */
async function remember(raw) {
  const e = normalize(raw);
  const first = todayKey(e.start.getTime()).slice(0, 7);
  const last = todayKey(Math.max(e.start.getTime(), e.end.getTime() - 1)).slice(0, 7);
  for (const m of monthsBetween(`${first}-01`, addDays(`${last}-01`, 1))) {
    const month = await cachedMonth(m);
    if (!month) continue; // not kept yet: read when it's shown
    const kept = [...(month.raw ?? []), raw];
    months.set(m, { ...month, raw: kept, events: kept.map(normalize) });
    await db.put('calendarCache', { key: m, fetchedAt: month.fetchedAt, sig: month.sig ?? '', events: kept });
  }
}

/**
 * Add an event (no id) or change one. input: { id?, fromCal?, cal, title, allDay,
 * date, endDate (all-day; last day not included), start, end (Dates; timed),
 * location, description, alerts: [minutes] | null }. → { ok, event } | { ok: false, reason }
 */
export async function gcalSaveEvent(input) {
  if (navigator.onLine === false) return { ok: false, reason: 'offline' };
  const event = {
    ...input,
    start: input.allDay ? undefined : input.start.toISOString(),
    end: input.allDay ? undefined : input.end.toISOString(),
  };
  let res;
  try {
    res = await callSyncScript('calendarEventSave', { event });
  } catch (err) {
    return { ok: false, reason: EDIT_REASONS[err?.reason] ? err.reason : navigator.onLine === false ? 'offline' : 'failed' };
  }
  if (!res?.event) return { ok: false, reason: 'failed' };
  await loadCalendarsOnce();
  if (input.id) await forget(String(input.fromCal || input.cal), String(input.id));
  await remember(res.event);
  emit('calendar');
  return { ok: true, event: { ...normalize(res.event), calendar: gcalCalendars().find((c) => c.id === res.event.cal)?.name ?? 'Calendar' } };
}

/** Delete an event of yours. → { ok } | { ok: false, reason } */
export async function gcalDeleteEvent(e) {
  if (navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    await callSyncScript('calendarEventDelete', { cal: e.cal, id: e.gid });
  } catch (err) {
    if (err?.reason !== 'event-gone') return { ok: false, reason: EDIT_REASONS[err?.reason] ? err.reason : navigator.onLine === false ? 'offline' : 'failed' };
  }
  await forget(e.cal, e.gid);
  emit('calendar');
  return { ok: true };
}

/** Read the months kept here again (after you change your Apple links). */
export async function gcalReloadKept() {
  for (const [m, month] of months) months.set(m, { ...month, fetchedAt: new Date(0).toISOString() });
  failedAt = 0;
  emit('calendar');
}
