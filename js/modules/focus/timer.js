/* Focus timer (Pomodoro): 25 minutes of focus, a 5-minute break, and a
   15-minute break after every 4 focus sessions (Settings → Focus).

   The running timer is stored by when it ends (not as a countdown), so it's
   right again the moment you unlock the phone. It belongs to this device
   (meta 'focusTimer'); finished sessions are saved in the focusSessions store
   and sync (the "Focus sessions" tab), and their minutes are added to the
   task they were for (task.focusMinutes).

   Running: { type: 'focus' | 'short' | 'long', taskId, title, startedAt,
              endsAt, plannedMinutes, pausedAt, pausedMs, done (focus sessions
              finished in this run of sessions) }
   Waiting for you (a break or the next focus didn't start by itself):
              { next: 'focus' | 'short' | 'long', taskId, title, done } */
import { db } from '../../core/db.js';
import { emit } from '../../core/events.js';
import { state } from '../../core/state.js';
import { saveRecord } from '../../core/records.js';
import { uid } from '../../core/ids.js';
import { nowISO } from '../../core/dates.js';
import { buzz, chime, unlockAudio } from '../../core/feedback.js';
import { announce, toast } from '../../core/ui.js';
import { getTask, saveTask } from '../todo/store.js';

const META_KEY = 'focusTimer';
const LATE_MS = 30_000;          // ended longer ago than this (the app was closed) → no chime
const MIN_SAVED_MS = 60_000;     // a session stopped before 1 minute isn't kept

export const TYPE_NAMES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const SHEET_TYPES = { focus: 'focus', short: 'shortBreak', long: 'longBreak' }; // as the Focus sessions tab names them

let timer = null;   // running, or waiting for you (see above), or null
let ticker = null;

const settings = () => state.settings.focus;
export const focusTimer = () => timer;
export const isRunning = () => Boolean(timer && timer.endsAt);
export const isPaused = () => Boolean(timer?.pausedAt);

/** Milliseconds left (frozen while paused). */
export function leftMs(now = Date.now()) {
  if (!timer?.endsAt) return 0;
  const end = Date.parse(timer.endsAt) + (timer.pausedAt ? now - Date.parse(timer.pausedAt) : 0);
  return Math.max(0, end - now);
}

/** "24:59" */
export function formatLeft(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const minutesOf = (type) => Math.max(1, Math.min(180, Number(settings()[type === 'focus' ? 'focus' : type]) || ({ focus: 25, short: 5, long: 15 })[type]));

function changed() {
  emit('focus', { timer });
}

function persist() {
  const write = timer ? db.put('meta', { key: META_KEY, value: timer }) : db.delete('meta', META_KEY);
  write.catch((err) => console.warn('Focus timer not saved', err));
}

export async function initFocusTimer() {
  timer = (await db.get('meta', META_KEY))?.value ?? null;
  if (timer?.endsAt && !timer.pausedAt && leftMs() <= 0) await finish({ late: true }); // it ended while the app was closed
  if (timer?.endsAt) startTicking();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timer?.endsAt) tick();
  });
  changed();
}

/**
 * Start a focus session or a break. task: { id, title } or null.
 * Keeps how many focus sessions are done in this run (for the long break).
 */
export function start(type = 'focus', { task = timer ? { id: timer.taskId, title: timer.title } : null, minutes = null } = {}) {
  unlockAudio(); // a tap: lets the end chime play
  const now = Date.now();
  const planned = Math.max(1, Math.min(180, Math.round(minutes ?? minutesOf(type))));
  timer = {
    type,
    taskId: task?.id ?? null,
    title: task?.title ?? '',
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + planned * 60_000).toISOString(),
    plannedMinutes: planned,
    pausedAt: null,
    pausedMs: 0,
    done: timer?.done ?? 0,
  };
  persist();
  startTicking();
  changed();
  announce(`${TYPE_NAMES[type]} started: ${planned} minutes.`);
}

export function pause() {
  if (!timer?.endsAt || timer.pausedAt) return;
  timer = { ...timer, pausedAt: nowISO() };
  persist();
  changed();
}

export function resume() {
  if (!timer?.pausedAt) return;
  unlockAudio();
  const paused = Date.now() - Date.parse(timer.pausedAt);
  timer = { ...timer, endsAt: new Date(Date.parse(timer.endsAt) + paused).toISOString(), pausedAt: null, pausedMs: (timer.pausedMs ?? 0) + paused };
  persist();
  startTicking();
  changed();
}

/** Add (or take off) minutes. */
export function adjust(minutes) {
  if (!timer?.endsAt) return;
  const endsAt = Date.parse(timer.endsAt) + minutes * 60_000;
  if (endsAt - (timer.pausedAt ? Date.parse(timer.pausedAt) : Date.now()) < 60_000) return; // keep at least a minute
  timer = { ...timer, endsAt: new Date(endsAt).toISOString(), plannedMinutes: Math.max(1, timer.plannedMinutes + minutes) };
  persist();
  changed();
  tick();
}

