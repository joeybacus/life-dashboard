/* The Quick Add (+) button on every tab, and the sheet it opens.

   Modules add what can be added here:
     registerQuickAdd({ id, primary: true, mount(slot, { close }) })  the part at the top —
       To Do's plain-words box (mount returns { focus, hasText })
     registerQuickAdd({ id, label, icon, accent, order, run() })      a button below it —
       Start workout today; Start focus and Log habit later
   The sheet opens at the top of the screen and puts the cursor in the box straight
   away, inside the tap itself — the only way an iPhone opens its keyboard for a web
   app. The button hides inside pop-up sheets and on the workout logging screen. */
import { html, setHTML } from './html.js';
import { icon } from './icons.js';
import { registerAction } from './actions.js';
import { confirmDialog, openDialog } from './ui.js';
import { currentRoute, currentSubRoute, onRoute } from './router.js';

const items = [];
/** Screens where the + button stays out of the way: [tab, page]. */
const HIDDEN_ON = [['workout', 'log']];

export function registerQuickAdd(item) {
  items.push(item);
  items.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

let fab = null;

export function initQuickAdd() {
  fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab accent-todo';
  fab.dataset.action = 'quick:open';
  fab.setAttribute('aria-label', 'Quick Add — new task, or start a workout');
  fab.title = 'Quick Add (N)';
  setHTML(fab, icon('plus'));
  document.body.append(fab);

  const place = (tab, prev, sub) => {
    const hidden = HIDDEN_ON.some(([t, s]) => t === tab && s === sub);
    fab.hidden = hidden;
    document.documentElement.classList.toggle('has-fab', !hidden);
  };
  onRoute(place);
  place(currentRoute(), null, currentSubRoute());

  // N (Mac keyboard): a new task from any screen. On the To Do list, N goes to its own box instead.
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (currentRoute() === 'todo' && currentSubRoute() === '') return;
    event.preventDefault();
    openQuickAdd();
  });
}

registerAction('quick:open', () => openQuickAdd());

/**
 * Open the Quick Add sheet. Everything up to putting the cursor in the box runs
 * straight away (no waiting), so it still counts as part of the tap on iPhone.
 */
export function openQuickAdd() {
  const primary = items.find((i) => i.primary);
  const others = items.filter((i) => !i.primary);
  let box = null;
  let closeSheet = null;
  const tryClose = async () => {
    if (box?.hasText?.()) {
      const discard = await confirmDialog({ title: 'Discard this task?', message: 'It hasn’t been added yet.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true });
      if (!discard) {
        box.focus({ preventScroll: true });
        return;
      }
    }
    closeSheet?.(null);
  };
  return openDialog({
    variant: 'top',
    className: 'quick-add accent-todo',
    dismissible: false,
    body: html`<div class="quick-add__primary" data-quick-primary></div>
      ${others.length ? html`<div class="quick-add__more">
        <span class="quick-add__or">Or</span>
        ${others.map((i) => html`<button type="button" class="btn btn--sm quick-add__item accent-${i.accent ?? 'brand'}" data-quick="${i.id}">${icon(i.icon)}${i.label}</button>`)}
        <button type="button" class="btn btn--sm btn--ghost quick-add__close" data-quick-close>Close</button>
      </div>` : ''}`,
    onOpen(dlg, close) {
      closeSheet = close;
      dlg.setAttribute('aria-label', 'Quick Add');
      if (primary) box = primary.mount(dlg.querySelector('[data-quick-primary]'), { close });
      dlg.addEventListener('click', (event) => {
        if (event.target === dlg) {
          tryClose();
          return;
        }
        if (event.target.closest('[data-quick-close]')) {
          tryClose();
          return;
        }
        const item = others.find((i) => i.id === event.target.closest('[data-quick]')?.dataset.quick);
        if (!item) return;
        close('item');
        item.run();
      });
      dlg.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          tryClose();
        }
      });
    },
  });
}
