/* Settings. Every change saves immediately. */
import { currentRoute, navigate, registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { emit, on, state, updateProfile, updateSettings } from '../core/state.js';
import { html, raw, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { avatar, pageHead } from '../core/components.js';
import { confirmDialog, toast } from '../core/ui.js';
import { tx } from '../core/db.js';
import { STORE_NAMES } from '../core/schema.js';
import { APP } from '../core/config.js';
import { isIOS, isStandalone, prefersReducedMotion } from '../core/platform.js';
import { SPLITS } from '../modules/workout.js';
import { COMPLETED_OPTIONS, SORT_OPTIONS } from '../modules/todo.js';
import { ensureSampleData } from '../services/sample-data.js';
import { exportBackup } from '../services/backup.js';
import { imageFileToAvatar } from '../services/images.js';
import { formatBytes, storageInfo } from '../services/storage.js';
import { offlineLabel } from '../services/pwa.js';

let root = null;
let nicknameTimer = null;

const THEMES = [['system', 'System', 'monitor'], ['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']];
const SPLIT_LABELS = { ppl: 'Push · Pull · Legs', body: 'Body-part split' };
const REST_PRESETS = [30, 60, 90, 120, 180];
const REMINDERS = [[0, 'None'], [5, '5 min before'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before']];
const INTEGRATIONS = [
  { name: 'Google Sheets sync', desc: 'Keep your data in your own Google Sheet', icon: 'sheet', accent: 'accent-todo' },
  { name: 'Google Calendar', desc: 'Today’s events on your dashboard', icon: 'calendar', accent: 'accent-brand' },
  { name: 'Apple Health weight', desc: 'Send your latest weight with an Apple Shortcut', icon: 'heart', accent: 'accent-neuro' },
  { name: 'Hevy', desc: 'Import and export workouts as CSV', icon: 'dumbbell', accent: 'accent-workout' },
];

/** A settings row that opens the native picker. options: [[value, label], …] */
function pickerRow({ field, iconName, label, value, options }) {
  const current = options.find(([v]) => String(v) === String(value)) ?? options[0];
  return html`<label class="row row--icon row--picker">
    <span class="row__icon">${icon(iconName)}</span>
    <span class="row__text"><span class="row__label">${label}</span></span>
    <span class="row__value"><span data-picker-value>${current[1]}</span>${icon('chevronUpDown')}</span>
    <select class="row__picker" data-field="${field}" aria-label="${label}">
      ${options.map(([v, l]) => html`<option value="${v}"${selected(String(v) === String(value))}>${l}</option>`)}
    </select>
  </label>`;
}

const restLabel = (sec) => (sec < 120 ? `${sec} sec` : sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60} sec` : `${sec / 60} min`);
const checked = (on) => (on ? raw(' checked') : '');
const selected = (on) => (on ? raw(' selected') : '');

export function initSettings() {
  registerScreen('settings', { title: 'Settings', icon: 'gear', accent: 'neutral', mount, onShow: render });

  registerAction('settings:profile', () => openSection('settings-profile'));
  registerAction('settings:data', () => openSection('settings-data'));
  registerAction('settings:remove-photo', removePhoto);
  registerAction('settings:export', runExport);
  registerAction('settings:delete', deleteAllData);
  registerAction('settings:goal', (el) => changeGoal(Number(el.dataset.dir)));

  on('profile', ({ source }) => { if (source !== 'settings' && root && !root.hidden) render(); });
}

function openSection(id) {
  if (currentRoute() !== 'settings') navigate('settings');
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

function mount(el) {
  root = el;
  el.addEventListener('change', onChange);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.dataset.field === 'nickname') event.target.blur();
  });
}

function installHint() {
  if (isIOS()) return 'To install: tap Share, then “Add to Home Screen”.';
  const ua = navigator.userAgent;
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) return 'To install on Mac: File → Add to Dock.';
  return 'To install: use the install button in the address bar.';
}

function render() {
  if (!root) return;
  const s = state.settings;
  const p = state.profile;
  const restCustom = !REST_PRESETS.includes(s.workout.restSeconds);

  setHTML(root, html`
    ${pageHead({ title: 'Settings', iconName: 'gear', accent: 'neutral' })}

    <section class="group" id="settings-profile" aria-labelledby="set-profile-title">
      <h2 class="group__title" id="set-profile-title">Profile</h2>
      <div class="card group__card">
        <div class="profile-edit">
          <span data-slot="avatar">${avatar(p, { size: 'xl' })}</span>
          <div class="profile-edit__actions">
            <label class="btn btn--sm">${icon('camera')}<span>${p.photo ? 'Change photo' : 'Add photo'}</span><input class="sr-only" type="file" accept="image/*" data-field="photo"></label>
            ${p.photo ? html`<button type="button" class="btn btn--sm btn--ghost" data-action="settings:remove-photo">Remove</button>` : ''}
          </div>
        </div>
        <label class="row row--field">
          <span class="row__label">Nickname</span>
          <input class="input" type="text" data-field="nickname" value="${p.nickname}" maxlength="30" autocomplete="nickname" autocapitalize="words" spellcheck="false" enterkeyhint="done" placeholder="What should we call you?">
        </label>
      </div>
      <p class="group__foot">Shown at the top of your dashboard. Your photo is shrunk and stays on this device.</p>
    </section>

    <section class="group" aria-labelledby="set-appearance-title">
      <h2 class="group__title" id="set-appearance-title">Appearance</h2>
      <div class="card group__card">
        <div class="row row--stack row--icon accent-brand">
          <span class="row__icon">${icon('moon')}</span>
          <span class="row__text"><span class="row__label" id="lbl-theme">Theme</span></span>
          <div class="segmented row__full" role="radiogroup" aria-labelledby="lbl-theme">
            ${THEMES.map(([value, label, ic]) => html`<label class="segmented__opt"><input type="radio" name="theme" value="${value}" data-field="theme"${checked(s.appearance.theme === value)}><span>${icon(ic)}${label}</span></label>`)}
          </div>
        </div>
        <label class="row row--icon accent-todo">
          <span class="row__icon">${icon('swap')}</span>
          <span class="row__text"><span class="row__label">Swipe between tabs</span><span class="row__sub">Swipe left or right on iPhone and iPad</span></span>
          <input type="checkbox" class="switch" switch data-field="swipe"${checked(s.appearance.swipeNavigation)}>
        </label>
      </div>
    </section>

    <section class="group" aria-labelledby="set-workout-title">
      <h2 class="group__title" id="set-workout-title">Workout</h2>
      <div class="card group__card accent-workout">
        <div class="row row--stack row--icon">
          <span class="row__icon">${icon('target')}</span>
          <span class="row__text"><span class="row__label" id="lbl-split">Workout split</span><span class="row__sub">Used for suggestions — you always make the final choice</span></span>
          <div class="segmented row__full" role="radiogroup" aria-labelledby="lbl-split">
            ${Object.keys(SPLITS).map((value) => html`<label class="segmented__opt"><input type="radio" name="split" value="${value}" data-field="split"${checked(s.workout.split === value)}><span>${SPLIT_LABELS[value]}</span></label>`)}
          </div>
        </div>
        <div class="row row--icon">
          <span class="row__icon">${icon('calendarCheck')}</span>
          <span class="row__text"><span class="row__label" id="lbl-goal">Weekly goal</span><span class="row__sub">Workouts per week</span></span>
          <div class="stepper row__control" role="group" aria-labelledby="lbl-goal">
            <button type="button" class="stepper__btn" data-action="settings:goal" data-dir="-1" aria-label="Decrease weekly goal"${s.workout.weeklyGoal <= 1 ? raw(' disabled') : ''}>${icon('minus')}</button>
            <span class="stepper__value" aria-live="polite">${s.workout.weeklyGoal}</span>
            <button type="button" class="stepper__btn" data-action="settings:goal" data-dir="1" aria-label="Increase weekly goal"${s.workout.weeklyGoal >= 7 ? raw(' disabled') : ''}>${icon('plus')}</button>
          </div>
        </div>
        <div class="row row--stack row--icon">
          <span class="row__icon">${icon('hourglass')}</span>
          <span class="row__text"><span class="row__label" id="lbl-rest">Default rest timer</span><span class="row__sub">Each exercise will be able to override this</span></span>
          <div class="row__full">
            <div class="chips" role="radiogroup" aria-labelledby="lbl-rest">
              ${REST_PRESETS.map((sec) => html`<label class="chip-opt"><input type="radio" name="rest" value="${sec}" data-field="rest"${checked(!restCustom && s.workout.restSeconds === sec)}><span>${restLabel(sec)}</span></label>`)}
              <label class="chip-opt"><input type="radio" name="rest" value="custom" data-field="rest"${checked(restCustom)}><span>Custom</span></label>
            </div>
            <div class="custom-rest" data-slot="restCustom"${restCustom ? '' : raw(' hidden')}>
              <input class="input" type="number" inputmode="numeric" min="5" max="900" step="5" data-field="restCustom" value="${s.workout.restSeconds}" aria-label="Custom rest time in seconds">
              <span class="muted">seconds</span>
            </div>
          </div>
        </div>
        <div class="row row--icon">
          <span class="row__icon">${icon('scale')}</span>
          <span class="row__text"><span class="row__label">Units</span></span>
          <span class="row__value">Kilograms (kg)</span>
        </div>
      </div>
    </section>

    <section class="group" aria-labelledby="set-tasks-title">
      <h2 class="group__title" id="set-tasks-title">Tasks</h2>
      <div class="card group__card accent-todo">
        ${pickerRow({ field: 'sort', iconName: 'sort', label: 'Sort order', value: s.tasks.sort,
          options: Object.entries(SORT_OPTIONS).map(([v, l]) => [v, l.split(' (')[0]]) })}
        ${pickerRow({ field: 'completed', iconName: 'checkCircle', label: 'Completed tasks', value: s.tasks.completed,
          options: Object.entries(COMPLETED_OPTIONS) })}
        ${pickerRow({ field: 'reminder', iconName: 'bell', label: 'Default reminder', value: s.tasks.defaultReminder,
          options: REMINDERS })}
      </div>
      <p class="group__foot">Smart sorting puts overdue tasks first, then high, medium and low priority, earliest time first. Reminders start working in Phase 6.</p>
    </section>

    <section class="group" id="settings-data" aria-labelledby="set-data-title">
      <h2 class="group__title" id="set-data-title">Data</h2>
      <div class="card group__card">
        <button type="button" class="row row--icon accent-brand" data-action="settings:export">
          <span class="row__icon">${icon(isIOS() ? 'share' : 'download')}</span>
          <span class="row__text"><span class="row__label">Export backup (JSON)</span><span class="row__sub">A complete copy of everything on this device</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        <label class="row row--icon accent-neutral">
          <span class="row__icon">${icon('sampleData')}</span>
          <span class="row__text"><span class="row__label">Sample data</span><span class="row__sub">Example workouts, tasks and weigh-ins to explore with. Refreshed daily.</span></span>
          <input type="checkbox" class="switch" switch data-field="sample"${checked(s.sampleData.enabled)}>
        </label>
        <label class="row row--icon accent-neutral">
          <span class="row__icon">${icon('calendar')}</span>
          <span class="row__text"><span class="row__label">Sample calendar events</span><span class="row__sub">Turn off to see the daily quote instead</span></span>
          <input type="checkbox" class="switch" switch data-field="sampleCalendar"${checked(s.sampleData.calendar)}${s.sampleData.enabled ? '' : raw(' disabled')}>
        </label>
        <div class="row row--icon accent-neutral">
          <span class="row__icon">${icon('database')}</span>
          <span class="row__text"><span class="row__label">Stored on this device</span><span class="row__sub storage-line" data-slot="storage">Checking…</span></span>
        </div>
        <button type="button" class="row row--icon row--danger accent-danger" data-action="settings:delete">
          <span class="row__icon">${icon('trash')}</span>
          <span class="row__text"><span class="row__label">Delete all data on this device</span></span>
        </button>
      </div>
      <p class="group__foot">Everything is saved on this device only. Syncing with your own Google Sheet comes in a later phase.</p>
    </section>

    <section class="group" aria-labelledby="set-integrations-title">
      <h2 class="group__title" id="set-integrations-title">Integrations</h2>
      <div class="card group__card">
        ${INTEGRATIONS.map((i) => html`<div class="row row--icon ${i.accent}">
          <span class="row__icon">${icon(i.icon)}</span>
          <span class="row__text"><span class="row__label">${i.name}</span><span class="row__sub">${i.desc}</span></span>
          <span class="badge accent-neutral">Planned</span>
        </div>`)}
      </div>
    </section>

    <section class="group" aria-labelledby="set-about-title">
      <h2 class="group__title" id="set-about-title">About</h2>
      <div class="card group__card">
        <div class="row"><span class="row__text"><span class="row__label">Version</span></span><span class="row__value">${APP.version} · Phase ${APP.phase}</span></div>
        <div class="row">
          <span class="row__text"><span class="row__label">Running as</span>${isStandalone() ? '' : html`<span class="row__sub">${installHint()}</span>`}</span>
          <span class="row__value">${isStandalone() ? 'Installed app' : 'Browser tab'}</span>
        </div>
        <div class="row"><span class="row__text"><span class="row__label">Offline support</span></span><span class="row__value">${offlineLabel()}</span></div>
      </div>
    </section>`);

  refreshStorage();
}

async function refreshStorage() {
  const { persisted, usage } = await storageInfo();
  const el = root?.querySelector('[data-slot="storage"]');
  if (!el) return;
  const protection = persisted === true
    ? 'protected from automatic clean-up'
    : persisted === false
      ? 'install the app to protect it from clean-up'
      : 'saved in this browser';
  el.textContent = `${formatBytes(usage)} used · ${protection}`;
}

/* ---- Change handlers ---- */

const save = (mutate) => updateSettings(mutate, { source: 'settings' });

async function onChange(event) {
  const el = event.target;
  const field = el.dataset.field;
  if (!field) return;
  if (el.classList.contains('row__picker')) {
    const shown = el.closest('.row')?.querySelector('[data-picker-value]');
    if (shown) shown.textContent = el.selectedOptions[0]?.text ?? '';
  }
  try {
    switch (field) {
      case 'nickname':
        clearTimeout(nicknameTimer);
        await saveNickname(el.value);
        break;
      case 'photo':
        await changePhoto(el);
        break;
      case 'theme':
        await save((s) => { s.appearance.theme = el.value; });
        break;
      case 'swipe':
        await save((s) => { s.appearance.swipeNavigation = el.checked; });
        break;
      case 'split':
        await save((s) => { s.workout.split = el.value; });
        break;
      case 'rest': {
        const box = root.querySelector('[data-slot="restCustom"]');
        if (el.value === 'custom') {
          box.hidden = false;
          box.querySelector('input').focus();
        } else {
          box.hidden = true;
          await save((s) => { s.workout.restSeconds = Number(el.value); });
        }
        break;
      }
      case 'restCustom': {
        const secs = Math.round(Number(el.value));
        if (!Number.isFinite(secs) || secs < 5 || secs > 900) {
          toast('Choose a rest time between 5 and 900 seconds.', { icon: 'info' });
          el.value = state.settings.workout.restSeconds;
          break;
        }
        await save((s) => { s.workout.restSeconds = secs; });
        toast(`Default rest set to ${restLabel(secs)}.`, { icon: 'hourglass' });
        break;
      }
      case 'sort':
        await save((s) => { s.tasks.sort = el.value; });
        break;
      case 'completed':
        await save((s) => { s.tasks.completed = el.value; });
        break;
      case 'reminder':
        await save((s) => { s.tasks.defaultReminder = Number(el.value); });
        break;
      case 'sample':
        await setSampleData(el.checked);
        break;
      case 'sampleCalendar':
        await save((s) => { s.sampleData.calendar = el.checked; });
        emit('data', { reason: 'sample-calendar' });
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(err);
    toast('Couldn’t save that change. Please try again.', { icon: 'info' });
  }
}

function onInput(event) {
  if (event.target.dataset.field !== 'nickname') return;
  const { value } = event.target;
  clearTimeout(nicknameTimer);
  nicknameTimer = setTimeout(() => saveNickname(value).catch(console.error), 400);
}

async function saveNickname(value) {
  const nickname = value.trim().slice(0, 30);
  if (nickname === state.profile.nickname) return;
  await updateProfile({ nickname }, { source: 'settings' });
  const slot = root?.querySelector('[data-slot="avatar"]');
  if (slot) setHTML(slot, avatar(state.profile, { size: 'xl' }));
}

async function changePhoto(input) {
  const file = input.files?.[0];
  input.value = ''; // allow choosing the same file again later
  if (!file) return;
  try {
    const photo = await imageFileToAvatar(file);
    await updateProfile({ photo }, { source: 'settings' });
    render();
    toast('Profile photo updated.', { icon: 'camera' });
  } catch (err) {
    toast(err?.message || 'That photo couldn’t be used.', { icon: 'info' });
  }
}

async function removePhoto() {
  const previous = state.profile.photo;
  if (!previous) return;
  await updateProfile({ photo: null }, { source: 'settings' });
  render();
  toast('Profile photo removed.', {
    icon: 'image',
    action: {
      label: 'Undo',
      onClick: async () => {
        await updateProfile({ photo: previous }, { source: 'settings' });
        render();
      },
    },
  });
}

async function changeGoal(dir) {
  const current = state.settings.workout.weeklyGoal;
  const goal = Math.min(7, Math.max(1, current + dir));
  if (goal === current) return;
  await save((s) => { s.workout.weeklyGoal = goal; });
  const stepper = root.querySelector('.stepper');
  stepper.querySelector('.stepper__value').textContent = String(goal);
  stepper.querySelector('[data-dir="-1"]').disabled = goal <= 1;
  stepper.querySelector('[data-dir="1"]').disabled = goal >= 7;
}

async function setSampleData(enabled) {
  await save((s) => { s.sampleData.enabled = enabled; });
  await ensureSampleData();
  emit('data', { reason: 'sample-toggle' });
  const calendarSwitch = root.querySelector('[data-field="sampleCalendar"]');
  if (calendarSwitch) calendarSwitch.disabled = !enabled;
  toast(enabled ? 'Sample data added.' : 'Sample data removed. Anything you created is untouched.', { icon: 'sampleData' });
  refreshStorage();
}

async function runExport() {
  try {
    const result = await exportBackup();
    if (result === 'downloaded') toast('Backup saved to your Downloads.', { icon: 'download' });
    else if (result === 'shared') toast('Backup exported.', { icon: 'share' });
  } catch (err) {
    console.error(err);
    toast('Export failed. Please try again.', { icon: 'info' });
  }
}

async function deleteAllData() {
  const ok = await confirmDialog({
    title: 'Delete all data?',
    message: 'This permanently erases everything stored on this device: profile, settings, tasks and workouts. Export a backup first if you might need it.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  try {
    await tx(STORE_NAMES, 'readwrite', (s) => { STORE_NAMES.forEach((name) => s[name].clear()); });
    try { localStorage.removeItem('ld.theme'); } catch { /* storage unavailable */ }
    location.replace('./'); // start fresh on the Main screen
  } catch (err) {
    console.error(err);
    toast('Couldn’t delete the data. Please try again.', { icon: 'info' });
  }
}
