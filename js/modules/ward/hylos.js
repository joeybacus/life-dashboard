/* Hylos — the URGENT card for one patient (0.11.57).

   The red flag button beside Show edits on a patient's page reads the
   HYLOS tab of another Google Sheet (the lab scraper). Every filled cell
   there is one patient's card, its first line the patient's name
   ("🟡 CRUZ, VIRGILIO"), then URGENT / REPEAT / PLAN / IMAGING lines. The app
   finds the card whose name matches this patient and shows it.

   Read only: nothing is written to that Sheet. Needs sync script 23.
   On this device only (never synced or backed up, never in the app's code):
     meta 'hylosLink'   { url, spreadsheetId, tab }
     meta 'hylosCache'  the last cards read, for when you're offline */
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { confirmDialog, promptDialog } from '../../core/ui.js';
import { SyncError, callSyncScript } from '../../services/sync.js';
import { LOAD_PROBLEMS, parseSheetLink, wardStamp } from './model.js';

export const HYLOS_SCRIPT_VERSION = 23;
const DEFAULT_TAB = 'HYLOS';
const FRESH_MS = 60_000; // opening it again within a minute doesn't reload

const state = { open: false, ready: false, link: null, cache: null, loading: false, error: '' };

async function ready() {
  if (state.ready) return;
  state.link = (await db.get('meta', 'hylosLink'))?.value ?? null;
  state.cache = (await db.get('meta', 'hylosCache'))?.value ?? null;
  state.ready = true;
}

/* ---------- Matching a card to a patient ---------- */

