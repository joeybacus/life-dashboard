/* Neuro Pad (#/neurology/pad) — your Neurology images in a grid, filtered by
   category and tags (which you make yourself), with a search box. Add as many
   images as you like at once: tap Add, drag them onto the page, or paste (⌘V).
   One image (#/neurology/pad/<id>): big, with Previous / Next (swipe, or the
   arrow keys), tap to zoom (pinch, or ⌘ + scroll), its category, tags and note,
   and the full-quality original from Google Drive. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { actionSheet, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage, replacePage } from '../../core/router.js';
import { foldText } from '../todo/model.js';
import {
  COLORS, KINDS, MAX_LABEL, MAX_NOTE, MAX_TITLE, addImage, allImages, categories, categoryOf, colorOf, deleteImages, deleteLabel,
  fileIndex, filterImages, getImage, getLabel, isImageFile, labelCounts, nextColor, padUrl, restoreImages, restoreLabel, saveLabel,
  tags, tagsOf, updateImage, updateImages,
} from './model.js';
import { PAD_SCRIPT_VERSION, fullOriginal, imageState, padTransfers } from './transfer.js';

let view = null;
let showing = false;
let openId = null; // the image shown, or null for the grid
const filter = { category: '', tagIds: [], query: '', sort: 'new' };
let selecting = false;
const selected = new Set();
let adding = null; // { done, total } while images are being added

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const mb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const dot = (color) => html`<span class="pad-dot" style="--lc: ${colorOf(color).hex}" aria-hidden="true"></span>`;
const typing = (el) => el?.closest?.('input, textarea, select, [contenteditable]');

export const padPage = {
  show(el, id) {
    view = el;
    showing = true;
    openId = id ?? null;
    if (openId && !getImage(openId)) {
      replacePage('pad');
      return;
    }
    if (openId) selecting = false;
    render();
  },
  hide() {
    showing = false;
    selecting = false;
    selected.clear();
  },
};

on('pad', () => {
  if (!showing) return;
  if (openId && !getImage(openId)) { replacePage('pad'); return; } // deleted (here or on another device)
  for (const id of [...selected]) if (!getImage(id)) selected.delete(id);
  refresh();
});
on('pad-files', () => { if (showing) fillImages(); });
on('pad-transfer', () => { if (showing) drawStatus(); });

/* ---------- Pictures ---------- */

/** Fill every <img data-pad-img> with its file (thumbnail or copy) — after drawing, so pages open at once. */
async function fillImages(root = view) {
  if (!root) return;
  for (const img of root.querySelectorAll('img[data-pad-img]')) {
    const url = await padUrl(img.dataset.padImg, img.dataset.kind || 'thumb');
    const frame = img.closest('.ph-frame');
    if (url) {
      if (img.getAttribute('src') !== url) img.src = url;
      frame?.classList.remove('is-missing');
    } else frame?.classList.add('is-missing');
  }
}

function waitText(img) {
  const where = imageState(img);
  if (where === 'missing') return 'Not in Google Drive';
  if (!img.copyFileId) return 'On your other device';
  return 'Downloading…';
}

const frame = (img, kind = 'thumb', extra = '') => html`<span class="ph-frame${extra}"><img data-pad-img="${img.id}" data-kind="${kind}" alt="${img.title || ''}" loading="lazy" decoding="async"><span class="ph-frame__wait">${icon('download')}<span>${waitText(img)}</span></span></span>`;

/* ---------- Status (Google Drive) ---------- */

function statusMarkup() {
  if (adding) return html`<p class="muted ph-status">${icon('upload')}Adding images… ${adding.done} of ${adding.total}</p>`;
  const t = padTransfers();
  if (t.blocked === 'not-connected' && t.up) return html`<p class="note">${icon('info')}<span>${plural(t.up, 'image is', 'images are')} only on this device for now. Turn on sync (Settings → Sync) and they’re copied to your Google Drive and your other devices.</span></p>`;
  if (t.blocked === 'script' && (t.up || t.down)) return html`<p class="note">${icon('info')}<span>Update the sync script (version ${PAD_SCRIPT_VERSION}) so Neuro Pad images can go to your Google Drive: Settings → Sync → Update the sync script. Until then they stay safely on this device.</span></p>`;
  if (t.error && /needs-permission/.test(t.error.code)) return html`<p class="note ward-note--warn">${icon('info')}<span>Google Drive needs your permission once: in Apps Script choose <strong>setup</strong>, click <strong>Run</strong> and allow access. Images wait safely on this device.</span></p>`;
  if (t.error && /drive-full/.test(t.error.code)) return html`<p class="note ward-note--warn">${icon('info')}<span>Your Google Drive is full, so new images stay on this device for now.</span></p>`;
  if (t.error && t.up) return html`<p class="note">${icon('info')}<span>${plural(t.up, 'image')} waiting to go to Google Drive — trying again shortly.</span></p>`;
  if (t.up) return html`<p class="muted ph-status">${icon('upload')}${t.running ? 'Saving' : 'Waiting to save'} ${plural(t.up, 'image')} to Google Drive…</p>`;
  if (t.down) return html`<p class="muted ph-status">${icon('download')}Downloading ${plural(t.down, 'image')} from your other devices…</p>`;
  return '';
}

function drawStatus() {
  const box = view?.querySelector('[data-pad-status]');
  if (box) setHTML(box, statusMarkup());
  if (openId) drawDriveLine();
}

/* ---------- The grid ---------- */

function words() {
  return foldText(filter.query).split(/\s+/).filter(Boolean);
}

function currentList() {
  return filterImages({ category: filter.category, tagIds: filter.tagIds, words: words(), sort: filter.sort }, foldText);
}

