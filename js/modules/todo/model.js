/* To-do tasks — plain helpers with no database: the shape of a task, priorities,
   overdue, sorting, the smart views, search, and the words shown for each task.
   Everything uses Manila time (js/core/manila.js).

   A task (store "tasks", the Sheet's Tasks tab):
     id, title, notes, priority ('high' | 'medium' | 'low' | 'none'), categoryId, tags [],
     date ('YYYY-MM-DD', Manila) or null, startTime / endTime ('HH:MM') or null,
     allDay (it has a date but no time), status ('open' | 'done'), completedAt,
     pinned, manualOrder (for Manual sorting), links [{ id, title, url }],
     reminders [], followUp, addToCalendar, recurrence, seriesId (used by later releases),
     createdAt, updatedAt, deletedAt (deleting only marks it; Recently deleted shows it for 30 days)
   A subtask (store "subtasks"): id, taskId, title, done, order.
   A category (store "taskCategories"): id, name, color, icon, order. */
import { addDays, at, daysFrom, formatClock, formatClockRange, formatStamp, relativeDay, sheetTime, todayKey } from '../../core/manila.js';

export const PRIORITIES = {
  high: { label: 'High', short: 'High', rank: 0 },
  medium: { label: 'Medium', short: 'Med', rank: 1 },
  low: { label: 'Low', short: 'Low', rank: 2 },
  none: { label: 'None', short: 'None', rank: 3 },
};
export const PRIORITY_KEYS = ['high', 'medium', 'low', 'none'];

export const VIEWS = {
  today: { label: 'Today', icon: 'sun' },
  upcoming: { label: 'Upcoming', icon: 'calendar' },
  overdue: { label: 'Overdue', icon: 'flag' },
  category: { label: 'By category', short: 'Categories', icon: 'layers' },
  all: { label: 'All', icon: 'list' },
  completed: { label: 'Completed', short: 'Done', icon: 'checkCircle' },
};
export const VIEW_KEYS = Object.keys(VIEWS);

/**
 * The view tabs to show, in your order (Settings → Tasks → Views). The view the
 * To Do screen opens on always shows, and views added by later versions appear
 * at the end.
 */
export function visibleViews(views = {}, opensOn = 'today') {
  const order = [...(views.order ?? []).filter((k) => VIEWS[k]), ...VIEW_KEYS.filter((k) => !(views.order ?? []).includes(k))];
  const hidden = new Set(views.hidden ?? []);
  return order.filter((k) => !hidden.has(k) || k === opensOn);
}

export const SORTS = {
  smart: 'Smart',
  priority: 'Priority',
  time: 'Time',
  recent: 'Recently added',
  category: 'Category',
  manual: 'Manual',
};

export const COMPLETED_MODES = {
  keep: 'Keep visible',
  move: 'Move to Completed',
  hide: 'Hide',
};

/* The cross-shaped quick menu: Complete sits in the middle; each of the four arms
   can hold any of these (Settings → Tasks → Quick menu). Actions marked "soon"
   arrive with a later release; until then their arm shows a stand-in. */
export const QUICK_ACTIONS = {
  complete: { label: 'Complete', icon: 'check' },
  reminder: { label: 'Reminder', icon: 'bell', soon: true },
  details: { label: 'Details', icon: 'edit' },
  delete: { label: 'Delete', icon: 'trash' },
  focus: { label: 'Focus', icon: 'timer', soon: true },
  tomorrow: { label: 'Tomorrow', long: 'Move to tomorrow', icon: 'arrowRight' },
  priority: { label: 'Priority', long: 'Change priority', icon: 'flag' },
  category: { label: 'Category', long: 'Move category', icon: 'layers' },
  subtask: { label: 'Subtask', long: 'Add subtask', icon: 'plusCircle' },
  pin: { label: 'Pin', icon: 'pushpin' },
  calendar: { label: 'Calendar', long: 'Add to Google Calendar', icon: 'calendar', soon: true },
};
export const QUICK_ARMS = ['up', 'right', 'down', 'left'];
export const ARM_NAMES = { up: 'Top', right: 'Right', down: 'Bottom', left: 'Left' };
const ARM_DEFAULTS = { up: 'reminder', right: 'details', down: 'delete', left: 'focus' };
const STAND_INS = { reminder: 'tomorrow', focus: 'pin', calendar: 'category' };
export const quickActionReady = (id) => Boolean(QUICK_ACTIONS[id]) && !QUICK_ACTIONS[id].soon;

