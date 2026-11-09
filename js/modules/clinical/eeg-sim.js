/* EEG Study Guide: a small teaching simulator.
   Every pattern is built as potentials at the 10–20 electrodes against an ideal, silent reference. Montages are then
   computed from the same data, so phase reversals, fields, ear-reference contamination and artifacts behave as on a
   real recording. These are drawings made for learning, not patient recordings. Loaded by eeg-guide.html. */
(function () {
"use strict";
const FS = 200;   // samples per second
const LFF = 0.3;  // display low-frequency filter (Hz)

/* Flat head map: Cz in the middle, nose up (+y), the patient's left on the left (−x). */
const E = {
  Fp1:[-0.31,0.95], Fp2:[0.31,0.95],
  F7:[-0.81,0.59], F3:[-0.42,0.53], Fz:[0,0.5], F4:[0.42,0.53], F8:[0.81,0.59],
  T7:[-1,0], C3:[-0.5,0], Cz:[0,0], C4:[0.5,0], T8:[1,0],
  P7:[-0.81,-0.59], P3:[-0.42,-0.53], Pz:[0,-0.5], P4:[0.42,-0.53], P8:[0.81,-0.59],
  O1:[-0.31,-0.95], O2:[0.31,-0.95],
  A1:[-1.18,-0.12], A2:[1.18,-0.12]
};
const SCALP = Object.keys(E).filter(k => k[0] !== "A");
const OLD = {T7:"T3", T8:"T4", P7:"T5", P8:"T6"};
const LEFT_HEMI = ["Fp1","F7","F3","T7","C3","P7","P3","O1"];
const RIGHT_HEMI = ["Fp2","F8","F4","T8","C4","P8","P4","O2"];

const refChains = ref => [
  [["Fp1",ref[0]],["F7",ref[0]],["T7",ref[0]],["P7",ref[0]],["O1",ref[0]]],
  [["F3",ref[0]],["C3",ref[0]],["P3",ref[0]]],
  [["Fz",ref[2]],["Cz",ref[2]],["Pz",ref[2]]],
  [["F4",ref[1]],["C4",ref[1]],["P4",ref[1]]],
  [["Fp2",ref[1]],["F8",ref[1]],["T8",ref[1]],["P8",ref[1]],["O2",ref[1]]]];
const MONTAGES = {
  bipolar: {name:"Double banana", long:"Longitudinal bipolar (double banana): left temporal, left parasagittal, midline, right parasagittal, right temporal", groups:[
    [["Fp1","F7"],["F7","T7"],["T7","P7"],["P7","O1"]],
    [["Fp1","F3"],["F3","C3"],["C3","P3"],["P3","O1"]],
    [["Fz","Cz"],["Cz","Pz"]],
    [["Fp2","F4"],["F4","C4"],["C4","P4"],["P4","O2"]],
    [["Fp2","F8"],["F8","T8"],["T8","P8"],["P8","O2"]]]},
  transverse: {name:"Transverse", long:"Transverse bipolar: chains run from the left ear to the right ear, front to back", groups:[
    [["Fp1","Fp2"]],
    [["F7","F3"],["F3","Fz"],["Fz","F4"],["F4","F8"]],
    [["A1","T7"],["T7","C3"],["C3","Cz"],["Cz","C4"],["C4","T8"],["T8","A2"]],
    [["P7","P3"],["P3","Pz"],["Pz","P4"],["P4","P8"]],
    [["O1","O2"]]]},
  ear: {name:"Ear reference", long:"Referential: left electrodes to A1, right to A2, midline to both ears", groups:refChains(["A1","A2","Ears"])},
  avg: {name:"Average", long:"Average reference: each electrode minus the mean of all 19 scalp electrodes", groups:refChains(["Avg","Avg","Avg"])}
};

function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- the generator: helpers a pattern uses to paint potentials onto the electrodes ---------- */
function makeGen(dur, seed) {
  const n = Math.round(dur * FS);
  const rnd = mulberry32(seed || 1);
  const V = {}; for (const k in E) V[k] = new Float32Array(n);
  const z = () => new Float32Array(n);
  let spare = null;
  const nrm = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (!u) u = rnd(); const v = rnd(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
  };
  // a number, a function of time, or an array of samples
  const val = (f, t, i) => typeof f === "function" ? f(t) : (f && f.length ? f[i] : (f === undefined || f === null ? 1 : f));
  function lp(x, fc) { const a = Math.exp(-2 * Math.PI * fc / FS); let y = x[0]; for (let i = 0; i < n; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; } return x; }
  function hp(x, fc) { const a = Math.exp(-2 * Math.PI * fc / FS); let y = 0, p = x[0]; for (let i = 0; i < n; i++) { const xi = x[i]; y = a * (y + xi - p); p = xi; x[i] = y; } return x; }
  /** Random activity between lo and hi Hz with the given RMS amplitude (µV). */
  function band(lo, hi, rms) {
    const x = z(); for (let i = 0; i < n; i++) x[i] = nrm();
    if (lo > 0) { hp(x, lo); hp(x, lo); }
    if (hi) { lp(x, hi); lp(x, hi); }
    let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i];
    const k = rms / (Math.sqrt(s / n) || 1); for (let i = 0; i < n; i++) x[i] *= k;
    return x;
  }
  const sm = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)));
  const win = (t, a, b, r = 0.2) => (t <= a || t >= b) ? 0 : sm(Math.min((t - a) / r, (b - t) / r));
  const sumWin = (list, r = 0.2) => t => list.reduce((s, [a, b]) => s + win(t, a, b, r), 0);
  function steps(pts, r = 0.3) {
    return t => { let v = pts[0][1]; for (let k = 1; k < pts.length; k++) { if (t < pts[k][0]) break; v += (pts[k][1] - v) * sm((t - pts[k][0]) / r); } return v; };
  }
  function lin(pts) {
    return t => {
      if (t <= pts[0][0]) return pts[0][1];
      for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) { const [t0, v0] = pts[k - 1], [t1, v1] = pts[k]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
      return pts[pts.length - 1][1];
    };
  }
  function wax(depth = 0.3, fc = 0.5) { const w = band(0, fc, 1); for (let i = 0; i < n; i++) w[i] = Math.max(0.2, Math.min(1.35, 0.85 + depth * w[i])); return w; }
  function rhythm(f, amp, o = {}) {
    const x = z(); const j = o.jitter ?? 0.2; const jit = j > 0 ? band(0, 0.7, j) : null;
    let ph = o.phase ?? rnd() * 2 * Math.PI; const sh = o.shape || Math.sin;
    for (let i = 0; i < n; i++) {
      const t = i / FS; ph += 2 * Math.PI * (val(f, t, i) + (jit ? jit[i] : 0)) / FS;
      const e = val(o.env, t, i); if (e) x[i] = amp * e * sh(ph, t);
    }
    return x;
  }
  function mul(x, e) { for (let i = 0; i < n; i++) x[i] *= val(e, i / FS, i); return x; }
  function add(x, ...ys) { ys.forEach(y => { for (let i = 0; i < n; i++) x[i] += y[i]; }); return x; }
  function prod(...fs) { const x = z(); for (let i = 0; i < n; i++) { let v = 1; for (const f of fs) v *= val(f, i / FS, i); x[i] = v; } return x; }
  const fn = (f, k = 1) => prod(f, k);
  const neg = x => { const y = z(); for (let i = 0; i < n; i++) y[i] = -x[i]; return y; };
  function g1(x, t0, sd, A) {
    const i0 = Math.max(0, Math.floor((t0 - 5 * sd) * FS)), i1 = Math.min(n - 1, Math.ceil((t0 + 5 * sd) * FS));
    for (let i = i0; i <= i1; i++) { const d = (i / FS - t0) / sd; x[i] += A * Math.exp(-0.5 * d * d); }
    return x;
  }
  function ag(x, t0, sl, sr, A) {
    const i0 = Math.max(0, Math.floor((t0 - 5 * sl) * FS)), i1 = Math.min(n - 1, Math.ceil((t0 + 5 * sr) * FS));
    for (let i = i0; i <= i1; i++) { const dt = i / FS - t0, d = dt < 0 ? dt / sl : dt / sr; x[i] += A * Math.exp(-0.5 * d * d); }
    return x;
  }
  /** A surface-negative spike of size A (µV): steep rise, slower fall, a small positive phase and an after-going slow wave. */
  function spike(x, t0, A, o = {}) {
    ag(x, t0, o.r ?? 0.009, o.f ?? 0.016, -A);
    g1(x, t0 + (o.pt ?? 0.042), o.ps ?? 0.016, (o.pos ?? 0.28) * A);
    const w = o.wave ?? 0.6; if (w) g1(x, t0 + (o.wt ?? 0.16), o.ws ?? 0.055, -w * A);
    return x;
  }
  const sharp = (x, t0, A, o = {}) => spike(x, t0, A, Object.assign({r:0.02, f:0.036, pt:0.085, ps:0.03, pos:0.15, wave:0.6, wt:0.25, ws:0.07}, o));
  const dist2 = (e, c) => { const p = E[e], dx = p[0] - c[0], dy = p[1] - c[1]; return dx * dx + dy * dy; };
  const weight = (e, c, s) => Math.exp(-dist2(e, c) / (2 * s * s));
  /** Spread a signal over the scalp from centre c with spread s; o.lag(position) delays it per electrode (seconds). */
  function put(c, s, x, o = {}) {
    for (const e in E) {
      const k = weight(e, c, s) * (o.k ?? 1); if (k < 0.004) continue;
      const v = V[e], lag = o.lag ? Math.round(o.lag(E[e]) * FS) : 0;
      if (!lag) for (let i = 0; i < n; i++) v[i] += k * x[i];
      else for (let i = 0; i < n; i++) { const j = i - lag; if (j >= 0 && j < n) v[i] += k * x[j]; }
    }
  }
  function putEl(e, x, k = 1) { const v = V[e]; for (let i = 0; i < n; i++) v[i] += k * x[i]; }
  function scaleEl(f) { for (const e in E) { const k = f(e, E[e]); if (k === 1) continue; const v = V[e]; for (let i = 0; i < n; i++) v[i] *= k; } }
  function envAll(f) { const env = fn(f); for (const e in E) { const v = V[e]; for (let i = 0; i < n; i++) v[i] *= env[i]; } }

  /* Ongoing activity, correlated over neighbouring electrodes, plus a little independent activity at each. */
  const LAT = [[-0.55,0.8],[0.55,0.8],[0,0.55],[-0.95,0.3],[0.95,0.3],[-0.5,0.15],[0.5,0.15],[0,-0.05],[-0.95,-0.35],[0.95,-0.35],[-0.45,-0.65],[0.45,-0.65],[0,-0.85]];
  function background(o = {}) {
    const a = o.amp ?? 1;
    LAT.forEach(c => {
      const x = band(0.5, 3.5, (o.delta ?? 4.2) * a);
      add(x, band(4, 7.5, (o.theta ?? 3.6) * a));
      if ((o.beta ?? 2.6) > 0) add(x, band(14, 28, (o.beta ?? 2.6) * a));
      put(c, o.sigma ?? 0.36, x);
    });
    for (const e in E) { putEl(e, band(1.5, 12, (o.fine ?? 1.6) * a)); putEl(e, band(12, 40, (o.fine ?? 1.6) * a)); }
  }
  /** Posterior dominant rhythm: f (Hz or function), amp (µV), env (eyes), left/right scale, ant (spread forward). */
  function alpha(o = {}) {
    const base = rhythm(o.f ?? 10, 1, {jitter: o.jitter ?? 0.3, shape: o.shape});
    const shared = wax(o.depth ?? 0.45, 0.9), wl = wax(0.2, 1.2), wr = wax(0.2, 1.2);
    for (let i = 0; i < n; i++) { wl[i] *= shared[i]; wr[i] *= shared[i]; }
    const L = z(), R = z(), amp = o.amp ?? 40;
    for (let i = 0; i < n; i++) {
      const e = val(o.env, i / FS, i) * amp * base[i];
      L[i] = e * wl[i] * (o.left ?? 0.9); R[i] = e * wr[i] * (o.right ?? 1);
    }
    const s = o.sigma ?? 0.33;
    put([-0.3, -1.12], s, L); put([0.3, -1.12], s, R);
    if (o.ant) { const A = z(); for (let i = 0; i < n; i++) A[i] = (L[i] + R[i]) * 0.5 * o.ant; put([0, 0.15], 0.6, A); }
  }
  // the eyes: + means Fp positive (eyes rolled up, as in a blink or eye closure)
  function vert(x) { put([-0.3, 1.22], 0.3, x); put([0.3, 1.22], 0.3, x); }
  function blink(t0, A = 125, sd = 0.085) { const x = z(); g1(x, t0, sd, A); vert(x); }
  // + means looking to the patient's left: F7 positive, F8 negative
  function gaze(x) { put([-0.92, 0.75], 0.3, x); put([0.92, 0.75], 0.3, neg(x)); }
  function muscle(c, s, env, amp = 15) {
    for (const e in E) { const k = weight(e, c, s); if (k < 0.05) continue; const x = band(22, 0, amp * k); mul(x, env); putEl(e, x); }
  }
  let ekg = null;
  function heart(o = {}) {
    const x = z(); let beats = o.beats;
    if (!beats) { beats = []; const rate = o.rate ?? 72; let t = 0.1 + rnd() * 0.5; while (t < dur) { beats.push(t); t += 60 / rate * (1 + (rnd() - 0.5) * 0.05); } }
    beats.forEach(tb => { g1(x, tb - 0.16, 0.025, 0.12); g1(x, tb - 0.025, 0.008, -0.1); g1(x, tb, 0.009, 1); g1(x, tb + 0.028, 0.01, -0.28); g1(x, tb + 0.27, 0.05, 0.28); });
    ekg = x;
    const k = o.k ?? 0.3;
    if (k) for (const e in E) { const p = E[e], f = k * (-20 * p[0] - 12 * p[1]), v = V[e]; for (let i = 0; i < n; i++) v[i] += f * x[i]; }
  }
  function pop(e, t0, A, tau = 0.3) {
    const x = z(), i0 = Math.floor(t0 * FS);
    for (let i = i0; i < n; i++) { const dt = (i - i0) / FS; x[i] = A * Math.exp(-dt / tau) * (1 - Math.exp(-dt / 0.004)); }
    putEl(e, x);
  }
  function vertexWave(t0, A = 110) { const x = z(); ag(x, t0, 0.03, 0.045, -A); g1(x, t0 - 0.09, 0.03, 0.15 * A); g1(x, t0 + 0.14, 0.06, 0.3 * A); put([0, 0.05], 0.33, x); }
  function posts(t0, A = 35) { const x = z(); ag(x, t0, 0.018, 0.05, A); g1(x, t0 + 0.11, 0.04, -0.2 * A); put([-0.3, -1.1], 0.34, x); put([0.3, -1.1], 0.34, x, {k: 0.9}); }
  function spindle(t0, d = 1, A = 26, f = 13) {
    const x = z(), sd = d / 4, i0 = Math.max(0, Math.floor((t0 - 2 * sd) * FS)), i1 = Math.min(n - 1, Math.ceil((t0 + 2 * sd) * FS));
    for (let i = i0; i <= i1; i++) { const t = i / FS, u = (t - t0) / sd; x[i] += A * Math.exp(-0.5 * u * u) * Math.sin(2 * Math.PI * f * (t - t0)); }
    put([-0.42, 0.05], 0.4, x); put([0.42, 0.05], 0.4, x); put([0, 0.05], 0.3, x, {k: 0.5});
  }
  function kComplex(t0, A = 140) { const x = z(); ag(x, t0, 0.05, 0.07, -A); g1(x, t0 + 0.32, 0.13, 1.1 * A); g1(x, t0 + 0.72, 0.15, -0.2 * A); put([0, 0.35], 0.45, x); }
  /** Drowsy background: little alpha, more theta. */
  function drowsyBg() {
    background({theta: 3.4, delta: 3, beta: 1.2});
    alpha({amp: 9});
    put([0, 0], 0.7, band(4, 7, 4));
  }

  function finish() {
    if (!ekg) heart({});
    for (const e in E) hp(V[e], LFF);
    return {n, dur, V, ekg};
  }
  return {n, dur, FS, V, rnd, z, nrm, hp, lp, band, wax, rhythm, steps, lin, win, sumWin, mul, add, prod, fn, neg, g1, ag, spike, sharp,
    put, putEl, scaleEl, envAll, background, alpha, vert, blink, gaze, muscle, heart, pop, vertexWave, posts, spindle, kComplex,
    drowsyBg, finish};
}

