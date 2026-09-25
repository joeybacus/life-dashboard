/* Main dashboard — the daily command center:
   profile + date → today's calendar (or a quote) → At a Glance → module cards. */
import { registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { state, on, updateSettings } from '../core/state.js';
import { html, raw, setHTML, dataAttrs } from '../core/html.js';
import { icon } from '../core/icons.js';
import { avatar, ring } from '../core/components.js';
import { animateReorder, makeReorderable } from '../core/reorder.js';
import { announce, openDialog, toast } from '../core/ui.js';
import { getModule, getModules } from '../modules/registry.js';
import { getAgenda } from '../services/calendar.js';
import { quoteOfTheDay } from '../services/quotes.js';
import {
  formatCountdown, formatLongDate, formatRelativeDay, formatTime, formatTimeRange, greeting, toDateKey,
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

const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : '#5563ff');

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
  registerAction('dash:event', (el) => openEvent(el.dataset.eventId));

  on('settings', ({ source }) => { if (source !== 'dashboard') refreshIfVisible(); });
  on('profile', () => refreshIfVisible());
  on('data', () => refreshIfVisible());
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

    <div class="dash__grid">
      <div class="dash__col">
        <section class="section" aria-labelledby="dash-today-title" data-enter style="--i: 1">
          <div class="section__head">
            <h2 class="section__title" id="dash-today-title">Today</h2>
            <span class="section__meta" data-slot="calSource"></span>
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
  try {
    [agenda, ...models] = await Promise.all([getAgenda(now), ...modules.map((m) => m.load(now))]);
  } catch (err) {
    console.error('Dashboard refresh failed', err);
    toast('Couldn’t load some dashboard data. Try reopening the app.', { icon: 'info' });
    return;
  }
  if (seq !== refreshSeq) return; // a newer refresh has started
  snapshot = { now, agenda, models: Object.fromEntries(modules.map((m, i) => [m.id, models[i]])) };
  renderHero();
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
      ${state.settings.sampleData.enabled
        ? html`<button type="button" class="chip chip--sample" data-action="settings:data" aria-label="Sample data is on. Open data settings.">Sample data</button>`
        : ''}
    </div>`);
}

/* ---- Calendar ---- */

function renderToday() {
  const { agenda, now } = snapshot;
  slots.calSource.textContent = agenda.provider.label;

  if (agenda.error) {
    setHTML(slots.today, html`<div class="card empty">${icon('info')}<span>Your calendar is unavailable right now.</span></div>`);
    return;
  }
  if (!agenda.today.length) {
    setHTML(slots.today, quoteCard(now, agenda));
    return;
  }
  const next = agenda.next;
  setHTML(slots.today, html`
    ${next ? nextEventCard(next, now) : html`<div class="card done-card">${icon('checkCircle')}<span>That’s everything on your calendar today.</span></div>`}
    <ol class="agenda card" aria-label="Today’s events">${agenda.today.map((e) => agendaItem(e, now, next))}</ol>`);
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
      ? 'No events today'
      : 'No calendar connected yet — Google Calendar arrives in a later phase'}</span></p>
  </div>`;
}

function nextEventCard(e, now) {
  const ongoing = e.start <= now && e.end > now;
  const sameDay = toDateKey(e.start) === toDateKey(now);
  const when = ongoing ? `Ends ${formatCountdown(e.end - now)}` : `Starts ${formatCountdown(e.start - now)}`;
  return html`<button type="button" class="next-event card" data-action="dash:event" data-event-id="${e.id}" style="--cal: ${safeColor(e.color)}">
    <span class="next-event__top">
      ${ongoing
        ? html`<span class="live-pill"><span class="live-pill__dot" aria-hidden="true"></span>Happening now</span>`
        : html`<span class="next-event__eyebrow">${sameDay ? 'Next up' : `Next up · ${formatRelativeDay(e.start, now)}`}</span>`}
      <span class="next-event__when">${when}</span>
    </span>
    <span class="next-event__title">${e.title}</span>
    <span class="next-event__time">${e.allDay ? 'All day' : formatTimeRange(e.start, e.end)}</span>
    <span class="next-event__meta">
      ${e.location ? html`<span>${icon('pin')}${e.location}</span>` : ''}
      <span class="cal-tag"><span class="cal-tag__dot" aria-hidden="true"></span>${e.calendar}</span>
    </span>
    ${ongoing ? html`<span class="next-event__progress" style="--p: ${((now - e.start) / (e.end - e.start)).toFixed(3)}" aria-hidden="true"></span>` : ''}
  </button>`;
}

