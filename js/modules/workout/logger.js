/* Logging a workout — the workout in progress (#/workout/log) and editing a
   finished one (#/workout/w/<id>/edit). Every change is saved straight away,
   so nothing is lost if the app closes. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { state } from '../../core/state.js';
import { actionSheet, announce, confirmDialog, openDialog, promptDialog, toast } from '../../core/ui.js';
import { liveElapsed } from '../../core/components.js';
import { goBack, openPage, replacePage } from '../../core/router.js';
import { haptic, unlockAudio } from '../../core/feedback.js';
import { formatDuration, formatRelativeDay, formatTime } from '../../core/dates.js';
import { groupsLabel } from './muscles.js';
import { loadLibrary, saveExercise } from './library.js';
import {
  SET_TYPES, bestSet, describeSet, endsSuperset, finishSummary, finishWorkout, formatNumber, formatRest,
  formatSeconds, formatVolume, lastPerformances, loadWorkouts, makeSet, parseClock, parseNumber, pauseWorkout,
  resumeWorkout, saveWorkout, setField, shortId, supersetLetters, tidySets, tidySupersets, workoutDuration,
  workoutStats, workoutsChanged,
} from './model.js';
import { getActiveWorkout, notifyActiveChanged, onActiveWorkout, setActiveWorkout } from './store.js';
import { addExercises, chooseFocus } from './start.js';
import { pickExercises } from './picker.js';
import { startRest, stopRest } from './rest-timer.js';

const checked = (on) => (on ? raw(' checked') : '');
const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const LIMITS = { weightKg: [0, 1500], reps: [0, 1000], rpe: [1, 10], rir: [0, 10], durationSec: [0, 86400], distanceKm: [0, 1000] };

let view = null;
let s = null;             // { workout, mode: 'active' | 'edit', library, previous, noteOpen }
let visible = false;
let typingTimer = null;
let ownChange = false;

/* ---------- Page ---------- */

export const loggerPage = {
  async show(el, { mode, id = null }) {
    view = el;
    visible = true;
    const [library, workouts] = await Promise.all([loadLibrary(), loadWorkouts()]);
    const workout = mode === 'active' ? await getActiveWorkout() : workouts.find((w) => w.id === id) ?? null;
    if (!workout || (mode === 'edit' && !workout.endedAt)) {
      s = null;
      renderMissing(mode, workout);
      return;
    }
    s = {
      workout,
      mode,
      library,
      previous: lastPerformances(workouts, { excludeId: workout.id, before: mode === 'edit' ? workout.startedAt : null }),
      noteOpen: new Set(),
    };
    render();
  },
  hide() {
    visible = false;
    if (!s) return;
    if (s.mode === 'edit') finishEditing({ leave: false });
    else if (typingTimer) save();
  },
};

function renderMissing(mode, workout) {
  if (mode === 'edit' && workout && !workout.endedAt) {
    replacePage('log'); // still in progress: log it instead
    return;
  }
  setHTML(view, html`<div class="wl accent-workout">
    <div class="wl-bar"><button type="button" class="back-btn" data-action="nav:back" data-fallback="">${icon('chevronLeft')}<span>Workout</span></button></div>
    <h1 class="page-title" tabindex="-1">${mode === 'active' ? 'No workout in progress' : 'Workout not found'}</h1>
    <div class="card empty">${icon('dumbbell')}<span>${mode === 'active'
      ? 'It may have been finished on another device.'
      : 'It may have been deleted.'}</span></div>
    ${mode === 'active' ? html`<button type="button" class="btn btn--accent btn--block wl-missing__btn" data-action="workout:start">${icon('bolt')}Start Workout</button>` : ''}
  </div>`);
}

const exerciseOf = (entry) => s.library.get(entry.exerciseId);
const kindOf = (entry) => exerciseOf(entry)?.kind ?? 'weight';
const effortField = () => ({ rir: 'rir', rpe: 'rpe' })[state.settings.workout.effort] ?? null;
/** Rest between sets of this exercise: set in this workout, else the exercise's own, else your default. */
const restFor = (entry) => entry.restSeconds ?? exerciseOf(entry)?.restSeconds ?? state.settings.workout.restSeconds;
/** Rest before the next exercise (Settings → Workout); "same as between sets" when not set. */
const exerciseRestFor = (entry) => state.settings.workout.exerciseRestSeconds ?? restFor(entry);

/** The columns you type into, by kind of exercise: [field, header, keyboard]. Times are typed as 1:30 or 1.30. */
function columns(kind) {
  if (kind === 'duration') return [['durationSec', 'Time', 'decimal']];
  if (kind === 'cardio') return [['distanceKm', 'km', 'decimal'], ['durationSec', 'Time', 'decimal']];
  const cols = [['weightKg', 'kg', 'decimal'], ['reps', 'Reps', 'numeric']];
  const effort = effortField();
  if (effort) cols.push([effort, effort.toUpperCase(), 'decimal']);
  return cols;
}

/* ---------- Rendering ---------- */