const arc = p => -(Math.cos(p) + 0.38 * Math.cos(2 * p)) / 1.38;       // arch-shaped: sharp negative tops (up), rounded bottoms
const notched = p => (Math.sin(p) + 0.3 * Math.sin(3 * p) + 0.22 * Math.sin(2 * p)) / 1.25;
const saw = p => (Math.sin(p) + 0.3 * Math.sin(2 * p)) / 1.15;
const range = (a, b, step) => { const out = []; for (let t = a; t < b - 1e-9; t += step) out.push(+t.toFixed(4)); return out; };

/* ---------- the patterns ---------- */
const SPECS = {};
function S(id, o) { SPECS[id] = Object.assign({id, dur: 10, sens: 7, montage: "bipolar", seed: 1, events: [], ann: []}, o); }
const POST = ["P7","O1","P3","P4","O2","P8"];

S("pdr", {title:"Normal posterior dominant rhythm", seed:11,
  events:[[0.1,"Eyes closed"],[4,"Eyes open"],[7,"Eyes closed"]],
  ann:[{t0:0.3,t1:3.9,el:POST,label:"10 Hz alpha, back of the head"},{t0:4.15,t1:6.95,el:POST,label:"Blocks when the eyes open"},{t0:7.3,t1:9.9,el:POST,label:"Returns on closing"}],
  look:"With the eyes closed, rhythmic 10 Hz waves in the channels ending at O1 and O2, waxing and waning. They vanish within a second of eye opening and return on closing. The swing in the Fp channels at each opening and closing is the eye moving, not the brain.",
  why:"A posterior dominant rhythm (PDR) of 8.5 Hz or more, reactive and roughly symmetric, is the best single sign of a normal awake adult brain. Below 8 Hz in an alert adult is slowing. A side that fails to block on eye opening (Bancaud phenomenon) points to a lesion on that side.",
  tip:"Switch to Ear reference: the alpha is tallest at O1 and O2 themselves.",
  gen(g) {
    g.background();
    g.alpha({f:10, amp:44, env:g.steps([[0,1],[4.05,0.07],[7.15,1]], 0.3)});
    g.vert(g.fn(g.steps([[0,1],[4,0],[7,1]], 0.12), 70));
    g.blink(5.3, 110);
  }});

S("mu", {title:"Mu rhythm", seed:12,
  events:[[0.1,"Eyes open"],[5,"Clenches the right fist"]],
  ann:[{t0:0.3,t1:4.95,el:["C3","C4"],label:"Arch-shaped 9–10 Hz at C3 and C4"},{t0:5.25,t1:9.8,el:["C3"],label:"Left (C3) mu blocks with right-hand movement"}],
  look:"Arch-shaped, comb-like 9–10 Hz waves over C3 and C4 with the eyes open, the sharp side pointing up. The left one (C3) disappears when the right fist is clenched; the right one carries on. In the double banana it phase-reverses at C3 and C4.",
  why:"Normal. Mu blocks with movement, or the thought of moving, of the opposite limb, not with eye opening. It can be asymmetric and sharp, and it is prominent over a skull defect. Don't call it a spike train.",
  gen(g) {
    g.background(); g.alpha({amp:7});
    const L = g.rhythm(9.6, 24, {shape:arc, env:g.prod(g.wax(0.4, 0.8), g.steps([[0,1],[5.1,0.08]], 0.25))});
    const R = g.rhythm(9.1, 21, {shape:arc, env:g.wax(0.4, 0.8)});
    g.put([-0.52, 0.02], 0.24, L); g.put([0.52, 0.02], 0.24, R);
    [1.6, 6.4, 8.9].forEach(t => g.blink(t));
  }});

