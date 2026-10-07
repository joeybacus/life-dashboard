/* Health (Phase 5): body weight, height, BMI, a weight goal and body measurements.

   Every entry is one record in the "bodyMeasurements" store (synced to the
   Body measurements tab, and in backups):

   {
     id, createdAt, updatedAt, deletedAt,
     kind: 'weight' | 'height' | 'waist' | 'chest' | 'arms' | 'hips' | 'thighs' | 'bodyFat',
     valueKg,          weight only (the name used since Phase 1)
     value,            every other kind: cm, or % for body fat
     measuredAt,       ISO time of the weigh-in or measurement
     source: 'manual' | 'health',   'health' = sent from Apple Health by the Shortcut (0.6.1)
     note,
   }

   Height is a measurement too (the latest one counts), so it syncs like the rest.
   The weight goal lives in settings.health. The functions at the top are pure,
   so tools/health-checks.html can test them. */
import { db, stamp } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit } from '../../core/events.js';
import { addDays, startOfDay } from '../../core/dates.js';

export const KINDS = {
  weight: { label: 'Weight', unit: 'kg', min: 20, max: 400, decimals: 1 },
  waist: { label: 'Waist', unit: 'cm', min: 20, max: 300, decimals: 1 },
  chest: { label: 'Chest', unit: 'cm', min: 20, max: 300, decimals: 1 },
  arms: { label: 'Arms', unit: 'cm', min: 10, max: 120, decimals: 1, hint: 'Upper arm, at its widest' },
  hips: { label: 'Hips', unit: 'cm', min: 20, max: 300, decimals: 1 },
  thighs: { label: 'Thighs', unit: 'cm', min: 10, max: 150, decimals: 1, hint: 'At the widest part' },
  bodyFat: { label: 'Body fat', unit: '%', min: 2, max: 75, decimals: 1 },
  height: { label: 'Height', unit: 'cm', min: 50, max: 260, decimals: 1 },
};
/** The measurements listed on the Health page, in order. */
export const MEASUREMENTS = ['waist', 'chest', 'arms', 'hips', 'thighs', 'bodyFat'];

/** An entry's number (kg for weight, cm or % for the rest). */
export const valueOf = (r) => (r.kind === 'weight' ? r.valueKg : r.value);

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** "78.4 kg", "82 cm", "18.5 %" */
export function formatValue(kind, value, { unit = true } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const k = KINDS[kind] ?? KINDS.weight;
  const text = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: k.decimals }).format(round(value, k.decimals));
  return unit ? `${text}${k.unit === '%' ? ' %' : ` ${k.unit}`}` : text;
}

/** "+0.4 kg", "−1.2 cm", "±0 kg" */
export function formatChange(kind, delta) {
  if (delta == null) return '';
  const r = round(delta, KINDS[kind]?.decimals ?? 1);
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return `${sign}${formatValue(kind, Math.abs(r))}`;
}

/** Entries of one kind, oldest first (live ones only). */
export function entriesOf(records, kind) {
  return records.filter((r) => r.kind === kind && !r.deletedAt && Number.isFinite(valueOf(r)))
    .sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt)));
}

export const latestOf = (records, kind) => entriesOf(records, kind).at(-1) ?? null;

/**
 * A smoothed trend through the entries (oldest first): each weigh-in moves the
 * trend 10% of the way towards it per day since the last one, so a single
 * heavy or light morning barely moves it but a real change shows within a week
 * or two. Returns one trend value per entry.
 */
export function trendOf(entries) {
  const out = [];
  let trend = null;
  let last = null;
  for (const e of entries) {
    const v = valueOf(e);
    const t = Date.parse(e.measuredAt);
    if (trend == null) trend = v;
    else {
      const days = Math.max(0.25, (t - last) / 864e5);
      trend += (1 - 0.9 ** days) * (v - trend);
    }
    last = t;
    out.push(round(trend, 2));
  }
  return out;
}

/**
 * Change per week over the last `days` days (straight-line fit through the
 * entries), or null with fewer than 3 entries or less than a week between the
 * first and last of them.
 */
export function weeklyRate(entries, now = new Date(), days = 28) {
  const from = addDays(now, -days).getTime();
  const pts = entries.filter((e) => Date.parse(e.measuredAt) >= from).map((e) => [Date.parse(e.measuredAt) / (7 * 864e5), valueOf(e)]);
  if (pts.length < 3 || (pts.at(-1)[0] - pts[0][0]) < 1) return null;
  const mx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
  const my = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
  const num = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const den = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return den ? round(num / den, 2) : null;
}

