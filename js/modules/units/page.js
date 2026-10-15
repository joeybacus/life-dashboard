/* NCCU/ACSU (#/neurology/units): a box per bed — 6 in NCCU (one row on a
   Mac), 8 in ACSU (two rows of 4) — with the patient's name and your to-dos
   for the duty, under the subcategories you choose (store.js). */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { actionSheet, confirmDialog, openDialog, toast } from '../../core/ui.js';
import {
  MAX_CAT, MAX_CATS, MAX_NAME, MAX_TODO, UNITS, addTodo, bed, cats, clearAllTicked, clearBed, clearTicked, deleteTodo,
  editTodo, restoreBed, saveCats, setName, toggleTodo,
} from './store.js';

let view = null;
let showing = false;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const bedLabel = (unit, n) => `${UNITS.find((u) => u.id === unit)?.name ?? ''} Bed ${n}`;

export const unitsPage = {
  show(el) {
    view = el;
    showing = true;
    render();
  },
  hide() {
    showing = false;
  },
};

on('units', () => { if (showing) render(); });

/* ---------- The page ---------- */

function todoItem(t) {
  return html`<li class="utodo${t.done ? ' is-done' : ''}">
    <button type="button" class="utodo__tick" role="checkbox" aria-checked="${t.done ? 'true' : 'false'}" aria-label="${t.text}" data-uact="tick" data-todo="${t.id}" data-focus="tick-${t.id}"><span class="pt__box">${icon('check')}</span></button>
    <button type="button" class="utodo__text" data-uact="todo" data-todo="${t.id}" data-focus="todo-${t.id}">${t.text}</button>
  </li>`;
}

function bedBox(unit, n) {
  const b = bed(unit, n);
  const all = cats();
  const known = new Set(all.map((c) => c.id));
  const left = b.todos.filter((t) => !t.done).length;
  return html`<article class="ubed${b.name ? '' : ' is-empty'}" data-unit="${unit}" data-bed="${n}" aria-label="${bedLabel(unit, n)}${b.name ? `: ${b.name}` : ', empty'}">
    <header class="ubed__head">
      <button type="button" class="ubed__name" data-uact="name" data-focus="name-${unit}-${n}">
        <span class="ubed__bed">Bed ${n}${left ? html`<span class="ubed__left">${left} left</span>` : ''}</span>
        <span class="ubed__who">${b.name || 'Add patient'}</span>
      </button>
      <button type="button" class="icon-btn ubed__more" data-uact="menu" data-focus="menu-${unit}-${n}" aria-label="Options for bed ${n}">${icon('more')}</button>
    </header>
    ${all.map((c, i) => {
      // To-dos whose subcategory was removed on another device show under the first one
      const items = b.todos.filter((t) => t.cat === c.id || (i === 0 && !known.has(t.cat)));
      return html`<section class="ubed__cat${items.length ? '' : ' is-blank'}">
        <div class="ubed__cat-head">
          <h3 class="ubed__cat-name">${c.name}</h3>
          <button type="button" class="ubed__add" data-uact="add" data-cat="${c.id}" data-focus="add-${unit}-${n}-${c.id}" aria-label="Add to ${c.name}, bed ${n}">${icon('plus')}</button>
        </div>
        ${items.length ? html`<ul class="ubed__todos">${items.map(todoItem)}</ul>` : ''}
      </section>`;
    })}
  </article>`;
}

function render() {
  if (!view) return;
  const focused = document.activeElement?.closest?.('[data-focus]')?.dataset.focus;
  const anyDone = UNITS.some((u) => Array.from({ length: u.beds }, (_, i) => bed(u.id, i + 1)).some((b) => b.todos.some((t) => t.done)));
  const actions = html`<button type="button" class="btn btn--sm" data-uact="cats">${icon('list')}Subcategories</button>
    ${anyDone ? html`<button type="button" class="btn btn--sm" data-uact="clear-all">${icon('check')}Clear ticked</button>` : ''}`;
  setHTML(view, html`<div class="units-page accent-neuro">
    ${subHead({ title: 'NCCU/ACSU', back: 'Neurology', fallback: '', accent: 'neuro', actions, eyebrow: 'Duty to-dos' })}
    ${UNITS.map((u) => {
      const list = Array.from({ length: u.beds }, (_, i) => bed(u.id, i + 1));
      const filled = list.filter((b) => b.name).length;
      const left = list.reduce((n, b) => n + b.todos.filter((t) => !t.done).length, 0);
      return html`<section class="unit" aria-labelledby="unit-${u.id}">
        <h2 class="unit__title" id="unit-${u.id}">${u.name}<span class="unit__sub">${filled} of ${u.beds} beds${left ? ` · ${plural(left, 'to-do')} left` : ''}</span></h2>
        <div class="ubeds ubeds--${u.id}">${list.map((b) => bedBox(u.id, b.bed))}</div>
      </section>`;
    })}
  </div>`);
  if (focused) view.querySelector(`[data-focus="${focused}"]`)?.focus({ preventScroll: true });
}

