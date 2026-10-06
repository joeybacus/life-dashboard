/* Habits screens: today's checklist (a card at the top of the To Do list),
   the Habits page (#/todo/habits) to add, edit and reorder them, a habit's
   sheet (streaks, the last 7 days, a month you can fill in), the editor, and
   "Log habit" on the + button. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { on as onEvent } from '../../core/events.js';
import { state, updateUI } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { makeReorderable } from '../../core/reorder.js';
import { registerQuickAdd } from '../../core/quick-add.js';
import { haptic } from '../../core/feedback.js';
import { formatDayLong, todayKey } from '../../core/manila.js';
import {
  GROUPS, MAX_NAME, WEEKDAY_LETTER, WEEKDAY_SHORT, cleanSchedule, dueOn, groupOrder, lastSeven, monthGrid, scheduleText, streakText, streaks, weekCount,
} from './model.js';
import { deleteHabit, loadHabits, reorderHabits, saveHabit, setDone } from './store.js';

export const habitsOn = () => state.settings.habits?.enabled !== false;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Today's habits: [{ habit, done, streak, week }] in group order, plus counts. For the To Do card and the dashboard. */
export async function habitsToday(today = todayKey()) {
  const { habits, done } = await loadHabits();
  const due = habits.filter((h) => dueOn(h, done(h.id), today));
  const order = groupOrder(due);
  const items = order.flatMap((g) => due.filter((h) => (h.group || GROUPS[0]) === g)).map((h) => ({
    habit: h,
    done: done(h.id).has(today),
    streak: streaks(h, done(h.id), today),
    week: h.schedule.kind === 'perWeek' ? weekCount(h, done(h.id), today) : null,
  }));
  return { items, total: items.length, doneCount: items.filter((i) => i.done).length, any: habits.length > 0 };
}

function tick(item, { compact = false } = {}) {
  const h = item.habit;
  return html`<button type="button" class="hab-tick${item.done ? ' is-done' : ''}" role="checkbox" aria-checked="${item.done ? 'true' : 'false'}"
      data-action="habit:tick" data-id="${h.id}" aria-label="${h.name}${item.done ? ', done today' : ''}">
    <span class="pt__box">${icon('check')}</span>${compact ? html`<span class="hab-tick__name">${h.name}</span>` : ''}
  </button>`;
}

function meta(item) {
  const parts = [];
  if (item.streak.current) parts.push(html`<span class="hab-streak">${icon('flame')}${streakText(item.streak.current, item.streak.unit)}</span>`);
  if (item.week != null) parts.push(html`<span>${item.week} of ${item.habit.schedule.times} this week</span>`);
  return parts.length ? html`<span class="hab-row__meta">${parts}</span>` : '';
}

/* ---------- Today's checklist (top of the To Do list) ---------- */

export async function renderHabitsCard(slot) {
  if (!slot) return;
  if (!habitsOn()) {
    setHTML(slot, '');
    return;
  }
  const t = await habitsToday();
  const collapsed = Boolean(state.ui?.habitsCollapsed);
  if (!t.any) {
    setHTML(slot, html`<section class="card hab-card hab-card--empty">
      <span class="hab-card__icon">${icon('flame')}</span>
      <span class="hab-card__text"><strong>Habits</strong><span>Build a daily routine with streaks.</span></span>
      <button type="button" class="btn btn--sm" data-action="habit:new">${icon('plus')}Add a habit</button>
    </section>`);
    return;
  }
  const groups = groupOrder(t.items.map((i) => i.habit));
  setHTML(slot, html`<section class="card hab-card${collapsed ? ' is-collapsed' : ''}" aria-labelledby="hab-card-title">
    <div class="hab-card__head">
      <button type="button" class="hab-card__toggle" data-action="habit:collapse" aria-expanded="${collapsed ? 'false' : 'true'}">
        <span class="hab-card__icon">${icon('flame')}</span>
        <span class="hab-card__title" id="hab-card-title">Habits today</span>
        <span class="hab-card__count">${t.total ? `${t.doneCount} of ${t.total}` : 'none due'}</span>
        ${icon('chevronDown', 'hab-card__chev')}
      </button>
      <button type="button" class="icon-btn" data-action="nav" data-route="todo" data-sub="habits" aria-label="Manage habits">${icon('list')}</button>
    </div>
    ${collapsed ? '' : t.total ? groups.map((g) => html`<div class="hab-group">
      <p class="hab-group__title">${g}</p>
      <ul class="hab-list">${t.items.filter((i) => (i.habit.group || GROUPS[0]) === g).map((i) => html`<li class="hab-row${i.done ? ' is-done' : ''}">
        ${tick(i)}
        <button type="button" class="hab-row__open" data-action="habit:open" data-id="${i.habit.id}">
          <span class="hab-row__name">${i.habit.name}</span>${meta(i)}
        </button>
      </li>`)}</ul>
    </div>`) : html`<p class="hab-card__none">Nothing due today. ${icon('checkCircle')}</p>`}
  </section>`);
}