/** What each arm holds: your choice, or the default (Reminder, Details, Delete, Focus — with stand-ins until those exist). */
export function quickArms(saved = {}) {
  const arms = {};
  QUICK_ARMS.forEach((arm) => {
    const want = QUICK_ACTIONS[saved?.[arm]] && saved[arm] !== 'complete' ? saved[arm] : ARM_DEFAULTS[arm];
    arms[arm] = quickActionReady(want) ? want : STAND_INS[want] ?? 'details';
  });
  return arms;
}

/** How long deleted tasks stay in Recently deleted. They're never erased: the Sheet keeps them. */
export const DELETED_DAYS = 30;
export const UPCOMING_DAYS = 7;
export const MAX_TITLE = 300;
export const MAX_NOTES = 5000;

/* Starting categories get a colour and an icon; every category can be changed in Settings. */
export const CATEGORY_COLORS = ['#38bdf8', '#2dd4bf', '#a78bfa', '#818cf8', '#f472b6', '#fb923c', '#fb7185', '#a3e635', '#facc15', '#94a3b8'];
export const COLOR_NAMES = ['Sky blue', 'Teal', 'Violet', 'Indigo', 'Pink', 'Orange', 'Rose', 'Lime', 'Yellow', 'Grey'];
export const CATEGORY_ICONS = {
  layers: 'Stack', stethoscope: 'Stethoscope', brain: 'Brain', briefcase: 'Briefcase', book: 'Book', clipboard: 'Clipboard', chart: 'Chart',
  user: 'Person', heart: 'Heart', dumbbell: 'Dumbbell', star: 'Star', target: 'Target', calendar: 'Calendar', note: 'Note',
};
const STARTING_STYLE = {
  'cat-hospital': ['#2dd4bf', 'stethoscope'],
  'cat-residency': ['#a78bfa', 'brain'],
  'cat-mba': ['#38bdf8', 'briefcase'],
  'cat-nu': ['#818cf8', 'book'],
  'cat-research': ['#f472b6', 'clipboard'],
  'cat-business': ['#fb923c', 'chart'],
  'cat-personal': ['#fb7185', 'heart'],
};

export function categoryStyle(category) {
  const [color, iconName] = STARTING_STYLE[category?.id] ?? [CATEGORY_COLORS[(category?.order ?? 0) % CATEGORY_COLORS.length], 'layers'];
  return { color: category?.color || color, icon: category?.icon || iconName };
}

/** A new task with every field present. */
export function newTask(fields = {}) {
  return {
    title: '',
    notes: '',
    priority: 'none',
    categoryId: null,
    tags: [],
    date: null,
    startTime: null,
    endTime: null,
    allDay: false,
    status: 'open',
    completedAt: null,
    pinned: false,
    manualOrder: -Date.now() / 1000, // new tasks go to the top of a Manual list
    links: [],
    reminders: [],
    followUp: null,
    addToCalendar: false,
    recurrence: null,
    seriesId: null,
    ...fields,
  };
}

/** Fill in fields older saved tasks may lack (the v0.1 preview stored completed: true/false). */
export function normalizeTask(t) {
  const task = { ...newTask({ manualOrder: 0 }), ...t };
  if (!t.status) task.status = t.completed ? 'done' : 'open';
  delete task.completed;
  if (!PRIORITIES[task.priority]) task.priority = 'none';
  if (!Array.isArray(task.tags)) task.tags = [];
  if (!Array.isArray(task.links)) task.links = [];
  task.reminders = (Array.isArray(task.reminders) ? task.reminders : [])
    .map((r, i) => (typeof r === 'number' ? { id: `r${i}`, kind: 'before', minutes: r } : r))
    .filter((r) => r && typeof r === 'object');
  task.allDay = Boolean(task.date && !task.startTime);
  return task;
}

