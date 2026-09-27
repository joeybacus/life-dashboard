/* The plain-words box, at the top of the To Do screen and in the Quick Add
   sheet (the + button). Type a task the way you'd say it — "Finish STRAMA paper
   tomorrow 8pm #MBA !!!" — and what the box recognises shows as chips under it;
   tap a chip to take it out (its words go back into the name). Grey chips are
   defaults (the day of the view you're in, your default priority or category);
   tap one to drop it. When something could mean two things ("3/10", "at 8") the
   box asks before adding. Enter or Add adds the task; Details opens the full
   task sheet with everything filled in; "?" explains the words it knows. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { announce, openDialog, toast } from '../../core/ui.js';
import { relativeDay, todayKey } from '../../core/manila.js';
import { PRIORITIES, categoryStyle } from './model.js';
import { parseTask } from './parse.js';
import { createTask, loadTodo, softDelete } from './store.js';
import { checkDuplicate } from './task-actions.js';
import { openNewTask } from './detail.js';

let boxes = 0;

/** The box's markup. hint: the grey example under it while it's empty and in use. */
export function captureMarkup({ placeholder = 'Add a task…', label = 'New task, in plain words' } = {}) {
  const id = `capture-${++boxes}`;
  return html`<form class="capture" data-capture novalidate>
    <div class="capture__row">
      <span class="capture__icon" aria-hidden="true">${icon('plus')}</span>
      <input class="capture__input" data-capture-input type="text" autocomplete="off" autocapitalize="sentences" spellcheck="true"
        enterkeyhint="done" maxlength="400" placeholder="${placeholder}" aria-label="${label}" aria-describedby="${id}-hint">
      <button type="button" class="icon-btn capture__help" data-capture-help aria-label="How to type tasks (dates, times, priority, category, tags)">${icon('help')}</button>
    </div>
    <p class="capture__hint" id="${id}-hint">Try: Call the lab tomorrow 8am #Hospital !!</p>
    <div class="capture__chips" data-capture-chips></div>
    <div class="capture__ask" data-capture-ask></div>
    <div class="capture__actions" data-capture-actions hidden>
      <button type="button" class="btn btn--sm btn--ghost" data-capture-details>${icon('sliders')}Details</button>
      <button type="submit" class="btn btn--sm btn--accent" data-capture-add>${icon('plus')}Add</button>
    </div>
  </form>`;
}

const KIND_ICON = { date: 'calendar', time: 'clock', tag: 'link' };

function chip({ key, kind, label, value, isDefault, ask, fresh, categories }) {
  const words = isDefault ? `${label} (a default). Remove` : ask ? `${label}: needs a choice. Keep it as words instead` : `${label}. Remove — keep these words in the name`;
  let lead = '';
  if (kind === 'priority') lead = html`<i class="pri pri--${value}" aria-hidden="true"><i class="pri__dot"></i></i>`;
  else if (kind === 'category') {
    const style = categoryStyle(categories.find((c) => c.id === value));
    lead = html`<span class="cchip__cat" style="--cat: ${style.color}">${icon(style.icon)}</span>`;
  } else if (kind === 'tag') lead = '';
  else lead = icon(KIND_ICON[kind] ?? 'info');
  return html`<button type="button" class="cchip cchip--${kind}${isDefault ? ' cchip--default' : ''}${ask ? ' cchip--ask' : ''}${fresh ? ' is-new' : ''}" data-chip="${key}" aria-label="${words}">
    ${lead}<span>${label}</span>${icon('x', 'cchip__x')}</button>`;
}

/**
 * Make a capture box work.
 *   defaults()  → { date, priority, categoryId } to use when the words don't say
 *   onAdded(task) — after a task is added (the Quick Add sheet closes itself here)
 *   keepFocus   — stay in the box for the next task (the To Do screen)
 * Returns { focus(), hasText(), reset() }.
 */