function render() {
  const w = s.workout;
  const letters = supersetLetters(w);
  setHTML(view, html`<div class="wl wl--${s.mode} accent-workout">
    ${s.mode === 'active' ? activeHead(w) : editHead(w)}
    ${w.exercises.length
      ? html`<ol class="wl-list">${w.exercises.map((entry, i) => exerciseCard(entry, i, letters))}</ol>`
      : html`<div class="card wl-empty">${icon('layers')}<p>No exercises yet. Add some to start logging sets.</p></div>`}
    <button type="button" class="btn btn--block wl-add" data-action="wl:add-exercises">${icon('plus')}Add exercises</button>
    <label class="field wl-notes"><span class="field__label">Workout notes</span>
      <textarea class="input textarea" data-field="notes" rows="2" maxlength="2000" placeholder="How did it go?">${w.notes}</textarea>
    </label>
    <div class="wl-foot">
      ${s.mode === 'active'
        ? html`<button type="button" class="btn btn--accent btn--block" data-action="wl:end">${icon('stop')}End Workout</button>
          <button type="button" class="btn btn--ghost btn--block wl-danger" data-action="wl:discard">Discard workout</button>`
        : html`<button type="button" class="btn btn--primary btn--block" data-action="wl:done">Done</button>
          <button type="button" class="btn btn--ghost btn--block wl-danger" data-action="wl:delete">Delete workout</button>`}
    </div>
  </div>`);
}

function statsList(w) {
  const st = workoutStats(w);
  return html`<dl class="wl-stats">
    <div><dt>Volume</dt><dd data-stat="volume">${formatVolume(st.volume)}</dd></div>
    <div><dt>Sets</dt><dd data-stat="sets">${st.sets}/${st.planned}</dd></div>
    <div><dt>Exercises</dt><dd data-stat="exercises">${w.exercises.length}</dd></div>
  </dl>`;
}

function activeHead(w) {
  const paused = Boolean(w.pausedAt);
  return html`
    <div class="wl-bar">
      <button type="button" class="back-btn" data-action="nav:back" data-fallback="">${icon('chevronLeft')}<span>Workout</span></button>
      <span class="wl-bar__clock${paused ? ' is-paused' : ''}" aria-hidden="true">${icon(paused ? 'pause' : 'timer')}${liveElapsed(w.startedAt, w.pausedMs, w.pausedAt)}</span>
      <button type="button" class="btn btn--sm btn--accent" data-action="wl:end">End</button>
    </div>
    <header class="wl-head">
      <div class="wl-title">
        <h1 class="page-title" tabindex="-1">${w.title}</h1>
        <button type="button" class="icon-btn" data-action="wl:rename" aria-label="Rename workout">${icon('edit')}</button>
      </div>
      <p class="wl-sub">Started ${formatTime(new Date(w.startedAt))} ·
        <button type="button" class="link-inline" data-action="wl:focus">${w.muscleGroups.length ? groupsLabel(w.muscleGroups) : 'Choose muscle groups'}</button></p>
      <div class="wl-timer${paused ? ' is-paused' : ''}" role="timer" aria-label="Workout duration">
        <div class="wl-timer__text">
          <span class="wl-timer__label">${paused ? 'Paused' : 'Duration'}</span>
          <span class="wl-timer__value">${liveElapsed(w.startedAt, w.pausedMs, w.pausedAt)}</span>
        </div>
        ${paused
          ? html`<button type="button" class="btn btn--accent" data-action="wl:resume">${icon('play')}Resume</button>`
          : html`<button type="button" class="btn" data-action="wl:pause">${icon('pause')}Pause</button>`}
      </div>
      ${statsList(w)}
    </header>`;
}

const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function editHead(w) {
  const paused = (Number(w.pausedMs) || 0) >= 60_000 ? Number(w.pausedMs) : 0;
  return html`
    <div class="wl-bar">
      <button type="button" class="back-btn" data-action="wl:done">${icon('chevronLeft')}<span>Done</span></button>
    </div>
    <header class="wl-head">
      <p class="page-head__eyebrow">Editing</p>
      <h1 class="page-title" tabindex="-1">Edit workout</h1>
      <div class="form wl-edit">
        <label class="field"><span class="field__label">Name</span>
          <input class="input" data-field="title" value="${w.title}" maxlength="80" autocomplete="off" enterkeyhint="done"></label>
        <div class="field-row">
          <label class="field"><span class="field__label">Started</span>
            <input class="input" type="datetime-local" data-field="startedAt" value="${toLocalInput(w.startedAt)}"></label>
          <label class="field"><span class="field__label">Ended</span>
            <input class="input" type="datetime-local" data-field="endedAt" value="${toLocalInput(w.endedAt)}"></label>
        </div>
        <p class="form-error" data-time-error role="alert" hidden></p>
        <p class="wl-sub" data-duration>Duration ${formatDuration(workoutDuration(w))}${paused ? ` (not counting ${formatDuration(paused)} paused)` : ''}</p>
        <button type="button" class="row row--icon wl-edit__groups" data-action="wl:focus">
          <span class="row__icon">${icon('target')}</span>
          <span class="row__text"><span class="row__label">Muscle groups</span><span class="row__sub">${w.muscleGroups.length ? groupsLabel(w.muscleGroups) : 'None chosen'}</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
      ${statsList(w)}
    </header>`;
}

