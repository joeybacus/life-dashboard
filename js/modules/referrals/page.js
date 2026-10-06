/* Referrals (#/neurology/referrals): patients referred to your service, from
   your referral census (a Google Sheet, two-way) and any you add in the app.

   Patients (the deck): active patients, grouped by next rounds day or by
   location, with the inactive ones in a table below — change a status back to
   Active or For rounds (here or in the census) and the patient returns to the
   deck. Calendar: this week and next; drag a name to another day to change
   Next rounds (saved to the census). A patient's details open in a sheet,
   never in the address bar. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction, runAction } from '../../core/actions.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { actionSheet, announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { firstDayOfWeek } from '../../core/dates.js';
import { LATEST_SCRIPT_VERSION, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { CENSUS_ID, CENSUS_ROLES, censusColumns, censusList, updateList } from '../ward/engine.js';
import {
  CENSUS_SCRIPT_VERSION, LOAD_PROBLEMS, MAX_LOCATION, WRITE_PROBLEMS, cleanLocation, colIndex, colLetter, locationKey, manilaDateKey,
  wardDay, wardDayLong, wardStamp,
} from '../ward/model.js';
import { openSetup, removeLogsheet } from '../ward/page.js';
import { MAX_FIELD, MAX_NOTES, MAX_WAIT, addDayKey, addReferral, dayState, deleteReferral, referralLocations, weekdayOf } from './store.js';
import { findPatient, isInactive, referralPatients, setField, statusChoices } from './patients.js';
import { COLORS, MAX_LABELS, MAX_LABEL_NAME, cleanLabelName, colorOf, labelRank, labelsOf, legend, newLabelId, saveLegend } from './labels.js';
import { makeReorderable } from '../../core/reorder.js';

const PREFS_KEY = 'referrals:view';
const AUTO_REFRESH_MS = 3 * 60 * 1000;
const FRESH_MS = 15_000;
let view = null;
let showing = false;
let renderQueued = false;
let refreshTimer = null;
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
/** Labels higher in the legend first (VIP, See first…), then by name. */
const byLabel = (a, b) => labelRank(a.labels) - labelRank(b.labels) || byName(a, b);
const byNext = (a, b) => (a.next || '9999').localeCompare(b.next || '9999') || byLabel(a, b);
let filterLabel = null; // show only patients with this label

/** The colour of a patient's first label (style for --lc), or ''. */
function labelStyle(p) {
  const first = labelsOf(p.labels)[0];
  return first ? `--lc: ${colorOf(first.color).hex}` : '';
}
/** A label as words with its colour (never colour alone). */
const labelChip = (l, extra = '') => html`<span class="wbadge rf__label${extra}" style="--lc: ${colorOf(l.color).hex}"><span class="rf__dot" aria-hidden="true"></span>${l.name}</span>`;

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
    const list = censusList();
    if (list?.link && !(Date.now() - Date.parse(list.cache?.fetchedAt ?? '') < FRESH_MS)) list.refresh();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && showing) censusList()?.refresh();
    }, AUTO_REFRESH_MS);
  },
  hide() {
    showing = false;
    clearInterval(refreshTimer);
  },
};

function renderSoon() {
  if (!showing || renderQueued || dragging) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 30);
}
on('referrals', renderSoon);
on('sync', renderSoon);
on('ward', ({ list }) => { if (!list || list === CENSUS_ID) renderSoon(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !showing) return;
  const list = censusList();
  if (list?.link && !(Date.now() - Date.parse(list.cache?.fetchedAt ?? '') < AUTO_REFRESH_MS)) list.refresh();
});

