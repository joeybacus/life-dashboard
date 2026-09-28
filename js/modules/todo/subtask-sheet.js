/* A subtask's own sheet: its name, its own date and time, and its reminders.
   Opened from the clock button on a subtask in the task sheet, or from a
   subtask's row in Today, Upcoming or Overdue (quick menu → Details). Like a
   task, it can go to Google Calendar (sync script version 6).
   Like every sheet you type in, only Cancel or Save closes it; Cancel asks
   first if you changed something. A subtask with a date also shows as its
   own row in Today, Upcoming and Overdue. */
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { addDays, daysFrom, formatDayLong, todayKey } from '../../core/manila.js';
import { MAX_TITLE } from './model.js';
import { getSub, getTask, saveSub } from './store.js';
import { bindReminderField, reminderFieldMarkup } from './reminder-ui.js';
import { autoCalendar, bindCalendarField, calendarFieldMarkup } from './calendar-link.js';

const disabledAttr = (on) => (on ? raw(' disabled') : '');

function dateHint(item, today) {
  if (!item.date) return 'No date — it stays inside its task only.';
  const near = { 0: 'Today', 1: 'Tomorrow', [-1]: 'Yesterday' }[daysFrom(today, item.date)];
  const day = near ? `${near} · ${formatDayLong(item.date)}` : formatDayLong(item.date);
  return `${day} — it also shows in Today, Upcoming and Overdue.`;
}

/**
 * Edit a subtask. sub: its current copy; parentTitle: its task's name;
 * save(fields): stores { title, date, startTime, endTime, reminders, followUp };
 * openParent(): shows its task (from a list row). Resolves true when saved.
 */