/** Previous session's set in the same position (for hints and "same as last time"). */
function prevSetFor(entry, index) {
  return s.previous.get(entry.exerciseId)?.entry.sets.filter((x) => x.done)[index] ?? null;
}

const inputValue = (set, field) => {
  const v = set[field];
  if (v == null) return '';
  return field === 'durationSec' ? formatSeconds(v) : String(Math.round(v * 100) / 100);
};

function hint(field, prev, entry) {
  if (prev?.[field] != null) return inputValue(prev, field);
  if (field === 'reps' && entry.targetReps) return entry.targetReps;
  return { weightKg: 'kg', reps: 'reps', rpe: 'RPE', rir: 'RIR', durationSec: '0:00', distanceKm: 'km' }[field];
}

/** Short form for the Previous column: "70×8", "1:00", "5 km". */
function compactSet(set, kind) {
  if (kind === 'duration') return set.durationSec ? formatSeconds(set.durationSec) : '—';
  if (kind === 'cardio') return set.distanceKm ? `${formatNumber(set.distanceKm)} km` : set.durationSec ? formatSeconds(set.durationSec) : '—';
  if (set.weightKg != null && set.reps != null) return `${formatNumber(set.weightKg)}×${set.reps}`;
  if (set.reps != null) return `×${set.reps}`;
  return set.weightKg != null ? `${formatNumber(set.weightKg)} kg` : '—';
}

function setLabel(entry, set) {
  if (set.type !== 'normal') return SET_TYPES[set.type]?.mark ?? '•';
  let n = 0;
  for (const x of entry.sets) {
    if (x.type === 'normal') n++;
    if (x === set) break;
  }
  return String(n);
}

function setRow(entry, set, index, kind, cols) {
  const label = setLabel(entry, set);
  const typeName = set.type === 'normal' ? `Set ${label}` : `${SET_TYPES[set.type].label} set`;
  const prev = prevSetFor(entry, index);
  return html`<div class="set set--${set.type}${set.done ? ' is-done' : ''}" data-set="${set.id}" role="group" aria-label="${typeName}">
    <button type="button" class="set__type" data-action="wl:set-menu" aria-label="${typeName}: options">${label}</button>
    <button type="button" class="set__prev" data-action="wl:use-prev"${prev ? '' : raw(' disabled')} aria-label="${prev ? `Last time: ${describeSet(prev, kind)}. Use these numbers` : 'No previous set'}">${prev ? compactSet(prev, kind) : '—'}</button>
    ${cols.map(([field, header, mode]) => html`<input class="set__in" data-field="${field}" inputmode="${mode}"
      enterkeyhint="next" autocomplete="off" autocorrect="off" spellcheck="false" value="${inputValue(set, field)}" placeholder="${hint(field, prev, entry)}"
      aria-label="${header}${field === 'durationSec' ? ' (minutes:seconds)' : ''}, ${typeName.toLowerCase()}">`)}
    <button type="button" class="set__check" data-action="wl:check" aria-pressed="${set.done ? 'true' : 'false'}" aria-label="${typeName} done">${icon('check')}</button>
    ${set.note ? html`<button type="button" class="set__note" data-action="wl:set-note">${icon('note')}<span>${set.note}</span></button>` : ''}
  </div>`;
}

function exerciseCard(entry, index, letters) {
  const exercise = exerciseOf(entry);
  const name = exercise?.name ?? entry.name;
  const kind = kindOf(entry);
  const cols = columns(kind);
  const prev = s.previous.get(entry.exerciseId);
  const best = prev ? bestSet(prev.entry) : null;
  const letter = entry.supersetId ? letters.get(entry.supersetId) : null;
  const showNote = Boolean(entry.notes) || s.noteOpen.has(entry.id);
  return html`<li class="wx${letter ? ' wx--superset' : ''}" data-ex="${entry.id}">
    <div class="wx__head">
      <button type="button" class="wx__name" data-action="wl:ex-info">${name}</button>
      <button type="button" class="icon-btn" data-action="wl:ex-menu" aria-label="Options for ${name}">${icon('more')}</button>
    </div>
    <div class="wx__tags">
      ${letter ? html`<span class="tag tag--superset">${icon('link')}Superset ${letter}</span>` : ''}
      <button type="button" class="tag tag--btn" data-action="wl:rest" aria-label="Rest between sets: ${formatRest(restFor(entry))}. Change">${icon('timer')}${formatRest(restFor(entry))}</button>
      ${entry.targetReps ? html`<span class="tag">${icon('target')}Target ${entry.targetReps} reps</span>` : ''}
    </div>
    <p class="wx__prev">${best
      ? html`Previous: <strong>${describeSet(best, kind)}</strong> · ${formatRelativeDay(new Date(prev.workout.startedAt))}`
      : 'First time — no previous numbers yet'}</p>
    ${exercise?.notes ? html`<p class="wx__tip">${icon('info')}<span>${exercise.notes}</span></p>` : ''}
    ${showNote ? html`<textarea class="input textarea wx__note" data-field="exNote" rows="1" maxlength="1000" placeholder="Notes for this exercise today">${entry.notes ?? ''}</textarea>` : ''}
    <div class="sets sets--c${cols.length}">
      <div class="sets__head" aria-hidden="true">
        <span>Set</span><span class="sets__prev-h">Previous</span>${cols.map(([, header]) => html`<span>${header}</span>`)}<span>${icon('check')}</span>
      </div>
      ${entry.sets.map((set, i) => setRow(entry, set, i, kind, cols))}
    </div>
    <button type="button" class="wx__add" data-action="wl:add-set">${icon('plus')}Add set</button>
  </li>`;
}

