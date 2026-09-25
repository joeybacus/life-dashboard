/* Workout module — Phase 1: dashboard card + a preview screen built from stored
   workouts. Logging workouts (timer, sets, rest timer) arrives in Phase 2. */
import { registerModule } from './registry.js';
import { registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { db } from '../core/db.js';
import { state, on, changed } from '../core/state.js';
import { html, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { liveElapsed, pageHead, ring, roadmapCard } from '../core/components.js';
import { toast } from '../core/ui.js';
import {
  addDays, daysBetween, formatDuration, formatRelativeDay, formatShortDate, formatTime,
  formatWeekdayNarrow, startOfDay, startOfWeek, toDateKey,
} from '../core/dates.js';

/** Workout split options from the spec. The user always makes the final choice. */
export const SPLITS = {
  ppl: { name: 'Push · Pull · Legs', days: ['Push', 'Pull', 'Legs'] },
  body: { name: 'Body-part split', days: ['Arms', 'Shoulders', 'Chest', 'Abs', 'Legs', 'Cardio'] },
};

const dayKeyOf = (iso) => toDateKey(new Date(iso));
const ABBREVIATIONS = { Push: 'PSH', Pull: 'PLL', Legs: 'LEG', Arms: 'ARM', Shoulders: 'SHO', Chest: 'CHT', Abs: 'ABS', Back: 'BCK', Cardio: 'CRD', 'Full Body': 'FB' };
const abbreviate = (type = '') => ABBREVIATIONS[type] ?? type.slice(0, 3).toUpperCase();
const durationOf = (w) => new Date(w.endedAt) - new Date(w.startedAt) - (w.pausedMs || 0);
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`;

export async function loadWorkoutModel(now = new Date()) {
  const [workouts, measurements] = await Promise.all([db.live('workouts'), db.live('bodyMeasurements')]);
  const completed = workouts.filter((w) => w.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const todayKey = toDateKey(now);
  const todays = completed.filter((w) => dayKeyOf(w.startedAt) === todayKey);
  const weekStart = startOfWeek(now);
  const split = SPLITS[state.settings.workout.split] ?? SPLITS.ppl;
  return {
    now,
    completed,
    active: workouts.find((w) => !w.endedAt) ?? null,
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

/** Suggest the next day of the split after the most recent matching workout. */
function suggestNext(split, completed) {
  const last = completed.find((w) => split.days.includes(w.type));
  if (!last) return split.days[0];
  return split.days[(split.days.indexOf(last.type) + 1) % split.days.length];
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

/* ---- Rendering ---- */

function cta(m) {
  if (m.active) {
    return html`<div class="wk-cta">
      <div><p class="wk-cta__q">Workout in progress</p>
        <p class="wk-cta__hint">${icon('timer')}${liveElapsed(m.active.startedAt, m.active.pausedMs)} · ${m.active.type ?? 'Workout'}</p></div>
      <button type="button" class="btn btn--accent" data-action="nav" data-route="workout">Open</button>
    </div>`;
  }
  if (m.doneToday) {
    const w = m.todays[0];
    return html`<div class="wk-cta">
      <div><p class="wk-cta__q">Nice work today</p>
        <p class="wk-cta__hint">${icon('checkCircle')}${w.type} · ${formatDuration(durationOf(w))}</p></div>
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
      <dd class="stat__value">${m.last ? `${m.last.type} day` : 'None yet'}</dd>
      <dd class="stat__sub">${m.last ? `${formatRelativeDay(new Date(m.last.startedAt), m.now)} · ${formatDuration(durationOf(m.last))}` : 'Logging arrives in Phase 2'}</dd></div>
    <div class="stat"><dt>${icon('flame')}Streak</dt>
      <dd class="stat__value">${m.streak} ${m.streak === 1 ? 'day' : 'days'}</dd>
      <dd class="stat__sub">${m.doneToday ? 'Including today' : m.streak ? 'Keep it going today' : 'Start one today'}</dd></div>
    <div class="stat"><dt>${icon('target')}Plan</dt>
      <dd class="stat__value">${m.split.name}</dd>
      <dd class="stat__sub">Next up: ${m.suggestion}</dd></div>
    <div class="stat"><dt>${icon('scale')}Body weight</dt>
      <dd class="stat__value">${w ? `${w.latest.valueKg.toFixed(1)} kg` : '—'}</dd>
      <dd class="stat__sub">${weightSub}</dd></div>
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
    const status = m.active ? 'In progress' : m.doneToday ? `Done today · ${m.todays[0].type}` : 'Not done today';
    const count = m.thisWeek.length;
    return {
      text: `${status} · ${count}/${m.goal} this week`,
      progress: m.goal ? Math.min(1, count / m.goal) : null,
      ringText: `${count}/${m.goal}`,
      ringLabel: `${count} of ${m.goal} workouts this week`,
    };
  },
  body(m) {
    return html`${cta(m)}${stats(m)}
      <div class="card-foot"><button type="button" class="link-btn" data-action="nav" data-route="workout">Open Workout ${icon('arrowRight')}</button></div>`;
  },
  glance(m) {
    let value = 'Not completed';
    let sub = `Suggested: ${m.suggestion}`;
    if (m.active) {
      value = html`In progress · ${liveElapsed(m.active.startedAt, m.active.pausedMs)}`;
      sub = m.active.type ?? 'Workout';
    } else if (m.doneToday) {
      value = 'Completed';
      sub = `${m.todays[0].type} · ${formatDuration(durationOf(m.todays[0]))}`;
    }
    return [{ id: 'workout', order: 30, icon: 'dumbbell', accent: 'workout', label: 'Workout', value, sub, action: 'nav', data: { route: 'workout' } }];
  },
});

