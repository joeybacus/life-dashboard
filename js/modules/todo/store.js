/* To-do data: tasks, subtasks and categories in this device's database.
   Every save goes through saveRecord()/saveRecords(), so it syncs a few seconds
   later. Deleting only marks an item (deletedAt): the deletion syncs to your
   other devices, and Undo or Restore brings it back. Nothing is ever erased.
   Sample tasks (and their subtasks) can be ticked and edited to try things
   out; they carry sample: true, so they never sync and are rebuilt each day. */
import { db, stamp } from '../../core/db.js';
import { saveRecord, saveRecords } from '../../core/records.js';
import { emit } from '../../core/events.js';
import { uid } from '../../core/ids.js';
import { nowISO } from '../../core/dates.js';
import { addDays, isClock, isDateKey, todayKey } from '../../core/manila.js';
import { DELETED_DAYS, MAX_NOTES, MAX_TITLE, PRIORITIES, isDone, newTask, normalizeTask } from './model.js';

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

/** Keep a task's fields tidy before saving. */
function clean(task) {
  const t = { ...task };
  t.title = String(t.title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  t.notes = String(t.notes ?? '').slice(0, MAX_NOTES);
  if (!PRIORITIES[t.priority]) t.priority = 'none';
  if (!isDateKey(t.date)) t.date = null;
  if (!t.date || !isClock(t.startTime)) t.startTime = null;
  if (!t.startTime || !isClock(t.endTime) || t.endTime === t.startTime) t.endTime = null;
  t.allDay = Boolean(t.date && !t.startTime);
  if (!isDone(t)) t.completedAt = null;
  return t;
}

/** Save a task (a new one gets an id). quiet: typing in a field — sync waits a little longer. */
export async function saveTask(task, { quiet = false } = {}) {
  const record = stamp(clean(task));
  await saveRecord('tasks', record, { quiet });
  todoChanged();
  return record;
}

/** A new task (and its subtasks) saved together. */
export async function createTask(fields, { subtasks = [] } = {}) {
  const now = nowISO();
  const task = stamp(clean(newTask(fields)), now);
  const items = [{ store: 'tasks', record: task }];
  subtasks.filter((s) => s.title?.trim()).forEach((s, i) => {
    items.push({ store: 'subtasks', record: stamp({ id: uid(), taskId: task.id, title: s.title.trim().slice(0, MAX_TITLE), done: Boolean(s.done), order: i }, now) });
  });
  await saveRecords(items);
  todoChanged();
  return task;
}

export function setDone(task, done) {
  return saveTask({ ...task, status: done ? 'done' : 'open', completedAt: done ? nowISO() : null });
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

export async function addSubtask(taskId, title, order) {
  const record = stamp({ id: uid(), taskId, title: String(title).trim().slice(0, MAX_TITLE), done: false, order });
  await saveSub(record);
  return record;
}

export async function saveSub(subtask) {
  const record = stamp({ ...subtask });
  if ((await db.get('tasks', record.taskId))?.sample) record.sample = true;
  await saveRecord('subtasks', record);
  todoChanged();
  return record;
}

export const deleteSub = (subtask) => saveSub({ ...subtask, deletedAt: nowISO() });

/** Save a new order for a task's subtasks (only the ones that moved are written). */
export async function reorderSubs(subtasks, ids) {
  const now = nowISO();
  const items = [];
  ids.forEach((id, order) => {
    const s = subtasks.find((x) => x.id === id);
    if (s && s.order !== order) items.push({ store: 'subtasks', record: { ...s, order, updatedAt: now } });
  });
  if (!items.length) return;
  await saveRecords(items);
  todoChanged();
}

/** Turn a subtask into its own task (same category and date as its parent). */
export async function subtaskToTask(subtask, parent) {
  const now = nowISO();
  const task = stamp(clean(newTask({
    title: subtask.title,
    categoryId: parent.categoryId,
    date: parent.date,
    priority: parent.priority,
    status: subtask.done ? 'done' : 'open',
    completedAt: subtask.done ? now : null,
    ...(parent.sample ? { sample: true } : {}),
  })), now);
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