S("lambda", {title:"Lambda waves", seed:13,
  events:[[0.1,"Eyes open, scanning a busy picture"]],
  ann:[{t0:0.25,t1:9.8,el:["O1","O2"],label:"Positive sharp waves at O1/O2 after each eye movement"}],
  look:"Sharply contoured, triangular waves at O1 and O2 shortly after each eye movement (the small steps in F7 and F8 are the saccades). They are surface-positive, so they point down in a referential montage, but up in P3–O1 and P7–O1, where O1 is the second input.",
  why:"Normal, seen with visual scanning; gone with the eyes closed or facing a blank wall. Their sleep cousins are POSTS.",
  tip:"Flip between Ear reference and Double banana to watch the polarity rule at work.",
  gen(g) {
    g.background(); g.alpha({amp:6});
    const gz = g.z(), lam = g.z(); let t = 0.3, pos = 0;
    while (t < 9.6) {
      const np = (g.rnd() - 0.5) * 2;
      for (let i = Math.floor(t * FS); i < g.n; i++) gz[i] += (np - pos) * 22 * Math.min(1, (i / FS - t) / 0.04);
      pos = np;
      g.ag(lam, t + 0.09, 0.022, 0.05, 44 + g.rnd() * 16);
      t += 0.35 + g.rnd() * 0.4;
    }
    g.gaze(gz);
    g.put([-0.3, -1.1], 0.34, lam); g.put([0.3, -1.1], 0.34, lam);
  }});

S("photic", {title:"Photic driving", seed:14,
  events:[[0.2,"Photic 6 Hz"],[5.5,"Photic 12 Hz"]], ticks: range(0.2, 4.7, 1 / 6).concat(range(5.5, 9.5, 1 / 12)),
  ann:[{t0:0.3,t1:4.7,el:POST,label:"Driving at 6 Hz"},{t0:5.6,t1:9.5,el:POST,label:"Driving at 12 Hz"}],
  look:"With flashes at 6 Hz, rhythmic 6 Hz waves appear over the occipital channels; with flashes at 12 Hz, 12 Hz waves. The ticks on the top row mark each flash.",
  why:"Driving is normal and its absence means nothing. Abnormal is a photoparoxysmal response: generalized spike-and-wave or polyspikes set off by flashes (often 14–20 Hz), more significant if it outlasts the train (idiopathic generalized epilepsies, especially juvenile myoclonic epilepsy). Frontal muscle twitches locked to the flashes (photomyogenic response) are benign.",
  gen(g) {
    g.background(); g.alpha({amp:30, env:t => 1 - 0.55 * g.win(t, 0.2, 4.8, 0.2) - 0.45 * g.win(t, 5.5, 9.6, 0.2)});
    const d = g.z();
    for (let i = 0; i < g.n; i++) {
      const t = i / FS;
      d[i] = 24 * Math.sin(2 * Math.PI * 6 * (t - 0.3)) * g.win(t, 0.3, 4.75, 0.3) + 17 * Math.sin(2 * Math.PI * 12 * (t - 5.6)) * g.win(t, 5.6, 9.55, 0.3);
    }
    g.put([-0.3, -1.1], 0.34, d); g.put([0.3, -1.1], 0.34, d);
  }});

S("drowsy", {title:"Drowsiness (N1)", seed:15,
  events:[[0.1,"Eyes closed, relaxed"],[3.2,"Drowsy"]],
  ann:[{t0:0.2,t1:2.9,el:["O1","O2"],label:"Alpha while relaxed"},{t0:3.3,t1:9.9,el:["F7","F8"],label:"Slow rolling eye movements: F7 and F8 move opposite"},{t0:3.3,t1:9.9,el:["O1","O2"],label:"Alpha drops out; low theta takes over"}],
  look:"For the first 3 seconds the patient is relaxed with alpha. Then the alpha drops out and a low-voltage mix of theta takes over, while slow rolling eye movements swing F7 and F8 in opposite directions. A small vertex wave appears near the end.",
  why:"Learn drowsiness before anything else: most benign variants (wicket spikes, small sharp spikes, rhythmic mid-temporal theta) and most overcalls live here. Some slowing in drowsiness is normal.",
  gen(g) {
    g.background({theta:2.4});
    g.alpha({amp:40, env:g.steps([[0,1],[2.6,0.5],[3.4,0.06]], 0.6)});
    const th = g.band(4, 7, 7); g.mul(th, t => g.win(t, 3, 10.5, 1.2)); g.put([0, 0.1], 0.65, th);
    const th2 = g.band(4, 7, 4); g.mul(th2, t => g.win(t, 3, 10.5, 1.2)); g.put([-0.6, -0.2], 0.45, th2);
    const ey = g.fn(t => 95 * Math.sin(2 * Math.PI * 0.28 * (t - 3.4)) * g.win(t, 3.4, 10.5, 1)); g.gaze(ey);
    g.vertexWave(8.6, 65);
  }});

S("vertex", {title:"Vertex waves and POSTS", seed:16,
  events:[[0.1,"Asleep (N1–N2)"]],
  ann:[{t0:1.45,t1:1.85,el:["Cz"],label:"Vertex wave"},{t0:4.25,t1:4.65,el:["Cz"],label:"Vertex wave"},{t0:7.75,t1:8.15,el:["Cz"],label:"Vertex wave"},
    {t0:2.45,t1:3.95,el:["O1","O2"],label:"POSTS: positive, triangular, O1/O2"},{t0:5.5,t1:7.3,el:["O1","O2"],label:"POSTS"}],
  look:"Vertex waves: sharp, negative, symmetric waves maximal at Cz, phase-reversing between Fz–Cz and Cz–Pz. POSTS (positive occipital sharp transients of sleep): triangular waves at O1 and O2, single or in runs.",
  why:"Both are normal sleep transients. Vertex waves can be very sharp in young adults but stay symmetric and at the vertex. POSTS are the classic 'occipital spikes' overcall.",
  tip:"Use Transverse: the vertex wave phase-reverses at Cz between C3–Cz and Cz–C4.",
  gen(g) {
    g.background({theta:4, delta:3.5, beta:1});
    [1.62, 4.42, 7.92].forEach(t => g.vertexWave(t, 115));
    [2.55, 2.85, 3.1, 3.42, 3.75, 5.6, 5.88, 6.2, 6.55, 6.8, 7.15, 8.95, 9.3].forEach(t => g.posts(t, 30 + g.rnd() * 14));
  }});

S("n2", {title:"N2 sleep: spindles and a K-complex", seed:17,
  events:[[0.1,"Asleep (N2)"]],
  ann:[{t0:0.75,t1:1.65,el:["C3","C4","Cz"],label:"Spindle, 13 Hz"},{t0:3.85,t1:4.95,el:["C3","C4","Cz"],label:"Spindle"},{t0:5.85,t1:6.95,el:["Fz","Cz","F3","F4"],label:"K-complex, then a spindle"},{t0:8.0,t1:8.8,el:["C3","C4","Cz"],label:"Spindle"}],
  look:"Spindles: one-second bursts of 13 Hz, waxing then waning, maximal centrally and the same on both sides. K-complex: a sharp negative wave followed by a large, slow positive wave lasting over half a second, frontocentral, with a spindle riding after it.",
  why:"Spindles and K-complexes define N2. Spindles missing on one side suggest a thalamic or hemispheric lesion there; very abundant fast spindle-like beta hints at benzodiazepines.",
  gen(g) {
    g.background({delta:5, theta:3.5, beta:1});
    g.spindle(1.2, 0.9, 26); g.spindle(4.4, 1.1, 28); g.spindle(8.4, 0.8, 22);
    g.kComplex(6.05); g.spindle(6.75, 0.7, 20);
  }});

S("n3", {title:"N3: slow-wave sleep", seed:18, sens:10,
  events:[[0.1,"Asleep (N3)"]],
  ann:[{t0:0.2,t1:9.8,el:["Fp1","Fp2","F3","F4","Fz","F7","F8"],label:"High-voltage 0.5–2 Hz delta (over 75 µV)"}],
  look:"High-voltage (over 75 µV) 0.5–2 Hz delta everywhere, frontally maximal, filling most of the page.",
  why:"Normal in deep sleep. The same picture in a patient you thought was awake is severe encephalopathy, so always establish the state first.",
  gen(g) {
    g.background({delta:4, theta:2.5, beta:0.8});
    [[-0.5,0.6],[0.5,0.6],[0,0.35],[-0.65,-0.15],[0.65,-0.15],[0,-0.6]].forEach((c, k) => g.put(c, 0.42, g.band(0.4, 2.2, k < 3 ? 58 : 40)));
    g.spindle(7.1, 0.7, 14);
  }});

S("blink", {title:"Eye blinks", seed:19,
  events:[[0.1,"Eyes open"]],
  ann:[[1.1],[3.5],[3.95],[6.6],[8.9]].map(([t]) => ({t0:t - 0.22, t1:t + 0.26, el:["Fp1","Fp2"], label:"Blink"})),
  look:"Big, symmetric, rounded downward deflections in the first channel of each frontal chain (Fp1–F7, Fp1–F3, Fp2–F4, Fp2–F8), about a quarter of a second long, with almost nothing behind them.",
  why:"The eye is a dipole with a positive cornea. With each blink the eyes roll up (Bell phenomenon), bringing the positive cornea under Fp1 and Fp2. Frontal 'delta' that is really blinking is a classic overcall.",
  gen(g) {
    g.background(); g.alpha({amp:6});
    [[1.1,130],[3.5,125],[3.95,115],[6.6,140],[8.9,128]].forEach(([t, A]) => g.blink(t, A));
  }});

