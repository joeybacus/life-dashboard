/* Chime clock (Neurology tab): the clock button where the + usually is opens a
   Pomodoro-style ring that chimes every 1, 3, 5, 10 or 15 minutes (or any
   number of minutes you type), over and over until you stop it — for timing
   exams, seizures, drips and the like.

   It belongs to this device (meta 'chimeClock') and is stored by when it
   started, not as a countdown, so it's right again the moment you unlock the
   phone. iPhone pauses web apps that aren't on screen, so chimes only sound
   while the app is open; a chime missed by more than a few seconds is skipped.

   { every (minutes), onSilent, startedAt, pausedAt, pausedMs,
     anchorMs (running time when the current interval was picked),
     chimed (chimes so far since anchorMs) } — startedAt is null when stopped */
import { db } from '../../core/db.js';
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { openDialog } from '../../core/ui.js';
import { registerFab, refreshFab } from '../../core/quick-add.js';
import { buzz, chime, unlockAudio } from '../../core/feedback.js';

const META_KEY = 'chimeClock';
const PRESETS = [1, 3, 5, 10, 15];
const LATE_MS = 5_000; // missed by more than this (the app was asleep) → no chime

let clock = { every: 5, onSilent: true, startedAt: null, pausedAt: null, pausedMs: 0, anchorMs: 0, chimed: 0 };
let ticker = null;
let sheet = null;          // the open sheet's element
let customOpen = false;

const isRunning = () => Boolean(clock.startedAt);
const isPaused = () => Boolean(clock.pausedAt);
const everyMs = () => clock.every * 60_000;

/** How long it has been running (pauses left out). */
function runMs(now = Date.now()) {
  if (!clock.startedAt) return 0;
  return now - Date.parse(clock.startedAt) - clock.pausedMs - (clock.pausedAt ? now - Date.parse(clock.pausedAt) : 0);
}

const sinceAnchor = (now) => Math.max(0, runMs(now) - clock.anchorMs);
const leftMs = (now) => everyMs() - (sinceAnchor(now) % everyMs());

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
  const count = Math.floor(sinceAnchor(now) / everyMs());
  if (count > clock.chimed) {
    const lateBy = sinceAnchor(now) - count * everyMs();
    clock.chimed = count;
    persist();
    if (lateBy <= LATE_MS) {
      chime('interval', { onSilent: clock.onSilent });
      buzz();
    }
  }
  refreshFab();
  paintTime();
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

/** A new interval while running counts from now. */
function setEvery(minutes) {
  clock.every = minutes;
  if (isRunning()) Object.assign(clock, { anchorMs: runMs(), chimed: 0 });
  customOpen = false;
  changed();
}

/* ---- The sheet ---- */

function ringHTML() {
  const now = Date.now();
  const p = isRunning() ? 1 - leftMs(now) / everyMs() : 0;
  const status = !isRunning() ? 'Ready' : isPaused() ? 'Paused' : 'Next chime';
  return html`<div class="focus-ring chime-ring${isPaused() ? ' is-paused' : ''}" data-chime-ring style="--p: ${p.toFixed(4)}" role="timer" aria-label="${status}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="focus-ring__track" cx="60" cy="60" r="52"/><circle class="focus-ring__bar" cx="60" cy="60" r="52" pathLength="1"/></svg>
    <div class="focus-ring__inner">
      <span class="focus-ring__type">${status}</span>
      <span class="focus-ring__time num" data-chime-left>${formatMs(isRunning() ? leftMs(now) : everyMs(), Math.ceil)}</span>
      <span class="focus-ring__plan" data-chime-total>${isRunning() ? `${formatMs(runMs(now))} total · ${clock.chimed} ${clock.chimed === 1 ? 'chime' : 'chimes'}` : `Every ${everyLabel(clock.every)}`}</span>
    </div>
  </div>`;
}

