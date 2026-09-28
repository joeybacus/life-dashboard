/* Arrange rows: the patients in the logsheet's own order, to drag into a new
   one. Save moves the rows in the logsheet (whole rows, with every column);
   the list on screen stays sorted for rounds (P1 first), each group in the
   logsheet's order. Nothing moves if the logsheet changed meanwhile — you see
   its latest order instead. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { runAction } from '../../core/actions.js';
import { makeReorderable } from '../../core/reorder.js';
import { announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { wardList } from './engine.js';
import { LISTS_SCRIPT_VERSION, STRUCTURE_PROBLEMS } from './model.js';

/** What stops rows being moved right now: null, or { title, message, action: [label, action] }. */
function blocker(list) {
  if (!syncSnapshot().connected) return { title: 'Set up sync first', message: 'The app reaches your logsheet through your Google Sheets sync.', action: ['Set up sync', 'sync:setup'] };
  if (!list.link) return { title: 'Link a logsheet first', message: `Link a logsheet to “${list.name}” to arrange its rows.`, action: ['Link logsheet', 'ward:setup'] };
  if ((syncScriptVersion() ?? 0) < LISTS_SCRIPT_VERSION) {
    return { title: 'Update the sync script first', message: `Moving rows needs version ${LISTS_SCRIPT_VERSION} of the sync script in your Google Sheet (a 2-minute update).`, action: ['Show me how', 'sync:update'] };
  }
  if (list.cache?.canEdit === false) return { title: 'View only', message: STRUCTURE_PROBLEMS['read-only'] };
  if (list.cache?.truncated) return { title: 'Too many rows', message: STRUCTURE_PROBLEMS['too-many'] };
  return null;
}

const snapshot = (list) => (list.cache?.rows ?? []).map((r) => ({ row: r.row, name: r.name, hn: r.hn }));

function rowsList(rows, hnLabel) {
  return html`<ol class="card ward-arr" data-arr-list>${rows.map((r, i) => html`<li class="ward-arr__item" data-id="${r.row}">
    <span class="ward-arr__handle" data-drag-handle title="Drag to move" aria-hidden="true">${icon('grip')}</span>
    <span class="ward-arr__num" aria-hidden="true">${i + 1}</span>
    <span class="ward-arr__text"><span class="ward-arr__name">${r.name}</span><span class="ward-arr__hn">${r.hn ? `${hnLabel} ${r.hn}` : 'No hospital number'}</span></span>
    <button type="button" class="sr-only sr-only-focusable" data-arr-move="-1"${raw(i === 0 ? ' disabled' : '')}>Move ${r.name} up</button>
    <button type="button" class="sr-only sr-only-focusable" data-arr-move="1"${raw(i === rows.length - 1 ? ' disabled' : '')}>Move ${r.name} down</button>
  </li>`)}</ol>`;
}

