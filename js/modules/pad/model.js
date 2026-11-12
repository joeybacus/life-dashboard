/* Neuro Pad (0.11.39) — your Neurology images (scans, diagrams, slides, photos
   of the board…), each in a category and with as many tags as you like. You
   make the categories and tags yourself, with a colour each.

   An image is two things:
   - a record in "padImages" (synced to the Neuro Pad tab, sync script 21, and in backups):
       { id, title, note, categoryId (a category's id, or null), tagIds: [tag ids],
         takenAt,                     when the picture was taken (from the file), or when you added it
         fileName,                    the name of the file you chose
         width, height,               of the copy
         originalSize, originalMime,  of the file you chose
         copyFileId, originalFileId,  its two files in the "Life Dashboard Neuro Pad" Drive folder (once uploaded)
         originalScaled,              true if the original was too big to send and a 4096-px version went instead
         createdAt, updatedAt, deletedAt }
   - files in "padFiles" on this device only: the copy (≤ 2048 px, about 1 MB), a thumbnail (≈ 480 px), and —
     until it's safely in Drive — the full original. Other devices download the copy from Drive.

   Categories and tags are records in "padLabels" (the Neuro Pad labels tab):
       { id, kind: 'category' | 'tag', name, color, createdAt, updatedAt, deletedAt } */
import { db, tx } from '../../core/db.js';
import { saveRecord, saveRecords } from '../../core/records.js';
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';
import { COLORS, colorOf } from '../referrals/labels.js';

export { COLORS, colorOf };
export const MAX_TITLE = 160;
export const MAX_NOTE = 4000;
export const MAX_LABEL = 40;
export const MAX_TAGS = 40;          // on one image
export const COPY_MAX = 2048;        // longest side of the copy every device keeps
export const THUMB_MAX = 480;        // longest side of the grid's thumbnail
export const ORIGINAL_MAX_BYTES = 28 * 1024 * 1024; // bigger originals are sent as a 4096-px version
export const KINDS = { category: 'Category', tag: 'Tag' };

let images = new Map(); // id → record (not deleted)
let labels = new Map(); // id → record (not deleted)

const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (text, max) => String(text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/* ---------- Reading ---------- */

/** Newest first. */
export const allImages = () => [...images.values()]
  .sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)) || String(b.createdAt).localeCompare(String(a.createdAt)));
export const getImage = (id) => images.get(id) ?? null;
export const getLabel = (id) => labels.get(id) ?? null;
export const categories = () => [...labels.values()].filter((l) => l.kind === 'category').sort(byName);
export const tags = () => [...labels.values()].filter((l) => l.kind === 'tag').sort(byName);
export const categoryOf = (img) => (img?.categoryId ? labels.get(img.categoryId) ?? null : null);
/** An image's tags (ones deleted since are left out), A to Z. */
export const tagsOf = (img) => (img?.tagIds ?? []).map((id) => labels.get(id)).filter((l) => l?.kind === 'tag').sort(byName);

/** How many images each category and tag has: Map(label id → n), plus 'none' (no category). */
export function labelCounts() {
  const counts = new Map();
  const add = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const img of images.values()) {
    add(categoryOf(img) ? img.categoryId : 'none');
    for (const t of tagsOf(img)) add(t.id);
  }
  return counts;
}

/** A label of this kind with this name (any capitals), or null. */
export const findLabel = (kind, name) => {
  const k = oneLine(name, MAX_LABEL).toLowerCase();
  return [...labels.values()].find((l) => l.kind === kind && l.name.toLowerCase() === k) ?? null;
};

/**
 * The images that match: category ('' all, 'none' no category, or a category's id), tags (every one of
 * them) and words (each word somewhere in the title, note, file name, category or tags). Newest first,
 * or sort: 'old' | 'title'.
 */
export function filterImages({ category = '', tagIds = [], words = [], sort = 'new' } = {}, fold = (t) => t.toLowerCase()) {
  const list = allImages().filter((img) => {
    if (category === 'none' && categoryOf(img)) return false;
    if (category && category !== 'none' && img.categoryId !== category) return false;
    if (tagIds.some((t) => !img.tagIds?.includes(t))) return false;
    if (!words.length) return true;
    const hay = fold([img.title, img.note, img.fileName, categoryOf(img)?.name, ...tagsOf(img).map((t) => t.name)].join(' '));
    return words.every((w) => hay.includes(w));
  });
  if (sort === 'old') list.reverse();
  if (sort === 'title') list.sort((a, b) => (a.title || '￿').localeCompare(b.title || '￿', undefined, { sensitivity: 'base', numeric: true }));
  return list;
}

export async function loadPad() {
  const [imgs, labs] = await Promise.all([db.live('padImages'), db.live('padLabels')]);
  images = new Map(imgs.filter((r) => !r.sample).map((r) => [r.id, { ...r, tagIds: Array.isArray(r.tagIds) ? r.tagIds : [] }]));
  labels = new Map(labs.filter((r) => !r.sample && r.name).map((r) => [r.id, r]));
  emit('pad');
}