function agendaItem(e, now, next) {
  const past = e.end <= now;
  const live = e.start <= now && e.end > now;
  const isNext = !live && next?.id === e.id;
  return html`<li><button type="button" class="agenda__item${past ? ' is-past' : ''}" data-action="dash:event" data-event-id="${e.id}" style="--cal: ${safeColor(e.color)}">
    <span class="agenda__time num">${e.allDay ? 'All day' : formatTime(e.start)}</span>
    <span class="agenda__bar" aria-hidden="true"></span>
    <span class="agenda__body">
      <span class="agenda__title">${e.title}</span>
      <span class="agenda__meta">${[e.location, e.calendar].filter(Boolean).join(' · ')}</span>
    </span>
    ${live ? html`<span class="agenda__flag">Now</span>` : isNext ? html`<span class="agenda__flag">Next</span>` : past ? html`<span class="sr-only">(finished)</span>` : ''}
    ${icon('chevronRight', 'agenda__chev')}
  </button></li>`;
}

function openEvent(id) {
  if (!snapshot) return;
  const { agenda, now } = snapshot;
  const e = [...agenda.today, agenda.next].find((x) => x && x.id === id);
  if (!e) return;
  openDialog({
    title: e.title,
    body: html`<div class="event-detail" style="--cal: ${safeColor(e.color)}">
      <p class="event-detail__row">${icon('clock')}<span>${formatRelativeDay(e.start, now)} · ${e.allDay ? 'All day' : formatTimeRange(e.start, e.end)}</span></p>
      ${e.location ? html`<p class="event-detail__row">${icon('pin')}<span>${e.location}</span></p>` : ''}
      <p class="event-detail__row">${icon('calendar')}<span class="cal-tag"><span class="cal-tag__dot" aria-hidden="true"></span>${e.calendar}</span></p>
      ${e.description ? html`<p class="event-detail__desc">${e.description}</p>` : ''}
      ${e.sample ? html`<p class="note">${icon('info')}<span>This is a sample event. Once Google Calendar is connected in a later phase, tapping an event will open it in Google Calendar.</span></p>` : ''}
    </div>`,
    actions: e.url
      ? [{ label: 'Close', value: 'close', variant: 'ghost' }, { label: 'Open in Google Calendar', value: 'open', variant: 'primary', href: e.url }]
      : [{ label: 'Done', value: 'close', variant: 'ghost' }],
  });
}

/* ---- Today at a Glance ---- */

function calendarGlance(agenda, now) {
  const base = { id: 'next-event', order: 40, icon: 'calendar', accent: 'brand', label: 'Next event' };
  const e = agenda.next;
  if (!e) {
    return agenda.provider.connected
      ? { ...base, value: 'Nothing coming up', sub: 'Your week is clear' }
      : { ...base, value: 'No calendar yet', sub: 'Connects in a later phase' };
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
  const collapsed = state.settings.dashboard.collapsed ?? {};
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
  updateSettings((s) => { s.dashboard.collapsed = { ...s.dashboard.collapsed, [id]: collapse }; }, { source: 'dashboard' });
}

function applyArranging() {
  slots.modules.classList.toggle('is-arranging', arranging);
  slots.arrangeBtn.textContent = arranging ? 'Done' : 'Arrange';
  slots.arrangeBtn.setAttribute('aria-pressed', String(arranging));
  slots.arrangeHint.hidden = !arranging;
  const collapsed = state.settings.dashboard.collapsed ?? {};
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
