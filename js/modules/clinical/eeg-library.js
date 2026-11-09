/* EEG Study Guide: the 100-case library. Five tiers of 20 adult cases, mostly pathologic, each with labels that show
   WHERE to look (before answering, gold) and WHAT it is (after answering, blue). Tracings come from adjustable pattern
   families below (site, side, rate, shape), built on the simulator in eeg-sim.js. Loaded by eeg-guide.html after
   eeg-sim.js. Case keys: e = EEG settings, m = marks [t0, t1, electrodes, where-label, what-label], l = what to see,
   q = questions [question, [correct first, ...], why], p = teaching point. Teaching summaries in our own words; check
   clinical decisions against current sources (ACNS 2021 terminology, IFCN 2017, Salzburg 2013/2016, ERC–ESICM 2021). */
(function () {
"use strict";
const SIM = window.EEGSIM, E = SIM.E, {saw} = SIM.shapes;

/* ---------- where things are ---------- */
const TEMPORAL = /^(F7|F8|T7|T8|P7|P8)$/;
const loc = s => Array.isArray(s) ? s : TEMPORAL.test(s) ? [E[s][0] * 1.06, E[s][1]] : E[s].slice();
const ZONES = {
  front:[[[-0.32,0.72],0.42],[[0.32,0.72],0.42]], gen:[[[-0.35,0.42],0.5],[[0.35,0.42],0.5]],
  occ:[[[-0.3,-1],0.38],[[0.3,-1],0.38]], post:[[[-0.42,-0.72],0.42],[[0.42,-0.72],0.42]],
  Lh:[[[-0.74,0.12],0.4]], Rh:[[[0.74,0.12],0.4]], mid:[[[0,0.1],0.36]]
};
const sitesOf = (p, sg) => (ZONES[p.site] || [[loc(p.site), sg ?? 0.33]]).map(([c, s], k) => [c, p.sg ?? s, (p.ks || [])[k] ?? 1]);
const lagAP = q => (0.95 - q[1]) * 0.045;

/* electrode shorthands for marks */
const REG = {Lt:["F7","T7","P7"], Rt:["F8","T8","P8"], Lp:["F3","C3","P3"], Rp:["F4","C4","P4"], mid:["Fz","Cz","Pz"],
  L:SIM.LEFT_HEMI, R:SIM.RIGHT_HEMI, all:SIM.SCALP, fr:["Fp1","Fp2","F3","F4","Fz","F7","F8"], post:SIM.POST, occ:["O1","O2","P3","P4"], EKG:["EKG"]};
const els = v => Array.isArray(v) ? v : [...new Set(v.split(" ").flatMap(k => REG[k] || [k]))];

/* ---------- background states ---------- */
function bg(g, p) {
  const s = p.bg || "awake", aL = p.aL ?? 1, aR = p.aR ?? 1;
  const quiet = p.quiet || ((p.f === "gsw" || p.f === "fast") ? p.win : p.f === "sz" ? [[p.on, Math.min(g.dur + 1, p.off + 2.5)]] : null);
  const eo = p.eo ? g.sumWin(p.eo, 0.25) : null, qq = quiet ? g.sumWin(quiet, 0.15) : null;
  const env = t => Math.max(0, 1 - (eo ? 0.85 * eo(t) : 0) - (qq ? qq(t) : 0));
  if (s === "awake") { g.background(); g.alpha({f:p.pdr ?? 10, amp:p.pa ?? 38, left:0.9 * aL, right:aR, env}); }
  else if (s === "mild") { g.background({theta:4.2, delta:4, beta:1.4}); g.alpha({f:p.pdr ?? 7.5, amp:p.pa ?? 30, left:0.9 * aL, right:aR, ant:0.15, env}); }
  else if (s === "slow") { g.background({theta:4.8, delta:5, beta:0.8}); g.alpha({f:p.pdr ?? 6, amp:p.pa ?? 18, left:aL, right:aR, ant:0.3, env}); g.put([0, 0.25], 0.8, g.band(0.7, 3, p.dA ?? 14)); }
  else if (s === "coma") { g.background({theta:3.5, delta:6, beta:0.4, amp:1.1}); [[-0.45,0.3],[0.45,0.3],[0,-0.4]].forEach(c => g.put(c, 0.55, g.band(0.5, 2.5, p.dA ?? 22))); }
  else if (s === "drowsy") { g.background({theta:3.4, delta:3, beta:1.2}); g.alpha({amp:9, left:0.9 * aL, right:aR}); g.put([0, 0], 0.7, g.band(4, 7, 4)); }
  else if (s === "sleep") { g.background({theta:3.5, delta:5, beta:1}); g.alpha({amp:5}); (p.sp || [1.3, 4.7, 8.2]).forEach(t => g.spindle(t, 0.9, 22)); (p.vx || [2.7, 6.3]).forEach(t => g.vertexWave(t, 75)); }
  else if (s === "low") g.background({amp:0.3, beta:1.2});
  else if (s === "supp") g.background({amp:0.1});
  else if (s === "flat") g.background({amp:0.05});
  if (p.atten) { const [side, k] = p.atten; g.scaleEl((e, q) => (side === "R" ? q[0] > 0.15 : q[0] < -0.15) ? k : Math.abs(q[0]) <= 0.15 ? (1 + k) / 2 : 1); }
  if (p.eo) p.eo.forEach(([a, b]) => { g.blink(a + 0.05, 80); if (b < g.dur) g.blink(b, 60); });
  if (p.react) {
    const [a, b] = p.react; g.envAll(t => 1 - 0.55 * g.win(t, a, b, 0.4));
    [[-0.3,-0.9],[0.3,-0.9],[0,0.2]].forEach(c => g.put(c, 0.5, g.mul(g.band(5, 9, 7), t => g.win(t, a, b, 0.4))));
  }
}

/* ---------- pattern families ---------- */
const FAM = {};
/** Interictal discharges: site, t (times), A, kind spike|sharp|poly, slow (focal delta µV), np (spikes per polyspike). */
FAM.spk = (g, p) => {
  const x = g.z(), A = p.A ?? 110, kind = p.kind || "sharp";
  p.t.forEach(t => {
    const a = A * (0.88 + 0.24 * g.rnd());
    if (kind === "spike") g.spike(x, t, a, {wave:p.wave ?? 0.6});
    else if (kind === "poly") { const np = p.np || 3; for (let j = 0; j < np; j++) g.spike(x, t + j * 0.06, a * (0.8 + 0.2 * g.rnd()), {wave:0, pos:0.25, r:0.007, f:0.012}); g.g1(x, t + np * 0.06 + 0.1, 0.06, -0.9 * a); }
    else g.sharp(x, t, a, {wave:p.wave ?? 0.6});
  });
  sitesOf(p, 0.32).forEach(([c, s, k]) => g.put(c, s, x, {k}));
  if (p.slow) g.put(loc(p.site), 0.36, g.band(0.7, 3, p.slow));
};
/** Polymorphic delta: site, A, win (intermittent windows) or continuous. */
FAM.slow = (g, p) => {
  const env = p.win ? g.sumWin(p.win, 0.35) : null;
  sitesOf(p, 0.36).forEach(([c, s, k]) => {
    const x = g.band(p.lo ?? 0.6, p.hi ?? 3, (p.A ?? 26) * k); if (env) g.mul(x, env); g.put(c, s, x);
    const y = g.band(0.7, 3.5, (p.A ?? 26) * 0.6 * k); if (env) g.mul(y, env); g.put([c[0] * 0.72, c[1] * 0.72], s, y);
  });
};
/** Rhythmic delta (LRDA, TIRDA, GRDA): site, hz, A, win, saw, sharp (+S, 0–1.5), evolve hz as [[t,f],...]. */
FAM.rda = (g, p) => {
  const env = p.win ? g.sumWin(p.win, 0.35) : (p.amp ? g.lin(p.amp) : 1), sk = p.sharp || 0;
  const shape = sk ? (ph => { const q = ((ph % 6.2832) + 6.2832) % 6.2832; return Math.sin(ph) - sk * Math.exp(-((q - 4.71) ** 2) / 0.05); }) : p.saw ? saw : Math.sin;
  const x = g.rhythm(Array.isArray(p.hz) ? g.lin(p.hz) : (p.hz ?? 2), p.A ?? 60, {jitter:p.jit ?? 0.06, shape, env});
  sitesOf(p, 0.4).forEach(([c, s, k]) => g.put(c, s, x, {k}));
};
const MORPH = {
  sharp:(g, x, t, A) => g.sharp(x, t, A, {wave:0.35}),
  spiky:(g, x, t, A) => g.spike(x, t, A, {wave:0.45}),
  blunt:(g, x, t, A) => { g.g1(x, t, 0.055, -A); g.g1(x, t + 0.17, 0.08, 0.35 * A); },
  tri:(g, x, t, A) => { g.g1(x, t - 0.05, 0.022, -0.23 * A); g.ag(x, t, 0.03, 0.05, A); g.g1(x, t + 0.15, 0.075, -0.5 * A); },
  cjd:(g, x, t, A) => { g.g1(x, t - 0.06, 0.02, 0.14 * A); g.g1(x, t, 0.04, -A); g.g1(x, t + 0.12, 0.06, 0.5 * A); },
  complex:(g, x, t, A) => { g.sharp(x, t, A, {wave:0.3}); g.spike(x, t + 0.13, 0.45 * A, {wave:0.6, ws:0.12}); },
  pslic:(g, x, t, A) => { g.sharp(x, t, 0.5 * A, {wave:0}); g.g1(x, t + 0.18, 0.13, -A); g.g1(x, t + 0.55, 0.16, 0.8 * A); g.g1(x, t + 0.95, 0.2, -0.35 * A); }
};
/** Periodic discharges: site, hz (number or [[t,f],...]), m (shape), A, t0/t1, jit, plusF (µV), plusR (µV), jerk (muscle with each). */
FAM.pd = (g, p) => {
  const x = g.z(), A = p.A ?? 120, end = p.t1 ?? g.dur - 0.15, rate = Array.isArray(p.hz) ? g.lin(p.hz) : () => p.hz ?? 1;
  const times = []; let t = (p.t0 ?? 0.3) + g.rnd() * 0.15;
  const grow = p.Aev ? g.lin(p.Aev) : () => 1;
  while (t < end) { times.push(t); MORPH[p.m || "sharp"](g, x, t, A * grow(t) * (0.85 + 0.3 * g.rnd())); t += 1 / rate(t) * (1 + (p.jit ?? 0.08) * (2 * g.rnd() - 1)); }
  const lag = p.m === "tri" || p.lag ? lagAP : undefined;
  sitesOf(p, 0.45).forEach(([c, s, k]) => {
    g.put(c, s, x, {k, lag});
    if (p.plusF) g.put(c, s * 0.8, g.mul(g.band(13, 24, p.plusF * k), g.sumWin(times.map(u => [u - 0.03, u + 0.28]), 0.05)));
    if (p.plusR) g.put(c, s, g.rhythm(1.6, p.plusR * k, {jitter:0.1}));
  });
  if (p.jerk) times.forEach(u => g.muscle(loc(p.jerk), 0.45, tt => g.win(tt, u + 0.03, u + 0.16, 0.02), 30));
};
/** Generalized spike-and-wave: win, hz, A, kind sw|psw|ssw (slow spike-wave), irr, lead (focal lead site), ks. */
FAM.gsw = (g, p) => {
  const x = g.z(), xl = g.z(), A0 = p.A ?? 140, fr = Array.isArray(p.hz) ? g.lin(p.hz) : () => p.hz ?? 3;
  p.win.forEach(([a, b]) => {
    let t = a + 0.02;
    while (t < b) {
      const A = A0 * Math.min(1, 0.6 + (t - a) / 0.5) * (0.9 + 0.2 * g.rnd());
      if (p.kind === "ssw") { g.sharp(x, t, 0.85 * A, {wave:0, pos:0.2}); g.g1(x, t + 0.22, 0.1, -1.2 * A); g.g1(x, t + 0.4, 0.07, 0.75 * A); }
      else {
        const ps = p.kind === "psw", np = ps ? 2 + Math.floor(g.rnd() * 2) : 1, gap = 0.042, tw = t + (np - 1) * gap + (ps ? 0.1 : 0.15), ws = ps ? 0.045 : 0.06;
        for (let j = 0; j < np; j++) g.spike(x, t + j * gap, A * (np > 1 ? 0.75 + 0.25 * g.rnd() : 1), {wave:0, pos:0.3, r:0.007, f:0.012});
        g.g1(x, tw, ws, -1.4 * A); g.g1(x, tw + 1.8 * ws, 0.8 * ws, 1.15 * A);  // slow wave, then its positive return
      }
      if (p.lead) g.spike(xl, t - (p.leadT ?? 0.035), 0.6 * A, {wave:0, pos:0.2});
      t += 1 / fr(t) * (p.irr ? 0.82 + 0.36 * g.rnd() : 1);
    }
  });
  sitesOf(Object.assign({site:"gen"}, p), 0.5).forEach(([c, s, k]) => g.put(c, s, x, {k}));
  if (p.lead) g.put(loc(p.lead), 0.3, xl);
};
/** Fast rhythmic bursts (generalized paroxysmal fast activity, or low-voltage fast): win, hz, A, site (default front). */
FAM.fast = (g, p) => {
  const env = g.sumWin(p.win, 0.12), x = g.mul(g.rhythm(p.hz ?? 12, p.A ?? 55, {jitter:0.8}), env);
  sitesOf(Object.assign({site:"front"}, p), 0.45).forEach(([c, s, k]) => g.put(c, s, x, {k}));
};
/** Focal seizure with evolution: site, on, off, hz [[t,f]], A [[t,µV]], kind theta|spk, lvfa (µV), spread [{site,t,A}],
    post (postictal delta µV), pre (interictal sharp times), mus (automatism windows), gen (time of bilateral spread). */
FAM.sz = (g, p) => {
  const on = p.on, off = p.off, f = g.lin(p.hz), sh = g.lin([[on, 0.1], [off, 0.7]]), stop = t => (t < off ? 1 : 0);
  let base;
  if (p.kind === "spk") { base = g.z(); let t = on + 0.4; while (t < off) { g.spike(base, t, 1, {wave:0.55, r:0.01, f:0.02}); t += 1 / f(t); } }
  else base = g.rhythm(f, 1, {jitter:0.1, shape:(ph, t) => (Math.sin(ph) + sh(t) * Math.sin(2 * ph + 0.6)) / (1 + sh(t) * 0.6)});
  const amp = g.lin(p.A || [[on, 0], [on + 1.5, 25], [on + 5, 80], [off - 0.3, 115], [off, 100]]);
  g.put(loc(p.site), p.sg ?? 0.34, g.prod(base, amp, stop));
  (p.spread || []).forEach(s => g.put(loc(s.site), s.sg ?? 0.45, g.prod(base, g.lin([[s.t, 0], [s.t + 2, s.A ?? 60], [off, s.A ?? 60]]), stop)));
  if (p.gen !== undefined) [[-0.35, 0.3], [0.35, 0.3]].forEach(c => g.put(c, 0.55, g.prod(base, g.lin([[p.gen, 0], [p.gen + 2, 90], [off, 110]]), stop)));
  if (p.lvfa) g.put(loc(p.site), 0.3, g.mul(g.band(15, 26, p.lvfa), t => g.win(t, on - 0.2, on + 1.8, 0.25)));
  if (p.post) g.put(loc(p.site), 0.45, g.mul(g.band(0.6, 2.5, p.post), t => g.win(t, off, g.dur + 2, 0.4)));
  (p.pre || []).forEach(t => { const x = g.z(); g.sharp(x, t, 95); g.put(loc(p.site), 0.33, x); });
  (p.mus || []).forEach(([a, b]) => { const sm = g.sumWin(SIM.range(a, b, 0.5).map(t => [t, t + 0.18]), 0.04); g.muscle([-1, 0.25], 0.38, sm, 14); g.muscle([1, 0.25], 0.38, sm, 14); });
};
/** Burst suppression: bursts [[a,b]], A, spiky (epileptiform bursts), same (identical bursts), jerk. */
FAM.bs = (g, p) => {
  const C = [[-0.45,0.5],[0.45,0.5],[0,0.15],[-0.7,-0.3],[0.7,-0.3],[0,-0.65]];
  if (p.same) {
    const L = Math.round(0.75 * g.FS), i0 = Math.round(1.2 * g.FS), env = i => Math.sin(Math.PI * Math.min(1, i / L)) ** 0.6;
    C.forEach(c => {
      const src = g.band(1.5, 12, p.A ?? 60); g.spike(src, 1.25, 130, {wave:0.4, r:0.01, f:0.02});
      const x = g.z(); p.bursts.forEach(([tb]) => { const ib = Math.round(tb * g.FS); for (let i = 0; i < L && ib + i < g.n; i++) x[ib + i] += src[i0 + i] * env(i); });
      g.put(c, 0.45, x);
    });
  } else {
    const env = g.sumWin(p.bursts, 0.12);
    C.forEach(c => {
      const x = g.band(1, 4, p.A ?? 50); g.add(x, g.band(4, 9, (p.A ?? 50) * 0.4));
      p.bursts.forEach(([a, b]) => { const n = p.spiky ? 3 : 1; for (let k = 0; k < n; k++) (p.spiky ? g.spike : g.sharp)(x, a + 0.15 + (b - a - 0.3) * g.rnd(), p.spiky ? 120 : 70); });
      g.put(c, 0.45, g.mul(x, env));
    });
  }
  if (p.jerk) p.bursts.forEach(([a]) => g.muscle([0, 0.6], 0.9, tt => g.win(tt, a + 0.06, a + 0.2, 0.02), 26));
};
/** Alpha- or theta-frequency coma: hz, A, frontal-predominant and monotonous. */
FAM.acoma = (g, p) => { const x = g.rhythm(p.hz ?? 10, p.A ?? 30, {jitter:0.15}); g.put([0, 0.5], 0.62, x); g.put([0, -0.5], 0.6, x, {k:0.35}); };
/** Spindle coma: sp (times). */
FAM.spcoma = (g, p) => { p.sp.forEach(t => g.spindle(t, 1.1, 30, 12.5)); (p.vx || []).forEach(t => g.vertexWave(t, 70)); };
/** Extreme delta brush: hz, A, beta (µV) riding on each delta wave. */
FAM.edb = (g, p) => {
  const d = g.mul(g.rhythm(p.hz ?? 1.4, p.A ?? 70, {jitter:0.25}), g.wax(0.35, 0.4)), b = g.band(18, 28, p.beta ?? 14);
  for (let i = 0; i < g.n; i++) b[i] *= 0.15 + Math.max(0, -d[i] / (p.A ?? 70));
  ZONES.gen.forEach(([c]) => { g.put(c, 0.52, d); g.put(c, 0.48, b); });
};
/** One-sided alpha that ignores eye opening (Bancaud): side L|R, A. */
FAM.alpha1 = (g, p) => { const x = g.mul(g.rhythm(p.hz ?? 9, p.A ?? 34, {jitter:0.3}), g.wax(0.4, 0.9)); g.put([p.side === "R" ? 0.3 : -0.3, -1.12], 0.33, x); };
/** Drug beta, optionally on one side only: side L|R|both, A. */
FAM.beta = (g, p) => {
  [[-0.45,0.5],[0.45,0.5],[-0.6,0],[0.6,0],[0,0.35]].forEach(c => {
    if ((p.side === "L" && c[0] > 0.1) || (p.side === "R" && c[0] < -0.1)) return;
    g.put(c, 0.34, g.mul(g.band(15, 26, p.A ?? 9), g.wax(0.4, 1)));
  });
};
/** Generalized tonic–clonic: on, tonic (end of tonic phase), off; muscle hides the EEG; postictal suppression. */
FAM.gtc = (g, p) => {
  const {on, tonic, off} = p;
  const x = g.mul(g.rhythm(g.lin([[on, 11], [tonic, 9]]), 1, {jitter:0.6}), g.lin([[on, 0], [on + 1, 60], [tonic, 90], [tonic + 0.01, 0]]));
  ZONES.gen.forEach(([c]) => g.put(c, 0.55, x));
  g.muscle([0, 0.2], 1.3, t => g.win(t, on + 0.8, tonic, 0.3), 26);
  const clon = g.sumWin(SIM.range(tonic, off, 0.45).map((t, k) => [t, t + 0.22 + 0.01 * k]), 0.03);
  g.muscle([0, 0.2], 1.3, clon, 30);
  const sw = g.z(); SIM.range(tonic, off, 0.45).forEach(t => g.g1(sw, t + 0.3, 0.07, 90)); ZONES.gen.forEach(([c]) => g.put(c, 0.6, sw));
  g.envAll(t => (t > off + 0.2 ? 0.15 : 1));
};
/** Rhythmic artifact at named electrodes only (no field): e, hz, A, win. */
FAM.art = (g, p) => { const env = p.win ? g.sumWin(p.win, 0.2) : 1; const x = g.rhythm(p.hz ?? 4, p.A ?? 80, {jitter:0.15, env}); els(p.e).forEach((e, k) => g.putEl(e, x, k % 2 ? -0.6 : 1)); };
/** Electrode pops: e, t (times), A. */
FAM.pop = (g, p) => p.t.forEach((t, k) => g.pop(p.e, t, (p.A ?? 170) * (k % 2 ? -0.8 : 1)));
/** Whole-body movement: side-to-side swings plus waxing muscle, temporal and frontal: win, hz, A, mA. */
FAM.move = (g, p) => {
  const w = g.sumWin(p.win, 0.3), env = t => w(t) * (0.55 + 0.45 * Math.sin(2 * Math.PI * (p.mf ?? 0.35) * t));
  const sw = g.rhythm(p.hz ?? 2, p.A ?? 110, {jitter:0.3, env});
  g.put([-1, -0.3], 0.45, sw); g.put([1, -0.3], 0.45, g.neg(sw));
  g.muscle([-1, 0.2], 0.45, env, p.mA ?? 18); g.muscle([1, 0.2], 0.45, env, p.mA ?? 18); g.muscle([0, 1.1], 0.35, env, (p.mA ?? 18) * 0.6);
};
/** Flatten everything recorded so far between a and b (syncope, postictal): win [[a,b]], k (depth). */
FAM.flat = (g, p) => g.envAll(t => 1 - (p.k ?? 0.9) * g.sumWin(p.win, 0.3)(t));
/** Myoclonus that rides on the EEG: site, t (times). */
FAM.jerks = (g, p) => p.t.forEach(t => g.muscle(loc(p.site), p.sg ?? 0.5, tt => g.win(tt, t, t + 0.14, 0.02), p.A ?? 30));

/* ---------- registering cases ---------- */
const TIERS = [
  {n:1, name:"Spot it", sub:"One clear abnormality on the page. Name it.", tip:"Run the 7-step read: is the background normal? Then find the one thing that doesn't belong."},
  {n:2, name:"Localize it", sub:"Phase reversals, fields, the end of the chain and the ear-reference trap.", tip:"Find the electrode the pens point at in two montages. No reversal? Check the ends of the chains and switch to a referential montage."},
  {n:3, name:"Name it", sub:"ACNS critical care terms: periodic, rhythmic, plus features, bursts.", tip:"Main term 1 (G, L, BI, UI, Mf) + main term 2 (PDs, RDA, SW), then frequency and plus modifiers."},
  {n:4, name:"Seizure or not", sub:"Evolution, the ictal–interictal continuum, and the mimics.", tip:"A seizure evolves: frequency, amplitude or location changes over at least 10 seconds. Always check the EKG and the video."},
  {n:5, name:"Hero", sub:"Coma, prognosis and the rare classics boards love.", tip:"Continuity, reactivity and voltage drive prognosis. Never decide on one EEG alone."}
];
const CASES = [];
function X(c) {
  c.n = CASES.length + 1; c.id = "n" + c.n;
  const p = c.e, id = "lib-" + c.id;
  SIM.define(id, {title:c.title, dur:p.dur || 10, sens:p.sens || 7, montage:p.mont || "bipolar", seed:p.seed || 300 + c.n * 7, events:p.ev || [], ticks:p.ticks,
    ann:c.m.map(([t0, t1, e, , what]) => ({t0, t1, el:els(e), label:what})),
    hint:c.m.filter(m => m[3]).map(([t0, t1, e, where]) => ({t0, t1, el:els(e), label:where})),
    look:c.l, why:c.p,
    gen(g) {
      bg(g, p);
      if (FAM[p.f]) FAM[p.f](g, p);
      (p.also || []).forEach(q => FAM[q.f](g, q));
      (p.blinks || []).forEach(t => g.blink(t));
      if (p.hr) g.heart(p.hr);
    }});
  c.spec = id;
  CASES.push(c);
}

window.EEGLIB = {TIERS, CASES, X, els};
})();

