/* Referrals (#/neurology/referrals): patients referred to your service.
   Two views — Patients (grouped by next rounds day or by location) and
   Calendar (this week and next, with each patient on the day you plan to
   see them). A patient's details open in a sheet, never in the address bar. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { firstDayOfWeek } from '../../core/dates.js';
import { syncSnapshot } from '../../services/sync.js';
import { LATEST_SCRIPT_VERSION, syncScriptVersion } from '../../services/sync.js';
import { MAX_LOCATION, cleanLocation, locationKey, manilaDateKey, wardDay, wardDayLong } from '../ward/model.js';
import {
  MAX_FIELD, MAX_NOTES, MAX_WAIT, addDayKey, addReferral, dayState, deleteReferral, referral, referralLocations, referrals,
  updateReferral, weekdayOf,
} from './store.js';

const PREFS_KEY = 'referrals:view';
let view = null;
let showing = false;
let renderQueued = false;
let weekOffset = 0; // calendar: weeks from this one
const prefs = readPrefs();

function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return { tab: saved.tab === 'calendar' ? 'calendar' : 'list', arrange: saved.arrange === 'location' ? 'location' : 'next' };
  } catch {
    return { tab: 'list', arrange: 'next' };
  }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private window: just for now */ }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
const byNext = (a, b) => (a.next || '9999').localeCompare(b.next || '9999') || byName(a, b);

/** "Today", "Tomorrow", "Yesterday", "Tue, Oct 7". */
function dayLabel(key, today = manilaDateKey()) {
  if (key === today) return 'Today';
  if (key === addDayKey(today, 1)) return 'Tomorrow';
  if (key === addDayKey(today, -1)) return 'Yesterday';
  return wardDay(key);
}

/** "in 3 days", "2 days ago". */
function dayDistance(key, today = manilaDateKey()) {
  const n = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  if (n === 0) return 'today';
  return n > 0 ? `in ${plural(n, 'day')}` : `${plural(-n, 'day')} ago`;
}

/* ---------- The page ---------- */

export const referralsPage = {
  show(el) {
    view = el;
    showing = true;
    render();
  },
  hide() {
    showing = false;
  },
};

function renderSoon() {
  if (!showing || renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 30);
}
on('referrals', renderSoon);
on('sync', renderSoon);

