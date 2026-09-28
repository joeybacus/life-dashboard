/* Things you can do to a task — or to a subtask with its own row — from
   anywhere: the list, the cross-shaped quick menu, a swipe, a key or a reminder.
   Each has its Undo, so they behave the same way wherever you start them. */
import { html } from '../../core/html.js';
import { db } from '../../core/db.js';
import { emit } from '../../core/events.js';
import { actionSheet, announce, confirmDialog, openDialog, promptDialog, toast } from '../../core/ui.js';
import { relativeDay, todayKey } from '../../core/manila.js';
import { PRIORITIES, PRIORITY_KEYS, isDone, possibleDuplicate } from './model.js';
import { describeRule, lastOfCount, nextDate } from './repeat.js';
import {
  addSubtask, completeTask, deleteSub, getSub, getTask, loadTodo, mergeTasks, moveSubToTomorrow, moveToTomorrow, putBack, saveSub, saveTask,
  setDone, setSubDone, skipTask, softDelete, undoNext,
} from './store.js';

/** Ask the To Do list to put the keyboard focus back on a task once it has redrawn. */
export const focusTaskLater = (id) => emit('todo-focus', { id });

/** " · Next: Mon, Oct 5" / " · That was the last one" — after ticking or skipping a repeating task. */
export function nextWords(result) {
  if (!result) return '';
  if (result.ended) return result.task.recurrence ? ' · That was the last one' : '';
  return result.next ? ` · Next: ${relativeDay(result.next.date, todayKey())}` : '';
}

/** Tick a task (a repeating one makes its next occurrence) with Undo. Returns what was saved. */
export async function completeWithUndo(task, { quiet = false } = {}) {
  const before = { ...task };
  const result = await completeTask(task);
  const words = nextWords(result);
  if (!quiet) {
    toast(`Done: ${task.title}${words}`, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => undoNext(before, result) } });
    announce(`${task.title} done.${words ? `${words.replace(' · ', ' ')}.` : ''}`);
  }
  return result;
}

export async function toggleDone(id, { refocus = false } = {}) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  const before = { ...task };
  if (refocus) focusTaskLater(id);
  if (!isDone(task)) {
    await completeWithUndo(task);
    return;
  }
  await setDone(task, false);
  toast(`Not done: ${task.title}`, { icon: 'refresh', action: { label: 'Undo', onClick: () => putBack(before) } });
  announce(`${task.title} is not done.`);
}

/**
 * Deleting a repeating task: skip just this one (the next one comes), or delete
 * it and stop repeating. Resolves 'skip', 'stop' or null. Other tasks: 'stop'
 * after the usual confirmation.
 */