/* ================= Tier 1 · Spot it ================= */
(function () {
const {X} = window.EEGLIB, t = 1;
X({t, title:"Febrile seizures, now déjà vu", stem:"A 27-year-old woman had febrile seizures as a toddler. She now has brief spells of déjà vu and a rising stomach feeling. Routine awake EEG.",
 e:{f:"spk", site:"F7", t:[1.6, 4.3, 7.9], A:115, slow:6, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.42,2.15,"F7 T7","Left temporal chain","Sharp wave, reversal at F7"],[4.12,4.85,"F7 T7","Again","Same discharge"],[7.72,8.45,"F7 T7","Again","Same discharge"]],
 l:"Sharp waves with an after-going slow wave in the left temporal chain. Fp1–F7 goes down and F7–T7 goes up: the pens point at each other at F7, a negative phase reversal.",
 q:[["Main finding?", ["Left anterior temporal sharp waves","Right temporal sharp waves","Wicket spikes","Lateral eye movements"], "A negative phase reversal at F7 with a field into T7 and F3, standing out from the background, with a slow wave after it."],
    ["What do they mean?", ["A potentially epileptogenic area in the left temporal lobe","Proof that the spells are seizures","A normal variant of drowsiness","An old stroke"], "Interictal discharges localize and raise seizure risk; they don't prove that a particular spell was a seizure."]],
 p:"Anterior temporal sharp waves are the commonest interictal finding in adult focal epilepsy. Next: an epilepsy-protocol MRI looking for hippocampal sclerosis."});
X({t, title:"The rising feeling", stem:"A 41-year-old man has spells of a rising epigastric feeling, then staring for a minute. Routine EEG.",
 e:{f:"spk", site:"F8", kind:"spike", t:[2.2, 5.6, 8.4], A:105, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[2.05,2.6,"F8 T8","Right temporal chain","Spike, reversal at F8"],[5.45,6.0,"F8 T8","Again","Spike"],[8.25,8.8,"F8 T8","Again","Spike"]],
 l:"Spikes (under 70 ms) with after-going slow waves in the right temporal chain, phase-reversing at F8: Fp2–F8 down, F8–T8 up.",
 q:[["Main finding?", ["Right anterior temporal spikes","Left anterior temporal spikes","Generalized spike-and-wave","Electrode pops at F8"], "A field over F8 and T8 with a negative reversal at F8; a pop would sit in one electrode only."],
    ["Which electrode is the maximum?", ["F8","O2","Fz","T7"], "The pens point at each other at F8, so F8 is the most negative point."]],
 p:"Spikes and sharp waves mean the same thing clinically; the difference is only duration (spike 20–70 ms, sharp wave 70–200 ms)."});
X({t, title:"Word-finding trouble", stem:"A 58-year-old man has two months of headaches and increasing trouble finding words. EEG while awake.",
 e:{f:"slow", site:"T7", A:28, aL:0.45, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.2,9.8,"F7 T7 P7","Left temporal chain","Continuous polymorphic delta"],[0.2,9.8,"O1","Compare the alpha","Less alpha on the left"]],
 l:"Continuous, irregular 1–3 Hz delta in the left temporal channels that never settles into a rhythm, and a weaker alpha on the left.",
 q:[["Main finding?", ["Continuous left temporal polymorphic delta","Left temporal rhythmic delta (TIRDA)","Generalized slowing","Normal drowsiness"], "Irregular (polymorphic), continuous and focal: not rhythmic, not generalized."],
    ["Most likely cause?", ["A structural lesion such as a tumour","Absence epilepsy","A medication effect","Normal ageing"], "Continuous polymorphic delta reflects white-matter injury under the electrodes; image the brain."]],
 p:"Continuous focal polymorphic delta = structural lesion until proven otherwise (tumour, abscess, infarct, haematoma)."});
X({t, title:"After the bike crash", stem:"A 23-year-old man hit his head in a bike crash four days ago. He is irritable and slowed down. EEG.",
 e:{f:"slow", site:"F4", A:26, aR:0.8, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.2,9.8,"Fp2 F4 F8","Right frontal","Continuous polymorphic delta, right frontal"]],
 l:"Continuous irregular delta over the right frontal electrodes (Fp2, F4, F8), with a normal-looking left side and alpha.",
 q:[["Main finding?", ["Right frontal polymorphic delta","Blink artifact","Frontal intermittent rhythmic delta","Right temporal spikes"], "Blinks are brief and in Fp1 and Fp2 together; this is continuous, irregular and one-sided."],
    ["Best next step?", ["Brain imaging for a contusion or haematoma","Start an anti-seizure drug","Repeat the EEG in a year","Nothing: it is a normal variant"], "Focal delta after trauma suggests a contusion; CT or MRI shows it."]],
 p:"Blinks can mimic frontal delta: they are symmetric, brief, and largest in Fp1 and Fp2 with almost nothing behind them."});
X({t, title:"Septic and sleepy", stem:"A 69-year-old woman with urosepsis is drowsy and disoriented. EEG with the eyes closed, then her name is called.",
 e:{bg:"slow", pdr:6.2, eo:[[5.5,7.5]], ev:[[0.1,"Eyes closed"],[5.5,"Name called: opens eyes"]]},
 m:[[0.3,5.3,"O1 O2 P3 P4","Back of the head","PDR only about 6 Hz"],[0.3,5.3,"fr","Front of the head","Diffuse theta and delta"],[5.6,7.4,"O1 O2","After her name","Still attenuates: reactive"]],
 l:"The posterior rhythm is only about 6 Hz, with diffuse theta and delta over both hemispheres. It still attenuates when she opens her eyes.",
 q:[["Main finding?", ["Moderate generalized slowing","Left hemispheric slowing","Burst suppression","Normal drowsiness"], "A slow PDR and diffuse theta–delta on both sides, while awake enough to open her eyes."],
    ["What does it tell you?", ["Diffuse cerebral dysfunction; it doesn't name the cause","She is having seizures","She has a focal lesion","She is brain dead"], "Generalized slowing is nonspecific: sepsis, metabolic, drugs, postictal, degenerative."]],
 p:"Grade the slowing by how slow the PDR is and how much delta there is; reactivity is a good sign."});
X({t, title:"Counting stops", stem:"An 18-year-old has had 'daydreaming' spells since school. She is asked to count aloud during hyperventilation.",
 e:{f:"gsw", win:[[2.5, 8.8]], hz:[[2.5,3.6],[8.8,3]], A:150, sens:10, ev:[[0.1,"Hyperventilation, counting aloud"],[2.7,"Stops counting"],[9.1,"Resumes counting"]]},
 m:[[2.4,8.9,"all","Everywhere at once","Generalized 3 Hz spike-and-wave"]],
 l:"An abrupt burst of generalized, symmetric, frontally maximal spike-and-wave at 3–3.5 Hz, slowing slightly toward 3 Hz, starting and stopping abruptly while she stops counting.",
 q:[["Main finding?", ["Generalized 3 Hz spike-and-wave: an absence seizure","Focal temporal seizure","Hyperventilation-induced slowing","Polyspike-and-wave with myoclonus"], "Abrupt on, abrupt off, 3 Hz, generalized, with loss of awareness: a typical absence."],
    ["Which drug would you avoid?", ["Carbamazepine","Ethosuximide","Lamotrigine","Valproate (in men or when pregnancy is impossible)"], "Carbamazepine, oxcarbazepine and phenytoin can worsen absences and myoclonus."]],
 p:"Hyperventilation provokes absences in most untreated patients. Normal HV slowing is rhythmic delta without spikes that fades within a minute."});
X({t, title:"Dropped the coffee", stem:"A 20-year-old man jerks his arms in the morning and had a convulsion after a night out. Routine EEG.",
 e:{f:"gsw", kind:"psw", win:[[2.2,3.4],[6.5,7.3]], hz:4.5, irr:true, A:120, sens:10, ev:[[0.1,"Awake, eyes closed"],[6.6,"Arm jerk"]], also:[{f:"jerks", site:[0,0.3], sg:1.2, t:[6.6], A:32}]},
 m:[[2.1,3.5,"all","Generalized","Polyspike-and-wave, 4–5 Hz"],[6.4,7.4,"all","Again","Burst with a myoclonic jerk"]],
 l:"Irregular generalized bursts of polyspike-and-wave at 4–5 Hz, frontocentral; the second comes with a jerk (muscle artifact).",
 q:[["Main finding?", ["Generalized polyspike-and-wave","Left temporal spikes","3 Hz spike-and-wave","Muscle artifact only"], "Several spikes before each slow wave, on both sides at once."],
    ["Which syndrome?", ["Juvenile myoclonic epilepsy","Temporal lobe epilepsy","Lennox–Gastaut syndrome","Creutzfeldt–Jakob disease"], "Morning myoclonus, convulsions after sleep loss and alcohol, generalized polyspike-and-wave."]],
 p:"JME is usually lifelong; valproate works best but is avoided if pregnancy is possible (levetiracetam instead; lamotrigine can worsen myoclonus)."});
X({t, title:"Low sodium", stem:"A 77-year-old woman on a thiazide is confused; sodium is 118. EEG.",
 e:{f:"rda", site:"front", hz:2.2, A:80, win:[[1.3,3.8],[6.2,8.6]], bg:"mild", pdr:7.4, ev:[[0.1,"Eyes closed, confused"]]},
 m:[[1.2,3.9,"fr","Front, both sides","Rhythmic 2 Hz delta, frontal (GRDA)"],[6.1,8.7,"fr","Again","Same shape, no evolution"]],
 l:"Runs of smooth, monomorphic 2 Hz delta, frontally maximal and on both sides at once, on a mildly slow background.",
 q:[["Main finding?", ["Generalized rhythmic delta, frontally predominant (FIRDA)","Blink artifact","Frontal seizure","Generalized periodic discharges"], "Rhythmic (same shape, regular), not periodic, not sharp, not evolving."],
    ["Is it epileptiform?", ["No: it points to an encephalopathy and isn't linked to seizures","Yes: start levetiracetam","Yes: it is absence status","It is artifact"], "GRDA is not associated with seizures; treat the cause (here the hyponatraemia, corrected slowly)."]],
 p:"Separate FIRDA from blinks: blinks are single, brief and largest at Fp1/Fp2; FIRDA comes in rhythmic runs and spreads to F3/F4."});
X({t, title:"The haemorrhage", stem:"A 66-year-old man with a right parietal haemorrhage two days ago is less responsive today. EEG.",
 e:{f:"pd", site:"Rh", hz:1, A:130, bg:"slow", aR:0.4, sens:10, ev:[[0.1,"Drowsy, left hemiparesis"]]},
 m:[[0.2,9.8,"R","Right hemisphere","Sharp waves about once a second"]],
 l:"Sharp waves repeating about once a second over the right hemisphere, with uniform shape and regular spacing, on a slow background.",
 q:[["Main finding?", ["Right lateralized periodic discharges (LPDs) about 1 Hz","Right temporal spikes, sporadic","Generalized periodic discharges","Breach rhythm"], "Repeating at nearly regular intervals with a clear gap between them: periodic, and on one side only."],
    ["Seizure risk?", ["High: continuous EEG monitoring is advised","None","Only above 3 Hz","Only in children"], "LPDs carry a high risk of seizures, most of them nonconvulsive."]],
 p:"LPDs (old name PLEDs) mean an acute hemispheric lesion: stroke, haemorrhage, tumour, infection."});
X({t, title:"Kidney failure", stem:"A 71-year-old man missed three dialysis sessions. He is confused and has asterixis. EEG.",
 e:{f:"pd", site:"front", m:"tri", hz:1.8, A:110, bg:"slow", pdr:5.5, sens:10, ev:[[0.1,"Confused, asterixis"]]},
 m:[[0.2,9.8,"all","Everywhere","Triphasic GPDs, about 1.8 Hz"],[0.2,9.8,"O1 O2","Compare front and back","Arrives later at the back"]],
 l:"Generalized complexes at about 1.8 Hz with a small negative, a large positive and a slower negative phase, frontally maximal, arriving a little later posteriorly.",
 q:[["Main finding?", ["Generalized periodic discharges with triphasic morphology","Generalized 3 Hz spike-and-wave","Lateralized periodic discharges","Burst suppression"], "Periodic, generalized, three phases, front-to-back lag."],
    ["What fits best here?", ["Uraemic encephalopathy: dialyse, and keep NCSE in mind","Herpes encephalitis","Absence epilepsy","Brain death"], "Classically metabolic, but no single EEG feature excludes status; the clinical response decides."]],
 p:"Also think of cefepime, lithium, baclofen, ifosfamide and hyperammonaemia."});