/** "MANAOG, NERISSA ANGELES 60/F" → { surname: 'MANAOG', given: ['NERISSA', 'ANGELES'] } */
export function nameParts(name) {
  const plain = String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
    .replace(/[^A-Z,\s.'-]+[^\s,]*/g, ' ') // drops emoji and words with digits ("60/F")
    .replace(/[.'-]/g, ' ');
  const [before, ...after] = plain.split(',');
  const words = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
  if (after.length) return { surname: words(before).join(''), given: words(after.join(' ')) };
  const all = words(before);
  return { surname: all[0] ?? '', given: all.slice(1), loose: true };
}

/** How well a card's name fits a patient's: 0 none, 1 surname only, 2 surname and first name. */
function fit(card, patient) {
  if (!card.surname || card.surname !== patient.surname) return 0;
  const a = card.given[0];
  const b = patient.given[0];
  if (!a || !b) return 1;
  const short = Math.min(a.length, b.length);
  // the same first name, a shortened one ("MA" for MARIA needs 3+ letters), or an initial ("J")
  if (a === b || ((short >= 3 || short === 1) && (a.startsWith(b) || b.startsWith(a)))) return 2;
  return 0; // a different first name: someone else with the same surname
}

/** The card for this patient, or null. A surname alone (no first name on one side) is enough only when one card has it. */
export function cardFor(cards, name) {
  const patient = nameParts(name);
  if (!patient.surname) return null;
  const scored = (cards ?? []).map((c) => ({ c, n: fit(nameParts(c.text.split('\n')[0]), patient) })).filter((x) => x.n);
  const best = scored.filter((x) => x.n === 2);
  if (best.length) return best[0].c;
  return scored.length === 1 ? scored[0].c : null;
}

/** The card's colour: from its 🔴 🟠 🟡 🟢 dot, else from its fill in the Sheet. */
function toneOf(card) {
  const first = card.text.split('\n')[0];
  if (/🔴/u.test(first)) return 'red';
  if (/🟠|🟡/u.test(first)) return 'yellow';
  if (/🟢/u.test(first)) return 'green';
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(card.bg ?? '');
  if (!m) return 'red';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  if (r > 200 && g > 200 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 12) return 'red'; // white: no colour given
  if (g > r + 10 && g > b) return 'green';
  if (r >= g && g > b + 30 && g > 150) return 'yellow';
  return 'red';
}

/* ---------- Reading the Sheet ---------- */

function problem(err) {
  if (err instanceof SyncError) {
    if (err.reason === 'bad-action') return `Update the sync script to version ${HYLOS_SCRIPT_VERSION} to read Hylos (Settings → Sync → Update the sync script).`;
    if (err.reason === 'ward-no-tab') return `The Hylos sheet has no tab named “${state.link?.tab || DEFAULT_TAB}”.`;
    if (err.reason === 'ward-no-access') return 'Couldn’t open the Hylos sheet. Check the link, and that it’s shared with the Google account that owns your LIFE DASHBOARD sheet.';
    if (LOAD_PROBLEMS[err.reason]) return LOAD_PROBLEMS[err.reason];
    if (err.code === 'offline' || err.code === 'network') return 'You’re offline.';
    return err.message || 'Couldn’t read Hylos.';
  }
  return 'Couldn’t read Hylos.';
}

async function load(redraw) {
  if (!state.link || state.loading) return;
  state.loading = true;
  state.error = '';
  redraw();
  try {
    const res = await callSyncScript('hylosRead', { spreadsheetId: state.link.spreadsheetId, tab: state.link.tab || DEFAULT_TAB });
    state.cache = { cards: Array.isArray(res.cards) ? res.cards : [], fetchedAt: new Date().toISOString(), title: res.title ?? '', tab: res.tab ?? '' };
    await db.put('meta', { key: 'hylosCache', value: state.cache });
  } catch (err) {
    state.error = problem(err);
  } finally {
    state.loading = false;
    redraw();
  }
}

async function askLink() {
  for (;;) {
    const text = await promptDialog({
      title: 'Link the Hylos sheet',
      label: 'Paste the link to the Google Sheet with the HYLOS tab (Share → Copy link).',
      value: state.link?.url ?? '',
      placeholder: 'https://docs.google.com/spreadsheets/d/…',
      confirmLabel: 'Save',
      maxLength: 500,
      dismissible: false,
    });
    if (text == null) return false;
    const parsed = parseSheetLink(text);
    if (parsed.id) {
      state.link = { url: text.trim(), spreadsheetId: parsed.id, tab: DEFAULT_TAB };
      state.cache = null;
      await db.put('meta', { key: 'hylosLink', value: state.link });
      await db.put('meta', { key: 'hylosCache', value: null });
      return true;
    }
    const again = await confirmDialog({ title: 'That isn’t a Google Sheets link', message: 'Copy it from the address bar of the Hylos sheet, or use Share → Copy link.', confirmLabel: 'Try again' });
    if (!again) return false;
  }
}

/* ---------- On the patient page ---------- */

/** The red flag button, beside Show edits. */
export const hylosButton = () => html`<button type="button" class="btn btn--sm hylos-flag${state.open ? ' is-on' : ''}" data-dact="hylos" data-focus="b-hylos" aria-pressed="${state.open ? 'true' : 'false'}" title="Show this patient’s URGENT card from Hylos">${icon('flag')}Urgent</button>`;

/** The card under the bar, while the flag is on. */
export function hylosCard(p) {
  if (!state.open) return '';
  const head = (extra = '') => html`<div class="hylos__head">
      <span class="hylos__title">${icon('flag')}Hylos${state.cache?.fetchedAt ? html`<span class="hylos__when"> · ${state.loading ? 'updating…' : `updated ${wardStamp(state.cache.fetchedAt)}`}</span>` : ''}</span>
      <span class="hylos__acts">
        <button type="button" class="btn btn--sm btn--ghost${state.loading ? ' is-busy' : ''}" data-dact="hylos-refresh"${raw(state.loading ? ' aria-disabled="true"' : '')}>${icon('refresh')}Refresh</button>
        <button type="button" class="btn btn--sm btn--ghost" data-dact="hylos-link">${icon('link')}Change link</button>
      </span>
    </div>${extra}`;
  const err = state.error ? html`<p class="note ward-note--warn">${icon('info')}<span>${state.error}${state.cache ? ' Showing what was read last.' : ''}</span></p>` : '';
  if (!state.cache) {
    return html`<section class="hylos" aria-live="polite">${head(err)}${state.loading ? html`<p class="hylos__empty">Reading Hylos…</p>` : ''}</section>`;
  }
  const card = cardFor(state.cache.cards, p.name);
  if (!card) {
    return html`<section class="hylos" aria-live="polite">${head(err)}
      <p class="hylos__empty">No Hylos card for ${p.name}. ${state.cache.cards.length ? `Hylos has ${state.cache.cards.length} card${state.cache.cards.length === 1 ? '' : 's'}, none with this name.` : 'The HYLOS tab is empty.'}</p></section>`;
  }
  const body = card.marks?.length
    ? card.marks.map(([t, on]) => (on ? html`<strong class="hylos__mark">${t}</strong>` : html`${t}`))
    : html`${card.text}`;
  return html`<section class="hylos" aria-live="polite">${head(err)}
    <div class="hylos__card hylos--${toneOf(card)}">${body}</div></section>`;
}

/** The flag (or Refresh / Change link) was pressed. redraw() redraws the patient page. */
export async function hylosAction(act, redraw) {
  await ready();
  if (act === 'hylos-link') {
    if (await askLink()) await load(redraw);
    return;
  }
  if (act === 'hylos-refresh') {
    await load(redraw);
    return;
  }
  if (!state.open && !state.link && !(await askLink())) return;
  state.open = !state.open;
  redraw();
  const stale = !state.cache || Date.now() - Date.parse(state.cache.fetchedAt) > FRESH_MS;
  if (state.open && stale) await load(redraw);
}
