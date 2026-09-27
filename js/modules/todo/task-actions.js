/* Things you can do to a task from anywhere — the list, the cross-shaped quick
   menu, a swipe or a key — each with its Undo, so they behave the same way
   wherever you start them. */
import { html } from '../../core/html.js';
import { emit } from '../../core/events.js';
import { actionSheet, announce, confirmDialog, openDialog, promptDialog, toast } from '../../core/ui.js';
import { PRIORITIES, PRIORITY_KEYS, isDone, possibleDuplicate } from './model.js';
import {
  addSubtask, getTask, loadTodo, mergeTasks, moveToTomorrow, putBack, saveTask, setDone, softDelete,
} from './store.js';

/** Ask the To Do list to put the keyboard focus back on a task once it has redrawn. */
export const focusTaskLater = (id) => emit('todo-focus', { id });

export async function toggleDone(id, { refocus = false } = {}) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  const before = { ...task };
  const done = !isDone(task);
  if (refocus) focusTaskLater(id);
  await setDone(task, done);
  if (done) {
    toast(`Done: ${task.title}`, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => putBack(before) } });
    announce(`${task.title} done.`);
  } else {
    toast(`Not done: ${task.title}`, { icon: 'refresh', action: { label: 'Undo', onClick: () => putBack(before) } });
    announce(`${task.title} is not done.`);
  }
}

export async function deleteTask(id) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  const ok = await confirmDialog({
    title: 'Delete this task?',
    message: `“${task.title}” goes to Recently deleted, where you can restore it for 30 days.`,
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  await softDelete(task);
  toast(`Deleted: ${task.title}`, { icon: 'trash', action: { label: 'Undo', onClick: () => putBack(task) } });
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
  const title = await promptDialog({ title: 'Add a subtask', label: task.title, placeholder: 'For example: Collect the results', confirmLabel: 'Add', maxLength: 300, required: true });
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
