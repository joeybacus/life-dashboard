/* The Calendar page (#/todo/calendar): your Google Calendar and the app's own
   things (items.js) by Day, Week, Month or as an Agenda. Weeks start on
   Sunday; on a phone the Week view shows 3 days at a time (swipe or ‹ ›).
   Everything is in Manila time, like the rest of the app. The view you last
   used is remembered on this device. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on, state, updateSettings, updateUI } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, openDialog, promptDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { runAction } from '../../core/actions.js';
import { formatAgo } from '../../core/dates.js';
import { addDays, clockOf, formatClock, todayKey, weekdayOf } from '../../core/manila.js';
import {
  CAL_SWATCHES, appleLinks, calendarColor, calendarShown, gcalAppleErrors, gcalCalendars, gcalCanEdit, gcalProblem, gcalReloadKept, gcalUpdatedAt,
} from '../../services/gcal.js';
import { uid } from '../../core/ids.js';
import { calendarItems, daysOf, layers } from './items.js';
import { openTask } from '../todo/detail.js';
import { openEventDetails, openEventEditor } from './editor.js';
import { openSubtask } from '../todo/subtask-sheet.js';

const VIEWS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'agenda', label: 'Agenda' },
];
const AGENDA_DAYS = 30;
const PHONE = matchMedia('(max-width: 699px)');
const MAX_ALLDAY = 3;    // all-day items shown per day before "+2 more"
const MAX_MONTH = 3;     // items per day in the month grid

let view = null;
let showing = false;
let anchor = todayKey(); // the day the view is built around
let items = new Map();   // id → item on screen (for taps)
let renderSeq = 0;
let scrollTop = null;    // keep the time grid where it was across redraws

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const currentView = () => (VIEWS.some((v) => v.id === state.ui.calendarView) ? state.ui.calendarView : 'week');
const noon = (key) => new Date(`${key}T04:00:00Z`); // midday in Manila, for formatting a day
const fmt = (options) => new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Manila', ...options });
const F = {
  weekday: fmt({ weekday: 'short' }),
  dayNum: fmt({ day: 'numeric' }),
  month: fmt({ month: 'long', year: 'numeric' }),
  monthShort: fmt({ month: 'short', day: 'numeric' }),
  long: fmt({ weekday: 'long', month: 'long', day: 'numeric' }),
  hour: fmt({ hour: 'numeric' }),
};
const sunday = (key) => addDays(key, -weekdayOf(key));
const timeOf = (d) => formatClock(clockOf(d.getTime()));
const minutesOf = (d) => { const [h, m] = clockOf(d.getTime()).split(':').map(Number); return h * 60 + m; };

export const calendarPage = {
  show(el) {
    view = el;
    showing = true;
    scrollTop = null;
    return render();
  },
  hide() {
    showing = false;
  },
};

on('calendar', () => { if (showing) render(); });
on('data', () => { if (showing) render(); });
on('referrals', () => { if (showing) render(); });
on('settings', () => { if (showing) render(); });
PHONE.addEventListener('change', () => { if (showing) render(); });
// The "now" line moves with the clock
setInterval(() => {
  if (!showing || document.visibilityState !== 'visible') return;
  const line = view?.querySelector('.calg__now');
  if (line) line.style.setProperty('--m', String(minutesOf(new Date())));
}, 60_000);

/* ---------- What's on screen ---------- */

/** The days the view covers: [from, to) as Manila keys. */
function span(v = currentView()) {
  if (v === 'day') return [anchor, addDays(anchor, 1)];
  if (v === 'week') return PHONE.matches ? [anchor, addDays(anchor, 3)] : [sunday(anchor), addDays(sunday(anchor), 7)];
  if (v === 'month') {
    const first = `${anchor.slice(0, 7)}-01`;
    const start = sunday(first);
    return [start, addDays(start, 42)];
  }
  return [anchor, addDays(anchor, AGENDA_DAYS)];
}

