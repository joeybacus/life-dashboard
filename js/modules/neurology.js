/* Neurology — mostly reserved for a future update (the tab, the dashboard card
   and the placeholder), plus one working tool: patient lists for ward rounds
   (Ward Patients, and any lists you add — see ward/).

   Pages of the Neurology tab (#/neurology/…):
     (none)                 your patient lists, then what's planned
     list/<id>              a patient list (Ward Patients is list/ward)
     list/<id>/history      its rounds history
     referrals              patients referred to your service (with a calendar)
     ward, ward/history     older addresses of Ward Patients (they still work) */
import { registerModule } from './registry.js';
import { registerScreen, replacePage } from '../core/router.js';
import { on } from '../core/events.js';
import { html, raw, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { pageHead } from '../core/components.js';
import { censusList, wardSummaries } from './ward/engine.js';
import { manilaDateKey } from './ward/model.js';
import { colorOf, labelRank, labelsOf } from './referrals/labels.js';
import { handleCardClick, historyPage, listPage } from './ward/page.js';
import './ward/manage.js'; // New list, and each list's ⋯ menu
import { handleReferralClick, referralsPage } from './referrals/page.js';
import { referralPatients, referralSummary } from './referrals/patients.js';

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

function entrySub(s) {
  if (!s.linked) return 'Link a logsheet to get started';
  if (!s.loaded) return 'Open to load the logsheet';
  if (s.noRounds) return `${s.total} ${s.total === 1 ? 'patient' : 'patients'}${s.unsaved ? ` · ${s.unsaved} not synced` : ''}`;
  return `${s.rounded} of ${s.total} rounded today${s.active ? ' · rounds in progress' : ''}${s.unsaved ? ` · ${s.unsaved} not synced` : ''}`;
}

/** "2 to see today · 1 overdue · 3 waiting" */
function referralsSub(r = referralSummary()) {
  if (!r.active) return r.linked ? 'No active referrals' : 'Link your referral census';
  const parts = [`${r.active} active`];
  if (r.today) parts.push(`${r.today} to see today`);
  if (r.overdue) parts.push(`${r.overdue} overdue`);
  if (r.waiting) parts.push(`waiting for ${r.waiting} ${r.waiting === 1 ? 'thing' : 'things'}`);
  return parts.join(' · ');
}

function referralsLink({ compact = false } = {}) {
  const inner = html`<span class="ward-entry__icon">${icon('clipboard')}</span>
    <span class="ward-entry__text"><span class="ward-entry__title">Referrals</span><span class="ward-entry__sub">${referralsSub()}</span></span>
    ${icon('chevronRight', 'ward-entry__chev')}`;
  const attrs = 'href="#/neurology/referrals" data-action="nav" data-route="neurology" data-sub="referrals"';
  // Built like a list's card (without the ⋯ menu), so they all line up
  return compact
    ? html`<a class="ward-entry ward-entry--compact" ${raw(attrs)}>${inner}</a>`
    : html`<div class="card ward-entry ward-entry--solo"><a class="ward-entry__link" ${raw(attrs)}>${inner}</a></div>`;
}

const TODAY_SHOWN = 8;
let lastCensusTry = 0;

/** The dashboard card: referrals to see today, labelled ones first (tap a name to open the patient). */
function todaysReferrals() {
  const today = manilaDateKey();
  const active = referralPatients().filter((p) => p.active);
  const due = active.filter((p) => p.next === today)
    .sort((a, b) => labelRank(a.labels) - labelRank(b.labels) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const overdue = active.filter((p) => p.next && p.next < today).length;
  if (!due.length && !overdue) return '';
  const more = due.length - TODAY_SHOWN;
  return html`<section class="neuro-today" aria-labelledby="neuro-today-title">
    <h3 class="neuro-today__title" id="neuro-today-title">Referrals to see today<span class="ward-group__count">${due.length}</span></h3>
    ${due.length ? html`<ul class="neuro-today__list">${due.slice(0, TODAY_SHOWN).map((p) => {
      const labels = labelsOf(p.labels);
      return html`<li><button type="button" class="neuro-today__item${labels.length ? ' has-label' : ''}" data-action="ref:open" data-id="${p.id}" style="${labels.length ? `--lc: ${colorOf(labels[0].color).hex}` : ''}">
        <span class="neuro-today__name">${p.name}</span>
        ${labels.length ? html`<span class="neuro-today__labels">${labels.map((l) => html`<span class="rf__dot" style="--lc: ${colorOf(l.color).hex}" aria-hidden="true"></span>`)}<span class="sr-only">${labels.map((l) => l.name).join(', ')}</span></span>` : ''}
        ${p.location ? html`<span class="neuro-today__loc">${icon('pin')}${p.location}</span>` : ''}
      </button></li>`;
    })}</ul>` : html`<p class="neuro-today__none">Nobody planned for today.</p>`}
    ${more > 0 || overdue ? html`<button type="button" class="link-btn neuro-today__more" data-action="nav" data-route="neurology" data-sub="referrals">${[more > 0 ? `${more} more today` : '', overdue ? `${overdue} overdue` : ''].filter(Boolean).join(' · ')} ${icon('arrowRight')}</button>` : ''}
  </section>`;
}

/** A list's button on the Neurology tab, with its ⋯ menu (rename, move, delete). */
function listCard(s) {
  return html`<div class="card ward-entry">
    <a class="ward-entry__link" href="#/neurology/list/${s.id}" data-action="nav" data-route="neurology" data-sub="list/${s.id}">
      <span class="ward-entry__icon">${icon('stethoscope')}</span>
      <span class="ward-entry__text"><span class="ward-entry__title">${s.name}</span><span class="ward-entry__sub">${entrySub(s)}</span></span>
      ${icon('chevronRight', 'ward-entry__chev')}
    </a>
    <button type="button" class="icon-btn ward-entry__more" data-action="ward:list-menu" data-list="${s.id}" aria-label="Options for ${s.name}">${icon('more')}</button>
  </div>`;
}

/** A list's button on the dashboard card. */
function listLink(s) {
  return html`<a class="ward-entry ward-entry--compact" href="#/neurology/list/${s.id}" data-action="nav" data-route="neurology" data-sub="list/${s.id}">
    <span class="ward-entry__icon">${icon('stethoscope')}</span>
    <span class="ward-entry__text"><span class="ward-entry__title">${s.name}</span><span class="ward-entry__sub">${entrySub(s)}</span></span>
    ${icon('chevronRight', 'ward-entry__chev')}
  </a>`;
}

registerModule({
  id: 'neurology',
  title: 'Neurology',
  icon: 'brain',
  accent: 'neuro',
  status: 'planned',
  load: async () => {
    // The dashboard shows today's referrals: bring the census up to date when it's a few minutes old
    const census = censusList();
    const stale = (at) => !(Date.now() - at < 3 * 60e3);
    if (census?.link && census.phase !== 'loading' && stale(Date.parse(census.cache?.fetchedAt ?? '')) && stale(lastCensusTry)) {
      lastCensusTry = Date.now(); // at most every 3 minutes, even when it fails
      census.refresh();
    }
    return wardSummaries();
  },
  summary(all) {
    const loaded = all.filter((s) => s.linked && s.loaded);
    const refs = referralSummary();
    if (!loaded.length && refs.active) return { text: `Referrals: ${referralsSub(refs)}`, progress: null, ringText: String(refs.today), ringLabel: `${refs.today} referrals to see today`, idleIcon: 'clipboard' };
    if (!loaded.length) return { text: 'Coming in a future update.', progress: null, ringLabel: 'No patient list linked yet', idleIcon: 'lock' };
    const total = loaded.reduce((n, s) => n + s.total, 0);
    const rounded = loaded.reduce((n, s) => n + s.rounded, 0);
    const active = loaded.some((s) => s.active) ? ' · rounds in progress' : '';
    const refsToday = refs.today ? `${refs.today} ${refs.today === 1 ? 'referral' : 'referrals'} to see today · ` : '';
    return {
      text: refsToday + (loaded.length === 1
        ? `${loaded[0].name}: ${rounded} of ${total} rounded${active}`
        : `${loaded.map((s) => `${s.name} ${s.rounded}/${s.total}`).join(' · ')} rounded${active}`),
      progress: total ? rounded / total : null,
      ringText: `${rounded}/${total}`,
      ringLabel: `${rounded} of ${total} patients rounded`,
    };
  },
  body: (all) => html`
    ${all.map(listLink)}
    ${referralsLink({ compact: true })}
    ${todaysReferrals()}
    <p class="neuro-note">${MESSAGE}</p>
    <div class="tag-cloud">${PLANNED_TOOLS.slice(0, 6).map((t) => html`<span class="tag">${t.name}</span>`)}</div>
    <div class="card-foot"><button type="button" class="link-btn" data-action="nav" data-route="neurology" data-sub="">Open Neurology ${icon('arrowRight')}</button></div>`,
});

/* ---- Pages ---- */

function showHome(el) {
  const all = wardSummaries();
  setHTML(el, html`
    ${pageHead({ title: 'Neurology', iconName: 'brain', accent: 'neuro', eyebrow: 'Module' })}
    <section class="ward-lists accent-neuro" aria-labelledby="neuro-lists-title">
      <h2 class="ward-lists__title" id="neuro-lists-title">Patient lists</h2>
      ${all.map(listCard)}
      <button type="button" class="btn ward-lists__new" data-action="ward:new-list">${icon('plus')}New list</button>
    </section>
    <section class="ward-lists ward-lists--refs accent-neuro" aria-labelledby="neuro-refs-title">
      <h2 class="ward-lists__title" id="neuro-refs-title">Referrals</h2>
      ${referralsLink()}
    </section>
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
  [/^list\/([\w-]+)$/, listPage],
  [/^list\/([\w-]+)\/history$/, historyPage],
  [/^referrals$/, referralsPage],
];
const OLD_ROUTES = { ward: 'list/ward', 'ward/history': 'list/ward/history' };

let view = null;
let page = null;
let visible = false;

function route(el, sub) {
  if (OLD_ROUTES[sub]) {
    replacePage(OLD_ROUTES[sub]);
    return null;
  }
  const found = ROUTES.map(([pattern, def]) => [pattern.exec(sub), def]).find(([match]) => match);
  if (!found) {
    replacePage(''); // unknown page: back to the start
    return null;
  }
  const [match, def] = found;
  if (page && page !== def) page.hide?.();
  page = def;
  return def.show(el, match[1]);
}

registerScreen('neurology', {
  title: 'Neurology',
  icon: 'brain',
  accent: 'neuro',
  mount(el) {
    view = el;
    el.addEventListener('click', handleCardClick);
    el.addEventListener('click', handleReferralClick);
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

// Keep the lists' summaries current
on('ward', () => { if (visible && page === HOME) showHome(view); });
on('referrals', () => { if (visible && page === HOME) showHome(view); });
