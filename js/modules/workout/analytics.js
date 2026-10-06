/* Workout analytics (Phase 4): totals, streaks, the calendar heatmap, exercise
   progress, muscle-group frequency and personal records.

   Everything here is worked out from the workouts themselves each time it's
   needed — nothing new is stored or synced — so editing or deleting an old
   workout corrects every number and record at once. Pure functions only (no
   database, no screen), so tools/workout-checks.html can test them.

   Days are this device's local days, the same as the rest of the Workout tab. */
import { addDays, startOfDay, startOfWeek, toDateKey } from '../../core/dates.js';
import { entryStats, setVolume, workoutDuration } from './model.js';

/* ---------- Time ranges ---------- */

/** [value, short label, long label, the period's name in "compared with the … before"] */
export const RANGES = [
  ['7', '7D', 'Last 7 days', '7 days'],
  ['30', '30D', 'Last 30 days', '30 days'],
  ['90', '3M', 'Last 3 months', '3 months'],
  ['182', '6M', 'Last 6 months', '6 months'],
  ['365', '1Y', 'Last 12 months', '12 months'],
  ['all', 'All', 'All time', '30 days'],
];
export const DEFAULT_RANGE = '90';
export const rangeInfo = (range) => RANGES.find(([value]) => value === range) ?? RANGES.find(([value]) => value === DEFAULT_RANGE);

/** Number of days a range covers (today included); "All time" compares its last 30 days. */
const rangeDays = (range) => (range === 'all' ? null : Number(rangeInfo(range)[0]));

/** First day of a range (local midnight), or null for all time. */
export function rangeStart(range, now = new Date()) {
  const days = rangeDays(range);
  return days ? addDays(startOfDay(now), -(days - 1)) : null;
}