function title(v, [from, to]) {
  if (v === 'month') return F.month.format(noon(anchor));
  if (v === 'day') return F.long.format(noon(anchor));
  if (v === 'agenda') return `From ${F.monthShort.format(noon(from))}`;
  const last = addDays(to, -1);
  return from.slice(0, 7) === last.slice(0, 7)
    ? `${F.monthShort.format(noon(from))} – ${F.dayNum.format(noon(last))}, ${from.slice(0, 4)}`
    : `${F.monthShort.format(noon(from))} – ${F.monthShort.format(noon(last))}`;
}

function step(dir) {
  const v = currentView();
  if (v === 'month') {
    const [y, m] = anchor.split('-').map(Number);
    const n = new Date(Date.UTC(y, m - 1 + dir, 1));
    anchor = n.toISOString().slice(0, 10);
  } else {
    const days = v === 'day' ? 1 : v === 'week' ? (PHONE.matches ? 3 : 7) : AGENDA_DAYS;
    anchor = addDays(anchor, dir * days);
  }
  scrollTop = null;
  render();
}

function statusLine(fromKey, toKey) {
  const problem = gcalProblem();
  if (problem === 'not-connected') return html`<p class="cal-status">${icon('info')}<span>Connect sync (Settings → Sync) to see your Google Calendar here.</span></p>`;
  if (problem === 'outdated') return html`<p class="cal-status">${icon('sparkles')}<span>Update the sync script to see your Google Calendar here. <button type="button" class="link-inline" data-cact="update">Show me how</button></span></p>`;
  if (problem === 'needs-auth') return html`<p class="cal-status cal-status--warn">${icon('lock')}<span>The sync script needs permission for Google Calendar: in Apps Script choose <strong>setup</strong>, click Run and allow access. Then tap Refresh.</span></p>`;
  const at = gcalUpdatedAt(fromKey, toKey);
  const note = problem === 'failed' ? 'Google Calendar didn’t answer' : at ? `Google Calendar · updated ${formatAgo(at)}` : 'Google Calendar · loading…';
  return html`<p class="cal-status${problem === 'failed' ? ' cal-status--warn' : ''}">${icon(problem === 'failed' ? 'info' : 'cloudCheck')}<span>${note}${problem === 'failed' && at ? ` · showing what was saved ${formatAgo(at)}` : ''}</span></p>`;
}

async function render({ force = false } = {}) {
  if (!view) return;
  const seq = ++renderSeq;
  const v = currentView();
  const range = span(v);
  const list = await calendarItems(range[0], range[1], { force });
  if (seq !== renderSeq || !showing) return;
  items = new Map(list.map((i) => [i.id, i]));
  const grid = view.querySelector('.calg__scroll');
  if (grid) scrollTop = grid.scrollTop;
  const today = todayKey();
  const body = v === 'month' ? monthView(list, range, today)
    : v === 'agenda' ? agendaView(list, range, today)
      : timeView(list, range, today);
  setHTML(view, html`<div class="cal-page accent-todo">
    ${subHead({ title: 'Calendar', back: 'To Do', fallback: '', accent: 'todo', actions: html`<button type="button" class="btn btn--sm btn--accent" data-cact="new">${icon('plus')}Event</button>
      <button type="button" class="btn btn--sm" data-cact="cals">${icon('sliders')}Calendars</button>
      <button type="button" class="icon-btn" data-cact="refresh" aria-label="Refresh from Google Calendar">${icon('refresh')}</button>` })}
    <div class="cal-bar">
      <div class="cal-bar__nav">
        <button type="button" class="btn btn--sm" data-cact="today"${anchor === today && v !== 'month' ? raw(' aria-current="date"') : ''}>Today</button>
        <button type="button" class="icon-btn" data-cact="prev" aria-label="Earlier">${icon('chevronLeft')}</button>
        <button type="button" class="icon-btn" data-cact="next" aria-label="Later">${icon('chevronRight')}</button>
        <h2 class="cal-bar__title" aria-live="polite">${title(v, range)}</h2>
      </div>
      <div class="segmented cal-bar__views" role="radiogroup" aria-label="View">${VIEWS.map((x) => html`<label class="segmented__opt">
        <input type="radio" name="cal-view" value="${x.id}" data-cact="view"${x.id === v ? raw(' checked') : ''}><span>${x.label}</span></label>`)}</div>
    </div>
    ${statusLine(range[0], range[1])}
    ${body}
  </div>`);
  const scroller = view.querySelector('.calg__scroll');
  if (scroller) {
    // First time: start at 7 AM, or a little before the first event if it's earlier
    const first = list.filter((i) => !i.allDay && daysOf(i, range[0], range[1]).length).map((i) => minutesOf(i.start));
    const hour = parseFloat(getComputedStyle(scroller).getPropertyValue('--hour')) || 48;
    scroller.scrollTop = scrollTop ?? Math.max(0, (Math.min(7 * 60, ...first) - 30) / 60 * hour);
  }
}

