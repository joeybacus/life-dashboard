/* One-tap JSON export — a complete copy of everything stored on this device. */
import { tx, promisify } from '../core/db.js';
import { DB_VERSION, STORE_NAMES } from '../core/schema.js';
import { APP } from '../core/config.js';
import { isIOS } from '../core/platform.js';

const pad = (n) => String(n).padStart(2, '0');

export async function buildBackup() {
  // Read every store in a single transaction so the copy is consistent
  const data = await tx(STORE_NAMES, 'readonly', (s) =>
    Promise.all(STORE_NAMES.map((name) => promisify(s[name].getAll())))
      .then((all) => Object.fromEntries(STORE_NAMES.map((name, i) => [name, all[i]]))));
  const counts = Object.fromEntries(STORE_NAMES.map((name) => [name, data[name].length]));
  return {
    format: 'life-dashboard-backup',
    formatVersion: 1,
    app: { name: APP.name, version: APP.version },
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    device: navigator.userAgent,
    counts,
    data,
  };
}

export function backupFilename(date = new Date()) {
  return `LifeDashboard_Backup_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

/**
 * Export and hand the file to the user: the share sheet on iPhone/iPad
 * (Save to Files, AirDrop, Google Drive…), a normal download elsewhere.
 * Returns 'shared' | 'downloaded' | 'cancelled'.
 */
export async function exportBackup() {
  const backup = await buildBackup();
  const name = backupFilename();
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });

  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // NotAllowedError etc. — fall back to a download below
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
