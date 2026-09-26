/* Choosing exercises (for a workout or a template), and the form for creating
   or editing an exercise. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { openDialog, toast } from '../../core/ui.js';
import { state } from '../../core/state.js';
import { EQUIPMENT, KINDS, MUSCLES, fitsGroups, groupsLabel } from './muscles.js';
import { exerciseKey, exerciseMeta, loadLibrary, saveExercise, searchExercises } from './library.js';
import { formatRest } from './model.js';

const selected = (on) => (on ? raw(' selected') : '');
const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

/**
 * Pick exercises from the library.
 *   groups    the workout's muscle groups: the list starts filtered to fit them
 *   multiple  false = tap one to choose it
 * Resolves with the chosen exercises (in the order picked), or null.
 */
export async function pickExercises({ groups = [], multiple = true, title = 'Add exercises', confirmLabel = 'Add', exclude = [] } = {}) {
  let library = await loadLibrary();
  const chosen = new Map();
  const excluded = new Set(exclude);
  const fitsLabel = groups.length && !groups.includes('Full Body') ? `Fits ${groupsLabel(groups)}` : '';
  const filters = { q: '', muscle: fitsLabel ? 'fits' : 'all', equipment: 'all', favourites: false };

  return openDialog({
    variant: 'sheet',
    className: 'picker-dialog',
    title,
    body: html`<div class="picker">
      <label class="search-field">${icon('search')}<span class="sr-only">Search exercises</span>
        <input type="search" class="input" data-q placeholder="Search exercises" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      </label>
      <div class="picker__filters">
        <select class="select select--inline" data-muscle aria-label="Muscle">
          ${fitsLabel ? html`<option value="fits" selected>${fitsLabel}</option>` : ''}
          <option value="all"${selected(!fitsLabel)}>All muscles</option>
          ${MUSCLES.map((m) => html`<option value="${m}">${m}</option>`)}
        </select>
        <select class="select select--inline" data-equipment aria-label="Equipment">
          <option value="all">All equipment</option>
          ${EQUIPMENT.map((e) => html`<option value="${e}">${e}</option>`)}
        </select>
        <button type="button" class="chip-toggle" data-fav aria-pressed="false">${icon('star')}Favourites</button>
        <button type="button" class="chip-toggle" data-new>${icon('plus')}New exercise</button>
      </div>
      <ul class="picker__list" data-list></ul>
      <div class="picker__foot">
        <button type="button" class="btn btn--ghost" data-dialog-value="">Cancel</button>
        ${multiple ? html`<button type="button" class="btn btn--primary" data-done disabled>${confirmLabel}</button>` : ''}
      </div>
    </div>`,
    onOpen(dlg, close) {
      const list = dlg.querySelector('[data-list]');
      const done = dlg.querySelector('[data-done]');
      const search = dlg.querySelector('[data-q]');

      const visible = () => {
        let items = library.list.filter((e) => !excluded.has(e.id));
        if (filters.muscle === 'fits') items = items.filter((e) => fitsGroups(e, groups));
        else if (filters.muscle !== 'all') items = items.filter((e) => e.primary === filters.muscle || e.secondary.includes(filters.muscle));
        if (filters.equipment !== 'all') items = items.filter((e) => e.equipment === filters.equipment);
        if (filters.favourites) items = items.filter((e) => e.favorite);
        if (filters.q) return searchExercises(items, filters.q);
        return [...items.filter((e) => e.favorite), ...items.filter((e) => !e.favorite)];
      };

      const render = () => {
        const items = visible();
        setHTML(list, items.length
          ? items.map((e) => html`<li><button type="button" class="pick-item${chosen.has(e.id) ? ' is-chosen' : ''}" data-id="${e.id}"${multiple ? raw(` aria-pressed="${chosen.has(e.id)}"`) : ''}>
              ${multiple ? html`<span class="pick-item__check" aria-hidden="true">${icon('check')}</span>` : ''}
              <span class="pick-item__text"><span class="pick-item__name">${e.name}</span><span class="pick-item__meta">${exerciseMeta(e)}${e.custom ? ' · Custom' : ''}</span></span>
              ${e.favorite ? html`<span class="pick-item__star" title="Favourite">${icon('starFill')}<span class="sr-only">Favourite</span></span>` : ''}
            </button></li>`)
          : html`<li class="picker__empty">No exercises match.${filters.muscle === 'fits' ? ' Try “All muscles”.' : ''} You can also create a new one.</li>`);
        if (done) {
          done.disabled = chosen.size === 0;
          done.textContent = chosen.size ? `${confirmLabel} (${chosen.size})` : confirmLabel;
        }
      };

      list.addEventListener('click', (event) => {
        const item = event.target.closest('.pick-item');
        if (!item) return;
        const exercise = library.get(item.dataset.id);
        if (!multiple) {
          close([exercise]);
          return;
        }
        if (chosen.has(exercise.id)) chosen.delete(exercise.id);
        else chosen.set(exercise.id, exercise);
        item.classList.toggle('is-chosen', chosen.has(exercise.id));
        item.setAttribute('aria-pressed', String(chosen.has(exercise.id)));
        done.disabled = chosen.size === 0;
        done.textContent = chosen.size ? `${confirmLabel} (${chosen.size})` : confirmLabel;
      });
      search.addEventListener('input', () => { filters.q = search.value.trim(); render(); });
      search.addEventListener('keydown', (event) => { if (event.key === 'Enter') search.blur(); });
      dlg.querySelector('[data-muscle]').addEventListener('change', (event) => { filters.muscle = event.target.value; render(); });
      dlg.querySelector('[data-equipment]').addEventListener('change', (event) => { filters.equipment = event.target.value; render(); });
      dlg.querySelector('[data-fav]').addEventListener('click', (event) => {
        filters.favourites = !filters.favourites;
        event.currentTarget.setAttribute('aria-pressed', String(filters.favourites));
        render();
      });
      done?.addEventListener('click', () => close([...chosen.values()]));
      dlg.querySelector('[data-new]').addEventListener('click', async () => {
        const primary = filters.muscle !== 'all' && filters.muscle !== 'fits' ? filters.muscle : null;
        const created = await editExercise(null, { name: filters.q, primary });
        if (!created) return;
        library = await loadLibrary();
        const exercise = library.get(created.id);
        if (!multiple) {
          close([exercise]);
          return;
        }
        chosen.set(exercise.id, exercise);
        filters.q = '';
        search.value = '';
        filters.muscle = 'all';
        dlg.querySelector('[data-muscle]').value = 'all';
        render();
      });
      render();
    },
  }).then((result) => (Array.isArray(result) && result.length ? result : null));
}