function updateStats() {
  if (!view) return;
  const st = workoutStats(s.workout);
  const put = (key, text) => { const el = view.querySelector(`[data-stat="${key}"]`); if (el) el.textContent = text; };
  put('volume', formatVolume(st.volume));
  put('sets', `${st.sets}/${st.planned}`);
  put('exercises', String(s.workout.exercises.length));
}

/** Re-draw, keeping focus on the same control when it still exists. */
function rerender() {
  const focused = document.activeElement;
  let selector = null;
  if (focused && view.contains(focused)) {
    const ex = focused.closest('[data-ex]')?.dataset.ex;
    const set = focused.closest('[data-set]')?.dataset.set;
    const key = focused.dataset.action ? `[data-action="${focused.dataset.action}"]` : focused.dataset.field ? `[data-field="${focused.dataset.field}"]` : null;
    if (key) selector = `${ex ? `[data-ex="${CSS.escape(ex)}"] ` : ''}${set ? `[data-set="${CSS.escape(set)}"] ` : ''}${key}`;
  }
  render();
  if (selector) view.querySelector(selector)?.focus({ preventScroll: true });
}

/* ---------- Saving ---------- */

function saveFailed(err) {
  console.error(err);
  toast('Couldn’t save your last change. Check that your device has free storage.', { icon: 'info', duration: 6000 });
}

/** Save now. quiet (the default mid-workout) lets sync wait a little before sending. */
function save({ quiet = true } = {}) {
  clearTimeout(typingTimer);
  typingTimer = null;
  return saveWorkout(s.workout, { quiet: s.mode === 'active' && quiet }).catch(saveFailed);
}

function saveSoon() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { if (s) save(); }, 600);
}

/** Tell the workout bar and dashboard (pause, rename, finish…), without re-drawing this page. */
function notifyOwn() {
  ownChange = true;
  try { notifyActiveChanged(); } finally { ownChange = false; }
}

onActiveWorkout((workout) => {
  if (ownChange || !visible || s?.mode !== 'active') return;
  if (!workout) {
    s = null;
    renderMissing('active');
    return;
  }
  s.workout = workout;
  if (!view.contains(document.activeElement) || !document.activeElement.matches('input, textarea')) rerender();
});

/* ---------- Typing ---------- */

function locate(el) {
  const exId = el.closest('[data-ex]')?.dataset.ex;
  const entry = exId ? s.workout.exercises.find((e) => e.id === exId) : null;
  const setId = el.closest('[data-set]')?.dataset.set;
  const set = entry && setId ? entry.sets.find((x) => x.id === setId) : null;
  return { entry, set, index: entry && set ? entry.sets.indexOf(set) : -1 };
}

function readField(el, entry) {
  const field = el.dataset.field;
  const value = field === 'durationSec' ? parseClock(el.value, kindOf(entry) === 'cardio' ? 'min' : 'sec') : parseNumber(el.value);
  if (value === null) return { ok: true, value: null };
  const [min, max] = LIMITS[field];
  if (Number.isNaN(value) || value < min || value > max) return { ok: false };
  return { ok: true, value: field === 'reps' ? Math.round(value) : value };
}

function onInput(event) {
  if (!s || !visible) return;
  const el = event.target;
  const field = el.dataset.field;
  if (!field) return;
  if (field === 'notes') { s.workout.notes = el.value; saveSoon(); return; }
  if (field === 'title') { s.workout.title = el.value.trim() || s.workout.title; saveSoon(); return; }
  if (field === 'startedAt' || field === 'endedAt') return; // handled on change
  const { entry, set } = locate(el);
  if (field === 'exNote' && entry) { entry.notes = el.value; saveSoon(); return; }
  if (!set) return;
  const { ok, value } = readField(el, entry);
  el.setAttribute('aria-invalid', ok ? 'false' : 'true');
  if (!ok) return;
  setField(set, field, value);
  if (set.done) updateStats();
  saveSoon();
}

