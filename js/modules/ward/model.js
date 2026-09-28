/* Ward Patients — plain helpers with no database or network: Manila time,
   logsheet links, lists and their columns, hospital numbers, priority,
   sorting and messages.

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

/* ---------- Lists and their columns ----------
   Every list shows Rounded (the tick), Name (column A) and Hospital No. (B) —
   they can be renamed in the app but not removed — then its own columns, in
   its own order: at first C Labs and D Recommendations. Headings you change
   are used in the app only; the logsheet's row 1 stays as it is. */

export const DEFAULT_LIST_ID = 'ward'; // the first list (it had the whole feature to itself before 0.4.3.1)
export const DEFAULT_LIST_NAME = 'Ward Patients';
export const MAX_NAME = 40;           // characters in a list name or a heading

/** Headings of the columns every list has. */
export const FIXED_HEADINGS = { rounded: 'Rounded', name: 'Name', hn: 'Hospital No.' };

/** The columns a list starts with. P1 / P2 / P3 are read from the one marked priority. */
export const defaultColumns = () => [
  { id: 'labs', col: 'C', label: 'Labs' },
  { id: 'recs', col: 'D', label: 'Recommendations', priority: true },
];

export const MAX_COLS = 52;            // columns A to AZ (as in the sync script)
export const ROUNDS_COLS = ['E', 'F', 'G'];
export const NEW_COL_MIN = 8;          // a column added from the app goes after all the others, H at the earliest
export const LISTS_SCRIPT_VERSION = 7; // your own columns, adding columns and moving rows need sync script 7

/** The sync script version that can save edits to a column: D since 3, C since 4, any other since 7. */
export const scriptForColumn = (col) => (col === 'D' ? 3 : col === 'C' ? 4 : LISTS_SCRIPT_VERSION);

/** 'A' → 1 … 'AZ' → 52; 0 when it isn't a column letter. */
export function colIndex(letter) {
  const s = String(letter ?? '');
  if (!/^[A-Z]{1,2}$/.test(s)) return 0;
  const n = [...s].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0);
  return n <= MAX_COLS ? n : 0;
}

/** 1 → 'A' … 52 → 'AZ'. */
export function colLetter(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** A heading or list name as typed: one line, single spaces, not too long. */
export const cleanName = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/**
 * Columns of the logsheet a list could show besides its own: C onwards, not
 * already shown, and not the rounds columns E–G (unless they hold something
 * else). headings: the logsheet's row 1, as last loaded.
 */
export function otherColumns(list, headings, headersState) {
  const shown = new Set(list.columns.map((c) => c.col));
  const out = [];
  for (let n = 3; n <= Math.min(headings.length, MAX_COLS); n++) {
    const col = colLetter(n);
    if (shown.has(col) || (ROUNDS_COLS.includes(col) && headersState !== 'taken')) continue;
    out.push({ col, heading: String(headings[n - 1] ?? '').trim() });
  }
  return out;
}

/** The letter a new column would get: after all the others, H at the earliest. */
export const nextNewColumn = (lastColumn) => colLetter(Math.max(NEW_COL_MIN, (Number(lastColumn) || 0) + 1));

/* ---------- Patients ---------- */

/** Hospital numbers match ignoring capitals and extra spaces (as in the sync script). */
export const hnKey = (hn) => String(hn ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** Free text as the logsheet shows it: line breaks kept, trailing blank space dropped. */
export const cleanText = (text) => String(text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');

export const MAX_TEXT = 20000; // characters in one cell the app edits

export const PRIORITY_LEVELS = {
  1: { word: 'High', group: 'P1 · High priority' },
  2: { word: 'Medium', group: 'P2 · Medium priority' },
  3: { word: 'Low', group: 'P3 · Low priority' },
};

/**
 * How urgent a patient is, from their recommendations (capitals don't matter):
 * P1 is high priority, P2 and P3 lower ("Priority 2" counts as P2 too). The
 * word "priority" without a number counts as high. When several appear, the
 * most urgent wins. Returns { level: 1 | 2 | 3, tag: 'P1' | … | 'Priority' } or null.
 */
export function priorityOf(recs) {
  const text = String(recs ?? '');
  const levels = [
    ...[...text.matchAll(/\bP([123])\b/gi)].map((m) => Number(m[1])),
    ...[...text.matchAll(/\bpriority\s*(?:level\s*)?[:#-]?\s*([123])\b/gi)].map((m) => Number(m[1])),
  ];
  if (levels.length) {
    const level = Math.min(...levels);
    return { level, tag: `P${level}` };
  }
  return /priority/i.test(text) ? { level: 1, tag: 'Priority' } : null;
}

/**
 * Round in this order: patients not yet rounded by priority (P1 or "priority",
 * then P2, then P3), then the others not yet rounded, then those already
 * rounded — each group in the sheet's order.
 */
export function sortPatients(patients) {
  const group = (p) => (p.rounded ? 4 : p.priority ? p.priority.level - 1 : 3);
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
  'needs-update': 'Update the sync script (Settings → Sync) to save this column — it’s kept on this device until then',
};

/** Why rows couldn't be moved, or a column added (from the sync script). */
export const STRUCTURE_PROBLEMS = {
  changed: 'The logsheet changed while you were arranging (a patient was added, removed, moved or renamed). This is its latest order — arrange it again and tap Save.',
  merged: 'Some cells in the logsheet are merged across rows, so rows can’t be moved from the app. Unmerge them in Google Sheets first.',
  protected: 'Part of the logsheet is protected, so the app can’t change it. Ask its owner, or make the change in Google Sheets.',
  'read-only': 'Your Google account can view this logsheet but not edit it. Ask its owner for edit access.',
  'too-wide': 'The logsheet already goes up to column AZ, so the app can’t add another column.',
  'too-many': 'The logsheet has more than 2,000 rows, so rows can’t be moved from the app.',
  invalid: 'That couldn’t be done. Refresh the list and try again.',
  'write-failed': 'Google couldn’t save it. Please try again.',
  'needs-update': 'Your sync script needs updating first (Settings → Sync → Update the sync script).',
  offline: 'You’re offline. Try again when you’re connected.',
  network: 'Couldn’t reach Google. Check your connection and try again.',
};

/** Problems opening or reading the logsheet. */
export const LOAD_PROBLEMS = {
  'not-connected': 'Patient lists work through your Google Sheets sync. Set up sync first.',
  'script-outdated': 'Your sync script needs a quick update before this list can use it.',
  'ward-bad-id': 'That doesn’t look like a Google Sheets link. Copy it from the address bar of the logsheet, or use Share → Copy link.',
  'link-published': 'That’s a “Publish to web” link, which can’t be edited. Open the logsheet itself and copy the link from the address bar.',
  'link-empty': 'Paste the link to your logsheet.',
  'ward-no-access': 'Couldn’t open this spreadsheet. Check the link, and that the logsheet is shared (with edit access) with the Google account that owns your LIFE DASHBOARD sheet — that’s the account your sync script runs as.',
  'ward-no-tab': 'This spreadsheet has no tab with that name.',
  'ward-needs-auth': 'Your sync script needs permission to open other spreadsheets: in Apps Script, choose “setup”, click Run and allow access, then deploy a new version.',
};
