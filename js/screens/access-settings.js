/* Settings → Voucher codes: setting up the master password and voucher Sheet, making up codes,
   and (for customers) their code's end date and entering a new code. */
import { registerAction } from '../core/actions.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { confirmDialog, openDialog, toast } from '../core/ui.js';
import {
  SOON_DAYS, buildAccessConfig, canSetMaster, currentAccess, daysLeft, formatEnds, lockConfigured, lockDevice,
  saveAccessConfig, testVoucherUrl, useVoucher, voucherMessage,
} from '../services/access.js';
import { checkUrl, savedSheet } from '../services/sync.js';

const MIN_LENGTH = 8;
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/O, 1/I/L or U — easy to read out and type

/** The Settings section. */
export function accessSection() {
  const access = currentAccess() ?? { kind: 'open' };
  let rows;
  let foot = '';
  if (!lockConfigured()) {
    rows = html`<div class="row row--icon accent-neutral">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Codes are off</span><span class="row__sub">Anyone with the web address can open the app (they get an empty copy — never your data).</span></span>
      </div>
      ${canSetMaster() ? html`<button type="button" class="row row--icon accent-brand" data-action="access:setup">
        <span class="row__icon">${icon('shield')}</span>
        <span class="row__text"><span class="row__label">Set up voucher codes</span><span class="row__sub">A Google Sheet for your codes, and a master password for you</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>` : ''}`;
    foot = canSetMaster() ? '' : 'To turn codes on, double-click “Start Preview” on your Mac and open Settings there.';
  } else if (access.kind === 'master') {
    rows = html`<div class="row row--icon accent-brand">
        <span class="row__icon">${icon('shield')}</span>
        <span class="row__text"><span class="row__label">Unlocked with your master password</span><span class="row__sub">Your password never ends</span></span>
      </div>
      <button type="button" class="row row--icon accent-brand" data-action="access:make">
        <span class="row__icon">${icon('sparkles')}</span>
        <span class="row__text"><span class="row__label">Make up a code</span><span class="row__sub">A hard-to-guess code to paste into your voucher Sheet</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
      ${canSetMaster() ? html`<button type="button" class="row row--icon accent-neutral" data-action="access:master">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Change master password</span><span class="row__sub">Customers’ codes keep working</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
      <button type="button" class="row row--icon accent-neutral" data-action="access:sheet">
        <span class="row__icon">${icon('link')}</span>
        <span class="row__text"><span class="row__label">Change voucher Sheet</span><span class="row__sub">Use a different Web app URL</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>` : ''}
      <button type="button" class="row row--icon row--danger accent-danger" data-action="access:lock">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Lock this device</span><span class="row__sub">Asks for the password again. Your data stays.</span></span>
      </button>`;
    foot = 'In your voucher Sheet’s Codes tab: column B = 1 week, C = 1 month, D = 1 year, E = the customer’s Google Sheet link. A code starts on its first use. With a Sheet in column E it works only in the app synced to that Sheet; without one, on one device only. Delete a code to stop it. The Used tab shows who started when.';
  } else {
    const left = daysLeft(access.ends);
    const sheet = savedSheet();
    rows = html`<div class="row row--icon accent-brand">
        <span class="row__icon">${icon('clock')}</span>
        <span class="row__text"><span class="row__label">Your code works until ${formatEnds(access.ends)}</span><span class="row__sub${left <= SOON_DAYS ? ' tone-danger' : ''}">${left === 0 ? 'Today is the last day' : `${left} day${left === 1 ? '' : 's'} left`}</span></span>
      </div>
      ${access.needsSheet ? html`<button type="button" class="row row--icon accent-workout" data-action="settings:sync">
        <span class="row__icon">${icon('cloud')}</span>
        <span class="row__text"><span class="row__label">Connect your Google Sheet</span><span class="row__sub tone-danger">Your code is linked to your Google Sheet. Set up sync on this device by ${formatEnds(access.graceEnds)} to keep using it.</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>` : ''}
      ${sheet?.sheetUrl ? html`<div class="row row--icon accent-neutral">
        <span class="row__icon">${icon('link')}</span>
        <span class="row__text"><span class="row__label">Your Google Sheet link</span><span class="row__sub">Send it with your payment, so your code works on all your devices</span></span>
        <button type="button" class="btn btn--sm row__control" data-action="access:copy-sheet">${icon('copy')}Copy</button>
      </div>` : ''}
      <button type="button" class="row row--icon accent-brand" data-action="access:enter">
        <span class="row__icon">${icon('plus')}</span>
        <span class="row__text"><span class="row__label">Enter a new code</span><span class="row__sub">When you renew</span></span>
        ${icon('chevronRight', 'row__chev')}
      </button>
      <button type="button" class="row row--icon row--danger accent-danger" data-action="access:lock">
        <span class="row__icon">${icon('lock')}</span>
        <span class="row__text"><span class="row__label">Lock this device</span><span class="row__sub">You’ll need your code again to get back in. Your data stays.</span></span>
      </button>`;
  }
  return html`<section class="group" id="settings-access" aria-labelledby="set-access-title">
    <h2 class="group__title" id="set-access-title">Voucher codes</h2>
    <div class="card group__card">${rows}</div>
    ${foot ? html`<p class="group__foot">${foot}</p>` : ''}
  </section>`;
}