/**
 * Create a custom exercise (exercise = null) or edit one. Built-in exercises
 * keep your changes separately, so they can always be told apart.
 * Resolves with the saved record, or null if cancelled.
 */
export async function editExercise(exercise, { name = '', primary = null } = {}) {
  const library = await loadLibrary();
  const isNew = !exercise;
  const e = exercise ?? { name, primary: primary ?? 'Chest', secondary: [], equipment: 'Barbell', kind: 'weight', notes: '', instructions: '', videoUrl: '', restSeconds: null };
  const defaultRest = state.settings.workout.restSeconds;

  return openDialog({
    variant: 'sheet',
    className: 'form-sheet',
    title: isNew ? 'New exercise' : 'Edit exercise',
    body: html`<form class="form" novalidate data-form>
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="name" value="${e.name}" maxlength="80" required autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="e.g. Incline Hammer Press">
      </label>
      <div class="field-row">
        <label class="field"><span class="field__label">Main muscle</span>
          <select class="select" name="primary">${MUSCLES.map((m) => html`<option value="${m}"${selected(m === e.primary)}>${m}</option>`)}</select>
        </label>
        <label class="field"><span class="field__label">Equipment</span>
          <select class="select" name="equipment">${EQUIPMENT.map((q) => html`<option value="${q}"${selected(q === e.equipment)}>${q}</option>`)}</select>
        </label>
      </div>
      <fieldset class="field">
        <legend class="field__label">Other muscles worked</legend>
        <div class="chips chips--sm">${MUSCLES.filter((m) => m !== 'Other').map((m) => html`<label class="chip-opt"><input type="checkbox" name="secondary" value="${m}"${e.secondary?.includes(m) ? raw(' checked') : ''}><span>${m}</span></label>`)}</div>
      </fieldset>
      ${e.builtIn ? '' : html`<fieldset class="field">
        <legend class="field__label">Logged as</legend>
        <div class="segmented">${Object.entries(KINDS).map(([value, label]) => html`<label class="segmented__opt"><input type="radio" name="kind" value="${value}"${(e.kind ?? 'weight') === value ? raw(' checked') : ''}><span>${label}</span></label>`)}</div>
      </fieldset>`}
      <label class="field"><span class="field__label">Rest timer</span>
        <select class="select" name="rest">
          <option value=""${selected(e.restSeconds == null)}>Your default (${formatRest(defaultRest)})</option>
          ${REST_CHOICES.map((sec) => html`<option value="${sec}"${selected(e.restSeconds === sec)}>${formatRest(sec)}</option>`)}
          ${e.restSeconds != null && !REST_CHOICES.includes(e.restSeconds) ? html`<option value="${e.restSeconds}" selected>${formatRest(e.restSeconds)}</option>` : ''}
        </select>
      </label>
      <label class="field"><span class="field__label">Notes</span>
        <textarea class="input textarea" name="notes" rows="2" maxlength="1000" placeholder="Seat height, grip, cues…">${e.notes ?? ''}</textarea>
      </label>
      <label class="field"><span class="field__label">How to do it</span>
        <textarea class="input textarea" name="instructions" rows="3" maxlength="2000" placeholder="Step-by-step instructions">${e.instructions ?? ''}</textarea>
      </label>
      <label class="field"><span class="field__label">Video or picture link</span>
        <input class="input" name="videoUrl" type="url" inputmode="url" value="${e.videoUrl ?? ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…">
      </label>
      <p class="form-error" data-error role="alert" hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="">Cancel</button>
        <button type="submit" class="btn btn--primary">${isNew ? 'Create' : 'Save'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const error = dlg.querySelector('[data-error]');
      if (isNew) setTimeout(() => form.elements.name.focus(), 350);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const f = form.elements;
        const cleanName = f.name.value.trim().replace(/\s+/g, ' ');
        const fail = (message) => {
          error.textContent = message;
          error.hidden = false;
        };
        if (!cleanName) return fail('Please give the exercise a name.');
        const clash = library.list.find((x) => x.id !== e.id && exerciseKey(x.name) === exerciseKey(cleanName));
        if (clash) return fail(`You already have “${clash.name}”.`);
        const url = f.videoUrl.value.trim();
        if (url && !/^https?:\/\/\S+$/i.test(url)) return fail('The link should start with https://');
        const patch = {
          name: cleanName,
          primary: f.primary.value,
          equipment: f.equipment.value,
          secondary: [...form.querySelectorAll('input[name="secondary"]:checked')].map((x) => x.value).filter((m) => m !== f.primary.value),
          restSeconds: f.rest.value === '' ? null : Number(f.rest.value),
          notes: f.notes.value.trim(),
          instructions: f.instructions.value.trim(),
          videoUrl: url,
        };
        if (!e.builtIn) patch.kind = form.querySelector('input[name="kind"]:checked')?.value ?? 'weight';
        try {
          const saved = await saveExercise(exercise, patch);
          close(saved);
          toast(isNew ? `“${cleanName}” added to your exercises.` : 'Exercise saved.', { icon: 'check' });
        } catch (err) {
          console.error(err);
          fail('Couldn’t save the exercise. Please try again.');
        }
      });
    },
  }).then((result) => (result && typeof result === 'object' ? result : null));
}
