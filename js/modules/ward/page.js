/* Ward Patients screen (#/neurology/ward) and rounds history (#/neurology/ward/history).

   Patients show as cards on iPhone and as a table on wider screens. A
   patient's details open in a sheet, not a page of their own, so hospital
   numbers never appear in the address bar or browser history. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction, runAction } from '../../core/actions.js';
import { on } from '../../core/events.js';
import { liveElapsed, subHead } from '../../core/components.js';
import { actionSheet, announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { LATEST_SCRIPT_VERSION, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import {
  checkLogsheet, createTestLogsheet, deleteHistory, dropChange, endRounds, forgetLogsheet, lastLoadedAt, loadHistory,
  EDITABLE, namesByKey, notePatientOpened, refreshWard, resolveConflict, saveText, setRounded, setRoundsHere,
  startRounds, useLogsheet, wardView,
} from './engine.js';
import {
  LOAD_PROBLEMS, MAX_RECS, PRIORITY_LEVELS, WRITE_PROBLEMS, formatSpan, fromSheetTime, wardDayLong, wardStamp, wardTime,
} from './model.js';

const AUTO_REFRESH_MS = 3 * 60 * 1000;
const FRESH_MS = 15_000; // opening the screen again within this doesn't reload

let view = null;
let showing = null;      // 'ward' | 'history' | null
let refreshTimer = null;
let renderQueued = false;
const expanded = new Set(); // "id|labs" / "id|recs" opened with Show more

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const findPatient = (id) => wardView().patients.find((p) => p.id === id) ?? null;

/* ---------- Pages ---------- */

export const wardPage = {
  show(el) {
    view = el;
    showing = 'ward';
    render();
    const last = Date.parse(lastLoadedAt() ?? '');
    if (!(Date.now() - last < FRESH_MS)) refreshWard();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && showing === 'ward') refreshWard();
    }, AUTO_REFRESH_MS);
  },
  hide() {
    showing = null;
    clearInterval(refreshTimer);
  },
};

export const historyPage = {
  show(el) {
    view = el;
    showing = 'history';
    clearInterval(refreshTimer);
    return renderHistory();
  },
  hide() {
    showing = null;
  },
};

// Several changes in a row (a tick, then the logsheet's answer) redraw once
function renderSoon() {
  if (showing !== 'ward' || renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 30);
}
on('ward', renderSoon);
// Before a logsheet is linked, the page depends on sync being connected and up to date
on('sync', () => { if (!wardView().link) renderSoon(); });

// Back to the app after a while: catch up straight away (then every 3 minutes)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || showing !== 'ward') return;
  const last = Date.parse(lastLoadedAt() ?? '');
  if (!(Date.now() - last < AUTO_REFRESH_MS)) refreshWard();
});

/* ---------- The Ward Patients page ---------- */