export async function initPad() {
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore' || reason === 'reset') loadPad(); });
  await loadPad();
}

/* ---------- Images: making the copy and the thumbnail ---------- */

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* try the old way */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('couldn’t be opened — try a JPEG, PNG or HEIC image');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(img, max, quality) {
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('looks empty');
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // see-through parts of a PNG would turn black in a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve({ blob: b, width: canvas.width, height: canvas.height }) : reject(new Error('couldn’t be saved'))),
    'image/jpeg', quality,
  ));
}

/** The copy (≤ 2048 px, about 1 MB) and the thumbnail of a chosen image or a downloaded copy. */
export async function makeCopies(blob, { copy = true } = {}) {
  const img = await decode(blob);
  try {
    const out = { thumb: await encode(img, THUMB_MAX, 0.8) };
    if (copy) {
      out.copy = await encode(img, COPY_MAX, 0.86);
      if (out.copy.blob.size > 1.6 * 1024 * 1024) out.copy = await encode(img, COPY_MAX, 0.74);
    }
    return out;
  } finally {
    img.close?.();
  }
}

/** A 4096-px JPEG for originals too big to send. */
export async function scaledOriginal(blob) {
  const img = await decode(blob);
  try {
    return (await encode(img, 4096, 0.9)).blob;
  } finally {
    img.close?.();
  }
}

