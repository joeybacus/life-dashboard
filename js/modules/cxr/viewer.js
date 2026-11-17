/* Chest X-rays on a patient's page (0.11.42): the patient's downloaded chest
   X-rays (from CXR_Downloads on this computer, folder.js) in three viewers side
   by side — newest on the left, then the ones before it — under the CT scans.

   Each viewer has its own X-ray (pick another from its list), its own zoom,
   brightness, contrast and invert, and an Enlarge button (the X-ray fills the
   app's window until Back or Esc — done in the app rather than with the
   browser's full-screen mode, so it works the same in every browser). Zoom with a
   trackpad pinch, ⌘ + scroll, the + − buttons, a double-click, or + − 0 (fit)
   on the keyboard; drag or scroll to move around a zoomed picture. When the
   picture is at its normal size, scrolling moves the page as usual.

   Each viewer can be hidden on its own ("Hide" on it; "Viewer 1 2 3" above
   shows it again), and the whole box folds down to its title like the CT box.
   Which are hidden is remembered on this device. Nothing is read from the
   folder for a hidden viewer or a hidden box.

   Like the CT box, it's one real element kept between the page's redraws: the
   page draws cxrSlot() and calls mountCxr(); keepCxr() takes it out before a
   redraw; cxrClosed() when the page closes.

   For looking at the downloaded X-rays, not a diagnostic workstation. */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { toast } from '../../core/ui.js';
import {
  allowFolder, canRemember, chooseFolder, folderState, hnFolder, patientXrays, rescan, restoreFolder,
} from './folder.js';

const PREFS_KEY = 'ld.cxrViewer';
const PANES = 3;
const MAX_ZOOM = 8;
const ZOOMED = 1.001;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      hidden: p.hidden === true,
      off: Array.isArray(p.off) ? [...new Set(p.off.filter((i) => Number.isInteger(i) && i >= 0 && i < PANES))] : [],
    };
  } catch {
    return { hidden: false, off: [] };
  }
}

const X = {
  el: null,        // the box
  hn: '',          // whose X-rays (folder name); null after the page closed
  studies: null,   // null while looking, [] when none
  error: '',
  built: null,     // the studies the viewers were made for
  seen: false,     // scrolled into view (only then are pictures read)
  io: null,
  panes: [],
  urls: new Map(), // "<study>/<picture no.>" → Promise<object URL>
  ...loadPrefs(),  // hidden (the whole box), off (viewers hidden one by one)
};

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ hidden: X.hidden, off: X.off }));
  } catch { /* storage unavailable */ }
}

/* ---------- Mounting ---------- */

/** Where the box goes on a patient's page. */
export const cxrSlot = () => html`<div class="cxr-slot" data-cxr-slot></div>`;

function makeBox() {
  const box = document.createElement('section');
  box.className = 'ctv cxr';
  box.setAttribute('aria-labelledby', 'cxr-title');
  box.innerHTML = String(html`
    <div class="ctv__head">
      <h2 class="ctv__title" id="cxr-title">${icon('image')}<span>Chest X-rays</span></h2>
      <span class="ctv__count"></span>
      <span class="ctv__acts"></span>
      <button type="button" class="btn btn--sm ctv__toggle" data-cxr="hide" aria-expanded="true"></button>
    </div>
    <div class="ctv__body"></div>
    <input type="file" class="ctv__picker" webkitdirectory multiple hidden aria-hidden="true" tabindex="-1">
    <p class="ctv__hint">${icon('lock')}<span>Read from this computer only — never uploaded. For viewing the downloaded X-rays, not for diagnosis.</span></p>`);
  box.addEventListener('click', onClick);
  box.addEventListener('change', onChange);
  box.addEventListener('input', onInput);
  box.querySelector('.ctv__picker').addEventListener('change', async (event) => {
    if (await chooseFolder(event.target)) chosen();
    event.target.value = '';
  });
  // Pictures are only read once the box scrolls into sight
  X.io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !X.seen && !X.hidden) {
      X.seen = true;
      X.panes.forEach(load);
    }
  }, { rootMargin: '200px' });
  X.io.observe(box);
  return box;
}

