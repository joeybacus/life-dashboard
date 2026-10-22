/* NCCU/ACSU (#/neurology/units): a box per bed — 6 in NCCU (one row on a
   Mac), 8 in ACSU (two rows of 4) — with, in order, the patient's name, the
   diagnosis, your endorsement notes and one to-do list for the duty (store.js). */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { actionSheet, confirmDialog, openDialog, toast } from '../../core/ui.js';
import {
  MAX_DIAGNOSIS, MAX_NAME, MAX_NOTES, MAX_TODO, UNITS, addTodo, bed, clearAllTicked, clearBed, clearTicked, deleteTodo,
  editTodo, inUse, restoreBed, setPatient, toggleTodo,
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
  const left = b.todos.filter((t) => !t.done).length;
  const used = inUse(b);
  return html`<article class="ubed${used ? '' : ' is-empty'}" data-unit="${unit}" data-bed="${n}" aria-label="${bedLabel(unit, n)}${b.name ? `: ${b.name}` : used ? '' : ', empty'}">
    <header class="ubed__head">
      <button type="button" class="ubed__name" data-uact="patient" data-field="name" data-focus="name-${unit}-${n}">
        <span class="ubed__bed">Bed ${n}${left ? html`<span class="ubed__left">${left} left</span>` : ''}</span>
        <span class="ubed__who${b.name ? '' : ' is-blank'}">${b.name || (used ? 'No name' : 'Add patient')}</span>
      </button>
      <button type="button" class="icon-btn ubed__more" data-uact="menu" data-focus="menu-${unit}-${n}" aria-label="Options for bed ${n}">${icon('more')}</button>
    </header>
    ${used ? html`
      <button type="button" class="ubed__dx${b.diagnosis ? '' : ' is-blank'}" data-uact="patient" data-field="diagnosis" data-focus="dx-${unit}-${n}">${b.diagnosis || 'Add diagnosis'}</button>
      <button type="button" class="ubed__notes${b.notes ? '' : ' is-blank'}" data-uact="patient" data-field="notes" data-focus="notes-${unit}-${n}">${b.notes || 'Add endorsement notes'}</button>
      ${b.todos.length ? html`<ul class="ubed__todos">${b.todos.map(todoItem)}</ul>` : ''}
      <button type="button" class="ubed__addtodo" data-uact="add" data-focus="add-${unit}-${n}">${icon('plus')}To-do</button>` : ''}
  </article>`;
}

function render() {
  if (!view) return;
  const focused = document.activeElement?.closest?.('[data-focus]')?.dataset.focus;
  const anyDone = UNITS.some((u) => Array.from({ length: u.beds }, (_, i) => bed(u.id, i + 1)).some((b) => b.todos.some((t) => t.done)));
  const actions = anyDone ? html`<button type="button" class="btn btn--sm" data-uact="clear-all">${icon('check')}Clear ticked</button>` : '';
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
  if (act === 'clear-all') return clearAll();
  const box = el.closest('[data-unit]');
  if (!box) return;
  const unit = box.dataset.unit;
  const n = Number(box.dataset.bed);
  if (act === 'patient') return editPatient(unit, n, el.dataset.field);
  if (act === 'menu') return bedMenu(unit, n);
  if (act === 'add') return todoDialog(unit, n);
  if (act === 'tick') return toggleTodo(unit, n, el.dataset.todo);
  if (act === 'todo') return todoMenu(unit, n, el.dataset.todo);
  return null;
}

/** The patient's name, diagnosis and endorsement notes; `field` is the one you tapped. */
async function editPatient(unit, n, field = 'name') {
  const b = bed(unit, n);
  const start = { name: b.name, diagnosis: b.diagnosis, notes: b.notes };
  const result = await openDialog({
    variant: 'modal',
    className: 'units-dlg accent-neuro',
    dismissible: false,
    title: b.name ? 'Patient' : 'Add patient',
    body: html`<form class="form" data-form novalidate>
      <p class="dlg__msg">${bedLabel(unit, n)}</p>
      <label class="field"><span class="field__label">Name</span>
        <input class="input" name="name" value="${start.name}" maxlength="${MAX_NAME}" placeholder="For example: DELA CRUZ, JUAN" autocomplete="off" autocapitalize="characters" enterkeyhint="next">
      </label>
      <label class="field"><span class="field__label">Diagnosis</span>
        <input class="input" name="diagnosis" value="${start.diagnosis}" maxlength="${MAX_DIAGNOSIS}" placeholder="For example: Pontine bleed, DM2" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
      </label>
      <label class="field"><span class="field__label">Endorsement notes</span>
        <textarea class="input textarea" name="notes" rows="5" maxlength="${MAX_NOTES}" placeholder="For example: HAP, on meropenem, weaning MV" autocapitalize="sentences">${start.notes}</textarea>
      </label>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const values = () => ({ name: form.elements.name.value, diagnosis: form.elements.diagnosis.value, notes: form.elements.notes.value });
      const changed = () => Object.keys(start).some((k) => values()[k].trim() !== start[k]);
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements[field]?.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (changed() && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        close(values());
      });
    },
  });
  if (!result) return;
  if (!result.name.trim() && start.name) {
    if (!(await confirmDialog({ title: 'Remove the name?', message: `Bed ${n} shows without a name. Its notes and to-dos stay.`, confirmLabel: 'Remove' }))) return;
  }
  await setPatient(unit, n, result);
}

/** Add a to-do (todo: null) or change one. */
async function todoDialog(unit, n, { todo = null } = {}) {
  const b = bed(unit, n);
  const start = todo?.text ?? '';
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
        close({ text: field.value });
      });
    },
  });
  if (!result) return;
  if (todo) await editTodo(unit, n, todo.id, result.text);
  else await addTodo(unit, n, result.text);
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
      { label: inUse(b) ? 'Edit patient' : 'Add patient', value: 'patient', icon: 'edit' },
      done ? { label: `Clear ticked (${done})`, value: 'clear', icon: 'check' } : null,
      inUse(b) ? { label: 'Empty this bed', detail: 'Name, diagnosis, notes and every to-do', value: 'empty', icon: 'trash', destructive: true } : null,
    ],
  });
  if (choice === 'patient') return editPatient(unit, n);
  const before = structuredClone(b);
  if (choice === 'clear') {
    await clearTicked(unit, n);
    toast(`${plural(done, 'ticked to-do')} cleared.`, { icon: 'check', action: { label: 'Undo', onClick: () => restoreBed(before) } });
  } else if (choice === 'empty') {
    if (!(await confirmDialog({ title: `Empty bed ${n}?`, message: `${b.name || 'The patient'}, the diagnosis, the notes and ${plural(b.todos.length, 'to-do')} will be removed from this bed.`, confirmLabel: 'Empty bed', destructive: true }))) return null;
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
