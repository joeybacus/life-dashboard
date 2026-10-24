/* CT scans on a patient's page: the patient's downloaded Cranial CT studies
   (from CT_Downloads on this computer, folder.js), viewed in one or two panes.

   Scroll a scan with the mouse wheel, by dragging up and down on it, with the
   slider, or with ↑ ↓ (PgUp / PgDn = 10, Home / End, Space = play) while the
   pointer is over the viewer. ← → stay with the page (previous / next patient).
   "Link" keeps both panes at the same level of the head; "Plain | Contrast" and
   "Compare older" set up the usual pairs. The window buttons (Brain, Subdural,
   Stroke, Soft, Bone) change the picture at once — every slice is kept as CT
   numbers. Your choices (panes, window, quality, link) are remembered on this
   device.

   Like the notes box, the viewer is one real element kept between the page's
   redraws (it redraws often while the logsheet syncs): the page draws ctSlot()
   and calls mountCt(); keepCt() takes it out before a redraw.

   Duty Patients mounts it with mode 'duty': three columns side by side — the
   plain CT, the contrast CT (of the newest study that has each) and chest
   X-rays (not available yet).

   For looking at the downloaded scans, not a diagnostic workstation. */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { toast } from '../../core/ui.js';
import {
  allowFolder, canRemember, chooseFolder, folderState, hnFolder, patientStudies, rescan, restoreFolder,
} from './folder.js';
import { forgetSeries, openSeries } from './series.js';

const PREFS_KEY = 'ld.ctViewer';
const WHEEL_STEP = 40; // wheel distance per slice (trackpads send many small steps)
const DRAG_STEP = 4;   // pixels of drag per slice
const PRESETS = {
  brain: { label: 'Brain', centre: 40, width: 80 },
  subdural: { label: 'Subdural', centre: 75, width: 215 },
  stroke: { label: 'Stroke', centre: 35, width: 40 },
  soft: { label: 'Soft', centre: 40, width: 350 },
  bone: { label: 'Bone', centre: 600, width: 2800 },
};
const KIND_LABEL = { plain: 'Plain 1mm', contrast: 'Contrast 1mm' };

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      layout: p.layout === 1 ? 1 : 2,
      preset: PRESETS[p.preset] ? p.preset : 'brain',
      quality: p.quality === 50 || p.quality === 75 ? p.quality : 100,
      linked: p.linked !== false,
      fps: [5, 10, 15, 20, 30].includes(p.fps) ? p.fps : 15,
    };
  } catch {
    return { layout: 2, preset: 'brain', quality: 100, linked: true, fps: 15 };
  }
}

const V = {
  el: null,       // the viewer's box
  hn: '',         // whose scans (folder name)
  studies: null,  // null while looking, [] when none
  error: '',
  built: null,    // the studies the panes were made for
  seen: false,    // scrolled into view (only then are scans read)
  active: 0,
  playing: null,
  panes: [],
  mode: 'ward',   // 'duty': plain | contrast | CXR in three columns
  ...loadPrefs(),
};

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ layout: V.layout, preset: V.preset, quality: V.quality, linked: V.linked, fps: V.fps }));
  } catch { /* storage unavailable */ }
}

/* ---------- Mounting ---------- */

/** Where the viewer goes on a patient's page. */
export const ctSlot = () => html`<div class="ctv-slot" data-ct-slot></div>`;