export function bindCapture(form, { defaults = () => ({}), onAdded = () => {}, keepFocus = true } = {}) {
  const input = form.querySelector('[data-capture-input]');
  const chipsEl = form.querySelector('[data-capture-chips]');
  const askEl = form.querySelector('[data-capture-ask]');
  const actionsEl = form.querySelector('[data-capture-actions]');
  const st = { ignore: new Set(), choices: {}, off: new Set(), categories: [], parsed: null, adding: false, shown: new Set() };

  const refreshCategories = () => loadTodo().then((d) => {
    st.categories = [...d.categories.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (input.value.trim()) update();
  });
  refreshCategories();

  /** What the task will be: the words first, then the defaults you haven't dropped. */
  function fields() {
    const p = st.parsed;
    const d = defaults() ?? {};
    const f = { ...(p?.fields ?? {}) };
    if (!('date' in f) && !st.off.has('date') && d.date) f.date = d.date;
    if (!('priority' in f)) f.priority = !st.off.has('priority') && d.priority ? d.priority : 'none';
    if (!('categoryId' in f)) f.categoryId = !st.off.has('category') && d.categoryId ? d.categoryId : null;
    return f;
  }

  function update() {
    const text = input.value;
    st.parsed = text.trim() ? parseTask(text, { categories: st.categories, ignore: [...st.ignore], choices: st.choices }) : null;
    actionsEl.hidden = !text.trim();
    form.classList.toggle('has-text', Boolean(text.trim()));
    if (!st.parsed) {
      setHTML(chipsEl, '');
      setHTML(askEl, '');
      st.shown.clear();
      return;
    }
    const p = st.parsed;
    const d = defaults() ?? {};
    const today = todayKey();
    const defaultChips = [];
    if (!('date' in p.fields) && !p.parts.some((x) => x.kind === 'date') && d.date && !st.off.has('date')) {
      defaultChips.push({ key: 'default:date', kind: 'date', label: relativeDay(d.date, today), isDefault: true });
    }
    if (!('priority' in p.fields) && d.priority && d.priority !== 'none' && !st.off.has('priority')) {
      defaultChips.push({ key: 'default:priority', kind: 'priority', value: d.priority, label: PRIORITIES[d.priority].label, isDefault: true });
    }
    if (!('categoryId' in p.fields) && d.categoryId && !st.off.has('category')) {
      const c = st.categories.find((x) => x.id === d.categoryId);
      if (c) defaultChips.push({ key: 'default:category', kind: 'category', value: c.id, label: c.name, isDefault: true });
    }
    const all = [...p.parts.map((x) => ({ ...x, ask: x.value == null })), ...defaultChips];
    // Only chips that weren't there before the last key pop in (the rest stay still while you type)
    const before = st.shown;
    st.shown = new Set(all.map((c) => `${c.key}:${c.label}`));
    setHTML(chipsEl, all.map((c) => chip({ ...c, fresh: !before.has(`${c.key}:${c.label}`), categories: st.categories })));
    setHTML(askEl, p.unanswered.map((x) => html`<div class="cask" role="group" aria-label="What does “${x.text}” mean?">
      <span class="cask__q">“${x.text}” is</span>
      ${x.options.map((o, i) => html`<button type="button" class="cask__opt" data-choose="${x.key}" data-index="${i}">${o.label}</button>`)}
    </div>`));
  }

  function reset() {
    input.value = '';
    st.ignore.clear();
    st.off.clear();
    st.choices = {};
    update();
  }

  async function add() {
    if (st.adding) return;
    update();
    const p = st.parsed;
    if (!p || !p.title) {
      toast(p ? 'Add a name for the task too.' : 'Type a task first.', { icon: 'info' });
      input.focus();
      return;
    }
    if (p.unanswered.length) {
      const first = askEl.querySelector('.cask__opt');
      first?.focus();
      announce(`Choose what “${p.unanswered[0].text}” means, then add the task.`);
      form.classList.remove('is-asking');
      void form.offsetWidth;
      form.classList.add('is-asking');
      return;
    }
    st.adding = true; // one task per tap, however fast
    try {
      const task = await createTask({ ...fields(), title: p.title });
      reset();
      if (keepFocus) input.focus();
      toast(`Added: ${task.title}`, { icon: 'checklist', action: { label: 'Undo', onClick: () => softDelete(task) } });
      announce(`Task added: ${task.title}`);
      onAdded(task);
      checkDuplicate(task);
    } catch (err) {
      console.error(err);
      toast('Couldn’t add the task. Please try again.', { icon: 'info' });
    } finally {
      st.adding = false;
    }
  }

  async function details() {
    const p = st.parsed;
    const f = fields();
    if (p?.unanswered.length) {
      // The full sheet has its own date and time boxes: leave the unclear part out
      delete f.date;
      delete f.startTime;
      delete f.endTime;
    }
    input.blur();
    const created = await openNewTask({ ...f, title: p?.title ?? input.value.trim() });
    if (created) reset();
  }

  input.addEventListener('input', () => {
    form.classList.remove('is-asking');
    update();
  });
  input.addEventListener('focus', () => {
    // The example under the box appears the first time it's used and then stays
    // (vanishing on blur would move the buttons below while you click them)
    form.classList.add('was-focused');
    refreshCategories();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    add();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); // ⌘Enter adds too, as in the task sheet
      add();
    } else if (event.key === 'Escape' && !form.closest('dialog')) {
      input.blur(); // leaves the box; what you typed stays (in Quick Add, Esc does nothing)
    }
  });
  form.addEventListener('click', (event) => {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.chip) {
      const key = b.dataset.chip;
      if (key.startsWith('default:')) st.off.add(key.slice(8));
      else st.ignore.add(key);
      update();
      input.focus({ preventScroll: true });
    } else if (b.dataset.choose) {
      const part = st.parsed?.parts.find((x) => x.key === b.dataset.choose);
      const option = part?.options?.[Number(b.dataset.index)];
      if (!option) return;
      st.choices[part.key] = option.value;
      update();
      announce(`“${part.text}” is ${option.label}.`);
      input.focus({ preventScroll: true });
    } else if ('captureDetails' in b.dataset) {
      details();
    } else if ('captureHelp' in b.dataset) {
      openCaptureHelp();
    }
  });

  return {
    focus: (opts) => input.focus(opts),
    hasText: () => Boolean(input.value.trim()),
    reset,
  };
}

