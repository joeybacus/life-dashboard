/* Reminders that ring in the app — for tasks and for subtasks.

   While the app is open (on any tab) it checks every few seconds. When a
   reminder is due, a banner appears at the top with a chime and a light tap:
     Complete · Snooze · Stop · Open      (a follow-up adds Stop follow-ups)
   Stop — or leaving the banner for 5 minutes — means "I've seen it": if the
   task still isn't done, "Still not done" comes a couple of hours later
   (Settings → Tasks → Reminders), never during quiet hours. With "Keep ringing
   until I stop it" on, the chime repeats every few seconds and the banner stays
   until you tap one of its buttons. Anything that came due while the app was
   closed is listed in "Missed while the app was closed" when you open it.

   Nothing rings twice: what has rung is saved with the task (and synced), and
   before ringing the app first asks your Google Sheet for news, so a task
   ticked on another device stays quiet. The banner stays usable on top of any
   open pop-up. iPhone lets a web app make sound only while it's open on screen,
   and only after a tap — so for a locked phone there's the Google Calendar link:
   while an item is linked, Calendar rings for it and the app stays quiet. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { on, state } from '../../core/state.js';
import { actionSheet, announce, openDialog, promptDialog, toast } from '../../core/ui.js';
import { chime, haptic, unlockAudio } from '../../core/feedback.js';
import { db } from '../../core/db.js';
import { formatClock, clockOf, todayKey } from '../../core/manila.js';
import { syncNow, syncSnapshot } from '../../services/sync.js';
import { isOverdue, normalizeSub, normalizeTask, spokenTime, subtaskItem } from './model.js';
import { saveAlerts } from './store.js';
import {
  BANNER_TIMEOUT_MS, SNOOZE_PRESETS, afterSnooze, afterStop, afterStopFollowUps, alertTimeText, calendarRings, canRing, dueAlerts, followRules,
  markRung, minutesText, nextAlertAt, reminderSettings, tomorrowMorning,
} from './alerts.js';
import { toggleDone, toggleSubDone } from './task-actions.js';
import { openTask } from './detail.js';
import { openSubtask } from './subtask-sheet.js';

const TICK_MS = 20_000;   // the longest wait between checks while the app is on screen
const RING_EVERY_MS = 3000; // "Keep ringing until I stop it": the chime repeats this often
const LIVE_MS = 90_000;   // due within the last 90 seconds: ring it; earlier: it was missed while the app was closed
const SYNC_WAIT_MS = 4000;

const settings = () => reminderSettings(state.settings.tasks);

let timer = null;
let soon = null;
let running = null;
let again = false;
let banner = null;       // the banner element on screen
let current = null;      // what it shows
const queue = [];        // what rings next
let bannerTimer = null;
let ringTimer = null;
const keepRinging = () => Boolean(state.settings.tasks?.keepRinging);
let missedSheet = null;  // { add(entries) } while the missed list is open

/* ---------- Checking ---------- */

/**
 * Every task and subtask that could ring, as items (a subtask carries its task's
 * priority). Items Google Calendar rings for are left out: the phone never rings twice.
 */
async function candidates() {
  const [tasks, subtasks, linkList] = await Promise.all([db.all('tasks'), db.all('subtasks'), db.all('calendarLinks')]);
  const links = new Map(linkList.map((l) => [l.id, l]));
  const byId = new Map(tasks.map((t) => [t.id, normalizeTask(t)]));
  const busy = (x) => (x.reminders.length || x.alerts?.snooze || x.alerts?.follow?.next) && !calendarRings(x, links.get(x.id));
  const out = [];
  byId.forEach((t) => { if (busy(t)) out.push({ store: 'tasks', kind: 'task', id: t.id, item: t }); });
  subtasks.forEach((raw) => {
    const s = normalizeSub(raw);
    const parent = byId.get(s.taskId);
    if (parent && busy(s)) out.push({ store: 'subtasks', kind: 'subtask', id: s.id, item: subtaskItem(s, parent) });
  });
  return out;
}

