/* Pages inside the To Do tab — Recently deleted (#/todo/deleted) and
   Categories (#/todo/categories) — and the task CSV export. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { subHead } from '../../core/components.js';
import { actionSheet, announce, openDialog, promptDialog, toast } from '../../core/ui.js';
import { makeReorderable } from '../../core/reorder.js';
import { uid } from '../../core/ids.js';
import { saveRecords } from '../../core/records.js';
import { nowISO } from '../../core/dates.js';
import { daysFrom, formatStamp, todayKey } from '../../core/manila.js';
import { shareOrDownload } from '../../services/backup.js';
import { CATEGORY_COLORS, CATEGORY_ICONS, COLOR_NAMES, DELETED_DAYS, categoryStyle, isDone, subtaskProgress, tasksToCsv } from './model.js';
import {
  deleteCategory, getTask, loadTodo, reorderCategories, restoreTask, saveCategory, softDelete, todoChanged,
} from './store.js';
import { categoryChip } from './rows.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- Recently deleted ---------- */

export const deletedPage = {
  async show(el) {
    const d = await loadTodo();
    const today = todayKey();
    setHTML(el, html`<div class="todo-page accent-todo">
      ${subHead({ title: 'Recently deleted', back: 'To Do', accent: 'todo' })}
      <p class="todo-lead">Deleted tasks stay here for ${DELETED_DAYS} days so you can put them back. After that they leave this list, but they’re never erased: your backups and Google Sheet still have them.</p>
      ${d.deleted.length ? html`<ul class="card del-list">${d.deleted.map((t) => {
        const left = DELETED_DAYS - daysFrom(todayKey(Date.parse(t.deletedAt)), today);
        return html`<li class="del-item">
          <span class="del-item__text">
            <span class="del-item__title">${t.title || 'Untitled task'}</span>
            <span class="del-item__sub">Deleted ${formatStamp(t.deletedAt)} · ${left <= 1 ? 'last day here' : `${left} days left`}</span>
            ${d.categories.get(t.categoryId) ? categoryChip(d.categories.get(t.categoryId)) : ''}
          </span>
          <button type="button" class="btn btn--sm" data-action="todo:restore" data-id="${t.id}" aria-label="Restore ${t.title}">${icon('refresh')}Restore</button>
        </li>`;
      })}</ul>` : html`<div class="card empty">${icon('trash')}<span>Nothing deleted in the last ${DELETED_DAYS} days.</span></div>`}
    </div>`);
  },
};

registerAction('todo:restore', async (btn) => {
  const task = await getTask(btn.dataset.id);
  if (!task) return;
  await restoreTask(task);
  toast(`Restored: ${task.title}`, { icon: 'refresh', action: { label: 'Undo', onClick: () => softDelete(task) } });
  announce(`${task.title} restored.`);
});

/* ---------- Categories ---------- */

let catView = null;

