/* Progress photos: the gallery (#/workout/photos — Grid, Calendar, Timeline), one photo
   (#/workout/photos/<id>), Compare (#/workout/photos/compare/<a>/<b>) and the Add photo pop-up.
   "Add progress photo" is also on the + button, after a workout, and on the Health page. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { registerQuickAdd } from '../../core/quick-add.js';
import { on } from '../../core/state.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage, replacePage } from '../../core/router.js';
import { addDays, formatShortDate, formatTime, startOfDay, startOfWeek, toDateKey, formatWeekdayNarrow } from '../../core/dates.js';
import { uid } from '../../core/ids.js';
import { loadWorkouts } from '../workout/model.js';
import { groupsLabel } from '../workout/muscles.js';
import { formatChange, formatValue, loadMeasurements } from '../health/model.js';
import {
  POSES, addPhoto, autoLabels, byDay, byMonth, defaultPair, deletePhoto, fileIndex, keepStorage, loadPhoto, loadPhotos, makeCopies,
  nearestTo, photoUrl, restorePhoto, takenAtOf, updatePhoto,
} from './model.js';
import { PHOTO_SCRIPT_VERSION, runTransfers, transferStatus } from './transfer.js';

let view = null;
let route = { kind: 'gallery' };
const prefs = { mode: 'grid', pose: 'all', month: null, compare: 'side' };

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const checked = (on) => (on ? raw(' checked') : '');

export const photosPage = {
  async show(el, params = {}) {
    view = el;
    route = params;
    await render();
  },
};

async function render() {
  if (!view) return;
  if (route.kind === 'photo') return renderPhoto(route.id);
  if (route.kind === 'compare') return renderCompare(route.a, route.b);
  return renderGallery();
}

/** Fill every <img data-photo> with its file (thumbnail or copy) — after drawing, so pages open at once. */
async function fillImages(root = view) {
  for (const img of root.querySelectorAll('img[data-photo]')) {
    const url = await photoUrl(img.dataset.photo, img.dataset.kind || 'thumb');
    if (url) {
      img.src = url;
      img.closest('.ph-frame')?.classList.remove('is-missing');
    } else img.closest('.ph-frame')?.classList.add('is-missing');
  }
}

const frame = (p, kind = 'thumb', extra = '') => html`<span class="ph-frame${extra}"><img data-photo="${p.id}" data-kind="${kind}" alt="" loading="lazy" decoding="async"><span class="ph-frame__wait">${icon('download')}<span>Downloading…</span></span></span>`;

function statusLine(waitingUp) {
  const t = transferStatus();
  if (t.blocked === 'not-connected' && waitingUp) return html`<p class="note">${icon('info')}<span>These photos are only on this device for now. Turn on sync (Settings → Sync) and their full originals go to your Google Drive.</span></p>`;
  if (t.blocked === 'script') return html`<p class="note">${icon('info')}<span>Update the sync script (version ${PHOTO_SCRIPT_VERSION}) so photos can go to your Google Drive: Settings → Sync → Update the sync script. Then run <em>setup</em> once to allow Google Drive.</span></p>`;
  if (t.error && /needs-permission/.test(t.error.code)) return html`<p class="note ward-note--warn">${icon('info')}<span>Google Drive needs your permission once: in Apps Script choose <strong>setup</strong>, click <strong>Run</strong> and allow access. Photos wait safely on this device.</span></p>`;
  if (t.error && t.up) return html`<p class="note">${icon('info')}<span>${t.up} photo${t.up === 1 ? '' : 's'} waiting to go to Google Drive — trying again shortly. (${t.error.message})</span></p>`;
  if (t.up) return html`<p class="muted ph-status">${icon('upload')}${t.running ? 'Uploading' : 'Waiting to upload'} ${t.up} photo${t.up === 1 ? '' : 's'} to Google Drive…</p>`;
  if (t.down) return html`<p class="muted ph-status">${icon('download')}Downloading ${t.down} photo${t.down === 1 ? '' : 's'} from your other devices…</p>`;
  return '';
}

/* ---------- Gallery ---------- */