export const isDone = (t) => t.status === 'done';
const rank = (t) => PRIORITIES[t.priority]?.rank ?? 3;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** When a task is due: its end (or start) time, or the end of its day when it has no time. */
export function dueAt(t) {
  if (!t.date) return null;
  if (!t.startTime) return at(addDays(t.date, 1), '00:00');
  if (!t.endTime) return at(t.date, t.startTime);
  // "11 PM – 1 AM" ends the next day
  return at(t.endTime > t.startTime ? t.date : addDays(t.date, 1), t.endTime);
}

export function isOverdue(t, now = Date.now()) {
  if (isDone(t) || t.deletedAt || !t.date) return false;
  return dueAt(t).getTime() <= now;
}

/** Sorts by day then time: timed tasks before untimed ones on the same day; no date last. */
const timeKey = (t) => `${t.date ?? '9999-12-31'} ${t.startTime ?? '99:99'}`;

/**
 * Sort a list. Overdue tasks come first, then pinned ones (except in Manual
 * order, which is exactly your order); open tasks before done ones.
 */
export function sortTasks(tasks, mode, { now = Date.now(), categories = new Map() } = {}) {
  const catOrder = (t) => categories.get(t.categoryId)?.order ?? 999;
  const compare = {
    smart: (a, b) => rank(a) - rank(b) || cmp(timeKey(a), timeKey(b)),
    priority: (a, b) => rank(a) - rank(b) || cmp(timeKey(a), timeKey(b)),
    time: (a, b) => cmp(timeKey(a), timeKey(b)) || rank(a) - rank(b),
    recent: (a, b) => cmp(b.createdAt ?? '', a.createdAt ?? ''),
    category: (a, b) => catOrder(a) - catOrder(b) || rank(a) - rank(b) || cmp(timeKey(a), timeKey(b)),
  }[mode] ?? ((a, b) => rank(a) - rank(b) || cmp(timeKey(a), timeKey(b)));

  const open = tasks.filter((t) => !isDone(t));
  const done = tasks.filter(isDone).sort((a, b) => cmp(b.completedAt ?? '', a.completedAt ?? ''));
  if (mode === 'manual') {
    open.sort((a, b) => (a.manualOrder ?? 0) - (b.manualOrder ?? 0) || cmp(a.createdAt ?? '', b.createdAt ?? ''));
  } else {
    open.sort((a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now))
      || Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || compare(a, b)
      || cmp(a.createdAt ?? '', b.createdAt ?? ''));
  }
  return [...open, ...done];
}

/** Done today (Manila)? Done tasks from earlier days live in the Completed view. */
const doneToday = (t, today) => isDone(t) && t.completedAt && todayKey(Date.parse(t.completedAt)) === today;

/** Is this task part of a view (ignoring whether it's done)? */
function inView(view, t, today, now) {
  switch (view) {
    case 'today': return Boolean(t.pinned) || (Boolean(t.date) && t.date <= today);
    case 'upcoming': return Boolean(t.date) && t.date > today && t.date <= addDays(today, UPCOMING_DAYS);
    case 'overdue': return isOverdue(t, now);
    default: return true;
  }
}

/**
 * The tasks of a view, in groups: [{ key, title, tasks }]. Done tasks follow the
 * Completed-tasks setting: keep (in place, after the open ones), move (a separate
 * "Completed" group at the end) or hide (counted in `hidden`).
 */
