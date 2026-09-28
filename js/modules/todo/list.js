/* The To Do screen: the plain-words box, smart views (Today, Upcoming, Overdue,
   By category, All, Completed — which ones show, and their order, in Settings),
   search, the Sort button, and the tasks — cards on iPhone, a table
   (Priority | Task | Time | ✓) on iPad landscape and Mac. Tapping a task opens
   its quick menu; the circle on the right ticks it; swipes and Mac keys work
   too (gestures.js). The top of the screen is drawn once, so switching views
   never loses what you're typing. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction, runAction } from '../../core/actions.js';
import { on, state, updateSettings } from '../../core/state.js';
import { pageHead } from '../../core/components.js';
import { actionSheet, announce, toast } from '../../core/ui.js';
import { currentRoute, openPage } from '../../core/router.js';
import { makeReorderable } from '../../core/reorder.js';
import { openQuickAdd } from '../../core/quick-add.js';
import { addDays, formatDay, formatMonthDay, todayKey } from '../../core/manila.js';
import {
  PRIORITIES, SORTS, VIEWS, isDone, scheduledSubtasks, searchTasks, subtaskProgress, viewCounts, viewGroups, visibleViews,
} from './model.js';
import { loadTodo, placeBetween } from './store.js';
import { categoryChip, taskRow } from './rows.js';
import { bindCapture, captureMarkup } from './capture.js';
import { bindKeys, bindSwipes } from './gestures.js';
import { toggleDone, toggleSubDone } from './task-actions.js';
import { reminderSettings } from './alerts.js';
import { loadLinks } from './calendar-link.js';
import { exportTasksCsv } from './pages.js';
import './quickmenu.js';

let el = null;
let data = null;
let view = null;       // the view on screen (starts at Settings → Tasks → Opens on)
let query = '';
let capture = null;    // the plain-words box at the top
let pendingFocus = null;
const frozen = new Map(); // auto-sort off: the order each list had, kept until "Sort now"

const settings = () => state.settings.tasks;
const opensOn = () => (VIEWS[settings().view] ? settings().view : 'today');

/**
 * Starting values for a new task: the day of the view you're in (Today → today,
 * Upcoming → tomorrow, other views → no date; anywhere else in the app → today),
 * plus your default priority and category.
 */
export function newTaskDefaults() {
  const today = todayKey();
  const where = currentRoute() === 'todo' ? (view ?? opensOn()) : 'today';
  const s = settings();
  return {
    date: where === 'today' ? today : where === 'upcoming' ? addDays(today, 1) : null,
    priority: PRIORITIES[s.defaultPriority] ? s.defaultPriority : 'none',
    categoryId: s.defaultCategoryId ?? null,
    reminderMinutes: Number.isFinite(s.newTaskReminder) ? s.newTaskReminder : null,
  };
}

/* ---------- The model the screen draws from ---------- */

async function load() {
  const now = Date.now();
  const [d, links] = await Promise.all([loadTodo(now), loadLinks()]);
  const subItems = scheduledSubtasks(d.subtasks, d.tasks);
  data = {
    ...d, now, subItems, links, reminderSettings: reminderSettings(settings()),
    progress: subtaskProgress(d.subtasks), counts: viewCounts(d.tasks, now, subItems),
  };
  return data;
}

/** With auto-sort off, tasks keep their places until "Sort now" (new ones appear at the top). */
function keepOrder(key, list) {
  if (settings().autoSort) {
    frozen.delete(key);
    return list;
  }
  const order = frozen.get(key);
  if (!order) {
    frozen.set(key, list.map((t) => t.id));
    return list;
  }
  const at = new Map(order.map((id, i) => [id, i]));
  const result = [...list.filter((t) => !at.has(t.id)), ...list.filter((t) => at.has(t.id)).sort((a, b) => at.get(a.id) - at.get(b.id))];
  frozen.set(key, result.map((t) => t.id));
  return result;
}

const EMPTY = {
  today: ['sun', 'Nothing due today.', 'Type a task in the box above, or look at Upcoming.'],
  upcoming: ['calendar', 'Nothing planned for the next 7 days.', ''],
  overdue: ['checkCircle', 'Nothing overdue. Nice work!', ''],
  category: ['layers', 'No tasks yet.', 'Type one in the box above.'],
  all: ['checklist', 'No tasks yet.', 'Type one in the box above.'],
  completed: ['checkCircle', 'Tasks you complete will show here, with when you did them.', ''],
};

