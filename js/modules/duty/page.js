/* Duty Patients (#/neurology/duty): your patients on duty, read from a Google
   Sheet you link (see ward/engine.js dutyList — read only, nothing is written
   back). Each patient shows, in rows:

     1. name · age / gender · hospital number · date and time of arrival
     2. laboratory results
     3. (on their page) imaging in three columns: CT plain, CT with contrast,
        and chest X-ray (coming in a future update) — the CT viewer, reading
        the CT_Downloads folder on this computer (ct/viewer.js)

   Which column holds what is up to you (⋯ → Sheet columns). A patient's page
   opens full screen in a dialog, so hospital numbers never reach the address
   bar or browser history. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction, runAction } from '../../core/actions.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { actionSheet, announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { DUTY_ID, DUTY_ROLES, censusColumns, dutyList, updateList } from '../ward/engine.js';
import { CENSUS_SCRIPT_VERSION, LOAD_PROBLEMS, colIndex, colLetter, wardStamp } from '../ward/model.js';
import { openSetup, removeLogsheet } from '../ward/page.js';
import { ctClosed, ctSlot, keepCt, mountCt } from '../ct/viewer.js';

const AUTO_REFRESH_MS = 3 * 60 * 1000;
const FRESH_MS = 15_000;

let view = null;
let showing = false;
let refreshTimer = null;
let renderQueued = false;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** role → column letter ('' when it isn't in the sheet). */
function roleCols(list) {
  const read = new Set(list?.cache?.cols ?? []);
  return Object.fromEntries((list?.def.columns ?? []).filter((c) => c.role).map((c) => [c.role, read.size && !read.has(c.col) ? '' : c.col]));
}

/** The patients as the page shows them. */
export function dutyPatients() {
  const list = dutyList();
  if (!list?.cache) return [];
  const cols = roleCols(list);
  const cell = (p, role) => (cols[role] ? String(p.cells[cols[role]] ?? '').trim() : '');
  return list.view().patients.filter((p) => p.name || p.hn).map((p) => ({
    id: p.id,
    name: p.name || 'No name',
    hn: p.hn,
    age: [cell(p, 'age'), cell(p, 'sex')].filter(Boolean).join(' / '),
    arrival: cell(p, 'arrival'),
    labs: cell(p, 'labs'),
  }));
}

/** "6 patients" for the Neurology tab. */
export function dutySummary() {
  const list = dutyList();
  if (!list?.link) return { linked: false, loaded: false, total: 0 };
  return { linked: true, loaded: Boolean(list.cache), total: dutyPatients().length };
}

/* ---------- The page ---------- */