/** Put the box into a page's slot, showing this patient's chest X-rays. */
export function mountCxr(root, { hn } = {}) {
  const slot = root?.querySelector('[data-cxr-slot]');
  if (!slot) return;
  if (!X.el) {
    X.el = makeBox();
    restoreFolder();
  }
  slot.replaceWith(X.el);
  const key = hnFolder(hn);
  if (key !== X.hn) setPatient(key);
}

/** Take the box out of a page before it redraws, so it goes back in untouched. */
export function keepCxr(root) {
  if (X.el && root?.contains(X.el)) X.el.remove();
}

/** The patient's page closed: leave full screen and let go of the pictures. */
export function cxrClosed() {
  leaveFull();
  forgetUrls();
  X.hn = null; // read again next time
}

/* ---------- The patient and their X-rays ---------- */

function forgetUrls() {
  for (const job of X.urls.values()) job.then((url) => URL.revokeObjectURL(url), () => {});
  X.urls.clear();
  for (const p of X.panes) { p.key = ''; p.img?.removeAttribute('src'); }
}

function setPatient(hn) {
  leaveFull();
  forgetUrls();
  X.hn = hn;
  X.studies = null;
  X.error = '';
  X.built = null;
  X.seen = false;
  X.panes = [];
  if (X.io && X.el) { X.io.unobserve(X.el); X.io.observe(X.el); } // checks again whether it's in sight
  render();
  listStudies();
}

async function listStudies() {
  const hn = X.hn;
  if (folderState().state !== 'ready' || !hn) { render(); return; }
  try {
    const studies = await patientXrays(hn);
    if (hn !== X.hn) return;
    X.studies = studies;
  } catch (err) {
    if (hn !== X.hn) return;
    X.studies = [];
    X.error = err.name === 'NotAllowedError' ? 'The browser no longer lets the app read the folder.' : err.message;
  }
  render();
}

on('cxr', () => {
  leaveFull();
  forgetUrls();
  X.studies = null;
  X.built = null;
  X.panes = [];
  if (X.el && X.hn != null) { render(); listStudies(); }
});

function chosen() {
  const { name } = folderState();
  if (/^CT_Downloads$/i.test(name)) toast('That’s the CT folder. For chest X-rays choose CXR_Downloads (tap Change folder).', { icon: 'info' });
  else toast(`Using ${name} on this computer.`, { icon: 'image' });
}

/* ---------- Drawing the box ---------- */

const studyName = (s) => `${s.date} ${s.time} · ${s.type}`;

/** "today", "yesterday", "3 days ago" for a YYYY-MM-DD date. */
function ago(date) {
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 864e5);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return days > 1 ? `${days} days ago` : '';
}

