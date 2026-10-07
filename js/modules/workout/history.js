/* Workout history (#/workout/history), with filters, and one workout's page
   (#/workout/w/<id>) — from where it can be edited, repeated, saved as a
   template or deleted. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, toast } from '../../core/ui.js';
import { openPage, replacePage } from '../../core/router.js';
import {
  addDays, formatDuration, formatRelativeDay, formatShortDate, formatTime, formatTimeRange, formatWeekdayShort, startOfDay,
} from '../../core/dates.js';
import { GROUP_NAMES, groupsLabel } from './muscles.js';
import { loadLibrary } from './library.js';
import {
  SET_TYPES, describeEffort, describeSet, entryStats, formatVolume, isActive, loadWorkout, loadWorkouts, saveWorkout,
  supersetLetters, workoutStats, workoutsChanged,
} from './model.js';
import { getActiveWorkout, loadTemplates } from './store.js';
import { startWorkout } from './start.js';
import { pickExercises } from './picker.js';
import { saveWorkoutAsTemplate } from './templates.js';
import { computeRecords } from './analytics.js';
import { recordList } from './stats.js';
import { loadPhotos } from '../photos/model.js';

const PAGE_SIZE = 40;
const RANGES = [['all', 'All time'], ['30', 'Last 30 days'], ['90', 'Last 3 months'], ['365', 'Last 12 months'], ['year', 'This year']];
const ABBREVIATIONS = { Push: 'PSH', Pull: 'PLL', Legs: 'LEG', Arms: 'ARM', Shoulders: 'SHO', Chest: 'CHT', Back: 'BCK', Biceps: 'BIC', Triceps: 'TRI', 'Abs/Core': 'ABS', Cardio: 'CRD', 'Full Body': 'FB' };
const selected = (on) => (on ? raw(' selected') : '');

const filters = { range: 'all', group: 'all', exercise: null, template: 'all' };
let view = null;
let shown = PAGE_SIZE;

/** A short badge for a workout: "PSH", "LEG", "C+T". */
export function workoutBadge(w) {
  const groups = w.muscleGroups ?? [];
  if (groups.length === 1) return ABBREVIATIONS[groups[0]] ?? groups[0].slice(0, 3).toUpperCase();
  if (groups.length > 1) return groups.slice(0, 3).map((g) => g[0]).join('+');
  return (w.title || 'W').slice(0, 3).toUpperCase();
}


/**
 * One row in a list of workouts. dates: 'relative' ("Yesterday", "Sep 12") for
 * recent lists, 'day' ("Sat 26") under a month heading.
 */
