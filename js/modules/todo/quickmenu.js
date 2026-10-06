/* The cross-shaped quick menu: tap a task and five buttons appear around it —
   Complete in the middle and four arms (Settings → Tasks → Quick menu; to start
   with: Reminder, Details, Delete and Focus, with a stand-in (Pin) until the
   focus timer exists). A subtask's row gets the same menu, with task-only
   actions (priority, category, pin…) swapped for "Task", which opens its task.
   Everything else dims; tap outside or press Esc to close. Each button has an
   icon and a word. On iPhone the cross sits in the middle of the screen with the
   name above it; on bigger screens it centres on the row, moved in from the
   edges so no arm is cut off. On a Mac the arrow keys move between the arms and
   Enter chooses. VoiceOver announces "Quick menu for …" and reads the buttons
   as a list. */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { registerAction } from '../../core/actions.js';
import { openDialog } from '../../core/ui.js';
import { state } from '../../core/state.js';
import { QUICK_ACTIONS, QUICK_ARMS, isDone, quickArms, subtaskArms, subtaskItem } from './model.js';
import { getSub, getTask, saveSub, saveTask } from './store.js';
import { openTask } from './detail.js';
import { openSubtask } from './subtask-sheet.js';
import { openReminderSheet } from './reminder-ui.js';
import { setInCalendar } from './calendar-link.js';
import {
  addSubtaskTo, chooseCategory, choosePriority, deleteSubtask, deleteTask, focusTaskLater, toggleDone, togglePin, toggleSubDone,
  tomorrowSub, tomorrowTask,
} from './task-actions.js';
import { focusOnTask } from '../focus/page.js';

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
  let spoken = info.long && label === info.label ? info.long : label;
  if (action === 'calendar') {
    label = task.addToCalendar ? 'Take out' : 'Calendar';
    spoken = task.addToCalendar ? 'Take out of Google Calendar' : 'Add to Google Calendar';
  }
  return html`<li class="xmenu__item xmenu__item--${arm}">
    <button type="button" class="xmenu__btn xmenu__btn--${action}" data-dialog-value="${action}" data-arm="${arm}"
      aria-label="${spoken}">${icon(ic)}<span class="xmenu__label" aria-hidden="true">${label}</span></button>
  </li>`;
}

/** Reminders for a task or subtask, from the menu's Reminder button. */
async function editReminders(kind, id) {
  if (kind === 'subtask') {
    const sub = await getSub(id);
    const parent = sub ? await getTask(sub.taskId) : null;
    if (!sub || !parent) return;
    await openReminderSheet(subtaskItem(sub, parent), {
      title: sub.title,
      save: async (fields) => { const latest = await getSub(id); if (latest) await saveSub({ ...latest, ...fields }); },
    });
    return;
  }
  const task = await getTask(id);
  if (!task) return;
  await openReminderSheet(task, {
    title: task.title,
    save: async (fields) => { const latest = await getTask(id); if (latest) await saveTask({ ...latest, ...fields }); },
  });
}

export async function openQuickMenu(id, rowEl, kind = 'task') {
  if (kind === 'subtask') return openSubMenu(id, rowEl);
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
    case 'reminder': return editReminders('task', id);
    case 'details': return openTask(id);
    case 'delete': return deleteTask(id);
    case 'tomorrow': return tomorrowTask(id);
    case 'priority': return choosePriority(id);
    case 'category': return chooseCategory(id);
    case 'subtask': return addSubtaskTo(id);
    case 'pin': return togglePin(id);
    case 'focus': return focusOnTask(id);
    case 'calendar': return setInCalendar('task', id, !task.addToCalendar);
    default: return null;
  }
}

/** The same menu for a subtask's row. */
async function openSubMenu(id, rowEl) {
  const sub = await getSub(id);
  const parent = sub ? await getTask(sub.taskId) : null;
  if (!sub || sub.deletedAt || !parent || parent.deletedAt) return;
  const item = subtaskItem(sub, parent);
  const arms = subtaskArms(quickArms(state.settings.tasks.quickMenu));
  const at = where(rowEl);
  const choice = await openDialog({
    variant: 'cross',
    className: 'xmenu-dlg accent-todo',
    body: html`<div class="xmenu" style="left: ${Math.round(at.x)}px; top: ${Math.round(at.y)}px">
      <p class="xmenu__title" aria-hidden="true">${sub.title}<small>Subtask of ${parent.title}</small></p>
      <ul class="xmenu__list">
        ${button('center', 'complete', item)}
        ${QUICK_ARMS.map((arm) => button(arm, arms[arm], item))}
      </ul>
    </div>`,
    onOpen(dlg) {
      dlg.setAttribute('aria-label', `Quick menu for the subtask ${sub.title}, part of ${parent.title}`);
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
  focusTaskLater(id);
  switch (choice) {
    case 'complete': return toggleSubDone(id);
    case 'reminder': return editReminders('subtask', id);
    case 'details': return openSubtask(id);
    case 'delete': return deleteSubtask(id);
    case 'tomorrow': return tomorrowSub(id);
    case 'calendar': return setInCalendar('subtask', id, !sub.addToCalendar);
    case 'task': return openTask(parent.id);
    default: return null;
  }
}

registerAction('todo:quick', (btn) => openQuickMenu(btn.dataset.id, btn.closest('li') ?? btn, btn.dataset.kind === 'subtask' ? 'subtask' : 'task'));
// Today at a Glance (Top priority, Next task): straight to the task, or the subtask
registerAction('todo:open', (btn) => (btn.dataset.kind === 'subtask' ? openSubtask(btn.dataset.id) : openTask(btn.dataset.id)));
