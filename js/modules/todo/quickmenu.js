/* The cross-shaped quick menu: tap a task and five buttons appear around it —
   Complete in the middle and four arms (Settings → Tasks → Quick menu; to start
   with: Reminder, Details, Delete and Focus, with stand-ins until reminders and
   the focus timer exist). Everything else dims; tap outside or press Esc to
   close. Each button has an icon and a word. On iPhone the cross sits in the
   middle of the screen with the task's name above it; on bigger screens it
   centres on the task, moved in from the edges so no arm is cut off. On a Mac the
   arrow keys move between the arms and Enter chooses. VoiceOver announces
   "Quick menu for …" and reads the buttons as a list. */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { openDialog } from '../../core/ui.js';
import { state } from '../../core/state.js';
import { QUICK_ACTIONS, QUICK_ARMS, isDone, quickArms } from './model.js';
import { getTask } from './store.js';
import { openTask } from './detail.js';
import {
  addSubtaskTo, chooseCategory, choosePriority, deleteTask, focusTaskLater, toggleDone, togglePin, tomorrowTask,
} from './task-actions.js';

const REACH = 88;    // from the centre of the cross to the centre of each arm
const HALF = 34;     // half a button
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIRECTION = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };

function where(rowEl) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const room = REACH + HALF + 12;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const top = room + 100; // room for the task's name above the cross
  if (w < 700 || !rowEl?.isConnected) return { x: w / 2, y: clamp(h * 0.46, top, h - room - 24) };
  const r = rowEl.getBoundingClientRect();
  return { x: clamp(r.left + r.width / 2, room, w - room), y: clamp(r.top + r.height / 2, top, h - room) };
}

function button(arm, action, task) {
  const info = QUICK_ACTIONS[action];
  let label = info.label;
  let ic = info.icon;
  if (action === 'complete' && isDone(task)) {
    label = 'Not done';
    ic = 'refresh';
  }
  if (action === 'pin' && task.pinned) label = 'Unpin';
  return html`<li class="xmenu__item xmenu__item--${arm}">
    <button type="button" class="xmenu__btn xmenu__btn--${action}" data-dialog-value="${action}" data-arm="${arm}"
      aria-label="${info.long && label === info.label ? info.long : label}">${icon(ic)}<span class="xmenu__label" aria-hidden="true">${label}</span></button>
  </li>`;
}

export async function openQuickMenu(id, rowEl) {
  const task = await getTask(id);
  if (!task || task.deletedAt) return;
  const arms = quickArms(state.settings.tasks.quickMenu);
  const at = where(rowEl);
  const choice = await openDialog({
    variant: 'cross',
    className: 'xmenu-dlg accent-todo',
    body: html`<div class="xmenu" style="left: ${Math.round(at.x)}px; top: ${Math.round(at.y)}px">
      <p class="xmenu__title" aria-hidden="true">${task.title}</p>
      <ul class="xmenu__list">
        ${button('center', 'complete', task)}
        ${QUICK_ARMS.map((arm) => button(arm, arms[arm], task))}
      </ul>
    </div>`,
    onOpen(dlg) {
      dlg.setAttribute('aria-label', `Quick menu for ${task.title}`);
      dlg.addEventListener('keydown', (event) => {
        const dir = DIRECTION[event.key];
        if (!dir) return;
        event.preventDefault();
        const from = document.activeElement?.dataset?.arm ?? 'center';
        const to = from !== 'center' && OPPOSITE[from] === dir ? 'center' : dir;
        dlg.querySelector(`[data-arm="${to}"]`)?.focus();
      });
    },
  });

  // Back to the task afterwards (keyboard and VoiceOver)
  focusTaskLater(id);
  switch (choice) {
    case 'complete': return toggleDone(id);
    case 'details': return openTask(id);
    case 'delete': return deleteTask(id);
    case 'tomorrow': return tomorrowTask(id);
    case 'priority': return choosePriority(id);
    case 'category': return chooseCategory(id);
    case 'subtask': return addSubtaskTo(id);
    case 'pin': return togglePin(id);
    default: return null;
  }
}

registerAction('todo:quick', (btn) => openQuickMenu(btn.dataset.id, btn.closest('li') ?? btn));