async function copyText(text, done = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, { icon: 'copy' });
  } catch {
    toast('Couldn’t copy here — press and hold the text to copy it.');
  }
}

/** Ask before throwing away what was typed (pop-ups with typing close only with their buttons). */
async function keepTyping(form) {
  const typed = [...form.querySelectorAll('input')].some((i) => i.value.trim());
  if (!typed) return false;
  return !(await confirmDialog({ title: 'Discard this?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }));
}

/** A typing pop-up: resolves with the form's values, or null. check(form) returns an error message or '' (may be async). */
function formDialog({ title, body, saveLabel, check, setup, variant = 'alert' }) {
  return openDialog({
    variant,
    className: variant === 'alert' ? 'prompt-dialog' : 'setup',
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
      setup?.(form);
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (!(await keepTyping(form))) close(null);
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('[type="submit"]');
        const label = button.textContent;
        button.disabled = true;
        button.textContent = 'Checking…';
        let problem;
        try { problem = await check(form); } catch (err) { problem = err.message; }
        button.disabled = false;
        button.textContent = label;
        form.querySelector('.access-form__msg').textContent = problem;
        if (!problem) close(Object.fromEntries(new FormData(form)));
      });
    },
  });
}

const passwordFields = html`<label class="field"><span class="field__label">Master password</span>
    <input class="input" name="password" type="password" autocomplete="new-password" minlength="${MIN_LENGTH}"></label>
  <label class="field"><span class="field__label">Type it again</span>
    <input class="input" name="again" type="password" autocomplete="new-password"></label>`;

function checkPasswords(form) {
  const { password, again } = Object.fromEntries(new FormData(form));
  if (password.length < MIN_LENGTH) return `Use a master password of at least ${MIN_LENGTH} characters.`;
  if (password !== again) return 'The two passwords don’t match.';
  return '';
}

async function checkSheetUrl(form) {
  let url;
  try { url = checkUrl(form.elements.voucherUrl.value); } catch (err) { return err.message; }
  form.elements.voucherUrl.value = url;
  await testVoucherUrl(url);
  return '';
}

const urlField = html`<label class="field"><span class="field__label">Voucher Sheet’s Web app URL</span>
  <input class="input" name="voucherUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec"></label>`;

let scriptCode = null;
function loadScriptCode() {
  if (scriptCode) return;
  fetch('apps-script/Vouchers.gs', { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : null)).then((t) => { scriptCode = t; }).catch(() => {});
}

async function saveAndReload(config, message) {
  try {
    await saveAccessConfig(config);
  } catch (err) {
    toast(`Not saved: ${err.message}`);
    return;
  }
  await openDialog({
    variant: 'alert',
    title: 'Saved',
    body: html`<p class="dlg__msg">${message}</p>
      <p class="dlg__msg"><strong>Then publish with GitHub Desktop</strong> (commit, then Push) so the live app uses it.</p>`,
    actions: [{ label: 'Reload', value: 'ok', variant: 'primary', autofocus: true }],
    dismissible: false,
  });
  location.reload();
}

