/* Workout templates: the list on the Workout screen and the editor
   (#/workout/template/<id>): name, muscle groups, exercises in order, and for
   each exercise its sets, target reps and rest time. Changes save as you go. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { state } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { actionSheet, announce, confirmDialog, promptDialog, toast } from '../../core/ui.js';
import { openPage, replacePage } from '../../core/router.js';
import { makeReorderable } from '../../core/reorder.js';
import { groupsLabel } from './muscles.js';
import { loadLibrary } from './library.js';
import { formatRest, loadWorkout, parseClock, shortId, workoutsChanged } from './model.js';
import { addStarterTemplates, createTemplate, loadTemplate, saveTemplate, templateEntry, templateFromWorkout } from './store.js';
import { groupsDialog, startWorkout } from './start.js';
import { pickExercises } from './picker.js';

const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
let view = null;
let tpl = null;
let library = null;
let typingTimer = null;

/* ---------- On the Workout screen ---------- */

export function templateCards(templates) {
  if (!templates.length) {
    return html`<div class="card tpl-empty">
      <p class="tpl-empty__text">${icon('clipboard')}<span>Templates are workouts you repeat — like Push Day — so you can start one with a tap.</span></p>
      <div class="tpl-empty__actions">
        <button type="button" class="btn btn--sm" data-action="tpl:starter">${icon('sparkles')}Add Push, Pull &amp; Leg Day</button>
        <button type="button" class="btn btn--sm btn--ghost" data-action="tpl:new">${icon('plus')}Create your own</button>
      </div>
    </div>`;
  }
  return html`<ul class="tpl-grid">${templates.map((t) => html`<li class="card tpl-card">
    <a class="tpl-card__main" href="#/workout/template/${t.id}" data-action="nav" data-route="workout" data-sub="template/${t.id}">
      <span class="tpl-card__name">${t.name}</span>
      <span class="tpl-card__meta">${t.exercises.length} exercise${t.exercises.length === 1 ? '' : 's'}${t.muscleGroups.length ? ` · ${groupsLabel(t.muscleGroups)}` : ''}</span>
      <span class="tpl-card__list">${t.exercises.slice(0, 4).map((e) => e.name).join(', ')}${t.exercises.length > 4 ? '…' : ''}</span>
    </a>
    <button type="button" class="btn btn--sm btn--accent tpl-card__start" data-action="tpl:start" data-id="${t.id}" aria-label="Start ${t.name}">${icon('play')}Start</button>
  </li>`)}</ul>`;
}

registerAction('tpl:starter', async () => {
  const added = await addStarterTemplates();
  workoutsChanged('templates');
  toast(added.length ? 'Added Push, Pull and Leg Day. Tap one to change it.' : 'You already have these templates.', { icon: 'clipboard' });
});

registerAction('tpl:new', async () => {
  const template = await createTemplate();
  openPage('workout', `template/${template.id}`);
});

registerAction('tpl:start', async (el) => {
  const template = await loadTemplate(el.dataset.id ?? tpl?.id);
  if (!template) return;
  if (!template.exercises.length) {
    toast('Add some exercises to this template first.', { icon: 'info' });
    return;
  }
  await startWorkout({ template });
});

/** "Save as template" for a workout. */
export async function saveWorkoutAsTemplate(workoutId) {
  const workout = await loadWorkout(workoutId);
  if (!workout) return;
  const name = await promptDialog({ title: 'Save as template', label: 'Template name', value: workout.title, confirmLabel: 'Save', maxLength: 60, required: true });
  if (!name) return;
  const template = await createTemplate(templateFromWorkout(workout, name));
  workoutsChanged('templates');
  toast(`Template “${name}” saved.`, {
    icon: 'clipboard',
    action: { label: 'View', onClick: () => openPage('workout', `template/${template.id}`) },
  });
}

/* ---------- Editor ---------- */

export const templatePage = {
  async show(el, { id }) {
    view = el;
    [tpl, library] = await Promise.all([loadTemplate(id), loadLibrary()]);
    render();
  },
  hide() {
    if (typingTimer) save();
  },
};

