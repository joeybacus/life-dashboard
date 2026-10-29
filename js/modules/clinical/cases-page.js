/* Cases (#/neurology/cases, and #/neurology/cases/<id> for one) — your
   teaching cases, newest first, with a search box and tags to filter by. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { openPage, replacePage } from '../../core/router.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { formatDayYear, todayKey } from '../../core/manila.js';
import { foldText } from '../todo/model.js';
import {
  MAX_DIAGNOSIS, MAX_LEARNING, MAX_STORY, MAX_TITLE, allCases, allTags, deleteCase, getCase, parseTags, restoreCase, saveCase,
} from './cases.js';

const NO_NAMES = 'Leave out names, hospital numbers and birthdays — cases sync to your Google Sheet.';

let view = null;
let showing = false;
let openId = null;   // the case shown, or null for the list
let query = '';
let tag = '';        // the tag filtered by, or ''

export const casesPage = {
  show(el, id) {
    view = el;
    showing = true;
    openId = id ?? null;
    if (openId && !getCase(openId)) {
      replacePage('cases');
      return;
    }
    render();
  },
  hide() {
    showing = false;
  },
};

on('cases', () => {
  if (!showing) return;
  if (openId && !getCase(openId)) { replacePage('cases'); return; }
  if (openId) render(); else renderList();
});

/* ---------- The list ---------- */

function caseCard(c) {
  return html`<li><a class="card cs-card" href="#/neurology/cases/${c.id}" data-action="nav" data-route="neurology" data-sub="cases/${c.id}">
    <span class="cs-card__top">
      <span class="cs-card__title">${c.title}</span>
      ${c.date ? html`<span class="cs-card__date">${formatDayYear(c.date)}</span>` : ''}
    </span>
    ${c.diagnosis ? html`<span class="cs-card__dx">${c.diagnosis}</span>` : ''}
    ${c.learning ? html`<span class="cs-card__learn">${c.learning.split('\n')[0]}</span>` : ''}
    ${c.tags.length ? html`<span class="cs-tags">${c.tags.map((t) => html`<span class="tag">${t}</span>`)}</span>` : ''}
  </a></li>`;
}

function listMarkup() {
  const all = allCases();
  if (!all.length) {
    return html`<div class="card gl-empty">
      <span class="gl-empty__icon">${icon('clipboard')}</span>
      <p class="gl-empty__title">No cases yet</p>
      <p class="gl-empty__text">Keep the cases worth remembering: the story, the diagnosis and what you learned, with tags to find them again. ${NO_NAMES}</p>
      <button type="button" class="btn btn--primary" data-cact="add">${icon('plus')}Add a case</button>
    </div>`;
  }
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const hits = all.filter((c) => (!tag || c.tags.includes(tag))
    && words.every((w) => foldText([c.title, c.diagnosis, c.story, c.learning, c.tags.join(' ')].join(' ')).includes(w)));
  return html`${hits.length ? html`<ul class="cs-list">${hits.map(caseCard)}</ul>`
    : html`<p class="gl-none">No cases match${query.trim() ? ` “${query.trim()}”` : ''}${tag ? ` with the tag “${tag}”` : ''}.</p>`}`;
}

function tagBar() {
  const tags = allTags();
  if (!tags.length) return '';
  return html`<div class="cs-filter" role="group" aria-label="Filter by tag">
    <button type="button" class="cs-chip${tag ? '' : ' is-on'}" aria-pressed="${tag ? 'false' : 'true'}" data-cact="tag" data-tag="">All</button>
    ${tags.map((t) => html`<button type="button" class="cs-chip${tag === t ? ' is-on' : ''}" aria-pressed="${tag === t ? 'true' : 'false'}" data-cact="tag" data-tag="${t}">${t}</button>`)}
  </div>`;
}