function listMarkup() {
  const m = data;
  const s = settings();
  const today = todayKey(m.now);
  const sort = s.sort in SORTS ? s.sort : 'smart';
  const filtered = searchTasks(m.tasks, query, m.categories);
  const subs = searchTasks(m.subItems, query, m.categories);
  const { groups, hidden } = viewGroups(view, filtered, { now: m.now, sort, completed: s.completed, categories: m.categories, subtasks: subs });
  const manual = sort === 'manual' && !query && view !== 'completed';
  const shown = groups.filter((g) => g.tasks.length);

  if (!shown.length) {
    const [ic, title, sub] = query ? ['search', `No tasks match “${query}”.`, 'Search looks in names, notes, tags and categories.'] : EMPTY[view];
    return html`<div class="card empty todo-empty">${icon(ic)}<span><strong>${title}</strong>${sub ? html`<br>${sub}` : ''}</span>
      ${!query && view !== 'completed' && view !== 'overdue' ? html`<button type="button" class="btn btn--sm btn--accent" data-action="todo:capture">${icon('plus')}New task</button>` : ''}</div>
      ${hidden ? hiddenNote(hidden) : ''}`;
  }

  return html`${shown.map((g) => {
    const list = view === 'completed' || g.done ? g.tasks : keepOrder(`${view}:${g.key}`, g.tasks);
    const title = g.title ? html`<h2 class="tgroup__title">${g.categoryId ? categoryChip(m.categories.get(g.categoryId)) : g.title}
        ${g.sub ? html`<span class="tgroup__sub">${formatMonthDay(g.sub)}</span>` : ''}<span class="tgroup__count" aria-label="${list.length} ${list.length === 1 ? 'task' : 'tasks'}">${list.length}</span></h2>` : '';
    return html`<section class="tgroup${g.done ? ' tgroup--done' : ''}" aria-label="${g.title || VIEWS[view].label}">
      ${title}
      <div class="tlist-head" aria-hidden="true"><span>Priority</span><span>Task</span><span>Time</span><span>Done</span></div>
      <ul class="tlist${manual && !g.done ? ' tlist--manual' : ''}" data-group="${g.key}" data-no-swipe>
        ${list.map((t, i) => taskRow(t, m, { manual: manual && !g.done && !isDone(t), index: i, count: list.length }))}
      </ul>
    </section>`;
  })}
  ${hidden ? hiddenNote(hidden) : ''}
  ${view === 'upcoming' ? html`<p class="group__foot">The next 7 days, ${formatDay(addDays(today, 1))} to ${formatDay(addDays(today, 7))}.</p>` : ''}`;
}

function hiddenNote(count) {
  return html`<p class="group__foot todo-hidden">${count} completed today ${count === 1 ? 'is' : 'are'} hidden (Settings → Tasks).
    <button type="button" class="text-btn" data-action="todo:completed">Show</button></p>`;
}

function summaryText() {
  const c = data.counts;
  const today = todayKey(data.now);
  if (view === 'today') {
    return `${formatDay(today)} · ${c.today ? `${c.today} to do` : 'all clear'}${c.overdue ? ` · ${c.overdue} overdue` : ''}`;
  }
  if (view === 'completed') return 'Everything you’ve completed, newest first';
  if (view === 'overdue') return c.overdue ? `${c.overdue} overdue — tap one to reschedule it` : 'Nothing overdue';
  if (view === 'upcoming') return `${c.upcoming} in the next 7 days`;
  return `${c.all} open ${c.all === 1 ? 'task' : 'tasks'}`;
}

function viewTabs() {
  const c = data.counts;
  const badge = { today: c.today, overdue: c.overdue };
  return html`<nav class="todo-views" aria-label="Task views" data-no-swipe>
    ${visibleViews(settings().views, opensOn()).map((key) => html`<button type="button" class="todo-view${key === 'overdue' && c.overdue ? ' has-alert' : ''}" data-action="todo:view" data-view="${key}" aria-pressed="${key === view ? 'true' : 'false'}">
      ${icon(VIEWS[key].icon)}<span>${VIEWS[key].short ?? VIEWS[key].label}</span>${badge[key] ? html`<span class="todo-view__count" aria-label="${badge[key]} tasks">${badge[key]}</span>` : ''}
    </button>`)}
  </nav>`;
}

/* ---------- Drawing ---------- */

/** Keep the chosen view's pill in sight in the sideways-scrolling row. */
function revealView() {
  const nav = el?.querySelector('.todo-views');
  const pill = nav?.querySelector('[aria-pressed="true"]');
  if (!pill || nav.scrollWidth <= nav.clientWidth) return;
  const left = pill.offsetLeft - nav.offsetLeft;
  if (left < nav.scrollLeft || left + pill.offsetWidth > nav.scrollLeft + nav.clientWidth) {
    nav.scrollLeft = Math.max(0, left - (nav.clientWidth - pill.offsetWidth) / 2);
  }
}