function makeBox() {
  const box = document.createElement('section');
  box.className = 'ctv';
  box.setAttribute('aria-labelledby', 'ctv-title');
  box.innerHTML = String(html`
    <div class="ctv__head">
      <h2 class="ctv__title" id="ctv-title">${icon('image')}<span>CT scans</span></h2>
      <span class="ctv__count"></span>
      <span class="ctv__acts"></span>
    </div>
    <div class="ctv__body"></div>
    <input type="file" class="ctv__picker" webkitdirectory multiple hidden aria-hidden="true" tabindex="-1">
    <p class="ctv__hint">${icon('lock')}<span>Read from this computer only — never uploaded. For viewing the downloaded scans, not for diagnosis.</span></p>`);
  box.addEventListener('click', onClick);
  box.addEventListener('change', onChange);
  box.querySelector('.ctv__picker').addEventListener('change', async (event) => {
    if (await chooseFolder(event.target)) toast(`Using ${folderState().name} on this computer.`, { icon: 'image' });
    event.target.value = '';
  });
  // Scans are only read once the viewer scrolls into sight
  V.io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !V.seen) {
      V.seen = true;
      startPanes();
    }
  }, { rootMargin: '200px' });
  V.io.observe(box);
  return box;
}

/** Put the viewer into a page's slot, showing this patient's scans ('duty': in three columns). */
export function mountCt(root, { hn, mode = 'ward' } = {}) {
  const slot = root?.querySelector('[data-ct-slot]');
  if (!slot) return;
  if (!V.el) {
    V.el = makeBox();
    restoreFolder();
  }
  slot.replaceWith(V.el);
  const key = hnFolder(hn);
  if (mode !== V.mode) {
    V.mode = mode;
    V.el.querySelector('.ctv__title span').textContent = mode === 'duty' ? 'Imaging' : 'CT scans';
    if (key === V.hn) setPatient(key); // the panes are made again for the other layout
  }
  if (key !== V.hn) setPatient(key);
}

/** How many panes show: Duty Patients always has plain and contrast. */
const paneCount = () => (V.mode === 'duty' ? 2 : V.layout);

/** Take the viewer out of a page before it redraws, so it goes back in untouched. */
export function keepCt(root) {
  if (V.el && root?.contains(V.el)) V.el.remove();
}

/** The patient's page closed: stop playing. */
export function ctClosed() {
  stopPlay();
}

/* ---------- The patient and their studies ---------- */

function setPatient(hn) {
  stopPlay();
  V.hn = hn;
  V.studies = null;
  V.error = '';
  V.built = null;
  V.seen = false;
  V.panes.forEach(detach);
  if (V.io && V.el) { V.io.unobserve(V.el); V.io.observe(V.el); } // checks again whether it's in sight
  render();
  listStudies();
}

async function listStudies() {
  const hn = V.hn;
  if (folderState().state !== 'ready' || !hn) { render(); return; }
  try {
    const studies = await patientStudies(hn);
    if (hn !== V.hn) return;
    V.studies = studies;
  } catch (err) {
    if (hn !== V.hn) return;
    V.studies = [];
    V.error = err.name === 'NotAllowedError' ? 'The browser no longer lets the app read the folder.' : err.message;
  }
  render();
}

on('ct', () => {
  forgetSeries();
  V.studies = null;
  V.built = null;
  V.panes.forEach(detach);
  if (V.el) { render(); listStudies(); }
});

/* ---------- Drawing the box ---------- */

const studyName = (s) => `${s.date} ${s.time} · ${s.type}`;

