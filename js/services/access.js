/* The lock: a master password (yours, never ends) and voucher codes for paying customers.
   Codes live in your voucher Google Sheet (apps-script/Vouchers.gs): column B = 1 week, C = 1 month,
   D = 1 year, E = the customer's own Google Sheet. The app asks that Sheet whether a code may be used here.
   This keeps casual visitors out. It isn't bank-grade: the app's files are public on GitHub Pages, so a
   determined techie could get past it — your data stays safe anyway, because your Google Sheet needs your
   secret token and everything else lives on your own devices.

   Master password → PBKDF2 → 32 bytes; their SHA-256 must match ACCESS.check. */
import { ACCESS } from '../core/access-config.js';
import { toDateKey } from '../core/dates.js';
import { toast } from '../core/ui.js';
import { pingScript, savedSheet, syncSheetId } from './sync.js';

const GRANT_KEY = 'ld.access';
const DEVICE_KEY = 'ld.access.device';
const SEEN_KEY = 'ld.access.seen'; // the latest day seen here, so turning the clock back doesn't revive a code
const REMINDED_KEY = 'ld.access.reminded'; // the day the last reminder was shown
const PENDING_SYNC_KEY = 'ld.access.pendingSync'; // a Sheet connected on the lock screen, for sync to pick up
const ITERATIONS = 310_000;
const RECHECK_MS = 6 * 3600_000;
const CHECK_TIMEOUT_MS = 25_000;
export const SOON_DAYS = 3;

let current = null; // { kind: 'open' } | { kind: 'master' } | { kind: 'voucher', code, ends, needsSheet, graceEnds }

/* ---------- small helpers ---------- */

const enc = new TextEncoder();

function toB64(bytes) {
  let s = '';
  new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private browsing: you'll be asked again next time */ }
}

/** Today here, never earlier than the latest day this device has seen. */
function effectiveToday() {
  const today = toDateKey(new Date());
  const seen = readLocal(SEEN_KEY);
  if (typeof seen === 'string' && seen > today) return seen;
  writeLocal(SEEN_KEY, today);
  return today;
}

const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export function formatEnds(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Whole days from today until the last day (0 = today is the last day). */
export function daysLeft(ends) {
  return dayNumber(ends) - dayNumber(effectiveToday());
}

function deviceId() {
  let id = readLocal(DEVICE_KEY);
  if (typeof id !== 'string' || !id) {
    id = toB64(crypto.getRandomValues(new Uint8Array(9)));
    writeLocal(DEVICE_KEY, id);
  }
  return id;
}

/** Once a day at most: true the first time today for this kind of note. */
function firstTimeToday(kind) {
  const today = effectiveToday();
  const done = readLocal(REMINDED_KEY) ?? {};
  if (done[kind] === today) return false;
  writeLocal(REMINDED_KEY, { ...done, [kind]: today });
  return true;
}

/* ---------- the master password ---------- */

async function deriveBits(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
}

async function checkValue(bits) {
  return toB64(await crypto.subtle.digest('SHA-256', bits));
}

async function masterBitsOk(bits) {
  return Boolean(ACCESS) && (await checkValue(bits)) === ACCESS.check;
}

/** The lock with a new master password and/or voucher Sheet (what isn't given stays as it is). */
export async function buildAccessConfig({ password, voucherUrl }) {
  const config = { v: 3, ...(ACCESS ?? {}) };
  config.v = 3;
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    config.salt = toB64(salt);
    config.iterations = ITERATIONS;
    config.check = await checkValue(await deriveBits(password, salt, ITERATIONS));
  }
  if (voucherUrl) config.voucherUrl = voucherUrl;
  return config;
}