/** Is this a file the Pad can take? */
export const isImageFile = (file) => Boolean(file) && (/^image\//.test(file.type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name ?? ''));

/** When a chosen file was taken: the file's own date if it's in the past, else now. */
function takenAtOf(file) {
  const t = file?.lastModified;
  return t && t <= Date.now() && Date.now() - t > 120e3 ? new Date(t).toISOString() : nowISO();
}

/* ---------- Saving images ---------- */

async function putImage(record) {
  await saveRecord('padImages', record);
  if (record.deletedAt) images.delete(record.id);
  else images.set(record.id, record);
  emit('pad');
  return record;
}

/** Save several changed images together (one sync change each). */
async function putImages(list) {
  if (!list.length) return;
  await saveRecords(list.map((record) => ({ store: 'padImages', record })));
  for (const r of list) {
    if (r.deletedAt) images.delete(r.id);
    else images.set(r.id, r);
  }
  emit('pad');
}

const cleanTagIds = (ids) => [...new Set((ids ?? []).filter((id) => labels.get(id)?.kind === 'tag'))].slice(0, MAX_TAGS);
const cleanCategory = (id) => (id && labels.get(id)?.kind === 'category' ? id : null);

/**
 * Add one image file: its copy, thumbnail and original on this device, then its record.
 * Resolves with the record; throws an Error whose message says what's wrong with the file.
 */
export async function addImage(file, { title = '', note = '', categoryId = null, tagIds = [] } = {}) {
  const { copy, thumb } = await makeCopies(file);
  const now = nowISO();
  const id = uid();
  const record = {
    id, createdAt: now, updatedAt: now, deletedAt: null,
    title: oneLine(title, MAX_TITLE),
    note: lines(note, MAX_NOTE),
    categoryId: cleanCategory(categoryId),
    tagIds: cleanTagIds(tagIds),
    takenAt: takenAtOf(file),
    fileName: oneLine(file.name || 'Image', 200),
    width: copy.width, height: copy.height,
    originalSize: file.size, originalMime: String(file.type || 'image/jpeg').toLowerCase(),
    copyFileId: null, originalFileId: null,
  };
  await tx(['padFiles'], 'readwrite', (s) => {
    const files = { copy: copy.blob, thumb: thumb.blob, original: file.slice(0, file.size, file.type || 'image/jpeg') };
    Object.entries(files).forEach(([kind, blob]) => s.padFiles.put({ key: `${id}:${kind}`, imageId: id, kind, blob, savedAt: now }));
  });
  await putImage(record);
  emit('pad-files');
  return record;
}

/** Change an image's title, note, category or tags. */
export async function updateImage(id, patch) {
  const before = getImage(id);
  if (!before) return null;
  const next = { ...before, updatedAt: nowISO() };
  if ('title' in patch) next.title = oneLine(patch.title, MAX_TITLE);
  if ('note' in patch) next.note = lines(patch.note, MAX_NOTE);
  if ('categoryId' in patch) next.categoryId = cleanCategory(patch.categoryId);
  if ('tagIds' in patch) next.tagIds = cleanTagIds(patch.tagIds);
  for (const k of ['copyFileId', 'originalFileId', 'originalScaled']) if (k in patch) next[k] = patch[k];
  return putImage(next);
}

/** The same change to many images: fn(record) returns the patch. Resolves with the images as they were, for Undo. */
export async function updateImages(ids, fn) {
  const now = nowISO();
  const before = ids.map(getImage).filter(Boolean);
  const after = before.map((img) => {
    const patch = fn(img);
    return {
      ...img,
      ...('categoryId' in patch ? { categoryId: cleanCategory(patch.categoryId) } : {}),
      ...('tagIds' in patch ? { tagIds: cleanTagIds(patch.tagIds) } : {}),
      updatedAt: now,
    };
  });
  await putImages(after);
  return before;
}

/** Delete (soft, so it syncs; the sync script moves its Drive files to the trash). Resolves with the images as they were. */
export async function deleteImages(ids) {
  const now = nowISO();
  const before = ids.map(getImage).filter(Boolean);
  await putImages(before.map((img) => ({ ...img, deletedAt: now, updatedAt: now })));
  return before;
}

/** Undo: put images back as they were (a delete, or a change to many). */
export async function restoreImages(before) {
  const now = nowISO();
  const current = await Promise.all(before.map((img) => db.get('padImages', img.id)));
  await putImages(before.map((img, i) => ({
    ...img,
    // Files sent to Drive since then stay known
    copyFileId: current[i]?.copyFileId ?? img.copyFileId ?? null,
    originalFileId: current[i]?.originalFileId ?? img.originalFileId ?? null,
    deletedAt: null,
    updatedAt: now,
  })));
}

/* ---------- Categories and tags ---------- */

async function putLabel(record) {
  await saveRecord('padLabels', record);
  if (record.deletedAt) labels.delete(record.id);
  else labels.set(record.id, record);
  emit('pad');
  return record;
}

/** Make a category or tag (id null), or rename / recolour one. A new one with a name already used returns that one. */
export async function saveLabel(id, { kind, name, color }) {
  const clean = oneLine(name, MAX_LABEL);
  if (!clean) return null;
  const before = id ? getLabel(id) : findLabel(kind, clean);
  if (!id && before) return before;
  const now = nowISO();
  return putLabel({
    ...(before ?? { id: uid(), createdAt: now, kind: kind === 'tag' ? 'tag' : 'category' }),
    name: clean,
    color: colorOf(color ?? before?.color).id,
    updatedAt: now,
    deletedAt: null,
  });
}

/** A colour for a new label: the first one not used yet by that kind. */
export function nextColor(kind) {
  const used = new Set([...labels.values()].filter((l) => l.kind === kind).map((l) => l.color));
  return (COLORS.find((c) => !used.has(c.id)) ?? COLORS[labels.size % COLORS.length]).id;
}

/**
 * Delete a category (its images keep everything else, with no category) or a tag (taken off its images).
 * Resolves with what's needed to undo it.
 */
export async function deleteLabel(id) {
  const label = getLabel(id);
  if (!label) return null;
  const field = label.kind === 'tag' ? (img) => img.tagIds.includes(id) : (img) => img.categoryId === id;
  const ids = [...images.values()].filter(field).map((img) => img.id);
  const imagesBefore = await updateImages(ids, (img) => (label.kind === 'tag' ? { tagIds: img.tagIds.filter((t) => t !== id) } : { categoryId: null }));
  const now = nowISO();
  await putLabel({ ...label, deletedAt: now, updatedAt: now });
  return { label, imagesBefore };
}

export async function restoreLabel({ label, imagesBefore }) {
  await putLabel({ ...label, deletedAt: null, updatedAt: nowISO() });
  await restoreImages(imagesBefore);
}

/* ---------- Files on this device ---------- */

export const getFile = (imageId, kind) => db.get('padFiles', `${imageId}:${kind}`);
export const putFile = (imageId, kind, blob) => db.put('padFiles', { key: `${imageId}:${kind}`, imageId, kind, blob, savedAt: nowISO() });
export const removeFile = (imageId, kind) => db.delete('padFiles', `${imageId}:${kind}`);

/** Which files this device has, per image: Map(imageId → Set(kinds)). Reads keys only. */
export async function fileIndex() {
  const keys = await tx('padFiles', 'readonly', (s) => new Promise((resolve, reject) => {
    const req = s.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const map = new Map();
  keys.forEach((key) => {
    const [id, kind] = String(key).split(':');
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(kind);
  });
  return map;
}

/* Object URLs for showing files, made once per file and kept while the app is open */
const urls = new Map();

/** An object URL for an image's thumbnail or copy (falls back to the other), or null if this device has neither yet. */
export async function padUrl(imageId, kind = 'thumb') {
  const order = kind === 'thumb' ? ['thumb', 'copy'] : ['copy', 'thumb'];
  for (const k of order) {
    const key = `${imageId}:${k}`;
    if (urls.has(key)) return urls.get(key);
    const f = await db.get('padFiles', key);
    if (f?.blob) {
      const url = URL.createObjectURL(f.blob);
      urls.set(key, url);
      return url;
    }
  }
  return null;
}

/** Forget cached URLs of an image (after its files change). */
export function dropUrls(imageId) {
  for (const [key, url] of urls) {
    if (key.startsWith(`${imageId}:`)) {
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }
}