function render() {
  if (!V.el) return;
  const body = V.el.querySelector('.ctv__body');
  const count = V.el.querySelector('.ctv__count');
  const acts = V.el.querySelector('.ctv__acts');
  const { state, name } = folderState();
  count.textContent = state === 'ready' && V.studies?.length ? `${V.studies.length} ${V.studies.length === 1 ? 'study' : 'studies'} · ${name}` : '';
  acts.innerHTML = state === 'ready' ? String(html`
    <button type="button" class="btn btn--sm btn--ghost" data-ct="rescan" title="Look for new downloads">${icon('refresh')}<span class="sr-only">Look for new downloads</span></button>
    <button type="button" class="btn btn--sm btn--ghost" data-ct="choose">${icon('image')}Change folder</button>`) : '';
  if (state === 'none' && !canRemember && window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches) {
    body.innerHTML = String(html`<p class="faint">CT scans open on your Mac, from the CT_Downloads folder there.</p>`);
    return;
  }
  if (state === 'none') {
    stopPlay();
    body.innerHTML = String(html`<div class="ctv__setup">
      <p>See this patient’s CT scans here, straight from the <b>CT_Downloads</b> folder on this computer (where ct_download.py saves them). The scans stay on this computer — nothing is uploaded.</p>
      <button type="button" class="btn btn--accent" data-ct="choose">${icon('image')}Choose the CT_Downloads folder</button>
      <p class="faint">${canRemember
        ? 'The browser asks once whether the app may view the folder. It remembers the folder on this computer.'
        : 'In this browser the folder is chosen again each time the app opens. Chrome or Edge can remember it. The browser may say “upload” — the files are only read here, not sent anywhere.'}</p>
    </div>`);
    return;
  }
  if (state === 'ask') {
    stopPlay();
    body.innerHTML = String(html`<div class="ctv__setup">
      <p>The browser needs your OK again to read <b>${name}</b> on this computer.</p>
      <button type="button" class="btn btn--accent" data-ct="allow">${icon('check')}Allow access to ${name}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-ct="choose">Choose another folder</button>
    </div>`);
    return;
  }
  if (!V.hn) { body.innerHTML = String(html`<p class="faint">This patient has no hospital number, so their scans can’t be found.</p>`); return; }
  if (V.studies == null) { body.innerHTML = String(html`<p class="faint">Looking for scans…</p>`); return; }
  if (V.error) { body.innerHTML = String(html`<p class="faint">${V.error} Choose the folder again to carry on.</p>`); return; }
  if (!V.studies.length) {
    stopPlay();
    body.innerHTML = String(html`<p class="faint">No downloaded CT for HN ${V.hn} in ${name}. Download them with ct_download.py, then tap ${icon('refresh')}.</p>`);
    return;
  }
  if (V.built !== V.studies) buildViewer(body);
}

function chip(attr, value, label, on, title = '') {
  return html`<button type="button" class="chip-toggle" data-ct="${attr}" data-v="${value}" aria-pressed="${on ? 'true' : 'false'}"${title ? html` title="${title}"` : ''}>${label}</button>`;
}

function toolbar() {
  const qualities = [...new Set(V.studies.flatMap((s) => s.cuts.map((c) => c.quality)))].sort((a, b) => b - a);
  const pairs = V.studies.some((s) => s.cuts.some((c) => c.kind === 'contrast') && s.cuts.some((c) => c.kind === 'plain'));
  const duty = V.mode === 'duty';
  return html`<div class="ctv__tools">
    ${duty ? '' : html`<span class="chips chips--sm" role="group" aria-label="Panes">${chip('layout', 1, '1 pane', V.layout === 1)}${chip('layout', 2, '2 panes', V.layout === 2)}</span>`}
    <span class="chips chips--sm" role="group" aria-label="Window">${Object.entries(PRESETS).map(([k, p]) => chip('preset', k, p.label, V.preset === k, `Width ${p.width} · Level ${p.centre}`))}</span>
    ${qualities.length > 1 ? html`<span class="chips chips--sm" role="group" aria-label="Quality">${qualities.map((q) => chip('quality', q, q === 100 ? 'Full' : `${q}%`, V.quality === q, q === 100 ? 'Synapse’s original slices' : `The ${q}% downloads: smaller, quicker to open`))}</span>` : ''}
    <span class="ctv__more">
      ${pairs && !duty ? html`<button type="button" class="btn btn--sm" data-ct="pair" title="Plain and contrast of the study in the active pane, side by side">Plain | Contrast</button>` : ''}
      ${V.studies.length > 1 && !duty ? html`<button type="button" class="btn btn--sm" data-ct="older" title="The study before the active one, side by side">Compare older</button>` : ''}
      ${chip('link', 1, html`${icon('link')}Link`, V.linked, 'Scroll both panes together, at the same level of the head')}
      <button type="button" class="btn btn--sm" data-ct="play" aria-pressed="false">${icon('play')}Play</button>
    </span>
  </div>`;
}

const DUTY_LABEL = ['CT · Plain', 'CT · With contrast'];

