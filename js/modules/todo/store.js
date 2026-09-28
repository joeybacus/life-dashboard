/* To-do data: tasks, subtasks and categories in this device's database.
   Every save goes through saveRecord()/saveRecords(), so it syncs a few seconds
   later. Deleting only marks an item (deletedAt): the deletion syncs to your
   other devices, and Undo or Restore brings it back. Nothing is ever erased.
   Sample tasks (and their subtasks) can be ticked and edited to try things
   out; they carry sample: true, so they never sync and are rebuilt each day.
   Reminders: what has rung ("alerts") is always taken from the saved copy —
   only the reminder engine changes it (saveAlerts) — so a sheet that was open
   while a reminder rang can't make it ring again. */
import { db, stamp } from '../../core/db.js';
import { saveRecord, saveRecords } from '../../core/records.js';
import { emit } from '../../core/events.js';
import { uid } from '../../core/ids.js';
import { nowISO } from '../../core/dates.js';
import { addDays, isClock, isDateKey, todayKey } from '../../core/manila.js';
import { state } from '../../core/state.js';
import { DELETED_DAYS, MAX_NOTES, MAX_TITLE, PRIORITIES, isDone, newTask, normalizeSub, normalizeTask } from './model.js';
import { reminderSettings, settleAlerts, sortReminders } from './alerts.js';
import { cleanRule, firstDate, nextOccurrence } from './repeat.js';

const MAX_REMINDERS = 10;
const alertSettings = () => reminderSettings(state.settings?.tasks);

/** Valid reminders only: "before" (0 minutes to 4 weeks) or an exact time; each keeps its id and when it was set. */
function cleanReminders(list, now) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const base = { id: String(r.id || `r${i}${Math.random().toString(36).slice(2, 6)}`), createdAt: r.createdAt || now };
    if (r.kind === 'at') {
      const ms = Date.parse(r.at);
      if (Number.isFinite(ms)) out.push({ ...base, kind: 'at', at: new Date(ms).toISOString() });
    } else {
      const minutes = Math.round(Number(r.minutes));
      if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 40320) out.push({ ...base, kind: 'before', minutes });
    }
  });
  return sortReminders(out).slice(0, MAX_REMINDERS);
}

/** A per-item follow-up choice: null (as in Settings), { enabled: false }, or { enabled: true, minutes }. */
function cleanFollowUp(f) {
  if (!f || typeof f !== 'object') return null;
  if (f.enabled === false) return { enabled: false };
  const minutes = Math.round(Number(f.minutes));
  return Number.isFinite(minutes) && minutes >= 5 && minutes <= 1440 ? { enabled: true, minutes } : null;
}

/** Date and time fields made consistent (a time needs a date; an end needs a start). */
function cleanWhen(x) {
  if (!isDateKey(x.date)) x.date = null;
  if (!x.date || !isClock(x.startTime)) x.startTime = null;
  if (!x.startTime || !isClock(x.endTime) || x.endTime === x.startTime) x.endTime = null;
  return x;
}

/** Tell the To Do screen and the dashboard that tasks changed. */
export const todoChanged = (reason = 'todo') => emit('data', { reason });

/**
 * Everything the To Do screens need: live tasks, the recently deleted ones,
 * subtasks and categories.
 */
export async function loadTodo(now = Date.now()) {
  const [tasks, subtasks, categories] = await Promise.all([db.all('tasks'), db.all('subtasks'), db.all('taskCategories')]);
  const cutoff = new Date(now - DELETED_DAYS * 864e5).toISOString();
  const all = tasks.map(normalizeTask);
  return {
    tasks: all.filter((t) => !t.deletedAt),
    deleted: all.filter((t) => t.deletedAt && t.deletedAt >= cutoff).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    subtasks: subtasks.filter((s) => !s.deletedAt).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    categories: new Map(categories.filter((c) => !c.deletedAt).map((c) => [c.id, c])),
    allCategories: categories,
  };
}

export async function getTask(id) {
  const t = await db.get('tasks', id);
  return t ? normalizeTask(t) : null;
}

export async function getSub(id) {
  const s = await db.get('subtasks', id);
  return s ? normalizeSub(s) : null;
}

