/* To Do module — Phase 1: dashboard card + a read-only preview of today's tasks
   in the three-column layout. Adding/editing tasks arrives in Phase 6. */
import { registerModule } from './registry.js';
import { registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { db } from '../core/db.js';
import { state, on, changed } from '../core/state.js';
import { html, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { PRIORITIES, pageHead, priorityChip, roadmapCard } from '../core/components.js';
import { toast } from '../core/ui.js';
import { atTime, formatRelativeDay, formatShortDate, formatTime, fromDateKey, taskTimeLabel, toDateKey } from '../core/dates.js';

export const SORT_OPTIONS = {
  smart: 'Smart (overdue, then priority, then time)',
  priority: 'Priority',
  time: 'Time',
  recent: 'Recently added',
  category: 'Category',
};

const SORT_NOTES = {
  smart: 'Smart order: overdue first, then priority, then time',
  priority: 'Sorted by priority',
  time: 'Sorted by time',
  recent: 'Newest first',
  category: 'Grouped by category',
};

export const COMPLETED_OPTIONS = {
  keep: 'Keep visible',
  move: 'Move to Completed',
  hide: 'Hide',
};

const rank = (t) => PRIORITIES[t.priority]?.rank ?? 3;
const timeKey = (t) => `${t.date ?? '9999-12-31'} ${t.startTime ?? '99:99'}`;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function isOverdue(task, now) {
  if (task.completed || !task.date) return false;
  const todayKey = toDateKey(now);
  if (task.date < todayKey) return true;
  if (task.date > todayKey) return false;
  const due = task.endTime || task.startTime;
  return Boolean(due) && atTime(task.date, due) < now;
}

/** Default smart order: overdue → high → medium → low, earliest time first within each. */
export function smartCompare(a, b, now) {
  const ao = isOverdue(a, now);
  const bo = isOverdue(b, now);
  if (ao !== bo) return ao ? -1 : 1;
  return rank(a) - rank(b) || cmp(timeKey(a), timeKey(b)) || cmp(a.createdAt, b.createdAt);
}

function sorter(mode, now, categories) {
  const catOrder = (t) => categories.get(t.categoryId)?.order ?? 999;
  switch (mode) {
    case 'priority': return (a, b) => rank(a) - rank(b) || cmp(timeKey(a), timeKey(b));
    case 'time': return (a, b) => cmp(timeKey(a), timeKey(b)) || rank(a) - rank(b);
    case 'recent': return (a, b) => cmp(b.createdAt, a.createdAt);
    case 'category': return (a, b) => catOrder(a) - catOrder(b) || smartCompare(a, b, now);
    default: return (a, b) => smartCompare(a, b, now);
  }
}

export async function loadTodoModel(now = new Date()) {
  const [tasks, categories] = await Promise.all([db.live('tasks'), db.live('taskCategories')]);
  const todayKey = toDateKey(now);
  const todayTasks = tasks.filter((t) => t.date === todayKey);
  const carriedOver = tasks.filter((t) => !t.completed && t.date && t.date < todayKey);
  const list = [...carriedOver, ...todayTasks];
  const pending = list.filter((t) => !t.completed).sort((a, b) => smartCompare(a, b, now));
  return {
    now,
    todayKey,
    categories: new Map(categories.map((c) => [c.id, c])),
    list,
    pending,
    top: pending[0] ?? null,
    overdueCount: list.filter((t) => isOverdue(t, now)).length,
    totalToday: todayTasks.length,
    doneToday: todayTasks.filter((t) => t.completed).length,
    remainingToday: todayTasks.filter((t) => !t.completed).length,
  };
}

function dueLabel(task, m) {
  if (isOverdue(task, m.now)) {
    return task.date < m.todayKey ? `Overdue · ${formatRelativeDay(fromDateKey(task.date), m.now)}` : 'Overdue';
  }
  return taskTimeLabel(task) ?? 'Anytime';
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
    if (!m.totalToday && !m.overdueCount) text = 'Nothing scheduled today';
    else if (!m.remainingToday) text = m.overdueCount ? `All done today · ${m.overdueCount} overdue` : 'All done for today';
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
    const footer = html`<div class="card-foot"><button type="button" class="link-btn" data-action="nav" data-route="todo">Open To Do ${icon('arrowRight')}</button></div>`;
    if (!m.pending.length) {
      return html`<div class="empty">${icon('checkCircle')}<span>${m.list.length ? 'Everything is done. Nice work!' : 'No tasks for today.'}</span></div>${footer}`;
    }
    const shown = m.pending.slice(0, 4);
    return html`<ul class="mini-tasks">${shown.map((t) => html`
      <li class="mini-task${isOverdue(t, m.now) ? ' is-overdue' : ''}">
        ${priorityChip(t.priority, { short: true })}
        <span class="mini-task__title">${t.title}</span>
        <span class="mini-task__time">${isOverdue(t, m.now) ? 'Overdue' : taskTimeLabel(t) ?? 'Anytime'}</span>
      </li>`)}</ul>
      ${m.pending.length > shown.length ? html`<p class="more-note">+${m.pending.length - shown.length} more</p>` : ''}
      ${footer}`;
  },
  glance(m) {
    const top = m.top;
    const topOverdue = top && isOverdue(top, m.now);
    return [
      {
        id: 'tasks', order: 10, icon: 'checklist', accent: 'todo', label: 'Tasks',
        big: String(m.remainingToday), value: 'remaining',
        sub: m.overdueCount ? `${m.overdueCount} overdue` : m.totalToday ? `${m.doneToday} of ${m.totalToday} done` : 'Nothing scheduled',
        subTone: m.overdueCount ? 'danger' : null,
        action: 'nav', data: { route: 'todo' },
      },
      {
        id: 'top', order: 20, icon: 'flag', accent: 'todo', label: 'Top priority',
        value: top ? top.title : 'Nothing pending',
        sub: top ? `${PRIORITIES[top.priority].label} · ${dueLabel(top, m)}` : 'You’re all caught up',
        subTone: topOverdue ? 'danger' : null,
        action: 'nav', data: { route: 'todo' },
      },
    ];
  },
});