/** Finished workouts, oldest first. */
export function finished(workouts) {
  return workouts.filter((w) => w.endedAt && !w.deletedAt)
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

const startOf = (w) => new Date(w.startedAt);

/** Workouts started on or after `from` and before `to` (either may be null). */
export function between(workouts, from, to = null) {
  return workouts.filter((w) => {
    const d = startOf(w);
    return (!from || d >= from) && (!to || d < to);
  });
}

/* ---------- Totals ---------- */

/** Totals for a list of workouts: count, active time (ms), sets, reps and volume (kg × reps). */
export function summarize(workouts) {
  const t = { count: 0, time: 0, sets: 0, reps: 0, volume: 0 };
  for (const w of workouts) {
    t.count++;
    t.time += workoutDuration(w);
    for (const e of w.exercises) {
      const s = entryStats(e);
      t.sets += s.sets;
      t.reps += s.reps;
      t.volume += s.volume;
    }
  }
  return t;
}

/** Percentage change from a to b, rounded; null when there's nothing to compare with. */
export function percentChange(before, after) {
  if (!(before > 0) || !(after >= 0)) return null;
  return Math.round(((after - before) / before) * 100);
}

/** Totals for a range, plus the same length of time just before it (to compare). */
export function rangeSummary(workouts, range, now = new Date()) {
  const from = rangeStart(range, now);
  const current = summarize(between(workouts, from));
  if (!from) return { current, previous: null };
  const days = rangeDays(range);
  const previous = summarize(between(workouts, addDays(from, -days), from));
  return { current, previous };
}

/* ---------- Weekly and monthly totals ---------- */

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/**
 * The last `count` weeks (or months), oldest first, each with its workouts,
 * count, active time and volume. unit: 'week' | 'month'.
 */
export function buckets(workouts, { unit = 'week', count = 12, now = new Date() } = {}) {
  const first = unit === 'week' ? addDays(startOfWeek(now), -7 * (count - 1)) : addMonths(startOfMonth(now), -(count - 1));
  const out = [];
  for (let i = 0; i < count; i++) {
    const start = unit === 'week' ? addDays(first, 7 * i) : addMonths(first, i);
    const end = unit === 'week' ? addDays(start, 7) : addMonths(start, 1);
    const list = between(workouts, start, end);
    const t = summarize(list);
    out.push({ start, end, workouts: list, count: t.count, time: t.time, volume: t.volume, current: i === count - 1 });
  }
  return out;
}

/* ---------- Streaks ---------- */

/** Days in a row with a workout: the current run (today, or up to yesterday) and the best ever. */
export function dayStreaks(workouts, now = new Date()) {
  const days = new Set(workouts.map((w) => toDateKey(startOf(w))));
  let day = startOfDay(now);
  if (!days.has(toDateKey(day))) day = addDays(day, -1);
  let current = 0;
  while (days.has(toDateKey(day))) { current++; day = addDays(day, -1); }
  let best = 0;
  let run = 0;
  let prev = null;
  [...days].sort().forEach((key) => {
    const d = new Date(`${key}T12:00:00`);
    run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  });
  return { current, best: Math.max(best, current) };
}

/**
 * Weeks in a row that met the weekly goal: the current run (this week counts
 * once it's met; until then the run up to last week still stands) and the best.
 */
export function weekStreaks(workouts, goal, now = new Date()) {
  if (!workouts.length || !(goal > 0)) return { current: 0, best: 0, thisWeek: 0 };
  const thisWeek = startOfWeek(now);
  const perWeek = new Map();
  workouts.forEach((w) => {
    const key = toDateKey(startOfWeek(startOf(w)));
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  });
  const met = (d) => (perWeek.get(toDateKey(d)) ?? 0) >= goal;
  let week = met(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (met(week)) { current++; week = addDays(week, -7); }
  let best = 0;
  let run = 0;
  const firstWeek = startOfWeek(startOf(workouts[0]));
  for (let d = new Date(firstWeek); d <= thisWeek; d = addDays(d, 7)) {
    run = met(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best, thisWeek: perWeek.get(toDateKey(thisWeek)) ?? 0 };
}

/* ---------- Calendar heatmap ---------- */

/**
 * The last `weeks` weeks as columns of 7 days (this week last). Each day:
 * { key, date, future, workouts, volume, level 0–4 }. The level is how big the
 * day was compared with your other workout days in the window (by volume), so
 * the brightest squares are your biggest days; a day with only cardio or
 * timed exercises is level 1.
 */
export function heatmap(workouts, { weeks = 53, now = new Date() } = {}) {
  const todayKey = toDateKey(now);
  const first = addDays(startOfWeek(now), -7 * (weeks - 1));
  const byDay = new Map();
  between(workouts, first).forEach((w) => {
    const key = toDateKey(startOf(w));
    const day = byDay.get(key) ?? { workouts: [], volume: 0 };
    day.workouts.push(w);
    day.volume += w.exercises.reduce((sum, e) => sum + entryStats(e).volume, 0);
    byDay.set(key, day);
  });
  const volumes = [...byDay.values()].map((d) => d.volume).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => volumes[Math.min(volumes.length - 1, Math.floor(p * volumes.length))];
  const cut = volumes.length ? [q(0.25), q(0.5), q(0.75)] : [];
  const levelOf = (volume) => {
    if (!(volume > 0) || !cut.length) return 1;
    return 1 + cut.filter((c) => volume > c).length;
  };
  const columns = [];
  for (let c = 0; c < weeks; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const date = addDays(first, c * 7 + r);
      const key = toDateKey(date);
      const day = byDay.get(key);
      col.push({
        key, date, future: key > todayKey,
        workouts: day?.workouts ?? [], volume: day?.volume ?? 0, level: day ? levelOf(day.volume) : 0,
      });
    }
    columns.push(col);
  }
  return { columns, days: byDay.size, first };
}

/* ---------- Muscle groups ---------- */

/**
 * Working sets (warm-ups left out) per primary muscle, and in how many
 * workouts each muscle was trained. primaryOf(entry) → muscle name.
 */
export function muscleFrequency(workouts, primaryOf) {
  const map = new Map();
  for (const w of workouts) {
    const seen = new Set();
    for (const e of w.exercises) {
      const sets = e.sets.filter((s) => s.done && s.type !== 'warmup').length;
      if (!sets) continue;
      const muscle = primaryOf(e) || 'Other';
      const row = map.get(muscle) ?? { muscle, sets: 0, workouts: 0 };
      row.sets += sets;
      if (!seen.has(muscle)) { row.workouts++; seen.add(muscle); }
      map.set(muscle, row);
    }
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

/* ---------- One exercise ---------- */

/** Estimated one-rep max (Epley: weight × (1 + reps ÷ 30)); only from 1–12 reps, where it's reliable. */
export function e1rm(weightKg, reps) {
  if (!(weightKg > 0) || !(reps >= 1) || reps > 12) return null;
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

const working = (s) => s.done && s.type !== 'warmup';

/** Numbers for one session of an exercise (its sets, from one workout). */
export function sessionNumbers(sets) {
  const n = { weight: null, weightReps: null, e1rm: null, volume: 0, sets: 0, reps: 0, duration: null, distance: null };
  for (const s of sets) {
    if (!s.done) continue;
    n.sets++;
    n.reps += s.reps || 0;
    n.volume += setVolume(s);
    if (s.type === 'warmup') continue;
    if (s.weightKg > 0 && (n.weight == null || s.weightKg > n.weight || (s.weightKg === n.weight && (s.reps ?? 0) > (n.weightReps ?? 0)))) {
      n.weight = s.weightKg;
      n.weightReps = s.reps ?? null;
    }
    const est = e1rm(s.weightKg, s.reps);
    if (est != null && (n.e1rm == null || est > n.e1rm)) n.e1rm = est;
    if (s.durationSec > 0 && (n.duration == null || s.durationSec > n.duration)) n.duration = s.durationSec;
    if (s.distanceKm > 0 && (n.distance == null || s.distanceKm > n.distance)) n.distance = s.distanceKm;
  }
  return n;
}

/** Every finished session of one exercise, oldest first: [{ workout, sets, date, n }]. */
export function exerciseSessions(workouts, exerciseId) {
  const out = [];
  for (const w of finished(workouts)) {
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
    if (!sets.some((s) => s.done)) continue;
    out.push({ workout: w, sets, date: startOf(w), n: sessionNumbers(sets) });
  }
  return out;
}

/**
 * What an exercise's chart can show. best: how a period is summed up when
 * comparing ('max' = the best session, 'sum' = everything added up).
 */
export const METRICS = {
  weight: { label: 'Heaviest weight', short: 'Weight', unit: 'kg', best: 'max', kinds: ['weight'] },
  e1rm: { label: 'Estimated 1-rep max', short: 'Est. 1RM', unit: 'kg', best: 'max', kinds: ['weight'] },
  volume: { label: 'Volume', short: 'Volume', unit: 'kg', best: 'sum', kinds: ['weight'] },
  sets: { label: 'Sets', short: 'Sets', unit: '', best: 'sum', kinds: ['weight', 'duration', 'cardio'] },
  reps: { label: 'Reps', short: 'Reps', unit: '', best: 'sum', kinds: ['weight'] },
  duration: { label: 'Longest time', short: 'Time', unit: 's', best: 'max', kinds: ['duration', 'cardio'] },
  distance: { label: 'Longest distance', short: 'Distance', unit: 'km', best: 'max', kinds: ['cardio'] },
  frequency: { label: 'How often', short: 'How often', unit: '', best: 'sum', kinds: ['weight', 'duration', 'cardio'] },
};

export const metricsFor = (kind = 'weight') => Object.keys(METRICS).filter((key) => METRICS[key].kinds.includes(kind));

/** One value per session for a metric (frequency counts each session as 1). */
export function metricValue(session, metric) {
  if (metric === 'frequency') return 1;
  const v = session.n[metric];
  return v == null || !(v > 0) ? null : v;
}

/** Chart points for a metric within a range: [{ date, value, session }], oldest first. */
export function metricPoints(sessions, metric, range, now = new Date()) {
  const from = rangeStart(range, now);
  return sessions
    .filter((s) => !from || s.date >= from)
    .map((s) => ({ date: s.date, value: metricValue(s, metric), session: s }))
    .filter((p) => p.value != null);
}

/** Sessions per week (ranges up to 6 months) or per month (longer), for the "How often" chart. */
export function frequencyBuckets(sessions, range, now = new Date()) {
  const days = rangeDays(range);
  const firstSession = sessions[0]?.date ?? now;
  const unit = days && days <= 182 ? 'week' : 'month';
  let count;
  if (unit === 'week') count = Math.max(1, Math.ceil(days / 7));
  else {
    const from = days ? addDays(now, -days) : firstSession;
    count = Math.max(1, (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth() + 1);
  }
  const fake = sessions.map((s) => ({ startedAt: s.workout.startedAt, endedAt: s.workout.endedAt, exercises: [] }));
  return { unit, buckets: buckets(fake, { unit, count: Math.min(count, 120), now }) };
}

/**
 * Compare a metric's last period with the period before it (same length).
 * Returns { pct, before, after, days } or null when either period is empty.
 */
export function compareMetric(sessions, metric, range, now = new Date()) {
  const days = rangeDays(range) ?? 30;
  const end = addDays(startOfDay(now), 1);
  const mid = addDays(end, -days);
  const start = addDays(mid, -days);
  const sum = (list) => {
    const values = list.map((s) => metricValue(s, metric)).filter((v) => v != null);
    if (!values.length) return null;
    return METRICS[metric].best === 'max' ? Math.max(...values) : values.reduce((a, b) => a + b, 0);
  };
  const before = sum(sessions.filter((s) => s.date >= start && s.date < mid));
  const after = sum(sessions.filter((s) => s.date >= mid && s.date < end));
  if (before == null || after == null) return null;
  return { pct: percentChange(before, after), before, after, days };
}

/* ---------- Personal records ---------- */

/*
 * A record is a session that beats every earlier session of the same exercise:
 *   weight   heaviest working set (ties go to more reps — but only more weight is a record)
 *   e1rm     best estimated one-rep max (sets of 1–12 reps)
 *   reps     most reps at a weight you've lifted before (bodyweight sets count as 0 kg)
 *   volume   most volume in one session
 *   duration longest time (timed and cardio exercises)
 *   distance longest distance (cardio)
 * plus workoutVolume: the most volume in one workout. Warm-ups never count.
 * An exercise's first session only sets the starting point (it isn't a record
 * yet), and only strictly better numbers count — matching your best isn't a record.
 */
export const RECORD_TYPES = {
  weight: 'Heaviest weight',
  e1rm: 'Best est. 1-rep max',
  reps: 'Most reps',
  volume: 'Best volume',
  duration: 'Longest time',
  distance: 'Longest distance',
  workoutVolume: 'Best workout volume',
};

const EPS = 1e-9;
const repsKey = (weightKg) => String(weightKg > 0 ? Math.round(weightKg * 100) / 100 : 0);

function emptyBests() {
  return { sessions: 0, weight: null, e1rm: null, volume: null, duration: null, distance: null, reps: new Map() };
}

/**
 * The records one session sets against an exercise's bests so far:
 * [{ type, value, reps?, weightKg?, setId, previous }]. setId points at the set
 * that holds the record (null for volume, which belongs to the whole session).
 */
export function sessionRecords(bests, sets) {
  if (!bests || !bests.sessions) return [];
  const out = [];
  const work = sets.filter(working);
  const top = (score) => {
    let best = null;
    let bestScore = -Infinity;
    for (const s of work) {
      const v = score(s);
      if (v != null && v > bestScore + EPS) { best = s; bestScore = v; }
    }
    return best ? { set: best, value: bestScore } : null;
  };
  const heaviest = top((s) => (s.weightKg > 0 ? s.weightKg + Math.min(s.reps ?? 0, 999) / 1e6 : null));
  if (heaviest && bests.weight && heaviest.set.weightKg > bests.weight.value + EPS) {
    out.push({ type: 'weight', value: heaviest.set.weightKg, reps: heaviest.set.reps ?? null, setId: heaviest.set.id, previous: bests.weight.value });
  }
  const est = top((s) => e1rm(s.weightKg, s.reps));
  if (est && bests.e1rm && est.value > bests.e1rm.value + EPS) {
    out.push({ type: 'e1rm', value: est.value, weightKg: est.set.weightKg, reps: est.set.reps, setId: est.set.id, previous: bests.e1rm.value });
  }
  const perWeight = new Map();
  for (const s of work) {
    if (!(s.reps > 0) || (s.durationSec > 0 && !(s.weightKg > 0))) continue;
    const key = repsKey(s.weightKg);
    if (!perWeight.has(key) || s.reps > perWeight.get(key).reps) perWeight.set(key, s);
  }
  for (const [key, s] of perWeight) {
    const before = bests.reps.get(key);
    if (before != null && s.reps > before) out.push({ type: 'reps', value: s.reps, weightKg: s.weightKg > 0 ? s.weightKg : 0, setId: s.id, previous: before });
  }
  const volume = sets.reduce((sum, s) => sum + setVolume(s), 0);
  if (volume > 0 && bests.volume && volume > bests.volume.value + EPS) {
    out.push({ type: 'volume', value: volume, setId: null, previous: bests.volume.value });
  }
  const longest = top((s) => (s.durationSec > 0 ? s.durationSec : null));
  if (longest && bests.duration && longest.value > bests.duration.value + EPS) {
    out.push({ type: 'duration', value: longest.value, setId: longest.set.id, previous: bests.duration.value });
  }
  const farthest = top((s) => (s.distanceKm > 0 ? s.distanceKm : null));
  if (farthest && bests.distance && farthest.value > bests.distance.value + EPS) {
    out.push({ type: 'distance', value: farthest.value, setId: farthest.set.id, previous: bests.distance.value });
  }
  return out;
}

/** Fold a session into an exercise's bests (after its records have been worked out). */
function addSession(bests, sets, where) {
  const n = sessionNumbers(sets);
  const better = (current, value) => value != null && value > 0 && (!current || value > current.value + EPS);
  if (better(bests.weight, n.weight)) bests.weight = { value: n.weight, reps: n.weightReps, ...where };
  if (better(bests.e1rm, n.e1rm)) bests.e1rm = { value: n.e1rm, ...where };
  if (better(bests.volume, n.volume)) bests.volume = { value: n.volume, ...where };
  if (better(bests.duration, n.duration)) bests.duration = { value: n.duration, ...where };
  if (better(bests.distance, n.distance)) bests.distance = { value: n.distance, ...where };
  for (const s of sets.filter(working)) {
    if (!(s.reps > 0) || (s.durationSec > 0 && !(s.weightKg > 0))) continue;
    const key = repsKey(s.weightKg);
    if (!(bests.reps.get(key) >= s.reps)) bests.reps.set(key, s.reps);
  }
  bests.sessions++;
}

/** Sets of one exercise in a workout (an exercise added twice counts as one session). */
const setsOf = (w, exerciseId) => w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);

/**
 * Go through finished workouts, oldest first, and collect every record.
 * Returns {
 *   bests:     Map(exerciseId → { sessions, weight, e1rm, volume, duration, distance, reps: Map(kg → reps) }),
 *   workoutVolume: { value, workoutId, date } | null,
 *   workouts:  how many finished workouts were looked at,
 *   events:    [{ type, exerciseId, name, workoutId, date, value, previous, setId, … }] oldest first,
 *   byWorkout: Map(workoutId → events)
 * }
 */
export function computeRecords(workouts) {
  const bests = new Map();
  const events = [];
  let workoutVolume = null;
  const list = finished(workouts);
  for (const w of list) {
    const where = { workoutId: w.id, date: w.startedAt };
    const seen = new Set();
    let total = 0;
    for (const entry of w.exercises) {
      if (seen.has(entry.exerciseId)) continue;
      seen.add(entry.exerciseId);
      const sets = setsOf(w, entry.exerciseId);
      if (!sets.some((s) => s.done)) continue;
      total += sets.reduce((sum, s) => sum + setVolume(s), 0);
      const b = bests.get(entry.exerciseId) ?? emptyBests();
      sessionRecords(b, sets).forEach((r) => events.push({ ...r, exerciseId: entry.exerciseId, name: entry.name, ...where }));
      addSession(b, sets, where);
      bests.set(entry.exerciseId, b);
    }
    if (total > 0) {
      if (workoutVolume && total > workoutVolume.value + EPS) {
        events.push({ type: 'workoutVolume', value: total, previous: workoutVolume.value, exerciseId: null, name: w.title, setId: null, ...where });
      }
      if (!workoutVolume || total > workoutVolume.value + EPS) workoutVolume = { value: total, ...where };
    }
  }
  const byWorkout = new Map();
  events.forEach((e) => {
    if (!byWorkout.has(e.workoutId)) byWorkout.set(e.workoutId, []);
    byWorkout.get(e.workoutId).push(e);
  });
  return { bests, workoutVolume, events, byWorkout, workouts: list.length };
}

/**
 * Records in a workout that's being logged (or edited), against `baseline` —
 * computeRecords() of the workouts before it. Done sets only.
 * Returns { sets: Map(setId → [types]), volume: [exerciseIds], workoutVolume: bool, events }.
 */
export function liveRecords(baseline, workout) {
  const sets = new Map();
  const volume = [];
  const events = [];
  const seen = new Set();
  let total = 0;
  for (const entry of workout.exercises) {
    if (seen.has(entry.exerciseId)) continue;
    seen.add(entry.exerciseId);
    const all = setsOf(workout, entry.exerciseId);
    total += all.reduce((sum, s) => sum + setVolume(s), 0);
    for (const r of sessionRecords(baseline.bests.get(entry.exerciseId), all)) {
      events.push({ ...r, exerciseId: entry.exerciseId, name: entry.name });
      if (r.setId) sets.set(r.setId, [...(sets.get(r.setId) ?? []), r.type]);
      else if (r.type === 'volume') volume.push(entry.exerciseId);
    }
  }
  const workoutVolume = Boolean(baseline.workoutVolume && total > baseline.workoutVolume.value + EPS);
  if (workoutVolume) events.push({ type: 'workoutVolume', value: total, previous: baseline.workoutVolume.value, exerciseId: null, name: workout.title, setId: null });
  return { sets, volume, workoutVolume, events };
}

/** Records for the workouts before a moment (and never the workout itself), for logging. */
export function baselineRecords(workouts, { excludeId = null, before = null } = {}) {
  return computeRecords(workouts.filter((w) => w.id !== excludeId && (!before || w.startedAt < before)));
}

/* ---------- Insights ---------- */

/**
 * One or two plain-words highlights for the dashboard and the Stats page:
 * a record from the last 7 days, and the exercise whose volume changed most
 * over the last 30 days compared with the 30 days before (at least 2 sessions
 * in each, and at least a 5% change). [{ icon, text, exerciseId?, workoutId? }]
 */
export function insights(workouts, records, now = new Date(), { nameOf = (id, fallback) => fallback } = {}) {
  const out = [];
  const weekAgo = addDays(startOfDay(now), -6);
  const order = Object.keys(RECORD_TYPES);
  const recent = records.events.filter((e) => new Date(e.date) >= weekAgo)
    .sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type) || String(y.date).localeCompare(String(x.date)))[0];
  if (recent) {
    out.push({ icon: 'trophy', text: `New record this week: ${recordTitle(recent, nameOf)} · ${recordValue(recent)}`, workoutId: recent.workoutId, exerciseId: recent.exerciseId });
  }
  const end = addDays(startOfDay(now), 1);
  const mid = addDays(end, -30);
  const start = addDays(mid, -30);
  const ids = new Set(finished(workouts).flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  let best = null;
  for (const id of ids) {
    const sessions = exerciseSessions(workouts, id);
    const before = sessions.filter((s) => s.date >= start && s.date < mid);
    const after = sessions.filter((s) => s.date >= mid && s.date < end);
    if (before.length < 2 || after.length < 2) continue;
    const pct = percentChange(before.reduce((t, s) => t + s.n.volume, 0), after.reduce((t, s) => t + s.n.volume, 0));
    if (pct == null || Math.abs(pct) < 5) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { id, pct, name: sessions[sessions.length - 1].workout.exercises.find((e) => e.exerciseId === id)?.name };
  }
  if (best) {
    out.push({
      icon: best.pct > 0 ? 'arrowUp' : 'arrowDown',
      text: `${nameOf(best.id, best.name)} volume ${best.pct > 0 ? 'up' : 'down'} ${Math.abs(best.pct)}% compared with the 30 days before`,
      exerciseId: best.id,
    });
  }
  return out;
}

/* ---------- Words ---------- */

const kg = (n) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100)} kg`;
const bigKg = (n) => `${Math.round(n).toLocaleString()} kg`;
const clock = (sec) => {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};

/** "Bench Press (Barbell) · Heaviest weight" — a record's title. */
export function recordTitle(event, nameOf = (id, fallback) => fallback) {
  if (event.type === 'workoutVolume') return `${RECORD_TYPES.workoutVolume} (${event.name})`;
  return `${nameOf(event.exerciseId, event.name)} · ${recordLabel(event)}`;
}

/** The kind of record in words: "Heaviest weight", "Most reps at 70 kg". */
export function recordLabel(event) {
  if (event.type === 'reps') return event.weightKg > 0 ? `Most reps at ${kg(event.weightKg)}` : 'Most reps';
  return RECORD_TYPES[event.type];
}

/** The record's number: "80 kg × 6", "12 reps", "2,400 kg", "1:30", "5 km". */
export function recordValue(event) {
  switch (event.type) {
    case 'weight': return event.reps ? `${kg(event.value)} × ${event.reps}` : kg(event.value);
    case 'e1rm': return kg(event.value);
    case 'reps': return `${event.value} reps`;
    case 'volume':
    case 'workoutVolume': return bigKg(event.value);
    case 'duration': return clock(event.value);
    case 'distance': return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(event.value)} km`;
    default: return String(event.value);
  }
}

