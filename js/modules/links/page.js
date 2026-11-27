/* My links (#/neurology/links, 0.11.59) — your own links in one place: your
   resume, work experience, PDS, certificates… each with a title, a group and
   a note, opened with one tap or copied to paste somewhere.

   Synced between your devices with no sync script update: the whole list is
   one record in the settings store ({ id: 'links', links: [{ id, title, group,
   url, note }], updatedAt }), so it travels in the Settings tab like your app
   settings do, and it is in backup files. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { db } from '../../core/db.js';
import { on } from '../../core/events.js';
import { uid } from '../../core/ids.js';
import { nowISO } from '../../core/dates.js';
import { saveRecord } from '../../core/records.js';
import { subHead } from '../../core/components.js';
import { actionSheet, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { foldText } from '../todo/model.js';
import { cleanUrl } from '../clinical/guides.js';

const RECORD_ID = 'links';
const MAX_TITLE = 160;
const MAX_GROUP = 60;
const MAX_URL = 2000;
const MAX_NOTE = 1000;
const SUGGESTED_GROUPS = ['Resume', 'Work experience', 'PDS', 'Certificates', 'Licenses', 'Training'];

let view = null;
let showing = false;
let query = '';
let links = [];
let loaded = false;

const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

async function load() {
  const rec = await db.get('settings', RECORD_ID);
  links = Array.isArray(rec?.links) ? rec.links : [];
  loaded = true;
}

const save = () => saveRecord('settings', { id: RECORD_ID, links, updatedAt: nowISO() });

const groups = () => [...new Set(links.map((l) => l.group).filter(Boolean))].sort(byName);

/** For the Neurology tile. */
export const linksCount = () => links.length;

export async function initLinks() {
  on('data', async ({ reason }) => {
    if (reason !== 'sync' && reason !== 'restore' && reason !== 'reset') return;
    await load();
    if (showing) render();
  });
  await load();
}

export const linksPage = {
  async show(el) {
    view = el;
    showing = true;
    if (!loaded) await load();
    if (showing) render();
  },
  hide() {
    showing = false;
  },
};

/* ---------- The page ---------- */

function card(l) {
  return html`<li class="card gl-card">
    <div class="gl-card__head">
      <h3 class="gl-card__title">${l.title}</h3>
      <button type="button" class="icon-btn gl-card__more" data-lact="menu" data-id="${l.id}" aria-label="Options for ${l.title}">${icon('more')}</button>
    </div>
    ${l.note ? html`<p class="gl-card__notes">${l.note}</p>` : ''}
    <div class="gl-card__meta"><span class="gl-card__host">${icon('link')}${hostOf(l.url)}</span></div>
    <div class="gl-card__actions">
      <a class="btn btn--sm btn--primary" href="${l.url}" target="_blank" rel="noopener">${icon('external')}Open</a>
      <button type="button" class="btn btn--sm" data-lact="copy" data-id="${l.id}">${icon('copy')}Copy link</button>
    </div>
  </li>`;
}

function listMarkup() {
  if (!links.length) {
    return html`<div class="card gl-empty">
      <span class="gl-empty__icon">${icon('briefcase')}</span>
      <p class="gl-empty__title">No links yet</p>
      <p class="gl-empty__text">Keep your resume, work experience, PDS and other links here, in groups. Open them with one tap, or copy a link to paste into a form or a message. They show on all your devices.</p>
      <button type="button" class="btn btn--primary" data-lact="add">${icon('plus')}Add a link</button>
    </div>`;
  }
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const hits = links.filter((l) => {
    const hay = foldText([l.title, l.group, l.note, hostOf(l.url)].join(' '));
    return words.every((w) => hay.includes(w));
  });
  if (!hits.length) return html`<p class="gl-none">Nothing matches “${query.trim()}”.</p>`;
  const sections = [...groups(), ''].map((g) => [g, hits.filter((l) => (l.group || '') === g)]).filter(([, list]) => list.length);
  return sections.map(([g, list]) => html`<section class="gl-group" aria-label="${g || 'Other'}">
    <h2 class="sc-group__title">${g || 'Other'}<span class="ward-group__count">${list.length}</span></h2>
    <ul class="gl-list">${list.sort((a, b) => byName(a.title, b.title)).map(card)}</ul>
  </section>`);
}

