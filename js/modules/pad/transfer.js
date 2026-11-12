/* Moving Neuro Pad images between this device and Google Drive, in the background
   (like progress photos — see photos/transfer.js).

   Up:   an image added here keeps its files on the device; once sync is connected (script 21), the copy and
         then the full original are sent to the "Life Dashboard Neuro Pad" Drive folder, and the image's record
         gets their Drive ids. The original is then removed from this device (the copy stays) — "Full quality"
         on the image's page fetches it from Drive when you want it.
   Down: an image added on another device arrives (by sync) without files: its copy is downloaded and a
         thumbnail made, so it works offline here too.
   One file at a time, and never while offline; failures wait and try again later (1, 5, 15 minutes). */
import { emit, on } from '../../core/events.js';
import { db } from '../../core/db.js';
import { SyncError, callSyncScript, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import {
  ORIGINAL_MAX_BYTES, dropUrls, fileIndex, getFile, makeCopies, putFile, removeFile, scaledOriginal, updateImage,
} from './model.js';

export const PAD_SCRIPT_VERSION = 21;
const RETRY_MS = [60e3, 5 * 60e3, 15 * 60e3];
const UPLOAD_TIMEOUT_MS = 300_000; // a big original on a slow connection
const UNDO_WINDOW_MS = 10 * 60e3;  // files of a deleted image stay this long, so Undo still has them

const status = {
  running: false,
  up: new Set(),     // image ids with a file still to send
  down: new Set(),   // … whose copy this device doesn't have yet
  error: null,       // { code, message } of the last failure
  blocked: null,     // 'not-connected' | 'script' | 'offline' | null — why nothing moves
  missing: new Set(), // Drive file ids that aren't in the folder any more (not asked for again until the app restarts)
};
let retryStep = 0;
let retryTimer = null;
let again = false;

/** Where an image's files are: 'up' (waiting to go to Drive), 'down' (waiting to come here), 'missing' or null. */
export const imageState = (img) => (status.up.has(img.id) ? 'up' : status.down.has(img.id) ? 'down' : status.missing.has(img.copyFileId) ? 'missing' : null);
export const padTransfers = () => ({ blocked: status.blocked, error: status.error, running: status.running, up: status.up.size, down: status.down.size });
const publish = () => emit('pad-transfer', padTransfers());

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fromBase64(text, mime) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/jpeg' });
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
/** Types the sync script keeps as they are; anything else (BMP, AVIF…) is sent as a JPEG made from it. */
const sendable = (mime) => TYPES.includes(String(mime || '').toLowerCase());

/** What needs doing: [{ img, job: 'copy' | 'original' | 'thumb' | 'download' }], uploads first. Tidies files no image needs. */
async function plan() {
  const [records, files] = await Promise.all([db.all('padImages'), fileIndex()]);
  const byId = new Map(records.map((r) => [r.id, r]));
  const jobs = [];
  for (const [id, kinds] of files) {
    const r = byId.get(id);
    const gone = !r || (r.deletedAt && Date.now() - Date.parse(r.deletedAt) > UNDO_WINDOW_MS);
    if (gone) {
      for (const k of kinds) await removeFile(id, k);
      dropUrls(id);
    }
  }
  for (const img of records) {
    if (img.deletedAt || img.sample) continue;
    const have = files.get(img.id) ?? new Set();
    if (!img.copyFileId && have.has('copy')) jobs.push({ img, job: 'copy' });
    if (!img.originalFileId && have.has('original')) jobs.push({ img, job: 'original' });
    if (img.originalFileId && have.has('original')) await removeFile(img.id, 'original'); // safely in Drive
    if (img.copyFileId && !have.has('copy') && !status.missing.has(img.copyFileId)) jobs.push({ img, job: 'download' });
    else if (have.has('copy') && !have.has('thumb')) jobs.push({ img, job: 'thumb' });
  }
  const order = { copy: 0, original: 1, thumb: 2, download: 3 };
  jobs.sort((a, b) => order[a.job] - order[b.job]);
  status.up = new Set(jobs.filter((j) => j.job === 'copy' || j.job === 'original').map((j) => j.img.id));
  status.down = new Set(jobs.filter((j) => j.job === 'download').map((j) => j.img.id));
  return jobs;
}

async function upload(img, kind) {
  const file = await getFile(img.id, kind);
  if (!file?.blob) return;
  let blob = file.blob;
  let scaled = false;
  if (kind === 'original' && (blob.size > ORIGINAL_MAX_BYTES || !sendable(blob.type || img.originalMime))) {
    blob = await scaledOriginal(blob);
    scaled = true;
  }
  const mime = kind === 'copy' || scaled ? 'image/jpeg' : String(blob.type || img.originalMime).toLowerCase();
  const res = await callSyncScript('padUpload', {
    id: img.id, kind, mime, data: await toBase64(blob), name: img.title || img.fileName || '',
  }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  await updateImage(img.id, kind === 'copy' ? { copyFileId: res.fileId } : { originalFileId: res.fileId, ...(scaled ? { originalScaled: true } : {}) });
  if (kind === 'original') await removeFile(img.id, 'original');
}

async function download(img) {
  let res;
  try {
    res = await callSyncScript('padDownload', { fileId: img.copyFileId }, { timeoutMs: 120_000 });
  } catch (err) {
    if (err instanceof SyncError && (err.reason === 'pad-not-found' || err.reason === 'pad-trashed')) {
      status.missing.add(img.copyFileId); // deleted from Drive: nothing to download
      return;
    }
    throw err;
  }
  const blob = fromBase64(res.data, res.mime);
  const { thumb } = await makeCopies(blob, { copy: false });
  await putFile(img.id, 'copy', blob);
  await putFile(img.id, 'thumb', thumb.blob);
  dropUrls(img.id);
  emit('pad-files');
}

async function makeThumb(img) {
  const file = await getFile(img.id, 'copy');
  if (!file?.blob) return;
  const { thumb } = await makeCopies(file.blob, { copy: false });
  await putFile(img.id, 'thumb', thumb.blob);
  dropUrls(img.id);
}

/* The full original, fetched from Drive when asked for (kept in memory while the app is open) */
const originals = new Map(); // image id → Blob

/** The image's full original: from this device if it's still here, else from Google Drive. Throws when it can't. */
export async function fullOriginal(img) {
  const local = await getFile(img.id, 'original');
  if (local?.blob) return local.blob;
  if (originals.has(img.id)) return originals.get(img.id);
  if (!img.originalFileId) return null;
  const res = await callSyncScript('padDownload', { fileId: img.originalFileId }, { timeoutMs: 180_000 });
  const blob = fromBase64(res.data, res.mime);
  originals.set(img.id, blob);
  return blob;
}

/** Work through everything waiting (after changes, syncs, coming online and every few minutes). */
export async function runPadTransfers() {
  if (status.running) {
    again = true;
    return;
  }
  status.running = true;
  try {
    const jobs = await plan();
    const connected = syncSnapshot().connected;
    const versionOk = (syncScriptVersion() ?? 0) >= PAD_SCRIPT_VERSION;
    status.blocked = !connected ? 'not-connected' : !versionOk ? 'script' : !navigator.onLine ? 'offline' : null;
    publish();
    for (const { img, job } of jobs) {
      if (job === 'thumb') {
        await makeThumb(img).catch(() => {});
        continue;
      }
      if (status.blocked) break;
      const latest = await db.get('padImages', img.id);
      if (!latest || latest.deletedAt) continue; // deleted meanwhile
      if (job === 'download') await download(latest);
      else await upload(latest, job);
      await plan();
      publish();
    }
    status.error = null;
    retryStep = 0;
  } catch (err) {
    status.error = { code: err instanceof SyncError ? (err.reason ?? err.code) : 'failed', message: err?.message ?? String(err) };
    clearTimeout(retryTimer);
    retryTimer = setTimeout(runPadTransfers, RETRY_MS[Math.min(retryStep++, RETRY_MS.length - 1)]);
  } finally {
    status.running = false;
    await plan().catch(() => {});
    publish();
    if (again) {
      again = false;
      setTimeout(runPadTransfers, 500);
    }
  }
}

let started = false;

export function initPadTransfers() {
  if (started) return;
  started = true;
  let soon = null;
  const later = (ms = 1500) => { clearTimeout(soon); soon = setTimeout(runPadTransfers, ms); };
  on('pad', () => later());
  on('sync', (s) => { if (s?.phase === 'idle') later(3000); });
  window.addEventListener('online', () => later(2000));
  setInterval(() => { if (document.visibilityState === 'visible') runPadTransfers(); }, 5 * 60e3);
  later(5000);
}
