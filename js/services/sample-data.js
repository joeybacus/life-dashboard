/* Sample data so the dashboard has something to show during development.
   - Sample records are marked { sample: true } and use fixed ids.
   - They're regenerated each day (relative to today) while sample data is on.
   - Turning sample data off removes only sample records; real data is never touched.
   - Default task categories are seeded once as normal, editable records. */
import { db, tx, deleteWhere } from '../core/db.js';
import { SAMPLE_STORES } from '../core/schema.js';
import { state } from '../core/state.js';
import { addDays, atTime, nowISO, startOfDay, toDateKey } from '../core/dates.js';

const DEFAULT_CATEGORIES = ['Hospital', 'Residency', 'MBA', 'NU', 'Research', 'Business', 'Personal'];

/** First run only: create the starting task categories (the user can edit them later). */
export async function ensureDefaults() {
  const seeded = await db.get('meta', 'categoriesSeeded');
  if (seeded) return;
  const now = nowISO();
  await tx(['taskCategories', 'meta'], 'readwrite', (s) => {
    DEFAULT_CATEGORIES.forEach((name, order) => {
      s.taskCategories.put({ id: `cat-${name.toLowerCase()}`, name, order, createdAt: now, updatedAt: now, deletedAt: null });
    });
    s.meta.put({ key: 'categoriesSeeded', value: now });
  });
}

const pad2 = (n) => String(n).padStart(2, '0');

export function buildSampleRecords(now = new Date()) {
  const today = startOfDay(now);
  const day = (offset) => toDateKey(addDays(today, offset));
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600e3).toISOString();
  const base = (id, createdAt) => ({ id, createdAt, updatedAt: createdAt, deletedAt: null, sample: true });

  const task = (n, fields, createdHoursAgo) => ({
    ...base(`sample-task-${pad2(n)}`, hoursAgo(createdHoursAgo)),
    title: '',
    priority: 'medium',
    date: day(0),
    startTime: null,
    endTime: null,
    categoryId: null,
    completed: false,
    completedAt: null,
    notes: '',
    tags: [],
    reminders: [],
    recurrence: null,
    ...fields,
  });

  const tasks = [
    task(1, { title: 'Update research IRB forms', priority: 'high', date: day(-1), startTime: '16:00', endTime: '17:00', categoryId: 'cat-research', reminders: [30] }, 40),
    task(2, { title: 'Finish Neurology Report', priority: 'high', startTime: '20:00', endTime: '21:00', categoryId: 'cat-residency', reminders: [30, 5] }, 20),
    task(3, { title: 'Review stroke protocol updates', priority: 'high', startTime: '07:30', endTime: '08:00', categoryId: 'cat-hospital', completed: true, completedAt: hoursAgo(1) }, 30),
    task(4, { title: 'Submit MBA case write-up', priority: 'medium', startTime: '17:00', categoryId: 'cat-mba', reminders: [60] }, 26),
    task(5, { title: 'Read two research abstracts', priority: 'medium', categoryId: 'cat-research', completed: true, completedAt: hoursAgo(2) }, 50),
    task(6, { title: 'Call pharmacy about refill', priority: 'low', categoryId: 'cat-personal' }, 6),
    task(7, { title: 'Book flights for NU conference', priority: 'low', date: day(1), categoryId: 'cat-nu' }, 3),
  ];

  // Push / Pull / Legs history over the last three weeks
  const MUSCLES = { Push: ['Chest', 'Shoulders', 'Triceps'], Pull: ['Back', 'Biceps'], Legs: ['Legs', 'Abs/Core'] };
  const plan = [
    [-1, 'Pull', '18:10', 55], [-2, 'Push', '07:05', 62], [-3, 'Legs', '18:30', 71],
    [-5, 'Pull', '06:50', 52], [-7, 'Push', '18:00', 64], [-8, 'Legs', '07:10', 68],
    [-10, 'Pull', '18:20', 57], [-11, 'Push', '06:45', 60], [-12, 'Legs', '18:05', 73],
    [-14, 'Pull', '07:00', 54], [-15, 'Push', '18:15', 61], [-17, 'Legs', '06:55', 69],
    [-18, 'Pull', '18:00', 50], [-20, 'Push', '07:20', 58],
  ];
  const workouts = plan.map(([offset, type, time, minutes], i) => {
    const start = atTime(day(offset), time);
    const end = new Date(start.getTime() + minutes * 60e3);
    return {
      ...base(`sample-workout-${pad2(i + 1)}`, end.toISOString()),
      type,
      muscleGroups: MUSCLES[type],
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      pausedMs: 0,
      templateId: null,
      notes: '',
    };
  });

  // Morning weigh-ins every three days, trending gently down
  const bodyMeasurements = [];
  for (let offset = -61, i = 0; offset <= -1; offset += 3, i++) {
    const progress = (offset + 61) / 60;
    const kg = 80.3 - 1.9 * progress + Math.sin(i * 1.7) * 0.25;
    const measuredAt = atTime(day(offset), '07:10').toISOString();
    bodyMeasurements.push({
      ...base(`sample-weight-${pad2(i + 1)}`, measuredAt),
      kind: 'weight',
      valueKg: Math.round(kg * 10) / 10,
      measuredAt,
      source: 'manual',
      note: '',
    });
  }

  return { tasks, workouts, bodyMeasurements };
}

/**
 * Keep sample data in step with the setting: refresh it once per day while
 * enabled, remove it when disabled. Returns true if anything changed.
 */
export async function ensureSampleData({ force = false } = {}) {
  const seededOn = (await db.get('meta', 'sampleSeededOn'))?.value ?? null;
  if (!state.settings.sampleData.enabled) {
    if (!seededOn) return false;
    await removeSampleData();
    return true;
  }
  const today = toDateKey(new Date());
  if (!force && seededOn === today) return false;

  const records = buildSampleRecords(new Date());
  await tx([...SAMPLE_STORES, 'meta'], 'readwrite', (s) => {
    for (const name of SAMPLE_STORES) {
      const keep = new Set(records[name].map((r) => r.id));
      records[name].forEach((r) => s[name].put(r));
      deleteWhere(s[name], (r) => r.sample === true && !keep.has(r.id));
    }
    s.meta.put({ key: 'sampleSeededOn', value: today });
  });
  return true;
}

export async function removeSampleData() {
  await tx([...SAMPLE_STORES, 'meta'], 'readwrite', (s) => {
    for (const name of SAMPLE_STORES) deleteWhere(s[name], (r) => r.sample === true);
    s.meta.delete('sampleSeededOn');
  });
}
