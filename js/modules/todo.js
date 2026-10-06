/* To Do module: the dashboard card, Today at a Glance, and the To Do tab.

   Pages of the To Do tab (#/todo/…):
     (none)        the list: the plain-words box, views, search, sorting, quick menu
     focus         the focus timer (focus/)
     habits        your habits: add, edit, reorder, history (habits/)
     deleted       Recently deleted (restore for 30 days)
     categories    add, rename, recolour, reorder and delete categories
   The pieces live in js/modules/todo/. Tasks use Manila time (js/core/manila.js). */
import { registerModule } from './registry.js';
import { registerScreen, replacePage } from '../core/router.js';
import { changed, on, state } from '../core/state.js';
import { html, setHTML } from '../core/html.js';
import { registerQuickAdd } from '../core/quick-add.js';
import { icon } from '../core/icons.js';
import { formatClock, todayKey } from '../core/manila.js';
import { PRIORITIES, isDone, isOverdue, scheduledSubtasks, sortTasks, subtaskProgress, viewCounts, viewGroups } from './todo/model.js';
import { loadTodo } from './todo/store.js';
import { checkButton, priorityChip } from './todo/rows.js';
import { mountList, newTaskDefaults, refreshList, showList } from './todo/list.js';
import { categoriesPage, deletedPage } from './todo/pages.js';
import { bindCapture, captureMarkup } from './todo/capture.js';
import { focusPage, formatMinutes } from './focus/page.js';
import { focusTimer, loadSessions, sessionMinutes } from './focus/timer.js';
import { habitsOn, habitsPage, habitsToday } from './habits/ui.js';

/** What the dashboard card and Today at a Glance show. */
export async function loadTodoModel(now = new Date()) {
  const ms = now.getTime();
  const d = await loadTodo(ms);
  const today = todayKey(ms);
  const subs = scheduledSubtasks(d.subtasks, d.tasks); // subtasks with a date count as rows too
  const { groups } = viewGroups('today', d.tasks, { now: ms, sort: 'smart', completed: 'keep', categories: d.categories, subtasks: subs });
  const list = groups[0]?.tasks ?? [];
  const pending = list.filter((t) => !isDone(t));
  const counts = viewCounts(d.tasks, ms, subs);
  const focusToday = (await loadSessions()).filter((s) => todayKey(Date.parse(s.start)) === today).reduce((n, s) => n + sessionMinutes(s), 0);
  const upcomingTimed = sortTasks([...d.tasks, ...subs].filter((t) => !isDone(t) && t.date === today && t.startTime), 'time', { now: ms })
    .filter((t) => !isOverdue(t, ms));
  return {
    now: ms,
    today,
    categories: d.categories,
    progress: subtaskProgress(d.subtasks),
    list,
    pending,
    doneToday: list.filter(isDone).length,
    totalToday: list.length,
    remainingToday: pending.length,
    overdueCount: counts.overdue,
    top: pending.find((t) => t.priority !== 'none') ?? pending[0] ?? null,
    next: upcomingTimed[0] ?? null,
    focusToday,
    habits: habitsOn() ? await habitsToday(today) : null,
  };
}

function dueWords(t, m) {
  if (isOverdue(t, m.now)) return 'Overdue';
  if (t.date === m.today) return t.startTime ? formatClock(t.startTime) : 'Today';
  return t.date ? 'Later' : 'Pinned';
}

/* ---- Dashboard card ---- */