function render() {
  if (!view || !showing) return;
  const focused = view.contains(document.activeElement) ? document.activeElement.closest('[data-focus]')?.dataset.focus : null;
  const list = censusList();
  const v = list?.view();
  const everyone = referralPatients();
  if (filterLabel && !legend().some((l) => l.id === filterLabel)) filterLabel = null;
  const patients = filterLabel ? everyone.filter((p) => p.labels.includes(filterLabel)) : everyone;
  const actions = html`<button type="button" class="btn btn--sm btn--accent" data-action="ref:add" data-focus="add">${icon('plus')}Add</button>
    <button type="button" class="icon-btn" data-action="ref:menu" aria-label="Referral census options" data-focus="menu">${icon('more')}</button>`;
  const seg = (name, value, label, iconName, current) => html`<label class="segmented__opt"><input type="radio" name="${name}" value="${value}" data-focus="${name}-${value}"${raw(current === value ? ' checked' : '')}><span>${icon(iconName)}${label}</span></label>`;
  setHTML(view, html`<div class="ward refs accent-neuro">
    ${subHead({ title: 'Referrals', back: 'Neurology', fallback: '', accent: 'neuro', actions, eyebrow: v?.link ? `${v.link.title || 'Referral census'} · ${v.link.tab}` : 'Neurology service' })}
    ${v?.link ? censusStatus(v) : linkCard()}
    ${everyone.length ? legendCard(everyone) : ''}
    ${patients.length ? html`<div class="segmented refs__tabs" role="radiogroup" aria-label="View">
      ${seg('ref-tab', 'list', 'Patients', 'clipboard', prefs.tab)}
      ${seg('ref-tab', 'calendar', 'Calendar', 'calendar', prefs.tab)}
    </div>
    ${prefs.tab === 'calendar' ? calendarView(patients) : listView(patients, seg)}` : filterLabel ? html`<div class="card empty">${icon('circle')}<span>No patients have this label yet. Open a patient to give them one.</span></div>` : v?.link && v.cache ? html`<div class="card empty">${icon('clipboard')}<span>No patients in “${v.link.tab}” yet — the census is read from row 2, with names in column ${list.layout().name}. Check the columns (⋯ → Census columns).</span></div>` : ''}
  </div>`);
  if (focused) view.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

/** The legend: each label with its colour and how many patients have it. Tap one to show only them. */
function legendCard(patients) {
  const labels = legend();
  return html`<section class="card refs-legend" aria-labelledby="ref-legend-title">
    <div class="refs-legend__head">
      <h2 class="refs-legend__title" id="ref-legend-title">Legend</h2>
      ${filterLabel ? html`<button type="button" class="btn btn--sm btn--ghost" data-action="ref:filter" data-label="" data-focus="filter-all">Show everyone</button>` : ''}
      <button type="button" class="btn btn--sm btn--ghost" data-action="ref:legend" data-focus="legend-edit">${icon('edit')}Edit</button>
    </div>
    ${labels.length ? html`<div class="refs-legend__chips">${labels.map((l) => {
      const n = patients.filter((p) => p.labels.includes(l.id)).length;
      return html`<button type="button" class="refs-legend__chip" style="--lc: ${colorOf(l.color).hex}" data-action="ref:filter" data-label="${l.id}" data-focus="filter-${l.id}" aria-pressed="${filterLabel === l.id ? 'true' : 'false'}" title="Show only ${l.name}">
        <span class="rf__dot" aria-hidden="true"></span><span class="refs-legend__name">${l.name}</span><span class="refs-legend__count">${n}</span>
      </button>`;
    })}</div>` : html`<p class="faint">No labels yet. Tap Edit to add some (for example VIP or See first).</p>`}
    ${filterLabel ? html`<p class="refs-legend__note">Showing only ${labels.find((l) => l.id === filterLabel)?.name}.</p>` : ''}
  </section>`;
}

/** Before the census is linked on this device. */
function linkCard() {
  const s = syncSnapshot();
  const outdated = s.connected && (syncScriptVersion() ?? 0) < CENSUS_SCRIPT_VERSION;
  return html`<section class="card ward-intro refs-intro">
    <span class="ward-intro__icon">${icon('link')}</span>
    <h2 class="ward-intro__title">Link your referral census</h2>
    <p class="ward-intro__text">Your referrals, straight from the census sheet: status, location, diagnosis, last and next rounds. Changes you make here go back to the sheet.</p>
    ${!s.connected ? html`<p class="note">${icon('cloud')}<span>${LOAD_PROBLEMS['not-connected']}</span></p>
        <button type="button" class="btn btn--accent btn--block" data-action="sync:setup">Set up sync</button>`
      : html`${outdated ? html`<p class="note">${icon('sparkles')}<span>The referral census needs version ${CENSUS_SCRIPT_VERSION} of your sync script (a 2-minute update).</span></p>
          <button type="button" class="btn btn--block" data-action="sync:update">Update the sync script</button>` : ''}
        <button type="button" class="btn btn--accent btn--block" data-action="ref:link">${icon('link')}Link referral census</button>`}
  </section>`;
}

/** Problems, unsaved changes and when it was last loaded. */
function censusStatus(v) {
  const out = [];
  const code = v.error?.code;
  const banner = (tone, iconName, title, text, actions = '') => html`<div class="banner ward-banner accent-${tone}" role="status">
    <span class="banner__icon">${icon(iconName)}</span>
    <div class="banner__text"><p class="banner__title">${title}</p>${text ? html`<p class="banner__sub">${text}</p>` : ''}</div>
    ${actions ? html`<div class="banner__actions">${actions}</div>` : ''}
  </div>`;
  if (!v.online || code === 'offline' || code === 'network') {
    out.push(banner('neutral', 'wifi', `Offline — ${v.cache ? `last updated at ${wardStamp(v.cache.fetchedAt)}` : 'nothing loaded yet'}`, v.unsaved ? `${plural(v.unsaved, 'change')} will be saved to the census when you’re back online.` : ''));
  } else if (code === 'script-outdated') {
    out.push(banner('neuro', 'sparkles', 'Update your sync script', `The referral census needs version ${CENSUS_SCRIPT_VERSION}.`, html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button>`));
  } else if (code === 'not-connected') {
    out.push(banner('neuro', 'cloud', 'Sync is off on this device', LOAD_PROBLEMS['not-connected'], html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:setup">Set up sync</button>`));
  } else if (v.error) {
    out.push(banner('danger', 'info', 'Couldn’t load the census', html`${v.error.message}${v.error.detail ? html`<br><span class="refs-error-detail">Google said: “${v.error.detail}”</span>` : ''}`, html`<button type="button" class="btn btn--sm" data-action="ref:refresh">Try again</button>`));
  }
  if (v.cache?.emptyAt && censusList().emptyAnswer) {
    out.push(banner('workout', 'info', 'The census came back empty', `Google sent no patients at ${wardStamp(v.cache.emptyAt)} (it may still be calculating). Showing the list from ${wardStamp(v.cache.fetchedAt)} — tap Refresh to try again.`));
  }
  if (!censusList().def.mapped) {
    out.push(banner('neuro', 'columns', 'Check the census columns', 'The app is using B Status, E Location, I Name, J Hospital No., K Last rounds, L Next rounds and M Diagnosis.', html`<button type="button" class="btn btn--sm btn--primary" data-action="ref:columns">Check columns</button>`));
  }
  if (v.conflicts.length) {
    out.push(banner('workout', 'info', `${plural(v.conflicts.length, 'change')} ${v.conflicts.length === 1 ? 'needs' : 'need'} your choice`, 'Someone changed the census after the app loaded it.', html`<button type="button" class="btn btn--sm btn--primary" data-action="ref:conflict" data-key="${v.conflicts[0].key}">Review</button>`));
  }
  for (const item of v.blocked.filter((i) => i.problem === 'stuck' || i.problem === 'not-a-choice')) {
    const yours = String(item.set[item.kind] ?? '') || '(empty)';
    out.push(banner('workout', 'info', `Not saved: ${item.name}’s ${item.label || `column ${item.kind}`}`,
      item.problem === 'not-a-choice'
        ? html`Column ${item.kind} of the census only takes the values in its dropdown, and “${yours}” isn’t one of them.${item.choices?.length ? html`<br><span class="refs-error-detail">It takes: ${item.choices.join(', ')}</span>` : ''} Discard it and pick one of those.`
        : html`Google failed twice while saving this change, so the list was loaded without it. Your change: “${yours}”.${item.detail ? html`<br><span class="refs-error-detail">Google said: “${item.detail}”</span>` : ''}`,
      html`<button type="button" class="btn btn--sm" data-action="ref:discard" data-key="${item.key}">Discard</button><button type="button" class="btn btn--sm btn--primary" data-action="ref:retry" data-key="${item.key}">Retry</button>`));
  }
  if (v.cache?.canEdit === false) out.push(banner('neutral', 'lock', 'View only', 'Your Google account can view the census but not edit it, so changes stay on this device (Not synced).'));
  if (v.duplicates.length) out.push(banner('workout', 'info', 'Repeated hospital numbers', `More than one row has ${v.duplicates.join(', ')}. Those patients can’t be changed here until it’s fixed in the census.`));
  const loading = v.phase === 'loading';
  const pending = v.unsaved - v.conflicts.length;
  out.push(html`<div class="ward-status">
    <p class="ward-status__text" aria-live="polite">${loading ? 'Updating…' : v.cache ? `Last updated ${wardStamp(v.cache.fetchedAt)}` : ''}${pending > 0 ? html` · <span class="ward-status__pending">${icon('cloud')}${pending} not synced</span>` : ''}</p>
    <button type="button" class="btn btn--sm btn--ghost ward-status__btn${loading ? ' is-busy' : ''}" data-action="ref:refresh" data-focus="refresh"${loading ? raw(' disabled') : ''}>${icon('refresh')}Refresh</button>
  </div>`);
  return out;
}

/* ---------- Patients: the deck and the inactive table ---------- */

function listView(patients, seg) {
  const active = patients.filter((p) => p.active);
  const inactive = patients.filter((p) => !p.active).sort(byLabel);
  const groups = prefs.arrange === 'location' ? locationGroups(active) : dayGroups(active);
  return html`
    <div class="ward-arrange-by">
      <span class="ward-arrange-by__label" id="ref-arrange-label">Arrange by</span>
      <div class="segmented" role="radiogroup" aria-labelledby="ref-arrange-label">
        ${seg('ref-arrange', 'next', 'Next rounds', 'calendar', prefs.arrange)}
        ${seg('ref-arrange', 'location', 'Location', 'pin', prefs.arrange)}
      </div>
    </div>
    ${active.length ? groups.map(([id, label, iconName, list]) => html`<section class="ward-group refs-group" aria-labelledby="rg-${id}">
      <h2 class="ward-group__title" id="rg-${id}">${icon(iconName)}${label}<span class="ward-group__count">${list.length}</span></h2>
      <ul class="ward-list">${list.map(card)}</ul>
    </section>`) : html`<div class="card empty">${icon('checkCircle')}<span>No active referrals right now.</span></div>`}
    ${inactive.length ? inactiveTable(inactive) : ''}`;
}

function dayGroups(list, today = manilaDateKey()) {
  const sorted = [...list].sort(byNext);
  const dated = sorted.filter((p) => p.next && p.next >= today);
  const days = [...new Set(dated.map((p) => p.next))];
  return [
    ['overdue', 'Overdue — day has passed', 'info', sorted.filter((p) => p.next && p.next < today)],
    ...days.map((key) => [`d${key}`, dayLabel(key, today), 'calendar', dated.filter((p) => p.next === key)]),
    ['none', 'No day set', 'circle', sorted.filter((p) => !p.next)],
  ].filter((g) => g[3].length);
}

function locationGroups(list) {
  const groups = referralLocations(list).filter((loc) => list.some((p) => p.location && locationKey(p.location) === loc.key))
    .map((loc, i) => [`loc${i}`, loc.name, 'pin', list.filter((p) => p.location && locationKey(p.location) === loc.key).sort(byNext)]);
  groups.push(['loc-none', 'No location', 'circle', list.filter((p) => !p.location).sort(byNext)]);
  return groups.filter((g) => g[3].length);
}

function statusBadge(p) {
  if (!p.status) return '';
  const tone = isInactive(p.status) ? '' : /round/i.test(p.status) ? ' wbadge--live' : ' wbadge--done';
  return html`<span class="wbadge${tone}">${icon('circle')}<span class="sr-only">Status: </span>${p.status}</span>`;
}

function dayBadge(p, today = manilaDateKey()) {
  const state = dayState(p.next, today);
  if (state === 'none') return html`<span class="wbadge">${icon('calendar')}${p.nextText ? `Next: ${p.nextText}` : 'No day set'}</span>`;
  const tone = { overdue: 'warn', today: 'live', tomorrow: 'sync', later: '' }[state];
  return html`<span class="wbadge${tone ? ` wbadge--${tone}` : ''}">${icon('calendar')}<span class="sr-only">Next rounds: </span>${dayLabel(p.next, today)}${state === 'overdue' ? ` · ${dayDistance(p.next, today)}` : ''}</span>`;
}

function syncBadge(p) {
  if (p.conflict) return html`<button type="button" class="wbadge wbadge--warn" data-action="ref:conflict" data-key="${p.conflict.key}">${icon('info')}Needs your choice</button>`;
  if (p.blocked) return html`<span class="wbadge wbadge--warn">${icon('info')}Not saved: ${WRITE_PROBLEMS[p.blocked.problem] ?? WRITE_PROBLEMS.invalid}</span>`;
  if (p.unsynced) return html`<span class="wbadge wbadge--sync">${icon('cloud')}Not synced</span>`;
  return '';
}

function card(p) {
  const today = manilaDateKey();
  const open = (p.waiting ?? []).filter((w) => !w.done);
  const labels = labelsOf(p.labels);
  return html`<li class="card rf rf--${dayState(p.next, today)}${labels.length ? ' has-label' : ''}" data-ref-id="${p.id}" style="${labelStyle(p)}">
    <button type="button" class="pt__name" data-action="ref:open" data-id="${p.id}" data-focus="open-${p.id}">${p.name}${icon('chevronRight', 'pt__chev')}</button>
    <p class="pt__hn">${p.hn ? html`<span class="pt__label">HN</span> ${p.hn}` : ''}${p.source === 'app' ? html`${p.hn ? ' · ' : ''}<span class="faint">Added in the app</span>` : ''}</p>
    ${labels.length ? html`<p class="pt__badges rf__labels">${labels.map((l) => labelChip(l))}</p>` : ''}
    <p class="pt__badges">${statusBadge(p)}${dayBadge(p, today)}${p.location ? html`<span class="wbadge wbadge--loc rf__loc">${icon('pin')}<span class="sr-only">Location: </span>${p.location}</span>` : ''}${syncBadge(p)}</p>
    ${p.diagnosis ? html`<p class="rf__dx"><span class="pt__label">Diagnosis</span> ${p.diagnosis}</p>` : ''}
    ${p.last || p.lastText ? html`<p class="rf__last">${icon('history')}Last rounds ${p.last ? `${dayLabel(p.last, today)}${p.last < today ? ` · ${dayDistance(p.last, today)}` : ''}` : p.lastText}</p>` : ''}
    ${open.length ? html`<p class="rf__wait">${icon('hourglass')}<span><strong>Waiting for:</strong> ${open.slice(0, 3).map((w) => w.text).join(', ')}${open.length > 3 ? ` +${open.length - 3} more` : ''}</span></p>` : ''}
    ${p.notes ? html`<p class="rf__notes">${p.notes}</p>` : ''}
  </li>`;
}

/** Inactive patients: change the status to Active or For rounds and they return to the deck. */
function inactiveTable(list) {
  return html`<section class="card refs-inactive" aria-labelledby="ref-inactive-title">
    <h2 class="ward-group__title" id="ref-inactive-title">${icon('circle')}Inactive<span class="ward-group__count">${list.length}</span></h2>
    <p class="refs-inactive__hint">Change a status to Active or For rounds — here or in the census — and the patient moves back to the deck.</p>
    <table class="refs-table">
      <thead><tr><th scope="col">Patient</th><th scope="col">Location</th><th scope="col">Diagnosis</th><th scope="col">Status</th></tr></thead>
      <tbody>${list.map((p) => html`<tr>
        <td><button type="button" class="link-inline refs-table__name" data-action="ref:open" data-id="${p.id}">${p.name}</button>${p.hn ? html`<small>${p.hn}</small>` : ''}${labelsOf(p.labels).length ? html`<span class="rf__labels refs-table__labels">${labelsOf(p.labels).map((l) => labelChip(l, ' wbadge--sm'))}</span>` : ''}</td>
        <td>${p.location || html`<span class="faint">—</span>`}</td>
        <td>${p.diagnosis || html`<span class="faint">—</span>`}</td>
        <td>${p.can.status ? html`<select class="input refs-table__status" data-status-for="${p.id}" aria-label="Status of ${p.name}">
            ${[...new Set([p.status || 'Inactive', ...statusChoices(p)])].map((s) => html`<option value="${s}"${raw(s === (p.status || 'Inactive') ? ' selected' : '')}>${s}</option>`)}
          </select>` : p.status}${syncBadge(p)}</td>
      </tr>`)}</tbody>
    </table>
  </section>`;
}

/* ---------- Calendar (drag a name to another day) ---------- */

function weekStart(key) {
  return addDayKey(key, -((weekdayOf(key) - firstDayOfWeek() + 7) % 7));
}

function calendarView(patients) {
  const today = manilaDateKey();
  const start = addDayKey(weekStart(today), weekOffset * 7);
  const active = patients.filter((p) => p.active);
  const weeks = [0, 1].map((w) => Array.from({ length: 7 }, (_, d) => addDayKey(start, w * 7 + d)));
  const range = `${wardDay(start)} – ${wardDay(weeks[1][6])}`;
  const overdue = active.filter((p) => p.next && p.next < today).sort(byNext);
  const none = active.filter((p) => !p.next).sort(byLabel);
  const chip = (p) => html`<button type="button" class="rcal__chip rcal__chip--${dayState(p.next, today)}${p.unsynced ? ' is-unsynced' : ''}${p.labels.length && labelsOf(p.labels).length ? ' has-label' : ''}" style="${labelStyle(p)}" data-action="ref:open" data-id="${p.id}" data-focus="cal-${p.id}" title="${p.name}${p.location ? ` · ${p.location}` : ''}"${p.can.next ? raw(' data-drag="1"') : ''} aria-description="${p.can.next ? 'Drag to another day to change Next rounds' : ''}">
    <span class="rcal__name">${p.name}</span>${labelsOf(p.labels).length ? html`<span class="sr-only">, ${labelsOf(p.labels).map((l) => l.name).join(', ')}</span><span class="rcal__dots" aria-hidden="true">${labelsOf(p.labels).map((l) => html`<span class="rf__dot" style="--lc: ${colorOf(l.color).hex}"></span>`)}</span>` : ''}${p.location ? html`<span class="rcal__loc">${icon('pin')}${p.location}</span>` : ''}${(p.waiting ?? []).some((w) => !w.done) ? html`<span class="rcal__wait" title="Waiting for something">${icon('hourglass')}<span class="sr-only">Waiting for something</span></span>` : ''}${p.unsynced ? html`<span class="rcal__sync" title="Not synced yet">${icon('cloud')}<span class="sr-only">Not synced yet</span></span>` : ''}
  </button>`;
  return html`<div class="rcal" data-rcal>
    <div class="rcal__nav">
      <button type="button" class="icon-btn" data-action="ref:week" data-dir="-1" data-focus="week-prev" aria-label="Earlier weeks">${icon('chevronLeft')}</button>
      <p class="rcal__range" aria-live="polite">${weekOffset === 0 ? 'This week and next' : range}<small>${weekOffset === 0 ? range : ''}</small></p>
      <button type="button" class="icon-btn" data-action="ref:week" data-dir="1" data-focus="week-next" aria-label="Later weeks">${icon('chevronRight')}</button>
      ${weekOffset ? html`<button type="button" class="btn btn--sm btn--ghost" data-action="ref:week" data-dir="0" data-focus="week-now">This week</button>` : ''}
    </div>
    <p class="rcal__hint">${icon('grip')}<span>Drag a name to another day to change their next rounds${matchMedia('(pointer: coarse)').matches ? ' (touch and hold, then drag)' : ''}.</span></p>
    ${weeks.map((days, w) => html`<section class="rcal__week">
      <h2 class="rcal__week-title">${weekOffset === 0 ? (w === 0 ? 'This week' : 'Next week') : `Week of ${wardDay(days[0])}`}</h2>
      <ol class="rcal__grid">${days.map((key) => {
        const list = active.filter((p) => p.next === key).sort(byLabel);
        const label = dayLabel(key, today);
        return html`<li class="rcal__day${key === today ? ' is-today' : ''}${key < today ? ' is-past' : ''}${list.length ? '' : ' is-empty'}" data-drop-day="${key}">
          <p class="rcal__date"><span class="rcal__wd">${label === wardDay(key) ? wardDay(key).split(',')[0] : label}</span><span class="rcal__dn">${wardDay(key).split(', ')[1]}</span></p>
          ${list.length ? html`<div class="rcal__chips">${list.map(chip)}</div>` : html`<p class="rcal__none">—</p>`}
        </li>`;
      })}</ol>
    </section>`)}
    ${overdue.length ? html`<section class="card rcal__extra"><h2 class="ward-group__title">${icon('info')}Overdue — drag to a new day<span class="ward-group__count">${overdue.length}</span></h2><div class="rcal__chips">${overdue.map(chip)}</div></section>` : ''}
    <section class="card rcal__extra rcal__drop-none" data-drop-day=""><h2 class="ward-group__title">${icon('circle')}No day set<span class="ward-group__count">${none.length}</span></h2>
      ${none.length ? html`<div class="rcal__chips">${none.map(chip)}</div>` : html`<p class="rcal__none-hint">Drop a name here to clear its day.</p>`}</section>
  </div>`;
}

let dragging = null;     // { p, chip, ghost, over, startX, startY, dx, dy }
let suppressClick = false;

function startDrag(chip, x, y) {
  const p = findPatient(chip.dataset.id);
  if (!p?.can.next) return null;
  const rect = chip.getBoundingClientRect();
  const ghost = chip.cloneNode(true);
  ghost.classList.add('rcal__ghost');
  ghost.removeAttribute('data-action');
  ghost.style.width = `${rect.width}px`;
  document.body.append(ghost);
  chip.classList.add('is-dragging');
  document.documentElement.classList.add('is-ref-dragging');
  dragging = { p, chip, ghost, over: null, dx: x - rect.left, dy: y - rect.top };
  moveDrag(x, y);
  navigator.vibrate?.(10);
  return dragging;
}

function moveDrag(x, y) {
  if (!dragging) return;
  dragging.ghost.style.transform = `translate(${x - dragging.dx}px, ${y - dragging.dy}px)`;
  dragging.ghost.hidden = true;
  const target = document.elementFromPoint(x, y)?.closest('[data-drop-day]') ?? null;
  dragging.ghost.hidden = false;
  if (target !== dragging.over) {
    dragging.over?.classList.remove('is-over');
    target?.classList.add('is-over');
    dragging.over = target;
  }
  // Near the top or bottom of the screen: scroll
  const edge = 70;
  if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 4));
  else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - (window.innerHeight - edge)) / 4));
}