/** Another device may have ticked it or rung it already: ask the Sheet first (only with automatic sync). */
async function askTheSheet() {
  const snap = syncSnapshot();
  if (!snap.connected || !snap.auto || !navigator.onLine) return false;
  try {
    await Promise.race([syncNow(), new Promise((resolve) => { setTimeout(resolve, SYNC_WAIT_MS); })]);
    return true;
  } catch {
    return false;
  }
}

async function check() {
  clearTimeout(timer);
  const s = settings();
  let list = await candidates();
  let now = Date.now();
  const find = () => list.map((x) => ({ ...x, rung: dueAlerts(x.item, s, now) })).filter((x) => x.rung.length);
  let due = find();
  if (due.length && await askTheSheet()) {
    list = await candidates();
    now = Date.now();
    due = find();
  }
  // A banner for something done or deleted meanwhile (here or elsewhere) goes away
  if (current && !current.demo && !list.some((x) => x.id === current.id && canRing(x.item))) closeBanner();

  const missed = [];
  for (const x of due) {
    const saved = await saveAlerts(x.store, x.id, (item) => markRung({ ...item, priority: x.item.priority }, x.rung, s, now));
    if (!saved) continue;
    const last = x.rung[x.rung.length - 1];
    const entry = { ...x, type: last.type, due: last.due, count: saved.alerts?.follow?.count ?? 0 };
    if (current?.id === x.id || queue.some((q) => q.id === x.id)) continue; // its banner is already up (or waiting)
    if (now - last.due <= LIVE_MS) queue.push(entry);
    else missed.push(entry);
  }
  if (missed.length) showMissed(missed);
  if (queue.length && !current) showNext();
  scheduleNext(list, s);
}

function scheduleNext(list, s) {
  clearTimeout(timer);
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  const next = Math.min(...list.map((x) => nextAlertAt(x.item, s, now) ?? Infinity));
  timer = setTimeout(checkReminders, Math.max(1000, Math.min(TICK_MS, next - now + 250)));
}

/** Check now (one check at a time; a request during one runs another after it). */
export function checkReminders() {
  if (running) {
    again = true;
    return running;
  }
  running = check().catch((err) => console.error('Reminder check failed', err)).finally(() => {
    running = null;
    if (again) {
      again = false;
      checkReminders();
    }
  });
  return running;
}

/** Soon, after a change (a burst of changes makes one check). */
function checkSoon() {
  clearTimeout(soon);
  soon = setTimeout(checkReminders, 400);
}

export function initReminders() {
  // iPhone: sound only after a tap since the app came on screen
  const armUnlock = () => document.addEventListener('pointerdown', () => unlockAudio(), { capture: true, passive: true, once: true });
  armUnlock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      armUnlock();
      checkReminders();
    } else {
      clearTimeout(timer);
    }
  });
  document.addEventListener('ld:dialogs', placeBanner);
  on('data', (event) => { if (event?.reason !== 'alerts') checkSoon(); });
  on('settings', ({ prev, next } = {}) => {
    if (JSON.stringify(prev?.tasks) !== JSON.stringify(next?.tasks)) checkSoon();
  });
  checkReminders();
}

/* ---------- The banner ---------- */

const heading = (e) => {
  if (e.demo) return 'Reminder (practice)';
  if (e.type === 'follow') {
    const limit = followRules(e.item, settings()).limit;
    return `Still not done · ${Math.min(e.count, limit)} of ${limit}`;
  }
  return e.type === 'snooze' ? 'Snoozed reminder' : 'Reminder';
};

function whenText(item, now = Date.now()) {
  if (!item.date) return '';
  const words = spokenTime(item, todayKey(now));
  return isOverdue(item, now) ? `Overdue · ${words}` : words;
}

