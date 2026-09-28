/* A list's columns (⋯ → Columns, or Columns on the list): rename headings
   (in the app only — the logsheet's row 1 stays as it is), add a column
   (a new one at the end of the logsheet, or one the logsheet already has),
   remove one (from the app only: the logsheet keeps it), and change their
   order. Adding and removing each ask first. */
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
import { FIXED_HEADINGS, LISTS_SCRIPT_VERSION, STRUCTURE_PROBLEMS, cleanName, colIndex, nextNewColumn, otherColumns } from './model.js';

const FIXED = [
  { id: 'rounded', what: 'Tick box', icon: 'checkCircle' },
  { id: 'name', what: 'Column A', col: 'A' },
  { id: 'hn', what: 'Column B', col: 'B' },
];

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
  return html`<p class="dlg__msg">How “${list.name}” shows ${where(list)}. Headings you change here are used in the app only — the logsheet’s own headings stay as they are.</p>
    <ul class="card ward-cols">${FIXED.map((f) => {
      const inSheet = sheetHeading(list, f.col, headings[f.id]);
      return html`<li class="ward-col is-fixed">
        <span class="ward-col__tag">${f.col ?? icon(f.icon)}</span>
        <span class="ward-col__text"><span class="ward-col__label">${headings[f.id]}</span>
          <span class="ward-col__sub">${f.what}${inSheet ? ` · “${inSheet}” in the logsheet` : ''}</span></span>
        <button type="button" class="btn btn--sm btn--ghost" data-col-rename="${f.id}" aria-label="Rename ${headings[f.id]}">${icon('edit')}Rename</button>
      </li>`;
    })}</ul>
    ${cols.length ? html`<ol class="card ward-cols" data-cols-list>${cols.map((c, i) => {
      const inSheet = sheetHeading(list, c.col, c.label);
      return html`<li class="ward-col" data-id="${c.id}">
        <span class="ward-col__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
        <span class="ward-col__tag">${c.col}</span>
        <span class="ward-col__text"><span class="ward-col__label">${c.label}</span>
          <span class="ward-col__sub">Column ${c.col}${inSheet ? ` · “${inSheet}” in the logsheet` : ''}${c.priority ? ' · sets P1–P3' : ''}${c.readable || c.loading ? '' : ' · needs a sync script update'}</span></span>
        <span class="ward-col__actions">
          <button type="button" class="btn btn--sm btn--ghost" data-col-rename="${c.id}" aria-label="Rename ${c.label}">${icon('edit')}<span class="ward-col__btn-text">Rename</span></button>
          <button type="button" class="btn btn--sm btn--ghost ward-col__remove" data-col-remove="${c.id}" aria-label="Remove ${c.label}">${icon('trash')}<span class="ward-col__btn-text">Remove</span></button>
        </span>
        <button type="button" class="sr-only sr-only-focusable" data-col-move="-1"${raw(i === 0 ? ' disabled' : '')}>Move ${c.label} up</button>
        <button type="button" class="sr-only sr-only-focusable" data-col-move="1"${raw(i === cols.length - 1 ? ' disabled' : '')}>Move ${c.label} down</button>
      </li>`;
    })}</ol>` : html`<p class="ward-cols__none">No other columns — only names and hospital numbers show.</p>`}
    <button type="button" class="btn btn--block ward-cols__add" data-col-add>${icon('plus')}Add column</button>
    <p class="ward-cols__foot">Rounded, ${headings.name} and ${headings.hn} are needed for rounds, so they can be renamed but not removed. Drag ${icon('grip')} to change the order of the others.</p>`;
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
  const letter = fixed ? FIXED.find((f) => f.id === id).col : col.col;
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
    message: `It’s removed from “${list.name}” in the app only. Column ${col.col} of your logsheet and everything in it stay exactly as they are, and you can add it back later.${col.priority ? ' Priorities (P1, P2, P3) are read from this column, so the list won’t be sorted by priority without it.' : ''}${waiting ? ` ${waiting === 1 ? 'An edit' : `${waiting} edits`} to it not saved yet will still be saved to the logsheet.` : ''}`,
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
    const letter = nextNewColumn(fresh.cache?.lastColumn);
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
  const letter = nextNewColumn(list.cache.lastColumn);
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