/** Stop: a focus session longer than a minute is kept (and counts for its task); breaks just end. */
export async function stop() {
  if (!timer) return null;
  const ended = timer;
  timer = null;
  persist();
  stopTicking();
  changed();
  if (ended.endsAt && ended.type === 'focus') return saveSession(ended, { completed: false, end: Date.now() - (ended.pausedAt ? Date.now() - Date.parse(ended.pausedAt) : 0) });
  return null;
}

/** Skip to what comes next (a break after focus, focus after a break). */
export async function skip() {
  if (!timer?.endsAt) return;
  await finish({ skipped: true });
}

/** Start what's waiting (after a session ended and breaks don't start by themselves). */
export function startNext() {
  if (!timer?.next) return;
  start(timer.next, { task: { id: timer.taskId, title: timer.title } });
}

function startTicking() {
  if (!ticker) ticker = setInterval(tick, 250);
  tick();
}

function stopTicking() {
  clearInterval(ticker);
  ticker = null;
}

/** Update every countdown on screen: [data-focus-left] shows m:ss, [data-focus-ring] gets --p (0–1 used). */
function tick() {
  if (!timer?.endsAt) {
    stopTicking();
    return;
  }
  if (document.visibilityState !== 'visible') return;
  const left = leftMs();
  const text = formatLeft(left);
  document.querySelectorAll('[data-focus-left]').forEach((el) => { if (el.textContent !== text) el.textContent = text; });
  const used = 1 - left / (timer.plannedMinutes * 60_000);
  document.querySelectorAll('[data-focus-ring]').forEach((el) => el.style.setProperty('--p', Math.min(1, Math.max(0, used)).toFixed(4)));
  if (left <= 0 && !timer.pausedAt) finish();
}

/** Save a focus session and add its minutes to its task. */
async function saveSession(t, { completed, end }) {
  const startMs = Date.parse(t.startedAt);
  const spent = end - startMs - (t.pausedMs ?? 0);
  if (spent < MIN_SAVED_MS) return null;
  const now = nowISO();
  const record = {
    id: uid(),
    taskId: t.taskId,
    title: t.title || '',
    type: SHEET_TYPES[t.type] ?? 'focus',
    start: t.startedAt,
    end: new Date(end).toISOString(),
    minutes: Math.round(spent / 60_000),
    plannedMinutes: t.plannedMinutes,
    completed,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await saveRecord('focusSessions', record);
  if (t.taskId && t.type === 'focus') {
    const task = await getTask(t.taskId);
    if (task && !task.deletedAt) await saveTask({ ...task, focusMinutes: (Number(task.focusMinutes) || 0) + record.minutes });
  }
  emit('data', { reason: 'focus' });
  return record;
}

/** A session ran out (or was skipped): save it, chime, and move on to what's next. */
async function finish({ late = false, skipped = false } = {}) {
  const ended = timer;
  if (!ended?.endsAt) return;
  const endMs = skipped ? Date.now() : Date.parse(ended.endsAt);
  const isFocus = ended.type === 'focus';
  const done = (ended.done ?? 0) + (isFocus && !skipped ? 1 : 0);
  const every = Math.max(2, Number(settings().every) || 4);
  const next = isFocus ? (done > 0 && done % every === 0 && !skipped ? 'long' : 'short') : 'focus';
  stopTicking();
  if (isFocus) await saveSession(ended, { completed: !skipped, end: endMs });

  const task = { id: ended.taskId, title: ended.title };
  const ranLong = Date.now() - endMs > LATE_MS;
  if (isFocus && settings().autoBreaks && !ranLong) {
    timer = { ...ended, done };
    start(next, { task });
  } else {
    timer = { next, taskId: ended.taskId, title: ended.title, done, endedType: ended.type, endedAt: new Date(endMs).toISOString() };
    persist();
    changed();
  }
  if (late || skipped) return;
  if (!ranLong) {
    chime(isFocus ? 'focus' : 'break', { onSilent: settings().onSilent });
    buzz();
  }
  const message = isFocus
    ? `Focus done${ended.title ? ` · ${ended.title}` : ''}. ${next === 'long' ? 'Time for a long break.' : 'Time for a short break.'}`
    : 'Break over — ready to focus again?';
  toast(message, { icon: 'timer', duration: 6000 });
  announce(message);
}

/** Dismiss what's waiting (after a session ended). */
export function dismiss() {
  if (!timer || timer.endsAt) return;
  timer = null;
  persist();
  changed();
}

/* ---------- Totals ---------- */

/** Every focus session (not deleted), newest first. */
export async function loadSessions() {
  return (await db.all('focusSessions')).filter((s) => !s.deletedAt && (s.type === 'focus' || !s.type))
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));
}

/** Minutes of a session (older records may only have start and end). */
export const sessionMinutes = (s) => (Number.isFinite(s.minutes) ? s.minutes : Math.max(0, Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000)) || 0);