export const categoriesPage = {
  async show(el) {
    catView = el;
    const d = await loadTodo();
    const cats = [...d.categories.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const open = new Map();
    d.tasks.filter((t) => !isDone(t)).forEach((t) => open.set(t.categoryId, (open.get(t.categoryId) ?? 0) + 1));
    setHTML(el, html`<div class="todo-page accent-todo">
      ${subHead({ title: 'Categories', back: 'To Do', accent: 'todo',
        actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="cat:new">${icon('plus')}New</button>` })}
      <p class="todo-lead">Categories group your tasks. Tap one to rename it or change its colour or icon; drag ≡ to change the order.</p>
      ${cats.length ? html`<ol class="card cat-list" data-cat-list>${cats.map((c, i) => {
        const style = categoryStyle(c);
        const n = open.get(c.id) ?? 0;
        return html`<li class="cat-item" data-id="${c.id}">
          <span class="cat-item__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
          <button type="button" class="cat-item__main" data-action="cat:menu" data-id="${c.id}" aria-label="${c.name}, ${plural(n, 'open task')}. Options">
            <span class="cat-item__icon" style="--cat: ${style.color}">${icon(style.icon)}</span>
            <span class="cat-item__name">${c.name}</span>
            <span class="cat-item__count">${n ? plural(n, 'open task') : ''}</span>
            ${icon('chevronRight', 'row__chev')}
          </button>
          <button type="button" class="sr-only sr-only-focusable" data-action="cat:move" data-id="${c.id}" data-dir="-1"${raw(i === 0 ? ' disabled' : '')}>Move ${c.name} up</button>
          <button type="button" class="sr-only sr-only-focusable" data-action="cat:move" data-id="${c.id}" data-dir="1"${raw(i === cats.length - 1 ? ' disabled' : '')}>Move ${c.name} down</button>
        </li>`;
      })}</ol>` : html`<div class="card empty">${icon('layers')}<span>No categories. Tap New to add one.</span></div>`}
    </div>`);
    const list = el.querySelector('[data-cat-list]');
    if (list) {
      makeReorderable(list, {
        onReorder: async (ids, item) => {
          await reorderCategories(cats, ids);
          announce(`Moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
        },
      });
    }
  },
};

