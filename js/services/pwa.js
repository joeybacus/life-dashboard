/* Offline support (service worker). It only runs on secure pages — https (GitHub
   Pages) or http://localhost — so it is unavailable when previewing over Wi-Fi. */
import { APP } from '../core/config.js';
import { toast } from '../core/ui.js';

export const pwa = { status: 'starting' }; // 'starting' | 'active' | 'insecure' | 'unsupported' | 'error'

export function registerServiceWorker() {
  if (!window.isSecureContext) { pwa.status = 'insecure'; return; }
  if (!('serviceWorker' in navigator)) { pwa.status = 'unsupported'; return; }
  const register = () => navigator.serviceWorker.register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => { pwa.status = 'active'; })
    .catch((err) => {
      pwa.status = 'error';
      console.warn('Service worker registration failed', err);
    });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
  // An app on the iPhone Home Screen often comes back from the background without reloading, and on a slow
  // connection it may have started from saved files: check for a newer version when opened and when shown again
  setTimeout(checkForUpdate, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
}

let lastCheck = 0;
let offered = null;

/** Is a newer version on the website? Then get it ready and offer to switch (never reloads by itself). */
export async function checkForUpdate({ force = false } = {}) {
  if (!navigator.onLine || (!force && Date.now() - lastCheck < 5 * 60e3)) return null;
  lastCheck = Date.now();
  try {
    const text = await (await fetch(`js/core/config.js?check=${Date.now()}`, { cache: 'no-store' })).text();
    const latest = /version:\s*'([^']+)'/.exec(text)?.[1];
    if (!latest || latest === APP.version || latest === offered) return latest ?? null;
    offered = latest;
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update().catch(() => {});
    toast(`A new version (${latest}) is ready. You’re on ${APP.version}.`, {
      icon: 'refresh',
      duration: 20000,
      action: { label: 'Update', onClick: () => window.location.reload() },
    });
    return latest;
  } catch {
    return null; // offline or the website didn't answer: try again next time
  }
}

export function offlineLabel() {
  switch (pwa.status) {
    case 'active': return 'Ready — works without internet';
    case 'insecure': return 'Not on this address (needs https)';
    case 'unsupported': return 'Not supported by this browser';
    case 'error': return 'Could not start';
    default: return 'Starting…';
  }
}