/**
 * The latest entry compared with the last one at least `days` days before it:
 * { delta, days } (days actually between them), or null.
 */
export function changeOver(entries, days) {
  const latest = entries.at(-1);
  if (!latest) return null;
  const cutoff = Date.parse(latest.measuredAt) - days * 864e5;
  const earlier = [...entries].reverse().find((e) => Date.parse(e.measuredAt) <= cutoff);
  if (!earlier) return null;
  return {
    delta: round(valueOf(latest) - valueOf(earlier), 2),
    days: Math.round((startOfDay(new Date(latest.measuredAt)) - startOfDay(new Date(earlier.measuredAt))) / 864e5),
  };
}

/* ---------- BMI ---------- */

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  return round(weightKg / (heightCm / 100) ** 2, 1);
}

/** WHO adult categories. */
export function bmiCategory(value) {
  if (value == null) return null;
  if (value < 18.5) return 'Underweight';
  if (value < 25) return 'Healthy weight';
  if (value < 30) return 'Overweight';
  return 'Obesity';
}

/** The weight range that gives a BMI of 18.5–24.9 at this height. */
export function healthyRange(heightCm) {
  if (!(heightCm > 0)) return null;
  const m2 = (heightCm / 100) ** 2;
  return [round(18.5 * m2, 1), round(24.9 * m2, 1)];
}

/* ---------- Goal ---------- */

/**
 * Progress towards a target weight.
 *   goal: { goalKg, startKg, setAt }; current: latest weight (kg); rate: kg per week (or null)
 * Returns { direction: 'lose' | 'gain' | 'hold', done (0–1), left (kg still to go, ≥ 0),
 *           reached, onTrack (moving the right way), eta (Date) | null } or null without a goal.
 */
export function goalProgress(goal, current, rate = null, now = new Date()) {
  if (!goal || !(goal.goalKg > 0) || current == null) return null;
  const start = goal.startKg > 0 ? goal.startKg : current;
  const diff = goal.goalKg - start;
  const direction = Math.abs(diff) < 0.05 ? 'hold' : diff < 0 ? 'lose' : 'gain';
  if (direction === 'hold') {
    const off = round(Math.abs(current - goal.goalKg), 1);
    return { direction, done: off <= 1 ? 1 : 0, left: off, reached: off <= 1, onTrack: off <= 1, eta: null };
  }
  const leftSigned = goal.goalKg - current; // negative = still to lose
  const reached = direction === 'lose' ? current <= goal.goalKg : current >= goal.goalKg;
  const done = Math.max(0, Math.min(1, (current - start) / diff));
  const towards = rate != null && Math.abs(rate) >= 0.05 && Math.sign(rate) === Math.sign(diff);
  let eta = null;
  if (!reached && towards) {
    const weeks = Math.abs(leftSigned) / Math.abs(rate);
    if (weeks <= 156) eta = addDays(startOfDay(now), Math.ceil(weeks * 7));
  }
  return { direction, done, left: reached ? 0 : round(Math.abs(leftSigned), 1), reached, onTrack: reached || towards, eta };
}

/* ---------- Loading and saving ---------- */

export async function loadMeasurements() {
  return db.live('bodyMeasurements');
}

export const healthChanged = () => emit('data', { reason: 'health' });

/** Save an entry (new or edited); returns the saved record. */
export async function saveMeasurement(entry) {
  const record = stamp({ source: 'manual', note: '', ...entry });
  if (record.kind === 'weight') delete record.value;
  else delete record.valueKg;
  await saveRecord('bodyMeasurements', record);
  healthChanged();
  return record;
}

/** Delete an entry (soft, so it syncs); returns the record for Undo. */
export async function deleteMeasurement(id) {
  const record = await db.get('bodyMeasurements', id);
  if (!record) return null;
  await saveRecord('bodyMeasurements', stamp({ ...record, deletedAt: new Date().toISOString() }));
  healthChanged();
  return record;
}

/** Undo a delete. */
export async function restoreMeasurement(record) {
  await saveRecord('bodyMeasurements', stamp({ ...record, deletedAt: null }));
  healthChanged();
}