/* ---------- Taps ---------- */

export async function handleUnitsClick(event) {
  const el = event.target.closest('[data-uact]');
  if (!el || !view?.contains(el)) return;
  const act = el.dataset.uact;
  if (act === 'cats') return editCats();
  if (act === 'clear-all') return clearAll();
  const box = el.closest('[data-unit]');
  if (!box) return;
  const unit = box.dataset.unit;
  const n = Number(box.dataset.bed);
  if (act === 'name') return editName(unit, n);
  if (act === 'menu') return bedMenu(unit, n);
  if (act === 'add') return todoDialog(unit, n, { cat: el.dataset.cat });
  if (act === 'tick') return toggleTodo(unit, n, el.dataset.todo);
  if (act === 'todo') return todoMenu(unit, n, el.dataset.todo);
  return null;
}

async function editName(unit, n) {
  const before = bed(unit, n).name;
  const result = await openDialog({
    variant: 'modal',
    className: 'units-dlg accent-neuro',
    dismissible: false,
    title: before ? 'Patient' : 'Add patient',
    body: html`<form class="form" data-form novalidate>
      <p class="dlg__msg">${bedLabel(unit, n)}</p>
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="text" value="${before}" maxlength="${MAX_NAME}" placeholder="For example: DELA CRUZ, JUAN" autocomplete="off" autocapitalize="characters" enterkeyhint="done">
      </label>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const field = form.elements.text;
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => field.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (field.value.trim() !== before && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        close({ text: field.value });
      });
    },
  });
  if (!result) return;
  if (!result.text.trim() && before) {
    if (!(await confirmDialog({ title: 'Remove the name?', message: `Bed ${n} shows as empty. Its to-dos stay.`, confirmLabel: 'Remove' }))) return;
  }
  await setName(unit, n, result.text);
}

/** Add a to-do (todo: null) or change one: its text and subcategory. */
async function todoDialog(unit, n, { cat, todo = null }) {
  const all = cats();
  const b = bed(unit, n);
  let chosen = all.some((c) => c.id === (todo?.cat ?? cat)) ? (todo?.cat ?? cat) : all[0].id;
  const start = todo?.text ?? '';
  const chips = () => all.map((c) => html`<button type="button" class="chip-toggle" data-cat="${c.id}" aria-pressed="${c.id === chosen ? 'true' : 'false'}">${c.name}</button>`);
  const result = await openDialog({
    variant: 'modal',
    className: 'units-dlg accent-neuro',
    dismissible: false,
    title: todo ? 'Edit to-do' : 'Add a to-do',
    body: html`<form class="form" data-form novalidate>
      <p class="dlg__msg">${bedLabel(unit, n)}${b.name ? ` · ${b.name}` : ''}</p>
      <label class="field"><span class="field__label">To-do</span>
        <input class="input" name="text" value="${start}" maxlength="${MAX_TODO}" placeholder="For example: Repeat Na at 6 PM" autocomplete="off" autocapitalize="sentences" enterkeyhint="done">
      </label>
      <p class="field__label">Subcategory</p>
      <div class="chips chips--sm units-dlg__cats" data-cats>${chips()}</div>
      <p class="form-error" data-error hidden>Type the to-do first.</p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${todo ? 'Save' : 'Add'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const field = form.elements.text;
      const error = form.querySelector('[data-error]');
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => field.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cats]').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-cat]');
        if (!chip) return;
        chosen = chip.dataset.cat;
        setHTML(form.querySelector('[data-cats]'), html`${chips()}`);
      });
      field.addEventListener('input', () => { error.hidden = true; });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (field.value.trim() !== start.trim() && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!field.value.trim()) {
          error.hidden = false;
          field.focus();
          return;
        }
        close({ text: field.value, cat: chosen });
      });
    },
  });
  if (!result) return;
  if (todo) await editTodo(unit, n, todo.id, result.text, result.cat);
  else await addTodo(unit, n, result.cat, result.text);
}

