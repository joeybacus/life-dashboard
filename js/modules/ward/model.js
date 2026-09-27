/* Ward Patients — plain helpers with no database or network: Manila time,
   logsheet links, hospital numbers, priority, sorting and messages.

   The ward runs on Manila time (Asia/Manila, UTC+8 all year): ticks reset at
   Manila midnight, and the logsheet's Rounds Start / Rounds End columns hold
   Manila times as text, e.g. "2026-09-27 08:15". Moments inside the app are
   ISO timestamps. */

export const MANILA = 'Asia/Manila';
const OFFSET_MS = 8 * 3600e3; // the Philippines has no daylight saving time
const DAY_MS = 864e5;

/** "YYYY-MM-DD" in Manila for a moment (default: now). */
export function manilaDateKey(ms = Date.now()) {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** The day before a "YYYY-MM-DD" key. */
export function previousDateKey(key) {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Milliseconds until the next Manila midnight. */
export function msUntilManilaMidnight(ms = Date.now()) {
  const local = ms + OFFSET_MS;
  return Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - local;
}

/** ISO → the logsheet's time text ("2026-09-27 08:15", Manila). */
export function toSheetTime(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? new Date(t + OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') : '';
}

/** The logsheet's time text → ISO, or null when it isn't in that format. */
export function fromSheetTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - OFFSET_MS;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** The Manila day of a logsheet time ("2026-09-27 08:15" → "2026-09-27"), or ''. */
export const sheetTimeDay = (text) => (/^\d{4}-\d{2}-\d{2}/.exec(String(text ?? '').trim())?.[0] ?? '');

const fmt = (options) => new Intl.DateTimeFormat(undefined, { timeZone: MANILA, ...options });
const F = {
  time: fmt({ hour: 'numeric', minute: '2-digit' }),
  day: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  dayLong: fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  stamp: fmt({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
};

/** "8:15 AM" (Manila). */
export const wardTime = (iso) => F.time.format(new Date(iso));
/** "8:15 AM" today, otherwise "Sep 26, 8:15 AM" (Manila). */
export const wardStamp = (iso, now = Date.now()) =>
  (manilaDateKey(Date.parse(iso)) === manilaDateKey(now) ? F.time : F.stamp).format(new Date(iso));
/** "Sat, Sep 27" for a "YYYY-MM-DD" key. */
export const wardDay = (key) => F.day.format(new Date(`${key}T12:00:00+08:00`));
/** "Saturday, September 27, 2026" for a "YYYY-MM-DD" key. */
export const wardDayLong = (key) => F.dayLong.format(new Date(`${key}T12:00:00+08:00`));

/** "12 min", "1 h 5 min", "under 1 min" (numbers and units never split across lines). */
export function formatSpan(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 60_000) return 'under 1 min';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ---------- The logsheet link ---------- */

/**
 * Read a Google Sheets link (or a bare spreadsheet ID).
 * Returns { id } or { error: 'empty' | 'published' | 'not-a-sheet' }.
 */
export function parseSheetLink(input) {
  const text = String(input ?? '').trim();
  if (!text) return { error: 'empty' };
  if (/\/spreadsheets\/d\/e\//.test(text)) return { error: 'published' }; // "Publish to web" links can't be edited
  const fromPath = text.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,100})/);
  if (fromPath) return { id: fromPath[1] };
  const fromQuery = /^https?:\/\/(docs|drive)\.google\.com\//.test(text) && text.match(/[?&]id=([A-Za-z0-9_-]{20,100})/);
  if (fromQuery) return { id: fromQuery[1] };
  if (/^[A-Za-z0-9_-]{25,100}$/.test(text)) return { id: text };
  return { error: 'not-a-sheet' };
}

/* ---------- Patients ---------- */

/** Hospital numbers match ignoring capitals and extra spaces (as in the sync script). */
export const hnKey = (hn) => String(hn ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** Free text as the logsheet shows it: line breaks kept, trailing blank space dropped. */
export const cleanText = (text) => String(text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');

export const MAX_RECS = 20000;

/** Recommendations that mention "priority" (any capitals) mark a priority patient. */
export const isPriority = (recs) => /priority/i.test(String(recs ?? ''));

/**
 * Round in this order: priority patients not yet rounded, then the others
 * not yet rounded, then those already rounded — each group in the sheet's order.
 */
export function sortPatients(patients) {
  const group = (p) => (p.rounded ? 2 : p.priority ? 0 : 1);
  return [...patients].sort((a, b) => group(a) - group(b) || a.row - b.row);
}

/* ---------- Messages ---------- */

/** Why a change couldn't be saved to the logsheet (from the sync script). */
export const WRITE_PROBLEMS = {
  'not-found': 'Not in the logsheet any more',
  duplicate: 'Two rows in the logsheet have this hospital number',
  formula: 'This cell in the logsheet is a formula, so it can’t be changed here',
  'headers-taken': 'Columns E–G of the logsheet are used for something else',
  'read-only': 'You can view this logsheet but not edit it',
  protected: 'This part of the logsheet is protected',
  'write-failed': 'Google couldn’t save it — it will try again',
  invalid: 'This change couldn’t be saved',
};

/** Problems opening or reading the logsheet. */
export const LOAD_PROBLEMS = {
  'not-connected': 'Ward Patients works through your Google Sheets sync. Set up sync first.',
  'script-outdated': 'Your sync script needs a quick update before Ward Patients can use it.',
  'ward-bad-id': 'That doesn’t look like a Google Sheets link. Copy it from the address bar of the logsheet, or use Share → Copy link.',
  'link-published': 'That’s a “Publish to web” link, which can’t be edited. Open the logsheet itself and copy the link from the address bar.',
  'link-empty': 'Paste the link to your logsheet.',
  'ward-no-access': 'Couldn’t open this spreadsheet. Check the link, and that the logsheet is shared (with edit access) with the Google account that owns your LIFE DASHBOARD sheet — that’s the account your sync script runs as.',
  'ward-no-tab': 'This spreadsheet has no tab with that name.',
  'ward-needs-auth': 'Your sync script needs permission to open other spreadsheets: in Apps Script, choose “setup”, click Run and allow access, then deploy a new version.',
};