function render() {
  if (!view || !showing) return;
  setHTML(view, html`<div class="gl-page accent-neuro">
    ${subHead({ title: 'My links', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Resume, work experience, PDS…',
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-lact="add">${icon('plus')}Add</button>` })}
    ${links.length ? html`<label class="gl-search">${icon('search')}<input type="search" class="gl-search__input" data-lsearch placeholder="Search your links" aria-label="Search your links" value="${query}" autocomplete="off" enterkeyhint="search"></label>` : ''}
    <div data-llist>${listMarkup()}</div>
  </div>`);
}

/* ---------- Adding and changing ---------- */

async function editor(id = null) {
  const l = id ? links.find((x) => x.id === id) : null;
  const start = { title: l?.title ?? '', group: l?.group ?? '', url: l?.url ?? '', note: l?.note ?? '' };
  const suggestions = [...new Set([...groups(), ...SUGGESTED_GROUPS])];
  const result = await openDialog({
    variant: 'modal',
    className: 'gl-dlg accent-neuro',
    dismissible: false,
    title: l ? 'Edit link' : 'Add a link',
    body: html`<form class="form" data-form novalidate>
      <label class="field"><span class="field__label">Title</span>
        <input class="input" name="title" value="${start.title}" maxlength="${MAX_TITLE}" placeholder="For example: Resume (2026)" autocomplete="off" autocapitalize="sentences" enterkeyhint="next" required>
      </label>
      <label class="field"><span class="field__label">Link</span>
        <input class="input" name="url" type="url" inputmode="url" value="${start.url}" maxlength="${MAX_URL}" placeholder="https://drive.google.com/…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" required>
      </label>
      <label class="field"><span class="field__label">Group</span>
        <input class="input" name="group" value="${start.group}" maxlength="${MAX_GROUP}" placeholder="For example: Resume, Work experience, PDS" list="lk-groups" autocomplete="off" autocapitalize="words" enterkeyhint="next">
        <datalist id="lk-groups">${suggestions.map((g) => html`<option value="${g}"></option>`)}</datalist>
      </label>
      <label class="field"><span class="field__label">Note</span>
        <textarea class="input textarea" name="note" rows="3" maxlength="${MAX_NOTE}" placeholder="Optional — which version, where it was sent…" autocapitalize="sentences">${start.note}</textarea>
      </label>
      <p class="field__error" data-lerror role="alert" hidden></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const error = dlg.querySelector('[data-lerror]');
      const showError = (text) => { error.textContent = text; error.hidden = !text; };
      const values = () => ({ title: form.elements.title.value, group: form.elements.group.value, url: form.elements.url.value, note: form.elements.note.value });
      const changed = () => Object.keys(start).some((k) => values()[k].trim() !== start[k]);
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.title.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (changed() && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = values();
        if (!v.title.trim()) { showError('Give it a title.'); form.elements.title.focus(); return; }
        if (!cleanUrl(v.url)) { showError(v.url.trim() ? 'That link doesn’t look like a web address.' : 'Paste the link.'); form.elements.url.focus(); return; }
        close(v);
      });
    },
  });
  if (!result) return;
  const next = {
    id: l?.id ?? uid(),
    title: oneLine(result.title, MAX_TITLE),
    group: oneLine(result.group, MAX_GROUP),
    url: cleanUrl(result.url),
    note: String(result.note ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE),
  };
  links = l ? links.map((x) => (x.id === l.id ? next : x)) : [...links, next];
  try {
    await save();
    toast(l ? 'Link saved' : 'Link added', { icon: 'check' });
  } catch (err) {
    console.error(err);
    toast('The link couldn’t be saved.');
  }
  render();
}

async function copyLink(id) {
  const l = links.find((x) => x.id === id);
  if (!l) return;
  try {
    await navigator.clipboard.writeText(l.url);
    toast('Link copied', { icon: 'check' });
  } catch {
    toast('Couldn’t copy — open the link and copy it from there.');
  }
}

async function menu(id) {
  const l = links.find((x) => x.id === id);
  if (!l) return;
  const choice = await actionSheet({
    title: l.title,
    items: [
      { label: 'Edit', value: 'edit', icon: 'edit' },
      { label: 'Delete', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'edit') editor(id);
  if (choice === 'delete') {
    const i = links.findIndex((x) => x.id === id);
    if (i < 0) return;
    links = links.filter((x) => x.id !== id);
    await save();
    render();
    toast('Link deleted', { action: { label: 'Undo', onClick: async () => {
      if (links.some((x) => x.id === l.id)) return;
      links = [...links.slice(0, i), l, ...links.slice(i)];
      await save();
      if (showing) render();
    } } });
  }
}

function onClick(e) {
  const btn = e.target.closest('[data-lact]');
  if (!btn || !view?.contains(btn)) return;
  const { lact, id } = btn.dataset;
  if (lact === 'add') editor();
  else if (lact === 'menu') menu(id);
  else if (lact === 'copy') copyLink(id);
}

/** Wired up once by the Neurology screen. */
export function wireLinks(el) {
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-lsearch]')) return;
    query = e.target.value;
    const box = view?.querySelector('[data-llist]');
    if (box) setHTML(box, listMarkup());
  });
}
