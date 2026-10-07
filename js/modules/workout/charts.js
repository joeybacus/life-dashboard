/* Charts drawn by the app itself (no downloads, so they work offline).

   lineChart() and barChart() return markup with the numbers each point or bar
   shows when it's chosen. Tap (or hover with a mouse) anywhere on a chart to
   pick the nearest point; arrow keys move along it once it has keyboard focus.
   The chosen point's words appear in the readout under the chart, and a
   screen reader hears them. A hidden table lists every value too.

   The line itself is an SVG stretched over the plot (its stroke keeps its
   width); dots, gridlines and labels are ordinary page elements, so text never
   stretches with the chart. */
import { html, setHTML } from '../../core/html.js';

const pct = (n) => `${Math.round(n * 1000) / 10}%`;

/** About `count` round tick values covering min…max (whole numbers only when `integer`). */
export function niceTicks(min, max, count = 4, { integer = false } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  if (integer) step = step < 1 ? 1 : step === 2.5 * mag && mag === 1 ? 3 : Math.ceil(step);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * A line over time.
 *   points: [{ date, value, readout: { text, sub?, link? } }] oldest first
 *   label: what the chart shows (read by screen readers); format(value) for ticks
 *   zero: start the scale at 0 (counts) rather than near the lowest value (weights)
 */
export function lineChart({ points, label, format = String, zero = false, xLabels = [], trend = null, goal = null, legend = null }) {
  // trend: a smoothed value for each point, drawn as the main line over faint weigh-ins;
  // goal: a dashed line at that value; legend: { points, trend, goal } names, shown under the chart
  const values = [...points.map((p) => p.value), ...(trend ?? []), ...(goal != null ? [goal] : [])];
  const ticks = niceTicks(zero ? 0 : Math.min(...values), Math.max(...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const t0 = points[0].date.getTime();
  const t1 = points[points.length - 1].date.getTime();
  const xOf = (p) => (t1 === t0 ? 0.5 : 0.03 + 0.94 * ((p.date.getTime() - t0) / (t1 - t0)));
  const yOf = (v) => 1 - (v - lo) / (hi - lo || 1);
  const xy = points.map((p) => [xOf(p), yOf(p.value)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join(' ');
  const area = `${line} L${(xy[xy.length - 1][0] * 100).toFixed(2)} 100 L${(xy[0][0] * 100).toFixed(2)} 100 Z`;
  const trendLine = trend ? xy.map(([x], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(2)} ${(yOf(trend[i]) * 100).toFixed(2)}`).join(' ') : null;
  const showDots = points.length <= 40;
  const last = points.length - 1;
  return html`<figure class="chart chart--line" data-chart="line" data-xs="${JSON.stringify(xy.map(([x]) => Math.round(x * 1e4) / 1e4))}" data-readouts="${JSON.stringify(points.map((p) => p.readout))}" data-sel="${last}">
    <div class="chart__plot" tabindex="0" role="group" aria-label="${label}. ${points.length} point${points.length === 1 ? '' : 's'}. Use the arrow keys to move between them.">
      ${ticks.map((t) => html`<span class="chart__grid" style="top:${pct(yOf(t))}"><span class="chart__tick">${format(t)}</span></span>`)}
      <svg class="chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${points.length > 1 && !trend ? html`<path class="chart__area" d="${area}"/>` : ''}
        ${points.length > 1 ? html`<path class="chart__line${trend ? ' chart__line--raw' : ''}" d="${line}" vector-effect="non-scaling-stroke"/>` : ''}
        ${trendLine && points.length > 1 ? html`<path class="chart__trend" d="${trendLine}" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      ${goal != null ? html`<span class="chart__goal" style="top:${pct(yOf(goal))}" aria-hidden="true"><span>${legend?.goal ?? 'Goal'} ${format(goal)}</span></span>` : ''}
      <span class="chart__cross" aria-hidden="true" style="left:${pct(xy[last][0])}"></span>
      ${xy.map(([x, y], i) => (showDots || i === last
        ? html`<span class="chart__dot${i === last ? ' is-sel' : ''}" data-i="${i}" aria-hidden="true" style="left:${pct(x)};top:${pct(y)}"></span>`
        : ''))}
      ${showDots ? '' : html`<span class="chart__dot chart__dot--float" data-float aria-hidden="true" hidden></span>`}
    </div>
    ${xLabels.length ? html`<div class="chart__x" aria-hidden="true">${xLabels.map((t) => html`<span>${t}</span>`)}</div>` : ''}
    ${legend ? html`<div class="chart__legend" aria-hidden="true">
      <span><i class="chart__key chart__key--dot"></i>${legend.points}</span>
      ${trend ? html`<span><i class="chart__key chart__key--line"></i>${legend.trend}</span>` : ''}
      ${goal != null ? html`<span><i class="chart__key chart__key--goal"></i>${legend.goal ?? 'Goal'}</span>` : ''}
    </div>` : ''}
    <figcaption class="chart__readout" aria-live="polite" data-readout>${readoutMarkup(points[last].readout)}</figcaption>
    ${valueTable(label, points.map((p) => p.readout))}
  </figure>`;
}

/**
 * Columns, one per period.
 *   bars: [{ value, label (under the bar, may be ''), current?, readout }]
 *   goal: draws a goal line at that value (e.g. your weekly workout goal)
 */
export function barChart({ bars, label, format = String, goal = null, selected = bars.length - 1 }) {
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, Math.max(1, max), 3, { integer: true });
  const hi = ticks[ticks.length - 1] || 1;
  const n = bars.length;
  const xs = bars.map((_, i) => (i + 0.5) / n);
  return html`<figure class="chart chart--bars" data-chart="bars" data-xs="${JSON.stringify(xs.map((x) => Math.round(x * 1e4) / 1e4))}" data-readouts="${JSON.stringify(bars.map((b) => b.readout))}" data-sel="${selected}">
    <div class="chart__plot" tabindex="0" role="group" aria-label="${label}. ${n} bars. Use the arrow keys to move between them.">
      ${ticks.map((t) => html`<span class="chart__grid" style="top:${pct(1 - t / hi)}"><span class="chart__tick">${format(t)}</span></span>`)}
      ${goal ? html`<span class="chart__goal" style="top:${pct(1 - goal / hi)}" aria-hidden="true"><span>Goal ${format(goal)}</span></span>` : ''}
      <div class="chart__bars" style="--n:${n}" aria-hidden="true">
        ${bars.map((b, i) => html`<span class="chart__col${b.current ? ' is-current' : ''}${i === selected ? ' is-sel' : ''}" data-i="${i}">
          <span class="chart__bar${b.value ? '' : ' is-zero'}" style="height:${pct(b.value / hi)}"></span></span>`)}
      </div>
    </div>
    <div class="chart__x chart__x--bars" style="--n:${n}" aria-hidden="true">${bars.map((b) => html`<span>${b.label}</span>`)}</div>
    <figcaption class="chart__readout" aria-live="polite" data-readout>${readoutMarkup(bars[selected]?.readout)}</figcaption>
    ${valueTable(label, bars.map((b) => b.readout))}
  </figure>`;
}

function readoutMarkup(r) {
  if (!r) return '';
  return html`<span class="chart__readout-text"><strong>${r.text}</strong>${r.sub ? html`<span>${r.sub}</span>` : ''}</span>
    ${r.link ? html`<button type="button" class="text-btn" data-action="nav" data-route="workout" data-sub="${r.link.sub}">${r.link.label}</button>` : ''}`;
}

function valueTable(label, readouts) {
  return html`<table class="sr-only"><caption>${label}</caption><tbody>
    ${readouts.map((r) => html`<tr><td>${r.text}</td><td>${r.sub ?? ''}</td></tr>`)}</tbody></table>`;
}

/* ---------- Choosing a point ---------- */

function select(fig, index) {
  const xs = JSON.parse(fig.dataset.xs);
  const readouts = JSON.parse(fig.dataset.readouts);
  const i = Math.max(0, Math.min(xs.length - 1, index));
  if (String(i) === fig.dataset.sel) return;
  fig.dataset.sel = String(i);
  const plot = fig.querySelector('.chart__plot');
  if (fig.dataset.chart === 'line') {
    fig.querySelectorAll('.chart__dot.is-sel').forEach((d) => d.classList.remove('is-sel'));
    const dot = plot.querySelector(`.chart__dot[data-i="${i}"]`);
    const cross = plot.querySelector('.chart__cross');
    cross.style.left = pct(xs[i]);
    if (dot) dot.classList.add('is-sel');
    const float = plot.querySelector('[data-float]');
    if (float) {
      // Many points: one dot follows the choice, placed where the line passes
      const path = plot.querySelector('.chart__line');
      const d = path?.getAttribute('d')?.split(/[ML]/).filter(Boolean)[i];
      float.hidden = Boolean(dot) || !d;
      if (d && !dot) {
        const [x, y] = d.trim().split(/\s+/).map(Number);
        float.style.left = `${x}%`;
        float.style.top = `${y}%`;
        float.classList.add('is-sel');
      }
    }
  } else {
    fig.querySelectorAll('.chart__col.is-sel').forEach((c) => c.classList.remove('is-sel'));
    plot.querySelector(`.chart__col[data-i="${i}"]`)?.classList.add('is-sel');
  }
  const out = fig.querySelector('[data-readout]');
  setHTML(out, readoutMarkup(readouts[i]));
}

function nearest(fig, clientX) {
  const plot = fig.querySelector('.chart__plot');
  const box = plot.getBoundingClientRect();
  const x = (clientX - box.left) / box.width;
  const xs = JSON.parse(fig.dataset.xs);
  let best = 0;
  xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i; });
  return best;
}

let bound = false;

/** Listen for taps, hovering and arrow keys on every chart (once, for the whole app). */
export function bindCharts() {
  if (bound) return;
  bound = true;
  document.addEventListener('pointerdown', (event) => {
    const fig = event.target.closest('.chart__plot')?.closest('[data-chart]');
    if (fig) select(fig, nearest(fig, event.clientX));
  });
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const fig = event.target.closest('.chart__plot')?.closest('[data-chart]');
    if (fig) select(fig, nearest(fig, event.clientX));
  });
  document.addEventListener('keydown', (event) => {
    const plot = event.target.closest?.('.chart__plot');
    const fig = plot?.closest('[data-chart]');
    if (!fig || event.target !== plot) return;
    const n = JSON.parse(fig.dataset.xs).length;
    const i = Number(fig.dataset.sel);
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[event.key];
    if (to == null) return;
    event.preventDefault();
    select(fig, to);
  });
}
