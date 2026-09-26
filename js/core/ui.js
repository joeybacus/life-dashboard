/* Shared UI: toasts, dialogs / bottom sheets, confirmations, screen-reader announcements. */
import { html, raw, setHTML } from './html.js';
import { icon } from './icons.js';
import { prefersReducedMotion } from './platform.js';

/** Read a short message aloud with VoiceOver (no visual change). */
export function announce(message) {
  const el = document.getElementById('announcer');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = message; }, 60);
}

let activeToast = null;

/** Small message above the tab bar. Optional action button, e.g. { label: 'Undo', onClick }. */
export function toast(message, { action, duration, icon: iconName } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return null;
  activeToast?.dismiss(true);

  const el = document.createElement('div');
  el.className = 'toast';
  setHTML(el, html`${iconName ? icon(iconName) : ''}<span class="toast__msg">${message}</span>${
    action ? html`<button type="button" class="toast__action">${action.label}</button>` : ''}`);
  host.append(el);
  void el.offsetWidth; // start the entrance transition
  el.classList.add('is-in');

  const handle = {
    dismiss(immediate = false) {
      clearTimeout(timer);
      if (activeToast === handle) activeToast = null;
      if (immediate) { el.remove(); return; }
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 280);
    },
  };
  const timer = setTimeout(() => handle.dismiss(), duration ?? (action ? 5500 : 3200));
  if (action) {
    el.querySelector('.toast__action').addEventListener('click', () => {
      handle.dismiss();
      action.onClick?.();
    });
  }
  activeToast = handle;
  return handle;
}

let dialogSeq = 0;

/**
 * Open a dialog. variant: 'sheet' (slides up on phones), 'alert' (small centred) or 'modal'.
 * actions: [{ label, value, variant: 'primary'|'ghost'|'danger-solid', autofocus, href }]
 * Resolves with the chosen action's value, or null when dismissed.
 */
export function openDialog({ title = '', body = '', actions = [], variant = 'sheet', dismissible = true, className = '', onOpen } = {}) {
  return new Promise((resolve) => {
    const id = `dlg-${++dialogSeq}`;
    const dlg = document.createElement('dialog');
    dlg.className = `dlg dlg--${variant}${className ? ` ${className}` : ''}`;
    if (title) dlg.setAttribute('aria-labelledby', `${id}-title`);

    const actionButton = (a) => {
      const cls = `btn${a.variant ? ` btn--${a.variant}` : ''}`;
      return a.href
        ? html`<a class="${cls}" href="${a.href}" target="_blank" rel="noopener" data-dialog-value="${a.value}">${a.label}</a>`
        : html`<button type="button" class="${cls}" data-dialog-value="${a.value}"${a.autofocus ? raw(' autofocus') : ''}>${a.label}</button>`;
    };

    setHTML(dlg, html`
      <div class="dlg__panel">
        ${variant === 'sheet' ? html`<div class="dlg__grabber" aria-hidden="true"></div>` : ''}
        ${title ? html`<h2 class="dlg__title" id="${id}-title">${title}</h2>` : ''}
        <div class="dlg__body">${body}</div>
        ${actions.length ? html`<div class="dlg__actions">${actions.map(actionButton)}</div>` : ''}
      </div>`);

    document.body.append(dlg);
    document.documentElement.classList.add('has-dialog');

    let settled = false;
    const close = (value = null) => {
      if (settled) return;
      settled = true;
      const finish = () => {
        if (dlg.open) dlg.close();
        dlg.remove();
        if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('has-dialog');
        resolve(value);
      };
      if (prefersReducedMotion()) { finish(); return; }
      dlg.classList.add('is-closing');
      setTimeout(finish, 240);
    };

    dlg.addEventListener('cancel', (event) => {
      event.preventDefault(); // Escape key
      if (dismissible) close(null);
    });
    dlg.addEventListener('click', (event) => {
      const chosen = event.target.closest('[data-dialog-value]');
      if (chosen) {
        if (!chosen.href) event.preventDefault();
        close(chosen.dataset.dialogValue);
        return;
      }
      if (event.target === dlg && dismissible) close(null); // tap on the dimmed backdrop
    });

    dlg.showModal();
    onOpen?.(dlg, close);
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }) {
  const value = await openDialog({
    variant: 'alert',
    title,
    body: html`<p class="dlg__msg">${message}</p>`,
    actions: [
      { label: cancelLabel, value: 'cancel', variant: 'ghost', autofocus: true },
      { label: confirmLabel, value: 'confirm', variant: destructive ? 'danger-solid' : 'primary' },
    ],
  });
  return value === 'confirm';
}

/**
 * iOS-style list of choices in a sheet. Resolves with the chosen item's value, or null.
 * items: [{ label, value, icon, detail, destructive, disabled, checked }] (falsy items are skipped)
 */
export async function actionSheet({ title = '', message = '', items = [], cancelLabel = 'Cancel' } = {}) {
  const choice = await openDialog({
    variant: 'sheet',
    className: 'action-sheet',
    title,
    body: html`${message ? html`<p class="dlg__msg">${message}</p>` : ''}
      <div class="action-list">${items.filter(Boolean).map((item) => html`<button type="button"
          class="action-item${item.destructive ? ' action-item--danger' : ''}${item.checked ? ' is-checked' : ''}"
          data-dialog-value="${item.value}"${item.disabled ? raw(' disabled') : ''}${item.checked ? raw(' aria-current="true"') : ''}>
        ${item.icon ? icon(item.icon) : ''}<span class="action-item__label">${item.label}</span>
        ${item.detail ? html`<span class="action-item__detail">${item.detail}</span>` : ''}
        ${item.checked ? icon('check', 'action-item__check') : ''}
      </button>`)}</div>`,
    actions: [{ label: cancelLabel, value: '__cancel', variant: 'ghost' }],
  });
  return choice === '__cancel' ? null : choice;
}

/** Ask for a line (or a few lines) of text. Resolves with the trimmed text, or null when cancelled. */
export async function promptDialog({ title, label = '', value = '', placeholder = '', confirmLabel = 'Save', maxLength = 200, multiline = false, required = false } = {}) {
  const result = await openDialog({
    variant: 'alert',
    className: 'prompt-dialog',
    title,
    body: html`<form class="prompt" data-prompt novalidate>
      <label class="field">${label ? html`<span class="field__label">${label}</span>` : ''}
        ${multiline
          ? html`<textarea class="input textarea" name="text" rows="3" maxlength="${maxLength}" placeholder="${placeholder}">${value}</textarea>`
          : html`<input class="input" name="text" value="${value}" maxlength="${maxLength}" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done">`}
      </label>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="__cancel">Cancel</button>
        <button type="submit" class="btn btn--primary">${confirmLabel}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-prompt]');
      const field = form.elements.text;
      setTimeout(() => {
        field.focus();
        if (!multiline) field.select();
      }, 60);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = field.value.trim();
        if (required && !text) {
          field.focus();
          return;
        }
        close({ text });
      });
    },
  });
  return result && typeof result === 'object' ? result.text : null;
}
