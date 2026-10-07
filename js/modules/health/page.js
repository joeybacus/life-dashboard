/* The Health page (#/workout/health) and one measurement's page
   (#/workout/health/<kind>, e.g. health/waist or health/weight for every
   weigh-in), plus the pop-ups for logging a weight, measurements, height and a
   weight goal. "Log weight" is also on the + button. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { registerQuickAdd } from '../../core/quick-add.js';
import { state, updateSettings } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { formatShortDate, formatTime, formatRelativeDay, toDateKey } from '../../core/dates.js';
import { lineChart, bindCharts } from '../workout/charts.js';
import { currentRange, rangeSwitch, setRange } from '../workout/stats.js';
import { rangeInfo, rangeStart } from '../workout/analytics.js';
import { shortcutDetails } from '../../services/sync.js';
import {
  KINDS, MEASUREMENTS, bmi, bmiCategory, changeOver, deleteMeasurement, entriesOf, formatChange, formatValue, goalProgress,
  healthyRange, latestOf, loadMeasurements, restoreMeasurement, saveMeasurement, trendOf, valueOf, weeklyRate,
} from './model.js';

let view = null;
let page = { kind: null };
let showAll = false;

const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const yearFormat = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const when = (iso) => `${formatRelativeDay(new Date(iso))} · ${formatTime(new Date(iso))}`;
const healthBadge = (r) => (r.source === 'health' ? html`<span class="hl-src">${icon('heart')}From Apple Health</span>` : '');

export const healthPage = {
  async show(el, { kind = null } = {}) {
    view = el;
    page = { kind };
    bindCharts();
    await render();
  },
};

async function render() {
  const records = await loadMeasurements();
  if (page.kind && KINDS[page.kind] && page.kind !== 'height') renderKind(records, page.kind);
  else renderMain(records);
  view.querySelectorAll('input[data-range]').forEach((input) => input.addEventListener('change', async () => {
    await setRange(input.value);
    render();
  }));
}

/* ---------- The Health page ---------- */

