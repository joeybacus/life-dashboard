/* Focus timer screens: the Focus page in the To Do tab (#/todo/focus) — a
   big countdown, or a short form to start, plus your focus totals — and the
   bar above the tabs while a session runs and you're on another screen.
   Start focus is on the + button, on a task's quick menu (left arm) and in a
   task's sheet. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { on as onEvent } from '../../core/events.js';
import { on, state } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, toast } from '../../core/ui.js';
import { currentRoute, currentSubRoute, onRoute, openPage } from '../../core/router.js';
import { registerQuickAdd } from '../../core/quick-add.js';
import { addDays, formatMoment, todayKey, weekdayOf } from '../../core/manila.js';
import { getActiveWorkout } from '../workout/store.js';
import { loadTodo } from '../todo/store.js';
import { isDone, isOverdue, sortTasks } from '../todo/model.js';
import {
  TYPE_NAMES, adjust, dismiss, focusTimer, formatLeft, isPaused, leftMs, loadSessions, pause, resume, sessionMinutes, skip, start, startNext, stop,
} from './timer.js';

const enabled = () => state.settings.focus?.enabled !== false;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 h 20 min", "45 min", "0 min" */
export function formatMinutes(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/* ---------- Starting ---------- */

/** Ask first if a workout is running (so two bars don't stack). Resolves true to go ahead. */
async function workoutCheck() {
  const workout = await getActiveWorkout();
  if (!workout) return true;
  return confirmDialog({
    title: 'A workout is in progress',
    message: `“${workout.title}” is still running. Start focusing anyway? The workout keeps going; while you focus, the bar at the bottom shows the focus timer.`,
    confirmLabel: 'Start focus',
  });
}

/** Start focusing on a task (or on nothing in particular). */
export async function startFocus(task = null, minutes = null) {
  if (focusTimer()?.endsAt && !(await confirmDialog({
    title: 'Start a new focus session?',
    message: `${TYPE_NAMES[focusTimer().type]} is running${focusTimer().title ? ` (${focusTimer().title})` : ''}. It stops, and the time so far is kept.`,
    confirmLabel: 'Start new',
  }))) return false;
  if (!(await workoutCheck())) return false;
  if (focusTimer()?.endsAt) await stop();
  start('focus', { task: task ? { id: task.id, title: task.title } : null, minutes });
  return true;
}

/* ---------- The Focus page ---------- */

let view = null;
let showing = false;
let pick = { taskId: '', minutes: null }; // the start form

export const focusPage = {
  async show(el) {
    view = el;
    showing = true;
    await render();
  },
  hide() {
    showing = false;
  },
};

async function render() {
  if (!view || !showing) return;
  const [sessions, d] = await Promise.all([loadSessions(), loadTodo()]);
  if (!showing) return;
  const t = focusTimer();
  setHTML(view, html`<div class="focus-page accent-todo">
    ${subHead({ title: 'Focus', back: 'To Do', fallback: '', accent: 'todo', actions: html`<button type="button" class="icon-btn" data-action="nav" data-route="settings" data-sub="" aria-label="Settings">${icon('gear')}</button>` })}
    ${t?.endsAt ? runningCard(t) : t?.next ? waitingCard(t) : startCard(d)}
    ${totalsCard(sessions, d)}
  </div>`);
}

function ring(t) {
  return html`<div class="focus-ring${t.type !== 'focus' ? ' is-break' : ''}${isPaused() ? ' is-paused' : ''}" data-focus-ring style="--p: ${(1 - leftMs() / (t.plannedMinutes * 60_000)).toFixed(4)}" role="timer" aria-label="${TYPE_NAMES[t.type]}${isPaused() ? ', paused' : ''}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="focus-ring__track" cx="60" cy="60" r="52"/><circle class="focus-ring__bar" cx="60" cy="60" r="52" pathLength="1"/></svg>
    <div class="focus-ring__inner">
      <span class="focus-ring__type">${TYPE_NAMES[t.type]}${isPaused() ? ' · paused' : ''}</span>
      <span class="focus-ring__time num" data-focus-left>${formatLeft(leftMs())}</span>
      <span class="focus-ring__plan">${t.plannedMinutes} min${t.type === 'focus' ? ` · session ${(t.done ?? 0) + 1}` : ''}</span>
    </div>
  </div>`;
}

function runningCard(t) {
  return html`<section class="card focus-card">
    ${t.title ? html`<p class="focus-card__task">${icon('checklist')}<span>${t.title}</span></p>` : html`<p class="focus-card__task faint">No task — just focus</p>`}
    ${ring(t)}
    <div class="focus-card__adjust">
      <button type="button" class="btn btn--sm btn--ghost" data-action="focus:adjust" data-min="-5" aria-label="5 minutes less">−5 min</button>
      <button type="button" class="btn btn--sm btn--ghost" data-action="focus:adjust" data-min="5" aria-label="5 minutes more">+5 min</button>
    </div>
    <div class="focus-card__btns">
      ${isPaused() ? html`<button type="button" class="btn btn--accent" data-action="focus:resume">${icon('play')}Resume</button>`
        : html`<button type="button" class="btn" data-action="focus:pause">${icon('pause')}Pause</button>`}
      <button type="button" class="btn" data-action="focus:skip">${icon('arrowRight')}${t.type === 'focus' ? 'Skip to break' : 'End break'}</button>
      <button type="button" class="btn btn--ghost" data-action="focus:stop">${icon('stop')}Stop</button>
    </div>
  </section>`;
}

function waitingCard(t) {
  const label = t.next === 'focus' ? 'Start focus' : `Start ${TYPE_NAMES[t.next].toLowerCase()}`;
  return html`<section class="card focus-card focus-card--wait">
    <span class="focus-card__icon">${icon(t.next === 'focus' ? 'timer' : 'checkCircle')}</span>
    <h2 class="focus-card__title">${t.endedType === 'focus' ? 'Focus session done' : t.endedType ? 'Break over' : 'Ready'}</h2>
    <p class="focus-card__sub">${t.title ? `${t.title} · ` : ''}${plural(t.done ?? 0, 'focus session')} so far${t.endedAt ? ` · ended ${formatMoment(t.endedAt)}` : ''}</p>
    <div class="focus-card__btns">
      <button type="button" class="btn btn--accent" data-action="focus:next">${icon('play')}${label}</button>
      ${t.next !== 'focus' ? html`<button type="button" class="btn" data-action="focus:again">${icon('timer')}Focus again</button>` : ''}
      <button type="button" class="btn btn--ghost" data-action="focus:dismiss">Done for now</button>
    </div>
  </section>`;
}

function startCard(d) {
  const today = todayKey();
  const open = sortTasks(d.tasks.filter((x) => !isDone(x) && (x.date === today || isOverdue(x) || (!x.date && x.pinned))), 'smart', { categories: d.categories }).slice(0, 12);
  if (pick.taskId && !d.tasks.some((x) => x.id === pick.taskId)) pick.taskId = '';
  const s = state.settings.focus;
  const lengths = [...new Set([s.focus, 15, 25, 45, 50].map(Number))].sort((a, b) => a - b);
  const minutes = pick.minutes ?? s.focus;
  return html`<section class="card focus-card focus-card--start">
    <h2 class="focus-card__title">Start focusing</h2>
    <p class="focus-card__sub">${s.focus} min focus, ${s.short} min break, ${s.long} min break after every ${s.every}. Change them in Settings → Focus.</p>
    <p class="field__label">How long</p>
    <div class="chips chips--sm focus-lengths">${lengths.map((m) => html`<button type="button" class="chip-toggle" data-action="focus:length" data-min="${m}" aria-pressed="${m === minutes ? 'true' : 'false'}">${m} min</button>`)}</div>
    <p class="field__label">On a task <small class="faint">(optional — its minutes are counted)</small></p>
    <div class="focus-tasks">
      <button type="button" class="focus-task${!pick.taskId ? ' is-picked' : ''}" data-action="focus:pick" data-id="" aria-pressed="${!pick.taskId ? 'true' : 'false'}">No task — just focus</button>
      ${open.map((x) => html`<button type="button" class="focus-task${pick.taskId === x.id ? ' is-picked' : ''}" data-action="focus:pick" data-id="${x.id}" aria-pressed="${pick.taskId === x.id ? 'true' : 'false'}">${x.title || 'Untitled task'}${x.focusMinutes ? html`<small>${formatMinutes(x.focusMinutes)} so far</small>` : ''}</button>`)}
      ${!open.length ? html`<p class="faint">No tasks for today. You can also start from a task’s quick menu (Focus).</p>` : ''}
    </div>
    <button type="button" class="btn btn--accent btn--block focus-card__go" data-action="focus:start">${icon('play')}Start ${minutes}-minute focus</button>
  </section>`;
}

/** Monday of a day's week (Manila). */
const weekStart = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));