async function allCategories() {
  const d = await loadTodo();
  return [...d.categories.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function askName(title, value = '', except = null) {
  const cats = await allCategories();
  const name = await promptDialog({ title, label: 'Name', value, placeholder: 'For example: Hospital', maxLength: 40, required: true, confirmLabel: 'Save' });
  if (!name) return null;
  if (cats.some((c) => c.id !== except && c.name.toLowerCase() === name.toLowerCase())) {
    toast(`You already have a category called “${name}”.`, { icon: 'info' });
    return null;
  }
  return name;
}

registerAction('cat:new', async () => {
  const name = await askName('New category');
  if (!name) return;
  const cats = await allCategories();
  const order = cats.length ? Math.max(...cats.map((c) => c.order ?? 0)) + 1 : 0;
  await saveCategory({ id: uid(), name, order, color: CATEGORY_COLORS[order % CATEGORY_COLORS.length], icon: 'layers' });
  toast(`Category “${name}” added.`, { icon: 'layers' });
});

registerAction('cat:move', async (btn) => {
  const cats = await allCategories();
  const ids = cats.map((c) => c.id);
  const from = ids.indexOf(btn.dataset.id);
  const to = from + Number(btn.dataset.dir);
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await reorderCategories(cats, ids);
  announce(`Moved to position ${to + 1} of ${ids.length}.`);
  requestAnimationFrame(() => catView?.querySelector(`[data-id="${btn.dataset.id}"] [data-dir="${btn.dataset.dir}"]`)?.focus());
});

async function pickColour(category) {
  const current = categoryStyle(category).color;
  const choice = await openDialog({
    variant: 'sheet',
    className: 'accent-todo',
    title: `Colour for ${category.name}`,
    body: html`<div class="swatches">${CATEGORY_COLORS.map((c, i) => html`<button type="button" class="swatch" style="--cat: ${c}"
      data-dialog-value="${c}" aria-pressed="${c === current ? 'true' : 'false'}" aria-label="${COLOR_NAMES[i]}">${icon('check')}</button>`)}</div>
      <p class="group__foot">Colours are only a help: the category’s name and icon always show too.</p>`,
    actions: [{ label: 'Cancel', value: '__cancel', variant: 'ghost' }],
  });
  return choice && choice !== '__cancel' ? choice : null;
}

async function pickIcon(category) {
  const style = categoryStyle(category);
  const choice = await openDialog({
    variant: 'sheet',
    className: 'accent-todo',
    title: `Icon for ${category.name}`,
    body: html`<div class="icon-picks">${Object.entries(CATEGORY_ICONS).map(([name, label]) => html`<button type="button" class="icon-pick" style="--cat: ${style.color}"
      data-dialog-value="${name}" aria-pressed="${name === style.icon ? 'true' : 'false'}" aria-label="${label}">${icon(name)}</button>`)}</div>`,
    actions: [{ label: 'Cancel', value: '__cancel', variant: 'ghost' }],
  });
  return choice && choice !== '__cancel' ? choice : null;
}

async function removeCategory(category) {
  const d = await loadTodo();
  const tasks = d.tasks.filter((t) => t.categoryId === category.id);
  const others = [...d.categories.values()].filter((c) => c.id !== category.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const choice = await openDialog({
    variant: 'alert',
    title: `Delete “${category.name}”?`,
    body: html`<form class="prompt" data-cat-delete>
      ${tasks.length ? html`<label class="field"><span class="field__label">Its ${plural(tasks.length, 'task')} move to</span>
        <select class="select" name="moveTo"><option value="">No category</option>${others.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>`
        : html`<p class="dlg__msg">No tasks use it.</p>`}
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="__cancel">Cancel</button>
        <button type="submit" class="btn btn--danger-solid">Delete</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-cat-delete]');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close({ moveTo: form.elements.moveTo?.value || null });
      });
    },
  });
  if (!choice || typeof choice !== 'object') return;
  const moved = await deleteCategory(category, choice.moveTo);
  const target = choice.moveTo ? d.categories.get(choice.moveTo)?.name : 'No category';
  toast(`Deleted “${category.name}”${moved ? ` · ${plural(moved, 'task')} moved to ${target}` : ''}.`, {
    icon: 'trash',
    duration: 7000,
    action: {
      label: 'Undo',
      onClick: async () => {
        const now = nowISO();
        await saveRecords([
          { store: 'taskCategories', record: { ...category, deletedAt: null, updatedAt: now } },
          ...tasks.map((t) => ({ store: 'tasks', record: { ...t, categoryId: category.id, updatedAt: now } })),
        ]);
        todoChanged();
      },
    },
  });
}

registerAction('cat:menu', async (btn) => {
  const category = (await allCategories()).find((c) => c.id === btn.dataset.id);
  if (!category) return;
  const choice = await actionSheet({
    title: category.name,
    items: [
      { label: 'Rename', value: 'rename', icon: 'edit' },
      { label: 'Colour', value: 'colour', icon: 'sparkles' },
      { label: 'Icon', value: 'icon', icon: categoryStyle(category).icon },
      { label: 'Delete category', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'rename') {
    const name = await askName('Rename category', category.name, category.id);
    if (name && name !== category.name) await saveCategory({ ...category, name });
  } else if (choice === 'colour') {
    const color = await pickColour(category);
    if (color) await saveCategory({ ...category, color, icon: categoryStyle(category).icon });
  } else if (choice === 'icon') {
    const iconName = await pickIcon(category);
    if (iconName) await saveCategory({ ...category, icon: iconName, color: categoryStyle(category).color });
  } else if (choice === 'delete') {
    await removeCategory(category);
  }
});

/* ---------- Export ---------- */

/** All your tasks (not deleted ones, not samples) as a CSV file for Excel, Numbers or Google Sheets. */
export async function exportTasksCsv() {
  const d = await loadTodo();
  const tasks = d.tasks.filter((t) => !t.sample);
  if (!tasks.length) {
    toast('There are no tasks to export yet (sample tasks aren’t included).', { icon: 'info' });
    return;
  }
  const csv = tasksToCsv(tasks, { categories: d.categories, progress: subtaskProgress(d.subtasks.filter((s) => !s.sample)) });
  const file = new File([csv], `LifeDashboard_Tasks_${todayKey()}.csv`, { type: 'text/csv' });
  const result = await shareOrDownload(file);
  if (result === 'downloaded') toast(`Exported ${plural(tasks.length, 'task')} to your Downloads.`, { icon: 'download' });
  else if (result === 'shared') toast(`Exported ${plural(tasks.length, 'task')}.`, { icon: 'share' });
  else if (result === 'needs-tap') toast('Tap Export tasks again to choose where to save it.', { icon: 'share' });
}

registerAction('todo:export', () => exportTasksCsv());
