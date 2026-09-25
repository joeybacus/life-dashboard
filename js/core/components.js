/* Small render helpers shared by screens and modules. */
import { html } from './html.js';
import { icon } from './icons.js';
import { formatClock } from './dates.js';

/** Circular progress indicator. progress: 0–1, or null for "not started / not available". */
export function ring({ progress = null, text = '', label = '', idleIcon = null } = {}) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const p = progress == null ? null : Math.max(0, Math.min(1, progress));
  return html`<span class="ring${p == null ? ' ring--idle' : ''}" role="img" aria-label="${label}">
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="ring__track" cx="22" cy="22" r="${r}"/>
      ${p ? html`<circle class="ring__value" cx="22" cy="22" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}"/>` : ''}
    </svg>
    <span class="ring__text" aria-hidden="true">${idleIcon ? icon(idleIcon) : text}</span>
  </span>`;
}

export const PRIORITIES = {
  high: { label: 'High', short: 'High', rank: 0 },
  medium: { label: 'Medium', short: 'Med', rank: 1 },
  low: { label: 'Low', short: 'Low', rank: 2 },
};

/** Coloured dot + text label, so priority never depends on colour alone. */
export function priorityChip(priority, { short = false } = {}) {
  const info = PRIORITIES[priority] ?? PRIORITIES.low;
  return html`<span class="pri pri--${priority}"><span class="pri__dot" aria-hidden="true"></span><span class="pri__txt">${short ? info.short : info.label}</span><span class="sr-only"> priority</span></span>`;
}

export function avatar(profile, { size = 'md' } = {}) {
  if (profile.photo) return html`<span class="avatar avatar--${size}"><img src="${profile.photo}" alt=""></span>`;
  const initials = (profile.nickname || '').trim().split(/\s+/).filter(Boolean).map((w) => [...w][0]).join('').slice(0, 2).toUpperCase();
  return html`<span class="avatar avatar--${size}" aria-hidden="true">${initials || icon('user')}</span>`;
}

/** "Coming in Phase N" card listing what a later phase adds. items: [[iconName, text], …] */
export function roadmapCard({ phase, title, note = '', items = [] }) {
  return html`<section class="roadmap card" aria-label="${title}">
    <div class="roadmap__head"><span class="badge">${typeof phase === 'number' ? `Phase ${phase}` : phase}</span><h2 class="roadmap__title">${title}</h2></div>
    ${note ? html`<p class="roadmap__note">${note}</p>` : ''}
    <ul class="roadmap__list">${items.map(([ic, text]) => html`<li>${icon(ic)}<span>${text}</span></li>`)}</ul>
  </section>`;
}

/** Page heading used by module screens and Settings. */
export function pageHead({ title, iconName, accent, eyebrow = '', aside = '' }) {
  return html`<header class="page-head accent-${accent}">
    <span class="page-head__icon">${icon(iconName)}</span>
    <div class="page-head__text">
      ${eyebrow ? html`<p class="page-head__eyebrow">${eyebrow}</p>` : ''}
      <h1 class="page-title" tabindex="-1">${title}</h1>
    </div>
    ${aside ? html`<div class="page-head__aside">${aside}</div>` : ''}
  </header>`;
}

/* Live stopwatches: any element with data-elapsed-since="<ISO>" (and optional
   data-paused-ms) shows the time elapsed, computed from the stored start time.
   Because it's computed rather than counted, it stays correct after the phone
   locks or the app closes. */
export function liveElapsed(startedAtISO, pausedMs = 0) {
  const ms = Date.now() - new Date(startedAtISO).getTime() - pausedMs;
  return html`<span class="num" data-elapsed-since="${startedAtISO}" data-paused-ms="${pausedMs}">${formatClock(ms)}</span>`;
}

export function startLiveClocks() {
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    document.querySelectorAll('[data-elapsed-since]').forEach((el) => {
      const ms = Date.now() - new Date(el.dataset.elapsedSince).getTime() - Number(el.dataset.pausedMs || 0);
      el.textContent = formatClock(ms);
    });
  }, 1000);
}