S("lateral", {title:"Lateral eye movements", seed:20,
  events:[[0.1,"Eyes open"],[1.5,"Looks left"],[3.05,"Centre"],[5,"Looks right"],[6.55,"Centre"],[8,"Looks left"],[9.3,"Centre"]],
  ann:[{t0:1.4,t1:3.0,el:["F7","F8"],label:"Looking left: F7 positive, F8 negative"},{t0:4.9,t1:6.5,el:["F7","F8"],label:"Looking right: the reverse"}],
  look:"Looking left: F7 goes positive and F8 negative, so the two temporal chains phase-reverse in opposite directions at F7 and F8. Looking right does the reverse. The tiny sharp spikes at the start of each movement are lateral rectus muscle potentials.",
  why:"Opposite-polarity phase reversals at F7 and F8 are eye movements, not bifrontal discharges. The eyes look toward the positive side.",
  gen(g) {
    g.background(); g.alpha({amp:6});
    g.gaze(g.fn(g.steps([[0,0],[1.5,1],[3.05,0],[5,-1],[6.55,0],[8,1],[9.3,0]], 0.06), 95));
    [[1.5,-1],[5,1],[8,-1],[3.05,1],[6.55,-1],[9.3,1]].forEach(([t, side]) => g.muscle([side * 0.95, 0.65], 0.22, tt => g.win(tt, t - 0.005, t + 0.05, 0.012), 22));
  }});

S("muscle", {title:"Muscle and chewing", seed:21,
  events:[[0.4,"Clenches the jaw"],[4.1,"Relaxes"],[5,"Chewing"]],
  ann:[{t0:0.4,t1:4.0,el:["F7","T7","F8","T8"],label:"Very fast muscle activity, temporal"},{t0:5,t1:9.8,el:["F7","T7","F8","T8"],label:"Chewing: rhythmic bursts"}],
  look:"Very fast, spiky activity in the temporal channels (F7, T7, F8, T8) while the jaw is clenched; chewing gives rhythmic bursts with quiet gaps between them.",
  why:"Muscle is the commonest artifact. It hides the EEG but isn't brain. Lowering the high-frequency filter to 'clean it up' can turn it into fake beta or spikes.",
  gen(g) {
    g.background(); g.alpha({amp:8});
    const chew = g.sumWin(range(5, 9.7, 0.75).map(t => [t, t + 0.32]), 0.05);
    const env = t => g.win(t, 0.4, 4.0, 0.1) + chew(t);
    g.muscle([-1, 0.25], 0.32, env, 26); g.muscle([1, 0.25], 0.32, env, 24);
    const jaw = g.band(1, 3, 10); g.mul(jaw, chew); g.put([-1, -0.1], 0.4, jaw); g.put([1, -0.1], 0.4, g.neg(jaw));
  }});

S("ecg", {title:"EKG artifact", seed:22, montage:"ear",
  events:[[0.1,"Eyes closed"]],
  ann:[{t0:0.2,t1:9.8,el:["Fp1","F7","T7","P7","O1","F3","C3","P3"],label:"Sharp blips locked to every QRS"}],
  look:"Small sharp blips at the same moments as each QRS in the EKG channel, most obvious in the ear-referenced left channels.",
  why:"Line anything suspicious up with the EKG channel first. EKG artifact is bigger with a short, thick neck and with ear references. A slow wave at a single electrode just after each QRS is pulse artifact: that electrode sits on an artery.",
  tip:"This starts on Ear reference; switch to Double banana and watch it shrink.",
  gen(g) { g.background(); g.alpha({amp:36}); g.heart({rate:80, k:1.6}); }});

S("pop", {title:"Electrode pop", seed:23,
  events:[[0.1,"Eyes closed"]],
  ann:[{t0:2.3,t1:3.4,el:["T8"],label:"Only the T8 channels: no field"},{t0:6.8,t1:7.8,el:["T8"],label:"Again at T8"}],
  look:"Sudden, near-vertical jumps with a slow tail in only the two channels that contain T8 (F8–T8 and T8–P8), moving in opposite directions. Nothing in any neighbour.",
  why:"It 'phase-reverses', but it has no field: real cerebral potentials always spread to nearby electrodes. A single-electrode event is the electrode (drying gel, poor contact), not the brain.",
  gen(g) { g.background(); g.alpha({amp:38}); g.pop("T8", 2.4, 190); g.pop("T8", 6.9, -150, 0.25); g.pop("T8", 8.3, 90, 0.15); }});

S("wicket", {title:"Wicket spikes", seed:24,
  events:[[0.1,"Drowsy, 64-year-old"]],
  ann:[{t0:0.95,t1:1.95,el:["F7","T7","P7"],label:"Wicket train, 8–9 Hz"},{t0:3.6,t1:3.85,el:["T7"],label:"Single wicket"},{t0:4.4,t1:4.65,el:["T7"],label:"Single wicket"},
    {t0:5.75,t1:6.55,el:["F8","T8","P8"],label:"Right side too"},{t0:7.35,t1:8.75,el:["F7","T7","P7"],label:"Same shape, no slow wave after"}],
  look:"Trains of arch-shaped 8–9 Hz waves in the left mid-temporal channels during drowsiness, single 'wickets' at about 3.7 and 4.5 seconds, and a shorter run on the right. No after-going slow wave; the background carries on undisturbed.",
  why:"A benign variant in adults over 30, and the most overcalled one. A single wicket can look like a spike, so compare it with the trains: same shape, no slow wave, no disruption.",
  gen(g) {
    g.drowsyBg();
    const wk = p => -(Math.cos(p) + 0.5 * Math.cos(2 * p)) / 1.5;
    const L = g.rhythm(8.6, 46, {shape:wk, jitter:0.08, env:g.sumWin([[1.0,1.9],[7.4,8.7]], 0.25)});
    [3.72, 4.52].forEach(t => { g.ag(L, t, 0.022, 0.03, -46); g.g1(L, t + 0.06, 0.03, 14); });
    g.put([-1, 0.03], 0.32, L);
    g.put([1, 0.03], 0.32, g.rhythm(9, 34, {shape:wk, jitter:0.08, env:t => g.win(t, 5.8, 6.5, 0.2)}));
  }});

S("sss", {title:"Small sharp spikes", seed:25,
  events:[[0.1,"Drowsy (N1)"]],
  ann:[{t0:2.1,t1:2.45,el:["F7","T7"],label:"Small sharp spike"},{t0:5.5,t1:5.85,el:["F8","T8"],label:"Other side"},{t0:8.2,t1:8.55,el:["F7","T7"],label:"Tiny, brief, no disruption"}],
  look:"Tiny (under 50 µV), very brief (under 50 ms) spikes in drowsiness, left then right then left, with at most a small slow wave and a broad field.",
  why:"Small sharp spikes (benign sporadic sleep spikes, benign epileptiform transients of sleep) are benign in adults and fade in deeper sleep. Real epileptiform discharges are usually bigger and longer, and disturb the background.",
  gen(g) {
    g.drowsyBg();
    const o = {r:0.006, f:0.011, pt:0.03, ps:0.012, pos:0.3, wave:0.22, wt:0.12, ws:0.05};
    const L = g.z(), R = g.z(); g.spike(L, 2.2, 46, o); g.spike(R, 5.6, 42, o); g.spike(L, 8.3, 44, o);
    g.put([-0.95, 0.12], 0.34, L); g.put([0.95, 0.12], 0.34, R);
  }});

S("phantom", {title:"6 Hz spike-and-wave (phantom)", seed:26,
  events:[[0.1,"Drowsy, 25-year-old woman"]],
  ann:[{t0:2.05,t1:3.05,el:POST,label:"6 Hz spike-and-wave, tiny spike"},{t0:6.55,t1:7.45,el:POST,label:"Again: brief, posterior, low"}],
  look:"Two short (under 1 second) bursts of 6 Hz spike-and-wave with a tiny, easily missed spike, posterior and on both sides, in drowsiness.",
  why:"Benign 'FOLD' type: Female, Occipital, Low amplitude, Drowsy. The 'WHAM' type (Wake, High amplitude, Anterior, Male) is more often linked to seizures.",
  gen(g) {
    g.drowsyBg();
    const x = g.z();
    [[2.1, 3.0], [6.6, 7.4]].forEach(([a, b]) => { for (let t = a; t < b; t += 1 / 6) { g.spike(x, t, 22, {r:0.005, f:0.008, wave:0, pos:0.2}); g.g1(x, t + 0.07, 0.03, -50); } });
    g.put([-0.3, -1.0], 0.4, x); g.put([0.3, -1.0], 0.4, x);
  }});

S("rmtd", {title:"Rhythmic mid-temporal theta of drowsiness", seed:27,
  events:[[0.1,"Drowsy"]],
  ann:[{t0:2.0,t1:8.0,el:["F7","T7","P7"],label:"5–6 Hz notched theta, same shape throughout"}],
  look:"A run of 5–6 Hz notched, flat-topped theta in the left temporal chain in drowsiness, with the same shape from start to finish.",
  why:"Benign (also called the psychomotor variant). It does not evolve: no change in frequency, amplitude or spread. Evolution is what separates a temporal lobe seizure from it.",
  gen(g) { g.drowsyBg(); g.put([-1, 0], 0.33, g.rhythm(5.6, 36, {shape:notched, jitter:0.06, env:t => g.win(t, 2, 8, 0.5)})); }});

S("breach", {title:"Breach rhythm", seed:28,
  events:[[0.1,"Old right craniotomy; eyes closed"]],
  ann:[{t0:0.2,t1:9.8,el:["C4","T8"],label:"Bigger, faster, sharper over the skull defect"}],
  look:"Over the right central-temporal region (C4, T8) the activity is higher, faster and sharper than on the left, with a few sharply contoured waves.",
  why:"Bone filters and shrinks the EEG; where it is missing (craniotomy, fracture) activity looks bigger and spikier. Only call discharges there if they clearly stand out from the breach activity around them.",
  gen(g) {
    g.background(); g.alpha({amp:38});
    g.scaleEl((e, p) => 1 + 0.75 * Math.exp(-((p[0] - 0.8) ** 2 + (p[1] - 0.03) ** 2) / (2 * 0.3 * 0.3)));
    g.put([0.8, 0.03], 0.27, g.band(14, 26, 8));
    g.put([0.75, 0.05], 0.25, g.rhythm(9.5, 24, {shape:arc, env:g.wax(0.5, 0.7)}));
    const s = g.z(); g.sharp(s, 3.1, 40, {wave:0.2}); g.sharp(s, 7.4, 34, {wave:0.2}); g.put([0.84, 0], 0.25, s);
  }});