function save() {
  clearTimeout(typingTimer);
  typingTimer = null;
  if (!tpl) return Promise.resolve();
  return saveTemplate(tpl).catch((err) => {
    console.error(err);
    toast('Couldn’t save the template. Please try again.', { icon: 'info' });
  });
}

function saveSoon() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(save, 600);
}

const restOf = (entry) => entry.restSeconds ?? library.get(entry.exerciseId)?.restSeconds ?? state.settings.workout.restSeconds;

function exerciseRow(entry, i, count) {
  const name = library.get(entry.exerciseId)?.name ?? entry.name;
  return html`<li class="tpl-ex${entry.supersetId ? ' is-superset' : ''}" data-id="${entry.id}">
    <span class="tpl-ex__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
    <div class="tpl-ex__main">
      <p class="tpl-ex__name">${name}${entry.supersetId ? html` <span class="tag tag--superset">${icon('link')}Superset</span>` : ''}</p>
      <div class="tpl-ex__controls">
        <div class="stepper stepper--sm" role="group" aria-label="Sets for ${name}">
          <button type="button" class="stepper__btn" data-action="tpl:sets" data-dir="-1" aria-label="Fewer sets"${entry.sets <= 1 ? raw(' disabled') : ''}>${icon('minus')}</button>
          <span class="stepper__value">${entry.sets} <small>sets</small></span>
          <button type="button" class="stepper__btn" data-action="tpl:sets" data-dir="1" aria-label="More sets"${entry.sets >= 20 ? raw(' disabled') : ''}>${icon('plus')}</button>
        </div>
        <label class="tpl-ex__reps"><span>Reps</span>
          <input class="input input--sm" data-tpl="reps" value="${entry.reps ?? ''}" placeholder="8–12" maxlength="12" autocomplete="off" inputmode="text" aria-label="Target reps for ${name}">
        </label>
        <button type="button" class="tag tag--btn" data-action="tpl:rest" aria-label="Rest between sets: ${formatRest(restOf(entry))}. Change">${icon('timer')}${formatRest(restOf(entry))}</button>
      </div>
    </div>
    <div class="tpl-ex__side">
      <button type="button" class="icon-btn" data-action="tpl:ex-menu" aria-label="Options for ${name}">${icon('more')}</button>
      <button type="button" class="sr-only sr-only-focusable" data-action="tpl:move" data-dir="-1"${i === 0 ? raw(' disabled') : ''}>Move ${name} up</button>
      <button type="button" class="sr-only sr-only-focusable" data-action="tpl:move" data-dir="1"${i === count - 1 ? raw(' disabled') : ''}>Move ${name} down</button>
    </div>
  </li>`;
}

function render() {
  if (!tpl) {
    setHTML(view, html`<div class="wk-page accent-workout">
      ${subHead({ title: 'Template not found', back: 'Workout', accent: 'workout' })}
      <div class="card empty">${icon('info')}<span>This template may have been deleted.</span></div>
    </div>`);
    return;
  }
  const count = tpl.exercises.length;
  setHTML(view, html`<div class="wk-page accent-workout">
    ${subHead({ title: tpl.name, back: 'Workout', accent: 'workout', eyebrow: 'Template',
      actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="tpl:start"${count ? '' : raw(' disabled')}>${icon('play')}Start</button>` })}
    <div class="form tpl-form">
      <label class="field"><span class="field__label">Name</span>
        <input class="input" data-tpl="name" value="${tpl.name}" maxlength="60" autocomplete="off" enterkeyhint="done"></label>
      <button type="button" class="row row--icon tpl-form__groups" data-action="tpl:groups">
        <span class="row__icon">${icon('target')}</span>
        <span class="row__text"><span class="row__label">Muscle groups</span><span class="row__sub">${tpl.muscleGroups.length ? groupsLabel(tpl.muscleGroups) : 'None chosen — used to filter exercises'}</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
      <label class="field"><span class="field__label">Notes</span>
        <textarea class="input textarea" data-tpl="notes" rows="2" maxlength="1000" placeholder="Optional">${tpl.notes ?? ''}</textarea></label>
    </div>

    <section class="section" aria-labelledby="tpl-ex-title">
      <div class="section__head"><h2 class="section__title" id="tpl-ex-title">Exercises</h2><span class="section__meta">${count ? 'Drag ≡ to reorder' : ''}</span></div>
      ${count
        ? html`<ol class="card tpl-list" data-tpl-list>${tpl.exercises.map((e, i) => exerciseRow(e, i, count))}</ol>`
        : html`<div class="card empty">${icon('layers')}<span>No exercises yet.</span></div>`}
      <button type="button" class="btn btn--block wl-add" data-action="tpl:add">${icon('plus')}Add exercises</button>
    </section>

    <div class="wl-foot">
      <button type="button" class="btn btn--accent btn--block" data-action="tpl:start"${count ? '' : raw(' disabled')}>${icon('play')}Start workout</button>
      <button type="button" class="btn btn--ghost btn--block wl-danger" data-action="tpl:delete">Delete template</button>
    </div>
  </div>`);

  const list = view.querySelector('[data-tpl-list]');
  if (list) {
    makeReorderable(list, {
      onReorder: (ids, item) => {
        tpl.exercises.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        save();
        announce(`Moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
        render();
      },
    });
  }
}

