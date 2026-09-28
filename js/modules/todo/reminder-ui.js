/* Choosing reminders — the Reminders part of the task sheet and the subtask
   sheet, and the Reminders sheet the quick menu opens.

   Three quick choices (10 min, 30 min, 1 hour before — tap to switch on or off),
   Custom (any number of minutes, hours or days before, or an exact date and
   time), and what happens if the task still isn't done after it rang:
   remind again every few hours (Settings → Tasks → Reminders), or not. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { openDialog, toast } from '../../core/ui.js';
import { state } from '../../core/state.js';
import { at, formatClock, isClock, isDateKey, todayKey } from '../../core/manila.js';
import {
  FOLLOW_CHOICES, REMINDER_PRESETS, alertTimeText, minutesText, newReminder, nextAlertAt, reminderLabel, reminderSettings,
  sameReminder, sortReminders,
} from './alerts.js';

const settings = () => reminderSettings(state.settings.tasks);
const isPreset = (r) => r.kind === 'before' && REMINDER_PRESETS.includes(Number(r.minutes));

/** A reminder that is only in the sheet so far (not saved) rings from its time, whatever the saved history says. */
function hint(item, now = Date.now()) {
  const s = settings();
  const list = item.reminders ?? [];
  if (!list.length) return item.date ? 'Optional.' : 'Optional. “Before” reminders need a date — Custom can pick an exact time.';
  if (!item.date && list.some((r) => r.kind !== 'at')) return 'Add a date so the “before” reminders can ring.';
  const from = item.date && !item.startTime ? `No time set, so they count from ${formatClock(s.defaultTime)}. ` : '';
  const next = nextAlertAt({ ...item, status: 'open', deletedAt: null, sample: false, parentGone: false, alerts: {} }, s, now);
  return next ? `${from}Next: ${alertTimeText(next, now)}.` : `${from}These times have passed.`;
}

const everyText = (m) => (m === 60 ? 'every hour' : `every ${minutesText(m)}`);

function followLabel() {
  const f = settings().followUps;
  return f.enabled ? `As in Settings: ${everyText(f.minutes)}` : 'As in Settings: don’t';
}

function followValue(item) {
  const f = item.followUp;
  if (!f) return '';
  if (f.enabled === false) return 'off';
  return FOLLOW_CHOICES.includes(Number(f.minutes)) ? String(f.minutes) : '';
}

function chips(item) {
  const list = sortReminders(item.reminders ?? []);
  const on = (m) => list.some((r) => r.kind === 'before' && Number(r.minutes) === m);
  const custom = list.filter((r) => !isPreset(r));
  return html`${REMINDER_PRESETS.map((m) => html`<button type="button" class="tform__quick" data-rem-preset="${m}" aria-pressed="${on(m) ? 'true' : 'false'}">${minutesText(m)} before</button>`)}
    ${custom.map((r) => html`<span class="rem-chip">${icon('bell')}<span>${reminderLabel(r)}</span><button type="button" class="rem-chip__x" data-rem-remove="${r.id}" aria-label="Remove the reminder ${reminderLabel(r)}">${icon('x')}</button></span>`)}
    <button type="button" class="tform__quick rem-custom" data-rem-custom>${icon('plus')}Custom</button>`;
}

/** The Reminders field. item: the task or subtask being edited (its date and time matter). */
export function reminderFieldMarkup(item, { id = 'rem' } = {}) {
  const value = followValue(item);
  const opt = (v, label) => html`<option value="${v}"${raw(v === value ? ' selected' : '')}>${label}</option>`;
  return html`<div class="tform__field rem-field" role="group" aria-labelledby="${id}-label" data-reminders>
    <span class="field__label" id="${id}-label">Reminders</span>
    <div class="rem-chips" data-rem-chips>${chips(item)}</div>
    <p class="tform__hint" data-rem-hint aria-live="polite">${hint(item)}</p>
    <label class="rem-follow" data-rem-follow${raw((item.reminders ?? []).length ? '' : ' hidden')}>
      <span class="rem-follow__label">If it’s still not done</span>
      <select class="select" name="followUp" data-rem-follow-select>
        ${opt('', followLabel())}
        ${FOLLOW_CHOICES.map((m) => opt(String(m), `Remind me again ${everyText(m)}`))}
        ${opt('off', 'Don’t remind me again')}
      </select>
    </label>
  </div>`;
}

