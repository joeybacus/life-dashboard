/* Guidelines (0.11.0) — your shelf of guidelines: a title, a topic, a link,
   a PDF, or both, and a few notes.

   Synced between your devices (the Guidelines tab, sync script 20) and in
   backup files. A PDF stays on the device it was added on and is copied to the
   "Life Dashboard Guidelines" folder of your Google Drive; your other devices
   download their own copy (see guides-transfer.js), so it opens offline.

   Records in the guidelines store:
     { id, title, topic, url, notes,
       fileName, fileMime, fileSize, fileKey (new for every PDF chosen), fileId (its Drive file, once sent),
       createdAt, updatedAt, deletedAt }
   Files in the guidelineFiles store (this device only): { id: <guideline id>, key: <fileKey>, blob } */
import { db } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';

export const MAX_TITLE = 160;
export const MAX_TOPIC = 60;
export const MAX_URL = 2000;
export const MAX_NOTES = 4000;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

let guides = new Map(); // id → record (not deleted)

const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (text, max) => String(text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

/** A web address as typed, made usable ("nice.org.uk/…" → "https://nice.org.uk/…"); '' when it isn't one. */
export function cleanUrl(text) {
  const t = String(text ?? '').trim().slice(0, MAX_URL);
  if (!t) return '';
  const full = /^[a-z][\w+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(full);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

export const allGuides = () => [...guides.values()];
export const guide = (id) => guides.get(id) ?? null;

/** Topics in use, A to Z (for the topic box's suggestions and the page's groups). */
export const topics = () => [...new Set(allGuides().map((g) => g.topic).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

export async function loadGuides() {
  guides = new Map((await db.live('guidelines')).filter((r) => !r.sample).map((r) => [r.id, r]));
  emit('guides');
}

export async function initGuides() {
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore' || reason === 'reset') loadGuides(); });
  await loadGuides();
}

/* ---------- The PDFs on this device ---------- */

export const getFile = (id) => db.get('guidelineFiles', id);
export const putFile = (id, key, blob) => db.put('guidelineFiles', { id, key, blob });
export const removeFile = (id) => db.delete('guidelineFiles', id);
export const fileIndex = async () => new Map((await db.all('guidelineFiles')).map((f) => [f.id, f.key]));

/** The guideline's PDF on this device, or null (not downloaded yet, or an older one). */
export async function pdfOf(g) {
  if (!g?.fileKey) return null;
  const f = await getFile(g.id);
  return f && f.key === g.fileKey ? f.blob : null;
}

/** Is this a PDF the app can keep? Returns an error message, or ''. */
export function pdfProblem(file) {
  if (!file) return '';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
  if (!isPdf) return 'Please choose a PDF.';
  if (file.size > MAX_PDF_BYTES) return `This PDF is ${(file.size / 1048576).toFixed(0)} MB — the most is 25 MB.`;
  return '';
}

/* ---------- Saving ---------- */

async function put(record) {
  await saveRecord('guidelines', record);
  if (record.deletedAt) guides.delete(record.id);
  else guides.set(record.id, record);
  emit('guides');
  return record;
}

/**
 * Add or change a guideline. file: a new PDF (File/Blob), or null to keep the one
 * it has; removePdf: true takes its PDF away (the link and notes stay).
 */
export async function saveGuide(id, { title, topic, url, notes }, { file = null, removePdf = false } = {}) {
  const now = nowISO();
  const before = id ? guide(id) : null;
  const next = {
    ...(before ?? { id: uid(), createdAt: now, fileName: '', fileMime: '', fileSize: 0, fileKey: '', fileId: '' }),
    title: oneLine(title, MAX_TITLE),
    topic: oneLine(topic, MAX_TOPIC),
    url: cleanUrl(url),
    notes: lines(notes, MAX_NOTES),
    updatedAt: now,
    deletedAt: null,
  };
  if (file) {
    next.fileName = oneLine(file.name || 'Guideline.pdf', 200);
    next.fileMime = 'application/pdf';
    next.fileSize = file.size;
    next.fileKey = uid();
    next.fileId = ''; // sent to Drive in the background
    await putFile(next.id, next.fileKey, file.slice(0, file.size, 'application/pdf'));
  } else if (removePdf) {
    Object.assign(next, { fileName: '', fileMime: '', fileSize: 0, fileKey: '', fileId: '' });
    await removeFile(next.id);
  }
  await put(next);
  emit('guides-files');
  return next;
}

/** Note the PDF's Drive file once it's sent (only if it's still the same PDF). */
export async function setDriveId(id, fileKey, fileId) {
  const g = guide(id);
  if (!g || g.fileKey !== fileKey || g.fileId === fileId) return;
  await put({ ...g, fileId, updatedAt: nowISO() });
}

/** Delete (its PDF goes to the Drive trash once synced). Resolves with the record as it was, for Undo. */
export async function deleteGuide(id) {
  const g = guide(id);
  if (!g) return null;
  await put({ ...g, deletedAt: nowISO(), updatedAt: nowISO() });
  return g;
}

/** Undo a delete. */
export const restoreGuide = (before) => put({ ...before, deletedAt: null, updatedAt: nowISO() });