function onChange(event) {
  if (!s || !visible) return;
  const el = event.target;
  const field = el.dataset.field;
  if (field === 'startedAt' || field === 'endedAt') {
    changeTimes();
    return;
  }
  if (field === 'title') {
    if (!el.value.trim()) el.value = s.workout.title;
    save({ quiet: false });
    return;
  }
  const { entry, set } = locate(el);
  if (set && el.classList.contains('set__in')) {
    const { ok } = readField(el, entry);
    if (ok) el.value = inputValue(set, field); // tidy up, e.g. "90" → "1:30"
  }
}

function changeTimes() {
  const w = s.workout;
  const startEl = view.querySelector('[data-field="startedAt"]');
  const endEl = view.querySelector('[data-field="endedAt"]');
  const error = view.querySelector('[data-time-error]');
  const start = new Date(startEl.value);
  const end = new Date(endEl.value);
  let message = '';
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) message = 'Please enter both a start and an end time.';
  else if (end <= start) message = 'The end time must be after the start time.';
  else if (end - start > 24 * 3600e3) message = 'A workout can’t be longer than 24 hours.';
  else if (start > new Date()) message = 'The start time can’t be in the future.';
  error.textContent = message;
  error.hidden = !message;
  if (message) return;
  w.startedAt = start.toISOString();
  w.endedAt = end.toISOString();
  if ((Number(w.pausedMs) || 0) > end - start) w.pausedMs = 0;
  const paused = (Number(w.pausedMs) || 0) >= 60_000 ? Number(w.pausedMs) : 0;
  view.querySelector('[data-duration]').textContent = `Duration ${formatDuration(workoutDuration(w))}${paused ? ` (not counting ${formatDuration(paused)} paused)` : ''}`;
  save({ quiet: false });
}

function onKeydown(event) {
  if (!s || !visible) return;
  const el = event.target;
  if (event.key !== 'Enter' || !el.classList?.contains('set__in')) {
    if (event.key === 'Enter' && el.dataset?.field === 'title') el.blur();
    return;
  }
  event.preventDefault();
  const inputs = [...view.querySelectorAll('.set__in')];
  const next = inputs[inputs.indexOf(el) + 1];
  if (next) next.focus();
  else el.blur();
}

export function mountLogger(el) {
  el.addEventListener('input', onInput);
  el.addEventListener('change', onChange);
  el.addEventListener('keydown', onKeydown);
}

/* ---------- Sets ---------- */

function refreshRow(entry, set) {
  const row = view.querySelector(`[data-set="${CSS.escape(set.id)}"]`);
  if (!row) return;
  row.classList.toggle('is-done', set.done);
  row.querySelector('.set__check').setAttribute('aria-pressed', String(set.done));
  row.querySelectorAll('.set__in').forEach((input) => {
    if (document.activeElement !== input) input.value = inputValue(set, input.dataset.field);
    input.setAttribute('aria-invalid', 'false');
  });
}

const allDone = (entry) => entry.sets.every((x) => x.done);
const nameOf = (entry) => exerciseOf(entry)?.name ?? entry.name;

/** "Bench Press · set 3" — the next set to do, starting from this exercise (a superset starts its round again). */
function nextSetLabel(fromEntry) {
  const list = s.workout.exercises;
  const start = fromEntry.supersetId ? list.findIndex((e) => e.supersetId === fromEntry.supersetId) : list.indexOf(fromEntry);
  for (let i = 0; i < list.length; i++) {
    const entry = list[(start + i) % list.length];
    const set = entry.sets.find((x) => !x.done);
    if (set) return `${nameOf(entry)} · ${set.type === 'normal' ? `set ${setLabel(entry, set)}` : SET_TYPES[set.type].label.toLowerCase()}`;
  }
  return '';
}

/** The next exercise with sets left, after this one (or after its superset). */
function nextExerciseName(group) {
  const list = s.workout.exercises;
  const last = list.indexOf(group[group.length - 1]);
  for (let i = 1; i <= list.length; i++) {
    const entry = list[(last + i) % list.length];
    if (!allDone(entry)) return nameOf(entry);
  }
  return '';
}

/**
 * After a set is ticked: rest before the next set, a (longer) rest before the
 * next exercise once this one — or its whole superset — is finished, no rest
 * in the middle of a superset round, and nothing after the very last set.
 */
function afterSet(entry) {
  const list = s.workout.exercises;
  if (list.every(allDone)) return { kind: 'done' };
  const group = entry.supersetId ? list.filter((e) => e.supersetId === entry.supersetId) : [entry];
  if (group.every(allDone)) return { kind: 'exercise', seconds: exerciseRestFor(entry), label: nextExerciseName(group) };
  if (!endsSuperset(s.workout, entry)) return { kind: 'none' };
  return { kind: 'set', seconds: restFor(entry), label: nextSetLabel(entry) };
}