function bannerMarkup(e) {
  const item = e.item;
  const when = whenText(item);
  const waiting = queue.length;
  return html`<div class="rbanner__top">
      <span class="rbanner__icon" aria-hidden="true">${icon('bell')}</span>
      <div class="rbanner__text" role="alert">
        <p class="rbanner__kind">${heading(e)}${when ? ` · ${when}` : ''}</p>
        <p class="rbanner__title">${item.title || 'Untitled task'}</p>
        ${e.kind === 'subtask' ? html`<p class="rbanner__sub">Subtask of ${item.parentTitle}</p>` : ''}
      </div>
      ${waiting ? html`<span class="rbanner__more" aria-label="${waiting} more after this">+${waiting}</span>` : ''}
    </div>
    <div class="rbanner__actions">
      <button type="button" class="btn btn--sm btn--accent" data-rb="complete">${icon('check')}Complete</button>
      <button type="button" class="btn btn--sm" data-rb="snooze">${icon('clock')}Snooze</button>
      <button type="button" class="btn btn--sm" data-rb="stop">Stop</button>
      <button type="button" class="btn btn--sm btn--ghost" data-rb="open">Open</button>
      ${e.type === 'follow' ? html`<button type="button" class="btn btn--sm btn--ghost rbanner__wide" data-rb="stopFollow">Stop follow-ups</button>` : ''}
    </div>`;
}

/** Keep the banner where it can be tapped: inside the top open pop-up, or on the page. */
function placeBanner() {
  if (!banner) return;
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body;
  if (banner.parentElement !== host) host.append(banner);
}

function showNext() {
  const e = queue.shift();
  if (!e) return;
  current = e;
  banner = document.createElement('section');
  banner.className = 'rbanner accent-todo';
  banner.setAttribute('aria-label', e.type === 'follow' ? 'Follow-up reminder' : 'Reminder');
  setHTML(banner, bannerMarkup(e));
  banner.addEventListener('click', onBannerClick);
  placeBanner();
  void banner.offsetWidth; // start the slide-in now, even if the screen hasn't redrawn yet
  banner.classList.add('is-in');
  const ring = () => {
    chime('reminder', { onSilent: Boolean(state.settings.workout?.restOnSilent) });
    haptic();
  };
  ring();
  announce(`${heading(e)}: ${e.item.title}`);
  clearTimeout(bannerTimer);
  clearInterval(ringTimer);
  if (keepRinging()) {
    // Settings → "Keep ringing until I stop it": the chime repeats until you tap a button
    // (while the app is on screen — iPhone pauses web apps that aren't)
    banner.classList.add('is-ringing');
    ringTimer = setInterval(() => { if (document.visibilityState === 'visible') ring(); }, RING_EVERY_MS);
  } else {
    // Untouched for 5 minutes: it counts as Stop (the follow-up is already lined up)
    bannerTimer = setTimeout(() => closeBanner(), BANNER_TIMEOUT_MS);
  }
}

function closeBanner() {
  clearTimeout(bannerTimer);
  clearInterval(ringTimer);
  const el = banner;
  banner = null;
  current = null;
  if (el) {
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }
  if (queue.length) setTimeout(showNext, 450);
}

/** Snooze for how long? Resolves with minutes, or null. */
async function askSnooze() {
  const s = settings();
  const morning = Math.round((tomorrowMorning(s) - Date.now()) / 60_000);
  const choice = await actionSheet({
    title: 'Snooze for…',
    items: [
      ...SNOOZE_PRESETS.map((m) => ({ label: minutesText(m), value: String(m), icon: 'clock' })),
      { label: '3 hours', value: '180', icon: 'clock' },
      { label: `Tomorrow, ${formatClock(s.defaultTime)}`, value: String(morning), icon: 'sun' },
      { label: 'Other…', value: 'custom', icon: 'edit' },
    ],
  });
  if (!choice) return null;
  if (choice !== 'custom') return Number(choice);
  const text = await promptDialog({ title: 'Snooze for how many minutes?', label: 'Minutes', value: '45', confirmLabel: 'Snooze', maxLength: 4, required: true, dismissible: false });
  const minutes = Math.round(Number(text));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 7 * 1440) {
    if (text != null) toast('Choose from 1 minute to 7 days.', { icon: 'info' });
    return null;
  }
  return minutes;
}

async function act(e, what) {
  const s = settings();
  const now = Date.now();
  if (what === 'complete') {
    if (e.kind === 'subtask') await toggleSubDone(e.id);
    else await toggleDone(e.id);
  } else if (what === 'snooze') {
    const minutes = await askSnooze();
    if (minutes == null) return false;
    await saveAlerts(e.store, e.id, (item) => afterSnooze(item, minutes, Date.now()));
    toast(`Snoozed until ${alertTimeText(Date.now() + minutes * 60_000)}.`, { icon: 'clock' });
  } else if (what === 'stop' || what === 'open') {
    await saveAlerts(e.store, e.id, (item) => afterStop({ ...item, priority: e.item.priority }, s, now));
    if (what === 'open') {
      if (e.kind === 'subtask') openSubtask(e.id);
      else openTask(e.id);
    }
  } else if (what === 'stopFollow') {
    await saveAlerts(e.store, e.id, (item) => afterStopFollowUps(item));
    toast(`No more follow-ups for “${e.item.title}”.`, { icon: 'bell' });
  }
  return true;
}

