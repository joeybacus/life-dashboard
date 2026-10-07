/* Progress photos (Phase 6): the records, the image files on this device, and
   the pure rules (labels, grouping) that tools/photos-checks.html tests.

   A photo is two things:
   - a record in "progressPhotos" (synced to the Progress photos tab, in backups):
       { id, createdAt, updatedAt, deletedAt,
         takenAt,                     when the photo was taken (from the photo itself, or when you added it)
         pose: 'front' | 'side' | 'back' | null,
         note,
         weightKg,                    your latest weight at the time (Health), or null
         workoutId, workoutTitle,     that day's workout, if any
         muscleGroups,                …and what it trained
         width, height,               of the copy
         originalFileId, copyFileId   its two files in the "Life Dashboard Photos" Drive folder (once uploaded)
         originalScaled }             true if the original was too big to send and a 4096-px version went instead
   - files in "photoFiles" on this device only: the copy (≈1 MB, ≤ 2048 px), a thumbnail (≈ 480 px), and —
     until it's safely in Drive — the full original. Other devices download the copy from Drive. */
import { db, stamp, tx } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit } from '../../core/events.js';
import { toDateKey } from '../../core/dates.js';

export const POSES = { front: 'Front', side: 'Side', back: 'Back' };
export const COPY_MAX = 2048;   // longest side of the copy every device keeps
export const THUMB_MAX = 480;   // longest side of the gallery thumbnail
export const ORIGINAL_MAX_BYTES = 28 * 1024 * 1024; // bigger originals are sent as a 4096-px version

/* ---------- Pure rules ---------- */

/** Live photos, oldest first. */
export function sortPhotos(photos) {
  return photos.filter((p) => !p.deletedAt).sort((a, b) => String(a.takenAt).localeCompare(String(b.takenAt)));
}

/**
 * Labels for a photo taken at `takenAt`: that day's workout (the one nearest in time), and the latest
 * weigh-in at or before the photo — from up to 14 days before (older weights would mislead).
 */
export function autoLabels(takenAt, workouts = [], weights = []) {
  const t = new Date(takenAt);
  const day = toDateKey(t);
  const sameDay = workouts.filter((w) => w.endedAt && !w.deletedAt && toDateKey(new Date(w.startedAt)) === day)
    .sort((a, b) => Math.abs(Date.parse(a.startedAt) - t) - Math.abs(Date.parse(b.startedAt) - t));
  const w = sameDay[0] ?? null;
  const before = weights.filter((m) => m.kind === 'weight' && !m.deletedAt && Date.parse(m.measuredAt) <= t.getTime() + 12 * 3600e3
    && Date.parse(m.measuredAt) >= t.getTime() - 14 * 864e5)
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  return {
    workoutId: w?.id ?? null,
    workoutTitle: w?.title ?? null,
    muscleGroups: w?.muscleGroups ?? [],
    weightKg: before[0]?.valueKg ?? null,
  };
}

/** Photos grouped by month, newest month first: [{ key: '2026-10', date, photos (newest first) }]. */
export function byMonth(photos) {
  const groups = new Map();
  [...photos].sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt))).forEach((p) => {
    const d = new Date(p.takenAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { key, date: new Date(d.getFullYear(), d.getMonth(), 1), photos: [] });
    groups.get(key).photos.push(p);
  });
  return [...groups.values()];
}

/** Photos per local day: Map('YYYY-MM-DD' → photos). */
export function byDay(photos) {
  const map = new Map();
  photos.forEach((p) => {
    const key = toDateKey(new Date(p.takenAt));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return map;
}

/** Two photos to compare first: the oldest and the newest of the same pose (the newest photo's pose). */
export function defaultPair(photos) {
  const list = sortPhotos(photos);
  if (list.length < 2) return null;
  const latest = list.at(-1);
  const same = list.filter((p) => p.pose === latest.pose && p.id !== latest.id);
  return [(same[0] ?? list[0]).id, latest.id];
}

/** The photo nearest a day (for "jump to a date"). */
export function nearestTo(photos, dateKey) {
  const t = new Date(`${dateKey}T12:00:00`).getTime();
  let best = null;
  photos.forEach((p) => { if (!best || Math.abs(Date.parse(p.takenAt) - t) < Math.abs(Date.parse(best.takenAt) - t)) best = p; });
  return best;
}

/**
 * The date a JPEG was taken, from its EXIF data (DateTimeOriginal, else DateTime), as a local Date —
 * or null. `buffer` is an ArrayBuffer of the start of the file (the first 128 KB is plenty).
 */
export function exifDate(buffer) {
  try {
    const v = new DataView(buffer);
    if (v.getUint16(0) !== 0xffd8) return null; // not a JPEG
    let o = 2;
    while (o + 4 < v.byteLength) {
      const marker = v.getUint16(o);
      const size = v.getUint16(o + 2);
      if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return tiffDate(v, o + 10);
      if ((marker & 0xff00) !== 0xff00) return null;
      o += 2 + size;
    }
  } catch { /* damaged or cut short */ }
  return null;
}

function tiffDate(v, start) {
  const little = v.getUint16(start) === 0x4949;
  const u16 = (at) => v.getUint16(at, little);
  const u32 = (at) => v.getUint32(at, little);
  const readAscii = (at, n) => {
    let s = '';
    for (let i = 0; i < n - 1 && at + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(at + i));
    return s;
  };
  const scan = (ifd) => {
    const out = {};
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e);
      if (tag === 0x8769) out.exif = start + u32(e + 8);
      else if (tag === 0x9003 || tag === 0x0132) out[tag] = readAscii(start + u32(e + 8), u32(e + 4));
    }
    return out;
  };
  const ifd0 = scan(start + u32(start + 4));
  const sub = ifd0.exif ? scan(ifd0.exif) : {};
  const text = sub[0x9003] || ifd0[0x0132];
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1990 ? null : d;
}