export function mountTemplateEditor(el) {
  el.addEventListener('input', (event) => {
    const field = event.target.dataset.tpl;
    if (!field || !tpl) return;
    if (field === 'reps') {
      const entry = tpl.exercises.find((e) => e.id === event.target.closest('[data-id]')?.dataset.id);
      if (entry) entry.reps = event.target.value.trim();
    } else if (field === 'name') {
      if (event.target.value.trim()) tpl.name = event.target.value.trim();
    } else if (field === 'notes') {
      tpl.notes = event.target.value;
    }
    saveSoon();
  });
  el.addEventListener('change', (event) => {
    if (event.target.dataset.tpl === 'name') {
      if (!event.target.value.trim()) event.target.value = tpl.name;
      save();
      const title = view.querySelector('.page-title');
      if (title) title.textContent = tpl.name;
    }
  });
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches?.('input[data-tpl]')) event.target.blur();
  });
}

const entryOf = (el) => tpl?.exercises.find((e) => e.id === el.closest('[data-id]')?.dataset.id);

registerAction('tpl:sets', (el) => {
  const entry = entryOf(el);
  if (!entry) return;
  entry.sets = Math.min(20, Math.max(1, entry.sets + Number(el.dataset.dir)));
  const row = el.closest('.stepper');
  row.querySelector('.stepper__value').firstChild.textContent = `${entry.sets} `;
  row.querySelector('[data-dir="-1"]').disabled = entry.sets <= 1;
  row.querySelector('[data-dir="1"]').disabled = entry.sets >= 20;
  announce(`${entry.sets} sets`);
  saveSoon();
});

registerAction('tpl:move', (el) => {
  const entry = entryOf(el);
  if (!entry) return;
  const i = tpl.exercises.indexOf(entry);
  const j = i + Number(el.dataset.dir);
  if (j < 0 || j >= tpl.exercises.length) return;
  [tpl.exercises[i], tpl.exercises[j]] = [tpl.exercises[j], tpl.exercises[i]];
  save();
  render();
  view.querySelector(`[data-id="${CSS.escape(entry.id)}"] [data-action="tpl:move"][data-dir="${el.dataset.dir}"]`)?.focus();
  announce(`Moved to position ${j + 1} of ${tpl.exercises.length}.`);
});

registerAction('tpl:rest', async (el) => {
  const entry = entryOf(el);
  if (!entry) return;
  const current = restOf(entry);
  const choice = await actionSheet({
    title: 'Rest between sets',
    message: library.get(entry.exerciseId)?.name ?? entry.name,
    items: [
      { value: 'default', label: `Exercise default (${formatRest(library.get(entry.exerciseId)?.restSeconds ?? state.settings.workout.restSeconds)})`, checked: entry.restSeconds == null },
      ...REST_CHOICES.map((sec) => ({ value: String(sec), label: formatRest(sec), checked: entry.restSeconds === sec })),
      { value: 'custom', label: 'Custom…' },
    ],
  });
  if (!choice || !tpl) return;
  if (choice === 'default') delete entry.restSeconds;
  else if (choice === 'custom') {
    const text = await promptDialog({ title: 'Rest time', label: 'Minutes:seconds, e.g. 1:45', value: current ? `${Math.floor(current / 60)}:${String(current % 60).padStart(2, '0')}` : '', maxLength: 6 });
    if (text === null) return;
    const secs = parseClock(text);
    if (!Number.isFinite(secs) || secs < 0 || secs > 900) {
      toast('Choose a rest time up to 15 minutes, like 1:45.', { icon: 'info' });
      return;
    }
    entry.restSeconds = secs;
  } else entry.restSeconds = Number(choice);
  save();
  render();
});

