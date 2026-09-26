/* Workouts: one record per workout, holding its exercises and their sets.

   {
     id, createdAt, updatedAt, deletedAt,
     title: 'Push day',
     muscleGroups: ['Push'],       what you chose to train (see muscles.js)
     type: 'Push',                 short label made from muscleGroups
     startedAt, endedAt,           endedAt is null while the workout is in progress
     pausedMs, pausedAt,           time spent paused; pausedAt is set while paused
     templateId, notes,
     source: 'app' | 'hevy',
     exercises: [{
       id, exerciseId, name,       name is a copy, so history still reads well if an exercise is deleted
       notes, restSeconds,         rest for this exercise in this workout (empty → the exercise's own, then your default)
       targetReps,                 from the template, e.g. "8–10" (a hint while logging)
       supersetId,                 exercises sharing a supersetId are done back to back
       sets: [{ id, type, weightKg, reps, rpe, rir, durationSec, distanceKm, done, note }]
     }]
   }

   Sets only store the values you entered, which keeps workouts small enough to
   sync as a single row of your Google Sheet. The timer is never "counted":
   durations come from the stored times, so they stay right when the phone
   locks or the app closes. */
import { db, stamp } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit } from '../../core/events.js';
import { uid } from '../../core/ids.js';
import { defaultTitle, groupsLabel } from './muscles.js';

export const SET_TYPES = {
  normal: { label: 'Working set', mark: null },
  warmup: { label: 'Warm-up', mark: 'W' },
  drop: { label: 'Drop set', mark: 'D' },
  failure: { label: 'Failure', mark: 'F' },
};

export const shortId = () => uid().replace(/-/g, '').slice(0, 10);

/** An ISO time just after `prev`, so saves always move forward even within one millisecond. */
function laterThan(prev) {
  const t = Math.max(Date.now(), (Date.parse(prev) || 0) + 1);
  return new Date(t).toISOString();
}

/* ---------- Building workouts ---------- */

/** Store a value on a set, or remove it when empty. */
export function setField(set, key, value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(value)) delete set[key];
  else set[key] = value;
}

export function makeSet(values = {}) {
  const set = { id: shortId(), type: 'normal', done: false };
  Object.entries(values).forEach(([key, value]) => { if (key !== 'id') setField(set, key, value); });
  return set;
}

export const hasValues = (set) => ['weightKg', 'reps', 'durationSec', 'distanceKm'].some((key) => set[key] != null);

/**
 * A new exercise entry for a workout. Copies the shape of your last session
 * (number of sets and warm-ups) when there is one.
 */
export function makeEntry(exercise, { previous = null, sets = null, restSeconds = null, supersetId = null } = {}) {
  const lastSets = previous?.entry?.sets?.filter((s) => s.done) ?? [];
  let types;
  if (sets) types = Array.from({ length: sets }, () => 'normal');
  else if (lastSets.length) types = lastSets.slice(0, 8).map((s) => (SET_TYPES[s.type] ? s.type : 'normal'));
  else types = Array.from({ length: exercise.kind === 'weight' || !exercise.kind ? 3 : 1 }, () => 'normal');
  const entry = { id: shortId(), exerciseId: exercise.id, name: exercise.name, sets: types.map((type) => makeSet({ type })) };
  if (restSeconds != null) entry.restSeconds = restSeconds;
  if (supersetId) entry.supersetId = supersetId;
  return entry;
}

export function newWorkout({ groups = [], title = null, templateId = null, exercises = [], startedAt = new Date().toISOString() } = {}) {
  return stamp({
    title: title || defaultTitle(groups),
    muscleGroups: [...groups],
    type: groupsLabel(groups),
    startedAt,
    endedAt: null,
    pausedMs: 0,
    pausedAt: null,
    templateId,
    notes: '',
    source: 'app',
    exercises,
  }, startedAt);
}

/** Records from older versions (and imports) get every field a workout screen expects. */
export function normalizeWorkout(w) {
  const groups = Array.isArray(w.muscleGroups) ? w.muscleGroups : [];
  return {
    ...w,
    muscleGroups: groups,
    title: w.title || (w.type ? `${w.type} day` : 'Workout'),
    type: w.type || groupsLabel(groups),
    pausedMs: Number(w.pausedMs) || 0,
    pausedAt: w.pausedAt ?? null,
    notes: w.notes ?? '',
    exercises: Array.isArray(w.exercises)
      ? w.exercises.map((e) => ({ ...e, sets: Array.isArray(e.sets) ? e.sets : [] }))
      : [],
  };
}

/* ---------- Loading & saving ---------- */