async function setup() {
  loadScriptCode();
  const values = await formDialog({
    variant: 'sheet',
    title: 'Set up voucher codes',
    saveLabel: 'Save',
    body: html`<p class="setup__lead">Your codes live in a new Google Sheet of their own (not your sync Sheet). About 10 minutes, once.</p>
      <ol class="setup__steps">
        <li><strong>Create a sheet.</strong> At sheets.google.com, create a blank spreadsheet called “Life Dashboard Vouchers”, then choose <strong>Extensions → Apps Script</strong>.</li>
        <li><strong>Paste the voucher code.</strong> Delete what’s in the editor, paste this code, then click Save.
          <span class="setup__buttons"><button type="button" class="btn btn--sm" data-copy-code>${'Copy code'}</button></span></li>
        <li><strong>Run setup.</strong> Choose <code>setup</code> in the toolbar and click <strong>Run</strong>, then allow access. A Codes tab appears.</li>
        <li><strong>Deploy.</strong> Click <strong>Deploy → New deployment</strong>, pick <strong>Web app</strong>, set “Execute as” to <strong>Me</strong> and “Who has access” to <strong>Anyone</strong>, then copy the Web app URL.</li>
        <li><strong>Paste it below</strong>, and choose your master password — your own way in, which never ends. It can’t be recovered, only replaced here.</li>
      </ol>
      ${urlField}
      ${passwordFields}`,
    setup(form) {
      form.querySelector('[data-copy-code]').addEventListener('click', () => {
        if (scriptCode) copyText(scriptCode, 'Code copied. Paste it into Apps Script.');
        else toast('Still loading the code — try again in a moment.');
      });
    },
    async check(form) {
      return checkPasswords(form) || checkSheetUrl(form);
    },
  });
  if (!values) return;
  await saveAndReload(await buildAccessConfig({ password: values.password, voucherUrl: values.voucherUrl }),
    'The app reloads now and asks for your master password once.');
}

async function changeMaster() {
  const values = await formDialog({
    title: 'Change master password',
    saveLabel: 'Save',
    body: html`<p class="dlg__msg">Each of your devices asks for the new password once. Customers’ codes keep working.</p>${passwordFields}`,
    check: checkPasswords,
  });
  if (!values) return;
  await saveAndReload(await buildAccessConfig({ password: values.password }), 'The app reloads now and asks for your new password once.');
}

async function changeSheet() {
  const values = await formDialog({
    title: 'Change voucher Sheet',
    saveLabel: 'Save',
    body: html`<p class="dlg__msg">Codes are checked in the Sheet at this URL from now on.</p>${urlField}`,
    check: checkSheetUrl,
  });
  if (!values) return;
  await saveAndReload(await buildAccessConfig({ voucherUrl: values.voucherUrl }), 'The app reloads now.');
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

async function makeUp() {
  let code = randomCode();
  await openDialog({
    variant: 'alert',
    title: 'A new code',
    body: html`<p class="access-big-code" data-code>${code}</p>
      <p class="dlg__msg">Paste it into your voucher Sheet’s Codes tab: column B for 1 week, C for 1 month, D for 1 year. Add the customer’s Google Sheet link in column E if you have it. Then send them the code.</p>`,
    actions: [{ label: 'Another', value: 'again', variant: 'ghost' }, { label: 'Done', value: 'done', variant: 'ghost' }, { label: 'Copy', value: 'copy', variant: 'primary', autofocus: true }],
    onOpen(dlg) {
      // Copy straight from the tap, so the browser allows it; "Another" stays open with a new code
      dlg.querySelector('[data-dialog-value="copy"]').addEventListener('click', () => copyText(code, 'Code copied.'));
      dlg.querySelector('[data-dialog-value="again"]').addEventListener('click', (event) => {
        event.stopPropagation();
        code = randomCode();
        dlg.querySelector('[data-code]').textContent = code;
      }, true);
    },
  });
}

async function enterCode(rerender) {
  const before = currentAccess();
  const values = await formDialog({
    title: 'Enter a new code',
    saveLabel: 'Use code',
    body: html`<label class="field"><span class="field__label">Voucher code</span>
      <input class="input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`,
    async check(form) {
      const result = await useVoucher(form.elements.code.value);
      return result.valid ? '' : voucherMessage(result);
    },
  });
  if (!values) return;
  const now = currentAccess();
  toast(before?.ends && now.ends < before.ends
    ? `Done — note this code ends sooner: ${formatEnds(now.ends)}.`
    : `Thanks! Your code works until ${formatEnds(now.ends)}.`, { duration: 6000 });
  rerender();
}

export function initAccessSettings(rerender) {
  registerAction('access:setup', setup);
  registerAction('access:master', changeMaster);
  registerAction('access:sheet', changeSheet);
  registerAction('access:make', makeUp);
  registerAction('access:enter', () => enterCode(rerender));
  registerAction('access:copy-sheet', () => {
    const sheet = savedSheet();
    if (sheet?.sheetUrl) copyText(sheet.sheetUrl, 'Sheet link copied.');
  });
  registerAction('access:lock', async () => {
    const access = currentAccess();
    const ok = await confirmDialog({
      title: 'Lock this device?',
      message: access?.kind === 'voucher'
        ? 'You’ll need your code to get back in. Your data stays on this device.'
        : 'You’ll need the master password to get back in. Your data stays on this device.',
      confirmLabel: 'Lock',
      destructive: true,
    });
    if (ok) lockDevice();
  });
}
