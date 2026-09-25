/* Offline support (service worker). It only runs on secure pages — https (GitHub
   Pages) or http://localhost — so it is unavailable when previewing over Wi-Fi. */
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
