/* Referrals — patients referred to your service, added by hand (they don't
   come from a logsheet). Each one has a name, hospital number, location, the
   day you plan to see them next (any day, changed any time), what you're
   waiting for, and notes.

   Synced between your devices like tasks (the Referrals tab of your LIFE
   DASHBOARD sheet, sync script 8), but never in backup files.

   Since 0.4.4.3 Referrals mostly come from your referral census (a Google
   Sheet, see ward/engine.js — censusList); these are the ones you add in the
   app, shown alongside.

   Record: { id, name, hn, location, diagnosis, last, next: "YYYY-MM-DD" | "", notes,
             waiting: [{ id, text, done }], status: 'active' | 'for-rounds' | 'done',
             labels: [label id], doneAt, createdAt, updatedAt, deletedAt }
   Days are Manila dates, like the ward rounds.

   The same store keeps the colour labels of census patients (0.4.4.7), one
   record per hospital number: { id: "labels:<HN key>", type: 'labels', hn,
   labels: [label id], createdAt, updatedAt, deletedAt }. The legend itself
   (each label's name and colour) is part of the census's settings. */
import { db } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { emit, on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { uid } from '../../core/ids.js';
import { cleanLocation, locationKey, manilaDateKey } from '../ward/model.js';

export const MAX_FIELD = 80;     // characters in a name or hospital number
export const MAX_WAIT = 120;     // characters in one thing you're waiting for
export const MAX_NOTES = 20000;

let all = [];
let labelled = new Map(); // HN key → label ids (census patients)

/** Every referral added in the app (not deleted). */
export const referrals = () => all;
export const referral = (id) => all.find((r) => r.id === id) ?? null;
/** A census patient's labels, by HN key. */
export const censusLabels = (key) => labelled.get(key) ?? [];

export async function loadReferrals() {
  const records = (await db.all('referrals')).filter((r) => !r.deletedAt);
  all = records.filter((r) => r.type !== 'labels');
  labelled = new Map(records.filter((r) => r.type === 'labels' && r.key).map((r) => [r.key, r.labels ?? []]));
  emit('referrals');
}

/** Set a census patient's labels (key: the hospital number in capitals). */
export async function setCensusLabels(key, hn, labels) {
  if (!key) return;
  const id = `labels:${key}`;
  const now = nowISO();
  const existing = await db.get('referrals', id);
  const clean = [...new Set(labels.map(String))].slice(0, 12);
  await saveRecord('referrals', { id, type: 'labels', key, hn: String(hn ?? ''), labels: clean, createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null });
  await loadReferrals();
}

export async function initReferrals() {
  on('data', ({ reason }) => { if (reason === 'sync' || reason === 'restore' || reason === 'reset') loadReferrals(); });
  await loadReferrals();
  // A new day (Manila): "Today" and "Overdue" move on
  let today = manilaDateKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || manilaDateKey() === today) return;
    today = manilaDateKey();
    emit('referrals');
  });
}

const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanNotes = (text) => String(text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '').slice(0, MAX_NOTES);
const validDay = (key) => (/^\d{4}-\d{2}-\d{2}$/.test(String(key ?? '')) ? key : '');

/** Add a referral. fields: { name, hn, location, next, notes }. Resolves with it. */
export async function addReferral(fields) {
  const now = nowISO();
  const record = {
    id: uid(),
    name: oneLine(fields.name, MAX_FIELD) || 'Patient',
    hn: oneLine(fields.hn, MAX_FIELD),
    location: cleanLocation(fields.location),
    diagnosis: oneLine(fields.diagnosis, MAX_WAIT),
    last: validDay(fields.last),
    next: validDay(fields.next),
    notes: cleanNotes(fields.notes),
    waiting: (fields.waiting ?? []).map((w) => ({ id: uid(), text: oneLine(w, MAX_WAIT), done: false })).filter((w) => w.text),
    status: 'active',
    doneAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await saveRecord('referrals', record);
  await loadReferrals();
  return record;
}

/** Change a referral: mutate(copy) edits a copy, which is cleaned and saved. */
export async function updateReferral(id, mutate) {
  const found = referral(id);
  if (!found) return null;
  const next = structuredClone(found);
  mutate(next);
  next.name = oneLine(next.name, MAX_FIELD) || found.name;
  next.hn = oneLine(next.hn, MAX_FIELD);
  next.location = cleanLocation(next.location);
  next.next = validDay(next.next);
  next.last = validDay(next.last);
  next.labels = [...new Set((next.labels ?? []).map(String))].slice(0, 12);
  next.diagnosis = oneLine(next.diagnosis, MAX_WAIT);
  next.notes = cleanNotes(next.notes);
  next.waiting = (next.waiting ?? []).map((w) => ({ id: w.id || uid(), text: oneLine(w.text, MAX_WAIT), done: Boolean(w.done) })).filter((w) => w.text);
  next.updatedAt = nowISO();
  await saveRecord('referrals', next);
  await loadReferrals();
  return next;
}

/** Delete on every device (kept as a deleted record so the deletion syncs; the details are cleared). */
export async function deleteReferral(id) {
  const found = referral(id);
  if (!found) return;
  const now = nowISO();
  await saveRecord('referrals', { id, createdAt: found.createdAt, updatedAt: now, deletedAt: now });
  await loadReferrals();
}

/* ---------- Days ---------- */

const DAY_MS = 864e5;
/** A Manila day n days after "YYYY-MM-DD". */
export const addDayKey = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" key. */
export const weekdayOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** Where a day is from today: 'overdue' | 'today' | 'tomorrow' | 'later' | 'none'. */
export function dayState(next, today = manilaDateKey()) {
  if (!next) return 'none';
  if (next < today) return 'overdue';
  if (next === today) return 'today';
  return next === addDayKey(today, 1) ? 'tomorrow' : 'later';
}

/** The locations in use (A to Z), for picking one. */
export function referralLocations(extra = []) {
  const seen = new Map();
  [...all, ...extra].forEach((r) => { if (r.location && !seen.has(locationKey(r.location))) seen.set(locationKey(r.location), r.location); });
  return [...seen.entries()].map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}