export async function openArrange(listId) {
  const list = wardList(listId);
  if (!list) return;
  const blocked = blocker(list);
  if (blocked) {
    const go = await confirmDialog({ title: blocked.title, message: blocked.message, confirmLabel: blocked.action?.[0] ?? 'OK', cancelLabel: blocked.action ? 'Cancel' : 'Close' });
    if (go && blocked.action) {
      const el = document.createElement('span');
      el.dataset.list = listId;
      runAction(blocked.action[1], el);
    }
    return;
  }
  const hn = list.headings().hn === 'Hospital No.' ? 'HN' : list.headings().hn;

  await openDialog({
    variant: 'sheet',
    className: 'ward-arrange accent-neuro',
    dismissible: false,
    title: 'Arrange rows',
    body: html`<p class="dlg__msg">Drag ${icon('grip')} to put the patients in the order you want, then tap Save: their rows move in ${list.link.title ? `“${list.link.title}”` : 'your logsheet'} · ${list.link.tab}. On the list itself, patients stay sorted for rounds (P1 first), each group in this order.</p>
      <div data-arr-slot><p class="ward-arr__loading">${icon('refresh')}Getting the latest order…</p></div>
      <p class="form-error" data-arr-error hidden></p>
      <div class="form__actions ward-arr__actions">
        <button type="button" class="btn btn--ghost" data-arr-cancel>Cancel</button>
        <button type="button" class="btn btn--primary" data-arr-save disabled>Save order</button>
      </div>`,
    async onOpen(dlg, close) {
      const slot = dlg.querySelector('[data-arr-slot]');
      const error = dlg.querySelector('[data-arr-error]');
      const save = dlg.querySelector('[data-arr-save]');
      let expect = [];
      let order = [];   // row numbers, in the new order
      let busy = false;

      const changed = () => order.some((row, i) => row !== expect[i]?.row);
      const showError = (text) => {
        setHTML(error, html`${text}`);
        error.hidden = !text;
      };
      const draw = (focus = null) => {
        const byRow = new Map(expect.map((r) => [r.row, r]));
        setHTML(slot, expect.length > 1 ? rowsList(order.map((row) => byRow.get(row)), hn)
          : html`<p class="ward-arr__loading">${icon('info')}${expect.length ? 'Only one patient — nothing to arrange.' : 'No patients in the logsheet yet.'}</p>`);
        save.disabled = busy || !changed();
        const ol = slot.querySelector('[data-arr-list]');
        if (ol) {
          makeReorderable(ol, {
            canStart: () => !busy,
            scroller: dlg.querySelector('.dlg__panel'),
            onReorder: (ids, item) => {
              order = ids.map(Number);
              draw();
              announce(`Moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
            },
          });
        }
        if (focus) slot.querySelector(focus)?.focus();
      };
      const load = () => {
        const fresh = wardList(listId);
        expect = fresh ? snapshot(fresh) : [];
        order = expect.map((r) => r.row);
        draw();
      };

      dlg.addEventListener('click', async (event) => {
        const moveBtn = event.target.closest('[data-arr-move]');
        if (moveBtn && !busy) {
          const row = Number(moveBtn.closest('[data-id]').dataset.id);
          const dir = Number(moveBtn.dataset.arrMove);
          const from = order.indexOf(row);
          const to = from + dir;
          if (to < 0 || to >= order.length) return;
          order.splice(to, 0, order.splice(from, 1)[0]);
          announce(`Moved to position ${to + 1} of ${order.length}.`);
          draw(`[data-id="${row}"] [data-arr-move="${dir}"]`);
          return;
        }
        if (event.target.closest('[data-arr-cancel]')) {
          if (busy) return;
          if (changed() && !(await confirmDialog({ title: 'Discard the new order?', message: 'The rows in your logsheet stay as they are.', confirmLabel: 'Discard', cancelLabel: 'Keep arranging', destructive: true }))) return;
          close(null);
          return;
        }
        if (event.target.closest('[data-arr-save]') && !busy && changed()) {
          const current = wardList(listId);
          if (!current) return;
          busy = true;
          showError('');
          save.disabled = true;
          save.textContent = 'Saving…';
          const result = await current.moveRows(expect, order);
          busy = false;
          save.textContent = 'Save order';
          if (result.status === 'ok' || result.status === 'same') {
            close('saved');
            toast('Rows moved in your logsheet.', { icon: 'checkCircle' });
            return;
          }
          if (result.status === 'changed') load(); // show the logsheet's latest order
          else draw();
          showError(STRUCTURE_PROBLEMS[result.status] ?? current.error?.message ?? STRUCTURE_PROBLEMS.invalid);
        }
      });

      // Start from the latest order in the logsheet (fewer surprises when saving)
      await list.flush();
      if (!dlg.open) return;
      load();
      if (list.error) showError(`${list.error.message} This is the order from ${list.cache ? 'the last time the list loaded' : 'before'}.`);
    },
  });
}
