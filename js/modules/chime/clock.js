/* Chime clock (Neurology tab): the clock button where the + usually is opens a
   Pomodoro-style ring that chimes every 1, 3, 5, 10 or 15 minutes (or any
   number of minutes you type), over and over until you stop it — for timing
   exams, seizures, drips and the like. Or Pomodoro: work, then rest, then work
   again, round after round, with a different chime at each change. You pick the
   alarm sound and how loud it is.

   It belongs to this device (meta 'chimeClock') and is stored by when it
   started, not as a countdown, so it's right again the moment you unlock the
   phone. iPhone pauses web apps that aren't on screen, so chimes only sound
   while the app is open; a chime missed by more than a few seconds is skipped.

   { mode ('chime' | 'pomodoro'), every, work, rest (minutes), sound, volume (0–1),
     onSilent, startedAt, pausedAt, pausedMs,
     anchorMs (running time when the current interval or mode was picked),
     chimed (chimes so far since anchorMs) } — startedAt is null when stopped */
import { db } from '../../core/db.js';
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { openDialog } from '../../core/ui.js';
import { registerFab, refreshFab } from '../../core/quick-add.js';
import { ALARM_SOUNDS, buzz, chime, unlockAudio } from '../../core/feedback.js';

const META_KEY = 'chimeClock';
const PRESETS = [1, 3, 5, 10, 15];
const WORK_PRESETS = [15, 25, 45, 50];
const REST_PRESETS = [3, 5, 10, 15];
const LATE_MS = 5_000; // missed by more than this (the app was asleep) → no chime

let clock = {
  mode: 'chime', every: 5, work: 25, rest: 5, sound: 'bell', volume: 0.6,
  onSilent: true, startedAt: null, pausedAt: null, pausedMs: 0, anchorMs: 0, chimed: 0,
};
let ticker = null;
let sheet = null;          // the open sheet's element
let customOpen = null;     // which custom time is being typed: 'every', 'work' or 'rest'


const isRunning = () => Boolean(clock.startedAt);
const isPaused = () => Boolean(clock.pausedAt);
const isPomodoro = () => clock.mode === 'pomodoro';

/** How long it has been running (pauses left out). */
function runMs(now = Date.now()) {
  if (!clock.startedAt) return 0;
  return now - Date.parse(clock.startedAt) - clock.pausedMs - (clock.pausedAt ? now - Date.parse(clock.pausedAt) : 0);
}

const sinceAnchor = (now) => Math.max(0, runMs(now) - clock.anchorMs);

/** Where the clock is: rest (Pomodoro's rest part), ms left and the length of
    this part, chimes due so far, and when the last one was due. */
function where(now = Date.now()) {
  const s = sinceAnchor(now);
  if (!isPomodoro()) {
    const every = clock.every * 60_000;
    const count = Math.floor(s / every);
    return { rest: false, left: every - (s % every), total: every, count, lastAt: count * every, round: 0 };
  }
  const work = clock.work * 60_000;
  const cycle = work + clock.rest * 60_000;
  const rounds = Math.floor(s / cycle);
  const into = s % cycle;
  const rest = into >= work;
  const count = rounds * 2 + (rest ? 1 : 0); // a chime at the end of each work and each rest
  return {
    rest,
    left: (rest ? cycle : work) - into,
    total: rest ? cycle - work : work,
    count,
    lastAt: rounds * cycle + (rest ? work : 0),
    round: rounds + 1,
  };
}

/** The full length of the first part, shown before it starts. */
const firstMs = () => (isPomodoro() ? clock.work : clock.every) * 60_000;
const progress = (w) => (isRunning() ? 1 - w.left / w.total : 0);

