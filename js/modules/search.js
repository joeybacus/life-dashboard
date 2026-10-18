/* Search everywhere (0.10.0): one box for tasks and subtasks, workouts,
   exercises, templates, habits, categories and your calendar events. Opens from
   the search button on the dashboard, Search on the + button, ⌘K (or Ctrl+K),
   and "/" anywhere except the To Do list (which has its own search).

   Every word must match (names, notes, tags, exercise names, places…); capitals
   and accents don't matter. A date in the words — "Sep 10 workout", "yesterday",
   "Friday" — keeps only things on that day (the most recent one that has
   passed). Patient lists and referrals are never searched here. */
import { html, raw, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { db } from '../core/db.js';
import { registerAction } from '../core/actions.js';
import { openDialog } from '../core/ui.js';
import { openPage, currentRoute, currentSubRoute } from '../core/router.js';
import { registerQuickAdd } from '../core/quick-add.js';
import { toDateKey } from '../core/dates.js';
import { addDays, formatDay, todayKey } from '../core/manila.js';
import { foldText } from './todo/model.js';
import { parseTask } from './todo/parse.js';
import { loadTodo } from './todo/store.js';
import { openTask } from './todo/detail.js';
import { openSubtask } from './todo/subtask-sheet.js';
import { loadLibrary } from './workout/library.js';
import { loadTemplates } from './workout/store.js';
import { loadHabits } from './habits/store.js';
import { scheduleText } from './habits/model.js';
import { gcalEvents } from '../services/gcal.js';
import { openEventDetails } from './calendar/editor.js';

const PER_GROUP = 6;
const GROUPS = [
  { id: 'task', label: 'Tasks', icon: 'checklist' },
  { id: 'workout', label: 'Workouts', icon: 'dumbbell' },
  { id: 'event', label: 'Calendar', icon: 'calendar' },
  { id: 'exercise', label: 'Exercises', icon: 'bolt' },
  { id: 'template', label: 'Templates', icon: 'clipboard' },
  { id: 'habit', label: 'Habits', icon: 'flame' },
  { id: 'category', label: 'Categories', icon: 'layers' },
];
// Words that find a whole kind: "workout", "template", "habit"…
const KIND_WORDS = {
  task: 'task tasks todo to-do to-dos subtask', workout: 'workout workouts', event: 'event events calendar meeting',
  exercise: 'exercise exercises', template: 'template templates routine', habit: 'habit habits', category: 'category categories',
};
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/* ---------- Finding ---------- */

/** Everything there is to search, loaded once per opening. */
export async function loadSearchData() {
  const today = todayKey();
  const [todo, workouts, library, templates, habits, events] = await Promise.all([
    loadTodo(), db.live('workouts'), loadLibrary(), loadTemplates(), loadHabits(),
    gcalEvents(addDays(today, -62), addDays(today, 62)).catch(() => []),
  ]);
  const items = [];
  const catName = (id) => todo.categories.get(id)?.name ?? '';
  for (const t of todo.tasks) {
    items.push({ kind: 'task', id: t.id, title: t.title || 'Untitled task', date: t.date ?? null, done: t.status === 'done',
      sub: [t.status === 'done' ? 'Done' : '', t.date ? formatDay(t.date) : 'No date', catName(t.categoryId)].filter(Boolean).join(' · '),
      text: [t.title, t.notes, ...(t.tags ?? []).map((g) => `@${g} #${g}`), catName(t.categoryId)].join(' '), sort: t.date ?? t.updatedAt ?? '' });
  }
  const titles = new Map(todo.tasks.map((t) => [t.id, t.title]));
  for (const s of todo.subtasks ?? []) {
    if (s.deletedAt || !titles.has(s.taskId)) continue;
    items.push({ kind: 'task', sub: `Subtask of “${titles.get(s.taskId)}”${s.date ? ` · ${formatDay(s.date)}` : ''}`, id: s.id, subtask: true,
      title: s.title || 'Untitled subtask', date: s.date ?? null, done: Boolean(s.done), text: [s.title, titles.get(s.taskId)].join(' '), sort: s.date ?? '' });
  }
  for (const w of workouts) {
    if (!w.startedAt) continue;
    const day = toDateKey(new Date(w.startedAt));
    const names = (w.exercises ?? []).map((e) => e.name).filter(Boolean);
    items.push({ kind: 'workout', id: w.id, title: w.title || 'Workout', date: day, sub: `${fmtDay.format(new Date(w.startedAt))}${w.endedAt ? '' : ' · in progress'}${names.length ? ` · ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : ''}`,
      text: [w.title, w.notes, (w.muscleGroups ?? []).join(' '), ...names, ...(w.exercises ?? []).map((e) => e.notes ?? '')].join(' '), sort: w.startedAt });
  }
  for (const e of library.list) {
    items.push({ kind: 'exercise', id: e.id, title: e.name, date: null, sub: [e.primary, e.equipment, e.custom ? 'Your exercise' : ''].filter(Boolean).join(' · '),
      text: [e.name, e.primary, ...(e.secondary ?? []), e.equipment, e.notes].join(' '), sort: '', favorite: Boolean(e.favorite) });
  }
  for (const t of templates) {
    const names = t.exercises.map((x) => x.name ?? library.get(x.exerciseId)?.name).filter(Boolean);
    items.push({ kind: 'template', id: t.id, title: t.name || 'Template', date: null, sub: names.length ? `${names.length} exercise${names.length === 1 ? '' : 's'} · ${names.slice(0, 3).join(', ')}` : 'No exercises yet',
      text: [t.name, t.notes, (t.muscleGroups ?? []).join(' '), ...names].join(' '), sort: '' });
  }
  for (const h of habits.habits) {
    items.push({ kind: 'habit', id: h.id, title: h.name, date: null, sub: `${h.group} · ${scheduleText(h.schedule)}`, text: [h.name, h.group].join(' '), sort: '' });
  }
  for (const c of todo.categories.values()) {
    if (c.deletedAt) continue;
    items.push({ kind: 'category', id: c.id, title: c.name, date: null, sub: 'Category', text: c.name, sort: '' });
  }
  for (const e of events) {
    const day = e.allDay ? e.date : todayKey(e.start.getTime());
    items.push({ kind: 'event', id: e.id, title: e.title, date: day, sub: [formatDay(day), e.allDay ? 'All day' : null, e.location, e.calendar].filter(Boolean).join(' · '),
      text: [e.title, e.location, e.description, e.calendar].join(' '), sort: day, event: e });
  }
  return items.map((i) => ({ ...i, hay: foldText(`${i.title} \n ${i.text} \n ${KIND_WORDS[i.kind]}`), fold: foldText(i.title) }));
}

/** A date in the words, as the days it could mean (the most recent first), and the words left. */
function dateIn(query, today = todayKey()) {
  // "today" and "yesterday" (the to-do words only look ahead)
  const plain = /(^|\s)(today|yesterday)(?=\s|$)/i.exec(query);
  if (plain) {
    const day = plain[2].toLowerCase() === 'today' ? today : addDays(today, -1);
    return { days: [day], rest: query.replace(plain[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  let parsed;
  try { parsed = parseTask(query); } catch { return { days: null, rest: query }; }
  const part = parsed.parts.find((p) => p.kind === 'date' && p.value);
  if (!part) return { days: null, rest: query };
  const d = parsed.fields.date;
  if (!d) return { days: null, rest: query };
  const days = [d];
  if (d > today) days.unshift(addDays(d, -7), `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`); // "Friday", "Sep 10": the one that has passed
  const rest = `${query.slice(0, part.start)} ${query.slice(part.end)}`.replace(/\s+/g, ' ').trim();
  return { days: days.filter((x) => x <= today || x === d), rest };
}

/** Results for a query: [{ group, items, total }] in the groups' order. */
export function searchAll(items, query) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const { days, rest } = dateIn(q);
  const words = foldText(rest).split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  const hits = items.filter((i) => (!days || (i.date && days.includes(i.date))) && words.every((w) => i.hay.includes(w)) && (days || words.length));
  const phrase = words.join(' ');
  const score = (i) => (i.fold === phrase ? 0 : phrase && i.fold.startsWith(phrase) ? 1 : i.fold.startsWith(first) ? 2 : i.fold.includes(first) ? 3 : 4)
    + (i.done ? 0.5 : 0) - (i.favorite ? 0.2 : 0);
  return GROUPS.map((g) => {
    const list = hits.filter((i) => i.kind === g.id)
      .sort((a, b) => score(a) - score(b) || String(b.sort).localeCompare(String(a.sort)) || a.title.length - b.title.length || a.title.localeCompare(b.title));
    return { group: g, items: list, total: list.length };
  }).filter((r) => r.total);
}

/* ---------- The search sheet ---------- */

function resultsMarkup(results, query, showAll) {
  if (!query.trim()) {
    return html`<p class="srch__hint">${icon('search')}<span>Tasks, workouts, exercises, templates, habits, categories and your calendar. Try “bench press”, “MBA” or “Sep 10 workout”.</span></p>`;
  }
  if (!results.length) return html`<p class="srch__hint">${icon('info')}<span>Nothing matches “${query.trim()}”. Patient lists aren’t searched here — use the Neurology tab.</span></p>`;
  return results.map(({ group, items, total }) => html`<section class="srch__group" aria-label="${group.label}">
    <h3 class="srch__title">${icon(group.icon)}${group.label}<span class="srch__count">${total}</span></h3>
    <ul class="srch__list">${(showAll.has(group.id) ? items : items.slice(0, PER_GROUP)).map((i) => html`<li>
      <button type="button" class="srch__item${i.done ? ' is-done' : ''}" data-sr="${i.kind}" data-sr-id="${i.id}"${i.subtask ? raw(' data-sr-sub="1"') : ''}>
        <span class="srch__name">${i.title}</span><span class="srch__sub">${i.sub}</span>
      </button></li>`)}</ul>
    ${total > PER_GROUP && !showAll.has(group.id) ? html`<button type="button" class="link-btn srch__more" data-sr-more="${group.id}">Show all ${total}</button>` : ''}
  </section>`);
}

async function openResult(kind, id, { subtask = false, items = [] } = {}) {
  if (kind === 'task') return subtask ? openSubtask(id) : openTask(id);
  if (kind === 'workout') return openPage('workout', `w/${id}`);
  if (kind === 'exercise') return openPage('workout', `exercise/${id}`);
  if (kind === 'template') return openPage('workout', `template/${id}`);
  if (kind === 'habit') return openPage('todo', 'habits');
  if (kind === 'category') return openPage('todo', 'categories');
  if (kind === 'event') return openEventDetails(items.find((i) => i.kind === 'event' && i.id === id)?.event);
  return null;
}

let open = false;

/**
 * Open search. Everything up to putting the cursor in the box happens straight
 * away, inside the tap, so the iPhone keyboard opens (like Quick Add).
 */
export function openSearch(initial = '') {
  if (open) return null;
  open = true;
  let items = [];
  let picked = null;
  const showAll = new Set();
  return openDialog({
    variant: 'top',
    className: 'srch accent-brand',
    dismissible: false,
    body: html`<div class="srch__box">
        ${icon('search')}<input type="search" class="srch__input" data-sr-input placeholder="Search everything" aria-label="Search everything"
          autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="120" value="${initial}">
        <button type="button" class="btn btn--sm btn--ghost" data-sr-close>Close</button>
      </div>
      <div class="srch__results" data-sr-results aria-live="polite"></div>`,
    onOpen(dlg, close) {
      const input = dlg.querySelector('[data-sr-input]');
      const out = dlg.querySelector('[data-sr-results]');
      input.focus({ preventScroll: true });
      let timer = null;
      const draw = () => setHTML(out, resultsMarkup(searchAll(items, input.value), input.value, showAll));
      draw();
      loadSearchData().then((all) => { items = all; draw(); }).catch((err) => console.error('Search couldn’t load', err));
      input.addEventListener('input', () => {
        clearTimeout(timer);
        showAll.clear();
        timer = setTimeout(draw, 90);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          out.querySelector('[data-sr]')?.click(); // the top result
        }
      });
      dlg.addEventListener('click', (event) => {
        if (event.target.closest('[data-sr-close]')) { close(null); return; }
        const more = event.target.closest('[data-sr-more]');
        if (more) { showAll.add(more.dataset.srMore); draw(); return; }
        const b = event.target.closest('[data-sr]');
        if (!b) return;
        picked = { kind: b.dataset.sr, id: b.dataset.srId, subtask: Boolean(b.dataset.srSub) };
        close('picked');
      });
    },
  }).then(async () => {
    open = false;
    if (picked) await openResult(picked.kind, picked.id, { subtask: picked.subtask, items });
  });
}

registerAction('search:open', () => openSearch());
registerQuickAdd({ id: 'search', label: 'Search', icon: 'search', accent: 'brand', order: 5, run: () => openSearch() });

// ⌘K / Ctrl+K anywhere; "/" anywhere but the To Do list (it has its own search)
document.addEventListener('keydown', (event) => {
  const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.key !== '/' || typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (currentRoute() === 'todo' && currentSubRoute() === '') return;
  event.preventDefault();
  openSearch();
});
