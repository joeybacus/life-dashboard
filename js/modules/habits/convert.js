/* Turning a habit into a repeating task, or a task into a habit. Both keep the
   title, the schedule (as near as the other can do it) and the category.

   Habit → task: a repeating task from today; the habit is paused, not deleted,
   so its history and streaks stay (it's on the Habits page, marked paused).
   Task → habit: a habit with the task's title and schedule; the task goes to
   Recently deleted (30 days to put it back), which also stops it repeating.

   Rules for "use which": a repeating task for something with a time, deadline
   or reminder; a habit for something you want to build a streak on. */
import { confirmDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { todayKey } from '../../core/manila.js';
import { createTask, getTask, softDelete } from '../todo/store.js';
import { WEEKDAY_SHORT, cleanSchedule, scheduleText } from './model.js';
import { loadHabits, saveHabit } from './store.js';

const dayList = (days) => days.map((d) => WEEKDAY_SHORT[d]).join(', ');

/** A habit's schedule as a repeating task's rule, and a note when they don't match exactly. */
export function ruleForSchedule(schedule) {
  const s = cleanSchedule(schedule);
  if (s.kind === 'daily') return { rule: { kind: 'daily', interval: 1 }, note: '' };
  if (s.kind === 'days') {
    if (s.days.join() === '1,2,3,4,5') return { rule: { kind: 'weekdays', interval: 1 }, note: '' };
    return { rule: { kind: 'weekly', interval: 1, days: s.days }, note: '' };
  }
  // "N times a week" has no match in repeating tasks: spread over the week, from Monday
  const picks = Array.from({ length: s.times }, (_, i) => (1 + Math.floor((i * 7) / s.times)) % 7).sort();
  const days = [...new Set(picks)];
  return {
    rule: s.times >= 7 ? { kind: 'daily', interval: 1 } : { kind: 'weekly', interval: 1, days },
    note: s.times >= 7 ? '' : `Repeating tasks can’t do “${scheduleText(s)}”, so it repeats on ${dayList(days)} — change the days in the task afterwards if you like.`,
  };
}

/** A repeating task's rule as a habit's schedule, and a note when they don't match exactly. */
export function scheduleForRule(rule, date = todayKey()) {
  if (!rule) return { schedule: { kind: 'daily' }, note: 'It doesn’t repeat, so the habit is every day — change it afterwards if you like.' };
  const every = rule.interval > 1;
  if (rule.kind === 'daily') return { schedule: { kind: 'daily' }, note: every ? `Habits can’t do “every ${rule.interval} days”, so it’s every day.` : '' };
  if (rule.kind === 'weekdays') return { schedule: { kind: 'days', days: [1, 2, 3, 4, 5] }, note: '' };
  if (rule.kind === 'weekly') {
    const days = rule.days?.length ? rule.days : [new Date(`${date}T00:00:00Z`).getUTCDay()];
    return { schedule: { kind: 'days', days }, note: every ? `Habits can’t do “every ${rule.interval} weeks”, so it’s every week on ${dayList(days)}.` : '' };
  }
  if (rule.kind === 'monthly') return { schedule: { kind: 'perWeek', times: 1 }, note: 'Habits can’t repeat monthly, so it becomes once a week.' };
  return { schedule: { kind: 'daily' }, note: 'Habits can’t repeat “a while after it’s done”, so it’s every day.' };
}

/** Make a repeating task from a habit (the habit is paused, its history kept). Resolves the task, or null. */
export async function habitToTask(habitId) {
  const h = (await loadHabits()).habits.find((x) => x.id === habitId);
  if (!h) return null;
  const { rule, note } = ruleForSchedule(h.schedule);
  const ok = await confirmDialog({
    title: `Turn “${h.name}” into a repeating task?`,
    message: `A task “${h.name}” is added from today, repeating ${scheduleText(h.schedule).toLowerCase()}.${note ? ` ${note}` : ''} The habit is paused, not deleted: its history and streaks stay on the Habits page, and you can resume it any time.`,
    confirmLabel: 'Make it a task',
  });
  if (!ok) return null;
  const task = await createTask({ title: h.name, date: todayKey(), recurrence: rule, ...(h.categoryId ? { categoryId: h.categoryId } : {}) });
  await saveHabit({ id: h.id, active: false, convertedTo: task.id });
  toast(`“${h.name}” is now a repeating task.`, { icon: 'repeat', action: { label: 'Open To Do', onClick: () => openPage('todo', '') } });
  return task;
}

/** Make a habit from a task (the task goes to Recently deleted). Resolves the habit, or null. */
export async function taskToHabit(taskOrId) {
  const task = typeof taskOrId === 'string' ? await getTask(taskOrId) : taskOrId;
  if (!task) return null;
  const { schedule, note } = scheduleForRule(task.recurrence, task.date || todayKey());
  const ok = await confirmDialog({
    title: `Turn “${task.title || 'this task'}” into a habit?`,
    message: `A habit “${task.title}” is added, ${scheduleText(schedule).toLowerCase()}.${note ? ` ${note}` : ''} The task goes to Recently deleted (you can put it back for 30 days)${task.recurrence ? ' and stops repeating' : ''}. Habits have no time or reminders.`,
    confirmLabel: 'Make it a habit',
  });
  if (!ok) return null;
  const habit = await saveHabit({ name: task.title || 'Habit', group: 'Morning', schedule, ...(task.categoryId ? { categoryId: task.categoryId } : {}) });
  await softDelete(task);
  toast(`“${habit.name}” is now a habit.`, { icon: 'flame', action: { label: 'Open', onClick: () => openPage('todo', 'habits') } });
  return habit;
}
