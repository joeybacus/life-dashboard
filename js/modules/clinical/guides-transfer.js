/* Moving guideline PDFs between this device and Google Drive, in the background
   (like progress photos — see photos/transfer.js).

   Up:   a PDF added here is sent to the "Life Dashboard Guidelines" Drive folder once sync is connected
         (script 20), and the guideline gets the Drive file's id. It stays on this device too.
   Down: a guideline from another device arrives (by sync) without its PDF: it's downloaded, so it opens
         offline here as well.
   One file at a time, never while offline; failures wait and try again (1, 5, 15 minutes). */
import { emit, on } from '../../core/events.js';
import { db } from '../../core/db.js';
import { SyncError, callSyncScript, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { fileIndex, getFile, putFile, removeFile, setDriveId } from './guides.js';

export const GUIDE_SCRIPT_VERSION = 20;
const RETRY_MS = [60e3, 5 * 60e3, 15 * 60e3];
const TIMEOUT_MS = 300_000;

const status = {
  running: false,
  up: new Set(),     // guideline ids with a PDF still to send
  down: new Set(),   // … whose PDF this device doesn't have yet
  error: null,       // { code, message } of the last failure
  blocked: null,     // 'not-connected' | 'script' | 'offline' | null
  missing: new Set(), // Drive file ids that aren't in the folder any more (not asked for again until the app restarts)
};
let retryStep = 0;
let retryTimer = null;
let again = false;

/** Where a guideline's PDF is: 'up' (waiting to go to Drive), 'down' (waiting to come here) or null. */
export const pdfState = (g) => (status.up.has(g.id) ? 'up' : status.down.has(g.id) ? 'down' : status.missing.has(g.fileId) ? 'missing' : null);
export const guideTransfers = () => ({ blocked: status.blocked, error: status.error, running: status.running, up: status.up.size, down: status.down.size });
const publish = () => emit('guides-transfer', guideTransfers());

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fromBase64(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

/** What needs doing: [{ g, job: 'up' | 'down' }], uploads first. Tidies files no guideline needs. */
async function plan() {
  const [records, files] = await Promise.all([db.all('guidelines'), fileIndex()]);
  const jobs = [];
  const byId = new Map(records.map((g) => [g.id, g]));
  for (const [id, key] of files) {
    const g = byId.get(id);
    // Gone, PDF removed, replaced by a newer one elsewhere, or deleted and safely in Drive
    if (!g || !g.fileKey || (g.fileKey !== key && g.fileId) || (g.deletedAt && g.fileId)) await removeFile(id);
  }
  const have = await fileIndex();
  for (const g of records) {
    if (g.deletedAt || g.sample || !g.fileKey) continue;
    const local = have.get(g.id) === g.fileKey;
    if (local && !g.fileId) jobs.push({ g, job: 'up' });
    else if (!local && g.fileId && !status.missing.has(g.fileId)) jobs.push({ g, job: 'down' });
  }
  jobs.sort((a, b) => (a.job === 'up' ? 0 : 1) - (b.job === 'up' ? 0 : 1));
  status.up = new Set(jobs.filter((j) => j.job === 'up').map((j) => j.g.id));
  status.down = new Set(jobs.filter((j) => j.job === 'down').map((j) => j.g.id));
  return jobs;
}

async function upload(g) {
  const file = await getFile(g.id);
  if (!file?.blob || file.key !== g.fileKey) return;
  const res = await callSyncScript('guideUpload', {
    id: g.id, key: g.fileKey, name: g.fileName, data: await toBase64(file.blob),
  }, { timeoutMs: TIMEOUT_MS });
  await setDriveId(g.id, g.fileKey, res.fileId);
}

async function download(g) {
  let res;
  try {
    res = await callSyncScript('guideDownload', { fileId: g.fileId }, { timeoutMs: TIMEOUT_MS });
  } catch (err) {
    if (err instanceof SyncError && (err.reason === 'guide-not-found' || err.reason === 'guide-trashed')) {
      status.missing.add(g.fileId); // deleted from Drive: nothing to download
      return;
    }
    throw err;
  }
  const latest = await db.get('guidelines', g.id);
  if (latest?.fileKey !== g.fileKey) return; // changed while downloading
  await putFile(g.id, g.fileKey, fromBase64(res.data));
  emit('guides-files');
}

/** Work through everything waiting (after changes, syncs, coming online and every few minutes). */
export async function runGuideTransfers() {
  if (status.running) {
    again = true;
    return;
  }
  status.running = true;
  try {
    const jobs = await plan();
    const connected = syncSnapshot().connected;
    const versionOk = (syncScriptVersion() ?? 0) >= GUIDE_SCRIPT_VERSION;
    status.blocked = !connected ? 'not-connected' : !versionOk ? 'script' : !navigator.onLine ? 'offline' : null;
    publish();
    for (const { g, job } of jobs) {
      if (status.blocked) break;
      if (job === 'up') await upload(g);
      else await download(g);
      await plan();
      publish();
    }
    status.error = null;
    retryStep = 0;
  } catch (err) {
    const reason = err instanceof SyncError ? (err.reason ?? err.code) : 'failed';
    status.error = { code: reason, message: err?.message ?? String(err) };
    clearTimeout(retryTimer);
    retryTimer = setTimeout(runGuideTransfers, RETRY_MS[Math.min(retryStep++, RETRY_MS.length - 1)]);
  } finally {
    status.running = false;
    await plan().catch(() => {});
    publish();
    if (again) {
      again = false;
      setTimeout(runGuideTransfers, 500);
    }
  }
}

let started = false;

export function initGuideTransfers() {
  if (started) return;
  started = true;
  let soon = null;
  const later = (ms = 1500) => { clearTimeout(soon); soon = setTimeout(runGuideTransfers, ms); };
  on('guides', () => later());
  on('sync', (s) => { if (s?.phase === 'idle') later(3000); });
  window.addEventListener('online', () => later(2000));
  setInterval(() => { if (document.visibilityState === 'visible') runGuideTransfers(); }, 5 * 60e3);
  later(5000);
}
