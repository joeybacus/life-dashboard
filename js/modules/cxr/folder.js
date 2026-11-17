/* Chest X-rays: the CXR_Downloads folder on this computer, and what's in it.

   Like the CT scans (ct/folder.js), the pictures never leave the computer: the
   browser is only given permission to READ the folder that cxr_download.py
   fills, and the viewer shows each picture straight from the disk.

   The folder looks like this (cxr_download.py):
     CXR_Downloads/<hospital no.>/<YYYY-MM-DD HHMM Description>/0001.dcm + 0001.png
   75% and 50% downloads are 0001_75pct.png / 0001_50pct.png. A study can hold
   more than one picture (a PA and a lateral): 0001, 0002 …

   The viewer shows the PNG that cxr_download.py makes beside each DICOM (the
   picture as Synapse shows it). Of the PNGs of one picture, the best quality
   that's there is used.

   Reaching the folder works the same as for CT scans:
   - Chrome / Edge: a folder handle, remembered on this device in its own small
     database (never in backups or the Sheet). After a restart the browser asks
     once more with one "Allow" click.
   - Safari / Firefox: the usual folder picker, chosen again each time. */
import { emit } from '../../core/events.js';
import { hnFolder } from '../ct/folder.js';

export { hnFolder };

const STUDY_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2}) (.+)$/;
const FILE_RE = /^(\d+)(?:_(\d+)pct)?\.(png|dcm)$/i;
const HANDLE_DB = 'life-dashboard-cxr';

export const canRemember = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* state: 'none' (no folder yet), 'ask' (remembered, needs an Allow click), 'ready' */
const folder = { state: 'none', name: '', handle: null, files: null };
const indexCache = new Map(); // hospital no. → Promise<studies>

export const folderState = () => ({ state: folder.state, name: folder.name });

/* ---------- Remembering the folder (Chrome / Edge) ---------- */

function handleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function handleStore(mode, fn) {
  const dbh = await handleDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = dbh.transaction('handles', mode);
      const req = fn(tx.objectStore('handles'));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    dbh.close();
  }
}

function changed() {
  indexCache.clear();
  emit('cxr');
}

/** On start: pick up the folder chosen earlier on this device, if any. */
export async function restoreFolder() {
  if (!canRemember || folder.state === 'ready') return;
  try {
    const handle = await handleStore('readonly', (s) => s.get('root'));
    if (!handle) return;
    folder.handle = handle;
    folder.name = handle.name;
    folder.state = (await handle.queryPermission({ mode: 'read' })) === 'granted' ? 'ready' : 'ask';
    changed();
  } catch (err) {
    console.warn('CXR folder', err);
  }
}

/** The "Allow" click after a restart (must come from a tap or click). */
export async function allowFolder() {
  if (!folder.handle) return false;
  const ok = (await folder.handle.requestPermission({ mode: 'read' })) === 'granted';
  folder.state = ok ? 'ready' : 'ask';
  changed();
  return ok;
}

/** Choose the folder: CXR_Downloads itself, or one patient's folder inside it. */
export async function chooseFolder(input) {
  if (canRemember) {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'cxr-downloads', mode: 'read' });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
    folder.handle = handle;
    folder.files = null;
    folder.name = handle.name;
    folder.state = 'ready';
    await handleStore('readwrite', (s) => s.put(handle, 'root')).catch((err) => console.warn('CXR folder', err));
    changed();
    return true;
  }
  // Safari / Firefox: the folder picker of a file box
  const files = [...(input?.files ?? [])].filter((f) => FILE_RE.test(f.name));
  if (!files.length) return false;
  folder.handle = null;
  folder.files = files;
  folder.name = (files[0].webkitRelativePath || '').split('/')[0] || 'the folder';
  folder.state = 'ready';
  changed();
  return true;
}

/* ---------- What's in it ---------- */

function studyOf(name) {
  const m = STUDY_RE.exec(name);
  return m ? { folder: name, date: m[1], time: `${m[2]}:${m[3]}`, type: m[4], files: [] } : null;
}

/** A study's files → its pictures, each with the best PNG there is. */
function finish(studies) {
  for (const s of studies) {
    const byNo = new Map();
    for (const f of s.files) {
      const m = FILE_RE.exec(f.name);
      if (!m) continue;
      const n = Number(m[1]);
      const pic = byNo.get(n) ?? { n, quality: 0, get: null, dcm: false };
      byNo.set(n, pic);
      if (m[3].toLowerCase() === 'dcm') { pic.dcm = true; continue; }
      const quality = m[2] ? Number(m[2]) : 100;
      if (quality > pic.quality) { pic.quality = quality; pic.get = f.get; }
    }
    s.pictures = [...byNo.values()].sort((a, b) => a.n - b.n);
    delete s.files;
  }
  return studies.filter((s) => s.pictures.length).sort((a, b) => b.folder.localeCompare(a.folder)); // newest first
}

async function childDir(dir, name) {
  try { return await dir.getDirectoryHandle(name); } catch { return null; }
}

/** One patient's studies through the folder handle. */
async function listFromHandle(hn) {
  const root = folder.handle;
  const patient = root.name === hn ? root : await childDir(root, hn);
  if (!patient) return [];
  const studies = [];
  for await (const [name, entry] of patient.entries()) {
    const study = entry.kind === 'directory' ? studyOf(name) : null;
    if (!study) continue;
    for await (const [fileName, fileEntry] of entry.entries()) {
      if (fileEntry.kind === 'file' && FILE_RE.test(fileName)) study.files.push({ name: fileName, get: () => fileEntry.getFile() });
    }
    studies.push(study);
  }
  return finish(studies);
}

/** One patient's studies from the picked files (Safari / Firefox). */
function listFromFiles(hn) {
  const studies = new Map();
  for (const file of folder.files) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    if (parts.length < 3) continue;
    const [patientName, studyName] = parts.slice(-3, -1);
    if (patientName !== hn) continue;
    const study = studies.get(studyName) ?? studyOf(studyName);
    if (!study) continue;
    studies.set(studyName, study);
    study.files.push({ name: file.name, get: async () => file });
  }
  return finish([...studies.values()]);
}

/** A patient's downloaded chest X-rays, newest first (empty when there are none or no folder). */
export function patientXrays(hn) {
  const key = hnFolder(hn);
  if (folder.state !== 'ready' || !key) return Promise.resolve([]);
  if (!indexCache.has(key)) {
    const job = (folder.handle ? listFromHandle(key) : Promise.resolve(listFromFiles(key)))
      .catch((err) => { indexCache.delete(key); throw err; });
    indexCache.set(key, job);
  }
  return indexCache.get(key);
}

/** Look again (new downloads since the folder was read). */
export function rescan() {
  changed();
}
