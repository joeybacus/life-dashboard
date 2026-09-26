/* Service worker: lets the installed app open without internet.
   Strategy: always try the network first (so you get updates right away),
   and fall back to the saved copy when offline or the network is too slow.
   When adding files in a later phase, add them to SHELL and bump CACHE_VERSION. */
const CACHE_VERSION = 'v0.2.0';
const CACHE = `life-dashboard-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 3500;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/layout.css',
  'css/screens.css',
  'js/main.js',
  'js/core/actions.js',
  'js/core/components.js',
  'js/core/config.js',
  'js/core/dates.js',
  'js/core/db.js',
  'js/core/events.js',
  'js/core/html.js',
  'js/core/icons.js',
  'js/core/ids.js',
  'js/core/platform.js',
  'js/core/records.js',
  'js/core/reorder.js',
  'js/core/router.js',
  'js/core/schema.js',
  'js/core/state.js',
  'js/core/theme.js',
  'js/core/ui.js',
  'js/services/backup.js',
  'js/services/calendar.js',
  'js/services/images.js',
  'js/services/pwa.js',
  'js/services/quotes.js',
  'js/services/sample-data.js',
  'js/services/storage.js',
  'js/services/sync.js',
  'js/modules/index.js',
  'js/modules/registry.js',
  'js/modules/workout.js',
  'js/modules/todo.js',
  'js/modules/neurology.js',
  'js/screens/dashboard.js',
  'js/screens/settings.js',
  'js/screens/welcome.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('life-dashboard-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other sites (e.g. future Google sync)

  const isPage = request.mode === 'navigate';
  const cacheKey = isPage ? 'index.html' : request;
  let saving;
  // Revalidate with the server each time so edits and deploys show up immediately
  const network = fetch(isPage
    ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(request, { cache: 'no-cache' }))
    .then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        saving = caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
      }
      return response;
    });

  // Keep the worker alive until the fresh copy has been saved
  event.waitUntil(network.then(() => saving, () => {}).catch(() => {}));
  event.respondWith(respond(network, cacheKey, isPage));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

async function respond(network, cacheKey, isPage) {
  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(cacheKey, { ignoreSearch: isPage });
    if (cached) return cached;
    return network; // nothing saved yet — keep waiting for the network
  }
}
