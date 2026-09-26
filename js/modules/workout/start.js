/* Starting a workout:
     1. confirm ("Start workout?") — the timer starts from this moment
     2. choose what you're training (muscle groups), or pick a template
     3. choose exercises (the list is filtered to fit your choice)
   The user always makes the final choice; the split only suggests a day. */
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { state } from '../../core/state.js';
import { openPage } from '../../core/router.js';
import { unlockAudio } from '../../core/feedback.js';
import { GROUP_NAMES, SPLITS, defaultTitle, groupsLabel, suggestNext } from './muscles.js';
import { loadLibrary } from './library.js';
import {
  lastPerformances, loadWorkouts, makeEntry, newWorkout, saveWorkout, shortId, workoutsChanged,
} from './model.js';
import { getActiveWorkout, loadTemplates, setActiveWorkout } from './store.js';
import { pickExercises } from './picker.js';

/** What to suggest training today, from your split and recent workouts. */
export async function suggestion(workouts) {
  const split = SPLITS[state.settings.workout.split] ?? SPLITS.ppl;
  const finished = (workouts ?? await loadWorkouts()).filter((w) => w.endedAt);
  return suggestNext(split, finished);
}

/** Exercise entries for a new workout from a template (or a past workout to repeat). */
function entriesFrom(items, library, previous) {
  const supersets = new Map();
  return items.map((item) => {
    const exercise = library.get(item.exerciseId) ?? { id: item.exerciseId, name: item.name, kind: 'weight' };
    const entry = makeEntry(exercise, {
      previous: previous.get(exercise.id),
      sets: item.sets ?? null,
      restSeconds: item.restSeconds ?? null,
    });
    if (item.reps) entry.targetReps = String(item.reps);
    if (item.supersetId) {
      if (!supersets.has(item.supersetId)) supersets.set(item.supersetId, shortId());
      entry.supersetId = supersets.get(item.supersetId);
    }
    return entry;
  });
}

/** If a workout is already going, offer to open it instead. Returns true when one is. */
async function alreadyActive() {
  const active = await getActiveWorkout();
  if (!active) return false;
  const choice = await openDialog({
    variant: 'alert',
    title: 'A workout is in progress',
    body: html`<p class="dlg__msg">Finish or discard “${active.title}” before starting another.</p>`,
    actions: [
      { label: 'Cancel', value: 'cancel', variant: 'ghost' },
      { label: 'Open it', value: 'open', variant: 'primary', autofocus: true },
    ],
  });
  if (choice === 'open') openPage('workout', 'log');
  return true;
}

/**
 * Start a workout (after confirmation).
 *   template     start from a template
 *   repeat       start with the same exercises as a past workout
 */
export async function startWorkout({ template = null, repeat = null } = {}) {
  if (await alreadyActive()) return null;
  const source = template ?? repeat;
  const ok = await confirmDialog({
    title: 'Start workout?',
    message: source
      ? `Start “${template ? template.name : repeat.title}” now? The timer starts right away and keeps running if your phone locks.`
      : 'The timer starts right away and keeps running if your phone locks.',
    confirmLabel: 'Start Workout',
  });
  if (!ok) return null;
  unlockAudio(); // lets the rest timer chime later

  const [library, workouts] = await Promise.all([loadLibrary(), loadWorkouts()]);
  const previous = lastPerformances(workouts);
  let workout;
  if (template) {
    workout = newWorkout({ groups: template.muscleGroups, title: template.name, templateId: template.id, exercises: entriesFrom(template.exercises, library, previous) });
  } else if (repeat) {
    const items = repeat.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets.filter((s) => s.done).length || e.sets.length, restSeconds: e.restSeconds, supersetId: e.supersetId }));
    workout = newWorkout({ groups: repeat.muscleGroups, title: repeat.title, templateId: repeat.templateId, exercises: entriesFrom(items, library, previous) });
  } else {
    workout = newWorkout();
  }

  try {
    await saveWorkout(workout);
  } catch (err) {
    console.error(err);
    toast('Couldn’t start the workout. Please try again.', { icon: 'info' });
    return null;
  }
  setActiveWorkout(workout);
  workoutsChanged('workout-start');
  openPage('workout', 'log');
  if (!source) setTimeout(() => chooseFocus(workout, { workouts, first: true }), 450);
  return workout;
}

/**
 * The muscle-group picker (several can be chosen). When templates are passed,
 * they're offered too. Resolves with { groups }, { template }, 'skip' or null.
 */
