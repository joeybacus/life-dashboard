/* The lock: a master password (yours, never ends) and invite links for other people (each with an end date).
   This keeps casual visitors out. It isn't bank-grade: the app's files are public on GitHub Pages, so a
   determined techie could get past it — your data stays safe anyway, because your Google Sheet needs your
   secret token and everything else lives on your own devices.

   How it works:
   - Master password → PBKDF2 → 64 bytes. The first half unlocks the invite-signing key (AES-GCM);
     the second half's SHA-256 must match ACCESS.check.
   - An invite is "payload.signature": payload = { v, id, n: name, e: last day 'YYYY-MM-DD' }, signed with
     ECDSA P-256. Every device can check it with the public key; only the master password can make one. */
import { ACCESS } from '../core/access-config.js';
import { APP } from '../core/config.js';
import { esc } from '../core/html.js';
import { toDateKey } from '../core/dates.js';

const GRANT_KEY = 'ld.access';
const SEEN_KEY = 'ld.access.seen'; // the latest day seen here, so turning the clock back doesn't revive a trial
const INVITES_KEY = 'ld.invites'; // invites made on this device (a list for you to copy again)
const ITERATIONS = 310_000;
const SIGN = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_HASH = { name: 'ECDSA', hash: 'SHA-256' };

let current = null; // { kind: 'open' } | { kind: 'master' } | { kind: 'invite', name, ends }

/* ---------- small helpers ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

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

export function formatEnds(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Where invite links point: the live site, even when the invite is made in the preview. */
function liveUrl() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|\d+\.\d+\.\d+\.\d+)$/.test(location.hostname);
  return local ? APP.liveUrl : `${location.origin}${location.pathname}`;
}

/* ---------- the master password ---------- */

async function deriveBits(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
}

async function checkValue(bits) {
  return toB64(await crypto.subtle.digest('SHA-256', bits.slice(32)));
}

async function masterBitsOk(bits) {
  return Boolean(ACCESS) && (await checkValue(bits)) === ACCESS.check;
}

/** The invite-signing key, unlocked with the master password's bits. */
async function signingKey(bits) {
  const aes = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['decrypt']);
  const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ACCESS.privateKey.iv) }, aes, fromB64(ACCESS.privateKey.data));
  return crypto.subtle.importKey('pkcs8', pkcs8, SIGN, false, ['sign']);
}

/** A new lock for a new master password (a new signing key too, so every earlier invite stops working). */
export async function buildAccessConfig(password) {
  const pair = await crypto.subtle.generateKey(SIGN, true, ['sign', 'verify']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, ITERATIONS);
  const aes = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    v: 1,
    salt: toB64(salt),
    iterations: ITERATIONS,
    check: await checkValue(bits),
    publicKey: toB64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    privateKey: { iv: toB64(iv), data: toB64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, pkcs8)) },
  };
}