S("focalslow", {title:"Focal polymorphic delta", seed:29,
  events:[[0.1,"Awake, eyes closed"]],
  ann:[{t0:0.2,t1:9.8,el:["F7","T7","P7"],label:"Continuous irregular 1–3 Hz delta, left temporal"}],
  look:"Continuous, irregular 1–3 Hz delta in the left temporal channels that never settles into a rhythm, with less alpha on the left.",
  why:"Continuous polymorphic delta means a structural lesion of the underlying white matter (infarct, tumour, abscess, haematoma, contusion). Intermittent focal slowing is less specific.",
  gen(g) {
    g.background(); g.alpha({amp:42, left:0.45});
    g.put([-0.95, 0.2], 0.36, g.band(0.6, 3, 27)); g.put([-0.75, -0.25], 0.34, g.band(0.7, 3, 20)); g.put([-0.6, 0.5], 0.35, g.band(0.6, 2.5, 14));
  }});

S("diffslow", {title:"Generalized slowing (moderate)", seed:30,
  events:[[0.1,"Eyes closed, drowsy-looking"],[5,"Name called: opens eyes"]],
  ann:[{t0:0.2,t1:4.9,el:POST,label:"PDR only 6–7 Hz"},{t0:1.8,t1:3.4,el:["Fp1","F3","Fp2","F4","Fz"],label:"Diffuse theta–delta"},{t0:5.1,t1:6.4,el:POST,label:"Still reactive"}],
  look:"The PDR is only 6–7 Hz, with a diffuse mix of theta and bursts of delta over both hemispheres. When the name is called the eyes open and the rhythm attenuates: it is still reactive.",
  why:"Diffuse slowing means diffuse dysfunction: toxic-metabolic, drugs, sepsis, postictal, neurodegenerative. It doesn't name the cause, but its severity tracks the encephalopathy. Reactivity is a good sign.",
  gen(g) {
    g.background({theta:4.5, delta:4.5, beta:0.9});
    g.alpha({f:6.6, amp:30, depth:0.45, ant:0.3, env:g.steps([[0,1],[5,0.3],[6.4,1]], 0.3)});
    const bursts = g.sumWin([[1.8,3.4],[7.0,8.6]], 0.4);
    g.put([-0.4, 0.3], 0.55, g.mul(g.band(0.8, 2.5, 30), bursts)); g.put([0.4, 0.3], 0.55, g.mul(g.band(0.8, 2.5, 30), bursts));
    g.blink(5.1, 110);
  }});

S("firda", {title:"Frontal intermittent rhythmic delta (GRDA)", seed:31,
  events:[[0.1,"Confused, eyes closed"]],
  ann:[{t0:1.2,t1:3.7,el:["Fp1","F3","Fp2","F4","Fz","F7","F8"],label:"Rhythmic 2–3 Hz delta, frontal, both sides"},{t0:6.0,t1:8.5,el:["Fp1","F3","Fp2","F4","Fz","F7","F8"],label:"Same shape; no evolution"}],
  look:"Bursts of monomorphic, sinusoidal 2–3 Hz delta, maximal frontally, on both sides together, on a mildly slow background.",
  why:"Nonspecific: metabolic or toxic encephalopathy, raised intracranial pressure, deep midline lesions. Not epileptiform and not linked to seizures (ACNS name: GRDA, frontally predominant).",
  gen(g) {
    g.background({theta:4, delta:3.5}); g.alpha({f:7.5, amp:20});
    const x = g.rhythm(2.4, 85, {jitter:0.06, env:g.sumWin([[1.2,3.7],[6.0,8.5]], 0.4)});
    g.put([-0.32, 0.72], 0.42, x); g.put([0.32, 0.72], 0.42, x);
  }});

S("asym", {title:"Right-sided attenuation", seed:32,
  events:[[0.1,"Eyes closed"]],
  ann:[{t0:0.2,t1:9.8,el:RIGHT_HEMI,label:"Everything lower on the right"}],
  look:"Everything (alpha, beta, the whole background) is lower over the right hemisphere.",
  why:"Lower amplitude means something between cortex and electrode (subdural haematoma or hygroma, scalp swelling) or loss of cortex (a large infarct). Higher amplitude on one side is usually a breach.",
  tip:"Ear reference makes the difference in amplitude easiest to compare.",
  gen(g) { g.background(); g.alpha({amp:40}); g.scaleEl((e, p) => p[0] > 0.15 ? 0.4 : p[0] > -0.15 ? 0.72 : 1); }});

S("drugbeta", {title:"Excess beta (benzodiazepine)", seed:33,
  events:[[0.1,"On lorazepam; eyes closed"]],
  ann:[{t0:0.2,t1:9.8,el:["Fp1","F3","C3","Fz","Fp2","F4","C4"],label:"Abundant 15–25 Hz beta, frontocentral"}],
  look:"Abundant 15–25 Hz beta of 20–30 µV over the front and centre of the head, on top of a normal alpha.",
  why:"Benzodiazepines, barbiturates, propofol and chloral hydrate. A drug effect, not a worry in itself, but a focal lack of drug beta suggests cortical dysfunction on that side.",
  gen(g) {
    g.background(); g.alpha({amp:28});
    [[-0.45,0.5],[0.45,0.5],[0,0.35],[-0.6,0],[0.6,0],[0,-0.1]].forEach(c => g.put(c, 0.36, g.mul(g.band(15, 26, 8), g.wax(0.4, 1))));
  }});

S("ats", {title:"Left anterior temporal sharp waves", seed:34,
  events:[[0.1,"Awake, eyes closed"]],
  ann:[1.7, 5.0, 7.8].map(t => ({t0:t - 0.15, t1:t + 0.45, el:["F7","T7"], label:"Sharp wave: phase reversal at F7"})),
  look:"Sharp waves that stand out from the background, each with an after-going slow wave. In the double banana the left temporal chain phase-reverses at F7, with the pens pointing at each other (negative). F3 and T7 share the field, less strongly.",
  why:"Interictal epileptiform discharges from the left anterior temporal region. Temporal lobe epilepsy, most often mesial, is the commonest focal epilepsy in adults. Discharges show an area that can generate seizures; they are not seizures themselves.",
  tip:"Try Ear reference: A1 picks up the discharge too, so the left channels shrink. Average reference shows F7 tallest.",
  gen(g) {
    g.background(); g.alpha({amp:38});
    const x = g.z(); [1.7, 5.0, 7.8].forEach((t, k) => g.sharp(x, t, [120, 108, 126][k]));
    g.put([-0.95, 0.38], 0.33, x); g.put([-0.95, 0.38], 0.33, g.band(1, 3, 7));
  }});

S("tirda", {title:"Temporal intermittent rhythmic delta (TIRDA)", seed:35,
  events:[[0.1,"Awake, eyes closed"]],
  ann:[{t0:1.1,t1:3.7,el:["F7","T7","P7"],label:"Rhythmic 2–3 Hz delta, left temporal"},{t0:6.3,t1:8.8,el:["F7","T7","P7"],label:"TIRDA"}],
  look:"Runs of rhythmic, sawtooth-shaped 2–3 Hz delta in the left temporal channels, coming and going on a normal background.",
  why:"Unlike frontal rhythmic delta, TIRDA is an epileptiform equivalent: it means the same as temporal spikes for temporal lobe epilepsy.",
  gen(g) { g.background(); g.alpha({amp:32}); g.put([-0.98, 0.2], 0.34, g.rhythm(2.3, 46, {shape:saw, jitter:0.08, env:g.sumWin([[1.1,3.7],[6.3,8.8]], 0.35)})); }});

S("gsw3", {title:"3 Hz generalized spike-and-wave", seed:36, sens:10,
  events:[[0.1,"Hyperventilation, 2nd minute, counting aloud"],[3.1,"Stops counting"],[9.3,"Resumes counting"]],
  ann:[{t0:2.95,t1:9.1,el:SCALP,label:"Generalized 3 Hz spike-and-wave: abrupt on, abrupt off"}],
  look:"Abrupt onset of symmetric, generalized, frontally maximal 3–3.5 Hz spike-and-wave that slows a little toward 3 Hz and ends abruptly after 6 seconds. The patient stops counting during it.",
  why:"A typical absence seizure (childhood or juvenile absence epilepsy, which can persist into adulthood). Hyperventilation provokes it in most untreated patients. Longer bursts are more likely to impair awareness: test it by asking the patient to count or to remember a word.",
  gen(g) {
    g.background(); g.alpha({amp:32, env:t => 1 - g.win(t, 2.9, 9.2, 0.15)});
    const x = g.z(), f = g.lin([[3,3.6],[9,2.9]]); let t = 3.0;
    while (t < 9.0) { const a = Math.min(1, 0.6 + (t - 3) / 0.6); g.spike(x, t, 150 * a, {wave:0, pos:0.35}); g.g1(x, t + 0.15, 0.06, -230 * a); t += 1 / f(t); }
    g.put([-0.35, 0.42], 0.5, x); g.put([0.35, 0.42], 0.5, x);
  }});

S("pspw", {title:"Polyspike-and-wave (juvenile myoclonic epilepsy)", seed:37, sens:10,
  events:[[0.1,"Awake, eyes closed"],[6.35,"Myoclonic jerk, both arms"]],
  ann:[{t0:1.95,t1:3.45,el:SCALP,label:"Irregular 4–6 Hz polyspike-and-wave"},{t0:6.25,t1:7.15,el:SCALP,label:"Burst with a myoclonic jerk"}],
  look:"Irregular generalized bursts of 4–6 Hz polyspike-and-wave, frontocentral. The second burst comes with a myoclonic jerk (the muscle artifact).",
  why:"Juvenile myoclonic epilepsy: morning myoclonus, generalized tonic–clonic seizures after sleep loss, photosensitivity in about a third. Narrow-spectrum drugs (carbamazepine, oxcarbazepine, phenytoin) can make it worse.",
  gen(g) {
    g.background(); g.alpha({amp:32, env:t => 1 - g.win(t, 1.9, 3.5, 0.1) - g.win(t, 6.2, 7.2, 0.1)});
    const x = g.z();
    [[2.0, 3.35], [6.3, 7.05]].forEach(([a, b]) => {
      let t = a;
      while (t < b) {
        const ns = 2 + Math.floor(g.rnd() * 3);
        for (let k = 0; k < ns; k++) g.spike(x, t + k * 0.058, 110 + g.rnd() * 50, {wave:0, pos:0.3, r:0.007, f:0.012});
        g.g1(x, t + ns * 0.058 + 0.1, 0.055, -170);
        t += 0.2 + g.rnd() * 0.07 + ns * 0.02;
      }
    });
    g.put([-0.35, 0.42], 0.5, x); g.put([0.35, 0.42], 0.5, x);
    g.muscle([0, 0.2], 1.2, t => g.win(t, 6.36, 6.54, 0.02), 34);
    const mv = g.z(); g.g1(mv, 6.5, 0.06, 60); g.put([0, 0.6], 0.7, mv);
  }});

