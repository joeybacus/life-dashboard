/* Life Dashboard — app start-up. */
import { openDB, onDatabaseBlocked, onDatabaseVersionChange } from './core/db.js';
import { emit, loadState, on, state } from './core/state.js';
import { applyTheme, watchSystemTheme } from './core/theme.js';
import { initActions } from './core/actions.js';
import { initRouter } from './core/router.js';
import { initQuickAdd } from './core/quick-add.js';
import { startLiveClocks } from './core/components.js';
import { esc } from './core/html.js';
import { supportsNativeSwitch } from './core/platform.js';
import { toast } from './core/ui.js';
import { toDateKey } from './core/dates.js';
import { todayKey } from './core/manila.js';
import { ensureDefaults, ensureSampleData } from './services/sample-data.js';
import { registerServiceWorker } from './services/pwa.js';
import { afterBoot, ensureAccess, formatEnds } from './services/access.js';
import { connectSync, initSync, syncSnapshot } from './services/sync.js';
import { requestPersistentStorage } from './services/storage.js';
import './modules/index.js'; // registers Workout, To Do and Neurology
import { initWorkout } from './modules/workout.js';
import { initWard } from './modules/ward/engine.js';
import { initReferrals } from './modules/referrals/store.js';
import { initUnits } from './modules/units/store.js';
import { initGuides } from './modules/clinical/guides.js';
import { initGuideTransfers } from './modules/clinical/guides-transfer.js';
import { initCases } from './modules/clinical/cases.js';
import { initFocusTimer } from './modules/focus/timer.js';
import { initFocusBar } from './modules/focus/page.js';
import { initChimeClock } from './modules/chime/clock.js';
import { initReminders } from './modules/todo/reminders.js';
import { initCalendarLink } from './modules/todo/calendar-link.js';
import { initDriveBackup } from './services/drive-backup.js';
import './modules/search.js'; // search everywhere: ⌘K, /, the + button and the dashboard
import { initDashboard } from './screens/dashboard.js';
import { initSettings } from './screens/settings.js';
import { maybeShowWelcome } from './screens/welcome.js';

const bootEl = document.getElementById('boot');

function hideBoot() {
  bootEl.classList.add('is-hidden');
  setTimeout(() => bootEl.remove(), 500);
}

function showBootError(err) {
  console.error(err);
  bootEl.classList.add('boot--error');
  document.getElementById('boot-msg').innerHTML =
    `Something went wrong while starting.<small>${esc(err?.message ?? err)}</small>` +
    '<button type="button" onclick="location.reload()">Try again</button>';
}

/** When the date changes (after midnight here, or in Manila for tasks, or when reopening the app), refresh. */
function watchDayChange() {
  const dayNow = () => `${toDateKey(new Date())}|${todayKey()}`;
  let dayKey = dayNow();
  const check = async () => {
    const key = dayNow();
    if (key === dayKey) return;
    dayKey = key;
    await ensureSampleData();
    emit('data', { reason: 'new-day' });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60_000);
}

async function boot() {
  document.documentElement.classList.toggle('no-native-switch', !supportsNativeSwitch());

  // The lock comes first: nothing of yours is opened until the password or an invite is accepted
  const access = await ensureAccess();

  onDatabaseBlocked(() => {
    document.getElementById('boot-msg').textContent = 'Please close other Life Dashboard tabs to finish updating.';
  });
  onDatabaseVersionChange(() => {
    toast('A newer version was opened elsewhere.', { action: { label: 'Reload', onClick: () => location.reload() }, duration: 60_000 });
  });

  await openDB();
  await loadState();
  applyTheme(state.settings.appearance.theme);
  watchSystemTheme(() => state.settings.appearance.theme);
  on('settings', ({ prev, next }) => {
    if (prev.appearance.theme !== next.appearance.theme) applyTheme(next.appearance.theme);
  });

  await ensureDefaults();
  await ensureSampleData();
  await initSync(); // reads the sync connection; the first sync starts shortly after
  await initWard(); // Ward Patients: this device's logsheet, rounds and unsaved changes
  await initReferrals(); // Referrals: patients referred to your service
  await initUnits(); // NCCU/ACSU: beds and duty to-dos
  await initGuides(); // Neurology → Guidelines (their PDFs move to and from Google Drive by themselves)
  await initCases(); // Neurology → Cases

  initActions();
  await initWorkout(); // the workout in progress, rest timer and workout bar
  await initFocusTimer(); // a focus session running on this device
  initFocusBar();
  await initChimeClock(); // the Neurology tab's chime clock (in place of the + button)
  initDashboard();
  initSettings();
  initRouter();
  initQuickAdd(); // the + button on every tab
  startLiveClocks();
  watchDayChange();
  hideBoot();
  if (access.fresh && access.kind === 'voucher') toast(`Welcome! Your code works until ${formatEnds(access.ends)}.`, { duration: 8000 });
  afterBoot({ isSyncConnected: () => syncSnapshot().connected, connectSync }); // keeps checking a customer's code with your Sheet
  initReminders(); // to-do reminders ring while the app is open; missed ones are listed
  initCalendarLink(); // linked tasks' Google Calendar events follow their changes
  initDriveBackup(); // the day's backup in Google Drive (sync script 18)
  initGuideTransfers(); // guideline PDFs to and from Google Drive (sync script 20)

  registerServiceWorker();
  requestPersistentStorage();
  await maybeShowWelcome();
}

window.addEventListener('unhandledrejection', (event) => console.error('Unhandled error', event.reason));

boot().catch(showBootError);
