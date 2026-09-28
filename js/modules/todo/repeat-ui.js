/* Repeating — the Repeat part of the task sheet, and the Repeat sheet it opens:
   never, every day (or every few days), every weekday, every week on the days
   you choose, every month (on a day, or like "the second Tuesday"), or some
   days after you tick it — ending never, on a date, or after a number of
   times. A preview shows the next few dates, so you can see it's right. */
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { confirmDialog, openDialog } from '../../core/ui.js';
import { formatDay, isDateKey, todayKey, weekdayOf } from '../../core/manila.js';
import { DAY_NAMES, ORDINAL_WORDS, cleanRule, describeRule, firstDate, lastOfCount, nextDate } from './repeat.js';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** The line under the Repeat button: when the next one comes. */
function hint(item, today = todayKey()) {
  const rule = cleanRule(item.recurrence);
  if (!rule) return 'Optional.';
  if (!item.date) return `Starts ${formatDay(firstDate(rule, today))}.`;
  const of = rule.count ? ` This is ${item.seriesIndex ?? 1} of ${rule.count}.` : '';
  if (lastOfCount(item)) return 'This is the last one.';
  if (rule.kind === 'afterDone') return `The next one comes ${rule.interval} ${plural(rule.interval, 'day')} after you tick this one.${of}`;
  const next = nextDate(rule, item.date, { today });
  return next ? `After this one: ${formatDay(next)}.${of}` : 'This is the last one.';
}

/** The Repeat field. item: the task being edited (its date matters). */
export function repeatFieldMarkup(item, { id = 'rep' } = {}) {
  const rule = cleanRule(item.recurrence);
  return html`<div class="tform__field rpt-field" role="group" aria-labelledby="${id}-label" data-repeat>
    <span class="field__label" id="${id}-label">Repeat</span>
    <button type="button" class="rpt-field__btn${rule ? ' is-on' : ''}" data-repeat-open aria-describedby="${id}-hint">
      ${icon('repeat')}<span class="rpt-field__text" data-repeat-text>${rule ? describeRule(rule) : 'Never'}</span>${icon('chevronRight', 'rpt-field__chev')}
    </button>
    <p class="tform__hint" id="${id}-hint" data-repeat-hint aria-live="polite">${hint(item)}</p>
  </div>`;
}

/**
 * Make the Repeat field work.
 *   get()        the task as it is now
 *   set(patch)   { recurrence, date } changed — save or keep them
 * Returns { refresh() } — call it when the date changes.
 */
export function bindRepeatField(root, { get, set }) {
  const field = root.querySelector('[data-repeat]');
  const refresh = () => {
    const item = get();
    const rule = cleanRule(item.recurrence);
    field.querySelector('[data-repeat-text]').textContent = rule ? describeRule(rule) : 'Never';
    field.querySelector('[data-repeat-open]').classList.toggle('is-on', Boolean(rule));
    field.querySelector('[data-repeat-hint]').textContent = hint(item);
  };
  field.querySelector('[data-repeat-open]').addEventListener('click', async () => {
    const item = get();
    const rule = await openRepeatSheet(item);
    if (rule === undefined) return; // cancelled
    // A task that starts repeating needs a date: the first one on its schedule
    set({ recurrence: rule, date: rule && !item.date ? firstDate(rule) : item.date });
    refresh();
    field.querySelector('[data-repeat-open]').focus();
  });
  return { refresh };
}

/* ---------- The Repeat sheet ---------- */

const number = (name, value, label, max = 365) => html`<input class="input rpt__n" name="${name}" type="number" inputmode="numeric" min="1" max="${max}" value="${value}" aria-label="${label}">`;
const select = (name, options, value, label) => html`<select class="select rpt__select" name="${name}" aria-label="${label}">
  ${options.map(([v, text]) => html`<option value="${v}"${raw(String(v) === String(value) ? ' selected' : '')}>${text}</option>`)}</select>`;

/**
 * Choose how a task repeats. Resolves with the rule, null for "Never", or
 * undefined when cancelled.
 */