function render() {
  if (!view || !showing) return;
  const focused = view.contains(document.activeElement) ? document.activeElement.closest('[data-focus]')?.dataset.focus : null;
  const add = html`<button type="button" class="btn btn--sm btn--accent" data-action="ref:add" data-focus="add">${icon('plus')}Add</button>`;
  const seg = (name, value, label, iconName, current) => html`<label class="segmented__opt"><input type="radio" name="${name}" value="${value}" data-focus="${name}-${value}"${raw(current === value ? ' checked' : '')}><span>${icon(iconName)}${label}</span></label>`;
  setHTML(view, html`<div class="ward refs accent-neuro">
    ${subHead({ title: 'Referrals', back: 'Neurology', fallback: '', accent: 'neuro', actions: add, eyebrow: 'Neurology service' })}
    ${syncNote()}
    <div class="segmented refs__tabs" role="radiogroup" aria-label="View">
      ${seg('ref-tab', 'list', 'Patients', 'clipboard', prefs.tab)}
      ${seg('ref-tab', 'calendar', 'Calendar', 'calendar', prefs.tab)}
    </div>
    ${prefs.tab === 'calendar' ? calendarView() : listView(seg)}
  </div>`);
  if (focused) view.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

/** Referrals sync through the Google Sheet once the sync script has the Referrals tab. */
function syncNote() {
  const s = syncSnapshot();
  if (!s.connected) return html`<p class="ward-foot">${icon('smartphone')}<span>Saved on this device. Set up Google Sheets sync (Settings → Sync) to see your referrals on all your devices.</span></p>`;
  if ((syncScriptVersion() ?? 0) < LATEST_SCRIPT_VERSION) {
    return html`<div class="banner ward-banner accent-neuro" role="status">
      <span class="banner__icon">${icon('sparkles')}</span>
      <div class="banner__text"><p class="banner__title">Update your sync script to sync referrals</p>
        <p class="banner__sub">They’re saved on this device and go to the Referrals tab of your Google Sheet once the script is updated (version ${LATEST_SCRIPT_VERSION}).</p></div>
      <div class="banner__actions"><button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button></div>
    </div>`;
  }
  return '';
}

/* ---------- Patients ---------- */

function listView(seg) {
  const all = referrals();
  const active = all.filter((r) => r.status !== 'done');
  const done = all.filter((r) => r.status === 'done').sort((a, b) => String(b.doneAt ?? '').localeCompare(String(a.doneAt ?? '')));
  if (!all.length) {
    return html`<section class="card ward-intro">
      <span class="ward-intro__icon">${icon('clipboard')}</span>
      <h2 class="ward-intro__title">No referrals yet</h2>
      <p class="ward-intro__text">Add each patient referred to your service: where they are, the day you’ll see them next, what you’re waiting for, and your notes.</p>
      <button type="button" class="btn btn--accent btn--block" data-action="ref:add">${icon('plus')}Add a referral</button>
    </section>`;
  }
  const groups = prefs.arrange === 'location' ? locationGroups(active) : dayGroups(active);
  return html`
    <div class="ward-arrange-by">
      <span class="ward-arrange-by__label" id="ref-arrange-label">Arrange by</span>
      <div class="segmented" role="radiogroup" aria-labelledby="ref-arrange-label">
        ${seg('ref-arrange', 'next', 'Next rounds', 'calendar', prefs.arrange)}
        ${seg('ref-arrange', 'location', 'Location', 'pin', prefs.arrange)}
      </div>
    </div>
    ${active.length ? groups.map(([id, label, iconName, list]) => html`<section class="ward-group refs-group refs-group--${id}" aria-labelledby="rg-${id}">
      <h2 class="ward-group__title" id="rg-${id}">${icon(iconName)}${label}<span class="ward-group__count">${list.length}</span></h2>
      <ul class="ward-list">${list.map((r) => card(r))}</ul>
    </section>`) : html`<div class="card empty">${icon('checkCircle')}<span>No active referrals — everyone is signed off.</span></div>`}
    ${done.length ? html`<details class="card refs-done">
      <summary class="refs-done__sum">${icon('checkCircle')}Signed off<span class="ward-group__count">${done.length}</span></summary>
      <ul class="ward-list">${done.map((r) => card(r, { done: true }))}</ul>
    </details>` : ''}`;
}

function dayGroups(list, today = manilaDateKey()) {
  const sorted = [...list].sort(byNext);
  const overdue = sorted.filter((r) => r.next && r.next < today);
  const dated = sorted.filter((r) => r.next && r.next >= today);
  const days = [...new Set(dated.map((r) => r.next))];
  return [
    ['overdue', 'Overdue — day has passed', 'info', overdue],
    ...days.map((key) => [`d${key}`, key === today ? 'Today' : key === addDayKey(today, 1) ? 'Tomorrow' : wardDay(key), 'calendar', dated.filter((r) => r.next === key)]),
    ['none', 'No day set', 'circle', sorted.filter((r) => !r.next)],
  ].filter((g) => g[3].length);
}

function locationGroups(list) {
  const groups = referralLocations().map((loc, i) => [`loc${i}`, loc.name, 'pin', list.filter((r) => r.location && locationKey(r.location) === loc.key).sort(byNext)]);
  groups.push(['loc-none', 'No location', 'circle', list.filter((r) => !r.location).sort(byNext)]);
  return groups.filter((g) => g[3].length);
}

function dayBadge(r, today = manilaDateKey()) {
  const state = dayState(r.next, today);
  if (state === 'none') return html`<span class="wbadge">${icon('calendar')}No day set</span>`;
  const tone = { overdue: 'warn', today: 'live', tomorrow: 'sync', later: '' }[state];
  return html`<span class="wbadge${tone ? ` wbadge--${tone}` : ''}">${icon('calendar')}<span class="sr-only">Next rounds: </span>${dayLabel(r.next, today)}${state === 'overdue' ? ` · ${dayDistance(r.next, today)}` : ''}</span>`;
}

function waitingLine(r) {
  const open = r.waiting.filter((w) => !w.done);
  if (!open.length) return '';
  const shown = open.slice(0, 3).map((w) => w.text).join(', ');
  return html`<p class="rf__wait">${icon('hourglass')}<span><strong>Waiting for:</strong> ${shown}${open.length > 3 ? ` +${open.length - 3} more` : ''}</span></p>`;
}

function card(r, { done = false } = {}) {
  const state = done ? 'done' : dayState(r.next);
  return html`<li class="card rf rf--${state}" data-ref-id="${r.id}">
    <div class="rf__body">
      <button type="button" class="pt__name" data-action="ref:open" data-id="${r.id}" data-focus="open-${r.id}">${r.name}${icon('chevronRight', 'pt__chev')}</button>
      ${r.hn ? html`<p class="pt__hn"><span class="pt__label">HN</span> ${r.hn}</p>` : ''}
      <p class="pt__badges">
        ${done ? html`<span class="wbadge wbadge--done">${icon('check')}Signed off</span>` : dayBadge(r)}
        ${r.location ? html`<span class="wbadge wbadge--loc rf__loc">${icon('pin')}<span class="sr-only">Location: </span>${r.location}</span>` : ''}
      </p>
      ${done ? '' : waitingLine(r)}
      ${r.notes ? html`<p class="rf__notes">${r.notes}</p>` : ''}
    </div>
  </li>`;
}

/* ---------- Calendar ---------- */

function weekStart(key) {
  return addDayKey(key, -((weekdayOf(key) - firstDayOfWeek() + 7) % 7));
}

function calendarView() {
  const today = manilaDateKey();
  const start = addDayKey(weekStart(today), weekOffset * 7);
  const active = referrals().filter((r) => r.status !== 'done');
  const weeks = [0, 1].map((w) => Array.from({ length: 7 }, (_, d) => addDayKey(start, w * 7 + d)));
  const last = weeks[1][6];
  const overdue = active.filter((r) => r.next && r.next < today).sort(byNext);
  const none = active.filter((r) => !r.next).sort(byName);
  const range = `${wardDay(start)} – ${wardDay(last)}`;
  const chip = (r) => html`<button type="button" class="rcal__chip rcal__chip--${dayState(r.next, today)}" data-action="ref:open" data-id="${r.id}" data-focus="cal-${r.id}">
    <span class="rcal__name">${r.name}</span>${r.location ? html`<span class="rcal__loc">${icon('pin')}${r.location}</span>` : ''}${r.waiting.some((w) => !w.done) ? html`<span class="rcal__wait" title="Waiting for something">${icon('hourglass')}<span class="sr-only">Waiting for something</span></span>` : ''}
  </button>`;
  return html`<div class="rcal">
    <div class="rcal__nav">
      <button type="button" class="icon-btn" data-action="ref:week" data-dir="-1" data-focus="week-prev" aria-label="Earlier weeks">${icon('chevronLeft')}</button>
      <p class="rcal__range" aria-live="polite">${weekOffset === 0 ? 'This week and next' : range}<small>${weekOffset === 0 ? range : ''}</small></p>
      <button type="button" class="icon-btn" data-action="ref:week" data-dir="1" data-focus="week-next" aria-label="Later weeks">${icon('chevronRight')}</button>
      ${weekOffset ? html`<button type="button" class="btn btn--sm btn--ghost" data-action="ref:week" data-dir="0" data-focus="week-now">This week</button>` : ''}
    </div>
    ${weeks.map((days, w) => html`<section class="rcal__week" aria-label="${w === 0 && weekOffset === 0 ? 'This week' : w === 1 && weekOffset === 0 ? 'Next week' : `Week of ${wardDay(days[0])}`}">
      <h2 class="rcal__week-title">${weekOffset === 0 ? (w === 0 ? 'This week' : 'Next week') : `Week of ${wardDay(days[0])}`}</h2>
      <ol class="rcal__grid">${days.map((key) => {
        const list = active.filter((r) => r.next === key).sort(byName);
        return html`<li class="rcal__day${key === today ? ' is-today' : ''}${key < today ? ' is-past' : ''}${list.length ? '' : ' is-empty'}">
          <p class="rcal__date"><span class="rcal__wd">${dayLabel(key, today) === wardDay(key) ? wardDay(key).split(',')[0] : dayLabel(key, today)}</span><span class="rcal__dn">${wardDay(key).split(', ')[1]}</span>${list.length ? html`<span class="ward-group__count">${list.length}</span>` : ''}</p>
          ${list.length ? html`<div class="rcal__chips">${list.map(chip)}</div>` : html`<p class="rcal__none">—</p>`}
        </li>`;
      })}</ol>
    </section>`)}
    ${overdue.length ? html`<section class="card rcal__extra"><h2 class="ward-group__title">${icon('info')}Overdue — pick a new day<span class="ward-group__count">${overdue.length}</span></h2><div class="rcal__chips">${overdue.map(chip)}</div></section>` : ''}
    ${none.length ? html`<section class="card rcal__extra"><h2 class="ward-group__title">${icon('circle')}No day set<span class="ward-group__count">${none.length}</span></h2><div class="rcal__chips">${none.map(chip)}</div></section>` : ''}
    ${!active.length ? html`<div class="card empty">${icon('calendar')}<span>No active referrals. Tap Add to put one on the calendar.</span></div>` : ''}
  </div>`;
}

/* ---------- One referral (a sheet) ---------- */

function quickDays(r, today = manilaDateKey()) {
  const opts = [['Today', today], ['Tomorrow', addDayKey(today, 1)], ['In 2 days', addDayKey(today, 2)], ['In 3 days', addDayKey(today, 3)], ['Next week', addDayKey(today, 7)]];
  return html`<div class="chips chips--sm rf-days">${opts.map(([label, key]) => html`<button type="button" class="chip-toggle" data-ract="day" data-day="${key}" aria-pressed="${r.next === key ? 'true' : 'false'}">${label}</button>`)}</div>`;
}

function detailBody(r) {
  if (!r) return html`<p class="dlg__msg">This referral was deleted.</p>`;
  const today = manilaDateKey();
  const state = dayState(r.next, today);
  const open = r.waiting.filter((w) => !w.done).length;
  return html`<div class="ptd rfd">
    <p class="ptd__meta">${r.hn ? html`<span class="pt__label">HN</span> ${r.hn}` : 'No hospital number'}${r.location ? html` · ${icon('pin')} ${r.location}` : ' · No location'}${r.status === 'done' ? ' · Signed off' : ''}</p>

    <section class="ptd__section" aria-labelledby="rfd-next">
      <div class="ptd__head"><h3 class="ptd__title" id="rfd-next">Next rounds</h3>
        ${r.next ? html`<button type="button" class="btn btn--sm btn--ghost" data-ract="day" data-day="">Clear</button>` : ''}</div>
      <p class="rfd__day${state === 'overdue' ? ' is-overdue' : ''}">${icon('calendar')}<span>${r.next ? html`<strong>${wardDayLong(r.next)}</strong> · ${dayDistance(r.next, today)}` : 'No day set yet — pick one below'}</span></p>
      ${quickDays(r, today)}
      <label class="field rfd__pick"><span class="field__label">Or pick a day</span>
        <input class="input" type="date" data-rdate value="${r.next}">
      </label>
    </section>

    <section class="ptd__section" aria-labelledby="rfd-wait">
      <div class="ptd__head"><h3 class="ptd__title" id="rfd-wait">Waiting for${open ? html` <span class="ward-group__count">${open}</span>` : ''}</h3></div>
      ${r.waiting.length ? html`<ul class="rfd__waits">${r.waiting.map((w) => html`<li class="rfd__wait${w.done ? ' is-done' : ''}">
        <button type="button" class="pt__tick" role="checkbox" aria-checked="${w.done ? 'true' : 'false'}" data-ract="wait-done" data-wait="${w.id}" aria-label="${w.done ? 'Back' : 'Arrived'}: ${w.text}"><span class="pt__box">${icon('check')}</span></button>
        <span class="rfd__wait-text">${w.text}</span>
        <button type="button" class="icon-btn" data-ract="wait-remove" data-wait="${w.id}" aria-label="Remove ${w.text}">${icon('x')}</button>
      </li>`)}</ul>` : html`<p class="faint">Nothing yet — for example MRI, repeat Na, EEG, CSF results.</p>`}
      <form class="rfd__add" data-wait-form novalidate>
        <input class="input" name="wait" maxlength="${MAX_WAIT}" placeholder="Add what you’re waiting for" autocomplete="off" enterkeyhint="done">
        <button type="submit" class="btn">${icon('plus')}Add</button>
      </form>
    </section>

    <section class="ptd__section" aria-labelledby="rfd-notes">
      <div class="ptd__head"><h3 class="ptd__title" id="rfd-notes">Notes</h3>
        <button type="button" class="btn btn--sm" data-ract="notes">${icon('edit')}Edit</button></div>
      ${r.notes ? html`<div class="prose ptd__text">${r.notes}</div>` : html`<p class="faint">No notes yet.</p>`}
    </section>

    <div class="rfd__foot">
      <button type="button" class="btn btn--sm" data-ract="edit">${icon('edit')}Edit details</button>
      <button type="button" class="btn btn--sm" data-ract="status">${icon(r.status === 'done' ? 'refresh' : 'checkCircle')}${r.status === 'done' ? 'Make active again' : 'Sign off'}</button>
      <button type="button" class="btn btn--sm btn--ghost ward-col__remove" data-ract="delete">${icon('trash')}Delete</button>
    </div>
  </div>`;
}

async function openReferral(id) {
  const r = referral(id);
  if (!r) return;
  let dialog = null;
  const redraw = () => {
    const body = dialog?.querySelector('.dlg__body');
    if (!body || !dialog.open) return;
    const typed = body.querySelector('[name="wait"]')?.value ?? '';
    const hadFocus = body.contains(document.activeElement) && document.activeElement.name === 'wait';
    setHTML(body, detailBody(referral(id)));
    const field = body.querySelector('[name="wait"]');
    if (field) {
      field.value = typed;
      if (hadFocus) field.focus({ preventScroll: true });
    }
    const title = dialog.querySelector('.dlg__title');
    if (title && referral(id)) title.textContent = referral(id).name;
  };
  const stop = on('referrals', redraw);
  await openDialog({
    variant: 'sheet',
    className: 'ward-detail refs-detail accent-neuro',
    dismissible: false, // you type in it (what you're waiting for)
    title: r.name,
    body: detailBody(r),
    actions: [{ label: 'Close', value: '__close', variant: 'ghost' }],
    onOpen(dlg, close) {
      dialog = dlg;
      // Close asks first if something is typed but not added
      const closeBtn = dlg.querySelector('[data-dialog-value="__close"]');
      closeBtn.removeAttribute('data-dialog-value');
      closeBtn.addEventListener('click', async () => {
        const typed = dlg.querySelector('[name="wait"]')?.value.trim();
        if (typed && !(await confirmDialog({ title: 'Discard what you typed?', message: `“${typed}” wasn’t added to Waiting for.`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      dlg.addEventListener('submit', async (event) => {
        if (!event.target.matches('[data-wait-form]')) return;
        event.preventDefault();
        const field = event.target.elements.wait;
        const text = field.value.replace(/\s+/g, ' ').trim();
        if (!text) {
          field.focus();
          return;
        }
        field.value = '';
        await updateReferral(id, (x) => { x.waiting = [...x.waiting, { text, done: false }]; });
        announce(`Added ${text} to Waiting for.`);
      });
      dlg.addEventListener('change', async (event) => {
        if (!event.target.matches('[data-rdate]')) return;
        await setDay(id, event.target.value);
      });
      dlg.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-ract]');
        if (!button || !referral(id)) return;
        const act = button.dataset.ract;
        if (act === 'day') await setDay(id, button.dataset.day);
        else if (act === 'wait-done') {
          await updateReferral(id, (x) => { x.waiting = x.waiting.map((w) => (w.id === button.dataset.wait ? { ...w, done: !w.done } : w)); });
        } else if (act === 'wait-remove') {
          const item = referral(id).waiting.find((w) => w.id === button.dataset.wait);
          await updateReferral(id, (x) => { x.waiting = x.waiting.filter((w) => w.id !== button.dataset.wait); });
          if (item) toast(`Removed “${item.text}”.`, { icon: 'x', action: { label: 'Undo', onClick: () => updateReferral(id, (x) => { x.waiting = [...x.waiting, item]; }) } });
        } else if (act === 'notes') await editNotes(id);
        else if (act === 'edit') await editDetails(id);
        else if (act === 'status') await toggleStatus(id);
        else if (act === 'delete') {
          if (await removeReferral(id)) close(null);
        }
      });
    },
  });
  stop();
}

async function setDay(id, key) {
  const r = await updateReferral(id, (x) => { x.next = key || ''; });
  if (!r) return;
  announce(r.next ? `Next rounds: ${wardDayLong(r.next)}.` : 'No day set.');
}

async function toggleStatus(id) {
  const r = referral(id);
  if (!r) return;
  const done = r.status !== 'done';
  await updateReferral(id, (x) => {
    x.status = done ? 'done' : 'active';
    x.doneAt = done ? new Date().toISOString() : null;
  });
  toast(done ? `${r.name} signed off.` : `${r.name} is active again.`, {
    icon: done ? 'checkCircle' : 'refresh',
    action: { label: 'Undo', onClick: () => updateReferral(id, (x) => { x.status = r.status; x.doneAt = r.doneAt ?? null; }) },
  });
}

async function removeReferral(id) {
  const r = referral(id);
  if (!r) return false;
  const ok = await confirmDialog({
    title: `Delete ${r.name}?`,
    message: 'Their details, notes and what you’re waiting for are deleted on all your devices. To keep them, sign them off instead.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return false;
  await deleteReferral(id);
  toast('Referral deleted.', { icon: 'trash' });
  return true;
}

/* ---------- Typing: add / edit details, notes ---------- */

/** The Add / Edit details form. Resolves the fields, or null. */
async function detailsForm(r = null) {
  const today = manilaDateKey();
  const known = referralLocations();
  const start = { name: r?.name ?? '', hn: r?.hn ?? '', location: r?.location ?? '', next: r?.next ?? '', notes: r?.notes ?? '', wait: '' };
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit refs-form accent-neuro',
    dismissible: false,
    title: r ? 'Edit details' : 'Add a referral',
    body: html`<form class="form" data-rform novalidate>
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="name" maxlength="${MAX_FIELD}" value="${start.name}" autocomplete="off" autocapitalize="words" enterkeyhint="next" required>
      </label>
      <label class="field"><span class="field__label">Hospital number <small class="faint">(optional)</small></span>
        <input class="input" name="hn" maxlength="${MAX_FIELD}" value="${start.hn}" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next">
      </label>
      <label class="field"><span class="field__label">Where they are</span>
        <input class="input" name="location" maxlength="${MAX_LOCATION}" value="${start.location}" placeholder="For example: ICU – Bed 4, ER, Ward 3B" autocomplete="off" autocapitalize="words" enterkeyhint="next">
      </label>
      ${known.length ? html`<div class="chips chips--sm ward-loc__chips">${known.map((loc) => html`<button type="button" class="chip-toggle" data-loc="${loc.name}" aria-pressed="${locationKey(start.location) === loc.key ? 'true' : 'false'}">${icon('pin')}${loc.name}</button>`)}</div>` : ''}
      <div class="field"><span class="field__label" id="rf-next-label">Next rounds</span>
        <div class="chips chips--sm rf-days" role="group" aria-labelledby="rf-next-label">${[['Today', today], ['Tomorrow', addDayKey(today, 1)], ['In 2 days', addDayKey(today, 2)], ['In 3 days', addDayKey(today, 3)], ['Next week', addDayKey(today, 7)], ['No day yet', '']].map(([label, key]) => html`<button type="button" class="chip-toggle" data-day="${key}" aria-pressed="${start.next === key ? 'true' : 'false'}">${label}</button>`)}</div>
        <input class="input rfd__pick" type="date" name="next" value="${start.next}" aria-label="Or pick a day">
      </div>
      ${r ? '' : html`<label class="field"><span class="field__label">Waiting for <small class="faint">(one per line, optional)</small></span>
        <textarea class="input textarea" name="wait" rows="2" maxlength="2000" placeholder="MRI brain&#10;Repeat Na"></textarea>
      </label>`}
      <label class="field"><span class="field__label">Notes</span>
        <textarea class="input textarea" name="notes" rows="5" maxlength="${MAX_NOTES}" autocapitalize="sentences" placeholder="Reason for referral, assessment, plan…">${start.notes}</textarea>
      </label>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${r ? 'Save' : 'Add referral'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-rform]');
      const f = form.elements;
      const error = form.querySelector('[data-error]');
      const values = () => ({ name: f.name.value, hn: f.hn.value, location: f.location.value, next: f.next.value, notes: f.notes.value, wait: f.wait?.value ?? '' });
      const markDays = () => form.querySelectorAll('[data-day]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.day === f.next.value)));
      const markLocs = () => form.querySelectorAll('[data-loc]').forEach((b) => b.setAttribute('aria-pressed', String(Boolean(f.location.value.trim()) && locationKey(b.dataset.loc) === locationKey(f.location.value))));
      if (!r && matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => f.name.focus({ preventScroll: true }), 320); // never while the sheet slides in on iPhone
      form.addEventListener('input', (event) => {
        error.hidden = true;
        if (event.target === f.next) markDays();
        if (event.target === f.location) markLocs();
      });
      form.addEventListener('click', (event) => {
        const day = event.target.closest('[data-day]');
        if (day) {
          f.next.value = day.dataset.day;
          markDays();
          return;
        }
        const loc = event.target.closest('[data-loc]');
        if (loc) {
          f.location.value = loc.dataset.loc;
          markLocs();
        }
      });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        const now = values();
        const changed = Object.keys(start).some((k) => String(now[k]).trim() !== String(start[k]).trim());
        if (changed && !(await confirmDialog({ title: r ? 'Discard your changes?' : 'Discard this referral?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const now = values();
        if (!now.name.trim()) {
          setHTML(error, html`Type the patient’s name.`);
          error.hidden = false;
          f.name.focus();
          return;
        }
        close({ ...now, location: cleanLocation(now.location), waiting: now.wait.split('\n').map((w) => w.trim()).filter(Boolean) });
      });
    },
  });
  return result && typeof result === 'object' ? result : null;
}

async function addNew() {
  const fields = await detailsForm();
  if (!fields) return;
  const r = await addReferral(fields);
  toast(`${r.name} added${r.next ? ` · next rounds ${dayLabel(r.next).toLowerCase() === 'today' ? 'today' : dayLabel(r.next)}` : ''}.`, { icon: 'checkCircle' });
}

async function editDetails(id) {
  const r = referral(id);
  if (!r) return;
  const fields = await detailsForm(r);
  if (!fields) return;
  await updateReferral(id, (x) => Object.assign(x, { name: fields.name, hn: fields.hn, location: fields.location, next: fields.next, notes: fields.notes }));
  toast('Saved.', { icon: 'check' });
}

async function editNotes(id) {
  const r = referral(id);
  if (!r) return;
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit accent-neuro',
    dismissible: false,
    title: 'Edit notes',
    body: html`<form class="form" data-notes novalidate>
      <p class="dlg__msg">${r.name}${r.hn ? ` · HN ${r.hn}` : ''}</p>
      <label class="field"><span class="sr-only">Notes</span>
        <textarea class="input textarea ward-edit__text" name="text" rows="10" maxlength="${MAX_NOTES}" autocapitalize="sentences">${r.notes}</textarea>
      </label>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-notes]');
      const text = form.elements.text;
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => text.focus({ preventScroll: true }), 320);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (text.value !== r.notes && !(await confirmDialog({ title: 'Discard your changes?', message: `Your edits to ${r.name}’s notes will be lost.`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close({ text: text.value });
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  await updateReferral(id, (x) => { x.notes = result.text; });
  toast('Notes saved.', { icon: 'check' });
}

/* ---------- Actions ---------- */

registerAction('ref:add', () => addNew());
registerAction('ref:open', (el) => openReferral(el.dataset.id));
registerAction('ref:week', (el) => {
  const dir = Number(el.dataset.dir);
  weekOffset = dir === 0 ? 0 : weekOffset + dir * 2;
  render();
});
document.addEventListener('change', (event) => {
  if (!showing || !view?.contains(event.target)) return;
  if (event.target.name === 'ref-tab') {
    prefs.tab = event.target.value === 'calendar' ? 'calendar' : 'list';
    weekOffset = 0;
  } else if (event.target.name === 'ref-arrange') {
    prefs.arrange = event.target.value === 'location' ? 'location' : 'next';
  } else return;
  savePrefs();
  render();
});

/** Tapping a card anywhere (not on a button) opens the referral. */
export function handleReferralClick(event) {
  if (!showing) return;
  const el = event.target.closest('.rf[data-ref-id]');
  if (!el || event.target.closest('button, a, input, textarea, select, [data-action]')) return;
  if (window.getSelection()?.toString()) return;
  openReferral(el.dataset.refId);
}