function render() {
  if (!X.el) return;
  const body = X.el.querySelector('.ctv__body');
  const count = X.el.querySelector('.ctv__count');
  const acts = X.el.querySelector('.ctv__acts');
  const toggle = X.el.querySelector('.ctv__toggle');
  const { state, name } = folderState();
  X.el.classList.toggle('is-hidden', X.hidden);
  toggle.setAttribute('aria-expanded', String(!X.hidden));
  toggle.innerHTML = String(X.hidden ? html`${icon('eye')}View chest X-rays` : html`${icon('eye')}Hide`);
  toggle.title = X.hidden ? 'Show the chest X-rays' : 'Hide the chest X-rays until you tap View';
  if (X.hidden) {
    leaveFull();
    count.textContent = '';
    acts.innerHTML = '';
    return;
  }
  const n = X.studies?.length ?? 0;
  count.textContent = state === 'ready' && n ? `${n} ${n === 1 ? 'X-ray' : 'X-rays'} · ${name}` : '';
  acts.innerHTML = state === 'ready' ? String(html`
    <button type="button" class="btn btn--sm btn--ghost" data-cxr="rescan" title="Look for new downloads">${icon('refresh')}<span class="sr-only">Look for new downloads</span></button>
    <button type="button" class="btn btn--sm btn--ghost" data-cxr="choose">${icon('image')}Change folder</button>`) : '';
  const say = (markup) => { X.built = null; X.panes = []; body.innerHTML = String(markup); };
  if (state === 'none' && !canRemember && window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches) {
    say(html`<p class="faint">Chest X-rays open on your Mac, from the CXR_Downloads folder there.</p>`);
    return;
  }
  if (state === 'none') {
    say(html`<div class="ctv__setup">
      <p>See this patient’s chest X-rays here, straight from the <b>CXR_Downloads</b> folder on this computer (where cxr_download.py saves them). The pictures stay on this computer — nothing is uploaded.</p>
      <button type="button" class="btn btn--accent" data-cxr="choose">${icon('image')}Choose the CXR_Downloads folder</button>
      <p class="faint">${canRemember
        ? 'The browser asks once whether the app may view the folder. It remembers the folder on this computer.'
        : 'In this browser the folder is chosen again each time the app opens. Chrome or Edge can remember it. The browser may say “upload” — the files are only read here, not sent anywhere.'}</p>
    </div>`);
    return;
  }
  if (state === 'ask') {
    say(html`<div class="ctv__setup">
      <p>The browser needs your OK again to read <b>${name}</b> on this computer.</p>
      <button type="button" class="btn btn--accent" data-cxr="allow">${icon('check')}Allow access to ${name}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-cxr="choose">Choose another folder</button>
    </div>`);
    return;
  }
  if (!X.hn) { say(html`<p class="faint">This patient has no hospital number, so their X-rays can’t be found.</p>`); return; }
  if (X.studies == null) { say(html`<p class="faint">Looking for chest X-rays…</p>`); return; }
  if (X.error) { say(html`<p class="faint">${X.error} Choose the folder again to carry on.</p>`); return; }
  if (!X.studies.length) {
    say(html`<p class="faint">No downloaded chest X-ray for HN ${X.hn} in ${name}. Download them with cxr_download.py, then tap ${icon('refresh')}.</p>`);
    return;
  }
  if (X.built !== X.studies) build(body);
}

function paneHtml(i) {
  return html`<div class="cxr-pane" data-pane="${i}">
    <div class="cxr-pane__bar">
      <span class="cxr-pane__no" title="Viewer ${i + 1}">${i + 1}</span>
      <select class="input cxr-pane__study" data-pick="study" aria-label="Chest X-ray in viewer ${i + 1}">
        <option value="">Choose a chest X-ray…</option>
        ${X.studies.map((s) => html`<option value="${s.folder}">${studyName(s)}</option>`)}
      </select>
      <button type="button" class="btn btn--sm btn--ghost cxr-pane__hide" data-cxr="hidepane" data-v="${i}" title="Hide viewer ${i + 1} (show it again with “Viewer ${i + 1}” above)">${icon('eye')}Hide</button>
    </div>
    <div class="cxr-pane__view" tabindex="0" aria-label="Chest X-ray in viewer ${i + 1}: pinch or command-scroll to zoom, drag to move, + − 0 and I keys">
      <img alt="" draggable="false" decoding="async">
      <div class="ctv-ov ctv-ov--tl"></div><div class="ctv-ov ctv-ov--tr"></div>
      <div class="ctv-ov ctv-ov--bl"></div><div class="ctv-ov ctv-ov--br"></div>
      <div class="ctv-ov ctv-ov--mid"></div>
    </div>
    <div class="cxr-pane__tools">
      <span class="cxr-pics" role="group" aria-label="Picture"></span>
      <span class="cxr-pane__zoom" role="group" aria-label="Zoom">
        <button type="button" class="cxr-btn" data-cxr="zoomout" title="Zoom out (−)">${icon('minus')}<span class="sr-only">Zoom out</span></button>
        <button type="button" class="cxr-btn" data-cxr="fit" title="The whole picture (0)">Fit</button>
        <button type="button" class="cxr-btn" data-cxr="zoomin" title="Zoom in (+)">${icon('plus')}<span class="sr-only">Zoom in</span></button>
      </span>
      <button type="button" class="cxr-btn" data-cxr="invert" aria-pressed="false" title="Swap black and white (I)">Invert</button>
      <button type="button" class="cxr-btn" data-cxr="big" aria-pressed="false" title="This X-ray filling the window (Esc to come back)">Enlarge</button>
    </div>
    <div class="cxr-pane__adjust">
      <label class="cxr-adj"><span>Brightness</span><input type="range" min="40" max="200" step="1" value="100" data-adj="bright" aria-label="Brightness in viewer ${i + 1}"></label>
      <label class="cxr-adj"><span>Contrast</span><input type="range" min="40" max="300" step="1" value="100" data-adj="contrast" aria-label="Contrast in viewer ${i + 1}"></label>
      <button type="button" class="cxr-btn" data-cxr="reset" title="Normal size, brightness and contrast, not inverted">Reset</button>
    </div>
  </div>`;
}

