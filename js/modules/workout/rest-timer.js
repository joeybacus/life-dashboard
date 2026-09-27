/* Rest timer — between sets, and (usually a bit longer) between exercises.

   It stores when the rest ends (not a countdown), so it's right again the
   moment you unlock the phone. When it runs out while the app is open you get
   a chime (two notes before your next set, three before your next exercise),
   a glow around the screen, a buzz and a message. It's separate from the
   workout timer, which keeps running either way. The rest timer belongs to
   this device only. */
import { db } from '../../core/db.js';
import { state } from '../../core/state.js';
import { buzz, chime } from '../../core/feedback.js';
import { prefersReducedMotion } from '../../core/platform.js';
import { announce, toast } from '../../core/ui.js';
import { formatSeconds } from './model.js';

const META_KEY = 'restTimer';
const LATE_MS = 30_000; // ended longer ago than this (app was closed) → no alert

let rest = null; // { workoutId, kind: 'set' | 'exercise', label, startedAt, endsAt, totalSec }
let ticker = null;
const listeners = new Set();

export const currentRest = () => rest;
export const restLeftMs = (now = Date.now()) => (rest ? Math.max(0, Date.parse(rest.endsAt) - now) : 0);

/** fn(rest|null) runs when a rest starts, changes or ends. */
export function onRestChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  listeners.forEach((fn) => fn(rest));
}

function persist() {
  const write = rest ? db.put('meta', { key: META_KEY, value: rest }) : db.delete('meta', META_KEY);
  write.catch((err) => console.warn('Rest timer not saved', err));
}

export async function initRestTimer() {
  rest = (await db.get('meta', META_KEY))?.value ?? null;
  if (rest && restLeftMs() <= 0) {
    rest = null; // it ended while the app was closed
    persist();
  }
  if (rest) startTicking();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && rest) tick();
  });
}

/** Start (or restart) the rest timer. kind: 'set' (between sets) or 'exercise' (before the next exercise). */
export function startRest(seconds, { workoutId = null, label = '', kind = 'set' } = {}) {
  if (!(seconds > 0)) return;
  const now = Date.now();
  rest = {
    workoutId,
    kind,
    label,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + seconds * 1000).toISOString(),
    totalSec: seconds,
  };
  persist();
  startTicking();
  changed();
}

/** Add (or with a negative number, take off) seconds. */
export function adjustRest(deltaSec) {
  if (!rest) return;
  const endsAt = Date.parse(rest.endsAt) + deltaSec * 1000;
  if (endsAt <= Date.now()) {
    stopRest();
    return;
  }
  rest = { ...rest, endsAt: new Date(endsAt).toISOString(), totalSec: Math.max(1, rest.totalSec + deltaSec) };
  persist();
  changed();
  tick();
}

export function stopRest() {
  if (!rest) return;
  rest = null;
  persist();
  stopTicking();
  changed();
}

function startTicking() {
  if (!ticker) ticker = setInterval(tick, 250);
  tick();
}

function stopTicking() {
  clearInterval(ticker);
  ticker = null;
}

/** Update every countdown on screen: [data-rest-left] shows m:ss, [data-rest-bar] gets --p (0–1 used). */
function tick() {
  if (!rest) {
    stopTicking();
    return;
  }
  if (document.visibilityState !== 'visible') return;
  const left = restLeftMs();
  const text = formatSeconds(Math.ceil(left / 1000));
  document.querySelectorAll('[data-rest-left]').forEach((el) => {
    if (el.textContent !== text) el.textContent = text;
  });
  const used = 1 - left / (rest.totalSec * 1000);
  document.querySelectorAll('[data-rest-bar]').forEach((el) => el.style.setProperty('--p', Math.min(1, Math.max(0, used)).toFixed(4)));
  if (left <= 0) finish();
}

/** A soft glow around the edge of the screen, easy to notice from a distance. */
function glow() {
  if (prefersReducedMotion()) return;
  const el = document.createElement('div');
  el.className = 'rest-glow';
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  setTimeout(() => el.remove(), 2000);
}

function finish() {
  const ended = rest;
  rest = null;
  persist();
  stopTicking();
  changed();
  if (Date.now() - Date.parse(ended.endsAt) > LATE_MS) return;
  const settings = state.settings.workout;
  if (settings.restAlert) {
    chime(ended.kind, { onSilent: settings.restOnSilent });
    buzz();
  }
  glow();
  const message = ended.kind === 'exercise'
    ? `Rest over — next exercise${ended.label ? `: ${ended.label}` : ''}`
    : `Rest over — ${ended.label ? `next: ${ended.label}` : 'time for your next set'}`;
  toast(message, { icon: 'timer', duration: 5000 });
  announce(ended.kind === 'exercise' ? 'Rest over. Time for your next exercise.' : 'Rest over. Time for your next set.');
}