X({t, title:"The propofol drip", stem:"A 49-year-old woman on propofol and midazolam infusions for refractory status epilepticus. EEG to guide the drip.",
 e:{f:"bs", bursts:[[0.4,2],[4.6,6.2],[8.6,9.9]], bg:"supp", sens:10, ev:[[0.1,"Propofol and midazolam infusions"]]},
 m:[[0.4,2.0,"all","Busy stretch","Burst"],[2.1,4.5,"all","Quiet stretch","Suppression, under 10 µV"],[4.6,6.2,"all","","Burst"],[6.3,8.5,"all","","Suppression"]],
 l:"Bursts of mixed delta, theta and sharp activity alternating with near-flat stretches (under 10 µV) where only the EKG shows.",
 q:[["Main finding?", ["Burst suppression","Discontinuous background","Electrocerebral inactivity","Generalized periodic discharges"], "Suppression fills most of the page, broken by bursts."],
    ["What share must suppression fill to call it burst suppression?", ["50–99% of the record","10–49%","Under 10%","100%"], "ACNS: 10–49% is discontinuous, 50–99% burst suppression, over 99% suppression."]],
 p:"Burst suppression is a target in refractory status, or a sign of deep anaesthesia, hypothermia or severe injury."});
X({t, title:"The fall last month", stem:"An 82-year-old man on apixaban fell a month ago. Now he has headaches and is unsteady. EEG.",
 e:{bg:"awake", atten:["R",0.4], ev:[[0.1,"Awake, eyes closed"]], mont:"ear"},
 m:[[0.2,9.8,"R","Right side","Everything lower on the right"],[0.2,9.8,"L","Left side","Normal amplitude"]],
 l:"Everything (alpha, beta and the whole background) is lower over the right hemisphere than the left.",
 q:[["Main finding?", ["Right hemispheric attenuation","Left hemispheric slowing","Breach rhythm on the right","Normal asymmetry"], "A breach makes a side bigger and sharper; here the right is smaller."],
    ["Most likely cause?", ["A right subdural haematoma","A right craniotomy defect","Absence epilepsy","A left frontal tumour"], "Fluid between cortex and electrode (subdural haematoma or hygroma) shrinks the EEG on that side."]],
 p:"Lower amplitude on one side: subdural collection, scalp swelling or loss of cortex. Higher amplitude on one side: usually a breach."});
X({t, title:"Rhythm in the temple", stem:"A 35-year-old woman with focal impaired awareness seizures since her teens. Routine awake EEG.",
 e:{f:"rda", site:"T7", hz:2.3, A:48, saw:true, win:[[1.0,3.6],[6.2,8.8]], ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.9,3.7,"F7 T7 P7","Left temporal chain","Rhythmic 2–3 Hz delta (TIRDA)"],[6.1,8.9,"F7 T7 P7","Again","TIRDA"]],
 l:"Runs of rhythmic, sawtooth 2–3 Hz delta in the left temporal channels, coming and going on a normal background.",
 q:[["Main finding?", ["Temporal intermittent rhythmic delta (TIRDA), left","Continuous polymorphic delta, left","Rhythmic mid-temporal theta of drowsiness","Lateral eye movements"], "Rhythmic, delta, temporal and intermittent; the benign drowsy variant is 5–6 Hz theta."],
    ["Clinical meaning?", ["Like temporal spikes: it supports left temporal lobe epilepsy","Metabolic encephalopathy","Normal drowsiness","Raised intracranial pressure"], "TIRDA is an epileptiform equivalent; FIRDA isn't."]],
 p:"TIRDA, unlike frontal rhythmic delta, travels with temporal lobe epilepsy and often with interictal spikes in the same place."});
X({t, title:"The captured spell", stem:"A 31-year-old woman on the epilepsy unit stares, smacks her lips and can't speak afterwards. Here is the spell (two pages).",
 e:{dur:20, sens:10, f:"sz", site:"F7", on:4, off:16, hz:[[4,7],[9,6],[13,4.5],[16,3]], pre:[1.3], post:30, mus:[[8,13]], spread:[{site:"F3", t:8, A:55},{site:"T8", t:12, A:25}],
    ev:[[0.2,"Awake"],[4.2,"Stares"],[8,"Lip smacking"],[16.2,"Can't find words"]]},
 m:[[1.15,1.75,"F7 T7","Before","Interictal sharp wave"],[4,9,"F7 T7","Left temporal chain","Onset: rhythmic theta, left temporal"],[9,16,"F7 T7 F3 C3","Watch it change","Slows, grows and spreads"],[16,19.8,"F7 T7","After","Postictal slowing, left"]],
 l:"A rhythmic 7 Hz theta starts at F7/T7, grows, slows to 4–3 Hz and spreads to the left parasagittal chain (and a little to the right), then stops with left temporal postictal delta. Use the page arrows.",
 q:[["Main finding?", ["A left temporal seizure","Rhythmic mid-temporal theta (benign)","Chewing artifact","Generalized absence"], "Evolution in frequency, amplitude and field, with postictal slowing: a seizure."],
    ["What else points to the left?", ["Postictal aphasia","Left hand fumbling","Blinking","Normal alpha straight afterwards"], "Postictal language trouble points to the dominant (usually left) hemisphere."]],
 p:"Rhythmic 5–9 Hz temporal theta within 30 seconds of onset is the best scalp sign of a mesial temporal seizure."});
X({t, title:"The twitching hand", stem:"A 45-year-old man has brief jerks of the right hand and face, sometimes spreading up the arm. EEG.",
 e:{f:"spk", site:"C3", kind:"spike", t:[1.4, 3.9, 6.1, 8.7], A:100, ev:[[0.1,"Awake, eyes open"]], pa:20},
 m:[[1.25,1.8,"F3 C3 P3","Left parasagittal chain","Spike, reversal at C3"],[3.75,4.3,"C3","Again",""],[5.95,6.5,"C3","Again",""],[8.55,9.1,"C3","Again",""]],
 l:"Spikes phase-reversing at C3 in the left parasagittal chain (F3–C3 up, C3–P3 down), with a field into T7.",
 q:[["Main finding?", ["Left central spikes (C3)","Mu rhythm","Vertex waves","Left occipital spikes"], "Mu is a rhythmic, arch-shaped 9–11 Hz train; these are single spikes with slow waves."],
    ["What fits clinically?", ["Focal motor seizures of the right hand and face","Absence seizures","Left leg stiffening","A visual aura"], "C3 sits over the left motor strip, which moves the right hand and face."]],
 p:"Spikes from the motor strip may come with jerks; time-lock them to the jerks (the muscle artifact) to prove a cortical origin."});
X({t, title:"Flashing lights", stem:"A 52-year-old woman with a right occipital meningioma removed last year now sees flashing coloured lights in the left visual field. EEG.",
 e:{f:"spk", site:"O2", kind:"spike", t:[2.1, 5.2, 7.6], A:95, aR:0.7, mont:"ear", ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.95,2.5,"O2 P8 P4","Back right","Spike at O2"],[5.05,5.6,"O2 P8 P4","Again",""],[7.45,8.0,"O2 P8 P4","Again",""]],
 l:"In the ear reference the spike is tallest at O2 and smaller at P8 and P4. (In the double banana it has no phase reversal because O2 is at the end of the chain.)",
 q:[["Main finding?", ["Right occipital spikes","POSTS (normal sleep transients)","Lambda waves","Left occipital spikes"], "POSTS and lambda are positive (point down referentially) and on both sides; these are negative spikes, right only."],
    ["Why no reversal in the double banana?", ["O2 is the last electrode of its chains","The spike is not real","The montage is broken","Occipital spikes never reverse"], "At the end of a chain all channels deflect the same way; look for the tallest one in a referential montage."]],
 p:"Coloured, flashing elementary hallucinations point to the occipital cortex; formed images point further forward (temporal)."});
X({t, title:"Found unresponsive", stem:"A 39-year-old man was found unresponsive with empty pill bottles. Intubated, no sedation for 6 hours. EEG.",
 e:{bg:"coma", dA:42, sens:10, ev:[[0.1,"Comatose, no sedation"],[6,"Loud clap and sternal rub"]], react:[6,8.2]},
 m:[[0.2,5.9,"all","Everywhere","Continuous delta, no PDR"],[6,8.3,"all","After the clap","Changes: reactive"]],
 l:"Continuous, high-voltage, irregular delta over the whole head with no posterior rhythm; it attenuates and quickens after the clap and rub.",
 q:[["Main finding?", ["Severe generalized slowing (continuous delta)","Focal slowing","Burst suppression","Electrocerebral inactivity"], "Delta everywhere, all the time, with no PDR."],
    ["Which detail is reassuring?", ["Reactivity to the clap and sternal rub","The delta frequency","The lack of alpha","The EKG rate"], "A reactive background is a better sign than an unreactive one, in any coma."]],
 p:"Drug overdoses can cause deep coma, even burst suppression, and still recover fully; never prognosticate during intoxication."});
X({t, title:"Forgetful and slow", stem:"A 74-year-old man has three years of slowly worsening memory. EEG while awake, eyes closed then open.",
 e:{bg:"mild", pdr:7.2, eo:[[5.5,7.2]], ev:[[0.1,"Awake, eyes closed"],[5.5,"Eyes open"],[7.2,"Eyes closed"]]},
 m:[[0.3,5.4,"O1 O2 P3 P4","Back of the head","PDR about 7 Hz"],[0.3,5.4,"fr","Front","A little diffuse theta"]],
 l:"The posterior rhythm runs at only about 7 Hz while he is fully alert, with a little diffuse theta; it still blocks with eye opening.",
 q:[["Main finding?", ["Mild generalized slowing (slow PDR)","Normal for his age","Focal slowing","Drowsiness"], "Healthy ageing doesn't drop the PDR below about 8 Hz."],
    ["In an alert adult, the PDR should be at least:", ["8.5 Hz","6 Hz","13 Hz","4 Hz"], "Under 8 Hz in an alert adult is slowing; 8–8.5 is borderline."]],
 p:"A slow PDR fits a neurodegenerative dementia (most marked in Lewy body dementia), but drugs, thyroid and metabolic problems do the same."});
X({t, title:"Night-time thrashing", stem:"A 26-year-old woman has brief spells from sleep: she sits up, thrashes and grunts for 20 seconds. EEG in drowsiness.",
 e:{f:"spk", site:"F3", t:[1.9, 5.1, 8.3], A:110, bg:"drowsy", ev:[[0.1,"Drowsy"]]},
 m:[[1.7,2.45,"Fp1 F3 C3","Left parasagittal chain","Sharp wave, reversal at F3"],[4.9,5.65,"F3","Again",""],[8.1,8.85,"F3","Again",""]],
 l:"Sharp waves with slow waves in the left parasagittal chain, phase-reversing at F3 (Fp1–F3 down, F3–C3 up).",
 q:[["Main finding?", ["Left frontal sharp waves","Vertex waves","Blink artifact","Left anterior temporal sharp waves"], "The reversal is at F3, not F7; vertex waves sit at Cz on both sides."],
    ["Which electrode is the maximum?", ["F3","F7","Cz","O1"], "Fp1–F3 and F3–C3 point at each other."]],
 p:"Frontal lobe seizures are brief, stereotyped, hypermotor and come out of sleep; the scalp EEG is often unhelpful during them."});
X({t, title:"Strobe at the club", stem:"A 17-year-old had a convulsion at a club with strobe lights. Photic stimulation during the EEG.",
 e:{f:"gsw", kind:"psw", win:[[2.6, 6.6]], hz:4, irr:true, A:120, sens:10, ticks:window.EEGSIM.range(2, 5.5, 1 / 14), ev:[[0.1,"Eyes closed"],[2,"Photic 14 Hz"],[5.5,"Photic off"]]},
 m:[[2.5,6.7,"all","During the flashes","Generalized polyspike-and-wave"],[5.5,6.7,"all","After the flashes stop","Outlasts the train"]],
 l:"Generalized polyspike-and-wave begins after the 14 Hz flashes start and carries on for a second after they stop.",
 q:[["Main finding?", ["A photoparoxysmal response","Normal photic driving","Photomyogenic (muscle) response","Eye flutter artifact"], "Driving is rhythmic at the flash rate over the occiput; this is generalized spike-and-wave."],
    ["Outlasting the flash train suggests:", ["An idiopathic generalized epilepsy, such as JME","A normal variant","An occipital tumour","A recording fault"], "Responses that outlast the stimulus are more strongly linked to epilepsy."]],
 p:"Photosensitivity peaks in the teens; most photosensitive patients react to 14–20 Hz flashes."});
})();

/* ================= Tier 2 · Localize it ================= */
(function () {
const {X} = window.EEGLIB, t = 2;
X({t, title:"Middle of the chain", stem:"A 44-year-old man has seizures that start with a strange taste. Find the electrode.",
 e:{f:"spk", site:"T7", kind:"spike", t:[1.8, 4.6, 7.7], A:105, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.65,2.25,"F7 T7 P7","Left temporal chain","Reversal at T7 (mid-temporal)"],[4.45,5.05,"T7","",""],[7.55,8.15,"T7","",""]],
 l:"F7–T7 goes down and T7–P7 goes up: the pens point at each other at T7, the mid-temporal electrode.",
 q:[["Where is the phase reversal?", ["T7","F7","P7","C3"], "The two channels sharing T7 point toward each other."],
    ["What is T7's old name?", ["T3","T5","F7","A1"], "Old names: T3 = T7, T4 = T8, T5 = P7, T6 = P8."]],
 p:"In a bipolar chain, the negative maximum is the electrode shared by the two channels whose pens point at each other."});
X({t, title:"Back of the right temple", stem:"A 37-year-old woman has seizures that begin with a distorted, tilting view of the room. Routine EEG.",
 e:{f:"spk", site:"P8", t:[2.4, 5.3, 8.6], A:110, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[2.2,2.95,"T8 P8 O2","Right temporal chain, back end","Reversal at P8"],[5.1,5.85,"P8","",""],[8.4,9.15,"P8","",""]],
 l:"T8–P8 goes down and P8–O2 goes up: a negative phase reversal at P8 (old name T6), right posterior temporal.",
 q:[["Where is the maximum?", ["P8 (right posterior temporal)","F8","O1","C4"], "The reversal sits between T8–P8 and P8–O2."],
    ["The pens point toward each other. That means:", ["A surface-negative maximum at the shared electrode","A surface-positive maximum","Artifact","A generalized discharge"], "Pointing toward each other = negative; pointing away = positive."]],
 p:"Posterior temporal and temporo-occipital foci give visual and perceptual auras."});
X({t, title:"No reversal anywhere", stem:"A 48-year-old woman with a left occipital cavernoma. In the double banana, nothing seems to phase-reverse. Find the focus.",
 e:{f:"spk", site:"O1", kind:"spike", t:[1.9, 4.8, 7.4], A:100, aL:0.7, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.75,2.3,"O1 P7 P3","End of the left chains","All deflect the same way: maximum at O1"],[4.65,5.2,"O1","",""],[7.25,7.8,"O1","",""]],
 l:"P7–O1 and P3–O1 both deflect down at the same time with no partner going the other way: the end-of-chain sign. Switch to Ear or Average and O1 is tallest.",
 q:[["Where is the maximum?", ["O1","P7","P3","Fp1"], "Both chains end at O1 and both deflect the same way, largest in the channels that contain O1."],
    ["Which montage proves it fastest?", ["A referential montage (ear or average)","Transverse only","None can","The same double banana at lower sensitivity"], "Referential montages show amplitude directly: the tallest channel is the maximum."]],
 p:"End-of-chain rule: discharges at Fp1/Fp2 or O1/O2 don't phase-reverse in the double banana; check a referential montage."});
X({t, title:"Up in front", stem:"A 29-year-old man has brief seizures from sleep with sudden fear and grimacing. EEG shows something in the front channels. Blinks or brain?",
 e:{f:"spk", site:"Fp2", kind:"spike", t:[2.1, 5.4, 8.1], A:150, blinks:[3.7, 6.8], ev:[[0.1,"Awake, eyes open"]]},
 m:[[1.95,2.5,"Fp2 F4 F8","Right frontopolar","Spike: goes UP in Fp2 channels"],[5.25,5.8,"Fp2","",""],[7.95,8.5,"Fp2","",""],[3.45,4.0,"Fp1 Fp2","Compare","Blink: goes DOWN, both sides"]],
 l:"Spikes that go up (negative) in Fp2–F4 and Fp2–F8 only, with a slow wave. The blinks go down (positive) in both Fp1 and Fp2 channels and are smooth.",
 q:[["What are the right-sided events?", ["Right frontopolar (Fp2) spikes","Blinks","Lateral eye movements","Frontal rhythmic delta"], "Negative, spiky, one-sided and at the start of the chain."],
    ["Why aren't they blinks?", ["Blinks are positive at Fp1 and Fp2 (go down) and symmetric","Blinks are always faster","Blinks only happen with eyes closed","Blinks only affect F7"], "The cornea is positive; Bell's phenomenon brings it up under Fp1 and Fp2."]],
 p:"Start-of-chain rule: an Fp discharge shows as the first channel of each chain moving, without a reversal."});
X({t, title:"Top of the head, awake", stem:"A 34-year-old woman has seizures where both arms rise and she stays aware. Awake EEG.",
 e:{f:"spk", site:"Cz", kind:"spike", t:[1.7, 4.4, 7.3], A:105, sg:0.3, ev:[[0.1,"Awake, eyes closed, alpha present"]]},
 m:[[1.55,2.1,"Fz Cz Pz","Midline chain","Reversal at Cz"],[4.25,4.8,"Cz","",""],[7.15,7.7,"Cz","",""],[0.3,9.8,"O1 O2","Check the state","Alpha: she is awake"]],
 l:"Spikes phase-reversing at Cz (Fz–Cz up, Cz–Pz down), symmetric, while a normal alpha shows she is awake.",
 q:[["Main finding?", ["Midline central (Cz) spikes","Vertex waves","Mu rhythm","Muscle"], "Spikes with slow waves at the vertex during wakefulness."],
    ["Why aren't they vertex waves?", ["She is awake with alpha; vertex waves belong to drowsiness and sleep","Vertex waves are on the left","Vertex waves are rhythmic","They are too small"], "Always establish the state before calling a midline sharp transient."]],
 p:"Midline discharges are easy to miss in the double banana: read the Fz–Cz–Pz chain, or the transverse montage."});