function build(body) {
  leaveFull();
  body.innerHTML = String(html`
    <div class="cxr__tools">
      <span class="cxr__label">Viewers</span>
      <span class="chips chips--sm" role="group" aria-label="Show or hide each viewer">${Array.from({ length: PANES }, (_, i) => html`<button type="button" class="chip-toggle" data-cxr="pane" data-v="${i}" aria-pressed="true" title="Show or hide viewer ${i + 1}">${icon('eye')}Viewer ${i + 1}</button>`)}</span>
    </div>
    <div class="cxr__grid">${Array.from({ length: PANES }, (_, i) => paneHtml(i))}</div>
    <p class="cxr__allhidden faint" hidden>All the viewers are hidden. Tap Viewer 1, 2 or 3 above to show one again.</p>
    <p class="ctv__keys faint">Newest X-ray on the left. Zoom: pinch on the trackpad, ⌘ + scroll, double-click, or + − (0 = fit) with the pointer over a picture. Drag or scroll to move around a zoomed picture. I = invert.</p>`);
  X.built = X.studies;
  X.panes = Array.from({ length: PANES }, (_, i) => makePane(i, body.querySelector(`[data-pane="${i}"]`)));
  X.panes.forEach((p, i) => choose(p, X.studies[i] ?? null));
  showPanes();
  if (!X.seen && inView()) X.seen = true;
  if (X.seen) X.panes.forEach(load);
}

/** Which viewers show, and how wide (they share the row). */
function showPanes() {
  if (!X.el || X.built !== X.studies) return;
  const shown = X.panes.filter((p) => !X.off.includes(p.i));
  for (const p of X.panes) p.el.hidden = X.off.includes(p.i);
  const grid = X.el.querySelector('.cxr__grid');
  grid.style.setProperty('--cxr-n', String(Math.max(1, shown.length)));
  grid.classList.toggle('cxr__grid--one', shown.length === 1);
  X.el.querySelectorAll('[data-cxr="pane"]').forEach((b) => b.setAttribute('aria-pressed', String(!X.off.includes(Number(b.dataset.v)))));
  X.el.querySelector('.cxr__allhidden').hidden = shown.length > 0;
  if (X.seen) shown.forEach(load);
}

/** Whether the box is on screen now (or nearly), for when the observer hasn't said yet. */
function inView() {
  const r = X.el?.isConnected ? X.el.getBoundingClientRect() : null;
  return !!r && r.bottom > -200 && r.top < window.innerHeight + 200 && r.width > 0;
}

/* ---------- Viewers ---------- */