registerAction('wl:check', (el) => {
  if (!s) return;
  const { entry, set, index } = locate(el);
  if (!set) return;
  unlockAudio();
  haptic();
  if (!set.done) {
    // Weight, reps or time left empty get last time's numbers (shown as grey hints)
    const prev = prevSetFor(entry, index);
    columns(kindOf(entry)).forEach(([field]) => {
      if (field !== 'rir' && field !== 'rpe' && set[field] == null && prev?.[field] != null) set[field] = prev[field];
    });
    set.done = true;
    const next = s.mode === 'active' ? afterSet(entry) : { kind: 'none' };
    if (next.kind === 'done') {
      stopRest();
      announce('Set done. That was your last set.');
      toast('That’s every set done. Tap End Workout when you’re finished.', { icon: 'checkCircle', duration: 5000 });
    } else if ((next.kind === 'set' || next.kind === 'exercise') && next.seconds > 0) {
      startRest(next.seconds, { workoutId: s.workout.id, label: next.label, kind: next.kind });
      announce(next.kind === 'exercise'
        ? `Exercise done. Resting ${formatRest(next.seconds)} before ${next.label}.`
        : `Set done. Resting ${formatRest(next.seconds)}.`);
    } else {
      announce('Set done.');
    }
  } else {
    set.done = false;
  }
  refreshRow(entry, set);
  updateStats();
  save();
});

registerAction('wl:use-prev', (el) => {
  if (!s) return;
  const { entry, set, index } = locate(el);
  const prev = set && prevSetFor(entry, index);
  if (!prev) return;
  columns(kindOf(entry)).forEach(([field]) => setField(set, field, prev[field] ?? null));
  refreshRow(entry, set);
  if (set.done) updateStats();
  save();
});

registerAction('wl:add-set', (el) => {
  if (!s) return;
  const { entry } = locate(el);
  if (!entry) return;
  const last = entry.sets[entry.sets.length - 1];
  const values = {};
  if (last) {
    ['weightKg', 'reps', 'durationSec', 'distanceKm'].forEach((k) => { if (last[k] != null) values[k] = last[k]; });
    values.type = last.type === 'warmup' ? 'normal' : last.type;
  }
  entry.sets.push(makeSet(values));
  rerender();
  save();
});

registerAction('wl:set-menu', async (el) => {
  if (!s) return;
  const { entry, set } = locate(el);
  if (!set) return;
  const choice = await actionSheet({
    title: `${exerciseOf(entry)?.name ?? entry.name} · ${set.type === 'normal' ? `Set ${setLabel(entry, set)}` : SET_TYPES[set.type].label}`,
    items: [
      ...Object.entries(SET_TYPES).map(([value, t]) => ({ value: `type:${value}`, label: t.label, detail: t.mark ?? '', checked: set.type === value })),
      { value: 'note', label: set.note ? 'Edit note' : 'Add note', icon: 'note' },
      { value: 'delete', label: 'Delete set', icon: 'trash', destructive: true },
    ],
  });
  if (!choice || !s) return;
  if (choice.startsWith('type:')) {
    set.type = choice.slice(5);
  } else if (choice === 'note') {
    const text = await promptDialog({ title: 'Set note', value: set.note ?? '', placeholder: 'e.g. felt easy, paused reps', maxLength: 300 });
    if (text === null) return;
    setField(set, 'note', text);
  } else if (choice === 'delete') {
    const at = entry.sets.indexOf(set);
    entry.sets.splice(at, 1);
    rerender();
    updateStats();
    save();
    toast('Set deleted.', {
      icon: 'trash',
      action: { label: 'Undo', onClick: () => { if (!s) return; entry.sets.splice(at, 0, set); rerender(); save(); } },
    });
    return;
  }
  rerender();
  save();
});

registerAction('wl:set-note', async (el) => {
  if (!s) return;
  const { set } = locate(el);
  if (!set) return;
  const text = await promptDialog({ title: 'Set note', value: set.note ?? '', maxLength: 300 });
  if (text === null) return;
  setField(set, 'note', text);
  rerender();
  save();
});

/* ---------- Exercises ---------- */

