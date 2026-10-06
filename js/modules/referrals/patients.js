/* Referrals: one list of patients from two places — your referral census
   (a Google Sheet, two-way: see ward/engine.js censusList) and the ones you
   add in the app (store.js). Screens read referralPatients() and change a
   patient with setField(); each change goes back where the patient came from.

   A patient: { id, source: 'census' | 'app', name, hn, status, active,
     location, diagnosis, last, lastText, next, nextText, waiting, notes,
     labels: [label id] (colour labels, see labels.js),
     can: { status, location, diagnosis, last, next, waiting, notes, labels },
     editable, unsynced, conflict } — days are "YYYY-MM-DD" (Manila); waiting
     and notes are null when the census has no column for them. */
import { censusList } from '../ward/engine.js';
import { cleanLocation, manilaDateKey } from '../ward/model.js';
import { censusLabels, referrals, setCensusLabels, updateReferral } from './store.js';

/** Inactive, discharged or signed off: in the Inactive table, not the deck. */
export const isInactive = (status) => /\binactive\b|discharg|signed\s*(off|out)/i.test(String(status ?? ''));

export const STATUS_CHOICES = ['Active', 'For rounds', 'Inactive'];

/** The statuses to offer for a patient: the census's dropdown (or the ones it already uses), else Active / For rounds / Inactive. */
export function statusChoices(p) {
  if (p?.source !== 'census') return STATUS_CHOICES;
  const list = censusList();
  const col = p.cols.status;
  const found = col ? list?.choicesFor(col) : null;
  if (found?.dropdown) return found.values;
  // No dropdown: the usual three in the census's own spelling, plus any others it uses
  const seen = found?.values ?? [];
  return [...new Set([...STATUS_CHOICES.map((s) => seen.find((v) => v.toLowerCase() === s.toLowerCase()) ?? s), ...seen])];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');

/** A day from the census: "2026-10-07", "10/7/2026", "10/7", "Oct 7", "7 Oct 2026"… or '' when it isn't one. */
export function parseDay(text, today = manilaDateKey()) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return '';
  const year = Number(today.slice(0, 4));
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return key(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t); // month/day like Google Sheets in the US and the Philippines
  if (m) return key(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year, +m[1], +m[2]);
  m = /^(?:[a-z]+,?\s+)?([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/.exec(t);
  if (m && MONTHS.includes(m[1])) return key(m[3] ? +m[3] : year, MONTHS.indexOf(m[1]) + 1, +m[2]);
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/.exec(t);
  if (m && MONTHS.includes(m[2])) return key(m[3] ? +m[3] : year, MONTHS.indexOf(m[2]) + 1, +m[1]);
  return '';
}

/** "Waiting for" in one census cell: one thing per line, "✓ " in front once it has arrived. */
export function parseWaiting(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => {
    const done = /^(✓|✔|\[x\])\s*/i.test(line);
    return { id: String(i), text: line.replace(/^(✓|✔|☐|\[x\]|\[ \]|-|•)\s*/i, ''), done };
  }).filter((w) => w.text);
}
export const formatWaiting = (items) => items.map((w) => `${w.done ? '✓ ' : ''}${w.text}`).join('\n');

function fromCensus(list) {
  const v = list.view();
  const col = Object.fromEntries(v.columns.filter((c) => c.role && c.readable).map((c) => [c.role, c.col]));
  return v.patients.map((p) => {
    const cell = (role) => (col[role] ? p.cells[col[role]] ?? '' : '');
    const items = Object.values(p.items).filter(Boolean);
    const status = cell('status').trim();
    return {
      id: `c:${p.id}`,
      source: 'census',
      key: p.key,
      row: p.row,
      name: p.name,
      hn: p.hn,
      status: status || (col.status ? '' : 'Active'),
      active: !isInactive(status),
      location: cleanLocation(cell('location')),
      diagnosis: cell('diagnosis').trim(),
      last: parseDay(cell('last')),
      lastText: cell('last').trim(),
      next: parseDay(cell('next')),
      nextText: cell('next').trim(),
      waiting: col.waiting ? parseWaiting(cell('waiting')) : null,
      notes: col.notes ? cell('notes') : null,
      cols: col,
      labels: p.key ? censusLabels(p.key) : [],
      can: { ...Object.fromEntries(['status', 'location', 'diagnosis', 'last', 'next', 'waiting', 'notes'].map((r) => [r, Boolean(col[r]) && p.tickable])), labels: Boolean(p.key) },
      editable: p.tickable,
      unsynced: items.length > 0,
      conflict: items.find((i) => i.state === 'conflict') ?? null,
      blocked: items.find((i) => i.state === 'blocked') ?? null,
    };
  });
}

const APP_STATUS = { active: 'Active', 'for-rounds': 'For rounds', done: 'Inactive' };

function fromApp(r) {
  const status = APP_STATUS[r.status] ?? 'Active';
  return {
    id: `a:${r.id}`,
    source: 'app',
    refId: r.id,
    name: r.name,
    hn: r.hn,
    status,
    active: r.status !== 'done',
    location: r.location,
    diagnosis: r.diagnosis ?? '',
    last: r.last ?? '',
    lastText: r.last ?? '',
    next: r.next,
    nextText: r.next,
    waiting: r.waiting,
    notes: r.notes,
    labels: r.labels ?? [],
    can: { status: true, location: true, diagnosis: true, last: true, next: true, waiting: true, notes: true, labels: true },
    editable: true,
    unsynced: false,
    conflict: null,
    blocked: null,
  };
}

/** Every referral: the census's, then the ones added in the app. */
export function referralPatients() {
  const list = censusList();
  return [...(list?.link ? fromCensus(list) : []), ...referrals().map(fromApp)];
}

export const findPatient = (id) => referralPatients().find((p) => p.id === id) ?? null;

/**
 * Change one thing about a patient (role: status, location, diagnosis, last,
 * next, waiting — an array — or notes). A census patient's change is saved to
 * the census straight away (and kept on this device until it is).
 */
export async function setField(p, role, value) {
  if (role === 'labels') {
    if (p.source === 'app') return updateReferral(p.refId, (x) => { x.labels = value; });
    return setCensusLabels(p.key, p.hn, value);
  }
  if (p.source === 'app') {
    return updateReferral(p.refId, (x) => {
      if (role === 'status') x.status = isInactive(value) ? 'done' : /rounds/i.test(value) ? 'for-rounds' : 'active';
      else x[role] = value;
      if (role === 'status') x.doneAt = isInactive(value) ? new Date().toISOString() : null;
    });
  }
  const list = censusList();
  const col = p.cols[role];
  if (!list || !col || !p.editable) return null;
  const text = role === 'waiting' ? formatWaiting(value) : role === 'status' ? list.choiceSpelling(col, String(value ?? '')) : String(value ?? '');
  return list.saveText(p.key, col, text);
}

/** For the Neurology tab and the dashboard card. */
export function referralSummary(today = manilaDateKey()) {
  const active = referralPatients().filter((p) => p.active);
  return {
    linked: Boolean(censusList()?.link),
    active: active.length,
    today: active.filter((p) => p.next === today).length,
    overdue: active.filter((p) => p.next && p.next < today).length,
    waiting: active.reduce((n, p) => n + (p.waiting ?? []).filter((w) => !w.done).length, 0),
  };
}