function makePane(i, el) {
  const q = (s) => el.querySelector(s);
  const p = {
    i, el, study: null, pic: 0, key: '', loaded: false,
    z: 1, x: 0, y: 0, w: 0, h: 0, invert: false, bright: 100, contrast: 100,
    studySel: q('[data-pick="study"]'), view: q('.cxr-pane__view'), img: q('img'), pics: q('.cxr-pics'),
    tl: q('.ctv-ov--tl'), tr: q('.ctv-ov--tr'), bl: q('.ctv-ov--bl'), br: q('.ctv-ov--br'), mid: q('.ctv-ov--mid'),
    brightIn: q('[data-adj="bright"]'), contrastIn: q('[data-adj="contrast"]'),
  };
  const view = p.view;
  const at = (event) => {
    const r = view.getBoundingClientRect();
    return [event.clientX - r.left, event.clientY - r.top];
  };
  p.img.addEventListener('load', () => {
    p.loaded = true;
    p.mid.hidden = true;
    apply(p);
  });
  p.img.addEventListener('error', () => {
    if (!p.img.getAttribute('src')) return;
    p.loaded = false;
    message(p, 'This picture couldn’t be opened.');
  });
  // Zoom: pinch (Chrome sends it as a wheel with Ctrl) or ⌘ + scroll. Move: scroll when zoomed in.
  view.addEventListener('wheel', (event) => {
    if (!p.loaded) return;
    const unit = event.deltaMode === 1 ? 33 : 1;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAt(p, Math.exp(clamp(-event.deltaY * unit, -60, 60) * 0.01), ...at(event));
    } else if (p.z > ZOOMED) {
      event.preventDefault();
      pan(p, -event.deltaX * unit, -event.deltaY * unit);
    }
  }, { passive: false });
  // Safari's trackpad pinch
  let gestureFrom = 1;
  view.addEventListener('gesturestart', (event) => { event.preventDefault(); gestureFrom = p.z; });
  view.addEventListener('gesturechange', (event) => {
    event.preventDefault();
    if (p.loaded) zoomAt(p, (gestureFrom * event.scale) / p.z, ...at(event));
  });
  view.addEventListener('gestureend', (event) => event.preventDefault());
  // Drag to move a zoomed picture; two fingers pinch on a touch screen
  const pointers = new Map();
  view.addEventListener('pointerdown', (event) => {
    if (!p.loaded || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.set(event.pointerId, at(event));
    if (p.z > ZOOMED || pointers.size > 1) {
      view.setPointerCapture(event.pointerId);
      if (pointers.size === 1) view.classList.add('is-dragging');
    }
  });
  view.addEventListener('pointermove', (event) => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const now = at(event);
    if (pointers.size >= 2) {
      const others = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
      const d0 = Math.hypot(before[0] - others[0], before[1] - others[1]);
      const d1 = Math.hypot(now[0] - others[0], now[1] - others[1]);
      if (d0 > 0) zoomAt(p, d1 / d0, (now[0] + others[0]) / 2, (now[1] + others[1]) / 2);
    } else if (p.z > ZOOMED) {
      pan(p, now[0] - before[0], now[1] - before[1]);
    }
    pointers.set(event.pointerId, now);
  });
  const lift = (event) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) view.classList.remove('is-dragging');
  };
  view.addEventListener('pointerup', lift);
  view.addEventListener('pointercancel', lift);
  view.addEventListener('dblclick', (event) => {
    if (!p.loaded) return;
    if (p.z > ZOOMED) fit(p);
    else zoomAt(p, 2.5, ...at(event));
  });
  view.addEventListener('keydown', (event) => {
    if (!p.loaded || event.metaKey || event.ctrlKey || event.altKey) return;
    const k = event.key;
    if (k === '+' || k === '=') zoomAt(p, 1.25, p.w / 2, p.h / 2);
    else if (k === '-' || k === '_') zoomAt(p, 0.8, p.w / 2, p.h / 2);
    else if (k === '0') fit(p);
    else if (k === 'i' || k === 'I') setInvert(p, !p.invert);
    else return;
    event.preventDefault();
  });
  // Keep the same part of the picture in view when the viewer changes size
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const w = view.clientWidth;
      const h = view.clientHeight;
      if (!w || !h) return;
      if (p.w && p.h && p.z > ZOOMED) { p.x *= w / p.w; p.y *= h / p.h; }
      p.w = w;
      p.h = h;
      apply(p);
    }).observe(view);
  }
  return p;
}

const findStudy = (folder) => X.studies?.find((s) => s.folder === folder) ?? null;

/** Show picture `pic` of `study` in viewer p (study null: an empty viewer). */
function choose(p, study, pic = 0) {
  p.study = study;
  p.pic = study ? clamp(pic, 0, study.pictures.length - 1) : 0;
  p.studySel.value = study?.folder ?? '';
  p.el.classList.toggle('is-empty', !study);
  p.z = 1; p.x = 0; p.y = 0;
  p.key = '';
  p.loaded = false;
  p.img.removeAttribute('src');
  p.pics.innerHTML = study && study.pictures.length > 1
    ? String(html`<span class="cxr-pics__label">Picture</span>${study.pictures.map((_, k) => html`<button type="button" class="cxr-btn" data-cxr="pic" data-v="${k}" aria-pressed="${k === p.pic ? 'true' : 'false'}">${k + 1}</button>`)}`)
    : '';
  overlay(p);
  if (!study) {
    const more = X.studies.length;
    message(p, more > p.i ? 'Choose a chest X-ray above.' : `Only ${more} chest X-ray${more === 1 ? ' is' : 's are'} downloaded for this patient. Choose one above to see it here too.`);
  } else {
    message(p, X.seen ? 'Opening…' : 'Scroll down to load');
  }
  apply(p);
  load(p);
}

