/* Faster ways through the To Do list.
   - Swipes (iPhone, iPad): swipe a task right to complete it (or to mark a done
     task not done), left to move it to tomorrow — each with Undo, and each also a
     button (the tick, and the quick menu). A swipe that starts on a task acts on
     that task; anywhere else, swiping still changes tabs. Manual order uses drag
     handles instead, so swipes are off there.
   - Keys (Mac): N new task · / search · ↑ ↓ move between tasks · Space complete ·
     Enter quick menu · ? help. ⌘Enter saves and Esc closes in the sheets. */
import { currentRoute, currentSubRoute } from '../../core/router.js';
import { haptic } from '../../core/feedback.js';
import { prefersReducedMotion } from '../../core/platform.js';
import { focusTaskLater, toggleDone, tomorrowTask } from './task-actions.js';
import { openCaptureHelp } from './capture.js';

const START = 12;      // pixels before a sideways move counts as a swipe
const READY = 0.34;    // share of the row's width that commits the swipe
const READY_MAX = 140;

/** Swipes on the task rows inside root. */
export function bindSwipes(root) {
  let s = null;

  const paint = (dx) => {
    const width = s.row.offsetWidth;
    const limit = width * 0.9;
    const shown = Math.max(-limit, Math.min(limit, dx));
    s.row.style.setProperty('--swipe-x', `${shown}px`);
    s.row.dataset.swipe = shown > 0 ? 'right' : 'left';
    const ready = Math.abs(shown) >= Math.min(width * READY, READY_MAX);
    if (ready !== s.ready) {
      s.ready = ready;
      s.row.classList.toggle('is-swipe-ready', ready);
      if (ready) haptic();
    }
  };
  const reset = (row) => {
    row.classList.remove('is-swiping', 'is-swipe-ready', 'is-settling', 'is-leaving');
    row.style.removeProperty('--swipe-x');
    delete row.dataset.swipe;
  };
  /**
   * Slide back (or out, by `out` pixels), then run `then` once it has finished moving.
   * A task that slid out stays out until the list redraws without it.
   */
  const settle = (row, out, then) => {
    const done = () => {
      if (!out) reset(row);
      then?.();
      if (out) setTimeout(() => { if (row.isConnected) reset(row); }, 1500);
    };
    if (prefersReducedMotion()) {
      reset(row);
      then?.();
      return;
    }
    row.classList.add('is-settling');
    row.classList.toggle('is-leaving', Boolean(out));
    row.style.setProperty('--swipe-x', `${out}px`);
    setTimeout(done, out ? 190 : 210);
  };
  // After a swipe, the tap that ends it must not also open the quick menu
  const swallowClick = () => {
    const stop = (event) => { event.stopPropagation(); event.preventDefault(); };
    root.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 450);
  };

  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || s) return;
    const row = event.target.closest('.tlist:not(.tlist--manual) > .trow');
    if (!row || event.target.closest('[data-drag-handle]')) return;
    s = { row, id: row.dataset.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, active: false, ready: false, done: row.classList.contains('is-done') };
  }, { passive: true });

  root.addEventListener('pointermove', (event) => {
    if (!s || event.pointerId !== s.pointerId) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > START && Math.abs(dy) >= Math.abs(dx)) { s = null; return; } // scrolling
      if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      if (dx < 0 && s.done) { s = null; return; } // a done task has nothing to move to tomorrow
      s.active = true;
      s.row.classList.add('is-swiping');
      try { s.row.setPointerCapture(event.pointerId); } catch { /* not supported */ }
    }
    paint(dx);
  });

  const finish = (event, cancelled) => {
    if (!s || (event && event.pointerId !== s.pointerId)) return;
    const { row, id, active, ready } = s;
    const right = row.dataset.swipe === 'right';
    s = null;
    if (!active) return;
    swallowClick();
    if (cancelled || !ready) {
      settle(row, 0);
      return;
    }
    // Complete: the task slides back and gets its tick (it may stay in the list).
    // Tomorrow: it slides away (it usually leaves the list).
    if (right) settle(row, 0, () => toggleDone(id));
    else settle(row, -row.offsetWidth, () => tomorrowTask(id));
  };
  root.addEventListener('pointerup', (event) => finish(event, false));
  root.addEventListener('pointercancel', (event) => finish(event, true));
}

/**
 * Mac keys on the To Do list. focusCapture / focusSearch come from the list; the
 * rows are found in root.
 */
export function bindKeys(root, { focusCapture, focusSearch }) {
  const onList = () => currentRoute() === 'todo' && currentSubRoute() === '' && !document.querySelector('dialog[open]');
  const typing = (el) => Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"]'));
  const rows = () => [...root.querySelectorAll('.trow__main')];

  document.addEventListener('keydown', (event) => {
    if (!onList() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const t = event.target;
    if (event.key === ' ' && t.matches?.('.trow__main')) {
      event.preventDefault(); // Space completes; Enter opens the quick menu
      focusTaskLater(t.dataset.id);
      toggleDone(t.dataset.id);
      return;
    }
    if (typing(t)) return;
    if (event.key === '/') {
      event.preventDefault();
      focusSearch();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      focusCapture();
    } else if (event.key === '?') {
      event.preventDefault();
      openCaptureHelp();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const list = rows();
      if (!list.length) return;
      event.preventDefault();
      const i = list.indexOf(t.closest?.('.trow__main'));
      const next = i < 0 ? (event.key === 'ArrowDown' ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, i + (event.key === 'ArrowDown' ? 1 : -1)));
      list[next].focus();
      list[next].scrollIntoView({ block: 'nearest' });
    }
  });
  // Space on a button would also "click" it when the key comes up
  document.addEventListener('keyup', (event) => {
    if (event.key === ' ' && event.target.matches?.('.trow__main') && onList()) event.preventDefault();
  });
}