function renderMain(records) {
  const now = new Date();
  const weights = entriesOf(records, 'weight');
  const latest = weights.at(-1) ?? null;
  const height = latestOf(records, 'height');
  const rate = weeklyRate(weights, now);
  const goal = state.settings.health;
  const progress = latest ? goalProgress(goal, latest.valueKg, rate, now) : null;
  const week = changeOver(weights, 7);
  const month = changeOver(weights, 30);
  const trend = trendOf(weights);

  setHTML(view, html`<div class="wk-page hl accent-workout">
    ${subHead({ title: 'Health', back: 'Workout', fallback: '', accent: 'workout', eyebrow: 'Body',
      actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="health:log">${icon('plus')}Log weight</button>` })}

    ${latest ? html`<section class="card card--pad hl-hero" aria-label="Current weight">
      <p class="hl-hero__label">Weight</p>
      <p class="hl-hero__value">${formatValue('weight', latest.valueKg)}</p>
      <p class="hl-hero__when">${when(latest.measuredAt)} ${healthBadge(latest)}</p>
      <dl class="hl-facts">
        <div><dt>7 days</dt><dd>${week ? formatChange('weight', week.delta) : '—'}</dd></div>
        <div><dt>30 days</dt><dd>${month ? formatChange('weight', month.delta) : '—'}</dd></div>
        <div><dt>Trend</dt><dd>${formatValue('weight', trend.at(-1))}</dd></div>
        <div><dt>A week</dt><dd>${rate != null ? formatChange('weight', rate) : '—'}</dd></div>
      </dl>
      ${rate == null ? html`<p class="hl-note">“A week” appears once you have 3 weigh-ins over at least a week in the last 4 weeks.</p>` : ''}
    </section>`
    : html`<section class="card card--pad hl-empty">
      ${icon('scale')}<div><p><strong>No weigh-ins yet</strong></p><p class="muted">Log your weight — mornings, before breakfast, give the steadiest numbers.</p></div>
      <button type="button" class="btn btn--accent" data-action="health:log">${icon('plus')}Log weight</button>
    </section>`}

    ${weights.length ? html`<section class="section" aria-labelledby="hl-chart-title">
      <div class="section__head"><h2 class="section__title" id="hl-chart-title">Weight</h2><span class="section__meta">${rangeInfo(currentRange())[2]}</span></div>
      ${rangeSwitch('hl-range')}
      <div class="card card--pad hl-chart">${weightChart(weights, trend, goal.goalKg)}</div>
    </section>` : ''}

    <section class="section" aria-labelledby="hl-goal-title">
      <div class="section__head"><h2 class="section__title" id="hl-goal-title">Weight goal</h2>
        ${goal.goalKg ? html`<button type="button" class="text-btn" data-action="health:goal">Change</button>` : ''}</div>
      ${goalCard(goal, latest, progress, rate)}
    </section>

    <section class="section" aria-labelledby="hl-bmi-title">
      <div class="section__head"><h2 class="section__title" id="hl-bmi-title">Height and BMI</h2>
        ${height ? html`<button type="button" class="text-btn" data-action="health:height">Change height</button>` : ''}</div>
      ${bmiCard(latest, height)}
    </section>

    <section class="section" aria-labelledby="hl-m-title">
      <div class="section__head"><h2 class="section__title" id="hl-m-title">Measurements</h2>
        <button type="button" class="text-btn" data-action="health:measure">${icon('plus')}Add</button></div>
      <ul class="card lib-list hl-list">${MEASUREMENTS.map((kind) => measurementRow(records, kind))}</ul>
    </section>

    <section class="section" aria-labelledby="hl-ah-title">
      <div class="section__head"><h2 class="section__title" id="hl-ah-title">Apple Health</h2></div>
      ${appleHealthCard(weights)}
    </section>

    ${weights.length ? html`<section class="section" aria-labelledby="hl-log-title">
      <div class="section__head"><h2 class="section__title" id="hl-log-title">Weigh-ins</h2>
        ${weights.length > 8 ? html`<a class="text-btn" href="#/workout/health/weight" data-action="nav" data-route="workout" data-sub="health/weight">See all ${weights.length}</a>` : ''}</div>
      ${entryList(weights.slice(-8).reverse(), weights, 'weight')}
    </section>` : ''}
  </div>`);
}

function weightChart(weights, trendAll, goalKg) {
  const from = rangeStart(currentRange());
  const idx = weights.map((w, i) => i).filter((i) => !from || new Date(weights[i].measuredAt) >= from);
  if (!idx.length) return html`<div class="empty chart-empty">${icon('scale')}<span>No weigh-ins in this period. Choose a longer range.</span></div>`;
  const points = idx.map((i) => {
    const w = weights[i];
    const d = new Date(w.measuredAt);
    return {
      date: d,
      value: w.valueKg,
      readout: {
        text: `${formatShortDate(d)} · ${formatValue('weight', w.valueKg)}`,
        sub: `${formatTime(d)} · trend ${formatValue('weight', trendAll[i])}${w.source === 'health' ? ' · From Apple Health' : ''}`,
      },
    };
  });
  const first = points[0].date;
  const last = points.at(-1).date;
  const fmt = last - first > 300 * 864e5 ? yearFormat : dayFormat;
  return lineChart({
    points,
    label: 'Body weight',
    format: (v) => formatValue('weight', v, { unit: false }),
    trend: points.length > 1 ? idx.map((i) => trendAll[i]) : null,
    goal: goalKg || null,
    legend: { points: 'Weigh-ins', trend: 'Trend', goal: 'Goal' },
    xLabels: points.length > 1 ? [fmt.format(first), fmt.format(last)] : [fmt.format(first)],
  });
}

function goalCard(goal, latest, progress, rate) {
  if (!goal.goalKg) {
    return html`<div class="card card--pad hl-empty">${icon('target')}
      <div><p><strong>No goal set</strong></p><p class="muted">Set a target weight to see your progress and when you might get there.</p></div>
      <button type="button" class="btn" data-action="health:goal">${icon('target')}Set a goal</button></div>`;
  }
  if (!latest || !progress) {
    return html`<div class="card card--pad"><p>Target: <strong>${formatValue('weight', goal.goalKg)}</strong></p><p class="muted">Log a weight to see your progress.</p></div>`;
  }
  const verb = { lose: 'to lose', gain: 'to gain', hold: 'from your target' }[progress.direction];
  let pace = '';
  if (progress.reached) pace = progress.direction === 'hold' ? 'Within 1 kg of your target.' : 'You’ve reached your goal. 🎉';
  else if (progress.eta) pace = `At your pace of ${formatChange('weight', rate)} a week, about ${monthDayYear.format(progress.eta)}.`;
  else if (rate != null) pace = `Your weight is moving ${Math.abs(rate) < 0.05 ? 'very little' : 'the other way'} over the last 4 weeks.`;
  else pace = 'Your pace shows after a week or two of weigh-ins.';
  return html`<div class="card card--pad hl-goal">
    <div class="hl-goal__row">
      <span><span class="muted">Target</span> <strong>${formatValue('weight', goal.goalKg)}</strong></span>
      <span>${progress.reached ? html`<strong>Reached</strong>` : html`<strong>${formatValue('weight', progress.left)}</strong> ${verb}`}</span>
    </div>
    ${progress.direction !== 'hold' ? html`<div class="hl-bar" role="progressbar" aria-label="Progress to your goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress.done * 100)}">
      <span class="hl-bar__fill" style="width:${Math.max(2, Math.round(progress.done * 100))}%"></span></div>
    <p class="hl-goal__from muted">From ${formatValue('weight', goal.startKg ?? latest.valueKg)}${goal.setAt ? ` on ${formatShortDate(new Date(goal.setAt))}` : ''} · ${Math.round(progress.done * 100)}% of the way</p>` : ''}
    <p class="hl-goal__pace">${pace}</p>
  </div>`;
}

function bmiCard(latest, height) {
  if (!height) {
    return html`<div class="card card--pad hl-empty">${icon('ruler')}
      <div><p><strong>Add your height</strong></p><p class="muted">Then your BMI is worked out from your latest weight.</p></div>
      <button type="button" class="btn" data-action="health:height">${icon('ruler')}Add height</button></div>`;
  }
  const value = latest ? bmi(latest.valueKg, height.value) : null;
  const range = healthyRange(height.value);
  return html`<dl class="stat-grid hl-bmi">
    <div class="stat"><dt>${icon('pulse')}BMI</dt><dd class="stat__value">${value ?? '—'}</dd><dd class="stat__sub">${value ? bmiCategory(value) : 'Log a weight'}</dd></div>
    <div class="stat"><dt>${icon('ruler')}Height</dt><dd class="stat__value">${formatValue('height', height.value)}</dd><dd class="stat__sub">${range ? `Healthy ${formatValue('weight', range[0], { unit: false })}–${formatValue('weight', range[1])}` : ''}</dd></div>
  </dl>
  <p class="group__foot">BMI = weight ÷ height². “Healthy” is the weight range for a BMI of 18.5–24.9 at your height (WHO adult ranges). BMI is a rough guide: it can’t tell muscle from fat, so waist and body fat say more as you lift.</p>`;
}

function appleHealthCard(weights) {
  const last = [...weights].reverse().find((w) => w.source === 'health');
  return html`<div class="card card--pad hl-empty">${icon('heart', 'hl-heart')}
    <div>${last
      ? html`<p><strong>Last from Apple Health: ${formatValue('weight', last.valueKg)}</strong></p><p class="muted">${when(last.measuredAt)}. New weigh-ins arrive when your Shortcut runs and the app syncs.</p>`
      : html`<p><strong>Bring in your Apple Health weight</strong></p><p class="muted">A web app can’t read Apple Health, but an Apple Shortcut can send your latest weight here every morning.</p>`}</div>
    <button type="button" class="btn" data-action="health:shortcut">${icon(last ? 'info' : 'sparkles')}${last ? 'Shortcut steps' : 'Set it up'}</button>
  </div>`;
}

/** Step-by-step: an Apple Shortcut that sends the latest Apple Health weight to the sync script (version 12). */
async function shortcutSheet() {
  const d = shortcutDetails();
  if (!d || d.version < 12) {
    const choice = await openDialog({
      variant: 'sheet',
      className: 'hl-sheet accent-workout',
      title: 'Apple Health weight',
      body: html`<p class="dlg__msg">${!d
        ? 'The Shortcut sends your weight to your Google Sheet, so Sync needs to be set up first: Settings → Sync.'
        : 'Your sync script needs a 2-minute update first (version 12). Settings → Sync → Update the sync script shows how.'}</p>`,
      actions: [{ label: 'Close', value: 'close', variant: 'ghost' }, { label: 'Open Settings', value: 'settings', variant: 'primary' }],
    });
    if (choice === 'settings') openPage('settings', '');
    return;
  }
  const field = (name, kind, value) => html`<li><code>${name}</code> <span class="muted">(${kind})</span> = ${value}</li>`;
  await openDialog({
    variant: 'sheet',
    className: 'hl-sheet hl-steps accent-workout',
    title: 'Apple Health weight',
    body: html`<div class="hl-steps__body">
      <p class="muted">Set this up once on your iPhone, in the <strong>Shortcuts</strong> app. Then your latest Apple Health weight is sent to your Google Sheet every morning, and appears here marked “From Apple Health”.</p>
      <div class="hl-copy">
        <button type="button" class="btn btn--sm" data-copy="url">${icon('clipboard')}Copy Web app URL</button>
        <button type="button" class="btn btn--sm" data-copy="token">${icon('clipboard')}Copy secret token</button>
      </div>
      <p class="hl-copy__note muted" data-copied aria-live="polite">Keep the token private — anyone with it and the URL can write to your sheet.</p>
      <h3>1 · Make the Shortcut</h3>
      <ol>
        <li>Open <strong>Shortcuts</strong> → tap <strong>+</strong>. Name it “Send weight to Life Dashboard”.</li>
        <li>Add the action <strong>Find Health Samples</strong>. Set <em>Type</em> to <strong>Weight</strong>, <em>Sort by</em> <strong>Start Date</strong>, <em>Order</em> <strong>Latest First</strong>, turn on <em>Limit</em> and set it to <strong>1</strong>.</li>
        <li>Add <strong>Get Contents of URL</strong>. Tap <em>URL</em> and paste the Web app URL (Copy Web app URL above).</li>
        <li>Tap the arrow (›) on that action: <em>Method</em> <strong>POST</strong>, <em>Request Body</em> <strong>JSON</strong>. Add these fields with <strong>Add new field</strong>:
          <ul class="hl-fields">
            ${field('token', 'Text', 'paste the secret token')}
            ${field('protocol', 'Number', '1')}
            ${field('action', 'Text', 'healthWeight')}
            ${field('value', 'Text', html`tap the box, choose <strong>Health Samples</strong> above the keyboard, tap it again → <strong>Value</strong>`)}
            ${field('unit', 'Text', html`<strong>Health Samples</strong> → <strong>Unit</strong>`)}
            ${field('date', 'Text', html`<strong>Health Samples</strong> → <strong>Start Date</strong>, then tap it → <em>Date Format</em> <strong>ISO 8601</strong>`)}
          </ul></li>
        <li>Optional, to see what happened: add <strong>Get Dictionary Value</strong> (Key: <code>message</code>, in <em>Contents of URL</em>), then <strong>Show Notification</strong> with the Dictionary Value.</li>
        <li>Tap <strong>▶</strong> to try it. Allow it to read your weight and to connect to script.google.com. You should see “Saved 78.4 kg to Life Dashboard…”.</li>
      </ol>
      <h3>2 · Run it every morning</h3>
      <ol start="7">
        <li>In Shortcuts, open the <strong>Automation</strong> tab → <strong>+</strong> → <strong>Time of Day</strong>, e.g. 10:00 AM, <strong>Daily</strong>.</li>
        <li>Choose <strong>Run Immediately</strong>, tap <strong>Next</strong>, and pick “Send weight to Life Dashboard”.</li>
      </ol>
      <h3>Good to know</h3>
      <ul>
        <li>A weigh-in already sent is skipped, so running it more often is fine. One you edit or delete here never comes back.</li>
        <li>Weights in pounds are changed to kg. New weigh-ins show up here after the app syncs.</li>
        <li>If you also log the same weigh-in by hand, you’ll have two entries — delete one.</li>
      </ul>
    </div>`,
    actions: [{ label: 'Done', value: 'done', variant: 'primary' }],
    onOpen(dlg) {
      dlg.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-copy]');
        if (!b) return;
        const text = b.dataset.copy === 'url' ? d.url : d.token;
        const note = dlg.querySelector('[data-copied]');
        try {
          await navigator.clipboard.writeText(text);
          note.textContent = b.dataset.copy === 'url' ? 'Web app URL copied — paste it into the URL box.' : 'Secret token copied — paste it as the token field. Keep it private.';
        } catch {
          note.textContent = `Couldn’t copy. ${b.dataset.copy === 'url' ? `The URL is: ${text}` : 'Copy the token from Settings → Sync, or the Connection tab of your Google Sheet.'}`;
        }
      });
    },
  });
}

function measurementRow(records, kind) {
  const list = entriesOf(records, kind);
  const latest = list.at(-1);
  const prev = list.at(-2);
  const k = KINDS[kind];
  return html`<li><a class="lib-item" href="#/workout/health/${kind}" data-action="nav" data-route="workout" data-sub="health/${kind}">
    <span class="lib-item__text"><span class="lib-item__name">${k.label}</span>
      <span class="lib-item__meta">${latest ? formatShortDate(new Date(latest.measuredAt)) : 'Not measured yet'}${prev ? ` · ${formatChange(kind, valueOf(latest) - valueOf(prev))} since the last` : ''}</span></span>
    <span class="hl-list__value">${latest ? formatValue(kind, valueOf(latest)) : ''}</span>
    ${icon('chevronRight', 'row__chev')}
  </a></li>`;
}

/** Entries, newest first, each with its change from the one before; tap to edit. */
function entryList(shown, all, kind) {
  return html`<ul class="card hl-entries">${shown.map((e) => {
    const i = all.indexOf(e);
    const prev = i > 0 ? all[i - 1] : null;
    return html`<li><button type="button" class="hl-entry" data-action="health:edit" data-id="${e.id}">
      <span class="hl-entry__when"><span>${formatShortDate(new Date(e.measuredAt))}</span><small>${formatTime(new Date(e.measuredAt))}${e.source === 'health' ? ' · Apple Health' : ''}${e.sample ? ' · sample' : ''}${e.note ? ` · ${e.note}` : ''}</small></span>
      <span class="hl-entry__change">${prev ? formatChange(kind, valueOf(e) - valueOf(prev)) : ''}</span>
      <span class="hl-entry__value">${formatValue(kind, valueOf(e))}</span>
    </button></li>`;
  })}</ul>`;
}

/* ---------- One measurement's page ---------- */

function renderKind(records, kind) {
  const k = KINDS[kind];
  const list = entriesOf(records, kind);
  const from = rangeStart(currentRange());
  const inRange = list.filter((e) => !from || new Date(e.measuredAt) >= from);
  const all = kind === 'weight' || showAll ? list : list.slice(-30);
  const trend = kind === 'weight' ? trendOf(list) : null;
  let chart = '';
  if (inRange.length) {
    const points = inRange.map((e) => {
      const d = new Date(e.measuredAt);
      return { date: d, value: valueOf(e), readout: { text: `${formatShortDate(d)} · ${formatValue(kind, valueOf(e))}`, sub: formatTime(d) } };
    });
    const fmt = points.at(-1).date - points[0].date > 300 * 864e5 ? yearFormat : dayFormat;
    chart = kind === 'weight'
      ? weightChart(list, trend, state.settings.health.goalKg)
      : lineChart({
        points, label: k.label, format: (v) => formatValue(kind, v, { unit: false }),
        xLabels: points.length > 1 ? [fmt.format(points[0].date), fmt.format(points.at(-1).date)] : [fmt.format(points[0].date)],
      });
  }
  setHTML(view, html`<div class="wk-page hl accent-workout">
    ${subHead({ title: kind === 'weight' ? 'Weigh-ins' : k.label, back: 'Health', fallback: 'health', accent: 'workout', eyebrow: k.hint ?? `In ${k.unit === '%' ? 'percent' : k.unit}`,
      actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="health:add" data-kind="${kind}">${icon('plus')}Add</button>` })}
    ${list.length ? html`
      ${rangeSwitch('hl-range')}
      <div class="card card--pad hl-chart">${chart || html`<div class="empty chart-empty">${icon('chart')}<span>Nothing in this period. Choose a longer range.</span></div>`}</div>
      <section class="section" aria-labelledby="hl-entries-title">
        <div class="section__head"><h2 class="section__title" id="hl-entries-title">All entries</h2><span class="section__meta">${list.length}</span></div>
        ${entryList([...all].reverse(), list, kind)}
        ${kind !== 'weight' && list.length > 30 && !showAll ? html`<button type="button" class="btn btn--block btn--ghost stats-more" data-action="health:all">Show all ${list.length}</button>` : ''}
      </section>`
    : html`<div class="card empty">${icon('ruler')}<span>No ${k.label.toLowerCase()} entries yet. Tap Add to record one.</span></div>`}
  </div>`);
}

registerAction('health:all', () => { showAll = true; render(); });

/* ---------- Pop-ups ---------- */

const pad = (n) => String(n).padStart(2, '0');
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function readNumber(text) {
  const n = Number(String(text).trim().replace(',', '.'));
  return String(text).trim() === '' || !Number.isFinite(n) ? null : n;
}

function readWhen(form) {
  const date = form.elements.date?.value;
  const time = form.elements.time?.value || '08:00';
  if (!date) return new Date();
  return new Date(`${date}T${time}`);
}

const whenFields = (d) => html`<div class="field-row">
  <label class="field"><span class="field__label">Date</span><input class="input" type="date" name="date" value="${toDateKey(d)}" max="${toDateKey(new Date())}"></label>
  <label class="field"><span class="field__label">Time</span><input class="input" type="time" name="time" value="${localTime(d)}"></label>
</div>`;

/** Ask before closing a pop-up whose fields were changed (pop-ups you type in close only with their buttons). */
async function okToDiscard(changed, editing) {
  if (!changed) return true;
  return confirmDialog({ title: editing ? 'Discard your changes?' : 'Discard this entry?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true });
}

/**
 * Add or edit one entry (a weigh-in, one measurement, or your height).
 * Returns the saved record, 'deleted', or null.
 */
export async function entrySheet({ kind = 'weight', entry = null } = {}) {
  const k = KINDS[kind];
  const records = await loadMeasurements();
  const last = latestOf(records, kind);
  const start = entry ? new Date(entry.measuredAt) : new Date();
  const timed = kind !== 'height';
  const title = entry ? `Edit ${k.label.toLowerCase()}` : kind === 'weight' ? 'Log weight' : kind === 'height' ? 'Your height' : `Add ${k.label.toLowerCase()}`;
  const result = await openDialog({
    variant: 'sheet',
    className: 'hl-sheet accent-workout',
    dismissible: false,
    title,
    body: html`<form class="form" data-hlform novalidate>
      <label class="field"><span class="field__label">${k.label} (${k.unit})</span>
        <input class="input hl-big" name="value" inputmode="decimal" autocomplete="off" enterkeyhint="done"
          value="${entry ? String(valueOf(entry)) : ''}" placeholder="${last ? formatValue(kind, valueOf(last), { unit: false }) : k.unit}">
        ${last && !entry ? html`<span class="field__hint">Last: ${formatValue(kind, valueOf(last))}, ${formatShortDate(new Date(last.measuredAt))}</span>` : ''}
        ${k.hint ? html`<span class="field__hint">${k.hint}</span>` : ''}
      </label>
      ${timed ? whenFields(start) : ''}
      ${timed ? html`<label class="field"><span class="field__label">Note <span class="muted">(optional)</span></span>
        <input class="input" name="note" maxlength="120" autocomplete="off" value="${entry?.note ?? ''}" placeholder="${kind === 'weight' ? 'e.g. after the gym' : ''}"></label>` : ''}
      ${entry?.source === 'health' ? html`<p class="hl-note">${icon('heart')} This weight came from Apple Health. Changing it here doesn’t change Apple Health.</p>` : ''}
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${entry ? 'Save' : kind === 'weight' ? 'Log weight' : 'Save'}</button>
      </div>
      ${entry ? html`<button type="button" class="btn btn--ghost btn--block wl-danger" data-delete>${icon('trash')}Delete this entry</button>` : ''}
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-hlform]');
      const error = form.querySelector('[data-error]');
      const snapshot = () => JSON.stringify([...new FormData(form).entries()]);
      const initial = snapshot();
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.value.focus({ preventScroll: true }), 320);
      form.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('click', async (event) => {
        if (event.target.closest('[data-cancel]')) {
          if (await okToDiscard(snapshot() !== initial, Boolean(entry))) close(null);
        } else if (event.target.closest('[data-delete]')) {
          close('delete');
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = readNumber(form.elements.value.value);
        const at = timed ? readWhen(form) : new Date();
        let problem = '';
        if (value == null) problem = `Type your ${k.label.toLowerCase()} in ${k.unit === '%' ? 'percent' : k.unit}.`;
        else if (value < k.min || value > k.max) problem = `That doesn’t look right — between ${k.min} and ${k.max} ${k.unit}, please.`;
        else if (Number.isNaN(at.getTime())) problem = 'Check the date and time.';
        else if (at.getTime() > Date.now() + 5 * 60e3) problem = 'That date and time is in the future.';
        if (problem) {
          setHTML(error, html`${problem}`);
          error.hidden = false;
          form.elements.value.focus();
          return;
        }
        close({ value, at: at.toISOString(), note: form.elements.note?.value.trim() ?? '' });
      });
    },
  });
  if (result === 'delete') return (await removeEntry(entry)) ? 'deleted' : null;
  if (!result || typeof result !== 'object') return null;
  const saved = await saveMeasurement({
    ...(entry ?? {}),
    kind,
    ...(kind === 'weight' ? { valueKg: result.value } : { value: result.value }),
    measuredAt: entry && !timed ? entry.measuredAt : result.at,
    note: result.note,
  });
  toast(entry ? 'Saved.' : `${k.label} saved: ${formatValue(kind, result.value)}.`, { icon: 'checkCircle' });
  return saved;
}

async function removeEntry(entry) {
  const k = KINDS[entry.kind];
  const ok = await confirmDialog({
    title: `Delete this ${k.label.toLowerCase()} entry?`,
    message: `${formatValue(entry.kind, valueOf(entry))} on ${formatShortDate(new Date(entry.measuredAt))} will be deleted on all your devices.`,
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return false;
  const record = await deleteMeasurement(entry.id);
  toast('Entry deleted.', { icon: 'trash', action: { label: 'Undo', onClick: () => restoreMeasurement(record) } });
  return true;
}

/** Several measurements at once (blank ones are skipped). */
async function measurementsSheet() {
  const records = await loadMeasurements();
  const result = await openDialog({
    variant: 'sheet',
    className: 'hl-sheet accent-workout',
    dismissible: false,
    title: 'Add measurements',
    body: html`<form class="form" data-hlform novalidate>
      <p class="muted hl-sheet__intro">Fill in the ones you measured today; leave the others empty. Measure in the same place each time, relaxed, not pulled tight.</p>
      <div class="hl-grid">${MEASUREMENTS.map((kind) => {
        const last = latestOf(records, kind);
        return html`<label class="field"><span class="field__label">${KINDS[kind].label} (${KINDS[kind].unit})</span>
          <input class="input" name="${kind}" inputmode="decimal" autocomplete="off" placeholder="${last ? formatValue(kind, valueOf(last), { unit: false }) : ''}"></label>`;
      })}</div>
      ${whenFields(new Date())}
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-hlform]');
      const error = form.querySelector('[data-error]');
      const typed = () => MEASUREMENTS.some((kind) => form.elements[kind].value.trim());
      form.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('click', async (event) => {
        if (event.target.closest('[data-cancel]') && await okToDiscard(typed(), false)) close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = {};
        for (const kind of MEASUREMENTS) {
          const text = form.elements[kind].value;
          if (!text.trim()) continue;
          const v = readNumber(text);
          const k = KINDS[kind];
          if (v == null || v < k.min || v > k.max) {
            setHTML(error, html`${k.label}: between ${k.min} and ${k.max} ${k.unit}, please.`);
            error.hidden = false;
            form.elements[kind].focus();
            return;
          }
          values[kind] = v;
        }
        const at = readWhen(form);
        if (!Object.keys(values).length) {
          setHTML(error, html`Fill in at least one measurement.`);
          error.hidden = false;
          return;
        }
        if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60e3) {
          setHTML(error, html`Check the date and time.`);
          error.hidden = false;
          return;
        }
        close({ values, at: at.toISOString() });
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  for (const [kind, value] of Object.entries(result.values)) await saveMeasurement({ kind, value, measuredAt: result.at });
  const n = Object.keys(result.values).length;
  toast(`${n} measurement${n === 1 ? '' : 's'} saved.`, { icon: 'checkCircle' });
}

/** Set, change or remove the weight goal (synced with your settings). */
async function goalSheet() {
  const records = await loadMeasurements();
  const latest = latestOf(records, 'weight');
  const height = latestOf(records, 'height');
  const range = height ? healthyRange(height.value) : null;
  const goal = state.settings.health;
  const result = await openDialog({
    variant: 'sheet',
    className: 'hl-sheet accent-workout',
    dismissible: false,
    title: goal.goalKg ? 'Change your goal' : 'Set a weight goal',
    body: html`<form class="form" data-hlform novalidate>
      <label class="field"><span class="field__label">Target weight (kg)</span>
        <input class="input hl-big" name="goal" inputmode="decimal" autocomplete="off" value="${goal.goalKg ?? ''}" placeholder="${latest ? formatValue('weight', latest.valueKg, { unit: false }) : 'kg'}">
        ${latest ? html`<span class="field__hint">Now: ${formatValue('weight', latest.valueKg)}${range ? ` · BMI 18.5–24.9 at your height: ${range[0]}–${range[1]} kg` : ''}</span>` : ''}
      </label>
      <p class="hl-note">Progress counts from ${latest ? `today’s ${formatValue('weight', latest.valueKg)}` : 'your next weigh-in'}${goal.goalKg ? ' (changing the target starts counting again from now)' : ''}.</p>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save goal</button>
      </div>
      ${goal.goalKg ? html`<button type="button" class="btn btn--ghost btn--block wl-danger" data-remove>Remove goal</button>` : ''}
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-hlform]');
      const error = form.querySelector('[data-error]');
      const initial = form.elements.goal.value;
      form.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('click', async (event) => {
        if (event.target.closest('[data-cancel]') && await okToDiscard(form.elements.goal.value !== initial, true)) close(null);
        else if (event.target.closest('[data-remove]')) close('remove');
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const v = readNumber(form.elements.goal.value);
        if (v == null || v < KINDS.weight.min || v > KINDS.weight.max) {
          setHTML(error, html`Type a target between ${KINDS.weight.min} and ${KINDS.weight.max} kg.`);
          error.hidden = false;
          return;
        }
        close({ goalKg: v });
      });
    },
  });
  if (result === 'remove') {
    const before = structuredClone(goal);
    await updateSettings((s) => { s.health = { goalKg: null, startKg: null, setAt: null }; });
    toast('Goal removed.', { icon: 'target', action: { label: 'Undo', onClick: () => updateSettings((s) => { s.health = before; }) } });
  } else if (result && typeof result === 'object') {
    await updateSettings((s) => {
      s.health = { goalKg: result.goalKg, startKg: latest?.valueKg ?? null, setAt: new Date().toISOString() };
    });
    toast(`Goal set: ${formatValue('weight', result.goalKg)}.`, { icon: 'target' });
  }
}

/* ---------- Actions ---------- */

export const logWeight = () => entrySheet({ kind: 'weight' });

registerAction('health:log', () => logWeight());
registerAction('health:add', (el) => (el.dataset.kind === 'weight' ? logWeight() : entrySheet({ kind: el.dataset.kind })));
registerAction('health:measure', () => measurementsSheet());
registerAction('health:height', () => entrySheet({ kind: 'height' }));
registerAction('health:goal', () => goalSheet());
registerAction('health:edit', async (el) => {
  const records = await loadMeasurements();
  const entry = records.find((r) => r.id === el.dataset.id);
  if (entry) await entrySheet({ kind: entry.kind, entry });
});
registerAction('health:open', () => openPage('workout', 'health'));
registerAction('health:shortcut', () => shortcutSheet());

registerQuickAdd({ id: 'weight', label: 'Log weight', icon: 'scale', accent: 'workout', order: 35, run: () => logWeight() });

/** Redraw when weigh-ins or the goal change (here, on another device, or by sync). */
export function refreshHealth() {
  if (view?.isConnected && view.querySelector('.hl')) render();
}

