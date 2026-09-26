/* Keep the screen on (Screen Wake Lock API) — used during workouts.
   The system releases the lock whenever the app goes to the background, so it
   is taken again each time the app comes back. */

let sentinel = null;
let pending = null;
let wanted = false;

export const wakeLockSupported = () => 'wakeLock' in navigator;

async function acquire() {
  if (!wakeLockSupported() || sentinel || pending || document.visibilityState !== 'visible') return;
  pending = navigator.wakeLock.request('screen')
    .then((lock) => {
      sentinel = lock;
      lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null; });
      if (!wanted) release(); // turned off while we were waiting
    })
    .catch(() => { sentinel = null; }) // e.g. Low Power Mode
    .finally(() => { pending = null; });
  await pending;
}

function release() {
  const lock = sentinel;
  sentinel = null;
  lock?.release().catch(() => {});
}

/** Turn "keep the screen on" on or off. */
export function keepScreenOn(on) {
  wanted = Boolean(on);
  if (wanted) acquire();
  else release();
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