S("tlesz", {title:"Right temporal lobe seizure", dur:20, seed:38, sens:10,
  events:[[0.2,"Awake, talking"],[4.3,"Presses the button: 'rising feeling'"],[8.2,"Stares; lip smacking"],[12.8,"Left hand posturing, right hand fumbling"],[17.3,"Ends; confused"]],
  ann:[{t0:1.25,t1:1.75,el:["F8","T8"],label:"Interictal sharp wave"},{t0:4.0,t1:5.4,el:["F8","T8"],label:"Onset: low-voltage fast, right temporal"},
    {t0:5.4,t1:10,el:["F8","T8"],label:"Rhythmic theta builds (7 → 5 Hz)"},{t0:10,t1:17.2,el:["F8","T8","P8","F4","C4","P4"],label:"Evolves: slower, bigger, sharper, spreads"},
    {t0:17.25,t1:19.9,el:["F8","T8"],label:"Abrupt end, postictal slowing"}],
  look:"After an interictal right temporal sharp wave, the seizure starts at about 4 seconds with low-voltage fast activity at F8/T8, becomes rhythmic 7 Hz theta that grows and slows (5 Hz, then 3 Hz), spreads to the right parasagittal chain and a little to the left, then stops abruptly with postictal right-sided delta. Use the page arrows to see the second 10 seconds.",
  why:"Evolution in frequency, amplitude and location is what makes it a seizure. Rhythmic 5–9 Hz temporal theta within 30 seconds of onset is the best scalp sign of a mesial temporal onset; postictal slowing helps confirm the side.",
  gen(g) {
    g.background(); g.alpha({amp:12});
    const f = g.lin([[4.9,7.5],[10,5.5],[15.5,3.2],[17.2,2.2]]), sh = g.lin([[5,0.1],[10,0.3],[15,0.55],[17.2,0.65]]);
    const base = g.rhythm(f, 1, {jitter:0.1, shape:(p, t) => (Math.sin(p) + sh(t) * Math.sin(2 * p + 0.6)) / (1 + sh(t) * 0.6)});
    g.put([0.95, 0.3], 0.32, g.prod(base, g.lin([[4.9,0],[5.5,22],[10,85],[15.5,120],[17.1,110],[17.25,0]])));
    g.put([0.65, -0.05], 0.5, g.prod(base, g.lin([[9,0],[12,70],[15.5,100],[17.1,90],[17.25,0]])));
    g.put([-0.6, 0], 0.5, g.prod(base, g.lin([[12.5,0],[15,30],[17.1,40],[17.25,0]])));
    g.put([0.95, 0.3], 0.3, g.mul(g.band(16, 24, 7), t => g.win(t, 4, 5.4, 0.2)));
    const iw = g.z(); g.sharp(iw, 1.4, 90); g.put([0.95, 0.3], 0.33, iw);
    const smack = g.sumWin(range(8.4, 12.6, 0.55).map(t => [t, t + 0.18]), 0.04);
    g.muscle([-1, 0.25], 0.38, smack, 14); g.muscle([1, 0.25], 0.38, smack, 14);
    g.put([0.9, 0.15], 0.4, g.mul(g.band(0.6, 2.5, 32), t => g.win(t, 17.3, 21, 0.4)));
    g.blink(2.2); g.blink(3.6);
  }});

S("ncse", {title:"Nonconvulsive status, then after lorazepam", dur:20, seed:39, sens:10,
  events:[[0.1,"90 min after a convulsion; not following commands, eyelid twitching"],[10,"10 minutes after IV lorazepam", "break"],[10.8,"Opens eyes, says his name"]],
  ann:[{t0:0.15,t1:9.9,el:SCALP,label:"Continuous generalized sharp-and-slow waves, about 3 Hz"},{t0:10.1,t1:19.9,el:SCALP,label:"Discharges gone; slow but reactive, drug beta"}],
  look:"First page: continuous generalized sharp-and-slow waves at about 3 Hz, with no normal background. Second page, ten minutes after IV lorazepam: the discharges are gone, leaving a slow 7 Hz rhythm, diffuse theta and drug beta, and the patient answers.",
  why:"Epileptiform discharges faster than 2.5 Hz meet the Salzburg criteria for nonconvulsive status on their own; at 2.5 Hz or slower you also need subtle clinical signs, clear evolution, or an EEG and clinical response to an IV anti-seizure drug. Here both the EEG and the patient improve.",
  gen(g) {
    g.background({amp:0.8});
    const x = g.z(), fr = g.lin([[0,2.9],[4,3.2],[7,2.8],[10,3.0]]); let t = 0.15;
    while (t < 9.85) { const a = 0.75 + 0.35 * g.rnd(); g.spike(x, t, 95 * a, {r:0.012, f:0.022, wave:0, pos:0.3}); g.g1(x, t + 0.15, 0.06, -120 * a); t += 1 / fr(t) * (0.92 + 0.16 * g.rnd()); }
    g.put([-0.35, 0.42], 0.52, x); g.put([0.35, 0.42], 0.5, x);
    const after = t => (t > 10.05 ? 1 : 0);
    g.alpha({f:7.4, amp:26, env:after});
    [[-0.45,0.5],[0.45,0.5],[0,0.3]].forEach(c => g.put(c, 0.4, g.mul(g.band(15, 25, 6), after)));
    g.put([0, 0.1], 0.7, g.mul(g.band(4, 7, 7), after));
    const tw = g.z(); for (let k = 0.4; k < 9.7; k += 0.9 + g.rnd() * 0.6) g.g1(tw, k, 0.03, 30); g.vert(tw);
  }});

S("pnes", {title:"Event without an EEG seizure", dur:20, seed:40, sens:10,
  events:[[0.2,"Eyes closed, awake"],[3,"Event: side-to-side head and arm thrashing, eyes squeezed shut"],[15,"Stops; talks at once"]],
  ann:[{t0:3,t1:15,el:["F7","T7","P7","F8","T8","P8"],label:"Movement and muscle artifact: waxes and wanes, never evolves"},{t0:7.8,t1:8.6,el:["O1","O2"],label:"Alpha in the pause"},
    {t0:11.5,t1:12.1,el:["O1","O2"],label:"Alpha again"},{t0:15.2,t1:19.8,el:["O1","O2"],label:"Normal at once: no postictal slowing"}],
  look:"Large rhythmic swings and muscle bursts during the event: artifact from movement. In the pauses (around 8 and 12 seconds) the 10 Hz alpha of an awake, eyes-closed brain is still there, and the record is normal the moment the event stops.",
  why:"Generalized shaking with preserved alpha and no postictal slowing argues strongly against an epileptic seizure (functional or dissociative seizure). Beware: frontal hypermotor seizures can also hide under artifact, but they are brief, stereotyped and usually arise from sleep.",
  gen(g) {
    g.background(); g.alpha({amp:42});
    const mv = t => g.win(t, 3, 15, 0.4) * (1 - g.win(t, 7.7, 8.7, 0.12)) * (1 - g.win(t, 11.4, 12.2, 0.12)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.15 * t));
    const swing = g.rhythm(2.1, 130, {jitter:0.25, env:mv});
    g.put([-1, -0.3], 0.45, swing); g.put([1, -0.3], 0.45, g.neg(swing));
    g.muscle([-1, 0.2], 0.45, mv, 22); g.muscle([1, 0.2], 0.45, mv, 22); g.muscle([0, 1.1], 0.35, mv, 12);
  }});

const syncBeats = (() => { const b = []; let t = 0.3; while (t < 5) { b.push(t); t += 0.66; } [5.6, 6.5, 7.6, 11.6, 12.6, 13.4, 14.1].forEach(x => b.push(x)); t = 14.8; while (t < 20) { b.push(t); t += 0.72; } return b; })();
S("syncope", {title:"Convulsive syncope on a tilt table", dur:20, seed:41, sens:10,
  events:[[0.2,"Tilt table, upright"],[4.5,"Pale, 'feel faint'"],[8,"Loses consciousness"],[9.6,"A few jerks"],[12.2,"Tilted back flat"],[16,"Awake, oriented"]],
  ann:[{t0:4.9,t1:11.6,el:["EKG"],label:"Heart slows, then stops"},{t0:6.8,t1:9.1,el:SCALP,label:"Slow"},{t0:9.1,t1:12.5,el:SCALP,label:"Flat"},{t0:12.5,t1:15.3,el:SCALP,label:"Slow"},{t0:15.4,t1:19.9,el:POST,label:"Normal again"}],
  look:"The heart slows and then stops (EKG channel). A few seconds later the EEG slows (high-voltage delta), then goes flat while a few jerks occur, slows again once the heart restarts, and finally returns to normal alpha: slow, flat, slow.",
  why:"Jerks in syncope come from the brainstem when the cortex is starved of blood, not from a cortical discharge; the flat phase is the opposite of a seizure. Always look at the EKG channel.",
  gen(g) {
    g.background();
    g.alpha({f:g.lin([[0,10],[4,10],[7,7.5],[15,8],[17,10]]), amp:38, env:g.lin([[0,1],[5.5,1],[7,0.2],[13.5,0],[15,0.5],[16.5,1]])});
    g.envAll(t => 1 - 0.9 * g.win(t, 8.9, 12.6, 0.3));
    const d = g.band(0.7, 2.5, 75); g.mul(d, t => g.win(t, 6.8, 9.2, 0.5) + 0.8 * g.win(t, 12.4, 15.3, 0.6));
    g.put([-0.35, 0.45], 0.55, d); g.put([0.35, 0.45], 0.55, d);
    [9.6, 10.2, 10.9].forEach(t => g.muscle([0, 0.2], 1.2, tt => g.win(tt, t, t + 0.18, 0.03), 28));
    g.heart({beats:syncBeats, k:0.3});
  }});