export function viewGroups(view, tasks, { now = Date.now(), sort = 'smart', completed = 'keep', categories = new Map() } = {}) {
  const today = todayKey(now);
  const live = tasks.filter((t) => !t.deletedAt);

  if (view === 'completed') {
    const done = live.filter(isDone).sort((a, b) => cmp(b.completedAt ?? '', a.completedAt ?? ''));
    const byDay = new Map();
    done.forEach((t) => {
      const key = t.completedAt ? todayKey(Date.parse(t.completedAt)) : 'unknown';
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(t);
    });
    return {
      groups: [...byDay].map(([key, list]) => ({ key, title: key === 'unknown' ? 'Earlier' : relativeDay(key, today), tasks: list })),
      hidden: 0,
      total: done.length,
    };
  }

  const members = live.filter((t) => inView(view, t, today, now));
  const open = members.filter((t) => !isDone(t));
  const done = view === 'overdue' ? [] : members.filter((t) => doneToday(t, today));
  const shownDone = completed === 'keep' ? done : [];
  const sorted = sortTasks([...open, ...shownDone], sort, { now, categories });
  let groups;

  if (view === 'upcoming') {
    groups = Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(today, i + 1)).map((key) => ({
      key, title: relativeDay(key, today), sub: key, tasks: sorted.filter((t) => t.date === key),
    }));
  } else if (view === 'category') {
    const ids = [...categories.values()].filter((c) => !c.deletedAt).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => c.id);
    const known = new Set(ids);
    groups = [...ids, null].map((id) => ({
      key: id ?? 'none',
      title: id ? categories.get(id).name : 'No category',
      categoryId: id,
      tasks: sorted.filter((t) => (id ? t.categoryId === id : !t.categoryId || !known.has(t.categoryId))),
    })).filter((g) => g.tasks.length);
  } else {
    groups = [{ key: view, title: '', tasks: sorted }];
  }

  if (completed === 'move' && done.length) {
    groups.push({ key: 'done', title: 'Completed today', done: true, tasks: done.sort((a, b) => cmp(b.completedAt ?? '', a.completedAt ?? '')) });
  }
  return { groups, hidden: completed === 'hide' ? done.length : 0, total: open.length };
}

/** Open-task counts for the view tabs. */
export function viewCounts(tasks, now = Date.now()) {
  const today = todayKey(now);
  const open = tasks.filter((t) => !t.deletedAt && !isDone(t));
  return {
    today: open.filter((t) => inView('today', t, today, now)).length,
    upcoming: open.filter((t) => inView('upcoming', t, today, now)).length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    all: open.length,
  };
}

/* ---------- Search (built to be reused by a universal search later) ---------- */

/** Lower case, without accents: "Résumé" → "resume". */
export const foldText = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Does a task match every word of the query (title, notes, tags or category)? */
export function matchesTask(t, query, categoryName = '') {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  // Tags are searched as "@tag" and "#tag", so "paper", "@paper" and "#paper" all find them
  const haystack = foldText([t.title, t.notes, ...(t.tags ?? []).map((tag) => `@${tag} #${tag}`), categoryName].join(' \n '));
  return words.every((w) => haystack.includes(w));
}

export function searchTasks(tasks, query, categories = new Map()) {
  if (!String(query ?? '').trim()) return tasks;
  return tasks.filter((t) => matchesTask(t, query, categories.get(t.categoryId)?.name ?? ''));
}

/* ---------- Words for a task ---------- */

/** The Time column: { main, sub } — e.g. "8:00 PM", or "Tomorrow" + "8:00 – 9:00 PM", or "No time". */
export function timeCell(t, today = todayKey()) {
  const clock = t.startTime ? formatClockRange(t.startTime, t.endTime) : '';
  if (!t.date) return { main: 'No date', sub: '' };
  if (t.date === today) return { main: clock || 'No time', sub: '' };
  return { main: relativeDay(t.date, today), sub: clock };
}

/** "Overdue", or "Overdue · Yesterday" / "Overdue · 3 days". */
export function overdueText(t, today = todayKey()) {
  if (!t.date || t.date >= today) return 'Overdue';
  const days = daysFrom(t.date, today);
  return `Overdue · ${days === 1 ? 'Yesterday' : `${days} days`}`;
}

/** Plain words for the time, for VoiceOver: "Today, 8:00 PM to 9:00 PM". */
export function spokenTime(t, today = todayKey()) {
  if (!t.date) return 'No date';
  const day = relativeDay(t.date, today);
  if (!t.startTime) return `${day}, no time`;
  return `${day}, ${formatClock(t.startTime)}${t.endTime ? ` to ${formatClock(t.endTime)}` : ''}`;
}

