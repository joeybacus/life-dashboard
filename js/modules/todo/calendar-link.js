/* The Google Calendar link (one way: tasks → events) — the app's side.

   A task, or a subtask with its own date, with "Add to Google Calendar"
   switched on becomes an event made by your sync script (version 5 for tasks,
   6 for subtasks), in the "Life Dashboard Tasks" calendar or one you choose
   (Settings → Tasks → Google Calendar). Its reminders become the event's
   alerts, so they ring even when your phone is locked; "Still not done"
   follow-ups come from Calendar too.

   Who rings: while an item's link says Linked, only Google Calendar does — the
   app shows the bell but stays quiet, so nothing rings twice. When the link is
   paused (no permission, calendar deleted, old script…) or not made yet, the
   app rings as usual.

   After this device sends changes to linked items, it asks the script to update
   their events straight away (otherwise the script's 30-minute check does).
   The script reports back in its "Calendar links" tab, which every device
   reads. An event deleted in Calendar is never made again: the app unlinks the
   item and says so. Sample tasks never go to Calendar. */
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { emit, on, state } from '../../core/state.js';
import { toast } from '../../core/ui.js';
import { todayKey } from '../../core/manila.js';
import { applyScriptRecords, callSyncScript, requestSync, syncScriptVersion, syncSnapshot } from '../../services/sync.js';
import { normalizeSub, normalizeTask } from './model.js';
import { saveSub, saveTask } from './store.js';

/** Why a link is paused (or not made), in plain words — the same as the script's Calendar links tab. */
export const CAL_REASONS = {
  'calendar-missing': 'The calendar was deleted or can’t be found — Settings → Tasks → Google Calendar → Try again.',
  'calendar-needs-auth': 'The sync script needs permission for Google Calendar: in Apps Script choose setup, click Run and allow access.',
  'calendar-failed': 'Google Calendar didn’t answer. It will try again.',
  'no-date': 'Add a date to put it in Google Calendar.',
  'removed-in-calendar': 'You deleted it in Google Calendar, so it won’t be made again.',
  done: 'Done — its event is marked ✓.',
  'done-removed': 'Done — its event was removed.',
};

const appUrl = () => `${location.origin}${location.pathname}`;
let lastError = null;    // the last problem talking to the script's Calendar part (for Settings)
let statusCache = null;  // the last calendarStatus answer
let pendingIds = new Set();
let pushTimer = null;

/* ---------- Reading ---------- */

/** Every link the script has reported: Map(item id → link). */
export async function loadLinks() {
  return new Map((await db.all('calendarLinks')).map((l) => [l.id, l]));
}

/** Can items of this kind go to Calendar here? { ok, message } — sync must be on, with a new enough script. */
export function calendarAvailability(kind = 'task') {
  if (!syncSnapshot().connected) return { ok: false, reason: 'no-sync', message: 'Needs sync with your Google Sheet (Settings → Sync).' };
  const version = syncScriptVersion() ?? 1;
  if (version < 5) return { ok: false, reason: 'old-script', message: 'Needs the updated sync script (Settings → Sync → Update the sync script).' };
  if (kind === 'subtask' && version < 6) return { ok: false, reason: 'old-script', message: 'Subtasks need sync script version 6 (Settings → Sync → Update the sync script).' };
  return { ok: true, reason: '', message: '' };
}

export { calendarRings } from './alerts.js';

/** { state, text } for the switch's line: off, waiting, linked, paused, deleted or no-date. */
export function linkStatus(item, link, kind = 'task') {
  if (item.sample) return { state: 'off', text: 'Sample tasks stay out of Google Calendar.' };
  if (!item.addToCalendar) return { state: 'off', text: 'Its reminders ring from Calendar too — even when your phone is locked.' };
  if (!item.date) return { state: 'no-date', text: CAL_REASONS['no-date'] };
  const available = calendarAvailability(kind);
  if (!available.ok) return { state: 'waiting', text: `On — ${available.message} Until then its reminders ring in the app.` };
  if (!link || (link.status === 'unlinked' && !link.reason)) return { state: 'waiting', text: 'On — it appears in Google Calendar shortly after this device syncs.' };
  if (link.status === 'linked') {
    if (link.reason === 'done') return { state: 'linked', text: CAL_REASONS.done };
    const where = `In Google Calendar${link.calendarName ? ` (${link.calendarName})` : ''}.`;
    return { state: 'linked', text: (item.reminders ?? []).length ? `${where} Its reminders ring from Calendar, even on a locked phone.` : `${where} Add a reminder above to get an alert.` };
  }
  if (link.status === 'deleted') return { state: 'deleted', text: CAL_REASONS['removed-in-calendar'] };
  if (link.status === 'paused') return { state: 'paused', text: `Paused: ${CAL_REASONS[link.reason] ?? 'Google Calendar isn’t available.'} Its reminders ring in the app meanwhile.` };
  return { state: 'waiting', text: CAL_REASONS[link.reason] ?? 'On — waiting for Google Calendar.' };
}