/* ---------- The Habits page ---------- */

let pageEl = null;
let pageShowing = false;

export const habitsPage = {
  async show(el) {
    pageEl = el;
    pageShowing = true;
    await renderPage();
  },
  hide() {
    pageShowing = false;
  },
};

function strip(days) {
  return html`<span class="hab-strip" aria-hidden="true">${days.map((d) => html`<span class="hab-strip__day is-${d.state}" title="${d.key}"></span>`)}</span>`;
}
const stripWords = (days) => `Last 7 days: ${days.filter((d) => d.state === 'done').length} done`;

async function renderPage() {
  if (!pageEl || !pageShowing) return;
  const { habits, done } = await loadHabits();
  if (!pageShowing) return;
  const today = todayKey();
  setHTML(pageEl, html`<div class="hab-page accent-todo">
    ${subHead({ title: 'Habits', back: 'To Do', fallback: '', accent: 'todo', actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="habit:new">${icon('plus')}New</button>` })}
    ${!habitsOn() ? html`<p class="note">${icon('info')}<span>Habits are turned off, so they’re hidden in To Do and on the dashboard. Turn them on in Settings → Focus and habits.</span></p>` : ''}
    ${habits.length ? html`<ol class="card hab-all" data-hab-list>${habits.map((h) => {
      const set = done(h.id);
      const s = streaks(h, set, today);
      const days = lastSeven(h, set, today);
      return html`<li class="hab-item${h.active === false ? ' is-paused' : ''}" data-id="${h.id}">
        <span class="ward-col__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
        <button type="button" class="hab-item__open" data-action="habit:open" data-id="${h.id}">
          <span class="hab-item__name">${h.name}${h.active === false ? html` <small>(paused)</small>` : ''}</span>
          <span class="hab-item__sub">${h.group || GROUPS[0]} · ${scheduleText(h.schedule)}${s.current ? html` · <span class="hab-streak">${icon('flame')}${streakText(s.current, s.unit)}</span>` : ''}</span>
          ${strip(days)}<span class="sr-only">${stripWords(days)}</span>
        </button>
      </li>`;
    })}</ol>` : html`<section class="card ward-intro">
      <span class="ward-intro__icon">${icon('flame')}</span>
      <h2 class="ward-intro__title">No habits yet</h2>
      <p class="ward-intro__text">Habits are for things you want to build a streak on — meditate, read, drink water. For something with a time, deadline or reminder, use a repeating task instead.</p>
      <button type="button" class="btn btn--accent btn--block" data-action="habit:new">${icon('plus')}Add a habit</button>
    </section>`}
  </div>`);
  const list = pageEl.querySelector('[data-hab-list]');
  if (list) makeReorderable(list, { onReorder: (ids) => reorderHabits(ids) });
}

/* ---------- One habit (a sheet) ---------- */

function monthView(h, set, ym, today) {
  const [y, m] = ym.split('-').map(Number);
  const cells = monthGrid(y, m);
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
  return html`<div class="hab-month">
    <div class="hab-month__nav">
      <button type="button" class="icon-btn" data-hact="month" data-dir="-1" aria-label="Previous month">${icon('chevronLeft')}</button>
      <p class="hab-month__label">${label}</p>
      <button type="button" class="icon-btn" data-hact="month" data-dir="1" aria-label="Next month"${raw(ym >= today.slice(0, 7) ? ' disabled' : '')}>${icon('chevronRight')}</button>
    </div>
    <div class="hab-month__grid" role="grid" aria-label="${label}">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`<span class="hab-month__wd" aria-hidden="true">${d}</span>`)}
      ${cells.map((key) => {
        if (!key) return html`<span></span>`;
        const isDone = set.has(key);
        const future = key > today;
        return html`<button type="button" class="hab-month__day${isDone ? ' is-done' : ''}${key === today ? ' is-today' : ''}" data-hact="day" data-day="${key}"
          aria-pressed="${isDone ? 'true' : 'false'}" aria-label="${formatDayLong(key)}${isDone ? ', done' : ''}"${raw(future ? ' disabled' : '')}>${Number(key.slice(8))}</button>`;
      })}
    </div>
    <p class="hab-month__hint">Tap a day to mark it done or not (today and earlier).</p>
  </div>`;
}

function detailBody(h, set, ym) {
  if (!h) return html`<p class="dlg__msg">This habit was deleted.</p>`;
  const today = todayKey();
  const s = streaks(h, set, today);
  const days = lastSeven(h, set, today);
  const doneToday = set.has(today);
  return html`<div class="hab-detail">
    <p class="ptd__meta">${h.group || GROUPS[0]} · ${scheduleText(h.schedule)}${h.active === false ? ' · paused' : ''}</p>
    <div class="hab-stats">
      <p><strong class="num">${s.current}</strong><span>${s.unit === 'week' ? 'week' : 'day'} streak</span></p>
      <p><strong class="num">${s.best}</strong><span>best</span></p>
      <p><strong class="num">${weekCount(h, set, today)}</strong><span>this week${h.schedule.kind === 'perWeek' ? ` of ${h.schedule.times}` : ''}</span></p>
    </div>
    <button type="button" class="btn btn--block ${doneToday ? '' : 'btn--accent'}" data-hact="today">${icon(doneToday ? 'x' : 'check')}${doneToday ? 'Not done today' : 'Done today'}</button>
    <div class="hab-seven" aria-label="${stripWords(days)}">${days.map((d) => html`<span class="hab-seven__day is-${d.state}"><span class="hab-seven__wd">${WEEKDAY_LETTER[new Date(`${d.key}T00:00:00Z`).getUTCDay()]}</span><span class="hab-seven__dot"></span></span>`)}</div>
    ${monthView(h, set, ym, today)}
    <div class="rfd__foot">
      <button type="button" class="btn btn--sm" data-hact="edit">${icon('edit')}Edit</button>
      <button type="button" class="btn btn--sm" data-hact="pause">${icon(h.active === false ? 'play' : 'pause')}${h.active === false ? 'Resume' : 'Pause'}</button>
      <button type="button" class="btn btn--sm btn--ghost ward-col__remove" data-hact="delete">${icon('trash')}Delete</button>
    </div>
  </div>`;
}

export async function openHabit(id) {
  let { habits, done } = await loadHabits();
  let h = habits.find((x) => x.id === id);
  if (!h) return;
  let ym = todayKey().slice(0, 7);
  let dialog = null;
  const redraw = async () => {
    ({ habits, done } = await loadHabits());
    h = habits.find((x) => x.id === id);
    const body = dialog?.querySelector('.dlg__body');
    if (!body || !dialog.open) return;
    setHTML(body, detailBody(h, h ? done(h.id) : new Set(), ym));
    const title = dialog.querySelector('.dlg__title');
    if (title && h) title.textContent = h.name;
  };
  const stop = onEvent('data', ({ reason }) => { if (reason === 'habits' || reason === 'sync') redraw(); });
  await openDialog({
    variant: 'sheet',
    className: 'ward-detail hab-sheet accent-todo',
    title: h.name,
    body: detailBody(h, done(h.id), ym),
    actions: [{ label: 'Close', value: 'close', variant: 'ghost' }],
    onOpen(dlg, close) {
      dialog = dlg;
      dlg.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-hact]');
        if (!b || !h) return;
        const act = b.dataset.hact;
        if (act === 'today') {
          const on = !done(h.id).has(todayKey());
          await setDone(h.id, todayKey(), on);
          if (on) haptic();
          announce(on ? `${h.name}: done today.` : `${h.name}: not done today.`);
        } else if (act === 'day') {
          const key = b.dataset.day;
          await setDone(h.id, key, !done(h.id).has(key));
        } else if (act === 'month') {
          const [y, m] = ym.split('-').map(Number);
          const d = new Date(Date.UTC(y, m - 1 + Number(b.dataset.dir), 1));
          ym = d.toISOString().slice(0, 7);
          redraw();
        } else if (act === 'edit') {
          await editHabit(h.id);
        } else if (act === 'pause') {
          await saveHabit({ id: h.id, active: h.active === false });
          toast(h.active === false ? `${h.name} is back in your daily list.` : `${h.name} paused — it’s kept, but not shown in Today.`, { icon: 'check' });
        } else if (act === 'delete') {
          if (await confirmDialog({ title: `Delete “${h.name}”?`, message: 'The habit and its history are deleted on all your devices. To keep its history, pause it instead.', confirmLabel: 'Delete', destructive: true })) {
            await deleteHabit(h.id);
            close(null);
            toast('Habit deleted.', { icon: 'trash' });
          }
        }
      });
    },
  });
  stop();
}

/* ---------- Adding or editing a habit ---------- */

export async function editHabit(id = null) {
  const existing = id ? (await loadHabits()).habits.find((x) => x.id === id) : null;
  const allGroups = [...new Set([...GROUPS, ...(await loadHabits()).habits.map((x) => x.group).filter(Boolean)])];
  const start = {
    name: existing?.name ?? '',
    group: existing?.group ?? GROUPS[0],
    schedule: cleanSchedule(existing?.schedule ?? { kind: 'daily' }),
  };
  let schedule = structuredClone(start.schedule);
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit hab-edit accent-todo',
    dismissible: false,
    title: existing ? 'Edit habit' : 'New habit',
    body: html`<form class="form" data-habform novalidate>
      <label class="field"><span class="field__label">Habit</span>
        <input class="input" name="name" maxlength="${MAX_NAME}" value="${start.name}" placeholder="For example: Read 20 pages" autocomplete="off" autocapitalize="sentences" enterkeyhint="done">
      </label>
      <div class="field"><span class="field__label" id="hab-group-label">Time of day</span>
        <div class="chips chips--sm" role="radiogroup" aria-labelledby="hab-group-label" data-groups>${allGroups.map((g) => html`<button type="button" class="chip-toggle" data-group="${g}" aria-pressed="${g === start.group ? 'true' : 'false'}">${g}</button>`)}</div>
        <input class="input hab-edit__own" name="ownGroup" maxlength="30" placeholder="Or your own (e.g. Weekend)" autocomplete="off" value="${allGroups.includes(start.group) ? '' : start.group}">
      </div>
      <div class="field"><span class="field__label" id="hab-sched-label">How often</span>
        <div class="segmented" role="radiogroup" aria-labelledby="hab-sched-label">
          ${[['daily', 'Every day'], ['days', 'Chosen days'], ['perWeek', 'Times a week']].map(([k, label]) => html`<label class="segmented__opt"><input type="radio" name="kind" value="${k}"${raw(start.schedule.kind === k ? ' checked' : '')}><span>${label}</span></label>`)}
        </div>
        <div class="chips chips--sm hab-edit__days" data-days${raw(start.schedule.kind === 'days' ? '' : ' hidden')}>${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<button type="button" class="chip-toggle" data-day="${d}" aria-pressed="${(start.schedule.days ?? [1, 2, 3, 4, 5]).includes(d) && start.schedule.kind === 'days' ? 'true' : 'false'}">${WEEKDAY_SHORT[d]}</button>`)}</div>
        <div class="stepper hab-edit__times" data-times${raw(start.schedule.kind === 'perWeek' ? '' : ' hidden')} role="group" aria-label="Times a week">
          <button type="button" class="stepper__btn" data-step="-1" aria-label="Fewer">${icon('minus')}</button>
          <span class="stepper__value" data-times-value aria-live="polite">${start.schedule.times ?? 3}</span>
          <button type="button" class="stepper__btn" data-step="1" aria-label="More">${icon('plus')}</button>
          <span class="muted">times a week</span>
        </div>
      </div>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${existing ? 'Save' : 'Add habit'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-habform]');
      const error = form.querySelector('[data-error]');
      const daysEl = form.querySelector('[data-days]');
      const timesEl = form.querySelector('[data-times]');
      let group = start.group;
      if (schedule.kind !== 'days') schedule.days = [1, 2, 3, 4, 5];
      if (schedule.kind !== 'perWeek') schedule.times = 3;
      if (!existing && matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.name.focus({ preventScroll: true }), 320);
      const values = () => ({ name: form.elements.name.value.trim(), group: form.elements.ownGroup.value.trim() || group, schedule: cleanSchedule(schedule) });
      form.addEventListener('change', (event) => {
        if (event.target.name !== 'kind') return;
        schedule.kind = event.target.value;
        daysEl.hidden = schedule.kind !== 'days';
        timesEl.hidden = schedule.kind !== 'perWeek';
      });
      form.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('click', async (event) => {
        const g = event.target.closest('[data-group]');
        if (g) {
          group = g.dataset.group;
          form.elements.ownGroup.value = '';
          form.querySelectorAll('[data-group]').forEach((b) => b.setAttribute('aria-pressed', String(b === g)));
          return;
        }
        const d = event.target.closest('[data-day]');
        if (d) {
          const day = Number(d.dataset.day);
          schedule.days = schedule.days.includes(day) ? schedule.days.filter((x) => x !== day) : [...schedule.days, day];
          d.setAttribute('aria-pressed', String(schedule.days.includes(day)));
          return;
        }
        const st = event.target.closest('[data-step]');
        if (st) {
          schedule.times = Math.min(7, Math.max(1, schedule.times + Number(st.dataset.step)));
          form.querySelector('[data-times-value]').textContent = schedule.times;
          return;
        }
        if (event.target.closest('[data-cancel]')) {
          const now = values();
          const changed = now.name !== start.name || now.group !== start.group || JSON.stringify(now.schedule) !== JSON.stringify(start.schedule);
          if (changed && !(await confirmDialog({ title: existing ? 'Discard your changes?' : 'Discard this habit?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          close(null);
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const now = values();
        if (!now.name) {
          setHTML(error, html`Name the habit.`);
          error.hidden = false;
          form.elements.name.focus();
          return;
        }
        if (schedule.kind === 'days' && !schedule.days.length) {
          setHTML(error, html`Choose at least one day.`);
          error.hidden = false;
          return;
        }
        close(now);
      });
    },
  });
  if (!result || typeof result !== 'object') return null;
  const saved = await saveHabit({ ...(existing ? { id: existing.id } : {}), ...result });
  toast(existing ? 'Habit saved.' : `“${saved.name}” added.`, { icon: 'checkCircle' });
  return saved;
}

/* ---------- Log habit (+ button) ---------- */

async function openLogSheet() {
  if (!habitsOn()) {
    toast('Habits are off (Settings → Focus and habits).', { icon: 'info' });
    return;
  }
  const draw = async () => {
    const t = await habitsToday();
    return t.any
      ? t.total ? html`<ul class="hab-log">${t.items.map((i) => html`<li>${tick(i, { compact: true })}${meta(i)}</li>`)}</ul>`
        : html`<p class="dlg__msg">No habits due today.</p>`
      : html`<p class="dlg__msg">You haven’t added any habits yet.</p><button type="button" class="btn btn--accent btn--block" data-action="habit:new">${icon('plus')}Add a habit</button>`;
  };
  let dialog = null;
  const stop = onEvent('data', async ({ reason }) => {
    if (reason !== 'habits' || !dialog?.open) return;
    setHTML(dialog.querySelector('.dlg__body'), await draw());
  });
  await openDialog({
    variant: 'sheet',
    className: 'hab-log-sheet accent-todo',
    title: 'Log habits',
    body: await draw(),
    actions: [{ label: 'Done', value: 'done', variant: 'primary' }],
    onOpen(dlg) { dialog = dlg; },
  });
  stop();
}

registerQuickAdd({ id: 'habit', label: 'Log habit', icon: 'flame', accent: 'todo', order: 15, run: () => openLogSheet() });

/* ---------- Actions ---------- */

registerAction('habit:tick', async (el) => {
  const id = el.dataset.id;
  const today = todayKey();
  const { habits, done } = await loadHabits();
  const h = habits.find((x) => x.id === id);
  if (!h) return;
  const on = !done(id).has(today);
  el.setAttribute('aria-checked', String(on)); // shows straight away
  el.classList.toggle('is-done', on);
  await setDone(id, today, on);
  if (on) {
    haptic();
    const s = streaks(h, new Set([...done(id), today]), today);
    announce(`${h.name} done${s.current > 1 ? ` · ${streakText(s.current, s.unit)} in a row` : ''}.`);
  } else announce(`${h.name}: not done today.`);
});
registerAction('habit:open', (el) => openHabit(el.dataset.id));
registerAction('habit:new', () => editHabit());
registerAction('habit:collapse', async () => {
  await updateUI((ui) => { ui.habitsCollapsed = !ui.habitsCollapsed; });
  renderHabitsCard(document.querySelector('[data-slot="habits"]'));
});

onEvent('data', ({ reason }) => { if (pageShowing && (reason === 'habits' || reason === 'sync' || reason === 'new-day')) renderPage(); });