function paneHtml(i) {
  return html`<div class="ctv-pane" data-pane="${i}">
    ${V.mode === 'duty' ? html`<h3 class="ctv-pane__label">${DUTY_LABEL[i]}</h3>` : ''}
    <div class="ctv-pane__bar">
      <select class="input ctv-pane__study" data-pick="study" aria-label="Study in pane ${i + 1}">${V.studies.map((s) => html`<option value="${s.folder}">${studyName(s)}</option>`)}</select>
      <select class="input ctv-pane__cut" data-pick="cut" aria-label="Series in pane ${i + 1}"></select>
    </div>
    <div class="ctv-pane__view" tabindex="0" aria-label="Scan in pane ${i + 1}: scroll, drag, or use the up and down arrows">
      <canvas></canvas>
      <div class="ctv-ov ctv-ov--tl"></div><div class="ctv-ov ctv-ov--tr"></div>
      <div class="ctv-ov ctv-ov--bl"></div><div class="ctv-ov ctv-ov--br"></div>
      <div class="ctv-ov ctv-ov--mid">Scroll down to load</div>
      <div class="ctv-pane__load"></div>
    </div>
    <input type="range" class="ctv-pane__slider" min="0" max="0" value="0" aria-label="Slice in pane ${i + 1}">
  </div>`;
}

function buildViewer(body) {
  stopPlay();
  V.panes.forEach(detach);
  const cxr = html`<div class="ctv-pane ctv-pane--soon">
    <h3 class="ctv-pane__label">Chest X-ray</h3>
    <div class="ctv-soon">${icon('image')}<p>CXR viewer</p><span class="badge">Coming in a future update</span></div>
  </div>`;
  body.innerHTML = String(html`${toolbar()}<div class="ctv__grid ${V.mode === 'duty' ? 'ctv__grid--duty' : `ctv__grid--${V.layout}`}">${[0, 1].map(paneHtml)}${V.mode === 'duty' ? cxr : ''}</div>
    <p class="ctv__keys faint">Scroll: mouse wheel or drag on a scan, the slider, or ↑ ↓ (PgUp / PgDn = 10, Home / End). Space = play. Click a pane to make it lead.</p>`);
  V.built = V.studies;
  V.panes = [0, 1].map((i) => makePane(i, body.querySelector(`[data-pane="${i}"]`)));
  showLayout();
  setActive(0);
  if (!V.seen && inView()) V.seen = true;
  if (V.seen) startPanes();
}

/** Whether the box is on screen now (or nearly), for when the observer hasn't said yet. */
function inView() {
  const r = V.el?.isConnected ? V.el.getBoundingClientRect() : null;
  return !!r && r.bottom > -200 && r.top < window.innerHeight + 200 && r.width > 0;
}

/* ---------- Panes ---------- */

function makePane(i, el) {
  const q = (s) => el.querySelector(s);
  const p = {
    i, el, study: null, kind: 'plain', series: null, listener: null, cur: 0, off: 0, flips: 0,
    alignLater: false, drawn: null, image: null, wheel: 0,
    studySel: q('[data-pick="study"]'), cutSel: q('[data-pick="cut"]'), view: q('.ctv-pane__view'),
    canvas: q('canvas'), tl: q('.ctv-ov--tl'), tr: q('.ctv-ov--tr'), bl: q('.ctv-ov--bl'), br: q('.ctv-ov--br'),
    mid: q('.ctv-ov--mid'), load: q('.ctv-pane__load'), slider: q('.ctv-pane__slider'),
  };
  p.ctx = p.canvas.getContext('2d');
  el.addEventListener('pointerdown', () => setActive(i), true);
  el.addEventListener('focusin', () => setActive(i));
  p.slider.addEventListener('input', () => setIndex(p, Number(p.slider.value), true));
  p.view.addEventListener('wheel', (event) => {
    if (!p.series) return;
    event.preventDefault();
    p.wheel += event.deltaMode === 1 ? event.deltaY * WHEEL_STEP : event.deltaY;
    const steps = Math.trunc(p.wheel / WHEEL_STEP);
    if (steps) { p.wheel -= steps * WHEEL_STEP; setIndex(p, p.cur + steps, true); }
  }, { passive: false });
  let dragY = null;
  let dragAcc = 0;
  p.view.addEventListener('pointerdown', (event) => {
    dragY = event.clientY; dragAcc = 0;
    p.view.setPointerCapture(event.pointerId);
  });
  p.view.addEventListener('pointermove', (event) => {
    if (dragY == null || !p.series) return;
    dragAcc += event.clientY - dragY;
    dragY = event.clientY;
    const steps = Math.trunc(dragAcc / DRAG_STEP);
    if (steps) { dragAcc -= steps * DRAG_STEP; setIndex(p, p.cur + steps, true); }
  });
  const endDrag = () => { dragY = null; };
  p.view.addEventListener('pointerup', endDrag);
  p.view.addEventListener('pointercancel', endDrag);
  return p;
}