/** Save a new lock into js/core/access-config.js — only the preview on your Mac can do this. */
export async function saveAccessConfig(config) {
  const res = await fetch('__access-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  if (!res.ok) throw new Error((await res.text()) || `The preview didn't save it (${res.status}).`);
}

/** True in the preview on this Mac (the only place the lock can be set up). */
export function canSetMaster() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/** Is this the voucher Sheet's Web app? Throws a friendly message when it isn't. */
export async function testVoucherUrl(url) {
  let data = null;
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow' });
    data = await res.json();
  } catch { /* below */ }
  if (data?.app !== 'life-dashboard-vouchers') {
    throw new Error('That URL didn’t answer as the voucher Sheet. Check that you deployed it as a Web app with access for Anyone, and copied the URL ending in /exec.');
  }
}

async function tryMaster(password) {
  const bits = await deriveBits(password, fromB64(ACCESS.salt), ACCESS.iterations);
  if (!(await masterBitsOk(bits))) return false;
  writeLocal(GRANT_KEY, { kind: 'master', secret: toB64(bits) });
  current = { kind: 'master' };
  return true;
}

/* ---------- vouchers ---------- */

/** Ask the voucher Sheet. → { valid, ends, needsSheet, graceEnds } | { valid: false, reason, ends? } | { network: true } */
async function askSheet(code, sheetId) {
  if (!ACCESS?.voucherUrl) return { network: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(ACCESS.voucherUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // a "simple" request: Apps Script can't answer CORS preflights
      body: JSON.stringify({ action: 'voucher', code, deviceId: deviceId(), sheetId: sheetId ?? '' }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    const data = await res.json();
    return data?.ok ? data : { network: true };
  } catch {
    return { network: true };
  } finally {
    clearTimeout(timer);
  }
}

function keepGrant(code, result) {
  const grant = { kind: 'voucher', code, ends: result.ends, needsSheet: Boolean(result.needsSheet), graceEnds: result.graceEnds ?? null };
  writeLocal(GRANT_KEY, grant);
  current = grant;
  return grant;
}

/** Use a code on this device (lock screen, or Settings when renewing). → the Sheet's answer. */
export async function useVoucher(text, sheetId = savedSheet()?.sheetId ?? '') {
  const code = String(text ?? '').trim();
  if (!code) return { valid: false, reason: 'unknown' };
  const result = await askSheet(code, sheetId);
  if (result.valid) keepGrant(code, result);
  return result;
}

export function voucherMessage(result) {
  if (result.network) return 'Couldn’t check the code. Check your internet connection and try again.';
  switch (result.reason) {
    case 'expired': return `That code ended on ${formatEnds(result.ends)}. Ask for a new code to keep using the app.`;
    case 'stopped': return 'This code no longer works. Ask the person you got it from.';
    case 'in-use': return 'This code is already used on another device. Ask the person you got it from to move it to this one.';
    case 'other-sheet': return 'This code belongs to a different Google Sheet than the one this app syncs to. Ask the person you got it from.';
    case 'needs-sheet': return 'This code needs this device connected to your Google Sheet. Enter your sync details below — the same Web app URL and secret token as on your other device (also in your Sheet’s Connection tab).';
    default: return 'That code isn’t right. Check it and try again.';
  }
}

/* ---------- this device ---------- */

/** How this device got in: { kind: 'open' | 'master' | 'voucher', ends?, needsSheet?, graceEnds? }. */
export const currentAccess = () => current;
export const lockConfigured = () => Boolean(ACCESS);

/** Forget this device's password or code and show the lock again. */
export function lockDevice() {
  writeLocal(GRANT_KEY, null);
  location.reload();
}

/** The lock screen's "connect your Google Sheet" part: resolves with the Sheet ID, after checking the details. */
async function connectSheetOnLock(form) {
  const url = form.elements.url.value;
  const token = form.elements.token.value;
  const data = await pingScript({ url, token }); // throws a SyncError with a friendly message
  if (!data.sheetId) throw new Error('Your sync script needs updating first: in your Google Sheet, paste the newest code and deploy a new version.');
  writeLocal(PENDING_SYNC_KEY, { url, token });
  return data.sheetId;
}

/** Show the lock in the start-up screen and wait for a good password or code. */
function showLock(result = null, code = '') {
  return new Promise((resolve) => {
    const boot = document.getElementById('boot');
    boot.classList.add('boot--lock');
    boot.querySelector('.boot__msg').textContent = '';
    const form = document.createElement('form');
    form.className = 'lock';
    form.noValidate = true;
    form.innerHTML = `
      <p class="lock__lead">Enter your voucher code to open the app.</p>
      <label class="field">
        <span class="sr-only">Voucher code or password</span>
        <input class="input" name="secret" type="password" autocomplete="current-password" autocapitalize="characters"
          autocorrect="off" spellcheck="false" placeholder="Voucher code" enterkeyhint="go">
      </label>
      <label class="lock__show"><input type="checkbox" data-show> Show what I type</label>
      <div class="lock__sheet" hidden>
        <label class="field"><span class="field__label">Web app URL</span>
          <input class="input" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec"></label>
        <label class="field"><span class="field__label">Secret token</span>
          <input class="input" name="token" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
      </div>
      <p class="lock__msg" role="alert"></p>
      <button type="submit" class="btn btn--primary btn--block">Unlock</button>`;
    boot.append(form);
    const field = form.elements.secret;
    const msg = form.querySelector('.lock__msg');
    const sheetPart = form.querySelector('.lock__sheet');
    const button = form.querySelector('button');
    const say = (r) => {
      msg.textContent = r ? voucherMessage(r) : '';
      sheetPart.hidden = r?.reason !== 'needs-sheet';
    };
    if (code) field.value = code;
    say(result);
    form.querySelector('[data-show]').addEventListener('change', (event) => { field.type = event.target.checked ? 'text' : 'password'; });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = field.value;
      if (!text.trim()) { field.focus(); return; }
      button.disabled = true;
      button.textContent = 'Checking…';
      msg.textContent = '';
      let ok = await tryMaster(text);
      if (!ok) {
        let sheetId;
        if (!sheetPart.hidden) {
          try {
            sheetId = await connectSheetOnLock(form);
          } catch (err) {
            msg.textContent = err.message;
            button.disabled = false;
            button.textContent = 'Unlock';
            return;
          }
        }
        const answer = await useVoucher(text, sheetId);
        ok = Boolean(answer.valid);
        if (!ok) say(answer);
      }
      button.disabled = false;
      button.textContent = 'Unlock';
      if (!ok) { field.focus(); return; }
      form.remove();
      boot.classList.remove('boot--lock');
      resolve();
    });
  });
}

/** Called first thing at start-up: resolves once this device may open the app. */
export async function ensureAccess() {
  if (!ACCESS) { current = { kind: 'open' }; return current; }
  const grant = readLocal(GRANT_KEY);
  if (grant?.kind === 'master') {
    try {
      if (await masterBitsOk(fromB64(grant.secret))) { current = { kind: 'master' }; return current; }
    } catch { /* show the lock */ }
  }
  if (grant?.kind === 'voucher' && grant.code) {
    if (grant.refused) {
      await showLock(grant.refused, grant.code);
    } else if (effectiveToday() > grant.ends) {
      await showLock({ reason: 'expired', ends: grant.ends }, grant.code);
    } else {
      current = grant; // trusted until the next check with your Sheet (it can work offline)
      return current;
    }
    return { ...current, fresh: true };
  }
  await showLock();
  return { ...current, fresh: true };
}

let lastCheck = 0;

/** Check this device's code with your Sheet again (in the background). A stopped code locks the app. */
async function recheck() {
  if (current?.kind !== 'voucher') return;
  lastCheck = Date.now();
  const result = await askSheet(current.code, await syncSheetId());
  if (result.network) return;
  if (result.valid) {
    keepGrant(current.code, result);
    return;
  }
  // A code that worked before and is now unknown was deleted from your Sheet: say "stopped", not "wrong"
  const reason = result.reason === 'unknown' ? 'stopped' : result.reason;
  writeLocal(GRANT_KEY, { ...current, refused: reason === 'expired' ? { reason, ends: result.ends } : { reason } });
  location.reload();
}

/** After start-up: connect a Sheet entered on the lock screen, remind about endings, and keep checking. */
export async function afterBoot({ isSyncConnected, connectSync }) {
  if (current?.kind !== 'voucher') return;
  const pending = readLocal(PENDING_SYNC_KEY);
  if (pending) {
    writeLocal(PENDING_SYNC_KEY, null);
    if (!isSyncConnected()) {
      try { await connectSync(pending); } catch (err) { toast(`Sync didn’t connect: ${err.message}`); }
    }
  }
  const left = daysLeft(current.ends);
  if (left <= SOON_DAYS && firstTimeToday('ends')) {
    toast(left === 0 ? 'Your code ends today. Ask for a new code to keep using the app.'
      : `Your code ends in ${left} day${left === 1 ? '' : 's'} (${formatEnds(current.ends)}). Ask for a new code to keep going.`, { duration: 10_000 });
  } else if (current.needsSheet && current.graceEnds && firstTimeToday('sheet')) {
    toast(`Connect this device to your Google Sheet (Settings → Sync) by ${formatEnds(current.graceEnds)} to keep using your code.`, { duration: 10_000 });
  }
  recheck();
  const check = () => {
    if (effectiveToday() > current.ends) { location.reload(); return; }
    if (Date.now() - lastCheck > RECHECK_MS) recheck();
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60_000);
}

/** Settings → Sync just connected (or changed): check the code again with the new Sheet. */
export function accessSyncChanged() {
  if (current?.kind === 'voucher') recheck();
}