function filtersMarkup() {
  const counts = labelCounts();
  const cats = categories();
  const tgs = tags();
  const uncategorised = counts.get('none') ?? 0;
  const chip = (on, attrs, inner, label) => html`<button type="button" class="cs-chip pad-chip${on ? ' is-on' : ''}" aria-pressed="${on ? 'true' : 'false'}" ${raw(attrs)}${label ? raw(` aria-label="${label}"`) : ''}>${inner}</button>`;
  return html`
    <div class="pad-filter" role="group" aria-label="Category">
      <span class="pad-filter__label">${icon('folder')}<span class="sr-only">Category</span></span>
      ${chip(!filter.category, 'data-pact="cat" data-cat=""', html`All <span class="pad-chip__n">${allImages().length}</span>`)}
      ${cats.map((c) => chip(filter.category === c.id, `data-pact="cat" data-cat="${c.id}"`, html`${dot(c.color)}${c.name} <span class="pad-chip__n">${counts.get(c.id) ?? 0}</span>`))}
      ${uncategorised && cats.length ? chip(filter.category === 'none', 'data-pact="cat" data-cat="none"', html`No category <span class="pad-chip__n">${uncategorised}</span>`) : ''}
      <button type="button" class="cs-chip pad-chip pad-chip--new" data-pact="new-label" data-kind="category">${icon('plus')}Category</button>
    </div>
    <div class="pad-filter" role="group" aria-label="Tags">
      <span class="pad-filter__label">${icon('tag')}<span class="sr-only">Tags</span></span>
      ${tgs.map((t) => chip(filter.tagIds.includes(t.id), `data-pact="tag" data-tag="${t.id}"`, html`${dot(t.color)}${t.name} <span class="pad-chip__n">${counts.get(t.id) ?? 0}</span>`))}
      <button type="button" class="cs-chip pad-chip pad-chip--new" data-pact="new-label" data-kind="tag">${icon('plus')}Tag</button>
    </div>`;
}

function tile(img, files) {
  const cat = categoryOf(img);
  const tgs = tagsOf(img);
  const waiting = !img.copyFileId && files.get(img.id)?.has('copy');
  const on = selected.has(img.id);
  const label = [img.title || 'Untitled image', cat?.name, tgs.map((t) => t.name).join(', ')].filter(Boolean).join(', ');
  return html`<li><button type="button" class="pad-tile${on ? ' is-selected' : ''}" data-pact="${selecting ? 'pick' : 'open'}" data-id="${img.id}"
      aria-label="${label}"${selecting ? raw(` aria-pressed="${on}"`) : ''}>
    ${frame(img)}
    ${tgs.length ? html`<span class="pad-tile__tags" aria-hidden="true">${tgs.slice(0, 6).map((t) => dot(t.color))}</span>` : ''}
    ${waiting ? html`<span class="ph-tile__cloud" title="Not in Google Drive yet">${icon('upload')}</span>` : ''}
    ${img.title || cat ? html`<span class="pad-tile__foot">
      ${cat ? html`<span class="pad-tile__cat" style="--lc: ${colorOf(cat.color).hex}">${cat.name}</span>` : ''}
      ${img.title ? html`<span class="pad-tile__title">${img.title}</span>` : ''}
    </span>` : ''}
    ${selecting ? html`<span class="pad-tile__check" aria-hidden="true">${on ? icon('check') : ''}</span>` : ''}
  </button></li>`;
}

function listMarkup(files) {
  const all = allImages();
  const list = currentList();
  const filtered = Boolean(filter.category || filter.tagIds.length || words().length);
  const bar = html`<div class="pad-bar">
    <span class="pad-bar__count">${filtered ? `${list.length} of ${plural(all.length, 'image')}` : plural(all.length, 'image')}</span>
    ${filtered ? html`<button type="button" class="link-btn" data-pact="clear">Clear filters</button>` : ''}
    <span class="pad-bar__space"></span>
    <label class="pad-sort"><span class="sr-only">Sort</span>
      <select class="input input--sm" data-pad-sort>
        ${[['new', 'Newest first'], ['old', 'Oldest first'], ['title', 'Title A–Z']].map(([v, l]) => html`<option value="${v}"${filter.sort === v ? raw(' selected') : ''}>${l}</option>`)}
      </select>
    </label>
    ${list.length ? html`<button type="button" class="btn btn--sm${selecting ? ' btn--primary' : ''}" data-pact="select">${selecting ? 'Done' : 'Select'}</button>` : ''}
  </div>`;
  if (!list.length) return html`${bar}<p class="gl-none">No images match${filter.query.trim() ? ` “${filter.query.trim()}”` : ''}${filtered ? ' these filters' : ''}.</p>`;
  return html`${bar}<ul class="pad-grid">${list.map((img) => tile(img, files))}</ul>`;
}

function selectBar() {
  if (!selecting) return '';
  const n = selected.size;
  return html`<div class="pad-selbar" role="toolbar" aria-label="Selected images">
    <span class="pad-selbar__n">${n ? plural(n, 'image') : 'Tap images to select'}</span>
    <button type="button" class="btn btn--sm" data-pact="sel-all">${n && n === currentList().length ? 'None' : 'All'}</button>
    <button type="button" class="btn btn--sm" data-pact="sel-cat"${n ? '' : raw(' disabled')}>${icon('folder')}Category</button>
    <button type="button" class="btn btn--sm" data-pact="sel-tags"${n ? '' : raw(' disabled')}>${icon('tag')}Tags</button>
    <button type="button" class="btn btn--sm btn--danger" data-pact="sel-delete"${n ? '' : raw(' disabled')} aria-label="Delete selected">${icon('trash')}</button>
  </div>`;
}

function emptyMarkup() {
  return html`<div class="card gl-empty pad-empty" data-pact="add" role="button" tabindex="0">
    <span class="gl-empty__icon">${icon('image')}</span>
    <p class="gl-empty__title">Your Neuro Pad is empty</p>
    <p class="gl-empty__text">Keep the images worth remembering — scans, diagrams, slides, the whiteboard — sorted into your own categories and tags. Add as many as you like at once. Each one is saved to your Google Drive and kept on every device, so it opens offline.</p>
    <span class="btn btn--primary">${icon('plus')}Add images</span>
    <p class="pad-empty__hint">${matchMedia('(hover: hover) and (pointer: fine)').matches ? 'Or drag images here, or paste one with ⌘V.' : 'From your photo library, the camera or Files.'}</p>
  </div>`;
}

async function renderGrid() {
  const files = await fileIndex();
  const all = allImages();
  setHTML(view, html`<div class="pad accent-neuro${selecting ? ' is-selecting' : ''}" data-pad>
    ${subHead({ title: 'Neuro Pad', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools',
      actions: html`<button type="button" class="btn btn--sm" data-pact="labels">${icon('tag')}Labels</button>
        <button type="button" class="btn btn--sm btn--primary" data-pact="add">${icon('plus')}Add</button>` })}
    <input type="file" accept="image/*" multiple class="sr-only" data-pad-input tabindex="-1" aria-hidden="true">
    <div data-pad-status>${statusMarkup()}</div>
    ${all.length ? html`
      <label class="gl-search">${icon('search')}<input type="search" class="gl-search__input" data-pad-search placeholder="Search titles, notes, categories, tags" aria-label="Search the Neuro Pad" value="${filter.query}" autocomplete="off" enterkeyhint="search"></label>
      <div class="pad-filters" data-pad-filters>${filtersMarkup()}</div>
      <div data-pad-list>${listMarkup(files)}</div>
      <div data-pad-selbar>${selectBar()}</div>` : emptyMarkup()}
    <div class="pad-drop" aria-hidden="true">${icon('upload')}<span>Drop images to add them</span></div>
  </div>`);
  fillImages();
}

