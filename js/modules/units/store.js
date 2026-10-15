/* NCCU/ACSU — a box per bed (6 in NCCU, 8 in ACSU) with the patient's name,
   typed in the app, and your to-dos for the duty under subcategories you
   choose once for every box (Labs, Meds…). Nothing clears by itself: you
   clear ticked to-dos, or a whole bed, when you want.

   Synced between your devices like Referrals (the NCCU-ACSU tab of your
   LIFE DASHBOARD sheet, sync script 15), but never in backup files.

   Records in the units store:
     { id: "bed:<unit>:<n>", type: 'bed', unit: 'nccu' | 'acsu', bed: n, name,
       todos: [{ id, cat, text, done, doneAt }], createdAt, updatedAt, deletedAt }
       (made the first time a bed is used)
     { id: 'settings', type: 'settings', cats: [{ id, name }], createdAt, updatedAt, deletedAt }
       (your subcategories, in order; until you change them, DEFAULT_CATS) */
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
export const MAX_TODO = 200;
export const MAX_CAT = 30;
export const MAX_CATS = 8;
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

/** A bed's box: its record, or an empty one (not saved until you use it). */
export function bed(unit, n) {
  return beds.get(bedId(unit, n)) ?? { id: bedId(unit, n), type: 'bed', unit, bed: n, name: '', todos: [] };
}

/** Your subcategories, in order. */
export const cats = () => settings?.cats?.length ? settings.cats : DEFAULT_CATS;

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
  emit('units');
}

export async function initUnits() {
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore' || reason === 'reset') loadUnits(); });
  await loadUnits();
}

/** Change a bed (mutate gets a copy) and save it. */
async function changeBed(unit, n, mutate) {
  const now = nowISO();
  const next = structuredClone(bed(unit, n));
  mutate(next);
  next.createdAt ??= now;
  next.updatedAt = now;
  next.deletedAt = null;
  await saveRecord('units', next);
  beds.set(next.id, next);
  emit('units');
  return next;
}

export const setName = (unit, n, name) => changeBed(unit, n, (b) => { b.name = oneLine(name, MAX_NAME); });

export function addTodo(unit, n, cat, text) {
  const clean = oneLine(text, MAX_TODO);
  if (!clean) return null;
  return changeBed(unit, n, (b) => { b.todos.push({ id: uid(), cat, text: clean, done: false, doneAt: null }); });
}

export const editTodo = (unit, n, id, text, cat) => changeBed(unit, n, (b) => {
  const t = b.todos.find((x) => x.id === id);
  if (!t) return;
  if (oneLine(text, MAX_TODO)) t.text = oneLine(text, MAX_TODO);
  if (cat) t.cat = cat;
});

export const toggleTodo = (unit, n, id) => changeBed(unit, n, (b) => {
  const t = b.todos.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? nowISO() : null;
});

export const deleteTodo = (unit, n, id) => changeBed(unit, n, (b) => { b.todos = b.todos.filter((x) => x.id !== id); });

/** Put a bed back as it was (for Undo). */
export const restoreBed = (before) => changeBed(before.unit, before.bed, (b) => { b.name = before.name; b.todos = structuredClone(before.todos); });

export const clearTicked = (unit, n) => changeBed(unit, n, (b) => { b.todos = b.todos.filter((t) => !t.done); });

/** Empty a bed: the name and every to-do (when the patient leaves). */
export const clearBed = (unit, n) => changeBed(unit, n, (b) => { b.name = ''; b.todos = []; });

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

/** Save your subcategories ([{ id?, name }], in order). To-dos in a removed one move to the first. */
export async function saveCats(list) {
  const now = nowISO();
  const clean = list.map((c) => ({ id: c.id || uid(), name: oneLine(c.name, MAX_CAT) })).filter((c) => c.name).slice(0, MAX_CATS);
  if (!clean.length) return;
  const record = { id: 'settings', type: 'settings', cats: clean, createdAt: settings?.createdAt ?? now, updatedAt: now, deletedAt: null };
  await saveRecord('units', record);
  settings = record;
  const ids = new Set(clean.map((c) => c.id));
  for (const b of [...beds.values()]) {
    if (b.todos.some((t) => !ids.has(t.cat))) await changeBed(b.unit, b.bed, (x) => { x.todos.forEach((t) => { if (!ids.has(t.cat)) t.cat = clean[0].id; }); });
  }
  emit('units');
}
