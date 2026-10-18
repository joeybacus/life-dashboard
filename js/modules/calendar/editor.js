/* Your events, from the app (0.8.2–0.8.3): an event's details (Calendar page
   and dashboard), the editor that adds or changes one in Google Calendar
   (sync script 17), deleting, and turning an event into a to-do. Quick Add's
   "Add event" button opens the editor too, and so do words in the To Do box
   that start with "event" ("event lunch with Ana Friday 1pm").

   Everything is in Manila time, like the rest of the app. Events from Apple
   Calendar, calendars you subscribe to, repeating events and your to-dos'
   own events can't be changed here (each says why). */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { state, updateSettings } from '../../core/state.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { registerQuickAdd } from '../../core/quick-add.js';
import { addDays, at, clockOf, isClock, isDateKey, todayKey } from '../../core/manila.js';
import {
  EDIT_REASONS, calendarColor, defaultEventCalendar, editableEvent, gcalAvailable, gcalCalendars, gcalCanEdit,
  gcalDeleteEvent, gcalSaveEvent, writableCalendars,
} from '../../services/gcal.js';
import { createTask } from '../todo/store.js';
import { openTask } from '../todo/detail.js';

const fmt = (options) => new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Manila', ...options });
const F = {
  long: fmt({ weekday: 'long', month: 'long', day: 'numeric' }),
  short: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  time: fmt({ hour: 'numeric', minute: '2-digit' }),
};
const noon = (key) => new Date(`${key}T04:00:00Z`);
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : 'var(--brand)');
const plainText = (text) => String(text ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Alerts you can choose (minutes before; for all-day events, before midnight). */
const ALERTS = [
  { value: 'keep', label: 'Calendar’s usual' },
  { value: 'none', label: 'None' },
  { value: '0', label: 'At the time' },
  { value: '10', label: '10 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
];

/** "Wednesday, October 14 · 2:00 – 3:00 PM", or the days of an all-day event. */
export function eventWhen(e) {
  if (e.allDay) {
    const last = addDays(e.endDate ?? addDays(e.date, 1), -1);
    return last === e.date ? `${F.long.format(noon(e.date))} · All day` : `${F.short.format(noon(e.date))} – ${F.short.format(noon(last))} · All day`;
  }
  const d = todayKey(e.start.getTime());
  const endDay = todayKey(e.end.getTime() - 1);
  return endDay === d
    ? `${F.long.format(noon(d))} · ${F.time.format(e.start)} – ${F.time.format(e.end)}`
    : `${F.short.format(e.start)}, ${F.time.format(e.start)} – ${F.short.format(e.end)}, ${F.time.format(e.end)}`;
}

const WHY_NOT = {
  apple: 'From Apple Calendar — change it on your iPhone or Mac.',
  'calendar-read-only': 'This calendar is one you subscribe to, so it can’t be changed here.',
  'event-recurring': 'A repeating event — change it in Google Calendar itself.',
  'event-is-task': 'One of your to-dos — change the to-do instead.',
  update: 'Update the sync script (Settings → Sync) to change events from here.',
};

/* ---------- Details ---------- */

/** An event's details, with Edit, Delete and Turn into a to-do. */
export async function openEventDetails(e) {
  if (!e) return;
  const can = editableEvent(e);
  const why = !can.ok && WHY_NOT[can.reason];
  const actions = [{ label: 'Close', value: 'close', variant: 'ghost', autofocus: true }];
  if (e.url) actions.push({ label: 'Open in Google Calendar', value: 'open', variant: e.sample || can.ok ? 'ghost' : 'primary', href: e.url });
  if (can.ok) actions.push({ label: 'Edit', value: 'edit', variant: 'primary' });
  const choice = await openDialog({
    variant: 'sheet',
    className: 'cal-detail',
    title: e.title,
    body: html`<div class="event-detail" style="--cal: ${safeColor(e.color)}">
      <p class="event-detail__row">${icon('clock')}<span>${eventWhen(e)}</span></p>
      ${e.location ? html`<p class="event-detail__row">${icon('pin')}<span>${e.location}</span></p>` : ''}
      <p class="event-detail__row">${icon('calendar')}<span class="cal-tag"><span class="cal-tag__dot" aria-hidden="true"></span>${e.calendar}</span></p>
      ${e.description ? html`<p class="event-detail__desc prose">${plainText(e.description)}</p>` : ''}
      ${e.sample ? html`<p class="note">${icon('info')}<span>This is a sample event. Once the sync script is updated, your real Google Calendar shows here instead.</span></p>` : ''}
      ${why ? html`<p class="event-detail__why">${icon('info')}<span>${why}</span></p>` : ''}
      ${e.sample || e.task ? '' : html`<div class="event-detail__more">
        <button type="button" class="btn btn--sm btn--ghost" data-dialog-value="todo">${icon('checklist')}Turn into a to-do</button>
        ${can.ok ? html`<button type="button" class="btn btn--sm btn--ghost ev-danger" data-dialog-value="delete">${icon('trash')}Delete</button>` : ''}
      </div>`}
    </div>`,
    actions,
  });
  if (choice === 'edit') await openEventEditor({ event: e });
  else if (choice === 'delete') await deleteEvent(e);
  else if (choice === 'todo') await turnIntoTodo(e);
}

async function deleteEvent(e) {
  const ok = await confirmDialog({
    title: `Delete “${e.title}”?`,
    message: `It’s deleted from Google Calendar (${e.calendar}) on all your devices. This can’t be undone here.`,
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  const res = await gcalDeleteEvent(e);
  if (res.ok) toast(`Deleted: ${e.title}`, { icon: 'trash' });
  else toast(EDIT_REASONS[res.reason] ?? EDIT_REASONS.failed, { icon: 'info', duration: 7000 });
}

/* ---------- Turn into a to-do (always asks first) ---------- */

export async function turnIntoTodo(e) {
  const ok = await confirmDialog({
    title: 'Turn into a to-do?',
    message: `“${e.title}” (${eventWhen(e)}) becomes a to-do with the same day and time. The event stays in ${String(e.cal ?? '').startsWith('apple:') ? 'Apple Calendar' : 'Google Calendar'}${e.calendar ? ` (${e.calendar})` : ''}.`,
    confirmLabel: 'Make the to-do',
  });
  if (!ok) return null;
  const date = e.allDay ? e.date : todayKey(e.start.getTime());
  const timed = !e.allDay;
  const endSameDay = timed && todayKey(e.end.getTime() - 1) === date;
  const notes = [e.location ? `Where: ${e.location}` : '', plainText(e.description).trim(), e.url ? `Google Calendar: ${e.url}` : ''].filter(Boolean).join('\n\n');
  const task = await createTask({
    title: e.title.slice(0, 200),
    date,
    startTime: timed ? clockOf(e.start.getTime()) : null,
    endTime: timed && endSameDay && e.end > e.start ? clockOf(e.end.getTime()) : null,
    notes,
    addToCalendar: false, // the event is already there
  });
  toast(`To-do added: ${task.title}`, { icon: 'checklist', action: { label: 'Open', onClick: () => openTask(task.id) } });
  return task;
}

/* ---------- The editor ---------- */

/** The next whole hour in Manila (for a new event today), as "HH:MM". */
function nextHour() {
  const [h] = clockOf().split(':').map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:00`;
}

const mins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const clockFrom = (m) => { const x = Math.min(Math.max(m, 0), 23 * 60 + 59); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

function plusHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(h + 1 > 23 ? 59 : m).padStart(2, '0')}`;
}

/** Why events can't be added from here right now, in plain words — or '' when they can. */
export function cantAddEvents() {
  if (!gcalAvailable()) return 'Connect sync with your Google Sheet (Settings → Sync) to add events to Google Calendar.';
  if (!gcalCanEdit()) return 'Update the sync script to version 17 (Settings → Sync → Update the sync script) to add events from here.';
  if (!writableCalendars().length) return 'Your calendars are still loading — open the Calendar page once, then try again.';
  return '';
}

/**
 * Add an event, or change `event`. The others fill a new one: date ("YYYY-MM-DD"),
 * startTime / endTime ("HH:MM"), title, allDay. Resolves with the saved event, or null.
 */
export async function openEventEditor({ event = null, date = null, startTime = null, endTime = null, title = '', allDay = false } = {}) {
  const problem = cantAddEvents();
  if (problem) {
    toast(problem, { icon: 'info', duration: 7000 });
    return null;
  }
  const cals = writableCalendars();
  const editing = Boolean(event);
  const today = todayKey();
  const v = editing
    ? {
      title: event.title,
      cal: event.cal,
      allDay: event.allDay,
      date: event.allDay ? event.date : todayKey(event.start.getTime()),
      endDate: event.allDay ? addDays(event.endDate ?? addDays(event.date, 1), -1) : todayKey(event.end.getTime() - 1),
      start: event.allDay ? '09:00' : clockOf(event.start.getTime()),
      end: event.allDay ? '10:00' : clockOf(event.end.getTime()),
      location: event.location ?? '',
      description: plainText(event.description),
    }
    : (() => {
      const d = isDateKey(date) ? date : today;
      const s = isClock(startTime) ? startTime : d === today ? nextHour() : '09:00';
      const e = isClock(endTime) && endTime > s ? endTime : plusHour(s);
      return { title, cal: defaultEventCalendar()?.id ?? cals[0].id, allDay: Boolean(allDay), date: d, endDate: d, start: s, end: e, location: '', description: '' };
    })();

  const result = await openDialog({
    variant: 'sheet',
    className: 'ev-sheet accent-todo',
    dismissible: false,
    title: editing ? 'Edit event' : 'New event',
    body: html`<form class="form ev-form${v.allDay ? ' is-allday' : ''}" data-evform novalidate>
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="title" maxlength="300" autocomplete="off" enterkeyhint="done" value="${v.title}" placeholder="e.g. Lunch with Ana"></label>
      <label class="field"><span class="field__label">Calendar</span>
        <span class="ev-cal" style="--cal: ${safeColor(calendarColor(cals.find((c) => c.id === v.cal)))}" data-evcal-dot>
          <select class="input" name="cal">${cals.map((c) => html`<option value="${c.id}"${c.id === v.cal ? raw(' selected') : ''}>${c.name}${c.tasks ? ' (your to-dos)' : ''}</option>`)}</select>
        </span></label>
      <label class="row ev-form__allday">
        <span class="row__text"><span class="row__label">All day</span></span>
        <input type="checkbox" class="switch" switch name="allDay"${v.allDay ? raw(' checked') : ''}>
      </label>
      <div class="field-row">
        <label class="field"><span class="field__label">Starts</span><input class="input" type="date" name="date" value="${v.date}" required></label>
        <label class="field ev-time"><span class="field__label">At</span><input class="input" type="time" name="start" value="${v.start}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="field__label">Ends</span><input class="input" type="date" name="endDate" value="${v.endDate}"></label>
        <label class="field ev-time"><span class="field__label">At</span><input class="input" type="time" name="end" value="${v.end}"></label>
      </div>
      <label class="field"><span class="field__label">Where <span class="muted">(optional)</span></span>
        <input class="input" name="location" maxlength="300" autocomplete="off" value="${v.location}"></label>
      <label class="field"><span class="field__label">Notes <span class="muted">(optional)</span></span>
        <textarea class="input" name="description" rows="3" maxlength="8000">${v.description}</textarea></label>
      <label class="field"><span class="field__label">Alert</span>
        <select class="input" name="alert">${ALERTS.map((a) => html`<option value="${a.value}"${a.value === 'keep' ? raw(' selected') : ''}>${a.value === 'keep' && editing ? 'Keep as it is' : a.label}</option>`)}</select></label>
      <p class="faint ev-form__tz">Times are Manila time. It’s saved straight to Google Calendar, so it needs the internet.</p>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary" data-save>${editing ? 'Save' : 'Add event'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-evform]');
      const error = form.querySelector('[data-error]');
      const save = form.querySelector('[data-save]');
      const snapshot = () => JSON.stringify([...new FormData(form).entries()]);
      const initial = snapshot();
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.title.focus({ preventScroll: true }), 320);
      let lastStart = form.elements.start.value;
      const showError = (text) => {
        setHTML(error, html`${text}`);
        error.hidden = false;
      };
      form.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('change', (ev) => {
        const f = form.elements;
        if (ev.target === f.allDay) form.classList.toggle('is-allday', f.allDay.checked);
        if (ev.target === f.cal) form.querySelector('[data-evcal-dot]').style.setProperty('--cal', safeColor(calendarColor(cals.find((c) => c.id === f.cal.value))));
        // Moving the start keeps the length: the end moves with it
        if (ev.target === f.date && f.endDate.value && f.endDate.value < f.date.value) f.endDate.value = f.date.value;
        if (ev.target === f.start && isClock(f.start.value) && f.endDate.value === f.date.value) {
          const length = isClock(lastStart) && isClock(f.end.value) ? mins(f.end.value) - mins(lastStart) : 60;
          f.end.value = clockFrom(mins(f.start.value) + (length > 0 ? length : 60));
        }
        if (ev.target === f.start && isClock(f.start.value)) lastStart = f.start.value;
      });
      form.addEventListener('click', async (ev) => {
        if (!ev.target.closest('[data-cancel]')) return;
        if (snapshot() === initial || await confirmDialog({
          title: editing ? 'Discard your changes?' : 'Discard this event?',
          message: 'What you typed will be lost.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
          destructive: true,
        })) close(null);
      });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (save.disabled) return;
        const f = form.elements;
        const name = f.title.value.replace(/\s+/g, ' ').trim();
        const all = f.allDay.checked;
        const startDay = f.date.value;
        const endDay = f.endDate.value || startDay;
        if (!name) { showError('Give the event a name.'); f.title.focus(); return; }
        if (!isDateKey(startDay) || !isDateKey(endDay)) { showError('Check the dates.'); return; }
        const input = {
          id: editing ? event.gid : undefined,
          fromCal: editing ? event.cal : undefined,
          cal: f.cal.value,
          title: name,
          allDay: all,
          location: f.location.value.trim(),
          description: f.description.value,
          alerts: f.alert.value === 'keep' ? null : f.alert.value === 'none' ? [] : [Number(f.alert.value)],
        };
        if (all) {
          if (endDay < startDay) { showError('The last day can’t be before the first.'); return; }
          input.date = startDay;
          input.endDate = addDays(endDay, 1);
        } else {
          if (!isClock(f.start.value) || !isClock(f.end.value)) { showError('Add a start and end time, or switch on All day.'); return; }
          input.start = at(startDay, f.start.value);
          input.end = at(endDay, f.end.value);
          if (input.end <= input.start) { showError(EDIT_REASONS['event-bad-time']); return; }
        }
        save.disabled = true;
        save.textContent = 'Saving…';
        const res = await gcalSaveEvent(input);
        save.disabled = false;
        save.textContent = editing ? 'Save' : 'Add event';
        if (!res.ok) { showError(EDIT_REASONS[res.reason] ?? EDIT_REASONS.failed); return; }
        if (!editing && input.cal !== state.settings.calendar?.newEventCal) updateSettings((s) => { s.calendar.newEventCal = input.cal; });
        close(res.event);
      });
    },
  });
  if (!result || typeof result !== 'object') return null;
  const calName = gcalCalendars().find((c) => c.id === result.cal)?.name ?? 'Google Calendar';
  toast(editing ? 'Event saved.' : `Event added to ${calName}: ${result.title}`, { icon: 'calendarCheck' });
  return result;
}

/* ---------- Quick Add ---------- */

registerQuickAdd({ id: 'event', label: 'Add event', icon: 'calendar', accent: 'todo', order: 12, run: () => openEventEditor() });
