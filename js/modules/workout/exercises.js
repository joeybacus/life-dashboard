/* Exercise library (#/workout/exercises) and one exercise's page
   (#/workout/exercise/<id>): details, notes, rest time and your history. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { state } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, toast } from '../../core/ui.js';
import { goBack, openPage } from '../../core/router.js';
import { formatShortDate } from '../../core/dates.js';
import { EQUIPMENT, KINDS, MUSCLES } from './muscles.js';
import { deleteCustomExercise, exerciseMeta, loadLibrary, saveExercise, searchExercises, youTubeSearchUrl } from './library.js';
import { bestSet, describeSet, describeEffort, entryStats, formatRest, formatVolume, loadWorkouts, workoutsChanged } from './model.js';
import { editExercise } from './picker.js';

const selected = (on) => (on ? raw(' selected') : '');
const filters = { q: '', muscle: 'all', equipment: 'all', favourites: false, custom: false };
let view = null;
let library = null;

/* ---------- Library ---------- */

export const libraryPage = {
  async show(el) {
    view = el;
    library = await loadLibrary();
    setHTML(view, html`<div class="wk-page accent-workout">
      ${subHead({ title: 'Exercises', back: 'Workout', accent: 'workout',
        actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="ex:new">${icon('plus')}New</button>` })}
      <div class="lib-tools">
        <label class="search-field">${icon('search')}<span class="sr-only">Search exercises</span>
          <input type="search" class="input" data-lib="q" value="${filters.q}" placeholder="Search ${library.list.length} exercises" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
        </label>
        <div class="picker__filters">
          <select class="select select--inline" data-lib="muscle" aria-label="Muscle">
            <option value="all">All muscles</option>
            ${MUSCLES.map((m) => html`<option value="${m}"${selected(filters.muscle === m)}>${m}</option>`)}
          </select>
          <select class="select select--inline" data-lib="equipment" aria-label="Equipment">
            <option value="all">All equipment</option>
            ${EQUIPMENT.map((e) => html`<option value="${e}"${selected(filters.equipment === e)}>${e}</option>`)}
          </select>
          <button type="button" class="chip-toggle" data-action="ex:filter" data-filter="favourites" aria-pressed="${filters.favourites}">${icon('star')}Favourites</button>
          <button type="button" class="chip-toggle" data-action="ex:filter" data-filter="custom" aria-pressed="${filters.custom}">${icon('edit')}Custom</button>
        </div>
      </div>
      <p class="lib-count" data-lib-count aria-live="polite"></p>
      <ul class="card lib-list" data-lib-list></ul>
    </div>`);
    const search = view.querySelector('[data-lib="q"]');
    search.addEventListener('input', () => { filters.q = search.value.trim(); renderList(); });
    search.addEventListener('keydown', (event) => { if (event.key === 'Enter') search.blur(); });
    view.querySelectorAll('select[data-lib]').forEach((sel) => sel.addEventListener('change', () => {
      filters[sel.dataset.lib] = sel.value;
      renderList();
    }));
    renderList();
  },
};

function renderList() {
  const list = view?.querySelector('[data-lib-list]');
  if (!list) return;
  let items = library.list;
  if (filters.muscle !== 'all') items = items.filter((e) => e.primary === filters.muscle || e.secondary.includes(filters.muscle));
  if (filters.equipment !== 'all') items = items.filter((e) => e.equipment === filters.equipment);
  if (filters.favourites) items = items.filter((e) => e.favorite);
  if (filters.custom) items = items.filter((e) => e.custom);
  if (filters.q) items = searchExercises(items, filters.q);
  view.querySelector('[data-lib-count]').textContent = `${items.length} exercise${items.length === 1 ? '' : 's'}`;
  setHTML(list, items.length
    ? items.map((e) => html`<li><a class="lib-item" href="#/workout/exercise/${e.id}" data-action="nav" data-route="workout" data-sub="exercise/${e.id}">
        <span class="lib-item__text"><span class="lib-item__name">${e.name}</span><span class="lib-item__meta">${exerciseMeta(e)}</span></span>
        ${e.custom ? html`<span class="badge accent-neutral">Custom</span>` : ''}
        ${e.favorite ? html`<span class="lib-item__star">${icon('starFill')}<span class="sr-only">Favourite</span></span>` : ''}
        ${icon('chevronRight', 'row__chev')}
      </a></li>`)
    : html`<li class="picker__empty">No exercises match. Tap New to create one.</li>`);
}

registerAction('ex:filter', (el) => {
  const key = el.dataset.filter;
  filters[key] = !filters[key];
  el.setAttribute('aria-pressed', String(filters[key]));
  renderList();
});

registerAction('ex:new', async () => {
  const created = await editExercise(null, { name: filters.q });
  if (created) openPage('workout', `exercise/${created.id}`);
});

/* ---------- One exercise ---------- */

export const exercisePage = {
  async show(el, { id }) {
    view = el;
    const [lib, workouts] = await Promise.all([loadLibrary(), loadWorkouts()]);
    library = lib;
    const e = library.get(id);
    if (!e) {
      setHTML(view, html`<div class="wk-page accent-workout">
        ${subHead({ title: 'Exercise not found', back: 'Exercises', fallback: 'exercises', accent: 'workout' })}
        <div class="card empty">${icon('info')}<span>This exercise may have been deleted.</span></div>
      </div>`);
      return;
    }
    const sessions = [];
    for (const w of workouts) {
      if (!w.endedAt) continue;
      w.exercises.filter((x) => x.exerciseId === id && x.sets.some((set) => set.done)).forEach((entry) => sessions.push({ workout: w, entry }));
    }
    let best = null;
    let bestVolume = 0;
    sessions.forEach(({ entry }) => {
      const b = bestSet(entry);
      if (b && (!best || (b.weightKg ?? 0) > (best.weightKg ?? 0) || ((b.weightKg ?? 0) === (best.weightKg ?? 0) && (b.reps ?? 0) > (best.reps ?? 0)))) best = b;
      bestVolume = Math.max(bestVolume, entryStats(entry).volume);
    });
    const defaultRest = state.settings.workout.restSeconds;

    setHTML(view, html`<div class="wk-page accent-workout">
      ${subHead({ title: e.name, back: 'Back', fallback: 'exercises', accent: 'workout', eyebrow: exerciseMeta(e) || 'Exercise',
        actions: html`<button type="button" class="icon-btn icon-btn--star${e.favorite ? ' is-on' : ''}" data-action="ex:fav" data-id="${e.id}" aria-pressed="${e.favorite ? 'true' : 'false'}" aria-label="Favourite">${icon(e.favorite ? 'starFill' : 'star')}</button>
          <button type="button" class="btn btn--sm" data-action="ex:edit" data-id="${e.id}">${icon('edit')}Edit</button>` })}

      <div class="ex-facts">
        <span class="tag">${icon('target')}${e.primary}</span>
        ${e.secondary.length ? html`<span class="tag">Also: ${e.secondary.join(', ')}</span>` : ''}
        <span class="tag">${e.equipment}</span>
        <span class="tag">${KINDS[e.kind] ?? KINDS.weight}</span>
        ${e.custom ? html`<span class="badge accent-neutral">Custom</span>` : ''}
      </div>

      <dl class="stat-grid ex-stats">
        <div class="stat"><dt>${icon('trophy')}Best set</dt><dd class="stat__value">${best ? describeSet(best, e.kind) : '—'}</dd><dd class="stat__sub">${best && describeEffort(best) ? describeEffort(best) : 'Heaviest working set'}</dd></div>
        <div class="stat"><dt>${icon('calendarCheck')}Sessions</dt><dd class="stat__value">${sessions.length}</dd><dd class="stat__sub">${sessions.length ? `Last: ${formatShortDate(new Date(sessions[0].workout.startedAt))}` : 'Not done yet'}</dd></div>
        <div class="stat"><dt>${icon('chart')}Best volume</dt><dd class="stat__value">${bestVolume ? formatVolume(bestVolume) : '—'}</dd><dd class="stat__sub">In one session</dd></div>
        <div class="stat"><dt>${icon('timer')}Rest</dt><dd class="stat__value">${formatRest(e.restSeconds ?? defaultRest)}</dd><dd class="stat__sub">${e.restSeconds == null ? 'Between sets (your default)' : 'Between sets, for this exercise'}</dd></div>
      </dl>

      ${e.notes ? html`<section class="section"><div class="section__head"><h2 class="section__title">Your notes</h2></div><p class="card card--pad prose">${e.notes}</p></section>` : ''}
      ${e.instructions ? html`<section class="section"><div class="section__head"><h2 class="section__title">How to do it</h2></div><p class="card card--pad prose">${e.instructions}</p></section>` : ''}

      <section class="section" aria-labelledby="ex-media-title">
        <div class="section__head"><h2 class="section__title" id="ex-media-title">Video &amp; form</h2></div>
        <div class="card group__card">
          ${e.videoUrl ? html`<a class="row row--icon accent-workout" href="${e.videoUrl}" target="_blank" rel="noopener">
            <span class="row__icon">${icon('video')}</span><span class="row__text"><span class="row__label">Your video or picture</span><span class="row__sub">${e.videoUrl}</span></span>${icon('external', 'row__chev')}</a>` : ''}
          <a class="row row--icon accent-workout" href="${youTubeSearchUrl(e.name)}" target="_blank" rel="noopener">
            <span class="row__icon">${icon('search')}</span><span class="row__text"><span class="row__label">Find form videos on YouTube</span><span class="row__sub">Opens a search for “${e.name}”</span></span>${icon('external', 'row__chev')}</a>
        </div>
        ${e.videoUrl ? '' : html`<p class="group__foot">Found a good video? Tap Edit to save its link here.</p>`}
      </section>

      <section class="section" aria-labelledby="ex-history-title">
        <div class="section__head"><h2 class="section__title" id="ex-history-title">History</h2><span class="section__meta">${sessions.length} session${sessions.length === 1 ? '' : 's'}</span></div>
        ${sessions.length
          ? html`<ul class="card ex-history">${sessions.slice(0, 30).map(({ workout, entry }) => html`<li>
              <a class="ex-history__item" href="#/workout/w/${workout.id}" data-action="nav" data-route="workout" data-sub="w/${workout.id}">
                <span class="ex-history__date">${formatShortDate(new Date(workout.startedAt))}${workout.sample ? html` <span class="faint">(sample)</span>` : ''}</span>
                <span class="ex-history__sets">${entry.sets.filter((s) => s.done).map((s) => describeSet(s, e.kind)).join(' · ')}</span>
              </a></li>`)}</ul>`
          : html`<div class="card empty">${icon('history')}<span>Sets you log for this exercise will show up here.</span></div>`}
      </section>

      ${e.custom ? html`<button type="button" class="btn btn--ghost btn--block wl-danger ex-delete" data-action="ex:delete" data-id="${e.id}">${icon('trash')}Delete exercise</button>` : ''}
    </div>`);
  },
};

const refreshExercise = (id) => exercisePage.show(view, { id });

registerAction('ex:fav', async (el) => {
  const e = library?.get(el.dataset.id);
  if (!e) return;
  await saveExercise(e, { favorite: !e.favorite });
  toast(e.favorite ? 'Removed from favourites.' : 'Added to favourites.', { icon: 'star' });
  refreshExercise(e.id);
});

registerAction('ex:edit', async (el) => {
  const e = library?.get(el.dataset.id);
  if (!e) return;
  if (await editExercise(e)) refreshExercise(e.id);
});

registerAction('ex:delete', async (el) => {
  const e = library?.get(el.dataset.id);
  if (!e?.custom) return;
  const ok = await confirmDialog({
    title: `Delete “${e.name}”?`,
    message: 'It will disappear from your exercise list. Workouts where you did it keep their sets.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  const record = await deleteCustomExercise(e);
  goBack('exercises');
  toast('Exercise deleted.', {
    icon: 'trash',
    action: { label: 'Undo', onClick: () => saveExercise({ ...e, record }, { deletedAt: null }).then(() => workoutsChanged('exercises')) },
  });
});
