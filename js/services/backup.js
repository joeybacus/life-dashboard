/* Backups: one-tap JSON export, restore (merge or replace), and the weekly
   reminder. With Google Sheets sync on, the Sheet is the everyday backup and
   these files are an extra safety copy. */
import { db, tx, promisify } from '../core/db.js';
import { BACKUP_STORES, DB_VERSION } from '../core/schema.js';
import { isPristine, noteChange } from '../core/records.js';
import { APP } from '../core/config.js';
import { deviceName, isIOS } from '../core/platform.js';
import { nowISO } from '../core/dates.js';
import { emit } from '../core/events.js';
import { state } from '../core/state.js';
import { syncSnapshot } from './sync.js';

/** Settings kept on this device only — never written to backup files (the sync token lives here). */
const LOCAL_ONLY_META = new Set(['sync', 'backup', 'ui']);
const DATA_STORES = BACKUP_STORES.filter((name) => name !== 'meta');
const WEEK = 7 * 864e5;

const pad = (n) => String(n).padStart(2, '0');

/* ---------- Export ---------- */

async function readAll(storeNames) {
  return tx(storeNames, 'readonly', (s) =>
    Promise.all(storeNames.map((name) => promisify(s[name].getAll())))
      .then((all) => Object.fromEntries(storeNames.map((name, i) => [name, all[i]]))));
}

export async function buildBackup() {
  const data = await readAll(BACKUP_STORES); // one transaction, so the copy is consistent
  data.meta = data.meta.filter((m) => !LOCAL_ONLY_META.has(m.key));
  return {
    format: 'life-dashboard-backup',
    formatVersion: 1,
    app: { name: APP.name, version: APP.version },
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    device: navigator.userAgent,
    deviceName: deviceName(),
    counts: Object.fromEntries(BACKUP_STORES.map((name) => [name, data[name].length])),
    data,
  };
}

export function backupFilename(date = new Date()) {
  return `LifeDashboard_Backup_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

export async function prepareBackupFile() {
  const backup = await buildBackup();
  return new File([JSON.stringify(backup, null, 2)], backupFilename(), { type: 'application/json' });
}

/**
 * Hand the file to the user: the share sheet on iPhone/iPad (Save to Files,
 * AirDrop, Google Drive…), a normal download elsewhere.
 * Returns 'shared' | 'downloaded' | 'cancelled' | 'needs-tap' (iOS wants a fresh tap to share).
 */
export async function deliverBackupFile(file) {
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      await markBackedUp();
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'needs-tap';
      // anything else: fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  await markBackedUp();
  return 'downloaded';
}

/* ---------- Reminder bookkeeping ---------- */

async function backupMeta() {
  return (await db.get('meta', 'backup'))?.value ?? {};
}

export async function markBackedUp() {
  await db.put('meta', { key: 'backup', value: { ...(await backupMeta()), lastBackupAt: nowISO(), snoozedUntil: null } });
  emit('backup');
}

export async function lastBackupAt() {
  return (await backupMeta()).lastBackupAt ?? null;
}

export async function snoozeBackupReminder(days = 3) {
  const until = new Date(Date.now() + days * 864e5).toISOString();
  await db.put('meta', { key: 'backup', value: { ...(await backupMeta()), snoozedUntil: until } });
  emit('backup');
}

/** Anything worth backing up yet? (Sample data doesn't count.) */
async function hasRealData() {
  const stores = ['tasks', 'workouts', 'bodyMeasurements'];
  const all = await readAll(stores);
  return stores.some((name) => all[name].some((r) => !r.sample && !r.deletedAt));
}

/** Returns { lastBackupAt } when the weekly reminder should show, otherwise null. */
export async function backupReminderDue(now = Date.now()) {
  if (!state.settings.backup?.reminders) return null;
  const sync = syncSnapshot();
  if (sync.connected && sync.phase !== 'error' && sync.lastSyncAt && now - Date.parse(sync.lastSyncAt) < WEEK) return null;
  const meta = await backupMeta();
  if (meta.snoozedUntil && Date.parse(meta.snoozedUntil) > now) return null;
  if (meta.lastBackupAt && now - Date.parse(meta.lastBackupAt) < WEEK) return null;
  if (!(await hasRealData())) return null;
  return { lastBackupAt: meta.lastBackupAt ?? null };
}

/* ---------- Restore ---------- */

export class BackupError extends Error {}

/** Check a backup and summarise it for the "Restore this backup?" preview. */
export function validateBackup(backup) {
  if (!backup || backup.format !== 'life-dashboard-backup' || !backup.data || typeof backup.data !== 'object') {
    throw new BackupError('This file isn’t a Life Dashboard backup.');
  }
  if (Number(backup.schemaVersion) > DB_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app. Open the app with internet so it updates, then try again.');
  }
  const data = {};
  let skipped = 0;
  for (const name of BACKUP_STORES) {
    const keyField = name === 'meta' ? 'key' : 'id';
    const rows = Array.isArray(backup.data[name]) ? backup.data[name] : [];
    data[name] = rows.filter((row) => {
      const ok = row && typeof row === 'object' && typeof row[keyField] === 'string' && row[keyField] !== '';
      if (!ok) skipped++;
      return ok;
    });
  }
  data.meta = data.meta.filter((m) => !LOCAL_ONLY_META.has(m.key));
  const live = (name) => data[name].filter((r) => !r.deletedAt && !r.sample).length;
  return {
    exportedAt: backup.exportedAt ?? null,
    deviceName: backup.deviceName ?? deviceName(String(backup.device ?? ''), 0),
    summary: {
      workouts: live('workouts'),
      tasks: live('tasks'),
      measurements: live('bodyMeasurements'),
      photos: 0, // progress photos arrive in a later phase
      hasSample: DATA_STORES.some((name) => data[name].some((r) => r.sample)),
    },
    skipped,
    data,
  };
}

export async function readBackupFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BackupError('This file couldn’t be read. It may be damaged, or it isn’t a Life Dashboard backup.');
  }
  return validateBackup(parsed);
}

/**
 * Apply a validated backup in one transaction (all or nothing).
 *  merge   — keep the newest version of each item on this device or in the backup
 *  replace — erase this device's data (except its sync connection) and use the backup
 * Restored items count as your latest change, so sync sends them to your Google Sheet.
 */
export async function applyRestore(backup, mode) {
  const now = nowISO();
  const restamp = (record) => ({ ...record, updatedAt: now });
  await tx([...BACKUP_STORES, 'outbox'], 'readwrite', (s) => {
    if (mode === 'replace') {
      DATA_STORES.forEach((name) => s[name].clear());
      return promisify(s.meta.getAll()).then((metas) => {
        metas.filter((m) => !LOCAL_ONLY_META.has(m.key)).forEach((m) => s.meta.delete(m.key));
        backup.data.meta.forEach((m) => s.meta.put(m));
        DATA_STORES.forEach((name) => backup.data[name].forEach((record) => {
          const restored = record.sample ? record : restamp(record);
          s[name].put(restored);
          noteChange(s, name, restored);
        }));
      });
    }
    return Promise.all(DATA_STORES.flatMap((name) => backup.data[name].map((record) =>
      promisify(s[name].get(record.id)).then((local) => {
        const newer = !local || isPristine(name, local) || String(record.updatedAt ?? '') > String(local.updatedAt ?? '');
        if (!newer) return;
        const restored = record.sample ? record : restamp(record);
        s[name].put(restored);
        noteChange(s, name, restored);
      }))));
  });
}
