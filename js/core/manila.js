/* Dates and times in Manila (Asia/Manila, UTC+8 all year — no daylight saving).
   Tasks (and later habits and focus totals) live on Manila time: a day rolls over
   at midnight Manila time, even on a device set to another time zone.

   A day is a "YYYY-MM-DD" key and a time of day is "HH:MM". Moments are ISO
   timestamps (UTC), as everywhere else in the app. */

export const MANILA = 'Asia/Manila';
const OFFSET_MS = 8 * 3600e3;
const DAY_MS = 864e5;

/** Today's (or a moment's) Manila day: "2026-09-27". */
export function todayKey(ms = Date.now()) {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** The Manila time of day of a moment: "08:15". */
export function clockOf(ms = Date.now()) {
  return new Date(ms + OFFSET_MS).toISOString().slice(11, 16);
}

/** A day plus or minus n days. */
export function addDays(key, n) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one key to another (negative when `to` is earlier). */
export function daysFrom(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** The moment a Manila day and time happen, e.g. at("2026-09-27", "20:00"). */
export function at(key, hhmm = '00:00') {
  return new Date(Date.parse(`${key}T${hhmm}:00Z`) - OFFSET_MS);
}

/** Milliseconds until the next Manila midnight. */
export function msUntilMidnight(ms = Date.now()) {
  const local = ms + OFFSET_MS;
  return Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - local;
}

export const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const isClock = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''));

/** "2026-09-27 08:15" (Manila) — for CSV files and the Sheet. */
export function sheetTime(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? new Date(t + OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') : '';
}

const fmt = (options) => new Intl.DateTimeFormat(undefined, { timeZone: MANILA, ...options });
const F = {
  time: fmt({ hour: 'numeric', minute: '2-digit' }),
  weekday: fmt({ weekday: 'long' }),
  monthDay: fmt({ month: 'short', day: 'numeric' }),
  day: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  dayLong: fmt({ weekday: 'long', month: 'long', day: 'numeric' }),
  dayYear: fmt({ month: 'short', day: 'numeric', year: 'numeric' }),
  stamp: fmt({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
};
const noonOf = (key) => new Date(`${key}T12:00:00+08:00`);

/** "8:00 PM" for "20:00". */
export const formatClock = (hhmm) => F.time.format(new Date(`2000-01-01T${hhmm}:00+08:00`));
/** "8:00 – 9:00 PM" for a start and optional end. */
export function formatClockRange(start, end) {
  if (!end) return formatClock(start);
  const a = new Date(`2000-01-01T${start}:00+08:00`);
  const b = new Date(`2000-01-01T${end}:00+08:00`);
  try { return F.time.formatRange(a, b); } catch { return `${F.time.format(a)} – ${F.time.format(b)}`; }
}
/** "8:15 PM" for a moment. */
export const formatMoment = (iso) => F.time.format(new Date(iso));
/** "8:15 PM" today, otherwise "Sep 26, 8:15 PM". */
export const formatStamp = (iso, now = Date.now()) =>
  (todayKey(Date.parse(iso)) === todayKey(now) ? F.time : F.stamp).format(new Date(iso));
/** "Sat, Sep 27". */
export const formatDay = (key) => F.day.format(noonOf(key));
/** "Sep 27". */
export const formatMonthDay = (key) => F.monthDay.format(noonOf(key));
/** "Saturday, September 27". */
export const formatDayLong = (key) => F.dayLong.format(noonOf(key));
/** "Sep 27, 2026". */
export const formatDayYear = (key) => F.dayYear.format(noonOf(key));

/** "Today", "Tomorrow", "Yesterday", a weekday within a week, else "Sep 27". */
export function relativeDay(key, today = todayKey()) {
  const diff = daysFrom(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return F.weekday.format(noonOf(key));
  if (key.slice(0, 4) !== today.slice(0, 4)) return F.dayYear.format(noonOf(key));
  return F.monthDay.format(noonOf(key));
}

