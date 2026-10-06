/* Workout statistics (#/workout/stats): totals for a time range, streaks,
   workouts per week or month, the calendar heatmap, muscle groups, your
   exercises and recent personal records. Everything is worked out from your
   workouts by analytics.js each time the page opens. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { state, updateUI } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { openPage } from '../../core/router.js';
import { formatDuration, formatShortDate, toDateKey } from '../../core/dates.js';
import { loadLibrary, guessPrimary } from './library.js';
import { formatVolume, loadWorkouts, workoutDuration, workoutStats } from './model.js';
import {
  DEFAULT_RANGE, RANGES, buckets, compareMetric, comparisonText, computeRecords, dayStreaks, exerciseSessions, finished,
  heatmap, insights, muscleFrequency, percentChange, rangeInfo, rangeStart, rangeSummary, recordLabel, recordPrevious, recordTitle,
  recordValue, between, weekStreaks,
} from './analytics.js';
import { barChart, bindCharts } from './charts.js';
import { pickExercises } from './picker.js';

const checked = (on) => (on ? raw(' checked') : '');
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' });
const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

let view = null;
let unit = 'week';          // workouts per 'week' | 'month'
let showAllRecords = false;
let showAllExercises = false;
let heatDays = new Map();   // date key → that day's workouts (for tapping a square)

/** The time range chosen on the Stats page (also used on exercise pages); remembered on this device. */
export const currentRange = () => (RANGES.some(([v]) => v === state.ui?.statsRange) ? state.ui.statsRange : DEFAULT_RANGE);
export const setRange = (range) => updateUI((ui) => { ui.statsRange = range; });

/** The 7D · 30D · 3M · 6M · 1Y · All switch. */
export function rangeSwitch(name) {
  const range = currentRange();
  return html`<div class="segmented stats-range" role="radiogroup" aria-label="Time range">
    ${RANGES.map(([value, short, long]) => html`<label class="segmented__opt"><input type="radio" name="${name}" value="${value}" data-range${checked(range === value)}><span aria-hidden="true">${short}</span><span class="sr-only">${long}</span></label>`)}
  </div>`;
}

const signedPct = (p) => (p == null ? '' : p === 0 ? 'Same as' : `${p > 0 ? '↑' : '↓'} ${Math.abs(p)}% vs`);

export const statsPage = {
  async show(el) {
    view = el;
    bindCharts();
    await render();
  },
};

