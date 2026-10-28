/* A patient list's screen (#/neurology/list/<id>) and its rounds history
   (#/neurology/list/<id>/history). The first list, Ward Patients, has the id
   "ward".

   Patients show as cards on iPhone and as a table on wider screens, with the
   list's own columns. A patient's details open full screen (their dashboard,
   laid out as you like — board.js), in a dialog, not a page of their own, so hospital numbers never appear in the address bar or browser
   history (list ids are random, never patient data). */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction, runAction } from '../../core/actions.js';
import { on } from '../../core/events.js';
import { liveElapsed, subHead } from '../../core/components.js';
import { formatClock } from '../../core/dates.js';
import { actionSheet, announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage, replacePage } from '../../core/router.js';
import { LATEST_SCRIPT_VERSION, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { checkLogsheet, updateList, wardList } from './engine.js';
import {
  FIXED_HEADINGS, LOAD_PROBLEMS, MAX_LOCATION, MAX_TEXT, PRIORITY_LEVELS, WRITE_PROBLEMS, cleanLocation, formatSpan, fromSheetTime,
  editedChars, locationKey, manilaDateKey, previousDateKey, roundsCols, sortPatients, wardDayLong, wardStamp, wardTime,
} from './model.js';
import { openColumns, renameColumn, setupLocation } from './columns.js';
import { openArrange, syncOrder } from './arrange.js';
import { boardOf, changeTile, savedBoard, withCols } from './board.js';
import { removeList, renameList } from './manage.js';
import { keepNotes, mountNotes, notesSlot } from './notes.js';
import { historyClosed, historySlot, keepHistory, mountHistory } from './history.js';
import { openReferral, openReport, openReportSetup } from './report-page.js';
import { ctClosed, ctSlot, keepCt, mountCt } from '../ct/viewer.js';

const AUTO_REFRESH_MS = 3 * 60 * 1000;
const FRESH_MS = 15_000; // opening the screen again within this doesn't reload

let view = null;
let showing = null;      // 'list' | 'history' | null
let listId = null;       // the list on screen
let refreshTimer = null;
let renderQueued = false;
const expanded = new Set(); // "id|C" opened with Show more
let editsDay = 0;            // Show edits: 0 off, 1 today, 2 yesterday, 3 two days ago

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const current = () => wardList(listId);
const findPatient = (id) => current()?.view().patients.find((p) => p.id === id) ?? null;
/** "HN" on cards, unless you renamed Hospital No. */
const hnLabel = (v) => (v.headings.hn === FIXED_HEADINGS.hn ? 'HN' : v.headings.hn);
/** A list for an action: the one named on the button, or the one on screen. */
const listFor = (el) => wardList(el?.dataset?.list || listId);

/* ---------- Pages ---------- */

export const listPage = {
  show(el, id) {
    view = el;
    showing = 'list';
    listId = id;
    render();
    const list = current();
    const last = Date.parse(list?.cache?.fetchedAt ?? '');
    if (list && !(Date.now() - last < FRESH_MS)) list.refresh();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && showing === 'list') current()?.refresh();
    }, AUTO_REFRESH_MS);
  },
  hide() {
    showing = null;
    clearInterval(refreshTimer);
  },
};

export const historyPage = {
  show(el, id) {
    view = el;
    showing = 'history';
    listId = id;
    clearInterval(refreshTimer);
    return renderHistory();
  },
  hide() {
    showing = null;
  },
};

// Several changes in a row (a tick, then the logsheet's answer) redraw once
function renderSoon() {
  if (showing !== 'list' || renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 30);
}
on('ward', ({ list }) => { if (!list || list === listId) renderSoon(); });
// Before a logsheet is linked, the page depends on sync being connected and up to date
on('sync', () => { if (!current()?.link) renderSoon(); });

// Back to the app after a while: catch up straight away (then every 3 minutes)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || showing !== 'list') return;
  const last = Date.parse(current()?.cache?.fetchedAt ?? '');
  if (!(Date.now() - last < AUTO_REFRESH_MS)) current()?.refresh();
});

/* ---------- The list's page ---------- */

