/* A list's columns (⋯ → Columns, or Columns on the list): rename headings
   (in the app only — the logsheet's row 1 stays as it is), add a column
   (a new one at the end of the logsheet, or one the logsheet already has),
   remove one (from the app only: the logsheet keeps it), and change their
   order. Adding and removing each ask first. One column can say where
   patients are (Location): the list can then be arranged by it. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { uid } from '../../core/ids.js';
import { on } from '../../core/events.js';
import { runAction } from '../../core/actions.js';
import { makeReorderable } from '../../core/reorder.js';
import { announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { updateList, wardList } from './engine.js';
import { askName } from './manage.js';
import {
  FIXED_HEADINGS, LAYOUT_SCRIPT_VERSION, LISTS_SCRIPT_VERSION, MAX_COLS, STRUCTURE_PROBLEMS, cleanName, colIndex, colLetter,
  isDefaultLayout, layoutProblem, nextNewColumn, otherColumns, roundsCols,
} from './model.js';

const FIXED = [
  { id: 'rounded', icon: 'checkCircle' },
  { id: 'name' },
  { id: 'hn' },
];
/** Where a fixed column is in this list's logsheet. */
function fixedCol(list, id) {
  const L = list.layout();
  if (id === 'rounded') {
    const r = roundsCols(L);
    return { what: `Tick box · rounds in columns ${r[0]}–${r[2]}`, col: null };
  }
  return { what: `Column ${L[id]}`, col: L[id] };
}

const where = (list) => (list.link ? `“${list.link.title || 'your logsheet'}” · ${list.link.tab}` : 'your logsheet');
/** The logsheet's own heading for a column, when it differs from the app's. */
function sheetHeading(list, col, label) {
  const n = colIndex(col);
  const heading = n ? String(list.cache?.headings?.[n - 1] ?? '').trim() : '';
  return heading && heading !== label ? heading : '';
}