X({t, title:"Tingling that marches", stem:"A 52-year-old man has spells of tingling that march from the right hand up to the shoulder. EEG.",
 e:{f:"spk", site:"P3", t:[2.0, 5.5, 8.2], A:105, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.8,2.55,"C3 P3 O1","Left parasagittal chain","Reversal at P3"],[5.3,6.05,"P3","",""],[8.0,8.75,"P3","",""]],
 l:"C3–P3 goes down and P3–O1 goes up: a negative phase reversal at P3, left centroparietal.",
 q:[["Where is the maximum?", ["P3","C3","P7","O1"], "The pair C3–P3 and P3–O1 point at each other."],
    ["Which symptom fits this focus?", ["Tingling marching up the right arm","Déjà vu","Left leg jerks","Flashes in the left visual field"], "The left parietal cortex behind the motor strip handles sensation from the right side."]],
 p:"Map the symptom to the cortex, then check the EEG agrees: concordance is what epilepsy surgery teams look for."});
X({t, title:"Both sides, never together", stem:"A 40-year-old man with drug-resistant temporal lobe epilepsy is being assessed for surgery. Routine EEG.",
 e:{f:"spk", site:"F7", t:[1.5, 6.8], A:110, ev:[[0.1,"Awake, eyes closed"]], also:[{f:"spk", site:"F8", t:[3.9, 8.6], A:105}]},
 m:[[1.3,2.05,"F7 T7","Left temporal","Left sharp wave"],[3.7,4.45,"F8 T8","Right temporal","Right sharp wave"],[6.6,7.35,"F7 T7","",""],[8.4,9.15,"F8 T8","",""]],
 l:"Sharp waves in the left temporal chain (reversal at F7) and, at other moments, in the right temporal chain (reversal at F8).",
 q:[["Main finding?", ["Bilateral independent temporal sharp waves","Generalized discharges","Left temporal only","Lateral eye movements"], "Each side fires on its own; eye movements make F7 and F8 move opposite at the same moment."],
    ["What does it mean for surgery?", ["Either side could start seizures; record seizures (often with intracranial EEG) before deciding","Operate on the left straight away","Surgery is now impossible","It proves a generalized epilepsy"], "Bitemporal discharges need careful localization of where the seizures actually begin."]],
 p:"Count which side fires more: a strong majority (for example 80–90%) on one side supports that side, but seizure recordings decide."});
X({t, title:"Why is everything moving?", stem:"A 33-year-old woman with left temporal lobe epilepsy. The EEG opens in the ear reference. Why do so many left channels move?",
 e:{f:"spk", site:"T7", t:[2.0, 5.2, 8.0], A:125, mont:"ear", ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.8,2.55,"T7 F7","Left temporal","Real discharge at T7 and F7"],[1.8,2.55,"F3 C3 P3 O1","Left parasagittal","Inverted copy from an active A1"],[5.0,5.75,"T7","",""],[7.8,8.55,"T7","",""]],
 l:"T7–A1 and F7–A1 deflect up, but F3, C3, P3 and O1 referenced to A1 deflect down at the same moment: A1, next to the temporal lobe, picks up the discharge and puts an inverted copy into every channel that uses it. Switch to Double banana.",
 q:[["Why do F3, C3, P3 and O1 dip down with each discharge?", ["A1 picks up the temporal discharge (active reference)","They have positive spikes","A second focus","Electrode artifact at C3"], "Any channel X–A1 shows X minus A1; if A1 goes negative, X–A1 goes positive (down)."],
    ["Best montage to check it?", ["Double banana or average reference","Ear reference again","A montage using A1 for everything","None"], "Bipolar chains don't use A1, so the contamination disappears."]],
 p:"The ear-reference trap: temporal discharges contaminate A1/A2 and make a temporal focus look widespread or even reversed."});
X({t, title:"On and off", stem:"A 61-year-old woman with a single seizure. MRI pending. EEG.",
 e:{f:"slow", site:"T8", A:26, win:[[0.8, 3.5], [5.6, 8.8]], ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.7,3.6,"F8 T8 P8","Right temporal chain","Irregular delta, right temporal"],[5.5,8.9,"F8 T8 P8","Again","Intermittent: comes and goes"]],
 l:"Runs of irregular 1–3 Hz delta in the right temporal channels that come and go, with a normal background between them.",
 q:[["Main finding?", ["Intermittent right temporal polymorphic slowing","Right temporal rhythmic delta (TIRDA)","Wicket spikes","Normal"], "Irregular (polymorphic), focal and intermittent."],
    ["Compared with continuous focal slowing, intermittent slowing is:", ["Less specific: seen with lesions but also in focal epilepsy","More specific for a tumour","The same","Always normal"], "Continuous polymorphic delta points most strongly to a structural lesion."]],
 p:"Describe slowing by location, frequency, rhythmicity (polymorphic or rhythmic) and persistence (continuous or intermittent)."});
X({t, title:"Front, not temple", stem:"A 63-year-old man has become apathetic and disinhibited over four months. EEG.",
 e:{f:"slow", site:"F3", A:27, aL:0.85, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.2,9.8,"Fp1 F3","Left parasagittal, front end","Continuous delta at Fp1 and F3"],[0.2,9.8,"T7 P7","Compare the temporal chain","Much less here"]],
 l:"Continuous irregular delta at Fp1 and F3, less at F7 and C3, and little in the temporal chain behind F7.",
 q:[["Where is the slowing?", ["Left frontal (Fp1, F3)","Left temporal (T7, P7)","Right frontal","Generalized"], "It is maximal in the first channels of the left parasagittal chain."],
    ["What makes it polymorphic?", ["Irregular waves of varying shape and duration","Regular sinusoidal waves","A sharp component","A rate of exactly 3 Hz"], "Polymorphic means no consistent shape or rhythm."]],
 p:"Personality change with left frontal delta: image for a frontal tumour (glioma, meningioma)."});
X({t, title:"Bumped into things on the right", stem:"A 71-year-old woman suddenly kept bumping into things on her right side. EEG the next day.",
 e:{f:"slow", site:[-0.42,-0.8], A:24, aL:0.25, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.2,9.8,"P3 O1 P7","Left posterior","Delta, left occipital-parietal"],[0.2,9.8,"O2 P4","Right posterior","Normal alpha on the right only"]],
 l:"Irregular delta over the left posterior head (P3, O1, P7) and almost no alpha on the left, while the right keeps a normal alpha.",
 q:[["Main finding?", ["Left posterior slowing with loss of the left alpha","Right posterior slowing","A normal alpha asymmetry","POSTS"], "A mild alpha asymmetry (right a little bigger) is normal; losing the alpha on one side with delta isn't."],
    ["Likely cause?", ["A left posterior cerebral artery infarct","Absence epilepsy","A drug effect","A right subdural haematoma"], "Right visual field loss plus left posterior slowing."]],
 p:"Alpha on one side may normally be up to about 50% larger (usually the right); a bigger difference, or slowing, is abnormal."});
X({t, title:"Across the head", stem:"A 47-year-old man with right temporal seizures. This page is in the transverse montage. Find the maximum.",
 e:{f:"spk", site:"T8", kind:"spike", t:[1.6, 4.5, 7.5], A:100, mont:"transverse", ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.45,2.0,"C4 T8 A2","Central row, right end","C4–T8 and T8–A2 point at each other"],[4.35,4.9,"T8","",""],[7.35,7.9,"T8","",""]],
 l:"In the central row of the transverse montage, C4–T8 goes down and T8–A2 goes up: a negative reversal at T8.",
 q:[["Where is the maximum?", ["T8","C4","A2","F8"], "The reversal is between C4–T8 and T8–A2."],
    ["Which two channels point at each other?", ["C4–T8 and T8–A2","Fp1–Fp2 and O1–O2","F3–Fz and Fz–F4","P7–P3 and P3–Pz"], "Transverse chains run left to right; the shared electrode of the pointing pair is the maximum."]],
 p:"Read every discharge in two montages: a real focus keeps the same location whichever way you look."});
X({t, title:"Generalized, or not?", stem:"A 25-year-old man was diagnosed with generalized epilepsy, but drugs haven't worked. Look at the start of each burst.",
 e:{f:"gsw", win:[[2.0, 4.2], [6.5, 8.4]], hz:2.8, A:120, ks:[1.25, 0.85], lead:"F3", leadT:0.07, sens:10, ev:[[0.1,"Awake, eyes closed"]],
    also:[{f:"spk", site:"F3", kind:"spike", t:[1.45, 1.75, 5.95, 6.25], A:90, wave:0.2}]},
 m:[[1.3,2.1,"Fp1 F3 C3","Before each burst","Left frontal spikes lead in"],[2.0,4.3,"all","","Then bilateral spike-and-wave, left bigger"],[5.8,6.6,"F3","Again",""],[6.5,8.5,"all","",""]],
 l:"Each burst of bilateral spike-and-wave is heralded by spikes at F3, and the bursts stay larger on the left: a consistent focal lead.",
 q:[["What is the key detail?", ["Each burst starts with left frontal spikes","Perfectly symmetric 3 Hz bursts","They are artifacts","They are triphasic"], "Look at the first half-second of every burst."],
    ["A consistent focal lead suggests:", ["A focal (left frontal) epilepsy with rapid bilateral spread","Childhood absence epilepsy","A normal variant","Juvenile myoclonic epilepsy"], "Secondary bilateral synchrony: frontal foci spread fast through the corpus callosum."]],
 p:"Misreading focal epilepsy as generalized changes drug choice and hides a possible surgical target."});
X({t, title:"Colours on the left", stem:"A 55-year-old woman on the monitoring unit presses the button: coloured lights on her left side. Two pages.",
 e:{dur:20, sens:10, f:"sz", site:"O2", on:3, off:15, hz:[[3,9],[8,7],[12,5],[15,3.5]], spread:[{site:"P8", t:7, A:60},{site:"T8", t:10, A:40}], post:25,
    ev:[[0.2,"Awake"],[3.2,"Presses button: lights on the left"],[10,"Stares, unresponsive"],[15.2,"Confused"]]},
 m:[[3,8,"O2 P8 P4","Right occipital","Onset: rhythmic alpha–theta at O2"],[8,15,"O2 P8 T8","Watch it spread","Spreads forward to P8 and T8"],[15,19.8,"O2 P8","After","Postictal slowing, right posterior"]],
 l:"A rhythmic 9 Hz discharge appears in the channels ending at O2, slows and grows, spreads forward to P8 and T8, and ends with right posterior slowing. O2 is at the end of the chain, so look for the biggest channels rather than a reversal.",
 q:[["Where does it start?", ["Right occipital (O2)","Left occipital (O1)","Right frontal","Generalized"], "The first rhythmic activity is in P4–O2 and P8–O2."],
    ["Which clinical sign matches the onset?", ["Coloured lights in the left visual field","Right hand jerking","Déjà vu","Speech arrest"], "Right occipital cortex sees the left visual field; awareness goes when it reaches the temporal lobe."]],
 p:"Occipital seizures often spread to the temporal lobe and can be mistaken for temporal lobe epilepsy."});
X({t, title:"Head turns right", stem:"A 30-year-old man has seizures in which his head and eyes turn forcibly to the right and his right arm extends. Two pages.",
 e:{dur:20, sens:10, f:"sz", site:"F3", on:3, off:13, hz:[[3,14],[5,9],[9,6],[13,4]], lvfa:14, A:[[3,0],[4,20],[7,70],[12.7,105],[13,90]], spread:[{site:"Fz", t:5, A:50},{site:"F4", t:8, A:40}], post:20, bg:"sleep", sp:[0.8, 2.2], vx:[1.5],
    ev:[[0.2,"Asleep"],[3.6,"Head and eyes turn right"],[6,"Right arm extends"],[13.2,"Stops"]]},
 m:[[2.8,5,"Fp1 F3 C3","Left frontal","Onset: low-voltage fast activity, F3"],[5,13,"F3 Fz F4","Watch it spread","Rhythmic, slowing, spreading to the midline"],[13,19.8,"F3","After","Postictal slowing, left frontal"]],
 l:"The seizure begins with low-amplitude fast (beta) activity at F3, becomes rhythmic and slower, spreads to Fz and F4, then stops with left frontal slowing.",
 q:[["What is the onset pattern?", ["Low-voltage fast activity at F3","Rhythmic theta at T7","Generalized spike-and-wave","An electrode pop"], "Low-voltage fast activity is the most localizing scalp onset pattern."],
    ["Forced head turning to the right points to:", ["A left hemisphere onset (turning away from the focus)","A right hemisphere onset","Nothing","An absence seizure"], "Forced (versive) turning late in a seizure is usually contralateral to the onset."]],
 p:"Frontal seizures spread fast and are often obscured by movement; the first two seconds matter most."});
X({t, title:"Two kinds of blip", stem:"A 50-year-old man with right temporal lobe epilepsy. Some sharp events are brain and some aren't.",
 e:{f:"spk", site:"T8", kind:"spike", t:[2.0, 6.3], A:105, ev:[[0.1,"Awake, eyes closed"]], also:[{f:"pop", e:"T7", t:[3.8, 8.1], A:170}]},
 m:[[1.85,2.4,"F8 T8 P8","Right temporal","Spike with a field"],[6.15,6.7,"T8","",""],[3.7,4.6,"T7","Left temporal","Pop: T7 only, no field"],[8.0,8.9,"T7","",""]],
 l:"The right temporal spikes spread to F8, P8 and C4. The left events jump vertically in only the two channels containing T7, in opposite directions, with nothing in any neighbour.",
 q:[["Which events are cerebral?", ["Only the right temporal spikes","Only the left T7 events","Both","Neither"], "Brain activity always has a field across neighbouring electrodes."],
    ["What gives the T7 events away?", ["They involve one electrode only: no field","They are too small","They have an after-going slow wave","They are on the left"], "A single-electrode event is the electrode (poor contact, drying gel)."]],
 p:"Ask the technologist to re-gel a popping electrode; never localize a focus to a single electrode."});
X({t, title:"Only when asleep", stem:"A 38-year-old woman's awake EEG was normal. This sleep-deprived study catches her asleep.",
 e:{f:"spk", site:"F7", t:[1.9, 3.6, 5.4, 7.2, 8.9], A:100, bg:"sleep", sp:[1.1, 4.5, 8.1], vx:[2.8, 6.3], ev:[[0.1,"Asleep (N2)"]]},
 m:[[1.7,2.45,"F7 T7","Left temporal chain","Sharp wave, reversal at F7"],[3.4,4.15,"F7","",""],[5.2,5.95,"F7","",""],[1.1,1.9,"C3 C4","Midline and centres","Spindle (normal)"],[2.6,3.1,"Cz","","Vertex wave (normal)"]],
 l:"Among normal spindles and vertex waves, repeated sharp waves phase-reverse at F7 on the left only.",
 q:[["Main finding?", ["Left anterior temporal sharp waves in sleep","Vertex waves","Spindles","K-complexes"], "Spindles and vertex waves are central and symmetric; these are left temporal."],
    ["Why ask for sleep?", ["Sleep and sleep deprivation bring out interictal discharges","Sleep removes all artifacts","Seizures never happen awake","Sleep makes the PDR faster"], "Non-REM sleep activates focal and generalized discharges."]],
 p:"A single normal routine EEG misses many patients with epilepsy; repeat with sleep deprivation or record longer."});
X({t, title:"Far back on the left", stem:"A 46-year-old man has seizures with a vivid feeling that a scene is unreal. Routine EEG.",
 e:{f:"spk", site:"P7", t:[1.7, 4.9, 7.8], A:110, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.5,2.25,"T7 P7 O1","Left temporal chain, back end","Reversal at P7"],[4.7,5.45,"P7","",""],[7.6,8.35,"P7","",""]],
 l:"T7–P7 goes down and P7–O1 goes up: a negative phase reversal at P7 (old name T5), left posterior temporal.",
 q:[["Where is the maximum?", ["P7 (left posterior temporal)","F7","O2","C3"], "The pens point at each other at P7."],
    ["What is P7's old name?", ["T5","T3","T6","O1"], "T5 = P7, T6 = P8."]],
 p:"Learn both naming systems: older reports and many machines still use T3–T6."});
X({t, title:"The flat channel", stem:"A 36-year-old woman with temporal lobe epilepsy. One channel stays oddly quiet during each discharge.",
 e:{f:"spk", site:[-0.95,0.3], t:[2.1, 5.0, 8.1], A:115, sg:0.3, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.9,2.65,"Fp1 F7 T7 P7","Left temporal chain","Fp1–F7 down, F7–T7 flat, T7–P7 up"],[4.8,5.55,"F7 T7","",""],[7.9,8.65,"F7 T7","",""]],
 l:"Fp1–F7 goes down, T7–P7 goes up, and F7–T7 between them barely moves: F7 and T7 are equally negative, so the maximum lies between them.",
 q:[["Where is the maximum?", ["Between F7 and T7 (equal at both)","At F7 only","At Fp1","At P7"], "A phase reversal 'through' an isoelectric channel means two equally involved electrodes."],
    ["Why is F7–T7 nearly flat?", ["Both inputs are equally negative, so the difference is near zero","The electrode is disconnected","The discharge is positive","The filter removed it"], "A bipolar channel shows only the difference between its two electrodes."]],
 p:"A flat channel in the middle of a reversal is not 'nothing': it is the peak, shared by two electrodes."});
X({t, title:"Arm goes up", stem:"A 42-year-old man has brief seizures in which his left arm rises and his head turns. EEG.",
 e:{f:"spk", site:"F4", t:[1.8, 4.7, 7.6], A:105, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[1.6,2.35,"Fp2 F4 C4","Right parasagittal chain","Reversal at F4"],[4.5,5.25,"F4","",""],[7.4,8.15,"F4","",""]],
 l:"Fp2–F4 goes down and F4–C4 goes up: a negative phase reversal at F4, right dorsolateral frontal.",
 q:[["Where is the maximum?", ["F4","F8","Fz","C4"], "The reversal sits in the right parasagittal chain, not the temporal one."],
    ["Which region is it?", ["Right frontal","Right temporal","Left frontal","Occipital"], "Even numbers are right; F = frontal."]],
 p:"Odd numbers left, even right, z midline; the letters give the lobe (Fp, F, C, T, P, O)."});
})();

