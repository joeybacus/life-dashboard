/* Cases (0.11.0) — your teaching cases: what happened and what you learned.
   No patient names: the app reminds you, because cases sync to your Google
   Sheet (the Cases tab, sync script 20) and go into backup files.

   Records in the cases store:
     { id, title, date ("YYYY-MM-DD"), diagnosis, tags: [text], story, learning, createdAt, updatedAt, deletedAt } */
import { db } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';

export const MAX_TITLE = 160;
export const MAX_DIAGNOSIS = 200;
export const MAX_TAGS = 12;
export const MAX_TAG = 40;
export const MAX_STORY = 15000;
export const MAX_LEARNING = 8000;

let cases = new Map(); // id → record (not deleted)

const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (text, max) => String(text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

/** "stroke, #thrombolysis; teaching" → ['stroke', 'thrombolysis', 'teaching'] (no repeats). */
export function parseTags(text) {
  const seen = new Set();
  return String(text ?? '').split(/[,;\n]/).map((t) => oneLine(t.trim().replace(/^#+/, ''), MAX_TAG)).filter((t) => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, MAX_TAGS);
}

/** Newest first (by the case's date, then when it was added). */
export const allCases = () => [...cases.values()]
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
export const getCase = (id) => cases.get(id) ?? null;

/** Every tag in use, the most used first. */
export function allTags() {
  const count = new Map();
  for (const c of cases.values()) for (const t of c.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export async function loadCases() {
  cases = new Map((await db.live('cases')).filter((r) => !r.sample).map((r) => [r.id, { ...r, tags: Array.isArray(r.tags) ? r.tags : [] }]));
  emit('cases');
}

export async function initCases() {
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore' || reason === 'reset') loadCases(); });
  await loadCases();
}

async function put(record) {
  await saveRecord('cases', record);
  if (record.deletedAt) cases.delete(record.id);
  else cases.set(record.id, record);
  emit('cases');
  return record;
}

/** Add (id null) or change a case. */
export function saveCase(id, { title, date, diagnosis, tags, story, learning }) {
  const now = nowISO();
  const before = id ? getCase(id) : null;
  return put({
    ...(before ?? { id: uid(), createdAt: now }),
    title: oneLine(title, MAX_TITLE),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : '',
    diagnosis: oneLine(diagnosis, MAX_DIAGNOSIS),
    tags: Array.isArray(tags) ? tags.map((t) => oneLine(t, MAX_TAG)).filter(Boolean).slice(0, MAX_TAGS) : parseTags(tags),
    story: lines(story, MAX_STORY),
    learning: lines(learning, MAX_LEARNING),
    updatedAt: now,
    deletedAt: null,
  });
}

/** Resolves with the case as it was, for Undo. */
export async function deleteCase(id) {
  const c = getCase(id);
  if (!c) return null;
  await put({ ...c, deletedAt: nowISO(), updatedAt: nowISO() });
  return c;
}

export const restoreCase = (before) => put({ ...before, deletedAt: null, updatedAt: nowISO() });