function message(p, text) {
  p.mid.textContent = text;
  p.mid.hidden = !text;
}

/** Read the picture from the folder (once the box is in sight, and the viewer is showing). */
function load(p) {
  if (!p.study || !X.seen || X.hidden || X.off.includes(p.i)) return;
  const pic = p.study.pictures[p.pic];
  const key = `${p.study.folder}/${pic.n}`;
  if (p.key === key) return;
  p.key = key;
  p.loaded = false;
  if (!pic.get) {
    p.img.removeAttribute('src');
    message(p, 'Only the DICOM file is there for this picture (no PNG). Download it again with cxr_download.py.');
    return;
  }
  message(p, 'Opening…');
  if (!X.urls.has(key)) {
    const job = pic.get().then((file) => URL.createObjectURL(file));
    job.catch(() => X.urls.delete(key));
    X.urls.set(key, job);
  }
  X.urls.get(key).then((url) => {
    if (p.key === key) p.img.src = url;
  }, (err) => {
    if (p.key !== key) return;
    p.key = '';
    message(p, err.name === 'NotAllowedError' ? 'The browser no longer lets the app read the folder.' : `This picture couldn’t be read (${err.message}).`);
  });
}

function overlay(p) {
  const s = p.study;
  const pic = s?.pictures[p.pic];
  p.tl.innerHTML = s ? String(html`<b>${s.date} ${s.time}</b><br>${ago(s.date)}`) : '';
  p.bl.textContent = s?.type ?? '';
  p.br.textContent = s && s.pictures.length > 1 ? `Picture ${p.pic + 1} of ${s.pictures.length}` : '';
  const quality = pic && pic.quality && pic.quality < 100 ? html`<span class="ctv-q ctv-q--low" title="Downloaded at ${pic.quality}%">${pic.quality}%</span>` : '';
  const zoom = p.z > ZOOMED ? html`<span>${Math.round(p.z * 100)}%</span>` : '';
  p.tr.innerHTML = String(html`${quality}${zoom}`);
}

/** Draw the picture with its zoom, place and adjustments. */
function apply(p) {
  p.img.style.transform = p.z > ZOOMED ? `translate(${p.x}px, ${p.y}px) scale(${p.z})` : '';
  const filters = [];
  if (p.bright !== 100) filters.push(`brightness(${p.bright / 100})`);
  if (p.contrast !== 100) filters.push(`contrast(${p.contrast / 100})`);
  if (p.invert) filters.push('invert(1)');
  p.img.style.filter = filters.join(' ');
  p.view.classList.toggle('is-zoomed', p.z > ZOOMED);
  p.el.querySelector('[data-cxr="invert"]').setAttribute('aria-pressed', String(p.invert));
  p.brightIn.value = String(p.bright);
  p.contrastIn.value = String(p.contrast);
  overlay(p);
}

/** Keep the picture covering the viewer (no sliding it off the edge). */
function keepIn(p) {
  const w = p.w || p.view.clientWidth;
  const h = p.h || p.view.clientHeight;
  p.x = clamp(p.x, w - w * p.z, 0);
  p.y = clamp(p.y, h - h * p.z, 0);
}

function zoomAt(p, factor, cx, cy) {
  if (!p.loaded || !Number.isFinite(factor) || factor <= 0) return;
  const z = clamp(p.z * factor, 1, MAX_ZOOM);
  const k = z / p.z;
  p.x = cx - (cx - p.x) * k;
  p.y = cy - (cy - p.y) * k;
  p.z = z;
  if (z <= ZOOMED) { p.z = 1; p.x = 0; p.y = 0; }
  keepIn(p);
  apply(p);
}

function pan(p, dx, dy) {
  p.x += dx;
  p.y += dy;
  keepIn(p);
  apply(p);
}

function fit(p) {
  p.z = 1; p.x = 0; p.y = 0;
  apply(p);
}

function setInvert(p, onOff) {
  p.invert = onOff;
  apply(p);
}