function totalsCard(sessions, d) {
  const today = todayKey();
  const monday = weekStart(today);
  const day = (s) => todayKey(Date.parse(s.start));
  const todays = sessions.filter((s) => day(s) === today);
  const week = sessions.filter((s) => day(s) >= monday && day(s) <= today);
  const sum = (list) => list.reduce((n, s) => n + sessionMinutes(s), 0);
  const tasks = new Map(d.tasks.map((x) => [x.id, x]));
  const byCat = new Map();
  week.forEach((s) => {
    const cat = d.categories.get(tasks.get(s.taskId)?.categoryId);
    const name = cat?.name ?? (s.taskId ? 'No category' : 'No task');
    byCat.set(name, (byCat.get(name) ?? 0) + sessionMinutes(s));
  });
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  return html`<section class="card focus-totals" aria-labelledby="focus-totals-title">
    <h2 class="focus-totals__title" id="focus-totals-title">Your focus</h2>
    <div class="focus-totals__nums">
      <p><strong class="num">${formatMinutes(sum(todays))}</strong><span>today · ${plural(todays.length, 'session')}</span></p>
      <p><strong class="num">${formatMinutes(sum(week))}</strong><span>this week (since Monday)</span></p>
    </div>
    ${cats.length ? html`<ul class="focus-cats">${cats.map(([name, min]) => html`<li><span>${name}</span><span class="num">${formatMinutes(min)}</span></li>`)}</ul>` : ''}
    ${todays.length ? html`<h3 class="focus-totals__sub">Today</h3><ul class="focus-sessions">${todays.map((s) => html`<li>
      <span class="focus-sessions__time num">${formatMoment(s.start)}</span>
      <span class="focus-sessions__what">${tasks.get(s.taskId)?.title || s.title || 'No task'}</span>
      <span class="focus-sessions__min num">${formatMinutes(sessionMinutes(s))}${s.completed ? '' : ' · stopped early'}</span>
    </li>`)}</ul>` : html`<p class="faint">No focus sessions today yet.</p>`}
  </section>`;
}

