/* My notes: one notepad per patient list, shown on the list's page and on every
   patient's page, so you can keep writing wherever you are in Ward Patients.

   Saved with the list (its `notes`), so they sync between your devices through
   the Ward lists tab of your Google Sheet like the list's name and columns
   (newest wins). They save a moment after you stop typing, and the box grows
   with what you write. Notes from 0.8.0.7 (this device only, meta key
   "ward:notes:<list id>") move into the list the first time it shows.

   The box is a real element kept between redraws (the pages redraw often while
   the logsheet syncs), so what you're typing, the cursor and the focus stay put:
   pages draw notesSlot() and then call mountNotes(). */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { on } from '../../core/events.js';
import { updateList, wardList } from './engine.js';

export const MAX_NOTES = 30_000; // characters: the list is one cell in your Sheet (50,000 at most)
const SAVE_MS = 1200;

const drafts = new Map();  // list id → what you typed, not saved to the list yet
const timers = new Map();  // list id → pending save
const boxes = new Map();   // "list|place" → the box element
const moved = new Set();   // lists whose device-only notes were checked
let refocus = null;        // { box, start, end } while typing through a redraw

/** The notes as they are now: your unsaved typing, else the list's. */
const textOf = (list) => drafts.get(list) ?? wardList(list)?.def.notes ?? '';

function save(list) {
  clearTimeout(timers.get(list));
  timers.delete(list);
  if (!drafts.has(list)) return Promise.resolve();
  const text = drafts.get(list);
  return updateList(list, (def) => { def.notes = text; })
    .then(() => { if (drafts.get(list) === text) drafts.delete(list); })
    .catch((err) => console.error('Ward notes', err));
}

/** Notes kept on this device only (0.8.0.7) go into the list, so they sync too. */
async function moveDeviceNotes(list) {
  if (moved.has(list)) return;
  moved.add(list);
  const key = `ward:notes:${list}`;
  const local = (await db.get('meta', key).catch(() => null))?.value;
  if (typeof local === 'string' && local.trim()) {
    const now = wardList(list)?.def.notes ?? '';
    if (!now.includes(local)) {
      drafts.set(list, (now.trim() ? `${now}\n\n${local}` : local).slice(0, MAX_NOTES));
      await save(list);
    }
  }
  if (local != null) await db.delete('meta', key).catch(() => {});
}

/** Where the notes go on a page ('list' or 'patient'). */
export const notesSlot = (place) => html`<div class="wnotes-slot" data-notes-slot="${place}"></div>`;

/** Grow (or shrink) the box to fit what's written. */
function fit(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

function showCount(box, text) {
  const lines = text.split('\n').filter((l) => l.trim()).length;
  const near = text.length > MAX_NOTES * 0.9 ? ` · ${text.length.toLocaleString()} of ${MAX_NOTES.toLocaleString()} characters` : '';
  box.querySelector('.wnotes__count').textContent = lines ? `${lines} ${lines === 1 ? 'line' : 'lines'}${near}` : '';
}

/** Show the latest notes, unless you're typing in this box. */
function showText(box, text) {
  const area = box.querySelector('textarea');
  if (document.activeElement !== area && area.value !== text) area.value = text;
  showCount(box, area.value);
  if (box.isConnected) fit(area);
}

function makeBox(list, place) {
  const box = document.createElement('section');
  box.className = 'wnotes';
  box.setAttribute('aria-labelledby', `wnotes-${place}`);
  box.innerHTML = String(html`
    <div class="wnotes__head">
      <h2 class="wnotes__title" id="wnotes-${place}">${icon('edit')}<span>My notes</span></h2>
      <span class="wnotes__count"></span>
    </div>
    <textarea class="input textarea wnotes__text" rows="3" maxlength="${MAX_NOTES}" autocapitalize="sentences" placeholder="Notes for your patients — they show here, on the list and on every patient’s page."></textarea>
    <p class="wnotes__hint">${icon('cloud')}<span>Saved as you type, and synced to your other devices through your Google Sheet.</span></p>`);
  const area = box.querySelector('textarea');
  area.addEventListener('input', () => {
    drafts.set(list, area.value);
    fit(area);
    showCount(box, area.value);
    clearTimeout(timers.get(list));
    timers.set(list, setTimeout(() => save(list), SAVE_MS));
    // The same notes elsewhere (the list behind a patient's page) follow along
    for (const [k, other] of boxes) if (other !== box && k.startsWith(`${list}|`)) showText(other, area.value);
  });
  area.addEventListener('blur', () => {
    if (timers.has(list)) save(list);
    else showText(box, textOf(list)); // catch up with notes that arrived while you were typing
  });
  return box;
}

/** Put the notes box into a page's slot (keeping the same box between redraws). */
export function mountNotes(root, list) {
  if (!root || !list) return;
  root.querySelectorAll('[data-notes-slot]').forEach((slot) => {
    const place = slot.dataset.notesSlot;
    const k = `${list}|${place}`;
    const box = boxes.get(k) ?? makeBox(list, place);
    boxes.set(k, box);
    slot.replaceWith(box);
    showText(box, textOf(list));
    const area = box.querySelector('textarea');
    if (refocus?.box === box) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(refocus.start, refocus.end);
      refocus = null;
    }
    requestAnimationFrame(() => fit(area));
  });
  moveDeviceNotes(list);
}

/** Take the box out of a page before it redraws, so it can go back in untouched. */
export function keepNotes(root) {
  root?.querySelectorAll('.wnotes').forEach((box) => {
    const area = box.querySelector('textarea');
    if (document.activeElement === area) refocus = { box, start: area.selectionStart, end: area.selectionEnd };
    box.remove();
  });
}

// Notes changed on another device (or saved here): show them where you aren't typing
on('ward', () => {
  for (const [k, box] of boxes) if (box.isConnected) showText(box, textOf(k.split('|')[0]));
});

// Save straight away when leaving the app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') for (const list of [...timers.keys()]) save(list);
});