export const isActive = (w) => Boolean(w) && !w.endedAt && !w.deletedAt;

/** Every workout that isn't deleted, newest first. */
export async function loadWorkouts() {
  const all = await db.live('workouts');
  return all.map(normalizeWorkout).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

/** The workout in progress (the most recently started one, if several). */
export async function loadActiveWorkout() {
  return (await loadWorkouts()).find(isActive) ?? null;
}

export async function loadWorkout(id) {
  const w = await db.get('workouts', id);
  return w && !w.deletedAt ? normalizeWorkout(w) : null;
}

let saveQueue = Promise.resolve();

/**
 * Save a workout (autosave after every change). Saves run in order, so the
 * last change always wins. quiet: a small change during a workout — sync
 * waits a bit longer before sending it.
 */
export function saveWorkout(workout, { quiet = false } = {}) {
  workout.updatedAt = laterThan(workout.updatedAt);
  if (!workout.createdAt) workout.createdAt = workout.updatedAt;
  const snapshot = structuredClone(workout);
  const run = saveQueue.then(() => saveRecord('workouts', snapshot, { quiet }));
  saveQueue = run.catch(() => {});
  return run;
}

/** Let the dashboard and screens know that workouts changed. */
export const workoutsChanged = (reason = 'workout') => emit('data', { reason });

/* ---------- Timer ---------- */

/** Time spent working out (pauses excluded), in ms. */
export function workoutDuration(w, now = Date.now()) {
  const start = Date.parse(w.startedAt);
  if (!Number.isFinite(start)) return 0;
  const end = w.endedAt ? Date.parse(w.endedAt) : w.pausedAt ? Date.parse(w.pausedAt) : now;
  return Math.max(0, end - start - (Number(w.pausedMs) || 0));
}

export function pauseWorkout(w, at = new Date()) {
  if (w.pausedAt || w.endedAt) return;
  w.pausedAt = at.toISOString();
}

export function resumeWorkout(w, at = new Date()) {
  if (!w.pausedAt) return;
  w.pausedMs = (Number(w.pausedMs) || 0) + Math.max(0, at - Date.parse(w.pausedAt));
  w.pausedAt = null;
}

/* ---------- Finishing ---------- */

/** What finishing will do: sets with values but no tick count as done; empty ones are dropped. */
export function finishSummary(w) {
  let done = 0;
  let autoComplete = 0;
  let empty = 0;
  w.exercises.forEach((e) => e.sets.forEach((s) => {
    if (s.done) done++;
    else if (hasValues(s)) autoComplete++;
    else empty++;
  }));
  return { done, autoComplete, empty };
}

/** Sets with values count as done; empty sets (and then empty exercises without notes) are removed. */
export function tidySets(w) {
  w.exercises = w.exercises.filter((e) => {
    e.sets = e.sets.filter((s) => {
      if (!s.done && hasValues(s)) s.done = true;
      return s.done;
    });
    return e.sets.length > 0 || Boolean(e.notes);
  });
}

export function finishWorkout(w, at = new Date()) {
  resumeWorkout(w, at);
  w.endedAt = at.toISOString();
  tidySets(w);
}

/* ---------- Numbers ---------- */

export const setVolume = (s) => (s.done && s.weightKg > 0 && s.reps > 0 ? s.weightKg * s.reps : 0);

export function entryStats(entry) {
  const done = entry.sets.filter((s) => s.done);
  return {
    sets: done.length,
    reps: done.reduce((sum, s) => sum + (s.reps || 0), 0),
    volume: done.reduce((sum, s) => sum + setVolume(s), 0),
  };
}

/** Totals for a workout: completed sets, reps, volume (kg × reps) and exercises. */
export function workoutStats(w, now = Date.now()) {
  let exercises = 0;
  let sets = 0;
  let reps = 0;
  let volume = 0;
  let planned = 0;
  for (const e of w.exercises) {
    const s = entryStats(e);
    planned += e.sets.length;
    if (s.sets) exercises++;
    sets += s.sets;
    reps += s.reps;
    volume += s.volume;
  }
  return { exercises, sets, reps, volume, planned, duration: workoutDuration(w, now) };
}

/** For each exercise, the last finished workout that included it: Map(exerciseId → { workout, entry }). */
export function lastPerformances(workouts, { excludeId = null, before = null } = {}) {
  const map = new Map();
  for (const w of workouts) {
    if (w.id === excludeId || !w.endedAt || (before && w.startedAt >= before)) continue;
    for (const e of w.exercises) {
      if (!map.has(e.exerciseId) && e.sets.some((s) => s.done)) map.set(e.exerciseId, { workout: w, entry: e });
    }
  }
  return map;
}

/** The heaviest completed set (or longest, for timed and cardio exercises). */
export function bestSet(entry) {
  let best = null;
  const score = (s) => [s.weightKg ?? -1, s.reps ?? 0, s.distanceKm ?? 0, s.durationSec ?? 0];
  for (const s of entry.sets) {
    if (!s.done || s.type === 'warmup') continue;
    if (!best) { best = s; continue; }
    const a = score(s);
    const b = score(best);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        if (a[i] > b[i]) best = s;
        break;
      }
    }
  }
  return best ?? entry.sets.find((s) => s.done) ?? null;
}