function listPage() {
  const any = allCases().length > 0;
  if (tag && !allTags().includes(tag)) tag = '';
  return html`<div class="gl-page accent-neuro">
    ${subHead({ title: 'Cases', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools',
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-cact="add">${icon('plus')}Add</button>` })}
    ${any ? html`<label class="gl-search">${icon('search')}<input type="search" class="gl-search__input" data-csearch placeholder="Search cases" aria-label="Search cases" value="${query}" autocomplete="off" enterkeyhint="search"></label>` : ''}
    <div data-ctags>${tagBar()}</div>
    <div data-clist>${listMarkup()}</div>
  </div>`;
}

/* ---------- One case ---------- */

function paragraphs(text) {
  return text.split(/\n{2,}/).map((p) => html`<p>${p.split('\n').map((l, i) => html`${i ? html`<br>` : ''}${l}`)}</p>`);
}

function casePage(c) {
  return html`<div class="gl-page cs-page accent-neuro">
    ${subHead({ title: c.title, back: 'Cases', fallback: 'cases', accent: 'neuro', eyebrow: c.date ? formatDayYear(c.date) : 'Case',
      actions: html`<button type="button" class="btn btn--sm" data-cact="edit" data-id="${c.id}">${icon('edit')}Edit</button>` })}
    ${c.diagnosis ? html`<p class="cs-page__dx"><span class="cs-page__label">Diagnosis</span>${c.diagnosis}</p>` : ''}
    ${c.tags.length ? html`<div class="cs-tags">${c.tags.map((t) => html`<button type="button" class="tag tag--btn" data-cact="go-tag" data-tag="${t}">${t}</button>`)}</div>` : ''}
    <section class="card cs-section"><h2 class="study__title">The case</h2>
      ${c.story ? html`<div class="cs-text">${paragraphs(c.story)}</div>` : html`<p class="study__empty">Nothing written yet.</p>`}
    </section>
    <section class="card cs-section cs-section--learn"><h2 class="study__title">${icon('sparkles')}What I learned</h2>
      ${c.learning ? html`<div class="cs-text">${paragraphs(c.learning)}</div>` : html`<p class="study__empty">Nothing written yet.</p>`}
    </section>
    <div class="cs-page__actions">
      <button type="button" class="btn btn--sm" data-cact="copy" data-id="${c.id}">${icon('copy')}Copy text</button>
      <button type="button" class="btn btn--sm" data-cact="delete" data-id="${c.id}">${icon('trash')}Delete</button>
    </div>
  </div>`;
}

function render() {
  if (!view || !showing) return;
  const c = openId ? getCase(openId) : null;
  setHTML(view, c ? casePage(c) : listPage());
}

function renderList() {
  const box = view?.querySelector('[data-clist]');
  if (!box || !view.querySelector('[data-csearch]') || !allCases().length) return render();
  if (tag && !allTags().includes(tag)) tag = '';
  setHTML(view.querySelector('[data-ctags]'), tagBar());
  setHTML(box, listMarkup());
}

/* ---------- Adding and changing ---------- */

async function editor(id = null) {
  const c = id ? getCase(id) : null;
  const start = { title: c?.title ?? '', date: c?.date ?? todayKey(), diagnosis: c?.diagnosis ?? '', tags: (c?.tags ?? []).join(', '), story: c?.story ?? '', learning: c?.learning ?? '' };
  const result = await openDialog({
    variant: 'modal',
    className: 'cs-dlg accent-neuro',
    dismissible: false,
    title: c ? 'Edit case' : 'Add a case',
    body: html`<form class="form" data-form novalidate>
      <p class="cs-dlg__warn">${icon('shield')}<span>${NO_NAMES}</span></p>
      <label class="field"><span class="field__label">Title</span>
        <input class="input" name="title" value="${start.title}" maxlength="${MAX_TITLE}" placeholder="For example: Wake-up stroke with a large penumbra" autocomplete="off" autocapitalize="sentences" enterkeyhint="next" required>
      </label>
      <div class="cs-dlg__row">
        <label class="field"><span class="field__label">Date</span>
          <input class="input" name="date" type="date" value="${start.date}">
        </label>
        <label class="field"><span class="field__label">Diagnosis</span>
          <input class="input" name="diagnosis" value="${start.diagnosis}" maxlength="${MAX_DIAGNOSIS}" placeholder="For example: Left M1 occlusion" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
        </label>
      </div>
      <label class="field"><span class="field__label">Tags <small>separated by commas</small></span>
        <input class="input" name="tags" value="${start.tags}" placeholder="For example: stroke, thrombectomy, teaching" list="cs-tags" autocomplete="off" autocapitalize="off" enterkeyhint="next">
        <datalist id="cs-tags">${allTags().map((t) => html`<option value="${t}"></option>`)}</datalist>
      </label>
      <label class="field"><span class="field__label">The case</span>
        <textarea class="input textarea" name="story" rows="7" maxlength="${MAX_STORY}" placeholder="Presentation, examination, investigations, management, outcome…" autocapitalize="sentences">${start.story}</textarea>
      </label>
      <label class="field"><span class="field__label">What I learned</span>
        <textarea class="input textarea" name="learning" rows="4" maxlength="${MAX_LEARNING}" placeholder="The teaching points" autocapitalize="sentences">${start.learning}</textarea>
      </label>
      <p class="field__error" data-cerror role="alert" hidden></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const error = dlg.querySelector('[data-cerror]');
      const values = () => Object.fromEntries(Object.keys(start).map((k) => [k, form.elements[k].value]));
      const changed = () => Object.keys(start).some((k) => values()[k].trim() !== start[k]);
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.title.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (changed() && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = values();
        if (!v.title.trim()) {
          error.textContent = 'Give it a title.';
          error.hidden = false;
          form.elements.title.focus();
          return;
        }
        close({ ...v, tags: parseTags(v.tags) });
      });
    },
  });
  if (!result) return;
  const saved = await saveCase(id, result);
  toast(id ? 'Case saved' : 'Case added', { icon: 'check' });
  if (!id) openPage('neurology', `cases/${saved.id}`);
}