async function endDrag(drop) {
  if (!dragging) return;
  const { p, chip, ghost, over } = dragging;
  dragging = null;
  ghost.remove();
  chip.classList.remove('is-dragging');
  over?.classList.remove('is-over');
  document.documentElement.classList.remove('is-ref-dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 350);
  if (!drop || !over) {
    render();
    return;
  }
  const day = over.dataset.dropDay;
  if (day === (p.next || '')) {
    render();
    return;
  }
  const before = p.source === 'census' ? p.nextText : p.next;
  const save = setField(p, 'next', day); // shows straight away; saved to the census in the background
  render();
  const message = day ? `${p.name}: next rounds ${dayLabel(day).toLowerCase() === 'today' ? 'today' : dayLabel(day)}` : `${p.name}: no day set`;
  announce(message);
  toast(`${message}.`, { icon: 'calendar', action: { label: 'Undo', onClick: () => { const now = findPatient(p.id); if (now) setField(now, 'next', before); } } });
  try {
    await save;
  } catch (err) {
    toast(err.message, { icon: 'info' });
  }
}

// Mouse: drag once it moves a little. Touch: touch and hold, then drag (a quick swipe still scrolls).
document.addEventListener('pointerdown', (event) => {
  if (!showing || event.pointerType !== 'mouse' || event.button !== 0) return;
  const chip = event.target.closest('.rcal__chip[data-drag]');
  if (!chip || !view?.contains(chip)) return;
  const sx = event.clientX;
  const sy = event.clientY;
  const move = (e) => {
    if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) startDrag(chip, e.clientX, e.clientY);
    if (dragging) {
      e.preventDefault();
      moveDrag(e.clientX, e.clientY);
    }
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    endDrag(true);
  };
  const cancel = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    endDrag(false);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
});