/** Once per device: a word about when reminders can ring. */
function firstReminderTip() {
  try {
    if (localStorage.getItem('ld.reminderTip')) return;
    localStorage.setItem('ld.reminderTip', '1');
  } catch { /* private browsing: show it anyway */ }
  toast('Reminders ring while Life Dashboard is open on your screen. Google Calendar alerts, for a locked phone, arrive in the next update.', { icon: 'bell', duration: 8000 });
}

/**
 * Make the Reminders field work.
 *   get()        the item as it is now (date, startTime, reminders, followUp)
 *   set(patch)   { reminders } or { followUp } changed — save or keep them
 * Returns { refresh() } — call it when the date or time changes.
 */
export function bindReminderField(root, { get, set }) {
  const field = root.querySelector('[data-reminders]');
  const refresh = () => {
    const item = get();
    setHTML(field.querySelector('[data-rem-chips]'), chips(item));
    field.querySelector('[data-rem-hint]').textContent = hint(item);
    field.querySelector('[data-rem-follow]').hidden = !(item.reminders ?? []).length;
  };
  const change = (reminders) => {
    const before = (get().reminders ?? []).length;
    set({ reminders: sortReminders(reminders) });
    refresh();
    if (!before && reminders.length) firstReminderTip();
  };
  field.addEventListener('click', async (event) => {
    const b = event.target.closest('button');
    if (!b) return;
    const list = get().reminders ?? [];
    if (b.dataset.remPreset) {
      const minutes = Number(b.dataset.remPreset);
      const has = list.some((r) => r.kind === 'before' && Number(r.minutes) === minutes);
      change(has ? list.filter((r) => !(r.kind === 'before' && Number(r.minutes) === minutes)) : [...list, newReminder({ kind: 'before', minutes })]);
      field.querySelector(`[data-rem-preset="${minutes}"]`)?.focus();
    } else if (b.dataset.remRemove) {
      change(list.filter((r) => r.id !== b.dataset.remRemove));
      field.querySelector('[data-rem-custom]')?.focus();
    } else if ('remCustom' in b.dataset) {
      const fields = await askCustomReminder(get());
      if (!fields) return;
      if (list.some((r) => sameReminder(r, fields))) {
        toast('That reminder is already there.', { icon: 'bell' });
        return;
      }
      change([...list, newReminder(fields)]);
    }
  });
  field.addEventListener('change', (event) => {
    if (!event.target.matches('[data-rem-follow-select]')) return;
    const v = event.target.value;
    set({ followUp: v === 'off' ? { enabled: false } : v ? { enabled: true, minutes: Number(v) } : null });
  });
  return { refresh };
}

/* ---------- Custom reminder ---------- */