registerModule({
  id: 'todo',
  title: 'To Do',
  icon: 'checklist',
  accent: 'todo',
  status: 'active',
  load: loadTodoModel,
  summary(m) {
    let text;
    if (!m.totalToday) text = m.overdueCount ? `${m.overdueCount} overdue` : 'Nothing due today';
    else if (!m.remainingToday) text = 'All done for today';
    else text = `${m.remainingToday} left today${m.overdueCount ? ` · ${m.overdueCount} overdue` : ''}`;
    return {
      text,
      progress: m.totalToday ? m.doneToday / m.totalToday : null,
      ringText: m.totalToday ? `${m.doneToday}/${m.totalToday}` : '',
      ringLabel: m.totalToday ? `${m.doneToday} of ${m.totalToday} tasks done today` : 'No tasks today',
      idleIcon: m.totalToday ? null : 'checklist',
    };
  },
  body(m) {
    const footer = html`<div class="card-foot">
      <button type="button" class="link-btn" data-action="todo:new">${icon('plus')}New task</button>
      <button type="button" class="link-btn" data-action="nav" data-route="todo" data-sub="">Open To Do ${icon('arrowRight')}</button>
    </div>`;
    if (!m.pending.length) {
      const habitsOnly = m.habits?.total ? html`<div class="mini-habits" aria-label="Habits today">
        <p class="mini-habits__title">${icon('flame')}Habits · ${m.habits.doneCount} of ${m.habits.total}</p>
        <div class="mini-habits__list">${m.habits.items.map((i) => html`<button type="button" class="hab-tick hab-tick--chip${i.done ? ' is-done' : ''}" role="checkbox" aria-checked="${i.done ? 'true' : 'false'}" data-action="habit:tick" data-id="${i.habit.id}" aria-label="${i.habit.name}"><span class="pt__box">${icon('check')}</span><span class="hab-tick__name">${i.habit.name}</span></button>`)}</div>
      </div>` : '';
      return html`${habitsOnly}<div class="empty">${icon('checkCircle')}<span>${m.totalToday ? 'Everything for today is done. Nice work!' : 'No tasks for today.'}</span></div>${footer}`;
    }
    const habits = m.habits?.total ? html`<div class="mini-habits" aria-label="Habits today">
      <p class="mini-habits__title">${icon('flame')}Habits · ${m.habits.doneCount} of ${m.habits.total}</p>
      <div class="mini-habits__list">${m.habits.items.map((i) => html`<button type="button" class="hab-tick hab-tick--chip${i.done ? ' is-done' : ''}" role="checkbox" aria-checked="${i.done ? 'true' : 'false'}" data-action="habit:tick" data-id="${i.habit.id}" aria-label="${i.habit.name}"><span class="pt__box">${icon('check')}</span><span class="hab-tick__name">${i.habit.name}</span></button>`)}</div>
    </div>` : '';
    const shown = m.pending.slice(0, 5);
    return html`${habits}<ul class="mini-tasks">${shown.map((t) => html`
      <li class="mini-task${isOverdue(t, m.now) ? ' is-overdue' : ''}">
        ${checkButton(t)}
        <button type="button" class="mini-task__open" data-action="todo:quick" data-id="${t.id}" data-kind="${t.kind === 'subtask' ? 'subtask' : 'task'}"
          aria-label="${t.kind === 'subtask' ? `Subtask of ${t.parentTitle}: ` : ''}${t.title}. Opens the quick menu.">
          <span class="mini-task__title">${t.title}</span>
          <span class="mini-task__meta">${t.kind === 'subtask' ? html`<span class="mini-task__parent">↳ ${t.parentTitle}</span>` : priorityChip(t.priority)}<span class="mini-task__time">${dueWords(t, m)}</span></span>
        </button>
      </li>`)}</ul>
      ${m.pending.length > shown.length ? html`<p class="more-note">+${m.pending.length - shown.length} more</p>` : ''}
      ${footer}`;
  },
  glance(m) {
    const top = m.top;
    return [
      {
        id: 'tasks', order: 10, icon: 'checklist', accent: 'todo', label: 'Tasks',
        big: String(m.remainingToday), value: 'left today',
        sub: m.overdueCount ? `${m.overdueCount} overdue` : m.totalToday ? `${m.doneToday} of ${m.totalToday} done` : 'Nothing due today',
        subTone: m.overdueCount ? 'danger' : null,
        action: 'nav', data: { route: 'todo', sub: '' },
      },
      {
        id: 'top', order: 20, icon: 'flag', accent: 'todo', label: 'Top priority',
        value: top ? top.title : 'Nothing pending',
        sub: top ? `${PRIORITIES[top.priority].label} priority · ${dueWords(top, m)}` : 'You’re all caught up',
        subTone: top && isOverdue(top, m.now) ? 'danger' : null,
        action: top ? 'todo:open' : 'nav', data: top ? { id: top.id, kind: top.kind ?? 'task' } : { route: 'todo', sub: '' },
      },
      {
        id: 'next-task', order: 25, icon: 'clock', accent: 'todo', label: 'Next task',
        value: m.next ? m.next.title : 'No more timed tasks today',
        sub: m.next ? formatClock(m.next.startTime) : 'Untimed tasks are in To Do',
        action: m.next ? 'todo:open' : 'nav', data: m.next ? { id: m.next.id, kind: m.next.kind ?? 'task' } : { route: 'todo', sub: '' },
      },
      ...(m.habits?.any ? [{
        id: 'habits', order: 26, icon: 'flame', accent: 'todo', label: 'Habits',
        big: String(m.habits.doneCount), value: `of ${m.habits.total} done`,
        sub: m.habits.total && m.habits.doneCount === m.habits.total ? 'All done today' : m.habits.total ? 'today · tap to tick' : 'None due today',
        action: 'nav', data: { route: 'todo', sub: '' },
      }] : []),
      ...(state.settings.focus?.enabled !== false ? [{
        id: 'focus', order: 27, icon: 'timer', accent: 'todo', label: 'Focus',
        value: formatMinutes(m.focusToday), sub: focusTimer()?.endsAt ? 'Session running' : 'today · tap to focus',
        action: 'nav', data: { route: 'todo', sub: 'focus' },
      }] : []),
    ];
  },
});

