/* Main dashboard — the daily command center:
   profile + date → Today (Google Calendar and the app's own things, or a quote) → At a Glance → module cards. */
import { openPage, registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { state, on, updateSettings, updateUI } from '../core/state.js';
import { html, raw, setHTML, dataAttrs } from '../core/html.js';
import { icon } from '../core/icons.js';
import { avatar, ring } from '../core/components.js';
import { animateReorder, makeReorderable } from '../core/reorder.js';
import { announce, toast } from '../core/ui.js';
import { getModule, getModules } from '../modules/registry.js';
import { getAgenda } from '../services/calendar.js';
import { calendarItems } from '../modules/calendar/items.js';
import { openEventDetails } from '../modules/calendar/editor.js';
import { openTask } from '../modules/todo/detail.js';
import { openSubtask } from '../modules/todo/subtask-sheet.js';
import { addDays as addDayKey, at, todayKey } from '../core/manila.js';
import { backupReminderDue, snoozeBackupReminder } from '../services/backup.js';
import { syncSnapshot, syncStatusText } from '../services/sync.js';
import { quoteOfTheDay } from '../services/quotes.js';
import {
  formatAgo, formatCountdown, formatLongDate, formatRelativeDay, formatTime, formatTimeRange, greeting, toDateKey,
} from '../core/dates.js';

let root = null;
let slots = {};
let snapshot = null;
let reorder = null;
let arranging = false;
let visible = false;
let entered = false;
let ticker = null;
let refreshSeq = 0;

const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') || /^var\(--[a-z0-9-]+\)$/.test(c ?? '') ? c : '#5563ff');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function initDashboard() {
  registerScreen('main', {
    title: 'Main',
    navLabel: 'Main',
    ariaLabel: 'Main dashboard',
    icon: 'dashboard',
    accent: 'brand',
    primary: true,
    mount,
    onShow,
    onHide,
  });

  registerAction('dash:toggle', (el) => toggleCard(el.closest('.mcard')));
  registerAction('dash:arrange', () => setArranging(!arranging));
  registerAction('dash:move', (el) => moveCard(el.closest('.mcard'), Number(el.dataset.dir)));
  registerAction('dash:event', (el) => openNextEvent(el.dataset.eventId));
  registerAction('dash:item', (el) => openTodayItem(el.dataset.itemId));
  registerAction('backup:later', async () => {
    await snoozeBackupReminder(3);
    toast('OK — I’ll remind you again in a few days.', { icon: 'bell' });
  });

  on('settings', ({ source }) => { if (source !== 'dashboard') refreshIfVisible(); });
  on('profile', () => refreshIfVisible());
  on('data', () => refreshIfVisible());
  on('backup', () => refreshIfVisible());
  on('sync', () => { if (visible && snapshot) renderHero(); });
  on('ward', () => refreshIfVisible());
  on('referrals', () => refreshIfVisible());
  on('units', () => refreshIfVisible());
  on('calendar', () => refreshIfVisible()); // Google Calendar events arrived
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfVisible();
  });
}