document.addEventListener('touchstart', (event) => {
  if (!showing || event.touches.length !== 1) return;
  const chip = event.target.closest('.rcal__chip[data-drag]');
  if (!chip || !view?.contains(chip)) return;
  const t = event.touches[0];
  const sx = t.clientX;
  const sy = t.clientY;
  let x = sx;
  let y = sy;
  let timer = setTimeout(() => { timer = null; startDrag(chip, x, y); }, 350);
  const move = (e) => {
    const touch = e.touches[0];
    x = touch.clientX;
    y = touch.clientY;
    if (timer && Math.hypot(x - sx, y - sy) > 8) { // moving before the hold: it's a scroll
      clearTimeout(timer);
      timer = null;
      done();
      return;
    }
    if (dragging) {
      e.preventDefault(); // no scrolling while dragging
      moveDrag(x, y);
    }
  };
  const end = (e) => {
    if (dragging) e.preventDefault(); // no click after a drag
    done();
    endDrag(e.type === 'touchend');
  };
  const done = () => {
    clearTimeout(timer);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);
    document.removeEventListener('touchcancel', end);
  };
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}, { passive: true });

// A long press shouldn't open the iPhone menu or select text on a name
document.addEventListener('contextmenu', (event) => { if (showing && event.target.closest?.('.rcal__chip[data-drag]')) event.preventDefault(); });
document.addEventListener('click', (event) => {
  if (suppressClick && event.target.closest?.('.rcal__chip')) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

/* ---------- One patient (a sheet) ---------- */

function quickDays(p, today) {
  const opts = [['Today', today], ['Tomorrow', addDayKey(today, 1)], ['In 2 days', addDayKey(today, 2)], ['In 3 days', addDayKey(today, 3)], ['Next week', addDayKey(today, 7)]];
  return html`<div class="chips chips--sm rf-days">${opts.map(([label, key]) => html`<button type="button" class="chip-toggle" data-ract="next" data-day="${key}" aria-pressed="${p.next === key ? 'true' : 'false'}">${label}</button>`)}</div>`;
}

function section(id, title, body, head = '') {
  return html`<section class="ptd__section" aria-labelledby="rfd-${id}">
    <div class="ptd__head"><h3 class="ptd__title" id="rfd-${id}">${title}</h3>${head}</div>
    ${body}
  </section>`;
}

function detailBody(p) {
  if (!p) return html`<p class="dlg__msg">This patient is no longer in the census.</p>`;
  const today = manilaDateKey();
  const state = dayState(p.next, today);
  const edit = (role, label) => (p.can[role] ? html`<button type="button" class="btn btn--sm" data-ract="edit" data-role="${role}" aria-label="Edit ${label}">${icon('edit')}Edit</button>` : '');
  const item = p.conflict ?? p.blocked;
  return html`<div class="ptd rfd">
    <p class="ptd__meta">${p.hn ? html`<span class="pt__label">HN</span> ${p.hn}` : 'No hospital number'}${p.source === 'census' ? ` · row ${p.row} of the census` : ' · added in the app'}</p>
    ${item ? html`<p class="note ward-note--warn">${icon('info')}<span>${p.conflict ? html`Someone changed this in the census after the app loaded it. <button type="button" class="link-inline" data-action="ref:conflict" data-key="${p.conflict.key}">Choose a version</button>` : html`Not saved: ${WRITE_PROBLEMS[p.blocked.problem] ?? WRITE_PROBLEMS.invalid}.${p.blocked.problem === 'stuck' ? html` <button type="button" class="link-inline" data-action="ref:retry" data-key="${p.blocked.key}">Retry</button> · <button type="button" class="link-inline" data-action="ref:discard" data-key="${p.blocked.key}">Discard</button>` : ''}`}</span></p>`
      : p.unsynced ? html`<p class="note">${icon('cloud')}<span>Not synced yet — it’s saved on this device and goes to the census automatically.</span></p>` : ''}
    ${!p.editable ? html`<p class="note ward-note--warn">${icon('info')}<span>${p.hn ? 'Another row of the census has the same hospital number' : 'This row has no hospital number'}, so it can’t be changed here until that’s fixed in the census.</span></p>` : ''}

    ${p.can.status || p.status ? section('status', 'Status', p.can.status ? html`<div class="chips chips--sm">${[...new Set([...statusChoices(p), ...(p.status && !statusChoices(p).some((x) => x.toLowerCase() === p.status.toLowerCase()) ? [p.status] : [])])].map((s) => html`<button type="button" class="chip-toggle" data-ract="status" data-value="${s}" aria-pressed="${s.toLowerCase() === (p.status || '').toLowerCase() ? 'true' : 'false'}">${s}</button>`)}</div>
      <p class="faint rfd__hint">${p.active ? 'In the deck.' : 'In the Inactive table.'} Inactive patients leave the deck; Active or For rounds bring them back.</p>` : html`<p>${p.status}</p>`) : ''}

    ${p.can.labels ? section('labels', 'Labels', html`${legend().length ? html`<div class="chips chips--sm rfd__labels">${legend().map((l) => html`<button type="button" class="chip-toggle rfd__label" style="--lc: ${colorOf(l.color).hex}" data-ract="label" data-label="${l.id}" aria-pressed="${p.labels.includes(l.id) ? 'true' : 'false'}"><span class="rf__dot" aria-hidden="true"></span>${l.name}</button>`)}</div>` : html`<p class="faint">No labels in the legend yet.</p>`}`,
      html`<button type="button" class="btn btn--sm btn--ghost" data-action="ref:legend">${icon('edit')}Edit legend</button>`) : ''}

    ${section('next', 'Next rounds', html`<p class="rfd__day${state === 'overdue' ? ' is-overdue' : ''}">${icon('calendar')}<span>${p.next ? html`<strong>${wardDayLong(p.next)}</strong> · ${dayDistance(p.next, today)}` : p.nextText ? `“${p.nextText}” in the census (not a date)` : 'No day set'}</span></p>
      ${p.can.next ? html`${quickDays(p, today)}<label class="field rfd__pick"><span class="field__label">Or pick a day</span><input class="input" type="date" data-rdate value="${p.next}"></label>` : ''}`,
      p.can.next && (p.next || p.nextText) ? html`<button type="button" class="btn btn--sm btn--ghost" data-ract="next" data-day="">Clear</button>` : '')}

    ${section('last', 'Last rounds', html`<p class="rfd__day">${icon('history')}<span>${p.last ? html`<strong>${wardDayLong(p.last)}</strong> · ${dayDistance(p.last, today)}` : p.lastText || 'Not recorded'}</span></p>`,
      p.can.last && p.last !== today ? html`<button type="button" class="btn btn--sm btn--accent" data-ract="seen">${icon('check')}Seen today</button>` : '')}

    ${p.can.location || p.location ? section('loc', 'Location', p.location ? html`<p>${icon('pin')} ${p.location}</p>` : html`<p class="faint">Not set.</p>`, edit('location', 'location')) : ''}
    ${p.can.diagnosis || p.diagnosis ? section('dx', 'Diagnosis', p.diagnosis ? html`<div class="prose ptd__text">${p.diagnosis}</div>` : html`<p class="faint">Not set.</p>`, edit('diagnosis', 'diagnosis')) : ''}

    ${p.waiting ? section('wait', html`Waiting for${p.waiting.some((w) => !w.done) ? html` <span class="ward-group__count">${p.waiting.filter((w) => !w.done).length}</span>` : ''}`, html`
      ${p.waiting.length ? html`<ul class="rfd__waits">${p.waiting.map((w) => html`<li class="rfd__wait${w.done ? ' is-done' : ''}">
        <button type="button" class="pt__tick" role="checkbox" aria-checked="${w.done ? 'true' : 'false'}" data-ract="wait-done" data-wait="${w.id}" aria-label="Arrived: ${w.text}"${p.can.waiting ? '' : raw(' disabled')}><span class="pt__box">${icon('check')}</span></button>
        <span class="rfd__wait-text">${w.text}</span>
        ${p.can.waiting ? html`<button type="button" class="icon-btn" data-ract="wait-remove" data-wait="${w.id}" aria-label="Remove ${w.text}">${icon('x')}</button>` : ''}
      </li>`)}</ul>` : html`<p class="faint">Nothing yet — for example MRI, repeat Na, EEG, CSF results.</p>`}
      ${p.can.waiting ? html`<form class="rfd__add" data-wait-form novalidate>
        <input class="input" name="wait" maxlength="${MAX_WAIT}" placeholder="Add what you’re waiting for" autocomplete="off" enterkeyhint="done">
        <button type="submit" class="btn">${icon('plus')}Add</button>
      </form>` : ''}`) : ''}

    ${p.notes != null ? section('notes', 'Notes', p.notes ? html`<div class="prose ptd__text">${p.notes}</div>` : html`<p class="faint">No notes yet.</p>`, edit('notes', 'notes')) : ''}

    <div class="rfd__foot">
      ${p.source === 'app' ? html`<button type="button" class="btn btn--sm" data-ract="details">${icon('edit')}Edit name and number</button>
        <button type="button" class="btn btn--sm btn--ghost ward-col__remove" data-ract="delete">${icon('trash')}Delete</button>`
        : censusList()?.link ? html`<a class="btn btn--sm btn--ghost" href="${censusList().link.url}" target="_blank" rel="noopener">${icon('external')}Open the census</a>` : ''}
    </div>
  </div>`;
}

async function openPatient(id) {
  const p = findPatient(id);
  if (!p) return;
  let dialog = null;
  const redraw = () => {
    const body = dialog?.querySelector('.dlg__body');
    if (!body || !dialog.open) return;
    const typed = body.querySelector('[name="wait"]')?.value ?? '';
    const hadFocus = body.contains(document.activeElement) && document.activeElement.name === 'wait';
    setHTML(body, detailBody(findPatient(id)));
    const field = body.querySelector('[name="wait"]');
    if (field) {
      field.value = typed;
      if (hadFocus) field.focus({ preventScroll: true });
    }
  };
  const stops = [on('referrals', redraw), on('ward', ({ list }) => { if (!list || list === CENSUS_ID) redraw(); })];
  const change = async (role, value, message) => {
    const now = findPatient(id);
    if (!now) return;
    try {
      const outcome = await setField(now, role, value);
      if (message) announce(message);
      if (outcome && outcome.state === 'blocked') toast(`Not saved: ${WRITE_PROBLEMS[outcome.problem] ?? WRITE_PROBLEMS.invalid}.`, { icon: 'info', duration: 6000 });
      else if (outcome && outcome.state === 'conflict') openConflict(findPatient(id)?.conflict?.key);
    } catch (err) {
      toast(err.message, { icon: 'info' });
    }
  };
  await openDialog({
    variant: 'sheet',
    className: 'ward-detail refs-detail accent-neuro',
    dismissible: false, // you type in it (what you're waiting for)
    title: p.name,
    body: detailBody(p),
    actions: [{ label: 'Close', value: '__close', variant: 'ghost' }],
    onOpen(dlg, close) {
      dialog = dlg;
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
        if (!text) return;
        field.value = '';
        const now = findPatient(id);
        if (now) await change('waiting', [...now.waiting, { text, done: false }], `Added ${text} to Waiting for.`);
      });
      dlg.addEventListener('change', (event) => {
        if (event.target.matches('[data-rdate]')) change('next', event.target.value, event.target.value ? `Next rounds: ${wardDayLong(event.target.value)}.` : 'No day set.');
      });
      dlg.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-ract]');
        const now = findPatient(id);
        if (!b || !now) return;
        const act = b.dataset.ract;
        if (act === 'label') {
          const id2 = b.dataset.label;
          const on = !now.labels.includes(id2);
          const next = on ? [...now.labels, id2] : now.labels.filter((x) => x !== id2);
          await setField(now, 'labels', legend().map((l) => l.id).filter((x) => next.includes(x)));
          announce(`${legend().find((l) => l.id === id2)?.name}: ${on ? 'on' : 'off'}.`);
        } else if (act === 'next') await change('next', b.dataset.day, b.dataset.day ? `Next rounds: ${wardDayLong(b.dataset.day)}.` : 'No day set.');
        else if (act === 'seen') await change('last', manilaDateKey(), 'Last rounds: today.');
        else if (act === 'status') {
          await change('status', b.dataset.value, `Status: ${b.dataset.value}.`);
          toast(isInactive(b.dataset.value) ? `${now.name} moved to Inactive.` : `${now.name} is in the deck.`, { icon: 'check' });
        } else if (act === 'wait-done') await change('waiting', now.waiting.map((w) => (w.id === b.dataset.wait ? { ...w, done: !w.done } : w)));
        else if (act === 'wait-remove') {
          const item = now.waiting.find((w) => w.id === b.dataset.wait);
          await change('waiting', now.waiting.filter((w) => w.id !== b.dataset.wait));
          if (item) toast(`Removed “${item.text}”.`, { icon: 'x' });
        } else if (act === 'edit') await editText(now, b.dataset.role);
        else if (act === 'details') await editDetails(now);
        else if (act === 'delete') {
          if (await confirmDialog({ title: `Delete ${now.name}?`, message: 'This referral (added in the app) is deleted on all your devices.', confirmLabel: 'Delete', destructive: true })) {
            await deleteReferral(now.refId);
            close(null);
            toast('Referral deleted.', { icon: 'trash' });
          }
        }
      });
    },
  });
  stops.forEach((stop) => stop());
}