/** Keep a task's fields tidy before saving. */
function clean(task, now = nowISO()) {
  const t = cleanWhen({ ...task });
  t.title = String(t.title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  t.notes = String(t.notes ?? '').slice(0, MAX_NOTES);
  if (!PRIORITIES[t.priority]) t.priority = 'none';
  if (!isDone(t)) t.completedAt = null;
  t.reminders = cleanReminders(t.reminders, now);
  t.followUp = cleanFollowUp(t.followUp);
  // A repeating task has a date (the first on its schedule, when it had none) and belongs to a series
  t.recurrence = cleanRule(t.recurrence);
  if (t.recurrence) {
    if (!t.date) t.date = firstDate(t.recurrence, todayKey(Date.parse(now)));
    t.seriesId = t.seriesId || t.id || null;
    t.seriesIndex = Number.isInteger(t.seriesIndex) && t.seriesIndex > 0 ? t.seriesIndex : 1;
  }
  t.allDay = Boolean(t.date && !t.startTime);
  return t;
}

/** Keep a subtask's fields tidy before saving. */
function cleanSub(sub, now = nowISO()) {
  const s = cleanWhen(normalizeSub(sub));
  s.title = String(s.title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  s.completedAt = s.done ? (s.completedAt || now) : null;
  s.reminders = cleanReminders(s.reminders, now);
  s.followUp = cleanFollowUp(s.followUp);
  return s;
}

/** A subtask in the shape the reminder rules read (status like a task's). */
const asItem = (sub) => sub && { ...sub, status: sub.done ? 'done' : 'open' };

/** Save a task (a new one gets an id). quiet: typing in a field — sync waits a little longer. */
export async function saveTask(task, { quiet = false } = {}) {
  const record = stamp(clean(task));
  const prev = await db.get('tasks', record.id);
  record.alerts = settleAlerts(prev ? normalizeTask(prev) : null, record, alertSettings());
  await saveRecord('tasks', record, { quiet });
  todoChanged();
  return record;
}

/** Settings → Tasks → Google Calendar → "Always add timed tasks": for new ones with a time. */
const autoCalendar = (x) => Boolean(state.settings?.tasks?.calendar?.always && x.date && x.startTime);

/** A new task (and its subtasks) saved together. */
export async function createTask(fields, { subtasks = [] } = {}) {
  const now = nowISO();
  const task = stamp(clean(newTask(fields), now), now);
  if (task.recurrence && !task.seriesId) task.seriesId = task.id; // the first of a repeating series
  if (fields.addToCalendar === undefined) task.addToCalendar = autoCalendar(task);
  task.alerts = settleAlerts(null, task, alertSettings());
  const items = [{ store: 'tasks', record: task }];
  subtasks.filter((s) => s.title?.trim()).forEach((s, i) => {
    const sub = stamp(cleanSub({ ...s, id: uid(), taskId: task.id, order: i }, now), now);
    if (s.addToCalendar === undefined) sub.addToCalendar = autoCalendar(sub);
    sub.alerts = settleAlerts(null, asItem(sub), alertSettings());
    items.push({ store: 'subtasks', record: sub });
  });
  await saveRecords(items);
  todoChanged();
  return task;
}

/**
 * The reminder engine's own save: change only what has rung (mutate gets the
 * saved item and returns its new alerts). Nothing else about the item changes.
 */
export async function saveAlerts(store, id, mutate) {
  const current = await db.get(store, id);
  if (!current || current.deletedAt) return null;
  const record = stamp({ ...current, alerts: mutate(store === 'subtasks' ? asItem(normalizeSub(current)) : normalizeTask(current)) });
  await saveRecord(store, record, { quiet: true });
  todoChanged('alerts');
  return record;
}

export function setDone(task, done) {
  return saveTask({ ...task, status: done ? 'done' : 'open', completedAt: done ? nowISO() : null });
}

/* ---------- Repeating tasks ---------- */

/**
 * Save a repeating task's next occurrence (with copies of its subtasks) along
 * with `changed` (this one, done or skipped). Its id is the same on every
 * device: if it's already there it's left alone, and one Undo put away comes
 * back. Returns { task, next, created, ended } — next is null when the series
 * has ended (its count or end date).
 */
async function saveWithNext(changed, original) {
  const now = nowISO();
  const today = todayKey();
  const allSubs = (await db.all('subtasks')).map(normalizeSub);
  const made = nextOccurrence(original, { subtasks: allSubs, today, doneOn: today });
  const task = stamp(clean({ ...changed, nextId: made?.task.id ?? null }, now), now);
  const prev = await db.get('tasks', task.id);
  task.alerts = settleAlerts(prev ? normalizeTask(prev) : null, task, alertSettings());
  const items = [{ store: 'tasks', record: task }];
  let next = null;
  let created = false;
  if (made) {
    const existing = await db.get('tasks', made.task.id);
    if (existing && !existing.deletedAt) {
      next = normalizeTask(existing); // made already (on another device, or ticked twice)
    } else {
      next = stamp(clean(newTask(made.task), now), now);
      next.alerts = settleAlerts(null, next, alertSettings());
      if (next.addToCalendar && next.sample) next.addToCalendar = false;
      items.push({ store: 'tasks', record: next });
      made.subtasks.forEach((sub) => {
        const record = stamp(cleanSub(sub, now), now);
        record.alerts = settleAlerts(null, asItem(record), alertSettings());
        items.push({ store: 'subtasks', record });
      });
      created = true;
    }
  }
  await saveRecords(items);
  todoChanged();
  return { task, next, created, ended: !made };
}

/** Tick a task. A repeating one makes its next occurrence. */
export function completeTask(task) {
  return saveWithNext({ ...task, status: 'done', completedAt: nowISO() }, task);
}

/** Skip this occurrence of a repeating task: it goes to Recently deleted and the next one comes. */
export function skipTask(task) {
  return saveWithNext({ ...task, deletedAt: nowISO() }, task);
}

/**
 * Undo ticking or skipping a repeating task: it goes back as it was, and the
 * next occurrence made for it (if this made it) is put away again.
 */
export async function undoNext(before, result) {
  await putBack({ ...before, nextId: null });
  if (!result?.created || !result.next) return;
  const now = nowISO();
  const [next, subs] = await Promise.all([db.get('tasks', result.next.id), db.all('subtasks')]);
  const items = [];
  if (next && !next.deletedAt) items.push({ store: 'tasks', record: { ...next, deletedAt: now, updatedAt: now } });
  subs.filter((x) => x.taskId === result.next.id && !x.deletedAt).forEach((x) => items.push({ store: 'subtasks', record: { ...x, deletedAt: now, updatedAt: now } }));
  if (!items.length) return;
  await saveRecords(items);
  todoChanged();
}

/** "Move to tomorrow" always changes the task's date (never a reminder). */
export function moveToTomorrow(task, now = Date.now()) {
  return saveTask({ ...task, date: addDays(todayKey(now), 1) });
}

export function setPinned(task, pinned) {
  return saveTask({ ...task, pinned });
}

export function softDelete(task) {
  return saveTask({ ...task, deletedAt: nowISO() });
}

export function restoreTask(task) {
  return saveTask({ ...task, deletedAt: null });
}

/** Undo: put a task back exactly as it was (a new save, so it syncs as the latest change). */
export function putBack(snapshot) {
  return saveTask({ ...snapshot });
}

/** Manual order: place a task between two neighbours (either may be missing). */
export function placeBetween(task, before, after) {
  let order;
  if (before && after) order = (before.manualOrder + after.manualOrder) / 2;
  else if (before) order = before.manualOrder + 1;
  else if (after) order = after.manualOrder - 1;
  else order = 0;
  return saveTask({ ...task, manualOrder: order });
}

/**
 * "Possible duplicate — merge": the newer task's details join the older one
 * (notes, tags, links, subtasks; the higher priority; a pin), then the newer one
 * is deleted. Returns an Undo that puts both back exactly as they were.
 */
export async function mergeTasks(keep, drop) {
  const now = nowISO();
  const allSubs = (await db.all('subtasks')).filter((s) => !s.deletedAt);
  const moving = allSubs.filter((s) => s.taskId === drop.id);
  const kept = allSubs.filter((s) => s.taskId === keep.id);
  const rank = (t) => PRIORITIES[t.priority]?.rank ?? 3;
  const merged = clean({
    ...keep,
    notes: [...new Set([keep.notes, drop.notes].map((n) => (n ?? '').trim()).filter(Boolean))].join('\n\n'),
    tags: [...new Set([...(keep.tags ?? []), ...(drop.tags ?? [])])],
    links: [...(keep.links ?? []), ...(drop.links ?? []).filter((l) => !(keep.links ?? []).some((k) => k.url === l.url))],
    priority: rank(drop) < rank(keep) ? drop.priority : keep.priority,
    categoryId: keep.categoryId ?? drop.categoryId ?? null,
    pinned: Boolean(keep.pinned || drop.pinned),
    updatedAt: now,
  });
  await saveRecords([
    { store: 'tasks', record: merged },
    { store: 'tasks', record: { ...drop, deletedAt: now, updatedAt: now } },
    ...moving.map((s, i) => ({ store: 'subtasks', record: { ...s, taskId: keep.id, order: kept.length + i, updatedAt: now } })),
  ]);
  todoChanged();
  return async () => {
    const t = nowISO();
    await saveRecords([
      { store: 'tasks', record: { ...keep, updatedAt: t } },
      { store: 'tasks', record: { ...drop, deletedAt: null, updatedAt: t } },
      ...moving.map((s) => ({ store: 'subtasks', record: { ...s, updatedAt: t } })),
    ]);
    todoChanged();
  };
}

/* ---------- Subtasks ---------- */

/** fields: a subtask's own date, time and reminders, if it has them. */
export async function addSubtask(taskId, title, order, fields = {}) {
  return saveSub({ ...fields, id: uid(), taskId, title: String(title).trim().slice(0, MAX_TITLE), done: false, order });
}

export async function saveSub(subtask, { quiet = false } = {}) {
  const record = stamp(cleanSub(subtask));
  const [prev, parent] = await Promise.all([db.get('subtasks', record.id), db.get('tasks', record.taskId)]);
  if (parent?.sample) record.sample = true;
  record.alerts = settleAlerts(prev ? asItem(normalizeSub(prev)) : null, asItem(record), alertSettings());
  await saveRecord('subtasks', record, { quiet });
  todoChanged();
  return record;
}

export const deleteSub = (subtask) => saveSub({ ...subtask, deletedAt: nowISO() });

export const setSubDone = (subtask, done) => saveSub({ ...subtask, done, completedAt: done ? nowISO() : null });

/** "Move to tomorrow" for a subtask: its own date becomes tomorrow. */
export function moveSubToTomorrow(subtask, now = Date.now()) {
  return saveSub({ ...subtask, date: addDays(todayKey(now), 1) });
}

/** Save a new order for a task's subtasks (only the ones that moved are written, from their saved copies). */
export async function reorderSubs(subtasks, ids) {
  const now = nowISO();
  const items = [];
  const saved = new Map((await db.all('subtasks')).map((x) => [x.id, x]));
  ids.forEach((id, order) => {
    const s = saved.get(id) ?? subtasks.find((x) => x.id === id);
    if (s && s.order !== order) items.push({ store: 'subtasks', record: { ...s, order, updatedAt: now } });
  });
  if (!items.length) return;
  await saveRecords(items);
  todoChanged();
}

/** Turn a subtask into its own task (its own date, time and reminders if it has them; else its task's date). */
export async function subtaskToTask(subtask, parent) {
  const now = nowISO();
  const own = normalizeSub(subtask);
  const task = stamp(clean(newTask({
    title: own.title,
    categoryId: parent.categoryId,
    date: own.date ?? parent.date,
    startTime: own.date ? own.startTime : null,
    endTime: own.date ? own.endTime : null,
    reminders: own.reminders,
    followUp: own.followUp,
    priority: parent.priority,
    status: own.done ? 'done' : 'open',
    completedAt: own.done ? now : null,
    ...(parent.sample ? { sample: true } : {}),
  }), now), now);
  task.alerts = settleAlerts(null, task, alertSettings());
  await saveRecords([
    { store: 'tasks', record: task },
    { store: 'subtasks', record: { ...subtask, deletedAt: now, updatedAt: now } },
  ]);
  todoChanged();
  return task;
}

/* ---------- Categories ---------- */

export async function saveCategory(category) {
  const record = stamp({ ...category, name: String(category.name ?? '').trim().slice(0, 40) });
  await saveRecord('taskCategories', record);
  todoChanged();
  return record;
}

/** Save a new category order (only the ones that moved are written). */
export async function reorderCategories(categories, ids) {
  const now = nowISO();
  const items = [];
  ids.forEach((id, order) => {
    const c = categories.find((x) => x.id === id);
    if (c && c.order !== order) items.push({ store: 'taskCategories', record: { ...c, order, updatedAt: now } });
  });
  if (!items.length) return;
  await saveRecords(items);
  todoChanged();
}

/**
 * Delete a category after moving its tasks to another one (moveTo = category id,
 * or null for "No category"). Everything is saved together.
 */
export async function deleteCategory(category, moveTo) {
  const now = nowISO();
  const tasks = (await db.all('tasks')).filter((t) => t.categoryId === category.id && !t.deletedAt);
  const items = [{ store: 'taskCategories', record: { ...category, deletedAt: now, updatedAt: now } }];
  tasks.forEach((t) => items.push({ store: 'tasks', record: { ...t, categoryId: moveTo, updatedAt: now } }));
  await saveRecords(items);
  todoChanged();
  return tasks.length;
}