/** The previous best, in the same words: "was 77.5 kg". */
export function recordPrevious(event) {
  if (event.previous == null) return '';
  const prev = { ...event, value: event.previous, reps: null };
  return `was ${recordValue(prev)}`;
}

/** A metric's value in words, for chart labels and readouts. */
export function formatMetric(metric, value) {
  if (value == null) return '—';
  switch (metric) {
    case 'weight':
    case 'e1rm': return kg(value);
    case 'volume': return bigKg(value);
    case 'duration': return clock(value);
    case 'distance': return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} km`;
    case 'frequency': return `${value} time${value === 1 ? '' : 's'}`;
    default: return Math.round(value).toLocaleString();
  }
}

/** "Volume up 12% compared with the 30 days before" (or about the same). */
export function comparisonText(metric, cmp, range) {
  if (!cmp || cmp.pct == null) return null;
  const label = metric === 'frequency' ? 'Sessions' : METRICS[metric].label;
  const period = rangeInfo(range)[3];
  const lead = range === 'all' ? 'Last 30 days: ' : '';
  if (cmp.pct === 0) return `${lead}${label} about the same as the ${period} before`;
  return `${lead}${label} ${cmp.pct > 0 ? 'up' : 'down'} ${Math.abs(cmp.pct)}% compared with the ${period} before`;
}