function sheetHTML() {
  const custom = !PRESETS.includes(clock.every);
  return html`<div class="chime-sheet">
    ${ringHTML()}
    <div class="chime-sheet__section">
      <p class="field__label">Chime every</p>
      <div class="chips chips--sm chime-sheet__chips">
        ${PRESETS.map((m) => html`<button type="button" class="chip-toggle" data-chime="every" data-min="${m}" aria-pressed="${clock.every === m ? 'true' : 'false'}">${m} min</button>`)}
        <button type="button" class="chip-toggle" data-chime="custom" aria-pressed="${custom || customOpen ? 'true' : 'false'}">${custom ? everyLabel(clock.every) : 'Custom'}</button>
      </div>
      ${customOpen ? html`<form class="chime-sheet__custom" data-chime-form>
        <label class="sr-only" for="chime-min">Minutes</label>
        <input id="chime-min" class="input" type="number" inputmode="decimal" min="0.25" max="240" step="any" placeholder="Minutes" value="${custom ? clock.every : ''}">
        <span class="faint">min</span>
        <button type="submit" class="btn btn--sm btn--accent">Set</button>
        <button type="button" class="btn btn--sm btn--ghost" data-chime="custom-cancel">Cancel</button>
      </form>` : ''}
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
  ring.style.setProperty('--p', (1 - leftMs(now) / everyMs()).toFixed(4));
  ring.querySelector('[data-chime-left]').textContent = formatMs(leftMs(now), Math.ceil);
  ring.querySelector('[data-chime-total]').textContent = `${formatMs(runMs(now))} total · ${clock.chimed} ${clock.chimed === 1 ? 'chime' : 'chimes'}`;
}

function openClock() {
  unlockAudio();
  customOpen = false;
  openDialog({
    variant: 'sheet',
    className: 'chime-dlg accent-neuro',
    title: 'Chime clock',
    dismissible: false, // only Close shuts it (a custom time may be half typed)
    body: html`<div data-chime-slot>${sheetHTML()}</div>`,
    onOpen(dlg, close) {
      sheet = dlg;
      dlg.addEventListener('click', (event) => {
        const what = event.target.closest('[data-chime]')?.dataset.chime;
        if (what === 'every') setEvery(Number(event.target.closest('[data-chime]').dataset.min));
        else if (what === 'custom') {
          customOpen = true;
          paintSheet();
          sheet.querySelector('#chime-min')?.focus();
        } else if (what === 'custom-cancel') {
          customOpen = false;
          paintSheet();
        } else if (what === 'start') start();
        else if (what === 'pause') pause();
        else if (what === 'resume') resume();
        else if (what === 'reset') reset();
        else if (what === 'close') close(null);
      });
      dlg.addEventListener('change', (event) => {
        if (event.target.dataset.chime !== 'silent') return;
        clock.onSilent = event.target.checked;
        persist();
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
        setEvery(minutes);
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
    fab.classList.toggle('fab--clock-on', on);
    fab.classList.toggle('is-paused', isPaused());
    fab.style.setProperty('--p', on ? (1 - leftMs(Date.now()) / everyMs()).toFixed(4) : '0');
    let label = fab.querySelector('.fab__time');
    if (on && !label) {
      label = document.createElement('span');
      label.className = 'fab__time num';
      fab.append(label);
    }
    if (label) label.textContent = on ? formatMs(leftMs(Date.now()), Math.ceil) : '';
    if (!on) label?.remove();
    fab.setAttribute('aria-label', on ? `Chime clock, next chime in ${label.textContent}${isPaused() ? ', paused' : ''}` : 'Chime clock');
  },
});

export async function initChimeClock() {
  const saved = (await db.get('meta', META_KEY))?.value;
  if (saved) clock = { ...clock, ...saved };
  if (isRunning() && !isPaused()) {
    clock.chimed = Math.floor(sinceAnchor(Date.now()) / everyMs()); // chimes missed while the app was closed stay silent
    startTicking();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  refreshFab();
}