registerAction('wl:add-exercises', async () => {
  if (!s) return;
  const added = await addExercises(s.workout, { mode: s.mode });
  if (!added || !s) return;
  rerender();
  const cards = view.querySelectorAll('.wx');
  cards[cards.length - added]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

registerAction('wl:ex-info', (el) => {
  const { entry } = locate(el);
  if (entry) openPage('workout', `exercise/${entry.exerciseId}`);
});

registerAction('wl:rest', async (el) => {
  if (!s) return;
  const { entry } = locate(el);
  if (entry) await chooseRest(entry);
});

async function chooseRest(entry) {
  const exercise = exerciseOf(entry);
  const name = exercise?.name ?? entry.name;
  const current = restFor(entry);
  const result = await openDialog({
    variant: 'sheet',
    className: 'rest-dialog',
    title: 'Rest between sets',
    body: html`<p class="dlg__msg">${name}</p>
      <div class="chips" role="radiogroup" aria-label="Rest time">
        ${REST_CHOICES.map((sec) => html`<label class="chip-opt"><input type="radio" name="rest" value="${sec}"${checked(sec === current)}><span>${formatRest(sec)}</span></label>`)}
      </div>
      <label class="field rest-dialog__custom"><span class="field__label">Or type a time (minutes:seconds)</span>
        <input class="input" data-custom inputmode="decimal" placeholder="e.g. 1:45" autocomplete="off" value="${REST_CHOICES.includes(current) ? '' : formatSeconds(current)}"></label>
      ${exercise ? html`<label class="row rest-dialog__remember">
        <span class="row__text"><span class="row__label">Always use for this exercise</span><span class="row__sub">Otherwise just for this workout</span></span>
        <input type="checkbox" class="switch" switch data-remember></label>` : ''}
      <p class="form-error" data-error role="alert" hidden></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="">Cancel</button>
        <button type="button" class="btn btn--primary" data-save>Save</button>
      </div>`,
    onOpen(dlg, close) {
      const custom = dlg.querySelector('[data-custom]');
      dlg.querySelectorAll('input[name="rest"]').forEach((r) => r.addEventListener('change', () => { custom.value = ''; }));
      dlg.querySelector('[data-save]').addEventListener('click', () => {
        const typed = custom.value.trim();
        const seconds = typed ? parseClock(typed) : Number(dlg.querySelector('input[name="rest"]:checked')?.value ?? current);
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 900) {
          const error = dlg.querySelector('[data-error]');
          error.textContent = 'Choose a rest time up to 15 minutes, like 1:45.';
          error.hidden = false;
          return;
        }
        close({ seconds, remember: Boolean(dlg.querySelector('[data-remember]')?.checked) });
      });
    },
  });
  if (!result || typeof result !== 'object' || !s) return;
  entry.restSeconds = result.seconds;
  if (result.remember && exercise) {
    await saveExercise(exercise, { restSeconds: result.seconds }).catch(saveFailed);
    s.library = await loadLibrary();
  }
  rerender();
  save();
  toast(result.seconds ? `Rest for ${name}: ${formatRest(result.seconds)}` : `Rest timer off for ${name}`, { icon: 'timer' });
}

registerAction('wl:ex-menu', async (el) => {
  if (!s) return;
  const { entry } = locate(el);
  if (!entry) return;
  const list = s.workout.exercises;
  const i = list.indexOf(entry);
  const name = exerciseOf(entry)?.name ?? entry.name;
  const choice = await actionSheet({
    title: name,
    items: [
      { value: 'info', label: 'Exercise details & history', icon: 'info' },
      { value: 'note', label: entry.notes || s.noteOpen.has(entry.id) ? 'Edit note' : 'Add note', icon: 'note' },
      { value: 'rest', label: 'Rest between sets', icon: 'timer', detail: formatRest(restFor(entry)) },
      entry.supersetId
        ? { value: 'unsuperset', label: 'Remove from superset', icon: 'link' }
        : i < list.length - 1 && { value: 'superset', label: 'Superset with next exercise', icon: 'link' },
      { value: 'up', label: 'Move up', icon: 'arrowUp', disabled: i === 0 },
      { value: 'down', label: 'Move down', icon: 'arrowDown', disabled: i === list.length - 1 },
      { value: 'replace', label: 'Replace exercise', icon: 'swap' },
      { value: 'remove', label: 'Remove exercise', icon: 'trash', destructive: true },
    ],
  });
  if (!choice || !s) return;
  switch (choice) {
    case 'info':
      openPage('workout', `exercise/${entry.exerciseId}`);
      return;
    case 'note':
      s.noteOpen.add(entry.id);
      rerender();
      view.querySelector(`[data-ex="${CSS.escape(entry.id)}"] .wx__note`)?.focus();
      return;
    case 'rest':
      await chooseRest(entry);
      return;
    case 'superset': {
      const next = list[i + 1];
      const id = entry.supersetId ?? next.supersetId ?? shortId();
      const old = next.supersetId;
      list.forEach((e) => { if (old && e.supersetId === old) e.supersetId = id; });
      entry.supersetId = id;
      next.supersetId = id;
      break;
    }
    case 'unsuperset': {
      const group = list.filter((e) => e.supersetId === entry.supersetId);
      const last = group[group.length - 1];
      if (last !== entry) {
        list.splice(list.indexOf(entry), 1);
        list.splice(list.indexOf(last) + 1, 0, entry);
      }
      delete entry.supersetId;
      break;
    }
    case 'up':
    case 'down': {
      const j = choice === 'up' ? i - 1 : i + 1;
      [list[i], list[j]] = [list[j], list[i]];
      break;
    }
    case 'replace': {
      const picked = await pickExercises({ groups: s.workout.muscleGroups, multiple: false, title: `Replace ${name}` });
      if (!picked || !s) return;
      entry.exerciseId = picked[0].id;
      entry.name = picked[0].name;
      delete entry.restSeconds;
      break;
    }
    case 'remove': {
      list.splice(i, 1);
      tidySupersets(s.workout);
      rerender();
      updateStats();
      save();
      toast(`${name} removed.`, {
        icon: 'trash',
        action: { label: 'Undo', onClick: () => { if (!s) return; list.splice(i, 0, entry); tidySupersets(s.workout); rerender(); save(); } },
      });
      return;
    }
    default:
      return;
  }
  tidySupersets(s.workout);
  rerender();
  save();
});

/* ---------- The workout as a whole ---------- */

registerAction('wl:rename', async () => {
  if (!s) return;
  const text = await promptDialog({ title: 'Workout name', value: s.workout.title, maxLength: 80, required: true });
  if (!text || !s) return;
  s.workout.title = text;
  rerender();
  await save({ quiet: false });
  notifyOwn();
});

registerAction('wl:focus', async () => {
  if (!s) return;
  const changed = await chooseFocus(s.workout, { active: s.mode === 'active' });
  if (!changed || !s) return;
  rerender();
  if (s.mode === 'active') notifyOwn();
});

registerAction('wl:pause', async () => {
  if (!s || s.mode !== 'active') return;
  const ok = await confirmDialog({ title: 'Pause workout timer?', message: 'The timer stops until you resume.', confirmLabel: 'Pause' });
  if (!ok || !s) return;
  pauseWorkout(s.workout);
  rerender();
  await save({ quiet: false });
  notifyOwn();
  announce('Workout paused.');
});

registerAction('wl:resume', async () => {
  if (!s || s.mode !== 'active') return;
  resumeWorkout(s.workout);
  rerender();
  await save({ quiet: false });
  notifyOwn();
  announce('Workout resumed.');
});

registerAction('wl:end', async () => {
  if (!s || s.mode !== 'active') return;
  const w = s.workout;
  const summary = finishSummary(w);
  let message = 'Completed sets and workout information will be saved.';
  if (summary.autoComplete) message += ` ${summary.autoComplete} set${summary.autoComplete === 1 ? '' : 's'} you filled in but didn’t tick will be saved as done.`;
  if (summary.empty) message += ' Empty sets are left out.';

  if (!summary.done && !summary.autoComplete) {
    const choice = await openDialog({
      variant: 'alert',
      title: 'End workout?',
      body: html`<p class="dlg__msg">No sets are logged yet. Save it anyway (as a workout with just its time), or discard it?</p>`,
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'ghost', autofocus: true },
        { label: 'Discard', value: 'discard', variant: 'danger-solid' },
        { label: 'Save', value: 'save', variant: 'primary' },
      ],
    });
    if (choice === 'discard') {
      await discard({ confirmFirst: false });
      return;
    }
    if (choice !== 'save') return;
  } else {
    const ok = await confirmDialog({ title: 'End workout?', message, confirmLabel: 'End Workout' });
    if (!ok) return;
  }
  if (!s) return;
  finishWorkout(w);
  tidySupersets(w);
  await save({ quiet: false });
  stopRest();
  s = null;
  setActiveWorkout(null);
  workoutsChanged('workout-end');
  const st = workoutStats(w);
  replacePage(`w/${w.id}`);
  toast(`Workout saved · ${formatDuration(st.duration)} · ${st.sets} set${st.sets === 1 ? '' : 's'}`, { icon: 'checkCircle' });
});