/* ---------- Typing: one field, a new referral ---------- */

const ROLE_LABEL = { location: 'Location', diagnosis: 'Diagnosis', notes: 'Notes' };

async function editText(p, role) {
  const before = role === 'location' ? p.location : p[role] ?? '';
  const known = role === 'location' ? referralLocations(referralPatients()) : [];
  const multi = role !== 'location';
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit ward-loc accent-neuro',
    dismissible: false,
    title: `Edit ${ROLE_LABEL[role]}`,
    body: html`<form class="form" data-edit novalidate>
      <p class="dlg__msg">${p.name}${p.hn ? ` · HN ${p.hn}` : ''}</p>
      <label class="field"><span class="sr-only">${ROLE_LABEL[role]}</span>
        ${multi ? html`<textarea class="input textarea ward-edit__text" name="text" rows="${role === 'notes' ? 9 : 3}" maxlength="${MAX_NOTES}" autocapitalize="sentences">${before}</textarea>`
          : html`<input class="input" name="text" maxlength="${MAX_LOCATION}" value="${before}" placeholder="For example: ICU – Bed 4" autocomplete="off" autocapitalize="words" enterkeyhint="done">`}
      </label>
      ${known.length ? html`<div class="chips chips--sm ward-loc__chips">${known.map((loc) => html`<button type="button" class="chip-toggle" data-loc="${loc.name}" aria-pressed="${locationKey(before) === loc.key ? 'true' : 'false'}">${icon('pin')}${loc.name}</button>`)}</div>` : ''}
      ${p.source === 'census' ? html`<p class="ward-edit__hint">Saved to column ${p.cols[role]} of the census.</p>` : ''}
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-edit]');
      const text = form.elements.text;
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => text.focus({ preventScroll: true }), 320);
      form.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-loc]');
        if (chip) text.value = chip.dataset.loc;
      });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (text.value !== before && !(await confirmDialog({ title: 'Discard your changes?', message: `${p.name}’s ${ROLE_LABEL[role].toLowerCase()} won’t be changed.`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close({ text: role === 'location' ? cleanLocation(text.value) : text.value });
      });
    },
  });
  if (!result || typeof result !== 'object' || result.text === before) return;
  const now = findPatient(p.id);
  if (now) await setField(now, role, result.text);
  toast(p.source === 'census' ? 'Saved to the census.' : 'Saved.', { icon: 'check' });
}

/** Add a referral in the app (or change one's name and number). */
async function detailsForm(r = null) {
  const today = manilaDateKey();
  const start = { name: r?.name ?? '', hn: r?.hn ?? '', location: r?.location ?? '', diagnosis: r?.diagnosis ?? '', next: r?.next ?? '' };
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit refs-form accent-neuro',
    dismissible: false,
    title: r ? 'Edit name and number' : 'Add a referral',
    body: html`<form class="form" data-rform novalidate>
      ${r ? '' : html`<p class="dlg__msg">${censusList()?.link ? 'For a patient who isn’t in the census. It’s kept in the app (and synced to your devices), not added to the census.' : 'Kept in the app and synced to your devices.'}</p>`}
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="name" maxlength="${MAX_FIELD}" value="${start.name}" autocomplete="off" autocapitalize="words" required>
      </label>
      <label class="field"><span class="field__label">Hospital number <small class="faint">(optional)</small></span>
        <input class="input" name="hn" maxlength="${MAX_FIELD}" value="${start.hn}" autocomplete="off" autocapitalize="characters" spellcheck="false">
      </label>
      ${r ? '' : html`<label class="field"><span class="field__label">Location</span>
        <input class="input" name="location" maxlength="${MAX_LOCATION}" placeholder="For example: ICU – Bed 4" autocomplete="off" autocapitalize="words">
      </label>
      <label class="field"><span class="field__label">Diagnosis</span>
        <input class="input" name="diagnosis" maxlength="${MAX_WAIT}" autocomplete="off" autocapitalize="sentences">
      </label>
      <div class="field"><span class="field__label" id="rf-next-label">Next rounds</span>
        <div class="chips chips--sm rf-days" role="group" aria-labelledby="rf-next-label">${[['Today', today], ['Tomorrow', addDayKey(today, 1)], ['In 2 days', addDayKey(today, 2)], ['Next week', addDayKey(today, 7)], ['No day yet', '']].map(([label, key]) => html`<button type="button" class="chip-toggle" data-day="${key}" aria-pressed="${key === '' ? 'true' : 'false'}">${label}</button>`)}</div>
        <input class="input rfd__pick" type="date" name="next" aria-label="Or pick a day">
      </div>`}
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
      const values = () => ({ name: f.name.value, hn: f.hn.value, location: f.location?.value ?? start.location, diagnosis: f.diagnosis?.value ?? start.diagnosis, next: f.next?.value ?? start.next });
      const markDays = () => form.querySelectorAll('[data-day]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.day === f.next.value)));
      if (!r && matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => f.name.focus({ preventScroll: true }), 320);
      form.addEventListener('input', (event) => {
        error.hidden = true;
        if (event.target === f.next) markDays();
      });
      form.addEventListener('click', (event) => {
        const day = event.target.closest('[data-day]');
        if (!day) return;
        f.next.value = day.dataset.day;
        markDays();
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
        close(now);
      });
    },
  });
  return result && typeof result === 'object' ? result : null;
}

