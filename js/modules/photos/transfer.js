/* Moving photo files between this device and Google Drive, in the background.

   Up:   a photo added here keeps its files on the device; once sync is connected (script 13), the copy and
         then the full original are sent to the "Life Dashboard Photos" Drive folder, and the photo's record
         gets their Drive ids. The original is then removed from the device unless "Keep full originals on
         this device" is on (Settings → Workout → Progress photos, per device).
   Down: a photo added on another device arrives (by sync) without files: its copy is downloaded and a
         thumbnail made, so it works offline here too.
   One file at a time, and never while offline; failures wait and try again later (1, 5, 15 minutes). */
import { emit, on, state, updateProfile } from '../../core/state.js';
import { SyncError, callSyncScript, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import {
  ORIGINAL_MAX_BYTES, dropUrls, fileIndex, getFile, loadPhotos, makeCopies, putFile, removeFile, scaledOriginal, updatePhoto,
} from './model.js';
import { db } from '../../core/db.js';

export const PHOTO_SCRIPT_VERSION = 13;
const RETRY_MS = [60e3, 5 * 60e3, 15 * 60e3];
const UPLOAD_TIMEOUT_MS = 300_000; // a big original on a slow connection

const status = {
  running: false,
  up: 0,          // photos with a file still to send
  down: 0,        // photos whose copy this device doesn't have yet
  error: null,    // { code, message } of the last failure
  blocked: null,  // 'not-connected' | 'script' | 'offline' | null — why nothing moves
};
let retryStep = 0;
let retryTimer = null;
let again = false;

export const transferStatus = () => ({ ...status });
const publish = () => emit('photos-transfer', transferStatus());

/** Base64 text of a blob (without the "data:…;base64," start). */
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

const keepOriginals = () => Boolean(state.ui?.keepPhotoOriginals);
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** The file's type as the sync script knows it (an unknown one is sent as JPEG, which it nearly always is). */
const sendable = (mime) => (TYPES.includes(String(mime || '').toLowerCase()) ? String(mime).toLowerCase() : 'image/jpeg');

/** What needs doing: [{ photo, job: 'copy' | 'original' | 'download' }], uploads first, oldest first. */
async function plan() {
  const [photos, files] = await Promise.all([loadPhotos(), fileIndex()]);
  const jobs = [];
  for (const p of photos) {
    if (p.sample) continue;
    const have = files.get(p.id) ?? new Set();
    if (!p.copyFileId && have.has('copy')) jobs.push({ photo: p, job: 'copy' });
    if (!p.originalFileId && have.has('original')) jobs.push({ photo: p, job: 'original' });
    if (p.originalFileId && have.has('original') && !keepOriginals()) await removeFile(p.id, 'original'); // safely in Drive
    if (p.copyFileId && !have.has('copy')) jobs.push({ photo: p, job: 'download' });
    else if (have.has('copy') && !have.has('thumb')) jobs.push({ photo: p, job: 'thumb' });
  }
  const order = { copy: 0, original: 1, thumb: 2, download: 3 };
  jobs.sort((a, b) => order[a.job] - order[b.job]);
  status.up = new Set(jobs.filter((j) => j.job === 'copy' || j.job === 'original').map((j) => j.photo.id)).size;
  status.down = jobs.filter((j) => j.job === 'download').length;
  return jobs;
}

async function upload(photo, kind) {
  const file = await getFile(photo.id, kind);
  if (!file?.blob) return;
  let blob = file.blob;
  let scaled = false;
  if (kind === 'original' && blob.size > ORIGINAL_MAX_BYTES) {
    blob = await scaledOriginal(blob);
    scaled = true;
  }
  const mime = blob.type;
  const res = await callSyncScript('photoUpload', {
    id: photo.id, kind, mime: sendable(mime),
    data: await toBase64(blob), takenAt: photo.takenAt,
  }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  await updatePhoto(photo.id, kind === 'copy' ? { copyFileId: res.fileId } : { originalFileId: res.fileId, ...(scaled ? { originalScaled: true } : {}) });
  if (kind === 'original' && !keepOriginals()) await removeFile(photo.id, 'original');
}

async function download(photo) {
  const res = await callSyncScript('photoDownload', { fileId: photo.copyFileId }, { timeoutMs: 120_000 });
  const blob = fromBase64(res.data, res.mime);
  const { thumb } = await makeCopies(blob, { copy: false });
  await putFile(photo.id, 'copy', blob);
  await putFile(photo.id, 'thumb', thumb.blob);
  dropUrls(photo.id);
  emit('data', { reason: 'photo-files' });
}

async function makeThumb(photo) {
  const file = await getFile(photo.id, 'copy');
  if (!file?.blob) return;
  const { thumb } = await makeCopies(file.blob, { copy: false });
  await putFile(photo.id, 'thumb', thumb.blob);
  dropUrls(photo.id);
}

/** The profile picture's full original goes to Drive too (the small one stays in your profile). */
async function uploadProfile() {
  const file = await db.get('photoFiles', 'profile:original');
  if (!file?.blob || !file.photoId) return false;
  const res = await callSyncScript('photoUpload', {
    id: file.photoId, kind: 'profile', mime: sendable(file.blob.type),
    data: await toBase64(file.blob),
  }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  if (state.profile?.photoId === file.photoId) await updateProfile({ photoFileId: res.fileId }, { source: 'photos' });
  await db.delete('photoFiles', 'profile:original');
  return true;
}

/** Work through everything waiting (called after changes, syncs, coming online and every few minutes). */
export async function runTransfers() {
  if (status.running) {
    again = true;
    return;
  }
  status.running = true;
  try {
    const jobs = await plan();
    const connected = syncSnapshot().connected;
    const versionOk = (syncScriptVersion() ?? 0) >= PHOTO_SCRIPT_VERSION;
    status.blocked = !connected ? 'not-connected' : !versionOk ? 'script' : !navigator.onLine ? 'offline' : null;
    publish();
    for (const { photo, job } of jobs) {
      if (job === 'thumb') {
        await makeThumb(photo).catch(() => {});
        continue;
      }
      if (status.blocked) break;
      if (job === 'download') await download(photo);
      else await upload(photo, job);
      await plan();
      publish();
    }
    if (!status.blocked) await uploadProfile();
    status.error = null;
    retryStep = 0;
  } catch (err) {
    status.error = { code: err instanceof SyncError ? (err.reason ?? err.code) : 'failed', message: err?.message ?? String(err) };
    clearTimeout(retryTimer);
    retryTimer = setTimeout(runTransfers, RETRY_MS[Math.min(retryStep++, RETRY_MS.length - 1)]);
  } finally {
    status.running = false;
    await plan().catch(() => {});
    publish();
    if (again) {
      again = false;
      setTimeout(runTransfers, 500);
    }
  }
}

let started = false;

export function initPhotoTransfers() {
  if (started) return;
  started = true;
  let soon = null;
  const later = (ms = 1500) => { clearTimeout(soon); soon = setTimeout(runTransfers, ms); };
  on('data', ({ reason } = {}) => { if (reason !== 'photo-files') later(); });
  on('sync', (s) => { if (s?.phase === 'idle') later(3000); });
  window.addEventListener('online', () => later(2000));
  setInterval(() => { if (document.visibilityState === 'visible') runTransfers(); }, 5 * 60e3);
  later(4000);
}