async function renderGallery() {
  const [all, files] = await Promise.all([loadPhotos(), fileIndex()]);
  const photos = prefs.pose === 'all' ? all : all.filter((p) => p.pose === prefs.pose);
  const waitingUp = all.some((p) => !p.originalFileId && files.get(p.id)?.has('original'));
  setHTML(view, html`<div class="wk-page ph accent-workout">
    ${subHead({ title: 'Progress photos', back: 'Back', fallback: 'health', accent: 'workout', eyebrow: all.length ? `${all.length} photo${all.length === 1 ? '' : 's'}` : 'Body',
      actions: html`<button type="button" class="btn btn--sm btn--accent" data-action="photos:add">${icon('camera')}Add</button>` })}
    ${statusLine(waitingUp)}
    ${all.length ? html`
      <div class="ph-tools">
        <div class="segmented" role="radiogroup" aria-label="View">
          ${[['grid', 'Grid'], ['calendar', 'Calendar'], ['timeline', 'Timeline']].map(([v, l]) => html`<label class="segmented__opt"><input type="radio" name="ph-mode" value="${v}" data-ph-mode${checked(prefs.mode === v)}><span>${l}</span></label>`)}
        </div>
        <div class="chips chips--sm" role="radiogroup" aria-label="Pose">
          ${[['all', 'All'], ...Object.entries(POSES)].map(([v, l]) => html`<button type="button" class="chip-toggle" data-action="photos:pose" data-pose="${v}" aria-pressed="${prefs.pose === v}">${l}</button>`)}
        </div>
        <div class="ph-tools__row">
          <label class="ph-jump">${icon('calendar')}<span class="sr-only">Go to a date</span><input class="input input--sm" type="date" data-ph-jump max="${toDateKey(new Date())}" aria-label="Go to a date"></label>
          ${all.length > 1 ? html`<button type="button" class="btn btn--sm" data-action="photos:compare">${icon('columns')}Compare</button>` : ''}
        </div>
      </div>
      ${photos.length ? (prefs.mode === 'calendar' ? calendarView(photos) : prefs.mode === 'timeline' ? timelineView(photos) : gridView(photos, files))
        : html`<div class="card empty">${icon('image')}<span>No ${POSES[prefs.pose]?.toLowerCase()} photos yet.</span></div>`}`
    : html`<div class="card card--pad hl-empty ph-empty">${icon('camera')}
        <div><p><strong>No progress photos yet</strong></p><p class="muted">Take one now, or after a workout. Same place, same light and the same pose each time make the clearest comparisons.</p></div>
        <button type="button" class="btn btn--accent" data-action="photos:add">${icon('camera')}Add progress photo</button></div>`}
  </div>`);
  view.querySelectorAll('[data-ph-mode]').forEach((i) => i.addEventListener('change', () => { prefs.mode = i.value; renderGallery(); }));
  view.querySelector('[data-ph-jump]')?.addEventListener('change', (e) => jumpTo(e.target.value, photos));
  fillImages();
}

function gridView(photos, files) {
  return byMonth(photos).map((m) => html`<section class="ph-month" data-month="${m.key}" aria-label="${monthName.format(m.date)}">
    <h2 class="section__title ph-month__title">${monthName.format(m.date)}</h2>
    <ul class="ph-grid">${m.photos.map((p) => html`<li><button type="button" class="ph-tile" data-action="photos:open" data-id="${p.id}" data-day="${toDateKey(new Date(p.takenAt))}"
      aria-label="${dayLong.format(new Date(p.takenAt))}${p.pose ? `, ${POSES[p.pose]}` : ''}${p.weightKg ? `, ${formatValue('weight', p.weightKg)}` : ''}">
      ${frame(p)}
      <span class="ph-tile__date">${formatShortDate(new Date(p.takenAt)).replace(/^\w+, /, '')}</span>
      ${p.pose ? html`<span class="ph-tile__pose">${POSES[p.pose][0]}</span>` : ''}
      ${!p.originalFileId && files.get(p.id)?.has('original') ? html`<span class="ph-tile__cloud" title="Not in Google Drive yet">${icon('upload')}</span>` : ''}
    </button></li>`)}</ul>
  </section>`);
}

