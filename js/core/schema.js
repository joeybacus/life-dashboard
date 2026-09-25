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
  // v2 — Phase 2 will add workoutExercises, workoutSets, exercises, templates…
];

export const DB_VERSION = MIGRATIONS.length;

/** Every store, in export order. */
export const STORE_NAMES = ['meta', 'profile', 'settings', 'tasks', 'taskCategories', 'workouts', 'bodyMeasurements'];

/** Stores that may contain generated sample records. */
export const SAMPLE_STORES = ['tasks', 'workouts', 'bodyMeasurements'];

export function migrate(db, oldVersion, transaction) {
  for (let v = oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v](db, transaction);
}