registerAction('workout:start', () => {
  toast('Workout tracking arrives in Phase 2 — it’s next on the list.', { icon: 'dumbbell' });
});

/* ---- Workout screen (preview until Phase 2) ---- */

let screenEl = null;

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
      <span class="week-day__dot" aria-hidden="true">${done.length ? abbreviate(done[0].type) : ''}</span>
      <span class="sr-only">${formatShortDate(d)}${isToday ? ' (today)' : ''}: ${done.length ? done.map((w) => w.type).join(', ') : 'no workout'}</span>
    </li>`;
  });
}

function workoutRow(w, now) {
  const start = new Date(w.startedAt);
  const badge = w.type.length <= 4 ? w.type : w.type.slice(0, 3);
  return html`<li class="wk-item">
    <span class="type-badge" aria-hidden="true">${badge}</span>
    <div class="wk-item__main">
      <p class="wk-item__title">${w.type} day</p>
      <p class="wk-item__meta">${formatRelativeDay(start, now)} · ${formatTime(start)} · ${w.muscleGroups.join(', ')}</p>
    </div>
    <span class="wk-item__dur">${formatDuration(durationOf(w))}</span>
  </li>`;
}

async function renderScreen() {
  if (!screenEl) return;
  const m = await loadWorkoutModel(new Date());
  const count = m.thisWeek.length;
  setHTML(screenEl, html`
    ${pageHead({ title: 'Workout', iconName: 'dumbbell', accent: 'workout', eyebrow: 'Module' })}
    <section class="card wk-hero accent-workout" aria-label="Today">${cta(m)}</section>

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

    <section class="section accent-workout" aria-labelledby="wk-recent-title">
      <div class="section__head"><h2 class="section__title" id="wk-recent-title">Recent workouts</h2><span class="section__meta">${m.completed.length} logged</span></div>
      ${m.completed.length
        ? html`<ul class="card wk-list">${m.completed.slice(0, 6).map((w) => workoutRow(w, m.now))}</ul>`
        : html`<div class="card empty">${icon('dumbbell')}<span>No workouts yet. Logging arrives in Phase 2.</span></div>`}
    </section>

    <div class="accent-workout">${roadmapCard({
      phase: 2,
      title: 'Workout tracking is next',
      note: 'Start, pause and finish workouts, log every set, and keep a full, editable history. The Start Workout button comes alive then.',
      items: [
        ['timer', 'Workout timer with pause & resume'],
        ['target', 'Muscle-group selection'],
        ['layers', 'Exercise library'],
        ['clipboard', 'Sets, reps, weight, RPE/RIR'],
        ['hourglass', 'Rest timer with sound & vibration'],
        ['calendarCheck', 'Workout history'],
      ],
    })}</div>`);
}

registerScreen('workout', {
  title: 'Workout',
  icon: 'dumbbell',
  accent: 'workout',
  mount(el) { screenEl = el; },
  onShow: renderScreen,
});

const refreshIfVisible = () => { if (screenEl && !screenEl.hidden) renderScreen(); };
on('data', refreshIfVisible);
on('settings', ({ prev, next }) => { if (changed(prev, next, 'workout')) refreshIfVisible(); });
