/* NCCU/ACSU — a box per bed (6 in NCCU, 8 in ACSU) with the patient's name,
   diagnosis and endorsement notes, typed in the app, and one to-do list for
   the duty. Nothing clears by itself: you clear ticked to-dos, or a whole
   bed, when you want.

   Synced between your devices like Referrals (the NCCU-ACSU tab of your
   LIFE DASHBOARD sheet, sync script 15), but never in backup files.

   Records in the units store:
     { id: "bed:<unit>:<n>", type: 'bed', unit: 'nccu' | 'acsu', bed: n, name, diagnosis, notes,
       todos: [{ id, cat, text, done, doneAt }], createdAt, updatedAt, deletedAt }
       (made the first time a bed is used)
     { id: 'settings', type: 'settings', cats: [{ id, name }], … }
       (the subcategories boxes had before 0.10.5 — only read to move the old
       "Endorse" to-dos into the endorsement notes) */
import { db } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';

export const UNITS = [
  { id: 'nccu', name: 'NCCU', beds: 6 },
  { id: 'acsu', name: 'ACSU', beds: 8 },
];
export const MAX_NAME = 80;
export const MAX_DIAGNOSIS = 200;
export const MAX_NOTES = 2000;
export const MAX_TODO = 200;
const DEFAULT_CATS = [
  { id: 'labs', name: 'Labs' },
  { id: 'meds', name: 'Meds' },
  { id: 'procedures', name: 'Procedures' },
  { id: 'endorse', name: 'Endorse' },
];

let beds = new Map();  // id → record
let settings = null;

const bedId = (unit, n) => `bed:${unit}:${n}`;
const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (text, max) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/** A bed's box: its record, or an empty one (not saved until you use it). */
export function bed(unit, n) {
  const b = beds.get(bedId(unit, n)) ?? { id: bedId(unit, n), type: 'bed', unit, bed: n, name: '', todos: [] };
  return { ...b, diagnosis: b.diagnosis ?? '', notes: b.notes ?? '' };
}

/** Is anything written in this bed? */
export const inUse = (b) => Boolean(b.name || b.diagnosis || b.notes || b.todos.length);

const cats = () => settings?.cats?.length ? settings.cats : DEFAULT_CATS;

/** For the Neurology tab: beds with a patient and to-dos not done yet, per unit. */
export function unitsSummary() {
  return UNITS.map((u) => {
    const list = Array.from({ length: u.beds }, (_, i) => bed(u.id, i + 1));
    return {
      ...u,
      filled: list.filter((b) => b.name).length,
      left: list.reduce((n, b) => n + b.todos.filter((t) => !t.done).length, 0),
    };
  });
}

export async function loadUnits() {
  const records = (await db.all('units')).filter((r) => !r.deletedAt);
  beds = new Map(records.filter((r) => r.type === 'bed').map((r) => [r.id, { ...r, todos: Array.isArray(r.todos) ? r.todos : [] }]));
  settings = records.find((r) => r.type === 'settings') ?? null;
  await moveEndorseTodos();
  emit('units');
}

/* Before 0.10.5 endorsements were to-dos under an "Endorse" subcategory: once
   per bed (while it has no notes field yet), they become its endorsement notes. */
async function moveEndorseTodos() {
  const endorse = new Set(cats().filter((c) => /^endorse/i.test(c.name)).map((c) => c.id));
  for (const b of [...beds.values()]) {
    if (b.notes != null || !b.todos.some((t) => endorse.has(t.cat))) continue;
    await changeBed(b.unit, b.bed, (x) => {
      x.notes = lines(x.todos.filter((t) => endorse.has(t.cat)).map((t) => t.text).join('\n'), MAX_NOTES);
      x.todos = x.todos.filter((t) => !endorse.has(t.cat));
    }, { quiet: true });
  }
}

export async function initUnits() {
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore' || reason === 'reset') loadUnits(); });
  await loadUnits();
}

/** Change a bed (mutate gets a copy) and save it. */
async function changeBed(unit, n, mutate, { quiet = false } = {}) {
  const now = nowISO();
  const next = structuredClone(bed(unit, n));
  mutate(next);
  next.createdAt ??= now;
  next.updatedAt = now;
  next.deletedAt = null;
  await saveRecord('units', next);
  beds.set(next.id, next);
  if (!quiet) emit('units');
  return next;
}

export const setPatient = (unit, n, { name, diagnosis, notes }) => changeBed(unit, n, (b) => {
  b.name = oneLine(name, MAX_NAME);
  b.diagnosis = oneLine(diagnosis, MAX_DIAGNOSIS);
  b.notes = lines(notes, MAX_NOTES);
});

export function addTodo(unit, n, text) {
  const clean = oneLine(text, MAX_TODO);
  if (!clean) return null;
  return changeBed(unit, n, (b) => { b.todos.push({ id: uid(), cat: 'general', text: clean, done: false, doneAt: null }); });
}

export const editTodo = (unit, n, id, text) => changeBed(unit, n, (b) => {
  const t = b.todos.find((x) => x.id === id);
  if (t && oneLine(text, MAX_TODO)) t.text = oneLine(text, MAX_TODO);
});

export const toggleTodo = (unit, n, id) => changeBed(unit, n, (b) => {
  const t = b.todos.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? nowISO() : null;
});

export const deleteTodo = (unit, n, id) => changeBed(unit, n, (b) => { b.todos = b.todos.filter((x) => x.id !== id); });

/** Put a bed back as it was (for Undo). */
export const restoreBed = (before) => changeBed(before.unit, before.bed, (b) => {
  b.name = before.name;
  b.diagnosis = before.diagnosis;
  b.notes = before.notes;
  b.todos = structuredClone(before.todos);
});

export const clearTicked = (unit, n) => changeBed(unit, n, (b) => { b.todos = b.todos.filter((t) => !t.done); });

/** Empty a bed: the name, diagnosis, notes and every to-do (when the patient leaves). */
export const clearBed = (unit, n) => changeBed(unit, n, (b) => { b.name = ''; b.diagnosis = ''; b.notes = ''; b.todos = []; });

/** Clear the ticked to-dos of every bed. Resolves with the beds as they were (for Undo). */
export async function clearAllTicked() {
  const before = [];
  for (const u of UNITS) {
    for (let n = 1; n <= u.beds; n++) {
      const b = bed(u.id, n);
      if (!b.todos.some((t) => t.done)) continue;
      before.push(structuredClone(b));
      await clearTicked(u.id, n);
    }
  }
  return before;
}