registerAction('tpl:ex-menu', async (el) => {
  const entry = entryOf(el);
  if (!entry) return;
  const list = tpl.exercises;
  const i = list.indexOf(entry);
  const name = library.get(entry.exerciseId)?.name ?? entry.name;
  const choice = await actionSheet({
    title: name,
    items: [
      { value: 'up', label: 'Move up', icon: 'arrowUp', disabled: i === 0 },
      { value: 'down', label: 'Move down', icon: 'arrowDown', disabled: i === list.length - 1 },
      entry.supersetId
        ? { value: 'unsuperset', label: 'Remove from superset', icon: 'link' }
        : i < list.length - 1 && { value: 'superset', label: 'Superset with next exercise', icon: 'link' },
      { value: 'replace', label: 'Replace exercise', icon: 'swap' },
      { value: 'info', label: 'Exercise details', icon: 'info' },
      { value: 'remove', label: 'Remove from template', icon: 'trash', destructive: true },
    ],
  });
  if (!choice || !tpl) return;
  if (choice === 'info') {
    openPage('workout', `exercise/${entry.exerciseId}`);
    return;
  }
  if (choice === 'up' || choice === 'down') {
    const j = choice === 'up' ? i - 1 : i + 1;
    [list[i], list[j]] = [list[j], list[i]];
  } else if (choice === 'superset') {
    const next = list[i + 1];
    const id = entry.supersetId ?? next.supersetId ?? shortId();
    entry.supersetId = id;
    next.supersetId = id;
  } else if (choice === 'unsuperset') {
    const others = list.filter((e) => e !== entry && e.supersetId === entry.supersetId);
    delete entry.supersetId;
    if (others.length === 1) delete others[0].supersetId;
  } else if (choice === 'replace') {
    const picked = await pickExercises({ groups: tpl.muscleGroups, multiple: false, title: `Replace ${name}` });
    if (!picked || !tpl) return;
    entry.exerciseId = picked[0].id;
    entry.name = picked[0].name;
  } else if (choice === 'remove') {
    list.splice(i, 1);
    save();
    render();
    toast(`${name} removed.`, { icon: 'trash', action: { label: 'Undo', onClick: () => { if (!tpl) return; list.splice(i, 0, entry); save(); render(); } } });
    return;
  }
  save();
  render();
});

registerAction('tpl:add', async () => {
  if (!tpl) return;
  const picked = await pickExercises({ groups: tpl.muscleGroups, exclude: tpl.exercises.map((e) => e.exerciseId) });
  if (!picked || !tpl) return;
  picked.forEach((exercise) => tpl.exercises.push(templateEntry(exercise, { sets: exercise.kind === 'weight' ? 3 : 1 })));
  await save();
  render();
});

registerAction('tpl:groups', async () => {
  if (!tpl) return;
  const result = await groupsDialog({ title: 'Muscle groups', note: 'Used to suggest exercises for this template.', selected: tpl.muscleGroups });
  if (!result?.groups || !tpl) return;
  tpl.muscleGroups = result.groups;
  save();
  render();
});

registerAction('tpl:delete', async () => {
  if (!tpl) return;
  const template = tpl;
  const ok = await confirmDialog({ title: `Delete “${template.name}”?`, message: 'Workouts you did with it are kept.', confirmLabel: 'Delete', destructive: true });
  if (!ok) return;
  template.deletedAt = new Date().toISOString();
  await saveTemplate(template);
  tpl = null;
  replacePage('');
  workoutsChanged('templates');
  toast('Template deleted.', {
    icon: 'trash',
    action: {
      label: 'Undo',
      onClick: async () => {
        template.deletedAt = null;
        await saveTemplate(template);
        workoutsChanged('templates');
      },
    },
  });
});