export function workoutRow(w, now = new Date(), { dates = 'relative', records = 0 } = {}) {
  const st = workoutStats(w);
  const start = new Date(w.startedAt);
  const day = dates === 'day' ? `${formatWeekdayShort(start)} ${start.getDate()}` : formatRelativeDay(start, now);
  const meta = [
    `${day} · ${formatTime(start)}`,
    st.exercises ? `${st.exercises} exercise${st.exercises === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');
  return html`<li><a class="wk-item wk-item--link" href="#/workout/w/${w.id}" data-action="nav" data-route="workout" data-sub="w/${w.id}">
    <span class="type-badge" aria-hidden="true">${workoutBadge(w)}</span>
    <span class="wk-item__main">
      <span class="wk-item__title">${w.title}${w.sample ? html` <span class="faint">· sample</span>` : ''}${isActive(w) ? html` <span class="live-pill">Live</span>` : ''}</span>
      <span class="wk-item__meta">${meta}${records ? html` · <span class="pr-badge">${icon('trophy')}${records}<span class="sr-only"> record${records === 1 ? '' : 's'}</span></span>` : ''}</span>
    </span>
    <span class="wk-item__dur">${w.endedAt ? formatDuration(st.duration) : 'In progress'}${st.volume ? html`<small>${formatVolume(st.volume)}</small>` : ''}</span>
  </a></li>`;
}

/* ---------- History list ---------- */

function inRange(w, now) {
  if (filters.range === 'all') return true;
  const start = new Date(w.startedAt);
  if (filters.range === 'year') return start.getFullYear() === now.getFullYear();
  return start >= addDays(startOfDay(now), -Number(filters.range));
}

export const historyPage = {
  async show(el) {
    view = el;
    shown = PAGE_SIZE;
    await render();
  },
  refresh() {
    return render();
  },
};

async function render() {
  const [workouts, templates, library] = await Promise.all([loadWorkouts(), loadTemplates(), loadLibrary()]);
  const now = new Date();
  const matches = workouts.filter((w) => inRange(w, now)
    && (filters.group === 'all' || w.muscleGroups.includes(filters.group))
    && (!filters.exercise || w.exercises.some((e) => e.exerciseId === filters.exercise))
    && (filters.template === 'all' || w.templateId === filters.template));
  const totals = matches.reduce((t, w) => {
    const st = workoutStats(w);
    return { time: t.time + (w.endedAt ? st.duration : 0), sets: t.sets + st.sets, volume: t.volume + st.volume };
  }, { time: 0, sets: 0, volume: 0 });
  const filtered = filters.range !== 'all' || filters.group !== 'all' || filters.exercise || filters.template !== 'all';
  const exerciseName = filters.exercise ? library.get(filters.exercise)?.name ?? 'Exercise' : null;
  const records = computeRecords(workouts).byWorkout;

  // Group by month
  const months = [];
  matches.slice(0, shown).forEach((w) => {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      month = { key, label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d), items: [] };
      months.push(month);
    }
    month.items.push(w);
  });

  setHTML(view, html`<div class="wk-page accent-workout">
    ${subHead({ title: 'History', back: 'Workout', accent: 'workout' })}
    <div class="hist-filters" role="group" aria-label="Filter workouts">
      <select class="select select--inline" data-hist="range" aria-label="Dates">
        ${RANGES.map(([value, label]) => html`<option value="${value}"${selected(filters.range === value)}>${label}</option>`)}
      </select>
      <select class="select select--inline" data-hist="group" aria-label="Muscle group">
        <option value="all">All muscle groups</option>
        ${GROUP_NAMES.map((g) => html`<option value="${g}"${selected(filters.group === g)}>${g}</option>`)}
      </select>
      ${templates.length ? html`<select class="select select--inline" data-hist="template" aria-label="Template">
        <option value="all">All templates</option>
        ${templates.map((t) => html`<option value="${t.id}"${selected(filters.template === t.id)}>${t.name}</option>`)}
      </select>` : ''}
      ${exerciseName
        ? html`<button type="button" class="chip-toggle" aria-pressed="true" data-action="hist:exercise-clear" aria-label="Exercise: ${exerciseName}. Remove filter">${exerciseName}${icon('x')}</button>`
        : html`<button type="button" class="chip-toggle" data-action="hist:exercise">${icon('search')}Exercise</button>`}
      ${filtered ? html`<button type="button" class="text-btn hist-clear" data-action="hist:clear">Clear</button>` : ''}
    </div>

    <p class="hist-summary">${matches.length
      ? `${matches.length} workout${matches.length === 1 ? '' : 's'} · ${formatDuration(totals.time)} · ${totals.sets.toLocaleString()} sets · ${formatVolume(totals.volume)}`
      : ''}</p>

    ${matches.length
      ? months.map((m) => html`<section class="hist-month" aria-label="${m.label}">
          <h2 class="section__title hist-month__title">${m.label}</h2>
          <ul class="card wk-list">${m.items.map((w) => workoutRow(w, now, { dates: 'day', records: records.get(w.id)?.length ?? 0 }))}</ul>
        </section>`)
      : html`<div class="card empty">${icon('history')}<span>${filtered ? 'No workouts match these filters.' : 'No workouts yet. Finished workouts appear here.'}</span></div>`}
    ${matches.length > shown ? html`<button type="button" class="btn btn--block hist-more" data-action="hist:more">Show more (${matches.length - shown} left)</button>` : ''}
  </div>`);

  view.querySelectorAll('select[data-hist]').forEach((sel) => sel.addEventListener('change', () => {
    filters[sel.dataset.hist] = sel.value;
    shown = PAGE_SIZE;
    render();
  }));
}

registerAction('hist:more', () => {
  shown += PAGE_SIZE * 2;
  render();
});

registerAction('hist:clear', () => {
  Object.assign(filters, { range: 'all', group: 'all', exercise: null, template: 'all' });
  render();
});

registerAction('hist:exercise', async () => {
  const picked = await pickExercises({ multiple: false, title: 'Workouts with…' });
  if (!picked) return;
  filters.exercise = picked[0].id;
  shown = PAGE_SIZE;
  render();
});

registerAction('hist:exercise-clear', () => {
  filters.exercise = null;
  render();
});

/* ---------- One workout ---------- */

function setLine(set, n, kind, prSets) {
  const label = set.type === 'normal' ? String(n) : SET_TYPES[set.type]?.mark ?? '•';
  const pr = prSets.has(set.id);
  return html`<li class="wd-set set--${set.type}${set.done ? '' : ' is-undone'}">
    <span class="wd-set__n" aria-label="${set.type === 'normal' ? `Set ${n}` : SET_TYPES[set.type]?.label}">${label}</span>
    <span class="wd-set__main">${describeSet(set, kind) || '—'}${pr ? html`<span class="wd-set__pr" title="Personal record">${icon('trophy')}<span class="sr-only">Personal record</span></span>` : ''}</span>
    <span class="wd-set__effort">${describeEffort(set)}</span>
    ${set.note ? html`<span class="wd-set__note">${set.note}</span>` : ''}
  </li>`;
}

function entryBlock(entry, library, letters, prSets) {
  const exercise = library.get(entry.exerciseId);
  const kind = exercise?.kind ?? 'weight';
  const stats = entryStats(entry);
  let n = 0;
  return html`<li class="card wd-ex${entry.supersetId ? ' wx--superset' : ''}">
    <div class="wd-ex__head">
      <a class="wd-ex__name" href="#/workout/exercise/${entry.exerciseId}" data-action="nav" data-route="workout" data-sub="exercise/${entry.exerciseId}">${exercise?.name ?? entry.name}</a>
      ${stats.volume ? html`<span class="wd-ex__vol">${formatVolume(stats.volume)}</span>` : ''}
    </div>
    ${entry.supersetId ? html`<span class="tag tag--superset">${icon('link')}Superset ${letters.get(entry.supersetId)}</span>` : ''}
    ${entry.notes ? html`<p class="wd-ex__notes">${entry.notes}</p>` : ''}
    <ol class="wd-sets">${entry.sets.map((set) => setLine(set, set.type === 'normal' ? ++n : n, kind, prSets))}</ol>
  </li>`;
}

export const detailPage = {
  async show(el, { id }) {
    view = el;
    const [w, library, templates, workouts, photos] = await Promise.all([loadWorkout(id), loadLibrary(), loadTemplates(), loadWorkouts(), loadPhotos()]);
    if (!w) {
      setHTML(view, html`<div class="wk-page accent-workout">
        ${subHead({ title: 'Workout not found', back: 'History', fallback: 'history', accent: 'workout' })}
        <div class="card empty">${icon('info')}<span>This workout may have been deleted.</span></div>
      </div>`);
      return;
    }
    if (isActive(w) && (await getActiveWorkout())?.id === w.id) {
      replacePage('log'); // the workout in progress
      return;
    }
    const st = workoutStats(w);
    const start = new Date(w.startedAt);
    const template = w.templateId ? templates.find((t) => t.id === w.templateId) : null;
    const letters = supersetLetters(w);
    const records = w.endedAt ? computeRecords(workouts).byWorkout.get(w.id) ?? [] : [];
    const prSets = new Set(records.map((r) => r.setId).filter(Boolean));
    const nameOf = (exerciseId, fallback) => library.get(exerciseId)?.name ?? fallback;
    setHTML(view, html`<div class="wk-page accent-workout">
      ${subHead({ title: w.title, back: 'Back', fallback: 'history', accent: 'workout', eyebrow: formatShortDate(start),
        actions: w.endedAt ? html`<button type="button" class="btn btn--sm" data-action="wd:edit" data-id="${w.id}">${icon('edit')}Edit</button>` : '' })}

      <p class="wd-when">${w.endedAt ? formatTimeRange(start, new Date(w.endedAt)) : `Started ${formatTime(start)} · not finished`}
        ${w.muscleGroups.length ? html` · ${groupsLabel(w.muscleGroups)}` : ''}</p>
      <div class="wd-tags">
        ${template ? html`<a class="tag tag--btn" href="#/workout/template/${template.id}" data-action="nav" data-route="workout" data-sub="template/${template.id}">${icon('clipboard')}${template.name}</a>` : ''}
        ${w.source === 'hevy' ? html`<span class="tag">${icon('download')}Imported from Hevy</span>` : ''}
        ${w.sample ? html`<span class="tag">Sample</span>` : ''}
      </div>

      ${w.endedAt && Date.now() - Date.parse(w.endedAt) < 6 * 3600e3 && !photos.some((p) => p.workoutId === w.id)
        ? html`<div class="card card--pad hl-empty wd-photo">${icon('camera')}<div><p><strong>Add a progress photo?</strong></p><p class="muted">It’s saved with this workout and your latest weight.</p></div>
            <button type="button" class="btn btn--accent" data-action="photos:add" data-workout="${w.id}">${icon('camera')}Add photo</button></div>` : ''}
      ${photos.some((p) => p.workoutId === w.id) ? html`<button type="button" class="tag tag--btn wd-photo-link" data-action="photos:open" data-id="${photos.filter((p) => p.workoutId === w.id).at(-1).id}">${icon('camera')}Progress photo</button>` : ''}

      <dl class="stat-grid wd-stats">
        <div class="stat"><dt>${icon('clock')}Duration</dt><dd class="stat__value">${w.endedAt ? formatDuration(st.duration) : '—'}</dd><dd class="stat__sub">${w.pausedMs >= 60_000 ? `+ ${formatDuration(w.pausedMs)} paused` : 'Active time'}</dd></div>
        <div class="stat"><dt>${icon('chart')}Volume</dt><dd class="stat__value">${formatVolume(st.volume)}</dd><dd class="stat__sub">kg × reps</dd></div>
        <div class="stat"><dt>${icon('layers')}Sets</dt><dd class="stat__value">${st.sets}</dd><dd class="stat__sub">${st.exercises} exercise${st.exercises === 1 ? '' : 's'}</dd></div>
        <div class="stat"><dt>${icon('repeat')}Reps</dt><dd class="stat__value">${st.reps}</dd><dd class="stat__sub">In total</dd></div>
      </dl>

      ${records.length ? html`<section class="section" aria-labelledby="wd-rec-title">
        <div class="section__head"><h2 class="section__title" id="wd-rec-title">Personal records</h2><span class="section__meta">${records.length} in this workout</span></div>
        ${recordList(records, nameOf, { link: 'exercise' })}
      </section>` : ''}

      ${w.notes ? html`<section class="section"><div class="section__head"><h2 class="section__title">Notes</h2></div><p class="card card--pad prose">${w.notes}</p></section>` : ''}

      <section class="section" aria-labelledby="wd-ex-title">
        <div class="section__head"><h2 class="section__title" id="wd-ex-title">Exercises</h2></div>
        ${w.exercises.length
          ? html`<ol class="wd-list">${w.exercises.map((e) => entryBlock(e, library, letters, prSets))}</ol>`
          : html`<div class="card empty">${icon('layers')}<span>No sets were logged.</span></div>`}
      </section>

      <div class="card group__card wd-actions">
        ${w.endedAt ? html`<button type="button" class="row row--icon accent-workout" data-action="wd:repeat" data-id="${w.id}">
          <span class="row__icon">${icon('repeat')}</span><span class="row__text"><span class="row__label">Do this workout again</span><span class="row__sub">Starts a new workout with the same exercises</span></span>${icon('chevronRight', 'row__chev')}</button>` : ''}
        <button type="button" class="row row--icon accent-workout" data-action="wd:template" data-id="${w.id}">
          <span class="row__icon">${icon('clipboard')}</span><span class="row__text"><span class="row__label">Save as template</span></span>${icon('chevronRight', 'row__chev')}</button>
        ${w.endedAt ? '' : html`<button type="button" class="row row--icon accent-workout" data-action="wd:finish" data-id="${w.id}">
          <span class="row__icon">${icon('stop')}</span><span class="row__text"><span class="row__label">Mark as finished</span><span class="row__sub">It ends now; you can correct the times after</span></span></button>`}
        <button type="button" class="row row--icon row--danger accent-danger" data-action="wd:delete" data-id="${w.id}">
          <span class="row__icon">${icon('trash')}</span><span class="row__text"><span class="row__label">Delete workout</span></span></button>
      </div>
    </div>`);
  },
};

registerAction('wd:edit', (el) => openPage('workout', `w/${el.dataset.id}/edit`));

registerAction('wd:repeat', async (el) => {
  const w = await loadWorkout(el.dataset.id);
  if (w) await startWorkout({ repeat: w });
});

registerAction('wd:template', (el) => saveWorkoutAsTemplate(el.dataset.id));

registerAction('wd:finish', async (el) => {
  const w = await loadWorkout(el.dataset.id);
  if (!w || w.endedAt) return;
  w.endedAt = new Date().toISOString();
  w.pausedAt = null;
  await saveWorkout(w);
  workoutsChanged('workout-end');
  openPage('workout', `w/${w.id}/edit`);
});

registerAction('wd:delete', async (el) => {
  const w = await loadWorkout(el.dataset.id);
  if (!w) return;
  const ok = await confirmDialog({ title: 'Delete workout?', message: `“${w.title}” and all its sets will be deleted.`, confirmLabel: 'Delete', destructive: true });
  if (!ok) return;
  w.deletedAt = new Date().toISOString();
  await saveWorkout(w);
  replacePage('history');
  workoutsChanged('workout-delete');
  toast('Workout deleted.', {
    icon: 'trash',
    action: {
      label: 'Undo',
      onClick: async () => {
        w.deletedAt = null;
        await saveWorkout(w);
        workoutsChanged('workout-restore');
      },
    },
  });
});
