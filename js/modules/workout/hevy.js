/* Hevy import & export (CSV).

   Hevy (Settings → Export & Import Data → Export Workouts) exports one row
   per set:
     title, start_time, end_time, description, exercise_title, superset_id,
     exercise_notes, set_index, set_type, weight_kg | weight_lbs, reps,
     distance_km | distance_miles, duration_seconds, rpe
   Times look like "22 Dec 2025, 08:00" (your local time).

   Importing turns each Hevy workout into one workout here, matches exercise
   names to the library, creates custom exercises for names it doesn't know,
   and skips workouts already in your history — so importing the same file
   twice is safe. */
import { saveRecords } from '../../core/records.js';
import { uid } from '../../core/ids.js';
import { inferGroups, groupsLabel } from './muscles.js';
import { guessEquipment, guessPrimary } from './library.js';
import { shortId } from './model.js';

const LB = 0.45359237;
const MILE = 1.609344;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const SET_TYPE = { normal: 'normal', warmup: 'warmup', 'warm up': 'warmup', dropset: 'drop', drop: 'drop', failure: 'failure' };

export class ImportError extends Error {}

/* ---------- CSV ---------- */

/** Split CSV text into rows of fields (handles quotes, commas and line breaks inside quotes). */
export function parseCsv(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const firstLine = s.slice(0, s.indexOf('\n') >>> 0);
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function toCsvField(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) || text === '' ? `"${text.replace(/"/g, '""')}"` : text;
}

/* ---------- Dates ---------- */

const hour24 = (h, ampm) => (ampm ? (Number(h) % 12) + (/p/i.test(ampm) ? 12 : 0) : Number(h));

function localDate(y, mo, d, h, mi, s) {
  const date = new Date(y, mo, d, h, mi, s || 0, 0);
  return Number.isNaN(date.getTime()) || date.getMonth() !== mo ? null : date;
}

