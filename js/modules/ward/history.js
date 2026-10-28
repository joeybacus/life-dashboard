/* History & admitting PE: a box on every ward patient's page, just above the
   CT scans, split in two halves side by side — the history on the left, the
   admitting PE and other pertinent data on the right (stacked on a phone).

   Saved in the patient's row of the logsheet: History in column P, Admitting
   PE & other data in column Q (HISTORY_COLS in engine.js; a list can have its
   own in def.historyCols). A moment after you stop typing the text goes into
   the list's changes like any other edit, so it waits offline and the app wins
   over what the cell held. You can type only once the last load has read
   those columns, so you never write over something you haven't seen.

   0.10.9 kept the box in the app (units store records "pthx:<hn>:history|pe");
   the first time a patient's page shows, what was typed there moves into
   their logsheet row and the app's copy is removed.

   The box is a real element kept between redraws, like My notes (notes.js):
   pages draw historySlot() and then call mountHistory(). */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { nowISO } from '../../core/dates.js';
import { saveRecord } from '../../core/records.js';
import { wardList } from './engine.js';
import { MAX_TEXT } from './model.js';

const SAVE_MS = 1200;
const PARTS = [
  { part: 'history', title: 'History', hint: 'Chief complaint, history of present illness, past medical, family, personal and social history…' },
  { part: 'pe', title: 'Admitting PE & other data', hint: 'Admitting vital signs, physical and neuro exam, and other pertinent data…' },
];

const drafts = new Map();  // "list|patient|col" → what you typed, not handed to the list yet
const timers = new Map();  // same key → pending save
let box = null;            // the box element (one patient page is open at a time)
let shown = null;          // { list, key, cols } the box is showing
let refocus = null;        // { part, start, end } while typing through a redraw
let moving = null;         // 0.10.9 records still to move into the logsheet: Map id → record

const draftKey = (list, key, col) => `${list}|${key}|${col}`;

function save(k) {
  clearTimeout(timers.get(k));
  timers.delete(k);
  if (!drafts.has(k)) return Promise.resolve();
  const text = drafts.get(k);
  const [list, key, col] = k.split('|');
  return (wardList(list)?.saveHistory(key, col, text) ?? Promise.resolve())
    .then(() => { if (drafts.get(k) === text) drafts.delete(k); })
    .catch((err) => console.error('Patient history', err));
}
const saveAll = () => Promise.all([...timers.keys()].map(save));

/** Where the box goes on a patient's page. */
export const historySlot = () => html`<div class="phx-slot" data-history-slot></div>`;

function fit(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

/** Show the logsheet's text, unless you're typing in that half. */
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
        <span class="phx__label">${title} <span class="phx__col" data-col-of="${part}"></span></span>
        <textarea class="input textarea wnotes__text phx__text" data-part="${part}" rows="6" maxlength="${MAX_TEXT}" autocapitalize="sentences" placeholder="${hint}"></textarea>
      </label>`)}
    </div>
    <p class="wnotes__hint phx__hint"></p>`);
  el.querySelectorAll('textarea').forEach((area) => {
    const keyNow = () => shown && draftKey(shown.list, shown.key, shown.cols[area.dataset.part]);
    area.addEventListener('input', () => {
      const k = keyNow();
      if (!k) return;
      drafts.set(k, area.value);
      fit(area);
      el.querySelector('.phx__hint span').textContent = `Saving to columns ${shown.cols.history} and ${shown.cols.pe} of the logsheet…`;
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => save(k), SAVE_MS));
    });
    area.addEventListener('blur', () => {
      const k = keyNow();
      if (k && timers.has(k)) save(k);
    });
  });
  return el;
}

/** The line under the box: where it saves, and whether it has. */
function hintOf(patient, v) {
  const cols = v.historyCols;
  const where = `columns ${cols.history} and ${cols.pe} of the logsheet`;
  if (!patient.key) return [icon('info'), `This patient has no hospital number, so nothing can be saved to ${where}.`];
  if (!v.historyReady) return [icon('refresh'), `Reading ${where}… You can type once they’ve loaded.`];
  const items = PARTS.map(({ part }) => patient.hx[part].item).filter(Boolean);
  if (items.some((i) => i.state === 'blocked' || i.state === 'conflict')) return [icon('info'), `Not saved to ${where} yet — see the changes waiting on the list’s page.`];
  if (items.length || PARTS.some(({ part }) => drafts.has(draftKey(v.id, patient.key, cols[part])))) return [icon('cloud'), `Saving to ${where}…`];
  return [icon('cloud'), `Saved in ${where} as you type.`];
}

/** Put the box into the page's slot for this patient (the same box between redraws). */
export function mountHistory(root, patient, v) {
  const slot = root?.querySelector('[data-history-slot]');
  if (!slot) return;
  if (!patient || !v?.historyCols) { slot.remove(); return; }
  box ??= makeBox();
  const cols = v.historyCols;
  const same = shown && shown.list === v.id && shown.key === patient.key && shown.cols.history === cols.history && shown.cols.pe === cols.pe;
  if (!same) {
    saveAll(); // what was typed for the last patient
    box.querySelectorAll('textarea').forEach((area) => { area.value = ''; });
    shown = { list: v.id, key: patient.key, cols };
  }
  const ready = Boolean(patient.key) && v.historyReady;
  box.querySelectorAll('textarea').forEach((area) => {
    const { part } = area.dataset;
    area.disabled = !ready;
    box.querySelector(`[data-col-of="${part}"]`).textContent = `· column ${cols[part]}`;
    showText(area, drafts.get(draftKey(v.id, patient.key, cols[part])) ?? (ready ? patient.hx[part].text : ''));
  });
  const [mark, text] = hintOf(patient, v);
  box.querySelector('.phx__hint').innerHTML = String(html`${mark}<span>${text}</span>`);
  slot.replaceWith(box);
  if (refocus) {
    const area = box.querySelector(`textarea[data-part="${refocus.part}"]`);
    if (area && !area.disabled) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(refocus.start, refocus.end);
    }
    refocus = null;
  }
  if (ready) moveAppCopy(patient, v);
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
  saveAll();
  shown = null;
  refocus = null;
}

/* What 0.10.9 kept in the app for this patient goes into their logsheet row:
   into an empty cell as it is, below what the cell holds otherwise (unless it's
   already there). Then the app's copy is removed. */
async function moveAppCopy(patient, v) {
  if (!moving) {
    moving = new Map();
    const all = await db.all('units').catch(() => []);
    all.filter((r) => r.type === 'history' && !r.deletedAt).forEach((r) => moving.set(r.id, r));
  }
  if (!moving.size) return;
  const list = wardList(v.id);
  const old = String(patient.hn ?? '').trim().toLowerCase();
  for (const { part } of PARTS) {
    const id = `pthx:${old}:${part}`;
    const record = moving.get(id);
    if (!old || !record) continue;
    moving.delete(id);
    const typed = String(record.text ?? '').trim();
    const now = patient.hx[part].text;
    if (typed && !now.includes(typed)) await list?.saveHistory(patient.key, v.historyCols[part], now.trim() ? `${now.trimEnd()}\n\n${typed}` : typed);
    await saveRecord('units', { ...record, text: '', deletedAt: nowISO(), updatedAt: nowISO() }).catch(() => {});
  }
}

// Save straight away when leaving the app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveAll();
});