async function render() {
  const [all, library] = await Promise.all([loadWorkouts(), loadLibrary()]);
  const now = new Date();
  const done = finished(all);
  const range = currentRange();
  const [, , rangeLong, periodName] = rangeInfo(range);

  if (!done.length) {
    setHTML(view, html`<div class="wk-page accent-workout">
      ${subHead({ title: 'Stats', back: 'Workout', accent: 'workout' })}
      <div class="card empty">${icon('chart')}<span>Your statistics appear here after your first finished workout. You can also import your history from Hevy on the Workout tab.</span></div>
    </div>`);
    return;
  }

  const nameOf = (id, fallback) => library.get(id)?.name ?? fallback;
  const records = computeRecords(done);
  const from = rangeStart(range, now);
  const inRange = between(done, from);
  const { current: t, previous: p } = rangeSummary(done, range, now);
  // Average per week over the range — or since your first workout, if that's more recent
  const sinceFirst = Math.max(1, (now - new Date(done[0].startedAt)) / (7 * 864e5));
  const weeksInRange = from ? Math.min(Number(range) / 7, sinceFirst) : sinceFirst;
  const vs = range === 'all' ? '' : `the ${periodName} before`;
  const goal = state.settings.workout.weeklyGoal;
  const days = dayStreaks(done, now);
  const weeks = weekStreaks(done, goal, now);
  const tips = insights(done, records, now, { nameOf });

  setHTML(view, html`<div class="wk-page stats accent-workout">
    ${subHead({ title: 'Stats', back: 'Workout', accent: 'workout', eyebrow: rangeLong })}
    ${rangeSwitch('stats-range')}

    ${tips.length ? html`<ul class="card stats-insights" aria-label="Highlights">${tips.map((tip) => html`<li>
      ${tip.exerciseId
        ? html`<a class="stats-insight" href="#/workout/exercise/${tip.exerciseId}" data-action="nav" data-route="workout" data-sub="exercise/${tip.exerciseId}">${icon(tip.icon)}<span>${tip.text}</span>${icon('chevronRight', 'row__chev')}</a>`
        : html`<span class="stats-insight">${icon(tip.icon)}<span>${tip.text}</span></span>`}</li>`)}</ul>` : ''}

    <dl class="stat-grid stats-totals">
      <div class="stat"><dt>${icon('dumbbell')}Workouts</dt><dd class="stat__value">${t.count}</dd>
        <dd class="stat__sub">${t.count ? `${(t.count / weeksInRange).toFixed(1)} a week` : 'None in this period'}</dd></div>
      <div class="stat"><dt>${icon('clock')}Time</dt><dd class="stat__value">${formatDuration(t.time)}</dd>
        <dd class="stat__sub">${t.count ? `${formatDuration(t.time / t.count)} a workout` : '—'}</dd></div>
      <div class="stat"><dt>${icon('chart')}Volume</dt><dd class="stat__value">${formatVolume(t.volume)}</dd>
        <dd class="stat__sub">${p && percentChange(p.volume, t.volume) != null ? `${signedPct(percentChange(p.volume, t.volume))} ${vs}` : 'kg × reps'}</dd></div>
      <div class="stat"><dt>${icon('layers')}Sets</dt><dd class="stat__value">${t.sets.toLocaleString()}</dd>
        <dd class="stat__sub">${t.reps.toLocaleString()} reps</dd></div>
    </dl>
    ${p && p.count ? html`<p class="stats-note">${t.count === p.count ? 'Same number of workouts as' : `${Math.abs(t.count - p.count)} ${t.count > p.count ? 'more' : 'fewer'} workout${Math.abs(t.count - p.count) === 1 ? '' : 's'} than`} ${vs} (${p.count}).</p>` : ''}

    <section class="section" aria-labelledby="st-streak-title">
      <div class="section__head"><h2 class="section__title" id="st-streak-title">Streaks</h2></div>
      <dl class="stat-grid">
        <div class="stat"><dt>${icon('flame')}Days in a row</dt><dd class="stat__value">${days.current} ${days.current === 1 ? 'day' : 'days'}</dd>
          <dd class="stat__sub">Best: ${days.best} ${days.best === 1 ? 'day' : 'days'}</dd></div>
        <div class="stat"><dt>${icon('target')}Weeks on goal</dt><dd class="stat__value">${weeks.current} ${weeks.current === 1 ? 'week' : 'weeks'}</dd>
          <dd class="stat__sub">This week ${weeks.thisWeek}/${goal} · best ${weeks.best}</dd></div>
      </dl>
    </section>

    <section class="section" aria-labelledby="st-freq-title">
      <div class="section__head"><h2 class="section__title" id="st-freq-title">Workouts per ${unit}</h2></div>
      <div class="card card--pad">
        <div class="segmented stats-unit" role="radiogroup" aria-label="Group by">
          <label class="segmented__opt"><input type="radio" name="stats-unit" value="week" data-unit${checked(unit === 'week')}><span>Weekly</span></label>
          <label class="segmented__opt"><input type="radio" name="stats-unit" value="month" data-unit${checked(unit === 'month')}><span>Monthly</span></label>
        </div>
        ${frequencyChart(done, now, goal)}
      </div>
    </section>

    <section class="section" aria-labelledby="st-heat-title">
      <div class="section__head"><h2 class="section__title" id="st-heat-title">Workout calendar</h2><span class="section__meta">Last 12 months</span></div>
      <div class="card card--pad">${heatmapBlock(done, now)}</div>
    </section>

    <section class="section" aria-labelledby="st-muscle-title">
      <div class="section__head"><h2 class="section__title" id="st-muscle-title">Muscle groups</h2><span class="section__meta">Working sets · ${rangeLong.toLowerCase()}</span></div>
      ${muscleBlock(inRange, library)}
    </section>

    <section class="section" aria-labelledby="st-ex-title">
      <div class="section__head"><h2 class="section__title" id="st-ex-title">Exercise progress</h2>
        <button type="button" class="text-btn stats-find" data-action="stats:pick">${icon('search')}Find</button></div>
      ${exerciseBlock(done, inRange, range, now, nameOf)}
    </section>

    <section class="section" aria-labelledby="st-rec-title">
      <div class="section__head"><h2 class="section__title" id="st-rec-title">Personal records</h2><span class="section__meta">${rangeLong}</span></div>
      ${recordsBlock(records, from, nameOf)}
    </section>
  </div>`);

  view.querySelectorAll('input[data-range]').forEach((input) => input.addEventListener('change', async () => {
    await setRange(input.value);
    render();
  }));
  view.querySelectorAll('input[data-unit]').forEach((input) => input.addEventListener('change', () => {
    unit = input.value;
    render();
  }));
}

/* ---------- Workouts per week / month ---------- */

