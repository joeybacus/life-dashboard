/* Checks for the workout analytics (pure functions only — nothing is saved).
   Open tools/workout-checks.html through the preview server. Dates are fixed
   local moments, so the results don't depend on when the checks run. */
import { addDays, startOfWeek, toDateKey } from '../js/core/dates.js';
import {
  baselineRecords, between, buckets, compareMetric, comparisonText, computeRecords, dayStreaks, e1rm, exerciseSessions,
  finished, frequencyBuckets, heatmap, insights, liveRecords, metricPoints, metricsFor, muscleFrequency, percentChange,
  rangeStart, rangeSummary, recordTitle, recordValue, sessionNumbers, summarize, weekStreaks,
} from '../js/modules/workout/analytics.js';
import { niceTicks } from '../js/modules/workout/charts.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : JSON.stringify(detail) });

/* ---------- Building test workouts ---------- */

let n = 0;
const S = (weightKg, reps, extra = {}) => ({ id: `set${n++}`, type: 'normal', weightKg, reps, done: true, ...extra });
const W = (day, exercises, { id = `w${n++}`, minutes = 60, title = 'Workout', time = '18:00' } = {}) => {
  const start = new Date(`${day}T${time}:00`);
  return {
    id, title, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + minutes * 60e3).toISOString(),
    pausedMs: 0, pausedAt: null, deletedAt: null, muscleGroups: [],
    exercises: Object.entries(exercises).map(([exerciseId, sets]) => ({ id: `e${n++}`, exerciseId, name: exerciseId, sets })),
  };
};
const now = new Date('2026-10-07T20:00:00');

/* ---------- Estimated 1-rep max ---------- */

check('Epley: 100 kg × 5 → 116.7 kg', e1rm(100, 5) === 116.7, e1rm(100, 5));
check('a single is its own 1-rep max', e1rm(140, 1) === 140);
check('no estimate above 12 reps, or without weight', e1rm(60, 13) == null && e1rm(0, 5) == null && e1rm(null, 5) == null);

/* ---------- Ranges and totals ---------- */

check('7 days = today and the 6 days before', toDateKey(rangeStart('7', now)) === '2026-10-01', toDateKey(rangeStart('7', now)));
check('all time has no start', rangeStart('all', now) === null);
const a = W('2026-10-06', { bench: [S(60, 10, { type: 'warmup' }), S(80, 8), S(80, 7)] }, { minutes: 50 });
const b = W('2026-09-20', { bench: [S(77.5, 8)] }, { minutes: 40 });
const sum = summarize([a, b]);
check('totals: workouts, time, sets, reps and volume (warm-ups count toward volume)',
  sum.count === 2 && sum.time === 90 * 60e3 && sum.sets === 4 && sum.reps === 33 && sum.volume === 600 + 640 + 560 + 620, sum);
const rs = rangeSummary([a, b], '7', now);
check('a range compares with the same length of time before it', rs.current.count === 1 && rs.previous.count === 0, rs);
check('percent change', percentChange(100, 112) === 12 && percentChange(0, 5) === null && percentChange(200, 100) === -50);
check('unfinished and deleted workouts are left out', finished([a, { ...b, endedAt: null }, { ...b, id: 'x', deletedAt: '2026-10-01' }]).length === 1);
check('between() includes the start, excludes the end',
  between([a, b], new Date('2026-09-20T00:00:00'), new Date('2026-10-06T00:00:00')).map((w) => w.id).join() === b.id);

/* ---------- Weeks, months and streaks ---------- */

const thisWeek = startOfWeek(now);
const inWeek = (weeksAgo, dayOffset = 0) => toDateKey(addDays(thisWeek, -7 * weeksAgo + dayOffset));
const streakList = [
  W(inWeek(0, 0), {}), W(inWeek(0, 1), {}),
  W(inWeek(1, 0), {}), W(inWeek(1, 2), {}),
  W(inWeek(2, 0), {}), W(inWeek(2, 3), {}),
  W(inWeek(4, 0), {}), W(inWeek(4, 1), {}), W(inWeek(4, 2), {}),
  W(inWeek(5, 0), {}), W(inWeek(5, 1), {}),
  W(inWeek(6, 0), {}), W(inWeek(6, 4), {}),
  W(inWeek(7, 0), {}), W(inWeek(7, 4), {}),
];
const ws = weekStreaks(finished(streakList), 2, now);
check('weeks on goal: 3 in a row now, best 4 (a week with too few breaks the run)', ws.current === 3 && ws.best === 4, ws);
const ws3 = weekStreaks(finished(streakList), 3, now);
check('…with a goal of 3: this week not met yet, so the run up to last week counts', ws3.current === 0 && ws3.best === 1, ws3);
const days = dayStreaks([W('2026-10-07', {}), W('2026-10-06', {}), W('2026-10-05', {}), W('2026-09-01', {}), W('2026-09-02', {}), W('2026-09-03', {}), W('2026-09-04', {})], now);
check('days in a row: 3 now, best 4', days.current === 3 && days.best === 4, days);
check('a day streak still stands until today ends', dayStreaks([W('2026-10-06', {}), W('2026-10-05', {})], now).current === 2);
const weeks = buckets(finished(streakList), { unit: 'week', count: 8, now });
check('8 weekly buckets, oldest first, this week last', weeks.length === 8 && weeks[7].current && weeks[7].count === 2 && weeks[3].count === 3 && weeks[4].count === 0,
  weeks.map((x) => x.count));