async function discard({ confirmFirst = true } = {}) {
  if (!s || s.mode !== 'active') return;
  if (confirmFirst) {
    const ok = await confirmDialog({
      title: 'Discard workout?',
      message: 'This workout and everything logged in it will be deleted.',
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (!ok || !s) return;
  }
  const w = s.workout;
  w.deletedAt = new Date().toISOString();
  await save({ quiet: false });
  stopRest();
  s = null;
  setActiveWorkout(null);
  workoutsChanged('workout-discard');
  replacePage('');
  toast('Workout discarded.', {
    icon: 'trash',
    action: {
      label: 'Undo',
      onClick: async () => {
        if (await getActiveWorkout()) {
          toast('Finish the workout you’re doing first.', { icon: 'info' });
          return;
        }
        w.deletedAt = null;
        await saveWorkout(w).catch(saveFailed);
        setActiveWorkout(w);
        workoutsChanged('workout-start');
        openPage('workout', 'log');
      },
    },
  });
}

registerAction('wl:discard', () => discard());

/* ---------- Editing a finished workout ---------- */

function finishEditing({ leave }) {
  const w = s.workout;
  tidySets(w);
  tidySupersets(w);
  const saving = save({ quiet: false }).then(() => workoutsChanged('workout-edit'));
  if (leave) {
    s = null;
    goBack(`w/${w.id}`);
  }
  return saving;
}

registerAction('wl:done', () => {
  if (s?.mode === 'edit') finishEditing({ leave: true });
});

registerAction('wl:delete', async () => {
  if (!s || s.mode !== 'edit') return;
  const w = s.workout;
  const ok = await confirmDialog({
    title: 'Delete workout?',
    message: `“${w.title}” and all its sets will be deleted.`,
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok || !s) return;
  w.deletedAt = new Date().toISOString();
  await save({ quiet: false });
  s = null;
  workoutsChanged('workout-delete');
  replacePage('history');
  toast('Workout deleted.', {
    icon: 'trash',
    action: {
      label: 'Undo',
      onClick: async () => {
        w.deletedAt = null;
        await saveWorkout(w).catch(saveFailed);
        workoutsChanged('workout-restore');
      },
    },
  });
});
