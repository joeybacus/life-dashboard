/* Study tracker (#/neurology/study) — a temporary page until the real study
   tools arrive: a picture you choose (shown every time you open the page),
   a note box under it, and a to-do list.

   Kept on this device only, in the meta store (not synced):
     'studyPhoto'  the picture, shrunk to a JPEG data URL (never in backup files)
     'study'       { notes, todos: [{ id, text, done }] } (in backup files) */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { uid } from '../../core/ids.js';
import { subHead } from '../../core/components.js';
import { confirmDialog, toast } from '../../core/ui.js';

const MAX_SIDE = 1600;
const MAX_TODO = 200;
const MAX_NOTES = 20000;

let view = null;
let showing = false;
let photo = null;
let data = { notes: '', todos: [] };
let loaded = false;
let noteTimer = null;

const saveData = () => db.put('meta', { key: 'study', value: data }).catch((err) => console.warn('Study tracker not saved', err));

async function load() {
  if (loaded) return;
  const [p, d] = await Promise.all([db.get('meta', 'studyPhoto'), db.get('meta', 'study')]);
  photo = p?.value ?? null;
  data = { notes: d?.value?.notes ?? '', todos: Array.isArray(d?.value?.todos) ? d.value.todos : [] };
  loaded = true;
}

/** Shrink a chosen picture so its longest side is at most MAX_SIDE, as a JPEG. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image format could not be read.')); };
    img.src = url;
  });
}

export const studyPage = {
  async show(el) {
    view = el;
    showing = true;
    await load();
    if (showing) render();
  },
  hide() {
    showing = false;
    flushNotes();
  },
};

/* ---------- The page ---------- */

function photoCard() {
  if (!photo) {
    return html`<button type="button" class="study-photo study-photo--empty" data-sact="pick">
      <span class="study-photo__icon">${icon('image')}</span>
      <span class="study-photo__title">Add a picture</span>
      <span class="study-photo__sub">Your study plan or timetable — it shows here every time you open this page</span>
    </button>`;
  }
  return html`<figure class="study-photo">
    <img class="study-photo__img" src="${photo}" alt="Your study picture">
    <figcaption class="study-photo__bar">
      <button type="button" class="btn btn--sm" data-sact="pick">${icon('image')}Change picture</button>
      <button type="button" class="btn btn--sm" data-sact="remove-photo">${icon('trash')}Remove</button>
    </figcaption>
  </figure>`;
}

function todoList() {
  const left = data.todos.filter((t) => !t.done).length;
  const anyDone = data.todos.some((t) => t.done);
  return html`<div class="study-todos__head">
      <h2 class="study__title">To do${data.todos.length ? html`<span class="ward-group__count">${left}</span>` : ''}</h2>
      ${anyDone ? html`<button type="button" class="btn btn--sm" data-sact="clear-done">${icon('check')}Clear ticked</button>` : ''}
    </div>
    <div class="study-todos__add">
      <input class="input" type="text" id="study-new" maxlength="${MAX_TODO}" placeholder="Add a to-do" enterkeyhint="done" autocomplete="off">
      <button type="button" class="btn btn--primary" data-sact="add">${icon('plus')}Add</button>
    </div>
    ${data.todos.length ? html`<ul class="study-todos__list">${data.todos.map((t) => html`
      <li class="utodo study-todo${t.done ? ' is-done' : ''}">
        <button type="button" class="utodo__tick" role="checkbox" aria-checked="${t.done ? 'true' : 'false'}" aria-label="${t.text}" data-sact="tick" data-id="${t.id}"><span class="pt__box">${icon('check')}</span></button>
        <span class="utodo__text">${t.text}</span>
        <button type="button" class="icon-btn study-todo__del" data-sact="delete" data-id="${t.id}" aria-label="Delete ${t.text}">${icon('trash')}</button>
      </li>`)}</ul>` : html`<p class="study__empty">Nothing yet.</p>`}`;
}

function render() {
  if (!view) return;
  setHTML(view, html`<div class="study-page accent-neuro">
    ${subHead({ title: 'Study tracker', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Temporary' })}
    <section class="study-photo-wrap" aria-label="Study picture">${photoCard()}</section>
    <input type="file" accept="image/*" class="sr-only" id="study-file" tabindex="-1" aria-hidden="true">
    <section class="card study-notes">
      <label class="study__title" for="study-notes">Notes</label>
      <textarea class="input study-notes__box" id="study-notes" maxlength="${MAX_NOTES}" placeholder="Write anything — it saves as you type">${data.notes}</textarea>
    </section>
    <section class="card study-todos" id="study-todos">${todoList()}</section>
  </div>`);
}

function renderTodos(focusNew = false) {
  const box = view?.querySelector('#study-todos');
  if (!box) return;
  setHTML(box, todoList());
  if (focusNew) box.querySelector('#study-new')?.focus();
}

/* ---------- Doing things ---------- */

function flushNotes() {
  if (!noteTimer) return;
  clearTimeout(noteTimer);
  noteTimer = null;
  saveData();
}

function addTodo() {
  const input = view.querySelector('#study-new');
  const text = String(input?.value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TODO);
  if (!text) { input?.focus(); return; }
  data.todos.push({ id: uid(), text, done: false });
  saveData();
  renderTodos(true);
}

async function pickedFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) { toast('Please choose an image.'); return; }
  try {
    photo = await shrink(file);
    await db.put('meta', { key: 'studyPhoto', value: photo });
    render();
    toast('Picture saved', { icon: 'check' });
  } catch (err) {
    toast(err.message || 'The picture could not be saved.');
  }
}

async function onClick(e) {
  const btn = e.target.closest('[data-sact]');
  if (!btn || !view?.contains(btn)) return;
  const { sact, id } = btn.dataset;
  if (sact === 'pick') {
    view.querySelector('#study-file')?.click();
  } else if (sact === 'remove-photo') {
    if (!await confirmDialog({ title: 'Remove the picture?', message: 'You can add another one any time.', confirmLabel: 'Remove', destructive: true })) return;
    photo = null;
    await db.delete('meta', 'studyPhoto');
    render();
  } else if (sact === 'add') {
    addTodo();
  } else if (sact === 'tick') {
    const t = data.todos.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    saveData();
    renderTodos();
    view.querySelector(`[data-sact="tick"][data-id="${id}"]`)?.focus();
  } else if (sact === 'delete') {
    const i = data.todos.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [gone] = data.todos.splice(i, 1);
    saveData();
    renderTodos();
    toast('To-do deleted', { action: { label: 'Undo', onClick: () => { data.todos.splice(i, 0, gone); saveData(); if (showing) renderTodos(); } } });
  } else if (sact === 'clear-done') {
    const before = data.todos;
    data.todos = data.todos.filter((t) => !t.done);
    saveData();
    renderTodos();
    toast('Ticked to-dos cleared', { action: { label: 'Undo', onClick: () => { data.todos = before; saveData(); if (showing) renderTodos(); } } });
  }
}

/** Wired up once by the Neurology screen. */
export function wireStudy(el) {
  el.addEventListener('click', onClick);
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'study-file') return;
    pickedFile(e.target.files?.[0]);
    e.target.value = '';
  });
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'study-notes') return;
    data.notes = e.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNotes, 400);
  });
  el.addEventListener('focusout', (e) => { if (e.target.id === 'study-notes') flushNotes(); });
  el.addEventListener('keydown', (e) => {
    if (e.target.id === 'study-new' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addTodo();
    }
  });
}