async function todoMenu(unit, n, id) {
  const todo = bed(unit, n).todos.find((t) => t.id === id);
  if (!todo) return;
  const choice = await actionSheet({
    title: todo.text,
    items: [
      { label: todo.done ? 'Mark as not done' : 'Mark as done', value: 'tick', icon: 'check' },
      { label: 'Edit', value: 'edit', icon: 'edit' },
      { label: 'Delete', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'tick') await toggleTodo(unit, n, id);
  else if (choice === 'edit') await todoDialog(unit, n, { todo });
  else if (choice === 'delete') {
    const before = structuredClone(bed(unit, n));
    await deleteTodo(unit, n, id);
    toast('To-do deleted.', { icon: 'trash', action: { label: 'Undo', onClick: () => restoreBed(before) } });
  }
}

async function bedMenu(unit, n) {
  const b = bed(unit, n);
  const done = b.todos.filter((t) => t.done).length;
  const choice = await actionSheet({
    title: bedLabel(unit, n),
    message: b.name || 'Empty bed',
    items: [
      { label: b.name ? 'Change name' : 'Add patient', value: 'name', icon: 'edit' },
      done ? { label: `Clear ticked (${done})`, value: 'clear', icon: 'check' } : null,
      b.name || b.todos.length ? { label: 'Empty this bed', detail: 'The name and every to-do', value: 'empty', icon: 'trash', destructive: true } : null,
    ],
  });
  if (choice === 'name') return editName(unit, n);
  const before = structuredClone(b);
  if (choice === 'clear') {
    await clearTicked(unit, n);
    toast(`${plural(done, 'ticked to-do')} cleared.`, { icon: 'check', action: { label: 'Undo', onClick: () => restoreBed(before) } });
  } else if (choice === 'empty') {
    if (!(await confirmDialog({ title: `Empty bed ${n}?`, message: `${b.name ? `${b.name} and ` : ''}${plural(b.todos.length, 'to-do')} will be removed from this bed.`, confirmLabel: 'Empty bed', destructive: true }))) return null;
    await clearBed(unit, n);
    toast(`Bed ${n} emptied.`, { icon: 'trash', action: { label: 'Undo', onClick: () => restoreBed(before) } });
  }
  return null;
}

async function clearAll() {
  const before = await clearAllTicked();
  const count = before.reduce((sum, b) => sum + b.todos.filter((t) => t.done).length, 0);
  if (!count) return;
  toast(`${plural(count, 'ticked to-do')} cleared.`, {
    icon: 'check',
    action: { label: 'Undo', onClick: async () => { for (const b of before) await restoreBed(b); } },
  });
}

/* ---------- Subcategories ---------- */

async function editCats() {
  let rows = cats().map((c) => ({ ...c }));
  const start = JSON.stringify(rows);
  const rowsHTML = () => html`${rows.map((c, i) => html`<li class="ucats__row">
      <input class="input" data-i="${i}" value="${c.name}" maxlength="${MAX_CAT}" aria-label="Subcategory ${i + 1}" autocomplete="off" autocapitalize="words">
      <button type="button" class="ptt__tool" data-move="-1" data-i="${i}" aria-label="Move ${c.name || 'it'} up"${i === 0 ? raw(' disabled') : ''}>${icon('arrowUp')}</button>
      <button type="button" class="ptt__tool" data-move="1" data-i="${i}" aria-label="Move ${c.name || 'it'} down"${i === rows.length - 1 ? raw(' disabled') : ''}>${icon('arrowDown')}</button>
      <button type="button" class="ptt__tool" data-remove="${i}" aria-label="Remove ${c.name || 'it'}"${rows.length === 1 ? raw(' disabled') : ''}>${icon('x')}</button>
    </li>`)}`;
  const result = await openDialog({
    variant: 'modal',
    className: 'units-dlg accent-neuro',
    dismissible: false,
    title: 'Subcategories',
    body: html`<form class="form" data-form novalidate>
      <p class="dlg__msg">Every bed’s to-dos are grouped under these, in this order. To-dos in one you remove move to the first.</p>
      <ul class="ucats" data-rows>${rowsHTML()}</ul>
      <button type="button" class="btn btn--sm" data-new>${icon('plus')}Add subcategory</button>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const list = form.querySelector('[data-rows]');
      const add = form.querySelector('[data-new]');
      const redraw = () => {
        setHTML(list, rowsHTML());
        add.disabled = rows.length >= MAX_CATS;
      };
      redraw();
      list.addEventListener('input', (e) => { if (e.target.dataset.i != null) rows[Number(e.target.dataset.i)].name = e.target.value; });
      list.addEventListener('click', (e) => {
        const move = e.target.closest('[data-move]');
        const remove = e.target.closest('[data-remove]');
        if (move) {
          const i = Number(move.dataset.i);
          const j = i + Number(move.dataset.move);
          [rows[i], rows[j]] = [rows[j], rows[i]];
          redraw();
          list.querySelector(`[data-move="${move.dataset.move}"][data-i="${j}"]`)?.focus();
        } else if (remove) {
          rows.splice(Number(remove.dataset.remove), 1);
          redraw();
        }
      });
      add.addEventListener('click', () => {
        rows.push({ id: '', name: '' });
        redraw();
        list.querySelector(`[data-i="${rows.length - 1}"].input`)?.focus();
      });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (JSON.stringify(rows) !== start && !(await confirmDialog({ title: 'Discard your changes?', message: 'Your changes to the subcategories will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        close({ rows });
      });
    },
  });
  if (!result) return;
  const kept = result.rows.filter((c) => c.name.trim());
  if (!kept.length) {
    toast('Keep at least one subcategory.', { icon: 'info' });
    return;
  }
  await saveCats(kept);
  toast('Subcategories saved.', { icon: 'check' });
}
