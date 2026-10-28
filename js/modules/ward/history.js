/* History & admitting PE: a box on every ward patient's page, just above the
   CT scans, split in two halves side by side — the history on the left, the
   admitting PE and other pertinent data on the right (stacked on a phone).

   Kept per patient by hospital number (by name when there's none), so the same
   patient shows the same history in every list. Each half is its own record in
   the units store, so typing the history on one device and the PE on another
   never overwrite each other:
     { id: "pthx:<key>:history" | "pthx:<key>:pe", type: 'history', part, key,
       name, text, createdAt, updatedAt, deletedAt }
   Synced between your devices through the NCCU-ACSU tab of your Google Sheet
   (its json column; the Patient column shows the name), like the bed boxes —
   no script change. Never in backup files.

   The boxes are real elements kept between redraws, like My notes (notes.js):
   pages draw historySlot() and then call mountHistory(). */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { on } from '../../core/events.js';
import { nowISO } from '../../core/dates.js';
import { saveRecord } from '../../core/records.js';

export const MAX_TEXT = 20_000; // characters a half: one cell in your Sheet holds 50,000
const SAVE_MS = 1200;
const PARTS = [
  { part: 'history', title: 'History', hint: 'Chief complaint, history of present illness, past medical, family, personal and social history…' },
  { part: 'pe', title: 'Admitting PE & other data', hint: 'Admitting vital signs, physical and neuro exam, and other pertinent data…' },
];

let records = null;        // id → record (null until loaded)
let loading = null;
const drafts = new Map();  // record id → what you typed, not saved yet
const timers = new Map();  // record id → pending save
const names = new Map();   // record id → the patient's name, for the Sheet's Patient column
let box = null;            // the box element (one patient page is open at a time)
let shownKey = null;
let refocus = null;        // { part, start, end } while typing through a redraw

/** Whose history this is: the hospital number, else the name. */
const keyOf = ({ hn, name }) => {
  const n = String(hn ?? '').trim();
  if (n) return n.toLowerCase();
  const who = String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return who ? `name:${who}` : '';
};
const idOf = (key, part) => `pthx:${key}:${part}`;
const textOf = (id) => drafts.get(id) ?? records?.get(id)?.text ?? '';

async function load() {
  const all = await db.all('units');
  records = new Map(all.filter((r) => r.type === 'history' && !r.deletedAt).map((r) => [r.id, r]));
}
const ready = () => (loading ??= load().catch((err) => { loading = null; throw err; }));

async function save(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!drafts.has(id)) return;
  const text = drafts.get(id);
  try {
    await ready();
    const [, key, part] = id.match(/^pthx:(.*):(history|pe)$/) ?? [];
    const before = records.get(id);
    const now = nowISO();
    const next = { ...before, id, type: 'history', part, key, name: names.get(id) ?? before?.name ?? '', text, createdAt: before?.createdAt ?? now, updatedAt: now, deletedAt: null };
    await saveRecord('units', next);
    records.set(id, next);
    if (drafts.get(id) === text) drafts.delete(id);
  } catch (err) {
    console.error('Patient history', err);
  }
}

/** Where the box goes on a patient's page. */
export const historySlot = () => html`<div class="phx-slot" data-history-slot></div>`;

function fit(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

/** Show the saved text, unless you're typing in that half. */
function showText(area, text) {
  if (document.activeElement !== area && area.value !== text) area.value = text;
  if (area.isConnected) fit(area);
}

function makeBox() {
  const el = document.createElement('section');
  el.className = 'phx';
  el.setAttribute('aria-labelledby', 'phx-title');
  el.innerHTML = String(html`
    <h2 class="wnotes__title phx__title" id="phx-title">${icon('clipboard')}<span>History &amp; admitting PE</span></h2>
    <div class="phx__halves">${PARTS.map(({ part, title, hint }) => html`
      <label class="phx__half">
        <span class="phx__label">${title}</span>
        <textarea class="input textarea wnotes__text phx__text" data-part="${part}" rows="6" maxlength="${MAX_TEXT}" autocapitalize="sentences" placeholder="${hint}"></textarea>
      </label>`)}
    </div>
    <p class="wnotes__hint">${icon('cloud')}<span>Kept for this patient and saved as you type. Synced to your other devices through your Google Sheet.</span></p>`);
  el.querySelectorAll('textarea').forEach((area) => {
    const idNow = () => idOf(shownKey, area.dataset.part);
    area.addEventListener('input', () => {
      if (!shownKey) return;
      const id = idNow();
      drafts.set(id, area.value);
      fit(area);
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => save(id), SAVE_MS));
    });
    area.addEventListener('blur', () => {
      if (!shownKey) return;
      const id = idNow();
      if (timers.has(id)) save(id);
      else showText(area, textOf(id)); // catch up with what arrived while you were typing
    });
  });
  return el;
}

function fill() {
  if (!box) return;
  box.querySelectorAll('textarea').forEach((area) => {
    const id = idOf(shownKey, area.dataset.part);
    area.disabled = !records;
    showText(area, records ? textOf(id) : '');
  });
}

/** Put the box into the page's slot for this patient (the same box between redraws). */
export function mountHistory(root, patient) {
  const slot = root?.querySelector('[data-history-slot]');
  if (!slot) return;
  const key = patient ? keyOf(patient) : '';
  if (!key) { slot.remove(); return; }
  box ??= makeBox();
  if (key !== shownKey) {
    // Another patient: save what was typed for the last one, and start fresh
    for (const id of [...timers.keys()]) save(id);
    box.querySelectorAll('textarea').forEach((area) => { area.value = ''; });
    shownKey = key;
  }
  for (const { part } of PARTS) names.set(idOf(key, part), patient.name ?? '');
  slot.replaceWith(box);
  fill();
  if (refocus) {
    const area = box.querySelector(`textarea[data-part="${refocus.part}"]`);
    area?.focus({ preventScroll: true });
    area?.setSelectionRange(refocus.start, refocus.end);
    refocus = null;
  }
  if (!records) ready().then(fill, (err) => console.error('Patient history', err));
  requestAnimationFrame(() => box?.querySelectorAll('textarea').forEach(fit));
}

/** Take the box out of the page before it redraws, so it can go back in untouched. */
export function keepHistory(root) {
  root?.querySelectorAll('.phx').forEach((el) => {
    const area = el.querySelector('textarea:focus');
    if (area) refocus = { part: area.dataset.part, start: area.selectionStart, end: area.selectionEnd };
    el.remove();
  });
}

/** The patient's page closed: save straight away. */
export function historyClosed() {
  for (const id of [...timers.keys()]) save(id);
  shownKey = null;
  refocus = null;
}

// Histories changed on another device (or a restore): reload, and show them where you aren't typing
on('data', ({ reason } = {}) => {
  if (reason !== 'sync' && reason !== 'restore' && reason !== 'reset') return;
  loading = null;
  if (records) ready().then(fill, (err) => console.error('Patient history', err));
});

// Save straight away when leaving the app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') for (const id of [...timers.keys()]) save(id);
});