/** Any number of minutes, hours or days before — or an exact date and time. Resolves with the reminder's fields, or null. */
export async function askCustomReminder(item) {
  const s = settings();
  const today = todayKey();
  const hasDate = Boolean(item.date);
  const nextHour = `${String((new Date(Date.now() + 8 * 3600e3).getUTCHours() + 1) % 24).padStart(2, '0')}:00`;
  const atDate = item.date ?? today;
  const atTime = item.startTime ?? (item.date ? s.defaultTime : nextHour);
  return openDialog({
    variant: 'alert',
    className: 'prompt-dialog rem-dialog',
    dismissible: false, // only Cancel or Add closes it
    title: 'Custom reminder',
    body: html`<form class="prompt rem-form" data-rem-form novalidate>
      <div class="segmented rem-form__mode" role="radiogroup" aria-label="Kind of reminder">
        <label class="segmented__opt"><input type="radio" name="mode" value="before"${raw(hasDate ? ' checked' : '')}${raw(hasDate ? '' : ' disabled')}><span>Before</span></label>
        <label class="segmented__opt"><input type="radio" name="mode" value="at"${raw(hasDate ? '' : ' checked')}><span>At a time</span></label>
      </div>
      <div class="rem-form__row" data-mode="before"${raw(hasDate ? '' : ' hidden')}>
        <input class="input rem-form__amount" name="amount" type="number" inputmode="numeric" min="1" max="999" value="15" aria-label="How many">
        <select class="select" name="unit" aria-label="Minutes, hours or days">
          <option value="1" selected>minutes</option><option value="60">hours</option><option value="1440">days</option>
        </select>
        <span class="rem-form__word">before</span>
      </div>
      <div class="rem-form__row" data-mode="at"${raw(hasDate ? ' hidden' : '')}>
        <input class="input" name="date" type="date" value="${atDate}" aria-label="Date">
        <input class="input" name="time" type="time" value="${atTime}" aria-label="Time">
      </div>
      <p class="tform__hint">${hasDate ? `Counts from ${item.startTime ? formatClock(item.startTime) : `${formatClock(s.defaultTime)} (no time set)`}.` : 'This has no date, so pick the date and time to be reminded.'}</p>
      <p class="form-error" data-rem-error hidden></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="__cancel">Cancel</button>
        <button type="submit" class="btn btn--primary">Add</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-rem-form]');
      const error = dlg.querySelector('[data-rem-error]');
      const fail = (text, el) => {
        error.textContent = text;
        error.hidden = false;
        el?.focus();
      };
      form.addEventListener('change', (event) => {
        if (event.target.name !== 'mode') return;
        form.querySelectorAll('[data-mode]').forEach((row) => { row.hidden = row.dataset.mode !== event.target.value; });
        error.hidden = true;
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (form.elements.mode.value === 'before') {
          const amount = Math.round(Number(form.elements.amount.value));
          const minutes = amount * Number(form.elements.unit.value);
          if (!Number.isFinite(amount) || amount < 1 || minutes > 40320) {
            fail('Choose from 1 minute to 4 weeks before.', form.elements.amount);
            return;
          }
          close({ kind: 'before', minutes });
          return;
        }
        const date = form.elements.date.value;
        const time = form.elements.time.value;
        if (!isDateKey(date) || !isClock(time)) {
          fail('Pick a date and a time.', form.elements.date);
          return;
        }
        const when = at(date, time).getTime();
        if (when <= Date.now()) {
          fail('That time has already passed.', form.elements.time);
          return;
        }
        close({ kind: 'at', at: new Date(when).toISOString() });
      });
    },
  }).then((value) => (value && typeof value === 'object' ? value : null));
}

/* ---------- The Reminders sheet (quick menu → Reminder) ---------- */

/**
 * Reminders for one task or subtask. item: its current copy; save(patch) stores
 * { reminders, followUp }. Resolves true when saved.
 */
export async function openReminderSheet(item, { title, save }) {
  let draft = { ...item, reminders: [...(item.reminders ?? [])] };
  const start = JSON.stringify([draft.reminders, draft.followUp ?? null]);
  const when = item.date
    ? `${alertTimeText(at(item.date, item.startTime || settings().defaultTime).getTime())}${item.startTime ? '' : ' (no time set)'}`
    : 'No date';
  const choice = await openDialog({
    variant: 'sheet',
    className: 'rem-sheet accent-todo',
    dismissible: false, // only Cancel or Save closes it
    title: 'Reminders',
    body: html`<form class="tform" data-rem-sheet novalidate>
      <p class="rem-sheet__for"><strong>${title}</strong><span>${when}</span></p>
      ${reminderFieldMarkup(draft, { id: 'rs' })}
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-rem-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-rem-sheet]');
      bindReminderField(form, { get: () => draft, set: (patch) => { draft = { ...draft, ...patch }; } });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close('save');
      });
      form.querySelector('[data-rem-cancel]').addEventListener('click', async () => {
        const changed = JSON.stringify([draft.reminders, draft.followUp ?? null]) !== start;
        if (changed && !(await openDialog({
          variant: 'alert',
          title: 'Discard these changes?',
          body: html`<p class="dlg__msg">The reminders stay as they were.</p>`,
          actions: [{ label: 'Keep editing', value: 'keep', variant: 'ghost', autofocus: true }, { label: 'Discard', value: 'discard', variant: 'danger-solid' }],
        }) === 'discard')) return;
        close(null);
      });
    },
  });
  if (choice !== 'save') return false;
  await save({ reminders: draft.reminders, followUp: draft.followUp ?? null });
  return true;
}