const visible = () => V.panes.slice(0, paneCount());
const findStudy = (folder) => V.studies?.find((s) => s.folder === folder) ?? null;
const sameStudy = (a, b) => a.study && b.study && a.study.folder === b.study.folder;

/** The study's plain or contrast cut at the chosen quality (else the full one, else any). */
function cutFor(study, kind) {
  const same = study.cuts.filter((c) => c.kind === kind);
  const pool = same.length ? same : study.cuts;
  return pool.find((c) => c.quality === V.quality) ?? pool.find((c) => c.quality === 100) ?? pool[0];
}

function fillCuts(p) {
  const kinds = [...new Set(p.study.cuts.map((c) => c.kind))];
  p.cutSel.innerHTML = String(html`${kinds.map((k) => html`<option value="${k}">${KIND_LABEL[k] ?? k}</option>`)}`);
  if (!kinds.includes(p.kind)) p.kind = kinds[0];
  p.cutSel.value = p.kind;
}

function detach(p) {
  if (p.series && p.listener) p.series.listeners.delete(p.listener);
  p.series = null;
  p.listener = null;
}

/** Show `kind` of `study` in pane p. */
function choose(p, study, kind) {
  if (!study) return;
  p.none = false;
  p.study = study;
  p.kind = kind;
  p.studySel.value = study.folder;
  fillCuts(p);
  openCut(p);
}

function openCut(p, keepZ = null) {
  const cut = cutFor(p.study, p.kind);
  const key = `${V.hn}/${p.study.folder}/${cut.name}`;
  if (p.series?.key === key) { overlay(p); return; }
  detach(p);
  p.cut = cut;
  p.series = openSeries(key, cut);
  p.flips = p.series.flips ?? 0;
  p.listener = () => onSeries(p);
  p.series.listeners.add(p.listener);
  p.slider.max = Math.max(0, p.series.n - 1);
  p.drawn = null;
  p.alignLater = false;
  const lead = V.panes[V.active];
  const ends = (s) => s.slice(0) && s.slice(s.n - 1);
  let start = Math.floor(p.series.n / 2);
  if (keepZ != null) {
    // Same study at another quality: stay at the same level (once its heights are known)
    if (ends(p.series)) start = p.series.nearest(keepZ);
    else { p.keepZ = keepZ; start = Math.min(p.cur, p.series.n - 1); }
  } else if (V.linked && lead && lead !== p && lead.series && visible().includes(lead)) {
    if (ends(p.series) && ends(lead.series)) { align(p, lead); start = p.cur; }
    else { p.alignLater = true; start = Math.round((lead.cur / Math.max(1, lead.series.n - 1)) * (p.series.n - 1)); }
  }
  setIndex(p, start, false);
  if (p.series.error && !p.series.n) p.mid.textContent = p.series.error;
}