/* ---------- Images ---------- */

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
    throw new Error('This photo couldn’t be opened. Try a JPEG or HEIC photo from your camera or library.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(img, max, quality) {
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('This photo appears to be empty.');
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve({ blob: b, width: canvas.width, height: canvas.height }) : reject(new Error('This photo couldn’t be saved.'))),
    'image/jpeg', quality,
  ));
}

/** The copy (≤ 2048 px, about 1 MB) and the thumbnail made from a chosen photo or a downloaded copy. */
export async function makeCopies(blob, { copy = true } = {}) {
  const img = await decode(blob);
  const out = { thumb: await encode(img, THUMB_MAX, 0.78) };
  if (copy) {
    out.copy = await encode(img, COPY_MAX, 0.85);
    if (out.copy.blob.size > 1.6 * 1024 * 1024) out.copy = await encode(img, COPY_MAX, 0.72);
  }
  img.close?.();
  return out;
}

/** A 4096-px JPEG for originals too big to send. */
export async function scaledOriginal(blob) {
  const img = await decode(blob);
  const out = await encode(img, 4096, 0.9);
  img.close?.();
  return out.blob;
}

/** When a chosen file was taken: its EXIF date, else the file's own date if it's in the past, else now. */
export async function takenAtOf(file) {
  try {
    const d = exifDate(await file.slice(0, 131072).arrayBuffer());
    if (d && d.getTime() <= Date.now() + 60e3) return d;
  } catch { /* fall through */ }
  if (file.lastModified && file.lastModified <= Date.now() && Date.now() - file.lastModified > 120e3) return new Date(file.lastModified);
  return new Date();
}

/* ---------- Saving ---------- */

export const photosChanged = (detail = 'photos') => emit('data', { reason: detail });

export async function loadPhotos() {
  return sortPhotos(await db.all('progressPhotos'));
}

export async function loadPhoto(id) {
  const p = await db.get('progressPhotos', id);
  return p && !p.deletedAt ? p : null;
}

/** Save a new photo: its record and its files (copy, thumbnail, original) together. */
export async function addPhoto(record, files) {
  const saved = stamp({ pose: null, note: '', originalFileId: null, copyFileId: null, ...record });
  await tx(['photoFiles'], 'readwrite', (s) => {
    Object.entries(files).forEach(([kind, blob]) => { if (blob) s.photoFiles.put({ key: `${saved.id}:${kind}`, photoId: saved.id, kind, blob, savedAt: saved.createdAt }); });
  });
  await saveRecord('progressPhotos', saved);
  photosChanged();
  return saved;
}

export async function updatePhoto(id, patch) {
  const current = await db.get('progressPhotos', id);
  if (!current) return null;
  const saved = stamp({ ...current, ...patch });
  await saveRecord('progressPhotos', saved);
  photosChanged();
  return saved;
}

/** Delete (soft, so it syncs; the sync script moves its Drive files to the trash). Returns the record for Undo. */
export async function deletePhoto(id) {
  const current = await db.get('progressPhotos', id);
  if (!current) return null;
  await saveRecord('progressPhotos', stamp({ ...current, deletedAt: new Date().toISOString() }));
  photosChanged();
  return current;
}

export async function restorePhoto(record) {
  const current = await db.get('progressPhotos', record.id);
  await saveRecord('progressPhotos', stamp({ ...(current ?? record), deletedAt: null }));
  photosChanged();
}

/* ---------- Files on this device ---------- */

export const getFile = (photoId, kind) => db.get('photoFiles', `${photoId}:${kind}`);

export async function putFile(photoId, kind, blob) {
  await db.put('photoFiles', { key: `${photoId}:${kind}`, photoId, kind, blob, savedAt: new Date().toISOString() });
}

export const removeFile = (photoId, kind) => db.delete('photoFiles', `${photoId}:${kind}`);

/** Which files this device has, per photo: Map(photoId → Set(kinds)). Reads keys only. */
export async function fileIndex() {
  const keys = await tx('photoFiles', 'readonly', (s) => new Promise((resolve, reject) => {
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

/** An object URL for a photo's thumbnail or copy (falls back to the other), or null if this device has neither yet. */
export async function photoUrl(photoId, kind = 'thumb') {
  const order = kind === 'thumb' ? ['thumb', 'copy'] : ['copy', 'thumb'];
  for (const k of order) {
    const key = `${photoId}:${k}`;
    if (urls.has(key)) return urls.get(key);
    const f = await db.get('photoFiles', key);
    if (f?.blob) {
      const url = URL.createObjectURL(f.blob);
      urls.set(key, url);
      return url;
    }
  }
  return null;
}

/** Forget cached URLs of a photo (after its files change). */
export function dropUrls(photoId) {
  for (const [key, url] of urls) {
    if (key.startsWith(`${photoId}:`)) {
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }
}

/** Ask the browser to keep the app's storage (so iPhone doesn't clear photos to make room). Once. */
export async function keepStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}