function caseText(c) {
  return [
    c.title,
    [c.date ? formatDayYear(c.date) : '', c.diagnosis].filter(Boolean).join(' · '),
    c.tags.length ? `Tags: ${c.tags.join(', ')}` : '',
    c.story ? `\nThe case\n${c.story}` : '',
    c.learning ? `\nWhat I learned\n${c.learning}` : '',
  ].filter(Boolean).join('\n');
}

async function onClick(e) {
  const btn = e.target.closest('[data-cact]');
  if (!btn || !view?.contains(btn)) return;
  const { cact, id } = btn.dataset;
  if (cact === 'add') editor();
  else if (cact === 'edit') editor(id);
  else if (cact === 'tag') {
    tag = btn.dataset.tag;
    renderList();
  } else if (cact === 'go-tag') {
    tag = btn.dataset.tag;
    query = '';
    openPage('neurology', 'cases');
  } else if (cact === 'copy') {
    const c = getCase(id);
    if (!c) return;
    try {
      await navigator.clipboard.writeText(caseText(c));
      toast('Copied', { icon: 'check' });
    } catch {
      toast('Couldn’t copy on this device.');
    }
  } else if (cact === 'delete') {
    if (!(await confirmDialog({ title: 'Delete this case?', message: 'You can undo this straight away.', confirmLabel: 'Delete', destructive: true }))) return;
    const before = await deleteCase(id); // the page goes back to the list by itself
    toast('Case deleted', { action: { label: 'Undo', onClick: () => restoreCase(before) } });
  }
}

/** Wired up once by the Neurology screen. */
export function wireCases(el) {
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-csearch]')) return;
    query = e.target.value;
    const box = view?.querySelector('[data-clist]');
    if (box) setHTML(box, listMarkup());
  });
}