function render() {
  if (!view || showing !== 'ward') return;
  const v = wardView();
  const focused = view.contains(document.activeElement) ? document.activeElement.closest('[data-focus]')?.dataset.focus : null;
  const menu = v.link ? html`<button type="button" class="icon-btn" data-action="ward:menu" aria-label="Logsheet options" data-focus="menu">${icon('more')}</button>` : '';
  setHTML(view, html`<div class="ward accent-neuro">
    ${subHead({ title: 'Ward Patients', back: 'Neurology', accent: 'neuro', actions: menu, eyebrow: v.link ? `${v.link.title || 'Logsheet'} · ${v.link.tab}` : '' })}
    ${v.link ? linkedBody(v) : setupBody()}
  </div>`);
  measureClamps();
  if (focused) view.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function setupBody() {
  const connected = syncSnapshot().connected;
  const outdated = connected && (syncScriptVersion() ?? 0) < LATEST_SCRIPT_VERSION;
  return html`<section class="card ward-intro">
    <span class="ward-intro__icon">${icon('stethoscope')}</span>
    <h2 class="ward-intro__title">Link your ward logsheet</h2>
    <p class="ward-intro__text">See your ward patients sorted for rounds (P1, P2, P3 first), tick them off as you go, and edit recommendations — saved straight to your Google Sheet logsheet.</p>
    <ul class="ward-intro__list">
      <li>${icon('sheet')}<span>Reads Name, Hospital Number, Labs and Recommendations (columns A–D, from row 2)</span></li>
      <li>${icon('checkCircle')}<span>Saves rounds in columns E–G and your edits to labs and recommendations in C–D; never changes names or hospital numbers</span></li>
      <li>${icon('lock')}<span>The link stays on this device only</span></li>
    </ul>
    ${!connected ? html`<p class="note">${icon('cloud')}<span>${LOAD_PROBLEMS['not-connected']}</span></p>
        <button type="button" class="btn btn--accent btn--block" data-action="sync:setup">Set up sync</button>`
      : html`${outdated ? html`<p class="note">${icon('sparkles')}<span>${LOAD_PROBLEMS['script-outdated']}</span></p>
          <button type="button" class="btn btn--block" data-action="sync:update">Update the sync script</button>` : ''}
        <button type="button" class="btn btn--accent btn--block" data-action="ward:setup">${icon('link')}Link logsheet</button>`}
  </section>`;
}

function linkedBody(v) {
  return html`${banners(v)}
    ${roundsCard(v)}
    ${statusLine(v)}
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
    const seen = h.values.map((val, i) => `${'EFG'[i]}1 ${val ? `“${val}”` : '(empty)'}`).join(' · ');
    out.push(banner({
      tone: 'workout',
      iconName: 'info',
      title: 'Columns E–G are already in use',
      text: html`The app saves rounds in columns E–G, but ${h.dataBelow ? 'they already hold data' : 'they already have other headings'} (${seen}). Nothing was overwritten, so your ticks aren’t in the logsheet yet. If those columns are unused, clear them in the logsheet and tap Try again — or keep ticks on this device only.`,
      actions: html`<button type="button" class="btn btn--sm" data-action="ward:rounds-here">Keep ticks on this device</button><button type="button" class="btn btn--sm btn--primary" data-action="ward:refresh">Try again</button>`,
    }));
  }
  if (v.blocked.some((i) => i.problem === 'needs-update')) {
    out.push(banner({
      iconName: 'sparkles',
      title: 'Lab results are waiting for a script update',
      text: 'Your edited lab results are saved on this device. They go to the logsheet once the sync script is updated.',
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button>`,
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
        <span class="ward-orphan__text"><strong>${item.name}</strong>${item.hn ? ` (${item.hn})` : ''} · ${EDITABLE[item.kind] ? `edited ${EDITABLE[item.kind].label}` : 'rounds tick'}</span>
        <span class="ward-orphan__actions">
          ${EDITABLE[item.kind] ? html`<button type="button" class="btn btn--sm" data-action="ward:copy" data-key="${item.key}">${icon('copy')}Copy text</button>` : ''}
          <button type="button" class="btn btn--sm btn--ghost" data-action="ward:discard" data-key="${item.key}">Discard</button>
        </span>
      </li>`)}</ul>
    </div>`);
  }
  if (v.duplicates.length) {
    out.push(banner({ tone: 'workout', title: 'Repeated hospital numbers', text: `More than one row in the logsheet has ${v.duplicates.length === 1 ? 'the hospital number' : 'these hospital numbers'}: ${v.duplicates.join(', ')}. Those patients can’t be ticked or edited here until it’s fixed in the logsheet.` }));
  }
  if (v.cache?.canEdit === false) {
    out.push(banner({ tone: 'neutral', iconName: 'lock', title: 'View only', text: 'Your Google account can view this logsheet but not edit it, so ticks and recommendations stay on this device (Not synced). Ask the logsheet’s owner for edit access.' }));
  }
  if (v.link.roundsHere) {
    out.push(html`<p class="ward-foot">${icon('smartphone')}<span>Ticks are kept on this device only (columns E–G of the logsheet are used for something else). <button type="button" class="link-inline" data-action="ward:rounds-sheet">Save ticks to the logsheet again</button></span></p>`);
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
    <button type="button" class="btn btn--sm btn--ghost ward-status__btn${loading ? ' is-busy' : ''}" data-action="ward:refresh" data-focus="refresh"${loading ? raw(' disabled') : ''}>${icon('refresh')}Refresh</button>
  </div>`;
}

function patientTable(v) {
  if (!v.patients.length) {
    return html`<div class="card empty">${icon('sheet')}<span>No patients in “${v.link.tab}” yet. The app reads patients from row 2, with the name in column A.</span></div>`;
  }
  const groups = [
    ...[1, 2, 3].map((level) => [`p${level}`, PRIORITY_LEVELS[level].group, 'flag', v.patients.filter((p) => !p.rounded && p.priority?.level === level)]),
    ['todo', 'Not yet rounded', 'circle', v.patients.filter((p) => !p.rounded && !p.priority)],
    ['done', 'Rounded', 'checkCircle', v.patients.filter((p) => p.rounded)],
  ].filter((g) => g[3].length);
  return html`<div class="ward-table">
    <div class="pt pt--head" aria-hidden="true"><span>Rounded</span><span>Name</span><span>Hospital No.</span><span>Labs</span><span>Recommendations</span></div>
    ${groups.map(([id, label, iconName, list]) => html`<section class="ward-group ward-group--${id}" aria-labelledby="wg-${id}">
      <h2 class="ward-group__title" id="wg-${id}">${icon(iconName)}${label}<span class="ward-group__count">${list.length}</span></h2>
      <ul class="ward-list">${list.map((p) => patientRow(p, v))}</ul>
    </section>`)}
  </div>`;
}

function tickButton(p) {
  if (!p.tickable) {
    const why = p.key ? 'Can’t be ticked: another row has the same hospital number' : 'Can’t be ticked: no hospital number';
    return html`<span class="pt__tick is-disabled" role="img" aria-label="${why}" title="${why}"><span class="pt__box"></span></span>`;
  }
  return html`<button type="button" class="pt__tick" role="checkbox" aria-checked="${p.rounded ? 'true' : 'false'}"
      aria-label="Rounded: ${p.name}" data-action="ward:tick" data-id="${p.id}" data-focus="tick-${p.id}"><span class="pt__box">${icon('check')}</span></button>`;
}

function changeBadge(p) {
  const items = [p.labsItem, p.recsItem, p.roundsItem].filter(Boolean);
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
  if (!detail) {
    if (p.rounded) {
      out.push(html`<span class="wbadge wbadge--done">${icon('check')}${p.end ? `Rounded ${wardTime(p.end)}` : 'Rounded'}${p.durationMs != null ? ` · ${formatSpan(p.durationMs)}` : ''}</span>`);
    } else if (p.opened && v.active) {
      out.push(html`<span class="wbadge wbadge--live">${icon('timer')}Started ${wardTime(p.opened)} · ${liveElapsed(p.opened)}</span>`);
    } else if (p.lastRounded) {
      out.push(html`<span class="wbadge">${icon('history')}Last rounded ${wardStamp(p.lastRounded)}</span>`);
    }
  }
  if (p.duplicate) out.push(html`<span class="wbadge wbadge--warn">${icon('info')}Same number as another row</span>`);
  if (!detail) out.push(changeBadge(p)); // the patient sheet explains changes in full
  return out.some(Boolean) ? html`<p class="pt__badges">${out}</p>` : '';
}

function clampText(p, field, label, text) {
  const id = `${p.id}|${field}`;
  const open = expanded.has(id);
  return html`<div class="pt__field pt__field--${field}">
    <p class="pt__label">${label}</p>
    ${text
      ? html`<div class="pt__text${open ? '' : ' is-clamped'}" data-clamp="${id}">${text}</div>
        <button type="button" class="pt__more" data-action="ward:more" data-clamp-id="${id}" aria-expanded="${open ? 'true' : 'false'}"${open ? '' : raw(' hidden')}>${open ? 'Show less' : 'Show more'}</button>`
      : html`<p class="pt__text pt__text--empty">None</p>`}
  </div>`;
}

function patientRow(p, v) {
  return html`<li class="pt${p.rounded ? ' is-rounded' : ''}${p.priority ? ` is-p${p.priority.level}` : ''}" data-id="${p.id}">
    ${tickButton(p)}
    <div class="pt__who">
      <button type="button" class="pt__name" data-action="ward:open" data-id="${p.id}" data-focus="open-${p.id}">${p.name}${icon('chevronRight', 'pt__chev')}</button>
      <p class="pt__hn">${p.hn ? html`<span class="pt__label">HN</span> ${p.hn}` : html`<span class="faint">No hospital number</span>`}</p>
      ${badges(p, v)}
    </div>
    <p class="pt__hn-cell">${p.hn || '—'}</p>
    ${clampText(p, 'labs', 'Labs', p.labs)}
    ${clampText(p, 'recs', 'Recommendations', p.recs)}
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
  resizeTimer = setTimeout(() => { if (showing === 'ward') measureClamps(); }, 150);
});

