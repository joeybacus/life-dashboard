/* Google Calendar events (sync script 16), for the Calendar page and the
   dashboard. The script reads them live from your Google account; this file
   asks for one Manila month at a time and keeps each month on this device
   (store calendarCache — never synced or backed up) so the calendar opens
   instantly and works offline. A month is asked for again after FRESH_MS.

   Event (as the app uses it): { id, gid, cal, title, allDay, start: Date,
   end: Date, date, endDate (all-day: Manila days, end not included),
   location, description, color, url, task } */
import { db, tx } from '../core/db.js';
import { emit } from '../core/events.js';
import { state } from '../core/state.js';
import { addDays, at, todayKey } from '../core/manila.js';
import { callSyncScript, syncScriptVersion, syncSnapshot } from './sync.js';

export const GCAL_SCRIPT_VERSION = 16;
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

const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));

/** Can the app read Google Calendar now (sync connected, script 16 or later)? */
export const gcalAvailable = () => syncSnapshot().connected && (syncScriptVersion() ?? 0) >= GCAL_SCRIPT_VERSION;

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
      const month = { fetchedAt: saved.fetchedAt, events: saved.events.map(normalize) };
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
      const res = await callSyncScript('calendarEvents', { from: at(monthStart(m)).toISOString(), to: at(monthStart(nextMonth(m))).toISOString() });
      if (!res?.ok) throw Object.assign(new Error(res?.error || 'failed'), { reason: res?.error });
      const fetchedAt = new Date().toISOString();
      const raw = Array.isArray(res.events) ? res.events : [];
      months.set(m, { fetchedAt, events: raw.map(normalize) });
      if (Array.isArray(res.calendars)) {
        calendars = res.calendars.map((c) => ({
          id: String(c.id), name: String(c.name || 'Calendar'), color: isHex(c.color) ? c.color : '',
          primary: Boolean(c.primary), owned: c.owned !== false, shown: c.shown !== false, tasks: Boolean(c.tasks),
        }));
        await db.put('calendarCache', { key: 'calendars', calendars });
      }
      await db.put('calendarCache', { key: m, fetchedAt, events: raw });
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
    const old = !month || Date.now() - Date.parse(month.fetchedAt) > FRESH_MS;
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