/* ---------- Day and Week: a time grid ---------- */

function chip(i, { time = true } = {}) {
  const t = !i.allDay && time ? `${timeOf(i.start)} ` : '';
  return html`<button type="button" class="cal-chip${i.done ? ' is-done' : ''}" data-item="${i.id}" style="--cal: ${i.color}">
    <span class="cal-chip__dot" aria-hidden="true"></span><span class="cal-chip__text">${t ? html`<span class="cal-chip__time">${t}</span>` : ''}${i.title}</span>
  </button>`;
}

/** Side-by-side places for overlapping events in one day: each gets { col, cols }. */
function layout(events) {
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const finish = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => { p.cols = cols; });
    cluster = [];
  };
  for (const e of events) {
    if (e.top >= clusterEnd) finish();
    const used = new Set(cluster.filter((p) => p.bottom > e.top).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col += 1;
    const p = { ...e, col };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, e.bottom);
  }
  finish();
  return placed;
}

function timeView(list, [from, to], today) {
  const days = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  const allDay = new Map(days.map((d) => [d, []]));
  const timed = new Map(days.map((d) => [d, []]));
  for (const i of list) {
    for (const d of daysOf(i, from, to)) {
      if (i.allDay) { allDay.get(d).push(i); continue; }
      const dayStart = Date.parse(`${d}T00:00:00+08:00`);
      const top = Math.max(0, (i.start.getTime() - dayStart) / 60e3);
      const bottom = Math.min(1440, (i.end.getTime() - dayStart) / 60e3);
      if (bottom > top) timed.get(d).push({ item: i, top, bottom: Math.max(bottom, top + 20) });
    }
  }
  const hasAllDay = [...allDay.values()].some((x) => x.length);
  return html`<div class="calg" style="--days: ${days.length}">
    <div class="calg__head">
      <span class="calg__gutter" aria-hidden="true"></span>
      ${days.map((d) => html`<button type="button" class="calg__day${d === today ? ' is-today' : ''}" data-cact="day" data-day="${d}" aria-label="${F.long.format(noon(d))}">
        <span class="calg__wd">${F.weekday.format(noon(d))}</span><span class="calg__num">${F.dayNum.format(noon(d))}</span></button>`)}
    </div>
    ${hasAllDay ? html`<div class="calg__allday">
      <span class="calg__gutter calg__gutter--label">All day</span>
      ${days.map((d) => {
        const here = allDay.get(d);
        const more = here.length - MAX_ALLDAY;
        return html`<div class="calg__adcell">${here.slice(0, more > 0 ? MAX_ALLDAY - 1 : MAX_ALLDAY).map((i) => chip(i))}${more > 0
          ? html`<button type="button" class="cal-more" data-cact="day" data-day="${d}">+${more + 1} more</button>` : ''}</div>`;
      })}
    </div>` : ''}
    <div class="calg__scroll">
      <div class="calg__body">
        <div class="calg__hours" aria-hidden="true">${Array.from({ length: 24 }, (_, h) => html`<span class="calg__hour" style="--h: ${h}">${h ? F.hour.format(new Date(Date.UTC(2000, 0, 1, h - 8))) : ''}</span>`)}</div>
        ${days.map((d) => html`<div class="calg__col${d === today ? ' is-today' : ''}" data-day="${d}">
          ${layout(timed.get(d).sort((a, b) => a.top - b.top || b.bottom - a.bottom)).map((p) => html`<button type="button"
              class="calg__ev${p.item.done ? ' is-done' : ''}${p.bottom - p.top < 40 ? ' is-short' : ''}" data-item="${p.item.id}"
              style="--top: ${p.top}; --len: ${p.bottom - p.top}; --col: ${p.col}; --cols: ${p.cols}; --cal: ${p.item.color}">
            <span class="calg__ev-title">${p.item.title}</span>
            <span class="calg__ev-time">${timeOf(p.item.start)} – ${timeOf(p.item.end)}${p.item.sub ? ` · ${p.item.sub}` : ''}</span>
          </button>`)}
          ${d === today ? html`<span class="calg__now" style="--m: ${minutesOf(new Date())}" aria-hidden="true"></span>` : ''}
        </div>`)}
      </div>
    </div>
  </div>`;
}