/** "4:59", or "1:02:03" past an hour */
function formatMs(ms, round = Math.floor) {
  const s = round(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

const everyLabel = (m) => (Number.isInteger(m) ? `${m} min` : `${formatMs(m * 60_000, Math.round)}`);

function persist() {
  db.put('meta', { key: META_KEY, value: clock }).catch((err) => console.warn('Chime clock not saved', err));
}

function changed() {
  persist();
  refreshFab();
  paintSheet();
  if (isRunning() && !isPaused()) startTicking();
  else stopTicking();
}

function startTicking() {
  if (!ticker) ticker = setInterval(tick, 250);
}

function stopTicking() {
  clearInterval(ticker);
  ticker = null;
}

function tick() {
  if (!isRunning() || isPaused()) return;
  const now = Date.now();
  const w = where(now);
  if (w.count > clock.chimed) {
    const lateBy = sinceAnchor(now) - w.lastAt;
    clock.chimed = w.count;
    persist();
    if (lateBy <= LATE_MS) {
      // Pomodoro: rising notes when work is done, falling notes when rest is over
      ring(!isPomodoro() ? 'interval' : w.rest ? 'focus' : 'break');
      buzz();
    }
  }
  refreshFab();
  paintTime();
}

function ring(kind) {
  return chime(kind, { onSilent: clock.onSilent, sound: clock.sound, volume: clock.volume });
}

/* ---- Controls ---- */

function start() {
  unlockAudio(); // a tap: lets the chimes play
  Object.assign(clock, { startedAt: new Date().toISOString(), pausedAt: null, pausedMs: 0, anchorMs: 0, chimed: 0 });
  changed();
}

function pause() {
  clock.pausedAt = new Date().toISOString();
  changed();
}

function resume() {
  unlockAudio();
  clock.pausedMs += Date.now() - Date.parse(clock.pausedAt);
  clock.pausedAt = null;
  changed();
}

function reset() {
  Object.assign(clock, { startedAt: null, pausedAt: null, pausedMs: 0, anchorMs: 0, chimed: 0 });
  changed();
}

/** A new time or mode while running counts from now (Pomodoro starts again at work). */
function setTime(what, minutes) {
  clock[what] = minutes;
  restartPart();
}

function setMode(mode) {
  if (clock.mode === mode) return;
  clock.mode = mode;
  restartPart();
}

function restartPart() {
  if (isRunning()) Object.assign(clock, { anchorMs: runMs(), chimed: 0 });
  customOpen = null;
  changed();
}

function setSound(sound) {
  unlockAudio();
  clock.sound = sound;
  persist();
  paintSheet();
  ring(isPomodoro() ? 'focus' : 'interval'); // a sample
}

/* ---- The sheet ---- */

function statusLabel(w) {
  if (!isRunning()) return 'Ready';
  if (isPaused()) return 'Paused';
  if (!isPomodoro()) return 'Next chime';
  return w.rest ? 'Rest' : 'Work';
}

function totalLabel(now, w) {
  if (!isRunning()) return isPomodoro() ? `${everyLabel(clock.work)} work · ${everyLabel(clock.rest)} rest` : `Every ${everyLabel(clock.every)}`;
  if (isPomodoro()) return `Round ${w.round} · ${formatMs(runMs(now))} total`;
  return `${formatMs(runMs(now))} total · ${clock.chimed} ${clock.chimed === 1 ? 'chime' : 'chimes'}`;
}

function ringHTML() {
  const now = Date.now();
  const w = where(now);
  const resting = isRunning() && w.rest;
  return html`<div class="focus-ring chime-ring${isPaused() ? ' is-paused' : ''}${resting ? ' is-break' : ''}" data-chime-ring style="--p: ${progress(w).toFixed(4)}" role="timer" aria-label="${statusLabel(w)}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="focus-ring__track" cx="60" cy="60" r="52"/><circle class="focus-ring__bar" cx="60" cy="60" r="52" pathLength="1"/></svg>
    <div class="focus-ring__inner">
      <span class="focus-ring__type" data-chime-status>${statusLabel(w)}</span>
      <span class="focus-ring__time num" data-chime-left>${formatMs(isRunning() ? w.left : firstMs(), Math.ceil)}</span>
      <span class="focus-ring__plan" data-chime-total>${totalLabel(now, w)}</span>
    </div>
  </div>`;
}

/** A row of minute chips plus Custom, and the custom box when it's open. */
function timeChipsHTML(what, presets, label) {
  const value = clock[what];
  const custom = !presets.includes(value);
  return html`<div class="chime-sheet__group">
    <p class="field__label">${label}</p>
    <div class="chips chips--sm chime-sheet__chips">
      ${presets.map((m) => html`<button type="button" class="chip-toggle" data-chime="time" data-what="${what}" data-min="${m}" aria-pressed="${value === m ? 'true' : 'false'}">${m} min</button>`)}
      <button type="button" class="chip-toggle" data-chime="custom" data-what="${what}" aria-pressed="${custom || customOpen === what ? 'true' : 'false'}">${custom ? everyLabel(value) : 'Custom'}</button>
    </div>
    ${customOpen === what ? html`<form class="chime-sheet__custom" data-chime-form data-what="${what}">
      <label class="sr-only" for="chime-min">Minutes</label>
      <input id="chime-min" class="input" type="number" inputmode="decimal" min="0.25" max="240" step="any" placeholder="Minutes" value="${custom ? value : ''}">
      <span class="faint">min</span>
      <button type="submit" class="btn btn--sm btn--accent">Set</button>
      <button type="button" class="btn btn--sm btn--ghost" data-chime="custom-cancel">Cancel</button>
    </form>` : ''}
  </div>`;
}

function sheetHTML() {
  const pct = Math.round(clock.volume * 100);
  return html`<div class="chime-sheet">
    <div class="segmented chime-sheet__mode" role="radiogroup" aria-label="Kind of timer">
      ${[['chime', 'Chime'], ['pomodoro', 'Pomodoro']].map(([value, label]) => html`<label class="segmented__opt"><input type="radio" name="chime-mode" value="${value}" data-chime="mode"${raw(clock.mode === value ? ' checked' : '')}><span>${label}</span></label>`)}
    </div>
    ${ringHTML()}
    <div class="chime-sheet__section">
      ${isPomodoro()
        ? [timeChipsHTML('work', WORK_PRESETS, 'Work'), timeChipsHTML('rest', REST_PRESETS, 'Rest')]
        : timeChipsHTML('every', PRESETS, 'Chime every')}
      <div class="chime-sheet__group">
        <p class="field__label">Alarm sound <small class="faint">(tap to hear it)</small></p>
        <div class="chips chips--sm chime-sheet__chips">
          ${ALARM_SOUNDS.map(([id, label]) => html`<button type="button" class="chip-toggle" data-chime="sound" data-sound="${id}" aria-pressed="${clock.sound === id ? 'true' : 'false'}">${label}</button>`)}
        </div>
      </div>
      <div class="chime-sheet__group">
        <label class="field__label chime-sheet__vol-label" for="chime-vol">Volume <span class="num" data-chime-vol>${pct ? `${pct}%` : 'Off'}</span></label>
        <div class="chime-sheet__vol">
          ${icon('volume')}
          <input id="chime-vol" type="range" min="0" max="100" step="5" value="${pct}" data-chime="volume">
        </div>
        <small class="faint">The phone's own volume still counts too.</small>
      </div>
      <label class="chime-sheet__silent"><input type="checkbox" data-chime="silent"${raw(clock.onSilent ? ' checked' : '')}> Chime even when the iPhone is on silent <small class="faint">(pauses music while it rings)</small></label>
    </div>
    <div class="focus-card__btns chime-sheet__btns">
      ${!isRunning() ? html`<button type="button" class="btn btn--accent" data-chime="start">${icon('play')}Start</button>`
        : isPaused() ? html`<button type="button" class="btn btn--accent" data-chime="resume">${icon('play')}Resume</button>`
        : html`<button type="button" class="btn" data-chime="pause">${icon('pause')}Pause</button>`}
      ${isRunning() ? html`<button type="button" class="btn" data-chime="reset">${icon('stop')}Reset</button>` : ''}
      <button type="button" class="btn btn--ghost" data-chime="close">Close</button>
    </div>
  </div>`;
}

function paintSheet() {
  const slot = sheet?.querySelector('[data-chime-slot]');
  if (slot) setHTML(slot, sheetHTML());
}

/** Every tick: only the numbers and the ring move (so a half-typed custom time isn't lost). */
function paintTime() {
  const ring = sheet?.querySelector('[data-chime-ring]');
  if (!ring) return;
  const now = Date.now();
  const w = where(now);
  ring.style.setProperty('--p', progress(w).toFixed(4));
  ring.classList.toggle('is-break', w.rest);
  ring.querySelector('[data-chime-status]').textContent = statusLabel(w);
  ring.querySelector('[data-chime-left]').textContent = formatMs(w.left, Math.ceil);
  ring.querySelector('[data-chime-total]').textContent = totalLabel(now, w);
}

function openClock() {
  unlockAudio();
  customOpen = null;
  openDialog({
    variant: 'sheet',
    className: 'chime-dlg accent-neuro',
    title: 'Chime clock',
    dismissible: false, // only Close shuts it (a custom time may be half typed)
    body: html`<div data-chime-slot>${sheetHTML()}</div>`,
    onOpen(dlg, close) {
      sheet = dlg;
      dlg.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-chime]');
        const what = btn?.dataset.chime;
        if (what === 'time') setTime(btn.dataset.what, Number(btn.dataset.min));
        else if (what === 'sound') setSound(btn.dataset.sound);
        else if (what === 'custom') {
          customOpen = btn.dataset.what;
          paintSheet();
          sheet.querySelector('#chime-min')?.focus();
        } else if (what === 'custom-cancel') {
          customOpen = null;
          paintSheet();
        } else if (what === 'start') start();
        else if (what === 'pause') pause();
        else if (what === 'resume') resume();
        else if (what === 'reset') reset();
        else if (what === 'close') close(null);
      });
      dlg.addEventListener('change', (event) => {
        const what = event.target.dataset.chime;
        if (what === 'mode') setMode(event.target.value);
        else if (what === 'silent') {
          clock.onSilent = event.target.checked;
          persist();
        } else if (what === 'volume') {
          clock.volume = Number(event.target.value) / 100;
          persist();
          unlockAudio();
          ring(isPomodoro() ? 'focus' : 'interval'); // let go of the slider: hear how loud
        }
      });
      // While dragging the volume: just the number
      dlg.addEventListener('input', (event) => {
        if (event.target.dataset.chime !== 'volume') return;
        const pct = Number(event.target.value);
        sheet.querySelector('[data-chime-vol]').textContent = pct ? `${pct}%` : 'Off';
      });
      dlg.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = sheet.querySelector('#chime-min');
        const minutes = Math.round(Number(input.value) * 60) / 60; // to the second
        if (!(minutes >= 0.25 && minutes <= 240)) {
          input.setCustomValidity('Enter 0.25 to 240 minutes');
          input.reportValidity();
          input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
          return;
        }
        setTime(event.target.dataset.what, minutes);
      });
    },
  }).then(() => { sheet = null; });
}

