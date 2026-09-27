/* The To Do screen: smart views (Today, Upcoming, Overdue, By category, All,
   Completed), search, the Sort button, and the tasks themselves — cards on
   iPhone, a table (Priority | Task | Time | ✓) on iPad landscape and Mac.
   Tapping a task opens it; the circle on the right ticks it. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction, runAction } from '../../core/actions.js';
import { state, updateSettings } from '../../core/state.js';
import { pageHead } from '../../core/components.js';
import { actionSheet, announce, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { makeReorderable } from '../../core/reorder.js';
import { addDays, formatDay, formatMonthDay, todayKey } from '../../core/manila.js';
import { SORTS, VIEWS, VIEW_KEYS, isDone, searchTasks, subtaskProgress, viewCounts, viewGroups } from './model.js';
import { getTask, loadTodo, placeBetween, putBack, setDone } from './store.js';
import { categoryChip, taskRow } from './rows.js';
import { openNewTask, openTask } from './detail.js';
import { exportTasksCsv } from './pages.js';

let el = null;
let data = null;
let view = null;       // the view on screen (starts at Settings → Tasks → Default view)
let query = '';
const frozen = new Map(); // auto-sort off: the order each list had, kept until "Sort now"

const settings = () => state.settings.tasks;

/* ---------- The model the screen draws from ---------- */

async function load() {
  const now = Date.now();
  const d = await loadTodo(now);
  data = { ...d, now, progress: subtaskProgress(d.subtasks), counts: viewCounts(d.tasks, now) };
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
  today: ['sun', 'Nothing due today.', 'Add a task, or look at Upcoming.'],
  upcoming: ['calendar', 'Nothing planned for the next 7 days.', ''],
  overdue: ['checkCircle', 'Nothing overdue. Nice work!', ''],
  category: ['layers', 'No tasks yet.', 'Tap New task to add one.'],
  all: ['checklist', 'No tasks yet.', 'Tap New task to add one.'],
  completed: ['checkCircle', 'Tasks you complete will show here, with when you did them.', ''],
};

