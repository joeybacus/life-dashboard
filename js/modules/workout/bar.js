/* The floating bar above the tab bar while a workout is in progress:
   - on other screens: "Push day · 23:41 · rest 1:12" — tap to go back to the workout
   - while resting, on the workout screen: the rest countdown (before your next
     set, or before your next exercise) with −15, +15, +30 and Skip
   It also keeps the screen on during a workout (Settings → Workout). */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { on, state } from '../../core/state.js';
import { currentRoute, currentSubRoute, onRoute } from '../../core/router.js';
import { liveElapsed } from '../../core/components.js';
import { announce } from '../../core/ui.js';
import { keepScreenOn } from '../../services/wake-lock.js';
import { getActiveWorkout, onActiveWorkout } from './store.js';
import { adjustRest, currentRest, onRestChange, restLeftMs, stopRest } from './rest-timer.js';
import { formatSeconds } from './model.js';

let bar = null;
let active = null;

const onLogPage = () => currentRoute() === 'workout' && currentSubRoute() === 'log';

export async function initWorkoutBar() {
  bar = document.createElement('div');
  bar.className = 'wbar';
  bar.hidden = true;
  document.getElementById('app').append(bar);
  active = await getActiveWorkout();
  onActiveWorkout((workout) => {
    active = workout;
    update();
  });
  onRestChange(update);
  onRoute(update);
  on('settings', update);
  update();
}

function update() {
  if (!bar) return;
  keepScreenOn(Boolean(active) && state.settings.workout.keepAwake);
  const rest = currentRest();
  const mode = rest && onLogPage() ? 'rest' : active && !onLogPage() ? 'mini' : null;
  bar.hidden = !mode;
  document.documentElement.classList.toggle('has-wbar', Boolean(mode));
  if (!mode) {
    setHTML(bar, '');
    return;
  }
  bar.dataset.mode = mode;
  const left = formatSeconds(Math.ceil(restLeftMs() / 1000));
  if (mode === 'rest') {
    const beforeExercise = rest.kind === 'exercise';
    setHTML(bar, html`<div class="wbar__panel accent-workout${beforeExercise ? ' wbar__panel--exercise' : ''}" role="timer"
        aria-label="${beforeExercise ? 'Rest before your next exercise' : 'Rest before your next set'}">
      <span class="wbar__progress" data-rest-bar aria-hidden="true"></span>
      <div class="wbar__rest">
        <div class="wbar__text">
          <span class="wbar__label">${icon(beforeExercise ? 'arrowRight' : 'hourglass')}${beforeExercise ? 'Next exercise' : 'Rest'}</span>
          ${rest.label ? html`<span class="wbar__next">${beforeExercise ? '' : 'Next: '}${rest.label}</span>` : ''}
        </div>
        <span class="wbar__time num" data-rest-left>${left}</span>
      </div>
      <div class="wbar__btns">
        <button type="button" class="wbar__btn" data-action="rest:adjust" data-delta="-15" aria-label="15 seconds less">−15</button>
        <button type="button" class="wbar__btn" data-action="rest:adjust" data-delta="15" aria-label="15 seconds more">+15</button>
        <button type="button" class="wbar__btn" data-action="rest:adjust" data-delta="30" aria-label="30 seconds more">+30</button>
        <button type="button" class="wbar__btn wbar__btn--skip" data-action="rest:skip">Skip</button>
      </div>
    </div>`);
    return;
  }
  const paused = Boolean(active.pausedAt);
  setHTML(bar, html`<button type="button" class="wbar__mini accent-workout" data-action="nav" data-route="workout" data-sub="log"
      aria-label="Workout in progress: ${active.title}${paused ? ', paused' : ''}. Open it">
    <span class="wbar__dot${paused ? ' is-paused' : ''}" aria-hidden="true"></span>
    <span class="wbar__title">${active.title}</span>
    <span class="wbar__elapsed" aria-hidden="true">${liveElapsed(active.startedAt, active.pausedMs, active.pausedAt)}</span>
    ${rest ? html`<span class="wbar__chip" aria-hidden="true">${icon('hourglass')}<span data-rest-left>${left}</span></span>` : ''}
    ${icon('chevronRight', 'wbar__chev')}
  </button>`);
}

registerAction('rest:adjust', (el) => {
  const delta = Number(el.dataset.delta) || 0;
  adjustRest(delta);
  if (currentRest()) announce(`Rest ${formatSeconds(Math.ceil(restLeftMs() / 1000))}`);
});

registerAction('rest:skip', () => {
  stopRest();
  announce('Rest skipped.');
});