registerAction('chime:open', () => openClock());

registerFab('neurology', {
  icon: 'clock',
  accent: 'neuro',
  label: 'Chime clock',
  action: 'chime:open',
  // While it runs: the time to the next chime instead of the clock, with a ring filling up
  paint(fab) {
    const on = isRunning();
    const w = where(Date.now());
    fab.classList.toggle('fab--clock-on', on);
    fab.classList.toggle('is-paused', isPaused());
    fab.classList.toggle('is-rest', on && w.rest);
    fab.style.setProperty('--p', progress(w).toFixed(4));
    let label = fab.querySelector('.fab__time');
    if (on && !label) {
      label = document.createElement('span');
      label.className = 'fab__time num';
      fab.append(label);
    }
    if (label) label.textContent = on ? formatMs(w.left, Math.ceil) : '';
    if (!on) label?.remove();
    const next = !isPomodoro() ? 'next chime' : w.rest ? 'rest ends' : 'work ends';
    fab.setAttribute('aria-label', on ? `Chime clock, ${next} in ${label.textContent}${isPaused() ? ', paused' : ''}` : 'Chime clock');
  },
});

export async function initChimeClock() {
  const saved = (await db.get('meta', META_KEY))?.value;
  if (saved) clock = { ...clock, ...saved };
  if (isRunning() && !isPaused()) {
    clock.chimed = where().count; // chimes missed while the app was closed stay silent
    startTicking();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  refreshFab();
}