function columnsBody(list) {
  const headings = list.headings();
  const cols = list.columns();
  const hidden = list.hidden();
  const L = list.layout();
  return html`<p class="dlg__msg">How “${list.name}” shows ${where(list)}. Headings you change here are used in the app only — the logsheet’s own headings stay as they are.</p>
    <div class="card ward-cols__loc ward-cols__layout">
      <span class="ward-col__tag">${icon('sheet')}</span>
      <span class="ward-col__text"><span class="ward-col__label">Where things are</span>
        <span class="ward-col__sub">Name ${L.name} · Hospital No. ${L.hn} · rounds ${roundsCols(L)[0]}–${roundsCols(L)[2]}${isDefaultLayout(L) ? '' : ' · your own columns'}</span></span>
      <button type="button" class="btn btn--sm btn--ghost" data-col-layout>${icon('edit')}Change</button>
    </div>
    <ul class="card ward-cols">${FIXED.map((f) => {
      const { what, col } = fixedCol(list, f.id);
      const inSheet = sheetHeading(list, col, headings[f.id]);
      const off = hidden[f.id];
      const needed = (f.id === 'name' && hidden.hn) || (f.id === 'hn' && hidden.name); // one of them always shows
      return html`<li class="ward-col is-fixed${off ? ' is-hidden' : ''}">
        <span class="ward-col__tag">${col ?? icon(f.icon)}</span>
        <span class="ward-col__text"><span class="ward-col__label">${headings[f.id]}</span>
          <span class="ward-col__sub">${off ? 'Hidden in the app · ' : ''}${what}${inSheet ? ` · “${inSheet}” in the logsheet` : ''}</span></span>
        <span class="ward-col__actions">
          <button type="button" class="btn btn--sm btn--ghost" data-col-rename="${f.id}" aria-label="Rename ${headings[f.id]}">${icon('edit')}<span class="ward-col__btn-text">Rename</span></button>
          ${off ? html`<button type="button" class="btn btn--sm btn--ghost" data-col-show="${f.id}" aria-label="Show ${headings[f.id]}">${icon('plus')}<span class="ward-col__btn-text">Show</span></button>`
            : html`<button type="button" class="btn btn--sm btn--ghost ward-col__remove" data-col-hide="${f.id}" aria-label="Remove ${headings[f.id]}"${needed ? raw(' disabled title="Name or Hospital No. must show"') : ''}>${icon('trash')}<span class="ward-col__btn-text">Remove</span></button>`}
        </span>
      </li>`;
    })}</ul>
    ${cols.length ? html`<ol class="card ward-cols" data-cols-list>${cols.map((c, i) => {
      const inSheet = sheetHeading(list, c.col, c.label);
      return html`<li class="ward-col" data-id="${c.id}">
        <span class="ward-col__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
        <span class="ward-col__tag">${c.col}</span>
        <span class="ward-col__text"><span class="ward-col__label">${c.label}</span>
          <span class="ward-col__sub">Column ${c.col}${inSheet ? ` · “${inSheet}” in the logsheet` : ''}${c.priority ? ' · sets P1–P3' : ''}${c.location ? ' · location' : ''}${c.readable || c.loading ? '' : ' · needs a sync script update'}</span></span>
        <span class="ward-col__actions">
          <button type="button" class="btn btn--sm btn--ghost" data-col-rename="${c.id}" aria-label="Rename ${c.label}">${icon('edit')}<span class="ward-col__btn-text">Rename</span></button>
          <button type="button" class="btn btn--sm btn--ghost ward-col__remove" data-col-remove="${c.id}" aria-label="Remove ${c.label}">${icon('trash')}<span class="ward-col__btn-text">Remove</span></button>
        </span>
        <button type="button" class="sr-only sr-only-focusable" data-col-move="-1"${raw(i === 0 ? ' disabled' : '')}>Move ${c.label} up</button>
        <button type="button" class="sr-only sr-only-focusable" data-col-move="1"${raw(i === cols.length - 1 ? ' disabled' : '')}>Move ${c.label} down</button>
      </li>`;
    })}</ol>` : html`<p class="ward-cols__none">No other columns — only names and hospital numbers show.</p>`}
    <button type="button" class="btn btn--block ward-cols__add" data-col-add>${icon('plus')}Add column</button>
    ${locationRow(list)}
    <p class="ward-cols__foot">Removing ${headings.rounded}, ${headings.name} or ${headings.hn} hides it in the app only (one of ${headings.name} and ${headings.hn} always shows). Drag ${icon('grip')} to change the order of the other columns.</p>`;
}

