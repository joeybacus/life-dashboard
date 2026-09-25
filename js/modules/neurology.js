/* Neurology — reserved for a future update. Version 1 has only the tab, the
   dashboard card and this placeholder screen. */
import { registerModule } from './registry.js';
import { registerScreen } from '../core/router.js';
import { html, setHTML } from '../core/html.js';
import { icon } from '../core/icons.js';
import { pageHead } from '../core/components.js';

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

registerModule({
  id: 'neurology',
  title: 'Neurology',
  icon: 'brain',
  accent: 'neuro',
  status: 'planned',
  load: async () => ({}),
  summary: () => ({ text: 'Coming in a future update.', progress: null, ringLabel: 'Not available yet', idleIcon: 'lock' }),
  body: () => html`
    <p class="neuro-note">${MESSAGE}</p>
    <div class="tag-cloud">${PLANNED_TOOLS.slice(0, 6).map((t) => html`<span class="tag">${t.name}</span>`)}</div>
    <div class="card-foot"><button type="button" class="link-btn" data-action="nav" data-route="neurology">Preview ${icon('arrowRight')}</button></div>`,
});

registerScreen('neurology', {
  title: 'Neurology',
  icon: 'brain',
  accent: 'neuro',
  mount(el) {
    setHTML(el, html`
      ${pageHead({ title: 'Neurology', iconName: 'brain', accent: 'neuro', eyebrow: 'Module' })}
      <section class="card placeholder accent-neuro" aria-label="Coming soon">
        <div class="placeholder__orb">${icon('brain')}</div>
        <h2 class="placeholder__title">Coming in a future update</h2>
        <p class="placeholder__text">${MESSAGE}</p>
        <span class="badge">Reserved module</span>
      </section>
      <section class="section accent-neuro" aria-labelledby="neuro-tools-title">
        <div class="section__head"><h2 class="section__title" id="neuro-tools-title">Planned tools</h2></div>
        <ul class="tool-grid">${PLANNED_TOOLS.map((t) => html`
          <li class="tool"><span class="tool__icon">${icon(t.icon)}</span><span class="tool__name">${t.name}</span><span class="tool__status">Planned</span></li>`)}
        </ul>
      </section>`);
  },
});