/* ---- Quick Add (+): the plain-words box comes first ---- */

registerQuickAdd({
  id: 'task',
  primary: true,
  order: 0,
  mount(slot, { close }) {
    setHTML(slot, captureMarkup({ placeholder: 'Type a new task…', label: 'New task, in plain words' }));
    const box = bindCapture(slot.querySelector('[data-capture]'), { defaults: newTaskDefaults, keepFocus: false, onAdded: () => close('added') });
    box.focus(); // still inside the tap, so the iPhone keyboard opens
    return box;
  },
});

/* ---- The To Do tab and its pages ---- */

const listPage = { show: (el) => showList(el) };
const ROUTES = [
  [/^$/, listPage],
  [/^deleted$/, deletedPage],
  [/^categories$/, categoriesPage],
  [/^focus$/, focusPage],
  [/^habits$/, habitsPage],
];

let view = null;
let page = null;
let visible = false;

function route(el, sub) {
  for (const [pattern, def] of ROUTES) {
    if (!pattern.test(sub)) continue;
    if (page && page !== def) page.hide?.();
    page = def;
    return def.show(el);
  }
  replacePage('');
  return null;
}

registerScreen('todo', {
  title: 'To Do',
  icon: 'checklist',
  accent: 'todo',
  mount(el) {
    view = el;
    mountList(el);
  },
  onShow(el, sub) {
    visible = true;
    return route(el, sub);
  },
  onRoute(el, sub) {
    return route(el, sub);
  },
  onHide() {
    visible = false;
    page?.hide?.();
  },
});

// Keep the screen current when tasks change (here, in a sheet, from sync, at midnight…)
on('data', () => {
  if (!visible || !page) return;
  if (page === listPage) refreshList();
  else page.show(view);
});
on('settings', ({ prev, next }) => {
  if (visible && page === listPage && changed(prev, next, 'tasks')) showList(view);
});

// Overdue changes with the clock: check each minute while the list is on screen
let overdueKey = '';
setInterval(async () => {
  if (!visible || page !== listPage || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
  const d = await loadTodo();
  const key = `${todayKey()}|${d.tasks.filter((t) => isOverdue(t)).map((t) => t.id).join(',')}`;
  if (overdueKey && key !== overdueKey) refreshList();
  overdueKey = key;
}, 60_000);

