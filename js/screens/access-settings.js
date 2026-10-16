/* Settings → Lock and invites: the master password, invite links with end dates, and locking this device. */
import { registerAction } from '../core/actions.js';
import { html, raw } from '../core/html.js';
import { icon } from '../core/icons.js';
import { confirmDialog, openDialog, toast } from '../core/ui.js';
import { addDays, toDateKey } from '../core/dates.js';
import {
  buildAccessConfig, canSetMaster, currentAccess, forgetInvite, formatEnds, inviteEnded, lockConfigured, lockDevice,
  madeInvites, makeInvite, saveAccessConfig,
} from '../services/access.js';

const MIN_LENGTH = 8;
const TRIAL_DAYS = 14;

/** The Settings section (rerender: redraw Settings after a change). */
export function accessSection() {
  const access = currentAccess() ?? { kind: 'open' };
  let rows;
  let foot;
  if (!lockConfigured()) {
    rows = html`<div class="row row--icon accent-neutral">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Lock is off</span><span class="row__sub">Anyone with the web address can open the app (they get an empty copy — never your data).</span></span>
      </div>
      ${canSetMaster() ? html`<button type="button" class="row row--icon accent-brand" data-action="access:master">
        <span class="row__icon">${icon('shield')}</span>
        <span class="row__text"><span class="row__label">Set master password</span><span class="row__sub">Then publish with GitHub Desktop to lock the live app</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>` : ''}`;
    foot = canSetMaster() ? '' : 'To turn the lock on, double-click “Start Preview” on your Mac and open Settings there.';
  } else if (access.kind === 'master') {
    const invites = madeInvites();
    rows = html`<div class="row row--icon accent-brand">
        <span class="row__icon">${icon('shield')}</span>
        <span class="row__text"><span class="row__label">Unlocked with your master password</span><span class="row__sub">Your password never ends</span></span>
      </div>
      <button type="button" class="row row--icon accent-brand" data-action="access:invite">
        <span class="row__icon">${icon('link')}</span>
        <span class="row__text"><span class="row__label">Invite someone</span><span class="row__sub">A link that works until the end date you choose</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
      ${invites.map((i) => html`<div class="row row--icon accent-neutral access-invite${inviteEnded(i) ? ' is-ended' : ''}">
        <span class="row__icon">${icon('clock')}</span>
        <span class="row__text"><span class="row__label">${i.name}</span><span class="row__sub">${inviteEnded(i) ? `Ended ${formatEnds(i.ends)}` : `Until ${formatEnds(i.ends)}`}</span></span>
        ${inviteEnded(i)
          ? html`<button type="button" class="btn btn--sm row__control" data-action="access:forget" data-id="${i.id}">Remove</button>`
          : html`<button type="button" class="btn btn--sm row__control" data-action="access:copy" data-id="${i.id}">${icon('copy')}Copy link</button>`}
      </div>`)}
      ${canSetMaster() ? html`<button type="button" class="row row--icon accent-neutral" data-action="access:master">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Change master password</span><span class="row__sub">Also cancels every invite you’ve sent</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>` : ''}
      <button type="button" class="row row--icon row--danger accent-danger" data-action="access:lock">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Lock this device</span><span class="row__sub">Asks for the password again. Your data stays.</span></span>
      </button>`;
    foot = `Invites listed here were made on this device. A trial ends by itself after its end date. To end every trial early, change the master password${canSetMaster() ? '' : ' (in the preview on your Mac)'} and publish.`;
  } else {
    rows = html`<div class="row row--icon accent-brand">
        <span class="row__icon">${icon('clock')}</span>
        <span class="row__text"><span class="row__label">Trial${access.name ? ` for ${access.name}` : ''}</span><span class="row__sub">Ends ${access.ends ? formatEnds(access.ends) : ''}</span></span>
      </div>
      <button type="button" class="row row--icon row--danger accent-danger" data-action="access:lock">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Lock this device</span><span class="row__sub">You’ll need your invite link again to get back in</span></span>
      </button>`;
    foot = '';
  }
  return html`<section class="group" id="settings-access" aria-labelledby="set-access-title">
    <h2 class="group__title" id="set-access-title">Lock and invites</h2>
    <div class="card group__card">${rows}</div>
    ${foot ? html`<p class="group__foot">${foot}</p>` : ''}
  </section>`;
}

async function copyText(text, done = 'Link copied.') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, { icon: 'copy' });
  } catch {
    toast('Couldn’t copy here — press and hold the link to copy it.');
  }
}

/** Ask before throwing away what was typed (pop-ups with typing close only with their buttons). */
async function keepTyping(form) {
  const typed = [...form.querySelectorAll('input')].some((i) => i.type !== 'date' && i.value.trim());
  if (!typed) return false;
  return !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }));
}