/* ---------- Month ---------- */

function monthView(list, [from, to], today) {
  const month = anchor.slice(0, 7);
  const byDay = new Map();
  for (const i of list) for (const d of daysOf(i, from, to)) (byDay.get(d) ?? byDay.set(d, []).get(d)).push(i);
  const days = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return html`<div class="calm">
    <div class="calm__wds" aria-hidden="true">${days.slice(0, 7).map((d) => html`<span>${F.weekday.format(noon(d))}</span>`)}</div>
    <div class="calm__grid">${days.map((d) => {
      const here = byDay.get(d) ?? [];
      const more = here.length - MAX_MONTH;
      return html`<div class="calm__cell${d.slice(0, 7) !== month ? ' is-out' : ''}${d === today ? ' is-today' : ''}">
        <button type="button" class="calm__num" data-cact="day" data-day="${d}" aria-label="${F.long.format(noon(d))}${here.length ? `, ${plural(here.length, 'item')}` : ''}">${F.dayNum.format(noon(d))}</button>
        <div class="calm__items">${here.slice(0, more > 0 ? MAX_MONTH - 1 : MAX_MONTH).map((i) => chip(i))}${more > 0
          ? html`<button type="button" class="cal-more" data-cact="day" data-day="${d}">+${more + 1} more</button>` : ''}</div>
        ${here.length ? html`<span class="calm__dots" aria-hidden="true">${here.slice(0, 4).map((i) => html`<span style="--cal: ${i.color}"></span>`)}</span>` : ''}
      </div>`;
    })}</div>
  </div>`;
}

/* ---------- Agenda ---------- */

function agendaView(list, [from, to], today) {
  const byDay = new Map();
  for (const i of list) for (const d of daysOf(i, from, to)) (byDay.get(d) ?? byDay.set(d, []).get(d)).push(i);
  const days = [...byDay.keys()].sort();
  if (!days.length) return html`<div class="card empty">${icon('calendar')}<span>Nothing in the next ${AGENDA_DAYS} days.</span></div>`;
  return html`<div class="cala">${days.map((d) => html`<section class="cala__day${d === today ? ' is-today' : ''}" aria-label="${F.long.format(noon(d))}">
    <h3 class="cala__date"><span>${d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : F.weekday.format(noon(d))}</span>${F.long.format(noon(d)).replace(/^[^,]+,\s*/, '')}</h3>
    <ul class="cala__list">${byDay.get(d).map((i) => html`<li><button type="button" class="cala__item${i.done ? ' is-done' : ''}" data-item="${i.id}" style="--cal: ${i.color}">
      <span class="cala__time num">${i.allDay ? 'All day' : timeOf(i.start)}</span>
      <span class="cala__bar" aria-hidden="true"></span>
      <span class="cala__body"><span class="cala__title">${i.title}</span>${i.sub ? html`<span class="cala__sub">${i.sub}</span>` : ''}</span>
      ${icon('chevronRight', 'cala__chev')}
    </button></li>`)}</ul>
  </section>`)}</div>`;
}

