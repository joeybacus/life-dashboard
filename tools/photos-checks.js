/* Checks for the progress-photo rules (pure functions only — nothing is saved).
   Open tools/photos-checks.html through the preview server. */
import { autoLabels, byDay, byMonth, defaultPair, exifDate, nearestTo, sortPhotos } from '../js/modules/photos/model.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : JSON.stringify(detail) });
const at = (s) => new Date(s).toISOString();

/* ---------- Labels ---------- */

const workouts = [
  { id: 'w-am', title: 'Push day', muscleGroups: ['Push'], startedAt: at('2026-10-07T07:00:00'), endedAt: at('2026-10-07T08:00:00') },
  { id: 'w-pm', title: 'Legs day', muscleGroups: ['Legs'], startedAt: at('2026-10-07T18:00:00'), endedAt: at('2026-10-07T19:00:00') },
  { id: 'w-open', title: 'In progress', startedAt: at('2026-10-08T07:00:00'), endedAt: null },
];
const weights = [
  { kind: 'weight', valueKg: 79, measuredAt: at('2026-09-01T07:00:00') },
  { kind: 'weight', valueKg: 78.4, measuredAt: at('2026-10-05T07:00:00') },
  { kind: 'weight', valueKg: 78.1, measuredAt: at('2026-10-07T06:30:00') },
  { kind: 'waist', value: 84, measuredAt: at('2026-10-07T06:31:00') },
  { kind: 'weight', valueKg: 70, measuredAt: at('2026-10-06T07:00:00'), deletedAt: at('2026-10-06T08:00:00') },
];
let l = autoLabels(at('2026-10-07T19:10:00'), workouts, weights);
check('an evening photo gets the evening workout and that morning\'s weight', l.workoutId === 'w-pm' && l.muscleGroups[0] === 'Legs' && l.weightKg === 78.1, l);
l = autoLabels(at('2026-10-07T08:05:00'), workouts, weights);
check('a morning photo gets the morning workout', l.workoutId === 'w-am' && l.workoutTitle === 'Push day', l);
l = autoLabels(at('2026-10-08T07:30:00'), workouts, weights);
check('an unfinished workout isn\'t used; the weigh-in from yesterday is', l.workoutId === null && l.weightKg === 78.1, l);
l = autoLabels(at('2026-09-30T08:00:00'), workouts, weights);
check('a weigh-in more than 14 days old isn\'t used (deleted ones never are)', l.weightKg === null, l);

/* ---------- Grouping ---------- */

const P = (id, when, pose = null, extra = {}) => ({ id, takenAt: at(when), pose, ...extra });
const photos = [P('a', '2026-08-02T08:00:00', 'front'), P('b', '2026-09-15T08:00:00', 'side'), P('c', '2026-10-01T08:00:00', 'front'),
  P('d', '2026-10-07T08:00:00', 'front'), P('e', '2026-10-07T20:00:00', 'side'), P('x', '2026-10-06T08:00:00', 'front', { deletedAt: at('2026-10-06T09:00:00') })];
check('deleted photos are left out, the rest oldest first', sortPhotos(photos).map((p) => p.id).join('') === 'abcde');
const months = byMonth(sortPhotos(photos));
check('grouped by month, newest month (and photo) first', months.map((m) => m.key).join() === '2026-10,2026-09,2026-08' && months[0].photos.map((p) => p.id).join('') === 'edc', months.map((m) => m.key));
check('two photos on one day share a calendar square', byDay(sortPhotos(photos)).get('2026-10-07').length === 2);
check('compare starts with the oldest and newest of the newest photo\'s pose', JSON.stringify(defaultPair(photos)) === '["b","e"]', defaultPair(photos));
check('…and needs two photos', defaultPair([photos[0]]) === null);
check('jumping to a date finds the nearest photo', nearestTo(sortPhotos(photos), '2026-09-20').id === 'b' && nearestTo(sortPhotos(photos), '2026-10-02').id === 'c');

/* ---------- When a photo was taken (EXIF) ---------- */

/** A tiny JPEG start with an EXIF block holding DateTimeOriginal (big-endian TIFF). */
function fakeJpeg(dateText, little = false) {
  const tiff = [];
  const u16 = (n) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n) => (little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  // header, IFD0 at 8 with one entry: ExifIFD pointer → 26; Exif IFD with DateTimeOriginal → text at 44
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0));
  for (const ch of `${dateText}\0`) tiff.push(ch.charCodeAt(0));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}
const d = exifDate(fakeJpeg('2026:09:14 07:45:10'));
check('the date a photo was taken is read from it', d && d.getFullYear() === 2026 && d.getMonth() === 8 && d.getDate() === 14 && d.getHours() === 7 && d.getMinutes() === 45, d);
check('…also from little-endian EXIF (some cameras)', exifDate(fakeJpeg('2025:01:02 03:04:05', true))?.getFullYear() === 2025);
check('a file that isn\'t a JPEG, or has no date, gives none', exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer) === null && exifDate(fakeJpeg('not a date')) === null);

/* ---------- Show the results ---------- */

const ol = document.getElementById('results');
results.forEach((r) => {
  const li = document.createElement('li');
  li.className = r.ok ? 'ok' : 'fail';
  li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` → ${r.detail}` : ''}`;
  ol.append(li);
});
const failed = results.filter((r) => !r.ok).length;
const summary = document.querySelector('[data-summary]');
summary.textContent = failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`;
summary.className = failed ? 'fail' : 'ok';