function mount(view) {
  root = view;
  view.classList.add('dash');
  setHTML(view, html`
    <h1 class="sr-only" tabindex="-1">Main dashboard</h1>
    <header class="hero" data-slot="hero" data-enter style="--i: 0"></header>
    <div data-slot="banner"></div>

    <div class="dash__grid">
      <div class="dash__col">
        <section class="section" aria-labelledby="dash-today-title" data-enter style="--i: 1">
          <div class="section__head">
            <h2 class="section__title" id="dash-today-title">Today</h2>
            <span class="section__meta" data-slot="calSource"></span>
            <a class="text-btn" href="#/todo/calendar" data-action="nav" data-route="todo" data-sub="calendar">Calendar</a>
          </div>
          <div data-slot="today"></div>
        </section>

        <section class="section glance-section" aria-labelledby="dash-glance-title" data-enter style="--i: 2">
          <div class="section__head"><h2 class="section__title" id="dash-glance-title">Today at a Glance</h2></div>
          <div class="glance" data-slot="glance"></div>
        </section>
      </div>

      <div class="dash__col">
        <section class="section" aria-labelledby="dash-modules-title" data-enter style="--i: 3">
          <div class="section__head">
            <h2 class="section__title" id="dash-modules-title">Modules</h2>
            <button type="button" class="text-btn" data-action="dash:arrange" data-slot="arrangeBtn" aria-pressed="false">Arrange</button>
          </div>
          <ol class="module-list" data-slot="modules"></ol>
          <p class="arrange-hint" data-slot="arrangeHint" hidden>Drag the handles to reorder, then tap Done.</p>
        </section>
      </div>
    </div>`);

  slots = Object.fromEntries([...view.querySelectorAll('[data-slot]')].map((el) => [el.dataset.slot, el]));
  reorder = makeReorderable(slots.modules, {
    canStart: () => arranging,
    onReorder: (ids, item) => {
      saveOrder(ids);
      announce(`${getModule(item.dataset.id).title} moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
    },
  });
}

async function onShow() {
  visible = true;
  if (!entered) {
    entered = true;
    root.classList.add('is-entering');
    setTimeout(() => root.classList.remove('is-entering'), 1400);
  }
  await refresh();
  clearInterval(ticker);
  // Keep countdowns ("in 25 min") and "happening now" fresh while the dashboard is open
  ticker = setInterval(() => {
    if (document.visibilityState === 'visible') refresh({ cards: false });
  }, 30_000);
}

function onHide() {
  visible = false;
  clearInterval(ticker);
  if (arranging) setArranging(false);
}

function refreshIfVisible() {
  if (visible && document.visibilityState === 'visible') refresh();
}

/** Reload everything the dashboard shows from the database (and calendar). */
async function refresh({ cards = true } = {}) {
  const seq = ++refreshSeq;
  const now = new Date();
  const modules = getModules();
  let agenda;
  let models;
  let reminder;
  try {
    [agenda, reminder, ...models] = await Promise.all([getAgenda(now), backupReminderDue(now.getTime()), ...modules.map((m) => m.load(now))]);
  } catch (err) {
    console.error('Dashboard refresh failed', err);
    toast('Couldn’t load some dashboard data. Try reopening the app.', { icon: 'info' });
    return;
  }
  const today = await loadToday(now, agenda);
  if (seq !== refreshSeq) return; // a newer refresh has started
  snapshot = { now, agenda, today, reminder, models: Object.fromEntries(modules.map((m, i) => [m.id, models[i]])) };
  renderHero();
  renderBanner();
  renderToday();
  renderGlance();
  if (cards && !reorder.isDragging()) renderModules();
}

/* ---- Profile + date ---- */

function renderHero() {
  const p = state.profile;
  const { now } = snapshot;
  setHTML(slots.hero, html`
    <button type="button" class="hero__avatar" data-action="settings:profile" aria-label="Edit profile">${avatar(p, { size: 'lg' })}</button>
    <div class="hero__text">
      <p class="hero__greet">${greeting(now)}${p.nickname ? ',' : ''}</p>
      ${p.nickname
        ? html`<p class="hero__name">${p.nickname}</p>`
        : html`<button type="button" class="hero__name hero__name--empty" data-action="settings:profile">Add your name</button>`}
      <p class="hero__date"><time datetime="${toDateKey(now)}">${formatLongDate(now)}</time></p>
      <div class="hero__chips">
        ${state.settings.sampleData.enabled
          ? html`<button type="button" class="chip chip--sample" data-action="settings:data" aria-label="Sample data is on. Open data settings.">Sample data</button>`
          : ''}
        ${syncChip()}
      </div>
    </div>`);
}

function syncChip() {
  const s = syncSnapshot();
  if (!s.connected) return '';
  let [tone, label, iconName] = ['ok', 'Synced', 'cloudCheck'];
  if (s.phase === 'syncing') [tone, label, iconName] = ['busy', 'Syncing', 'refresh'];
  else if (s.phase === 'offline') [tone, label, iconName] = ['muted', 'Offline', 'wifi'];
  else if (s.phase === 'error') [tone, label, iconName] = ['warn', 'Sync issue', 'info'];
  else if (s.scriptOutdated) [tone, label, iconName] = ['warn', 'Update sync', 'sparkles'];
  else if (s.pending && !s.auto) [tone, label, iconName] = ['muted', 'Not synced', 'cloud'];
  return html`<button type="button" class="chip chip--sync chip--${tone}" data-action="settings:sync" aria-label="${syncStatusText(s)}. Open sync settings.">${icon(iconName)}${label}</button>`;
}

/* ---- Backup reminder ---- */

function renderBanner() {
  const due = snapshot.reminder;
  if (!due) {
    setHTML(slots.banner, '');
    return;
  }
  setHTML(slots.banner, html`<div class="banner accent-brand" role="status">
    <span class="banner__icon">${icon('shield')}</span>
    <div class="banner__text">
      <p class="banner__title">Back up your data</p>
      <p class="banner__sub">${due.lastBackupAt ? `Last backup ${formatAgo(due.lastBackupAt)}.` : 'You haven’t made a backup yet.'} Or turn on automatic sync in Settings.</p>
    </div>
    <div class="banner__actions">
      <button type="button" class="btn btn--sm btn--ghost" data-action="backup:later">Later</button>
      <button type="button" class="btn btn--sm btn--primary" data-action="backup:export">Back up</button>
    </div>
  </div>`);
}

/* ---- Today: Google Calendar + the app's own things ---- */

const TIMED = new Set(['event', 'task', 'subtask', 'workout']);
const RANK = { habits: 0, todos: 1, referrals: 2 };

const eventItem = (e) => ({
  id: `ev:${e.id}`, kind: 'event', title: e.title, sub: e.calendar, allDay: e.allDay,
  start: e.start, end: e.end, color: e.color, done: false, event: e,
});

/**
 * Today's items, as the Calendar page shows them (same calendars and layers),
 * with two changes for the dashboard: referrals become a count (patient names
 * stay on the Calendar page) and to-dos without a time become one "To-dos" chip.
 */
async function loadToday(now, agenda) {
  const key = todayKey(now.getTime());
  let list = [];
  try {
    list = await calendarItems(key, addDayKey(key, 1));
  } catch (err) {
    console.warn('Today’s items unavailable', err);
  }
  if (agenda.provider.id === 'sample') list = [...list, ...agenda.today.map(eventItem)];

  const allDay = [];
  const timed = [];
  const todos = [];
  let referrals = 0;
  for (const i of list) {
    if (i.kind === 'referral') referrals += 1;
    else if (i.allDay && (i.kind === 'task' || i.kind === 'subtask')) todos.push(i);
    else if (i.kind === 'habits') allDay.push({ ...i, sub: i.sub === 'All done' ? 'all done' : '' }); // "Habits 3/5" says the rest
    else (i.allDay ? allDay : timed).push(i);
  }
  if (todos.length) {
    const left = todos.filter((t) => !t.done).length;
    allDay.push({ id: 'todos', kind: 'todos', title: plural(todos.length, 'to-do'), sub: left ? `${left} left` : 'all done', color: 'var(--todo)', done: !left });
  }
  if (referrals) allDay.push({ id: 'referrals', kind: 'referrals', title: 'Referrals', sub: `${referrals} to see`, color: 'var(--neuro)' });
  allDay.sort((a, b) => (RANK[a.kind] ?? 3) - (RANK[b.kind] ?? 3));
  timed.sort((a, b) => a.start - b.start);

  // Next up: the first timed thing today not over (or done); else Google's next, up to a week ahead
  const dayEnd = at(addDayKey(key, 1));
  let next = timed.find((i) => TIMED.has(i.kind) && !i.done && i.end > now) ?? null;
  if (!next && agenda.next && agenda.next.start >= dayEnd) next = eventItem(agenda.next);

  const byId = new Map([...allDay, ...timed, ...(next ? [next] : [])].map((i) => [i.id, i]));
  return { allDay, timed, next, byId, empty: !allDay.length && !timed.length };
}

function renderToday() {
  const { agenda, today, now } = snapshot;
  slots.calSource.textContent = agenda.provider.label;

  if (today.empty) {
    setHTML(slots.today, agenda.error
      ? html`<div class="card empty">${icon('info')}<span>Your calendar is unavailable right now.</span></div>`
      : quoteCard(now, agenda));
    return;
  }
  const { next, allDay, timed } = today;
  setHTML(slots.today, html`
    ${next ? nextCard(next, now) : html`<div class="card done-card">${icon('checkCircle')}<span>That’s everything for today.</span></div>`}
    ${allDay.length ? html`<div class="today-chips" role="list" aria-label="All day">${allDay.map(dayChip)}</div>` : ''}
    ${timed.length ? html`<ol class="agenda card" aria-label="Today’s schedule">${timed.map((i) => agendaItem(i, now, next))}</ol>` : ''}
    ${agenda.error ? html`<p class="today-note">${icon('info')}<span>Google Calendar is unavailable right now — showing the app’s own things.</span></p>` : ''}`);
}

function quoteCard(now, agenda) {
  const q = quoteOfTheDay(now);
  return html`<div class="quote card">
    <span class="quote__mark" aria-hidden="true">“</span>
    <figure>
      <blockquote class="quote__text">${q.text}</blockquote>
      <figcaption class="quote__by">— ${q.author}</figcaption>
    </figure>
    <p class="quote__foot">${icon('calendar')}<span>${agenda.provider.connected
      ? 'Nothing on today'
      : 'No calendar connected yet — update the sync script to see Google Calendar'}</span></p>
  </div>`;
}

const KIND_LABEL = { task: 'To-do', subtask: 'Subtask', workout: '' };

/** The grey line under a title: where and which calendar, or what kind of thing it is. */
function metaOf(i) {
  if (i.kind === 'event') return [i.event.location, i.sub].filter(Boolean).join(' · ');
  return [KIND_LABEL[i.kind], i.sub].filter(Boolean).join(' · ');
}

function nextCard(i, now) {
  const ongoing = i.start <= now && i.end > now;
  const sameDay = todayKey(i.start.getTime()) === todayKey(now.getTime());
  const when = ongoing ? `Ends ${formatCountdown(i.end - now)}` : `Starts ${formatCountdown(i.start - now)}`;
  const e = i.event;
  return html`<button type="button" class="next-event card" data-action="dash:item" data-item-id="${i.id}" style="--cal: ${safeColor(i.color)}">
    <span class="next-event__top">
      ${ongoing
        ? html`<span class="live-pill"><span class="live-pill__dot" aria-hidden="true"></span>Happening now</span>`
        : html`<span class="next-event__eyebrow">${sameDay ? 'Next up' : `Next up · ${formatRelativeDay(i.start, now)}`}</span>`}
      <span class="next-event__when">${when}</span>
    </span>
    <span class="next-event__title">${i.title}</span>
    <span class="next-event__time">${i.allDay ? 'All day' : formatTimeRange(i.start, i.end)}</span>
    <span class="next-event__meta">
      ${e?.location ? html`<span>${icon('pin')}${e.location}</span>` : ''}
      ${e ? html`<span class="cal-tag"><span class="cal-tag__dot" aria-hidden="true"></span>${i.sub}</span>`
        : html`<span class="cal-tag"><span class="cal-tag__dot" aria-hidden="true"></span>${metaOf(i) || 'Workout'}</span>`}
    </span>
    ${ongoing ? html`<span class="next-event__progress" style="--p: ${((now - i.start) / (i.end - i.start)).toFixed(3)}" aria-hidden="true"></span>` : ''}
  </button>`;
}

function dayChip(i) {
  return html`<button type="button" role="listitem" class="today-chip${i.done ? ' is-done' : ''}" data-action="dash:item" data-item-id="${i.id}" style="--cal: ${safeColor(i.color)}">
    <span class="today-chip__dot" aria-hidden="true"></span>
    <span class="today-chip__title">${i.title}</span>
    ${i.kind === 'event' ? '' : i.sub ? html`<span class="today-chip__sub">${i.sub}</span>` : ''}
  </button>`;
}

function agendaItem(i, now, next) {
  const past = i.end <= now || i.done;
  const live = i.start <= now && i.end > now && !i.done;
  const isNext = !live && next?.id === i.id;
  return html`<li><button type="button" class="agenda__item${past ? ' is-past' : ''}${i.done ? ' is-done' : ''}" data-action="dash:item" data-item-id="${i.id}" style="--cal: ${safeColor(i.color)}">
    <span class="agenda__time num">${formatTime(i.start)}</span>
    <span class="agenda__bar" aria-hidden="true"></span>
    <span class="agenda__body">
      <span class="agenda__title">${i.title}</span>
      <span class="agenda__meta">${metaOf(i)}</span>
    </span>
    ${live ? html`<span class="agenda__flag">Now</span>` : isNext ? html`<span class="agenda__flag">Next</span>` : i.done ? html`<span class="sr-only">(done)</span>` : past ? html`<span class="sr-only">(finished)</span>` : ''}
    ${icon('chevronRight', 'agenda__chev')}
  </button></li>`;
}

async function openTodayItem(id) {
  const i = snapshot?.today.byId.get(id);
  if (!i) return;
  if (i.kind === 'event') openEvent(i.event);
  else if (i.kind === 'task') await openTask(i.ref);
  else if (i.kind === 'subtask') await openSubtask(i.ref);
  else if (i.kind === 'workout') openPage('workout', `w/${i.ref}`);
  else if (i.kind === 'habits') openPage('todo', 'habits');
  else if (i.kind === 'todos') openPage('todo', '');
  else if (i.kind === 'referrals') openPage('neurology', 'referrals');
}

/** The "Next event" tile: an event from Google Calendar (today or up to a week ahead). */
function openNextEvent(id) {
  const e = snapshot?.agenda.next;
  if (e && e.id === id) openEvent(e);
}

function openEvent(e) {
  openEventDetails(e);
}

/* ---- Today at a Glance ---- */

function calendarGlance(agenda, now) {
  const base = { id: 'next-event', order: 40, icon: 'calendar', accent: 'brand', label: 'Next event' };
  const e = agenda.next;
  if (!e) {
    return agenda.provider.connected
      ? { ...base, value: 'Nothing coming up', sub: 'Your week is clear' }
      : { ...base, value: 'No calendar yet', sub: 'Update the sync script to connect' };
  }
  const ongoing = e.start <= now && e.end > now;
  const day = toDateKey(e.start) === toDateKey(now) ? '' : `${formatRelativeDay(e.start, now)} · `;
  return {
    ...base,
    value: e.title,
    sub: ongoing ? `Now · until ${formatTime(e.end)}` : `${day}${formatTime(e.start)} · ${formatCountdown(e.start - now)}`,
    action: 'dash:event',
    data: { eventId: e.id },
  };
}

function glanceTile(item) {
  const inner = html`
    <span class="glance__head"><span class="glance__icon">${icon(item.icon)}</span>${item.label}</span>
    <span class="glance__value">${item.big != null ? html`<span class="glance__big">${item.big}</span>` : ''}${item.value}</span>
    ${item.sub ? html`<span class="glance__sub${item.subTone ? ` tone-${item.subTone}` : ''}">${item.sub}</span>` : ''}`;
  return item.action
    ? html`<button type="button" class="glance__tile accent-${item.accent}" data-action="${item.action}"${dataAttrs(item.data)}>${inner}</button>`
    : html`<div class="glance__tile accent-${item.accent}">${inner}</div>`;
}

function renderGlance() {
  const { models, agenda, now } = snapshot;
  const items = getModules().flatMap((m) => (m.glance && models[m.id] ? m.glance(models[m.id]) : []));
  items.push(calendarGlance(agenda, now));
  items.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  setHTML(slots.glance, items.map(glanceTile));
}

/* ---- Module cards ---- */

function cardOrder() {
  const ids = getModules().map((m) => m.id);
  const saved = (state.settings.dashboard.order ?? []).filter((id) => ids.includes(id));
  return [...saved, ...ids.filter((id) => !saved.includes(id))]; // new modules join at the end
}

function moduleCard(m, model, collapsed) {
  const s = m.summary(model);
  const bodyId = `mcard-body-${m.id}`;
  return html`<li class="mcard accent-${m.accent}${collapsed ? ' is-collapsed' : ''}${m.status === 'planned' ? ' mcard--planned' : ''}" data-id="${m.id}">
    <div class="mcard__head">
      <button type="button" class="mcard__toggle" data-action="dash:toggle" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="${bodyId}">
        <span class="mcard__icon">${icon(m.icon)}</span>
        <span class="mcard__titles">
          <span class="mcard__title">${m.title}</span>
          <span class="mcard__summary">${s.text}</span>
        </span>
        ${ring({ progress: s.progress, text: s.ringText, label: s.ringLabel, idleIcon: s.idleIcon })}
        ${icon('chevronDown', 'mcard__chev')}
      </button>
      <div class="mcard__arrange">
        <button type="button" class="mcard__move sr-only sr-only-focusable" data-action="dash:move" data-dir="-1">Move ${m.title} up</button>
        <button type="button" class="mcard__move sr-only sr-only-focusable" data-action="dash:move" data-dir="1">Move ${m.title} down</button>
        <span class="mcard__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
      </div>
    </div>
    <div class="mcard__body" id="${bodyId}" role="region" aria-label="${m.title} details"${collapsed ? raw(' inert') : ''}>
      <div class="mcard__inner"><div class="mcard__content">${m.body(model)}</div></div>
    </div>
  </li>`;
}

function renderModules() {
  const collapsed = state.ui.collapsed ?? {};
  setHTML(slots.modules, cardOrder().map((id) => moduleCard(getModule(id), snapshot.models[id], Boolean(collapsed[id]))));
  applyArranging();
}

function toggleCard(card) {
  if (!card || arranging) return;
  const id = card.dataset.id;
  const collapse = !card.classList.contains('is-collapsed');
  card.classList.toggle('is-collapsed', collapse);
  card.querySelector('.mcard__toggle').setAttribute('aria-expanded', String(!collapse));
  card.querySelector('.mcard__body').inert = collapse;
  updateUI((ui) => { ui.collapsed = { ...ui.collapsed, [id]: collapse }; });
}

function applyArranging() {
  slots.modules.classList.toggle('is-arranging', arranging);
  slots.arrangeBtn.textContent = arranging ? 'Done' : 'Arrange';
  slots.arrangeBtn.setAttribute('aria-pressed', String(arranging));
  slots.arrangeHint.hidden = !arranging;
  const collapsed = state.ui.collapsed ?? {};
  slots.modules.querySelectorAll('.mcard').forEach((card) => {
    const toggle = card.querySelector('.mcard__toggle');
    const body = card.querySelector('.mcard__body');
    if (arranging) {
      toggle.setAttribute('aria-disabled', 'true');
      toggle.tabIndex = -1;
      body.inert = true;
    } else {
      toggle.removeAttribute('aria-disabled');
      toggle.removeAttribute('tabindex');
      body.inert = Boolean(collapsed[card.dataset.id]);
    }
  });
}

function setArranging(on) {
  arranging = on;
  applyArranging();
  announce(on ? 'Arrange mode. Drag the handles, or use the move buttons, to reorder cards.' : 'Done arranging.');
}

function moveCard(card, dir) {
  if (!card) return;
  const list = slots.modules;
  const items = [...list.children];
  const from = items.indexOf(card);
  const to = from + dir;
  if (to < 0 || to >= items.length) {
    announce(dir < 0 ? 'Already first.' : 'Already last.');
    return;
  }
  animateReorder(list, () => list.insertBefore(card, dir < 0 ? items[to] : items[to].nextSibling));
  card.querySelector(`[data-dir="${dir}"]`)?.focus();
  const ids = [...list.children].map((el) => el.dataset.id);
  saveOrder(ids);
  announce(`${getModule(card.dataset.id).title} moved to position ${to + 1} of ${items.length}.`);
}

function saveOrder(ids) {
  updateSettings((s) => { s.dashboard.order = ids; }, { source: 'dashboard' });
}
