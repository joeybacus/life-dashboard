/* Settings. Every change saves immediately. */
import { currentRoute, navigate, registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { emit, on, reloadFromDatabase, state, updateProfile, updateSettings } from '../core/state.js';
import { html, raw, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { avatar, pageHead } from '../core/components.js';
import { confirmDialog, openDialog, toast } from '../core/ui.js';
import { tx } from '../core/db.js';
import { STORE_NAMES } from '../core/schema.js';
import { APP } from '../core/config.js';
import { formatAgo, formatDateTime } from '../core/dates.js';
import { isIOS, isStandalone, prefersReducedMotion } from '../core/platform.js';
import { SPLITS } from '../modules/workout.js';
import { COMPLETED_OPTIONS, SORT_OPTIONS } from '../modules/todo.js';
import { ensureSampleData } from '../services/sample-data.js';
import {
  applyRestore, buildBackup, deliverBackupFile, lastBackupAt, markBackedUp, prepareBackupFile,
  readBackupFile, validateBackup,
} from '../services/backup.js';
import { connectSync, disconnectSync, setAutoSync, syncNow, syncSnapshot, syncStatusText } from '../services/sync.js';
import { imageFileToAvatar } from '../services/images.js';
import { formatBytes, storageInfo } from '../services/storage.js';
import { offlineLabel } from '../services/pwa.js';

let root = null;
let nicknameTimer = null;
let renderedConnected = null;

const THEMES = [['system', 'System', 'monitor'], ['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']];
const SPLIT_LABELS = { ppl: 'Push · Pull · Legs', body: 'Body-part split' };
const REST_PRESETS = [30, 60, 90, 120, 180];
const REMINDERS = [[0, 'None'], [5, '5 min before'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before']];
const INTEGRATIONS = [
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
const isVisible = () => Boolean(root && !root.hidden);

export function initSettings() {
  registerScreen('settings', { title: 'Settings', icon: 'gear', accent: 'neutral', mount, onShow: render });

  registerAction('settings:profile', () => openSection('settings-profile'));
  registerAction('settings:data', () => openSection('settings-data'));
  registerAction('settings:sync', () => openSection('settings-sync'));
  registerAction('settings:remove-photo', removePhoto);
  registerAction('settings:delete', deleteAllData);
  registerAction('settings:goal', (el) => changeGoal(Number(el.dataset.dir)));
  registerAction('backup:export', runExport);
  registerAction('sync:setup', openSyncSetup);
  registerAction('sync:now', runSyncNow);
  registerAction('sync:disconnect', disconnect);

  on('profile', ({ source }) => { if (source !== 'settings' && isVisible()) render(); });
  on('settings', ({ source }) => { if ((source === 'sync' || source === 'restore') && isVisible()) render(); });
  on('sync', updateSyncStatus);
  on('backup', updateLastBackup);
  setInterval(() => { if (isVisible()) updateSyncStatus(syncSnapshot()); }, 30_000);
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

/* ---------- Sections ---------- */

function syncSection() {
  const s = syncSnapshot();
  if (!s.connected) {
    return html`<section class="group" id="settings-sync" aria-labelledby="set-sync-title">
      <h2 class="group__title" id="set-sync-title">Sync</h2>
      <div class="card group__card">
        <button type="button" class="row row--icon accent-todo" data-action="sync:setup">
          <span class="row__icon">${icon('cloud')}</span>
          <span class="row__text"><span class="row__label">Sync with Google Sheets</span><span class="row__sub">Automatic backup to your own Google Sheet, shared by your iPhone, iPad and Mac</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
      <p class="group__foot">Free. Your data goes only to a Google Sheet that you own.</p>
    </section>`;
  }
  return html`<section class="group" id="settings-sync" aria-labelledby="set-sync-title">
    <h2 class="group__title" id="set-sync-title">Sync</h2>
    <div class="card group__card">
      <div class="row row--icon accent-todo">
        <span class="row__icon">${icon('cloudCheck')}</span>
        <span class="row__text"><span class="row__label">Google Sheets</span><span class="row__sub${s.phase === 'error' ? ' tone-danger' : ''}" data-slot="syncStatus">${syncStatusText(s)}</span></span>
        <button type="button" class="btn btn--sm row__control" data-action="sync:now"${s.phase === 'syncing' ? raw(' disabled') : ''}>Sync now</button>
      </div>
      <label class="row row--icon accent-todo">
        <span class="row__icon">${icon('refresh')}</span>
        <span class="row__text"><span class="row__label">Automatic sync</span><span class="row__sub">Syncs a few seconds after each change, when you open the app, and every few minutes</span></span>
        <input type="checkbox" class="switch" switch data-field="autoSync"${checked(s.auto)}>
      </label>
      <button type="button" class="row row--icon row--danger accent-danger" data-action="sync:disconnect">
        <span class="row__icon">${icon('x')}</span>
        <span class="row__text"><span class="row__label">Disconnect this device</span><span class="row__sub">Stops syncing here. Your Google Sheet and this device’s data are both kept.</span></span>
      </button>
    </div>
    <p class="group__foot">If the same item is changed on two devices, the newest change is kept and the other is saved in the Sheet’s Conflicts tab.</p>
  </section>`;
}

function backupSection() {
  return html`<section class="group" id="settings-backup" aria-labelledby="set-backup-title">
    <h2 class="group__title" id="set-backup-title">Backup</h2>
    <div class="card group__card">
      <button type="button" class="row row--icon accent-brand" data-action="backup:export">
        <span class="row__icon">${icon(isIOS() ? 'share' : 'download')}</span>
        <span class="row__text"><span class="row__label">Export backup (JSON)</span><span class="row__sub" data-slot="lastBackup">A complete copy of everything on this device</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
      <label class="row row--icon accent-brand">
        <span class="row__icon">${icon('upload')}</span>
        <span class="row__text"><span class="row__label">Restore from backup…</span><span class="row__sub">Choose a backup file to bring its data back</span></span>
        <input class="sr-only" type="file" accept=".json,application/json" data-field="restore">
        ${icon('chevronRight', 'row__chev')}
      </label>
      <label class="row row--icon accent-brand">
        <span class="row__icon">${icon('bell')}</span>
        <span class="row__text"><span class="row__label">Backup reminders</span><span class="row__sub">A weekly nudge on the dashboard — skipped while sync is working</span></span>
        <input type="checkbox" class="switch" switch data-field="backupReminders"${checked(state.settings.backup?.reminders)}>
      </label>
    </div>
  </section>`;
}

function render() {
  if (!root) return;
  const s = state.settings;
  const p = state.profile;
  const restCustom = !REST_PRESETS.includes(s.workout.restSeconds);
  renderedConnected = syncSnapshot().connected;

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
      <p class="group__foot">Shown at the top of your dashboard. Photos are saved small, to keep things fast.</p>
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

    ${syncSection()}
    ${backupSection()}

    <section class="group" id="settings-data" aria-labelledby="set-data-title">
      <h2 class="group__title" id="set-data-title">Data</h2>
      <div class="card group__card">
        <label class="row row--icon accent-neutral">
          <span class="row__icon">${icon('sampleData')}</span>
          <span class="row__text"><span class="row__label">Sample data</span><span class="row__sub">Example workouts, tasks and weigh-ins to explore with. Refreshed daily and never synced.</span></span>
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
      <p class="group__foot">${renderedConnected
        ? 'Your data is on this device and in your Google Sheet.'
        : 'Your data is saved on this device only. Turn on sync above to keep a copy in your own Google Sheet.'}</p>
    </section>

    <section class="group" aria-labelledby="set-integrations-title">
      <h2 class="group__title" id="set-integrations-title">Coming later</h2>
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
  updateLastBackup();
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

async function updateLastBackup() {
  const el = root?.querySelector('[data-slot="lastBackup"]');
  if (!el) return;
  const last = await lastBackupAt();
  el.textContent = last ? `Last backup ${formatAgo(last)}` : 'Last backup: never';
}

/** Keep the sync row current without re-rendering the whole screen. */
function updateSyncStatus(snapshot) {
  if (!isVisible()) return;
  if (snapshot.connected !== renderedConnected) {
    render();
    return;
  }
  const status = root.querySelector('[data-slot="syncStatus"]');
  if (status) {
    status.textContent = syncStatusText(snapshot);
    status.classList.toggle('tone-danger', snapshot.phase === 'error');
  }
  const button = root.querySelector('[data-action="sync:now"]');
  if (button) button.disabled = snapshot.phase === 'syncing';
  const auto = root.querySelector('[data-field="autoSync"]');
  if (auto) auto.checked = snapshot.auto;
}

/* ---------- Change handlers ---------- */

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
      case 'autoSync':
        await setAutoSync(el.checked);
        toast(el.checked ? 'Automatic sync is on.' : 'Automatic sync is off. Use “Sync now” when you want to sync.', { icon: 'refresh' });
        break;
      case 'backupReminders':
        await save((s) => { s.backup = { ...s.backup, reminders: el.checked }; });
        emit('backup');
        break;
      case 'restore':
        await startRestore(el);
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

/* ---------- Backup & restore ---------- */

async function runExport() {
  try {
    const file = await prepareBackupFile();
    const result = await deliverBackupFile(file);
    if (result === 'downloaded') toast('Backup saved to your Downloads.', { icon: 'download' });
    else if (result === 'shared') toast('Backup saved.', { icon: 'share' });
    else if (result === 'needs-tap') await offerShare(file);
  } catch (err) {
    console.error(err);
    toast('Export failed. Please try again.', { icon: 'info' });
  }
}

/** iPhone sometimes needs a fresh tap before it opens the share sheet. */
async function offerShare(file) {
  await openDialog({
    variant: 'alert',
    title: 'Your backup is ready',
    body: html`<p class="dlg__msg">Tap Save, then choose where to keep it — for example “Save to Files”.</p>`,
    actions: [{ label: 'Cancel', value: 'cancel', variant: 'ghost' }, { label: 'Save', value: 'save', variant: 'primary' }],
    onOpen(dlg) {
      dlg.querySelector('[data-dialog-value="save"]').addEventListener('click', () => {
        navigator.share({ files: [file], title: file.name })
          .then(() => markBackedUp())
          .then(() => toast('Backup saved.', { icon: 'share' }))
          .catch(() => {});
      });
    },
  });
}

function restorePreview(backup) {
  const { summary } = backup;
  const fact = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return html`<div class="restore">
    <dl class="restore__facts">
      ${fact('Backup date', backup.exportedAt ? formatDateTime(new Date(backup.exportedAt)) : 'Unknown')}
      ${fact('Device', backup.deviceName)}
      ${fact('Workouts', summary.workouts)}
      ${fact('Tasks', summary.tasks)}
      ${fact('Measurements', summary.measurements)}
      ${fact('Photos', summary.photos)}
    </dl>
    ${summary.hasSample ? html`<p class="note">${icon('info')}<span>This backup also includes sample data.</span></p>` : ''}
    <p class="restore__choice"><strong>Merge</strong> combines it with what’s on this device, keeping the newest version of anything that’s in both.</p>
    <p class="restore__choice"><strong>Replace</strong> erases this device’s data and uses only the backup.</p>
    ${syncSnapshot().connected ? html`<p class="note">${icon('cloud')}<span>Sync is on, so the restored data is sent to your Google Sheet. Items in the Sheet that aren’t in this backup will come back after the next sync.</span></p>` : ''}
  </div>`;
}

async function startRestore(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let backup;
  try {
    backup = await readBackupFile(file);
  } catch (err) {
    toast(err.message, { icon: 'info', duration: 6000 });
    return;
  }
  const choice = await openDialog({
    variant: 'modal',
    className: 'restore-dialog',
    title: 'Restore this backup?',
    body: restorePreview(backup),
    actions: [
      { label: 'Cancel', value: 'cancel', variant: 'ghost', autofocus: true },
      { label: 'Merge', value: 'merge' },
      { label: 'Replace', value: 'replace', variant: 'danger-solid' },
    ],
  });
  if (choice !== 'merge' && choice !== 'replace') return;

  const before = validateBackup(await buildBackup()); // for Undo
  try {
    await applyRestore(backup, choice);
  } catch (err) {
    console.error(err);
    toast('Restore failed, so nothing was changed.', { icon: 'info' });
    return;
  }
  await afterRestore();
  toast(choice === 'merge' ? 'Backup merged.' : 'Backup restored.', {
    icon: 'upload',
    action: {
      label: 'Undo',
      onClick: async () => {
        await applyRestore(before, 'replace');
        await afterRestore();
        toast('Restore undone.', { icon: 'upload' });
      },
    },
  });
}

async function afterRestore() {
  await reloadFromDatabase('restore');
  await ensureSampleData();
  emit('data', { reason: 'restore' });
  emit('local-change', { store: 'restore' });
  render();
}

/* ---------- Sync ---------- */

/** Link to a file in the GitHub repository this app is published from (if any). */
function githubFileUrl(path) {
  const user = location.hostname.match(/^([^.]+)\.github\.io$/)?.[1];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return user && repo ? `https://github.com/${user}/${repo}/blob/main/${path}` : null;
}

async function openSyncSetup() {
  let code = null;
  fetch('apps-script/Code.gs', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.text() : null))
    .then((text) => { code = text; })
    .catch(() => {});
  const codeUrl = githubFileUrl('apps-script/Code.gs');

  await openDialog({
    variant: 'sheet',
    className: 'setup',
    title: 'Sync with Google Sheets',
    body: html`
      <p class="setup__lead">Your data will sync to a Google Sheet that only you own. Setting it up takes about 10 minutes, once — it’s easiest on a Mac.</p>
      <p class="note">${icon('info')}<span>Already set up on another device? Skip to the bottom and paste the same Web app URL and secret token.</span></p>
      <ol class="setup__steps">
        <li><strong>Create a sheet.</strong> At sheets.google.com, create a blank spreadsheet, then choose <strong>Extensions → Apps Script</strong>.</li>
        <li><strong>Paste the sync code.</strong> Delete what’s in the editor, paste this code, then click Save.
          <span class="setup__buttons">
            <button type="button" class="btn btn--sm" data-copy-code>${icon('clipboard')}Copy code</button>
            ${codeUrl ? html`<a class="btn btn--sm btn--ghost" href="${codeUrl}" target="_blank" rel="noopener">${icon('external')}View code</a>` : ''}
          </span>
        </li>
        <li><strong>Run setup.</strong> Choose <code>setup</code> in the toolbar and click <strong>Run</strong>, then allow access. Your secret token appears in the sheet’s <strong>Connection</strong> tab.</li>
        <li><strong>Deploy.</strong> Click <strong>Deploy → New deployment</strong>, pick <strong>Web app</strong>, set “Execute as” to <strong>Me</strong> and “Who has access” to <strong>Anyone</strong>, then copy the Web app URL.</li>
      </ol>
      <form class="setup__form" data-connect novalidate>
        <label class="field"><span class="field__label">Web app URL</span>
          <input class="input" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" required>
        </label>
        <label class="field"><span class="field__label">Secret token</span>
          <input class="input" name="token" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required>
        </label>
        <p class="form-error" data-error role="alert" hidden></p>
        <div class="setup__actions">
          <button type="button" class="btn btn--ghost" data-dialog-value="cancel">Cancel</button>
          <button type="submit" class="btn btn--primary" data-submit>Connect</button>
        </div>
      </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-connect]');
      const error = dlg.querySelector('[data-error]');
      const submit = dlg.querySelector('[data-submit]');

      dlg.querySelector('[data-copy-code]').addEventListener('click', async () => {
        if (!code) {
          toast(navigator.onLine ? 'Still loading the code — try again in a moment.' : 'Connect to the internet to copy the code.', { icon: 'info' });
          return;
        }
        try {
          await navigator.clipboard.writeText(code);
          toast('Code copied. Paste it into Apps Script.', { icon: 'check' });
        } catch {
          toast(codeUrl ? 'Couldn’t copy here — use “View code” instead.' : 'Couldn’t copy the code on this device.', { icon: 'info' });
        }
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.hidden = true;
        submit.disabled = true;
        submit.textContent = 'Connecting…';
        try {
          const ok = await connectSync({ url: form.url.value, token: form.token.value });
          close('connected');
          toast(ok ? 'Connected. Your data is syncing with your Google Sheet.' : `Connected, but the first sync didn’t finish: ${syncSnapshot().error?.message ?? 'it will try again.'}`, { icon: 'cloud', duration: 6000 });
          render();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        } finally {
          submit.disabled = false;
          submit.textContent = 'Connect';
        }
      });
    },
  });
}

async function runSyncNow() {
  const ok = await syncNow();
  if (ok) toast('Synced with your Google Sheet.', { icon: 'cloudCheck' });
  else if (syncSnapshot().phase === 'offline') toast('You’re offline. Changes will sync when you’re back online.', { icon: 'info' });
  else toast(syncSnapshot().error?.message ?? 'Sync didn’t finish.', { icon: 'info', duration: 6000 });
}

async function disconnect() {
  const ok = await confirmDialog({
    title: 'Disconnect this device?',
    message: 'This device will stop syncing. Your Google Sheet and the data on this device are both kept, and you can reconnect any time.',
    confirmLabel: 'Disconnect',
    destructive: true,
  });
  if (!ok) return;
  await disconnectSync();
  render();
  toast('This device is no longer syncing.', { icon: 'cloud' });
}

/* ---------- Delete everything ---------- */

async function deleteAllData() {
  const ok = await confirmDialog({
    title: 'Delete all data?',
    message: syncSnapshot().connected
      ? 'This erases everything stored on this device and disconnects sync. Your Google Sheet is not touched, so you can reconnect to bring your data back.'
      : 'This permanently erases everything stored on this device: profile, settings, tasks and workouts. Export a backup first if you might need it.',
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