/** New tasks and subtasks with a time go to Calendar by themselves (Settings → "Always add timed tasks"). */
export const autoCalendar = (fields) => Boolean(state.settings?.tasks?.calendar?.always && fields?.date && fields?.startTime);

/* ---------- Talking to the script ---------- */

/** Ask the script to bring these items' events up to date now; its answers are kept like a pull. */
export async function syncEvents(ids = [], { all = false } = {}) {
  if (!calendarAvailability().ok) return null;
  try {
    const res = await callSyncScript('calendarSync', { ids: [...ids].slice(0, 500), all, appUrl: appUrl() });
    lastError = res.error || null;
    const links = Array.isArray(res.links) ? res.links : [];
    if (links.length) {
      await applyScriptRecords(links.map((record) => ({ store: 'calendarLinks', record })));
      emit('data', { reason: 'calendar' });
    }
    return res;
  } catch (err) {
    lastError = err.reason || err.code || 'calendar-failed';
    return null;
  }
}

/** Which calendars you own, which one tasks go into, and whether the 30-minute check runs. */
export async function fetchCalendarStatus() {
  if (!calendarAvailability().ok) return null;
  try {
    statusCache = await callSyncScript('calendarStatus');
    lastError = statusCache.error || null;
  } catch (err) {
    lastError = err.reason || err.code || 'calendar-failed';
    statusCache = err.data?.calendars ? err.data : { ok: false, error: lastError, message: err.data?.message ?? '' };
  }
  return statusCache;
}

/**
 * "Check" / "Try again": restart the 30-minute check and re-check every link (moving
 * events if you chose another calendar). create: make "Life Dashboard Tasks" again if it was deleted.
 */
export async function calendarTryAgain({ create = true } = {}) {
  if (!calendarAvailability().ok) return null;
  try {
    statusCache = await callSyncScript('calendarSetup', { create, appUrl: appUrl() });
    lastError = statusCache.error || null;
    const links = Array.isArray(statusCache.links) ? statusCache.links : [];
    if (links.length) await applyScriptRecords(links.map((record) => ({ store: 'calendarLinks', record })));
    emit('data', { reason: 'calendar' });
  } catch (err) {
    lastError = err.reason || err.code || 'calendar-failed';
    statusCache = { ok: false, error: lastError, message: err.data?.message ?? '' };
  }
  return statusCache;
}

export const calendarLastError = () => lastError;
export const cachedCalendarStatus = () => statusCache;

/* ---------- Switching it on and off ---------- */

/** Put an item in Google Calendar, or take it out (saved at once; its event follows after sync). */
export async function setInCalendar(kind, id, on) {
  const store = kind === 'subtask' ? 'subtasks' : 'tasks';
  const raw0 = await db.get(store, id);
  if (!raw0 || raw0.deletedAt) return;
  const item = kind === 'subtask' ? normalizeSub(raw0) : normalizeTask(raw0);
  if (item.sample) {
    toast('Sample tasks stay out of Google Calendar.', { icon: 'calendar' });
    return;
  }
  if (Boolean(item.addToCalendar) === on) return;
  if (kind === 'subtask') await saveSub({ ...item, addToCalendar: on });
  else await saveTask({ ...item, addToCalendar: on });
  const available = calendarAvailability(kind);
  if (!on) toast(`Taken out of Google Calendar: ${item.title}`, { icon: 'calendar', action: { label: 'Undo', onClick: () => setInCalendar(kind, id, true) } });
  else if (!item.date) toast('Add a date so it can go in Google Calendar.', { icon: 'calendar' });
  else if (!available.ok) toast(`Saved. ${available.message}`, { icon: 'calendar', duration: 6000 });
  else toast(`Adding to Google Calendar: ${item.title}`, { icon: 'calendar', action: { label: 'Undo', onClick: () => setInCalendar(kind, id, false) } });
}

