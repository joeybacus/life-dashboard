/* Ask the browser to keep this app's data safe from automatic clean-up,
   and report how much space it uses. */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo() {
  const info = { persisted: null, usage: null };
  try { info.persisted = (await navigator.storage?.persisted?.()) ?? null; } catch { /* unavailable */ }
  try { info.usage = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* unavailable */ }
  return info;
}

export function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