const months = buckets([a, b], { unit: 'month', count: 3, now });
check('monthly buckets', months.map((x) => x.count).join() === '0,1,1', months.map((x) => x.count));

/* ---------- Heatmap ---------- */

const heat = heatmap([a, b, W('2026-10-06', { squat: [S(100, 5)] })], { weeks: 53, now });
check('heatmap: 53 columns of 7 days, ending this week', heat.columns.length === 53 && heat.columns.every((c) => c.length === 7)
  && heat.columns[52].some((d) => d.key === '2026-10-07'), heat.columns.length);
const oct6 = heat.columns.flat().find((d) => d.key === '2026-10-06');
check('two workouts on one day are one square, with both workouts', oct6.workouts.length === 2 && oct6.level === 2, oct6);
check('the biggest day is the brightest of these two', heat.columns.flat().find((d) => d.key === '2026-09-20').level === 1);
check('days after today are marked as future', heat.columns[52].filter((d) => d.future).every((d) => d.key > '2026-10-07'));

/* ---------- Muscle groups ---------- */

const mf = muscleFrequency([a, W('2026-10-01', { bench: [S(70, 8)], squat: [S(100, 5), S(100, 5)] })], (e) => ({ bench: 'Chest', squat: 'Quads' }[e.exerciseId]));
check('muscles: working sets (no warm-ups) and workouts', JSON.stringify(mf) === JSON.stringify([
  { muscle: 'Chest', sets: 3, workouts: 2 }, { muscle: 'Quads', sets: 2, workouts: 1 }]), mf);

/* ---------- One exercise ---------- */

const sn = sessionNumbers([S(60, 10, { type: 'warmup' }), S(80, 8), S(80, 9), S(70, 12)]);
check('session numbers: heaviest (more reps wins a tie), est. 1RM, volume', sn.weight === 80 && sn.weightReps === 9 && sn.e1rm === 104 && sn.sets === 4 && sn.volume === 600 + 640 + 720 + 840, sn);
const hist = [
  W('2026-08-20', { bench: [S(70, 8), S(70, 8)] }, { id: 'h1' }),
  W('2026-08-27', { bench: [S(72.5, 8), S(72.5, 7)] }, { id: 'h2' }),
  W('2026-09-20', { bench: [S(75, 8)] }, { id: 'h3' }),
  W('2026-10-04', { bench: [S(77.5, 6), S(75, 9)] }, { id: 'h4' }),
];
const sessions = exerciseSessions(hist, 'bench');
check('sessions of one exercise, oldest first', sessions.map((s) => s.workout.id).join() === 'h1,h2,h3,h4');
check('chart points within a range', metricPoints(sessions, 'weight', '30', now).map((p) => p.value).join() === '75,77.5');
check('metrics offered per kind of exercise', metricsFor('weight').join() === 'weight,e1rm,volume,sets,reps,frequency'
  && metricsFor('duration').join() === 'sets,duration,frequency' && metricsFor('cardio').join() === 'sets,duration,distance,frequency');
const cmp = compareMetric(sessions, 'weight', '30', now);
check('compare: best weight in the last 30 days vs the 30 before', cmp.before === 72.5 && cmp.after === 77.5 && cmp.pct === 7, cmp);
check('…in words', comparisonText('weight', cmp, '30') === 'Heaviest weight up 7% compared with the 30 days before', comparisonText('weight', cmp, '30'));
check('nothing to compare when a period is empty', compareMetric(sessions, 'weight', '7', now) === null);
const fb = frequencyBuckets(sessions, '90', now);
check('how often: weekly bars for 3 months', fb.unit === 'week' && fb.buckets.length === 13 && fb.buckets.reduce((t, x) => t + x.count, 0) === 4, fb);
check('how often: monthly bars for all time', frequencyBuckets(sessions, 'all', now).unit === 'month' && frequencyBuckets(sessions, 'all', now).buckets.length === 3);

/* ---------- Personal records ---------- */

const rec = computeRecords(hist);
const types = (id) => (rec.byWorkout.get(id) ?? []).map((e) => e.type).sort().join();
check('the first session only sets the starting point', !rec.byWorkout.has('h1'));
check('heavier weight and a better 1RM are records (less volume isn\'t)', types('h2') === 'e1rm,weight', types('h2'));
check('h3: heavier and a better 1RM', types('h3') === 'e1rm,weight', types('h3'));
check('h4: heavier, better 1RM, more reps at 75 kg, more volume (and the best whole workout)', types('h4') === 'e1rm,reps,volume,weight,workoutVolume', types('h4'));
check('the record points at the set that holds it', rec.byWorkout.get('h4').find((e) => e.type === 'weight').setId === hist[3].exercises[0].sets[0].id);
check('a record remembers the previous best', rec.byWorkout.get('h4').find((e) => e.type === 'weight').previous === 75);
check('bests after all sessions', rec.bests.get('bench').weight.value === 77.5 && rec.bests.get('bench').reps.get('75') === 9 && rec.bests.get('bench').sessions === 4);
check('best workout volume is tracked as a record too', rec.workoutVolume.workoutId === 'h4' && rec.events.some((e) => e.type === 'workoutVolume' && e.workoutId === 'h4') && !rec.events.some((e) => e.type === 'workoutVolume' && e.workoutId === 'h2'));