function calendarView(photos) {
  const latest = new Date(photos.at(-1).takenAt);
  const month = prefs.month ? new Date(`${prefs.month}-01T12:00:00`) : new Date(latest.getFullYear(), latest.getMonth(), 1);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const days = byDay(photos);
  const today = toDateKey(new Date());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    cells.push(d);
  }
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return html`<section class="card card--pad ph-cal" aria-label="${monthName.format(first)}">
    <div class="ph-cal__head">
      <button type="button" class="icon-btn" data-action="photos:month" data-month="${key(new Date(first.getFullYear(), first.getMonth() - 1, 1))}" aria-label="Previous month">${icon('chevronLeft')}</button>
      <h2 class="ph-cal__title">${monthName.format(first)}</h2>
      <button type="button" class="icon-btn" data-action="photos:month" data-month="${key(new Date(first.getFullYear(), first.getMonth() + 1, 1))}" aria-label="Next month">${icon('chevronRight')}</button>
    </div>
    <div class="ph-cal__grid">
      ${cells.slice(0, 7).map((d) => html`<span class="ph-cal__dow" aria-hidden="true">${formatWeekdayNarrow(d)}</span>`)}
      ${cells.map((d) => {
        const list = days.get(toDateKey(d)) ?? [];
        const out = d.getMonth() !== first.getMonth();
        const cls = `ph-cal__day${out ? ' is-out' : ''}${toDateKey(d) === today ? ' is-today' : ''}`;
        if (!list.length) return html`<span class="${cls}"><span class="ph-cal__num">${d.getDate()}</span></span>`;
        return html`<button type="button" class="${cls} has-photo" data-action="photos:open" data-id="${list[0].id}" aria-label="${dayLong.format(d)}: ${list.length} photo${list.length === 1 ? '' : 's'}">
          ${frame(list[0])}<span class="ph-cal__num">${d.getDate()}</span>${list.length > 1 ? html`<span class="ph-cal__count">${list.length}</span>` : ''}</button>`;
      })}
    </div>
  </section>`;
}

function timelineView(photos) {
  const list = [...photos].reverse();
  return html`<ol class="ph-timeline">${list.map((p, i) => {
    const older = list[i + 1];
    const delta = p.weightKg != null && older?.weightKg != null ? p.weightKg - older.weightKg : null;
    return html`<li class="card ph-tl" data-day="${toDateKey(new Date(p.takenAt))}">
      <button type="button" class="ph-tl__img" data-action="photos:open" data-id="${p.id}" aria-label="Open the photo from ${dayLong.format(new Date(p.takenAt))}">${frame(p, 'copy')}</button>
      <div class="ph-tl__text">
        <p class="ph-tl__date">${dayLong.format(new Date(p.takenAt))}<span class="muted"> · ${formatTime(new Date(p.takenAt))}</span></p>
        <p class="ph-tl__facts">${[p.pose ? POSES[p.pose] : null, p.weightKg ? formatValue('weight', p.weightKg) : null, delta != null ? `${formatChange('weight', delta)} since the one before` : null].filter(Boolean).join(' · ')}</p>
        ${p.workoutTitle ? html`<p class="muted">${icon('dumbbell')} ${p.workoutTitle}${p.muscleGroups?.length ? ` · ${groupsLabel(p.muscleGroups)}` : ''}</p>` : ''}
        ${p.note ? html`<p class="ph-tl__note">${p.note}</p>` : ''}
      </div>
    </li>`;
  })}</ol>`;
}

function jumpTo(dateKey, photos) {
  if (!dateKey || !photos.length) return;
  const p = nearestTo(photos, dateKey);
  if (!p) return;
  if (prefs.mode === 'calendar') {
    prefs.month = toDateKey(new Date(p.takenAt)).slice(0, 7);
    renderGallery();
    return;
  }
  const target = view.querySelector(`[data-day="${toDateKey(new Date(p.takenAt))}"]`);
  target?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  target?.classList.add('is-flash');
  setTimeout(() => target?.classList.remove('is-flash'), 1600);
  if (toDateKey(new Date(p.takenAt)) !== dateKey) toast(`No photo that day — the nearest is ${formatShortDate(new Date(p.takenAt))}.`, { icon: 'calendar' });
}