async function editDetails(p) {
  const fields = await detailsForm(p);
  if (!fields) return;
  await setField(p, 'name', fields.name);
  const now = findPatient(p.id);
  if (now) await setField(now, 'hn', fields.hn);
  toast('Saved.', { icon: 'check' });
}

/* ---------- The legend: name, colour and order of each label ---------- */

function legendRow(l, i, count) {
  return html`<li class="refs-leg" data-id="${l.id}" style="--lc: ${colorOf(l.color).hex}">
    <span class="ward-col__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
    <span class="refs-leg__swatch" aria-hidden="true"></span>
    <div class="refs-leg__body">
      <input class="input refs-leg__name" data-leg-name maxlength="${MAX_LABEL_NAME}" value="${l.name}" aria-label="Label name" placeholder="Label name" autocomplete="off">
      <div class="refs-leg__colors" role="radiogroup" aria-label="Colour of ${l.name || 'this label'}">${COLORS.map((c) => html`<button type="button" class="refs-leg__color" role="radio" style="--sw: ${c.hex}" data-leg-color="${c.id}" aria-checked="${c.id === l.color ? 'true' : 'false'}" aria-label="${c.name}" title="${c.name}"></button>`)}</div>
    </div>
    <button type="button" class="icon-btn ward-col__remove" data-leg-remove aria-label="Delete ${l.name || 'this label'}">${icon('trash')}</button>
    <button type="button" class="sr-only sr-only-focusable" data-leg-move="-1"${raw(i === 0 ? ' disabled' : '')}>Move ${l.name} up</button>
    <button type="button" class="sr-only sr-only-focusable" data-leg-move="1"${raw(i === count - 1 ? ' disabled' : '')}>Move ${l.name} down</button>
  </li>`;
}

