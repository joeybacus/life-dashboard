/* ==========================================================================
   Database schema & migrations (IndexedDB)

   One object store per entity — this mirrors the planned Google Sheet
   (one tab per entity) so syncing can be added later without reshaping data.

   Every synced record carries:
     id         unique string
     createdAt  ISO timestamp
     updatedAt  ISO timestamp (sync keeps the newest version on conflict)
     deletedAt  ISO timestamp or null (soft delete, so deletions can sync)
     sample     true only on generated sample data (never synced)

   To change the schema in a future phase, APPEND a migration below; never
   edit an old one. Existing data is upgraded in place, step by step.
   ========================================================================== */

export const DB_NAME = 'life-dashboard';

const MIGRATIONS = [
  // v1 — Phase 1: foundation
  (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });       // internal flags (not user data)
    db.createObjectStore('profile', { keyPath: 'id' });     // UserProfile (single record "me")
    db.createObjectStore('settings', { keyPath: 'id' });    // AppSettings (single record "app")

    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('date', 'date');
    tasks.createIndex('updatedAt', 'updatedAt');

    const categories = db.createObjectStore('taskCategories', { keyPath: 'id' });
    categories.createIndex('updatedAt', 'updatedAt');

    const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
    workouts.createIndex('startedAt', 'startedAt');
    workouts.createIndex('updatedAt', 'updatedAt');

    const body = db.createObjectStore('bodyMeasurements', { keyPath: 'id' });
    body.createIndex('measuredAt', 'measuredAt');
    body.createIndex('updatedAt', 'updatedAt');
  },
  // v2 — Google Sheets sync: changes waiting to be sent ({ key: "store:id", store, id, updatedAt })
  (db) => {
    db.createObjectStore('outbox', { keyPath: 'key' });
  },
  // v3 — Phase 2 (workouts): your exercises (custom ones, plus favourites, notes and
  // rest times for built-in ones) and workout templates. A workout keeps its
  // exercises and their sets inside the workout record (Workout → exercises → sets),
  // so each workout is saved, synced and restored as one piece.
  (db) => {
    const exercises = db.createObjectStore('exercises', { keyPath: 'id' });
    exercises.createIndex('updatedAt', 'updatedAt');
    const templates = db.createObjectStore('templates', { keyPath: 'id' });
    templates.createIndex('updatedAt', 'updatedAt');
  },
  // v4 — Ward Patients (Neurology): this device's daily rounds history (one record
  // per Manila date) and changes waiting to be saved to the ward logsheet. Both
  // hold hospital numbers, so they stay on this device: never synced or backed up.
  (db) => {
    db.createObjectStore('wardDays', { keyPath: 'date' });
    db.createObjectStore('wardQueue', { keyPath: 'key' });
  },
  // v5 — Phase 3 (to-do list): subtasks, one record each ({ id, taskId, title, done, order })
  (db) => {
    const subtasks = db.createObjectStore('subtasks', { keyPath: 'id' });
    subtasks.createIndex('taskId', 'taskId');
    subtasks.createIndex('updatedAt', 'updatedAt');
  },
  // v6 — Google Calendar link (0.4.3): what the sync script reports for each linked task or
  // subtask (its event, Linked / Paused, the next alert). Written by the script, read here.
  (db) => {
    db.createObjectStore('calendarLinks', { keyPath: 'id' });
  },
  // v7 — Patient lists (0.4.3.1): each list in the Neurology tab — its name, order, headings and
  // columns ({ id, name, order, headings, columns }). Synced; never holds patients.
  (db) => {
    const wardLists = db.createObjectStore('wardLists', { keyPath: 'id' });
    wardLists.createIndex('updatedAt', 'updatedAt');
  },
  // v8 — Referrals (0.4.4.2): patients referred to your service, added by hand ({ id, name, hn,
  // location, next, waiting: [{ id, text, done }], notes, status }). Synced (the Referrals tab,
  // sync script 8) but never in backup files, like the rest of the patient data.
  (db) => {
    const referrals = db.createObjectStore('referrals', { keyPath: 'id' });
    referrals.createIndex('updatedAt', 'updatedAt');
  },
  // v9 — Focus timer (0.4.5) and habits (0.4.6): focus sessions ({ id, taskId, type, start, end,
  // plannedMinutes, completed }), habits ({ id, name, group, schedule, active, order }) and one log
  // per habit per Manila day ({ id: "<habit id>:<date>", habitId, date, done }). All synced (tabs
  // Focus sessions, Habits, Habit log — there since sync script 5) and in backups.
  (db) => {
    for (const name of ['focusSessions', 'habits', 'habitLogs']) {
      const store = db.createObjectStore(name, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
  },
  // v10 — Progress photos (0.7.0): one record per photo ({ id, takenAt, pose, note, weightKg, workoutId,
  // workoutTitle, muscleGroups, width, height, originalFileId, copyFileId }) — synced (Progress photos tab,
  // sync script 13) and in backups — and the image files themselves on this device ({ key: "<photo id>:copy"
  // | ":thumb" | ":original", photoId, kind, blob }), never synced or backed up: the full original lives in
  // your Google Drive, and every device keeps its own copy.
  (db) => {
    const photos = db.createObjectStore('progressPhotos', { keyPath: 'id' });
    photos.createIndex('takenAt', 'takenAt');
    photos.createIndex('updatedAt', 'updatedAt');
    db.createObjectStore('photoFiles', { keyPath: 'key' });
  },
];

export const DB_VERSION = MIGRATIONS.length;

/** Stores included in JSON backups, in export order. */
export const BACKUP_STORES = ['meta', 'profile', 'settings', 'tasks', 'subtasks', 'taskCategories', 'workouts', 'exercises', 'templates', 'bodyMeasurements', 'progressPhotos', 'wardLists', 'focusSessions', 'habits', 'habitLogs'];

/** Image files kept on this device only (progress photos and the profile picture's original). */
export const DEVICE_FILE_STORES = ['photoFiles'];

/** Ward Patients data kept on this device only (see migration v4; the lists themselves sync — v7). */
export const WARD_STORES = ['wardDays', 'wardQueue'];

/** Kept by the sync script in its own tabs: devices receive them, never send them. */
export const SCRIPT_STORES = ['calendarLinks'];

/** Every store (used when deleting all data). */
export const STORE_NAMES = [...BACKUP_STORES, 'referrals', 'outbox', ...WARD_STORES, ...SCRIPT_STORES, ...DEVICE_FILE_STORES];

/** Stores that sync with Google Sheets — one tab each (see apps-script/Code.gs). */
export const SYNC_STORES = ['profile', 'settings', 'tasks', 'subtasks', 'taskCategories', 'workouts', 'exercises', 'templates', 'bodyMeasurements', 'progressPhotos', 'wardLists', 'referrals', 'focusSessions', 'habits', 'habitLogs'];

/** Stores that may contain generated sample records. */
export const SAMPLE_STORES = ['tasks', 'subtasks', 'workouts', 'bodyMeasurements'];

export function migrate(db, oldVersion, transaction) {
  for (let v = oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v](db, transaction);
}