registerAction('todo:preview', () => {
  toast('Checking off and editing tasks arrives in Phase 6.', { icon: 'checklist' });
});

/* ---- To Do screen (preview until Phase 6) ---- */

let screenEl = null;

function taskRow(t, m) {
  const overdue = isOverdue(t, m.now);
  const category = m.categories.get(t.categoryId);
  const start = t.startTime ? atTime(t.date, t.startTime) : null;
  const end = t.endTime ? atTime(t.date, t.endTime) : null;
  const time = start
    ? html`${formatTime(start)}${end ? html`<small>to ${formatTime(end)}</small>` : ''}`
    : html`<small>Anytime</small>`;
  return html`<div class="task-row${t.completed ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}" role="row">
    <span role="cell">${priorityChip(t.priority, { short: true })}</span>
    <span role="cell">
      <span class="task-title">${t.title}</span>
      <span class="task-meta">
        ${overdue ? html`<span class="tag tag--overdue">${dueLabel(t, m)}</span>` : ''}
        ${category ? html`<span>${category.name}</span>` : ''}
      </span>
    </span>
    <span role="cell" class="task-time">${time}</span>
    <span role="cell"><span class="task-check" role="img" aria-label="${t.completed ? 'Completed' : 'Not completed'}" data-action="todo:preview">${icon('check')}</span></span>
  </div>`;
}

function taskTable(rows, m, label) {
  if (!rows.length) return html`<div class="card task-empty">No tasks here.</div>`;
  return html`<div class="card task-table" role="table" aria-label="${label}">
    <div class="task-row task-row--head" role="row">
      <span role="columnheader">Priority</span><span role="columnheader">Task</span><span role="columnheader">Time</span><span role="columnheader"><span class="sr-only">Done</span></span>
    </div>
    ${rows.map((t) => taskRow(t, m))}
  </div>`;
}

async function renderScreen() {
  if (!screenEl) return;
  const m = await loadTodoModel(new Date());
  const { sort, completed } = state.settings.tasks;
  const done = m.list.filter((t) => t.completed);
  const rows = (completed === 'keep' ? [...m.list] : m.list.filter((t) => !t.completed)).sort(sorter(sort, m.now, m.categories));
  const completedRows = completed === 'move' ? done.sort((a, b) => cmp(b.completedAt ?? '', a.completedAt ?? '')) : [];

  setHTML(screenEl, html`
    ${pageHead({ title: 'To Do', iconName: 'checklist', accent: 'todo', eyebrow: 'Module', aside: html`<span class="badge accent-todo">Preview</span>` })}
    <p class="todo-date">Today · ${formatShortDate(m.now)} · ${m.remainingToday} remaining${m.overdueCount ? ` · ${m.overdueCount} overdue` : ''}</p>
    ${taskTable(rows, m, 'Today’s tasks')}
    ${completedRows.length ? html`<section class="section" aria-labelledby="todo-done-title">
      <div class="section__head"><h2 class="section__title" id="todo-done-title">Completed</h2></div>
      ${taskTable(completedRows, m, 'Completed tasks')}
    </section>` : ''}
    <p class="group__foot">${SORT_NOTES[sort] ?? SORT_NOTES.smart}${completed === 'hide' && done.length ? ` · ${done.length} completed hidden` : ''}. Change this in Settings.</p>
    <div class="accent-todo">${roadmapCard({
      phase: 6,
      title: 'Full task manager',
      note: 'This is a read-only preview of your sample tasks. Adding, editing and checking off tasks comes in Phase 6.',
      items: [
        ['plus', 'Add & edit tasks with time ranges'],
        ['bell', 'Reminders (5, 10, 30 min, 1 hour, custom)'],
        ['refresh', 'Recurring tasks'],
        ['checklist', 'Subtasks with progress'],
        ['layers', 'Custom categories'],
        ['sort', 'Update/Sort button'],
      ],
    })}</div>`);
}

registerScreen('todo', {
  title: 'To Do',
  icon: 'checklist',
  accent: 'todo',
  mount(el) { screenEl = el; },
  onShow: renderScreen,
});

const refreshIfVisible = () => { if (screenEl && !screenEl.hidden) renderScreen(); };
on('data', refreshIfVisible);
on('settings', ({ prev, next }) => { if (changed(prev, next, 'tasks')) refreshIfVisible(); });