/* ================= Tier 3 · Name it (ACNS critical care terms) ================= */
(function () {
const {X} = window.EEGLIB, t = 3;
X({t, title:"The glioblastoma", stem:"A 79-year-old man with a left glioblastoma is more confused. Name the pattern the ACNS way.",
 e:{f:"pd", site:"Lh", hz:1, A:120, bg:"slow", aL:0.5, sens:10, ev:[[0.1,"Drowsy"]]},
 m:[[0.2,9.8,"L","Left hemisphere","LPDs about 1 Hz"]],
 l:"Sharp discharges at nearly regular intervals (about one per second) over the left hemisphere, with flat-ish gaps between them.",
 q:[["ACNS name?", ["LPDs","GPDs","LRDA","BIPDs"], "Lateralized (one side), Periodic (repeating with an inter-discharge gap), Discharges."],
    ["What is the frequency?", ["About 1 Hz","About 3 Hz","About 0.2 Hz","About 10 Hz"], "Count the discharges in one second-wide grid square across the page."]],
 p:"ACNS formula: main term 1 (G, L, BI, UI, Mf) + main term 2 (PDs, RDA, SW) + modifiers (frequency, plus features, prevalence, duration)."});
X({t, title:"A little extra", stem:"A 58-year-old woman with a right frontal abscess. Something rides on each discharge. Name it.",
 e:{f:"pd", site:"Rh", hz:1.5, m:"spiky", A:110, plusF:13, bg:"slow", aR:0.5, sens:10, ev:[[0.1,"Lethargic"]]},
 m:[[0.2,9.8,"R","Right hemisphere","LPDs with fast activity (+F)"]],
 l:"Right lateralized periodic discharges at about 1.5 Hz, each followed by a brief burst of low-amplitude fast (beta) activity.",
 q:[["ACNS name?", ["LPDs+F","LPDs alone","LRDA","Breach rhythm"], "Plus F = superimposed fast activity."],
    ["What do plus features do?", ["Raise the risk of seizures","Lower the risk","Mean it's artifact","Make it benign"], "Plus features (+F, +R, +S) and higher frequency push a pattern toward the ictal end."]],
 p:"LPDs+F are among the patterns most strongly linked to seizures; monitor and treat the cause."});
X({t, title:"After the bypass", stem:"A 67-year-old man is slow to wake after cardiac bypass surgery; he is septic. Name it.",
 e:{f:"pd", site:"gen", hz:1.1, m:"sharp", A:100, bg:"slow", pdr:5.5, sens:10, ev:[[0.1,"Unresponsive to voice"]]},
 m:[[0.2,9.8,"all","Both sides at once","GPDs about 1 Hz"]],
 l:"Sharp discharges about once a second, on both sides at the same moment and roughly symmetric, on a slow background.",
 q:[["ACNS name?", ["GPDs","LPDs","GRDA","Burst suppression"], "Generalized (bilateral, synchronous, symmetric) periodic discharges."],
    ["What does the 'G' mean?", ["Bilaterally synchronous and symmetric","Left-sided","Bilateral but independent","Multifocal"], "Bilateral independent is BI; three or more independent sites is Mf."]],
 p:"GPDs in a septic or post-operative patient: think metabolic, drugs, anoxia, and nonconvulsive status."});
X({t, title:"The antibiotic", stem:"A 70-year-old woman with kidney disease is on cefepime for pneumonia. She is confused with multifocal jerks. Name it and act.",
 e:{f:"pd", site:"front", m:"tri", hz:2, A:110, bg:"slow", pdr:5.5, sens:10, ev:[[0.1,"Confused, jerking"]]},
 m:[[0.2,9.8,"all","Everywhere, front first","GPDs 2 Hz, triphasic"]],
 l:"Generalized triphasic discharges at about 2 Hz, frontally maximal with a front-to-back lag, on a slow background.",
 q:[["ACNS name?", ["GPDs with triphasic morphology, 2 Hz","LPDs, 2 Hz","GRDA, 2 Hz","Generalized spike-and-wave, 3 Hz"], "Periodic, generalized, three phases."],
    ["Best next step?", ["Stop cefepime (dialysis if severe) and consider a benzodiazepine trial under EEG","Increase the cefepime dose","Ignore it: always benign","Surgery"], "Cefepime neurotoxicity mimics, and can cause, nonconvulsive status."]],
 p:"At 2 Hz this sits on the ictal–interictal continuum (PDs over 1 and up to 2.5 Hz)."});
X({t, title:"Two drummers", stem:"A 52-year-old man in coma after cardiac arrest, with a history of strokes on both sides. Name it.",
 e:{f:"pd", site:"Lh", hz:0.9, A:110, bg:"coma", sens:10, ev:[[0.1,"Comatose"]], also:[{f:"pd", site:"Rh", hz:1.35, A:95, t0:0.55}]},
 m:[[0.2,9.8,"L","Left hemisphere","Left discharges, one rhythm"],[0.2,9.8,"R","Right hemisphere","Right discharges, a different rhythm"]],
 l:"Periodic discharges over each hemisphere, but they fire at different rates and are not time-locked to each other.",
 q:[["ACNS name?", ["BIPDs (bilateral independent periodic discharges)","GPDs","LPDs on the left only","Multifocal sporadic sharp waves"], "Two sides, each periodic, independent of each other."],
    ["BIPDs are most often seen with:", ["Anoxia, encephalitis or several lesions, usually with coma","Healthy sleep","Absence epilepsy","Migraine"], "They imply bilateral cortical injury and carry a poor prognosis in many series."]],
 p:"Check independence by lining up discharges on the two sides: GPDs fire together, BIPDs don't."});
X({t, title:"Slow waves that keep time", stem:"A 64-year-old woman with a left subdural haematoma drained yesterday, now drowsy. Name it.",
 e:{f:"rda", site:[-0.78,0.2], sg:0.46, hz:1.5, A:70, jit:0.05, bg:"slow", aL:0.6, ev:[[0.1,"Drowsy"]]},
 m:[[0.2,9.8,"L","Left hemisphere","LRDA about 1.5 Hz"]],
 l:"Regular, smooth 1.5 Hz delta waves of the same shape over the left hemisphere, without a gap between waves.",
 q:[["ACNS name?", ["LRDA","LPDs","GRDA","Focal polymorphic delta"], "Rhythmic (no interval between waves, same shape), Delta, Lateralized."],
    ["Seizure association?", ["Strong, similar to LPDs","None","Only in children","Only with triphasic waves"], "LRDA carries a seizure risk similar to LPDs; GRDA doesn't."]],
 p:"Rhythmic = waves follow each other without a gap. Periodic = discharges separated by a gap of background."});
X({t, title:"On the sedation hold", stem:"A 48-year-old woman with liver failure in the ICU during a sedation hold. Name it.",
 e:{f:"rda", site:"gen", hz:2, A:55, bg:"slow", pdr:5, sens:10, ev:[[0.1,"Sedation held"]]},
 m:[[0.2,9.8,"all","Both sides","GRDA about 2 Hz"]],
 l:"Smooth, regular 2 Hz delta on both sides at once and symmetric, continuous across the page.",
 q:[["ACNS name?", ["GRDA","GPDs","LRDA","Generalized spike-and-wave"], "Generalized, rhythmic, delta, with no sharp component."],
    ["Seizure association?", ["Weak: GRDA isn't clearly linked to seizures","Very strong","It defines status","It defines brain death"], "GRDA points to encephalopathy, not seizures."]],
 p:"Add frontally predominant when it is (the old FIRDA)."});
X({t, title:"A sharp edge", stem:"A 59-year-old man with right temporal encephalitis. Look at the shape of each wave. Name it.",
 e:{f:"rda", site:[0.82,0.15], sg:0.42, hz:2, sharp:1.1, A:60, bg:"slow", aR:0.6, sens:10, ev:[[0.1,"Confused"]]},
 m:[[0.2,9.8,"Rt Rp","Right side","LRDA with sharp waves (+S), 2 Hz"]],
 l:"Rhythmic 2 Hz delta over the right hemisphere, temporal-maximal, each wave carrying a sharp negative peak.",
 q:[["ACNS name?", ["LRDA+S","LPDs","TIRDA","Breach rhythm"], "Rhythmic delta with a superimposed sharp component: +S."],
    ["Where does it sit?", ["On the ictal–interictal continuum (LRDA over 1 Hz with a plus feature)","Normal","Always a seizure","Artifact"], "ACNS 2021 places LRDA over 1 Hz with plus features or fluctuation on the continuum."]],
 p:"Ictal–interictal continuum: treat clinically, often with a cautious anti-seizure trial, and watch for evolution."});
X({t, title:"Suction time", stem:"A 61-year-old man in coma after a subarachnoid haemorrhage. Quiet at first; then the nurse suctions him. Name what appears.",
 e:{f:"pd", site:"gen", hz:1.5, m:"sharp", A:100, t0:4.3, bg:"coma", dA:15, sens:10, ev:[[0.1,"Comatose, undisturbed"],[4,"Suctioned through the tube"]]},
 m:[[0.2,3.9,"all","Before","No discharges"],[4.2,9.8,"all","After the stimulus","Periodic discharges appear"]],
 l:"Nothing periodic until suctioning; then generalized periodic discharges at about 1.5 Hz appear and continue.",
 q:[["What is this?", ["Stimulus-induced periodic discharges (SI-GPDs, part of SIRPIDs)","Arousal artifact only","Burst suppression","Spontaneous seizure unrelated to suctioning"], "Repeatably brought on by stimulation: the SI modifier."],
    ["How should you treat them?", ["Like the same pattern without stimulation: by frequency, plus features and the clinical picture","Always as status epilepticus","Always ignore them","Always deepen sedation"], "In a large study, stimulus-induced patterns carried no more seizure risk than the same patterns arising on their own; SI patterns that meet seizure criteria are still seizures."]],
 p:"Ask the nurse to note every stimulus on the recording; SIRPIDs are easy to miss without it."});
X({t, title:"Too short to be a seizure", stem:"A 55-year-old woman after left temporal lobectomy surgery for a tumour is drowsy. Brief runs appear. Name them.",
 e:{f:"rda", site:"T7", hz:5.5, sharp:0.6, A:55, jit:0.05, win:[[2, 3.6], [6.4, 7.4]], bg:"mild", sens:10, ev:[[0.1,"Drowsy"]]},
 m:[[1.9,3.7,"F7 T7 P7","Left temporal","Brief 5–6 Hz sharp run (1.5 s)"],[6.3,7.5,"F7 T7 P7","Again","BIRD"]],
 l:"Runs of sharply contoured 5–6 Hz rhythmic activity in the left temporal channels lasting about 1–2 seconds, then stopping.",
 q:[["What are they?", ["BIRDs (brief potentially ictal rhythmic discharges)","Electrographic seizures","Rhythmic mid-temporal theta (benign)","Muscle"], "Over 4 Hz, at least 6 waves, lasting 0.5 to under 10 s, sharp or evolving, with no clinical change."],
    ["What separates them from a seizure?", ["Duration under 10 seconds","Their frequency over 4 Hz","Their location","Nothing"], "Ten seconds or more with these features would be an electrographic seizure."]],
 p:"BIRDs are strongly linked to seizures in the ICU; they justify longer monitoring."});
X({t, title:"Fast enough to count", stem:"A 72-year-old man in the ICU after a convulsion is still unresponsive. The whole page looks like this. Name it.",
 e:{f:"pd", site:"gen", hz:3.1, m:"spiky", A:95, jit:0.05, bg:"coma", dA:12, sens:10, ev:[[0.1,"Unresponsive"]]},
 m:[[0.2,9.8,"all","Whole page","GPDs over 2.5 Hz for over 10 s"]],
 l:"Generalized spiky discharges at about 3 per second for the whole 10-second page.",
 q:[["How do you name it?", ["An electrographic seizure: discharges over 2.5 Hz for at least 10 seconds","GPDs at 1 Hz, interictal","GRDA","Normal"], "ACNS 2021 frequency criterion for an electrographic seizure."],
    ["If it continues for 10 minutes, it is:", ["Electrographic status epilepticus","Still interictal","Burst suppression","The ictal–interictal continuum"], "Electrographic status: 10 continuous minutes, or 20% of any 60 minutes."]],
 p:"Over 2.5 Hz for 10 s = seizure; definite evolution for 10 s = seizure, whatever the frequency."});
X({t, title:"Bursts with spikes", stem:"A 35-year-old woman with refractory status on a midazolam infusion. The team wants to wean. Name the pattern.",
 e:{f:"bs", bursts:[[0.5,2.1],[4.8,6.4],[8.4,9.8]], spiky:true, A:55, bg:"supp", sens:10, ev:[[0.1,"Midazolam infusion"]]},
 m:[[0.5,2.1,"all","Inside each burst","Spikes inside the burst"],[2.2,4.7,"all","Between bursts","Suppression"],[4.8,6.4,"all","",""]],
 l:"Burst suppression in which the bursts are full of spikes and sharp waves rather than plain slow waves.",
 q:[["ACNS name?", ["Burst suppression with highly epileptiform bursts","Plain burst suppression","Discontinuous background","Electrocerebral inactivity"], "Bursts containing multiple epileptiform discharges get this qualifier."],
    ["What does it suggest when weaning?", ["Ongoing epileptiform activity: a higher risk of seizures coming back","Safe to stop all drugs","Brain death","Artifact"], "Watch closely during the wean; load maintenance drugs first."]],
 p:"Describe bursts too: duration, content (epileptiform or not), and whether they are identical."});
X({t, title:"Gaps in the record", stem:"A 66-year-old man with severe sepsis on low-dose propofol. Name the background.",
 e:{f:"bs", bursts:[[0.2,2.5],[3.3,5.7],[6.4,8.9]], A:40, bg:"supp", sens:10, ev:[[0.1,"Propofol, low dose"]]},
 m:[[2.5,3.3,"all","Quiet gap","Short suppression"],[5.7,6.4,"all","","Short suppression"],[0.2,2.5,"all","Busy stretch","Activity fills most of the page"]],
 l:"Mostly continuous activity broken by short suppressed stretches that fill about a quarter of the page.",
 q:[["ACNS name?", ["Discontinuous background (10–49% suppressed)","Burst suppression","Continuous background","Suppression"], "Suppression fills under half the page."],
    ["What separates it from burst suppression?", ["Suppression fills less than half the page","The bursts are sharper","There is EKG artifact","The bursts are identical"], "Burst suppression needs 50–99% suppression."]],
 p:"Continuity grades: continuous, nearly continuous (under 10% suppressed), discontinuous, burst suppression, suppression."});
X({t, title:"Is anything there?", stem:"A 45-year-old woman two days after a cardiac arrest, off sedation, normal temperature. Name the background.",
 e:{bg:"supp", hr:{rate:96, k:0.5}, ev:[[0.1,"Off sedation 24 h, 37 °C"],[5,"Loud noise and pain: no change"]]},
 m:[[0.2,9.8,"all","Everywhere","Under 10 µV: suppressed"],[0.2,9.8,"EKG","EKG","Only EKG blips stand out"]],
 l:"Almost nothing over 10 µV at any electrode, only EKG blips; no change with noise or pain. Try 2 or 3 µV/mm to look closer.",
 q:[["ACNS name?", ["Suppressed background (under 10 µV)","Low voltage (10–20 µV)","Burst suppression","Normal"], "Suppression is under 10 µV; low voltage is mostly 10–20 µV."],
    ["Before calling it, exclude:", ["Sedatives, hypothermia, metabolic causes and technical problems","Drowsiness","Photic stimulation","Hyperventilation"], "Confounders can suppress the EEG reversibly."]],
 p:"Raise the sensitivity (to 2–3 µV/mm) whenever the page looks flat before deciding what is there."});
X({t, title:"Spike-and-wave in the ICU", stem:"A 57-year-old man with a prior stroke, now encephalopathic in the ICU. Name the pattern.",
 e:{f:"gsw", win:[[0.3, 9.7]], hz:1.5, A:95, irr:true, bg:"slow", pdr:5.5, sens:10, ev:[[0.1,"Drowsy, follows some commands"]]},
 m:[[0.3,9.7,"all","Both sides","Generalized spike-and-wave about 1.5 Hz"]],
 l:"Generalized spike-and-wave complexes at about 1.5 Hz with no clear evolution across the page.",
 q:[["ACNS name?", ["Generalized spike-and-wave, about 1.5 Hz (GSW)","GPDs with triphasic morphology","A typical absence","GRDA"], "A spike followed by a slow wave with no gap: the SW main term."],
    ["Without evolution at 1.5 Hz, where does it sit?", ["The ictal–interictal continuum","An electrographic seizure","Normal","Artifact"], "SW over 1 and up to 2.5 Hz, not evolving, is on the continuum."]],
 p:"Clinical correlation and a careful trial of treatment help decide what continuum patterns mean."});
X({t, title:"Slow periodic", stem:"An 83-year-old woman with an old left MCA infarct and new confusion from a UTI. Name it.",
 e:{f:"pd", site:"Lh", hz:0.5, m:"blunt", A:100, jit:0.1, bg:"mild", aL:0.6, sens:10, ev:[[0.1,"Drowsy"]]},
 m:[[0.2,9.8,"L","Left hemisphere","LPDs about 0.5 Hz"]],
 l:"Blunt discharges about every two seconds over the left hemisphere, regular, with background between them.",
 q:[["ACNS name?", ["LPDs, about 0.5 Hz","LRDA","GPDs","Focal polymorphic delta"], "Periodic: a gap between each discharge."],
    ["Compared with LPDs at 2 Hz, the seizure risk is:", ["Lower: risk rises with frequency","Higher","The same","Zero"], "Frequency and plus features are the main dials of seizure risk."]],
 p:"LPDs can appear with an old lesion when a new stress (infection, metabolic) is added."});
X({t, title:"Rhythm in between", stem:"A 69-year-old man with a right MCA infarct three days ago, now less responsive. Name it, plus feature included.",
 e:{f:"pd", site:"Rh", hz:1.2, A:105, plusR:28, bg:"slow", aR:0.5, sens:10, ev:[[0.1,"Drowsy"]]},
 m:[[0.2,9.8,"R","Right hemisphere","LPDs with rhythmic delta (+R)"]],
 l:"Right lateralized periodic discharges at about 1.2 Hz with rhythmic delta waves running underneath and between them.",
 q:[["ACNS name?", ["LPDs+R","LPDs+F","GPDs","LRDA alone"], "Plus R = rhythmic activity mixed in with the periodic discharges."],
    ["What does '+R' stand for?", ["Superimposed rhythmic activity, a plus feature","Reactivity","A recording fault","Right-sided"], "Plus features: +F (fast), +R (rhythmic), +S (sharp); +FR when both."]],
 p:"Plus features push a periodic pattern toward the ictal end of the continuum."});
X({t, title:"Does it react?", stem:"A 54-year-old man in coma after a liver transplant. The technologist calls his name and rubs his sternum at 5 s.",
 e:{bg:"coma", dA:28, sens:10, react:[5, 7.6], ev:[[0.1,"Comatose"],[5,"Name called, sternal rub"]]},
 m:[[0.2,4.9,"all","Before","Continuous delta"],[5,7.7,"all","During the stimulus","Lower, faster: reactive"]],
 l:"Continuous diffuse delta that drops in amplitude and gets faster (theta) during the stimulus, then returns: a reproducible change.",
 q:[["What happens at 5 s?", ["Reactivity: the background changes with stimulation","An electrographic seizure","Only muscle artifact","A burst"], "A change in frequency or amplitude of the cerebral activity."],
    ["What counts as reactivity?", ["A reproducible change in cerebral frequency or amplitude, not muscle or eye artifact","Any muscle artifact","An EKG change","A blink"], "Artifacts from movement don't count; test more than once."]],
 p:"Reactivity is one of the best EEG signs of a recoverable brain after cardiac arrest and in other comas."});
X({t, title:"No change at all", stem:"A 49-year-old woman with fulminant liver failure, unresponsive. Loud noise and pain at 5 s.",
 e:{bg:"coma", dA:34, sens:10, ev:[[0.1,"Unresponsive"],[5,"Loud noise and nail-bed pressure"]], also:[{f:"jerks", site:[0,0.8], sg:0.6, t:[5.1], A:18}]},
 m:[[0.2,9.8,"all","Whole page","Continuous delta"],[4.9,6.5,"all","After the stimulus","No change: unreactive"],[5.0,5.3,"Fp1 Fp2","","Only a muscle twitch"]],
 l:"Continuous high-voltage delta everywhere that doesn't change with noise or pain; the only change is a brief muscle twitch, which doesn't count.",
 q:[["ACNS name?", ["Continuous generalized delta, unreactive","A reactive background","Burst suppression","Alpha coma"], "Continuous, generalized, delta, and no cerebral change with stimulation."],
    ["Unreactivity means:", ["A deeper, more severe encephalopathy","Normal sleep","Seizures","Nothing"], "Unreactive backgrounds go with worse outcomes across causes."]],
 p:"Muscle or eye artifact after a stimulus is not reactivity."});
X({t, title:"Many places", stem:"A 47-year-old man with suspected autoimmune encephalitis. Count the locations.",
 e:{f:"spk", site:"F7", t:[1.4, 6.2], A:105, bg:"slow", sens:10, ev:[[0.1,"Confused"]],
    also:[{f:"spk", site:"P8", t:[3.1, 8.3], A:100},{f:"spk", site:"C4", t:[4.7], A:95},{f:"spk", site:"O1", t:[7.4], A:95}]},
 m:[[1.2,1.95,"F7","Left temporal","Site 1"],[2.9,3.65,"P8","Right posterior temporal","Site 2"],[4.5,5.25,"C4","Right central","Site 3"],[7.2,7.95,"O1","Left occipital","Site 4"]],
 l:"Sharp waves at F7, P8, C4 and O1, each on its own and at different times, on a slow background.",
 q:[["ACNS name?", ["Multifocal (Mf) independent sharp waves","Generalized discharges","LPDs","Artifact"], "Three or more independent locations on both sides = multifocal."],
    ["In an adult ICU patient, this suggests:", ["Diffuse or multifocal cortical injury (encephalitis, multiple infarcts, anoxia)","Absence epilepsy","Normal","JME"], "Multifocal discharges reflect widespread cortical irritability."]],
 p:"Sporadic discharges are counted per hour or described as rare, occasional, frequent or abundant."});
})();