/* ---------- One patient (a sheet) ---------- */

function changeNote(item) {
  if (!item) return '';
  if (item.state === 'conflict') {
    return html`<p class="note ward-note--warn">${icon('info')}<span>Someone changed this in the logsheet after the app loaded it. <button type="button" class="link-inline" data-action="ward:conflict" data-key="${item.key}">Choose a version</button></span></p>`;
  }
  if (item.state === 'blocked') return html`<p class="note ward-note--warn">${icon('info')}<span>Not saved: ${WRITE_PROBLEMS[item.problem] ?? WRITE_PROBLEMS.invalid}.</span></p>`;
  return html`<p class="note">${icon('cloud')}<span>Not synced yet — it’s saved on this device and goes to the logsheet automatically.</span></p>`;
}

function roundsBox(p, v) {
  if (!p.tickable) {
    return html`<div class="ptd__rounds"><p class="ptd__status">${icon('info')}<span>${p.key
      ? 'Another row in the logsheet has the same hospital number, so this patient can’t be ticked or edited here until that’s fixed.'
      : 'This patient has no hospital number in the logsheet, so they can’t be ticked or edited here.'}</span></p></div>`;
  }
  if (p.rounded) {
    return html`<div class="ptd__rounds is-done">
      <p class="ptd__status">${icon('checkCircle')}<span>Rounded${p.end ? ` at ${wardTime(p.end)}` : ''}${p.durationMs != null ? ` · ${formatSpan(p.durationMs)}` : ''}${p.start ? html`<small>Started ${wardTime(p.start)}</small>` : ''}</span></p>
      ${changeNote(p.roundsItem)}
      <button type="button" class="btn btn--sm btn--ghost" data-dact="untick">Untick</button>
    </div>`;
  }
  const timing = p.start
    ? html`${icon('timer')}<span>Started ${wardTime(p.start)}${p.opened && v.active ? html` · ${liveElapsed(p.start)}` : ''}</span>`
    : v.active
      ? html`${icon('timer')}<span>Timing starts when you open a patient during rounds.</span>`
      : html`${icon('info')}<span>Rounds aren’t in progress, so this visit isn’t timed. <button type="button" class="link-inline" data-dact="start">Start Rounds now</button></span>`;
  return html`<div class="ptd__rounds">
    <p class="ptd__status">${timing}</p>
    ${changeNote(p.roundsItem)}
    <button type="button" class="btn btn--accent btn--block" data-dact="mark">${icon('check')}Mark as rounded</button>
  </div>`;
}

