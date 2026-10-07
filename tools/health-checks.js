/* Checks for the health logic (pure functions only — nothing is saved).
   Open tools/health-checks.html through the preview server. */
import {
  bmi, bmiCategory, changeOver, entriesOf, formatChange, formatValue, goalProgress, healthyRange, latestOf, trendOf, valueOf, weeklyRate,
} from '../js/modules/health/model.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : JSON.stringify(detail) });

const W = (day, kg, extra = {}) => ({ id: `w-${day}`, kind: 'weight', valueKg: kg, measuredAt: new Date(`${day}T07:00:00`).toISOString(), ...extra });
const M = (day, kind, value) => ({ id: `${kind}-${day}`, kind, value, measuredAt: new Date(`${day}T07:00:00`).toISOString() });

/* ---------- Entries ---------- */

const records = [W('2026-10-05', 80), W('2026-09-01', 82), W('2026-10-01', 80.6, { deletedAt: '2026-10-02' }), M('2026-09-20', 'waist', 86), M('2026-10-01', 'height', 176), M('2026-01-01', 'height', 175)];
check('entries of a kind, oldest first, deleted left out', entriesOf(records, 'weight').map((e) => e.valueKg).join() === '82,80');
check('the latest height counts', latestOf(records, 'height').value === 176);
check('weight uses valueKg, the rest use value', valueOf(records[0]) === 80 && valueOf(records[3]) === 86);

/* ---------- Words ---------- */

check('formatting', formatValue('weight', 78.44) === '78.4 kg' && formatValue('bodyFat', 18.5) === '18.5 %' && formatValue('waist', 82) === '82 cm', [formatValue('weight', 78.44), formatValue('bodyFat', 18.5)]);
check('changes are signed', formatChange('weight', -0.62) === '−0.6 kg' && formatChange('weight', 0.3) === '+0.3 kg' && formatChange('weight', 0.01) === '±0 kg', [formatChange('weight', -0.62), formatChange('weight', 0.01)]);

/* ---------- BMI ---------- */

check('BMI 80 kg at 176 cm = 25.8', bmi(80, 176) === 25.8, bmi(80, 176));
check('no BMI without a height', bmi(80, null) === null);
check('WHO categories', bmiCategory(18.4) === 'Underweight' && bmiCategory(24.9) === 'Healthy weight' && bmiCategory(25) === 'Overweight' && bmiCategory(30) === 'Obesity');
check('healthy weight range at 176 cm', JSON.stringify(healthyRange(176)) === '[57.3,77.1]', healthyRange(176));

/* ---------- Trend, change and pace ---------- */

const daily = [];
for (let i = 0; i < 29; i++) {
  const d = new Date(2026, 8, 8 + i);
  daily.push(W(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, 80 - i * (0.5 / 7) + (i % 2 ? 0.4 : -0.4)));
}
const trend = trendOf(daily);
check('one trend value per weigh-in, starting at the first', trend.length === daily.length && trend[0] === daily[0].valueKg);
check('the trend is smoother than the weigh-ins', Math.abs(trend[10] - trend[9]) < Math.abs(daily[10].valueKg - daily[9].valueKg), [trend[9], trend[10]]);
const spike = trendOf([W('2026-09-01', 80), W('2026-09-02', 80), W('2026-09-03', 82)]);
check('one heavy morning moves the trend only 10%', Math.abs(spike[2] - 80.2) < 0.01, spike);
const rate = weeklyRate(daily, new Date('2026-10-06T12:00:00'));
check('pace: about −0.5 kg a week', rate != null && Math.abs(rate + 0.5) < 0.08, rate);
check('no pace with too few weigh-ins', weeklyRate(daily.slice(-2), new Date('2026-10-06T12:00:00')) === null);
const ch = changeOver(daily, 7);
check('change over 7 days', ch.days === 7 && Math.abs(ch.delta - (daily.at(-1).valueKg - daily.at(-8).valueKg)) < 0.01, ch);
check('no change when nothing is old enough', changeOver(daily.slice(-3), 7) === null);

/* ---------- Goal ---------- */

const g = { goalKg: 75, startKg: 80, setAt: '2026-09-01T00:00:00.000Z' };
const p = goalProgress(g, 78, -0.5, new Date('2026-10-07T12:00:00'));
check('losing: 40% of the way, 3 kg left', p.direction === 'lose' && Math.abs(p.done - 0.4) < 1e-9 && p.left === 3 && !p.reached && p.onTrack, p);
check('…about 6 weeks to go', p.eta && Math.round((p.eta - new Date('2026-10-07T00:00:00')) / 864e5) === 42, p.eta);
check('going the wrong way: no date', goalProgress(g, 78, 0.3).eta === null && !goalProgress(g, 78, 0.3).onTrack);
check('reached', goalProgress(g, 74.8, -0.2).reached && goalProgress(g, 74.8, -0.2).done === 1 && goalProgress(g, 74.8).left === 0);
check('gaining towards a higher target', goalProgress({ goalKg: 85, startKg: 80 }, 82, 0.25).direction === 'gain' && goalProgress({ goalKg: 85, startKg: 80 }, 82, 0.25).done === 0.4);
check('a target equal to the start means holding', goalProgress({ goalKg: 80, startKg: 80 }, 80.6).direction === 'hold' && goalProgress({ goalKg: 80, startKg: 80 }, 80.6).reached);
check('no goal, no progress', goalProgress({ goalKg: null }, 80) === null);

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