/* ================= Tier 4 · Seizure or not ================= */
(function () {
const {X} = window.EEGLIB, R = window.EEGSIM.range, t = 4;
X({t, title:"Nothing to see at the bedside", stem:"A 76-year-old man in the ICU after a subdural evacuation. No movements at all. Two pages of continuous EEG.",
 e:{dur:20, sens:10, f:"sz", site:"T8", on:3, off:15, hz:[[3,6],[8,5],[12,3.5],[15,2.5]], A:[[3,0],[4.5,30],[9,75],[14.7,110],[15,90]], spread:[{site:"C4", t:9, A:50}], post:28, bg:"slow", ev:[[0.1,"Comatose, no movements"]]},
 m:[[3,9,"F8 T8 P8","Right temporal","Rhythmic theta starts"],[9,15,"F8 T8 C4","Watch it change","Slows, grows, spreads"],[15,19.8,"T8","After","Postictal slowing"]],
 l:"A rhythmic 6 Hz discharge starts in the right temporal chain, slows to 3 Hz, grows and spreads to C4 over 12 seconds, then stops with postictal slowing, while nothing happens clinically.",
 q:[["What is this?", ["An electrographic (nonconvulsive) seizure, right temporal","Right temporal BIRDs","TIRDA","Artifact"], "Over 10 s with definite evolution: a seizure, even without signs."],
    ["Why does it count as a seizure?", ["Definite evolution lasting at least 10 seconds","It is over 2.5 Hz throughout","It is on the right","It has no clinical signs"], "ACNS 2021: over 2.5 Hz for 10 s, or definite evolution for 10 s."]],
 p:"Most ICU seizures are nonconvulsive; only continuous EEG finds them."});
X({t, title:"Staring after surgery", stem:"A 63-year-old woman with a right frontal meningioma resected a week ago is suddenly confused, staring and barely responsive. Two pages.",
 e:{dur:20, sens:10, f:"pd", site:"Rh", m:"spiky", hz:[[0,2.6],[5,3.2],[10,2.8],[15,3.4],[20,2.9]], A:150, jit:0.05, bg:"slow", aR:0.5, ev:[[0.1,"Awake but mute, staring"]]},
 m:[[0.2,19.8,"R","Right hemisphere","Continuous discharges about 3 Hz"]],
 l:"Continuous right-sided spiky discharges at about 3 per second, waxing and waning in rate, for the whole recording.",
 q:[["What is this?", ["Focal nonconvulsive status epilepticus","Interictal LPDs at 1 Hz","GRDA","Normal"], "Continuous lateralized discharges over 2.5 Hz with altered behaviour."],
    ["Which Salzburg criterion is met on its own?", ["Epileptiform discharges faster than 2.5 Hz","Any rhythmic delta","A triphasic shape","Reactivity"], "At 2.5 Hz or slower you also need subtle signs, evolution or a response to treatment."]],
 p:"Treat as status: IV benzodiazepine, then a second-line IV drug, with continuous EEG."});
X({t, title:"After stopping lorazepam", stem:"A 68-year-old woman stopped long-term lorazepam three days ago. She walks and talks but is slow, confused and perseverating. EEG.",
 e:{f:"gsw", win:[[0.2, 9.8]], hz:[[0,2.4],[10,2.8]], A:90, irr:true, bg:"mild", sens:10, quiet:[[0,10]], ev:[[0.1,"Awake, slow to answer"]]},
 m:[[0.2,9.8,"all","Everywhere, the whole page","Continuous generalized spike-and-wave 2.5 Hz"]],
 l:"Continuous generalized spike-and-wave at about 2.5 Hz, irregular, with no normal background anywhere.",
 q:[["What is this?", ["Generalized nonconvulsive (absence) status","GPDs with triphasic morphology","Normal","Drug beta"], "Continuous generalized spike-and-wave with confusion."],
    ["Best test of the diagnosis?", ["An IV benzodiazepine trial with EEG and clinical improvement","MRI","Lumbar puncture","Wait and watch"], "Both the EEG and the patient should improve."]],
 p:"De novo absence status in older adults is often provoked by benzodiazepine withdrawal or psychotropic drugs."});
X({t, title:"The lorazepam test", stem:"A 74-year-old man with periodic discharges and coma after a fall. Page 1 before treatment; page 2 five minutes after IV lorazepam.",
 e:{dur:20, sens:10, f:"pd", site:"gen", m:"sharp", hz:2, A:100, t1:9.9, bg:"slow", pdr:5.5, ev:[[0.1,"Unresponsive"],[10,"5 min after IV lorazepam","break"],[11,"Opens eyes, answers questions"]]},
 m:[[0.2,9.9,"all","Before","GPDs about 2 Hz"],[10.1,19.8,"all","After lorazepam","Discharges gone; patient answers"]],
 l:"Generalized periodic discharges at about 2 Hz on page 1; after lorazepam they are gone, leaving slow background, and the patient wakes and talks.",
 q:[["What does the trial show?", ["Both EEG and patient improve: it was nonconvulsive status","Only the artifact changed","Nothing","Brain death"], "Salzburg: an EEG and clinical response to an IV anti-seizure drug confirms NCSE."],
    ["If the EEG improved but the patient didn't, it would be:", ["Indeterminate: possibly still interictal","Definite status","Definite brain death","Proof of a functional disorder"], "Benzodiazepines suppress many patterns, epileptic or not."]],
 p:"Give small repeated doses with EEG running and examine between doses."});
X({t, title:"Three days of twitching", stem:"A 59-year-old woman's left face and hand have twitched continuously for three days; she is alert. EEG.",
 e:{f:"pd", site:"C4", sg:0.3, m:"spiky", hz:1.2, A:90, jit:0.04, jerk:"F7", ev:[[0.1,"Alert; left face twitching"]]},
 m:[[0.2,9.8,"F4 C4 P4","Right central","Periodic spikes at C4"],[0.2,9.8,"Fp1 F7","Left face muscles","Twitch artifact locked to each spike"]],
 l:"Spikes at C4 about once a second, each followed within a fraction of a second by a burst of muscle artifact from the left face (left frontal-temporal channels).",
 q:[["What is this?", ["Epilepsia partialis continua: right central spikes time-locked to the twitches","Interictal LPDs of no relevance","Muscle artifact only","Tremor"], "Each twitch follows a cortical spike over the right motor strip."],
    ["Why does time-locking matter?", ["A pattern with a time-locked clinical correlate is an electroclinical seizure","It proves artifact","It shows she is asleep","It doesn't"], "ACNS: any pattern with a time-locked clinical correlate is an electroclinical seizure."]],
 p:"EPC: think Rasmussen encephalitis, non-ketotic hyperglycaemia, stroke, tumour, mitochondrial disease."});
X({t, title:"Fainting with an aura", stem:"A 62-year-old man has spells of déjà vu followed by collapse. Two pages; watch the EKG channel.",
 e:{dur:20, sens:10, f:"sz", site:"T7", on:2, off:10.5, hz:[[2,7],[6,5.5],[10.5,4]], A:[[2,0],[3,30],[7,80],[10.3,100],[10.5,80]], quiet:[[2,20]],
    hr:{beats:[...R(0.3, 7, 0.72), 7.9, 9.0, 10.4, 15.2, 16.3, 17.2, 18.0, 18.8, 19.6], k:0.3},
    also:[{f:"slow", site:"gen", A:55, win:[[10.6,12.6],[16,18.5]]},{f:"flat", win:[[12.6,16]], k:0.85},{f:"jerks", site:[0,0.2], sg:1.2, t:[13.4, 14.1]}],
    ev:[[0.2,"Awake"],[2.2,"Déjà vu"],[11,"Collapses"],[13.4,"A few jerks"],[17,"Wakes"]]},
 m:[[2,10.5,"F7 T7","Left temporal","Seizure: rhythmic theta"],[7,15.2,"EKG","EKG","Heart slows, then stops"],[12.6,16,"all","Everywhere","Flat: no blood flow"]],
 l:"A left temporal seizure starts first. The heart then slows and stops for nearly five seconds; the whole EEG slows, goes flat during the pause, and slows again when the heart restarts.",
 q:[["What is this?", ["A left temporal seizure causing ictal asystole","Convulsive syncope with no seizure","A functional seizure","Artifact"], "The seizure begins before the heart slows; the flat phase is the cardiac pause."],
    ["What else does he need?", ["A cardiology review for a pacemaker, alongside seizure treatment","Nothing more","To stop all anti-seizure drugs","Epilepsy surgery only"], "Pacing prevents the collapses and injuries; whether it lowers the risk of sudden death in epilepsy is unproven."]],
 p:"Always read the EKG channel in spells with collapse."});
X({t, title:"From sleep, all at once", stem:"A 24-year-old woman has stereotyped night spells: she sits up, thrashes and grunts for 10 seconds, several times a night. Two pages.",
 e:{dur:20, sens:10, bg:"sleep", sp:[1.2, 2.9], vx:[2.2],
    also:[{f:"flat", win:[[4,5.8]], k:0.6},{f:"fast", site:"mid", hz:18, A:14, win:[[4, 5.8]]},{f:"move", hz:1.6, A:120, mA:24, win:[[5.8, 14.5]]}],
    ev:[[0.1,"Asleep (N2)"],[4,"Eyes open"],[5.8,"Sits up, thrashes, grunts"],[14.5,"Stops; lies down"]]},
 m:[[4,5.8,"Fz Cz F3 F4","Midline, before the movement","Onset: flattening and low-voltage fast"],[5.8,14.5,"all","During the movement","Obscured by movement and muscle"]],
 l:"Out of N2 sleep the background suddenly flattens with low-voltage fast activity at the vertex, then movement and muscle artifact hide everything until it stops.",
 q:[["What is this?", ["A frontal lobe (hypermotor) seizure from sleep","A functional seizure","A night terror","A normal arousal"], "Brief, stereotyped, clustered, from N2, with an EEG change before the movement."],
    ["Which clue favours epilepsy here?", ["Brief, stereotyped spells from N2 sleep with a change before the movement","Eyes squeezed shut and resisting opening","Long waxing-and-waning course","Crying afterwards"], "Functional seizures arise from wakefulness (often 'pseudosleep')."]],
 p:"Scalp EEG can look normal during frontal seizures; video and the semiology carry most of the weight."});
X({t, title:"Shaking with eyes squeezed shut", stem:"A 27-year-old woman has long spells of side-to-side head shaking with eyes squeezed shut, waxing and waning. Two pages.",
 e:{dur:20, sens:10, bg:"awake", pa:42, also:[{f:"move", hz:2.3, A:130, mA:20, win:[[3, 8], [9.4, 15]]}],
    ev:[[0.2,"Eyes closed, awake"],[3,"Head shaking, eyes squeezed shut"],[15,"Stops; talks at once"]]},
 m:[[3,15,"Lt Rt","Temporal chains","Movement artifact: never evolves"],[8,9.4,"O1 O2","In the pause","Alpha still there"],[15.2,19.8,"O1 O2","Afterwards","Normal at once"]],
 l:"Rhythmic movement and muscle artifact during the event, but normal alpha in the pause and immediately afterwards, with no postictal slowing.",
 q:[["What does the EEG show?", ["No electrographic seizure: alpha persists through the event","A bilateral tonic–clonic seizure","A frontal seizure","Absence status"], "Awake-brain alpha during apparent bilateral shaking argues against an epileptic seizure."],
    ["Which clinical clue fits?", ["Eyes squeezed shut, side-to-side shaking, long waxing course","A bitten tongue side","Brief stereotyped spells from sleep","Long postictal confusion"], "Functional (dissociative) seizures: eyes closed, asynchronous, fluctuating."]],
 p:"Give the diagnosis positively and refer for psychological treatment; stop anti-seizure drugs that aren't needed."});
X({t, title:"At the blood draw", stem:"A 21-year-old man fainted while having blood taken and jerked a few times. Two pages, recorded by chance.",
 e:{dur:20, sens:10, bg:"awake", quiet:[[6, 16]], hr:{beats:[...R(0.3, 5, 0.7), 5.8, 7.0, 13.2, ...R(14, 20, 0.72)], k:0.3},
    also:[{f:"slow", site:"gen", A:70, win:[[6.5, 8.8], [13, 15.5]]},{f:"flat", win:[[8.8, 13]], k:0.9},{f:"jerks", site:[0,0.2], sg:1.2, t:[9.4, 10.1, 10.9], A:30}],
    ev:[[0.2,"Needle in"],[5,"Pale, sweaty"],[8.5,"Loses consciousness"],[9.4,"Jerks"],[13.5,"Laid flat"],[17,"Awake"]]},
 m:[[5,13.2,"EKG","EKG","Heart slows, then pauses"],[6.5,8.8,"all","","Slow"],[8.8,13,"all","","Flat"],[13,15.5,"all","","Slow again"]],
 l:"The heart slows and pauses first; the EEG then slows, goes flat while he jerks, and slows again once the heart restarts. No spikes, no rhythmic evolution.",
 q:[["What is this?", ["Convulsive syncope: slow–flat–slow with a cardiac pause","A generalized seizure","A functional seizure","An absence"], "The jerks happen during the flat phase: no cortical discharge."],
    ["Where is the key evidence?", ["The EKG channel","The Fp channels","O1","The photic ticks"], "The EKG shows the pause that starves the brain."]],
 p:"Jerks are common in syncope and don't mean epilepsy."});
X({t, title:"Rhythmic, but too regular", stem:"An 80-year-old man with Parkinson disease in the ICU; his left arm shakes. A rhythmic pattern appears in some left channels.",
 e:{bg:"mild", also:[{f:"art", e:"T7 P7", hz:4.8, A:60}], ev:[[0.1,"Left arm tremor visible on video"]]},
 m:[[0.2,9.8,"T7 P7","Two left channels","Same 5 Hz the whole time, no field"]],
 l:"A monotonous 5 Hz rhythm in channels containing T7 and P7 only, unchanged from start to finish, with nothing in neighbouring electrodes.",
 q:[["What is it?", ["Tremor artifact","A left temporal seizure","LRDA","BIRDs"], "No field, no evolution, and it matches the visible tremor."],
    ["Which feature proves it?", ["It matches the tremor on video, has no field and never evolves","Its frequency","Its amplitude","It is on the left"], "Seizures evolve and have fields; artifacts copy movements."]],
 p:"Ask for video and an accelerometer or EMG lead; reposition the arm and watch the pattern vanish."});
X({t, title:"The drummer speeds up", stem:"A 71-year-old woman with a left hemispheric stroke has LPDs on continuous EEG. Watch what happens over two pages.",
 e:{dur:20, sens:10, f:"pd", site:"Lh", m:"spiky", hz:[[0,1],[6,1.1],[9,2],[12,3.1],[16.5,3.5]], Aev:[[0,0.8],[8,0.8],[13,1.2],[16.5,1.3]], t1:16.6, bg:"slow", aL:0.5,
    also:[{f:"slow", site:"T7", A:28, win:[[16.7, 21]]}], ev:[[0.1,"Drowsy"]]},
 m:[[0.2,8,"L","Left hemisphere","LPDs about 1 Hz"],[8,16.6,"L","Watch the rate","Speeds past 2.5 Hz and grows: seizure"],[16.7,19.8,"Lt","After","Postictal slowing"]],
 l:"Left LPDs at about 1 Hz speed up over several seconds to over 3 Hz and grow in amplitude, then stop abruptly with focal slowing.",
 q:[["What is this?", ["LPDs evolving into an electrographic seizure","Stable LPDs","BIRDs","Artifact"], "The frequency and amplitude change over more than 10 seconds."],
    ["What changed?", ["Frequency rose past 2.5 Hz and amplitude grew, over more than 10 s","Nothing","Only the EKG","Only the montage"], "Evolution is the core of a seizure."]],
 p:"Continuous EEG catches LPDs turning into seizures; escalate treatment when they do."});
X({t, title:"Just long enough", stem:"A 52-year-old man after right temporal surgery has brief rhythmic runs. This one lasts longer. Two pages.",
 e:{dur:20, sens:10, f:"rda", site:"T8", hz:[[3,6],[14,4]], sharp:0.5, A:1, amp:[[3,0],[3.6,45],[10,65],[13.9,80],[14.2,0]], jit:0.05, bg:"mild", ev:[[0.1,"Drowsy"]]},
 m:[[3,14.2,"F8 T8 P8","Right temporal","Rhythmic run, 6 → 4 Hz, 11 s"]],
 l:"A sharply contoured rhythmic run in the right temporal chain starts at 6 Hz, slows to 4 Hz and grows, lasting about 11 seconds.",
 q:[["What is this?", ["An electrographic seizure: evolving and over 10 seconds","BIRDs","Rhythmic mid-temporal theta","TIRDA"], "BIRDs last under 10 s; this lasts 11 s and evolves."],
    ["Minimum duration of an electrographic seizure?", ["10 seconds","3 seconds","30 seconds","5 minutes"], "Shorter runs with ictal features are BIRDs."]],
 p:"Measure runs with the one-second grid: a few seconds changes the name and the management."});
X({t, title:"The big one", stem:"A 30-year-old man on the monitoring unit has a convulsion. Two pages.",
 e:{dur:20, sens:10, f:"gtc", on:3, tonic:9, off:15, ev:[[0.2,"Awake"],[3,"Cries out, stiffens"],[9,"Rhythmic jerking"],[15,"Stops; snoring breaths"]]},
 m:[[3,4.5,"all","At the start","Fast generalized activity"],[4.5,9,"all","Tonic phase","Muscle hides the EEG"],[9,15,"all","Clonic phase","Bursts and gaps"],[15.2,19.8,"all","After","Postictal suppression"]],
 l:"Generalized fast activity starts the seizure but muscle artifact soon hides it (tonic phase), then rhythmic bursts with gaps (clonic phase), then a nearly flat postictal record.",
 q:[["What is this?", ["A generalized tonic–clonic seizure hidden by muscle, then postictal suppression","A functional seizure","Syncope","Electrode artifact"], "Tonic then clonic artifact, then postictal suppression."],
    ["What follows a convulsion on EEG?", ["Postictal suppression, then slowing","Normal alpha at once","Spindles","Triphasic waves always"], "Immediate normal alpha after 'convulsions' should make you rethink the diagnosis."]],
 p:"Long postictal generalized suppression was linked to sudden death in epilepsy (SUDEP) in early work, but later studies disagree; treat it as a warning sign, not a risk score."});
X({t, title:"Drop attacks", stem:"A 28-year-old man with intellectual disability since childhood has many seizure types, including falls and stiffening in sleep. EEG.",
 e:{f:"fast", site:"gen", hz:11, A:50, win:[[3, 7]], bg:"mild", pdr:7, sens:10,
    also:[{f:"gsw", kind:"ssw", win:[[0.2, 2.6], [7.6, 9.8]], hz:2.2, A:110, irr:true}], ev:[[0.1,"Drowsy"],[3.2,"Stiffens, arms up"]]},
 m:[[0.2,2.6,"all","Before","Slow spike-and-wave about 2 Hz"],[3,7,"all","During the stiffening","Generalized paroxysmal fast activity"],[7.6,9.8,"all","After","Slow spike-and-wave again"]],
 l:"Slow (about 2 Hz) generalized sharp-and-slow waves, then a burst of generalized 10–12 Hz fast activity during the stiffening, then slow spike-and-wave again.",
 q:[["What is this?", ["Generalized paroxysmal fast activity (a tonic seizure) between slow spike-and-wave","Muscle artifact only","A typical absence","Photic driving"], "Rhythmic generalized fast activity with stiffening."],
    ["Which syndrome?", ["Lennox–Gastaut syndrome","Juvenile myoclonic epilepsy","Childhood absence epilepsy","Temporal lobe epilepsy"], "Slow spike-and-wave, GPFA, multiple seizure types, cognitive impairment."]],
 p:"LGS persists into adulthood; tonic seizures in sleep are the hallmark."});
X({t, title:"After the seizure", stem:"A 45-year-old woman had a left temporal seizure 20 minutes ago and is still aphasic. Is the seizure still going?",
 e:{f:"slow", site:"T7", A:36, bg:"mild", pdr:7.5, aL:0.5, ev:[[0.1,"20 min after a seizure; aphasic"]]},
 m:[[0.2,9.8,"F7 T7 P7","Left temporal","Irregular delta, no evolution"]],
 l:"Irregular, polymorphic left temporal delta that varies in shape and never builds, speeds up or spreads.",
 q:[["What is it?", ["Postictal left temporal slowing; no ongoing seizure","An ongoing seizure","LPDs","TIRDA"], "Postictal slowing is irregular and gradually fades."],
    ["Why not a seizure?", ["It is irregular, not rhythmic, and doesn't evolve","It is on the left","It is high voltage","It is delta"], "Seizures are rhythmic and evolve."]],
 p:"Postictal slowing helps lateralize the onset side; Todd's deficits usually clear within 48 hours."});
X({t, title:"Rhythm that builds", stem:"A 58-year-old man with a left temporal tumour has LRDA on monitoring. Two pages.",
 e:{dur:20, sens:10, f:"rda", site:[-0.8,0.2], sg:0.44, hz:[[0,1.5],[7,1.6],[10,2.5],[14,3.5],[17,3.8]], sharp:0.4, A:1, amp:[[0,45],[8,50],[14,90],[17,100],[17.2,0]], jit:0.04, bg:"slow", aL:0.6,
    also:[{f:"slow", site:"T7", A:28, win:[[17.3, 21]]}], ev:[[0.1,"Drowsy"]]},
 m:[[0.2,8,"L","Left hemisphere","LRDA 1.5 Hz"],[8,17.2,"L","Watch the rate","Speeds up to 3.5 Hz and grows: seizure"],[17.3,19.8,"Lt","After","Postictal slowing"]],
 l:"Lateralized rhythmic delta at 1.5 Hz speeds up to 3.5 Hz, grows and sharpens over about 9 seconds, then stops with focal slowing.",
 q:[["What is this?", ["LRDA evolving into an electrographic seizure","Stable LRDA","GRDA","Muscle"], "Frequency and amplitude both evolve for over 10 s from the first change."],
    ["Which change makes it a seizure?", ["Definite evolution in frequency and amplitude for at least 10 s","Any rhythmic delta","Being lateralized","Being sharp"], "LRDA on its own is interictal or continuum; evolution makes it ictal."]],
 p:"Compare the first and last seconds of any rhythmic run: if they differ clearly, think evolution."});
X({t, title:"Out of sleep", stem:"A 39-year-old woman with temporal lobe epilepsy on the monitoring unit, asleep. Two pages.",
 e:{dur:20, sens:10, bg:"sleep", sp:[0.9, 2.6], vx:[1.8], f:"sz", site:"T7", on:3.5, off:15, hz:[[3.5,8],[9,6],[13,4],[15,3]], post:26, ev:[[0.1,"Asleep (N2)"],[9,"Eyes open, fumbling"],[15.2,"Confused"]]},
 m:[[0.8,1.7,"C3 C4","Before","Normal spindle"],[3.5,9,"F7 T7 P7","Left temporal","Rhythmic theta starts"],[9,15,"F7 T7","Watch it","Slows and grows"],[15,19.8,"T7","After","Postictal slowing"]],
 l:"After normal N2 sleep (spindle, vertex wave), rhythmic 8 Hz theta starts in the left temporal chain, slows to 3 Hz and grows, then ends with postictal slowing.",
 q:[["What is this?", ["A left temporal seizure arising from sleep","A K-complex with arousal","A normal arousal","A spindle"], "Arousals are brief, diffuse and don't evolve."],
    ["What is the earliest sign?", ["Rhythmic theta building in the left temporal chain","A vertex wave","An eye blink","An EKG change"], "The EEG changes several seconds before any movement."]],
 p:"Focal seizures commonly arise from N1–N2 sleep; REM sleep protects against them."});
X({t, title:"Focal start, big finish", stem:"A 34-year-old man has convulsions; his family says his head turns left first. Two pages.",
 e:{dur:20, sens:10, f:"sz", site:"F4", on:2, off:9, hz:[[2,8],[6,6],[9,5]], A:[[2,0],[3,30],[6,70],[9,100]], gen:7,
    also:[{f:"gtc", on:9, tonic:13, off:18}], ev:[[0.2,"Awake"],[2.5,"Head turns left"],[9,"Stiffens all over"],[13,"Jerking"],[18,"Stops"]]},
 m:[[2,7,"Fp2 F4 C4","Right frontal","Onset at F4"],[7,9,"all","Then everywhere","Spreads to both sides"],[9,18,"all","","Tonic–clonic: muscle hides it"]],
 l:"A rhythmic discharge starts at F4 (right frontal), spreads to both hemispheres, and then muscle artifact from the tonic–clonic phase hides everything.",
 q:[["What is this?", ["A focal (right frontal) seizure that becomes bilateral tonic–clonic","A primary generalized seizure","A functional seizure","Syncope"], "The first seconds are focal."],
    ["Why does the onset matter?", ["It makes this a focal epilepsy, which changes work-up and drug choice","It doesn't","It only changes the dose","It proves a tumour"], "Focal to bilateral tonic–clonic seizures need imaging and may be surgical."]],
 p:"Eyewitness accounts of the first seconds (head turn, aura) are as valuable as the EEG."});
X({t, title:"Breathing hard", stem:"A 19-year-old man is asked to hyperventilate and count. Seizure or not?",
 e:{f:"rda", site:"front", hz:[[0,2.6],[10,2.1]], A:1, amp:[[0,10],[4,60],[10,85]], jit:0.12, ev:[[0.1,"Hyperventilation, 3rd minute"],[0.2,"Counting steadily throughout"]]},
 m:[[3,9.8,"fr","Front, both sides","Smooth rhythmic delta, no spikes"]],
 l:"Smooth, high-voltage rhythmic delta builds gradually, frontally, on both sides, with no spikes, while he keeps counting.",
 q:[["What is this?", ["A normal hyperventilation response","An absence seizure","GRDA from an encephalopathy","A frontal seizure"], "Gradual build-up, no spikes, no change in counting."],
    ["What would make you call an absence instead?", ["Spikes in the bursts and an abrupt stop in counting","Any delta at all","Its frontal position","Its symmetry"], "Absences start and stop abruptly with spike-and-wave."]],
 p:"HV slowing should fade within about a minute of stopping; persistence suggests low glucose or a problem."});
X({t, title:"The aura with no EEG change", stem:"A 33-year-old woman with known left temporal lobe epilepsy presses the event button for her usual rising feeling.",
 e:{bg:"awake", blinks:[1.2], ev:[[0.1,"Awake"],[3,"Presses button: rising feeling"],[8,"Feels fine again"]]},
 m:[[3,8,"Lt","Left temporal","Nothing changes"],[0.3,9.8,"O1 O2","Back of the head","Normal alpha throughout"]],
 l:"Normal alpha and background before, during and after the aura, with no rhythmic or evolving activity anywhere.",
 q:[["What does the EEG show?", ["A normal EEG during the aura","A clear left temporal seizure","Generalized spike-and-wave","Artifact"], "Nothing changes on the scalp."],
    ["Does this rule out a seizure?", ["No: many focal aware seizures don't show on scalp EEG","Yes, always","Yes, if it lasted over 10 seconds","Only in children"], "A small or deep focus may not reach the scalp."]],
 p:"Focal aware seizures (auras) are often invisible on scalp EEG; the history matters."});
})();

