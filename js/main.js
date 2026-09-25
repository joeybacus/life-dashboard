/* Life Dashboard — app start-up. */
import { openDB, onDatabaseBlocked, onDatabaseVersionChange } from './core/db.js';
import { emit, loadState, on, state } from './core/state.js';
import { applyTheme, watchSystemTheme } from './core/theme.js';
import { initActions } from './core/actions.js';
import { initRouter } from './core/router.js';
import { startLiveClocks } from './core/components.js';
import { esc } from './core/html.js';
import { supportsNativeSwitch } from './core/platform.js';
import { toast } from './core/ui.js';
import { toDateKey } from './core/dates.js';
import { ensureDefaults, ensureSampleData } from './services/sample-data.js';
import { registerServiceWorker } from './services/pwa.js';
import { requestPersistentStorage } from './services/storage.js';
import './modules/index.js'; // registers Workout, To Do and Neurology
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

/** When the date changes (after midnight, or when reopening the app), refresh. */
function watchDayChange() {
  let dayKey = toDateKey(new Date());
  const check = async () => {
    const key = toDateKey(new Date());
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

  initActions();
  initDashboard();
  initSettings();
  initRouter();
  startLiveClocks();
  watchDayChange();
  hideBoot();

  registerServiceWorker();
  requestPersistentStorage();
  await maybeShowWelcome();
}

window.addEventListener('unhandledrejection', (event) => console.error('Unhandled error', event.reason));

boot().catch(showBootError);
