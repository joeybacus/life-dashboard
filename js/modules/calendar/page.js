/* The Calendar page (#/todo/calendar): your Google Calendar and the app's own
   things (items.js) by Day, Week, Month or as an Agenda. Weeks start on
   Sunday; on a phone the Week view shows 3 days at a time (swipe or ‹ ›).
   Everything is in Manila time, like the rest of the app. The view you last
   used is remembered on this device. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on, state, updateSettings, updateUI } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { openDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { runAction } from '../../core/actions.js';
import { formatAgo } from '../../core/dates.js';
import { addDays, clockOf, formatClock, todayKey, weekdayOf } from '../../core/manila.js';
import {
  CAL_SWATCHES, calendarColor, calendarShown, gcalCalendars, gcalProblem, gcalUpdatedAt,
} from '../../services/gcal.js';
import { calendarItems, daysOf, layers } from './items.js';
import { openTask } from '../todo/detail.js';
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
    ${subHead({ title: 'Calendar', back: 'To Do', fallback: '', accent: 'todo', actions: html`<button type="button" class="btn btn--sm" data-cact="cals">${icon('sliders')}Calendars</button>
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

function whenText(i) {
  if (i.allDay) {
    const last = addDays(i.endDate ?? addDays(i.date, 1), -1);
    return last === i.date ? `${F.long.format(noon(i.date))} · All day` : `${F.monthShort.format(noon(i.date))} – ${F.monthShort.format(noon(last))} · All day`;
  }
  const d = todayKey(i.start.getTime());
  return `${F.long.format(noon(d))} · ${timeOf(i.start)} – ${timeOf(i.end)}`;
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
  const e = i.event;
  await openDialog({
    variant: 'sheet',
    className: 'cal-detail',
    title: e.title,
    body: html`<div class="event-detail" style="--cal: ${i.color}">
      <p class="event-detail__row">${icon('clock')}<span>${whenText(i)}</span></p>
      ${e.location ? html`<p class="event-detail__row">${icon('pin')}<span>${e.location}</span></p>` : ''}
      <p class="event-detail__row">${icon('calendar')}<span class="cal-tag"><span class="cal-tag__dot" aria-hidden="true"></span>${e.calendar}</span></p>
      ${e.description ? html`<p class="event-detail__desc prose">${e.description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}</p>` : ''}
    </div>`,
    actions: e.url
      ? [{ label: 'Close', value: 'close', variant: 'ghost', autofocus: true }, { label: 'Open in Google Calendar', value: 'open', variant: 'primary', href: e.url }]
      : [{ label: 'Close', value: 'close', variant: 'ghost', autofocus: true }],
  });
}

/* ---------- Calendars: which show, their colours, the app's own things ---------- */

const LAYERS = [
  { id: 'tasks', label: 'To-dos with a date', iconName: 'checklist' },
  { id: 'workouts', label: 'Workouts', iconName: 'dumbbell' },
  { id: 'referrals', label: 'Referral next rounds', iconName: 'clipboard' },
  { id: 'habits', label: 'Habits', iconName: 'repeat' },
];

function calendarsBody() {
  const cals = gcalCalendars();
  const L = layers();
  return html`<div class="cal-pick">
    <h3 class="cal-pick__title">Google Calendar</h3>
    ${cals.length ? html`<ul class="cal-pick__list">${cals.map((c) => html`<li class="cal-pick__row" style="--cal: ${calendarColor(c)}">
      <label class="cal-pick__name"><input type="checkbox" class="switch" data-cal="${c.id}"${calendarShown(c) ? raw(' checked') : ''}>
        <span>${c.name}${c.primary ? html` <span class="faint">· yours</span>` : c.tasks ? html` <span class="faint">· your to-dos</span>` : c.owned ? '' : html` <span class="faint">· subscribed</span>`}</span></label>
      <span class="cal-pick__swatches" role="group" aria-label="Colour for ${c.name}">${CAL_SWATCHES.map((hex) => html`<button type="button" class="cal-swatch" data-color="${hex}" data-cal-color="${c.id}" style="--sw: ${hex}"
        aria-label="${hex}" aria-pressed="${calendarColor(c).toLowerCase() === hex ? 'true' : 'false'}"></button>`)}</span>
    </li>`)}</ul>`
      : html`<p class="faint">${gcalProblem() ? 'Your Google calendars appear here once the sync script can read them.' : 'Loading your calendars…'}</p>`}
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
      dlg.addEventListener('click', (e) => {
        const sw = e.target.closest('[data-cal-color]');
        if (!sw) return;
        updateSettings((s) => { s.calendar.colors = { ...s.calendar.colors, [sw.dataset.calColor]: sw.dataset.color }; });
        setTimeout(redraw, 0);
      });
    },
  });
}
