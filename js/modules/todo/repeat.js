/* Repeating tasks — the rules, with no database (so they can be checked in
   tools/todo-checks.html).

   A repeating task keeps its rule in `recurrence`, in the shape the sync
   script shows in the Sheet's Repeats column:
     { kind: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'afterDone',
       interval: 1…  (every N days / weeks / months; afterDone: N days after it's done),
       days: [0–6]   (weekly: which days, 0 = Sunday),
       monthDay: 1–31, or week: 1–5 / -1 (last) with weekday: 0–6  (monthly),
       until: 'YYYY-MM-DD' (ends after that day) or count: N (ends after N times) }

   Only the next occurrence exists. Ticking one (or skipping it) makes the next,
   with an id made from the series and its date — `<seriesId>~<date>` — so the
   same task ticked on two devices, even offline, makes one next task, not two.
   Each occurrence knows its series (seriesId) and its number in it
   (seriesIndex, from 1). An overdue one that's ticked jumps ahead: the next is
   the first date from today on, never a pile of missed ones. A monthly task on
   the 31st falls on the last day of shorter months.

   The next occurrence copies this one — its title, time, priority, reminders
   and the rest (its subtasks too, unticked) — except when you changed this
   one only ("This task only"): then `seriesBase` holds how the series was, and
   the next one is made from that. */
import { firstDayOfWeek } from '../../core/dates.js';
import { addDays, daysFrom, formatDayYear, formatMonthDay, isDateKey, todayKey, weekdayOf } from '../../core/manila.js';

export const REPEAT_KINDS = ['daily', 'weekdays', 'weekly', 'monthly', 'afterDone'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ORDINAL_WORDS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };
const MAX_INTERVAL = 365;
const MAX_COUNT = 999;

/** What a repeating task passes on to the next one (not its date, done state, pin or alerts). */
export const TEMPLATE_FIELDS = ['title', 'notes', 'priority', 'categoryId', 'tags', 'startTime', 'endTime', 'reminders', 'followUp', 'addToCalendar', 'links', 'manualOrder'];

export const templateOf = (task) => Object.fromEntries(TEMPLATE_FIELDS.map((k) => [k, structuredClone(task[k] ?? null)]));
/** Did anything the next occurrence would copy change? (Reminder ids and times set don't count.) */
export function templateChanged(a, b) {
  const plain = (t) => JSON.stringify({ ...t, manualOrder: null, reminders: (t.reminders ?? []).map(({ kind, minutes, at }) => ({ kind, minutes: minutes ?? null, at: at ?? null })) });
  return plain(a) !== plain(b);
}

const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** A rule made safe to save, or null for "doesn't repeat". */
export function cleanRule(rule) {
  if (!rule || typeof rule !== 'object' || !REPEAT_KINDS.includes(rule.kind)) return null;
  const out = { kind: rule.kind, interval: int(rule.interval, 1, MAX_INTERVAL) ?? 1 };
  if (rule.kind === 'weekdays') out.interval = 1;
  if (rule.kind === 'weekly') {
    const days = [...new Set((Array.isArray(rule.days) ? rule.days : []).map((d) => int(d, 0, 6)).filter((d) => d != null))].sort();
    if (days.length) out.days = days;
  }
  if (rule.kind === 'monthly') {
    const week = int(rule.week, -1, 5);
    const weekday = int(rule.weekday, 0, 6);
    if (week && weekday != null) Object.assign(out, { week, weekday });
    else {
      const monthDay = int(rule.monthDay, 1, 31);
      if (monthDay) out.monthDay = monthDay;
    }
  }
  if (isDateKey(rule.until)) out.until = rule.until;
  else {
    const count = int(rule.count, 1, MAX_COUNT);
    if (count) out.count = count;
  }
  return out;
}

/* ---------- Dates ---------- */

const pad = (n) => String(n).padStart(2, '0');
const parts = (key) => key.split('-').map(Number);
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1–12

