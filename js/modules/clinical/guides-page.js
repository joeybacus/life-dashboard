/* Guidelines (#/neurology/guidelines) — your saved guidelines, by topic, with
   a search box. Each one can have a link (opens in the browser), a PDF (opens
   here, even offline, and can be shared to Files or Books) and notes. */
import { html, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { on } from '../../core/events.js';
import { subHead } from '../../core/components.js';
import { actionSheet, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { foldText } from '../todo/model.js';
import {
  MAX_NOTES, MAX_TITLE, MAX_TOPIC, MAX_URL, allGuides, cleanUrl, deleteGuide, guide, pdfOf, pdfProblem, restoreGuide, saveGuide, topics,
} from './guides.js';
import { guideTransfers, pdfState } from './guides-transfer.js';

let view = null;
let showing = false;
let query = '';

const mb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export const guidesPage = {
  show(el) {
    view = el;
    showing = true;
    render();
  },
  hide() {
    showing = false;
  },
};

on('guides', () => { if (showing) renderList(); });
on('guides-files', () => { if (showing) renderList(); });
on('guides-transfer', () => { if (showing) renderList(); });

/* ---------- The page ---------- */

function pdfLine(g) {
  if (!g.fileKey) return '';
  const where = pdfState(g);
  const t = guideTransfers();
  const note = where === 'up' ? (t.blocked === 'not-connected' ? 'on this device — goes to Google Drive once sync is connected'
    : t.blocked === 'script' ? 'on this device — update the sync script to copy it to Google Drive'
      : t.blocked === 'offline' ? 'on this device — goes to Google Drive when you’re online' : 'saving to Google Drive…')
    : where === 'down' ? (t.blocked ? 'in Google Drive — downloads when sync can reach it' : 'downloading…')
      : where === 'missing' ? 'not found in Google Drive' : '';
  return html`<span class="gl-card__pdf">${icon('paperclip')}PDF · ${mb(g.fileSize)}${note ? ` · ${note}` : ''}</span>`;
}

function card(g) {
  return html`<li class="card gl-card">
    <div class="gl-card__head">
      <h3 class="gl-card__title">${g.title}</h3>
      <button type="button" class="icon-btn gl-card__more" data-gact="menu" data-id="${g.id}" aria-label="Options for ${g.title}">${icon('more')}</button>
    </div>
    ${g.notes ? html`<p class="gl-card__notes">${g.notes}</p>` : ''}
    <div class="gl-card__meta">${pdfLine(g)}${g.url ? html`<span class="gl-card__host">${icon('link')}${hostOf(g.url)}</span>` : ''}</div>
    ${g.fileKey || g.url ? html`<div class="gl-card__actions">
      ${g.fileKey ? html`<button type="button" class="btn btn--sm btn--primary" data-gact="pdf" data-id="${g.id}">${icon('book')}Open PDF</button>` : ''}
      ${g.url ? html`<a class="btn btn--sm" href="${g.url}" target="_blank" rel="noopener">${icon('external')}Open link</a>` : ''}
    </div>` : ''}
  </li>`;
}

function listMarkup() {
  const all = allGuides();
  if (!all.length) {
    return html`<div class="card gl-empty">
      <span class="gl-empty__icon">${icon('book')}</span>
      <p class="gl-empty__title">No guidelines yet</p>
      <p class="gl-empty__text">Save the guidelines you look up most — a link, a PDF, or both — sorted by topic. PDFs open here even offline, and are copied to your Google Drive.</p>
      <button type="button" class="btn btn--primary" data-gact="add">${icon('plus')}Add a guideline</button>
    </div>`;
  }
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const hits = all.filter((g) => {
    const hay = foldText([g.title, g.topic, g.notes, g.fileName, hostOf(g.url)].join(' '));
    return words.every((w) => hay.includes(w));
  });
  if (!hits.length) return html`<p class="gl-none">Nothing matches “${query.trim()}”.</p>`;
  const groups = [...topics(), ''].map((t) => [t, hits.filter((g) => (g.topic || '') === t)]).filter(([, list]) => list.length);
  return groups.map(([t, list]) => html`<section class="gl-group" aria-label="${t || 'No topic'}">
    <h2 class="sc-group__title">${t || 'No topic'}<span class="ward-group__count">${list.length}</span></h2>
    <ul class="gl-list">${list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })).map(card)}</ul>
  </section>`);
}

function render() {
  if (!view || !showing) return;
  setHTML(view, html`<div class="gl-page accent-neuro">
    ${subHead({ title: 'Guidelines', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools',
      actions: html`<button type="button" class="btn btn--sm btn--primary" data-gact="add">${icon('plus')}Add</button>` })}
    ${allGuides().length ? html`<label class="gl-search">${icon('search')}<input type="search" class="gl-search__input" data-gsearch placeholder="Search guidelines" aria-label="Search guidelines" value="${query}" autocomplete="off" enterkeyhint="search"></label>` : ''}
    <div data-glist>${listMarkup()}</div>
  </div>`);
}

function renderList() {
  const box = view?.querySelector('[data-glist]');
  if (!box) return render();
  if (!allGuides().length || !view.querySelector('[data-gsearch]')) return render();
  setHTML(box, listMarkup());
}

/* ---------- Adding and changing ---------- */

async function editor(id = null) {
  const g = id ? guide(id) : null;
  const start = { title: g?.title ?? '', topic: g?.topic ?? '', url: g?.url ?? '', notes: g?.notes ?? '' };
  let file = null;       // a new PDF chosen in this pop-up
  let removePdf = false;
  const result = await openDialog({
    variant: 'modal',
    className: 'gl-dlg accent-neuro',
    dismissible: false,
    title: g ? 'Edit guideline' : 'Add a guideline',
    body: html`<form class="form" data-form novalidate>
      <label class="field"><span class="field__label">Title</span>
        <input class="input" name="title" value="${start.title}" maxlength="${MAX_TITLE}" placeholder="For example: AHA/ASA Acute Ischemic Stroke 2019" autocomplete="off" autocapitalize="sentences" enterkeyhint="next" required>
      </label>
      <label class="field"><span class="field__label">Topic</span>
        <input class="input" name="topic" value="${start.topic}" maxlength="${MAX_TOPIC}" placeholder="For example: Stroke, Epilepsy, Headache" list="gl-topics" autocomplete="off" autocapitalize="words" enterkeyhint="next">
        <datalist id="gl-topics">${topics().map((t) => html`<option value="${t}"></option>`)}</datalist>
      </label>
      <label class="field"><span class="field__label">Link</span>
        <input class="input" name="url" type="url" inputmode="url" value="${start.url}" maxlength="${MAX_URL}" placeholder="https://…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next">
      </label>
      <div class="field"><span class="field__label">PDF</span>
        <div class="gl-file" data-gfile></div>
        <input type="file" accept="application/pdf,.pdf" class="sr-only" data-gfile-input tabindex="-1" aria-hidden="true">
      </div>
      <label class="field"><span class="field__label">Notes</span>
        <textarea class="input textarea" name="notes" rows="4" maxlength="${MAX_NOTES}" placeholder="Key points, doses, which page to look at…" autocapitalize="sentences">${start.notes}</textarea>
      </label>
      <p class="field__error" data-gerror role="alert" hidden></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-form]');
      const fileBox = dlg.querySelector('[data-gfile]');
      const input = dlg.querySelector('[data-gfile-input]');
      const error = dlg.querySelector('[data-gerror]');
      const showError = (text) => { error.textContent = text; error.hidden = !text; };
      const drawFile = () => {
        const name = file ? file.name : !removePdf && g?.fileKey ? g.fileName : '';
        const size = file ? file.size : g?.fileSize ?? 0;
        setHTML(fileBox, name
          ? html`<span class="gl-file__name">${icon('paperclip')}<span>${name} · ${mb(size)}</span></span>
            <button type="button" class="btn btn--sm" data-gfile-pick>Replace</button>
            <button type="button" class="btn btn--sm" data-gfile-remove>Remove</button>`
          : html`<button type="button" class="btn btn--sm" data-gfile-pick>${icon('upload')}Choose a PDF</button><span class="gl-file__hint">Up to 25 MB</span>`);
      };
      drawFile();
      fileBox.addEventListener('click', (e) => {
        if (e.target.closest('[data-gfile-pick]')) input.click();
        if (e.target.closest('[data-gfile-remove]')) { file = null; removePdf = Boolean(g?.fileKey); drawFile(); }
      });
      input.addEventListener('change', () => {
        const picked = input.files?.[0];
        input.value = '';
        if (!picked) return;
        const problem = pdfProblem(picked);
        if (problem) { showError(problem); return; }
        showError('');
        file = picked;
        removePdf = false;
        if (!form.elements.title.value.trim()) form.elements.title.value = picked.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').slice(0, MAX_TITLE);
        drawFile();
      });
      const values = () => ({ title: form.elements.title.value, topic: form.elements.topic.value, url: form.elements.url.value, notes: form.elements.notes.value });
      const changed = () => file || removePdf || Object.keys(start).some((k) => values()[k].trim() !== start[k]);
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => form.elements.title.focus({ preventScroll: true }), 120);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (changed() && !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = values();
        if (!v.title.trim()) { showError('Give it a title.'); form.elements.title.focus(); return; }
        if (v.url.trim() && !cleanUrl(v.url)) { showError('That link doesn’t look like a web address.'); form.elements.url.focus(); return; }
        close(v);
      });
    },
  });
  if (!result) return;
  try {
    await saveGuide(id, result, { file, removePdf });
    toast(id ? 'Guideline saved' : 'Guideline added', { icon: 'check' });
  } catch (err) {
    console.error(err);
    toast(/quota/i.test(err?.message ?? '') ? 'This device is out of space for the PDF.' : 'The guideline couldn’t be saved.');
  }
}

/* ---------- Opening a PDF ---------- */

async function openPdf(id) {
  const g = guide(id);
  if (!g) return;
  const blob = await pdfOf(g);
  if (!blob) {
    const where = pdfState(g);
    toast(where === 'missing' ? 'This PDF isn’t in your Google Drive any more. Edit the guideline to add it again.'
      : guideTransfers().blocked ? 'This PDF is on your other device. It downloads here once sync can reach Google Drive.'
        : 'Still downloading this PDF — try again in a moment.');
    return;
  }
  const file = new File([blob], g.fileName || 'Guideline.pdf', { type: 'application/pdf' });
  const url = URL.createObjectURL(file);
  const canShare = Boolean(navigator.canShare?.({ files: [file] }));
  await openDialog({
    variant: 'modal',
    className: 'pdf-dlg accent-neuro',
    body: html`<div class="pdf-view">
      <div class="pdf-view__bar">
        <button type="button" class="btn btn--sm" data-dialog-value="close">${icon('x')}Close</button>
        <span class="pdf-view__title">${g.title}</span>
        ${canShare ? html`<button type="button" class="btn btn--sm" data-pdf-share>${icon('share')}Share</button>` : ''}
        <a class="btn btn--sm" href="${url}" target="_blank" rel="noopener" download="${file.name}">${icon('external')}Open</a>
      </div>
      <iframe class="pdf-view__frame" src="${url}" title="${g.title}"></iframe>
    </div>`,
    onOpen(dlg) {
      dlg.querySelector('[data-pdf-share]')?.addEventListener('click', () => {
        navigator.share({ files: [file], title: g.title }).catch(() => {});
      });
    },
  });
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Doing things ---------- */

async function menu(id) {
  const g = guide(id);
  if (!g) return;
  const choice = await actionSheet({
    title: g.title,
    items: [
      { label: 'Edit', value: 'edit', icon: 'edit' },
      { label: 'Delete', value: 'delete', icon: 'trash', destructive: true },
    ],
  });
  if (choice === 'edit') editor(id);
  if (choice === 'delete') {
    if (!(await confirmDialog({ title: 'Delete this guideline?', message: g.fileKey ? 'Its PDF goes to the Google Drive trash, where it stays for 30 days.' : 'You can undo this straight away.', confirmLabel: 'Delete', destructive: true }))) return;
    const before = await deleteGuide(id);
    toast('Guideline deleted', { action: { label: 'Undo', onClick: () => restoreGuide(before) } });
  }
}

function onClick(e) {
  const btn = e.target.closest('[data-gact]');
  if (!btn || !view?.contains(btn)) return;
  const { gact, id } = btn.dataset;
  if (gact === 'add') editor();
  else if (gact === 'menu') menu(id);
  else if (gact === 'pdf') openPdf(id);
}

/** Wired up once by the Neurology screen. */
export function wireGuides(el) {
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-gsearch]')) return;
    query = e.target.value;
    const box = view?.querySelector('[data-glist]');
    if (box) setHTML(box, listMarkup());
  });
}

/** Search everywhere opens the page showing just this guideline. */
export function showGuide(id) {
  query = guide(id)?.title ?? '';
}