/* ---------- Help ---------- */

const EXAMPLES = [
  ['Dates', 'today · tonight · tomorrow (tmrw) · Friday (or on Fri) · next Monday · in 3 days · in 2 weeks · Oct 3 · 3 October · 10/15'],
  ['Times', '8pm · 8:30 PM · 20:00 · noon · 8–9 PM · 3pm–4pm. A time without a day means today (or tomorrow if it has passed).'],
  ['Priority', '! low · !! medium · !!! high · or “high priority”'],
  ['Category', '#MBA — one of your categories. Capitals and spaces don’t matter (#boardexam), and the start of a name is enough (#res).'],
  ['Tags', '@paper @home'],
  ['It asks', 'when something could mean two things — “3/10” (March 10 or October 3?) or “at 8” (morning or evening?).'],
  ['Coming next', '“remind me 30 min before” with reminders (0.4.2), “cal” with the Google Calendar link (0.4.3), “every Monday” with repeating tasks (0.4.4).'],
];
const KEYS = [
  ['N', 'New task (the box at the top of To Do; the + sheet elsewhere)'],
  ['/', 'Search'],
  ['↑ ↓', 'Move between tasks'],
  ['Space', 'Complete the task you’re on'],
  ['Enter', 'Quick menu for the task you’re on'],
  ['⌘ Enter', 'Add or save'],
  ['Esc', 'Close the quick menu or a list. Pop-ups you type in close only with their buttons'],
  ['?', 'This help'],
];

registerAction('todo:help', () => openCaptureHelp());

export function openCaptureHelp() {
  return openDialog({
    variant: 'sheet',
    className: 'capture-help accent-todo',
    title: 'Typing tasks',
    body: html`<p class="dlg__msg">Type a task the way you’d say it. What the box understands shows as chips — tap a chip to keep those words in the name instead.</p>
      <p class="capture-help__example"><strong>Finish STRAMA paper tomorrow 8pm #MBA !!!</strong><br>→ “Finish STRAMA paper”, tomorrow at 8:00 PM, MBA, High priority</p>
      <dl class="capture-help__list">${EXAMPLES.map(([term, text]) => html`<div><dt>${term}</dt><dd>${text}</dd></div>`)}</dl>
      <div class="capture-help__mac">
        <h3 class="capture-help__title">Keyboard (Mac)</h3>
        <dl class="capture-help__keys">${KEYS.map(([k, text]) => html`<div><dt><kbd>${k}</kbd></dt><dd>${text}</dd></div>`)}</dl>
      </div>
      <div class="capture-help__touch">
        <h3 class="capture-help__title">Swipes (iPhone, iPad)</h3>
        <p class="dlg__msg">Swipe a task right to complete it, left to move it to tomorrow. Tap a task for the quick menu.</p>
      </div>`,
    actions: [{ label: 'Done', value: 'done', variant: 'primary', autofocus: true }],
  });
}