/** The rule's day in a month ("day 31" → the last day of shorter months), or null if there's none (a fifth Monday). */
function monthlyDay(y, m, rule, fallback) {
  const last = lastDayOf(y, m);
  if (rule.week) {
    const weekday = rule.weekday;
    if (rule.week === -1) {
      const lastKey = `${y}-${pad(m)}-${pad(last)}`;
      return addDays(lastKey, -((weekdayOf(lastKey) - weekday + 7) % 7));
    }
    const firstKey = `${y}-${pad(m)}-01`;
    const day = 1 + ((weekday - weekdayOf(firstKey) + 7) % 7) + (rule.week - 1) * 7;
    return day <= last ? `${y}-${pad(m)}-${pad(day)}` : null;
  }
  const want = rule.monthDay ?? fallback;
  return `${y}-${pad(m)}-${pad(Math.min(want, last))}`;
}

const weekStartOf = (key, weekStart) => addDays(key, -((weekdayOf(key) - weekStart + 7) % 7));

/** The next day on the rule's schedule strictly after `from` (afterDone isn't a schedule). */
function step(rule, from, weekStart) {
  const n = rule.interval ?? 1;
  if (rule.kind === 'daily') return addDays(from, n);
  if (rule.kind === 'weekdays') {
    let d = addDays(from, 1);
    while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, 1);
    return d;
  }
  if (rule.kind === 'weekly') {
    const days = rule.days?.length ? rule.days : [weekdayOf(from)];
    const start = weekStartOf(from, weekStart);
    // Later this week…
    for (let i = 1; i < 7; i++) {
      const d = addDays(from, i);
      if (weekStartOf(d, weekStart) !== start) break;
      if (days.includes(weekdayOf(d))) return d;
    }
    // …or the first chosen day of the week N weeks on
    const next = addDays(start, 7 * n);
    for (let i = 0; i < 7; i++) {
      const d = addDays(next, i);
      if (days.includes(weekdayOf(d))) return d;
    }
    return null;
  }
  if (rule.kind === 'monthly') {
    const [y, m, day] = parts(from);
    const fallback = rule.monthDay ?? day;
    const r = rule.week ? { ...rule, weekday: rule.weekday ?? weekdayOf(from) } : rule;
    for (let k = 1; k <= 120; k++) {
      const total = m - 1 + k * n;
      const d = monthlyDay(y + Math.floor(total / 12), (total % 12) + 1, r, fallback);
      if (d && d > from) return d;
    }
    return null;
  }
  return null;
}

/**
 * The next occurrence's date after one on `from`, or null when the series has
 * ended (its until day passed). doneOn: the Manila day it was ticked (for
 * "N days after it's done"). A date before today jumps ahead to the first on
 * the schedule from today on.
 */
export function nextDate(rule, from, { today = todayKey(), doneOn = today, weekStart = firstDayOfWeek() } = {}) {
  const r = cleanRule(rule);
  if (!r) return null;
  let d;
  if (r.kind === 'afterDone') d = addDays(doneOn, r.interval);
  else {
    d = step(r, isDateKey(from) ? from : today, weekStart);
    for (let guard = 0; d && d < today && guard < 5000; guard++) d = step(r, d, weekStart);
  }
  if (!d || (r.until && d > r.until)) return null;
  return d;
}

/** Is `key` on the rule's schedule? */
export function onSchedule(rule, key) {
  const r = cleanRule(rule);
  if (!r) return false;
  const dow = weekdayOf(key);
  if (r.kind === 'weekdays') return dow >= 1 && dow <= 5;
  if (r.kind === 'weekly') return !r.days?.length || r.days.includes(dow);
  if (r.kind === 'monthly') {
    const [y, m] = parts(key);
    return monthlyDay(y, m, r, Number(key.slice(8))) === key;
  }
  return true;
}

/** The first date a new repeating task (with no date yet) falls on: today, or the next day on its schedule. */
export function firstDate(rule, today = todayKey()) {
  const r = cleanRule(rule);
  if (!r || r.kind === 'daily' || r.kind === 'afterDone') return today;
  if (r.kind === 'monthly' && !r.week && !r.monthDay) return today;
  for (let i = 0; i < 400; i++) {
    const d = addDays(today, i);
    if (onSchedule(r, d)) return d;
  }
  return today;
}

/* ---------- Words ---------- */

const dayList = (days) => days.map((d) => DAY_SHORT[d]).join(', ');
const every = (n, one, many) => (n > 1 ? `Every ${n} ${many}` : `Every ${one}`);

