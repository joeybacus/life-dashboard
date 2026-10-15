/* What the Calendar page shows between two Manila days (to not included):
   your Google Calendar events (services/gcal.js) and the app's own things —
   dated to-dos and subtasks, workouts, referrals' next rounds, and each day's
   habits — as one kind of item:

   { id, kind: 'event' | 'task' | 'subtask' | 'workout' | 'referral' | 'habits',
     title, sub, allDay, start: Date, end: Date, date, endDate (all-day: Manila
     days, end not included), color, done, ref (what to open), event (Google) }

   A to-do the app put in Google Calendar shows once: as the to-do. */
import { db } from '../../core/db.js';
import { state } from '../../core/state.js';
import { addDays, at, todayKey } from '../../core/manila.js';
import { gcalEvents } from '../../services/gcal.js';
import { loadTodo } from '../todo/store.js';
import { isDone, scheduledSubtasks } from '../todo/model.js';
import { referralPatients } from '../referrals/patients.js';
import { loadHabits } from '../habits/store.js';
import { dueOn } from '../habits/model.js';
import { habitsOn } from '../habits/ui.js';

const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));
const COLORS = { task: 'var(--todo)', workout: 'var(--workout)', referral: 'var(--neuro)', habits: 'var(--todo-2)' };

/** The layers you show (Calendars → The app's own). */
export const layers = () => ({ tasks: true, workouts: true, referrals: true, habits: true, ...(state.settings.calendar?.layers ?? {}) });

function taskItem(t, categories) {
  const sub = t.kind === 'subtask';
  const color = isHex(categories.get(t.categoryId)?.color) ? categories.get(t.categoryId).color : COLORS.task;
  const base = {
    id: `${sub ? 'sub' : 'task'}:${t.id}`,
    kind: sub ? 'subtask' : 'task',
    title: t.title || (sub ? 'Untitled subtask' : 'Untitled task'),
    sub: sub ? t.parentTitle : categories.get(t.categoryId)?.name ?? '',
    color,
    done: isDone(t),
    ref: t.id,
  };
  if (!t.startTime) return { ...base, allDay: true, date: t.date, endDate: addDays(t.date, 1), start: at(t.date), end: at(addDays(t.date, 1)) };
  const start = at(t.date, t.startTime);
  let end = t.endTime ? at(t.endTime > t.startTime ? t.date : addDays(t.date, 1), t.endTime) : new Date(start.getTime() + 30 * 60e3);
  if (end <= start) end = new Date(start.getTime() + 30 * 60e3);
  return { ...base, allDay: false, date: t.date, start, end };
}

/** Everything to show from `fromKey` to `toKey` (not included). Google events come from what's kept, refreshed in the background. */
export async function calendarItems(fromKey, toKey, { force = false } = {}) {
  const show = layers();
  const today = todayKey();
  const out = [];
  const [events, todo] = await Promise.all([gcalEvents(fromKey, toKey, { force }), loadTodo()]);

  // To-dos (and their dated subtasks)
  const ids = new Set([...todo.tasks.map((t) => t.id), ...todo.subtasks.map((s) => s.id)]);
  if (show.tasks) {
    const rows = [...todo.tasks.filter((t) => !t.deletedAt), ...scheduledSubtasks(todo.subtasks, todo.tasks)];
    rows.filter((t) => t.date && t.date >= fromKey && t.date < toKey).forEach((t) => out.push(taskItem(t, todo.categories)));
  }

  // Google events (not the copies of to-dos the app put there; they show as the to-do)
  events.filter((e) => !(e.task && ids.has(e.task) && show.tasks)).forEach((e) => out.push({
    id: `ev:${e.id}`,
    kind: 'event',
    title: e.title,
    sub: e.calendar,
    allDay: e.allDay,
    start: e.start,
    end: e.end,
    date: e.allDay ? e.date : todayKey(e.start.getTime()),
    endDate: e.allDay ? e.endDate : null,
    color: e.color,
    done: false,
    event: e,
  }));

  // Workouts
  if (show.workouts) {
    const from = at(fromKey);
    const to = at(toKey);
    (await db.all('workouts')).filter((w) => !w.deletedAt && w.startedAt).forEach((w) => {
      const start = new Date(w.startedAt);
      const end = w.endedAt ? new Date(w.endedAt) : new Date();
      if (!(start < to && end > from)) return;
      out.push({
        id: `wk:${w.id}`, kind: 'workout', title: w.title || 'Workout', sub: w.endedAt ? 'Workout' : 'Workout · in progress',
        allDay: false, start, end: end > start ? end : new Date(start.getTime() + 30 * 60e3), date: todayKey(start.getTime()),
        color: COLORS.workout, done: false, ref: w.id,
      });
    });
  }

  // Referrals: the day you plan to see each one
  if (show.referrals) {
    referralPatients().filter((p) => p.active && p.next && p.next >= fromKey && p.next < toKey).forEach((p) => out.push({
      id: `ref:${p.id}`, kind: 'referral', title: p.name || 'Referral', sub: p.location || 'Referral', allDay: true,
      date: p.next, endDate: addDays(p.next, 1), start: at(p.next), end: at(addDays(p.next, 1)),
      color: COLORS.referral, done: false, ref: p.id,
    }));
  }

  // Habits: one item a day, "Habits 3/5"
  if (show.habits && habitsOn()) {
    const { habits, done } = await loadHabits();
    for (let d = fromKey; d < toKey; d = addDays(d, 1)) {
      const due = habits.filter((h) => dueOn(h, done(h.id), d));
      if (!due.length) continue;
      const count = due.filter((h) => done(h.id).has(d)).length;
      out.push({
        id: `hab:${d}`, kind: 'habits', title: `Habits ${count}/${due.length}`, sub: d > today ? 'Planned' : count === due.length ? 'All done' : 'Habits',
        allDay: true, date: d, endDate: addDays(d, 1), start: at(d), end: at(addDays(d, 1)),
        color: COLORS.habits, done: false, ref: d, // "done" crosses out: only for to-dos
      });
    }
  }

  // All-day first (habits, then referrals, then the rest), then by time
  const rank = { habits: 0, referral: 1 };
  return out.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1)
    || (a.allDay ? (rank[a.kind] ?? 2) - (rank[b.kind] ?? 2) : 0)
    || a.start - b.start || a.title.localeCompare(b.title));
}

/** The Manila days an item is on, between from and to. */
export function daysOf(item, fromKey, toKey) {
  const first = item.allDay ? item.date : todayKey(item.start.getTime());
  const last = item.allDay ? addDays(item.endDate ?? addDays(item.date, 1), -1) : todayKey(item.end.getTime() - 1);
  const out = [];
  for (let d = first < fromKey ? fromKey : first; d <= last && d < toKey && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}