/* ---------- Taps ---------- */

export async function handleCalendarClick(event) {
  if (!showing || !view?.contains(event.target)) return;
  const itemEl = event.target.closest('[data-item]');
  if (itemEl) {
    openItem(items.get(itemEl.dataset.item));
    return;
  }
  const el = event.target.closest('[data-cact]');
  if (!el) return;
  const act = el.dataset.cact;
  if (act === 'prev') step(-1);
  else if (act === 'next') step(1);
  else if (act === 'today') {
    anchor = todayKey();
    scrollTop = null;
    render();
  } else if (act === 'day') {
    anchor = el.dataset.day;
    scrollTop = null;
    await updateUI((ui) => { ui.calendarView = 'day'; });
    render();
  } else if (act === 'refresh') {
    await render({ force: true });
    if (gcalProblem() === 'failed') toast('Google Calendar didn’t answer. Showing what was saved.', { icon: 'info' });
  } else if (act === 'cals') chooseCalendars();
  else if (act === 'new') {
    // On the day you're looking at (today when it's on screen)
    const [from, to] = span();
    const today = todayKey();
    await openEventEditor({ date: currentView() === 'day' ? anchor : today >= from && today < to ? today : from });
  }
  else if (act === 'update') runAction('sync:update');
}

export async function handleCalendarChange(event) {
  const radio = event.target.closest('[data-cact="view"]');
  if (!radio || !showing) return;
  scrollTop = null;
  await updateUI((ui) => { ui.calendarView = radio.value; }); // saved first, so the redraw sees it
  render();
}