/** The Columns sheet. */
export async function openColumns(listId) {
  if (!wardList(listId)) return;
  let stop = () => {};
  await openDialog({
    variant: 'sheet',
    className: 'ward-cols-sheet accent-neuro',
    title: 'Columns',
    body: html`<div data-cols-slot></div>`,
    actions: [{ label: 'Done', value: 'done', variant: 'primary' }],
    onOpen(dlg) {
      const slot = dlg.querySelector('[data-cols-slot]');
      const draw = (focus = null) => {
        const list = wardList(listId);
        if (!list || !dlg.open) return;
        setHTML(slot, columnsBody(list));
        const ol = slot.querySelector('[data-cols-list]');
        if (ol) {
          makeReorderable(ol, {
            scroller: dlg.querySelector('.dlg__panel'),
            onReorder: async (ids, item) => {
              await reorderColumns(listId, ids);
              announce(`Moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
            },
          });
        }
        if (focus) slot.querySelector(focus)?.focus();
      };
      draw();
      stop = on('ward', ({ list }) => { if (!list || list === listId) draw(); });
      dlg.addEventListener('click', async (event) => {
        const rename = event.target.closest('[data-col-rename]');
        if (rename) {
          await renameColumn(listId, rename.dataset.colRename);
          return;
        }
        const hide = event.target.closest('[data-col-hide]');
        if (hide) {
          await hideFixed(listId, hide.dataset.colHide);
          return;
        }
        const show = event.target.closest('[data-col-show]');
        if (show) {
          await updateList(listId, (def) => { def.hidden = { ...def.hidden, [show.dataset.colShow]: undefined }; });
          toast(`“${wardList(listId)?.headings()[show.dataset.colShow]}” shows again.`, { icon: 'check' });
          return;
        }
        if (event.target.closest('[data-col-layout]')) {
          await openLayout(listId);
          return;
        }
        const remove = event.target.closest('[data-col-remove]');
        if (remove) {
          await removeColumn(listId, remove.dataset.colRemove);
          return;
        }
        const moveBtn = event.target.closest('[data-col-move]');
        if (moveBtn) {
          const id = moveBtn.closest('[data-id]').dataset.id;
          const dir = Number(moveBtn.dataset.colMove);
          const ids = wardList(listId).def.columns.map((c) => c.id);
          const from = ids.indexOf(id);
          const to = from + dir;
          if (to < 0 || to >= ids.length) return;
          ids.splice(to, 0, ids.splice(from, 1)[0]);
          await reorderColumns(listId, ids);
          announce(`Moved to position ${to + 1} of ${ids.length}.`);
          draw(`[data-id="${CSS.escape(id)}"] [data-col-move="${dir}"]`);
          return;
        }
        if (event.target.closest('[data-col-add]')) await addColumn(listId);
        if (event.target.closest('[data-col-location]')) await setupLocation(listId);
      });
    },
  });
  stop();
}

async function reorderColumns(listId, ids) {
  await updateList(listId, (def) => {
    def.columns = ids.map((id) => def.columns.find((c) => c.id === id)).filter(Boolean);
  });
}

/** Rename a column's heading in the app (id: 'rounded', 'name', 'hn' or one of the list's columns). */
export async function renameColumn(listId, id) {
  const list = wardList(listId);
  if (!list) return;
  const fixed = id in FIXED_HEADINGS;
  const col = fixed ? null : list.def.columns.find((c) => c.id === id);
  if (!fixed && !col) return;
  const current = fixed ? list.headings()[id] : col.label;
  const letter = fixed ? fixedCol(list, id).col : col.col;
  const name = await askName({
    title: 'Rename column',
    label: 'Heading in the app',
    value: current,
    hint: letter ? `The logsheet’s own heading for column ${letter} isn’t changed.` : 'Only the app shows this heading.',
    confirmLabel: 'Rename',
  });
  if (!name || name === current) return;
  await updateList(listId, (def) => {
    if (fixed) def.headings = { ...def.headings, [id]: name === FIXED_HEADINGS[id] ? undefined : name };
    else def.columns = def.columns.map((c) => (c.id === id ? { ...c, label: name } : c));
  });
  toast(`Renamed to “${name}” in the app.`, { icon: 'edit' });
}

async function removeColumn(listId, id) {
  const list = wardList(listId);
  const col = list?.def.columns.find((c) => c.id === id);
  if (!col) return;
  const waiting = [...list.queue.values()].filter((item) => item.kind === col.col).length;
  const ok = await confirmDialog({
    title: `Remove “${col.label}”?`,
    message: `It’s removed from “${list.name}” in the app only. Column ${col.col} of your logsheet and everything in it stay exactly as they are, and you can add it back later.${col.priority ? ' Priorities (P1, P2, P3) are read from this column, so the list won’t be sorted by priority without it.' : ''}${col.location ? ' Locations are read from this column, so the list can’t be arranged by location without it.' : ''}${waiting ? ` ${waiting === 1 ? 'An edit' : `${waiting} edits`} to it not saved yet will still be saved to the logsheet.` : ''}`,
    confirmLabel: 'Remove column',
    destructive: true,
  });
  if (!ok) return;
  await updateList(listId, (def) => { def.columns = def.columns.filter((c) => c.id !== id); });
  toast(`“${col.label}” removed from the app. The logsheet still has column ${col.col}.`, { icon: 'trash', duration: 5000 });
}

/* ---------- Adding a column ---------- */

/** What stops a column being added right now: null, or { title, message, action }. */
function addBlocker(list) {
  if (!syncSnapshot().connected) return { title: 'Set up sync first', message: 'Columns come from your logsheet, which the app reaches through your Google Sheets sync.', action: ['Set up sync', 'sync:setup'] };
  if (!list.link) return { title: 'Link a logsheet first', message: `Columns come from the logsheet, so link one to “${list.name}” first.`, action: ['Link logsheet', 'ward:setup'] };
  if ((syncScriptVersion() ?? 0) < LISTS_SCRIPT_VERSION) {
    return { title: 'Update the sync script first', message: `Adding columns needs version ${LISTS_SCRIPT_VERSION} of the sync script in your Google Sheet (a 2-minute update).`, action: ['Show me how', 'sync:update'] };
  }
  if (!list.cache?.headings) return { title: 'Load the list first', message: 'Refresh the list once (you need to be online), then add the column.', action: ['Refresh now', 'ward:refresh'] };
  return null;
}

async function addColumn(listId) {
  const list = wardList(listId);
  if (!list) return;
  const blocked = addBlocker(list);
  if (blocked) {
    const go = await confirmDialog({ title: blocked.title, message: blocked.message, confirmLabel: blocked.action[0] });
    if (!go) return;
    const el = document.createElement('span');
    el.dataset.list = listId;
    runAction(blocked.action[1], el);
    return;
  }
  const choice = await addColumnForm(list);
  if (!choice) return;
  const fresh = wardList(listId);
  if (!fresh) return;

  if (choice.where === 'new') {
    const letter = nextNewColumn(fresh.cache?.lastColumn, fresh.layout());
    const ok = await confirmDialog({
      title: 'Add a new column?',
      message: `“${choice.heading}” will be added to ${where(fresh)} as a new column (${letter}, after all the others), with this heading in row 1. Everyone who shares the logsheet will see it.`,
      confirmLabel: 'Add column',
    });
    if (!ok) return;
    toast('Adding the column…', { icon: 'columns', duration: 10000 });
    const result = await fresh.addLogsheetColumn(choice.heading);
    if (result.status !== 'ok' || !result.column) {
      toast(`Not added: ${STRUCTURE_PROBLEMS[result.status] ?? STRUCTURE_PROBLEMS.invalid}`, { icon: 'info', duration: 8000 });
      return;
    }
    await updateList(listId, (def) => {
      if (!def.columns.some((c) => c.col === result.column)) def.columns = [...def.columns, { id: uid(), col: result.column, label: choice.heading }];
    });
    toast(`Column ${result.column} “${choice.heading}” added to your logsheet.`, { icon: 'checkCircle', duration: 5000 });
    return;
  }

  const inSheet = String(fresh.cache.headings[choice.index] ?? '').trim();
  const ok = await confirmDialog({
    title: `Add column ${choice.where}?`,
    message: `Column ${choice.where}${inSheet ? ` (“${inSheet}”)` : ''} of your logsheet will show in “${fresh.name}” as “${choice.heading}”. You can edit it here too; changes are saved to column ${choice.where}. The logsheet itself isn’t changed now.`,
    confirmLabel: 'Add column',
  });
  if (!ok) return;
  await updateList(listId, (def) => {
    // Recommendations (D) sets the priority again when it comes back and nothing else does
    if (def.columns.some((c) => c.col === choice.where)) return;
    const priority = choice.where === 'D' && !def.columns.some((c) => c.priority);
    def.columns = [...def.columns, { id: uid(), col: choice.where, label: choice.heading, ...(priority ? { priority: true } : {}) }];
  });
  toast(`“${choice.heading}” (column ${choice.where}) added.`, { icon: 'checkCircle' });
  fresh.refresh();
}

/** The Add a column form. Resolves { heading, where: 'new' | column letter, index } or null. */
async function addColumnForm(list) {
  const others = otherColumns(list.def, list.cache.headings, list.cache.headers?.state);
  const letter = nextNewColumn(list.cache.lastColumn, list.layout());
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-addcol accent-neuro',
    dismissible: false,
    title: 'Add a column',
    body: html`<form class="form" data-addcol novalidate>
      <label class="field"><span class="field__label">Heading</span>
        <input class="input" name="heading" maxlength="40" placeholder="For example: Diagnosis" autocomplete="off" enterkeyhint="done">
      </label>
      <fieldset class="ward-where">
        <legend class="field__label">Where it’s kept in your logsheet</legend>
        <label class="ward-where__opt"><input type="radio" name="where" value="new" checked>
          <span class="ward-where__text"><strong>A new column (${letter})</strong><small>Added after all the other columns, with this heading in row 1</small></span></label>
        ${others.map((o) => html`<label class="ward-where__opt"><input type="radio" name="where" value="${o.col}" data-heading="${o.heading}">
          <span class="ward-where__text"><strong>Column ${o.col}</strong><small>${o.heading ? `Already in the logsheet: “${o.heading}”` : 'Already in the logsheet (no heading)'}</small></span></label>`)}
      </fieldset>
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Next</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-addcol]');
      const field = form.elements.heading;
      const error = form.querySelector('[data-error]');
      let filled = ''; // a heading copied from the logsheet (replaced when you pick another column)
      setTimeout(() => field.focus(), 80);
      form.addEventListener('change', (event) => {
        if (event.target.name !== 'where') return;
        const heading = event.target.dataset.heading ?? '';
        if (!field.value.trim() || field.value === filled) {
          field.value = heading;
          filled = heading;
        }
      });
      form.addEventListener('input', () => { error.hidden = true; });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (field.value.trim() && field.value !== filled && !(await confirmDialog({ title: 'Discard this column?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const heading = cleanName(field.value);
        const chosen = form.elements.where.value || 'new';
        if (!heading) {
          setHTML(error, html`Type a heading for the column.`);
          error.hidden = false;
          field.focus();
          return;
        }
        close({ heading, where: chosen, index: chosen === 'new' ? -1 : colIndex(chosen) - 1 });
      });
    },
  });
  return result && typeof result === 'object' ? result : null;
}



/* ---------- Location ---------- */

function locationRow(list) {
  const col = list.def.columns.find((c) => c.location);
  return html`<div class="card ward-cols__loc">
    <span class="ward-col__tag">${icon('pin')}</span>
    <span class="ward-col__text"><span class="ward-col__label">Location</span>
      <span class="ward-col__sub">${col ? `From “${col.label}” (column ${col.col}) · arrange the list by it` : 'Choose the column that says where each patient is'}</span></span>
    <button type="button" class="btn btn--sm btn--ghost" data-col-location>${icon(col ? 'edit' : 'plus')}${col ? 'Change' : 'Choose'}</button>
  </div>`;
}

/**
 * Choose the column that says where patients are: one the list shows, one
 * the logsheet already has, or a new "Location" column. Adding a column asks
 * first, as in Add column. Resolves true once the list has a location column.
 */
export async function setupLocation(listId) {
  const list = wardList(listId);
  if (!list) return false;
  const blocked = addBlocker(list); // only stops columns the list doesn't show yet
  const shown = list.def.columns;
  if (blocked && !shown.length) {
    const go = await confirmDialog({ title: blocked.title, message: blocked.message, confirmLabel: blocked.action[0] });
    if (go) {
      const el = document.createElement('span');
      el.dataset.list = listId;
      runAction(blocked.action[1], el);
    }
    return false;
  }
  const choice = await locationForm(list, blocked);
  if (!choice) return false;
  const fresh = wardList(listId);
  if (!fresh) return false;
  const mark = (letter, extra) => updateList(listId, (def) => {
    if (extra && !def.columns.some((c) => c.col === letter)) def.columns = [...def.columns, extra];
    def.columns = def.columns.map(({ location, ...c }) => (c.col === letter ? { ...c, location: true } : c));
  });

  if (choice.where === 'none') {
    await updateList(listId, (def) => {
      def.columns = def.columns.map(({ location, ...c }) => c);
      def.arrange = undefined;
    });
    toast('The list no longer shows locations. The logsheet isn’t changed.', { icon: 'pin' });
    return false;
  }

  const existing = fresh.def.columns.find((c) => c.col === choice.where);
  if (existing) {
    await mark(existing.col);
    toast(`Locations come from “${existing.label}” (column ${existing.col}).`, { icon: 'pin' });
    return true;
  }

  if (choice.where === 'new') {
    const letter = nextNewColumn(fresh.cache?.lastColumn, fresh.layout());
    const ok = await confirmDialog({
      title: 'Add a Location column?',
      message: `“${choice.heading}” will be added to ${where(fresh)} as a new column (${letter}, after all the others), with this heading in row 1. Everyone who shares the logsheet will see it. You can then fill in each patient’s location from the app.`,
      confirmLabel: 'Add column',
    });
    if (!ok) return false;
    toast('Adding the column…', { icon: 'columns', duration: 10000 });
    const result = await fresh.addLogsheetColumn(choice.heading);
    if (result.status !== 'ok' || !result.column) {
      toast(`Not added: ${STRUCTURE_PROBLEMS[result.status] ?? STRUCTURE_PROBLEMS.invalid}`, { icon: 'info', duration: 8000 });
      return false;
    }
    await mark(result.column, { id: uid(), col: result.column, label: choice.heading });
    toast(`Column ${result.column} “${choice.heading}” added to your logsheet. Open a patient to set their location.`, { icon: 'checkCircle', duration: 6000 });
    return true;
  }

  const inSheet = String(fresh.cache?.headings?.[colIndex(choice.where) - 1] ?? '').trim();
  const ok = await confirmDialog({
    title: `Add column ${choice.where}?`,
    message: `Column ${choice.where}${inSheet ? ` (“${inSheet}”)` : ''} of your logsheet will show in “${fresh.name}” as “${choice.heading}”, and say where each patient is. Changes you make are saved to column ${choice.where}. The logsheet itself isn’t changed now.`,
    confirmLabel: 'Add column',
  });
  if (!ok) return false;
  await mark(choice.where, { id: uid(), col: choice.where, label: choice.heading });
  toast(`Locations come from “${choice.heading}” (column ${choice.where}).`, { icon: 'pin' });
  fresh.refresh();
  return true;
}

/** The "Where patients are" form. Resolves { where: 'new' | 'none' | column letter, heading } or null. */
async function locationForm(list, blocked) {
  const current = list.def.columns.find((c) => c.location);
  const shown = list.def.columns.filter((c) => !c.priority || c.location);
  const others = blocked ? [] : otherColumns(list.def, list.cache.headings, list.cache.headers?.state);
  const letter = blocked ? '' : nextNewColumn(list.cache.lastColumn, list.layout());
  const option = (value, title, sub, { checked = false, heading = '' } = {}) => html`<label class="ward-where__opt"><input type="radio" name="where" value="${value}" data-heading="${heading}"${raw(checked ? ' checked' : '')}>
    <span class="ward-where__text"><strong>${title}</strong><small>${sub}</small></span></label>`;
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-addcol accent-neuro',
    dismissible: false,
    title: 'Where patients are',
    body: html`<form class="form" data-locform novalidate>
      <p class="dlg__msg">Choose the column of ${where(list)} that says where each patient is — a ward, unit or bed. The list can then be arranged by location.</p>
      <fieldset class="ward-where">
        <legend class="field__label">Locations come from</legend>
        ${blocked ? '' : option('new', `A new column (${letter})`, 'Added after all the other columns, with its heading in row 1', { checked: !current, heading: 'Location' })}
        ${shown.map((c) => option(c.col, `${c.label} (column ${c.col})`, c.location ? 'Used for location now' : 'Already in this list', { checked: c.location, heading: c.label }))}
        ${others.map((o) => option(o.col, `Column ${o.col}`, o.heading ? `In the logsheet: “${o.heading}”` : 'In the logsheet (no heading)', { heading: o.heading || 'Location' }))}
        ${current ? option('none', 'Don’t show locations', 'The column stays in the list and the logsheet') : ''}
      </fieldset>
      <label class="field" data-heading-field${raw(current || blocked ? ' hidden' : '')}><span class="field__label">Heading</span>
        <input class="input" name="heading" maxlength="40" value="Location" autocomplete="off" enterkeyhint="done">
      </label>
      ${blocked ? html`<p class="note">${icon('info')}<span>${blocked.message} Until then, you can use a column this list already shows.</span></p>` : ''}
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Next</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-locform]');
      const field = form.elements.heading;
      const headingField = form.querySelector('[data-heading-field]');
      const error = form.querySelector('[data-error]');
      // A heading is asked for only for a column the list doesn't show yet
      form.addEventListener('change', (event) => {
        if (event.target.name !== 'where') return;
        const value = event.target.value;
        const isNew = value !== 'none' && !list.def.columns.some((c) => c.col === value);
        headingField.hidden = !isNew;
        if (isNew) field.value = event.target.dataset.heading || 'Location';
        error.hidden = true;
      });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        const offered = form.querySelector('input[name="where"]:checked')?.dataset.heading || 'Location';
        const typed = !headingField.hidden && field.value.trim() && field.value !== offered;
        if (typed && !(await confirmDialog({ title: 'Discard this heading?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const chosen = form.querySelector('input[name="where"]:checked')?.value ?? '';
        if (!chosen) {
          setHTML(error, html`Choose where locations come from.`);
          error.hidden = false;
          return;
        }
        const heading = cleanName(field.value);
        if (!headingField.hidden && !heading) {
          setHTML(error, html`Type a heading for the column.`);
          error.hidden = false;
          field.focus();
          return;
        }
        close({ where: chosen, heading });
      });
    },
  });
  return result && typeof result === 'object' ? result : null;
}


/* ---------- Hiding Rounded, Name or Hospital No. (in the app only) ---------- */

async function hideFixed(listId, id) {
  const list = wardList(listId);
  if (!list || !(id in FIXED_HEADINGS)) return;
  const heading = list.headings()[id];
  const r = roundsCols(list.layout());
  const message = {
    rounded: `The tick box, Start / End Rounds and the rounds count are hidden on “${list.name}”, and nothing is written to columns ${r[0]}–${r[2]} any more. The logsheet keeps those columns and everything in them.`,
    name: `Names are hidden on “${list.name}”: patients show by ${list.headings().hn}. Column ${list.layout().name} of the logsheet isn’t changed.`,
    hn: `${heading} is hidden on “${list.name}”. The app still uses it to find each patient’s row, and column ${list.layout().hn} of the logsheet isn’t changed.`,
  }[id];
  const ok = await confirmDialog({ title: `Remove “${heading}”?`, message: `${message} You can show it again here any time.`, confirmLabel: 'Remove', destructive: true });
  if (!ok) return;
  await updateList(listId, (def) => { def.hidden = { ...def.hidden, [id]: true }; });
  toast(`“${heading}” removed from the app. The logsheet isn’t changed.`, { icon: 'trash' });
}

/* ---------- Where things are in the logsheet ---------- */

/**
 * Choose the columns of the logsheet that hold the name, the hospital number
 * and the rounds (three in a row), and the one priorities come from. Needs
 * sync script 8 when they aren't the usual A, B and E–G.
 */
export async function openLayout(listId) {
  const list = wardList(listId);
  if (!list) return;
  const L = list.layout();
  const headings = list.cache?.headings ?? [];
  const width = Math.min(MAX_COLS, Math.max(12, headings.length + 3));
  const letters = Array.from({ length: width }, (_, i) => colLetter(i + 1));
  const label = (col) => {
    const h = String(headings[colIndex(col) - 1] ?? '').trim();
    return h ? `${col} · “${h}”` : col;
  };
  const priority = list.def.columns.find((c) => c.priority)?.col ?? '';
  const select = (name, value, options) => html`<select class="input" name="${name}">${options.map(([v, text]) => html`<option value="${v}"${raw(v === value ? ' selected' : '')}>${text}</option>`)}</select>`;
  const outdated = (syncScriptVersion() ?? 0) < LAYOUT_SCRIPT_VERSION;
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-addcol ward-layout accent-neuro',
    dismissible: false,
    title: 'Where things are',
    body: html`<form class="form" data-layout novalidate>
      <p class="dlg__msg">Which columns of ${where(list)} hold each patient’s name, hospital number and rounds. The app never writes to the name or hospital number columns, or to any column it doesn’t show.</p>
      <label class="field"><span class="field__label">Name</span>${select('name', L.name, letters.map((c) => [c, label(c)]))}</label>
      <label class="field"><span class="field__label">Hospital number</span>${select('hn', L.hn, letters.map((c) => [c, label(c)]))}</label>
      <label class="field"><span class="field__label">Rounds (Rounded, Rounds Start, Rounds End — three columns in a row)</span>
        ${select('rounds', L.rounds, letters.slice(0, width - 2).map((c, i) => [c, `${c}, ${letters[i + 1]}, ${letters[i + 2]}${headings[i] ? ` · from “${String(headings[i]).trim()}”` : ''}`]))}</label>
      <label class="field"><span class="field__label">Priorities (P1, P2, P3) are read from</span>
        ${select('priority', priority, [['', 'No column (don’t sort by priority)'], ...letters.map((c) => [c, label(c)])])}</label>
      ${outdated ? html`<p class="note">${icon('sparkles')}<span>Columns other than A, B and E–G need version ${LAYOUT_SCRIPT_VERSION} of the sync script. Until it’s updated, the list waits instead of reading the wrong columns.</span></p>` : ''}
      <p class="form-error" data-error hidden></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Next</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-layout]');
      const error = form.querySelector('[data-error]');
      const values = () => ({ name: form.elements.name.value, hn: form.elements.hn.value, rounds: form.elements.rounds.value, priority: form.elements.priority.value });
      const start = JSON.stringify(values());
      form.addEventListener('change', () => { error.hidden = true; });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (JSON.stringify(values()) !== start && !(await confirmDialog({ title: 'Discard these changes?', message: 'The columns stay as they were.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const v = values();
        const r = roundsCols(v);
        const problem = layoutProblem(v) || ([v.name, v.hn, ...r].includes(v.priority) ? 'Priorities can’t come from the name, hospital number or rounds columns.' : '');
        if (problem) {
          setHTML(error, html`${problem}`);
          error.hidden = false;
          return;
        }
        close(v);
      });
    },
  });
  if (!result || typeof result !== 'object') return;
  const fresh = wardList(listId);
  if (!fresh) return;
  const next = { name: result.name, hn: result.hn, rounds: result.rounds };
  const r = roundsCols(next);
  const taken = new Set([next.name, next.hn, ...r]);
  const dropped = fresh.def.columns.filter((c) => taken.has(c.col));
  const ok = await confirmDialog({
    title: 'Use these columns?',
    message: `Names from ${next.name}, hospital numbers from ${next.hn}, rounds in ${r[0]}–${r[2]}${result.priority ? `, priorities from ${result.priority}` : ''}.${dropped.length ? ` ${dropped.map((c) => `“${c.label}” (${c.col})`).join(', ')} ${dropped.length === 1 ? 'is' : 'are'} now one of these, so ${dropped.length === 1 ? 'it leaves' : 'they leave'} the list’s own columns.` : ''} The logsheet isn’t changed now; if columns ${r[0]}–${r[2]} have no headings yet, the app adds “Rounded”, “Rounds Start” and “Rounds End” the next time it loads.`,
    confirmLabel: 'Use these columns',
  });
  if (!ok) return;
  const sheetHead = (col) => String(fresh.cache?.headings?.[colIndex(col) - 1] ?? '').trim();
  const defaults = { labs: 'Labs', recs: 'Recommendations' };
  await updateList(listId, (def) => {
    def.layout = isDefaultLayout(next) ? undefined : next;
    def.columns = def.columns
      .filter((c) => !taken.has(c.col))
      // The columns the list started with take the logsheet's heading when they still have the app's
      .map(({ priority: _p, ...c }) => (defaults[c.id] === c.label && sheetHead(c.col) ? { ...c, label: cleanName(sheetHead(c.col)) } : c));
    if (result.priority) {
      if (!def.columns.some((c) => c.col === result.priority)) def.columns.push({ id: uid(), col: result.priority, label: cleanName(sheetHead(result.priority)) || 'Recommendations' });
      def.columns = def.columns.map((c) => (c.col === result.priority ? { ...c, priority: true } : c));
    }
  });
  toast('Columns updated. Reloading the list…', { icon: 'sheet' });
  wardList(listId)?.refresh();
}