function frequencyChart(done, now, goal) {
  const list = buckets(done, { unit, count: 12, now });
  const bars = list.map((b, i) => {
    const name = unit === 'week'
      ? (b.current ? 'This week' : `Week of ${monthDay.format(b.start)}`)
      : (b.current ? 'This month' : monthLong.format(b.start));
    let label = '';
    if (unit === 'month') label = monthShort.format(b.start);
    else if ((list.length - 1 - i) % 3 === 0) label = monthDay.format(b.start);
    return {
      value: b.count,
      current: b.current,
      label,
      readout: {
        text: `${name} · ${b.count} workout${b.count === 1 ? '' : 's'}`,
        sub: b.count ? `${formatDuration(b.time)} · ${formatVolume(b.volume)}` : 'No workouts',
      },
    };
  });
  return barChart({ bars, label: `Workouts per ${unit}, last 12 ${unit}s`, goal: unit === 'week' ? goal : null });
}

/* ---------- Heatmap ---------- */

function heatmapBlock(done, now) {
  const { columns, days } = heatmap(done, { weeks: 53, now });
  heatDays = new Map();
  const months = columns.map((col, c) => {
    const firstOfMonth = col.find((d) => d.date.getDate() === 1);
    return c === 0 || firstOfMonth ? monthShort.format((firstOfMonth ?? col[0]).date) : '';
  });
  if (months[1]) months[0] = ''; // don't crowd the first label against the next month's
  return html`
    <p class="hm__summary">${days} workout day${days === 1 ? '' : 's'} in the last 12 months</p>
    <div class="hm__scroll">
      <div class="hm" style="--weeks:${columns.length}">
        <div class="hm__months" aria-hidden="true">${months.map((m) => html`<span>${m}</span>`)}</div>
        <div class="hm__grid" role="group" aria-label="Workout calendar. Days with a workout are buttons.">
          ${columns.map((col) => col.map((d) => {
            if (d.future) return html`<span class="hm__cell is-future" aria-hidden="true"></span>`;
            if (!d.workouts.length) return html`<span class="hm__cell" aria-hidden="true"></span>`;
            heatDays.set(d.key, d.workouts);
            const label = `${formatShortDate(d.date)}: ${d.workouts.map((w) => w.title).join(', ')}`;
            return html`<button type="button" class="hm__cell hm--l${d.level}${d.key === toDateKey(now) ? ' is-today' : ''}" data-action="stats:day" data-key="${d.key}" aria-label="${label}"></button>`;
          }))}
        </div>
      </div>
    </div>
    <div class="hm__legend" aria-hidden="true"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => html`<span class="hm__cell hm--l${l}"></span>`)}<span>More</span></div>
    <div class="hm__readout" aria-live="polite" data-heat-readout><p class="faint">Tap a coloured square to see that day's workouts. Brighter days had more volume.</p></div>`;
}

registerAction('stats:day', (el) => {
  const list = heatDays.get(el.dataset.key) ?? [];
  const out = view?.querySelector('[data-heat-readout]');
  if (!out || !list.length) return;
  view.querySelectorAll('.hm__cell.is-sel').forEach((c) => c.classList.remove('is-sel'));
  el.classList.add('is-sel');
  setHTML(out, html`<p class="hm__day">${formatShortDate(new Date(list[0].startedAt))}</p>
    <ul class="hm__list">${list.map((w) => {
      const st = workoutStats(w);
      return html`<li><a href="#/workout/w/${w.id}" data-action="nav" data-route="workout" data-sub="w/${w.id}">
        <span>${w.title}</span><span class="faint">${formatDuration(workoutDuration(w))}${st.volume ? ` · ${formatVolume(st.volume)}` : ''}</span>${icon('chevronRight', 'row__chev')}</a></li>`;
    })}</ul>`);
});

/* ---------- Muscle groups ---------- */

function muscleBlock(list, library) {
  const primaryOf = (entry) => library.get(entry.exerciseId)?.primary ?? guessPrimary(entry.name);
  const rows = muscleFrequency(list, primaryOf);
  if (!rows.length) return html`<div class="card empty">${icon('target')}<span>No working sets in this period.</span></div>`;
  const max = rows[0].sets;
  return html`<ul class="card card--pad mbars">${rows.map((r) => html`<li class="mbar">
    <span class="mbar__name">${r.muscle}</span>
    <span class="mbar__track" aria-hidden="true"><span class="mbar__fill" style="width:${Math.max(2, Math.round((r.sets / max) * 100))}%"></span></span>
    <span class="mbar__value">${r.sets} set${r.sets === 1 ? '' : 's'}<small>${r.workouts} workout${r.workouts === 1 ? '' : 's'}</small></span>
  </li>`)}</ul>`;
}

/* ---------- Exercises ---------- */

