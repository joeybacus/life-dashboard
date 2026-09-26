/* App-wide state: the settings and profile records (synced), per-device UI
   state, and the event bus. Screens listen for 'settings', 'profile' and
   'data' events to refresh. */
import { db } from './db.js';
import { saveRecord } from './records.js';
import { on, emit } from './events.js';
import { nowISO } from './dates.js';

export { on, emit };

export const DEFAULT_SETTINGS = {
  id: 'app',
  appearance: {
    theme: 'dark',          // 'dark' | 'light' | 'system'
    swipeNavigation: true,  // swipe left/right between tabs on touch screens
  },
  dashboard: {
    order: ['workout', 'todo', 'neurology'],   // module card order (drag to change); shared by all devices
  },
  workout: {
    split: 'ppl',           // 'ppl' (Push/Pull/Legs) | 'body' (body-part split)
    weeklyGoal: 4,          // workouts per week (drives the Workout card ring)
    restSeconds: 90,        // default rest timer (used from Phase 2)
    units: 'kg',            // kilograms only
  },
  tasks: {
    sort: 'smart',          // 'smart' | 'priority' | 'time' | 'recent' | 'category'
    completed: 'keep',      // 'keep' | 'move' | 'hide'
    defaultReminder: 30,    // minutes before; 0 = none (used from Phase 6)
  },
  backup: {
    reminders: true,        // weekly "back up your data" nudge (not shown while sync works)
  },
  sampleData: {
    enabled: true,          // show generated example data
    calendar: true,         // show sample calendar events
  },
};

export const DEFAULT_PROFILE = { id: 'me', nickname: '', photo: null };

/** Per-device UI state (never synced): which dashboard cards are folded. */
const DEFAULT_UI = { collapsed: { neurology: true } };

export const state = { settings: null, profile: null, ui: null };

/** Did a settings section change? e.g. changed(prev, next, 'workout') */
export const changed = (prev, next, key) => JSON.stringify(prev?.[key]) !== JSON.stringify(next?.[key]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Fill in any settings added in newer versions without touching saved choices. */
function withDefaults(defaults, saved) {
  const out = structuredClone(defaults);
  for (const [key, value] of Object.entries(saved ?? {})) {
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? withDefaults(out[key], value) : value;
  }
  return out;
}

export async function loadState() {
  const [savedSettings, savedProfile, savedUI] = await Promise.all([
    db.get('settings', 'app'), db.get('profile', 'me'), db.get('meta', 'ui'),
  ]);
  const now = nowISO();

  state.settings = withDefaults(DEFAULT_SETTINGS, savedSettings);
  state.profile = { ...DEFAULT_PROFILE, ...(savedProfile ?? {}) };
  // Folded cards used to live in settings (v0.1); carry them over once
  state.ui = withDefaults(DEFAULT_UI, savedUI?.value
    ?? (savedSettings?.dashboard?.collapsed ? { collapsed: savedSettings.dashboard.collapsed } : {}));

  // Records created here keep createdAt === updatedAt until first changed ("pristine"),
  // so a new device never overrides settings already saved in Google Sheets.
  if (!savedSettings) {
    state.settings = { ...state.settings, createdAt: now, updatedAt: now, deletedAt: null };
    await db.put('settings', state.settings);
  }
  if (!savedProfile) {
    state.profile = { ...state.profile, createdAt: now, updatedAt: now, deletedAt: null };
    await db.put('profile', state.profile);
  }
}

/* Saves run one at a time, each on top of the previous result, so quick
   successive changes (e.g. tapping two cards fast) can't overwrite each other. */
let saveQueue = Promise.resolve();
function queued(task) {
  const run = saveQueue.then(task, task);
  saveQueue = run.catch(() => {});
  return run;
}

/** Change settings with a mutator function, save immediately, then notify listeners. */
export function updateSettings(mutate, { source } = {}) {
  return queued(async () => {
    const prev = state.settings;
    const next = structuredClone(prev);
    mutate(next);
    next.updatedAt = nowISO();
    await saveRecord('settings', next, { source });
    state.settings = next;
    emit('settings', { prev, next, source });
    return next;
  });
}

export function updateProfile(patch, { source } = {}) {
  return queued(async () => {
    const prev = state.profile;
    const next = { ...prev, ...patch, updatedAt: nowISO() };
    await saveRecord('profile', next, { source });
    state.profile = next;
    emit('profile', { prev, next, source });
    return next;
  });
}

/** Change this device's UI state (not synced). */
export function updateUI(mutate) {
  return queued(async () => {
    const next = structuredClone(state.ui);
    mutate(next);
    await db.put('meta', { key: 'ui', value: next });
    state.ui = next;
    return next;
  });
}

/** Re-read settings and profile after sync or a restore changed them in the database. */
export function reloadFromDatabase(source = 'sync') {
  return queued(async () => {
    const [settings, profile] = await Promise.all([db.get('settings', 'app'), db.get('profile', 'me')]);
    const prevSettings = state.settings;
    const prevProfile = state.profile;
    if (settings) state.settings = withDefaults(DEFAULT_SETTINGS, settings);
    if (profile) state.profile = { ...DEFAULT_PROFILE, ...profile };
    if (JSON.stringify(prevSettings) !== JSON.stringify(state.settings)) emit('settings', { prev: prevSettings, next: state.settings, source });
    if (JSON.stringify(prevProfile) !== JSON.stringify(state.profile)) emit('profile', { prev: prevProfile, next: state.profile, source });
  });
}