async function openLegend() {
  let labels = legend().map((l) => ({ ...l }));
  const start = JSON.stringify(labels);
  const counts = new Map(legend().map((l) => [l.id, referralPatients().filter((p) => p.labels.includes(l.id)).length]));
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-cols-sheet refs-legend-sheet accent-neuro',
    dismissible: false,
    title: 'Legend',
    body: html`<p class="dlg__msg">Name each colour — for example VIP, See first or Under consultant. Labels higher in the list come first within each day; drag ${icon('grip')} to change the order.</p>
      <ol class="card refs-legs" data-legs></ol>
      <button type="button" class="btn btn--block ward-cols__add" data-leg-add>${icon('plus')}Add label</button>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="button" class="btn btn--primary" data-save>Save legend</button>
      </div>`,
    onOpen(dlg, close) {
      const ol = dlg.querySelector('[data-legs]');
      const error = dlg.querySelector('[data-error]');
      const add = dlg.querySelector('[data-leg-add]');
      const read = () => { // keep what's typed before redrawing
        ol.querySelectorAll('.refs-leg').forEach((li) => {
          const l = labels.find((x) => x.id === li.dataset.id);
          if (l) l.name = li.querySelector('[data-leg-name]').value;
        });
      };
      const draw = (focus = null) => {
        setHTML(ol, labels.length ? html`${labels.map((l, i) => legendRow(l, i, labels.length))}` : html`<li class="refs-leg refs-leg--none faint">No labels — add one below.</li>`);
        add.disabled = labels.length >= MAX_LABELS;
        if (focus) ol.querySelector(focus)?.focus();
      };
      draw();
      makeReorderable(ol, {
        scroller: dlg.querySelector('.dlg__panel'),
        onReorder: (ids) => {
          read();
          labels = ids.map((id) => labels.find((l) => l.id === id)).filter(Boolean);
          draw();
        },
      });
      dlg.addEventListener('input', () => { error.hidden = true; });
      dlg.addEventListener('click', async (event) => {
        const li = event.target.closest('.refs-leg[data-id]');
        const l = li && labels.find((x) => x.id === li.dataset.id);
        const color = event.target.closest('[data-leg-color]');
        if (color && l) {
          read();
          l.color = color.dataset.legColor;
          draw(`[data-id="${CSS.escape(l.id)}"] [data-leg-color="${l.color}"]`);
          return;
        }
        if (event.target.closest('[data-leg-remove]') && l) {
          read();
          const n = counts.get(l.id) ?? 0;
          if (n && !(await confirmDialog({ title: `Delete “${l.name || 'this label'}”?`, message: `${plural(n, 'patient')} ${n === 1 ? 'has' : 'have'} it; the label is taken off them (nothing else changes). Takes effect when you tap Save legend.`, confirmLabel: 'Delete label', destructive: true }))) return;
          labels = labels.filter((x) => x !== l);
          draw();
          return;
        }
        const move = event.target.closest('[data-leg-move]');
        if (move && l) {
          read();
          const from = labels.indexOf(l);
          const to = from + Number(move.dataset.legMove);
          if (to < 0 || to >= labels.length) return;
          labels.splice(to, 0, labels.splice(from, 1)[0]);
          draw(`[data-id="${CSS.escape(l.id)}"] [data-leg-move="${move.dataset.legMove}"]`);
          announce(`Moved to position ${to + 1} of ${labels.length}.`);
          return;
        }
        if (event.target.closest('[data-leg-add]')) {
          read();
          const used = new Set(labels.map((x) => x.color));
          const id = newLabelId();
          labels.push({ id, name: '', color: (COLORS.find((c) => !used.has(c.id)) ?? COLORS[0]).id });
          draw(`[data-id="${CSS.escape(id)}"] [data-leg-name]`);
          return;
        }
        if (event.target.closest('[data-cancel]')) {
          read();
          if (JSON.stringify(labels) !== start && !(await confirmDialog({ title: 'Discard your changes?', message: 'The legend stays as it was.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
          close(null);
          return;
        }
        if (event.target.closest('[data-save]')) {
          read();
          const named = labels.map((x) => ({ ...x, name: cleanLabelName(x.name) }));
          if (named.some((x) => !x.name)) {
            setHTML(error, html`Give every label a name (or delete the empty one).`);
            error.hidden = false;
            return;
          }
          const names = named.map((x) => x.name.toLowerCase());
          if (new Set(names).size !== names.length) {
            setHTML(error, html`Two labels have the same name.`);
            error.hidden = false;
            return;
          }
          close({ labels: named });
        }
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  await saveLegend(result.labels);
  toast('Legend saved.', { icon: 'check' });
}

/* ---------- The census: columns, conflicts, menu ---------- */

/** Tick which census column holds each thing. */
export async function openCensusColumns() {
  const list = censusList();
  if (!list) return;
  const headings = list.cache?.headings ?? [];
  const width = Math.min(52, Math.max(14, headings.length + 2));
  const letters = Array.from({ length: width }, (_, i) => colLetter(i + 1));
  const label = (c) => {
    const h = String(headings[colIndex(c) - 1] ?? '').trim();
    return h ? `${c} · “${h}”` : c;
  };
  const L = list.layout();
  const current = Object.fromEntries((list.def.columns ?? []).filter((c) => c.role).map((c) => [c.role, c.col]));
  const rows = [
    { role: 'name', label: 'Name', col: L.name, required: true },
    { role: 'hn', label: 'Hospital number', col: L.hn, required: true },
    ...CENSUS_ROLES.map((r) => ({ ...r, col: list.def.mapped || current[r.role] ? current[r.role] ?? '' : r.col })),
  ];
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-addcol refs-cols accent-neuro',
    dismissible: false,
    title: 'Census columns',
    body: html`<form class="form" data-census-cols novalidate>
      <p class="dlg__msg">Which column of ${list.link ? `“${list.link.title || 'your census'}” · ${list.link.tab}` : 'your census'} holds each thing. Patients are read from row 2. The app writes only to the columns below (never Name or Hospital number), and only when you change something.</p>
      ${rows.map((r) => html`<label class="field refs-cols__row"><span class="field__label">${r.label}${r.required ? '' : r.role === 'waiting' || r.role === 'notes' ? html` <small class="faint">(optional)</small>` : ''}</span>
        <select class="input" name="${r.role}">
          ${r.required ? '' : html`<option value=""${raw(r.col ? '' : ' selected')}>Not in the census</option>`}
          ${letters.map((c) => html`<option value="${c}"${raw(c === r.col ? ' selected' : '')}>${label(c)}</option>`)}
        </select></label>`)}
      <p class="note">${icon('info')}<span>Waiting for: one thing per line in its cell; the app adds “✓ ” in front of things that have arrived.</span></p>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save columns</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-census-cols]');
      const error = form.querySelector('[data-error]');
      const values = () => Object.fromEntries(rows.map((r) => [r.role, form.elements[r.role].value]));
      const start = JSON.stringify(values());
      form.addEventListener('change', () => { error.hidden = true; });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (JSON.stringify(values()) !== start && !(await confirmDialog({ title: 'Discard these changes?', message: 'The columns stay as they were.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const v = values();
        const used = Object.values(v).filter(Boolean);
        if (new Set(used).size !== used.length) {
          setHTML(error, html`Each column can be used for one thing only.`);
          error.hidden = false;
          return;
        }
        close(v);
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  await updateList(CENSUS_ID, (def) => {
    def.layout = { name: result.name, hn: result.hn, rounds: '' };
    def.columns = censusColumns(CENSUS_ROLES.map((r) => ({ ...r, col: result[r.role] })));
    def.mapped = true;
  });
  toast('Census columns saved. Reloading…', { icon: 'columns' });
  censusList()?.refresh();
}

async function openConflict(key) {
  const list = censusList();
  const item = list?.view().conflicts.find((i) => i.key === key);
  if (!item) return;
  const col = item.kind;
  const choice = await openDialog({
    variant: 'modal',
    className: 'ward-conflict accent-neuro',
    title: `“${item.label || `Column ${col}`}” was changed`,
    body: html`<p class="dlg__msg"><strong>${item.name}</strong>: someone changed this in the census after the app loaded it. Which version should the census keep?</p>
      <div class="ward-versions">
        <section class="ward-version"><h3 class="ward-version__title">In the census now</h3><div class="prose">${item.current?.[col] || '(empty)'}</div></section>
        <section class="ward-version ward-version--mine"><h3 class="ward-version__title">Yours</h3><div class="prose">${item.set[col] || '(empty)'}</div></section>
      </div>`,
    actions: [{ label: 'Keep the census’s', value: 'theirs' }, { label: 'Keep mine', value: 'mine', variant: 'primary' }],
  });
  if (choice !== 'mine' && choice !== 'theirs') return;
  await list.resolveConflict(key, choice);
  toast(choice === 'mine' ? 'Your version is being saved to the census.' : 'Kept the census’s version.', { icon: 'check' });
}

async function linkCensus() {
  if ((syncScriptVersion() ?? 0) < CENSUS_SCRIPT_VERSION && syncSnapshot().connected) {
    if (await confirmDialog({ title: 'Update the sync script first', message: `The referral census needs version ${CENSUS_SCRIPT_VERSION} of your sync script (a 2-minute update).`, confirmLabel: 'Show me how' })) runAction('sync:update');
    return;
  }
  const had = Boolean(censusList()?.link);
  await openSetup(CENSUS_ID);
  // Once linked the first time: check the columns
  for (let i = 0; i < 20 && !had && !censusList()?.link; i++) await new Promise((r) => setTimeout(r, 150));
  if (!had && censusList()?.link && !censusList().def.mapped) openCensusColumns();
}

async function openMenu() {
  const list = censusList();
  const link = list?.link;
  const choice = await actionSheet({
    title: 'Referral census',
    message: link ? `${link.title || 'Census'} · tab “${link.tab}”` : 'Not linked on this device',
    items: [
      link ? { label: 'Refresh now', value: 'refresh', icon: 'refresh' } : null,
      { label: 'Census columns', value: 'columns', icon: 'columns', detail: 'Which column holds what' },
      { label: 'Legend', value: 'legend', icon: 'edit', detail: 'Colour labels' },
      link ? { label: 'Open in Google Sheets', value: 'open', icon: 'external' } : null,
      { label: link ? 'Change census link' : 'Link referral census', value: 'link', icon: 'link' },
      link ? { label: 'Remove link from this device', value: 'remove', icon: 'x' } : null,
    ],
  });
  if (choice === 'refresh') list.refresh();
  else if (choice === 'columns') openCensusColumns();
  else if (choice === 'legend') openLegend();
  else if (choice === 'open') window.open(link.url, '_blank', 'noopener');
  else if (choice === 'link') linkCensus();
  else if (choice === 'remove') removeLogsheet(CENSUS_ID);
}

/* ---------- Actions ---------- */

registerAction('ref:add', async () => {
  const fields = await detailsForm();
  if (!fields) return;
  const r = await addReferral(fields);
  toast(`${r.name} added.`, { icon: 'checkCircle' });
});
registerAction('ref:open', (el) => openPatient(el.dataset.id));
registerAction('ref:link', () => linkCensus());
registerAction('ref:menu', () => openMenu());
registerAction('ref:columns', () => openCensusColumns());
registerAction('ref:refresh', () => censusList()?.refresh());
registerAction('ref:conflict', (el) => openConflict(el.dataset.key));
registerAction('ref:legend', () => openLegend());
registerAction('ref:filter', (el) => {
  filterLabel = el.dataset.label && filterLabel !== el.dataset.label ? el.dataset.label : null;
  render();
  announce(filterLabel ? `Showing only ${legend().find((l) => l.id === filterLabel)?.name}.` : 'Showing everyone.');
});
registerAction('ref:retry', async (el) => {
  toast('Trying again…', { icon: 'refresh' });
  await censusList()?.retryChange(el.dataset.key);
});
registerAction('ref:discard', async (el) => {
  const list = censusList();
  const item = list?.queue.get(el.dataset.key);
  if (!item) return;
  const ok = await confirmDialog({
    title: 'Discard this change?',
    message: `${item.name}’s ${item.label || `column ${item.kind}`} stays as it is in the census. Your change (“${String(item.set[item.kind] ?? '') || 'empty'}”) is deleted from this device.`,
    confirmLabel: 'Discard',
    destructive: true,
  });
  if (ok) await list.dropChange(item.key);
});
registerAction('ref:week', (el) => {
  const dir = Number(el.dataset.dir);
  weekOffset = dir === 0 ? 0 : weekOffset + dir * 2;
  render();
});
document.addEventListener('change', async (event) => {
  if (!showing || !view?.contains(event.target)) return;
  if (event.target.matches('[data-status-for]')) {
    const p = findPatient(event.target.dataset.statusFor);
    const value = event.target.value;
    if (!p) return;
    await setField(p, 'status', value);
    if (!isInactive(value)) toast(`${p.name} is back in the deck (${value}).`, { icon: 'check' });
    return;
  }
  if (event.target.name === 'ref-tab') {
    prefs.tab = event.target.value === 'calendar' ? 'calendar' : 'list';
    weekOffset = 0;
  } else if (event.target.name === 'ref-arrange') {
    prefs.arrange = event.target.value === 'location' ? 'location' : 'next';
  } else return;
  savePrefs();
  render();
});

/** Tapping a card anywhere (not on a button) opens the patient. */
export function handleReferralClick(event) {
  if (!showing) return;
  const el = event.target.closest('.rf[data-ref-id]');
  if (!el || event.target.closest('button, a, input, textarea, select, [data-action]')) return;
  if (window.getSelection()?.toString()) return;
  openPatient(el.dataset.refId);
}
