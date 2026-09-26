/* Screens, the tab bar and navigation between them.

   Each screen registers itself with
     registerScreen(id, { title, icon, accent, mount, onShow, onHide, onRoute })
   Screens are built the first time they're opened and then kept, so each tab
   remembers its scroll position like a native app.

   A tab can also have pages of its own, like #/workout/history. The part after
   the tab id is the "sub-route": onShow(view, sub) receives it when the tab
   opens, and onRoute(view, sub, { prev, back }) when it changes within the tab.
   Each tab reopens on the page you left it on; tapping the tab again goes
   back to its first page (like iOS). */
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
const subRoutes = new Map();   // tab → the page it was last showing
const routeListeners = new Set();
let current = null;
let currentSub = '';
let viewsHost;
let tabbar;

export function registerScreen(id, def) {
  screens.set(id, { id, ...def });
}

export const currentRoute = () => current;
export const currentSubRoute = () => currentSub;

/** Listen for navigation: fn(tabId, prevTabId, sub). */
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
  // Back/forward and typed addresses
  const fromLocation = () => {
    const { id, sub } = parseHash();
    if (id !== current) navigate(id, { fromHash: true, sub });
    else if (sub !== currentSub) showSub(sub, { fromHash: true, back: true });
  };
  window.addEventListener('popstate', fromLocation);
  window.addEventListener('hashchange', fromLocation);
  registerAction('nav', (el) => (el.dataset.sub != null ? openPage(el.dataset.route, el.dataset.sub) : navigate(el.dataset.route)));
  registerAction('nav:back', (el) => goBack(el.dataset.fallback ?? ''));

  setupSwipe();
  const { id, sub } = parseHash();
  navigate(id, { initial: true, sub });
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  if (!screens.has(parts[0])) return { id: DEFAULT_ROUTE, sub: '' };
  let sub = '';
  try { sub = parts.slice(1).map(decodeURIComponent).join('/'); } catch { /* malformed address */ }
  return { id: parts[0], sub };
}

const hashFor = (id, sub) => `#/${id}${sub ? `/${sub.split('/').map(encodeURIComponent).join('/')}` : ''}`;
const memoryKey = (id, sub) => `${id}/${sub}`;

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

function animate(view, dir) {
  if (prefersReducedMotion()) return;
  view.classList.remove('view--enter-left', 'view--enter-right', 'view--enter-fade');
  void view.offsetWidth; // restart the animation
  view.classList.add(`view--enter-${dir}`);
}

function setTitle(screen) {
  document.title = screen.id === DEFAULT_ROUTE ? 'Life Dashboard' : `${screen.title} · Life Dashboard`;
}

/**
 * After a screen has drawn a page (render may be async): restore the scroll
 * position and move focus to the page heading so VoiceOver announces it.
 */
function settle(view, id, sub, rendered, { top, focus }) {
  window.scrollTo(0, top);
  Promise.resolve(rendered).then(() => {
    if (current !== id || currentSub !== sub) return;
    if (Math.abs(window.scrollY - top) > 2) window.scrollTo(0, top);
    if (focus) view.querySelector('h1')?.focus({ preventScroll: true });
  }, (err) => console.error(err));
}

/** Switch tabs. opts.sub opens a particular page of that tab. */
export function navigate(id, opts = {}) {
  if (!screens.has(id)) id = DEFAULT_ROUTE;

  if (id === current) {
    if (opts.sub != null && opts.sub !== currentSub) {
      showSub(opts.sub, opts);
    } else if (!opts.fromHash) {
      // Tapping the tab you're on: back to its first page, or scroll to the top (like iOS)
      if (currentSub) showSub('', { back: true });
      else window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    return;
  }

  const prev = current;
  if (prev) {
    scrollMemory.set(memoryKey(prev, currentSub), window.scrollY);
    views.get(prev).hidden = true;
    screens.get(prev).onHide?.();
  }

  const sub = opts.sub ?? subRoutes.get(id) ?? '';
  const view = ensureView(id);
  view.hidden = false;
  if (!opts.initial) {
    const from = TABS.indexOf(prev);
    const to = TABS.indexOf(id);
    animate(view, from < 0 || to < 0 ? 'fade' : to > from ? 'right' : 'left');
  }

  current = id;
  currentSub = sub;
  subRoutes.set(id, sub);
  updateTabbar();
  const screen = screens.get(id);
  setTitle(screen);
  const hash = hashFor(id, sub);
  if (location.hash !== hash) history.replaceState(null, '', hash);

  const rendered = screen.onShow?.(view, sub);
  settle(view, id, sub, rendered, { top: scrollMemory.get(memoryKey(id, sub)) ?? 0, focus: !opts.initial });
  routeListeners.forEach((fn) => fn(id, prev, sub));
}

/** Show another page of the current tab. */
function showSub(sub, { push = false, back = false, fromHash = false } = {}) {
  const prevSub = currentSub;
  scrollMemory.set(memoryKey(current, prevSub), window.scrollY);
  currentSub = sub;
  subRoutes.set(current, sub);
  const hash = hashFor(current, sub);
  if (!fromHash && location.hash !== hash) {
    if (push) history.pushState({ ld: true }, '', hash);
    else history.replaceState(null, '', hash);
  }
  const view = views.get(current);
  animate(view, back ? 'left' : 'right');
  const screen = screens.get(current);
  const rendered = screen.onRoute?.(view, sub, { prev: prevSub, back });
  // Going forward starts at the top; coming back returns to where you were
  const top = back ? scrollMemory.get(memoryKey(current, sub)) ?? 0 : 0;
  if (!back) scrollMemory.delete(memoryKey(current, sub));
  settle(view, current, sub, rendered, { top, focus: true });
  routeListeners.forEach((fn) => fn(current, current, sub));
}

/** Open a page, e.g. openPage('workout', 'history'). Back returns to where you were. */
export function openPage(id, sub = '') {
  if (id !== current) {
    navigate(id, { sub });
    return;
  }
  if (sub !== currentSub) showSub(sub, { push: true });
}

/** Replace the current page without adding a Back step (e.g. after deleting what it showed). */
export function replacePage(sub = '') {
  if (sub !== currentSub) showSub(sub, { back: true });
}

/** Go back one page: through the browser history when we came from there, otherwise to `fallback`. */
export function goBack(fallback = '') {
  if (history.state?.ld) history.back();
  else showSub(fallback, { back: true });
}

/* Swipe left/right to move between neighbouring tabs (touch screens only). */
function setupSwipe() {
  let start = null;
  const EDGE = 24; // leave the screen edges to the system back gesture

  document.addEventListener('touchstart', (event) => {
    start = null;
    if (!state.settings?.appearance.swipeNavigation || event.touches.length !== 1) return;
    if (currentSub) return; // pages inside a tab (like a workout in progress) keep their own gestures
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