async function onBannerClick(event) {
  const b = event.target.closest('[data-rb]');
  if (!b || !current) return;
  const e = current;
  if (e.demo) {
    closeBanner();
    if (b.dataset.rb !== 'stop') toast('That was a practice reminder — nothing changed.', { icon: 'bell' });
    return;
  }
  if (b.dataset.rb === 'snooze') {
    const done = await act(e, 'snooze');
    if (done && current === e) closeBanner();
    return;
  }
  closeBanner();
  await act(e, b.dataset.rb);
}

/** Settings → Try a reminder: what a reminder looks and sounds like. */
export function tryReminder() {
  unlockAudio(); // it's a tap, so sound can play
  queue.unshift({
    demo: true, kind: 'task', type: 'reminder',
    item: { title: 'Finish STRAMA paper', date: todayKey(), startTime: clockOf(Date.now() + 30 * 60_000), endTime: null, status: 'open' },
  });
  if (current) closeBanner();
  else showNext();
}

registerAction('todo:try-reminder', () => tryReminder());

/* ---------- Missed while the app was closed ---------- */

const missedWhen = (e) => {
  const kind = e.type === 'follow' ? 'Follow-up' : e.type === 'snooze' ? 'Snoozed reminder' : 'Reminder';
  return `${kind} · ${alertTimeText(e.due)}`;
};

function missedRow(e, i) {
  return html`<li class="missed__item" data-i="${i}">
    <div class="missed__text">
      <p class="missed__title">${e.item.title || 'Untitled task'}</p>
      ${e.kind === 'subtask' ? html`<p class="missed__sub">Subtask of ${e.item.parentTitle}</p>` : ''}
      <p class="missed__when">${missedWhen(e)}</p>
    </div>
    <div class="missed__btns" data-m-btns>
      <button type="button" class="btn btn--sm btn--accent" data-m="complete" aria-label="Complete ${e.item.title}">${icon('check')}Complete</button>
      <button type="button" class="btn btn--sm" data-m="snooze" aria-label="Snooze ${e.item.title}">${icon('clock')}Snooze</button>
      <button type="button" class="btn btn--sm btn--ghost" data-m="open" aria-label="Open ${e.item.title}">Open</button>
    </div>
  </li>`;
}

function showMissed(entries) {
  if (missedSheet) {
    missedSheet.add(entries);
    return;
  }
  const list = [...entries];
  chime('reminder', { onSilent: Boolean(state.settings.workout?.restOnSilent) });
  openDialog({
    variant: 'sheet',
    className: 'missed-sheet accent-todo',
    title: 'Missed while the app was closed',
    body: html`<p class="dlg__msg">These came due while Life Dashboard wasn’t open. Anything you leave here reminds you again later if it’s still not done.</p>
      <ul class="missed" data-missed>${list.map(missedRow)}</ul>`,
    actions: [{ label: 'Done', value: 'done', variant: 'primary' }],
    onOpen(dlg) {
      const ul = dlg.querySelector('[data-missed]');
      missedSheet = {
        add(more) {
          more.forEach((e) => {
            list.push(e);
            ul.insertAdjacentHTML('beforeend', String(missedRow(e, list.length - 1)));
          });
        },
      };
      ul.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-m]');
        if (!b) return;
        const row = b.closest('[data-i]');
        const e = list[Number(row.dataset.i)];
        const what = b.dataset.m;
        const done = await act(e, what);
        if (!done) return;
        const note = { complete: 'Completed', snooze: 'Snoozed', open: 'Opened' }[what];
        setHTML(row.querySelector('[data-m-btns]'), html`<span class="missed__done">${icon('check')}${note}</span>`);
      });
    },
  }).then(() => { missedSheet = null; });
}