/** Redraw the parts that change, keeping the search box (and its keyboard) as it is. */
async function refresh() {
  if (!view || !showing) return;
  if (openId) return renderOne();
  const list = view.querySelector('[data-pad-list]');
  if (!list || !allImages().length) return renderGrid();
  const files = await fileIndex();
  setHTML(view.querySelector('[data-pad-filters]'), filtersMarkup());
  setHTML(list, listMarkup(files));
  setHTML(view.querySelector('[data-pad-selbar]'), selectBar());
  view.querySelector('[data-pad]')?.classList.toggle('is-selecting', selecting);
  drawStatus();
  fillImages();
}

function render() {
  if (!view || !showing) return;
  if (openId) renderOne();
  else renderGrid();
}

/* ---------- One image ---------- */

function neighbours(id) {
  let list = currentList();
  if (!list.some((i) => i.id === id)) list = allImages();
  const at = list.findIndex((i) => i.id === id);
  return { list, at, prev: list[at - 1] ?? null, next: list[at + 1] ?? null };
}

function driveLine(img) {
  const where = imageState(img);
  const t = padTransfers();
  if (where === 'up') {
    const why = t.blocked === 'not-connected' ? ' — goes to Google Drive once sync is on'
      : t.blocked === 'script' ? ' — update the sync script to send it' : t.blocked === 'offline' ? ' — goes when you’re online' : '…';
    return html`${icon('upload')}On this device${why}`;
  }
  if (where === 'down') return html`${icon('download')}Downloading from Google Drive…`;
  if (where === 'missing') return html`${icon('info')}Not found in Google Drive`;
  if (img.originalFileId) return html`${icon('cloudCheck')}In Google Drive${img.originalScaled ? ' (as a 4096-px copy)' : ''}`;
  if (img.copyFileId) return html`${icon('cloudCheck')}Copy in Google Drive`;
  return html`${icon('smartphone')}Waiting for your other device to send it`;
}

function drawDriveLine() {
  const img = getImage(openId);
  const box = view?.querySelector('[data-pad-drive]');
  if (img && box) setHTML(box, driveLine(img));
}

function renderOne() {
  const img = getImage(openId);
  if (!img) return;
  const { list, at, prev, next } = neighbours(img.id);
  const cat = categoryOf(img);
  const tgs = tagsOf(img);
  const canShare = typeof navigator.share === 'function';
  setHTML(view, html`<div class="pad pad-one accent-neuro" data-pad>
    ${subHead({ title: img.title || 'Untitled image', back: 'Neuro Pad', fallback: 'pad', accent: 'neuro', eyebrow: list.length > 1 ? `${at + 1} of ${list.length}` : 'Neuro Pad',
      actions: html`<button type="button" class="btn btn--sm" data-pact="edit" data-id="${img.id}">${icon('edit')}Edit</button>
        <button type="button" class="icon-btn" data-pact="more" data-id="${img.id}" aria-label="More for this image">${icon('more')}</button>` })}
    <div data-pad-status>${statusMarkup()}</div>
    <div class="pad-stage" data-pad-stage data-no-swipe>
      <button type="button" class="pad-stage__zoom" data-pact="zoom" data-id="${img.id}" aria-label="Zoom in">${frame(img, 'copy', ' ph-frame--big')}</button>
      ${prev ? html`<button type="button" class="pad-stage__nav pad-stage__nav--prev" data-pact="go" data-id="${prev.id}" aria-label="Previous image">${icon('chevronLeft')}</button>` : ''}
      ${next ? html`<button type="button" class="pad-stage__nav pad-stage__nav--next" data-pact="go" data-id="${next.id}" aria-label="Next image">${icon('chevronRight')}</button>` : ''}
    </div>
    <section class="card pad-info">
      <div class="pad-info__row">
        <span class="pad-info__label">${icon('folder')}Category</span>
        <button type="button" class="cs-chip pad-chip${cat ? ' is-on' : ''}" data-pact="set-cat" data-id="${img.id}">${cat ? html`${dot(cat.color)}${cat.name}` : 'None — choose'}</button>
      </div>
      <div class="pad-info__row">
        <span class="pad-info__label">${icon('tag')}Tags</span>
        <span class="pad-info__tags">
          ${tgs.map((t) => html`<button type="button" class="cs-chip pad-chip" data-pact="go-tag" data-tag="${t.id}" aria-label="Show every image tagged ${t.name}">${dot(t.color)}${t.name}</button>`)}
          <button type="button" class="cs-chip pad-chip pad-chip--new" data-pact="set-tags" data-id="${img.id}">${icon(tgs.length ? 'edit' : 'plus')}${tgs.length ? 'Change' : 'Add tags'}</button>
        </span>
      </div>
      ${img.note ? html`<p class="pad-info__note">${img.note}</p>` : ''}
      <p class="pad-info__meta">
        <span>Added ${dayLong.format(new Date(img.takenAt || img.createdAt))}</span>
        ${img.width ? html`<span>${img.width} × ${img.height}${img.originalSize ? ` · original ${mb(img.originalSize)}` : ''}</span>` : ''}
        <span class="pad-info__drive" data-pad-drive>${driveLine(img)}</span>
      </p>
      <div class="pad-info__actions">
        <button type="button" class="btn btn--sm" data-pact="full" data-id="${img.id}">${icon('eye')}Full quality</button>
        ${canShare ? html`<button type="button" class="btn btn--sm" data-pact="share" data-id="${img.id}">${icon('share')}Share</button>` : ''}
        <button type="button" class="btn btn--sm" data-pact="save" data-id="${img.id}">${icon('download')}Save a copy</button>
      </div>
    </section>
  </div>`);
  fillImages();
  wireStageSwipe();
}

function go(id) {
  if (id && getImage(id)) replacePage(`pad/${id}`);
}

function wireStageSwipe() {
  const stage = view.querySelector('[data-pad-stage]');
  if (!stage) return;
  let start = null;
  stage.addEventListener('touchstart', (e) => {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() } : null;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    const quick = performance.now() - start.t < 700;
    start = null;
    if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const { prev, next } = neighbours(openId);
    const to = dx < 0 ? next : prev;
    if (to) { e.preventDefault(); go(to.id); }
  });
}