/** Swipe left or right on the calendar for the next or previous days (touch screens). */
export function bindCalendarSwipe(el) {
  let start = null;
  el.addEventListener('touchstart', (e) => {
    if (!showing || !e.target.closest('.calg, .calm, .cala')) { start = null; return; }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const quick = Date.now() - start.t < 600;
    start = null;
    if (quick && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

async function openItem(i) {
  if (!i) return;
  if (i.kind === 'task') { await openTask(i.ref); return; }
  if (i.kind === 'subtask') { await openSubtask(i.ref); return; }
  if (i.kind === 'workout') { openPage('workout', `w/${i.ref}`); return; }
  if (i.kind === 'habits') { openPage('todo', 'habits'); return; }
  if (i.kind === 'referral') {
    const el = document.createElement('button');
    el.dataset.id = i.ref;
    runAction('ref:open', el);
    return;
  }
  await openEventDetails(i.event);
}

/* ---------- Calendars: which show, their colours, the app's own things ---------- */

const LAYERS = [
  { id: 'tasks', label: 'To-dos with a date', iconName: 'checklist' },
  { id: 'workouts', label: 'Workouts', iconName: 'dumbbell' },
  { id: 'referrals', label: 'Referral next rounds', iconName: 'clipboard' },
  { id: 'habits', label: 'Habits', iconName: 'repeat' },
];

const APPLE_PROBLEMS = {
  'apple-bad-link': 'That isn’t a public iCloud calendar link. Copy it again (Share Link → Copy).',
  'apple-not-public': 'iCloud says this calendar isn’t public any more. Turn Public Calendar back on, or add its new link.',
  'apple-needs-auth': 'The sync script needs permission to read web links: in Apps Script choose setup, click Run and allow access.',
  'apple-failed': 'Couldn’t read it just now. It tries again by itself.',
};

/** A row for a calendar: show it or not, and its colour. */
function calRow(c, extra = '') {
  return html`<li class="cal-pick__row" style="--cal: ${calendarColor(c)}">
      <label class="cal-pick__name"><input type="checkbox" class="switch" data-cal="${c.id}"${calendarShown(c) ? raw(' checked') : ''}>
        <span>${c.name}${c.primary ? html` <span class="faint">· yours</span>` : c.tasks ? html` <span class="faint">· your to-dos</span>` : c.apple || c.owned ? '' : html` <span class="faint">· subscribed</span>`}</span></label>
      <span class="cal-pick__swatches" role="group" aria-label="Colour for ${c.name}">${CAL_SWATCHES.map((hex) => html`<button type="button" class="cal-swatch" data-color="${hex}" data-cal-color="${c.id}" style="--sw: ${hex}"
        aria-label="${hex}" aria-pressed="${calendarColor(c).toLowerCase() === hex ? 'true' : 'false'}"></button>`)}</span>
      ${extra}
    </li>`;
}

/** Apple Calendar: your public iCloud links, read by the sync script (read only). */
function appleBody() {
  const links = appleLinks();
  const byId = new Map(gcalCalendars().filter((c) => c.apple).map((c) => [c.id, c]));
  const errors = gcalAppleErrors();
  const remove = (l) => html`<button type="button" class="btn btn--sm btn--ghost cal-pick__remove" data-apple-remove="${l.id}">${icon('trash')}Remove</button>`;
  return html`
    <h3 class="cal-pick__title">Apple Calendar</h3>
    ${links.length ? html`<ul class="cal-pick__list">${links.map((l) => {
      const id = `apple:${l.id}`;
      const c = byId.get(id) ?? { id, name: l.name || 'Apple Calendar', apple: true, owned: false, shown: true };
      const problem = errors[id] && (APPLE_PROBLEMS[errors[id]] ?? APPLE_PROBLEMS['apple-failed']);
      return calRow(c, html`${problem ? html`<span class="cal-pick__problem">${icon('info')}${problem}</span>` : ''}${remove(l)}`);
    })}</ul>` : ''}
    ${gcalCanEdit() ? '' : html`<p class="faint cal-pick__note">Apple Calendar needs the sync script version 17 (Settings → Sync → Update the sync script).</p>`}
    <button type="button" class="btn btn--sm" data-apple-add${appleLinks().length >= 6 ? raw(' disabled') : ''}>${icon('plus')}Add an Apple calendar</button>
    <details class="cal-pick__how"><summary>How to get the link on your iPhone</summary>
      <ol>
        <li>Open the <strong>Calendar</strong> app and tap <strong>Calendars</strong> at the bottom.</li>
        <li>Tap <strong>ⓘ</strong> next to the calendar you want.</li>
        <li>Switch on <strong>Public Calendar</strong>, then tap <strong>Share Link…</strong> → <strong>Copy</strong>.</li>
        <li>Come back here, tap <strong>Add an Apple calendar</strong> and paste.</li>
      </ol>
      <p class="faint">Shown here read-only: change those events on your iPhone or Mac. Anyone with a public link can see that calendar, so keep the link to yourself. Changes show within about 5 minutes, or tap Refresh.</p>
    </details>`;
}

async function addAppleLink() {
  const text = await promptDialog({
    title: 'Add an Apple calendar',
    label: 'Its public link (from Share Link → Copy)',
    placeholder: 'webcal://p…-caldav.icloud.com/published/2/…',
    confirmLabel: 'Next',
    maxLength: 700,
    required: true,
    dismissible: false,
  });
  if (!text) return false;
  const url = text.trim().replace(/^webcals?:\/\//i, 'https://');
  if (!/^https:\/\/[a-z0-9.-]+\.icloud\.com\/published\/\S+$/i.test(url)) {
    toast('That doesn’t look like a public iCloud calendar link. It starts with webcal:// and has “icloud.com/published” in it.', { icon: 'info', duration: 8000 });
    return false;
  }
  if (appleLinks().some((l) => l.url.replace(/^webcals?:\/\//i, 'https://') === url)) {
    toast('That calendar is already here.', { icon: 'info' });
    return false;
  }
  const name = await promptDialog({
    title: 'Name it',
    label: 'Name (leave it empty to use the calendar’s own name)',
    placeholder: 'e.g. Family',
    confirmLabel: 'Add',
    maxLength: 60,
    dismissible: false,
  });
  if (name === null) return false;
  await updateSettings((s) => { s.calendar.apple = [...(Array.isArray(s.calendar.apple) ? s.calendar.apple : []), { id: uid().slice(0, 8), name: name.trim(), url }]; });
  await gcalReloadKept();
  toast('Apple calendar added. Its events appear in a moment.', { icon: 'calendarCheck' });
  return true;
}

async function removeAppleLink(id) {
  const link = appleLinks().find((l) => l.id === id);
  if (!link) return false;
  const name = gcalCalendars().find((c) => c.id === `apple:${id}`)?.name || link.name || 'this Apple calendar';
  if (!await confirmDialog({ title: `Remove ${name}?`, message: 'Its events stop showing in the app. Nothing changes in Apple Calendar.', confirmLabel: 'Remove', destructive: true })) return false;
  await updateSettings((s) => { s.calendar.apple = (s.calendar.apple ?? []).filter((l) => l.id !== id); });
  await gcalReloadKept();
  return true;
}

function calendarsBody() {
  const cals = gcalCalendars().filter((c) => !c.apple);
  const L = layers();
  return html`<div class="cal-pick">
    <h3 class="cal-pick__title">Google Calendar</h3>
    ${cals.length ? html`<ul class="cal-pick__list">${cals.map((c) => calRow(c))}</ul>`
      : html`<p class="faint">${gcalProblem() ? 'Your Google calendars appear here once the sync script can read them.' : 'Loading your calendars…'}</p>`}
    ${appleBody()}
    <h3 class="cal-pick__title">From the app</h3>
    <ul class="cal-pick__list">${LAYERS.map((l) => html`<li class="cal-pick__row"><label class="cal-pick__name"><input type="checkbox" class="switch" data-layer="${l.id}"${L[l.id] ? raw(' checked') : ''}>
      <span>${icon(l.iconName)}${l.label}</span></label></li>`)}</ul>
    <p class="faint cal-pick__note">To-dos you sent to Google Calendar show once, as the to-do. These choices are the same on all your devices.</p>
  </div>`;
}

async function chooseCalendars() {
  await openDialog({
    variant: 'sheet',
    className: 'cal-cals accent-todo',
    title: 'Calendars',
    body: calendarsBody(),
    actions: [{ label: 'Done', value: 'done', variant: 'primary', autofocus: true }],
    onOpen(dlg) {
      const stop = on('calendar', () => { if (dlg.isConnected) redraw(); else stop?.(); });
      const redraw = () => {
        const body = dlg.querySelector('.dlg__body');
        const y = dlg.querySelector('.dlg__panel').scrollTop;
        setHTML(body, calendarsBody());
        dlg.querySelector('.dlg__panel').scrollTop = y;
      };
      dlg.addEventListener('change', (e) => {
        const cal = e.target.closest('[data-cal]');
        const layer = e.target.closest('[data-layer]');
        if (cal) {
          const id = cal.dataset.cal;
          updateSettings((s) => {
            const hidden = Array.isArray(s.calendar.hidden) ? s.calendar.hidden : gcalCalendars().filter((c) => c.shown === false).map((c) => c.id);
            s.calendar.hidden = cal.checked ? hidden.filter((x) => x !== id) : [...new Set([...hidden, id])];
          });
        } else if (layer) {
          updateSettings((s) => { s.calendar.layers = { ...s.calendar.layers, [layer.dataset.layer]: layer.checked }; });
        }
      });
      dlg.addEventListener('click', async (e) => {
        if (e.target.closest('[data-apple-add]')) {
          if (await addAppleLink()) redraw();
          return;
        }
        const rm = e.target.closest('[data-apple-remove]');
        if (rm) {
          if (await removeAppleLink(rm.dataset.appleRemove)) redraw();
          return;
        }
        const sw = e.target.closest('[data-cal-color]');
        if (!sw) return;
        updateSettings((s) => { s.calendar.colors = { ...s.calendar.colors, [sw.dataset.calColor]: sw.dataset.color }; });
        setTimeout(redraw, 0);
      });
    },
  });
}