/* ---------- Formatting ---------- */

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** 70 → "70", 72.5 → "72.5", 21.25 → "21.25" (in your region's number style) */
export const formatNumber = (n) => (n == null || !Number.isFinite(Number(n)) ? '' : numberFormat.format(Math.round(n * 100) / 100));

export function formatVolume(kg) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(kg))} kg`;
}

/** Seconds as a clock: 90 → "1:30", 3725 → "1:02:05" */
export function formatSeconds(total) {
  const s = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Rest times: 45 → "45 s", 90 → "1:30", 120 → "2 min" */
export function formatRest(sec) {
  if (!sec) return 'Off';
  if (sec < 60) return `${sec} s`;
  return sec % 60 ? formatSeconds(sec) : `${sec / 60} min`;
}

/** "70 kg × 8", "× 12", "1:00", "5 km · 30:00" */
export function describeSet(set, kind = 'weight') {
  if (!set) return '';
  if (kind === 'duration' || (kind === 'weight' && set.durationSec && set.reps == null && set.weightKg == null)) {
    const time = set.durationSec ? formatSeconds(set.durationSec) : '';
    return set.weightKg ? `${formatNumber(set.weightKg)} kg · ${time}` : time;
  }
  if (kind === 'cardio') {
    return [set.distanceKm ? `${formatNumber(set.distanceKm)} km` : '', set.durationSec ? formatSeconds(set.durationSec) : ''].filter(Boolean).join(' · ');
  }
  const kg = set.weightKg != null ? `${formatNumber(set.weightKg)} kg` : '';
  const reps = set.reps != null ? `${set.reps}` : '';
  if (kg && reps) return `${kg} × ${reps}`;
  return kg || (reps ? `× ${reps}` : '');
}

/** Effort as shown in lists: "2 RIR" or "RPE 8.5". */
export function describeEffort(set) {
  if (set.rir != null) return `${formatNumber(set.rir)} RIR`;
  if (set.rpe != null) return `RPE ${formatNumber(set.rpe)}`;
  return '';
}

/* ---------- Reading what you type ---------- */

/** "72,5" or "72.5" → 72.5; "" → null; nonsense → NaN */
export function parseNumber(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * "1:30" → 90 s. "1.30" and "1,30" work too (the iPhone number pad has no ":").
 * A plain number is seconds, or minutes when unit is 'min'.
 */
export function parseClock(text, unit = 'sec') {
  const t = String(text ?? '').trim().replace(/[.,]/g, ':');
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':').map(Number);
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN;
    return Math.round(parts.reduce((total, p) => total * 60 + p, 0));
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(unit === 'min' ? n * 60 : n);
}

/* ---------- Supersets ---------- */

/** Letters for supersets in the order they appear: Map(supersetId → 'A'). */
export function supersetLetters(w) {
  const letters = new Map();
  w.exercises.forEach((e) => {
    if (e.supersetId && !letters.has(e.supersetId)) letters.set(e.supersetId, String.fromCharCode(65 + letters.size));
  });
  return letters;
}

/**
 * Supersets must be exercises next to each other: after moving things around,
 * only the first unbroken run of each superset stays in it, and a "superset"
 * of one exercise is dissolved.
 */
export function tidySupersets(w) {
  const closed = new Set();
  let prev = null;
  w.exercises.forEach((e) => {
    if (prev && prev !== e.supersetId) closed.add(prev);
    if (e.supersetId && closed.has(e.supersetId)) delete e.supersetId;
    prev = e.supersetId ?? null;
  });
  const counts = new Map();
  w.exercises.forEach((e) => { if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) ?? 0) + 1); });
  w.exercises.forEach((e) => { if (e.supersetId && counts.get(e.supersetId) < 2) delete e.supersetId; });
}

/** Is this the last exercise of its superset (where the rest timer starts)? */
export function endsSuperset(w, entry) {
  if (!entry.supersetId) return true;
  const group = w.exercises.filter((e) => e.supersetId === entry.supersetId);
  return group[group.length - 1] === entry;
}
