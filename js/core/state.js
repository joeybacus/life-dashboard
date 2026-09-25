/* App-wide state: the settings and profile records, plus a tiny event bus.
   Screens listen for 'settings', 'profile' and 'data' events to refresh. */
import { db } from './db.js';
import { nowISO } from './dates.js';

export const DEFAULT_SETTINGS = {
  id: 'app',
  appearance: {
    theme: 'dark',          // 'dark' | 'light' | 'system'
    swipeNavigation: true,  // swipe left/right between tabs on touch screens
  },
  dashboard: {
    order: ['workout', 'todo', 'neurology'],   // module card order (drag to change)
    collapsed: { neurology: true },            // module id → collapsed?
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
  sampleData: {
    enabled: true,          // show generated example data
    calendar: true,         // show sample calendar events
  },
};

export const DEFAULT_PROFILE = { id: 'me', nickname: '', photo: null };

export const state = { settings: null, profile: null };

const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

/** Did a settings section change? e.g. changed(prev, next, 'workout') */
export const changed = (prev, next, key) => JSON.stringify(prev?.[key]) !== JSON.stringify(next?.[key]);

export function emit(type, detail = {}) {
  listeners.get(type)?.forEach((fn) => {
    try { fn(detail); } catch (err) { console.error(`[${type}] listener failed`, err); }
  });
}

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
  const [savedSettings, savedProfile] = await Promise.all([db.get('settings', 'app'), db.get('profile', 'me')]);
  const now = nowISO();

  state.settings = withDefaults(DEFAULT_SETTINGS, savedSettings);
  state.profile = { ...DEFAULT_PROFILE, ...(savedProfile ?? {}) };

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
    await db.put('settings', next);
    state.settings = next;
    emit('settings', { prev, next, source });
    return next;
  });
}

export function updateProfile(patch, { source } = {}) {
  return queued(async () => {
    const prev = state.profile;
    const next = { ...prev, ...patch, updatedAt: nowISO() };
    await db.put('profile', next);
    state.profile = next;
    emit('profile', { prev, next, source });
    return next;
  });
}
