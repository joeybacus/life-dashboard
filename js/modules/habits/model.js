/* Habits — plain rules, no database: which habits are due on a day, streaks,
   the week's count, the 7-day strip and a month grid. Days are Manila
   "YYYY-MM-DD" keys; weeks start on Monday.

   Habit:  { id, name, group, schedule, active, order, createdAt, updatedAt, deletedAt }
     schedule: { kind: 'daily' } | { kind: 'days', days: [0–6, 0 = Sunday] } | { kind: 'perWeek', times: 1–7 }
   Log:    { id: "<habit id>:<date>", habitId, date, done, createdAt, updatedAt, deletedAt } */
import { addDays, daysFrom, todayKey, weekdayOf } from '../../core/manila.js';

export const GROUPS = ['Morning', 'Work', 'Evening'];
export const MAX_NAME = 60;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A schedule that makes sense (anything odd counts as every day). */
export function cleanSchedule(s) {
  if (s?.kind === 'days') {
    const days = [...new Set((s.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    return days.length && days.length < 7 ? { kind: 'days', days } : { kind: 'daily' };
  }
  if (s?.kind === 'perWeek') return { kind: 'perWeek', times: Math.min(7, Math.max(1, Math.round(Number(s.times) || 1))) };
  return { kind: 'daily' };
}

/** "Every day", "Mon, Wed, Fri", "3 times a week" */
export function scheduleText(s) {
  const c = cleanSchedule(s);
  if (c.kind === 'days') {
    if (c.days.join() === '1,2,3,4,5') return 'Weekdays';
    if (c.days.join() === '0,6') return 'Weekends';
    return c.days.map((d) => WEEKDAY_SHORT[d]).join(', ');
  }
  if (c.kind === 'perWeek') return c.times === 1 ? 'Once a week' : `${c.times} times a week`;
  return 'Every day';
}

/** Monday of a day's week. */
export const weekStart = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));

/** Is the habit on the schedule that day (for "N times a week": any day). */
export const scheduledOn = (habit, key) => {
  const s = cleanSchedule(habit.schedule);
  return s.kind === 'days' ? s.days.includes(weekdayOf(key)) : true;
};

/** Times done in a day's week. */
export function weekCount(habit, done, key) {
  const monday = weekStart(key);
  let n = 0;
  for (let i = 0; i < 7; i++) if (done.has(addDays(monday, i))) n += 1;
  return n;
}

/**
 * Due today? Daily: yes. Chosen days: on those days. N times a week: until the
 * week's count is reached (a day already ticked stays in the list).
 */
export function dueOn(habit, done, key) {
  if (habit.active === false || habit.deletedAt) return false;
  const s = cleanSchedule(habit.schedule);
  if (s.kind === 'perWeek') return done.has(key) || weekCount(habit, done, key) < s.times;
  return scheduledOn(habit, key);
}

/** The first day that counts for a habit: when it was made. */
const startOf = (habit) => (habit.createdAt ? todayKey(Date.parse(habit.createdAt)) : null);

/**
 * Streaks. Daily and chosen days: scheduled days in a row that are done (today
 * doesn't break it until it's over). N times a week: weeks in a row that
 * reached the count (this week counts once it's reached).
 * Returns { current, best, unit: 'day' | 'week' }.
 */
export function streaks(habit, done, today = todayKey()) {
  const s = cleanSchedule(habit.schedule);
  const earliest = [...done].sort()[0];
  const first = [startOf(habit), earliest].filter(Boolean).sort()[0] ?? today;
  if (s.kind === 'perWeek') {
    const weeks = [];
    for (let w = weekStart(first); w <= today; w = addDays(w, 7)) weeks.push(w);
    const met = weeks.map((w) => weekCount(habit, done, w) >= s.times);
    let best = 0;
    let run = 0;
    met.forEach((m) => { run = m ? run + 1 : 0; best = Math.max(best, run); });
    let current = 0;
    let i = met.length - 1;
    if (i >= 0 && !met[i]) i -= 1; // this week isn't over yet
    for (; i >= 0 && met[i]; i--) current += 1;
    return { current, best, unit: 'week' };
  }
  let best = 0;
  let run = 0;
  const span = Math.min(3660, daysFrom(first, today));
  for (let i = span; i >= 0; i--) {
    const key = addDays(today, -i);
    if (!scheduledOn(habit, key)) continue;
    if (done.has(key)) run += 1;
    else if (key !== today) run = 0;
    best = Math.max(best, run);
  }
  let current = 0;
  for (let i = 0; i <= span; i++) {
    const key = addDays(today, -i);
    if (!scheduledOn(habit, key)) continue;
    if (done.has(key)) current += 1;
    else if (key !== today) break;
  }
  return { current, best: Math.max(best, current), unit: 'day' };
}

/** "5 days", "2 weeks" */
export const streakText = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * The last 7 days, oldest first: { key, state } where state is 'done',
 * 'missed' (on the schedule, not done, over), 'today' (not done yet), or 'off'.
 */
export function lastSeven(habit, done, today = todayKey()) {
  const start = startOf(habit);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today, i - 6);
    let state = 'off';
    if (done.has(key)) state = 'done';
    else if (key === today) state = dueOn(habit, done, key) ? 'today' : 'off';
    else if (start && key < start) state = 'off';
    else if (cleanSchedule(habit.schedule).kind === 'perWeek') state = 'off';
    else if (scheduledOn(habit, key)) state = 'missed';
    return { key, state };
  });
}

/** A month's days for a grid, Monday first: [{ key | null }] (null: blanks before the 1st). */
export function monthGrid(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lead = (weekdayOf(first) + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
}

/** Groups in order: Morning, Work, Evening, then your own (A to Z). */
export function groupOrder(habits) {
  const own = [...new Set(habits.map((h) => h.group).filter((g) => g && !GROUPS.includes(g)))].sort((a, b) => a.localeCompare(b));
  return [...GROUPS, ...own].filter((g) => habits.some((h) => (h.group || 'Morning') === g));
}