/** "Every Monday", "Every 2 weeks on Mon, Thu", "Every month on the last Friday", "3 days after it’s done"… plus how it ends. */
export function describeRule(rule, { today = todayKey() } = {}) {
  const r = cleanRule(rule);
  if (!r) return 'Doesn’t repeat';
  const n = r.interval;
  let text;
  if (r.kind === 'daily') text = every(n, 'day', 'days');
  else if (r.kind === 'weekdays') text = 'Every weekday (Mon–Fri)';
  else if (r.kind === 'weekly') {
    if (r.days?.length === 1 && n === 1) text = `Every ${DAY_NAMES[r.days[0]]}`;
    else if (r.days?.length === 7 && n === 1) text = 'Every day';
    else text = `${every(n, 'week', 'weeks')}${r.days?.length ? ` on ${dayList(r.days)}` : ''}`;
  } else if (r.kind === 'monthly') {
    const on = r.week ? ` on the ${ORDINAL_WORDS[r.week]} ${DAY_NAMES[r.weekday]}` : r.monthDay ? ` on day ${r.monthDay}` : '';
    text = n === 12 ? `Every year${on}` : `${every(n, 'month', 'months')}${on}`;
  } else text = `${n} ${n === 1 ? 'day' : 'days'} after it’s done`;
  if (r.until) text += `, until ${r.until.slice(0, 4) === today.slice(0, 4) ? formatMonthDay(r.until) : formatDayYear(r.until)}`;
  else if (r.count) text += `, ${r.count} ${r.count === 1 ? 'time' : 'times'}`;
  return text;
}

/* ---------- The next occurrence ---------- */

/** The id of a series' occurrence on a date (the same on every device). */
export const occurrenceId = (seriesId, date) => `${seriesId}~${date}`;

/** Has the series ended with this occurrence (its number reached the count)? */
export const lastOfCount = (task) => Boolean(task.recurrence?.count) && (task.seriesIndex ?? 1) >= task.recurrence.count;

/**
 * The occurrence after `task` — done or skipped — or null when the series has
 * ended. Returns { task, subtasks, date }: the new task and copies of its
 * subtasks (unticked; their own dates move by as many days as the task), both
 * with ids that are the same on every device. doneOn: the Manila day it was
 * ticked. The caller saves them.
 */
export function nextOccurrence(task, { subtasks = [], today = todayKey(), doneOn = today, weekStart = firstDayOfWeek() } = {}) {
  const rule = cleanRule(task.recurrence);
  if (!rule || lastOfCount(task)) return null;
  const date = nextDate(rule, task.date, { today, doneOn, weekStart });
  if (!date) return null;
  const seriesId = task.seriesId || task.id;
  const id = occurrenceId(seriesId, date);
  const shift = task.date ? daysFrom(task.date, date) : 0;
  const moveAt = (r) => (r.kind === 'at' && Number.isFinite(Date.parse(r.at)) ? { ...r, at: new Date(Date.parse(r.at) + shift * 864e5).toISOString() } : r);
  const base = task.seriesBase && typeof task.seriesBase === 'object' ? { ...templateOf(task), ...task.seriesBase } : templateOf(task);
  const next = {
    ...base,
    id,
    date,
    allDay: !base.startTime,
    status: 'open',
    completedAt: null,
    pinned: false,
    reminders: (base.reminders ?? []).map((r, i) => moveAt({ ...r, id: `${id}~r${i}` })),
    alerts: {},
    recurrence: rule,
    seriesId,
    seriesIndex: (task.seriesIndex ?? 1) + 1,
    seriesBase: null,
    nextId: null,
    ...(task.sample ? { sample: true } : {}),
  };
  const subs = subtasks.filter((s) => s.taskId === task.id && !s.deletedAt).map((s) => {
    const key = s.seriesKey || s.id;
    const subId = `${id}~${key}`;
    return {
      ...s,
      id: subId,
      taskId: id,
      seriesKey: key,
      done: false,
      completedAt: null,
      date: s.date ? addDays(s.date, shift) : null,
      reminders: (s.reminders ?? []).map((r, i) => moveAt({ ...r, id: `${subId}~r${i}` })),
      alerts: {},
      createdAt: undefined,
      updatedAt: undefined,
      ...(task.sample ? { sample: true } : {}),
    };
  });
  return { task: next, subtasks: subs, date };
}