/** What VoiceOver reads for a row: "High priority. Finish neurology report. Today, 8:00 PM to 9:00 PM. Hospital. Not done." */
export function spokenRow(t, { category = null, subtasks = null, now = Date.now() } = {}) {
  const today = todayKey(now);
  const parts = [
    t.priority && t.priority !== 'none' ? `${PRIORITIES[t.priority].label} priority` : 'No priority',
    t.title || 'Untitled task',
    isOverdue(t, now) ? `${overdueText(t, today)}. ${spokenTime(t, today)}` : spokenTime(t, today),
  ];
  if (category) parts.push(category.name);
  if (t.pinned) parts.push('Pinned');
  if (subtasks?.total) parts.push(`${subtasks.done} of ${subtasks.total} subtasks done`);
  if (t.reminders?.length) parts.push('Reminder on');
  if (t.addToCalendar) parts.push('In Google Calendar');
  if (t.recurrence) parts.push('Repeats');
  if (t.links?.length) parts.push(`${t.links.length} ${t.links.length === 1 ? 'link' : 'links'}`);
  parts.push(isDone(t) ? `Done${t.completedAt ? ` ${formatStamp(t.completedAt, now)}` : ''}` : 'Not done');
  return `${parts.join('. ')}.`;
}

/** Subtask progress per task id: Map(taskId → { done, total }). */
export function subtaskProgress(subtasks) {
  const map = new Map();
  subtasks.filter((s) => !s.deletedAt).forEach((s) => {
    const p = map.get(s.taskId) ?? { done: 0, total: 0 };
    p.total += 1;
    if (s.done) p.done += 1;
    map.set(s.taskId, p);
  });
  return map;
}

/* ---------- Tags and links ---------- */

/** "school, #paper  , School" → ["school", "paper"] (no duplicates, no #). */
export function parseTags(text) {
  const out = [];
  String(text ?? '').split(/[,\n]/).map((t) => t.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).forEach((tag) => {
    if (!out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  });
  return out.slice(0, 20);
}

/** A link typed by hand: adds https:// when missing; null if it isn't a web address. */
export function cleanUrl(text) {
  let value = String(text ?? '').trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A short title for a link: the page's host, like "docs.google.com". */
export function linkTitle(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/* ---------- Duplicates (never merged or deleted automatically) ---------- */

/** Another open task with the same title, date and time, created within a minute of this one. */
export function possibleDuplicate(task, tasks) {
  const title = foldText(task.title).trim();
  const created = Date.parse(task.createdAt ?? '');
  return tasks.find((t) => t.id !== task.id && !t.deletedAt && !isDone(t)
    && foldText(t.title).trim() === title && (t.date ?? '') === (task.date ?? '') && (t.startTime ?? '') === (task.startTime ?? '')
    && Math.abs(Date.parse(t.createdAt ?? '') - created) <= 60_000) ?? null;
}

/* ---------- CSV export ---------- */

function csvField(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // never run as a formula in Excel
  return /[",\n\r]/.test(text) || text === '' ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Tasks as CSV (opens in Excel, Numbers and Google Sheets). Times are Manila time. */
export function tasksToCsv(tasks, { categories = new Map(), progress = new Map() } = {}) {
  const header = ['Title', 'Status', 'Priority', 'Date', 'Start', 'End', 'Category', 'Tags', 'Pinned', 'Subtasks',
    'Links', 'Notes', 'Created', 'Completed'];
  const lines = [header.map(csvField).join(',')];
  const sorted = [...tasks].sort((a, b) => cmp(timeKey(a), timeKey(b)) || cmp(a.createdAt ?? '', b.createdAt ?? ''));
  for (const t of sorted) {
    const p = progress.get(t.id);
    lines.push([
      t.title, isDone(t) ? 'Done' : 'Open', PRIORITIES[t.priority]?.label ?? 'None', t.date ?? '', t.startTime ?? '', t.endTime ?? '',
      categories.get(t.categoryId)?.name ?? '', (t.tags ?? []).join(', '), t.pinned ? 'Yes' : '',
      p ? `${p.done}/${p.total}` : '', (t.links ?? []).map((l) => l.url).join(' '), t.notes ?? '',
      sheetTime(t.createdAt), isDone(t) ? sheetTime(t.completedAt) : '',
    ].map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`; // the mark at the start tells Excel it's UTF-8
}