registerAction('photos:pose', (el) => { prefs.pose = el.dataset.pose; renderGallery(); });
registerAction('photos:month', (el) => { prefs.month = el.dataset.month; renderGallery(); });
registerAction('photos:open', (el) => openPage('workout', `photos/${el.dataset.id}`));
registerAction('photos:compare', async () => {
  const pair = defaultPair(await loadPhotos());
  if (pair) openPage('workout', `photos/compare/${pair[0]}/${pair[1]}`);
});

/* ---------- One photo ---------- */

async function renderPhoto(id) {
  const [p, all] = await Promise.all([loadPhoto(id), loadPhotos()]);
  if (!p) {
    setHTML(view, html`<div class="wk-page accent-workout">${subHead({ title: 'Photo not found', back: 'Photos', fallback: 'photos', accent: 'workout' })}
      <div class="card empty">${icon('info')}<span>This photo may have been deleted.</span></div></div>`);
    return;
  }
  const i = all.findIndex((x) => x.id === id);
  const prev = all[i - 1];
  const next = all[i + 1];
  const d = new Date(p.takenAt);
  setHTML(view, html`<div class="wk-page ph accent-workout">
    ${subHead({ title: dayLong.format(d), back: 'Photos', fallback: 'photos', accent: 'workout', eyebrow: `${formatTime(d)}${p.pose ? ` · ${POSES[p.pose]}` : ''}`,
      actions: html`<button type="button" class="btn btn--sm" data-action="photos:edit" data-id="${p.id}">${icon('edit')}Edit</button>` })}
    <div class="ph-big">
      ${frame(p, 'copy', ' ph-frame--big')}
      ${prev ? html`<button type="button" class="ph-nav ph-nav--prev" data-action="photos:open" data-id="${prev.id}" aria-label="Earlier photo">${icon('chevronLeft')}</button>` : ''}
      ${next ? html`<button type="button" class="ph-nav ph-nav--next" data-action="photos:open" data-id="${next.id}" aria-label="Later photo">${icon('chevronRight')}</button>` : ''}
    </div>
    <dl class="stat-grid">
      <div class="stat"><dt>${icon('scale')}Weight</dt><dd class="stat__value">${p.weightKg ? formatValue('weight', p.weightKg) : '—'}</dd><dd class="stat__sub">${p.weightKg ? 'Latest weigh-in then' : 'No weigh-in near this day'}</dd></div>
      <div class="stat"><dt>${icon('dumbbell')}Workout</dt><dd class="stat__value">${p.workoutTitle ?? '—'}</dd><dd class="stat__sub">${p.muscleGroups?.length ? groupsLabel(p.muscleGroups) : p.workoutTitle ? '' : 'None that day'}</dd></div>
    </dl>
    ${p.note ? html`<p class="card card--pad prose ph-note">${p.note}</p>` : ''}
    <div class="card group__card wd-actions">
      ${all.length > 1 ? html`<button type="button" class="row row--icon accent-workout" data-action="photos:compare-with" data-id="${p.id}">
        <span class="row__icon">${icon('columns')}</span><span class="row__text"><span class="row__label">Compare with another photo</span></span>${icon('chevronRight', 'row__chev')}</button>` : ''}
      ${p.workoutId ? html`<button type="button" class="row row--icon accent-workout" data-action="nav" data-route="workout" data-sub="w/${p.workoutId}">
        <span class="row__icon">${icon('history')}</span><span class="row__text"><span class="row__label">Open the workout</span></span>${icon('chevronRight', 'row__chev')}</button>` : ''}
      ${p.originalFileId ? html`<a class="row row--icon accent-workout" href="https://drive.google.com/file/d/${p.originalFileId}/view" target="_blank" rel="noopener">
        <span class="row__icon">${icon('external')}</span><span class="row__text"><span class="row__label">Full original in Google Drive</span><span class="row__sub">${p.originalScaled ? 'Saved at 4096 px (the original was very large)' : 'Life Dashboard Photos folder'}</span></span>${icon('external', 'row__chev')}</a>`
        : html`<div class="row row--icon"><span class="row__icon">${icon('upload')}</span><span class="row__text"><span class="row__label">Not in Google Drive yet</span><span class="row__sub">It uploads by itself when sync is on</span></span></div>`}
      <button type="button" class="row row--icon row--danger accent-danger" data-action="photos:delete" data-id="${p.id}">
        <span class="row__icon">${icon('trash')}</span><span class="row__text"><span class="row__label">Delete photo</span><span class="row__sub">Its Drive files go to the Drive trash</span></span></button>
    </div>
  </div>`);
  fillImages();
}