export async function askDelete(task) {
  const repeating = Boolean(task.recurrence) && !isDone(task) && !lastOfCount(task);
  const next = repeating ? nextDate(task.recurrence, task.date, { today: todayKey() }) : null;
  if (!repeating || !next) {
    const ok = await confirmDialog({
      title: 'Delete this task?',
      message: `“${task.title}” goes to Recently deleted, where you can restore it for 30 days.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    return ok ? 'stop' : null;
  }
  return actionSheet({
    title: `Delete “${task.title}”?`,
    message: `Repeats: ${describeRule(task.recurrence)}. Deleted tasks stay in Recently deleted for 30 days.`,
    items: [
      { label: 'Skip this one', value: 'skip', icon: 'arrowRight', detail: `Next: ${relativeDay(next, todayKey())}` },
      { label: 'Delete and stop repeating', value: 'stop', icon: 'trash', destructive: true },
    ],
  });
}

/** Skip or delete (after askDelete), with Undo. */
export async function removeTask(task, choice) {
  if (choice === 'skip') {
    const before = { ...task };
    const result = await skipTask(task);
    toast(`Skipped: ${task.title}${nextWords(result)}`, { icon: 'arrowRight', action: { label: 'Undo', onClick: () => undoNext(before, result) } });
    announce(`${task.title} skipped.`);
  } else if (choice === 'stop') {
    await softDelete(task);
    toast(`Deleted: ${task.title}`, { icon: 'trash', action: { label: 'Undo', onClick: () => putBack(task) } });
  }
}

export async function deleteTask(id) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  await removeTask(task, await askDelete(task));
}

/** "Move to tomorrow" changes the task's date — never a reminder. */
export async function tomorrowTask(id) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  await moveToTomorrow(task);
  toast(`Moved to tomorrow: ${task.title}`, { icon: 'arrowRight', action: { label: 'Undo', onClick: () => putBack(task) } });
}

export async function togglePin(id) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  await saveTask({ ...task, pinned: !task.pinned });
  toast(task.pinned ? `Unpinned: ${task.title}` : `Pinned: ${task.title}`, {
    icon: 'pushpin', action: { label: 'Undo', onClick: () => putBack(task) },
  });
}

export async function choosePriority(id) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  const choice = await actionSheet({
    title: 'Priority',
    message: task.title,
    items: PRIORITY_KEYS.map((p) => ({ label: PRIORITIES[p].label, value: p, checked: task.priority === p })),
  });
  if (!choice || choice === task.priority) return;
  await saveTask({ ...task, priority: choice });
  announce(`${PRIORITIES[choice].label} priority.`);
}

export async function chooseCategory(id) {
  const [task, { categories }] = await Promise.all([getTask(id), loadTodo()]);
  if (!task || task.deletedAt) return;
  const list = [...categories.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const choice = await actionSheet({
    title: 'Move to category',
    message: task.title,
    items: [
      ...list.map((c) => ({ label: c.name, value: c.id, checked: task.categoryId === c.id })),
      { label: 'No category', value: '__none', checked: !task.categoryId },
    ],
  });
  if (!choice) return;
  const categoryId = choice === '__none' ? null : choice;
  if (categoryId === (task.categoryId ?? null)) return;
  await saveTask({ ...task, categoryId });
  toast(`Moved to ${categoryId ? categories.get(categoryId).name : 'No category'}.`, {
    icon: 'layers', action: { label: 'Undo', onClick: () => putBack(task) },
  });
}

export async function addSubtaskTo(id) {
  const [task, { subtasks }] = await Promise.all([getTask(id), loadTodo()]);
  if (!task || task.deletedAt) return;
  const title = await promptDialog({ title: 'Add a subtask', label: task.title, placeholder: 'For example: Collect the results', confirmLabel: 'Add', maxLength: 300, required: true, dismissible: false });
  if (!title) return;
  const mine = subtasks.filter((s) => s.taskId === id);
  await addSubtask(id, title, mine.length ? Math.max(...mine.map((s) => s.order ?? 0)) + 1 : 0);
  toast(`Subtask added to “${task.title}”.`, { icon: 'list' });
}

/**
 * Right after adding a task: if another open task has the same name, date and
 * time and was added within a minute, ask — keep both, or merge. Never automatic.
 */
export async function checkDuplicate(task) {
  const { tasks } = await loadTodo();
  const twin = possibleDuplicate(task, tasks);
  if (!twin) return;
  const choice = await openDialog({
    variant: 'alert',
    title: 'Possible duplicate',
    body: html`<p class="dlg__msg">“${task.title}” looks the same as a task added a moment ago — same name, date and time.</p>`,
    actions: [
      { label: 'Keep both', value: 'keep', variant: 'ghost', autofocus: true },
      { label: 'Merge', value: 'merge', variant: 'primary' },
    ],
  });
  if (choice !== 'merge') return;
  const [older, newer] = [twin, task].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const undo = await mergeTasks(older, newer);
  toast(`Merged into “${older.title}”.`, { icon: 'layers', action: { label: 'Undo', onClick: undo } });
}

/* ---------- Subtasks with their own rows ---------- */

/** Put a subtask back as it was (Undo): a new save, so it syncs as the latest change. */
const putSubBack = (snapshot) => saveSub({ ...snapshot });

/**
 * Tick a subtask (or untick it). Ticking its task's last open subtask offers to
 * complete the task too — never automatically.
 */
export async function toggleSubDone(id, { refocus = false } = {}) {
  const sub = await getSub(id);
  if (!sub || sub.deletedAt) return;
  const done = !sub.done;
  if (refocus) focusTaskLater(id);
  await setSubDone(sub, done);
  const parent = await getTask(sub.taskId);
  if (done && parent && !isDone(parent)) {
    const siblings = (await db.all('subtasks')).filter((x) => x.taskId === parent.id && !x.deletedAt);
    if (siblings.length && siblings.every((x) => x.done)) {
      toast(`All subtasks of “${parent.title}” are done.`, { icon: 'checkCircle', action: { label: 'Complete task', onClick: () => toggleDone(parent.id) } });
      announce(`${sub.title} done. All subtasks of ${parent.title} are done.`);
      return;
    }
  }
  toast(`${done ? 'Done' : 'Not done'}: ${sub.title}`, { icon: done ? 'checkCircle' : 'refresh', action: { label: 'Undo', onClick: () => putSubBack(sub) } });
  announce(done ? `${sub.title} done.` : `${sub.title} is not done.`);
}

/** A subtask's own date becomes tomorrow. */
export async function tomorrowSub(id) {
  const sub = await getSub(id);
  if (!sub || sub.deletedAt) return;
  await moveSubToTomorrow(sub);
  toast(`Moved to tomorrow: ${sub.title}`, { icon: 'arrowRight', action: { label: 'Undo', onClick: () => putSubBack(sub) } });
}

export async function deleteSubtask(id) {
  const sub = await getSub(id);
  if (!sub || sub.deletedAt) return;
  await deleteSub(sub);
  toast(`Deleted: ${sub.title}`, { icon: 'trash', action: { label: 'Undo', onClick: () => putSubBack({ ...sub, deletedAt: null }) } });
}