const ties = computeRecords([W('2026-09-01', { row: [S(60, 10)] }), W('2026-09-08', { row: [S(60, 10)] }, { id: 't2' })]);
check('matching your best is not a record', !ties.byWorkout.has('t2'));
const warm = computeRecords([W('2026-09-01', { row: [S(60, 10)] }), W('2026-09-08', { row: [S(100, 10, { type: 'warmup' }), S(50, 10)] }, { id: 'wu' })]);
check('warm-ups never set weight records', !(warm.byWorkout.get('wu') ?? []).some((e) => e.type === 'weight' || e.type === 'e1rm'));
const bw = computeRecords([W('2026-09-01', { pullup: [S(null, 8)] }), W('2026-09-08', { pullup: [S(null, 10)] }, { id: 'bw' })]);
check('bodyweight: more reps is a record', bw.byWorkout.get('bw')?.[0]?.type === 'reps' && bw.byWorkout.get('bw')[0].weightKg === 0, bw.byWorkout.get('bw'));
const timed = computeRecords([
  W('2026-09-01', { plank: [{ id: 'p1', type: 'normal', durationSec: 60, done: true }] }),
  W('2026-09-08', { plank: [{ id: 'p2', type: 'normal', durationSec: 75, done: true }] }, { id: 'pl' }),
]);
check('timed exercises: longest time', timed.byWorkout.get('pl')?.map((e) => e.type).join() === 'duration', timed.byWorkout.get('pl'));

/* ---------- While logging ---------- */

const base = baselineRecords(hist, { before: '2026-10-05T00:00:00.000Z' });
check('the baseline only uses workouts before the one being logged', base.bests.get('bench').weight.value === 77.5 && base.workouts === 4);
const today = W('2026-10-07', { bench: [S(80, 5), S(80, 3), S(75, 10)] }, { id: 'today' });
const live = liveRecords(base, today);
check('live: the heaviest set gets the weight record, not every set', live.sets.get(today.exercises[0].sets[0].id)?.join() === 'weight'
  && !live.sets.has(today.exercises[0].sets[1].id), [...live.sets]);
check('live: more reps at 75 kg', live.sets.get(today.exercises[0].sets[2].id)?.includes('reps'));
check('live: e1RM record (75 × 10 → 100 kg beats 75 × 9 → 97.5)', live.sets.get(today.exercises[0].sets[2].id)?.includes('e1rm'), [...live.sets]);
check('live: session volume record listed by exercise', live.volume.join() === 'bench' && live.workoutVolume);
check('an exercise done for the first time sets no records', liveRecords(base, W('2026-10-07', { curl: [S(20, 10)] })).events.length === 0);

/* ---------- Words ---------- */

const ev = rec.byWorkout.get('h4');
check('record words', recordTitle(ev.find((e) => e.type === 'reps')) === 'bench · Most reps at 75 kg'
  && recordValue(ev.find((e) => e.type === 'weight')) === '77.5 kg × 6', ev.map((e) => recordTitle(e)));
const tips = insights(hist, rec, new Date('2026-10-06T20:00:00'));
check('insight: this week\'s record, heaviest weight first', tips[0]?.icon === 'trophy' && tips[0].text === 'New record this week: bench · Heaviest weight · 77.5 kg × 6', tips);

/* ---------- Chart scales ---------- */

check('nice ticks 0–4', niceTicks(0, 4, 3).join() === '0,2,4', niceTicks(0, 4, 3));
check('nice ticks 72.5–80', niceTicks(72.5, 80).join() === '72,74,76,78,80' || niceTicks(72.5, 80).join() === '72.5,75,77.5,80', niceTicks(72.5, 80));
check('counts get whole-number ticks', niceTicks(0, 5, 3, { integer: true }).every(Number.isInteger), niceTicks(0, 5, 3, { integer: true }));
check('a flat line still gets a scale', niceTicks(80, 80).length >= 2 && niceTicks(80, 80)[0] < 80);

/* ---------- Show the results ---------- */

const ol = document.getElementById('results');
results.forEach((r) => {
  const li = document.createElement('li');
  li.className = r.ok ? 'ok' : 'fail';
  li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` → ${r.detail}` : ''}`;
  ol.append(li);
});
const failed = results.filter((r) => !r.ok).length;
const summary = document.querySelector('[data-summary]');
summary.textContent = failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`;
summary.className = failed ? 'fail' : 'ok';