/* ---------- The bar above the tabs ---------- */

let bar = null;

export function initFocusBar() {
  bar = document.createElement('div');
  bar.className = 'wbar fbar';
  bar.hidden = true;
  document.getElementById('app').append(bar);
  onEvent('focus', updateBar);
  onRoute(updateBar);
  on('settings', updateBar);
  updateBar();
}

const onFocusPage = () => currentRoute() === 'todo' && currentSubRoute() === 'focus';
const onWorkoutLog = () => currentRoute() === 'workout' && currentSubRoute() === 'log';

function setBarClass(shown) {
  const root = document.documentElement;
  root.classList.toggle('has-fbar', shown);
  root.classList.toggle('has-wbar', shown || root.classList.contains('has-wbar-workout'));
}

function updateBar() {
  if (!bar) return;
  const t = focusTimer();
  const shown = enabled() && Boolean(t) && !onFocusPage() && !onWorkoutLog();
  bar.hidden = !shown;
  setBarClass(shown);
  if (!shown) {
    setHTML(bar, '');
    return;
  }
  if (t.endsAt) {
    setHTML(bar, html`<div class="wbar__mini fbar__mini accent-todo">
      <button type="button" class="fbar__open" data-action="nav" data-route="todo" data-sub="focus" aria-label="${TYPE_NAMES[t.type]}${t.title ? `: ${t.title}` : ''}${isPaused() ? ', paused' : ''}. Open the focus timer">
        <span class="wbar__dot${isPaused() ? ' is-paused' : ''}${t.type !== 'focus' ? ' is-break' : ''}" aria-hidden="true"></span>
        <span class="wbar__title">${TYPE_NAMES[t.type]}${t.title ? html` <span class="fbar__task">· ${t.title}</span>` : ''}</span>
        <span class="wbar__elapsed num" data-focus-left aria-hidden="true">${formatLeft(leftMs())}</span>
      </button>
      <button type="button" class="icon-btn fbar__btn" data-action="${isPaused() ? 'focus:resume' : 'focus:pause'}" aria-label="${isPaused() ? 'Resume' : 'Pause'}">${icon(isPaused() ? 'play' : 'pause')}</button>
    </div>`);
    return;
  }
  setHTML(bar, html`<div class="wbar__mini fbar__mini accent-todo">
    <button type="button" class="fbar__open" data-action="nav" data-route="todo" data-sub="focus" aria-label="Focus: what's next. Open the focus timer">
      <span class="wbar__dot is-paused" aria-hidden="true"></span>
      <span class="wbar__title">${t.endedType === 'focus' ? 'Focus done' : 'Break over'}</span>
    </button>
    <button type="button" class="btn btn--sm btn--accent" data-action="focus:next">${t.next === 'focus' ? 'Focus' : t.next === 'long' ? 'Long break' : 'Break'}</button>
    <button type="button" class="icon-btn fbar__btn" data-action="focus:dismiss" aria-label="Done for now">${icon('x')}</button>
  </div>`);
}