S("lpd", {title:"Lateralized periodic discharges (LPDs)", seed:42, sens:10,
  events:[[0.1,"Day 3 after a left MCA stroke; drowsy"]],
  ann:[{t0:0.2,t1:9.8,el:["F7","T7","P7","F3","C3","P3"],label:"Sharp waves about once a second, left hemisphere"}],
  look:"Sharp waves repeating about once a second over the left hemisphere, on a slow background with less alpha on the left.",
  why:"LPDs mark an acute or subacute hemispheric lesion (stroke, haemorrhage, tumour, encephalitis). They carry a high seizure risk, higher with faster rates and plus features (+F, +R, +S). Faster than 2.5 Hz they meet seizure criteria, and a clinical correlate time-locked to them makes them a seizure.",
  gen(g) {
    g.background({theta:3.5, delta:4}); g.alpha({f:7, amp:16, left:0.4});
    const x = g.z(); let t = 0.35; while (t < 9.9) { g.sharp(x, t, 130 * (0.85 + 0.3 * g.rnd()), {wave:0.35}); t += 0.9 + 0.12 * g.rnd(); }
    g.put([-0.7, 0.15], 0.45, x);
  }});

S("lpdtemp", {title:"Temporal periodic discharges (herpes simplex encephalitis)", seed:43, sens:10,
  events:[[0.1,"Febrile, confused, aphasic"]],
  ann:[{t0:0.2,t1:9.8,el:["F7","T7","P7"],label:"Complex sharp waves every 1.5–2 s, left temporal"}],
  look:"Complex sharp waves repeating every 1.5–2 seconds over the left temporal region, on a slow background.",
  why:"Periodic temporal discharges in a febrile, confused patient point to herpes simplex encephalitis: start IV acyclovir without waiting for the PCR.",
  gen(g) {
    g.background({theta:5, delta:5, amp:1.1});
    const x = g.z(); let t = 0.5; while (t < 9.8) { g.sharp(x, t, 140, {wave:0.3}); g.spike(x, t + 0.13, 60, {wave:0.6, ws:0.12}); t += 1.5 + 0.4 * g.rnd(); }
    g.put([-0.98, 0.15], 0.38, x); g.put([-0.6, -0.1], 0.45, x, {k:0.3});
  }});

S("gpdtri", {title:"Generalized periodic discharges with triphasic morphology", seed:44, sens:10,
  events:[[0.1,"Cirrhosis; confused, asterixis"]],
  ann:[{t0:0.2,t1:9.8,el:SCALP,label:"GPDs about 1.8 Hz, triphasic, front to back lag"}],
  look:"Generalized complexes at about 1.8 Hz, each with a small negative, a large positive and a slower negative phase, frontally maximal and arriving a little later in the back channels (anterior–posterior lag), on a slow background.",
  why:"Classically hepatic, renal or septic encephalopathy, or drug toxicity (cefepime, lithium, baclofen). No single feature reliably separates them from nonconvulsive status; the clinical response to treatment decides.",
  gen(g) {
    g.background({theta:4.5, delta:5, beta:0.6}); g.alpha({f:6, amp:12});
    const x = g.z(); let t = 0.3;
    while (t < 9.9) { const a = 0.85 + 0.3 * g.rnd(); g.g1(x, t - 0.05, 0.022, -28 * a); g.ag(x, t, 0.03, 0.05, 120 * a); g.g1(x, t + 0.15, 0.075, -60 * a); t += (1 / 1.8) * (0.9 + 0.2 * g.rnd()); }
    const lag = p => (0.95 - p[1]) * 0.045;
    g.put([-0.35, 0.55], 0.52, x, {lag}); g.put([0.35, 0.55], 0.52, x, {lag});
  }});

S("bs", {title:"Burst suppression (anaesthetic)", seed:45, sens:10,
  events:[[0.1,"Propofol and midazolam infusions for refractory status"]],
  ann:[{t0:0.45,t1:2.25,el:SCALP,label:"Burst"},{t0:2.3,t1:4.95,el:SCALP,label:"Suppression (<10 µV)"},{t0:4.95,t1:6.75,el:SCALP,label:"Burst"},{t0:6.8,t1:8.85,el:SCALP,label:"Suppression"}],
  look:"Bursts of mixed high-voltage delta, theta and sharp waves alternate with stretches of near-flat suppression (under 10 µV) where only the EKG blips show.",
  why:"Burst suppression means suppression filling 50–99% of the record (ACNS). It is the target in refractory status (titrate the anaesthetic to it) or a sign of deep anaesthesia, hypothermia or severe brain injury.",
  gen(g) {
    g.background({amp:0.12});
    const env = g.sumWin([[0.5,2.2],[5.0,6.7],[8.9,10.2]], 0.12);
    [[-0.5,0.55],[0.5,0.55],[0,0.2],[-0.7,-0.3],[0.7,-0.3],[0,-0.7]].forEach(c => {
      const x = g.band(1, 4, 50); g.add(x, g.band(4, 9, 20)); [1.1, 5.6, 9.4].forEach(t => g.sharp(x, t + g.rnd() * 0.4, 70));
      g.put(c, 0.45, g.mul(x, env));
    });
  }});

const ANOX = [0.9, 3.45, 6.0, 8.55];
S("anoxic", {title:"Identical bursts after cardiac arrest", seed:46, sens:10,
  events:[[0.1,"Day 3 after cardiac arrest, off sedation for 48 h"],[0.95,"Jerk"],[3.5,"Jerk"],[6.05,"Jerk"],[8.6,"Jerk"]],
  ann:ANOX.map(t => ({t0:t - 0.1, t1:t + 0.8, el:SCALP, label:"Same burst every time"})),
  look:"Every burst is the same, with the same shape in the same channels, repeating regularly out of a flat background, each with a myoclonic jerk.",
  why:"Burst suppression with identical bursts after cardiac arrest, without sedation, is a highly malignant pattern. Use it only as part of a multimodal assessment (examination, SSEP N20, neuron-specific enolase, imaging), never alone.",
  gen(g) {
    g.background({amp:0.06});
    const L = Math.round(0.75 * FS), i0 = Math.round(1.2 * FS), env = i => Math.sin(Math.PI * Math.min(1, i / L)) ** 0.6;
    [[-0.45,0.5],[0.45,0.5],[0,0.15],[-0.7,-0.3],[0.7,-0.3],[0,-0.65]].forEach(c => {
      const src = g.band(1.5, 12, 60); g.spike(src, 1.25, 130, {wave:0.4, r:0.01, f:0.02});
      const x = g.z();
      ANOX.forEach(tb => { const ib = Math.round(tb * FS); for (let i = 0; i < L && ib + i < g.n; i++) x[ib + i] += src[i0 + i] * env(i); });
      g.put(c, 0.45, x);
    });
    ANOX.forEach(t => g.muscle([0, 0.6], 0.9, tt => g.win(tt, t + 0.06, t + 0.2, 0.02), 26));
  }});

S("cjd", {title:"Periodic sharp wave complexes (Creutzfeldt–Jakob disease)", seed:47, sens:10,
  events:[[0.1,"Rapidly progressive dementia"],[6.1,"Clap: startle jerk"]],
  ann:[{t0:0.2,t1:9.8,el:SCALP,label:"Generalized sharp complexes about once a second"}],
  look:"Generalized biphasic sharp complexes about once a second on a low, slow background; a clap triggers a startle jerk.",
  why:"Periodic sharp wave complexes in a rapidly progressive dementia with myoclonus support sporadic CJD. They often appear mid-course, may be missing early, and fade in sleep and in late disease. Confirm with diffusion MRI and CSF RT-QuIC.",
  gen(g) {
    g.background({theta:3.5, delta:3.5, amp:0.6});
    const x = g.z(); let t = 0.4; while (t < 9.9) { g.g1(x, t - 0.06, 0.02, 15); g.g1(x, t, 0.04, -110); g.g1(x, t + 0.12, 0.06, 55); t += 0.95 + 0.15 * g.rnd(); }
    g.put([-0.3, 0.3], 0.55, x); g.put([0.3, 0.3], 0.55, x, {k:0.85});
    g.muscle([0, 0.3], 1.2, t => g.win(t, 6.15, 6.35, 0.03), 30);
  }});

S("eci", {title:"Electrocerebral inactivity", seed:48, sens:2,
  events:[[0.1,"Sensitivity 2 µV/mm; no sedatives; 36.8 °C"],[5,"Painful stimulus and loud noise: no change"]],
  ann:[{t0:0.2,t1:9.8,el:SCALP,label:"No cerebral activity over 2 µV: only EKG and ventilator"}],
  look:"At 2 µV/mm there is nothing cerebral: only EKG blips and a slow ventilator swing in two left electrodes. No change with pain and noise.",
  why:"Electrocerebral inactivity needs strict technique (full electrode array, 2 µV/mm, at least 30 minutes, electrode distances of at least 10 cm, reactivity testing) and no confounders (sedatives, hypothermia, metabolic). Follow your local brain-death protocol: the 2023 US guideline no longer accepts EEG as an ancillary test (only blood-flow studies).",
  gen(g) {
    g.background({amp:0.06});
    const v = g.rhythm(0.28, 6, {jitter:0}); g.putEl("T7", v); g.putEl("P7", v, 0.7);
    g.heart({rate:104, k:0.6});
  }});