/* ---------- Zoom (pinch, ⌘ + scroll, double-tap, or the buttons) ---------- */

async function openZoom(id, { full = false } = {}) {
  const img = getImage(id);
  if (!img) return;
  let url = await padUrl(id, 'copy');
  let ownUrl = null;
  if (full) {
    const blob = await getOriginal(img);
    if (!blob) return;
    url = ownUrl = URL.createObjectURL(blob);
  }
  if (!url) { toast(waitText(img) === 'Downloading…' ? 'Still downloading this image — try again in a moment.' : 'This image isn’t on this device yet.'); return; }
  await openDialog({
    variant: 'modal',
    className: 'pad-zoom-dlg',
    body: html`<div class="pad-zoom">
      <div class="pad-zoom__bar">
        <button type="button" class="btn btn--sm" data-dialog-value="close">${icon('x')}Close</button>
        <span class="pad-zoom__title">${img.title || 'Untitled image'}${full ? ' · full quality' : ''}</span>
        <button type="button" class="icon-btn" data-z="out" aria-label="Zoom out">${icon('minus')}</button>
        <span class="pad-zoom__pct" data-z-pct>100%</span>
        <button type="button" class="icon-btn" data-z="in" aria-label="Zoom in">${icon('plus')}</button>
        <button type="button" class="btn btn--sm" data-z="fit">Fit</button>
        ${!full && (img.originalFileId || img.originalSize) ? html`<button type="button" class="btn btn--sm" data-z="full">${icon('eye')}Full quality</button>` : ''}
      </div>
      <div class="pad-zoom__stage" data-z-stage data-no-swipe><img src="${url}" alt="${img.title || ''}" draggable="false" data-z-img></div>
    </div>`,
    onOpen(dlg, close) {
      const stage = dlg.querySelector('[data-z-stage]');
      const pic = dlg.querySelector('[data-z-img]');
      const pct = dlg.querySelector('[data-z-pct]');
      let z = { s: 1, x: 0, y: 0 }; // scale and offset of the fitted picture
      const MAX = 8;
      const draw = () => {
        pic.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
        pct.textContent = `${Math.round(z.s * 100)}%`;
      };
      const clamp = () => {
        z.s = Math.min(MAX, Math.max(1, z.s));
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const mx = Math.max(0, (pic.offsetWidth * z.s - w) / 2);
        const my = Math.max(0, (pic.offsetHeight * z.s - h) / 2);
        z.x = Math.min(mx, Math.max(-mx, z.x));
        z.y = Math.min(my, Math.max(-my, z.y));
        if (z.s === 1) { z.x = 0; z.y = 0; }
      };
      // Zoom by `factor` keeping the point (cx, cy) — relative to the stage's centre — where it is
      const zoomAt = (factor, cx = 0, cy = 0) => {
        const s = Math.min(MAX, Math.max(1, z.s * factor));
        const k = s / z.s;
        z = { s, x: cx - (cx - z.x) * k, y: cy - (cy - z.y) * k };
        clamp();
        draw();
      };
      const centre = (clientX, clientY) => {
        const r = stage.getBoundingClientRect();
        return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2];
      };
      dlg.querySelector('.pad-zoom__bar').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-z]');
        if (!b) return;
        if (b.dataset.z === 'in') zoomAt(1.5);
        if (b.dataset.z === 'out') zoomAt(1 / 1.5);
        if (b.dataset.z === 'fit') { z = { s: 1, x: 0, y: 0 }; draw(); }
        if (b.dataset.z === 'full') { close(null); openZoom(id, { full: true }); }
      });
      stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), ...centre(e.clientX, e.clientY)); // trackpad pinch, or ⌘ + scroll
        else { z.x -= e.deltaX; z.y -= e.deltaY; clamp(); draw(); }
      }, { passive: false });
      stage.addEventListener('dblclick', (e) => {
        if (z.s > 1) { z = { s: 1, x: 0, y: 0 }; draw(); } else zoomAt(2.5, ...centre(e.clientX, e.clientY));
      });
      // Fingers and the mouse: one drags, two pinch
      const pts = new Map();
      let last = null;
      let lastTap = 0;
      const pinch = () => {
        const [a, b] = [...pts.values()];
        return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      };
      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        last = pts.size === 2 ? pinch() : { x: e.clientX, y: e.clientY };
        if (e.pointerType === 'touch' && pts.size === 1) {
          const now = performance.now();
          if (now - lastTap < 300) { // double-tap
            if (z.s > 1) { z = { s: 1, x: 0, y: 0 }; draw(); } else zoomAt(2.5, ...centre(e.clientX, e.clientY));
            lastTap = 0;
          } else lastTap = now;
        }
      });
      stage.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const p = pinch();
          if (last?.d) {
            const [cx, cy] = centre(p.cx, p.cy);
            z.x += p.cx - last.cx;
            z.y += p.cy - last.cy;
            zoomAt(p.d / last.d, cx, cy);
          }
          last = p;
        } else if (pts.size === 1 && last && z.s > 1) {
          z.x += e.clientX - last.x;
          z.y += e.clientY - last.y;
          last = { x: e.clientX, y: e.clientY };
          clamp();
          draw();
        }
      });
      const up = (e) => {
        pts.delete(e.pointerId);
        last = pts.size === 1 ? [...pts.values()][0] : null;
      };
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      dlg.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=') zoomAt(1.5);
        if (e.key === '-') zoomAt(1 / 1.5);
        if (e.key === '0') { z = { s: 1, x: 0, y: 0 }; draw(); }
      });
      draw();
    },
  });
  if (ownUrl) setTimeout(() => URL.revokeObjectURL(ownUrl), 1000);
}

/** The full original (this device, or Google Drive), with a message when it can't be had. */
async function getOriginal(img) {
  const local = !img.originalFileId;
  if (!local) toast('Getting the full-quality image from Google Drive…', { duration: 2500 });
  try {
    const blob = await fullOriginal(img);
    if (blob) return blob;
  } catch (err) {
    console.error(err);
    toast(navigator.onLine ? 'Couldn’t get the full-quality image from Google Drive just now.' : 'You’re offline — the full-quality image is in Google Drive.');
    return null;
  }
  // No original anywhere we can reach (another device hasn't sent it yet): the copy is the best there is
  const copy = await padUrl(img.id, 'copy');
  if (!copy) toast('This image isn’t on this device yet.');
  else toast('The full-quality image is still on the device you added it on — showing the copy.');
  return copy ? (await fetch(copy)).blob() : null;
}