/* ---------- Enlarge ---------- */

let big = null; // { p, holder, home } while a viewer fills the window

/** One viewer fills the window (on top of the patient's page) until Back or Esc. */
function enlarge(p) {
  shrink();
  const holder = document.createElement('div');
  holder.className = 'cxr-big';
  holder.setAttribute('role', 'region');
  holder.setAttribute('aria-label', `Chest X-ray, viewer ${p.i + 1}, enlarged`);
  // It's outside the box now, so it listens for its own taps
  holder.addEventListener('click', onClick);
  holder.addEventListener('change', onChange);
  holder.addEventListener('input', onInput);
  const home = document.createComment('cxr viewer');
  p.el.replaceWith(home);
  holder.append(p.el);
  (X.el.closest('dialog') ?? document.body).append(holder);
  big = { p, holder, home };
  document.addEventListener('keydown', onBigKey, true);
  bigButtons();
  p.view.focus({ preventScroll: true });
}

/** Put the enlarged viewer back in its place. */
function shrink() {
  if (!big) return;
  const { p, holder, home } = big;
  big = null;
  document.removeEventListener('keydown', onBigKey, true);
  if (home.parentNode) home.replaceWith(p.el);
  holder.remove();
  bigButtons();
}

const leaveFull = shrink;

/** Esc goes back (instead of closing the patient's page); ← → don't change patient meanwhile. */
function onBigKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    shrink();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
  }
}

function bigButtons() {
  for (const p of X.panes) {
    const b = p.el.querySelector('[data-cxr="big"]');
    const on = big?.p === p;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Back (Esc)' : 'Enlarge';
    b.title = on ? 'Back to the viewers on the page' : 'This X-ray filling the window (Esc to come back)';
  }
}

/* ---------- Taps ---------- */

async function onClick(event) {
  const b = event.target.closest('[data-cxr]');
  if (!b) return;
  const { cxr: act, v } = b.dataset;
  const p = X.panes.find((x) => x.el.contains(b));
  try {
    if (act === 'choose') {
      if (canRemember) {
        if (await chooseFolder()) chosen();
      } else {
        X.el.querySelector('.ctv__picker').click();
      }
    } else if (act === 'allow') await allowFolder();
    else if (act === 'rescan') rescan(); // reads the folder again (the 'cxr' event)
    else if (act === 'hide') {
      X.hidden = !X.hidden;
      savePrefs();
      render();
      if (!X.hidden && X.built === X.studies) {
        if (!X.seen && inView()) X.seen = true;
        showPanes();
      }
    } else if (act === 'pane' || act === 'hidepane') {
      const i = Number(v);
      const hide = act === 'hidepane' || !X.off.includes(i);
      if (hide && big?.p.i === i) shrink();
      X.off = hide ? [...new Set([...X.off, i])] : X.off.filter((x) => x !== i);
      savePrefs();
      showPanes();
    } else if (p?.study) {
      if (act === 'pic') { choose(p, p.study, Number(v)); p.view.focus({ preventScroll: true }); }
      else if (!p.loaded && act !== 'reset') { /* nothing to zoom yet */ }
      else if (act === 'zoomin') zoomAt(p, 1.4, p.w / 2, p.h / 2);
      else if (act === 'zoomout') zoomAt(p, 1 / 1.4, p.w / 2, p.h / 2);
      else if (act === 'fit') fit(p);
      else if (act === 'invert') setInvert(p, !p.invert);
      else if (act === 'big') { if (big?.p === p) shrink(); else enlarge(p); }
      else if (act === 'reset') { p.bright = 100; p.contrast = 100; p.invert = false; fit(p); }
    }
  } catch (err) {
    toast(err.message, { icon: 'info' });
  }
}

function onChange(event) {
  const sel = event.target.closest('[data-pick="study"]');
  if (!sel) return;
  const p = X.panes.find((x) => x.el.contains(sel));
  if (p) choose(p, findStudy(sel.value));
}

function onInput(event) {
  const slider = event.target.closest('[data-adj]');
  if (!slider) return;
  const p = X.panes.find((x) => x.el.contains(slider));
  if (!p) return;
  p[slider.dataset.adj] = Number(slider.value);
  apply(p);
}