/* ---------- records and channels ---------- */
const cache = {}, chanCache = {};
function record(id) {
  if (cache[id]) return cache[id];
  const sp = SPECS[id]; const g = makeGen(sp.dur, sp.seed * 7919 + 13);
  sp.gen(g);
  return (cache[id] = Object.assign(g.finish(), {spec: sp}));
}
function channels(id, mkey) {
  const key = id + "|" + mkey; if (chanCache[key]) return chanCache[key];
  const rec = record(id), n = rec.n, V = rec.V, m = MONTAGES[mkey] || MONTAGES.bipolar;
  let avg = null, ears = null;
  const ref = k => {
    if (k === "Avg") { if (!avg) { avg = new Float32Array(n); SCALP.forEach(e => { const v = V[e]; for (let i = 0; i < n; i++) avg[i] += v[i] / SCALP.length; }); } return avg; }
    if (k === "Ears") { if (!ears) { ears = new Float32Array(n); for (let i = 0; i < n; i++) ears[i] = (V.A1[i] + V.A2[i]) / 2; } return ears; }
    return V[k];
  };
  const out = [];
  m.groups.forEach((grp, gi) => grp.forEach(([a, b]) => {
    const va = V[a], vb = ref(b), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = va[i] - vb[i];
    out.push({a, b, x, group: gi});
  }));
  return (chanCache[key] = out);
}

/* ---------- drawing ---------- */
const FONT = '"IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif';
const pageLen = w => (w >= 600 ? 10 : 5);
const pageCount = (id, w) => Math.ceil(SPECS[id].dur / pageLen(w) - 1e-9);
function nameOf(e, old) { return old && OLD[e] ? OLD[e] : e; }

/** Draw one page of a pattern on a canvas. o: {montage, sens, page, ann, old}. */
function draw(cv, id, o) {
  const rec = record(id), sp = rec.spec, chans = channels(id, o.montage);
  const W = Math.max(280, Math.round(cv.clientWidth || cv.parentNode.clientWidth || 600));
  const st = getComputedStyle(cv), col = (k, d) => (st.getPropertyValue(k) || "").trim() || d;
  const C = {ink:col("--trace", "#1d2233"), grid:col("--line", "#d5d8e3"), muted:col("--muted", "#5a5f75"), focus:col("--focus", "#1fb2ff"), focusInk:col("--focus-ink", "#0a6fa8"), ekg:col("--ekg", "#b0365a"), panel:col("--panel", "#fff"), gold:col("--gold", "#e0a526")};
  const narrow = W < 600, LW = narrow ? 54 : 70, PR = 8, TOP = 30, BOT = 26, CH = narrow ? 17 : 20, GAP = narrow ? 5 : 7;
  const rows = []; let y = TOP + 4, g = -1;
  chans.forEach(c => { if (c.group !== g) { if (g !== -1) y += GAP; g = c.group; } rows.push({c, y: y + CH / 2}); y += CH; });
  y += GAP; const ekgY = y + CH / 2; y += CH;
  const H = y + BOT;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.style.height = H + "px"; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const PL = pageLen(W), p0 = (o.page || 0) * PL, p1 = Math.min(sp.dur, p0 + PL), TW = W - LW - PR;
  const X = t => LW + (t - p0) / PL * TW;
  // one-second grid
  ctx.lineWidth = 1;
  for (let s = Math.ceil(p0); s <= p1 + 1e-9; s++) { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(Math.round(X(s)) + 0.5, TOP); ctx.lineTo(Math.round(X(s)) + 0.5, H - BOT + 4); ctx.stroke(); }
  // flash ticks
  if (sp.ticks) { ctx.strokeStyle = C.muted; sp.ticks.forEach(t => { if (t < p0 || t > p1) return; ctx.beginPath(); ctx.moveTo(X(t) + 0.5, TOP - 6); ctx.lineTo(X(t) + 0.5, TOP); ctx.stroke(); }); }
  // events (technologist notes)
  ctx.font = `500 11px ${FONT}`; ctx.textBaseline = "alphabetic";
  let lastEnd = [-1e9, -1e9];
  sp.events.forEach(([t, label, kind]) => {
    if (t < p0 - 0.01 || t >= p1) return;
    const x = X(t);
    if (kind === "break") { ctx.fillStyle = C.panel; ctx.fillRect(x - 3, TOP, 6, H - BOT - TOP + 4); ctx.strokeStyle = C.muted; ctx.setLineDash([3, 3]); [x - 3, x + 3].forEach(xx => { ctx.beginPath(); ctx.moveTo(xx, TOP); ctx.lineTo(xx, H - BOT + 4); ctx.stroke(); }); ctx.setLineDash([]); }
    else { ctx.strokeStyle = C.muted; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x + 0.5, TOP - 4); ctx.lineTo(x + 0.5, H - BOT); ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]); }
    let text = label; const max = W - PR - x - 4;
    while (text.length > 4 && ctx.measureText(text).width > max) text = text.slice(0, -2);
    if (text !== label) text = text.replace(/\s*\S?$/, "") + "…";
    const row = lastEnd[0] < x ? 0 : lastEnd[1] < x ? 1 : 0;
    ctx.fillStyle = C.muted; ctx.fillText(text, x + 3, row ? 22 : 11);
    lastEnd[row] = x + 3 + ctx.measureText(text).width + 6;
  });
  // teaching marks: boxes under the traces, labels on top of them
  const labels = [];
  const hint = o.ann === "hint", marks = hint ? sp.hint : o.ann ? sp.ann : null;
  const mc = hint ? C.gold : C.focus;
  if (marks) {
    const involves = (r, el) => el.includes(r.c.a) || el.includes(r.c.b);
    marks.forEach(a => {
      const t0 = Math.max(a.t0, p0), t1 = Math.min(a.t1, p1); if (t1 <= t0) return;
      const spans = []; let cur = null;
      rows.forEach((r, k) => { if (involves(r, a.el)) { if (cur && cur.k1 === k - 1 && rows[k - 1].c.group === r.c.group) cur.k1 = k; else spans.push(cur = {k0:k, k1:k}); } });
      const boxes = spans.map(s => [rows[s.k0].y - CH / 2, rows[s.k1].y + CH / 2]);
      if (a.el.includes("EKG")) boxes.push([ekgY - CH / 2, ekgY + CH / 2]);
      if (!boxes.length) return;
      const x0 = X(t0), x1 = X(t1);
      boxes.forEach(([ya, yb]) => { ctx.fillStyle = mc; ctx.globalAlpha = hint ? 0.1 : 0.13; ctx.fillRect(x0, ya, x1 - x0, yb - ya); ctx.globalAlpha = 0.9; ctx.strokeStyle = mc; ctx.lineWidth = 1.2; if (hint) ctx.setLineDash([5, 3]); ctx.strokeRect(x0 + 0.5, ya + 0.5, x1 - x0 - 1, yb - ya - 1); ctx.setLineDash([]); ctx.globalAlpha = 1; });
      if (a.label) labels.push([a.label, x0, boxes[0][0] + 2]);
    });
  }
  // traces (negative up)
  const gain = CH / (o.sens * 10), i0 = Math.max(0, Math.floor(p0 * FS)), i1 = Math.min(rec.n - 1, Math.ceil(p1 * FS));
  ctx.save(); ctx.beginPath(); ctx.rect(LW, TOP - 2, TW + 1, H - BOT - TOP + 6); ctx.clip();
  ctx.lineWidth = narrow ? 0.9 : 1; ctx.lineJoin = "round"; ctx.strokeStyle = C.ink;
  rows.forEach(r => { const x = r.c.x; ctx.beginPath(); for (let i = i0; i <= i1; i++) { const xx = X(i / FS), yy = r.y + x[i] * gain; if (i === i0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke(); });
  ctx.strokeStyle = C.ekg; ctx.beginPath(); for (let i = i0; i <= i1; i++) { const xx = X(i / FS), yy = ekgY - rec.ekg[i] * CH * 0.7; if (i === i0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke();
  ctx.restore();
  ctx.font = `600 11px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const placed = [];
  labels.forEach(([label, x0, ly]) => {
    let text = label; const max = Math.max(60, W - PR - x0 - 6);
    while (text.length > 6 && ctx.measureText(text).width + 10 > max) text = text.slice(0, -2);
    if (text !== label) text = text.replace(/\s*\S?$/, "") + "…";
    const tw = ctx.measureText(text).width + 10;
    // step down past any label already drawn in the same spot
    for (let k = 0; k < 4 && placed.some(([a, b, y]) => Math.abs(y - ly) < 16 && x0 + 2 < b && x0 + 2 + tw > a); k++) ly += 17;
    placed.push([x0 + 2, x0 + 2 + tw, ly]);
    ctx.fillStyle = mc; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0 + 2, ly, tw, 15, 7); else ctx.rect(x0 + 2, ly, tw, 15); ctx.fill();
    ctx.fillStyle = hint ? C.panel : "#00243a"; ctx.fillText(text, x0 + 7, ly + 11);
  });
  // labels
  ctx.font = `500 ${narrow ? 10 : 11}px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = C.muted; ctx.textBaseline = "middle";
  rows.forEach(r => ctx.fillText(`${nameOf(r.c.a, o.old)}–${nameOf(r.c.b, o.old)}`, LW - 6, r.y));
  ctx.fillStyle = C.ekg; ctx.fillText("EKG", LW - 6, ekgY);
  // time and scale
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = C.muted; ctx.textAlign = "center";
  const bar = o.sens <= 3 ? 10 : o.sens <= 7 ? 50 : o.sens <= 15 ? 100 : 200, bh = bar * gain;
  const bx = W - PR - 4, by = H - 6, scaleLeft = bx - 6 - ctx.measureText(`${bar} µV · 1 s`).width - 16;
  for (let s = Math.ceil(p0); s <= p1 + 1e-9; s++) if (s > p0 + 0.01 && s < p1 - 0.01 && X(s) + 18 < scaleLeft) ctx.fillText(`${s} s`, X(s), H - 8);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by - bh); ctx.lineTo(bx, by); ctx.lineTo(bx - TW / PL, by); ctx.stroke();
  ctx.textAlign = "right"; ctx.fillStyle = C.muted; ctx.fillText(`${bar} µV · 1 s`, bx - 6, by - 4);
  ctx.textAlign = "left"; ctx.fillText(`${o.sens} µV/mm`, 4, H - 8);
  return {pages: Math.ceil(sp.dur / PL - 1e-9), page: o.page || 0, pageLen: PL};
}

window.EEGSIM = {FS, E, SCALP, OLD, MONTAGES, SPECS, record, channels, draw, pageLen, pageCount, nameOf,
  define: S, shapes: {arc, notched, saw}, range, POST, LEFT_HEMI, RIGHT_HEMI};
})();
