/* Settings. Every change saves immediately. */
import { currentRoute, navigate, registerScreen } from '../core/router.js';
import { registerAction } from '../core/actions.js';
import { emit, on, reloadFromDatabase, state, updateProfile, updateSettings } from '../core/state.js';
import { dataAttrs, html, raw, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { avatar, pageHead } from '../core/components.js';
import { confirmDialog, openDialog, toast } from '../core/ui.js';
import { tx } from '../core/db.js';
import { STORE_NAMES } from '../core/schema.js';
import { APP } from '../core/config.js';
import { formatAgo, formatDateTime } from '../core/dates.js';
import { isIOS, isStandalone, prefersReducedMotion } from '../core/platform.js';
import { SPLITS } from '../modules/workout.js';
import { importHevyFile } from '../modules/workout/transfer.js';
import { wakeLockSupported } from '../services/wake-lock.js';
import {
  ARM_NAMES, COMPLETED_MODES, PRIORITIES, PRIORITY_KEYS, QUICK_ACTIONS, QUICK_ARMS, SORTS, VIEWS, quickActionReady, quickArms,
} from '../modules/todo/model.js';
import { loadTodo } from '../modules/todo/store.js';
import { reminderSettings } from '../modules/todo/alerts.js';
import {
  CAL_REASONS, addTimedFromToday, cachedCalendarStatus, calendarAvailability, calendarTryAgain, countTimedFromToday, fetchCalendarStatus,
} from '../modules/todo/calendar-link.js';
import { isClock } from '../core/manila.js';
import { ensureSampleData } from '../services/sample-data.js';
import {
  applyRestore, buildBackup, deliverBackupFile, lastBackupAt, markBackedUp, prepareBackupFile,
  readBackupFile, validateBackup,
} from '../services/backup.js';
import {
  LATEST_SCRIPT_VERSION, connectSync, disconnectSync, setAutoSync, syncNow, syncScriptVersion, syncSnapshot, syncStatusText,
} from '../services/sync.js';
import { wardLists } from '../modules/ward/engine.js';
import { imageFileToAvatar } from '../services/images.js';
import { formatBytes, storageInfo } from '../services/storage.js';
import { offlineLabel } from '../services/pwa.js';

let root = null;
let nicknameTimer = null;
let renderedConnected = null;
let renderedOutdated = null;

const THEMES = [['system', 'System', 'monitor'], ['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']];
const SPLIT_LABELS = { ppl: 'Push · Pull · Legs', body: 'Body-part split' };
const REST_PRESETS = [30, 60, 90, 120, 180];
const EXERCISE_REST = [['same', 'Same as between sets'], [0, 'Off'], [60, '1 min'], [90, '1 min 30 sec'], [120, '2 min'],
  [150, '2 min 30 sec'], [180, '3 min'], [240, '4 min'], [300, '5 min']];
const EFFORTS = [['rir', 'RIR'], ['rpe', 'RPE'], ['off', 'Off']];
const INTEGRATIONS = [
  { name: 'Google Calendar', desc: 'Today’s events on your dashboard', icon: 'calendar', accent: 'accent-brand' },
  { name: 'Apple Health weight', desc: 'Send your latest weight with an Apple Shortcut', icon: 'heart', accent: 'accent-neuro' },
];

/** A settings row that opens the native picker. options: [[value, label], …]; data: extra data-* attributes. */
function pickerRow({ field, iconName, label, value, options, data = {} }) {
  const current = options.find(([v]) => String(v) === String(value)) ?? options[0];
  return html`<label class="row row--icon row--picker">
    <span class="row__icon">${icon(iconName)}</span>
    <span class="row__text"><span class="row__label">${label}</span></span>
    <span class="row__value"><span data-picker-value>${current[1]}</span>${icon('chevronUpDown')}</span>
    <select class="row__picker" data-field="${field}"${dataAttrs(data)} aria-label="${label}">
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
  registerAction('settings:tasks', () => openSection('settings-tasks'));
  registerAction('calendar:check', async () => {
    const slot = root?.querySelector('[data-slot="calendar"]');
    if (slot) setHTML(slot, calendarSection(cachedCalendarStatus(), true));
    const missing = cachedCalendarStatus()?.calendar?.state === 'missing';
    const status = await calendarTryAgain({ create: missing });
    calendarCheckedAt = Date.now();
    await fillCalendar(false);
    if (status?.ok) toast(status.pending ? 'Google Calendar is catching up — the rest follows within 30 minutes.' : 'Google Calendar is up to date.', { icon: 'calendarCheck' });
    else toast('Google Calendar didn’t answer. Your tasks keep their reminders in the app.', { icon: 'info' });
  });
  registerAction('settings:quick-reset', async () => {
    await save((s) => { s.tasks.quickMenu = { up: null, right: null, down: null, left: null }; });
    updateQuickMenu();
    toast('Quick menu reset.', { icon: 'refresh' });
  });
  registerAction('settings:remove-photo', removePhoto);
  registerAction('settings:delete', deleteAllData);
  registerAction('settings:goal', (el) => changeGoal(Number(el.dataset.dir)));
  registerAction('backup:export', runExport);
  registerAction('sync:setup', openSyncSetup);
  registerAction('sync:update', openScriptUpdate);
  registerAction('sync:now', runSyncNow);
  registerAction('sync:disconnect', disconnect);

  on('profile', ({ source }) => { if (source !== 'settings' && isVisible()) render(); });
  on('settings', ({ source }) => { if ((source === 'sync' || source === 'restore') && isVisible()) render(); });
  on('sync', updateSyncStatus);
  on('backup', updateLastBackup);
  on('ward', updateNeurology);
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

/** What updating the sync script brings, for the script this device last talked to. */
function scriptUpdateFor() {
  const version = syncScriptVersion() ?? 1;
  if (version < 2) return 'your tasks, workout templates, exercises and Ward Patients';
  if (version < 4) return 'your tasks and Ward Patients';
  if (version < 5) return 'your tasks and your patient lists';
  return 'your patient lists (columns, moving rows, and syncing the lists)';
}

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
      ${s.scriptOutdated ? html`<button type="button" class="row row--icon accent-workout" data-action="sync:update" data-slot="scriptUpdate">
        <span class="row__icon">${icon('sparkles')}</span>
        <span class="row__text"><span class="row__label">Update the sync script</span><span class="row__sub">A 2-minute update in your Google Sheet, needed for ${scriptUpdateFor()}</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>` : ''}
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

/** Patient lists: each list's logsheet on this device (the same options as on the list's ⋯ menu). */
function neurologySection() {
  const lists = wardLists();
  return html`<h2 class="group__title" id="set-neuro-title">Neurology</h2>
    <div class="card group__card accent-neuro">
      ${lists.map((l) => html`<button type="button" class="row row--icon" data-action="ward:list-settings" data-list="${l.id}">
        <span class="row__icon">${icon('stethoscope')}</span>
        <span class="row__text"><span class="row__label">${l.name}</span>
          <span class="row__sub">${l.link ? `${l.link.title || 'Logsheet'} · ${l.link.tab}${l.link.test ? ' (practice logsheet)' : ''}` : 'No logsheet linked on this device'}</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>`)}
      <button type="button" class="row row--icon" data-action="ward:new-list">
        <span class="row__icon">${icon('plus')}</span>
        <span class="row__text"><span class="row__label">New patient list</span><span class="row__sub">Another list with its own logsheet or tab</span></span>
      </button>
    </div>
    <p class="group__foot">Patient lists are in the Neurology tab. Their names and columns sync between your devices; each logsheet link is kept on this device only — it’s never synced, backed up or put in the app’s code.</p>`;
}

function updateNeurology() {
  const slot = root?.querySelector('[data-slot="neurology"]');
  if (slot && isVisible()) setHTML(slot, neurologySection());
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
      <button type="button" class="row row--icon accent-todo" data-action="todo:export">
        <span class="row__icon">${icon('download')}</span>
        <span class="row__text"><span class="row__label">Export tasks (CSV)</span><span class="row__sub">Opens in Excel, Numbers or Google Sheets</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
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
  renderedOutdated = syncSnapshot().scriptOutdated;

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
          <span class="row__text"><span class="row__label" id="lbl-rest">Rest between sets</span><span class="row__sub">Each exercise can have its own — set it while logging or in the exercise library</span></span>
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
        ${pickerRow({ field: 'exerciseRest', iconName: 'arrowRight', label: 'Rest between exercises',
          value: s.workout.exerciseRestSeconds ?? 'same', options: EXERCISE_REST })}
        <label class="row row--icon">
          <span class="row__icon">${icon('volume')}</span>
          <span class="row__text"><span class="row__label">Chime when rest is over</span><span class="row__sub">Two notes before your next set, three before your next exercise, while the app is open${isIOS() ? '. iPhone gives a light tap instead of vibrating.' : ''}</span></span>
          <input type="checkbox" class="switch" switch data-field="restAlert"${checked(s.workout.restAlert)}>
        </label>
        ${isIOS() ? html`<label class="row row--icon">
          <span class="row__icon">${icon('bell')}</span>
          <span class="row__text"><span class="row__label">Chime even on silent</span><span class="row__sub">Plays when your iPhone is on silent too — but music apps like Spotify pause while it plays. Off: the chime plays over your music, and stays quiet on silent.</span></span>
          <input type="checkbox" class="switch" switch data-field="restOnSilent"${checked(s.workout.restOnSilent)}${s.workout.restAlert ? '' : raw(' disabled')}>
        </label>` : ''}
        <div class="row row--stack row--icon">
          <span class="row__icon">${icon('pulse')}</span>
          <span class="row__text"><span class="row__label" id="lbl-effort">Effort column</span><span class="row__sub">RIR = reps in reserve · RPE = rate of perceived exertion (1–10)</span></span>
          <div class="segmented row__full" role="radiogroup" aria-labelledby="lbl-effort">
            ${EFFORTS.map(([value, label]) => html`<label class="segmented__opt"><input type="radio" name="effort" value="${value}" data-field="effort"${checked(s.workout.effort === value)}><span>${label}</span></label>`)}
          </div>
        </div>
        <label class="row row--icon">
          <span class="row__icon">${icon('eye')}</span>
          <span class="row__text"><span class="row__label">Keep screen on during workouts</span>${wakeLockSupported() ? '' : html`<span class="row__sub">Not supported by this browser</span>`}</span>
          <input type="checkbox" class="switch" switch data-field="keepAwake"${checked(s.workout.keepAwake)}${wakeLockSupported() ? '' : raw(' disabled')}>
        </label>
        <div class="row row--icon">
          <span class="row__icon">${icon('scale')}</span>
          <span class="row__text"><span class="row__label">Units</span></span>
          <span class="row__value">Kilograms (kg)</span>
        </div>
        <button type="button" class="row row--icon" data-action="nav" data-route="workout" data-sub="exercises">
          <span class="row__icon">${icon('list')}</span>
          <span class="row__text"><span class="row__label">Exercise library</span><span class="row__sub">Favourites, notes, rest times and your own exercises</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
    </section>

    <section class="group" aria-labelledby="set-hevy-title">
      <h2 class="group__title" id="set-hevy-title">Hevy</h2>
      <div class="card group__card accent-workout">
        <label class="row row--icon">
          <span class="row__icon">${icon('download')}</span>
          <span class="row__text"><span class="row__label">Import from Hevy (CSV)…</span><span class="row__sub">Your Hevy history, merged into your workouts. Workouts you already have are skipped.</span></span>
          <input class="sr-only" type="file" accept=".csv,text/csv" data-field="hevyImport">
          ${icon('chevronRight', 'row__chev')}
        </label>
        <button type="button" class="row row--icon" data-action="workout:export">
          <span class="row__icon">${icon(isIOS() ? 'share' : 'upload')}</span>
          <span class="row__text"><span class="row__label">Export workouts (CSV)</span><span class="row__sub">Same columns as Hevy’s export, in kg — opens in Numbers, Excel or Google Sheets</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
      <p class="group__foot">To get the file: in the Hevy app, open Settings → Export &amp; Import Data → Export Workouts, and save it to Files. Hevy has no public sync, so this is a one-way import you can repeat any time.</p>
    </section>

    <section class="group" id="settings-tasks" aria-labelledby="set-tasks-title">
      <h2 class="group__title" id="set-tasks-title">Tasks</h2>
      <div class="card group__card accent-todo">
        ${pickerRow({ field: 'taskView', iconName: 'sun', label: 'Opens on', value: s.tasks.view,
          options: Object.entries(VIEWS).map(([v, info]) => [v, info.label]) })}
        ${pickerRow({ field: 'sort', iconName: 'sort', label: 'Sort order', value: s.tasks.sort, options: Object.entries(SORTS) })}
        <label class="row row--icon">
          <span class="row__icon">${icon('refresh')}</span>
          <span class="row__text"><span class="row__label">Sort automatically</span><span class="row__sub">When off, tasks stay where they are until you choose Sort now</span></span>
          <input type="checkbox" class="switch" switch data-field="autoSort"${checked(s.tasks.autoSort)}>
        </label>
        ${pickerRow({ field: 'completed', iconName: 'checkCircle', label: 'Completed tasks', value: s.tasks.completed, options: Object.entries(COMPLETED_MODES) })}
        <button type="button" class="row row--icon" data-action="todo:views">
          <span class="row__icon">${icon('list')}</span>
          <span class="row__text"><span class="row__label">Views</span><span class="row__sub">Which views show at the top of To Do, and their order</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        ${pickerRow({ field: 'taskDensity', iconName: 'sliders', label: 'List spacing', value: s.tasks.density, options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] })}
        ${pickerRow({ field: 'taskPriority', iconName: 'flag', label: 'New tasks: priority', value: s.tasks.defaultPriority,
          options: PRIORITY_KEYS.map((p) => [p, PRIORITIES[p].label]) })}
        <div data-slot="taskCategory">${pickerRow({ field: 'taskCategory', iconName: 'layers', label: 'New tasks: category', value: '', options: [['', 'No category']] })}</div>
        <button type="button" class="row row--icon" data-action="nav" data-route="todo" data-sub="categories">
          <span class="row__icon">${icon('layers')}</span>
          <span class="row__text"><span class="row__label">Categories</span><span class="row__sub">Add, rename, recolour, reorder or delete</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        <button type="button" class="row row--icon" data-action="todo:help">
          <span class="row__icon">${icon('help')}</span>
          <span class="row__text"><span class="row__label">How to type tasks</span><span class="row__sub">Dates, times, !!! priority, #category and @tag in plain words; keys and swipes</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
      <p class="group__foot">Smart sorting puts overdue tasks first, then High, Medium, Low and no priority, earliest time first. Tasks follow Manila time. The Google Calendar link, the focus timer and habits arrive in the next updates.</p>
    </section>

    <section class="group" id="settings-reminders" aria-labelledby="set-rem-title">${remindersSection()}</section>

    <section class="group" id="settings-calendar" aria-labelledby="set-cal-title" data-slot="calendar">${calendarSection(null, true)}</section>

    <section class="group" id="settings-quickmenu" aria-labelledby="set-quick-title" data-slot="quickMenu">${quickMenuSection()}</section>

    <section class="group" id="settings-neurology" aria-labelledby="set-neuro-title" data-slot="neurology">${neurologySection()}</section>

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
  fillTaskCategories();
  fillCalendar();
}

/* ---------- Google Calendar ---------- */

/** The top line of Settings → Google Calendar: does the link work? */
function calendarLine(status, available, checking) {
  if (!available.ok) {
    return { tone: 'warn', icon: 'info', label: available.reason === 'no-sync' ? 'Needs sync' : 'Needs the updated sync script', sub: available.message, button: '' };
  }
  if (checking && !status) return { tone: 'neutral', icon: 'refresh', label: 'Checking Google Calendar…', sub: 'Asking your Google Sheet.', button: 'Check' };
  if (!status || status.ok === false) {
    const needsAuth = status?.error === 'calendar-needs-auth';
    return {
      tone: 'warn', icon: 'info',
      label: needsAuth ? 'Needs permission' : 'Google Calendar didn’t answer',
      sub: needsAuth ? CAL_REASONS['calendar-needs-auth'] : 'Tasks keep their reminders in the app meanwhile. Try again in a moment.',
      button: 'Try again',
    };
  }
  const cal = status.calendar ?? {};
  if (cal.state === 'missing') {
    return { tone: 'warn', icon: 'info', label: 'Calendar missing', sub: 'It was deleted or can’t be found. Try again makes “Life Dashboard Tasks” again — or choose another calendar below.', button: 'Try again' };
  }
  if (cal.state === 'not-created') {
    return { tone: 'ok', icon: 'calendarCheck', label: 'Ready', sub: 'The “Life Dashboard Tasks” calendar is made when you add your first task to Google Calendar.', button: 'Check' };
  }
  if (!status.timer) {
    return { tone: 'warn', icon: 'info', label: `Linked to “${cal.name}”`, sub: 'The 30-minute check (for follow-ups and deleted events) isn’t running — tap Try again.', button: 'Try again' };
  }
  return {
    tone: 'ok', icon: 'calendarCheck', label: `Linked to “${cal.name}”`,
    sub: status.lastCheckAt ? `Checked ${formatAgo(status.lastCheckAt)} · every 30 minutes` : 'Checks every 30 minutes',
    button: 'Check',
  };
}

/** Settings → Google Calendar. status: the script's answer (null while checking). */
function calendarSection(status, checking = false) {
  const cal = { calendarId: '', completed: 'rename', always: false, ...(state.settings.tasks.calendar ?? {}) };
  const available = calendarAvailability();
  const line = calendarLine(status, available, checking);
  const made = status?.calendar && !cal.calendarId ? status.calendar.id : ''; // "Life Dashboard Tasks", listed first
  // "Life Dashboard Tasks" is the first choice (value ''), so it isn't listed again among your calendars
  const options = [['', 'Life Dashboard Tasks (made for you)'], ...(status?.calendars ?? [])
    .filter((c) => c.id !== made && !(c.name === 'Life Dashboard Tasks' && c.id !== cal.calendarId)).map((c) => [c.id, c.name])];
  if (cal.calendarId && !options.some(([v]) => v === cal.calendarId)) options.push([cal.calendarId, status ? 'A calendar that can’t be found' : 'Your chosen calendar']);
  return html`<h2 class="group__title" id="set-cal-title">Google Calendar</h2>
    <div class="card group__card accent-todo">
      <div class="row row--icon cal-line is-${line.tone}">
        <span class="row__icon">${icon(line.icon)}</span>
        <span class="row__text"><span class="row__label">${line.label}</span><span class="row__sub">${line.sub}</span></span>
        ${line.button ? html`<button type="button" class="btn btn--sm cal-line__btn" data-action="calendar:check"${raw(checking ? ' disabled' : '')}>${line.button}</button>` : ''}
      </div>
      ${available.ok ? html`
        ${pickerRow({ field: 'calendarId', iconName: 'calendar', label: 'Put tasks in', value: cal.calendarId, options })}
        <label class="row row--icon">
          <span class="row__icon">${icon('clock')}</span>
          <span class="row__text"><span class="row__label">Always add timed tasks</span><span class="row__sub">New tasks and subtasks with a time go to Calendar by themselves</span></span>
          <input type="checkbox" class="switch" switch data-field="calendarAlways"${checked(cal.always)}>
        </label>
        ${pickerRow({ field: 'calendarCompleted', iconName: 'checkCircle', label: 'When a task is done', value: cal.completed,
          options: [['rename', 'Mark it ✓'], ['remove', 'Remove it']] })}` : ''}
    </div>
    <p class="group__foot">Switch on <strong>Add to Google Calendar</strong> in a task (or type “cal”): it becomes an event with its reminders as alerts, so they ring even on a locked phone — and the app stays quiet for it. Alerts come from the Google account that owns your Life Dashboard sheet. To try it safely, make a calendar called “Practice tasks” in Google Calendar and choose it above; choose “Life Dashboard Tasks” later and the events move there.</p>`;
}

let calendarCheckedAt = 0;

/** Fill Settings → Google Calendar with what the script says (asked at most once a minute unless you tap Check). */
async function fillCalendar(force = false) {
  const slot = root?.querySelector('[data-slot="calendar"]');
  if (!slot) return;
  if (!calendarAvailability().ok) {
    setHTML(slot, calendarSection(null));
    return;
  }
  const cached = cachedCalendarStatus();
  if (cached && !force && Date.now() - calendarCheckedAt < 60_000) {
    setHTML(slot, calendarSection(cached));
    return;
  }
  setHTML(slot, calendarSection(cached, true));
  const status = await fetchCalendarStatus();
  calendarCheckedAt = Date.now();
  const again = root?.querySelector('[data-slot="calendar"]');
  if (again) setHTML(again, calendarSection(status));
}

/** Tap a task: Complete in the middle, and these four arms. */
const FOLLOW_EVERY = [[30, 'Every 30 min'], [60, 'Every hour'], [120, 'Every 2 hours'], [180, 'Every 3 hours'], [240, 'Every 4 hours']];

/** Settings → Reminders: for new tasks, for tasks without a time, and "Still not done" follow-ups. */
function remindersSection() {
  const t = state.settings.tasks;
  const rs = reminderSettings(t);
  const f = rs.followUps;
  const every = FOLLOW_EVERY.some(([m]) => m === f.minutes) ? FOLLOW_EVERY : [...FOLLOW_EVERY, [f.minutes, `Every ${f.minutes} min`]];
  return html`<h2 class="group__title" id="set-rem-title">Reminders</h2>
    <div class="card group__card accent-todo">
      ${pickerRow({ field: 'newTaskReminder', iconName: 'bell', label: 'New tasks: reminder', value: Number.isFinite(t.newTaskReminder) ? t.newTaskReminder : '',
        options: [['', 'None'], [0, 'At the time'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before']] })}
      <label class="row row--icon">
        <span class="row__icon">${icon('clock')}</span>
        <span class="row__text"><span class="row__label">Tasks without a time</span><span class="row__sub">Their reminders count from this time</span></span>
        <input type="time" class="input row__time" data-field="defaultTime" value="${rs.defaultTime}" aria-label="Reminder time for tasks without a time">
      </label>
      <label class="row row--icon">
        <span class="row__icon">${icon('volume')}</span>
        <span class="row__text"><span class="row__label">Keep ringing until I stop it</span><span class="row__sub">The chime repeats every few seconds until you tap Complete, Snooze, Stop or Open. Google Calendar alerts ring once, as usual.</span></span>
        <input type="checkbox" class="switch" switch data-field="keepRinging"${checked(Boolean(t.keepRinging))}>
      </label>
      <label class="row row--icon">
        <span class="row__icon">${icon('repeat')}</span>
        <span class="row__text"><span class="row__label">Remind me again</span><span class="row__sub">“Still not done” after you tap Stop, until the task is ticked</span></span>
        <input type="checkbox" class="switch" switch data-field="followEnabled"${checked(f.enabled)}>
      </label>
      <div class="row-group" data-slot="followRows"${raw(f.enabled ? '' : ' hidden')}>
        ${pickerRow({ field: 'followMinutes', iconName: 'hourglass', label: 'How often', value: f.minutes, options: every })}
        ${pickerRow({ field: 'followLimit', iconName: 'list', label: 'Up to', value: f.limit, options: [1, 2, 3, 4, 5].map((n) => [n, n === 1 ? 'Once' : `${n} times`]) })}
        ${pickerRow({ field: 'followHigh', iconName: 'flag', label: 'High priority', value: f.highMinutes || 0, options: [[0, 'Same as others'], [30, 'Every 30 min'], [60, 'Every hour']] })}
        <label class="row row--icon">
          <span class="row__icon">${icon('moon')}</span>
          <span class="row__text"><span class="row__label">Quiet hours</span><span class="row__sub">Follow-ups wait until they end</span></span>
          <input type="checkbox" class="switch" switch data-field="quietEnabled"${checked(f.quiet)}>
        </label>
        <div class="row row--icon row--times" data-slot="quietTimes"${raw(f.quiet ? '' : ' hidden')}>
          <span class="row__icon" aria-hidden="true"></span>
          <span class="row__text"><span class="row__label">From</span></span>
          <input type="time" class="input row__time" data-field="quietStart" value="${f.quietStart}" aria-label="Quiet hours start">
          <span class="row__to">to</span>
          <input type="time" class="input row__time" data-field="quietEnd" value="${f.quietEnd}" aria-label="Quiet hours end">
        </div>
      </div>
      <button type="button" class="row row--icon" data-action="todo:try-reminder">
        <span class="row__icon">${icon('volume')}</span>
        <span class="row__text"><span class="row__label">Try a reminder</span><span class="row__sub">See and hear what one looks like</span></span>
      </button>
    </div>
    <p class="group__foot">Reminders ring while Life Dashboard is open on your screen — an iPhone limit${isIOS() ? '. Their sound follows Workout → Chime even on silent' : ''}. Anything missed while it was closed is listed when you open it. Google Calendar alerts, which ring on a locked phone too, arrive in the next update.</p>`;
}

function quickMenuSection() {
  const arms = quickArms(state.settings.tasks.quickMenu);
  // Complete is always the middle button, so it isn't offered for the arms
  const options = Object.entries(QUICK_ACTIONS).filter(([id]) => id !== 'complete' && quickActionReady(id)).map(([id, a]) => [id, a.long ?? a.label]);
  return html`<h2 class="group__title" id="set-quick-title">Quick menu (tap a task)</h2>
    <div class="card group__card accent-todo">
      ${QUICK_ARMS.map((arm) => pickerRow({ field: 'quickArm', data: { arm }, label: `${ARM_NAMES[arm]} arm`, value: arms[arm], options,
        iconName: { up: 'arrowUp', right: 'arrowRight', down: 'arrowDown', left: 'arrowLeft' }[arm] }))}
      <button type="button" class="row row--icon" data-action="settings:quick-reset">
        <span class="row__icon">${icon('refresh')}</span>
        <span class="row__text"><span class="row__label">Reset to default</span><span class="row__sub">Reminder, Details, Delete and Focus — with Move to tomorrow and Pin until reminders and the focus timer arrive</span></span>
      </button>
    </div>
    <p class="group__foot">Complete always sits in the middle. Choosing an action that's already on another arm swaps the two.</p>`;
}

function updateQuickMenu() {
  const slot = root?.querySelector('[data-slot="quickMenu"]');
  if (slot && isVisible()) setHTML(slot, quickMenuSection());
}

/** "New tasks: category" lists your categories (they're in the database, not in settings). */
async function fillTaskCategories() {
  const { categories } = await loadTodo();
  const slot = root?.querySelector('[data-slot="taskCategory"]');
  if (!slot) return;
  const list = [...categories.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const value = categories.has(state.settings.tasks.defaultCategoryId) ? state.settings.tasks.defaultCategoryId : '';
  setHTML(slot, pickerRow({ field: 'taskCategory', iconName: 'layers', label: 'New tasks: category', value,
    options: [['', 'No category'], ...list.map((c) => [c.id, c.name])] }));
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
  if (snapshot.connected !== renderedConnected || snapshot.scriptOutdated !== renderedOutdated) {
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
      case 'effort':
        await save((s) => { s.workout.effort = el.value; });
        break;
      case 'restAlert': {
        await save((s) => { s.workout.restAlert = el.checked; });
        const onSilent = root.querySelector('[data-field="restOnSilent"]');
        if (onSilent) onSilent.disabled = !el.checked;
        break;
      }
      case 'restOnSilent':
        await save((s) => { s.workout.restOnSilent = el.checked; });
        break;
      case 'exerciseRest':
        await save((s) => { s.workout.exerciseRestSeconds = el.value === 'same' ? null : Number(el.value); });
        break;
      case 'keepAwake':
        await save((s) => { s.workout.keepAwake = el.checked; });
        break;
      case 'hevyImport': {
        const file = el.files?.[0];
        el.value = '';
        await importHevyFile(file);
        break;
      }
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
        toast(`Rest between sets: ${restLabel(secs)}.`, { icon: 'hourglass' });
        break;
      }
      case 'taskView':
        await save((s) => { s.tasks.view = el.value; });
        break;
      case 'sort':
        await save((s) => { s.tasks.sort = el.value; });
        break;
      case 'autoSort':
        await save((s) => { s.tasks.autoSort = el.checked; });
        break;
      case 'completed':
        await save((s) => { s.tasks.completed = el.value; });
        break;
      case 'taskPriority':
        await save((s) => { s.tasks.defaultPriority = el.value; });
        break;
      case 'taskDensity':
        await save((s) => { s.tasks.density = el.value; });
        break;
      case 'quickArm': {
        // An action already on another arm swaps places with this arm's old one. Arms
        // you haven't touched stay on "default", so Reminder and Focus appear by themselves.
        const arm = el.dataset.arm;
        await save((s) => {
          const shown = quickArms(s.tasks.quickMenu);
          const other = QUICK_ARMS.find((a) => a !== arm && shown[a] === el.value);
          s.tasks.quickMenu = { ...s.tasks.quickMenu, [arm]: el.value, ...(other ? { [other]: shown[arm] } : {}) };
        });
        updateQuickMenu();
        break;
      }
      case 'taskCategory':
        await save((s) => { s.tasks.defaultCategoryId = el.value || null; });
        break;
      case 'calendarId':
        await save((s) => { s.tasks.calendar = { ...(s.tasks.calendar ?? {}), calendarId: el.value }; });
        toast('Moving your tasks’ events there…', { icon: 'calendar' });
        await syncNow(); // the Sheet needs the new choice first
        await calendarTryAgain({ create: false });
        await fillCalendar(true);
        break;
      case 'calendarCompleted':
        await save((s) => { s.tasks.calendar = { ...(s.tasks.calendar ?? {}), completed: el.value }; });
        break;
      case 'calendarAlways': {
        await save((s) => { s.tasks.calendar = { ...(s.tasks.calendar ?? {}), always: el.checked }; });
        if (!el.checked) break;
        const count = await countTimedFromToday();
        if (!count) {
          toast('New tasks with a time will go to Google Calendar.', { icon: 'calendar' });
          break;
        }
        const also = await confirmDialog({
          title: 'Add the ones you have too?',
          message: `You have ${count} open ${count === 1 ? 'task' : 'tasks and subtasks'} with a time, from today on. Add ${count === 1 ? 'it' : 'them'} to Google Calendar as well?`,
          confirmLabel: 'Add them too', cancelLabel: 'Only new ones',
        });
        if (also) {
          const added = await addTimedFromToday();
          toast(`Adding ${added} to Google Calendar.`, { icon: 'calendar' });
        }
        break;
      }
      case 'keepRinging':
        await save((s) => { s.tasks.keepRinging = el.checked; });
        toast(el.checked ? 'Reminders keep ringing until you tap a button. Try one below.' : 'Reminders ring once.', { icon: 'bell' });
        break;
      case 'newTaskReminder':
        await save((s) => { s.tasks.newTaskReminder = el.value === '' ? null : Number(el.value); });
        break;
      case 'defaultTime':
        if (!isClock(el.value)) {
          el.value = reminderSettings(state.settings.tasks).defaultTime;
          break;
        }
        await save((s) => { s.tasks.defaultTime = el.value; });
        break;
      case 'followEnabled':
      case 'followMinutes':
      case 'followLimit':
      case 'followHigh':
      case 'quietEnabled':
      case 'quietStart':
      case 'quietEnd': {
        const value = { followEnabled: el.checked, followMinutes: Number(el.value), followLimit: Number(el.value), followHigh: Number(el.value),
          quietEnabled: el.checked, quietStart: el.value, quietEnd: el.value }[field];
        const key = { followEnabled: 'enabled', followMinutes: 'minutes', followLimit: 'limit', followHigh: 'highMinutes', quietEnabled: 'quiet', quietStart: 'quietStart', quietEnd: 'quietEnd' }[field];
        if ((field === 'quietStart' || field === 'quietEnd') && !isClock(value)) {
          el.value = reminderSettings(state.settings.tasks).followUps[key];
          break;
        }
        await save((s) => { s.tasks.followUps = { ...reminderSettings(s.tasks).followUps, [key]: value }; });
        if (field === 'followEnabled') root.querySelector('[data-slot="followRows"]').hidden = !el.checked;
        if (field === 'quietEnabled') root.querySelector('[data-slot="quietTimes"]').hidden = !el.checked;
        break;
      }
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
      ${fact('Templates', summary.templates ?? 0)}
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
  fetchScriptCode().then((text) => { code = text; });
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

      dlg.querySelector('[data-copy-code]').addEventListener('click', () => copyScriptCode(code, codeUrl));

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

/** Load the sync script's code (to copy), from this app's own files. */
function fetchScriptCode() {
  return fetch('apps-script/Code.gs', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null);
}

async function copyScriptCode(code, codeUrl) {
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
}

/** Steps for replacing the Apps Script code with the latest version (keeps the same Web app URL). */
async function openScriptUpdate() {
  let code = null;
  fetchScriptCode().then((text) => { code = text; });
  const codeUrl = githubFileUrl('apps-script/Code.gs');
  await openDialog({
    variant: 'sheet',
    className: 'setup',
    title: 'Update the sync script',
    body: html`
      <p class="setup__lead">Version ${LATEST_SCRIPT_VERSION} of the sync script links Referrals to your referral census (two-way, with Last and Next Rounds as dates, and dropdown columns like Status written in their own values), syncs referrals you add by hand, and lets a patient list read names, hospital numbers and rounds from the columns you choose. It includes everything before it too: your patient lists’ own columns, readable tabs for your tasks and subtasks, Google Calendar for them, and Ward Patients. Until you update, everything else keeps syncing and anything new stays safely on this device. It’s easiest on a Mac.</p>
      <ol class="setup__steps">
        <li><strong>Copy the new code.</strong>
          <span class="setup__buttons">
            <button type="button" class="btn btn--sm" data-copy-code>${icon('clipboard')}Copy code</button>
            ${codeUrl ? html`<a class="btn btn--sm btn--ghost" href="${codeUrl}" target="_blank" rel="noopener">${icon('external')}View code</a>` : ''}
          </span>
        </li>
        <li><strong>Replace the old code.</strong> Open your Google Sheet → <strong>Extensions → Apps Script</strong>. Click in the code, select everything (<strong>⌘A</strong>), paste (<strong>⌘V</strong>), then click <strong>Save</strong>. Near the top, a line should now read <code>const SCRIPT_VERSION = ${LATEST_SCRIPT_VERSION};</code></li>
        <li><strong>Run setup (once).</strong> In the toolbar, choose <strong>setup</strong> and click <strong>Run</strong>. If Google asks for permission (it does when you’re coming from version 4 or older): <strong>Review permissions</strong> → your account → <strong>Advanced</strong> → <strong>Go to … (unsafe)</strong> → <strong>Allow</strong>. It’s your own script; this adds the new tabs and starts the 30-minute check Google Calendar alerts need.</li>
        <li><strong>Publish it.</strong> Click <strong>Deploy → Manage deployments</strong>, then the pencil (<strong>Edit</strong>). Under Version choose <strong>New version</strong>, then click <strong>Deploy</strong>.</li>
        <li><strong>Check.</strong> Come back here and tap <strong>Check now</strong>.</li>
      </ol>
      <p class="note">${icon('info')}<span>Your Web app URL and secret token stay the same, so there’s nothing to change on your other devices. Don’t create a “New deployment” — that would give you a new URL.</span></p>
      <div class="setup__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="close">Later</button>
        <button type="button" class="btn btn--primary" data-check>Check now</button>
      </div>`,
    onOpen(dlg, close) {
      dlg.querySelector('[data-copy-code]').addEventListener('click', () => copyScriptCode(code, codeUrl));
      const check = dlg.querySelector('[data-check]');
      check.addEventListener('click', async () => {
        check.disabled = true;
        check.textContent = 'Checking…';
        await syncNow();
        check.disabled = false;
        check.textContent = 'Check now';
        const snap = syncSnapshot();
        if (!snap.scriptOutdated) {
          close('done');
          toast('The sync script is up to date. Everything syncs now, your patient lists too.', { icon: 'cloudCheck', duration: 6000 });
        } else if (snap.phase === 'error') {
          toast(snap.error?.message ?? 'Couldn’t reach your Google Sheet.', { icon: 'info', duration: 6000 });
        } else {
          toast(`Your Google Sheet still has the old script. Make sure you chose “New version” and clicked Deploy (version ${LATEST_SCRIPT_VERSION} is needed).`, { icon: 'info', duration: 8000 });
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