function detailBody(p, v) {
  if (!p) return html`<p class="dlg__msg">This patient is no longer in the logsheet.</p>`;
  const editable = p.tickable;
  return html`<div class="ptd">
    <p class="ptd__meta">${p.hn ? html`<span class="pt__label">HN</span> ${p.hn}` : 'No hospital number'} · row ${p.row} of the logsheet</p>
    ${badges(p, v, { detail: true })}
    ${roundsBox(p, v)}
    <section class="ptd__section" aria-labelledby="ptd-labs">
      <div class="ptd__head">
        <h3 class="ptd__title" id="ptd-labs">Laboratory results</h3>
        ${editable ? html`<button type="button" class="btn btn--sm" data-dact="edit-labs" aria-label="Edit laboratory results">${icon('edit')}Edit</button>` : ''}
      </div>
      ${p.labs ? html`<div class="prose ptd__text">${p.labs}</div>` : html`<p class="faint">None in the logsheet.</p>`}
      ${changeNote(p.labsItem)}
    </section>
    <section class="ptd__section" aria-labelledby="ptd-recs">
      <div class="ptd__head">
        <h3 class="ptd__title" id="ptd-recs">Recommendations</h3>
        ${editable ? html`<button type="button" class="btn btn--sm" data-dact="edit-recs" aria-label="Edit recommendations">${icon('edit')}Edit</button>` : ''}
      </div>
      ${p.recs ? html`<div class="prose ptd__text">${p.recs}</div>` : html`<p class="faint">None yet.</p>`}
      ${changeNote(p.recsItem)}
    </section>
  </div>`;
}