/** Line pane p up with the leading pane (same study: the scanner's own heights; another date: the same fraction of the head). */
function align(p, lead) {
  const frac = lead.series.n > 1 ? lead.cur / (lead.series.n - 1) : 0;
  p.off = sameStudy(p, lead) ? lead.off : lead.off + (p.series.z(Math.round(frac * (p.series.n - 1))) - lead.series.z(lead.cur));
  p.cur = p.series.nearest(lead.series.z(lead.cur) - lead.off + p.off);
}

/** A slice of p's series came in. */
function onSeries(p) {
  const s = p.series;
  if (!s) return;
  if ((s.flips ?? 0) !== p.flips) { p.flips = s.flips; p.cur = s.n - 1 - p.cur; p.slider.value = p.cur; }
  const ends = s.slice(0) && s.slice(s.n - 1);
  if (ends && p.keepZ != null) { setIndex(p, s.nearest(p.keepZ), false); p.keepZ = null; }
  if (ends && p.alignLater) {
    const lead = V.panes[V.active];
    if (lead && lead !== p && lead.series?.slice(0) && lead.series.slice(lead.series.n - 1)) {
      p.alignLater = false;
      align(p, lead);
      setIndex(p, p.cur, false);
    } else if (!lead || lead === p) {
      p.alignLater = false;
    }
  }
  p.load.style.width = s.done ? '0' : `${(100 * s.loaded) / s.n}%`;
  draw(p);
  overlay(p);
}

function setIndex(p, i, follow) {
  if (!p.series) return;
  const n = p.series.n;
  p.cur = Math.max(0, Math.min(n - 1, Math.round(i)));
  p.slider.value = p.cur;
  p.series.focus(p.cur);
  draw(p);
  overlay(p);
  if (follow && V.linked) {
    const z = p.series.z(p.cur) - p.off;
    for (const q of visible()) {
      if (q === p || !q.series || q.alignLater) continue;
      q.cur = q.series.nearest(z + q.off);
      q.slider.value = q.cur;
      q.series.focus(q.cur);
      draw(q);
      overlay(q);
    }
    p.series.focus(p.cur); // the pane you're scrolling loads first
  }
}

function relink() {
  const lead = V.panes[V.active];
  if (!lead?.series) return;
  lead.off = 0;
  for (const q of visible()) if (q !== lead && q.series) q.off = sameStudy(q, lead) ? 0 : q.series.z(q.cur) - lead.series.z(lead.cur);
}

/* ---------- Drawing a slice ---------- */

function draw(p) {
  const s = p.series;
  if (!s) return;
  const slice = s.slice(p.cur) ?? s.nearestLoaded(p.cur);
  if (!slice) {
    p.mid.textContent = s.error && s.done ? `Couldn’t read this series: ${s.error}` : 'Loading…';
    p.mid.hidden = false;
    return;
  }
  p.mid.hidden = true;
  if (p.drawn?.slice === slice && p.drawn.preset === V.preset) return;
  const { rows, cols, hu } = slice;
  if (p.canvas.width !== cols || p.canvas.height !== rows) {
    p.canvas.width = cols;
    p.canvas.height = rows;
    p.image = null;
  }
  p.image ??= p.ctx.createImageData(cols, rows);
  const px = p.image.data;
  const { centre, width } = PRESETS[V.preset];
  const low = centre - width / 2;
  const scale = 255 / width;
  for (let k = 0, j = 0; k < hu.length; k++, j += 4) {
    const v = (hu[k] - low) * scale;
    const g = v <= 0 ? 0 : v >= 255 ? 255 : v;
    px[j] = g; px[j + 1] = g; px[j + 2] = g; px[j + 3] = 255;
  }
  p.ctx.putImageData(p.image, 0, 0);
  p.drawn = { slice, preset: V.preset };
}

