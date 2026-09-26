/* A tiny app-wide event bus. Screens listen for 'settings', 'profile', 'data',
   'sync', 'backup' and 'local-change' events to stay up to date. */
const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export function emit(type, detail = {}) {
  listeners.get(type)?.forEach((fn) => {
    try { fn(detail); } catch (err) { console.error(`[${type}] listener failed`, err); }
  });
}