function render() {
  if (!view || showing !== 'list') return;
  const list = current();
  if (!list) {
    // Deleted (here or on another device)
    showing = null;
    replacePage('');
    return;
  }
  const v = list.view();
  const focused = view.contains(document.activeElement) ? document.activeElement.closest('[data-focus]')?.dataset.focus : null;
  const menu = html`<button type="button" class="icon-btn" data-action="ward:menu" aria-label="Options for ${v.name}" data-focus="menu">${icon('more')}</button>`;
  keepNotes(view);
  setHTML(view, html`<div class="ward accent-neuro">
    ${subHead({ title: v.name, back: 'Neurology', fallback: '', accent: 'neuro', actions: menu, eyebrow: v.link ? `${v.link.title || 'Logsheet'} · ${v.link.tab}` : '' })}
    ${v.link ? linkedBody(v) : setupBody(v)}
  </div>`);
  mountNotes(view, list.id);
  measureClamps();
  if (focused) view.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function setupBody(v) {
  const connected = syncSnapshot().connected;
  const outdated = connected && (syncScriptVersion() ?? 0) < LATEST_SCRIPT_VERSION;
  const reads = [`${v.headings.name} (column ${v.layout.name})`, `${v.headings.hn} (${v.layout.hn})`, ...v.columns.map((c) => `${c.label} (${c.col})`)];
  return html`<section class="card ward-intro">
    <span class="ward-intro__icon">${icon('stethoscope')}</span>
    <h2 class="ward-intro__title">Link a ward logsheet</h2>
    <p class="ward-intro__text">See the patients of “${v.name}” sorted for rounds (P1, P2, P3 first), tick them off as you go, and edit their details — saved straight to your Google Sheet logsheet.</p>
    <ul class="ward-intro__list">
      <li>${icon('sheet')}<span>Reads ${reads.slice(0, -1).join(', ')} and ${reads.at(-1)}, from row 2 — change the columns any time (${icon('more')} → Columns)</span></li>
      <li>${icon('checkCircle')}<span>Saves rounds in columns ${roundsSpan(v.layout)} and your edits in their own columns; never changes names or hospital numbers</span></li>
      <li>${icon('lock')}<span>The link stays on this device only</span></li>
    </ul>
    ${!connected ? html`<p class="note">${icon('cloud')}<span>${LOAD_PROBLEMS['not-connected']}</span></p>
        <button type="button" class="btn btn--accent btn--block" data-action="sync:setup">Set up sync</button>`
      : html`${outdated ? html`<p class="note">${icon('sparkles')}<span>${LOAD_PROBLEMS['script-outdated']}</span></p>
          <button type="button" class="btn btn--block" data-action="sync:update">Update the sync script</button>` : ''}
        <button type="button" class="btn btn--accent btn--block" data-action="ward:setup">${icon('link')}Link logsheet</button>`}
  </section>`;
}

/** "E–G" (or wherever this list keeps its rounds). */
const roundsSpan = (L) => `${roundsCols(L)[0]}–${roundsCols(L)[2]}`;

function linkedBody(v) {
  return html`${banners(v)}
    ${v.hidden.rounded ? '' : roundsCard(v)}
    ${notesSlot('list')}
    ${statusLine(v)}
    ${v.cache && v.patients.length ? arrangeBar(v) : ''}
    ${v.cache && v.patients.length ? editsBar(v) : ''}
    ${v.cache ? patientTable(v) : html`<div class="card empty">${icon(v.phase === 'loading' ? 'refresh' : 'sheet')}<span>${v.phase === 'loading' ? 'Loading your logsheet…' : 'The list will appear here once the logsheet loads.'}</span></div>`}
    ${v.link.test ? html`<p class="ward-foot">${icon('sparkles')}<span>This is the practice logsheet with made-up patients (it’s in your Google Drive). When you’re ready, choose ${icon('more')} → <strong>Change logsheet</strong> and paste your real one.</span></p>` : ''}`;
}

function banner({ tone = 'neuro', iconName = 'info', title, text = '', actions = '' }) {
  return html`<div class="banner ward-banner accent-${tone}" role="status">
    <span class="banner__icon">${icon(iconName)}</span>
    <div class="banner__text"><p class="banner__title">${title}</p>${text ? html`<p class="banner__sub">${text}</p>` : ''}</div>
    ${actions ? html`<div class="banner__actions">${actions}</div>` : ''}
  </div>`;
}

/** What a waiting change is about: "edited Labs" or "rounds tick". */
const changeWhat = (item) => (item.kind === 'rounds' ? 'rounds tick' : `edited ${item.label || `column ${item.kind}`}`);

function banners(v) {
  const out = [];
  const loaded = v.cache ? `last updated at ${wardStamp(v.cache.fetchedAt)}` : 'nothing loaded yet';
  const unsaved = v.unsaved ? ` ${plural(v.unsaved, 'change')} will be saved to the logsheet when you’re back online.` : '';
  const code = v.error?.code;
  if (!v.online || code === 'offline' || code === 'network') {
    out.push(banner({ tone: 'neutral', iconName: 'wifi', title: `Offline — ${loaded}`, text: `${!v.online ? 'You’re not connected to the internet.' : 'Couldn’t reach Google.'}${unsaved}` }));
  } else if (code === 'not-connected') {
    out.push(banner({ title: 'Sync is off on this device', text: LOAD_PROBLEMS['not-connected'], actions: html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:setup">Set up sync</button>` }));
  } else if (code === 'script-outdated') {
    out.push(banner({ iconName: 'sparkles', title: 'Update your sync script', text: `${LOAD_PROBLEMS['script-outdated']} Showing the list from ${v.cache ? wardStamp(v.cache.fetchedAt) : 'before'}.`, actions: html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button>` }));
  } else if (['ward-no-access', 'ward-no-tab', 'ward-bad-id', 'ward-needs-auth'].includes(code)) {
    out.push(banner({ tone: 'danger', title: 'Can’t open the logsheet', text: v.error.message, actions: html`<button type="button" class="btn btn--sm" data-action="ward:setup">Change logsheet</button>` }));
  } else if (v.error) {
    out.push(banner({ tone: 'danger', title: 'Couldn’t refresh', text: `${v.error.message} Showing the list from ${v.cache ? wardStamp(v.cache.fetchedAt) : 'before'}.`, actions: html`<button type="button" class="btn btn--sm" data-action="ward:refresh">Try again</button>` }));
  }

  if (v.headersTaken) {
    const h = v.cache.headers;
    const cols = h.cols ?? roundsCols(v.layout);
    const seen = h.values.map((val, i) => `${cols[i]}1 ${val ? `“${val}”` : '(empty)'}`).join(' · ');
    out.push(banner({
      tone: 'workout',
      iconName: 'info',
      title: `Columns ${roundsSpan(v.layout)} are already in use`,
      text: html`The app saves rounds in columns ${roundsSpan(v.layout)}, but ${h.dataBelow ? 'they already hold data' : 'they already have other headings'} (${seen}). Nothing was overwritten, so your ticks aren’t in the logsheet yet. If those columns are unused, clear them in the logsheet and tap Try again — keep ticks on this device only — or, if your rounds are in other columns, choose them in Columns → Where things are.`,
      actions: html`<button type="button" class="btn btn--sm" data-action="ward:columns">Columns</button><button type="button" class="btn btn--sm" data-action="ward:rounds-here">Keep ticks on this device</button><button type="button" class="btn btn--sm btn--primary" data-action="ward:refresh">Try again</button>`,
    }));
  }
  const unread = v.cache ? v.columns.filter((c) => !c.readable && !c.loading) : [];
  if (unread.length) {
    out.push(banner({
      iconName: 'sparkles',
      title: `Update the sync script to see ${unread.map((c) => `“${c.label}”`).join(', ')}`,
      text: `Your sync script can only read columns C and D. Version ${LATEST_SCRIPT_VERSION} reads the list’s other columns too.`,
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button>`,
    }));
  }
  if (v.blocked.some((i) => i.problem === 'needs-update')) {
    out.push(banner({
      iconName: 'sparkles',
      title: 'Edits are waiting for a script update',
      text: 'Your edits are saved on this device. They go to the logsheet once the sync script is updated.',
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button>`,
    }));
  }
  for (const item of v.blocked.filter((i) => i.problem === 'stuck' || i.problem === 'not-a-choice')) {
    const yours = item.kind === 'rounds' ? (item.set.E ? 'rounded' : 'not rounded') : String(item.set[item.kind] ?? '') || '(empty)';
    out.push(banner({
      tone: 'workout',
      title: `Not saved: ${item.name}’s ${changeWhat(item)}`,
      text: item.problem === 'not-a-choice'
        ? html`That column of the logsheet only takes the values in its dropdown, and “${yours}” isn’t one of them.${item.choices?.length ? html`<br><span class="refs-error-detail">It takes: ${item.choices.join(', ')}</span>` : ''} Discard it and pick one of those.`
        : html`Google failed twice while saving this change, so the list was loaded without it. Your change: “${yours}”.${item.detail ? html`<br><span class="refs-error-detail">Google said: “${item.detail}”</span>` : ''}`,
      actions: html`<button type="button" class="btn btn--sm" data-action="ward:discard-change" data-key="${item.key}">Discard</button><button type="button" class="btn btn--sm btn--primary" data-action="ward:retry-change" data-key="${item.key}">Retry</button>`,
    }));
  }
  if (v.conflicts.length) {
    out.push(banner({
      tone: 'workout',
      title: `${plural(v.conflicts.length, 'change')} ${v.conflicts.length === 1 ? 'needs' : 'need'} your choice`,
      text: 'Someone changed the logsheet after the app loaded it. Choose which version to keep.',
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-action="ward:conflict" data-key="${v.conflicts[0].key}">Review</button>`,
    }));
  }
  if (v.orphans.length) {
    out.push(html`<div class="card ward-orphans" role="status">
      <p class="ward-orphans__title">${icon('info')}Not saved — no longer in the logsheet</p>
      <ul>${v.orphans.map((item) => html`<li class="ward-orphan">
        <span class="ward-orphan__text"><strong>${item.name}</strong>${item.hn ? ` (${item.hn})` : ''} · ${changeWhat(item)}</span>
        <span class="ward-orphan__actions">
          ${item.kind !== 'rounds' ? html`<button type="button" class="btn btn--sm" data-action="ward:copy" data-key="${item.key}">${icon('copy')}Copy text</button>` : ''}
          <button type="button" class="btn btn--sm btn--ghost" data-action="ward:discard" data-key="${item.key}">Discard</button>
        </span>
      </li>`)}</ul>
    </div>`);
  }
  if (v.duplicates.length) {
    out.push(banner({ tone: 'workout', title: 'Repeated hospital numbers', text: `More than one row in the logsheet has ${v.duplicates.length === 1 ? 'the hospital number' : 'these hospital numbers'}: ${v.duplicates.join(', ')}. Those patients can’t be ticked or edited here until it’s fixed in the logsheet.` }));
  }
  if (v.cache?.canEdit === false) {
    out.push(banner({ tone: 'neutral', iconName: 'lock', title: 'View only', text: 'Your Google account can view this logsheet but not edit it, so ticks and edits stay on this device (Not synced). Ask the logsheet’s owner for edit access.' }));
  }
  if (v.link.roundsHere) {
    out.push(html`<p class="ward-foot">${icon('smartphone')}<span>Ticks are kept on this device only (columns ${roundsSpan(v.layout)} of the logsheet are used for something else). <button type="button" class="link-inline" data-action="ward:rounds-sheet">Save ticks to the logsheet again</button></span></p>`);
  }
  if (v.cache?.truncated) {
    out.push(html`<p class="ward-foot">${icon('info')}<span>Only the first 2,000 rows of the logsheet are shown.</span></p>`);
  }
  return out;
}

function sessionsText(sessions, now = Date.now()) {
  const spans = sessions.map((s) => `${wardTime(s.start)}–${s.end ? wardTime(s.end) : 'now'}`);
  const total = sessions.reduce((sum, s) => sum + ((s.end ? Date.parse(s.end) : now) - Date.parse(s.start)), 0);
  return { spans: spans.join(', '), total };
}

function roundsCard(v) {
  const pct = v.total ? v.roundedCount / v.total : 0;
  const done = v.total > 0 && v.roundedCount === v.total;
  const today = v.sessions.filter((s) => s.end || s === v.active?.session);
  const summary = sessionsText(today);
  let session;
  if (v.active) {
    session = html`<div class="ward-rounds__session">
      <p class="ward-rounds__live"><span class="ward-rounds__dot" aria-hidden="true"></span>Rounds in progress · ${liveElapsed(v.active.session.start)}</p>
      <button type="button" class="btn btn--sm" data-action="ward:end" data-focus="end">${icon('stop')}End Rounds</button>
    </div>
    ${done ? html`<p class="ward-rounds__note">${icon('checkCircle')}Everyone’s rounded — tap End Rounds when you’re done.</p>` : ''}`;
  } else {
    session = html`<div class="ward-rounds__session">
      <p class="ward-rounds__past">${today.length ? html`Today: ${summary.spans} · <strong>${formatSpan(summary.total)}</strong>` : 'Rounds not started today'}</p>
      <button type="button" class="btn btn--sm btn--accent" data-action="ward:start" data-focus="start">${icon('play')}Start Rounds</button>
    </div>`;
  }
  return html`<section class="card ward-rounds" aria-label="Rounds">
    <div class="ward-rounds__top">
      <p class="ward-rounds__count"><strong class="num">${v.roundedCount}</strong> of ${v.total} rounded</p>
      ${v.noNumber ? html`<span class="ward-rounds__aside">${plural(v.noNumber, 'patient')} without a hospital number</span>` : ''}
    </div>
    <div class="ward-progress" role="progressbar" aria-label="Patients rounded" aria-valuemin="0" aria-valuemax="${v.total}" aria-valuenow="${v.roundedCount}">
      <span style="--p: ${pct.toFixed(3)}"></span>
    </div>
    ${session}
  </section>`;
}

function statusLine(v) {
  const loading = v.phase === 'loading';
  const pending = v.unsaved - v.conflicts.length;
  return html`<div class="ward-status">
    <p class="ward-status__text" aria-live="polite">${loading ? 'Updating…' : v.cache ? `Last updated ${wardStamp(v.cache.fetchedAt)}` : ''}${
      pending > 0 ? html` · <span class="ward-status__pending">${icon('cloud')}${pending} not synced</span>` : ''}</p>
    <div class="ward-status__tools">
      ${v.cache && v.patients.length > 1 ? html`<button type="button" class="btn btn--sm btn--ghost" data-action="ward:sync-order" data-focus="sync-order" title="Put the rows in your Google Sheet in the order shown here">${icon('upload')}Sync Order</button>` : ''}
      ${v.cache && v.patients.length ? html`<button type="button" class="btn btn--sm" data-action="ward:report" data-focus="report">${icon('clipboard')}Report</button>` : ''}
      <button type="button" class="btn btn--sm btn--ghost" data-action="ward:arrange" data-focus="arrange">${icon('sort')}Arrange rows</button>
      <button type="button" class="btn btn--sm btn--ghost" data-action="ward:columns" data-focus="columns">${icon('columns')}Columns</button>
    </div>
    <button type="button" class="btn btn--sm btn--ghost ward-status__btn${loading ? ' is-busy' : ''}" data-action="ward:refresh" data-focus="refresh"${loading ? raw(' disabled') : ''}>${icon('refresh')}Refresh</button>
  </div>`;
}

/** Arrange by: Priority (rounds order) or Location (one group per place). */
function arrangeBar(v) {
  const opt = (value, label, iconName) => html`<label class="segmented__opt"><input type="radio" name="ward-arrange" value="${value}" data-focus="arrange-${value}"${raw(v.arrange === value ? ' checked' : '')}><span>${icon(iconName)}${label}</span></label>`;
  return html`<div class="ward-arrange-by">
    <span class="ward-arrange-by__label" id="ward-arrange-label">Arrange by</span>
    <div class="segmented" role="radiogroup" aria-labelledby="ward-arrange-label">
      ${opt('rounds', 'Priority', 'flag')}
      ${opt('location', 'Location', 'pin')}
    </div>
  </div>`;
}

/* ---------- Show edits: today, yesterday or 2 days ago, in red ---------- */

const EDIT_DAYS = ['Off', 'Today', 'Yesterday', '2 days ago'];

/** The Manila date Show edits is on, or null when it's off. */
function editsDate() {
  if (!editsDay) return null;
  let date = manilaDateKey();
  for (let i = 1; i < editsDay; i++) date = previousDateKey(date);
  return date;
}

/** What you changed in this patient's column on the day Show edits is on: { before, after },
    null (noted before 0.8.0.10, without the text) or undefined (not edited that day). */
const editOn = (p, col) => {
  const date = editsDate();
  return date ? p.edited?.[col]?.[date] : undefined;
};
const editedOn = (p, col) => editOn(p, col) !== undefined;
/** Red for a whole box (locations, tick boxes): its words don't say what changed. */
const editedClass = (p, col) => (editedOn(p, col) ? ' is-edited' : '');
const editedNote = (p, col) => (editedOn(p, col) ? html`<span class="sr-only"> (edited ${EDIT_DAYS[editsDay].toLowerCase()})</span>` : '');

/** The characters of a cell's text you wrote on the Show edits day (1 each), or null for none. */
function redChars(p, col) {
  const edit = editOn(p, col);
  if (edit === undefined) return null;
  const text = String(p.cells[col] ?? '');
  return (edit && editedChars(edit.before, edit.after, text)) || new Uint8Array(text.length).fill(1);
}

/** "Text removed" under a box whose edit that day only took words out. */
function removedNote(p, col) {
  const red = editedOn(p, col) ? redChars(p, col) : null;
  return red && !red.includes(1) ? html`<p class="pt__removed">${icon('edit')}Text removed ${EDIT_DAYS[editsDay].toLowerCase()}</p>` : '';
}

function editsBar(v) {
  const date = editsDate();
  const count = date ? v.patients.reduce((n, p) => n + v.columns.filter((c) => p.edited?.[c.col]?.[date] !== undefined).length, 0) : 0;
  const opt = (i) => html`<label class="segmented__opt"><input type="radio" name="ward-edits" value="${i}" data-focus="edits-${i}"${raw(editsDay === i ? ' checked' : '')}><span>${EDIT_DAYS[i]}</span></label>`;
  return html`<div class="ward-arrange-by ward-edits-by">
    <span class="ward-arrange-by__label" id="ward-edits-label">Show edits</span>
    <div class="segmented" role="radiogroup" aria-labelledby="ward-edits-label">${[0, 1, 2, 3].map(opt)}</div>
  </div>
  ${date ? html`<p class="ward-edits-by__note" aria-live="polite">${count
    ? html`<span class="ward-edits-by__swatch" aria-hidden="true"></span>What you changed ${EDIT_DAYS[editsDay].toLowerCase()} is in red (${plural(count, 'box', 'boxes')}).`
    : `You didn’t edit anything ${EDIT_DAYS[editsDay].toLowerCase()} on this device.`}</p>` : ''}`;
}

/** The table's column widths (iPad landscape and Mac), for the columns shown. */
function tableStyle(count, hidden) {
  const cols = [
    ...(hidden.rounded ? [] : ['4.5rem']),
    'minmax(9rem, 1.1fr)',
    ...(hidden.name || hidden.hn ? [] : ['minmax(6.5rem, .55fr)']),
    ...Array(count).fill(count > 3 ? 'minmax(10rem, 1.6fr)' : 'minmax(0, 1.8fr)'),
  ];
  // Wide tables scroll: the rows must be at least as wide as all their columns,
  // or the last column spills past the row's edge. Each column's smallest width,
  // plus 1rem gaps between columns and the row's 1.5rem side padding.
  const fixed = (hidden.rounded ? 0 : 4.5) + 9 + (hidden.name || hidden.hn ? 0 : 6.5);
  const min = fixed + count * 10 + (cols.length - 1) + 1.5;
  return `--pt-cols: ${cols.join(' ')};${count > 3 ? ` --pt-min: ${min}rem;` : ''}`;
}

function tableHead(v) {
  const cell = (id, label) => html`<button type="button" class="pt__hbtn" data-action="ward:rename-col" data-col-id="${id}" title="Rename “${label}” in the app">${label}</button>`;
  const h = v.hidden;
  return html`<div class="pt pt--head">
    ${h.rounded ? '' : html`<span>${cell('rounded', v.headings.rounded)}</span>`}
    ${h.name ? html`<span>${cell('hn', v.headings.hn)}</span>` : html`<span>${cell('name', v.headings.name)}</span>`}
    ${h.name || h.hn ? '' : html`<span>${cell('hn', v.headings.hn)}</span>`}
    ${v.columns.map((c) => html`<span>${cell(c.id, c.label)}</span>`)}
  </div>`;
}

function patientTable(v) {
  if (!v.patients.length) {
    return html`<div class="card empty">${icon('sheet')}<span>No patients in “${v.link.tab}” yet. The app reads patients from row 2, with the name in column ${v.layout.name}.</span></div>`;
  }
  const groups = patientGroups(v);
  return html`<div class="ward-table${v.columns.length > 3 ? ' is-wide' : ''}${v.hidden.rounded ? ' no-tick' : ''}" style="${tableStyle(v.columns.length, v.hidden)}">
    <div class="ward-table__inner">
      ${tableHead(v)}
      ${groups.map(([id, label, iconName, list]) => html`<section class="ward-group ward-group--${id}" aria-labelledby="wg-${id}">
        <h2 class="ward-group__title" id="wg-${id}">${icon(iconName)}${label}<span class="ward-group__count">${groupCount(v, list)}</span></h2>
        <ul class="ward-list">${list.map((p) => patientRow(p, v))}</ul>
      </section>`)}
    </div>
  </div>`;
}

/** The table's groups, in order: [id, heading, icon, patients]. */
function patientGroups(v) {
  if (v.arrange === 'location') return locationGroups(v);
  const done = (p) => p.rounded && !v.hidden.rounded; // without the tick box, nobody is set apart as rounded
  return [
    ...[1, 2, 3].map((level) => [`p${level}`, PRIORITY_LEVELS[level].group, 'flag', v.patients.filter((p) => !done(p) && p.priority?.level === level)]),
    ['todo', v.hidden.rounded ? 'Other patients' : 'Not yet rounded', 'circle', v.patients.filter((p) => !done(p) && !p.priority)],
    ['done', 'Rounded', 'checkCircle', v.patients.filter(done)],
  ].filter((g) => g[3].length);
}

/** Every patient in the table's order, with where they are: the location heading they sit under
    (arranged for rounds: their own location). */
function tableOrder(v) {
  return patientGroups(v).flatMap(([, label, , list]) => list.map((p) => ({
    p, where: v.arrange === 'location' ? label : cleanLocation(p.location) || 'No location',
  })));
}

/** One group per location (A to Z), then patients without one; each sorted for rounds (P1 first, rounded last). */
function locationGroups(v) {
  const groups = v.locations.map((loc, i) => [`loc${i}`, loc.name, 'pin', v.patients.filter((p) => p.location && locationKey(p.location) === loc.key)]);
  groups.push(['loc-none', 'No location', 'circle', v.patients.filter((p) => !p.location)]);
  const order = v.hidden.rounded ? (list) => sortPatients(list.map((p) => ({ ...p, rounded: false }))).map((x) => list.find((p) => p.id === x.id)) : sortPatients;
  return groups.filter((g) => g[3].length).map((g) => [g[0], g[1], g[2], order(g[3])]);
}

/** "4" on the rounds groups; "1 of 4 rounded" by location (rounded patients stay in their place). */
function groupCount(v, list) {
  if (v.arrange !== 'location' || v.hidden.rounded) return String(list.length);
  const done = list.filter((p) => p.rounded).length;
  return done ? `${done} of ${list.length} rounded` : String(list.length);
}

function tickButton(p, v) {
  if (!p.tickable) {
    const why = p.key ? 'Can’t be ticked: another row has the same hospital number' : 'Can’t be ticked: no hospital number';
    return html`<span class="pt__tick is-disabled" role="img" aria-label="${why}" title="${why}"><span class="pt__box"></span></span>`;
  }
  return html`<button type="button" class="pt__tick" role="checkbox" aria-checked="${p.rounded ? 'true' : 'false'}"
      aria-label="${v.headings.rounded}: ${p.name}" data-action="ward:tick" data-id="${p.id}" data-focus="tick-${p.id}"><span class="pt__box">${icon('check')}</span></button>`;
}

function changeBadge(p) {
  const items = [...Object.values(p.items), p.roundsItem].filter(Boolean);
  const conflict = items.find((i) => i.state === 'conflict');
  if (conflict) return html`<button type="button" class="wbadge wbadge--warn" data-action="ward:conflict" data-key="${conflict.key}">${icon('info')}Needs your choice</button>`;
  const blocked = items.find((i) => i.state === 'blocked');
  if (blocked) return html`<span class="wbadge wbadge--warn">${icon('info')}Not saved: ${WRITE_PROBLEMS[blocked.problem] ?? WRITE_PROBLEMS.invalid}</span>`;
  if (items.length) return html`<span class="wbadge wbadge--sync">${icon('cloud')}Not synced</span>`;
  return '';
}

/** "P1 · High", "P2 · Medium", "P3 · Low" or "Priority": an icon and words, never colour alone. */
function priorityBadge({ level, tag }) {
  return tag === 'Priority'
    ? html`<span class="wbadge wbadge--p${level}">${icon('flag')}Priority</span>`
    : html`<span class="wbadge wbadge--p${level}">${icon('flag')}${tag} · ${PRIORITY_LEVELS[level].word}<span class="sr-only"> priority</span></span>`;
}

function badges(p, v, { detail = false } = {}) {
  const out = [];
  if (p.priority) out.push(priorityBadge(p.priority));
  if (p.location && !detail) out.push(html`<span class="wbadge wbadge--loc">${icon('pin')}<span class="sr-only">Location: </span>${p.location}</span>`);
  if (!detail && !v.hidden.rounded) {
    if (p.rounded) {
      out.push(html`<span class="wbadge wbadge--done">${icon('check')}${p.end ? `Rounded ${wardTime(p.end)}` : 'Rounded'}${p.durationMs != null ? ` · ${formatSpan(p.durationMs)}` : ''}</span>`);
    } else if (p.opened && v.active) {
      out.push(p.running
        ? html`<span class="wbadge wbadge--live">${icon('timer')}Started ${wardTime(p.opened)} · ${patientClock(p)}</span>`
        : html`<span class="wbadge wbadge--paused">${icon('pause')}Paused · ${patientClock(p)}</span>`);
    } else if (p.lastRounded) {
      out.push(html`<span class="wbadge">${icon('history')}Last rounded ${wardStamp(p.lastRounded)}</span>`);
    }
  }
  if (p.duplicate) out.push(html`<span class="wbadge wbadge--warn">${icon('info')}Same number as another row</span>`);
  if (!detail) out.push(changeBadge(p)); // the patient sheet explains changes in full
  return out.some(Boolean) ? html`<p class="pt__badges">${out}</p>` : '';
}

/** A cell's text, with the parts that are bold or red in the logsheet in bold, and what you
    changed on the Show edits day in red. */
function cellText(p, col) {
  const text = String(p.cells[col] ?? '');
  const marks = p.marks?.[col];
  const red = redChars(p, col);
  if (!red) return marks ? marks.map(([t, on]) => (on ? html`<strong class="pt__mark">${t}</strong>` : t)) : text;
  const bold = new Uint8Array(text.length);
  let at = 0;
  (marks ?? []).forEach(([t, on]) => { if (on) bold.fill(1, at, at + t.length); at += t.length; });
  const out = [];
  for (let i = 0; i < text.length;) {
    let j = i + 1;
    while (j < text.length && bold[j] === bold[i] && red[j] === red[i]) j++;
    const t = text.slice(i, j);
    out.push(bold[i] ? html`<strong class="pt__mark${red[i] ? ' pt__edit' : ''}">${t}</strong>` : red[i] ? html`<span class="pt__edit">${t}</span>` : t);
    i = j;
  }
  return out;
}

/** A tick-box cell (TRUE / FALSE in the logsheet). */
const isTicked = (text) => /^(true|yes|y|1|✓|✔|x)$/i.test(String(text ?? '').trim());

/** A tick-box column's cell: a tick circle that ticks or unticks the logsheet's checkbox. */
function checkCell(p, c) {
  const on = isTicked(p.cells[c.col]);
  const item = p.items[c.col];
  const can = p.tickable && c.readable;
  return html`<div class="pt__field pt__field--check${editedClass(p, c.col)}">
    <p class="pt__label">${c.label}${editedNote(p, c.col)}</p>
    ${can ? html`<button type="button" class="pt__tick pt__tick--col${item ? ' is-unsynced' : ''}" role="checkbox" aria-checked="${on ? 'true' : 'false'}"
        aria-label="${c.label}: ${p.name}" data-action="ward:check" data-id="${p.id}" data-col="${c.col}" data-focus="check-${p.id}-${c.col}"
        title="${on ? 'Ticked' : 'Not ticked'} in column ${c.col}${item ? ' · not synced yet' : ''}"><span class="pt__box">${icon('check')}</span></button>`
      : html`<span class="pt__tick pt__tick--col is-disabled" role="img" aria-label="${c.label}: ${on ? 'ticked' : 'not ticked'}"><span class="pt__box">${on ? icon('check') : ''}</span></span>`}
  </div>`;
}

function clampText(p, c, v) {
  if (c.type === 'check') return checkCell(p, c);
  if (c.col === v.locationCol) {
    return html`<div class="pt__field pt__field--loc${editedClass(p, c.col)}">
      <p class="pt__label">${c.label}${editedNote(p, c.col)}</p>
      <p class="pt__text${p.location ? '' : ' pt__text--empty'}">${p.location || 'None'}</p>
    </div>`;
  }
  const id = `${p.id}|${c.col}`;
  const open = expanded.has(id);
  const text = p.cells[c.col];
  return html`<div class="pt__field">
    <p class="pt__label">${c.label}${editedNote(p, c.col)}</p>
    ${!c.readable ? html`<p class="pt__text pt__text--empty">${c.loading ? 'Loading…' : 'Update the sync script to see this'}</p>`
      : text
        ? html`<div class="pt__text${open ? '' : ' is-clamped'}" data-clamp="${id}">${cellText(p, c.col)}</div>
          <button type="button" class="pt__more" data-action="ward:more" data-clamp-id="${id}" aria-expanded="${open ? 'true' : 'false'}"${open ? '' : raw(' hidden')}>${open ? 'Show less' : 'Show more'}</button>`
        : html`<p class="pt__text pt__text--empty">None</p>`}
    ${removedNote(p, c.col)}
  </div>`;
}

function patientRow(p, v) {
  const h = v.hidden;
  return html`<li class="pt${p.rounded ? ' is-rounded' : ''}${p.priority ? ` is-p${p.priority.level}` : ''}${h.rounded ? ' pt--notick' : ''}" data-id="${p.id}">
    ${h.rounded ? '' : tickButton(p, v)}
    <div class="pt__who">
      <button type="button" class="pt__name" data-action="ward:open" data-id="${p.id}" data-focus="open-${p.id}">${h.name ? p.hn || p.name : p.name}${icon('chevronRight', 'pt__chev')}</button>
      ${h.name || h.hn ? '' : html`<p class="pt__hn">${p.hn ? html`<span class="pt__label">${hnLabel(v)}</span> ${p.hn}` : html`<span class="faint">No hospital number</span>`}</p>`}
      ${badges(p, v)}
    </div>
    ${h.name || h.hn ? '' : html`<p class="pt__hn-cell">${p.hn || '—'}</p>`}
    ${v.columns.map((c) => clampText(p, c, v))}
  </li>`;
}

/** Show "Show more" only under text that is actually cut off. */
function measureClamps() {
  view?.querySelectorAll('.pt__text.is-clamped').forEach((el) => {
    const button = el.nextElementSibling;
    if (button?.classList.contains('pt__more')) button.hidden = el.scrollHeight <= el.clientHeight + 2;
  });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (showing === 'list') measureClamps(); }, 150);
});

/* ---------- One patient (a sheet) ---------- */

function changeNote(item) {
  if (!item) return '';
  if (item.state === 'conflict') {
    return html`<p class="note ward-note--warn">${icon('info')}<span>Someone changed this in the logsheet after the app loaded it. <button type="button" class="link-inline" data-action="ward:conflict" data-key="${item.key}">Choose a version</button></span></p>`;
  }
  if (item.state === 'blocked') {
    const setAside = item.problem === 'stuck' || item.problem === 'not-a-choice';
    return html`<p class="note ward-note--warn">${icon('info')}<span>Not saved: ${WRITE_PROBLEMS[item.problem] ?? WRITE_PROBLEMS.invalid}.${item.problem === 'not-a-choice' && item.choices?.length ? ` It takes: ${item.choices.join(', ')}.` : ''}${setAside ? html` <button type="button" class="link-inline" data-action="ward:retry-change" data-key="${item.key}">Retry</button> · <button type="button" class="link-inline" data-action="ward:discard-change" data-key="${item.key}">Discard</button>` : ''}</span></p>`;
  }
  return html`<p class="note">${icon('cloud')}<span>Not synced yet — it’s saved on this device and goes to the logsheet automatically.</span></p>`;
}

/** A patient's timer: counting while their page is open, paused (with the time so far) while it's closed. */
function patientClock(p) {
  if (p.timeMs == null) return '';
  return p.running
    ? liveElapsed(new Date(Date.now() - p.timeMs).toISOString())
    : html`<span class="num is-paused">${formatClock(p.timeMs)}</span>`;
}

/** How far through the list you are, e.g. "0 of 15 patients rounded". */
function roundsCount(v) {
  return html`<p class="ptd__count"><strong class="num">${v.roundedCount}</strong> of ${plural(v.total, 'patient')} rounded</p>`;
}

function roundsBox(p, v) {
  if (!p.tickable) {
    return html`<div class="ptd__rounds"><p class="ptd__status">${icon('info')}<span>${p.key
      ? 'Another row in the logsheet has the same hospital number, so this patient can’t be ticked or edited here until that’s fixed.'
      : 'This patient has no hospital number in the logsheet, so they can’t be ticked or edited here.'}</span></p></div>`;
  }
  if (p.rounded) {
    return html`<div class="ptd__rounds is-done">
      ${roundsCount(v)}
      <p class="ptd__status">${icon('checkCircle')}<span>Rounded${p.end ? ` at ${wardTime(p.end)}` : ''}${p.durationMs != null ? ` · ${formatSpan(p.durationMs)}` : ''}${p.start ? html`<small>Started ${wardTime(p.start)}</small>` : ''}</span></p>
      ${changeNote(p.roundsItem)}
      <button type="button" class="btn btn--sm btn--ghost" data-dact="untick">Untick</button>
    </div>`;
  }
  const timing = p.start
    ? html`${icon('timer')}<span>Started ${wardTime(p.start)}${p.opened && v.active ? html` · ${patientClock(p)}` : ''}${v.active ? html` <button type="button" class="link-inline ptd__restart" data-dact="restart" data-focus="b-restart">${icon('refresh')}Restart timer</button>` : ''}</span>`
    : v.active
      ? html`${icon('timer')}<span>Timing starts when you open a patient during rounds.</span>`
      : html`${icon('info')}<span>Rounds aren’t in progress, so this visit isn’t timed. <button type="button" class="link-inline" data-dact="start">Start Rounds now</button></span>`;
  return html`<div class="ptd__rounds">
    ${roundsCount(v)}
    <p class="ptd__status">${timing}</p>
    ${changeNote(p.roundsItem)}
    <button type="button" class="btn btn--accent btn--block" data-dact="mark">${icon('check')}Mark as rounded</button>
  </div>`;
}

/* A patient opens full screen, as their dashboard: a bar with who they are and
   their rounds, then the list's columns as tiles you arrange (Customize). */

/** What a tile shows: the cell's text, a tick box, or why it can't. */
function tileBody(p, c, t) {
  if (!c.readable) return html`<p class="faint">${c.loading ? 'Loading this column — it appears once the list refreshes.' : `Update the sync script (Settings → Sync) to see column ${c.col}.`}</p>`;
  if (c.type === 'check') {
    return html`<div class="ptd__check">${p.tickable
      ? html`<button type="button" class="pt__tick" role="checkbox" aria-checked="${isTicked(p.cells[c.col]) ? 'true' : 'false'}" aria-label="${c.label}" data-action="ward:check" data-id="${p.id}" data-col="${c.col}"><span class="pt__box">${icon('check')}</span></button>`
      : ''}<span>${isTicked(p.cells[c.col]) ? `Ticked in column ${c.col} of the logsheet` : `Not ticked in column ${c.col}`}</span></div>`;
  }
  return p.cells[c.col]
    ? html`<div class="prose ptt__text${t.flow === 2 ? ' ptt__text--flow' : ''}">${cellText(p, c.col)}${editedNote(p, c.col)}</div>${removedNote(p, c.col)}`
    : html`<p class="faint">Empty in the logsheet.</p>${removedNote(p, c.col)}`;
}

/** The buttons under a tile while you customize: move it, its text size, two columns, hide. */
function tileTools(c, t, at, board) {
  const b = (op, label, iconName, { off = false, pressed = null, text = '' } = {}) => html`<button type="button" class="ptt__tool${text ? ' ptt__tool--text' : ''}" data-bact="${op}" data-col="${c.col}" data-focus="b-${op}-${c.col}"
    aria-label="${label}: ${c.label}" title="${label}"${pressed == null ? '' : raw(` aria-pressed="${pressed}"`)}${off ? raw(' disabled') : ''}>${iconName ? icon(iconName) : ''}${text}</button>`;
  const { z, i, count } = at;
  return html`<div class="ptt__tools" role="group" aria-label="Arrange ${c.label}">
    <span class="ptt__group">
      ${b('up', 'Move up', 'arrowUp', { off: i === 0 })}
      ${b('down', 'Move down', 'arrowDown', { off: i === count - 1 })}
      ${b('left', 'Move to the column on the left', 'arrowLeft', { off: z <= 1 })}
      ${b('right', 'Move to the column on the right', 'arrowRight', { off: z === 0 || z >= board.cols })}
      ${b('top', z === 0 ? 'Back into the columns' : 'Across the top', 'layers', { pressed: z === 0 ? 'true' : 'false', text: 'Top' })}
    </span>
    <span class="ptt__group">
      ${b('smaller', 'Smaller text', '', { off: t.size <= -2, text: 'A−' })}
      ${b('bigger', 'Larger text', '', { off: t.size >= 2, text: 'A+' })}
      ${b('flow', 'Text in two columns', 'columns', { pressed: t.flow === 2 ? 'true' : 'false' })}
      ${b('hide', 'Hide', 'eye', { text: 'Hide' })}
    </span>
  </div>`;
}

function boardTile(p, v, c, t, at, board, editing) {
  const size = t.size ? ` ptt--s${t.size < 0 ? `m${-t.size}` : t.size}` : '';
  const canEdit = p.tickable && c.readable && c.type !== 'check';
  return html`<section class="ptt${size}" aria-labelledby="ptd-${c.col}">
    <div class="ptt__head">
      <h3 class="ptd__title" id="ptd-${c.col}">${c.label}</h3>
      ${canEdit ? html`<button type="button" class="btn btn--sm ptt__edit" data-dact="edit" data-col="${c.col}" aria-label="Edit ${c.label}">${icon('edit')}Edit</button>` : ''}
    </div>
    ${tileBody(p, c, t)}
    ${changeNote(p.items[c.col])}
    ${editing ? tileTools(c, t, at, board) : ''}
  </section>`;
}

/** Customize: columns, the wider one, hidden tiles and Reset. */
function boardSetup(v, board, byCol) {
  const opt = (op, n, label, on) => html`<button type="button" class="chip-toggle" data-bact="${op}" data-n="${n}" data-focus="b-${op}-${n}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  const hidden = board.zones.flat().filter((t) => t.hidden && byCol.has(t.col));
  return html`<div class="ptb__setup">
    <p class="ptb__hint">${icon('sliders')}<span>This layout is the same for every patient in “${v.name}” and shows on all your devices. Changes save as you go. On a phone the tiles stack: the top ones first, then column 1, 2 and 3.</span></p>
    <div class="ptb__opts">
      <div class="ptb__opt"><span class="ptb__opt-label">Columns</span><span class="chips chips--sm">${[1, 2, 3].map((n) => opt('cols', n, String(n), board.cols === n))}</span></div>
      ${board.cols > 1 ? html`<div class="ptb__opt"><span class="ptb__opt-label">Wider column</span><span class="chips chips--sm">${opt('wide', 0, 'Even', board.wide === 0)}${Array.from({ length: board.cols }, (_, i) => opt('wide', i + 1, String(i + 1), board.wide === i + 1))}</span></div>` : ''}
      <button type="button" class="btn btn--sm btn--ghost" data-bact="reset">${icon('refresh')}Reset layout</button>
    </div>
    ${hidden.length ? html`<div class="ptb__opt ptb__hidden"><span class="ptb__opt-label">Hidden</span><span class="chips chips--sm">${hidden.map((t) => html`<button type="button" class="chip-toggle" data-bact="show" data-col="${t.col}" data-focus="b-show-${t.col}">${icon('plus')}${byCol.get(t.col).label}</button>`)}</span></div>` : ''}
  </div>`;
}

/** Previous and next patient, in the table's order, under the rounds box. */
function patientNav(p, v) {
  const order = tableOrder(v);
  const at = order.findIndex((x) => x.p.id === p.id);
  if (at < 0 || order.length < 2) return '';
  const side = (x, dir) => {
    if (!x) return html`<span class="ptn__side ptn__side--${dir} is-end" aria-hidden="true"></span>`;
    const label = dir === 'prev' ? 'Previous patient' : 'Next patient';
    return html`<button type="button" class="ptn__side ptn__side--${dir}" data-dact="go" data-id="${x.p.id}" data-focus="n-${dir}" aria-label="${label}: ${x.p.name || x.p.hn}, ${x.where}" title="${label}${dir === 'prev' ? ' (←)' : ' (→)'}">
      <span class="ptn__arrow">${icon(dir === 'prev' ? 'chevronLeft' : 'chevronRight')}</span>
      <span class="ptn__who"><span class="ptn__dir">${dir === 'prev' ? 'Previous' : 'Next'}</span><span class="ptn__name">${x.p.name || x.p.hn}</span><span class="ptn__where">${icon(x.p.location ? 'pin' : 'circle')}<span>${x.where}</span></span></span>
    </button>`;
  };
  return html`<nav class="ptn" aria-label="Other patients">
    ${side(order[at - 1], 'prev')}
    <span class="ptn__pos">${at + 1} of ${order.length}</span>
    ${side(order[at + 1], 'next')}
  </nav>`;
}

function detailBody(p, v, { editing = false } = {}) {
  if (!p) {
    return html`<div class="ptb__bar"><div class="ptb__who"><h2 class="ptb__name" id="ptb-title">Patient</h2></div>
      <div class="ptb__acts"><button type="button" class="btn btn--sm" data-dialog-value="close">${icon('x')}Close</button></div></div>
      <p class="dlg__msg ptb__gone">This patient is no longer in the logsheet.</p>`;
  }
  const byCol = new Map(v.columns.map((c) => [c.col, c]));
  const board = boardOf(v.board, v.columns);
  const zone = (z) => {
    const shown = board.zones[z].filter((t) => !t.hidden);
    return shown.map((t, i) => boardTile(p, v, byCol.get(t.col), t, { z, i, count: shown.length }, board, editing));
  };
  const top = zone(0);
  return html`<header class="ptb__bar">
      <div class="ptb__who">
        <h2 class="ptb__name" id="ptb-title">${p.name}</h2>
        <p class="ptd__meta">${p.hn ? html`<span class="pt__label">${hnLabel(v)}</span> ${p.hn}` : 'No hospital number'} · row ${p.row} of the logsheet</p>
        ${p.location ? html`<p class="ptb__loc">${icon('pin')}<span class="sr-only">Location: </span><span>${p.location}</span></p>` : ''}
        ${badges(p, v, { detail: true })}
      </div>
      <div class="ptb__acts">
        ${editing ? '' : html`<button type="button" class="btn btn--sm" data-dact="referral" data-focus="b-referral">${icon('share')}Referral</button>`}
        <button type="button" class="btn btn--sm${editing ? ' btn--accent' : ''}" data-dact="customize" data-focus="b-customize" aria-pressed="${editing ? 'true' : 'false'}">${icon(editing ? 'check' : 'sliders')}${editing ? 'Done' : 'Customize'}</button>
        <button type="button" class="btn btn--sm" data-dialog-value="close" autofocus>${icon('x')}Close</button>
      </div>
    </header>
    <div class="ptb__main">
      ${v.hidden.rounded ? '' : roundsBox(p, v)}
      ${patientNav(p, v)}
      ${notesSlot('patient')}
      ${editing ? boardSetup(v, board, byCol) : ''}
      <div class="ptb ptb--c${board.cols} ptb--w${board.wide}${editing ? ' is-editing' : ''}">
        ${top.length ? html`<div class="ptb__top">${top}</div>` : ''}
        <div class="ptb__cols">${board.zones.slice(1).map((_, k) => {
          const tiles = zone(k + 1);
          return html`<div class="ptb__col">${tiles}${editing && !tiles.length ? html`<p class="ptb__empty">Column ${k + 1} is empty — move tiles here with ${icon('arrowLeft')} ${icon('arrowRight')}</p>` : ''}</div>`;
        })}</div>
      </div>
      ${historySlot()}
      ${p.hn ? ctSlot() : ''}
      <button type="button" class="btn btn--block ptb__close" data-dialog-value="close">Close</button>
    </div>`;
}

async function openPatient(openId) {
  let id = openId;
  const list = current();
  let p = findPatient(id);
  if (!list || !p) return;
  if (p.tickable) await list.notePatientOpened(p.key); // during rounds, opening a patient starts their timer
  p = findPatient(id);
  let dialog = null;
  let editing = false;
  let saving = Promise.resolve();
  const redraw = () => {
    const body = dialog?.querySelector('.dlg__body');
    const v = current()?.view();
    if (!body || !dialog.open || !v) return;
    const focused = document.activeElement?.closest?.('[data-focus]')?.dataset.focus;
    keepNotes(body);
    keepHistory(body);
    keepCt(body);
    const shown = v.patients.find((x) => x.id === id) ?? null;
    setHTML(body, detailBody(shown, v, { editing }));
    mountNotes(body, listId);
    mountHistory(body, shown);
    mountCt(body, { hn: shown?.hn });
    if (focused) {
      const again = body.querySelector(`[data-focus="${focused}"]`);
      (again && !again.disabled ? again : body.querySelector('[data-dact="customize"]'))?.focus({ preventScroll: true });
    }
  };
  /** Change the dashboard's layout (saved on the list, one change after another). */
  const arrange = (change) => {
    saving = saving.then(async () => {
      const now = current();
      if (!now) return;
      const v = now.view();
      const next = change(boardOf(v.board, v.columns));
      await updateList(now.id, (def) => { def.board = next ? savedBoard(next) : undefined; });
      redraw();
    }).catch((err) => toast(err.message, { icon: 'info' }));
    return saving;
  };
  /** Show another patient on the same page (the arrows under the rounds box). */
  const go = async (nextId) => {
    const next = findPatient(nextId);
    if (!next || !dialog?.open) return;
    const leaving = findPatient(id);
    id = nextId;
    if (leaving?.tickable) await current()?.notePatientClosed(leaving.key);
    if (next.tickable) await current()?.notePatientOpened(next.key);
    redraw();
    dialog.querySelector('.dlg__panel')?.scrollTo?.({ top: 0 });
    dialog.scrollTo?.({ top: 0 });
    announce(`${next.name}`);
  };
  /** ← and → on a keyboard, unless you're typing or another pop-up is on top. */
  const onKey = (event) => {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (!dialog?.open || [...document.querySelectorAll('dialog[open]')].pop() !== dialog) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const target = dialog.querySelector(`[data-dact="go"].ptn__side--${event.key === 'ArrowLeft' ? 'prev' : 'next'}`);
    if (!target) return;
    event.preventDefault();
    go(target.dataset.id);
  };
  document.addEventListener('keydown', onKey);
  const stop = on('ward', redraw);
  await openDialog({
    variant: 'full',
    className: 'ward-detail accent-neuro',
    body: detailBody(p, list.view()),
    onOpen(dlg, close) {
      dialog = dlg;
      dlg.setAttribute('aria-labelledby', 'ptb-title');
      mountNotes(dlg.querySelector('.dlg__body'), listId);
      mountHistory(dlg.querySelector('.dlg__body'), p);
      mountCt(dlg.querySelector('.dlg__body'), { hn: p.hn });
      dlg.addEventListener('click', async (event) => {
        const tool = event.target.closest('[data-bact]');
        if (tool) {
          const { bact: op, col, n } = tool.dataset;
          if (op === 'cols') arrange((b) => withCols(b, Number(n)));
          else if (op === 'wide') arrange((b) => ({ ...b, wide: Number(n) }));
          else if (op === 'reset') {
            if (await confirmDialog({ title: 'Reset the layout?', message: `The dashboard for “${current()?.name ?? ''}” goes back to two columns, with every tile shown at its usual size.`, confirmLabel: 'Reset' })) arrange(() => null);
          } else arrange((b) => changeTile(b, col, op));
          return;
        }
        const button = event.target.closest('[data-dact]');
        const act = button?.dataset.dact;
        const now = findPatient(id);
        if (!act || !now) return;
        if (act === 'go') {
          await go(button.dataset.id);
        } else if (act === 'referral') {
          await openReferral(listId, now.id);
        } else if (act === 'customize') {
          editing = !editing;
          redraw();
        } else if (act === 'mark') {
          close('rounded');
          await tick(now, true);
        } else if (act === 'untick') {
          await untick(now);
        } else if (act === 'edit') {
          if (button.dataset.col === current()?.view().locationCol) await editLocation(now, button.dataset.col);
          else await editText(now, button.dataset.col);
        } else if (act === 'restart') {
          const ok = await confirmDialog({ title: 'Restart the timer?', message: `${now.name}’s timer starts again from 0:00 now.`, confirmLabel: 'Restart' });
          if (ok && await current()?.restartTimer(now.key)) toast('Timer restarted.', { icon: 'timer' });
        } else if (act === 'start') {
          await current()?.startRounds();
          await current()?.notePatientOpened(now.key);
          toast('Rounds started.', { icon: 'timer' });
        }
      });
    },
  });
  stop();
  historyClosed();
  ctClosed();
  document.removeEventListener('keydown', onKey);
  const last = findPatient(id);
  if (last?.tickable) await current()?.notePatientClosed(last.key); // closing their page pauses their timer
}

/* ---------- Ticking ---------- */

async function tick(p, rounded) {
  const list = current();
  const entry = await list?.setRounded(p.key, rounded);
  if (!entry) return;
  const v = list.view();
  if (rounded) {
    const message = `${p.name} rounded${entry.durationMs != null ? ` · ${formatSpan(entry.durationMs)}` : ''}`;
    toast(message, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => list.setRounded(p.key, false) } });
    announce(`${message}. ${v.roundedCount} of ${v.total} rounded.`);
  } else {
    announce(`${p.name} is not rounded. ${v.roundedCount} of ${v.total} rounded.`);
  }
}

async function untick(p) {
  const ok = await confirmDialog({
    title: 'Mark as not rounded?',
    message: `${p.name}${p.end ? ` was marked rounded at ${wardTime(p.end)}` : ''}. Unticking clears the end time.`,
    confirmLabel: 'Untick',
  });
  if (ok) await tick(p, false);
}

/* ---------- Editing a column ---------- */

/** Edit one of a patient's columns (col: its letter, e.g. 'C'). */
async function editText(p, col) {
  const list = current();
  const c = list?.columns().find((x) => x.col === col);
  if (!c) return;
  const before = p.cells[col] ?? '';
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit ward-edit--big accent-neuro',
    dismissible: false,
    title: `Edit ${c.label}`,
    body: html`<form class="form" data-edit novalidate>
      <p class="dlg__msg">${p.name}${p.hn ? ` · ${hnLabel(list.view())} ${p.hn}` : ''}</p>
      <label class="field"><span class="sr-only">${c.label}</span>
        <textarea class="input textarea ward-edit__text" name="text" rows="9" maxlength="${MAX_TEXT}" autocapitalize="sentences">${before}</textarea>
      </label>
      <p class="ward-edit__hint">Saved to column ${col} of the logsheet (line breaks are kept).${c.priority ? ' Write P1, P2 or P3 to set the priority (P1 is highest; “priority” on its own counts as P1).' : ''}</p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-edit]');
      const text = form.elements.text;
      setTimeout(() => {
        text.focus();
        text.setSelectionRange(text.value.length, text.value.length);
      }, 80);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (text.value !== before && !(await confirmDialog({ title: 'Discard your changes?', message: `Your edits to ${p.name}’s ${c.label} will be lost.`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close({ text: text.value });
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  await saveCell(list, p, col, result.text);
}

/** Save a patient's cell and say how it went. */
async function saveCell(list, p, col, text) {
  let outcome;
  try {
    outcome = await list.saveText(p.key, col, text);
  } catch (err) {
    toast(err.message, { icon: 'info', duration: 6000 });
    return;
  }
  if (outcome.saved) toast('Saved to the logsheet.', { icon: 'check' });
  else if (outcome.state === 'conflict') await openConflict(`${list.id}|${p.key}|${col}`);
  else if (outcome.problem === 'needs-update') {
    toast('Saved on this device. Update the sync script to save it to the logsheet.', {
      icon: 'sparkles', duration: 8000, action: { label: 'Show me how', onClick: () => runAction('sync:update') },
    });
  } else if (outcome.state === 'blocked') toast(`Not saved: ${WRITE_PROBLEMS[outcome.problem] ?? WRITE_PROBLEMS.invalid}.`, { icon: 'info', duration: 7000 });
  else toast('Saved on this device. It goes to the logsheet as soon as Google can be reached.', { icon: 'cloud', duration: 6000 });
}

/** Edit where a patient is: one line, with the locations already in use to pick from. */
async function editLocation(p, col) {
  const list = current();
  const c = list?.columns().find((x) => x.col === col);
  if (!c) return;
  const before = p.cells[col] ?? '';
  const known = list.view().locations;
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit ward-loc accent-neuro',
    dismissible: false,
    title: `Edit ${c.label}`,
    body: html`<form class="form" data-edit novalidate>
      <p class="dlg__msg">${p.name}${p.hn ? ` · ${hnLabel(list.view())} ${p.hn}` : ''}</p>
      <label class="field"><span class="field__label">Where they are</span>
        <input class="input" name="text" maxlength="${MAX_LOCATION}" value="${cleanLocation(before)}" placeholder="For example: ICU – Bed 4" autocomplete="off" autocapitalize="words" enterkeyhint="done">
      </label>
      ${known.length ? html`<p class="field__label ward-loc__pick-label">Or pick one already in use</p>
        <div class="chips chips--sm ward-loc__chips">${known.map((loc) => html`<button type="button" class="chip-toggle" data-loc="${loc.name}" aria-pressed="${locationKey(before) === loc.key ? 'true' : 'false'}">${icon('pin')}${loc.name}</button>`)}</div>` : ''}
      <p class="ward-edit__hint">Saved to column ${col} of the logsheet. Leave it empty if they have no location.</p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-edit]');
      const text = form.elements.text;
      const start = text.value;
      const mark = () => form.querySelectorAll('[data-loc]').forEach((b) => b.setAttribute('aria-pressed', String(locationKey(b.dataset.loc) === locationKey(text.value) && Boolean(text.value.trim()))));
      // Focus only with a mouse and keyboard, after the sheet has slid in (on iPhone it shifts the sheet)
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => text.focus({ preventScroll: true }), 320);
      text.addEventListener('input', mark);
      form.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-loc]');
        if (!chip) return;
        text.value = chip.dataset.loc;
        mark();
      });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (text.value !== start && !(await confirmDialog({ title: 'Discard your change?', message: `${p.name}’s ${c.label} won’t be changed.`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close({ text: cleanLocation(text.value) });
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  if (result.text === cleanLocation(before) && !before.includes('\n')) return; // nothing changed
  await saveCell(list, p, col, result.text);
}

/* ---------- Conflicts ---------- */

function describeRounds(cells) {
  if (!cells) return '';
  const time = (text) => (fromSheetTime(text) ? wardStamp(fromSheetTime(text)) : text);
  const started = cells.F ? ` (started ${time(cells.F)})` : '';
  return cells.E ? `Rounded${cells.G ? ` at ${time(cells.G)}` : ''}${started}` : `Not rounded${started}`;
}

async function openConflict(key) {
  const list = current();
  const item = list?.view().conflicts.find((i) => i.key === key);
  if (!item) return;
  const column = item.kind === 'rounds' ? null : item.kind; // a column's text; otherwise rounds
  const theirs = column ? item.current?.[column] ?? '' : describeRounds(item.current);
  const mine = column ? item.set[column] : describeRounds(item.set);
  const choice = await openDialog({
    variant: 'modal',
    className: 'ward-conflict accent-neuro',
    title: column ? `“${item.label || `Column ${column}`}” was changed` : 'Rounds were changed',
    body: html`<p class="dlg__msg"><strong>${item.name}</strong>${item.hn ? ` (${item.hn})` : ''}: someone changed this in the logsheet after the app loaded it. Which version should the logsheet keep?</p>
      <div class="ward-versions">
        <section class="ward-version"><h3 class="ward-version__title">In the logsheet now</h3><div class="prose">${theirs || '(empty)'}</div></section>
        <section class="ward-version ward-version--mine"><h3 class="ward-version__title">Yours</h3><div class="prose">${mine || '(empty)'}</div></section>
      </div>`,
    actions: [
      { label: 'Keep logsheet’s', value: 'theirs' },
      { label: 'Keep mine', value: 'mine', variant: 'primary' },
    ],
  });
  if (choice !== 'mine' && choice !== 'theirs') return;
  await list.resolveConflict(key, choice);
  toast(choice === 'mine' ? 'Your version is being saved to the logsheet.' : 'Kept the logsheet’s version.', { icon: 'check' });
}

/* ---------- Linking the logsheet ---------- */

function setupFeedback(state, readOnly = false) {
  if (!state) return '';
  if (state.error) {
    const e = state.error;
    return html`<div class="form-error" role="alert">
      <p>${e.message}</p>
      ${e.code === 'ward-no-tab' && e.data?.tabs?.length ? html`<p class="ward-setup__tabs-label">Tabs in “${e.data.title ?? 'this spreadsheet'}”:</p>
        <div class="chips chips--sm">${e.data.tabs.map((t) => html`<button type="button" class="chip-toggle" data-pick-tab="${t}">${t}</button>`)}</div>` : ''}
      ${e.code === 'script-outdated' ? html`<button type="button" class="btn btn--sm" data-action="sync:update">Update the sync script</button>` : ''}
    </div>`;
  }
  const c = state.check;
  const notes = [];
  if (c.headers?.state === 'taken') {
    const cols = c.headers.cols ?? ['E', 'F', 'G'];
    const seen = c.headers.values.map((val, i) => `${cols[i]}1 ${val ? `“${val}”` : '(empty)'}`).join(' · ');
    notes.push(html`<p class="note ward-note--warn">${icon('info')}<span><strong>Columns ${cols[0]}–${cols[2]} are already in use</strong> (${seen}${c.headers.dataBelow ? ', with data below' : ''}). The app won’t overwrite them, so ticks would be kept on this device only. If those columns are unused, clear them in the logsheet and tap Check again.</span></p>`);
  }
  if (c.canEdit === false && !readOnly) notes.push(html`<p class="note ward-note--warn">${icon('lock')}<span><strong>View only.</strong> Your Google account can see this logsheet but not edit it, so ticks and edits couldn’t be saved to it. Ask its owner for edit access.</span></p>`);
  if (!c.patients) notes.push(html`<p class="note ward-note--warn">${icon('info')}<span>No patients found from row 2 of “${c.tab}”. Is it the right tab?</span></p>`);
  return html`<div class="ward-setup__found">
    <p class="ward-setup__ok">${icon('checkCircle')}<span>Found <strong>${c.title}</strong> · ${c.tab} · ${plural(c.patients, 'patient')}</span></p>
    ${notes}
    <div class="setup__actions">
      <button type="button" class="btn btn--ghost" data-dialog-value="cancel">Cancel</button>
      ${c.headers?.state === 'taken' ? html`<button type="button" class="btn" data-recheck>Check again</button>
        <button type="button" class="btn btn--primary" data-use="here">Link, ticks on this device</button>`
        : html`<button type="button" class="btn btn--primary" data-use="sheet">Link this logsheet</button>`}
    </div>
  </div>`;
}

export async function openSetup(id = listId) {
  const list = wardList(id);
  if (!list) return;
  if (!syncSnapshot().connected) {
    const go = await confirmDialog({ title: 'Set up sync first', message: LOAD_PROBLEMS['not-connected'], confirmLabel: 'Set up sync' });
    if (go) runAction('sync:setup');
    return;
  }
  const link = list.link;
  const outdated = (syncScriptVersion() ?? 0) < LATEST_SCRIPT_VERSION;
  const columns = list.columns().map((c) => `${c.col} ${c.label}`).join(' · ');
  await openDialog({
    variant: 'sheet',
    className: 'setup ward-setup accent-neuro',
    title: link ? `Change logsheet · ${list.name}` : `Link a logsheet · ${list.name}`,
    body: html`
      <p class="setup__lead">Paste the link to the ${list.isCensus ? 'referral census' : list.isDuty ? 'duty patients sheet' : `ward logsheet for “${list.name}”`} (a Google Sheet): open it, then copy the address — or use <strong>Share → Copy link</strong>.</p>
      ${outdated ? html`<p class="note">${icon('sparkles')}<span>${LOAD_PROBLEMS['script-outdated']} <button type="button" class="link-inline" data-action="sync:update">Show me how</button></span></p>` : ''}
      <form class="setup__form" data-link novalidate>
        <label class="field"><span class="field__label">Logsheet link</span>
          <input class="input" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…" value="${link?.test ? '' : link?.url ?? ''}" required>
        </label>
        <label class="field"><span class="field__label">Tab name</span>
          <input class="input" name="tab" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${link?.test ? 'Sheet1' : link?.tab ?? 'Sheet1'}" required>
        </label>
        <div data-feedback></div>
        <div class="setup__actions" data-first-actions>
          <button type="button" class="btn btn--ghost" data-dialog-value="cancel">Cancel</button>
          <button type="submit" class="btn btn--primary" data-submit>Check logsheet</button>
        </div>
      </form>
      <p class="note">${icon('lock')}<span>Saved on this device only — never synced, backed up or written into the app. Patients are read from row 2: ${list.layout().name} Name · ${list.layout().hn} Hospital Number${columns ? ` · ${columns}` : ''}${list.layout().rounds ? `. Rounds go in columns ${roundsSpan(list.layout())}` : ''}${list.isDuty ? '. The app only reads it — nothing is written to it' : ', and your edits go back to their own columns. Names and hospital numbers are never changed'}. ${list.ownPage ? '(You can choose the columns next.)' : '(Different columns? Link it, then choose them in Columns → Where things are.)'}</span></p>
      ${(!link || link.test) && !list.ownPage ? html`<div class="ward-setup__test">
        <p>${link?.test ? 'Practice logsheet in use.' : 'Want to try it first?'} A practice logsheet with made-up patients can be created in your Google Drive.</p>
        <button type="button" class="btn btn--sm" data-test>${icon('sparkles')}Create a practice logsheet</button>
      </div>` : ''}`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-link]');
      const feedback = dlg.querySelector('[data-feedback]');
      const submit = dlg.querySelector('[data-submit]');
      const firstActions = dlg.querySelector('[data-first-actions]');
      let check = null;

      const show = (state) => {
        setHTML(feedback, setupFeedback(state, list.isDuty));
        firstActions.hidden = Boolean(state?.check);
      };
      const run = async () => {
        show(null);
        check = null;
        submit.disabled = true;
        submit.textContent = 'Checking…';
        try {
          check = await checkLogsheet({ url: form.url.value, tab: form.tab.value, layout: wardList(id)?.layout() });
          show({ check });
        } catch (err) {
          show({ error: err });
        } finally {
          submit.disabled = false;
          submit.textContent = 'Check logsheet';
        }
      };
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        run();
      });
      form.addEventListener('input', () => { if (check) show(null); check = null; });
      dlg.addEventListener('click', async (event) => {
        const pick = event.target.closest('[data-pick-tab]');
        if (pick) {
          form.tab.value = pick.dataset.pickTab;
          run();
          return;
        }
        if (event.target.closest('[data-recheck]')) {
          run();
          return;
        }
        const use = event.target.closest('[data-use]');
        if (use && check) {
          const target = wardList(id);
          if (!target) return;
          const v = target.view();
          const replacing = v.link && (v.link.spreadsheetId !== check.spreadsheetId || v.link.tab !== check.tab);
          if (replacing && v.unsaved && !(await confirmDialog({
            title: 'Discard unsaved changes?',
            message: `${plural(v.unsaved, 'change')} to the current logsheet ${v.unsaved === 1 ? 'hasn’t' : 'haven’t'} been saved yet. Changing the logsheet discards ${v.unsaved === 1 ? 'it' : 'them'}.`,
            confirmLabel: 'Change anyway',
            destructive: true,
          }))) return;
          close('linked');
          await target.useLogsheet(check, { roundsHere: use.dataset.use === 'here' });
          toast(`Linked “${check.title}” · ${plural(check.patients, 'patient')}.`, { icon: 'link' });
          return;
        }
        const test = event.target.closest('[data-test]');
        if (test) {
          const target = wardList(id);
          if (!target) return;
          const v = target.view();
          if (v.unsaved && v.link && !v.link.test && !(await confirmDialog({
            title: 'Discard unsaved changes?',
            message: `${plural(v.unsaved, 'change')} to your logsheet ${v.unsaved === 1 ? 'hasn’t' : 'haven’t'} been saved yet. Switching to a practice logsheet discards ${v.unsaved === 1 ? 'it' : 'them'}.`,
            confirmLabel: 'Switch anyway',
            destructive: true,
          }))) return;
          test.disabled = true;
          test.textContent = 'Creating…';
          try {
            const made = await target.createTestLogsheet();
            close('test');
            toast(`Practice logsheet created in your Google Drive · ${plural(made.patients, 'made-up patient')}.`, { icon: 'sparkles', duration: 6000 });
          } catch (err) {
            show({ error: err });
            test.disabled = false;
            test.textContent = 'Create a practice logsheet';
          }
        }
      });
      if (!form.url.value) setTimeout(() => form.url.focus(), 80);
    },
  });
}

/* ---------- The ⋯ menu ---------- */

async function openMenu() {
  const list = current();
  if (!list) return;
  const link = list.link;
  const choice = await actionSheet({
    title: list.name,
    message: link ? `${link.title || 'Logsheet'} · tab “${link.tab}”${link.test ? ' · practice logsheet' : ''}` : 'No logsheet linked on this device',
    items: [
      link ? { label: 'Refresh now', value: 'refresh', icon: 'refresh' } : null,
      { label: 'Rename list', value: 'rename', icon: 'edit' },
      { label: 'Columns', value: 'columns', icon: 'columns', detail: 'Rename, add, remove' },
      { label: 'Report setup', value: 'report-setup', icon: 'clipboard', detail: 'Which columns go in reports' },
      link ? { label: 'Arrange rows', value: 'arrange', icon: 'sort' } : null,
      { label: 'Rounds history', value: 'history', icon: 'history' },
      link ? { label: 'Open in Google Sheets', value: 'open', icon: 'external' } : null,
      link?.roundsHere ? { label: 'Save ticks to the logsheet again', value: 'rounds-sheet', icon: 'sheet' } : null,
      { label: link ? 'Change logsheet' : 'Link logsheet', value: 'change', icon: 'link' },
      link ? { label: 'Remove logsheet from this device', value: 'remove', icon: 'x' } : null,
      { label: 'Delete list', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'refresh') list.refresh();
  else if (choice === 'rename') renameList(list.id);
  else if (choice === 'columns') openColumns(list.id);
  else if (choice === 'report-setup') openReportSetup(list.id);
  else if (choice === 'arrange') openArrange(list.id);
  else if (choice === 'history') openPage('neurology', `list/${list.id}/history`);
  else if (choice === 'open') window.open(link.url, '_blank', 'noopener');
  else if (choice === 'rounds-sheet') list.setRoundsHere(false);
  else if (choice === 'change') openSetup(list.id);
  else if (choice === 'remove') removeLogsheet(list.id);
  else if (choice === 'delete') removeList(list.id);
}

export async function removeLogsheet(id = listId) {
  const list = wardList(id);
  if (!list?.link) return;
  const v = list.view();
  const ok = await confirmDialog({
    title: 'Remove the logsheet from this device?',
    message: `The link and the patients of “${list.name}” are removed from this device${v.unsaved ? `, along with ${plural(v.unsaved, 'change')} not saved to the logsheet yet` : ''}. The logsheet itself isn’t touched, and the list and its rounds history stay.`,
    confirmLabel: 'Remove',
    destructive: true,
  });
  if (!ok) return;
  await list.forgetLogsheet();
  toast('Logsheet removed from this device.', { icon: 'x' });
}

/* ---------- Rounds history ---------- */

async function renderHistory() {
  const list = current();
  if (!list) {
    replacePage('');
    return;
  }
  const [days, names] = [await list.history(), list.namesByKey()];
  if (showing !== 'history') return;
  const now = Date.now();
  keepNotes(view);
  setHTML(view, html`<div class="ward accent-neuro">
    ${subHead({ title: 'Rounds history', back: list.name, fallback: `list/${list.id}`, accent: 'neuro', eyebrow: list.name,
      actions: days.length ? html`<button type="button" class="btn btn--sm btn--ghost" data-action="ward:history-delete">Delete</button>` : '' })}
    <p class="ward-foot">${icon('smartphone')}<span>Kept on this device only: dates, times and hospital numbers. Names show while the patient is still in the logsheet.</span></p>
    ${days.length ? days.map((d, i) => {
      const done = Object.entries(d.patients).filter(([, p]) => p.rounded).sort(([, a], [, b]) => String(a.end ?? '').localeCompare(String(b.end ?? '')));
      const { spans, total } = sessionsText(d.sessions, now);
      return html`<details class="card ward-day"${i === 0 ? raw(' open') : ''}>
        <summary class="ward-day__sum">
          <span class="ward-day__title">${wardDayLong(d.date)}</span>
          <span class="ward-day__meta">${plural(done.length, 'patient')} rounded${d.sessions.length ? ` · rounds ${spans} · ${formatSpan(total)}` : ''}</span>
        </summary>
        ${done.length ? html`<table class="ward-day__table">
          <thead><tr><th scope="col">Patient</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Time</th></tr></thead>
          <tbody>${done.map(([key, p]) => html`<tr>
            <td>${names.get(key) ? html`${names.get(key)}<small>${p.hn}</small>` : p.hn}</td>
            <td>${p.start ? wardTime(p.start) : '—'}</td>
            <td>${p.end ? wardTime(p.end) : '—'}</td>
            <td>${p.durationMs != null ? formatSpan(p.durationMs) : '—'}</td>
          </tr>`)}</tbody>
        </table>` : html`<p class="ward-day__none">No patients ticked this day.</p>`}
      </details>`;
    }) : html`<div class="card empty">${icon('history')}<span>No rounds recorded for this list on this device yet.</span></div>`}
  </div>`);
}

/* ---------- Actions ---------- */

registerAction('ward:setup', (el) => openSetup(listFor(el)?.id));
registerAction('ward:remove', (el) => removeLogsheet(listFor(el)?.id));
registerAction('ward:menu', () => openMenu());
registerAction('ward:refresh', (el) => listFor(el)?.refresh());
registerAction('ward:columns', () => openColumns(listId));
registerAction('ward:arrange', () => openArrange(listId));
registerAction('ward:report', () => openReport(listId));
registerAction('ward:sync-order', () => syncOrder(listId, (list) => tableOrder(list.view()).map(({ p }) => p.row)));
registerAction('ward:rename-col', (el) => renameColumn(listId, el.dataset.colId));

/** Arrange the list by priority or by location (the first time, choose which column holds locations). */
async function arrangeBy(value) {
  const list = current();
  if (!list) return;
  if (value === 'location' && !list.def.columns.some((c) => c.location)) {
    const done = await setupLocation(list.id);
    if (!done) {
      render(); // back to Priority
      return;
    }
  }
  await updateList(list.id, (def) => { def.arrange = value === 'location' ? 'location' : undefined; });
  announce(value === 'location' ? 'Arranged by location.' : 'Arranged by priority.');
}
document.addEventListener('change', (event) => {
  if (showing === 'list' && event.target.name === 'ward-arrange' && view?.contains(event.target)) arrangeBy(event.target.value);
  if (showing === 'list' && event.target.name === 'ward-edits' && view?.contains(event.target)) {
    editsDay = Number(event.target.value) || 0;
    render();
    announce(editsDay ? `Showing what you edited ${EDIT_DAYS[editsDay].toLowerCase()} in red.` : 'Edits not shown.');
  }
});
registerAction('ward:open', (el) => openPatient(el.dataset.id));
registerAction('ward:tick', (el) => {
  const p = findPatient(el.dataset.id);
  if (!p?.tickable) return;
  if (p.rounded) untick(p);
  else tick(p, true);
});
registerAction('ward:check', async (el) => {
  const list = current();
  const p = findPatient(el.dataset.id);
  const c = list?.columns().find((x) => x.col === el.dataset.col);
  if (!p?.tickable || !c) return;
  const on = !isTicked(p.cells[c.col]);
  await list.setCheck(p.key, c.col, on);
  announce(`${p.name}: ${c.label} ${on ? 'ticked' : 'unticked'}.`);
  if ((syncScriptVersion() ?? 0) < 11) {
    toast('Saved on this device. Update the sync script to tick the logsheet too.', { icon: 'sparkles', duration: 7000, action: { label: 'Show me how', onClick: () => runAction('sync:update') } });
  }
});
registerAction('ward:more', (el) => {
  const id = el.dataset.clampId;
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
  const text = el.previousElementSibling;
  const open = expanded.has(id);
  text?.classList.toggle('is-clamped', !open);
  el.textContent = open ? 'Show less' : 'Show more';
  el.setAttribute('aria-expanded', String(open));
});
registerAction('ward:start', async () => {
  await current()?.startRounds();
  toast('Rounds started. Open each patient as you see them to time the visit.', { icon: 'timer', duration: 5000 });
});
registerAction('ward:end', async () => {
  const list = current();
  if (!list) return;
  const v = list.view();
  if (v.roundedCount < v.total && !(await confirmDialog({ title: 'End rounds?', message: `${v.roundedCount} of ${v.total} patients are rounded.`, confirmLabel: 'End Rounds' }))) return;
  const session = await list.endRounds();
  if (session) toast(`Rounds ended · ${formatSpan(Date.parse(session.end) - Date.parse(session.start))}.`, { icon: 'checkCircle' });
});
registerAction('ward:conflict', (el) => openConflict(el.dataset.key));
registerAction('ward:rounds-here', async () => {
  const ok = await confirmDialog({
    title: 'Keep ticks on this device?',
    message: 'Ticks and rounds times will be saved in this device’s rounds history only, not in the logsheet. Your other edits still save to the logsheet. You can change this later from the ⋯ menu.',
    confirmLabel: 'Keep on this device',
  });
  if (ok) await current()?.setRoundsHere(true);
});
registerAction('ward:rounds-sheet', () => current()?.setRoundsHere(false));
registerAction('ward:copy', async (el) => {
  const item = current()?.view().orphans.find((i) => i.key === el.dataset.key);
  if (!item) return;
  try {
    await navigator.clipboard.writeText(item.set[item.kind] ?? '');
    toast('Copied. Paste it wherever it belongs.', { icon: 'copy' });
  } catch {
    toast('Couldn’t copy on this device.', { icon: 'info' });
  }
});
registerAction('ward:discard', async (el) => {
  const list = current();
  const item = list?.view().orphans.find((i) => i.key === el.dataset.key);
  if (!item) return;
  const ok = await confirmDialog({
    title: 'Discard this change?',
    message: item.kind !== 'rounds' ? `Your edit to ${item.name}’s ${item.label || `column ${item.kind}`} will be deleted from this device.` : `The rounds tick for ${item.name} won’t be saved to the logsheet (it stays in the rounds history).`,
    confirmLabel: 'Discard',
    destructive: true,
  });
  if (ok) await list.dropChange(item.key);
});
registerAction('ward:retry-change', async (el) => {
  toast('Trying again…', { icon: 'refresh' });
  await current()?.retryChange(el.dataset.key);
});
registerAction('ward:discard-change', async (el) => {
  const list = current();
  const item = list?.queue.get(el.dataset.key);
  if (!item) return;
  const ok = await confirmDialog({
    title: 'Discard this change?',
    message: item.kind === 'rounds'
      ? `The rounds tick for ${item.name} won’t be saved to the logsheet (it stays in the rounds history).`
      : `${item.name}’s ${item.label || `column ${item.kind}`} stays as it is in the logsheet. Your change is deleted from this device.`,
    confirmLabel: 'Discard',
    destructive: true,
  });
  if (ok) await list.dropChange(item.key);
});
registerAction('ward:history-delete', async () => {
  const list = current();
  if (!list) return;
  const ok = await confirmDialog({
    title: 'Delete rounds history?',
    message: `This deletes every day’s rounds times and hospital numbers for “${list.name}” from this device, including today’s rounds in progress. The logsheet isn’t touched.`,
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  await list.deleteHistory();
  toast('Rounds history deleted from this device.', { icon: 'trash' });
  if (showing === 'history') renderHistory();
});

/** Tapping a card anywhere (not on a button) opens the patient. */
export function handleCardClick(event) {
  if (showing !== 'list') return;
  const card = event.target.closest('.pt[data-id]');
  if (!card || event.target.closest('button, a, input, textarea, select, [data-action]')) return;
  if (window.getSelection()?.toString()) return; // selecting text to copy
  openPatient(card.dataset.id);
}