export async function openRepeatSheet(item) {
  const today = todayKey();
  const start = item.date ?? today;
  const r = cleanRule(item.recurrence) ?? {};
  const dayOfMonth = Number(start.slice(8));
  const n = (kind) => (r.kind === kind ? r.interval : 1);
  const days = r.kind === 'weekly' && r.days?.length ? r.days : [weekdayOf(start)];
  const byWeek = r.kind === 'monthly' && Boolean(r.week);
  const week = byWeek ? r.week : Math.min(4, Math.ceil(dayOfMonth / 7));
  const weekday = byWeek ? r.weekday : weekdayOf(start);
  const ends = r.until ? 'until' : r.count ? 'count' : 'never';
  const kind = r.kind ?? 'none';
  const opt = (value, label) => html`<label class="rpt__opt"><input type="radio" name="kind" value="${value}"${raw(kind === value ? ' checked' : '')}><span>${label}</span></label>`;

  const result = await openDialog({
    variant: 'sheet',
    className: 'rpt-sheet accent-todo',
    dismissible: false, // only Cancel or Done closes it
    title: 'Repeat',
    body: html`<form class="rpt" data-rpt novalidate>
      <fieldset class="rpt__kinds">
        <legend class="sr-only">How often</legend>
        ${opt('none', 'Never')}
        ${opt('daily', 'Every day')}
        ${opt('weekdays', 'Every weekday (Mon–Fri)')}
        ${opt('weekly', 'Every week')}
        ${opt('monthly', 'Every month')}
        ${opt('afterDone', 'Some days after I tick it')}
      </fieldset>

      <div class="rpt__more" data-for="daily">
        <span>Every</span>${number('dailyN', n('daily'), 'Every how many days')}<span data-unit="dailyN" data-one="day" data-many="days">${plural(n('daily'), 'day')}</span>
      </div>
      <div class="rpt__more rpt__more--col" data-for="weekly">
        <div class="rpt__days" role="group" aria-label="On these days">${DAY_LETTERS.map((letter, d) => html`<button type="button" class="rpt__day" data-day="${d}" aria-pressed="${days.includes(d) ? 'true' : 'false'}" aria-label="${DAY_NAMES[d]}">${letter}</button>`)}</div>
        <div class="rpt__line"><span>Every</span>${number('weeklyN', n('weekly'), 'Every how many weeks', 52)}<span data-unit="weeklyN" data-one="week" data-many="weeks">${plural(n('weekly'), 'week')}</span></div>
      </div>
      <div class="rpt__more rpt__more--col" data-for="monthly">
        <label class="rpt__by"><input type="radio" name="monthlyBy" value="day"${raw(byWeek ? '' : ' checked')}><span>On day</span>${number('monthDay', r.monthDay ?? dayOfMonth, 'Day of the month', 31)}</label>
        <label class="rpt__by"><input type="radio" name="monthlyBy" value="week"${raw(byWeek ? ' checked' : '')}><span>On the</span>
          ${select('week', [1, 2, 3, 4, -1].map((w) => [w, ORDINAL_WORDS[w]]), week, 'Which one')}
          ${select('weekday', DAY_NAMES.map((name, d) => [d, name]), weekday, 'Day of the week')}</label>
        <div class="rpt__line"><span>Every</span>${number('monthlyN', n('monthly'), 'Every how many months', 12)}<span data-unit="monthlyN" data-one="month" data-many="months">${plural(n('monthly'), 'month')}</span></div>
        <p class="tform__hint">Day 29, 30 or 31 falls on the last day of shorter months.</p>
      </div>
      <div class="rpt__more" data-for="afterDone">
        ${number('afterN', n('afterDone'), 'How many days after you tick it')}<span data-unit="afterN" data-one="day after I tick it" data-many="days after I tick it">${plural(n('afterDone'), 'day after I tick it', 'days after I tick it')}</span>
      </div>

      <div class="rpt__ends" data-ends>
        <label class="rpt__line"><span>Ends</span>${select('ends', [['never', 'Never'], ['until', 'On a date'], ['count', 'After a number of times']], ends, 'When it ends')}</label>
        <div class="rpt__line" data-end="until"><input class="input" type="date" name="until" value="${r.until ?? ''}" min="${start}" aria-label="Last date"></div>
        <div class="rpt__line" data-end="count">${number('count', r.count ?? 10, 'How many times in all', 999)}<span>times in all</span></div>
      </div>

      <p class="rpt__preview" data-preview aria-live="polite"></p>
      <p class="form-error" data-rpt-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-rpt-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Done</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-rpt]');
      const error = form.querySelector('[data-rpt-error]');
      const picked = new Set(days);

      /** The rule the form describes now (null for Never), or { error }. */
      const read = () => {
        const f = form.elements;
        const k = f.kind.value;
        if (!k || k === 'none') return null;
        const num = (name) => Math.round(Number(f[name].value));
        const rule = { kind: k };
        if (k === 'daily') rule.interval = num('dailyN');
        if (k === 'afterDone') rule.interval = num('afterN');
        if (k === 'weekly') {
          if (!picked.size) return { error: 'Choose at least one day.' };
          rule.interval = num('weeklyN');
          rule.days = [...picked].sort();
        }
        if (k === 'monthly') {
          rule.interval = num('monthlyN');
          if (f.monthlyBy.value === 'week') Object.assign(rule, { week: Number(f.week.value), weekday: Number(f.weekday.value) });
          else rule.monthDay = num('monthDay');
        }
        if (f.ends.value === 'until') {
          if (!isDateKey(f.until.value)) return { error: 'Pick the last date.' };
          if (f.until.value < start) return { error: 'The end date is before the first one.' };
          rule.until = f.until.value;
        } else if (f.ends.value === 'count') {
          if (!(num('count') >= 1)) return { error: 'Choose how many times.' };
          rule.count = num('count');
        }
        return cleanRule(rule);
      };

      const refresh = () => {
        const k = form.elements.kind.value || 'none';
        form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== k; });
        form.querySelector('[data-ends]').hidden = k === 'none';
        const endMode = form.elements.ends.value;
        form.querySelectorAll('[data-end]').forEach((el) => { el.hidden = el.dataset.end !== endMode; });
        form.querySelectorAll('[data-unit]').forEach((el) => {
          const v = Math.round(Number(form.elements[el.dataset.unit].value));
          el.textContent = v === 1 ? el.dataset.one : el.dataset.many;
        });
        const rule = read();
        error.hidden = true;
        const preview = form.querySelector('[data-preview]');
        if (!rule || rule.error) {
          preview.textContent = rule?.error ? '' : 'It happens once.';
          return;
        }
        if (rule.kind === 'afterDone') {
          preview.textContent = `${describeRule(rule)}: the next one appears when you tick this one.`;
          return;
        }
        // The first few dates (from the task's date, or the first day on the schedule)
        const first = item.date ?? firstDate(rule, today);
        const dates = [first];
        const limit = Math.min(4, rule.count ?? 4);
        for (let d = first; dates.length < limit;) {
          d = nextDate(rule, d, { today: d });
          if (!d) break;
          dates.push(d);
        }
        preview.textContent = `${describeRule(rule)}: ${dates.map(formatDay).join(' · ')}${dates.length === limit && !(rule.count && rule.count <= limit) ? ' …' : ''}`;
      };
      refresh();

      const initial = JSON.stringify(read());
      form.addEventListener('change', refresh);
      form.addEventListener('input', refresh);
      form.addEventListener('click', async (event) => {
        const day = event.target.closest('[data-day]');
        if (day) {
          const d = Number(day.dataset.day);
          if (picked.has(d)) picked.delete(d);
          else picked.add(d);
          day.setAttribute('aria-pressed', String(picked.has(d)));
          refresh();
          return;
        }
        if (event.target.closest('[data-rpt-cancel]')) {
          if (JSON.stringify(read()) !== initial && !(await confirmDialog({ title: 'Discard this change?', message: 'How it repeats stays as it was.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          close(undefined);
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const rule = read();
        if (rule?.error) {
          error.textContent = rule.error;
          error.hidden = false;
          return;
        }
        close({ rule });
      });
    },
  });
  return result && typeof result === 'object' ? result.rule : undefined;
}