/** A file to share or save: the full original when there is one, else the copy. */
async function fileFor(img) {
  const blob = await getOriginal(img);
  if (!blob) return null;
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif' }[blob.type] ?? 'jpg';
  const base = (img.title || img.fileName.replace(/\.[^.]+$/, '') || 'Neuro Pad image').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
  return new File([blob], `${base}.${ext}`, { type: blob.type || 'image/jpeg' });
}

/* ---------- Choosing a category and tags (in the pop-ups) ---------- */

/**
 * A chip picker for categories (one, or none) or tags (any number), with "+ New".
 * pick.value: the chosen id (category) or Set of ids (tags); pick.markup() draws it; pick.wire(box) wires it up.
 */
function picker(kind, start) {
  const pick = { value: kind === 'tag' ? new Set(start ?? []) : start ?? null };
  pick.markup = () => {
    const list = kind === 'tag' ? tags() : categories();
    const on = (id) => (kind === 'tag' ? pick.value.has(id) : pick.value === id);
    return html`<div class="pad-pick" role="group" aria-label="${kind === 'tag' ? 'Tags' : 'Category'}">
      ${kind === 'category' ? html`<button type="button" class="cs-chip pad-chip${!pick.value ? ' is-on' : ''}" aria-pressed="${String(!pick.value)}" data-pick="">None</button>` : ''}
      ${list.map((l) => html`<button type="button" class="cs-chip pad-chip${on(l.id) ? ' is-on' : ''}" aria-pressed="${String(on(l.id))}" data-pick="${l.id}">${dot(l.color)}${l.name}${kind === 'tag' && on(l.id) ? icon('check', 'pad-chip__tick') : ''}</button>`)}
      <button type="button" class="cs-chip pad-chip pad-chip--new" data-pick-new>${icon('plus')}New ${kind === 'tag' ? 'tag' : 'category'}</button>
    </div>`;
  };
  pick.wire = (box) => {
    const draw = () => setHTML(box, pick.markup());
    draw();
    box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-pick-new]')) {
        const made = await labelEditor(kind);
        if (made?.id) {
          if (kind === 'tag') pick.value.add(made.id);
          else pick.value = made.id;
        }
        draw();
        return;
      }
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const id = b.dataset.pick;
      if (kind === 'tag') {
        if (pick.value.has(id)) pick.value.delete(id);
        else pick.value.add(id);
      } else pick.value = id || null;
      draw();
    });
  };
  return pick;
}

/* ---------- Adding images ---------- */

function chooseFiles() {
  const input = view?.querySelector('[data-pad-input]');
  if (!input) return;
  input.value = '';
  input.click();
}