/* ================= Tier 5 · Hero: coma, prognosis and rare classics ================= */
(function () {
const {X} = window.EEGLIB, t = 5;
X({t, title:"Day 3 after the arrest", stem:"A 61-year-old man, day 3 after an out-of-hospital cardiac arrest, off sedation for 48 hours, normothermic, with jerks. EEG.",
 e:{f:"bs", same:true, bursts:[[0.7],[3.0],[5.3],[7.6]], jerk:true, bg:"flat", sens:10, ev:[[0.1,"Off sedation 48 h, 37 °C"],[0.75,"Jerk"],[3.05,"Jerk"],[5.35,"Jerk"],[7.65,"Jerk"]]},
 m:[[0.6,1.6,"all","Each burst","Identical burst"],[2.9,3.9,"all","Compare","Same shape, same channels"],[5.2,6.2,"all","",""],[7.5,8.5,"all","",""]],
 l:"Every burst is the same in shape and distribution, regularly spaced out of a flat background, each with a jerk.",
 q:[["What is this?", ["Burst suppression with identical bursts","Normal sleep","A continuous background","GPDs on a normal background"], "Bursts that look copied and pasted."],
    ["How should you use it?", ["As one highly malignant sign within a multimodal assessment","Withdraw care on this alone","Ignore it","Repeat in a year"], "ERC–ESICM: combine EEG with examination, SSEP N20, NSE and imaging; never one test."]],
 p:"Highly malignant patterns after arrest: suppressed background with or without periodic discharges, and burst suppression (identical bursts are especially ominous)."});
X({t, title:"Periodic on flat", stem:"A 55-year-old woman, 72 hours after cardiac arrest, off sedation. EEG.",
 e:{f:"pd", site:"gen", hz:1, m:"sharp", A:80, jit:0.04, bg:"supp", sens:10, ev:[[0.1,"72 h after arrest, off sedation"]]},
 m:[[0.2,9.8,"all","Between the discharges","Suppressed (under 10 µV)"],[0.2,9.8,"all","The discharges","GPDs about 1 Hz"]],
 l:"Generalized periodic sharp discharges about once a second, with near-flat suppression between them.",
 q:[["What is this?", ["GPDs on a suppressed background","Burst suppression","Triphasic waves of liver failure","Normal"], "The background between discharges is under 10 µV."],
    ["After arrest (over 24 h, off sedation), this is:", ["A highly malignant pattern","A favourable pattern","Normal","Artifact"], "It predicts a poor outcome with high specificity, alongside other tests."]],
 p:"The background between the discharges matters as much as the discharges."});
X({t, title:"The good sign", stem:"A 47-year-old man, 12 hours after a witnessed arrest with quick CPR, on light sedation. Name at 5 s, then pain.",
 e:{bg:"slow", pdr:6, react:[5, 7.6], ev:[[0.1,"12 h after arrest, light propofol"],[5,"Name called, nail-bed pressure"]]},
 m:[[0.2,4.9,"all","Before","Continuous theta–delta"],[5,7.7,"all","After the stimulus","Changes: reactive"]],
 l:"A continuous, normal-voltage theta–delta background with no discharges that changes clearly with stimulation.",
 q:[["What is this?", ["A continuous, reactive background","Burst suppression","Suppression","Alpha coma"], "No suppression, no discharges, and it reacts."],
    ["What does it suggest?", ["A good chance of recovery (a favourable sign)","A certain poor outcome","Brain death","Seizures"], "A continuous, reactive background early after arrest predicts good recovery in many studies."]],
 p:"Early continuous normal-voltage EEG is one of the strongest favourable signs after arrest."});
X({t, title:"Alpha, but wrong", stem:"A 66-year-old woman in coma after cardiac arrest. Loud noise and pain at 5 s.",
 e:{f:"acoma", hz:10, A:48, bg:"low", ev:[[0.1,"Comatose"],[5,"Loud noise and pain: no change"]]},
 m:[[0.2,9.8,"fr","Front of the head","Monotonous 10 Hz, frontal"],[4.9,7,"all","After the stimulus","No change: unreactive"]],
 l:"Monotonous 10 Hz activity spread widely and largest frontally, unchanged by noise or pain.",
 q:[["What is this?", ["Alpha coma: monotonous frontal alpha, unreactive","A normal awake PDR","Drug beta","Spindle coma"], "Alpha frequency in a comatose patient, frontal and unreactive."],
    ["How does it differ from a normal PDR?", ["Frontal-predominant, monotonous and unreactive","It is faster","It is posterior","It blocks with eye opening"], "A normal PDR is posterior and blocks with eye opening."]],
 p:"Alpha coma after anoxia usually carries a poor prognosis; with drugs or brainstem lesions it differs. Look for reactivity."});
X({t, title:"Sleep in coma", stem:"A 28-year-old man in coma after a motorbike crash with a brainstem contusion. EEG.",
 e:{f:"spcoma", sp:[1.1, 3.4, 5.9, 8.2], vx:[2.4, 7.1], bg:"coma", dA:18, ev:[[0.1,"Comatose"]]},
 m:[[0.9,1.9,"C3 C4 Cz","Centres","Spindle"],[3.2,4.2,"C3 C4","",""],[5.7,6.7,"C3 C4","",""],[2.2,2.7,"Cz","Vertex","Vertex wave"]],
 l:"Sleep-like spindles and vertex waves on a delta background in a patient who can't be woken.",
 q:[["What is this?", ["Spindle coma","Normal N2 sleep","Burst suppression","Alpha coma"], "Sleep features in someone who can't be woken."],
    ["Prognosis compared with alpha coma?", ["Generally better: thalamocortical circuits are working","Always worse","Brain death","Same as electrocerebral inactivity"], "Spindles need an intact thalamus and cortex."]],
 p:"Preserved sleep architecture in coma is a favourable sign."});
X({t, title:"Jerks with every discharge", stem:"A 58-year-old woman, 18 hours after cardiac arrest, has generalized jerks of the face and limbs. EEG.",
 e:{f:"pd", site:"gen", hz:1, m:"spiky", A:110, jit:0.03, jerk:[0,0.6], bg:"supp", sens:10, ev:[[0.1,"Generalized jerks"]]},
 m:[[0.2,9.8,"all","Each discharge","GPDs, each with a jerk"],[0.2,9.8,"Fp1 Fp2 F3 F4 Fz","Front","Muscle burst locked to each discharge"]],
 l:"Generalized spiky periodic discharges about once a second on a suppressed background, each followed by a muscle burst from the jerk.",
 q:[["What is this?", ["GPDs time-locked to jerks: myoclonic status after anoxia","Lance–Adams syndrome","Normal","Artifact only"], "Early, generalized, time-locked to discharges, on a suppressed background."],
    ["Prognosis, with this background?", ["Usually poor; confirm with other tests","Excellent","Irrelevant","Certain death regardless of tests"], "Some patients with myoclonus and a continuous reactive background recover; the background decides."]],
 p:"Separate the jerks from the background: a continuous, reactive background changes the outlook."});
X({t, title:"Jerks when reaching", stem:"A 44-year-old woman, awake and talking three weeks after an asthma arrest, jerks whenever she reaches for a cup. EEG.",
 e:{f:"spk", site:"mid", kind:"spike", t:[2.1, 2.6, 5.3, 7.8, 8.1], A:70, sg:0.42, ev:[[0.1,"Awake, eyes open"],[2,"Reaches for a cup"],[7.7,"Reaches again"]],
    also:[{f:"jerks", site:[0,0.3], sg:0.6, t:[2.13, 2.63, 5.33, 7.83, 8.13], A:16}], pa:24},
 m:[[1.9,2.9,"C3 Cz C4","Central","Spike before each jerk"],[5.1,5.6,"Cz","",""],[7.6,8.4,"Cz","",""],[0.3,9.8,"O1 O2","Background","Continuous, normal"]],
 l:"A normal continuous background with alpha; with each jerk on reaching, a small central spike appears just before the muscle burst.",
 q:[["What is this?", ["Cortical action myoclonus with a preserved background (Lance–Adams syndrome)","Myoclonic status after anoxia","Normal","Tremor"], "Awake, late, action-triggered, normal background."],
    ["Prognosis?", ["Consciousness is preserved; myoclonus may persist but often improves","Hopeless","Brain death","Same as identical bursts"], "Lance–Adams is chronic post-hypoxic myoclonus in a conscious patient."]],
 p:"Treat with levetiracetam, clonazepam, valproate or piracetam; avoid phenytoin."});
X({t, title:"Eight weeks of decline", stem:"A 62-year-old woman has eight weeks of rapidly worsening memory, unsteadiness and startle jerks. EEG.",
 e:{f:"pd", site:"gen", m:"cjd", hz:1, A:100, jit:0.08, bg:"mild", pa:12, sens:10, ev:[[0.1,"Rapidly progressive dementia"],[5,"Clap: startle jerk"]], also:[{f:"jerks", site:[0,0.3], sg:1.2, t:[5.1], A:28}]},
 m:[[0.2,9.8,"all","Both sides","Periodic sharp wave complexes about 1 Hz"]],
 l:"Generalized biphasic sharp complexes about once a second on a slow background; the clap brings a startle jerk.",
 q:[["What is this?", ["Periodic sharp wave complexes about 1 Hz","Triphasic waves","Burst suppression","Absence status"], "Periodic, generalized, about 1 Hz, in a rapidly progressive dementia."],
    ["Next tests?", ["Diffusion MRI and CSF RT-QuIC","Nothing more","Muscle biopsy","EMG"], "MRI cortical ribboning and basal ganglia changes, and RT-QuIC, are highly sensitive and specific."]],
 p:"Also exclude treatable mimics: autoimmune encephalitis, Hashimoto encephalopathy, NCSE, toxic causes."});
X({t, title:"Every five seconds", stem:"A 19-year-old man who missed childhood vaccines has months of declining schoolwork and drop-like jerks. Two pages.",
 e:{dur:20, sens:15, f:"pd", site:"gen", m:"pslic", hz:0.18, A:230, jit:0.03, t0:1, jerk:[0,0.4], bg:"mild", ev:[[0.1,"Awake, eyes open"]]},
 m:[[1,2.5,"all","Each big complex","Long, high-voltage complex"],[6.5,8,"all","About 5 s later","The same again"],[12,13.5,"all","",""]],
 l:"Very high-voltage, stereotyped slow complexes repeating about every 5–6 seconds, each with a jerk, on a slow background.",
 q:[["What is this?", ["Periodic long-interval complexes every 5–6 seconds","GPDs at 1 Hz","Burst suppression","Generalized spike-and-wave"], "Long intervals (several seconds) and huge, stereotyped complexes."],
    ["Most likely diagnosis?", ["Subacute sclerosing panencephalitis (measles)","Creutzfeldt–Jakob disease","Juvenile myoclonic epilepsy","Hepatic encephalopathy"], "Raised CSF measles antibodies confirm it."]],
 p:"SSPE appears years after measles; vaccination prevents it."});
X({t, title:"Psychosis, then silence", stem:"A 24-year-old woman had a week of psychosis and insomnia, then orofacial dyskinesias; now she barely responds. EEG.",
 e:{f:"edb", hz:1.4, A:70, beta:14, bg:"slow", pa:6, sens:10, ev:[[0.1,"Unresponsive, mouth movements"]]},
 m:[[0.2,9.8,"all","Both sides","Delta with fast activity riding on it"]],
 l:"Continuous generalized rhythmic delta at about 1.4 Hz with bursts of 20–25 Hz beta riding on each delta wave, like a brush.",
 q:[["What is this?", ["Extreme delta brush","Triphasic waves","Drug beta alone","Generalized spike-and-wave"], "Beta 'bristles' on each delta wave."],
    ["Most likely diagnosis?", ["Anti-NMDA receptor encephalitis","Creutzfeldt–Jakob disease","Absence status","Hepatic encephalopathy"], "Screen for an ovarian teratoma and start immunotherapy."]],
 p:"Extreme delta brush is not common but is quite specific for anti-NMDA receptor encephalitis and links to a longer illness."});
X({t, title:"Fever and a strange smell", stem:"A 51-year-old woman has fever, headache and confusion for three days, and smells burning rubber. EEG.",
 e:{f:"pd", site:"T8", sg:0.38, m:"complex", hz:0.6, A:170, jit:0.1, bg:"slow", aR:0.6, sens:10, ev:[[0.1,"Febrile, confused"]]},
 m:[[0.2,9.8,"F8 T8 P8","Right temporal","Complex periodic discharges every ~1.7 s"]],
 l:"Complex sharp discharges every 1.5–2 seconds over the right temporal region, on a slow background.",
 q:[["What is this?", ["Right temporal periodic discharges (LPDs)","Sporadic right temporal spikes","GPDs","Breach rhythm"], "Periodic and right temporal."],
    ["What do you start now?", ["IV acyclovir","Steroids alone","Nothing until the PCR","An antifungal"], "Treat suspected HSV encephalitis immediately."]],
 p:"Olfactory auras, fever and temporal PDs: HSV until proven otherwise."});
X({t, title:"Blind and seizing", stem:"A 34-year-old woman on tacrolimus after a kidney transplant has a blood pressure of 210/120, headache and blurred vision, then a seizure. EEG.",
 e:{f:"pd", site:"post", m:"sharp", hz:0.8, A:110, jit:0.12, bg:"slow", sens:10, ev:[[0.1,"Drowsy, can't see the fingers"]]},
 m:[[0.2,9.8,"O1 O2 P3 P4 P7 P8","Back of the head","Periodic sharp waves, both sides, posterior"]],
 l:"Periodic sharp waves over both occipital-parietal regions on a slow background, with no normal alpha.",
 q:[["What is this?", ["Bilateral posterior periodic sharp waves","Normal POSTS","Lambda waves","Photic driving"], "POSTS belong to sleep and lambda to visual scanning; these are periodic in an ill patient."],
    ["Most likely diagnosis?", ["PRES (posterior reversible encephalopathy syndrome)","Creutzfeldt–Jakob disease","Absence epilepsy","Migraine aura"], "Hypertension, calcineurin inhibitor, posterior oedema and seizures."]],
 p:"Control blood pressure, reduce or switch the trigger, and treat seizures; usually reversible."});
X({t, title:"The mood stabilizer", stem:"A 57-year-old man on lithium for bipolar disorder started an ACE inhibitor; now he is tremulous, ataxic and confused. EEG.",
 e:{f:"pd", site:"front", m:"tri", hz:1.5, A:105, bg:"slow", pdr:5.5, sens:10, ev:[[0.1,"Confused, coarse tremor"]]},
 m:[[0.2,9.8,"all","Everywhere, front first","Triphasic GPDs with diffuse slowing"]],
 l:"Generalized triphasic discharges at about 1.5 Hz, frontally maximal, on a diffusely slow background.",
 q:[["What is this?", ["Triphasic GPDs with diffuse slowing","Absence status","Normal","LPDs"], "Generalized, periodic, triphasic."],
    ["What next?", ["Check the lithium level, stop it and consider dialysis","Increase the lithium","Add carbamazepine","MRI only"], "ACE inhibitors raise lithium levels; neurotoxicity can occur even at 'normal' levels."]],
 p:"Drug causes of triphasic waves: lithium, cefepime, baclofen, ifosfamide, valproate (through ammonia)."});
X({t, title:"New drug, new confusion", stem:"A 33-year-old man with epilepsy started valproate two weeks ago. He is vomiting and confused; liver tests are normal. EEG.",
 e:{f:"pd", site:"front", m:"tri", hz:1.7, A:100, bg:"slow", pdr:6, sens:10, ev:[[0.1,"Drowsy, vomiting"]]},
 m:[[0.2,9.8,"all","Everywhere","Triphasic GPDs with slowing"]],
 l:"Generalized triphasic discharges at about 1.7 Hz on a slow background.",
 q:[["What is this?", ["Triphasic GPDs with diffuse slowing","Absence status","Normal","LPDs"], "Generalized, periodic and triphasic."],
    ["What do you check first?", ["Serum ammonia","Nothing: valproate can't do this","Troponin","Thyroid function"], "Valproate can cause hyperammonaemic encephalopathy with normal liver tests."]],
 p:"Treat by stopping valproate; L-carnitine may help."});
X({t, title:"Flat, but on barbiturates", stem:"A 31-year-old woman had a pentobarbital coma for refractory status, stopped 12 hours ago. EEG at 2 µV/mm.",
 e:{bg:"flat", sens:2, hr:{rate:104, k:0.6}, ev:[[0.1,"2 µV/mm; pentobarbital stopped 12 h ago"],[5,"Noise and pain: no change"]], also:[{f:"art", e:"T7", hz:0.28, A:6}]},
 m:[[0.2,9.8,"all","Everywhere","No cerebral activity over 2 µV"],[0.2,9.8,"EKG","EKG","Only EKG and ventilator"]],
 l:"At 2 µV/mm there is no cerebral activity: only EKG blips and a slow ventilator swing at one electrode, unchanged by stimulation.",
 q:[["What does the page show?", ["Electrocerebral inactivity","Burst suppression","Normal low voltage","Alpha coma"], "Nothing cerebral at maximal sensitivity."],
    ["Can it support brain death now?", ["No: barbiturates confound it until levels are cleared","Yes, immediately","Yes, if repeated once","Only in children"], "Sedatives, hypothermia and metabolic problems must be excluded first."]],
 p:"Pentobarbital lasts days; check a level or use a blood-flow study (the 2023 US guideline accepts only blood-flow studies as ancillary tests)."});
X({t, title:"Beta on one side only", stem:"A 60-year-old man on clonazepam has a new left frontal glioma. EEG.",
 e:{bg:"awake", pa:22, f:"beta", side:"R", A:12, ev:[[0.1,"Awake, eyes closed"]]},
 m:[[0.2,9.8,"Rp F4 F8","Right","Drug beta"],[0.2,9.8,"Lp F3 F7","Left","Beta missing"]],
 l:"Abundant 15–25 Hz beta over the right frontocentral region, with little beta on the left.",
 q:[["What is this?", ["Drug beta on the right only: absent beta on the left","Normal symmetry","A right-sided breach","A left-sided seizure"], "The drug effect should be symmetric."],
    ["Absent beta on one side suggests:", ["Cortical dysfunction (or a collection) on that side","Better function on that side","A normal variant","A drug overdose"], "Injured cortex can't generate drug beta."]],
 p:"A one-sided loss of drug beta can be the only clue to a lesion."});
X({t, title:"One side won't block", stem:"A 67-year-old woman with a recent left parietal infarct. Eyes closed, open at 3 s, closed at 7 s.",
 e:{bg:"awake", aL:0, eo:[[3, 7]], f:"alpha1", side:"L", hz:9, A:34, ev:[[0.1,"Eyes closed"],[3,"Eyes open"],[7,"Eyes closed"]]},
 m:[[3.2,6.9,"O1 P3 P7","Left posterior","Alpha keeps going: fails to block"],[3.2,6.9,"O2 P4","Right posterior","Blocks normally"]],
 l:"With the eyes open, the right alpha disappears, but the left alpha keeps running.",
 q:[["What is this?", ["The left alpha fails to block with eye opening (Bancaud phenomenon)","Normal reactive alpha","A right occipital lesion","Drowsiness"], "Only one side reacts."],
    ["Which side is the lesion on?", ["Left: the side that fails to block","Right","Both","Neither: it is normal"], "Failure of reactivity is ipsilateral to the lesion."]],
 p:"Always compare reactivity on both sides, not only amplitude."});
X({t, title:"After two hours of convulsions", stem:"A 50-year-old man had two hours of convulsions treated in the ED. He no longer convulses, but his eyes make small jerks. EEG.",
 e:{f:"pd", site:"gen", m:"spiky", hz:1.6, A:90, jit:0.05, bg:"coma", dA:10, sens:10, ev:[[0.1,"Intubated, small eye jerks"]], also:[{f:"jerks", site:[0,1.2], sg:0.3, t:[1.2, 3.1, 4.9, 6.8, 8.6], A:16}]},
 m:[[0.2,9.8,"all","Everywhere","GPDs about 1.5 Hz"],[0.2,9.8,"Fp1 Fp2","Eyes","Small eye jerks"]],
 l:"Generalized spiky periodic discharges at about 1.6 Hz on a low background, with subtle eye-jerk artifact.",
 q:[["What is this?", ["Periodic discharges at the late stage of convulsive status (subtle status)","Recovery","Burst suppression","Alpha coma"], "Prolonged convulsive status evolves into periodic discharges with subtle or no motor signs."],
    ["Management?", ["Treat as ongoing status: escalate (often an anaesthetic infusion) with continuous EEG","Extubate","Stop all drugs","Wait 24 hours"], "Subtle status carries high mortality; don't stop at the end of the convulsions."]],
 p:"About one in seven patients remain in nonconvulsive status after convulsions stop."});
X({t, title:"The overdose", stem:"A 26-year-old woman found unresponsive after a large benzodiazepine and barbiturate overdose. EEG.",
 e:{bg:"low", f:"beta", A:22, ev:[[0.1,"Comatose, intubated"]], also:[{f:"slow", site:"gen", A:12}]},
 m:[[0.2,9.8,"fr Lp Rp","Front and centre","High-voltage generalized beta"]],
 l:"Abundant, high-voltage 15–25 Hz beta everywhere, largest frontally, with some underlying delta, in a comatose patient.",
 q:[["What is this?", ["Beta coma (excess generalized beta in coma)","Alpha coma","Spindle coma","Burst suppression"], "Fast frequencies dominate in a comatose patient."],
    ["Most likely cause?", ["Sedative drug intoxication","Anoxic injury","Creutzfeldt–Jakob disease","Absence status"], "Benzodiazepines and barbiturates produce beta coma, usually with a good outcome."]],
 p:"Never prognosticate in intoxication; deep drug coma can even look like burst suppression or ECI."});
X({t, title:"The final boss", stem:"A 72-year-old man with a left frontal haemorrhage develops right face twitching. Read both pages fully.",
 e:{dur:20, sens:10, f:"pd", site:"Lh", m:"spiky", hz:[[0,1.2],[8,1.3],[11,2.6],[15,3.2],[17,3.3]], Aev:[[0,0.8],[9,0.8],[14,1.2],[17,1.3]], plusF:10, t1:17.1, jerk:"F8", bg:"slow", aL:0.5,
    also:[{f:"slow", site:"T7", A:28, win:[[17.2, 21]]}], ev:[[0.1,"Drowsy; right face twitching"]]},
 m:[[0.2,8,"L","Left hemisphere","LPDs+F about 1.2 Hz"],[0.2,17,"Fp2 F8","Right face muscles","Twitch locked to each discharge"],[8,17.1,"L","Watch the rate","Evolves past 2.5 Hz: seizure"],[17.2,19.8,"Lt","After","Postictal slowing"]],
 l:"Left LPDs with fast activity (+F), each followed by a right face twitch; then they speed up past 2.5 Hz and grow before stopping with postictal slowing.",
 q:[["What is this?", ["LPDs+F evolving into an electroclinical seizure","Stable LPDs","GRDA","Muscle artifact"], "Plus features, a time-locked clinical sign and evolution."],
    ["Next step?", ["Treat the seizure: IV benzodiazepine, a second-line drug, and continuous EEG","Observe","MRI only","Stop all drugs"], "An electroclinical seizure in an acute haemorrhage needs prompt treatment."]],
 p:"Put it together: background, the periodic pattern, plus features, clinical correlate, evolution. That is the whole hero read."});
})();