// Keep the page current
onEvent('focus', () => { if (showing) render(); });
onEvent('data', ({ reason }) => { if (showing && (reason === 'sync' || reason === 'focus')) render(); });

/* ---------- Actions ---------- */

registerAction('focus:open', () => openPage('todo', 'focus'));
registerAction('focus:length', (el) => { pick.minutes = Number(el.dataset.min); render(); });
registerAction('focus:pick', (el) => { pick.taskId = el.dataset.id || ''; render(); });
registerAction('focus:start', async () => {
  const d = await loadTodo();
  const task = pick.taskId ? d.tasks.find((x) => x.id === pick.taskId) : null;
  const ok = await startFocus(task, pick.minutes ?? state.settings.focus.focus);
  if (ok) pick = { taskId: '', minutes: null };
});
registerAction('focus:pause', () => pause());
registerAction('focus:resume', () => resume());
registerAction('focus:adjust', (el) => adjust(Number(el.dataset.min) || 0));
registerAction('focus:skip', () => skip());
registerAction('focus:next', async () => {
  if (focusTimer()?.next === 'focus' && !(await workoutCheck())) return;
  startNext();
});
registerAction('focus:again', async () => {
  const t = focusTimer();
  if (!t || !(await workoutCheck())) return;
  start('focus', { task: t.taskId ? { id: t.taskId, title: t.title } : null });
});
registerAction('focus:dismiss', () => dismiss());
registerAction('focus:stop', async () => {
  const t = focusTimer();
  if (!t?.endsAt) return;
  const spent = Math.round((Date.now() - Date.parse(t.startedAt) - (t.pausedMs ?? 0)) / 60_000);
  const ok = t.type !== 'focus' || spent < 1 || await confirmDialog({
    title: 'Stop focusing?',
    message: `${formatMinutes(spent)} so far${t.title ? ` on “${t.title}”` : ''} ${t.title ? 'will be added to the task' : 'will be counted'}.`,
    confirmLabel: 'Stop',
  });
  if (!ok) return;
  const saved = await stop();
  if (saved) toast(`Focus stopped · ${formatMinutes(saved.minutes)} counted.`, { icon: 'timer' });
});

/** + button: Start focus. */
registerQuickAdd({
  id: 'focus',
  label: 'Start focus',
  icon: 'timer',
  accent: 'todo',
  order: 20,
  run: () => { if (enabled()) openPage('todo', 'focus'); else toast('The focus timer is off (Settings → Focus).', { icon: 'info' }); },
});

/** A task's quick menu (Focus) and its sheet: start focusing on it straight away. */
export async function focusOnTask(id) {
  const d = await loadTodo();
  const task = d.tasks.find((x) => x.id === id);
  if (!task) return;
  if (await startFocus(task)) toast(`Focusing on “${task.title}” · ${state.settings.focus.focus} min.`, { icon: 'timer', action: { label: 'Open', onClick: () => openPage('todo', 'focus') } });
}