export async function subtaskSheet(sub, { parentTitle = '', save, openParent = null }) {
  const today = todayKey();
  let draft = {
    id: sub.id, sample: Boolean(sub.sample),
    title: sub.title ?? '', date: sub.date ?? null, startTime: sub.startTime ?? null, endTime: sub.endTime ?? null,
    reminders: [...(sub.reminders ?? [])], followUp: sub.followUp ?? null, addToCalendar: Boolean(sub.addToCalendar),
  };
  const start = JSON.stringify(draft);
  let form = null;
  let reminders = null;
  let calendar = null;
  let calTouched = false;
  const quick = (key, label, date) => html`<button type="button" class="tform__quick" data-date="${key}" aria-pressed="${draft.date === date ? 'true' : 'false'}">${label}</button>`;

  const refreshWhen = () => {
    const quickDates = { today, tomorrow: addDays(today, 1) };
    form.querySelectorAll('[data-date]').forEach((b) => {
      if (b.dataset.date in quickDates) b.setAttribute('aria-pressed', String(draft.date === quickDates[b.dataset.date]));
    });
    form.querySelector('[data-date="none"]').hidden = !draft.date;
    form.elements.date.value = draft.date ?? '';
    form.querySelector('[data-slot="dateHint"]').textContent = dateHint(draft, today);
    if (!draft.date) {
      draft.startTime = null;
      draft.endTime = null;
    }
    if (!draft.startTime) draft.endTime = null;
    const { startTime, endTime } = form.elements;
    startTime.disabled = !draft.date;
    endTime.disabled = !draft.date || !draft.startTime;
    startTime.value = draft.startTime ?? '';
    endTime.value = draft.endTime ?? '';
    form.querySelector('[data-clear-time]').disabled = !draft.startTime;
    reminders?.refresh();
    // "Always add timed tasks": a subtask that gets a time goes to Calendar (unless you switched it yourself)
    if (!calTouched && !draft.addToCalendar && autoCalendar(draft)) draft.addToCalendar = true;
    calendar?.refresh();
  };

  const choice = await openDialog({
    variant: 'sheet',
    className: 'task-sheet sub-sheet accent-todo',
    dismissible: false, // only Cancel or Save closes it
    title: 'Subtask',
    body: html`<form class="tform" data-sub-form novalidate>
      ${parentTitle ? html`<p class="sub-sheet__parent">${icon('checklist')}<span>Part of <strong>${parentTitle}</strong></span>
        ${openParent ? html`<button type="button" class="text-btn" data-open-parent>Open task</button>` : ''}</p>` : ''}
      <label class="tform__field"><span class="field__label">Subtask</span>
        <input class="input" name="title" value="${draft.title}" maxlength="${MAX_TITLE}" placeholder="What needs doing?" autocapitalize="sentences" enterkeyhint="done" required>
      </label>
      <div class="tform__field" role="group" aria-labelledby="ss-date-label">
        <span class="field__label" id="ss-date-label">Date</span>
        <div class="tform__dates">
          ${quick('today', 'Today', today)}
          ${quick('tomorrow', 'Tomorrow', addDays(today, 1))}
          <input type="date" class="input tform__date" name="date" value="${draft.date ?? ''}" aria-label="Pick a date">
          <button type="button" class="tform__quick" data-date="none"${raw(draft.date ? '' : ' hidden')}>No date</button>
        </div>
        <p class="tform__hint" data-slot="dateHint">${dateHint(draft, today)}</p>
      </div>
      <div class="tform__field" role="group" aria-labelledby="ss-time-label">
        <span class="field__label" id="ss-time-label">Time</span>
        <div class="tform__times">
          <input type="time" class="input" name="startTime" value="${draft.startTime ?? ''}" aria-label="Start time"${disabledAttr(!draft.date)}>
          <span class="tform__to" aria-hidden="true">to</span>
          <input type="time" class="input" name="endTime" value="${draft.endTime ?? ''}" aria-label="End time (optional)"${disabledAttr(!draft.date || !draft.startTime)}>
          <button type="button" class="tform__quick" data-clear-time${disabledAttr(!draft.startTime)}>No time</button>
        </div>
      </div>
      ${reminderFieldMarkup(draft, { id: 'ss-rem' })}
      ${calendarFieldMarkup(draft, { kind: 'subtask' })}
      <div class="tform__footer">
        <button type="button" class="btn btn--ghost" data-sub-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      form = dlg.querySelector('[data-sub-form]');
      reminders = bindReminderField(form, { get: () => draft, set: (patch) => { draft = { ...draft, ...patch }; } });
      calendar = bindCalendarField(form, {
        get: () => draft,
        kind: 'subtask',
        touched: () => { calTouched = true; },
        set: (on) => { draft = { ...draft, addToCalendar: on }; },
      });
      form.addEventListener('input', (event) => {
        if (event.target.name === 'title') draft.title = event.target.value;
      });
      form.addEventListener('change', (event) => {
        const t = event.target;
        if (t.name === 'date') draft.date = t.value || null;
        else if (t.name === 'startTime') draft.startTime = t.value || null;
        else if (t.name === 'endTime') draft.endTime = t.value || null;
        else return; // the reminders and Google Calendar parts keep their own changes
        refreshWhen();
      });
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey || event.target.name === 'title')) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener('click', async (event) => {
        const b = event.target.closest('button');
        if (!b) return;
        if (b.dataset.date) {
          draft.date = { today, tomorrow: addDays(today, 1), none: null }[b.dataset.date];
          refreshWhen();
        } else if ('clearTime' in b.dataset) {
          draft.startTime = null;
          draft.endTime = null;
          refreshWhen();
        } else if ('subCancel' in b.dataset) {
          if (JSON.stringify(draft) !== start && !(await confirmDialog({ title: 'Discard these changes?', message: 'The subtask stays as it was.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          close(null);
        } else if ('openParent' in b.dataset) {
          if (JSON.stringify(draft) !== start && !(await confirmDialog({ title: 'Discard these changes?', message: 'The subtask stays as it was.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          close('parent');
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        draft.title = draft.title.replace(/\s+/g, ' ').trim();
        if (!draft.title) {
          form.elements.title.focus();
          toast('Give the subtask a name.', { icon: 'info' });
          return;
        }
        close('save');
      });
    },
  });
  calendar?.stop();
  if (choice === 'parent') {
    openParent?.();
    return false;
  }
  if (choice !== 'save') return false;
  await save(draft);
  return true;
}

/** A subtask's sheet from its row in a list: saves straight away, and can open its task. */
export async function openSubtask(id) {
  const sub = await getSub(id);
  const parent = sub ? await getTask(sub.taskId) : null;
  if (!sub || sub.deletedAt || !parent || parent.deletedAt) {
    toast('This subtask was deleted.', { icon: 'info' });
    return;
  }
  const saved = await subtaskSheet(sub, {
    parentTitle: parent.title,
    save: (fields) => saveSub({ ...sub, ...fields }),
    openParent: () => import('./detail.js').then((m) => m.openTask(parent.id)),
  });
  if (saved) toast('Subtask saved.', { icon: 'checklist' });
}