function listMarkup() {
  const m = data;
  const s = settings();
  const today = todayKey(m.now);
  const sort = s.sort in SORTS ? s.sort : 'smart';
  const filtered = searchTasks(m.tasks, query, m.categories);
  const { groups, hidden } = viewGroups(view, filtered, { now: m.now, sort, completed: s.completed, categories: m.categories });
  const manual = sort === 'manual' && !query && view !== 'completed';
  const shown = groups.filter((g) => g.tasks.length);

  if (!shown.length) {
    const [ic, title, sub] = query ? ['search', `No tasks match “${query}”.`, 'Search looks in titles, notes, tags and categories.'] : EMPTY[view];
    return html`<div class="card empty todo-empty">${icon(ic)}<span><strong>${title}</strong>${sub ? html`<br>${sub}` : ''}</span>
      ${!query && view !== 'completed' && view !== 'overdue' ? html`<button type="button" class="btn btn--sm btn--accent" data-action="todo:new">${icon('plus')}New task</button>` : ''}</div>
      ${hidden ? hiddenNote(hidden) : ''}`;
  }

  return html`${shown.map((g) => {
    const list = view === 'completed' || g.done ? g.tasks : keepOrder(`${view}:${g.key}`, g.tasks);
    const title = g.title ? html`<h2 class="tgroup__title">${g.categoryId ? categoryChip(m.categories.get(g.categoryId)) : g.title}
        ${g.sub ? html`<span class="tgroup__sub">${formatMonthDay(g.sub)}</span>` : ''}<span class="tgroup__count" aria-label="${list.length} ${list.length === 1 ? 'task' : 'tasks'}">${list.length}</span></h2>` : '';
    return html`<section class="tgroup${g.done ? ' tgroup--done' : ''}" aria-label="${g.title || VIEWS[view].label}">
      ${title}
      <div class="tlist-head" aria-hidden="true"><span>Priority</span><span>Task</span><span>Time</span><span>Done</span></div>
      <ul class="tlist${manual && !g.done ? ' tlist--manual' : ''}" data-group="${g.key}">
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
    ${VIEW_KEYS.map((key) => html`<button type="button" class="todo-view${key === 'overdue' && c.overdue ? ' has-alert' : ''}" data-action="todo:view" data-view="${key}" aria-pressed="${key === view ? 'true' : 'false'}">
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

function drawList() {
  const slot = el?.querySelector('[data-slot="list"]');
  if (!slot || !data) return;
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
}

export async function showList(target) {
  el = target;
  if (!view) view = VIEWS[settings().view] ? settings().view : 'today';
  await load();
  const sort = settings().sort in SORTS ? settings().sort : 'smart';
  setHTML(el, html`<div class="todo-page accent-todo">
    ${pageHead({ title: 'To Do', iconName: 'checklist', accent: 'todo', eyebrow: 'Module',
      aside: html`<button type="button" class="icon-btn" data-action="todo:menu" aria-label="More: categories, recently deleted, export">${icon('more')}</button>` })}
    <button type="button" class="btn btn--accent btn--block todo-new" data-action="todo:new">${icon('plus')}New task</button>
    ${viewTabs()}
    <div class="todo-tools">
      <label class="todo-search">${icon('search')}<span class="sr-only">Search tasks</span>
        <input type="search" class="input" data-todo-search value="${query}" placeholder="Search ${VIEWS[view].label.toLowerCase()}" autocomplete="off" enterkeyhint="search"></label>
      <button type="button" class="btn btn--sm todo-sort" data-action="todo:sort" aria-label="Sort: ${SORTS[sort]}${settings().autoSort ? '' : ', automatic sorting off'}. Change">
        ${icon('sort')}<span>${SORTS[sort]}</span></button>
    </div>
    <p class="todo-summary" data-slot="summary" aria-live="polite"></p>
    <div class="todo-list" data-slot="list"></div>
  </div>`);
  drawList();
  revealView();
}

/** Redraw after a change: only the list (and counts), so typing in search isn't interrupted. */
export async function refreshList() {
  if (!el || !el.isConnected || !el.querySelector('[data-slot="list"]')) return;
  await load();
  const tabs = el.querySelector('.todo-views');
  const scrolled = tabs?.scrollLeft ?? 0;
  if (tabs) tabs.outerHTML = String(viewTabs());
  const fresh = el.querySelector('.todo-views');
  if (fresh) fresh.scrollLeft = scrolled;
  drawList();
}

export function mountList(target) {
  target.addEventListener('input', (event) => {
    if (!event.target.matches('[data-todo-search]')) return;
    query = event.target.value;
    clearTimeout(mountList.timer);
    mountList.timer = setTimeout(drawList, 120);
  });
}

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

/** Tick or untick (from the list, the dashboard, or anywhere with data-action="todo:toggle"). */
export async function toggleTask(id) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  const before = { ...task };
  const done = !isDone(task);
  await setDone(task, done);
  if (done) {
    toast(`Done: ${task.title}`, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => putBack(before) } });
    announce(`${task.title} done.`);
  } else {
    announce(`${task.title} is not done.`);
  }
}

registerAction('todo:toggle', (btn) => toggleTask(btn.dataset.id));
registerAction('todo:open', (btn) => openTask(btn.dataset.id));

registerAction('todo:new', (btn) => {
  const today = todayKey();
  // Added while looking at Today (or from the dashboard): for today. Upcoming: tomorrow. Elsewhere: no date.
  const from = btn?.closest?.('.todo-page') ? view : 'today';
  openNewTask(from === 'today' ? { date: today } : from === 'upcoming' ? { date: addDays(today, 1) } : {});
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
      { label: 'Task settings', value: 'settings', icon: 'gear' },
    ],
  });
  if (choice === 'categories' || choice === 'deleted') openPage('todo', choice);
  else if (choice === 'export') exportTasksCsv();
  else if (choice === 'settings') runAction('settings:tasks');
});