function overlay(p) {
  const s = p.series;
  if (!s || !p.study) return;
  const slice = s.slice(p.cur);
  const q = p.cut?.quality ?? 100;
  p.tl.innerHTML = String(html`${p.study.date} ${p.study.time}<br>${KIND_LABEL[p.kind] ?? p.kind} · ${p.study.type}`);
  p.tr.innerHTML = String(html`<span class="ctv-q${q < 100 ? ' ctv-q--low' : ''}">${q === 100 ? 'Full' : `${q}%`}</span>${q !== V.quality ? html`<span class="ctv-q__note">${V.quality === 100 ? 'Full' : `${V.quality}%`} not downloaded</span>` : ''}`);
  p.bl.innerHTML = String(html`Slice ${p.cur + 1} / ${s.n}${slice ? html`<br>z ${slice.z.toFixed(1)} mm` : ''}${s.done ? '' : html`<br>loading ${s.loaded} / ${s.n}`}`);
  const pr = PRESETS[V.preset];
  p.br.innerHTML = String(html`${pr.label}<br>W ${pr.width} · L ${pr.centre}`);
}

/* ---------- Layout and controls ---------- */

function setActive(i) {
  V.active = i;
  V.panes.forEach((p, k) => p.el.classList.toggle('is-active', k === i && paneCount() > 1));
}