/** Save a new lock into js/core/access-config.js — only the preview on your Mac can do this. */
export async function saveAccessConfig(config) {
  const res = await fetch('__access-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  if (!res.ok) throw new Error((await res.text()) || `The preview didn't save it (${res.status}).`);
}

/** True in the preview on this Mac (the only place the master password can be set). */
export function canSetMaster() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

async function tryMaster(password) {
  const bits = await deriveBits(password, fromB64(ACCESS.salt), ACCESS.iterations);
  if (!(await masterBitsOk(bits))) return false;
  writeLocal(GRANT_KEY, { kind: 'master', secret: toB64(bits) });
  current = { kind: 'master' };
  return true;
}

/* ---------- invites ---------- */

/** Pull the invite code out of a pasted link or code. */
function inviteCodeFrom(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/invite=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/) ?? t.match(/^([A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{40,})$/);
  return m ? m[1] : null;
}

/** Check an invite: { ok, name, ends } or { ok: false, reason: 'bad' | 'expired', name?, ends? }. */
async function checkInvite(code) {
  try {
    const [p, s] = code.split('.');
    const key = await crypto.subtle.importKey('spki', fromB64(ACCESS.publicKey), SIGN, false, ['verify']);
    if (!(await crypto.subtle.verify(SIGN_HASH, key, fromB64(s), fromB64(p)))) return { ok: false, reason: 'bad' };
    const payload = JSON.parse(dec.decode(fromB64(p)));
    if (payload.v !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(payload.e)) return { ok: false, reason: 'bad' };
    const info = { name: String(payload.n ?? ''), ends: payload.e };
    if (effectiveToday() > payload.e) return { ok: false, reason: 'expired', ...info };
    return { ok: true, ...info };
  } catch {
    return { ok: false, reason: 'bad' };
  }
}

/** Make an invite link for someone (you must be unlocked with the master password on this device). */
export async function makeInvite(name, ends) {
  const grant = readLocal(GRANT_KEY);
  if (grant?.kind !== 'master') throw new Error('Unlock with the master password first.');
  const key = await signingKey(fromB64(grant.secret));
  const id = toB64(crypto.getRandomValues(new Uint8Array(6)));
  const p = toB64(enc.encode(JSON.stringify({ v: 1, id, n: name, e: ends })));
  const s = toB64(await crypto.subtle.sign(SIGN_HASH, key, fromB64(p)));
  const invite = { id, name, ends, link: `${liveUrl()}#invite=${p}.${s}`, madeAt: new Date().toISOString(), check: ACCESS.check };
  writeLocal(INVITES_KEY, [invite, ...madeInvites()]);
  return invite;
}

/** Invites made on this device with the current master password, newest first. */
export function madeInvites() {
  const list = readLocal(INVITES_KEY);
  return Array.isArray(list) ? list.filter((i) => i && i.check === ACCESS?.check) : [];
}

export function forgetInvite(id) {
  writeLocal(INVITES_KEY, (readLocal(INVITES_KEY) ?? []).filter((i) => i?.id !== id));
}

export function inviteEnded(invite) {
  return effectiveToday() > invite.ends;
}

/* ---------- this device ---------- */

/** How this device got in: { kind: 'open' | 'master' | 'invite', name?, ends? }. */
export const currentAccess = () => current;
export const lockConfigured = () => Boolean(ACCESS);

/** Forget this device's password or invite and show the lock again. */
export function lockDevice() {
  writeLocal(GRANT_KEY, null);
  location.reload();
}

async function storedGrant() {
  const grant = readLocal(GRANT_KEY);
  if (grant?.kind === 'master') {
    try {
      if (await masterBitsOk(fromB64(grant.secret))) return { kind: 'master' };
    } catch { /* fall through to the lock */ }
    return null;
  }
  if (grant?.kind === 'invite') {
    const result = await checkInvite(grant.code);
    if (result.ok) return { kind: 'invite', name: result.name, ends: result.ends };
    return result.reason === 'expired' ? { expired: result } : null;
  }
  return null;
}

async function useInvite(code) {
  const result = await checkInvite(code);
  if (result.ok) {
    writeLocal(GRANT_KEY, { kind: 'invite', code });
    current = { kind: 'invite', name: result.name, ends: result.ends };
  }
  return result;
}

function inviteMessage(result) {
  if (result.reason === 'expired') {
    return `${result.name ? `${esc(result.name)}, your` : 'Your'} trial ended on ${formatEnds(result.ends)}. Ask the person who invited you for a new invite.`;
  }
  return 'That invite link isn’t valid. It may have been cancelled — ask for a new one.';
}

/** Show the lock in the start-up screen and wait for a good password or invite. */
function showLock(message = '') {
  return new Promise((resolve) => {
    const boot = document.getElementById('boot');
    boot.classList.add('boot--lock');
    boot.querySelector('.boot__msg').textContent = '';
    const form = document.createElement('form');
    form.className = 'lock';
    form.noValidate = true;
    form.innerHTML = `
      <p class="lock__lead">This app is private. Enter the password, or paste your invite link.</p>
      <label class="field">
        <span class="sr-only">Password or invite link</span>
        <input class="input" name="secret" type="password" autocomplete="current-password" autocapitalize="off"
          autocorrect="off" spellcheck="false" placeholder="Password or invite link" enterkeyhint="go">
      </label>
      <p class="lock__msg" role="alert">${message}</p>
      <button type="submit" class="btn btn--primary btn--block">Unlock</button>`;
    boot.append(form);
    const field = form.elements.secret;
    const msg = form.querySelector('.lock__msg');
    const button = form.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = field.value;
      if (!text.trim()) { field.focus(); return; }
      button.disabled = true;
      msg.textContent = '';
      const code = inviteCodeFrom(text);
      let ok = false;
      if (code) {
        const result = await useInvite(code);
        ok = result.ok;
        if (!ok) msg.innerHTML = inviteMessage(result);
      } else {
        ok = await tryMaster(text);
        if (!ok) msg.textContent = 'That password isn’t right.';
      }
      button.disabled = false;
      if (!ok) { field.select(); return; }
      form.remove();
      boot.classList.remove('boot--lock');
      resolve();
    });
  });
}

/** Called first thing at start-up: resolves once this device may open the app. */
export async function ensureAccess() {
  if (!ACCESS) { current = { kind: 'open' }; return current; }

  // Opened from an invite link: use it, and take it out of the address bar
  const linked = /^#invite=/.test(location.hash) ? inviteCodeFrom(location.hash) : null;
  if (linked) history.replaceState(null, '', `${location.pathname}${location.search}`);

  const grant = await storedGrant();
  if (grant && !grant.expired) {
    current = grant;
    // A new invite still replaces an old one (say, a trial was extended)
    if (linked && grant.kind === 'invite') await useInvite(linked);
    return current;
  }
  if (linked) {
    const result = await useInvite(linked);
    if (result.ok) return { ...current, fresh: true };
    await showLock(inviteMessage(result));
    return current;
  }
  await showLock(grant?.expired ? inviteMessage(grant.expired) : '');
  return current;
}

/** A trial that ends while the app is open locks it again. */
export function watchAccess() {
  if (current?.kind !== 'invite') return;
  const check = () => { if (effectiveToday() > current.ends) location.reload(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60_000);
}
