/* CT scans: one opened cut (a series of 1mm slices), decoded in the background.

   Slices are read from the disk and decoded by a few workers (decode-worker.js),
   the ones nearest the slice on screen first, so a study shows within a moment
   and the rest follows. Each decoded slice is kept as CT numbers, so changing the
   window (Brain, Bone …) is instant. Slice 1 is the lowest one (skull base). */

const MAX_WORKERS = 4;
const KEEP_SERIES = 4; // series kept decoded (each is ~200 MB at 100%, ~50 MB at 50%)

const workers = [];
const idle = [];
const open = []; // series still loading, the one looked at most recently first
const cache = new Map(); // cut key → Series, oldest first
let nextId = 1;
const pending = new Map(); // job id → { resolve, reject }

function startWorkers() {
  if (workers.length) return;
  const count = Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 4) - 1));
  for (let i = 0; i < count; i++) {
    const w = new Worker(new URL('./decode-worker.js', import.meta.url));
    w.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) job?.reject(new Error(data.error));
      else job?.resolve(data);
      idle.push(w);
      pump();
    };
    w.onerror = (event) => console.error('CT decoder', event.message);
    workers.push(w);
    idle.push(w);
  }
}

function decode(worker, buf) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, buf }, [buf]);
  });
}

/** Give each free worker the most wanted slice. */
function pump() {
  while (idle.length) {
    const series = open.find((s) => s.nextToLoad() >= 0);
    if (!series) return;
    const worker = idle.pop();
    series.loadOne(worker, series.nextToLoad());
  }
}

export class Series {
  constructor(key, cut) {
    this.key = key;
    this.cut = cut;
    this.n = cut.files.length;
    this.slices = new Array(this.n).fill(null); // by file
    this.busy = new Set(); // files being read or decoded
    this.order = Array.from({ length: this.n }, (_, i) => i); // slice on screen → file
    this.loaded = 0;
    this.failed = 0;
    this.want = Math.floor(this.n / 2); // the slice on screen
    this.listeners = new Set();
    this.error = '';
    this.firstEnds = [0, this.n - 1]; // the two ends first: they show which way is up
  }

  get done() { return this.loaded + this.failed >= this.n; }

  /** The file of slice i (on screen order). */
  slice(i) { return this.slices[this.order[i]]; }

  /** The nearest decoded slice to i, for showing while i loads. */
  nearestLoaded(i) {
    for (let d = 0; d < this.n; d++) {
      if (this.slice(i - d)) return this.slice(i - d);
      if (this.slice(i + d)) return this.slice(i + d);
    }
    return null;
  }

  /** Height in the head (mm) of slice i; estimated from the two ends until it is loaded. */
  z(i) {
    const s = this.slice(i);
    if (s) return s.z;
    const lo = this.slice(0);
    const hi = this.slice(this.n - 1);
    if (lo && hi && this.n > 1) return lo.z + (hi.z - lo.z) * i / (this.n - 1);
    return i * 0.5;
  }

  /** The slice nearest height z (mm). */
  nearest(z) {
    let lo = 0;
    let hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.z(mid) < z) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(this.z(lo - 1) - z) <= Math.abs(this.z(lo) - z)) lo--;
    return lo;
  }

  /** The slice on screen moved: load around it next, and treat this series as the one in view. */
  focus(i) {
    this.want = Math.max(0, Math.min(this.n - 1, i));
    const at = open.indexOf(this);
    if (at > 0) { open.splice(at, 1); open.unshift(this); }
    pump();
  }

  nextToLoad() {
    const free = (f) => f >= 0 && f < this.n && !this.slices[f] && !this.busy.has(f) && !this.bad?.has(f);
    for (const f of this.firstEnds) if (free(f)) return f;
    for (let d = 0; d < this.n; d++) {
      for (const i of d ? [this.want + d, this.want - d] : [this.want]) {
        if (i >= 0 && i < this.n && free(this.order[i])) return this.order[i];
      }
    }
    return -1;
  }

  async loadOne(worker, f) {
    this.busy.add(f);
    let buf;
    try {
      buf = await this.cut.files[f].read();
    } catch (err) {
      this.busy.delete(f);
      this.fail(f, err);
      idle.push(worker);
      pump();
      return;
    }
    try {
      const s = await decode(worker, buf);
      this.slices[f] = { z: s.z, rows: s.rows, cols: s.cols, spacing: s.spacing, thickness: s.thickness, desc: s.desc, hu: s.hu };
      this.loaded++;
      this.settle(f);
    } catch (err) {
      this.fail(f, err);
    } finally {
      this.busy.delete(f);
    }
    this.tell();
  }

  fail(f, err) {
    (this.bad ??= new Set()).add(f);
    this.failed++;
    if (!this.error) this.error = err.message || String(err);
    console.warn('CT slice', this.cut.files[f]?.name, err);
    if (this.done) this.finish();
    this.tell();
  }

  /** Once both ends are in, slice 1 is the lowest; once all are in, sort by height exactly. */
  settle(f) {
    const first = this.slices[0];
    const last = this.slices[this.n - 1];
    if ((f === 0 || f === this.n - 1) && first && last && first.z > last.z && this.order[0] === 0) {
      this.order.reverse();
      this.want = this.n - 1 - this.want;
      this.flips = (this.flips ?? 0) + 1; // panes showing it turn their slice number round too
    }
    if (this.done) this.finish();
  }

  finish() {
    const z = (f) => this.slices[f]?.z ?? Infinity;
    const sorted = [...this.order].sort((a, b) => z(a) - z(b));
    if (sorted.some((f, i) => f !== this.order[i])) this.order = sorted;
    const at = open.indexOf(this);
    if (at >= 0) open.splice(at, 1);
  }

  tell() { this.listeners.forEach((fn) => fn(this)); }
}

/** The series for a cut, decoded or decoding (kept for a few cuts, so going back is instant). */
export function openSeries(key, cut) {
  startWorkers();
  let s = cache.get(key);
  if (s) {
    cache.delete(key);
  } else {
    s = new Series(key, cut);
    if (!s.n) s.error = 'No slices in this folder';
    else open.unshift(s);
  }
  cache.set(key, s);
  for (const [k, old] of cache) {
    if (cache.size <= KEEP_SERIES) break;
    if (old.listeners.size) continue; // on screen
    cache.delete(k);
    const at = open.indexOf(old);
    if (at >= 0) open.splice(at, 1);
  }
  pump();
  return s;
}

/** Drop every decoded series (the folder changed). */
export function forgetSeries() {
  cache.clear();
  open.length = 0;
}
