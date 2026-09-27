/* Neurology — mostly reserved for a future update (the tab, the dashboard card
   and the placeholder), plus one working tool: Ward Patients (see ward/).

   Pages of the Neurology tab (#/neurology/…):
     (none)          the Ward Patients button, then what's planned
     ward            Ward Patients
     ward/history    rounds history */
import { registerModule } from './registry.js';
import { registerScreen, replacePage } from '../core/router.js';
import { on } from '../core/events.js';
import { html, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { pageHead } from '../core/components.js';
import { wardSummary } from './ward/engine.js';
import { handleCardClick, historyPage, wardPage } from './ward/page.js';

const MESSAGE = 'A dedicated neurology learning and residency toolkit will be added in a future update.';

// What the module is designed to hold later (nothing here is built yet)
const PLANNED_TOOLS = [
  { name: 'Daily quizzes', icon: 'help' },
  { name: 'Question bank', icon: 'layers' },
  { name: 'Study tracker', icon: 'calendarCheck' },
  { name: 'Flashcards', icon: 'cards' },
  { name: 'Notes', icon: 'note' },
  { name: 'Guidelines', icon: 'book' },
  { name: 'Cases', icon: 'clipboard' },
  { name: 'Residency tools', icon: 'briefcase' },
  { name: 'Study analytics', icon: 'chart' },
];

/** The Ward Patients button (Neurology tab and dashboard card). */
function wardEntry(s, { compact = false } = {}) {
  const sub = !s.linked ? 'Link your ward logsheet to get started'
    : !s.loaded ? 'Open to load your logsheet'
    : `${s.rounded} of ${s.total} rounded today${s.active ? ' · rounds in progress' : ''}${s.unsaved ? ` · ${s.unsaved} not synced` : ''}`;
  return html`<a class="${compact ? '' : 'card '}ward-entry${compact ? ' ward-entry--compact' : ''}" href="#/neurology/ward" data-action="nav" data-route="neurology" data-sub="ward">
    <span class="ward-entry__icon">${icon('stethoscope')}</span>
    <span class="ward-entry__text"><span class="ward-entry__title">Ward Patients</span><span class="ward-entry__sub">${sub}</span></span>
    ${icon('chevronRight', 'ward-entry__chev')}
  </a>`;
}

registerModule({
  id: 'neurology',
  title: 'Neurology',
  icon: 'brain',
  accent: 'neuro',
  status: 'planned',
  load: async () => wardSummary(),
  summary: (s) => (s.linked && s.loaded
    ? {
      text: `Ward: ${s.rounded} of ${s.total} rounded${s.active ? ' · rounds in progress' : ''}`,
      progress: s.total ? s.rounded / s.total : null,
      ringText: `${s.rounded}/${s.total}`,
      ringLabel: `${s.rounded} of ${s.total} ward patients rounded`,
    }
    : { text: 'Coming in a future update.', progress: null, ringLabel: 'Ward Patients not linked yet', idleIcon: 'lock' }),
  body: (s) => html`
    ${wardEntry(s, { compact: true })}
    <p class="neuro-note">${MESSAGE}</p>
    <div class="tag-cloud">${PLANNED_TOOLS.slice(0, 6).map((t) => html`<span class="tag">${t.name}</span>`)}</div>
    <div class="card-foot"><button type="button" class="link-btn" data-action="nav" data-route="neurology" data-sub="">Open Neurology ${icon('arrowRight')}</button></div>`,
});

/* ---- Pages ---- */

function showHome(el) {
  setHTML(el, html`
    ${pageHead({ title: 'Neurology', iconName: 'brain', accent: 'neuro', eyebrow: 'Module' })}
    <div class="accent-neuro">${wardEntry(wardSummary())}</div>
    <section class="card placeholder accent-neuro" aria-label="Coming soon">
      <div class="placeholder__orb">${icon('brain')}</div>
      <h2 class="placeholder__title">More coming in a future update</h2>
      <p class="placeholder__text">${MESSAGE}</p>
      <span class="badge">Reserved module</span>
    </section>
    <section class="section accent-neuro" aria-labelledby="neuro-tools-title">
      <div class="section__head"><h2 class="section__title" id="neuro-tools-title">Planned tools</h2></div>
      <ul class="tool-grid">${PLANNED_TOOLS.map((t) => html`
        <li class="tool"><span class="tool__icon">${icon(t.icon)}</span><span class="tool__name">${t.name}</span><span class="tool__status">Planned</span></li>`)}
      </ul>
    </section>`);
}

const HOME = { show: showHome };
const ROUTES = [
  [/^$/, HOME],
  [/^ward$/, wardPage],
  [/^ward\/history$/, historyPage],
];

let view = null;
let page = null;
let visible = false;

function route(el, sub) {
  const def = ROUTES.find(([pattern]) => pattern.test(sub))?.[1];
  if (!def) {
    replacePage(''); // unknown page: back to the start
    return null;
  }
  if (page && page !== def) page.hide?.();
  page = def;
  return def.show(el);
}

registerScreen('neurology', {
  title: 'Neurology',
  icon: 'brain',
  accent: 'neuro',
  mount(el) {
    view = el;
    el.addEventListener('click', handleCardClick);
  },
  onShow(el, sub) {
    visible = true;
    return route(el, sub);
  },
  onRoute(el, sub) {
    return route(el, sub);
  },
  onHide() {
    visible = false;
    page?.hide?.();
    page = null;
  },
});

// Keep the Ward Patients button's summary current
on('ward', () => { if (visible && page === HOME) showHome(view); });