/** Right after a quick-menu action or a key: back to the task (it's redrawn a moment later). */
function focusPending() {
  if (!pendingFocus || !el || document.querySelector('dialog[open]')) return;
  el.querySelector(`.trow[data-id="${CSS.escape(pendingFocus)}"] > .trow__main`)?.focus({ preventScroll: true });
}

/**
 * Where the keyboard (or VoiceOver) was in the list before a redraw, so it can go
 * back to the same task — or, if the task has left this view, to the one now in its place.
 */
function listFocus(slot) {
  const active = document.activeElement;
  const row = active?.closest?.('.trow[data-id]');
  const id = pendingFocus ?? (row && slot.contains(row) ? row.dataset.id : null);
  if (!id) return null;
  const rows = [...slot.querySelectorAll('.trow[data-id]')];
  return { id, index: rows.findIndex((r) => r.dataset.id === id), part: active?.matches?.('.tcheck') ? '.tcheck' : '.trow__main' };
}

function restoreFocus(slot, spot) {
  pendingFocus = null;
  if (!spot || document.querySelector('dialog[open]')) return;
  const rows = [...slot.querySelectorAll('.trow[data-id]')];
  const same = rows.find((r) => r.dataset.id === spot.id);
  const next = same ?? rows[Math.min(Math.max(spot.index, 0), rows.length - 1)];
  const target = same ? same.querySelector(`:scope > ${spot.part}`) : next?.querySelector(':scope > .trow__main');
  (target ?? el.querySelector('.todo-view[aria-pressed="true"]'))?.focus({ preventScroll: true });
}