/** Hevy's "22 Dec 2025, 08:00" (and a few other common styles) → Date, or null. */
export function parseHevyDate(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?$/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return localDate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], hour24(m[4], m[7]), +m[5], +m[6]);
  }
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return localDate(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], hour24(m[4], m[7]), +m[5], +m[6]);
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    if (m[8]) {
      const d = new Date(t.replace(' ', 'T'));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return localDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hevyDate = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ---------- Reading a Hevy export ---------- */

const number = (value) => {
  const t = String(value ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const positive = (n) => (n != null && n > 0 ? n : null);
const round = (n, places) => (n == null ? null : Math.round(n * 10 ** places) / 10 ** places);

/**
 * Read the file's workouts. Returns
 * { workouts: [{ title, start, end, description, exercises: [{ name, notes, supersetKey, sets }] }], unit, hasRpe, badRows }
 */
export function readHevyCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ImportError('This file is empty, or it isn’t a Hevy export.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const need = ['title', 'start_time', 'exercise_title'];
  if (need.some((name) => col(name) < 0)) {
    throw new ImportError('This doesn’t look like a Hevy workout export. In Hevy, go to Settings → Export & Import Data → Export Workouts, then choose that CSV file.');
  }
  const C = Object.fromEntries(['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes',
    'set_index', 'set_type', 'weight_kg', 'weight_lbs', 'reps', 'distance_km', 'distance_miles', 'duration_seconds', 'rpe']
    .map((name) => [name, col(name)]));
  const get = (row, name) => (C[name] >= 0 ? String(row[C[name]] ?? '').trim() : '');
  const unit = C.weight_kg >= 0 ? 'kg' : C.weight_lbs >= 0 ? 'lb' : 'kg';

  const workouts = new Map();
  let badRows = 0;
  let hasRpe = false;
  for (const row of rows.slice(1)) {
    const title = get(row, 'title') || 'Workout';
    const startText = get(row, 'start_time');
    const exerciseName = get(row, 'exercise_title');
    const start = parseHevyDate(startText);
    if (!start || !exerciseName) {
      badRows++;
      continue;
    }
    const key = `${title}\u0000${startText}`;
    let w = workouts.get(key);
    if (!w) {
      const end = parseHevyDate(get(row, 'end_time'));
      w = { title, start, end: end && end >= start ? end : start, description: get(row, 'description'), exercises: [] };
      workouts.set(key, w);
    }

    const supersetKey = get(row, 'superset_id');
    const setIndex = number(get(row, 'set_index'));
    let block = w.exercises[w.exercises.length - 1];
    const sameBlock = block && block.name === exerciseName && block.supersetKey === supersetKey
      && !(setIndex === 0 && block.sets.length > 0 && block.lastIndex !== null && block.lastIndex >= 0);
    if (!sameBlock) {
      block = { name: exerciseName, notes: get(row, 'exercise_notes'), supersetKey, sets: [], lastIndex: null };
      w.exercises.push(block);
    }
    block.lastIndex = setIndex;

    const kg = C.weight_kg >= 0 ? number(get(row, 'weight_kg')) : number(get(row, 'weight_lbs')) != null ? number(get(row, 'weight_lbs')) * LB : null;
    const km = C.distance_km >= 0 ? number(get(row, 'distance_km')) : number(get(row, 'distance_miles')) != null ? number(get(row, 'distance_miles')) * MILE : null;
    const rpe = positive(number(get(row, 'rpe')));
    if (rpe != null) hasRpe = true;
    block.sets.push({
      type: SET_TYPE[get(row, 'set_type').toLowerCase()] ?? 'normal',
      weightKg: round(positive(kg), 2),
      reps: positive(number(get(row, 'reps'))) != null ? Math.round(number(get(row, 'reps'))) : null,
      distanceKm: round(positive(km), 3),
      durationSec: positive(number(get(row, 'duration_seconds'))) != null ? Math.round(number(get(row, 'duration_seconds'))) : null,
      rpe,
    });
  }
  if (!workouts.size) throw new ImportError('No workouts were found in this file.');
  return { workouts: [...workouts.values()], unit, hasRpe, badRows };
}

/* ---------- Planning the import ---------- */

function guessKind(sets) {
  if (sets.some((s) => s.distanceKm)) return 'cardio';
  if (sets.length && sets.every((s) => s.durationSec && s.reps == null && s.weightKg == null)) return 'duration';
  return 'weight';
}

const overlaps = (a, b) => a.start < b.end && a.end > b.start;

/**
 * Work out what importing would do, without saving anything.
 * existing: your current workouts (sample workouts are ignored).
 */
export function planHevyImport(parsed, { library, existing = [] }) {
  const now = new Date().toISOString();
  const known = existing
    .filter((w) => !w.sample && !w.deletedAt)
    .map((w) => ({ start: Date.parse(w.startedAt), end: Date.parse(w.endedAt || w.startedAt) + 60_000 }));
  const newExercises = new Map(); // name key → record
  const matched = new Set();
  const workouts = [];
  let skipped = 0;
  let sets = 0;

  const exerciseFor = (block) => {
    const found = library.findByName(block.name);
    if (found) {
      matched.add(found.id);
      return found;
    }
    const key = block.name.trim().toLowerCase();
    if (!newExercises.has(key)) {
      const primary = guessPrimary(block.name);
      newExercises.set(key, {
        id: uid(), createdAt: now, updatedAt: now, deletedAt: null,
        custom: true,
        name: block.name.trim(),
        primary,
        secondary: [],
        equipment: primary === 'Cardio' ? 'Cardio machine' : guessEquipment(block.name),
        kind: guessKind(block.sets),
        source: 'hevy',
      });
    }
    return newExercises.get(key);
  };

  for (const w of parsed.workouts) {
    const range = { start: w.start.getTime(), end: Math.max(w.end.getTime(), w.start.getTime() + 60_000) };
    if (known.some((k) => overlaps(range, k))) {
      skipped++;
      continue;
    }
    known.push(range); // the same workout twice in one file counts once

    const muscleCounts = new Map();
    const supersets = new Map();
    const exercises = w.exercises.map((block) => {
      const exercise = exerciseFor(block);
      muscleCounts.set(exercise.primary, (muscleCounts.get(exercise.primary) ?? 0) + block.sets.length);
      const entry = {
        id: shortId(),
        exerciseId: exercise.id,
        name: exercise.name,
        sets: block.sets.map((s) => {
          const set = { id: shortId(), type: s.type, done: true };
          ['weightKg', 'reps', 'distanceKm', 'durationSec', 'rpe'].forEach((k) => { if (s[k] != null) set[k] = s[k]; });
          return set;
        }),
      };
      if (block.notes) entry.notes = block.notes;
      if (block.supersetKey) {
        if (!supersets.has(block.supersetKey)) supersets.set(block.supersetKey, shortId());
        entry.supersetId = supersets.get(block.supersetKey);
      }
      sets += entry.sets.length;
      return entry;
    });
    // A "superset" with a single exercise isn't one
    exercises.forEach((e) => {
      if (e.supersetId && exercises.filter((x) => x.supersetId === e.supersetId).length < 2) delete e.supersetId;
    });

    const groups = inferGroups(muscleCounts);
    workouts.push({
      id: uid(), createdAt: now, updatedAt: now, deletedAt: null,
      title: w.title,
      muscleGroups: groups,
      type: groupsLabel(groups),
      startedAt: w.start.toISOString(),
      endedAt: w.end.toISOString(),
      pausedMs: 0,
      pausedAt: null,
      templateId: null,
      notes: w.description,
      source: 'hevy',
      exercises,
    });
  }

  const dates = parsed.workouts.map((w) => w.start.getTime());
  return {
    workouts,
    exercises: [...newExercises.values()],
    total: parsed.workouts.length,
    skipped,
    sets,
    matchedCount: matched.size,
    firstDate: new Date(Math.min(...dates)),
    lastDate: new Date(Math.max(...dates)),
    unit: parsed.unit,
    hasRpe: parsed.hasRpe,
    badRows: parsed.badRows,
  };
}

/** Save everything in the plan at once (all or nothing). */
export async function applyHevyImport(plan) {
  await saveRecords([
    ...plan.exercises.map((record) => ({ store: 'exercises', record })),
    ...plan.workouts.map((record) => ({ store: 'workouts', record })),
  ]);
}

/** Undo an import: the imported workouts and new exercises are deleted (this syncs too). */
export async function undoHevyImport(plan) {
  const now = new Date().toISOString();
  const gone = (record) => ({ ...record, updatedAt: now, deletedAt: now });
  await saveRecords([
    ...plan.workouts.map((record) => ({ store: 'workouts', record: gone(record) })),
    ...plan.exercises.map((record) => ({ store: 'exercises', record: gone(record) })),
  ]);
}

/* ---------- Export (same columns as Hevy's, in kg) ---------- */

const EXPORT_TYPE = { normal: 'normal', warmup: 'warmup', drop: 'dropset', failure: 'failure' };

/** Numbers in files always use a dot, whatever the region. */
const formatPlain = (n) => String(Math.round(n * 1000) / 1000);

export function workoutsToHevyCsv(workouts) {
  const header = ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes',
    'set_index', 'set_type', 'weight_kg', 'reps', 'distance_km', 'duration_seconds', 'rpe'];
  const lines = [header.map(toCsvField).join(',')];
  const finished = workouts.filter((w) => w.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const w of finished) {
    const supersets = new Map();
    w.exercises.forEach((e) => {
      if (e.supersetId && !supersets.has(e.supersetId)) supersets.set(e.supersetId, supersets.size);
      e.sets.filter((s) => s.done).forEach((s, i) => {
        lines.push([
          w.title, hevyDate(w.startedAt), hevyDate(w.endedAt), w.notes ?? '', e.name,
          e.supersetId ? supersets.get(e.supersetId) : '', e.notes ?? '', i, EXPORT_TYPE[s.type] ?? 'normal',
          s.weightKg != null ? formatPlain(s.weightKg) : '', s.reps ?? '', s.distanceKm != null ? formatPlain(s.distanceKm) : '',
          s.durationSec ?? '', s.rpe ?? '',
        ].map(toCsvField).join(','));
      });
    });
  }
  return `${lines.join('\n')}\n`;
}
