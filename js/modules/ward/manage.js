/* Patient lists — making, renaming, ordering and deleting them (Neurology
   tab, a list's ⋯ menu and Settings → Neurology), and the small name box
   they share with renaming a column. */
import { html, setHTML } from '../../core/html.js';
import { registerAction, runAction } from '../../core/actions.js';
import { actionSheet, announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { openPage } from '../../core/router.js';
import { createList, deleteList, moveList, updateList, wardList, wardLists } from './engine.js';
import { MAX_NAME, cleanName } from './model.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Ask for a name (a list's, or a column heading). It closes only with its
 * buttons; for something new, Cancel asks before throwing away what you typed.
 * Resolves with the cleaned name, or null.
 */
export async function askName({ title, label = 'Name', value = '', placeholder = '', hint = '', confirmLabel = 'Save', isNew = false, taken = () => '' }) {
  const result = await openDialog({
    variant: 'alert',
    className: 'prompt-dialog ward-name',
    dismissible: false,
    title,
    body: html`<form class="prompt" data-name-form novalidate>
      <label class="field"><span class="field__label">${label}</span>
        <input class="input" name="text" value="${value}" maxlength="${MAX_NAME}" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done">
      </label>
      ${hint ? html`<p class="ward-name__hint">${hint}</p>` : ''}
      <p class="form-error" data-error hidden></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${confirmLabel}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-name-form]');
      const field = form.elements.text;
      const error = form.querySelector('[data-error]');
      setTimeout(() => {
        field.focus();
        field.select();
      }, 60);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (isNew && field.value.trim() && !(await confirmDialog({ title: 'Discard this name?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = cleanName(field.value);
        const problem = name ? taken(name) : 'Type a name first.';
        if (problem) {
          setHTML(error, html`${problem}`);
          error.hidden = false;
          field.focus();
          return;
        }
        close({ name });
      });
    },
  });
  return result && typeof result === 'object' ? result.name : null;
}

const sameName = (except) => (name) => (wardLists().some((l) => l.id !== except && l.name.toLowerCase() === name.toLowerCase())
  ? `You already have a list called “${name}”.` : '');

/** Make a new list and open it. */
export async function newList() {
  const name = await askName({
    title: 'New patient list',
    placeholder: 'For example: ICU or Referrals',
    hint: 'It gets its own logsheet (or a tab of one), columns and rounds.',
    confirmLabel: 'Create',
    isNew: true,
    taken: sameName(null),
  });
  if (!name) return;
  const id = await createList(name);
  toast(`“${name}” created. Link its logsheet to see its patients.`, { icon: 'stethoscope', duration: 5000 });
  openPage('neurology', `list/${id}`);
}

export async function renameList(id) {
  const list = wardList(id);
  if (!list) return;
  const name = await askName({ title: 'Rename list', value: list.name, confirmLabel: 'Rename', taken: sameName(id) });
  if (!name || name === list.name) return;
  await updateList(id, (def) => { def.name = name; });
  toast(`Renamed to “${name}”.`, { icon: 'edit' });
}

export async function removeList(id) {
  const list = wardList(id);
  if (!list) return;
  const v = list.view();
  const ok = await confirmDialog({
    title: `Delete “${list.name}”?`,
    message: `The list is deleted from the app on all your devices, with its patients and rounds history here${v.unsaved ? `, and ${plural(v.unsaved, 'change')} not saved to the logsheet yet` : ''}. The logsheet itself isn’t touched.`,
    confirmLabel: 'Delete list',
    destructive: true,
  });
  if (!ok) return;
  await deleteList(id);
  toast(`“${list.name}” deleted.`, { icon: 'trash' });
}

async function move(id, dir) {
  await moveList(id, dir);
  const ids = wardLists().map((l) => l.id);
  announce(`Moved to position ${ids.indexOf(id) + 1} of ${ids.length}.`);
}

/** The ⋯ button on a list's card (Neurology tab). */
export async function listMenu(id) {
  const list = wardList(id);
  if (!list) return;
  const all = wardLists();
  const at = all.indexOf(list);
  const choice = await actionSheet({
    title: list.name,
    items: [
      { label: 'Open', value: 'open', icon: 'chevronRight' },
      { label: 'Rename', value: 'rename', icon: 'edit' },
      at > 0 ? { label: 'Move up', value: 'up', icon: 'arrowUp' } : null,
      at < all.length - 1 ? { label: 'Move down', value: 'down', icon: 'arrowDown' } : null,
      { label: 'Delete list', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'open') openPage('neurology', `list/${id}`);
  else if (choice === 'rename') renameList(id);
  else if (choice === 'up') move(id, -1);
  else if (choice === 'down') move(id, 1);
  else if (choice === 'delete') removeList(id);
}

/** A list's row in Settings → Neurology: its logsheet on this device. */
async function listSettings(el) {
  const list = wardList(el.dataset.list);
  if (!list) return;
  const link = list.link;
  const choice = await actionSheet({
    title: list.name,
    message: link ? `${link.title || 'Logsheet'} · tab “${link.tab}”${link.test ? ' · practice logsheet' : ''}` : 'No logsheet linked on this device',
    items: [
      { label: 'Open list', value: 'open', icon: 'chevronRight' },
      { label: link ? 'Change logsheet' : 'Link logsheet', value: 'setup', icon: 'link' },
      link ? { label: 'Remove logsheet from this device', value: 'remove', icon: 'x', destructive: true } : null,
    ],
  });
  if (choice === 'open') openPage('neurology', `list/${list.id}`);
  else if (choice === 'setup' || choice === 'remove') runAction(`ward:${choice}`, el);
}

registerAction('ward:new-list', () => newList());
registerAction('ward:list-settings', (el) => listSettings(el));
registerAction('ward:list-menu', (el) => listMenu(el.dataset.list));
registerAction('ward:rename-list', (el) => renameList(el.dataset.list));