export function groupsDialog({ title = 'What are you training?', note = '', selected = [], suggested = null, templates = [], confirmLabel = 'Save', cancelLabel = 'Cancel' } = {}) {
  const picked = new Set(selected);
  return openDialog({
    variant: 'sheet',
    className: 'focus-dialog',
    title,
    body: html`${note ? html`<p class="dlg__msg">${note}</p>` : ''}
      <div class="focus-grid" role="group" aria-label="Muscle groups">
        ${GROUP_NAMES.map((g) => html`<button type="button" class="focus-chip${picked.has(g) ? ' is-on' : ''}" data-group="${g}" aria-pressed="${picked.has(g)}">
          <span>${g}</span>${g === suggested ? html`<span class="focus-chip__hint">Suggested</span>` : ''}
        </button>`)}
      </div>
      ${templates.length ? html`<div class="focus-templates">
        <p class="focus-templates__title">Or start from a template</p>
        ${templates.map((t) => html`<button type="button" class="row row--icon accent-workout focus-template" data-template="${t.id}">
          <span class="row__icon">${icon('clipboard')}</span>
          <span class="row__text"><span class="row__label">${t.name}</span><span class="row__sub">${t.exercises.length} exercise${t.exercises.length === 1 ? '' : 's'}${t.muscleGroups.length ? ` · ${groupsLabel(t.muscleGroups)}` : ''}</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>`)}
      </div>` : ''}
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="skip">${cancelLabel}</button>
        <button type="button" class="btn btn--primary" data-continue${picked.size ? '' : raw(' disabled')}>${confirmLabel}</button>
      </div>`,
    onOpen(dlg, close) {
      const continueBtn = dlg.querySelector('[data-continue]');
      dlg.querySelector('.focus-grid').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-group]');
        if (!chip) return;
        const g = chip.dataset.group;
        if (picked.has(g)) picked.delete(g);
        else picked.add(g);
        chip.classList.toggle('is-on', picked.has(g));
        chip.setAttribute('aria-pressed', String(picked.has(g)));
        continueBtn.disabled = picked.size === 0;
      });
      continueBtn.addEventListener('click', () => close({ groups: GROUP_NAMES.filter((g) => picked.has(g)) }));
      dlg.querySelector('.focus-templates')?.addEventListener('click', (event) => {
        const row = event.target.closest('[data-template]');
        if (row) close({ template: templates.find((t) => t.id === row.dataset.template) });
      });
    },
  });
}

/**
 * "What are you training?" for a workout — muscle groups, or (right after
 * starting) a template. first: straight after starting, so exercises come next.
 * active: false when editing a finished workout.
 */
export async function chooseFocus(workout, { workouts = null, first = false, active = true } = {}) {
  const [suggested, templates] = await Promise.all([suggestion(workouts), first ? loadTemplates() : []]);
  const result = await groupsDialog({
    note: first ? 'Pick one or more — exercises that fit come next.' : 'Pick one or more.',
    selected: workout.muscleGroups,
    suggested,
    templates,
    confirmLabel: first ? 'Continue' : 'Save',
    cancelLabel: first ? 'Skip' : 'Cancel',
  });

  if (result?.template) {
    await applyTemplate(workout, result.template);
    return true;
  }
  if (result?.groups) {
    const wasDefault = workout.title === defaultTitle(workout.muscleGroups);
    workout.muscleGroups = result.groups;
    workout.type = groupsLabel(result.groups);
    if (wasDefault) workout.title = defaultTitle(result.groups);
    await saveWorkout(workout, { quiet: active });
    if (active) setActiveWorkout(workout);
    if (first) await addExercises(workout);
    return true;
  }
  if (first && result === 'skip') await addExercises(workout);
  return false;
}

/** Fill a just-started, still empty workout from a template. */
async function applyTemplate(workout, template) {
  const [library, workouts] = await Promise.all([loadLibrary(), loadWorkouts()]);
  const entries = entriesFrom(template.exercises, library, lastPerformances(workouts, { excludeId: workout.id }));
  workout.exercises.push(...entries);
  workout.muscleGroups = [...template.muscleGroups];
  workout.type = groupsLabel(template.muscleGroups);
  workout.title = template.name;
  workout.templateId = template.id;
  await saveWorkout(workout, { quiet: true });
  setActiveWorkout(workout);
}

/** Pick exercises and add them to the workout. Returns the number added. */
export async function addExercises(workout, { mode = 'active' } = {}) {
  const picked = await pickExercises({ groups: workout.muscleGroups, exclude: workout.exercises.map((e) => e.exerciseId) });
  if (!picked) return 0;
  const workouts = await loadWorkouts();
  const previous = lastPerformances(workouts, { excludeId: workout.id, before: mode === 'edit' ? workout.startedAt : null });
  picked.forEach((exercise) => workout.exercises.push(makeEntry(exercise, { previous: previous.get(exercise.id) })));
  await saveWorkout(workout, { quiet: mode === 'active' });
  if (mode === 'active') setActiveWorkout(workout);
  return picked.length;
}