registerAction('photos:edit', (el) => editSheet(el.dataset.id));
registerAction('photos:delete', async (el) => {
  const p = await loadPhoto(el.dataset.id);
  if (!p) return;
  const ok = await confirmDialog({ title: 'Delete this photo?', message: `The photo from ${formatShortDate(new Date(p.takenAt))} is removed on all your devices. Its files in Google Drive go to the Drive trash, where they stay for 30 days.`, confirmLabel: 'Delete', destructive: true });
  if (!ok) return;
  const record = await deletePhoto(p.id);
  replacePage('photos');
  toast('Photo deleted.', { icon: 'trash', action: { label: 'Undo', onClick: () => restorePhoto(record) } });
});
registerAction('photos:compare-with', async (el) => {
  const other = await pickPhoto({ title: 'Compare with…', exclude: el.dataset.id });
  if (other) {
    const [a, b] = [await loadPhoto(el.dataset.id), await loadPhoto(other)].sort((x, y) => String(x.takenAt).localeCompare(String(y.takenAt)));
    openPage('workout', `photos/compare/${a.id}/${b.id}`);
  }
});

/* ---------- Compare ---------- */

async function renderCompare(aId, bId) {
  const [a, b] = await Promise.all([loadPhoto(aId), loadPhoto(bId)]);
  if (!a || !b) {
    replacePage('photos');
    return;
  }
  const days = Math.round((startOfDay(new Date(b.takenAt)) - startOfDay(new Date(a.takenAt))) / 864e5);
  const delta = a.weightKg != null && b.weightKg != null ? b.weightKg - a.weightKg : null;
  const label = (p, which) => html`<div class="ph-cmp__label"><strong>${which}</strong> ${dayLong.format(new Date(p.takenAt))}${p.weightKg ? ` · ${formatValue('weight', p.weightKg)}` : ''}
    <button type="button" class="text-btn" data-action="photos:swap-one" data-which="${which === 'Before' ? 'a' : 'b'}">Change</button></div>`;
  setHTML(view, html`<div class="wk-page ph accent-workout">
    ${subHead({ title: 'Compare', back: 'Photos', fallback: 'photos', accent: 'workout',
      eyebrow: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} apart${delta != null ? ` · ${formatChange('weight', delta)}` : ''}` })}
    <div class="segmented ph-cmp__mode" role="radiogroup" aria-label="How to compare">
      ${[['side', 'Side by side'], ['slider', 'Slider']].map(([v, l]) => html`<label class="segmented__opt"><input type="radio" name="ph-cmp" value="${v}" data-ph-cmp${checked(prefs.compare === v)}><span>${l}</span></label>`)}
    </div>
    ${prefs.compare === 'slider'
      ? html`<div class="ph-slider" style="--cut:50%">
          ${frame(a, 'copy', ' ph-frame--big ph-slider__a')}
          <div class="ph-slider__b">${frame(b, 'copy', ' ph-frame--big')}</div>
          <span class="ph-slider__line" aria-hidden="true"></span>
          <input type="range" min="0" max="100" value="50" class="ph-slider__range" data-ph-slide aria-label="Slide between before and after">
        </div>
        ${label(a, 'Before')}${label(b, 'After')}
        <p class="muted ph-hint">Drag across the photo: left shows before, right shows after.</p>`
      : html`<div class="ph-side">
          <figure>${frame(a, 'copy', ' ph-frame--big')}${label(a, 'Before')}</figure>
          <figure>${frame(b, 'copy', ' ph-frame--big')}${label(b, 'After')}</figure>
        </div>`}
  </div>`);
  view.querySelectorAll('[data-ph-cmp]').forEach((i) => i.addEventListener('change', () => { prefs.compare = i.value; renderCompare(aId, bId); }));
  const range = view.querySelector('[data-ph-slide]');
  range?.addEventListener('input', () => view.querySelector('.ph-slider').style.setProperty('--cut', `${range.value}%`));
  fillImages();
}

registerAction('photos:swap-one', async (el) => {
  if (route.kind !== 'compare') return;
  const keep = el.dataset.which === 'a' ? route.b : route.a;
  const other = await pickPhoto({ title: el.dataset.which === 'a' ? 'Before…' : 'After…', exclude: keep });
  if (!other) return;
  const [x, y] = [await loadPhoto(keep), await loadPhoto(other)].sort((p, q) => String(p.takenAt).localeCompare(String(q.takenAt)));
  replacePage(`photos/compare/${x.id}/${y.id}`);
});

/** Choose a photo from a grid in a pop-up. */
async function pickPhoto({ title, exclude = null }) {
  const photos = (await loadPhotos()).filter((p) => p.id !== exclude).reverse();
  return openDialog({
    variant: 'sheet',
    className: 'ph-pick accent-workout',
    title,
    body: html`<ul class="ph-grid ph-grid--pick">${photos.map((p) => html`<li><button type="button" class="ph-tile" data-dialog-value="${p.id}" aria-label="${dayLong.format(new Date(p.takenAt))}${p.pose ? `, ${POSES[p.pose]}` : ''}">
      ${frame(p)}<span class="ph-tile__date">${formatShortDate(new Date(p.takenAt)).replace(/^\w+, /, '')}</span>${p.pose ? html`<span class="ph-tile__pose">${POSES[p.pose][0]}</span>` : ''}</button></li>`)}</ul>`,
    actions: [{ label: 'Cancel', value: '', variant: 'ghost' }],
    onOpen(dlg) { fillImages(dlg); },
  }).then((v) => v || null);
}

/* ---------- Adding and editing ---------- */

const pad = (n) => String(n).padStart(2, '0');
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function poseChips(current) {
  return html`<div class="chips chips--sm" role="radiogroup" aria-label="Pose" data-poses>
    ${Object.entries(POSES).map(([v, l]) => html`<button type="button" class="chip-toggle" data-pose="${v}" aria-pressed="${current === v}">${l}</button>`)}
  </div>`;
}

function labelsText(l) {
  const parts = [];
  if (l.weightKg) parts.push(html`${icon('scale')} ${formatValue('weight', l.weightKg)}`);
  if (l.workoutTitle) parts.push(html`${icon('dumbbell')} ${l.workoutTitle}${l.muscleGroups?.length ? ` · ${groupsLabel(l.muscleGroups)}` : ''}`);
  return parts.length ? html`<p class="ph-labels">${parts.map((x, i) => html`${i ? html`<span aria-hidden="true"> · </span>` : ''}<span>${x}</span>`)}</p>`
    : html`<p class="ph-labels muted">No weigh-in or workout near this day — the photo is saved with just its date.</p>`;
}

/**
 * Add a progress photo. With `workoutId`, it's labelled with that workout (offered after finishing one).
 * The file box is a real <input type="file">, so iPhone offers Take Photo, Photo Library or Choose File.
 */
export async function addPhotoSheet({ workoutId = null } = {}) {
  const [workouts, measurements] = await Promise.all([loadWorkouts(), loadMeasurements()]);
  let file = null;
  let pose = null;
  let previewUrl = null;
  const result = await openDialog({
    variant: 'sheet',
    className: 'hl-sheet ph-add accent-workout',
    dismissible: false,
    title: 'Add progress photo',
    body: html`<form class="form" data-phform novalidate>
      <label class="ph-pickfile" data-pickfile>
        <span class="ph-pickfile__empty">${icon('camera')}<strong>Take or choose a photo</strong><span class="muted">Camera or photo library</span></span>
        <img class="ph-pickfile__img" alt="" hidden>
        <input type="file" accept="image/*" class="sr-only" name="file">
      </label>
      <div class="field-row">
        <label class="field"><span class="field__label">Date</span><input class="input" type="date" name="date" value="${toDateKey(new Date())}" max="${toDateKey(new Date())}"></label>
        <label class="field"><span class="field__label">Time</span><input class="input" type="time" name="time" value="${localTime(new Date())}"></label>
      </div>
      <div class="field"><span class="field__label">Pose <span class="muted">(optional)</span></span>${poseChips(null)}</div>
      <div data-labels></div>
      <label class="field"><span class="field__label">Note <span class="muted">(optional)</span></span>
        <textarea class="input textarea" name="note" rows="2" maxlength="1000" placeholder="e.g. morning, before breakfast"></textarea></label>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary" data-save>Save photo</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-phform]');
      const error = form.querySelector('[data-error]');
      const labelsEl = form.querySelector('[data-labels]');
      const when = () => new Date(`${form.elements.date.value || toDateKey(new Date())}T${form.elements.time.value || '12:00'}`);
      const labels = () => {
        const l = autoLabels(when().toISOString(), workouts, measurements);
        if (workoutId) {
          const w = workouts.find((x) => x.id === workoutId);
          if (w) Object.assign(l, { workoutId: w.id, workoutTitle: w.title, muscleGroups: w.muscleGroups ?? [] });
        }
        return l;
      };
      const showLabels = () => setHTML(labelsEl, labelsText(labels()));
      showLabels();
      form.elements.file.addEventListener('change', async () => {
        const f = form.elements.file.files?.[0];
        if (!f) return;
        if (f.type && !f.type.startsWith('image/')) {
          setHTML(error, html`Please choose a photo.`);
          error.hidden = false;
          return;
        }
        file = f;
        error.hidden = true;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(f);
        const img = form.querySelector('.ph-pickfile__img');
        img.src = previewUrl;
        img.hidden = false;
        form.querySelector('[data-pickfile]').classList.add('has-file');
        const taken = await takenAtOf(f);
        if (taken.getTime() <= Date.now()) {
          form.elements.date.value = toDateKey(taken);
          form.elements.time.value = localTime(taken);
        }
        showLabels();
      });
      form.addEventListener('change', (e) => { if (e.target.name === 'date' || e.target.name === 'time') showLabels(); });
      form.addEventListener('click', async (event) => {
        const chip = event.target.closest('[data-pose]');
        if (chip) {
          pose = pose === chip.dataset.pose ? null : chip.dataset.pose;
          form.querySelectorAll('[data-pose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === pose)));
          return;
        }
        if (event.target.closest('[data-cancel]')) {
          if (file || form.elements.note.value.trim()) {
            if (!(await confirmDialog({ title: 'Discard this photo?', message: 'It hasn’t been saved yet.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          }
          close(null);
        }
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!file) {
          setHTML(error, html`Take or choose a photo first.`);
          error.hidden = false;
          return;
        }
        const at = when();
        if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60e3) {
          setHTML(error, html`Check the date and time.`);
          error.hidden = false;
          return;
        }
        const save = form.querySelector('[data-save]');
        save.disabled = true;
        save.textContent = 'Saving…';
        try {
          const { copy, thumb } = await makeCopies(file);
          const record = await addPhoto({
            id: uid(), takenAt: at.toISOString(), pose, note: form.elements.note.value.trim(), ...labels(),
            width: copy.width, height: copy.height,
          }, { copy: copy.blob, thumb: thumb.blob, original: file });
          close(record);
        } catch (err) {
          save.disabled = false;
          save.textContent = 'Save photo';
          setHTML(error, html`${err?.message || 'This photo couldn’t be saved.'}`);
          error.hidden = false;
        }
      });
    },
  });
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  if (!result || typeof result !== 'object') return null;
  keepStorage();
  runTransfers();
  toast('Progress photo saved.', { icon: 'camera', action: { label: 'Open', onClick: () => openPage('workout', `photos/${result.id}`) } });
  return result;
}