function drawList() {
  const slot = el?.querySelector('[data-slot="list"]');
  if (!slot || !data) return;
  const spot = listFocus(slot);
  setHTML(slot, listMarkup());
  el.querySelector('[data-slot="summary"]').textContent = summaryText();
  slot.querySelectorAll('.tlist--manual').forEach((list) => {
    makeReorderable(list, {
      onReorder: (ids, item) => {
        moveTo(item.dataset.id, ids);
        announce(`Moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
      },
    });
  });
  restoreFocus(slot, spot);
}

/** The parts above the list that follow the view and settings. */
function drawChrome() {
  const page = el.querySelector('[data-todo-page]');
  page.classList.toggle('todo-page--compact', settings().density === 'compact');
  const tabs = el.querySelector('.todo-views');
  const scrolled = tabs?.scrollLeft ?? 0;
  tabs.outerHTML = String(viewTabs());
  el.querySelector('.todo-views').scrollLeft = scrolled;
  const search = el.querySelector('[data-todo-search]');
  search.placeholder = `Search ${VIEWS[view].label.toLowerCase()}`;
  const sort = settings().sort in SORTS ? settings().sort : 'smart';
  const sortBtn = el.querySelector('[data-action="todo:sort"]');
  sortBtn.setAttribute('aria-label', `Sort: ${SORTS[sort]}${settings().autoSort ? '' : ', automatic sorting off'}. Change`);
  setHTML(sortBtn, html`${icon('sort')}<span>${SORTS[sort]}</span>`);
}

function drawPage() {
  setHTML(el, html`<div class="todo-page accent-todo" data-todo-page>
    ${pageHead({ title: 'To Do', iconName: 'checklist', accent: 'todo', eyebrow: 'Module',
      aside: html`<button type="button" class="icon-btn" data-action="todo:menu" aria-label="More: categories, recently deleted, export">${icon('more')}</button>` })}
    <div class="todo-capture" data-slot="capture">${captureMarkup({ placeholder: 'Add a task…' })}</div>
    <nav class="todo-views"></nav>
    <div class="todo-tools">
      <label class="todo-search">${icon('search')}<span class="sr-only">Search tasks</span>
        <input type="search" class="input" data-todo-search value="${query}" autocomplete="off" enterkeyhint="search"></label>
      <button type="button" class="btn btn--sm todo-sort" data-action="todo:sort"></button>
    </div>
    <p class="todo-summary" data-slot="summary" aria-live="polite"></p>
    <div class="todo-list" data-slot="list"></div>
  </div>`);
  capture = bindCapture(el.querySelector('[data-capture]'), { defaults: newTaskDefaults, keepFocus: true });
}

export async function showList(target) {
  el = target;
  if (!view) view = opensOn();
  await load();
  if (!visibleViews(settings().views, opensOn()).includes(view)) view = opensOn();
  if (!el.querySelector('[data-todo-page]')) drawPage();
  drawChrome();
  drawList();
  revealView();
}

/** Redraw after a change: the counts and the list only, so typing isn't interrupted. */
export async function refreshList() {
  if (!el || !el.isConnected || !el.querySelector('[data-todo-page]')) return;
  await load();
  drawChrome();
  drawList();
}

export function mountList(target) {
  target.addEventListener('input', (event) => {
    if (!event.target.matches('[data-todo-search]')) return;
    query = event.target.value;
    clearTimeout(mountList.timer);
    mountList.timer = setTimeout(drawList, 120);
  });
  bindSwipes(target);
  bindKeys(target, {
    focusCapture: () => {
      window.scrollTo({ top: 0 });
      capture?.focus();
    },
    focusSearch: () => target.querySelector('[data-todo-search]')?.focus(),
  });
}

on('todo-focus', ({ id }) => {
  pendingFocus = id;
  requestAnimationFrame(focusPending);
});

/* ---------- Actions ---------- */

function findTask(id) {
  return data?.tasks.find((t) => t.id === id) ?? null;
}

async function moveTo(id, ids) {
  const list = ids.map(findTask).filter(Boolean);
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return;
  await placeBetween(list[i], list[i - 1], list[i + 1]);
}

registerAction('todo:toggle', (btn) => (btn.dataset.kind === 'subtask' ? toggleSubDone(btn.dataset.id) : toggleDone(btn.dataset.id)));

// "New task" (Main dashboard, empty lists elsewhere): the Quick Add sheet, ready to type
registerAction('todo:new', () => openQuickAdd());

// The empty list's "New task": the box at the top of this screen
registerAction('todo:capture', () => {
  window.scrollTo({ top: 0 });
  capture?.focus();
});

registerAction('todo:view', (btn) => {
  if (btn.dataset.view === view) return;
  view = btn.dataset.view;
  if (el) showList(el);
});

registerAction('todo:completed', () => {
  view = 'completed';
  if (el) showList(el);
});

registerAction('todo:move', async (btn) => {
  const list = btn.closest('.tlist');
  const ids = [...list.children].map((li) => li.dataset.id);
  const from = ids.indexOf(btn.dataset.id);
  const to = from + Number(btn.dataset.dir);
  if (to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await moveTo(btn.dataset.id, ids);
  announce(`Moved to position ${to + 1} of ${ids.length}.`);
  requestAnimationFrame(() => el?.querySelector(`[data-id="${btn.dataset.id}"] [data-dir="${btn.dataset.dir}"]`)?.focus());
});

registerAction('todo:sort', async () => {
  const s = settings();
  const choice = await actionSheet({
    title: 'Sort tasks',
    message: 'Overdue tasks, then pinned ones, always come first (except in Manual order).',
    items: [
      ...Object.entries(SORTS).map(([value, label]) => ({
        label, value, checked: s.sort === value,
        detail: { smart: 'Overdue, then priority, then time', manual: 'Drag ≡ to arrange' }[value] ?? '',
      })),
      !s.autoSort && { label: 'Sort now', value: '__now', icon: 'refresh' },
      { label: s.autoSort ? 'Turn off automatic sorting' : 'Turn on automatic sorting', value: '__auto', icon: 'sort',
        detail: s.autoSort ? 'Tasks stay put until you sort' : '' },
    ],
  });
  if (!choice) return;
  frozen.clear();
  if (choice === '__now') {
    drawList();
    announce('Sorted.');
    return;
  }
  await updateSettings((next) => {
    if (choice === '__auto') next.tasks.autoSort = !next.tasks.autoSort;
    else next.tasks.sort = choice;
  });
  if (el) showList(el);
  if (choice === '__auto') toast(settings().autoSort ? 'Tasks re-sort as they change.' : 'Tasks stay where they are until you choose Sort now.', { icon: 'sort' });
});

registerAction('todo:menu', async () => {
  const deleted = data?.deleted.length ?? 0;
  const choice = await actionSheet({
    title: 'To Do',
    items: [
      { label: 'Categories', value: 'categories', icon: 'layers' },
      { label: 'Recently deleted', value: 'deleted', icon: 'trash', detail: deleted ? String(deleted) : '' },
      { label: 'Export tasks (CSV)', value: 'export', icon: 'download' },
      { label: 'How to type tasks', value: 'help', icon: 'help' },
      { label: 'Task settings', value: 'settings', icon: 'gear' },
    ],
  });
  if (choice === 'categories' || choice === 'deleted') openPage('todo', choice);
  else if (choice === 'export') exportTasksCsv();
  else if (choice === 'help') runAction('todo:help');
  else if (choice === 'settings') runAction('settings:tasks');
});
