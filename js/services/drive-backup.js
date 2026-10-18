/* Backups in Google Drive (0.9.0, sync script 18).

   The same backup as "Export backup", saved by your sync script into a
   "Life Dashboard Backups" folder in your Google Drive: by itself once a day
   (the first time the app is open that day, in the background) and whenever
   you tap Back up to Google Drive. The script keeps the last 30 and moves older
   ones to the Drive trash. Restoring reads one back and uses the usual
   Merge / Replace (with Undo). Patient details are never in backups.

   When this device last backed up is kept here only (meta 'driveBackup'). */
import { db } from '../core/db.js';
import { emit } from '../core/events.js';
import { state } from '../core/state.js';
import { todayKey } from '../core/manila.js';
import { deviceName } from '../core/platform.js';
import { APP } from '../core/config.js';
import { buildBackup, hasRealData, markBackedUp, validateBackup, BackupError } from './backup.js';
import { callSyncScript, syncScriptVersion, syncSnapshot } from './sync.js';

export const DRIVE_BACKUP_VERSION = 18;
const SAVE_TIMEOUT_MS = 3 * 60_000;
const RETRY_MS = 60 * 60_000;      // after an automatic backup failed, wait this long
const AUTO_DELAY_MS = 20_000;      // let the app settle (and sync) before the day's backup

let running = null;
let failedAt = 0;

const pad = (n) => String(n).padStart(2, '0');

/** Plain words for what went wrong. */
export const DRIVE_REASONS = {
  'not-connected': 'Connect sync with your Google Sheet first (Settings → Sync).',
  outdated: 'Update the sync script to version 18 (Settings → Sync → Update the sync script).',
  'backup-needs-permission': 'The sync script needs permission for Google Drive: in Apps Script choose setup, click Run and allow access.',
  'backup-drive-full': 'Your Google Drive is full. Free up some space, then try again.',
  'backup-too-large': 'This backup is too big to send in one go. Export backup (JSON) still works.',
  'backup-not-found': 'That backup isn’t in your Drive any more (it may be in the Drive trash).',
  offline: 'You’re offline. Backing up to Google Drive needs the internet.',
  failed: 'Google Drive didn’t answer. Please try again.',
};

/** Can this device back up to Google Drive now? '' when it can, else the reason's key. */
export function driveBackupProblem() {
  if (!syncSnapshot().connected) return 'not-connected';
  if ((syncScriptVersion() ?? 0) < DRIVE_BACKUP_VERSION) return 'outdated';
  return '';
}

async function meta() {
  return (await db.get('meta', 'driveBackup'))?.value ?? {};
}

/** When this device last backed up to Drive, and the problem last time (if any). */
export async function driveBackupStatus() {
  const m = await meta();
  return { lastAt: m.lastAt ?? null, lastDay: m.lastDay ?? null, error: m.error ?? null };
}

/** "LifeDashboard_Backup_2026-10-19_0900 iPhone.json" (Manila time; the script only takes names like this). */
function driveName(now = new Date()) {
  const d = new Date(now.getTime() + 8 * 3600e3);
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  const device = String(deviceName() || 'Device').replace(/[^\w .()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Device';
  return `LifeDashboard_Backup_${stamp} ${device}.json`;
}

const reasonOf = (err) => (DRIVE_REASONS[err?.reason] ? err.reason : navigator.onLine === false ? 'offline' : 'failed');

/**
 * Back up to Google Drive now. auto: the day's automatic backup (quiet).
 * → { ok, name, trashed } | { ok: false, reason }
 */
export function backupToDrive({ auto = false } = {}) {
  if (running) return running;
  running = (async () => {
    const problem = driveBackupProblem();
    if (problem) return { ok: false, reason: problem };
    if (navigator.onLine === false) return { ok: false, reason: 'offline' };
    const backup = await buildBackup();
    const counts = {
      tasks: (backup.data.tasks ?? []).filter((r) => !r.deletedAt && !r.sample).length,
      workouts: (backup.data.workouts ?? []).filter((r) => !r.deletedAt && !r.sample).length,
      templates: (backup.data.templates ?? []).filter((r) => !r.deletedAt && !r.sample).length,
      measurements: (backup.data.bodyMeasurements ?? []).filter((r) => !r.deletedAt && !r.sample).length,
      photos: (backup.data.progressPhotos ?? []).filter((r) => !r.deletedAt && !r.sample).length,
      habits: (backup.data.habits ?? []).filter((r) => !r.deletedAt && !r.sample).length,
    };
    const now = new Date();
    try {
      const res = await callSyncScript('driveBackupSave', {
        name: driveName(now),
        data: JSON.stringify(backup),
        meta: { exportedAt: backup.exportedAt, device: deviceName(), appVersion: APP.version, auto, counts },
      }, { timeoutMs: SAVE_TIMEOUT_MS });
      await db.put('meta', { key: 'driveBackup', value: { lastAt: now.toISOString(), lastDay: todayKey(now.getTime()), error: null } });
      await markBackedUp(); // counts for the weekly reminder
      failedAt = 0;
      emit('backup');
      return { ok: true, name: res.name, trashed: res.trashed ?? 0 };
    } catch (err) {
      const reason = reasonOf(err);
      failedAt = Date.now();
      await db.put('meta', { key: 'driveBackup', value: { ...(await meta()), error: reason } });
      emit('backup');
      return { ok: false, reason };
    }
  })().finally(() => { running = null; });
  return running;
}

/** Your backups in Drive, newest first. → { ok, backups, folderUrl } | { ok: false, reason } */
export async function listDriveBackups() {
  const problem = driveBackupProblem();
  if (problem) return { ok: false, reason: problem };
  try {
    const res = await callSyncScript('driveBackupList', {});
    return { ok: true, backups: Array.isArray(res.backups) ? res.backups : [], folderUrl: res.folderUrl || '' };
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
}

/** Read one backup back from Drive, checked like a backup file (throws BackupError with plain words). */
export async function fetchDriveBackup(id) {
  let res;
  try {
    res = await callSyncScript('driveBackupGet', { id }, { timeoutMs: SAVE_TIMEOUT_MS });
  } catch (err) {
    throw new BackupError(DRIVE_REASONS[reasonOf(err)]);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.data);
  } catch {
    throw new BackupError('This backup couldn’t be read. It may be damaged.');
  }
  return validateBackup(parsed);
}

/** The day's automatic backup, if it's due (Settings → Backup → Daily Google Drive backup). */
async function autoBackupIfDue() {
  if (state.settings.backup?.drive === false || driveBackupProblem() || navigator.onLine === false) return;
  if (document.visibilityState !== 'visible' || running) return;
  if (failedAt && Date.now() - failedAt < RETRY_MS) return;
  const m = await meta();
  if (m.lastDay === todayKey()) return;
  if (!(await hasRealData())) return; // nothing worth keeping yet (sample data doesn't count)
  await backupToDrive({ auto: true });
}

export function initDriveBackup() {
  const soon = () => setTimeout(() => autoBackupIfDue().catch((err) => console.warn('Drive backup failed', err)), AUTO_DELAY_MS);
  soon();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(); });
}
