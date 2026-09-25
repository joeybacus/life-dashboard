/* Screens, the tab bar and navigation between them.
   Each screen registers itself with registerScreen(id, { title, icon, accent, mount, onShow, onHide }).
   Screens are built the first time they're opened and then kept, so each tab
   remembers its scroll position like a native app. */
import { state } from './state.js';
import { icon } from './icons.js';
import { html, setHTML } from './html.js';
import { prefersReducedMotion } from './platform.js';
import { registerAction } from './actions.js';

/** The five tabs, in order. Main sits in the middle. */
export const TABS = ['workout', 'todo', 'main', 'neurology', 'settings'];
const DEFAULT_ROUTE = 'main';

const screens = new Map();
const views = new Map();
const scrollMemory = new Map();
const routeListeners = new Set();
let current = null;
let viewsHost;
let tabbar;

export function registerScreen(id, def) {
  screens.set(id, { id, ...def });
}

export const currentRoute = () => current;

export function onRoute(fn) {
  routeListeners.add(fn);
  return () => routeListeners.delete(fn);
}

export function initRouter() {
  viewsHost = document.getElementById('views');
  tabbar = document.getElementById('tabbar');
  renderTabbar();

  tabbar.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-tab]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.dataset.tab);
  });
  window.addEventListener('hashchange', () => navigate(routeFromHash(), { fromHash: true }));
  registerAction('nav', (el) => navigate(el.dataset.route));

  setupSwipe();
  navigate(routeFromHash(), { initial: true });
}

function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return screens.has(id) ? id : DEFAULT_ROUTE;
}

function renderTabbar() {
  setHTML(tabbar, html`<div class="tabbar__inner">${TABS.map((id) => {
    const s = screens.get(id);
    if (!s) return '';
    const label = s.navLabel ?? s.title;
    return s.primary
      ? html`<a class="tab tab--primary accent-${s.accent}" href="#/${id}" data-tab="${id}" aria-label="${s.ariaLabel ?? label}">
          <span class="tab__orb">${icon(s.icon)}</span><span class="tab__label" aria-hidden="true">${label}</span></a>`
      : html`<a class="tab accent-${s.accent}" href="#/${id}" data-tab="${id}">
          <span class="tab__icon">${icon(s.icon)}</span><span class="tab__label">${label}</span></a>`;
  })}</div>`);
}

function updateTabbar() {
  tabbar.querySelectorAll('a[data-tab]').forEach((a) => {
    if (a.dataset.tab === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function ensureView(id) {
  let view = views.get(id);
  if (!view) {
    view = document.createElement('section');
    view.className = `view view--${id}`;
    view.id = `view-${id}`;
    view.hidden = true;
    viewsHost.append(view);
    views.set(id, view);
    screens.get(id).mount?.(view);
  }
  return view;
}

export function navigate(id, opts = {}) {
  if (!screens.has(id)) id = DEFAULT_ROUTE;

  // Tapping the tab you're already on scrolls back to the top (like iOS)
  if (id === current) {
    if (!opts.fromHash) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    return;
  }

  const prev = current;
  if (prev) {
    scrollMemory.set(prev, window.scrollY);
    views.get(prev).hidden = true;
    screens.get(prev).onHide?.();
  }

  const view = ensureView(id);
  view.hidden = false;
  if (!opts.initial && !prefersReducedMotion()) {
    const from = TABS.indexOf(prev);
    const to = TABS.indexOf(id);
    const dir = from < 0 || to < 0 ? 'fade' : to > from ? 'right' : 'left';
    view.classList.remove('view--enter-left', 'view--enter-right', 'view--enter-fade');
    void view.offsetWidth; // restart the animation
    view.classList.add(`view--enter-${dir}`);
  }
  window.scrollTo(0, scrollMemory.get(id) ?? 0);

  current = id;
  updateTabbar();
  const screen = screens.get(id);
  document.title = id === DEFAULT_ROUTE ? 'Life Dashboard' : `${screen.title} · Life Dashboard`;
  const hash = `#/${id}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);

  screen.onShow?.(view);
  // Move focus to the new screen's heading so VoiceOver announces it
  if (!opts.initial) view.querySelector('h1')?.focus({ preventScroll: true });
  routeListeners.forEach((fn) => fn(id, prev));
}

/* Swipe left/right to move between neighbouring tabs (touch screens only). */
function setupSwipe() {
  let start = null;
  const EDGE = 24; // leave the screen edges to the system back gesture

  document.addEventListener('touchstart', (event) => {
    start = null;
    if (!state.settings?.appearance.swipeNavigation || event.touches.length !== 1) return;
    if (document.querySelector('dialog[open]') || document.querySelector('.is-arranging')) return;
    if (event.target.closest('input, textarea, select, [contenteditable], [data-no-swipe]')) return;
    const t = event.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    start = { x: t.clientX, y: t.clientY, time: performance.now() };
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!start) return;
    const t = event.touches[0];
    const dy = Math.abs(t.clientY - start.y);
    // Clearly scrolling vertically — stop tracking this gesture
    if (dy > 30 && dy > Math.abs(t.clientX - start.x)) start = null;
  }, { passive: true });

  document.addEventListener('touchend', (event) => {
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const elapsed = performance.now() - start.time;
    start = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || elapsed > 700) return;
    const index = TABS.indexOf(current);
    const next = TABS[index + (dx < 0 ? 1 : -1)];
    if (index >= 0 && next) navigate(next);
  }, { passive: true });

  document.addEventListener('touchcancel', () => { start = null; }, { passive: true });
}