/** A typing pop-up: resolves with the form's values, or null. check(form) returns an error message or ''. */
function formDialog({ title, body, saveLabel, check }) {
  return openDialog({
    variant: 'alert',
    className: 'prompt-dialog',
    dismissible: false,
    title,
    body: html`<form class="prompt access-form" novalidate>${body}
      <p class="access-form__msg" role="alert"></p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${saveLabel}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('form');
      setTimeout(() => form.querySelector('input')?.focus(), 60);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (!(await keepTyping(form))) close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const problem = check(form);
        form.querySelector('.access-form__msg').textContent = problem;
        if (!problem) close(Object.fromEntries(new FormData(form)));
      });
    },
  });
}

async function setMaster(rerender) {
  const changing = lockConfigured();
  const values = await formDialog({
    title: changing ? 'Change master password' : 'Set master password',
    saveLabel: 'Save',
    body: html`<p class="dlg__msg">${changing
      ? 'Every invite you’ve sent stops working, and each of your devices asks for the new password once.'
      : 'You’ll type this once on each of your devices. Pick something you won’t forget — it can’t be recovered, only replaced here.'}</p>
      <label class="field"><span class="field__label">New master password</span>
        <input class="input" name="password" type="password" autocomplete="new-password" minlength="${MIN_LENGTH}"></label>
      <label class="field"><span class="field__label">Type it again</span>
        <input class="input" name="again" type="password" autocomplete="new-password"></label>`,
    check(form) {
      const { password, again } = Object.fromEntries(new FormData(form));
      if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
      if (password !== again) return 'The two passwords don’t match.';
      return '';
    },
  });
  if (!values) return;
  try {
    await saveAccessConfig(await buildAccessConfig(values.password));
  } catch (err) {
    toast(`Not saved: ${err.message}`);
    return;
  }
  await openDialog({
    variant: 'alert',
    title: 'Master password saved',
    body: html`<p class="dlg__msg">The app reloads now and asks for it once.</p>
      <p class="dlg__msg"><strong>Then publish with GitHub Desktop</strong> (commit, then Push) — the live app is locked from then on.</p>`,
    actions: [{ label: 'Reload', value: 'ok', variant: 'primary', autofocus: true }],
    dismissible: false,
  });
  rerender();
  location.reload();
}

async function invite(rerender) {
  const today = new Date();
  const values = await formDialog({
    title: 'Invite someone',
    saveLabel: 'Make link',
    body: html`<label class="field"><span class="field__label">Their name</span>
        <input class="input" name="name" maxlength="40" autocomplete="off" placeholder="e.g. Sarah"></label>
      <label class="field"><span class="field__label">Last day of the trial</span>
        <input class="input" name="ends" type="date" min="${toDateKey(today)}" value="${toDateKey(addDays(today, TRIAL_DAYS))}"></label>`,
    check(form) {
      const { name, ends } = Object.fromEntries(new FormData(form));
      if (!name.trim()) return 'Add their name.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ends)) return 'Choose the last day.';
      if (ends < toDateKey(new Date())) return 'Choose today or a later day.';
      return '';
    },
  });
  if (!values) return;
  let made;
  try {
    made = await makeInvite(values.name.trim(), values.ends);
  } catch (err) {
    toast(`Couldn’t make the link: ${err.message}`);
    return;
  }
  rerender();
  await showLink(made);
}

async function showLink(made) {
  await openDialog({
    variant: 'alert',
    title: `Invite for ${made.name}`,
    body: html`<p class="dlg__msg">Send ${made.name} this link (text or email). It works until the end of ${formatEnds(made.ends)}.</p>
      <p class="access-link">${made.link}</p>
      <p class="dlg__msg">If they add the app to their Home Screen, the first time it opens they paste the same link into the lock screen.</p>`,
    actions: [{ label: 'Done', value: 'done', variant: 'ghost' }, { label: 'Copy link', value: 'copy', variant: 'primary', autofocus: true }],
    onOpen(dlg) {
      // Copy straight from the tap, so the browser allows it
      dlg.querySelector('[data-dialog-value="copy"]').addEventListener('click', () => copyText(made.link));
    },
  });
}

export function initAccessSettings(rerender) {
  registerAction('access:master', () => setMaster(rerender));
  registerAction('access:invite', () => invite(rerender));
  registerAction('access:copy', (el) => {
    const made = madeInvites().find((i) => i.id === el.dataset.id);
    if (made) showLink(made);
  });
  registerAction('access:forget', (el) => { forgetInvite(el.dataset.id); rerender(); });
  registerAction('access:lock', async () => {
    const access = currentAccess();
    const ok = await confirmDialog({
      title: 'Lock this device?',
      message: access?.kind === 'invite'
        ? 'You’ll need your invite link to get back in.'
        : 'You’ll need the master password to get back in. Your data stays on this device.',
      confirmLabel: 'Lock',
      destructive: true,
    });
    if (ok) lockDevice();
  });
}