async function openAdd(fileList) {
  const files = [...fileList].filter(isImageFile);
  const skipped = fileList.length - files.length;
  if (!files.length) {
    if (fileList.length) toast('Those aren’t images. The Neuro Pad takes JPEG, PNG, HEIC, WebP and GIF.');
    return;
  }
  const one = files.length === 1;
  const cat = picker('category', filter.category && filter.category !== 'none' ? filter.category : null);
  const tg = picker('tag', filter.tagIds);
  const previews = files.slice(0, 12).map((f) => URL.createObjectURL(f));
  const result = await openDialog({
    variant: 'modal',
    className: 'pad-dlg accent-neuro',
    dismissible: false,
    title: one ? 'Add an image' : `Add ${files.length} images`,
    body: html`<form class="form" data-form novalidate>
      <div class="pad-previews${one ? ' pad-previews--one' : ''}">
        ${previews.map((u) => html`<img src="${u}" alt="" decoding="async">`)}
        ${files.length > 12 ? html`<span class="pad-previews__more">+${files.length - 12}</span>` : ''}
      </div>
      ${skipped ? html`<p class="muted pad-dlg__skip">${plural(skipped, 'file')} that ${skipped === 1 ? 'isn’t an image' : 'aren’t images'} will be left out.</p>` : ''}
      ${one ? html`<label class="field"><span class="field__label">Title</span>
        <input class="input" name="title" maxlength="${MAX_TITLE}" placeholder="For example: Left MCA infarct — DWI" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
      </label>` : ''}
      <div class="field"><span class="field__label">Category</span><div data-pick-cat></div></div>
      <div class="field"><span class="field__label">Tags</span><div data-pick-tags></div></div>
      <label class="field"><span class="field__label">${one ? 'Note' : 'Note (for all of them)'}</span>
        <textarea class="input textarea" name="note" rows="3" maxlength="${MAX_NOTE}" placeholder="What it shows, the source, what to remember…" autocapitalize="sentences"></textarea>
      </label>
      ${one ? '' : html`<p class="muted pad-dlg__hint">You can give each image its own title afterwards.</p>`}
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${one ? 'Add' : `Add ${files.length}`}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      cat.wire(dlg.querySelector('[data-pick-cat]'));
      tg.wire(dlg.querySelector('[data-pick-tags]'));
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (!(await confirmDialog({ title: one ? 'Don’t add this image?' : `Don’t add these ${files.length} images?`, message: 'Nothing will be saved.', confirmLabel: 'Don’t add', cancelLabel: 'Keep', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        close({ title: form.elements.title?.value ?? '', note: form.elements.note.value });
      });
    },
  });
  previews.forEach((u) => URL.revokeObjectURL(u));
  if (!result) return;
  await addAll(files, { ...result, categoryId: cat.value, tagIds: [...tg.value] });
}

async function addAll(files, details) {
  if (adding) { toast('Still adding the last images — try again in a moment.'); return; }
  adding = { done: 0, total: files.length };
  drawStatus();
  const failed = [];
  for (const file of files) {
    try {
      await addImage(file, details);
    } catch (err) {
      console.error(err);
      failed.push(`${file.name || 'An image'} ${/quota/i.test(err?.message ?? '') ? '— this device is out of space' : err?.message || 'couldn’t be added'}`);
      if (/quota/i.test(err?.message ?? '')) break;
    }
    adding.done++;
    drawStatus();
  }
  const added = adding.done - failed.length;
  adding = null;
  drawStatus();
  if (!failed.length) toast(added === 1 ? 'Image added' : `${added} images added`, { icon: 'check' });
  else if (failed.length === 1 && !added) toast(failed[0]);
  else {
    await openDialog({
      variant: 'alert',
      title: `${plural(added, 'image')} added`,
      body: html`<p class="dlg__msg">${plural(failed.length, 'file')} couldn’t be added:</p><ul class="pad-failed">${failed.slice(0, 8).map((f) => html`<li>${f}</li>`)}</ul>`,
      actions: [{ label: 'OK', value: 'ok', variant: 'primary', autofocus: true }],
    });
  }
}

/* ---------- Editing one image ---------- */

async function editor(id) {
  const img = getImage(id);
  if (!img) return;
  const cat = picker('category', categoryOf(img)?.id ?? null);
  const tg = picker('tag', tagsOf(img).map((t) => t.id));
  const start = { title: img.title, note: img.note, cat: cat.value, tags: [...tg.value].sort().join() };
  const result = await openDialog({
    variant: 'modal',
    className: 'pad-dlg accent-neuro',
    dismissible: false,
    title: 'Edit image',
    body: html`<form class="form" data-form novalidate>
      <label class="field"><span class="field__label">Title</span>
        <input class="input" name="title" value="${img.title}" maxlength="${MAX_TITLE}" placeholder="For example: Left MCA infarct — DWI" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
      </label>
      <div class="field"><span class="field__label">Category</span><div data-pick-cat></div></div>
      <div class="field"><span class="field__label">Tags</span><div data-pick-tags></div></div>
      <label class="field"><span class="field__label">Note</span>
        <textarea class="input textarea" name="note" rows="4" maxlength="${MAX_NOTE}" placeholder="What it shows, the source, what to remember…" autocapitalize="sentences">${img.note}</textarea>
      </label>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      cat.wire(dlg.querySelector('[data-pick-cat]'));
      tg.wire(dlg.querySelector('[data-pick-tags]'));
      const values = () => ({ title: form.elements.title.value, note: form.elements.note.value });
      const changed = () => values().title.trim() !== start.title || values().note.trim() !== start.note
        || cat.value !== start.cat || [...tg.value].sort().join() !== start.tags;
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.title.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (changed() && !(await confirmDialog({ title: 'Discard changes?', message: 'What you changed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        close(values());
      });
    },
  });
  if (!result) return;
  await updateImage(id, { ...result, categoryId: cat.value, tagIds: [...tg.value] });
  toast('Saved', { icon: 'check' });
}

/** Just the category (from the chip on the image's page, or for selected images). */
async function chooseCategory(current) {
  const choice = await actionSheet({
    title: 'Category',
    items: [
      { label: 'None', value: '__none', checked: current === null },
      ...categories().map((c) => ({ label: c.name, value: c.id, icon: 'folder', checked: current === c.id })),
      { label: 'New category…', value: '__new', icon: 'plus' },
    ],
  });
  if (choice === null) return undefined;
  if (choice === '__none') return null;
  if (choice === '__new') return (await labelEditor('category'))?.id ?? undefined;
  return choice;
}

/** Tags for one image (a simple picker pop-up). */
async function chooseTags(id) {
  const img = getImage(id);
  if (!img) return;
  const tg = picker('tag', tagsOf(img).map((t) => t.id));
  const ok = await openDialog({
    variant: 'modal',
    className: 'pad-dlg accent-neuro',
    dismissible: false,
    title: 'Tags',
    body: html`<div data-pick-tags></div>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="cancel">Cancel</button>
        <button type="button" class="btn btn--primary" data-dialog-value="save">Save</button>
      </div>`,
    onOpen(dlg) { tg.wire(dlg.querySelector('[data-pick-tags]')); },
  });
  if (ok !== 'save') return;
  await updateImage(id, { tagIds: [...tg.value] });
}

/* ---------- Selected images ---------- */

async function selectedCategory() {
  const ids = [...selected];
  if (!ids.length) return;
  const choice = await chooseCategory(undefined);
  if (choice === undefined) return;
  const before = await updateImages(ids, () => ({ categoryId: choice }));
  toast(`${plural(ids.length, 'image')} ${choice ? `moved to ${getLabel(choice)?.name}` : 'now have no category'}`, { action: { label: 'Undo', onClick: () => restoreImages(before) } });
}

/** Tags for many images: each tag is on all of them, some, or none. Tap to cycle; "some" leaves them as they are. */
async function selectedTags() {
  const ids = [...selected];
  const imgs = ids.map(getImage).filter(Boolean);
  if (!imgs.length) return;
  const startState = (t) => {
    const n = imgs.filter((i) => i.tagIds.includes(t.id)).length;
    return n === imgs.length ? 'all' : n ? 'some' : 'none';
  };
  const state = new Map(tags().map((t) => [t.id, startState(t)]));
  const ok = await openDialog({
    variant: 'modal',
    className: 'pad-dlg accent-neuro',
    dismissible: false,
    title: `Tags for ${plural(imgs.length, 'image')}`,
    body: html`<p class="muted pad-dlg__hint">Tap a tag to put it on all of them, tap again to take it off. A dashed tag is on some of them, and stays as it is.</p>
      <div data-tri></div>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="cancel">Cancel</button>
        <button type="button" class="btn btn--primary" data-dialog-value="save">Save</button>
      </div>`,
    onOpen(dlg) {
      const box = dlg.querySelector('[data-tri]');
      const draw = () => setHTML(box, html`<div class="pad-pick" role="group" aria-label="Tags">
        ${tags().map((t) => {
          const s = state.get(t.id) ?? 'none';
          return html`<button type="button" class="cs-chip pad-chip${s === 'all' ? ' is-on' : s === 'some' ? ' is-some' : ''}" data-tri-tag="${t.id}"
            aria-label="${t.name}: ${s === 'all' ? 'on all' : s === 'some' ? 'on some' : 'on none'}">${dot(t.color)}${t.name}${s === 'all' ? icon('check', 'pad-chip__tick') : ''}</button>`;
        })}
        <button type="button" class="cs-chip pad-chip pad-chip--new" data-tri-new>${icon('plus')}New tag</button>
      </div>`);
      draw();
      box.addEventListener('click', async (e) => {
        if (e.target.closest('[data-tri-new]')) {
          const made = await labelEditor('tag');
          if (made?.id) state.set(made.id, 'all');
          draw();
          return;
        }
        const b = e.target.closest('[data-tri-tag]');
        if (!b) return;
        const id = b.dataset.triTag;
        const s = state.get(id) ?? 'none';
        state.set(id, s === 'all' ? 'none' : 'all');
        draw();
      });
    },
  });
  if (ok !== 'save') return;
  const before = await updateImages(ids, (img) => {
    const set = new Set(img.tagIds);
    for (const [id, s] of state) {
      if (s === 'all') set.add(id);
      if (s === 'none') set.delete(id);
    }
    return { tagIds: [...set] };
  });
  toast(`Tags saved for ${plural(ids.length, 'image')}`, { action: { label: 'Undo', onClick: () => restoreImages(before) } });
}

async function selectedDelete() {
  const ids = [...selected];
  if (!ids.length) return;
  if (!(await confirmDialog({ title: `Delete ${plural(ids.length, 'image')}?`, message: 'They go to the Google Drive trash, where they stay for 30 days.', confirmLabel: 'Delete', destructive: true }))) return;
  const before = await deleteImages(ids);
  selected.clear();
  toast(`${plural(before.length, 'image')} deleted`, { action: { label: 'Undo', onClick: () => restoreImages(before) } });
}

/* ---------- Categories and tags ---------- */

/** Make (label null) or change a category or tag. Resolves with the saved label, { deleted } or null. */
async function labelEditor(kind, label = null) {
  const start = { name: label?.name ?? '', color: label?.color ?? nextColor(kind) };
  let color = start.color;
  const counts = labelCounts();
  const used = label ? counts.get(label.id) ?? 0 : 0;
  const result = await openDialog({
    variant: 'alert',
    className: 'pad-label-dlg accent-neuro',
    dismissible: false,
    title: label ? `Edit ${kind === 'tag' ? 'tag' : 'category'}` : `New ${kind === 'tag' ? 'tag' : 'category'}`,
    body: html`<form class="form" data-form novalidate>
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="name" value="${start.name}" maxlength="${MAX_LABEL}" placeholder="${kind === 'tag' ? 'For example: stroke, high-yield, exam' : 'For example: MRI, CT, EEG, Anatomy'}" autocomplete="off" autocapitalize="${kind === 'tag' ? 'off' : 'words'}" enterkeyhint="done">
      </label>
      <div class="field"><span class="field__label">Colour</span>
        <div class="pad-swatches" role="radiogroup" aria-label="Colour">
          ${COLORS.map((c) => html`<button type="button" class="pad-swatch${c.id === color ? ' is-on' : ''}" role="radio" aria-checked="${String(c.id === color)}" aria-label="${c.name}" data-swatch="${c.id}" style="--lc: ${c.hex}">${c.id === color ? icon('check') : ''}</button>`)}
        </div>
      </div>
      <p class="field__error" data-lerror role="alert" hidden></p>
      ${label ? html`<button type="button" class="btn btn--sm btn--ghost pad-label-dlg__delete" data-ldelete>${icon('trash')}Delete ${kind === 'tag' ? 'tag' : 'category'}${used ? ` (on ${plural(used, 'image')})` : ''}</button>` : ''}
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${label ? 'Save' : 'Make'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const error = dlg.querySelector('[data-lerror]');
      const swatches = dlg.querySelector('.pad-swatches');
      swatches.addEventListener('click', (e) => {
        const b = e.target.closest('[data-swatch]');
        if (!b) return;
        color = b.dataset.swatch;
        swatches.querySelectorAll('[data-swatch]').forEach((s) => {
          const onIt = s.dataset.swatch === color;
          s.classList.toggle('is-on', onIt);
          s.setAttribute('aria-checked', String(onIt));
          setHTML(s, onIt ? icon('check') : '');
        });
      });
      setTimeout(() => form.elements.name.focus(), 80);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        const changed = form.elements.name.value.trim() !== start.name || color !== start.color;
        if (changed && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      dlg.querySelector('[data-ldelete]')?.addEventListener('click', async () => {
        const what = kind === 'tag' ? `It comes off ${used === 1 ? 'the image' : `the ${used} images`} that have it` : `${used === 1 ? 'Its image keeps' : `Its ${used} images keep`} everything else, with no category`;
        if (!(await confirmDialog({ title: `Delete “${label.name}”?`, message: used ? `${what}. No image is deleted.` : 'You can undo this straight away.', confirmLabel: 'Delete', destructive: true }))) return;
        close({ deleted: true });
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = form.elements.name.value.trim();
        if (!name) { error.textContent = 'Give it a name.'; error.hidden = false; form.elements.name.focus(); return; }
        const clash = [...(kind === 'tag' ? tags() : categories())].find((l) => l.id !== label?.id && l.name.toLowerCase() === name.toLowerCase());
        if (clash && label) { error.textContent = `There’s already a ${kind === 'tag' ? 'tag' : 'category'} called “${clash.name}”.`; error.hidden = false; return; }
        close({ name });
      });
    },
  });
  if (!result) return null;
  if (result.deleted) {
    const undo = await deleteLabel(label.id);
    if (kind === 'category' && filter.category === label.id) filter.category = '';
    filter.tagIds = filter.tagIds.filter((t) => t !== label.id);
    toast(`${KINDS[kind]} “${label.name}” deleted`, { action: { label: 'Undo', onClick: () => restoreLabel(undo) } });
    refresh();
    return { deleted: true };
  }
  return saveLabel(label?.id ?? null, { kind, name: result.name, color });
}

/** Your categories and tags: make, rename, recolour, delete. */
async function manageLabels() {
  await openDialog({
    variant: 'modal',
    className: 'pad-dlg accent-neuro',
    title: 'Categories and tags',
    body: html`<p class="muted pad-dlg__hint">Each image goes in one category (like a folder) and can have as many tags as you like.</p>
      <div data-labels></div>`,
    actions: [{ label: 'Done', value: 'done', variant: 'primary' }],
    onOpen(dlg) {
      const box = dlg.querySelector('[data-labels]');
      const section = (kind, list, counts) => html`<section class="pad-labels" aria-label="${kind === 'tag' ? 'Tags' : 'Categories'}">
        <h3 class="pad-labels__title">${icon(kind === 'tag' ? 'tag' : 'folder')}${kind === 'tag' ? 'Tags' : 'Categories'}<span class="ward-group__count">${list.length}</span></h3>
        ${list.length ? html`<ul class="pad-labels__list">${list.map((l) => html`<li><button type="button" class="pad-labels__row" data-ledit="${l.id}">
          ${dot(l.color)}<span class="pad-labels__name">${l.name}</span><span class="pad-labels__n">${plural(counts.get(l.id) ?? 0, 'image')}</span>${icon('edit')}
        </button></li>`)}</ul>` : html`<p class="muted pad-labels__none">${kind === 'tag' ? 'No tags yet — for example stroke, high-yield, exam.' : 'No categories yet — for example MRI, CT, EEG, Anatomy.'}</p>`}
        <button type="button" class="btn btn--sm" data-lnew="${kind}">${icon('plus')}New ${kind === 'tag' ? 'tag' : 'category'}</button>
      </section>`;
      const draw = () => {
        const counts = labelCounts();
        setHTML(box, html`${section('category', categories(), counts)}${section('tag', tags(), counts)}`);
      };
      draw();
      box.addEventListener('click', async (e) => {
        const made = e.target.closest('[data-lnew]');
        const edit = e.target.closest('[data-ledit]');
        if (made) await labelEditor(made.dataset.lnew);
        else if (edit) {
          const l = getLabel(edit.dataset.ledit);
          if (l) await labelEditor(l.kind, l);
        } else return;
        draw();
      });
    },
  });
}

/* ---------- Doing things ---------- */

async function more(id) {
  const img = getImage(id);
  if (!img) return;
  const choice = await actionSheet({
    title: img.title || 'Untitled image',
    items: [
      { label: 'Edit', value: 'edit', icon: 'edit' },
      { label: 'Zoom', value: 'zoom', icon: 'search' },
      { label: 'Delete', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'edit') editor(id);
  if (choice === 'zoom') openZoom(id);
  if (choice === 'delete') {
    if (!(await confirmDialog({ title: 'Delete this image?', message: 'It goes to the Google Drive trash, where it stays for 30 days.', confirmLabel: 'Delete', destructive: true }))) return;
    const { next, prev } = neighbours(id);
    const before = await deleteImages([id]);
    const to = next ?? prev;
    replacePage(to ? `pad/${to.id}` : 'pad');
    toast('Image deleted', { action: { label: 'Undo', onClick: () => restoreImages(before) } });
  }
}

async function share(id) {
  const img = getImage(id);
  const file = img && await fileFor(img);
  if (!file) return;
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: img.title || undefined }).catch(() => {});
  else toast('Sharing images isn’t possible on this device — use Save a copy.');
}

async function saveCopy(id) {
  const img = getImage(id);
  const file = img && await fileFor(img);
  if (!file) return;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function onClick(e) {
  const btn = e.target.closest('[data-pact]');
  if (!btn || !view?.contains(btn) || !view.querySelector('[data-pad]')) return;
  const { pact, id } = btn.dataset;
  switch (pact) {
    case 'add': chooseFiles(); break;
    case 'labels': manageLabels(); break;
    case 'new-label': {
      const made = await labelEditor(btn.dataset.kind);
      if (made?.id) {
        if (made.kind === 'tag') filter.tagIds = [...filter.tagIds, made.id];
        else filter.category = made.id;
        refresh();
      }
      break;
    }
    case 'cat': filter.category = btn.dataset.cat; refresh(); break;
    case 'tag': {
      const t = btn.dataset.tag;
      filter.tagIds = filter.tagIds.includes(t) ? filter.tagIds.filter((x) => x !== t) : [...filter.tagIds, t];
      refresh();
      break;
    }
    case 'clear':
      Object.assign(filter, { category: '', tagIds: [], query: '' });
      renderGrid();
      break;
    case 'open': openPage('neurology', `pad/${id}`); break;
    case 'select':
      selecting = !selecting;
      selected.clear();
      refresh();
      break;
    case 'pick':
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      btn.classList.toggle('is-selected', selected.has(id));
      btn.setAttribute('aria-pressed', String(selected.has(id)));
      setHTML(btn.querySelector('.pad-tile__check'), selected.has(id) ? icon('check') : '');
      setHTML(view.querySelector('[data-pad-selbar]'), selectBar());
      break;
    case 'sel-all': {
      const list = currentList();
      if (selected.size === list.length) selected.clear();
      else list.forEach((i) => selected.add(i.id));
      refresh();
      break;
    }
    case 'sel-cat': selectedCategory(); break;
    case 'sel-tags': selectedTags(); break;
    case 'sel-delete': selectedDelete(); break;
    case 'go': go(id); break;
    case 'zoom': openZoom(id); break;
    case 'full': openZoom(id, { full: true }); break;
    case 'edit': editor(id); break;
    case 'more': more(id); break;
    case 'share': share(id); break;
    case 'save': saveCopy(id); break;
    case 'set-cat': {
      const choice = await chooseCategory(getImage(id)?.categoryId ?? null);
      if (choice !== undefined) await updateImage(id, { categoryId: choice });
      break;
    }
    case 'set-tags': chooseTags(id); break;
    case 'go-tag':
      Object.assign(filter, { category: '', tagIds: [btn.dataset.tag], query: '' });
      openPage('neurology', 'pad');
      break;
    default:
  }
}

function onKey(e) {
  if (!showing || !openId || document.querySelector('dialog[open]') || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const { prev, next } = neighbours(openId);
  const to = e.key === 'ArrowLeft' ? prev : next;
  if (to) { e.preventDefault(); go(to.id); }
}

function onPaste(e) {
  if (!showing || openId || document.querySelector('dialog[open]')) return;
  const files = [...(e.clipboardData?.files ?? [])].filter(isImageFile);
  if (!files.length) return;
  e.preventDefault();
  openAdd(files);
}

/** Wired up once by the Neurology screen. */
export function wirePad(el) {
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.pad-empty')) { e.preventDefault(); chooseFiles(); }
  });
  el.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-pad-search]')) return;
    filter.query = e.target.value;
    refresh();
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-pad-sort]')) { filter.sort = e.target.value; refresh(); }
    if (e.target.matches?.('[data-pad-input]')) {
      const files = [...(e.target.files ?? [])];
      e.target.value = '';
      if (files.length) openAdd(files);
    }
  });
  // Drag images from Finder (or another app) onto the page
  let depth = 0;
  const dropping = (on) => view?.querySelector('[data-pad]')?.classList.toggle('is-dropping', on);
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  el.addEventListener('dragenter', (e) => {
    if (!showing || openId || !hasFiles(e)) return;
    e.preventDefault();
    depth++;
    dropping(true);
  });
  el.addEventListener('dragover', (e) => {
    if (!showing || openId || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  el.addEventListener('dragleave', () => {
    if (depth && --depth === 0) dropping(false);
  });
  el.addEventListener('drop', (e) => {
    if (!showing || openId || !hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    dropping(false);
    openAdd([...e.dataTransfer.files]);
  });
  document.addEventListener('keydown', onKey);
  document.addEventListener('paste', onPaste);
}

/** "12 images · 4 categories" for the Neurology page's card. */
export function padSummary() {
  const n = allImages().length;
  const c = categories().length;
  const t = tags().length;
  if (!n && !c && !t) return 'Your images, in your own categories and tags';
  return [plural(n, 'image'), c ? plural(c, 'category', 'categories') : '', t ? plural(t, 'tag') : ''].filter(Boolean).join(' · ');
}

/** Search everywhere opens one image. */
export function showPadImage(id) {
  openPage('neurology', `pad/${id}`);
}