async function editSheet(id) {
  const p = await loadPhoto(id);
  if (!p) return;
  const [workouts, measurements] = await Promise.all([loadWorkouts(), loadMeasurements()]);
  let pose = p.pose;
  const d = new Date(p.takenAt);
  const result = await openDialog({
    variant: 'sheet',
    className: 'hl-sheet accent-workout',
    dismissible: false,
    title: 'Edit photo',
    body: html`<form class="form" data-phform novalidate>
      <div class="field-row">
        <label class="field"><span class="field__label">Date</span><input class="input" type="date" name="date" value="${toDateKey(d)}" max="${toDateKey(new Date())}"></label>
        <label class="field"><span class="field__label">Time</span><input class="input" type="time" name="time" value="${localTime(d)}"></label>
      </div>
      <div class="field"><span class="field__label">Pose</span>${poseChips(p.pose)}</div>
      <label class="field"><span class="field__label">Note</span><textarea class="input textarea" name="note" rows="3" maxlength="1000">${p.note ?? ''}</textarea></label>
      <p class="muted ph-sheet__hint">Changing the date also updates the weight and workout shown with it.</p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-phform]');
      const initial = JSON.stringify([form.elements.date.value, form.elements.time.value, form.elements.note.value, pose]);
      form.addEventListener('click', async (event) => {
        const chip = event.target.closest('[data-pose]');
        if (chip) {
          pose = pose === chip.dataset.pose ? null : chip.dataset.pose;
          form.querySelectorAll('[data-pose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === pose)));
          return;
        }
        if (event.target.closest('[data-cancel]')) {
          const now = JSON.stringify([form.elements.date.value, form.elements.time.value, form.elements.note.value, pose]);
          if (now !== initial && !(await confirmDialog({ title: 'Discard your changes?', message: 'What you changed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          close(null);
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const at = new Date(`${form.elements.date.value}T${form.elements.time.value || '12:00'}`);
        if (Number.isNaN(at.getTime())) return;
        close({ takenAt: at.toISOString(), note: form.elements.note.value.trim(), pose });
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  const moved = result.takenAt !== p.takenAt;
  await updatePhoto(id, { ...result, ...(moved ? autoLabels(result.takenAt, workouts, measurements) : {}) });
  toast('Saved.', { icon: 'checkCircle' });
}

/* ---------- Entry points ---------- */

registerAction('photos:add', (el) => addPhotoSheet({ workoutId: el?.dataset?.workout || null }));
registerQuickAdd({ id: 'photo', label: 'Add progress photo', icon: 'camera', accent: 'workout', order: 36, run: () => addPhotoSheet() });

/** Latest photos for the Health page: a strip of thumbnails (or a prompt). */
export async function photoStrip() {
  const photos = (await loadPhotos()).slice(-4).reverse();
  return html`<section class="section" aria-labelledby="hl-ph-title">
    <div class="section__head"><h2 class="section__title" id="hl-ph-title">Progress photos</h2>
      <a class="text-btn" href="#/workout/photos" data-action="nav" data-route="workout" data-sub="photos">${photos.length ? 'Gallery' : ''}</a></div>
    ${photos.length
      ? html`<ul class="ph-strip">${photos.map((p) => html`<li><button type="button" class="ph-tile" data-action="photos:open" data-id="${p.id}" aria-label="Photo from ${dayLong.format(new Date(p.takenAt))}">${frame(p)}<span class="ph-tile__date">${formatShortDate(new Date(p.takenAt)).replace(/^\w+, /, '')}</span></button></li>`)}
          <li><button type="button" class="ph-tile ph-tile--add" data-action="photos:add" aria-label="Add progress photo">${icon('camera')}<span>Add</span></button></li></ul>`
      : html`<div class="card card--pad hl-empty">${icon('camera')}<div><p><strong>Progress photos</strong></p><p class="muted">Kept on your devices and in your Google Drive.</p></div>
          <button type="button" class="btn" data-action="photos:add">${icon('camera')}Add photo</button></div>`}
  </section>`;
}

export { fillImages };

// Keep the gallery current when photos arrive or upload (only when the counts or the problem change)
let lastTransfer = '';
on('photos-transfer', (t) => {
  const sig = JSON.stringify([t.up, t.down, t.blocked, t.error?.code ?? null]);
  if (sig === lastTransfer) return;
  lastTransfer = sig;
  if (view?.isConnected && view.querySelector('.ph') && route.kind === 'gallery') renderGallery();
});