async function openPatient(id) {
  let p = findPatient(id);
  if (!p) return;
  if (p.tickable) await notePatientOpened(p.key); // during rounds, opening a patient starts their timer
  p = findPatient(id);
  let dialog = null;
  const redraw = () => {
    const body = dialog?.querySelector('.dlg__body');
    if (body && dialog.open) setHTML(body, detailBody(findPatient(id), wardView()));
  };
  const stop = on('ward', redraw);
  await openDialog({
    variant: 'sheet',
    className: 'ward-detail accent-neuro',
    title: p.name,
    body: detailBody(p, wardView()),
    actions: [{ label: 'Close', value: 'close', variant: 'ghost', autofocus: true }], // never an accidental tick
    onOpen(dlg, close) {
      dialog = dlg;
      dlg.addEventListener('click', async (event) => {
        const act = event.target.closest('[data-dact]')?.dataset.dact;
        const current = findPatient(id);
        if (!act || !current) return;
        if (act === 'mark') {
          close('rounded');
          await tick(current, true);
        } else if (act === 'untick') {
          await untick(current);
        } else if (act === 'edit-labs' || act === 'edit-recs') {
          await editText(current, act === 'edit-labs' ? 'labs' : 'recs');
        } else if (act === 'start') {
          await startRounds();
          await notePatientOpened(current.key);
          toast('Rounds started.', { icon: 'timer' });
        }
      });
    },
  });
  stop();
}

/* ---------- Ticking ---------- */

async function tick(p, rounded) {
  const entry = await setRounded(p.key, rounded);
  if (!entry) return;
  const v = wardView();
  if (rounded) {
    const message = `${p.name} rounded${entry.durationMs != null ? ` · ${formatSpan(entry.durationMs)}` : ''}`;
    toast(message, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => setRounded(p.key, false) } });
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

/* ---------- Editing lab results and recommendations ---------- */

const TEXT_FIELDS = {
  labs: {
    title: 'Edit lab results',
    label: 'Laboratory results',
    hint: 'Saved to column C of the logsheet (line breaks are kept).',
  },
  recs: {
    title: 'Edit recommendations',
    label: 'Recommendations',
    hint: 'Saved to column D of the logsheet. Write P1, P2 or P3 to set the priority (P1 is highest; “priority” on its own counts as P1).',
  },
};

