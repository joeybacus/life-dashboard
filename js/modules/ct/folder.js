/* CT scans: the CT_Downloads folder on this computer, and what's in it.

   The scans never leave the computer: the browser is given permission to READ
   the folder that ct_download.py fills, and the viewer reads each slice from
   the disk. Nothing is uploaded, synced or copied into the app.

   The folder looks like this (ct_download.py):
     CT_Downloads/<hospital no.>/<YYYY-MM-DD HHMM Type>/<plain|contrast>_1mm[_50pct]/0001.dcm …

   Two ways to reach it:
   - Chrome / Edge: a folder handle, remembered on this device (its own small
     database, not the app's — it never goes into backups or the Sheet). After a
     restart the browser asks once more with one "Allow" click.
   - Safari / Firefox: the usual folder picker. The browser forgets the choice
     when the app is closed, so the folder is picked again each time. */
import { emit } from '../../core/events.js';

const STUDY_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2}) (.+)$/;
const CUT_RE = /^(plain|contrast)_1mm(?:_(\d+)pct)?$/;
const HANDLE_DB = 'life-dashboard-ct';

export const canRemember = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* state: 'none' (no folder yet), 'ask' (remembered, needs an Allow click), 'ready' */
const folder = { state: 'none', name: '', handle: null, files: null };
const indexCache = new Map(); // hospital no. → Promise<studies>

export const folderState = () => ({ state: folder.state, name: folder.name });

/** The hospital number as a folder name: no spaces, capitals, no leading zeros (like ct_download.py). */
export function hnFolder(hn) {
  const text = String(hn ?? '').replace(/\s+/g, '').replace(/^'/, '').toUpperCase();
  return /^\d+$/.test(text) ? (text.replace(/^0+/, '') || '0') : text;
}

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
  emit('ct');
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
    console.warn('CT folder', err);
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

/** Choose the folder: CT_Downloads itself, or one patient's folder inside it. */
export async function chooseFolder(input) {
  if (canRemember) {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'ct-downloads', mode: 'read' });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
    folder.handle = handle;
    folder.files = null;
    folder.name = handle.name;
    folder.state = 'ready';
    await handleStore('readwrite', (s) => s.put(handle, 'root')).catch((err) => console.warn('CT folder', err));
    changed();
    return true;
  }
  // Safari / Firefox: the folder picker of a file box
  const files = [...(input?.files ?? [])].filter((f) => /\.dcm$/i.test(f.name));
  if (!files.length) return false;
  folder.handle = null;
  folder.files = files;
  folder.name = (files[0].webkitRelativePath || '').split('/')[0] || 'the folder';
  folder.state = 'ready';
  changed();
  return true;
}

/** Stop using the folder on this device. */
export async function forgetFolder() {
  folder.handle = null;
  folder.files = null;
  folder.name = '';
  folder.state = 'none';
  await handleStore('readwrite', (s) => s.delete('root')).catch(() => {});
  changed();
}

/* ---------- What's in it ---------- */

function studyOf(name) {
  const m = STUDY_RE.exec(name);
  return m
    ? { folder: name, date: m[1], time: `${m[2]}:${m[3]}`, type: m[4].replace(/\+/g, ' + '), cuts: [] }
    : null;
}

function cutOf(name) {
  const m = CUT_RE.exec(name);
  return m ? { name, kind: m[1], quality: m[2] ? Number(m[2]) : 100, files: [] } : null;
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

function finish(studies) {
  for (const s of studies) {
    s.cuts = s.cuts.filter((c) => c.files.length);
    s.cuts.forEach((c) => c.files.sort(byName));
    s.cuts.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'plain' ? -1 : 1) : b.quality - a.quality));
  }
  return studies.filter((s) => s.cuts.length).sort((a, b) => b.folder.localeCompare(a.folder)); // newest first
}

async function childDir(dir, name) {
  try { return await dir.getDirectoryHandle(name); } catch { return null; }
}

/** One patient's studies through the folder handle. Each cut's files are { name, read() }. */
async function listFromHandle(hn) {
  const root = folder.handle;
  const patient = root.name === hn ? root : await childDir(root, hn);
  if (!patient) return [];
  const studies = [];
  for await (const [name, entry] of patient.entries()) {
    const study = entry.kind === 'directory' ? studyOf(name) : null;
    if (!study) continue;
    for await (const [cutName, cutEntry] of entry.entries()) {
      const cut = cutEntry.kind === 'directory' ? cutOf(cutName) : null;
      if (!cut) continue;
      for await (const [fileName, fileEntry] of cutEntry.entries()) {
        if (fileEntry.kind === 'file' && /\.dcm$/i.test(fileName)) {
          cut.files.push({ name: fileName, read: async () => (await fileEntry.getFile()).arrayBuffer() });
        }
      }
      study.cuts.push(cut);
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
    if (parts.length < 4) continue;
    const [patientName, studyName, cutName] = parts.slice(-4, -1);
    if (patientName !== hn) continue;
    const study = studies.get(studyName) ?? studyOf(studyName);
    const cut = cutOf(cutName);
    if (!study || !cut) continue;
    studies.set(studyName, study);
    let same = study.cuts.find((c) => c.name === cutName);
    if (!same) study.cuts.push(same = cut);
    same.files.push({ name: file.name, read: () => file.arrayBuffer() });
  }
  return finish([...studies.values()]);
}

/** A patient's downloaded CT studies, newest first (empty when there are none or no folder). */
export function patientStudies(hn) {
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