/** Open tasks and subtasks with a time, from today on, that aren't in Calendar yet. */
async function timedFromToday() {
  const today = todayKey();
  const [tasks, subtasks] = await Promise.all([db.all('tasks'), db.all('subtasks')]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const want = (x) => !x.deletedAt && !x.sample && !x.addToCalendar && x.date && x.date >= today && x.startTime;
  const liveParent = (s) => byId.get(s.taskId) && !byId.get(s.taskId).deletedAt && byId.get(s.taskId).status !== 'done';
  return {
    tasks: tasks.filter((t) => want(t) && t.status !== 'done'),
    subtasks: calendarAvailability('subtask').ok ? subtasks.filter((s) => want(s) && !s.done && liveParent(s)) : [],
  };
}

/** How many open items with a time (from today) "Always add" would also put in Calendar now. */
export async function countTimedFromToday() {
  const found = await timedFromToday();
  return found.tasks.length + found.subtasks.length;
}

/** Settings → "Always add timed tasks" was just switched on: add the ones you already have too. Returns how many. */
export async function addTimedFromToday() {
  const found = await timedFromToday();
  for (const t of found.tasks) await saveTask({ ...normalizeTask(t), addToCalendar: true });
  for (const s of found.subtasks) await saveSub({ ...normalizeSub(s), addToCalendar: true });
  return found.tasks.length + found.subtasks.length;
}

/* ---------- The switch in the task and subtask sheets ---------- */

/** "Add to Google Calendar", with a line saying where it stands. */
export function calendarFieldMarkup(item, { kind = 'task', link = null } = {}) {
  const status = linkStatus(item, link, kind);
  return html`<label class="row tform__cal is-${status.state}" data-cal-field>
    <span class="row__text"><span class="row__label">${icon('calendar')}Add to Google Calendar</span>
      <span class="row__sub" data-cal-status>${status.text}</span></span>
    <input type="checkbox" class="switch" switch name="addToCalendar" data-cal-switch${raw(item.addToCalendar ? ' checked' : '')}${raw(item.sample ? ' disabled' : '')}>
  </label>`;
}

/**
 * Make the switch work. get(): the item now; set(on): keep the change;
 * kind: 'task' | 'subtask'. The line updates when the script reports back
 * (while the sheet is open). Returns { refresh(), stop() }.
 */
export function bindCalendarField(root, { get, set, kind = 'task', touched = () => {} }) {
  const field = root.querySelector('[data-cal-field]');
  const input = field.querySelector('[data-cal-switch]');
  let link = null;
  const refresh = () => {
    const item = get();
    input.checked = Boolean(item.addToCalendar);
    const status = linkStatus(item, link, kind);
    field.className = `row tform__cal is-${status.state}`;
    field.querySelector('[data-cal-status]').textContent = status.text;
  };
  const reload = async () => {
    const id = get().id;
    link = id ? (await db.get('calendarLinks', id)) ?? null : null;
    refresh();
  };
  input.addEventListener('change', () => {
    touched();
    set(input.checked);
    refresh();
    requestSync(1500); // a switch, not typing: send it (and update Calendar) soon
  });
  const off = on('data', (event) => { if (event?.reason === 'sync' || event?.reason === 'calendar') reload(); });
  reload();
  return { refresh, stop: off };
}

/* ---------- Keeping events up to date ---------- */

/** After this device sent changes: linked items (or ones just linked or unlinked) get their events updated now. */
async function afterPush({ items = [] } = {}) {
  const links = await loadLinks();
  // A task whose subtask is in Calendar counts too (its name, done or deleted change that event)
  const withLinkedSubs = new Set([...links.values()].filter((l) => l.item === 'subtask').map((l) => l.taskId));
  items.forEach(({ store, record }) => {
    if ((store === 'tasks' || store === 'subtasks') && (record.addToCalendar || links.has(record.id) || withLinkedSubs.has(record.id))) pendingIds.add(record.id);
  });
  if (!pendingIds.size) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const ids = [...pendingIds];
    pendingIds = new Set();
    await syncEvents(ids);
  }, 600);
}

/**
 * An event deleted in Google Calendar: the script marks its link "deleted" and
 * never makes it again. Here the item is unlinked (so it rings in the app again),
 * and you're told once.
 */
async function unlinkDeletedEvents() {
  const links = [...(await loadLinks()).values()].filter((l) => l.status === 'deleted');
  for (const l of links) {
    const kind = l.item === 'subtask' ? 'subtask' : 'task';
    const store = kind === 'subtask' ? 'subtasks' : 'tasks';
    const item = await db.get(store, l.id);
    if (!item || item.deletedAt || !item.addToCalendar) continue;
    if (kind === 'subtask') await saveSub({ ...normalizeSub(item), addToCalendar: false });
    else await saveTask({ ...normalizeTask(item), addToCalendar: false });
    toast(`“${item.title}” was deleted in Google Calendar, so it’s no longer linked. Its reminders ring in the app again.`, { icon: 'calendar', duration: 8000 });
  }
}

export function initCalendarLink() {
  on('sync:pushed', (detail) => { afterPush(detail).catch((err) => console.warn('Calendar update failed', err)); });
  on('data', (event) => {
    if (event?.reason === 'sync' || event?.reason === 'calendar') unlinkDeletedEvents().catch((err) => console.warn(err));
  });
  unlinkDeletedEvents().catch(() => {});
}