/** Edit a patient's lab results (field 'labs') or recommendations ('recs'). */
async function editText(p, field) {
  const f = TEXT_FIELDS[field];
  const before = p[field];
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-edit accent-neuro',
    dismissible: false,
    title: f.title,
    body: html`<form class="form" data-edit novalidate>
      <p class="dlg__msg">${p.name}${p.hn ? ` · HN ${p.hn}` : ''}</p>
      <label class="field"><span class="sr-only">${f.label}</span>
        <textarea class="input textarea ward-edit__text" name="text" rows="9" maxlength="${MAX_RECS}" autocapitalize="sentences">${before}</textarea>
      </label>
      <p class="ward-edit__hint">${f.hint}</p>
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
        if (text.value !== before && !(await confirmDialog({ title: 'Discard your changes?', message: `Your edits to ${p.name}’s ${EDITABLE[field].label} will be lost.`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close({ text: text.value });
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  let outcome;
  try {
    outcome = await saveText(p.key, field, result.text);
  } catch (err) {
    toast(err.message, { icon: 'info', duration: 6000 });
    return;
  }
  if (outcome.saved) toast('Saved to the logsheet.', { icon: 'check' });
  else if (outcome.state === 'conflict') await openConflict(`${p.key}|${field}`);
  else if (outcome.problem === 'needs-update') {
    toast('Saved on this device. Update the sync script to save lab results to the logsheet.', {
      icon: 'sparkles', duration: 8000, action: { label: 'Show me how', onClick: () => runAction('sync:update') },
    });
  } else if (outcome.state === 'blocked') toast(`Not saved: ${WRITE_PROBLEMS[outcome.problem] ?? WRITE_PROBLEMS.invalid}.`, { icon: 'info', duration: 7000 });
  else toast('Saved on this device. It goes to the logsheet as soon as Google can be reached.', { icon: 'cloud', duration: 6000 });
}

/* ---------- Conflicts ---------- */

function describeRounds(cells) {
  if (!cells) return '';
  const time = (text) => (fromSheetTime(text) ? wardStamp(fromSheetTime(text)) : text);
  const started = cells.F ? ` (started ${time(cells.F)})` : '';
  return cells.E ? `Rounded${cells.G ? ` at ${time(cells.G)}` : ''}${started}` : `Not rounded${started}`;
}

async function openConflict(key) {
  const item = wardView().conflicts.find((i) => i.key === key);
  if (!item) return;
  const column = EDITABLE[item.kind]?.column; // lab results or recommendations; otherwise rounds
  const theirs = column ? item.current?.[column] ?? '' : describeRounds(item.current);
  const mine = column ? item.set[column] : describeRounds(item.set);
  const choice = await openDialog({
    variant: 'modal',
    className: 'ward-conflict accent-neuro',
    title: { labs: 'Lab results were changed', recs: 'Recommendations were changed' }[item.kind] ?? 'Rounds were changed',
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
  await resolveConflict(key, choice);
  toast(choice === 'mine' ? 'Your version is being saved to the logsheet.' : 'Kept the logsheet’s version.', { icon: 'check' });
}

/* ---------- Linking the logsheet ---------- */

function setupFeedback(state) {
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
    const seen = c.headers.values.map((val, i) => `${'EFG'[i]}1 ${val ? `“${val}”` : '(empty)'}`).join(' · ');
    notes.push(html`<p class="note ward-note--warn">${icon('info')}<span><strong>Columns E–G are already in use</strong> (${seen}${c.headers.dataBelow ? ', with data below' : ''}). The app won’t overwrite them, so ticks would be kept on this device only. If those columns are unused, clear them in the logsheet and tap Check again.</span></p>`);
  }
  if (c.canEdit === false) notes.push(html`<p class="note ward-note--warn">${icon('lock')}<span><strong>View only.</strong> Your Google account can see this logsheet but not edit it, so ticks and recommendations couldn’t be saved to it. Ask its owner for edit access.</span></p>`);
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

async function openSetup() {
  if (!syncSnapshot().connected) {
    const go = await confirmDialog({ title: 'Set up sync first', message: LOAD_PROBLEMS['not-connected'], confirmLabel: 'Set up sync' });
    if (go) runAction('sync:setup');
    return;
  }
  const v = wardView();
  const outdated = (syncScriptVersion() ?? 0) < LATEST_SCRIPT_VERSION;
  await openDialog({
    variant: 'sheet',
    className: 'setup ward-setup accent-neuro',
    title: v.link ? 'Change logsheet' : 'Link your ward logsheet',
    body: html`
      <p class="setup__lead">Paste the link to your ward logsheet (a Google Sheet): open it, then copy the address — or use <strong>Share → Copy link</strong>.</p>
      ${outdated ? html`<p class="note">${icon('sparkles')}<span>${LOAD_PROBLEMS['script-outdated']} <button type="button" class="link-inline" data-action="sync:update">Show me how</button></span></p>` : ''}
      <form class="setup__form" data-link novalidate>
        <label class="field"><span class="field__label">Logsheet link</span>
          <input class="input" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…" value="${v.link?.test ? '' : v.link?.url ?? ''}" required>
        </label>
        <label class="field"><span class="field__label">Tab name</span>
          <input class="input" name="tab" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${v.link?.test ? 'Sheet1' : v.link?.tab ?? 'Sheet1'}" required>
        </label>
        <div data-feedback></div>
        <div class="setup__actions" data-first-actions>
          <button type="button" class="btn btn--ghost" data-dialog-value="cancel">Cancel</button>
          <button type="submit" class="btn btn--primary" data-submit>Check logsheet</button>
        </div>
      </form>
      <p class="note">${icon('lock')}<span>Saved on this device only — never synced, backed up or written into the app. Patients are read from row 2 (A Name · B Hospital Number · C Laboratory Results · D Recommendations). Rounds go in columns E–G, and labs or recommendations you edit go back to C and D. Names and hospital numbers (A, B) are never changed.</span></p>
      ${!v.link || v.link.test ? html`<div class="ward-setup__test">
        <p>${v.link?.test ? 'Practice logsheet in use.' : 'Want to try it first?'} A practice logsheet with made-up patients can be created in your Google Drive.</p>
        <button type="button" class="btn btn--sm" data-test>${icon('sparkles')}Create a practice logsheet</button>
      </div>` : ''}`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-link]');
      const feedback = dlg.querySelector('[data-feedback]');
      const submit = dlg.querySelector('[data-submit]');
      const firstActions = dlg.querySelector('[data-first-actions]');
      let check = null;

      const show = (state) => {
        setHTML(feedback, setupFeedback(state));
        firstActions.hidden = Boolean(state?.check);
      };
      const run = async () => {
        show(null);
        check = null;
        submit.disabled = true;
        submit.textContent = 'Checking…';
        try {
          check = await checkLogsheet({ url: form.url.value, tab: form.tab.value });
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
          const current = wardView();
          const replacing = current.link && (current.link.spreadsheetId !== check.spreadsheetId || current.link.tab !== check.tab);
          if (replacing && current.unsaved && !(await confirmDialog({
            title: 'Discard unsaved changes?',
            message: `${plural(current.unsaved, 'change')} to the current logsheet ${current.unsaved === 1 ? 'hasn’t' : 'haven’t'} been saved yet. Changing the logsheet discards ${current.unsaved === 1 ? 'it' : 'them'}.`,
            confirmLabel: 'Change anyway',
            destructive: true,
          }))) return;
          close('linked');
          await useLogsheet(check, { roundsHere: use.dataset.use === 'here' });
          toast(`Linked “${check.title}” · ${plural(check.patients, 'patient')}.`, { icon: 'link' });
          return;
        }
        const test = event.target.closest('[data-test]');
        if (test) {
          const current = wardView();
          if (current.unsaved && current.link && !current.link.test && !(await confirmDialog({
            title: 'Discard unsaved changes?',
            message: `${plural(current.unsaved, 'change')} to your logsheet ${current.unsaved === 1 ? 'hasn’t' : 'haven’t'} been saved yet. Switching to a practice logsheet discards ${current.unsaved === 1 ? 'it' : 'them'}.`,
            confirmLabel: 'Switch anyway',
            destructive: true,
          }))) return;
          test.disabled = true;
          test.textContent = 'Creating…';
          try {
            const made = await createTestLogsheet();
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
  const v = wardView();
  if (!v.link) return;
  const choice = await actionSheet({
    title: v.link.title || 'Logsheet',
    message: `Tab “${v.link.tab}”${v.link.test ? ' · practice logsheet' : ''}`,
    items: [
      { label: 'Refresh now', value: 'refresh', icon: 'refresh' },
      { label: 'Rounds history', value: 'history', icon: 'history' },
      { label: 'Open in Google Sheets', value: 'open', icon: 'external' },
      v.link.roundsHere ? { label: 'Save ticks to the logsheet again', value: 'rounds-sheet', icon: 'sheet' } : null,
      { label: 'Change logsheet', value: 'change', icon: 'link' },
      { label: 'Remove from this device', value: 'remove', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'refresh') refreshWard();
  else if (choice === 'history') openPage('neurology', 'ward/history');
  else if (choice === 'open') window.open(v.link.url, '_blank', 'noopener');
  else if (choice === 'rounds-sheet') setRoundsHere(false);
  else if (choice === 'change') openSetup();
  else if (choice === 'remove') removeLogsheet();
}

export async function removeLogsheet() {
  const v = wardView();
  if (!v.link) return;
  const ok = await confirmDialog({
    title: 'Remove the logsheet from this device?',
    message: `The link and the patient list are removed from this device${v.unsaved ? `, along with ${plural(v.unsaved, 'change')} not saved to the logsheet yet` : ''}. The logsheet itself isn’t touched, and the rounds history stays.`,
    confirmLabel: 'Remove',
    destructive: true,
  });
  if (!ok) return;
  await forgetLogsheet();
  toast('Logsheet removed from this device.', { icon: 'trash' });
}

/* ---------- Rounds history ---------- */

async function renderHistory() {
  const [days, names] = [await loadHistory(), namesByKey()];
  if (showing !== 'history') return;
  const now = Date.now();
  setHTML(view, html`<div class="ward accent-neuro">
    ${subHead({ title: 'Rounds history', back: 'Ward Patients', fallback: 'ward', accent: 'neuro',
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
    }) : html`<div class="card empty">${icon('history')}<span>No rounds recorded on this device yet.</span></div>`}
  </div>`);
}

/* ---------- Actions ---------- */

registerAction('ward:setup', () => openSetup());
registerAction('ward:remove', () => removeLogsheet());
registerAction('ward:menu', () => openMenu());
registerAction('ward:refresh', () => refreshWard());
registerAction('ward:open', (el) => openPatient(el.dataset.id));
registerAction('ward:tick', (el) => {
  const p = findPatient(el.dataset.id);
  if (!p?.tickable) return;
  if (p.rounded) untick(p);
  else tick(p, true);
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
  await startRounds();
  toast('Rounds started. Open each patient as you see them to time the visit.', { icon: 'timer', duration: 5000 });
});
registerAction('ward:end', async () => {
  const v = wardView();
  if (v.roundedCount < v.total && !(await confirmDialog({ title: 'End rounds?', message: `${v.roundedCount} of ${v.total} patients are rounded.`, confirmLabel: 'End Rounds' }))) return;
  const session = await endRounds();
  if (session) toast(`Rounds ended · ${formatSpan(Date.parse(session.end) - Date.parse(session.start))}.`, { icon: 'checkCircle' });
});
registerAction('ward:conflict', (el) => openConflict(el.dataset.key));
registerAction('ward:rounds-here', async () => {
  const ok = await confirmDialog({
    title: 'Keep ticks on this device?',
    message: 'Ticks and rounds times will be saved in this device’s rounds history only, not in the logsheet. Recommendations still save to the logsheet. You can change this later from the ⋯ menu.',
    confirmLabel: 'Keep on this device',
  });
  if (ok) await setRoundsHere(true);
});
registerAction('ward:rounds-sheet', () => setRoundsHere(false));
registerAction('ward:copy', async (el) => {
  const item = wardView().orphans.find((i) => i.key === el.dataset.key);
  if (!item) return;
  try {
    await navigator.clipboard.writeText(item.set.C ?? item.set.D ?? '');
    toast('Copied. Paste it wherever it belongs.', { icon: 'copy' });
  } catch {
    toast('Couldn’t copy on this device.', { icon: 'info' });
  }
});
registerAction('ward:discard', async (el) => {
  const item = wardView().orphans.find((i) => i.key === el.dataset.key);
  if (!item) return;
  const ok = await confirmDialog({
    title: 'Discard this change?',
    message: EDITABLE[item.kind] ? `Your edited ${EDITABLE[item.kind].label} for ${item.name} will be deleted from this device.` : `The rounds tick for ${item.name} won’t be saved to the logsheet (it stays in the rounds history).`,
    confirmLabel: 'Discard',
    destructive: true,
  });
  if (ok) await dropChange(item.key);
});
registerAction('ward:history-delete', async () => {
  const ok = await confirmDialog({
    title: 'Delete rounds history?',
    message: 'This deletes every day’s rounds times and hospital numbers from this device, including today’s rounds in progress. The logsheet isn’t touched.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  await deleteHistory();
  toast('Rounds history deleted from this device.', { icon: 'trash' });
  if (showing === 'history') renderHistory();
});

/** Tapping a card anywhere (not on a button) opens the patient. */
export function handleCardClick(event) {
  if (showing !== 'ward') return;
  const card = event.target.closest('.pt[data-id]');
  if (!card || event.target.closest('button, a, input, textarea, select, [data-action]')) return;
  if (window.getSelection()?.toString()) return; // selecting text to copy
  openPatient(card.dataset.id);
}