function pressed(attr, value) {
  V.el?.querySelectorAll(`[data-ct="${attr}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
}

function showLayout() {
  const grid = V.el.querySelector('.ctv__grid');
  if (grid && V.mode !== 'duty') grid.className = `ctv__grid ctv__grid--${V.layout}`;
  V.panes.forEach((p, k) => { p.el.hidden = k >= paneCount(); });
  if (V.active >= paneCount()) setActive(0);
  pressed('layout', V.layout);
}

/** First look: the newest study's plain cut; a second pane gets its contrast, else the study before. */
function startPanes() {
  if (!V.seen || !V.studies?.length || V.built !== V.studies) return;
  const [a, b] = V.panes;
  if (V.mode === 'duty') {
    // The newest plain CT on the left, the newest contrast CT beside it
    const has = (kind) => V.studies.find((s) => s.cuts.some((c) => c.kind === kind));
    if (!a.series && !a.none) showOrNone(a, has('plain'), 'plain', 'No plain CT downloaded.');
    if (!b.series && !b.none) showOrNone(b, has('contrast'), 'contrast', 'No contrast CT downloaded.');
    return;
  }
  if (!a.series) choose(a, V.studies[0], 'plain');
  if (V.layout > 1 && !b.series) fillSecond();
}

/** Duty Patients: a pane with its scan, or saying there's none (its menus still pick any study). */
function showOrNone(p, study, kind, message) {
  if (study) { choose(p, study, kind); return; }
  p.none = true;
  p.study = null;
  p.studySel.value = '';
  p.cutSel.innerHTML = '';
  p.mid.textContent = message;
  p.mid.hidden = false;
}

function fillSecond() {
  const [a, b] = V.panes;
  const first = a.study ?? V.studies[0];
  if (first.cuts.some((c) => c.kind === 'contrast') && a.kind !== 'contrast') choose(b, first, 'contrast');
  else choose(b, V.studies[Math.min(V.studies.indexOf(first) + 1, V.studies.length - 1)], 'plain');
}

function setLayout(n) {
  V.layout = n;
  savePrefs();
  showLayout();
  if (n > 1 && V.seen && !V.panes[1].series) fillSecond();
  if (n === 1) { V.panes.slice(1).forEach(detach); }
}

function setPreset(name) {
  V.preset = name;
  savePrefs();
  pressed('preset', name);
  for (const p of visible()) { draw(p); overlay(p); }
}

function setQuality(q) {
  V.quality = q;
  savePrefs();
  pressed('quality', q);
  for (const p of visible()) if (p.series) openCut(p, p.series.z(p.cur));
}

function setLinked(onOff) {
  V.linked = onOff;
  savePrefs();
  pressed('link', onOff ? 1 : 0);
  if (onOff) relink();
}

function pairPlainContrast() {
  const lead = V.panes[V.active];
  let study = lead?.study;
  if (!study || !study.cuts.some((c) => c.kind === 'contrast')) study = V.studies.find((s) => s.cuts.some((c) => c.kind === 'contrast') && s.cuts.some((c) => c.kind === 'plain'));
  if (!study) return;
  if (V.layout < 2) setLayout(2);
  setActive(0);
  choose(V.panes[0], study, 'plain');
  choose(V.panes[1], study, 'contrast');
  setLinked(true);
}

function compareOlder() {
  const lead = V.panes[V.active];
  const at = V.studies.findIndex((s) => s.folder === lead?.study?.folder);
  const older = V.studies[at + 1];
  if (!older) { toast('There’s no older study to compare with.', { icon: 'info' }); return; }
  if (V.layout < 2) setLayout(2);
  const other = V.panes[V.active === 0 ? 1 : 0];
  choose(other, older, older.cuts.some((c) => c.kind === lead.kind) ? lead.kind : 'plain');
  setLinked(true);
}

function stopPlay() {
  if (!V.playing) return;
  clearInterval(V.playing);
  V.playing = null;
  const b = V.el?.querySelector('[data-ct="play"]');
  if (b) { b.setAttribute('aria-pressed', 'false'); b.innerHTML = String(html`${icon('play')}Play`); }
}

function togglePlay() {
  if (V.playing) { stopPlay(); return; }
  V.playing = setInterval(() => {
    const p = V.panes[V.active];
    if (!p?.series || !V.el?.isConnected) { stopPlay(); return; }
    setIndex(p, p.cur + 1 >= p.series.n ? 0 : p.cur + 1, true);
  }, 1000 / V.fps);
  const b = V.el.querySelector('[data-ct="play"]');
  if (b) { b.setAttribute('aria-pressed', 'true'); b.innerHTML = String(html`${icon('pause')}Pause`); }
}

async function onClick(event) {
  const b = event.target.closest('[data-ct]');
  if (!b) return;
  const { ct: act, v } = b.dataset;
  try {
    if (act === 'choose') {
      if (canRemember) {
        if (await chooseFolder()) toast(`Using ${folderState().name} on this computer.`, { icon: 'image' });
      } else {
        V.el.querySelector('.ctv__picker').click();
      }
    } else if (act === 'allow') await allowFolder();
    else if (act === 'rescan') rescan(); // reads the folder again (the 'ct' event)
    else if (act === 'layout') setLayout(Number(v));
    else if (act === 'preset') setPreset(v);
    else if (act === 'quality') setQuality(Number(v));
    else if (act === 'link') setLinked(!V.linked);
    else if (act === 'pair') pairPlainContrast();
    else if (act === 'older') compareOlder();
    else if (act === 'play') togglePlay();
  } catch (err) {
    toast(err.message, { icon: 'info' });
  }
}

function onChange(event) {
  const sel = event.target.closest('[data-pick]');
  if (!sel) return;
  const p = V.panes.find((x) => x.el.contains(sel));
  if (!p) return;
  if (sel.dataset.pick === 'study') choose(p, findStudy(sel.value), p.kind);
  else { p.kind = sel.value; openCut(p); }
}

// ↑ ↓ PgUp PgDn Home End and Space, while the pointer is over the viewer (or a pane has focus)
document.addEventListener('keydown', (event) => {
  if (!V.el?.isConnected || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
  if (!V.el.matches(':hover') && !V.el.contains(document.activeElement)) return;
  const t = event.target;
  if (t?.closest?.('input:not([type="range"]), textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  if ([...document.querySelectorAll('dialog[open]')].pop()?.contains(V.el) === false) return; // a pop-up is on top
  const p = V.panes[V.active];
  if (!p?.series) return;
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key];
  if (steps) { event.preventDefault(); setIndex(p, p.cur + steps, true); }
  else if (event.key === 'Home') { event.preventDefault(); setIndex(p, 0, true); }
  else if (event.key === 'End') { event.preventDefault(); setIndex(p, p.series.n - 1, true); }
  else if (event.key === ' ' && t?.tagName !== 'BUTTON') { event.preventDefault(); togglePlay(); }
});
