/* The workout in progress (kept in memory while you log it) and workout templates.

   Templates:
   {
     id, createdAt, updatedAt, deletedAt,
     name: 'Push Day', notes, order, muscleGroups: ['Push'],
     exercises: [{ id, exerciseId, name, sets: 3, reps: '8–10', restSeconds, supersetId }]
   }
   reps is a target you type ("8", "8–12"); it shows as a hint while logging. */
import { db, stamp } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { on } from '../../core/events.js';
import { loadActiveWorkout, shortId } from './model.js';
import { BUILT_IN } from './library.js';

/* ---------- The workout in progress ---------- */

let active; // undefined = not loaded yet, null = no workout in progress
const activeListeners = new Set();

export async function getActiveWorkout({ fresh = false } = {}) {
  if (fresh || active === undefined) active = await loadActiveWorkout();
  return active;
}

/** Remember the workout in progress (or null) and tell whoever shows it. */
export function setActiveWorkout(workout) {
  active = workout;
  activeListeners.forEach((fn) => fn(active));
}

/** fn(workout|null) runs when a workout starts, changes state (pause, finish…) or ends. */
export function onActiveWorkout(fn) {
  activeListeners.add(fn);
  return () => activeListeners.delete(fn);
}

export const notifyActiveChanged = () => activeListeners.forEach((fn) => fn(active));

// Another device may have finished (or started) a workout; a restore may have changed everything
on('data', async ({ reason } = {}) => {
  if (!['sync', 'restore', 'sample-toggle', 'import'].includes(reason)) return;
  const fresh = await loadActiveWorkout();
  const changed = (fresh?.id ?? null) !== (active?.id ?? null) || (fresh && active && fresh.updatedAt > active.updatedAt);
  if (changed) setActiveWorkout(fresh);
});

/* ---------- Templates ---------- */

export async function loadTemplates() {
  const all = await db.live('templates');
  return all
    .map((t) => ({ ...t, exercises: Array.isArray(t.exercises) ? t.exercises : [], muscleGroups: t.muscleGroups ?? [] }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));
}

export async function loadTemplate(id) {
  const t = await db.get('templates', id);
  return t && !t.deletedAt ? { ...t, exercises: t.exercises ?? [], muscleGroups: t.muscleGroups ?? [] } : null;
}

let templateQueue = Promise.resolve();

/** Autosave a template; saves run in order so the last change wins. */
export function saveTemplate(template) {
  template.updatedAt = new Date(Math.max(Date.now(), (Date.parse(template.updatedAt) || 0) + 1)).toISOString();
  template.createdAt ??= template.updatedAt;
  template.deletedAt ??= null;
  const snapshot = structuredClone(template);
  const run = templateQueue.then(() => saveRecord('templates', snapshot));
  templateQueue = run.catch(() => {});
  return run;
}

export async function nextTemplateOrder() {
  const all = await db.all('templates');
  return all.reduce((max, t) => Math.max(max, t.order ?? 0), 0) + 1;
}

export async function createTemplate(fields = {}) {
  const template = stamp({
    name: 'New template',
    notes: '',
    muscleGroups: [],
    exercises: [],
    order: await nextTemplateOrder(),
    ...fields,
  });
  await saveRecord('templates', template);
  return template;
}

export function templateEntry(exercise, { sets = 3, reps = '', restSeconds = null } = {}) {
  const entry = { id: shortId(), exerciseId: exercise.id, name: exercise.name, sets, reps };
  if (restSeconds != null) entry.restSeconds = restSeconds;
  return entry;
}

/** Target reps from what was done: "8" or "6–8". */
function repsTarget(sets) {
  const reps = sets.map((s) => s.reps).filter((n) => n > 0);
  if (!reps.length) return '';
  const lo = Math.min(...reps);
  const hi = Math.max(...reps);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** A template with the same exercises as a workout (working sets count, reps as targets). */
export function templateFromWorkout(workout, name) {
  return {
    name: name || workout.title,
    notes: '',
    muscleGroups: [...(workout.muscleGroups ?? [])],
    exercises: workout.exercises.filter((e) => e.sets.length).map((e) => {
      const working = e.sets.filter((s) => s.type !== 'warmup' && (s.done || !workout.endedAt));
      const entry = { id: shortId(), exerciseId: e.exerciseId, name: e.name, sets: Math.max(1, working.length), reps: repsTarget(working) };
      if (e.restSeconds != null) entry.restSeconds = e.restSeconds;
      if (e.supersetId) entry.supersetId = e.supersetId;
      return entry;
    }),
  };
}

/* ---------- Starter templates (added only when you ask for them) ---------- */

const STARTERS = [
  { id: 'tpl-push', name: 'Push Day', muscleGroups: ['Push'], exercises: [
    ['Bench Press (Barbell)', 3, '6–8'], ['Incline Bench Press (Dumbbell)', 3, '8–10'], ['Seated Shoulder Press (Machine)', 3, '8–10'],
    ['Lateral Raise (Dumbbell)', 3, '12–15'], ['Triceps Rope Pushdown', 3, '10–12'],
  ] },
  { id: 'tpl-pull', name: 'Pull Day', muscleGroups: ['Pull'], exercises: [
    ['Lat Pulldown (Cable)', 3, '8–10'], ['Seated Cable Row - V Grip (Cable)', 3, '8–10'], ['Face Pull', 3, '12–15'],
    ['Bicep Curl (Dumbbell)', 3, '10–12'], ['Hammer Curl (Dumbbell)', 2, '10–12'],
  ] },
  { id: 'tpl-legs', name: 'Leg Day', muscleGroups: ['Legs'], exercises: [
    ['Squat (Barbell)', 3, '5–8'], ['Romanian Deadlift (Barbell)', 3, '8–10'], ['Leg Press (Machine)', 3, '10–12'],
    ['Seated Leg Curl (Machine)', 3, '10–12'], ['Standing Calf Raise (Machine)', 3, '12–15'],
  ] },
];

/** Add Push / Pull / Leg Day templates. Fixed ids, so doing this on two devices can't make duplicates. */
export async function addStarterTemplates() {
  const byName = new Map(BUILT_IN.map((e) => [e.name, e]));
  let order = await nextTemplateOrder();
  const saved = [];
  for (const starter of STARTERS) {
    const existing = await db.get('templates', starter.id);
    if (existing && !existing.deletedAt) continue;
    const template = stamp({
      ...(existing ?? {}),
      id: starter.id,
      name: starter.name,
      notes: '',
      muscleGroups: starter.muscleGroups,
      order: order++,
      exercises: starter.exercises.map(([name, sets, reps]) => templateEntry(byName.get(name), { sets, reps })),
      deletedAt: null,
    });
    await saveRecord('templates', template);
    saved.push(template);
  }
  return saved;
}
