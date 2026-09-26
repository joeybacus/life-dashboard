/* Date helpers. Dates for tasks are stored as local "YYYY-MM-DD" keys and times
   as "HH:MM"; moments in time (timestamps) are stored as ISO strings in UTC. */

const pad = (n) => String(n).padStart(2, '0');

export const nowISO = () => new Date().toISOString();

export function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local Date for a "YYYY-MM-DD" key at "HH:MM". */
export function atTime(dateKey, hhmm) {
  const d = fromDateKey(dateKey);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Whole calendar days from a to b (negative when b is earlier). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
}

/** 0 = Sunday … 6 = Saturday, following the device's region settings. */
export function firstDayOfWeek() {
  try {
    const locale = new Intl.Locale(navigator.language || 'en-US');
    const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
    if (info && info.firstDay) return info.firstDay % 7;
  } catch { /* older browsers */ }
  return 1;
}

export function startOfWeek(d) {
  const day = startOfDay(d);
  const diff = (day.getDay() - firstDayOfWeek() + 7) % 7;
  return addDays(day, -diff);
}

const fmt = (options) => new Intl.DateTimeFormat(undefined, options);
const F = {
  long: fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  time: fmt({ hour: 'numeric', minute: '2-digit' }),
  weekday: fmt({ weekday: 'long' }),
  weekdayShort: fmt({ weekday: 'short' }),
  weekdayNarrow: fmt({ weekday: 'narrow' }),
  monthDay: fmt({ month: 'short', day: 'numeric' }),
  shortDate: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  stamp: fmt({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  dateTime: fmt({ year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
};

export const formatLongDate = (d) => F.long.format(d);
export const formatShortDate = (d) => F.shortDate.format(d);
export const formatTime = (d) => F.time.format(d);
export const formatWeekdayShort = (d) => F.weekdayShort.format(d);
export const formatWeekdayNarrow = (d) => F.weekdayNarrow.format(d);
export const formatStamp = (d) => F.stamp.format(d);
export const formatDateTime = (d) => F.dateTime.format(d);

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "on Sep 12" */
export function formatAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${F.monthDay.format(new Date(t))}`;
}

export function formatTimeRange(a, b) {
  try { return F.time.formatRange(a, b); } catch { return `${F.time.format(a)} – ${F.time.format(b)}`; }
}

/** "Today", "Yesterday", "Tomorrow", a weekday within a week, else "Sep 12". */
export function formatRelativeDay(d, now = new Date()) {
  const diff = daysBetween(now, d);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (Math.abs(diff) < 7) return F.weekday.format(d);
  return F.monthDay.format(d);
}

export function formatDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "in 25 min", "in 3h 30m", "in 2 days" */
export function formatCountdown(ms) {
  const mins = Math.ceil(ms / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`;
  const days = Math.round(h / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Stopwatch style: "4:05" or "1:02:09" */
export function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Time of a task: "8:00 PM", or null when it has no time. */
export function taskTimeLabel(task) {
  if (!task.startTime || !task.date) return null;
  return formatTime(atTime(task.date, task.startTime));
}