export const dutyPage = {
  show(el) {
    view = el;
    showing = true;
    render();
    const list = dutyList();
    if (list?.link && !(Date.now() - Date.parse(list.cache?.fetchedAt ?? '') < FRESH_MS)) list.refresh();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && showing) dutyList()?.refresh();
    }, AUTO_REFRESH_MS);
  },
  hide() {
    showing = false;
    clearInterval(refreshTimer);
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
on('sync', renderSoon);
on('ward', ({ list }) => { if (!list || list === DUTY_ID) renderSoon(); });

function render() {
  if (!view || !showing) return;
  const focused = view.contains(document.activeElement) ? document.activeElement.closest('[data-focus]')?.dataset.focus : null;
  const list = dutyList();
  const v = list?.view();
  const patients = dutyPatients();
  const actions = html`<button type="button" class="icon-btn" data-action="duty:menu" aria-label="Duty sheet options" data-focus="menu">${icon('more')}</button>`;
  setHTML(view, html`<div class="ward duty accent-neuro">
    ${subHead({ title: 'Duty Patients', back: 'Neurology', fallback: '', accent: 'neuro', actions, eyebrow: v?.link ? `${v.link.title || 'Duty sheet'} · ${v.link.tab}` : 'Neurology service' })}
    ${v?.link ? status(list, v) : linkCard()}
    ${patients.length ? html`<div class="duty__list">${patients.map(card)}</div>`
      : v?.link && v.cache ? html`<div class="card empty">${icon('user')}<span>No patients in “${v.link.tab}” yet — they’re read from row 2, with names in column ${list.layout().name}. Check the columns (⋯ → Sheet columns).</span></div>` : ''}
  </div>`);
  if (focused) view.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function linkCard() {
  const s = syncSnapshot();
  const outdated = s.connected && (syncScriptVersion() ?? 0) < CENSUS_SCRIPT_VERSION;
  return html`<section class="card ward-intro refs-intro">
    <span class="ward-intro__icon">${icon('link')}</span>
    <h2 class="ward-intro__title">Link your duty sheet</h2>
    <p class="ward-intro__text">Your patients on duty, straight from a Google Sheet: age and gender, hospital number, arrival, and laboratory results — with their CT scans underneath. The app only reads the sheet.</p>
    ${!s.connected ? html`<p class="note">${icon('cloud')}<span>${LOAD_PROBLEMS['not-connected']}</span></p>
        <button type="button" class="btn btn--accent btn--block" data-action="sync:setup">Set up sync</button>`
      : html`${outdated ? html`<p class="note">${icon('sparkles')}<span>Duty Patients needs version ${CENSUS_SCRIPT_VERSION} of your sync script (a 2-minute update).</span></p>
          <button type="button" class="btn btn--block" data-action="sync:update">Update the sync script</button>` : ''}
        <button type="button" class="btn btn--accent btn--block" data-action="duty:link">${icon('link')}Link duty sheet</button>`}
  </section>`;
}

function status(list, v) {
  const out = [];
  const code = v.error?.code;
  const banner = (tone, iconName, title, text, acts = '') => html`<div class="banner ward-banner accent-${tone}" role="status">
    <span class="banner__icon">${icon(iconName)}</span>
    <div class="banner__text"><p class="banner__title">${title}</p>${text ? html`<p class="banner__sub">${text}</p>` : ''}</div>
    ${acts ? html`<div class="banner__actions">${acts}</div>` : ''}
  </div>`;
  if (!v.online || code === 'offline' || code === 'network') {
    out.push(banner('neutral', 'wifi', `Offline — ${v.cache ? `last updated at ${wardStamp(v.cache.fetchedAt)}` : 'nothing loaded yet'}`, ''));
  } else if (code === 'script-outdated') {
    out.push(banner('neuro', 'sparkles', 'Update your sync script', `Duty Patients needs version ${CENSUS_SCRIPT_VERSION}.`, html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:update">Show me how</button>`));
  } else if (code === 'not-connected') {
    out.push(banner('neuro', 'cloud', 'Sync is off on this device', LOAD_PROBLEMS['not-connected'], html`<button type="button" class="btn btn--sm btn--primary" data-action="sync:setup">Set up sync</button>`));
  } else if (v.error) {
    out.push(banner('danger', 'info', 'Couldn’t load the duty sheet', html`${v.error.message}${v.error.detail ? html`<br><span class="refs-error-detail">Google said: “${v.error.detail}”</span>` : ''}`, html`<button type="button" class="btn btn--sm" data-action="duty:refresh">Try again</button>`));
  }
  if (!list.def.mapped) {
    const L = list.layout();
    const cols = roleCols(list);
    const named = [[L.name, 'Name'], [L.hn, 'Hospital No.'], ...DUTY_ROLES.filter((r) => cols[r.role]).map((r) => [cols[r.role], r.label])]
      .sort((a, b) => colIndex(a[0]) - colIndex(b[0])).map(([c, l]) => `${c} ${l}`).join(', ');
    out.push(banner('neuro', 'columns', 'Check the sheet columns', `The app is using ${named}.`, html`<button type="button" class="btn btn--sm btn--primary" data-action="duty:columns">Check columns</button>`));
  }
  if (v.duplicates.length) out.push(banner('workout', 'info', 'Repeated hospital numbers', `More than one row has ${v.duplicates.join(', ')}.`));
  const loading = v.phase === 'loading';
  out.push(html`<div class="ward-status">
    <p class="ward-status__text" aria-live="polite">${loading ? 'Updating…' : v.cache ? `${plural(dutyPatients().length, 'patient')} · last updated ${wardStamp(v.cache.fetchedAt)}` : ''}</p>
    <button type="button" class="btn btn--sm btn--ghost ward-status__btn${loading ? ' is-busy' : ''}" data-action="duty:refresh" data-focus="refresh"${loading ? raw(' disabled') : ''}>${icon('refresh')}Refresh</button>
  </div>`);
  return out;
}

/** Row 1: who they are and when they arrived. */
function infoRow(p) {
  return html`<dl class="duty-info">
    <div class="duty-info__item"><dt>Age / Gender</dt><dd>${p.age || '—'}</dd></div>
    <div class="duty-info__item"><dt>Hospital No.</dt><dd>${p.hn || '—'}</dd></div>
    <div class="duty-info__item"><dt>Arrival</dt><dd>${p.arrival || '—'}</dd></div>
  </dl>`;
}

/** Row 2: laboratory results. */
function labsRow(p, { full = false } = {}) {
  return html`<section class="duty-labs${full ? ' duty-labs--full' : ''}">
    <h3 class="duty-labs__title">${icon('clipboard')}Laboratory results</h3>
    ${p.labs ? html`<p class="duty-labs__text">${p.labs}</p>` : html`<p class="faint">No results in the sheet yet.</p>`}
  </section>`;
}

export function card(p) {
  return html`<article class="card duty-card">
    <button type="button" class="duty-card__open" data-action="duty:open" data-id="${p.id}" data-focus="open-${p.id}">
      <span class="duty-card__name">${p.name}</span>
      <span class="duty-card__go">${icon('image')}CT scans ${icon('chevronRight')}</span>
    </button>
    ${infoRow(p)}
    ${labsRow(p)}
  </article>`;
}

/* ---------- A patient's page (full screen) ---------- */

export function detailBody(p, all) {
  const at = all.findIndex((x) => x.id === p.id);
  const prev = all[at - 1];
  const next = all[at + 1];
  return html`<header class="ptb__bar">
      <div class="ptb__who">
        <h2 class="ptb__name" id="duty-title">${p.name}</h2>
        <p class="ptd__meta">Patient ${at + 1} of ${all.length}</p>
      </div>
      <div class="ptb__acts">
        <button type="button" class="btn btn--sm" data-duty-go="${prev?.id ?? ''}"${prev ? '' : raw(' disabled')} aria-label="Previous patient">${icon('chevronLeft')}</button>
        <button type="button" class="btn btn--sm" data-duty-go="${next?.id ?? ''}"${next ? '' : raw(' disabled')} aria-label="Next patient">${icon('chevronRight')}</button>
        <button type="button" class="btn btn--sm" data-dialog-value="close" autofocus>${icon('x')}Close</button>
      </div>
    </header>
    <div class="ptb__main duty-page">
      ${infoRow(p)}
      ${labsRow(p, { full: true })}
      ${p.hn ? ctSlot() : html`<p class="faint">No hospital number, so their scans can’t be found.</p>`}
      <button type="button" class="btn btn--block ptb__close" data-dialog-value="close">Close</button>
    </div>`;
}

async function openPatient(openId) {
  let id = openId;
  if (!dutyPatients().some((p) => p.id === id)) return;
  let dialog = null;
  const redraw = () => {
    const body = dialog?.querySelector('.dlg__body');
    if (!body || !dialog.open) return;
    const all = dutyPatients();
    const p = all.find((x) => x.id === id);
    if (!p) return; // gone from the sheet: keep what's on screen
    keepCt(body);
    setHTML(body, detailBody(p, all));
    mountCt(body, { hn: p.hn, mode: 'duty' });
  };
  const go = (nextId) => {
    const next = dutyPatients().find((x) => x.id === nextId);
    if (!next) return;
    id = nextId;
    redraw();
    dialog.querySelector('.dlg__panel')?.scrollTo?.({ top: 0 });
    announce(next.name);
  };
  const onKey = (event) => {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (!dialog?.open || [...document.querySelectorAll('dialog[open]')].pop() !== dialog) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const all = dutyPatients();
    const target = all[all.findIndex((x) => x.id === id) + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (!target) return;
    event.preventDefault();
    go(target.id);
  };
  document.addEventListener('keydown', onKey);
  const stop = on('ward', ({ list }) => { if (!list || list === DUTY_ID) redraw(); });
  const all = dutyPatients();
  await openDialog({
    variant: 'full',
    className: 'ward-detail duty-detail accent-neuro',
    body: detailBody(all.find((x) => x.id === id), all),
    onOpen(dlg) {
      dialog = dlg;
      dlg.setAttribute('aria-labelledby', 'duty-title');
      const p = dutyPatients().find((x) => x.id === id);
      mountCt(dlg.querySelector('.dlg__body'), { hn: p?.hn, mode: 'duty' });
      dlg.addEventListener('click', (event) => {
        const b = event.target.closest('[data-duty-go]');
        if (b?.dataset.dutyGo) go(b.dataset.dutyGo);
      });
    },
  });
  stop();
  ctClosed();
  document.removeEventListener('keydown', onKey);
}

/* ---------- The sheet: columns, link, menu ---------- */

async function openColumns() {
  const list = dutyList();
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
    ...DUTY_ROLES.map((r) => ({ ...r, col: list.def.mapped || current[r.role] ? current[r.role] ?? '' : r.col })),
  ];
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-addcol refs-cols accent-neuro',
    dismissible: false,
    title: 'Sheet columns',
    body: html`<form class="form" data-duty-cols novalidate>
      <p class="dlg__msg">Which column of ${list.link ? `“${list.link.title || 'your duty sheet'}” · ${list.link.tab}` : 'your duty sheet'} holds each thing. Patients are read from row 2. The app only reads the sheet.</p>
      ${rows.map((r) => html`<label class="field refs-cols__row"><span class="field__label">${r.label}${r.role === 'sex' ? html` <small class="faint">(if it has its own column)</small>` : ''}</span>
        <select class="input" name="${r.role}">
          ${r.required ? '' : html`<option value=""${raw(r.col ? '' : ' selected')}>Not in the sheet</option>`}
          ${letters.map((c) => html`<option value="${c}"${raw(c === r.col ? ' selected' : '')}>${label(c)}</option>`)}
        </select></label>`)}
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save columns</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-duty-cols]');
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
  await updateList(DUTY_ID, (def) => {
    def.layout = { name: result.name, hn: result.hn, rounds: '' };
    def.columns = censusColumns(DUTY_ROLES.map((r) => ({ ...r, col: result[r.role] })));
    def.mapped = true;
  });
  toast('Sheet columns saved. Reloading…', { icon: 'columns' });
  dutyList()?.refresh();
}

async function linkSheet() {
  if ((syncScriptVersion() ?? 0) < CENSUS_SCRIPT_VERSION && syncSnapshot().connected) {
    if (await confirmDialog({ title: 'Update the sync script first', message: `Duty Patients needs version ${CENSUS_SCRIPT_VERSION} of your sync script (a 2-minute update).`, confirmLabel: 'Show me how' })) runAction('sync:update');
    return;
  }
  const had = Boolean(dutyList()?.link);
  await openSetup(DUTY_ID);
  // Once linked the first time: check the columns
  for (let i = 0; i < 20 && !had && !dutyList()?.link; i++) await new Promise((r) => setTimeout(r, 150));
  if (!had && dutyList()?.link && !dutyList().def.mapped) openColumns();
}

async function openMenu() {
  const list = dutyList();
  const link = list?.link;
  const choice = await actionSheet({
    title: 'Duty sheet',
    message: link ? `${link.title || 'Duty sheet'} · tab “${link.tab}”` : 'Not linked on this device',
    items: [
      link ? { label: 'Refresh now', value: 'refresh', icon: 'refresh' } : null,
      { label: 'Sheet columns', value: 'columns', icon: 'columns', detail: 'Which column holds what' },
      link ? { label: 'Open in Google Sheets', value: 'open', icon: 'external' } : null,
      { label: link ? 'Change duty sheet' : 'Link duty sheet', value: 'link', icon: 'link' },
      link ? { label: 'Remove link from this device', value: 'remove', icon: 'x' } : null,
    ],
  });
  if (choice === 'refresh') list.refresh();
  else if (choice === 'columns') openColumns();
  else if (choice === 'open') window.open(link.url, '_blank', 'noopener');
  else if (choice === 'link') linkSheet();
  else if (choice === 'remove') removeLogsheet(DUTY_ID);
}

registerAction('duty:open', (el) => openPatient(el.dataset.id));
registerAction('duty:link', () => linkSheet());
registerAction('duty:menu', () => openMenu());
registerAction('duty:columns', () => openColumns());
registerAction('duty:refresh', () => dutyList()?.refresh());