function exerciseBlock(done, inRange, range, now, nameOf) {
  const counts = new Map();
  inRange.forEach((w) => new Set(w.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => e.exerciseId)).forEach((id) => {
    const name = w.exercises.find((e) => e.exerciseId === id)?.name;
    const row = counts.get(id) ?? { id, name, sessions: 0, last: w.startedAt };
    row.sessions++;
    if (w.startedAt > row.last) row.last = w.startedAt;
    counts.set(id, row);
  }));
  const rows = [...counts.values()].sort((a, b) => b.sessions - a.sessions || b.last.localeCompare(a.last));
  if (!rows.length) return html`<div class="card empty">${icon('dumbbell')}<span>No exercises in this period. Tap Find to look at any exercise.</span></div>`;
  const shown = (showAllExercises ? rows : rows.slice(0, 8)).map((r) => {
    const sessions = exerciseSessions(done, r.id);
    const metric = sessions.some((s) => s.n.e1rm) ? 'e1rm' : sessions.some((s) => s.n.weight) ? 'weight' : 'sets';
    return { ...r, metric, cmp: compareMetric(sessions, metric, range, now) };
  });
  const arrows = shown.some((r) => r.cmp?.pct);
  return html`<ul class="card lib-list stats-ex">${shown.map((r) => {
    const { metric, cmp } = r;
    const pct = cmp?.pct;
    return html`<li><a class="lib-item" href="#/workout/exercise/${r.id}" data-action="nav" data-route="workout" data-sub="exercise/${r.id}">
      <span class="lib-item__text"><span class="lib-item__name">${nameOf(r.id, r.name)}</span>
        <span class="lib-item__meta">${r.sessions} session${r.sessions === 1 ? '' : 's'} · last ${formatShortDate(new Date(r.last))}</span></span>
      ${pct != null && pct !== 0 ? html`<span class="trend ${pct > 0 ? 'is-up' : 'is-down'}" title="${comparisonText(metric, cmp, range)}">${icon(pct > 0 ? 'arrowUp' : 'arrowDown')}${Math.abs(pct)}%<span class="sr-only">: ${comparisonText(metric, cmp, range)}</span></span>` : ''}
      ${icon('chevronRight', 'row__chev')}
    </a></li>`;
  })}</ul>
  ${rows.length > 8 ? html`<button type="button" class="btn btn--block btn--ghost stats-more" data-action="stats:all-ex">${showAllExercises ? 'Show fewer' : `Show all ${rows.length}`}</button>` : ''}
  ${arrows ? html`<p class="stats-note">Arrows compare your best estimated 1-rep max (or heaviest weight) with the ${rangeInfo(range)[3]} before.</p>` : ''}`;
}

registerAction('stats:all-ex', () => { showAllExercises = !showAllExercises; render(); });

registerAction('stats:pick', async () => {
  const picked = await pickExercises({ multiple: false, title: 'Exercise progress', confirmLabel: 'Show' });
  if (picked?.[0]) openPage('workout', `exercise/${picked[0].id}`);
});

/* ---------- Records ---------- */

/** A list of record events, newest first. */
export function recordList(events, nameOf, { withName = true, link = 'workout' } = {}) {
  const target = (e) => (link === 'exercise' ? (e.exerciseId ? `exercise/${e.exerciseId}` : null) : `w/${e.workoutId}`);
  return html`<ul class="card rec-list">${events.map((e) => html`<li><${raw(target(e) ? 'a' : 'div')} class="rec"${target(e) ? raw(` href="#/workout/${target(e)}" data-action="nav" data-route="workout" data-sub="${target(e)}"`) : ''}>
    <span class="rec__icon" aria-hidden="true">${icon('trophy')}</span>
    <span class="rec__text"><span class="rec__title">${withName || e.type === 'workoutVolume' ? recordTitle(e, nameOf) : recordLabel(e)}</span>
      <span class="rec__meta">${formatShortDate(new Date(e.date))}${e.previous != null ? ` · ${recordPrevious(e)}` : ''}</span></span>
    <span class="rec__value">${recordValue(e)}</span>
  </${raw(target(e) ? 'a' : 'div')}></li>`)}</ul>`;
}

function recordsBlock(records, from, nameOf) {
  const events = records.events.filter((e) => !from || new Date(e.date) >= from).reverse();
  if (!events.length) {
    return html`<div class="card empty">${icon('trophy')}<span>${records.events.length ? 'No new records in this period.' : 'Records show up once you beat your earlier numbers for an exercise.'}</span></div>`;
  }
  const shown = showAllRecords ? events : events.slice(0, 8);
  return html`${recordList(shown, nameOf)}
    ${events.length > 8 ? html`<button type="button" class="btn btn--block btn--ghost stats-more" data-action="stats:all-rec">${showAllRecords ? 'Show fewer' : `Show all ${events.length}`}</button>` : ''}`;
}

registerAction('stats:all-rec', () => { showAllRecords = !showAllRecords; render(); });

export function refreshStats() {
  if (view?.isConnected && view.querySelector('.stats')) render();
}
