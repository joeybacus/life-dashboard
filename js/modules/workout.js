/* Workout module: the dashboard card, the Workout tab and its pages.

   Pages of the Workout tab (#/workout/…):
     (none)          start or resume, this week, templates, recent workouts
     log             the workout in progress
     history         all workouts, with filters
     stats           statistics: totals, streaks, heatmap, records (Phase 4)
     health          body weight, goal, height and BMI, measurements (Phase 5)
     health/<kind>   one measurement's chart and entries (health/weight = every weigh-in)
     photos          progress photos (Phase 6): grid, calendar, timeline
     photos/<id>     one photo          photos/compare/<a>/<b>   two photos side by side
     w/<id>          one workout            w/<id>/edit   edit a finished workout
     exercises       exercise library       exercise/<id> one exercise
     template/<id>   edit a template
   The pieces live in js/modules/workout/. */
import { registerModule } from './registry.js';
import { registerScreen, replacePage } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { registerQuickAdd } from '../core/quick-add.js';
import { db } from '../core/db.js';
import { changed, on, state } from '../core/state.js';
import { html, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { liveElapsed, pageHead, ring } from '../core/components.js';
import {
  addDays, daysBetween, formatDuration, formatRelativeDay, formatShortDate, formatWeekdayNarrow, startOfDay, startOfWeek, toDateKey,
} from '../core/dates.js';
import { SPLITS, suggestNext } from './workout/muscles.js';
import { formatVolume, isActive, loadWorkouts, workoutDuration } from './workout/model.js';
import { getActiveWorkout, loadTemplates } from './workout/store.js';
import { initRestTimer } from './workout/rest-timer.js';
import { initWorkoutBar } from './workout/bar.js';
import { startWorkout } from './workout/start.js';
import { loggerPage, mountLogger } from './workout/logger.js';
import { detailPage, historyPage, workoutBadge, workoutRow } from './workout/history.js';
import { exercisePage, libraryPage } from './workout/exercises.js';
import { mountTemplateEditor, templateCards, templatePage } from './workout/templates.js';
import { exportWorkoutsCsv, importHevyFile } from './workout/transfer.js';
import { statsPage } from './workout/stats.js';
import { healthPage } from './health/page.js';
import { photosPage } from './photos/page.js';
import { initPhotoTransfers } from './photos/transfer.js';
import { computeRecords, finished, insights, percentChange, summarize, between } from './workout/analytics.js';
import { loadLibrary } from './workout/library.js';

export { SPLITS };

const dayKeyOf = (iso) => toDateKey(new Date(iso));
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`;

/** Everything the dashboard card and the Workout screen show (read fresh from the database). */
export async function loadWorkoutModel(now = new Date()) {
  const [workouts, measurements, library] = await Promise.all([loadWorkouts(), db.live('bodyMeasurements'), loadLibrary()]);
  const active = workouts.find(isActive) ?? null;
  const completed = workouts.filter((w) => w.endedAt);
  const todayKey = toDateKey(now);
  const todays = completed.filter((w) => dayKeyOf(w.startedAt) === todayKey);
  const weekStart = startOfWeek(now);
  const split = SPLITS[state.settings.workout.split] ?? SPLITS.ppl;
  const done = finished(workouts);
  const records = computeRecords(done);
  return {
    now,
    completed,
    active,
    todays,
    doneToday: todays.length > 0,
    last: completed[0] ?? null,
    weekStart,
    thisWeek: completed.filter((w) => new Date(w.startedAt) >= weekStart),
    goal: state.settings.workout.weeklyGoal,
    streak: streakDays(completed, now),
    split,
    suggestion: suggestNext(split, completed),
    weight: weightSummary(measurements),
    records,
    month: monthSummary(done, now),
    insights: insights(done, records, now, { nameOf: (id, fallback) => library.get(id)?.name ?? fallback }),
  };
}

/** Consecutive days with a workout, ending today (or yesterday if today isn't done yet). */
function streakDays(completed, now) {
  const days = new Set(completed.map((w) => dayKeyOf(w.startedAt)));
  let day = startOfDay(now);
  if (!days.has(toDateKey(day))) day = addDays(day, -1);
  let count = 0;
  while (days.has(toDateKey(day))) { count++; day = addDays(day, -1); }
  return count;
}

/** This month so far, against the same days of last month (1st – today's date). */
function monthSummary(done, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const lastEnd = new Date(lastStart.getFullYear(), lastStart.getMonth(), Math.min(now.getDate(), lastMonthDays) + 1);
  const current = summarize(between(done, start));
  const last = summarize(between(done, lastStart, lastEnd));
  return { ...current, lastCount: last.count, volumePct: percentChange(last.volume, current.volume) };
}

function weightSummary(measurements) {
  const weights = measurements.filter((m) => m.kind === 'weight').sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  if (!weights.length) return null;
  const latest = weights[0];
  const cutoff = new Date(latest.measuredAt).getTime() - 28 * 864e5;
  const earlier = weights.find((w) => new Date(w.measuredAt).getTime() <= cutoff);
  return {
    latest,
    delta: earlier ? Math.round((latest.valueKg - earlier.valueKg) * 10) / 10 : null,
    days: earlier ? daysBetween(new Date(earlier.measuredAt), new Date(latest.measuredAt)) : null,
  };
}

/* ---- Dashboard card ---- */

/** A record from this week and the biggest volume change (from analytics.insights). */
function highlights(m) {
  if (!m.insights.length) return '';
  return html`<ul class="wk-insights">${m.insights.map((tip) => html`<li>
    <button type="button" class="wk-insight" data-action="nav" data-route="workout" data-sub="${tip.exerciseId ? `exercise/${tip.exerciseId}` : 'stats'}">
      ${icon(tip.icon)}<span>${tip.text}</span></button></li>`)}</ul>`;
}

function cta(m) {
  if (m.active) {
    const paused = Boolean(m.active.pausedAt);
    return html`<div class="wk-cta">
      <div><p class="wk-cta__q">${paused ? 'Workout paused' : 'Workout in progress'}</p>
        <p class="wk-cta__hint">${icon(paused ? 'pause' : 'timer')}${liveElapsed(m.active.startedAt, m.active.pausedMs, m.active.pausedAt)} · ${m.active.title}</p></div>
      <button type="button" class="btn btn--accent" data-action="nav" data-route="workout" data-sub="log">${icon('play')}Resume</button>
    </div>`;
  }
  if (m.doneToday) {
    const w = m.todays[0];
    return html`<div class="wk-cta">
      <div><p class="wk-cta__q">Nice work today</p>
        <p class="wk-cta__hint">${icon('checkCircle')}${w.title} · ${formatDuration(workoutDuration(w))}</p></div>
      <button type="button" class="btn btn--accent" data-action="workout:start">${icon('plus')}Another workout</button>
    </div>`;
  }
  return html`<div class="wk-cta">
    <div><p class="wk-cta__q">Workout today?</p>
      <p class="wk-cta__hint">${icon('sparkles')}Suggested: <strong>${m.suggestion}</strong></p></div>
    <button type="button" class="btn btn--accent" data-action="workout:start">${icon('bolt')}Start Workout</button>
  </div>`;
}

function stats(m) {
  const w = m.weight;
  const weightSub = !w ? 'No entries yet'
    : w.delta != null ? `${signed(w.delta)} kg in ${w.days} days`
    : formatRelativeDay(new Date(w.latest.measuredAt), m.now);
  return html`<dl class="stat-grid">
    <div class="stat"><dt>${icon('clock')}Last workout</dt>
      <dd class="stat__value">${m.last ? m.last.title : 'None yet'}</dd>
      <dd class="stat__sub">${m.last ? `${formatRelativeDay(new Date(m.last.startedAt), m.now)} · ${formatDuration(workoutDuration(m.last))}` : 'Start one today'}</dd></div>
    <div class="stat"><dt>${icon('flame')}Streak</dt>
      <dd class="stat__value">${m.streak} ${m.streak === 1 ? 'day' : 'days'}</dd>
      <dd class="stat__sub">${m.doneToday ? 'Including today' : m.streak ? 'Keep it going today' : 'Start one today'}</dd></div>
    <div class="stat"><dt>${icon('chart')}This month</dt>
      <dd class="stat__value">${m.month.count} workout${m.month.count === 1 ? '' : 's'}</dd>
      <dd class="stat__sub">${m.month.volumePct != null
        ? `Volume ${m.month.volumePct === 0 ? 'same as' : `${m.month.volumePct > 0 ? '↑' : '↓'} ${Math.abs(m.month.volumePct)}% vs`} last month`
        : m.month.count ? formatVolume(m.month.volume) : `${m.month.lastCount} by this time last month`}</dd></div>
    <div class="stat stat--link"><dt>${icon('scale')}Body weight</dt>
      <dd class="stat__value">${w ? `${w.latest.valueKg.toFixed(1)} kg` : '—'}</dd>
      <dd class="stat__sub">${w ? weightSub : 'Tap to log your weight'}</dd>
      <dd class="stat__hit"><button type="button" data-action="nav" data-route="workout" data-sub="health" aria-label="Body weight: ${w ? `${w.latest.valueKg.toFixed(1)} kg` : 'none yet'}. Open Health"></button></dd></div>
  </dl>`;
}

registerModule({
  id: 'workout',
  title: 'Workout',
  icon: 'dumbbell',
  accent: 'workout',
  status: 'active',
  load: loadWorkoutModel,
  summary(m) {
    const status = m.active ? (m.active.pausedAt ? 'Paused' : 'In progress') : m.doneToday ? `Done today · ${m.todays[0].title}` : 'Not done today';
    const count = m.thisWeek.length;
    return {
      text: `${status} · ${count}/${m.goal} this week`,
      progress: m.goal ? Math.min(1, count / m.goal) : null,
      ringText: `${count}/${m.goal}`,
      ringLabel: `${count} of ${m.goal} workouts this week`,
    };
  },
  body(m) {
    return html`${cta(m)}${stats(m)}${highlights(m)}
      <div class="card-foot"><button type="button" class="link-btn" data-action="nav" data-route="workout" data-sub="">Open Workout ${icon('arrowRight')}</button></div>`;
  },
  glance(m) {
    let value = 'Not completed';
    let sub = `Suggested: ${m.suggestion}`;
    if (m.active) {
      value = html`${m.active.pausedAt ? 'Paused' : 'In progress'} · ${liveElapsed(m.active.startedAt, m.active.pausedMs, m.active.pausedAt)}`;
      sub = m.active.title;
    } else if (m.doneToday) {
      value = 'Completed';
      sub = `${m.todays[0].title} · ${formatDuration(workoutDuration(m.todays[0]))}`;
    }
    return [{ id: 'workout', order: 30, icon: 'dumbbell', accent: 'workout', label: 'Workout', value, sub, action: 'nav', data: { route: 'workout', sub: m.active ? 'log' : '' } }];
  },
});

registerAction('workout:start', () => startWorkout());
registerQuickAdd({ id: 'workout', label: 'Start workout', icon: 'bolt', accent: 'workout', order: 30, run: () => startWorkout() });
registerAction('workout:export', () => exportWorkoutsCsv());

/* ---- Workout home ---- */

function weekStrip(m) {
  const todayKey = toDateKey(m.now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(m.weekStart, i);
    const key = toDateKey(d);
    const done = m.completed.filter((w) => dayKeyOf(w.startedAt) === key);
    const isToday = key === todayKey;
    const isFuture = key > todayKey;
    const cls = `week-day${done.length ? ' has-workout' : ''}${isToday ? ' is-today' : ''}${isFuture ? ' is-future' : ''}`;
    return html`<li class="${cls}">
      <span aria-hidden="true">${formatWeekdayNarrow(d)}</span>
      <span class="week-day__num" aria-hidden="true">${d.getDate()}</span>
      <span class="week-day__dot" aria-hidden="true">${done.length ? workoutBadge(done[0]) : ''}</span>
      <span class="sr-only">${formatShortDate(d)}${isToday ? ' (today)' : ''}: ${done.length ? done.map((w) => w.title).join(', ') : 'no workout'}</span>
    </li>`;
  });
}

const homePage = {
  async show(el) {
    const [m, templates] = await Promise.all([loadWorkoutModel(new Date()), loadTemplates()]);
    const count = m.thisWeek.length;
    setHTML(el, html`
      ${pageHead({ title: 'Workout', iconName: 'dumbbell', accent: 'workout', eyebrow: 'Module' })}
      <section class="card wk-hero accent-workout" aria-label="Today">${cta(m)}</section>

      <nav class="wk-links accent-workout" aria-label="Workout pages">
        <a class="wk-link" href="#/workout/stats" data-action="nav" data-route="workout" data-sub="stats">${icon('chart')}<span>Stats</span></a>
        <a class="wk-link" href="#/workout/history" data-action="nav" data-route="workout" data-sub="history">${icon('history')}<span>History</span></a>
        <a class="wk-link" href="#/workout/exercises" data-action="nav" data-route="workout" data-sub="exercises">${icon('list')}<span>Exercises</span></a>
        <label class="wk-link">${icon('download')}<span>Import Hevy</span><input type="file" class="sr-only" accept=".csv,text/csv" data-field="hevy"></label>
      </nav>

      <section class="section accent-workout" aria-labelledby="wk-week-title">
        <div class="section__head"><h2 class="section__title" id="wk-week-title">This week</h2></div>
        <div class="card week-card">
          <div class="week-summary">
            <p class="week-summary__text"><strong>${count}</strong> of ${m.goal} workouts · ${m.streak}-day streak</p>
            ${ring({ progress: m.goal ? Math.min(1, count / m.goal) : null, text: `${count}/${m.goal}`, label: `${count} of ${m.goal} workouts this week` })}
          </div>
          <ol class="week-strip">${weekStrip(m)}</ol>
        </div>
      </section>

      <section class="section accent-workout" aria-labelledby="wk-body-title">
        <div class="section__head"><h2 class="section__title" id="wk-body-title">Body</h2>
          <a class="text-btn" href="#/workout/health" data-action="nav" data-route="workout" data-sub="health">Health</a></div>
        <div class="card wk-body">
          <a class="wk-body__main" href="#/workout/health" data-action="nav" data-route="workout" data-sub="health">
            <span class="row__icon">${icon('scale')}</span>
            <span class="row__text"><span class="row__label">${m.weight ? `${m.weight.latest.valueKg.toFixed(1)} kg` : 'Body weight'}</span>
              <span class="row__sub">${m.weight
                ? `${formatRelativeDay(new Date(m.weight.latest.measuredAt), m.now)}${m.weight.delta != null ? ` · ${signed(m.weight.delta)} kg in ${m.weight.days} days` : ''}`
                : 'Weight, goal, BMI and measurements'}</span></span>
          </a>
          <button type="button" class="btn btn--sm" data-action="nav" data-route="workout" data-sub="photos" aria-label="Progress photos">${icon('camera')}Photos</button>
          <button type="button" class="btn btn--sm btn--accent" data-action="health:log">${icon('plus')}Log</button>
        </div>
      </section>

      <section class="section accent-workout" aria-labelledby="wk-tpl-title">
        <div class="section__head"><h2 class="section__title" id="wk-tpl-title">Templates</h2>
          ${templates.length ? html`<button type="button" class="text-btn" data-action="tpl:new">New</button>` : ''}</div>
        ${templateCards(templates)}
      </section>

      <section class="section accent-workout" aria-labelledby="wk-recent-title">
        <div class="section__head"><h2 class="section__title" id="wk-recent-title">Recent workouts</h2>
          ${m.completed.length ? html`<a class="text-btn" href="#/workout/history" data-action="nav" data-route="workout" data-sub="history">See all</a>` : ''}</div>
        ${m.completed.length
          ? html`<ul class="card wk-list">${m.completed.slice(0, 5).map((w) => workoutRow(w, m.now, { records: m.records.byWorkout.get(w.id)?.length ?? 0 }))}</ul>`
          : html`<div class="card empty">${icon('dumbbell')}<span>No workouts yet. Tap Start Workout, or import your history from Hevy.</span></div>`}
      </section>
`);
  },
};

/* ---- Pages ---- */

const ROUTES = [
  [/^$/, homePage, () => ({})],
  [/^log$/, loggerPage, () => ({ mode: 'active' })],
  [/^history$/, historyPage, () => ({})],
  [/^stats$/, statsPage, () => ({})],
  [/^health$/, healthPage, () => ({})],
  [/^health\/(\w+)$/, healthPage, (m) => ({ kind: m[1] })],
  [/^photos$/, photosPage, () => ({ kind: 'gallery' })],
  [/^photos\/compare\/([\w-]+)\/([\w-]+)$/, photosPage, (m) => ({ kind: 'compare', a: m[1], b: m[2] })],
  [/^photos\/([\w-]+)$/, photosPage, (m) => ({ kind: 'photo', id: m[1] })],
  [/^w\/([\w-]+)$/, detailPage, (m) => ({ id: m[1] })],
  [/^w\/([\w-]+)\/edit$/, loggerPage, (m) => ({ mode: 'edit', id: m[1] })],
  [/^exercises$/, libraryPage, () => ({})],
  [/^exercise\/([\w-]+)$/, exercisePage, (m) => ({ id: m[1] })],
  [/^template\/([\w-]+)$/, templatePage, (m) => ({ id: m[1] })],
];

let view = null;
let page = null;
let params = {};
let visible = false;

function route(el, sub) {
  for (const [pattern, def, toParams] of ROUTES) {
    const match = sub.match(pattern);
    if (!match) continue;
    page?.hide?.();
    page = def;
    params = toParams(match);
    return def.show(el, params);
  }
  replacePage(''); // unknown page: back to the start
  return null;
}

function redraw() {
  if (visible && page) page.show(view, params);
}

registerScreen('workout', {
  title: 'Workout',
  icon: 'dumbbell',
  accent: 'workout',
  mount(el) {
    view = el;
    el.classList.add('view--workout-pages');
    mountLogger(el);
    mountTemplateEditor(el);
    el.addEventListener('change', (event) => {
      if (event.target.dataset.field !== 'hevy') return;
      const file = event.target.files?.[0];
      event.target.value = '';
      importHevyFile(file);
    });
  },
  onShow(el, sub) {
    visible = true;
    return route(el, sub);
  },
  onRoute(el, sub) {
    return route(el, sub);
  },
  onHide() {
    visible = false;
    page?.hide?.();
  },
});

// Keep pages current when data changes elsewhere (sync, an import, the dashboard…)
on('data', () => {
  if (!visible || !page || page === loggerPage || page === templatePage) return;
  const focused = document.activeElement;
  if (focused && view.contains(focused) && focused.matches('input, textarea, select')) return;
  redraw();
});
on('settings', ({ prev, next }) => {
  if (changed(prev, next, 'workout') || changed(prev, next, 'health')) redraw();
});

/** Load the workout in progress and the rest timer, and show the workout bar. */
export async function initWorkout() {
  await initRestTimer();
  await getActiveWorkout();
  await initWorkoutBar();
  initPhotoTransfers();
}
