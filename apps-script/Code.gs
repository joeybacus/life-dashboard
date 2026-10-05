/**
 * Life Dashboard — Google Sheets sync
 * ---------------------------------------------------------------------------
 * This script runs inside your own Google account and keeps your Life
 * Dashboard data in this spreadsheet, one tab per kind of data.
 *
 * One-time setup (the app walks you through it: Settings → Sync):
 *   1. Paste this whole file into Extensions → Apps Script, then save.
 *   2. Choose "setup" in the toolbar and click Run (allow access when asked).
 *      Your secret token appears in the "Connection" tab.
 *   3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *   4. In the app, paste the Web app URL and the secret token.
 *
 * Keep the Web app URL and the token private: together they give access to
 * your data. After changing this code, publish it with
 * Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.
 * (The Web app URL stays the same, so nothing changes in the app.)
 *
 * The same script also reads and updates your ward logsheets for the app's
 * patient lists (Ward Patients, Neurology tab) — see "Ward Patients" further down —
 * and puts to-do tasks (and subtasks with their own time) in Google Calendar
 * when you ask it to — see "Google Calendar link".
 */

const PROTOCOL = 1;        // how the app and this script talk (changes rarely)
const SCRIPT_VERSION = 9;  // 2: Exercises and Workout templates tabs · 3: Ward Patients · 4: edit lab results · 5: to-do tabs and the Google Calendar link · 6: subtasks with their own time, in the Subtasks tab and in Google Calendar · 7: several patient lists (Ward lists tab), your own logsheet columns, and moving rows · 8: Referrals tab, and names, hospital numbers and rounds in the logsheet columns you choose · 9: a referral census (no rounds columns, dates in the columns you choose)

// App data → tab name. Please don't rename or delete these tabs.
const STORES = {
  profile: 'Profile',
  settings: 'Settings',
  tasks: 'Tasks',
  taskCategories: 'Task categories',
  subtasks: 'Subtasks',
  habits: 'Habits',
  habitLogs: 'Habit log',
  focusSessions: 'Focus sessions',
  workouts: 'Workouts',
  exercises: 'Exercises',
  templates: 'Workout templates',
  bodyMeasurements: 'Body measurements',
  wardLists: 'Ward lists', // names and columns of your patient lists — never patients (they stay in the logsheet)
  referrals: 'Referrals',  // patients referred to your service: name, hospital number, location, next rounds, what you're waiting for, notes
};

// Tabs this script fills in itself. The app reads them but never sends them.
const SCRIPT_STORES = {
  calendarLinks: 'Calendar links',
};

// Saved in this order, so names used by later tabs (categories, task titles) are up to date
const SAVE_ORDER = ['profile', 'settings', 'taskCategories', 'tasks', 'subtasks', 'habits', 'habitLogs', 'focusSessions',
  'workouts', 'exercises', 'templates', 'bodyMeasurements', 'wardLists', 'referrals'];

// Fixed columns on every data tab. "json" holds the complete item; the
// columns after it are a readable copy for you and are ignored by the app.
const HEADER = ['id', 'updatedAt', 'deletedAt', 'seq', 'device', 'json'];
const COL = { id: 0, updatedAt: 1, deletedAt: 2, seq: 3, device: 4, json: 5 };

const CONNECTION_TAB = 'Connection';
const CONFLICTS_TAB = 'Conflicts';
const CONFLICT_HEADER = ['Logged at', 'Tab', 'Item id', 'What happened', 'Kept version (updatedAt)',
  'Other version (updatedAt)', 'Other version came from', 'Other version (full data)'];

const MAX_JSON = 49000;   // Google Sheets allows 50,000 characters per cell
const MAX_RECORDS = 500;  // per request
const MAX_LOGS = 50;      // per request
const TEXT_LIMIT = 200;   // readable columns are shortened to this length

/* ---------- Setup (run once from the Apps Script editor) ---------- */

function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = makeToken_();
    props.setProperty('TOKEN', token);
  }
  if (!props.getProperty('SEQ')) props.setProperty('SEQ', '0');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(STORES).concat(Object.keys(SCRIPT_STORES)).forEach(function (store) { storeSheet_(ss, store); });
  conflictsSheet_(ss);
  connectionSheet_(ss, token);
  relayoutAll_(ss); // tabs made by older versions get this version's readable columns

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  // The 30-minute Google Calendar check (it does nothing until a task is linked to Calendar)
  try {
    calEnsureTimer_();
  } catch (err) {
    Logger.log('Couldn’t start the 30-minute Google Calendar check: ' + ((err && err.message) || err));
  }

  Logger.log('Life Dashboard sync is set up. Your secret token is: ' + token);
  return token;
}

/** Adds a "Life Dashboard" menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Life Dashboard')
    .addItem('Show secret token', 'showToken')
    .addToUi();
}

function showToken() {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  SpreadsheetApp.getUi().alert(token
    ? 'Secret token: ' + token
    : 'Not set up yet. Open Extensions → Apps Script, choose "setup" and click Run.');
}

/* ---------- Web app ---------- */

/** Opening the Web app URL in a browser shows this, which confirms the deployment works. */
function doGet() {
  return json_({ ok: true, app: 'life-dashboard-sync', protocol: PROTOCOL, version: SCRIPT_VERSION, message: 'Life Dashboard sync is running.' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad-request' });
  }

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TOKEN');
  if (!token) return json_({ ok: false, error: 'not-set-up' });
  if (!sameToken_(req.token, token)) return json_({ ok: false, error: 'bad-token' });
  if (req.protocol !== PROTOCOL) return json_({ ok: false, error: 'protocol', protocol: PROTOCOL });

  // Ward Patients works on your logsheet, not this spreadsheet (it locks only while writing)
  if (WARD_ACTIONS[req.action]) {
    try {
      return json_(WARD_ACTIONS[req.action](req));
    } catch (err) {
      return json_({ ok: false, error: 'server', message: String((err && err.message) || err) });
    }
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (req.action === 'ping') return json_({ ok: true, protocol: PROTOCOL, version: SCRIPT_VERSION, seq: currentSeq_(props) });
    if (req.action === 'push') return json_(push_(ss, props, req));
    if (req.action === 'pull') return json_(pull_(ss, props, req));
    if (CAL_ACTIONS[req.action]) return json_(CAL_ACTIONS[req.action](ss, props, req));
    return json_({ ok: false, error: 'bad-action' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Save changes sent by a device. The newest change (by updatedAt) wins; the
 * other version is written to the Conflicts tab so nothing is silently lost.
 */
function push_(ss, props, req) {
  const items = Array.isArray(req.records) ? req.records : [];
  if (items.length > MAX_RECORDS) return { ok: false, error: 'too-many' };
  const since = Number(req.sinceSeq) || 0;
  const device = String(req.deviceId || 'unknown device').slice(0, 60);
  const now = new Date().toISOString();
  const seq = nextSeq_(props);
  const results = {};
  const conflicts = [];

  const byStore = {};
  items.forEach(function (item) {
    const record = item && item.record;
    if (!item || !STORES[item.store] || !record || typeof record.id !== 'string' || !record.id || record.id.length > 200) return;
    (byStore[item.store] = byStore[item.store] || []).push(record);
  });

  const ctx = readableContext_(ss);
  const renamed = {}; // store → { id: true } for items whose name/title changed (other tabs show it)

  SAVE_ORDER.filter(function (store) { return byStore[store]; }).forEach(function (store) {
    const sheet = storeSheet_(ss, store);
    const prepared = prepareSheet_(sheet, store, ctx);
    const header = prepared.header;
    const rows = prepared.rows;
    const changed = prepared.changed;
    const rowById = {};
    rows.forEach(function (row, i) { if (row[COL.id]) rowById[row[COL.id]] = i; });

    byStore[store].forEach(function (record) {
      const key = store + ':' + record.id;
      const json = JSON.stringify(record);
      if (json.length > MAX_JSON) {
        results[key] = 'too-large';
        return;
      }
      const incomingAt = String(record.updatedAt || '');
      const i = rowById[record.id];

      if (i === undefined) {
        ctx.remember(store, record);
        rows.push(rowFor_(store, record, json, seq, device, header, ctx));
        rowById[record.id] = rows.length - 1;
        changed[rows.length - 1] = true;
        results[key] = 'applied';
        return;
      }

      const existing = rows[i];
      const existingAt = existing[COL.updatedAt];
      if (incomingAt === existingAt || sameContent_(existing[COL.json], record)) {
        results[key] = 'same';
        return;
      }
      if (incomingAt > existingAt) {
        // A change this device hadn't seen yet is being replaced: keep a copy
        if (Number(existing[COL.seq]) > since && existing[COL.device] !== device) {
          conflicts.push([now, STORES[store], record.id, 'Replaced by a newer change from ' + device,
            incomingAt, existingAt, existing[COL.device], existing[COL.json]]);
        }
        if (nameChanged_(existing[COL.json], record)) (renamed[store] = renamed[store] || {})[record.id] = true;
        ctx.remember(store, record);
        rows[i] = rowFor_(store, record, json, seq, device, header, ctx);
        changed[i] = true;
        results[key] = 'applied';
      } else {
        conflicts.push([now, STORES[store], record.id, 'Not applied: the Sheet already had a newer change',
          existingAt, incomingAt, device, json]);
        results[key] = 'stale';
      }
    });

    writeRows_(sheet, header, rows, changed);
  });

  // A renamed category, task or habit: update the names shown in the other tabs
  refreshDependents_(ss, renamed, ctx);

  // Versions a device replaced when it first joined sync
  (Array.isArray(req.logs) ? req.logs.slice(0, MAX_LOGS) : []).forEach(function (log) {
    if (!log || !STORES[log.store]) return;
    conflicts.push([now, STORES[log.store], String(log.id || ''), String(log.reason || 'Replaced by the version in the Sheet'),
      String(log.keptUpdatedAt || ''), String(log.lostUpdatedAt || ''), device, String(log.json || '')]);
  });

  if (conflicts.length) appendConflicts_(ss, conflicts);
  return { ok: true, version: SCRIPT_VERSION, seq: seq, results: results };
}

/** Everything saved after the device's last sync (by sequence number). */
function pull_(ss, props, req) {
  const since = Number(req.sinceSeq) || 0;
  const seq = currentSeq_(props);
  const changes = [];
  Object.keys(STORES).concat(Object.keys(SCRIPT_STORES)).forEach(function (store) {
    const sheet = ss.getSheetByName(tabName_(store));
    if (!sheet) return;
    dataRows_(sheet, HEADER.length).forEach(function (row) {
      if (!row[COL.id] || !(Number(row[COL.seq]) > since)) return;
      try {
        changes.push({ store: store, record: JSON.parse(row[COL.json]) });
      } catch (err) {
        // A damaged row (for example edited by hand) is skipped rather than breaking sync
      }
    });
  });
  return { ok: true, version: SCRIPT_VERSION, seq: seq, changes: changes };
}

/* ---------- Ward Patients (Neurology tab) ----------
 * Reads your ward logsheets — any Google Sheet this Google account can open —
 * and saves rounds and your edits back to them. The app can show several
 * patient lists, each with its own logsheet or tab; it sends the logsheet's ID
 * with each request, and this script doesn't keep it.
 *
 * Logsheet layout (patients from row 2; rows without a name are ignored):
 *   A Name · B Hospital Number · then the columns the list shows — at first
 *   C Laboratory Results and D Recommendations
 *   E Rounded · F Rounds Start · G Rounds End  (headings added by the app, only
 *   if E1:G1 are empty — if they hold something else, nothing is written there)
 *   Columns you add in the app go after all the others (H at the earliest),
 *   with their heading in row 1.
 *
 * Where things are (version 8): each request can say which columns hold the
 * name, the hospital number and the three rounds columns —
 *   layout: { name: 'B', hn: 'C', rounds: 'F' }  (rounds in F, G, H)
 * Without it: name A, hospital number B, rounds E–G, as before. rounds: '' means
 * the sheet has no rounds columns (a referral census, version 9): nothing is
 * ever written for rounds.
 *   dates: ['K', 'L']  (version 9) — columns holding a day: read as
 *   "YYYY-MM-DD" when the cell is a date, and a day written there becomes a date. Below, "A",
 * "B" and "E–G" mean those columns, wherever they are. In writes, the rounds
 * cells are still called E, F and G (Rounded, Rounds Start, Rounds End).
 *
 * Safety rules: never writes to columns A and B (names and hospital numbers)
 * and never adds or deletes rows. Rows move only when you save a new order in
 * the app (Arrange rows), and only if every patient row is still exactly where
 * the app last saw it. Other cells are written only when you edit them in the
 * app. Before every write it finds the patient's row again by hospital number
 * (rows may have moved) and checks the cell still holds what the app last saw;
 * if someone changed it, it reports both versions instead of overwriting.
 * Times are written as text in Manila time: "2026-09-27 08:15".
 */

const WARD_HEADERS = ['Rounded', 'Rounds Start', 'Rounds End'];
const WARD_TZ = 'Asia/Manila';
const WARD_TIME_FORMAT = 'yyyy-MM-dd HH:mm';
const WARD_MAX_ROWS = 2000;
const WARD_MAX_COLS = 52;      // columns A to AZ
const WARD_NEW_COL_MIN = 8;    // columns added from the app start at H, after the rounds columns E–G
const WARD_MAX_TEXT = 20000;   // characters in one cell the app edits
const WARD_MAX_WRITES = 100;   // per request
const WARD_DEFAULT_LAYOUT = { name: 1, hn: 2, rounds: 5 };

/**
 * Which columns hold the name, the hospital number and the rounds (numbers,
 * A = 1), from the request's layout — or null when it doesn't make sense
 * (columns used twice, or past AZ).
 */
function wardLayout_(req) {
  const given = req && req.layout && typeof req.layout === 'object' ? req.layout : {};
  const pick = function (key) { return key in given ? wardColIndex_(String(given[key])) : WARD_DEFAULT_LAYOUT[key]; };
  const L = { name: pick('name'), hn: pick('hn'), rounds: pick('rounds') };
  if (given.rounds === '') L.rounds = 0; // no rounds columns
  else if (!L.rounds || L.rounds + 2 > WARD_MAX_COLS) return null;
  if (!L.name || !L.hn || L.name === L.hn) return null;
  if (!L.rounds) return L;
  const inRounds = function (n) { return n >= L.rounds && n <= L.rounds + 2; };
  if (inRounds(L.name) || inRounds(L.hn)) return null;
  return L;
}

/** The real column of a rounds cell (E, F or G in writes). */
function wardRoundsCol_(L, c) {
  return L.rounds + 'EFG'.indexOf(c);
}

const WARD_ACTIONS = {
  wardCheck: wardCheck_,
  wardSync: wardSync_,
  wardCreateTest: wardCreateTest_,
};

/** Check a logsheet link: can it be opened, does the tab exist, are E1:G1 free? */
function wardCheck_(req) {
  const L = wardLayout_(req);
  if (!L) return { ok: false, error: 'ward-bad-layout' };
  const opened = wardOpen_(req);
  if (opened.error) return opened;
  const headers = wardHeaders_(opened.sheet, L);
  return {
    ok: true,
    version: SCRIPT_VERSION,
    title: opened.ss.getName(),
    tab: opened.sheet.getName(),
    tabs: opened.tabs,
    headers: headers,
    canEdit: wardCanEdit_(opened.sheet),
    patients: wardRead_(opened.sheet, headers, null, L).rows.length,
  };
}

/**
 * Save the app's changes (if any), then send back the whole list.
 *   writes:      [{ id, hn, expect, set, quiet, text }] — rounds: { E, F, G }; lab results and
 *                recommendations: { C } or { D }; with text: true, any of the list's columns: { H: '…' }
 *   claim:       add the E–G headings if E1:G1 are empty
 *   resetBefore: "YYYY-MM-DD" — untick patients last rounded before that day (Manila)
 *   cols:        the list's columns to read, e.g. ['C', 'D', 'H'] (each row then has cells: { C, D, H })
 *   addColumn:   { heading } — add a column after all the others (answer: added { status, column })
 *   move:        { expect, order } — put the patient rows in a new order (answer: moved { status })
 */
function wardSync_(req) {
  const L = wardLayout_(req);
  if (!L) return { ok: false, error: 'ward-bad-layout' };
  const opened = wardOpen_(req);
  if (opened.error) return opened;
  const sheet = opened.sheet;
  const writes = Array.isArray(req.writes) ? req.writes.slice(0, WARD_MAX_WRITES) : [];
  const resetBefore = /^\d{4}-\d{2}-\d{2}$/.test(String(req.resetBefore || '')) ? String(req.resetBefore) : '';
  const addColumn = req.addColumn && typeof req.addColumn === 'object' ? req.addColumn : null;
  const move = req.move && typeof req.move === 'object' ? req.move : null;
  const cols = Array.isArray(req.cols) ? req.cols.slice(0, WARD_MAX_COLS).map(String) : null;
  const dates = wardDates_(req, opened.ss);
  const out = { ok: true, version: SCRIPT_VERSION, title: opened.ss.getName(), tab: sheet.getName(), results: {}, reset: [], claimed: false };

  let headers = wardHeaders_(sheet, L);
  const wantsRounds = Boolean(req.claim) || writes.some(function (w) { return w && !w.text && wardTouchesRounds_(w.set); });
  const claimable = headers.state === 'empty' || headers.state === 'partial';
  if (writes.length || resetBefore || (wantsRounds && claimable) || addColumn || move) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(25000);
    } catch (err) {
      return { ok: false, error: 'busy' };
    }
    try {
      headers = wardHeaders_(sheet, L); // again, now that no other request is writing
      let claimError = '';
      if (wantsRounds && (headers.state === 'empty' || headers.state === 'partial')) {
        claimError = wardClaimHeaders_(sheet, L);
        if (!claimError) {
          out.claimed = true;
          headers = wardHeaders_(sheet, L);
        }
      }
      if (addColumn) {
        out.added = wardAddColumn_(sheet, addColumn.heading, L);
        if (out.added.column && cols) cols.push(out.added.column);
      }
      if (writes.length) out.results = wardApplyWrites_(sheet, writes, headers, claimError, L, dates);
      if (move) out.moved = wardMoveRows_(sheet, move, L);
      if (resetBefore && headers.state === 'ours') out.reset = wardResetStale_(sheet, resetBefore, L);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }

  const read = wardRead_(sheet, headers, cols ? wardTextCols_(cols, headers, L) : null, L, dates);
  out.headers = headers;
  out.canEdit = wardCanEdit_(sheet);
  out.headings = wardHeadings_(sheet);
  out.lastColumn = sheet.getLastColumn();
  out.rows = read.rows;
  out.truncated = read.truncated;
  return out;
}

/** Make a practice logsheet with made-up patients in your Google Drive, for trying the feature. */
function wardCreateTest_() {
  let ss;
  try {
    ss = SpreadsheetApp.create('Ward Patients — TEST logsheet (synthetic patients)');
  } catch (err) {
    return { ok: false, error: wardAccessError_(err) };
  }
  try { ss.setSpreadsheetTimeZone(WARD_TZ); } catch (err) { /* keep Google's default */ }
  const sheet = ss.getSheets()[0];
  const rows = [['Name', 'Hospital Number', 'Laboratory Results', 'Recommendations']].concat(WARD_TEST_PATIENTS);
  sheet.getRange(1, 1, rows.length, 4).setNumberFormat('@').setValues(rows);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  sheet.getRange(1, 3, rows.length, 2).setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 360);
  return { ok: true, version: SCRIPT_VERSION, spreadsheetId: ss.getId(), url: ss.getUrl(), title: ss.getName(), tab: sheet.getName() };
}

// Made-up patients (no real people) for the practice logsheet
const WARD_TEST_PATIENTS = [
  ['Test Patient 01', 'TEST-0001', 'CBC: Hgb 132, WBC 9.8, Plt 250\nNa 138, K 4.1, Crea 76', 'Continue current medications.\nNeuro vital signs every 4 hours.'],
  ['Test Patient 02', 'TEST-0002', 'CBC: Hgb 118, WBC 14.2 (high), Plt 310\nNa 134, K 3.6\nCRP 48\nBlood culture: pending\nCSF: WBC 5, protein 0.62, glucose 3.1\nCT head: no acute bleed\nMRI brain: scheduled\nECG: sinus rhythm\nChest X-ray: clear\nLDL 3.9',
    'PRIORITY: repeat cranial CT today. Tell the resident on duty if GCS drops.'],
  ['Test Patient 03', 'TEST-0003', '', 'P3 — for EEG tomorrow morning.'],
  ['Test Patient 04', 'TEST-0004', 'Procalcitonin 2.1\nLactate 2.4', 'p1: start IV antibiotics after two blood cultures.'],
  ['', 'TEST-0099', 'This row has no name, so the app ignores it.', ''],
  ['Test Patient 05', 'TEST-0005', 'HbA1c 7.9\nFBS 8.2',
    'Physical therapy daily.\nSpeech therapy assessment.\nSwallow screen before starting a diet.\nContinue aspirin 80 mg daily.\nAtorvastatin 40 mg at night.\nBlood pressure target below 140/90.\nDischarge planning on Friday.'],
  ['Test Patient 06', 'TEST-0006', 'Na 141, K 4.4', 'P2 — start levetiracetam 500 mg twice a day.'],
  ['Test Patient 07 — a long name to check wrapping', 'TEST-0007', 'Mg 0.7 (low)', 'Replace magnesium, recheck tomorrow.'],
  ['Test Patient 08', 'TEST-0008', 'Na 128 (low)\nSerum osmolality 262', 'P1 — correct sodium slowly (no more than 8 a day).'],
  ['Test Patient 09', '', 'No hospital number yet.', 'Admitting team to add the hospital number.'],
  ['Test Patient 10', 'TEST-0010', 'Troponin I negative ×2', 'P3 · cardiology referral sent.'],
];

/** Open the logsheet and find the tab (ignoring capitals and extra spaces in its name). */
function wardOpen_(req) {
  const id = String(req.spreadsheetId || '').trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) return { ok: false, error: 'ward-bad-id' };
  let ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (err) {
    return { ok: false, error: wardAccessError_(err) };
  }
  const tabs = ss.getSheets().map(function (s) { return s.getName(); });
  const wanted = String(req.tab || '').trim() || 'Sheet1';
  let sheet = ss.getSheetByName(wanted);
  if (!sheet) {
    const match = tabs.filter(function (name) { return name.trim().toLowerCase() === wanted.toLowerCase(); })[0];
    if (match) sheet = ss.getSheetByName(match);
  }
  if (!sheet) return { ok: false, error: 'ward-no-tab', title: ss.getName(), tabs: tabs.slice(0, 60) };
  return { ss: ss, sheet: sheet, tabs: tabs.slice(0, 60) };
}

function wardAccessError_(err) {
  const message = String((err && err.message) || err);
  // The script itself lacks permission (Google asks again after "setup" is run)
  if (/required permissions|authori[sz]/i.test(message)) return 'ward-needs-auth';
  return 'ward-no-access';
}

/**
 * Columns E–G: "ours" (our headings), "empty", "partial" (some of ours, the
 * rest empty) or "taken" (other headings, or data under empty headings).
 */
function wardHeaders_(sheet, L) {
  if (!L.rounds) return { state: 'none', values: [], dataBelow: false, cols: [] };
  const width = Math.max(0, Math.min(3, sheet.getMaxColumns() - L.rounds + 1));
  const shown = width ? sheet.getRange(1, L.rounds, 1, width).getDisplayValues()[0] : [];
  const values = [0, 1, 2].map(function (i) { return String(shown[i] == null ? '' : shown[i]).trim(); });
  let ours = 0;
  let empty = 0;
  values.forEach(function (v, i) {
    if (!v) empty++;
    else if (v.toLowerCase() === WARD_HEADERS[i].toLowerCase()) ours++;
  });
  let state = ours === 3 ? 'ours' : ours + empty === 3 ? (ours ? 'partial' : 'empty') : 'taken';
  let dataBelow = false;
  if (state === 'empty' || state === 'partial') {
    // The headings are free — but don't claim a column that already holds data
    const last = sheet.getLastRow();
    const free = values.map(function (v, i) { return v ? -1 : i; }).filter(function (i) { return i >= 0 && i < width; });
    if (last >= 2 && free.length) {
      const below = sheet.getRange(2, L.rounds, Math.min(last - 1, WARD_MAX_ROWS), width).getDisplayValues();
      dataBelow = below.some(function (row) { return free.some(function (i) { return String(row[i]).trim() !== ''; }); });
    }
    if (dataBelow) state = 'taken';
  }
  return { state: state, values: values, dataBelow: dataBelow, cols: [0, 1, 2].map(function (i) { return wardColLetter_(L.rounds + i); }) };
}

/** Add the missing E–G headings (styled like the heading before them). Returns '' or an error code. */
function wardClaimHeaders_(sheet, L) {
  try {
    const cols = sheet.getMaxColumns();
    const end = L.rounds + 2;
    if (cols < end) sheet.insertColumnsAfter(cols, end - cols);
    const range = sheet.getRange(1, L.rounds, 1, 3);
    const current = range.getDisplayValues()[0];
    const next = WARD_HEADERS.map(function (h, i) { return String(current[i]).trim() ? current[i] : h; });
    if (L.rounds > 1) sheet.getRange(1, L.rounds - 1).copyFormatToRange(sheet, L.rounds, end, 1, 1);
    range.setNumberFormat('@').setValues([next]);
    return '';
  } catch (err) {
    return wardWriteError_(err);
  }
}

/**
 * Patients from row 2 on. E–G are only read when they hold our headings.
 * cols: the list's columns to send as cells (null: only labs and recommendations, for older apps).
 */
function wardRead_(sheet, headers, cols, L, dates) {
  const lastRow = sheet.getLastRow();
  const count = Math.min(Math.max(0, lastRow - 1), WARD_MAX_ROWS);
  const rows = [];
  if (count) {
    const widest = (cols || []).reduce(function (most, c) { return Math.max(most, wardColIndex_(c)); }, Math.max(4, L.name, L.hn, L.rounds + 2));
    const width = Math.min(widest, sheet.getMaxColumns());
    const shown = sheet.getRange(2, 1, count, width).getDisplayValues();
    const raw = headers.state === 'ours' ? sheet.getRange(2, L.rounds, count, 3).getValues() : null;
    const values = dates && dates.cols.length ? sheet.getRange(2, 1, count, width).getValues() : null;
    for (let i = 0; i < count; i++) {
      const name = String(shown[i][L.name - 1] == null ? '' : shown[i][L.name - 1]).trim();
      if (!name) continue;
      const item = { row: i + 2, name: name, hn: String(shown[i][L.hn - 1] == null ? '' : shown[i][L.hn - 1]).trim(), labs: wardText_(shown[i][2]), recs: wardText_(shown[i][3]) };
      if (cols) {
        item.cells = {};
        cols.forEach(function (c) {
          const at = wardColIndex_(c) - 1;
          item.cells[c] = values && dates.cols.indexOf(c) >= 0 ? wardDay_(values[i][at], shown[i][at], dates.tz) : wardText_(shown[i][at]);
        });
      }
      if (raw) {
        item.rounded = wardBool_(raw[i][0]);
        item.start = wardTime_(raw[i][1], shown[i][L.rounds]);
        item.end = wardTime_(raw[i][2], shown[i][L.rounds + 1]);
      }
      rows.push(item);
    }
  }
  return { rows: rows, truncated: lastRow - 1 > WARD_MAX_ROWS };
}

/** Row 1 (A to the last column used, at most AZ): the app shows these headings when you add a column. */
function wardHeadings_(sheet) {
  const width = Math.min(sheet.getLastColumn(), WARD_MAX_COLS, sheet.getMaxColumns());
  if (width < 1) return [];
  return sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (v) { return String(v == null ? '' : v).trim(); });
}

/** The columns the app may read or edit as text: never the name or hospital number, and the rounds columns only while they aren't ours. */
function wardTextCols_(cols, headers, L) {
  const out = [];
  cols.forEach(function (c) {
    const n = wardColIndex_(c);
    if (!n || n === L.name || n === L.hn || out.indexOf(c) >= 0) return;
    if (L.rounds && n >= L.rounds && n <= L.rounds + 2 && headers.state !== 'taken') return;
    out.push(c);
  });
  return out;
}

/** Add a column after all the others (after the rounds columns, H at the earliest), with its heading in row 1 styled like D1. */
function wardAddColumn_(sheet, heading, L) {
  const text = String(heading == null ? '' : heading).replace(/\s+/g, ' ').trim();
  if (!text || text.length > 100) return { status: 'invalid' };
  const n = Math.max(L.rounds ? Math.max(WARD_NEW_COL_MIN, L.rounds + 3) : 1, sheet.getLastColumn() + 1);
  if (n > WARD_MAX_COLS) return { status: 'too-wide' };
  try {
    const cols = sheet.getMaxColumns();
    if (cols < n) sheet.insertColumnsAfter(cols, n - cols);
    sheet.getRange(1, 4).copyFormatToRange(sheet, n, n, 1, 1);
    sheet.getRange(1, n).setNumberFormat('@').setValue(text); // text, so it's never run as a formula
  } catch (err) {
    return { status: wardWriteError_(err) };
  }
  return { status: 'ok', column: wardColLetter_(n) };
}

/**
 * Put the patient rows in a new order (Arrange rows in the app).
 *   expect: [{ row, name, hn }] — every patient row, as the app last saw them
 *   order:  the same row numbers, in the new order
 * Rows without a name (blank lines, notes) stay where they are. Nothing moves
 * if any patient row was added, removed, moved or renamed since.
 */
function wardMoveRows_(sheet, move, L) {
  const expect = Array.isArray(move.expect) ? move.expect : [];
  const order = Array.isArray(move.order) ? move.order.map(Number) : [];
  if (!expect.length || expect.length !== order.length) return { status: 'invalid' };
  const last = sheet.getLastRow();
  if (last - 1 > WARD_MAX_ROWS) return { status: 'too-many' };
  const width = Math.min(Math.max(L.name, L.hn), sheet.getMaxColumns());
  const shown = last >= 2 ? sheet.getRange(2, 1, last - 1, width).getDisplayValues() : [];
  const current = [];
  shown.forEach(function (r, i) {
    const name = String(r[L.name - 1] == null ? '' : r[L.name - 1]).trim();
    if (name) current.push({ row: i + 2, name: name, hn: String(r[L.hn - 1] == null ? '' : r[L.hn - 1]).trim() });
  });
  const clean = function (v) { return String(v == null ? '' : v).trim(); };
  const unchanged = current.length === expect.length && current.every(function (c, i) {
    const e = expect[i] || {};
    return Number(e.row) === c.row && clean(e.name) === c.name && clean(e.hn) === c.hn;
  });
  if (!unchanged) return { status: 'changed' };

  const slots = current.map(function (c) { return c.row; });
  const sorted = order.slice().sort(function (a, b) { return a - b; });
  if (sorted.some(function (r, i) { return r !== slots[i]; })) return { status: 'invalid' }; // not the same rows
  if (order.every(function (r, i) { return r === slots[i]; })) return { status: 'same' };

  let blocked = false;
  try { blocked = !sheet.getRange(2, 1, last - 1, sheet.getMaxColumns()).canEdit(); } catch (err) { blocked = false; }
  if (blocked) {
    let viewOnly = false;
    try { viewOnly = !sheet.getRange(2, 1).canEdit(); } catch (err) { viewOnly = false; }
    return { status: viewOnly ? 'read-only' : 'protected' };
  }

  // Where each row should end up (named by the row it's in now): patients in the new
  // order in the patients' places, every other row where it is
  const isSlot = {};
  slots.forEach(function (r) { isSlot[r] = true; });
  const target = [];
  let next = 0;
  for (let r = 2; r <= last; r++) target.push(isSlot[r] ? order[next++] : r);
  const now = target.map(function (_, i) { return i + 2; });
  try {
    for (let i = 0; i < target.length; i++) {
      const j = now.indexOf(target[i], i);
      if (j === i) continue;
      sheet.moveRows(sheet.getRange(j + 2, 1), i + 2); // up to position i (everything between shifts down one)
      now.splice(i, 0, now.splice(j, 1)[0]);
    }
  } catch (err) {
    const message = String((err && err.message) || err);
    return { status: /merge/i.test(message) ? 'merged' : wardWriteError_(err) };
  }
  return { status: 'ok' };
}

function wardApplyWrites_(sheet, writes, headers, claimError, L, dates) {
  const last = sheet.getLastRow();
  const width = Math.min(Math.max(L.name, L.hn), sheet.getMaxColumns());
  const keys = last >= 2
    ? sheet.getRange(2, 1, Math.min(last - 1, WARD_MAX_ROWS), width).getDisplayValues().map(function (r) {
      return String(r[L.name - 1]).trim() ? wardKey_(r[L.hn - 1]) : ''; // rows without a name don't count
    })
    : [];
  const results = {};
  writes.forEach(function (w) {
    const id = String((w && w.id) || '');
    if (!id || results[id]) return;
    results[id] = wardWriteOne_(sheet, w, keys, headers, claimError, L, dates);
  });
  return results;
}

function wardWriteOne_(sheet, w, keys, headers, claimError, L, dates) {
  const text = Boolean(w && w.text); // one of the list's columns, as text (else: C, D or the rounds columns)
  const set = text ? wardTextCells_(w.set, headers, L) : wardCells_(w.set, true, headers, L);
  const expect = text ? wardTextCells_(w.expect, headers, L) : wardCells_(w.expect, false, headers, L);
  const cols = set ? Object.keys(set) : [];
  const key = wardKey_(w && w.hn);
  if (!set || !expect || !cols.length || !key) return { status: 'invalid' };
  if (!text && wardTouchesRounds_(set) && !L.rounds) return { status: 'invalid' };
  if (!text && wardTouchesRounds_(set) && headers.state !== 'ours') {
    return { status: headers.state === 'taken' ? 'headers-taken' : claimError || 'headers-taken' };
  }

  // Find the patient again: rows may have been sorted or moved since the app loaded them
  const rows = [];
  keys.forEach(function (k, i) { if (k === key) rows.push(i + 2); });
  if (!rows.length) return { status: 'not-found' };
  if (rows.length > 1) return { status: 'duplicate' };
  const row = rows[0];

  const all = cols.concat(Object.keys(expect).filter(function (c) { return cols.indexOf(c) < 0; }));
  const isRounds = function (c) { return !text && (c === 'E' || c === 'F' || c === 'G'); };
  const isDay = function (c) { return text && Boolean(dates) && dates.cols.indexOf(c) >= 0; };
  const real = function (c) { return isRounds(c) ? wardRoundsCol_(L, c) : wardColIndex_(c); }; // the column it's in
  const widest = all.reduce(function (most, c) { return Math.max(most, real(c)); }, 1);
  const first = all.reduce(function (least, c) { return Math.min(least, real(c)); }, widest);
  if (widest > sheet.getMaxColumns()) return { status: 'invalid' }; // that column isn't in the logsheet
  const range = sheet.getRange(row, first, 1, widest - first + 1);
  const at = function (c) { return real(c) - first; };
  const formulas = range.getFormulas()[0];
  if (cols.some(function (c) { return formulas[at(c)]; })) return { status: 'formula', row: row };
  const shown = range.getDisplayValues()[0];
  const raw = range.getValues()[0];
  const current = {};
  all.forEach(function (c) {
    if (isRounds(c)) current[c] = c === 'E' ? wardBool_(raw[at(c)]) : wardTime_(raw[at(c)], shown[at(c)]);
    else if (isDay(c)) current[c] = wardDay_(raw[at(c)], shown[at(c)], dates.tz);
    else current[c] = wardText_(shown[at(c)]);
  });
  const same = function (c, a, b) { return isRounds(c) && c === 'E' ? Boolean(a) === Boolean(b) : String(a == null ? '' : a) === String(b == null ? '' : b); };

  if (cols.every(function (c) { return same(c, current[c], set[c]); })) return { status: 'same', row: row };
  const unchanged = Object.keys(expect).every(function (c) { return same(c, current[c], expect[c]); });
  if (!unchanged) {
    if (w.quiet) return { status: 'skipped', row: row };
    const shownNow = {};
    all.forEach(function (c) { shownNow[c] = current[c]; });
    return { status: 'conflict', row: row, current: shownNow };
  }
  try {
    cols.forEach(function (c) {
      const cell = sheet.getRange(row, real(c));
      if (isRounds(c) && c === 'E') cell.setValue(set.E);
      else if (isDay(c) && /^\d{4}-\d{2}-\d{2}$/.test(set[c])) cell.setValue(set[c]); // a day: Sheets keeps it as a date (in the cell's own format)
      else cell.setNumberFormat('@').setValue(set[c]); // text, so Sheets never turns it into a date or formula
    });
  } catch (err) {
    return { status: wardWriteError_(err), row: row };
  }
  return { status: 'ok', row: row };
}

/** Untick patients whose tick is from an earlier day (Manila time). F and G keep the last rounds times. */
function wardResetStale_(sheet, before, L) {
  const last = sheet.getLastRow();
  const count = Math.min(Math.max(0, last - 1), WARD_MAX_ROWS);
  if (!count) return [];
  const names = sheet.getRange(2, 1, count, Math.max(L.name, L.hn)).getDisplayValues();
  const range = sheet.getRange(2, L.rounds, count, 3);
  const raw = range.getValues();
  const shown = range.getDisplayValues();
  const formulas = sheet.getRange(2, L.rounds, count, 1).getFormulas();
  const reset = [];
  for (let i = 0; i < count; i++) {
    if (!String(names[i][L.name - 1]).trim() || !wardBool_(raw[i][0]) || formulas[i][0]) continue;
    const start = wardTime_(raw[i][1], shown[i][1]);
    const end = wardTime_(raw[i][2], shown[i][2]);
    const day = (end || start).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= before) continue; // no date: leave it alone
    try {
      sheet.getRange(i + 2, L.rounds).setValue(false);
    } catch (err) {
      break; // can't edit the logsheet: try again another time
    }
    reset.push({ hn: String(names[i][L.hn - 1]).trim(), start: start, end: end });
  }
  return reset;
}

function wardCanEdit_(sheet) {
  try {
    return sheet.getRange(Math.min(2, sheet.getMaxRows()), 4, 1, Math.max(1, Math.min(4, sheet.getMaxColumns() - 3))).canEdit();
  } catch (err) {
    return null;
  }
}

/** Check the cells of one write (older apps' kind): C and D as text, E–G as rounds. Never the name or hospital number. */
function wardCells_(cells, forWriting, headers, L) {
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return null;
  const out = {};
  const ok = Object.keys(cells).every(function (c) {
    const v = cells[c];
    if (c === 'C' || c === 'D') {
      if (typeof v !== 'string' || v.length > WARD_MAX_TEXT) return false;
      if (wardTextCols_([c], headers, L).length !== 1) return false; // the name, hospital number or rounds are there
      out[c] = wardText_(v);
    } else if (c === 'E') {
      if (typeof v !== 'boolean') return false;
      out.E = v;
    } else if (c === 'F' || c === 'G') {
      if (typeof v !== 'string' || v.length > 200) return false;
      if (forWriting && !/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})?$/.test(v.trim())) return false;
      out[c] = v.trim();
    } else {
      return false;
    }
    return true;
  });
  return ok ? out : null;
}

/** Check the cells of a text write (one of the list's columns): see wardTextCols_. */
function wardTextCells_(cells, headers, L) {
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return null;
  const out = {};
  const ok = Object.keys(cells).every(function (c) {
    const v = cells[c];
    if (typeof v !== 'string' || v.length > WARD_MAX_TEXT) return false;
    if (wardTextCols_([c], headers, L).length !== 1) return false;
    out[c] = wardText_(v);
    return true;
  });
  return ok ? out : null;
}

function wardTouchesRounds_(cells) {
  return Boolean(cells) && typeof cells === 'object' && ['E', 'F', 'G'].some(function (c) { return c in cells; });
}

/** Column letter → number (A = 1 … AZ = 52), or 0 when it isn't one. */
function wardColIndex_(letter) {
  const s = String(letter == null ? '' : letter);
  if (!/^[A-Z]{1,2}$/.test(s)) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n <= WARD_MAX_COLS ? n : 0;
}

function wardColLetter_(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Hospital numbers match ignoring capitals and extra spaces. */
function wardKey_(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Free text as shown in the sheet: line breaks kept, trailing blank space dropped. */
function wardText_(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

/** The columns of a request that hold days, and the logsheet's time zone (for reading dates). */
function wardDates_(req, ss) {
  const cols = Array.isArray(req.dates) ? req.dates.slice(0, WARD_MAX_COLS).map(String).filter(function (c) { return wardColIndex_(c) > 0; }) : [];
  let tz = WARD_TZ;
  try { tz = ss.getSpreadsheetTimeZone() || WARD_TZ; } catch (err) { /* keep Manila */ }
  return { cols: cols, tz: tz };
}

/** A day as the app reads it: "YYYY-MM-DD" when the cell is a date, otherwise its text. */
function wardDay_(value, shown, tz) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  return wardText_(shown).trim();
}

function wardBool_(value) {
  if (value === true || value === false) return value;
  return /^(true|yes|y|1|✓|✔|x)$/i.test(String(value == null ? '' : value).trim());
}

function wardTime_(value, shown) {
  if (value instanceof Date) return Utilities.formatDate(value, WARD_TZ, WARD_TIME_FORMAT);
  return String(shown == null ? '' : shown).trim();
}

function wardWriteError_(err) {
  const message = String((err && err.message) || err);
  if (/protected/i.test(message)) return 'protected';
  if (/permission|access/i.test(message)) return 'read-only';
  return 'write-failed';
}

/* ---------- Readable columns for the to-do tabs ----------
 * The "json" column is what the app uses. The columns after it are a copy for
 * you to read: priority as "High", times in Manila time ("2026-09-27 08:15"),
 * categories by name as well as id. Changing them does nothing — tasks are
 * changed in the app, and the next change there rewrites the row.
 */

const SHOWN_TZ = 'Asia/Manila';
const PRIORITY_NAMES = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };

// Readable columns, in order, for the tabs that have a fixed layout (the other tabs list every field)
const LAYOUTS = {
  referrals: {
    Name: function (r) { return r.name || ''; },
    'Hospital No.': function (r) { return r.hn || ''; },
    Location: function (r) { return r.location || ''; },
    'Next rounds': function (r) { return r.next || ''; },
    'Waiting for': function (r) {
      return list_(r.waiting).filter(function (w) { return w && !w.done; }).map(function (w) { return w.text; }).join('; ');
    },
    Notes: function (r) { return r.notes || ''; },
    Status: function (r) { return r.status === 'done' ? 'Signed off' : 'Active'; },
    Updated: function (r) { return shownTime_(r.updatedAt); },
  },
  tasks: {
    Title: function (t) { return t.title; },
    Status: function (t) { return t.deletedAt ? 'Deleted' : t.status === 'done' ? 'Done' : 'Open'; },
    Priority: function (t) { return PRIORITY_NAMES[t.priority] || 'None'; },
    Date: function (t) { return t.date || ''; },
    Time: function (t) { return timeText_(t); },
    Category: function (t, ctx) { return ctx.name('taskCategories', t.categoryId); },
    'Category id': function (t) { return t.categoryId || ''; },
    Tags: function (t) { return list_(t.tags).join(', '); },
    Pinned: function (t) { return t.pinned ? 'Yes' : ''; },
    Reminders: function (t) { return remindersText_(t.reminders); },
    Repeats: function (t) { return repeatText_(t.recurrence); },
    'Google Calendar': function (t) { return t.addToCalendar ? 'On' : ''; },
    Links: function (t) { return list_(t.links).map(function (l) { return (l && (l.title || l.url)) || ''; }).join(', '); },
    Notes: function (t) { return t.notes || ''; },
    Completed: function (t) { return t.status === 'done' ? shownTime_(t.completedAt) : ''; },
    Created: function (t) { return shownTime_(t.createdAt); },
    Updated: function (t) { return shownTime_(t.updatedAt); },
    Deleted: function (t) { return shownTime_(t.deletedAt); },
  },
  taskCategories: {
    Name: function (c) { return c.name; },
    Colour: function (c) { return c.color || ''; },
    Icon: function (c) { return c.icon || ''; },
    Order: function (c) { return c.order == null ? '' : c.order; },
    Deleted: function (c) { return shownTime_(c.deletedAt); },
  },
  subtasks: {
    Task: function (s, ctx) { return ctx.name('tasks', s.taskId); },
    'Task id': function (s) { return s.taskId || ''; },
    Subtask: function (s) { return s.title; },
    Done: function (s) { return s.done ? 'Yes' : 'No'; },
    Date: function (s) { return s.date || ''; },
    Time: function (s) { return timeText_(s); },
    Reminders: function (s) { return remindersText_(s.reminders); },
    'Google Calendar': function (s) { return s.addToCalendar ? 'On' : ''; },
    Order: function (s) { return s.order == null ? '' : s.order; },
    Completed: function (s) { return s.done ? shownTime_(s.completedAt) : ''; },
    Updated: function (s) { return shownTime_(s.updatedAt); },
    Deleted: function (s) { return shownTime_(s.deletedAt); },
  },
  habits: {
    Name: function (h) { return h.name; },
    Group: function (h) { return h.group || ''; },
    Schedule: function (h) { return scheduleText_(h.schedule); },
    Active: function (h) { return h.active === false ? 'No' : 'Yes'; },
    Order: function (h) { return h.order == null ? '' : h.order; },
    Created: function (h) { return shownTime_(h.createdAt); },
    Updated: function (h) { return shownTime_(h.updatedAt); },
    Deleted: function (h) { return shownTime_(h.deletedAt); },
  },
  habitLogs: {
    Habit: function (l, ctx) { return ctx.name('habits', l.habitId); },
    'Habit id': function (l) { return l.habitId || ''; },
    Date: function (l) { return l.date || ''; },
    Done: function (l) { return l.done ? 'Yes' : 'No'; },
    Updated: function (l) { return shownTime_(l.updatedAt); },
  },
  focusSessions: {
    Task: function (f, ctx) { return ctx.name('tasks', f.taskId); },
    'Task id': function (f) { return f.taskId || ''; },
    Type: function (f) { return { focus: 'Focus', shortBreak: 'Short break', longBreak: 'Long break' }[f.type] || f.type || ''; },
    Start: function (f) { return shownTime_(f.start); },
    End: function (f) { return shownTime_(f.end); },
    Minutes: function (f) { return f.start && f.end ? Math.round((Date.parse(f.end) - Date.parse(f.start)) / 60000) : ''; },
    'Planned minutes': function (f) { return f.plannedMinutes == null ? '' : f.plannedMinutes; },
    Completed: function (f) { return f.completed ? 'Yes' : 'No'; },
  },
  calendarLinks: {
    Task: function (l, ctx) {
      return l.item === 'subtask' ? ctx.name('subtasks', l.id) + ' (subtask of ' + ctx.name('tasks', l.taskId) + ')' : ctx.name('tasks', l.id);
    },
    Status: function (l) { return CAL_STATUS_NAMES[l.status] || l.status || ''; },
    Calendar: function (l) { return l.calendarName || ''; },
    'Next alert': function (l) { return shownTime_(l.nextAlertAt); },
    'Follow-ups': function (l) {
      const sent = list_(l.followUps).filter(function (f) { return f && f.eventId; }).length;
      return sent ? sent + (sent === 1 ? ' follow-up' : ' follow-ups') : '';
    },
    Note: function (l) { return CAL_REASONS[l.reason] || l.reason || ''; },
    'Event id': function (l) { return l.eventId || ''; },
    Updated: function (l) { return shownTime_(l.updatedAt); },
  },
};

// Tabs that show another tab's names: when a name changes, their readable columns are refreshed
const DEPENDENTS = {
  taskCategories: [['tasks', 'categoryId']],
  tasks: [['subtasks', 'taskId'], ['focusSessions', 'taskId'], ['calendarLinks', 'id'], ['calendarLinks', 'taskId']],
  subtasks: [['calendarLinks', 'id']],
  habits: [['habitLogs', 'habitId']],
};

/** Names of categories, tasks and habits, for the readable columns of other tabs. */
function readableContext_(ss) {
  const cache = {};
  function items(store) {
    if (!cache[store]) {
      cache[store] = {};
      const sheet = ss.getSheetByName(tabName_(store));
      if (sheet) {
        dataRows_(sheet, HEADER.length).forEach(function (row) {
          if (!row[COL.id]) return;
          try { cache[store][row[COL.id]] = JSON.parse(row[COL.json]); } catch (err) { /* a damaged row */ }
        });
      }
    }
    return cache[store];
  }
  return {
    name: function (store, id) {
      if (!id) return '';
      const item = items(store)[id];
      if (!item) return '';
      const name = String(item.title || item.name || '');
      return item.deletedAt ? name + ' (deleted)' : name;
    },
    /** Keep names current while a push saves new versions. */
    remember: function (store, record) {
      if (DEPENDENTS[store] && cache[store]) cache[store][record.id] = record;
    },
  };
}

function readableFor_(store, record, ctx) {
  const layout = LAYOUTS[store];
  if (!layout) return readable_(record);
  const out = {};
  Object.keys(layout).forEach(function (column) {
    let value;
    try { value = layout[column](record, ctx); } catch (err) { value = ''; }
    out[column] = cellText_(value);
  });
  return out;
}

/**
 * A tab's header and rows, ready to change. A tab with a fixed layout that an
 * older version of this script wrote differently gets this version's readable
 * columns (every row is marked changed, and old extra columns are cleared).
 */
function prepareSheet_(sheet, store, ctx) {
  const current = headerOf_(sheet);
  const layout = LAYOUTS[store];
  const header = layout ? HEADER.concat(Object.keys(layout)) : current;
  const rows = dataRows_(sheet, header.length);
  const changed = {};
  const relaid = Boolean(layout) && current.join('\n') !== header.join('\n');
  if (relaid) {
    rows.forEach(function (row, i) {
      rows[i] = relayoutRow_(row, store, header, ctx);
      changed[i] = true;
    });
    if (current.length > header.length) {
      sheet.getRange(1, header.length + 1, Math.max(1, sheet.getLastRow()), current.length - header.length).clearContent();
    }
  }
  return { header: header, rows: rows, changed: changed, relaid: relaid };
}

/** Recalculate a row's readable columns from its JSON (the fixed columns stay as they are). */
function relayoutRow_(row, store, header, ctx) {
  let item = null;
  try { item = JSON.parse(row[COL.json]); } catch (err) { /* a damaged row keeps its fixed columns */ }
  const readable = item ? readableFor_(store, item, ctx) : {};
  return header.map(function (name, c) {
    if (c < HEADER.length) return row[c] === undefined ? '' : row[c];
    return Object.prototype.hasOwnProperty.call(readable, name) ? readable[name] : '';
  });
}

/** Give every fixed-layout tab this version's readable columns (setup runs this after an update). */
function relayoutAll_(ss) {
  const ctx = readableContext_(ss);
  Object.keys(LAYOUTS).forEach(function (store) {
    const sheet = ss.getSheetByName(tabName_(store));
    if (!sheet) return;
    const prepared = prepareSheet_(sheet, store, ctx);
    if (prepared.relaid) writeRows_(sheet, prepared.header, prepared.rows, prepared.changed);
  });
}

function nameChanged_(storedJson, record) {
  try {
    const old = JSON.parse(storedJson);
    return String(old.title || old.name || '') !== String(record.title || record.name || '') || Boolean(old.deletedAt) !== Boolean(record.deletedAt);
  } catch (err) {
    return true;
  }
}

/** After categories, tasks or habits were renamed: rewrite the names other tabs show. */
function refreshDependents_(ss, renamed, ctx) {
  Object.keys(renamed).forEach(function (store) {
    (DEPENDENTS[store] || []).forEach(function (dep) {
      const sheet = ss.getSheetByName(tabName_(dep[0]));
      if (!sheet) return;
      const prepared = prepareSheet_(sheet, dep[0], ctx);
      prepared.rows.forEach(function (row, i) {
        if (prepared.changed[i]) return;
        let item;
        try { item = JSON.parse(row[COL.json]); } catch (err) { return; }
        if (!item || !renamed[store][item[dep[1]]]) return;
        prepared.rows[i] = relayoutRow_(row, dep[0], prepared.header, ctx);
        prepared.changed[i] = true;
      });
      if (Object.keys(prepared.changed).length || prepared.relaid) writeRows_(sheet, prepared.header, prepared.rows, prepared.changed);
    });
  });
}

function shownTime_(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : Utilities.formatDate(d, SHOWN_TZ, 'yyyy-MM-dd HH:mm');
}

function list_(value) {
  return Array.isArray(value) ? value : [];
}

function timeText_(task) {
  if (!task.date) return '';
  if (!task.startTime) return 'No time';
  return task.endTime ? task.startTime + '–' + task.endTime : task.startTime;
}

function minutesText_(m) {
  if (m >= 1440 && m % 1440 === 0) return (m / 1440) + (m === 1440 ? ' day' : ' days');
  if (m >= 60 && m % 60 === 0) return (m / 60) + (m === 60 ? ' hour' : ' hours');
  return m + ' min';
}

function remindersText_(reminders) {
  return list_(reminders).map(function (r) {
    if (!r) return '';
    if (r.kind === 'at') return r.at ? 'At ' + shownTime_(r.at) : '';
    const m = Number(r.minutes);
    if (m === 0) return 'At the time';
    return isFinite(m) && m > 0 ? minutesText_(m) + ' before' : '';
  }).filter(function (text) { return text; }).join(', ');
}

function repeatText_(rule) {
  if (!rule || typeof rule !== 'object') return '';
  const n = Math.max(1, Number(rule.interval) || 1);
  const days = list_(rule.days).map(function (d) { return WEEKDAYS[d]; }).filter(Boolean);
  let text;
  if (rule.kind === 'daily') text = n > 1 ? 'Every ' + n + ' days' : 'Every day';
  else if (rule.kind === 'weekdays') text = 'Every weekday';
  else if (rule.kind === 'weekly') text = (n > 1 ? 'Every ' + n + ' weeks' : 'Every week') + (days.length ? ' on ' + days.join(', ') : '');
  else if (rule.kind === 'monthly') {
    text = (n > 1 ? 'Every ' + n + ' months' : 'Every month') + (rule.week
      ? ' on the ' + (ORDINALS[rule.week] || rule.week) + ' ' + (WEEKDAY_NAMES[rule.weekday] || '')
      : rule.monthDay ? ' on day ' + rule.monthDay : '');
  } else if (rule.kind === 'afterDone') text = n + (n === 1 ? ' day' : ' days') + ' after it’s done';
  else text = 'Yes';
  if (rule.until) text += ', until ' + rule.until;
  if (rule.count) text += ', ' + rule.count + ' times';
  return text;
}

function scheduleText_(schedule) {
  if (!schedule || typeof schedule !== 'object' || schedule.kind === 'daily') return 'Every day';
  if (schedule.kind === 'days') return list_(schedule.days).map(function (d) { return WEEKDAYS[d]; }).join(', ');
  if (schedule.kind === 'perWeek') return (Number(schedule.times) || 1) + ' times a week';
  return '';
}

/* ---------- Google Calendar link (to-do tasks → events) ----------
 * One way only: a task with "Add to Google Calendar" switched on becomes an
 * event, so its reminders ring from Google Calendar even while the app is
 * closed. Events go into the "Life Dashboard Tasks" calendar (made the first
 * time a task is linked) or the calendar you choose in the app. A subtask with
 * its own date and the switch on becomes its own event too (version 6), named
 * with its task — "Draft the introduction (Finish STRAMA paper)" — and done or
 * removed along with its task.
 *
 * What a linked task becomes:
 *   - with a time: an event at that time (30 minutes long if there's no end time)
 *   - a date and reminders but no time: a 15-minute entry at your default
 *     reminder time (8:00 AM), because Google can only alert before an event
 *     starts and all-day events start at midnight
 *   - a date only: an all-day event
 * Reminders become the event's pop-up alerts (Google allows 5, each at least 5
 * minutes and at most 4 weeks before). A done task's event is renamed
 * "✓ title" (or removed — a setting in the app); a deleted task's is deleted.
 *
 * The "Calendar links" tab keeps each task's event and status; the app reads
 * it. Every 30 minutes a timer (started by setup) checks the linked tasks: it
 * adds a short "Still not done: …" event when a task is still open after its
 * reminder (following your follow-up settings: how often, how many, quiet
 * hours), and notices events you deleted in Calendar — those are never made
 * again; the app tells you and unlinks the task.
 */

const CAL_NAME = 'Life Dashboard Tasks';
const CAL_TAG = 'lifeDashboardTaskId';
const CAL_WEB_BUDGET_MS = 15000;    // calendar work per request from the app (the rest is done next time)
const CAL_TIMER_BUDGET_MS = 20000;  // …and per 30-minute check
const CAL_CHECK_DAYS_BEFORE = 7;    // the 30-minute check looks at linked tasks from a week ago…
const CAL_CHECK_DAYS_AFTER = 60;    // …to two months ahead
const CAL_FOLLOW_LEAD_MIN = 35;     // a follow-up alert is added this long before it's due
const CAL_POPUP_MIN = 5;            // Google Calendar alerts: at least 5 minutes before…
const CAL_POPUP_MAX = 40320;        // …and at most 4 weeks before the event
const CAL_MAX_POPUPS = 5;
const CAL_ENTRY_MIN = 15;           // a dated task with reminders but no time
const CAL_TIMED_MIN = 30;           // a timed task with no end time
const CAL_FOLLOW_EVENT_MIN = 10;
const MANILA_OFFSET_MIN = 480;      // Manila is UTC+8 all year (no daylight saving)

const CAL_STATUS_NAMES = { linked: 'Linked', paused: 'Paused', deleted: 'Deleted in Google Calendar', unlinked: 'Not linked' };
const CAL_REASONS = {
  'calendar-missing': 'The calendar was deleted or can’t be found. In the app: Settings → Tasks → Google Calendar.',
  'calendar-needs-auth': 'The sync script needs permission to use Google Calendar: in Apps Script choose setup, click Run and allow access.',
  'calendar-failed': 'Google Calendar didn’t answer. It will try again.',
  'no-date': 'Add a date to put this task in Google Calendar.',
  'removed-in-calendar': 'You deleted this event in Google Calendar, so it won’t be made again.',
  done: 'Task done.',
  'done-removed': 'Task done — its event was removed.',
};

// The app's task settings this script uses (Settings tab), with their defaults
const TASK_DEFAULTS = {
  defaultTime: '08:00',
  calendar: { calendarId: '', completed: 'rename' },
  followUps: { enabled: true, minutes: 120, limit: 2, quiet: true, quietStart: '22:00', quietEnd: '08:00', highMinutes: 0 },
};

const CAL_ACTIONS = {
  calendarStatus: calStatus_,
  calendarSetup: calSetup_,
  calendarSync: calSync_,
};

/** Which calendars you own, which one tasks go into, and whether the 30-minute check is running. */
function calStatus_(ss, props) {
  const cfg = taskSettings_(ss);
  let calendars;
  let target;
  try {
    calendars = CalendarApp.getAllOwnedCalendars().map(function (c) { return { id: c.getId(), name: c.getName() }; });
    target = calTarget_(props, cfg, false);
  } catch (err) {
    return { ok: false, version: SCRIPT_VERSION, error: calErrorCode_(err), message: String((err && err.message) || err) };
  }
  let timer = false;
  try { timer = calHasTimer_(); } catch (err) { /* reported as not running */ }
  return {
    ok: true,
    version: SCRIPT_VERSION,
    calendars: calendars,
    calendar: { id: target.id, name: target.name, state: target.state }, // state: ok | not-created | missing
    timer: timer,
    lastCheckAt: props.getProperty('CAL_LAST_RUN') || '',
    lastError: props.getProperty('CAL_LAST_ERROR') || '',
  };
}

/**
 * "Try again" in the app: make the "Life Dashboard Tasks" calendar again if it
 * was deleted (create: true), restart the 30-minute check, re-check every linked task.
 */
function calSetup_(ss, props, req) {
  try {
    const cfg = taskSettings_(ss);
    if (req.create && !cfg.calendar.calendarId) {
      if (calTarget_(props, cfg, false).state === 'missing') props.setProperty('CAL_ID', '');
      calTarget_(props, cfg, true);
    }
    calEnsureTimer_();
  } catch (err) {
    return { ok: false, version: SCRIPT_VERSION, error: calErrorCode_(err), message: String((err && err.message) || err) };
  }
  const synced = calRun_(ss, props, { budgetMs: CAL_WEB_BUDGET_MS, all: true, appUrl: req.appUrl });
  const status = calStatus_(ss, props);
  status.links = synced.links;
  status.pending = synced.pending;
  return status;
}

/** Bring linked tasks' events up to date (the app asks for this after sending task changes). */
function calSync_(ss, props, req) {
  return calRun_(ss, props, { budgetMs: CAL_WEB_BUDGET_MS, ids: req.ids, all: Boolean(req.all), appUrl: req.appUrl });
}

/** Run by the 30-minute timer (setup starts it). */
function calendarTick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // a device is syncing right now: next time
  const props = PropertiesService.getScriptProperties();
  try {
    calRun_(SpreadsheetApp.getActiveSpreadsheet(), props, { budgetMs: CAL_TIMER_BUDGET_MS });
  } catch (err) {
    props.setProperty('CAL_LAST_ERROR', now_().toISOString() + ' — ' + String((err && err.message) || err).slice(0, 300));
  } finally {
    lock.releaseLock();
  }
}

function calHasTimer_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'calendarTick'; });
}

function calEnsureTimer_() {
  if (!calHasTimer_()) ScriptApp.newTrigger('calendarTick').timeBased().everyMinutes(30).create();
}

/**
 * Check linked tasks and update their events, within a time budget (the rest
 * waits for the next call). Looks at tasks changed since the last check,
 * linked tasks that are still open (for follow-ups and deleted events), and
 * any ids the app asks about.
 */
function calRun_(ss, props, opts) {
  const startedMs = Date.now();
  const now = now_();
  if (opts.appUrl && /^https:\/\/\S{1,190}$/.test(String(opts.appUrl))) props.setProperty('APP_URL', String(opts.appUrl));
  const cfg = taskSettings_(ss);
  const ctx = readableContext_(ss);
  const linkSheet = storeSheet_(ss, 'calendarLinks');
  const prepared = prepareSheet_(linkSheet, 'calendarLinks', ctx);
  const header = prepared.header;
  const links = {};
  const linkRow = {};
  prepared.rows.forEach(function (row, i) {
    if (!row[COL.id]) return;
    try {
      links[row[COL.id]] = JSON.parse(row[COL.json]);
      linkRow[row[COL.id]] = i;
    } catch (err) { /* a damaged row */ }
  });

  const sinceSeq = Number(props.getProperty('CAL_SEQ') || '0');
  const asked = {};
  (Array.isArray(opts.ids) ? opts.ids : []).slice(0, MAX_RECORDS).forEach(function (id) { asked[String(id)] = true; });
  const today = shownDate_(now);
  const from = addDaysKey_(today, -CAL_CHECK_DAYS_BEFORE);
  const until = addDaysKey_(today, CAL_CHECK_DAYS_AFTER);
  const changedTasks = [];
  const watched = [];
  let maxSeq = sinceSeq;
  const watch = function (link) {
    return Boolean(link) && (link.status === 'paused'
      || (link.status === 'linked' && link.taskOpen && link.taskDate >= from && link.taskDate <= until));
  };
  const taskJson = {};     // every task, for its subtasks' names and status
  const tasksChanged = {}; // tasks changed since the last check (a rename, done or deleted also changes their subtasks' events): id → seq
  const tasksSheet = ss.getSheetByName(STORES.tasks);
  (tasksSheet ? dataRows_(tasksSheet, HEADER.length) : []).forEach(function (row) {
    const id = row[COL.id];
    if (!id) return;
    const seq = Number(row[COL.seq]) || 0;
    if (seq > maxSeq) maxSeq = seq;
    taskJson[id] = row[COL.json];
    const link = links[id] || null;
    const isNew = seq > sinceSeq;
    if (isNew) tasksChanged[id] = seq;
    if (!(isNew || watch(link) || asked[id] || opts.all)) return;
    let task;
    try { task = JSON.parse(row[COL.json]); } catch (err) { return; }
    if (!task || task.sample || (!task.addToCalendar && !link)) return; // never linked: nothing to do
    (isNew ? changedTasks : watched).push({ task: task, seq: seq, link: link });
  });
  // Subtasks with their own date become events too (version 6), named with their task
  const subsSheet = ss.getSheetByName(STORES.subtasks);
  (subsSheet ? dataRows_(subsSheet, HEADER.length) : []).forEach(function (row) {
    const id = row[COL.id];
    if (!id) return;
    const seq = Number(row[COL.seq]) || 0;
    if (seq > maxSeq) maxSeq = seq;
    const link = links[id] || null;
    const isNew = seq > sinceSeq;
    const parentChanged = Boolean(link && tasksChanged[link.taskId]);
    if (!(isNew || parentChanged || watch(link) || asked[id] || opts.all)) return;
    let sub;
    try { sub = JSON.parse(row[COL.json]); } catch (err) { return; }
    if (!sub || sub.sample || (!sub.addToCalendar && !link)) return;
    let parent = null;
    try { parent = taskJson[sub.taskId] ? JSON.parse(taskJson[sub.taskId]) : null; } catch (err) { /* a damaged row: treated as gone */ }
    const item = subtaskAsTask_(sub, parent);
    // Changed with its task: it counts as part of that change (if time runs out, both are looked at again)
    (isNew || parentChanged ? changedTasks : watched).push({ task: item, seq: isNew ? seq : tasksChanged[link.taskId], link: link });
  });
  changedTasks.sort(function (a, b) { return a.seq - b.seq; });
  watched.sort(function (a, b) { return String(a.task.date || '').localeCompare(String(b.task.date || '')); });
  const queue = changedTasks.concat(watched);

  let target = null;
  let targetError = '';
  if (queue.some(function (c) { return calWanted_(c.task) || (c.link && c.link.eventId); })) {
    try {
      // The "Life Dashboard Tasks" calendar is made the first time a task is linked
      target = calTarget_(props, cfg, !cfg.calendar.calendarId && !props.getProperty('CAL_ID'));
    } catch (err) {
      targetError = calErrorCode_(err);
    }
  }

  const out = [];
  let seq = 0;
  let doneSeq = maxSeq;
  let pending = 0;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (Date.now() - startedMs > opts.budgetMs) {
      pending = queue.length - i;
      if (c.seq > sinceSeq) doneSeq = c.seq - 1; // come back to the changes not yet handled
      break;
    }
    const next = calReconcile_(c.task, c.link, cfg, target, targetError, now, ctx, props);
    if (!next) continue;
    if (!seq) seq = nextSeq_(props);
    const row = rowFor_('calendarLinks', next, JSON.stringify(next), seq, 'Google Calendar', header, ctx);
    if (linkRow[next.id] === undefined) {
      prepared.rows.push(row);
      linkRow[next.id] = prepared.rows.length - 1;
    } else {
      prepared.rows[linkRow[next.id]] = row;
    }
    prepared.changed[linkRow[next.id]] = true;
    out.push(next);
  }
  if (Object.keys(prepared.changed).length || prepared.relaid) writeRows_(linkSheet, header, prepared.rows, prepared.changed);
  props.setProperty('CAL_SEQ', String(doneSeq));
  props.setProperty('CAL_LAST_RUN', now.toISOString());
  if (!targetError) props.setProperty('CAL_LAST_ERROR', '');
  return {
    ok: true,
    version: SCRIPT_VERSION,
    links: out,
    pending: pending,
    calendar: target ? { id: target.id, name: target.name, state: target.state } : null,
    error: targetError,
  };
}

/**
 * A subtask as the calendar sees a task: its own date, time and reminders, its
 * task's priority and category; done or deleted when its task is.
 */
function subtaskAsTask_(sub, parent) {
  const gone = !parent || Boolean(parent.deletedAt);
  return {
    id: sub.id,
    item: 'subtask',
    taskId: String(sub.taskId || ''),
    parentTitle: parent ? String(parent.title || '') : '',
    title: sub.title,
    date: sub.date || null,
    startTime: sub.startTime || null,
    endTime: sub.endTime || null,
    reminders: list_(sub.reminders),
    followUp: sub.followUp || null,
    addToCalendar: Boolean(sub.addToCalendar),
    status: sub.done || (parent && parent.status === 'done') ? 'done' : 'open',
    deletedAt: sub.deletedAt || (gone ? (parent && parent.deletedAt) || 'task-gone' : null),
    priority: parent ? parent.priority : 'none',
    categoryId: parent ? parent.categoryId : null,
    notes: '',
    updatedAt: sub.updatedAt,
    sample: Boolean(sub.sample || (parent && parent.sample)),
  };
}

/** One task (or subtask): returns its updated link, or null when nothing changed. */
function calReconcile_(task, link, cfg, target, targetError, now, ctx, props) {
  const before = link ? JSON.stringify(link) : '';
  const next = link ? JSON.parse(before) : {
    id: task.id, createdAt: now.toISOString(), updatedAt: '', deletedAt: null,
    status: 'unlinked', reason: '', calendarId: '', calendarName: '', eventId: '', kind: '',
    followUps: [], followUpBase: '', nextAlertAt: '',
  };
  if (task.item === 'subtask') {
    next.item = 'subtask';
    next.taskId = task.taskId;
  }
  next.followUps = list_(next.followUps);
  next.taskUpdatedAt = String(task.updatedAt || '');
  next.taskDate = task.date || '';
  next.taskOpen = task.status !== 'done' && !task.deletedAt;
  const cal = target && target.calendar;
  try {
    if (!calWanted_(task)) {
      // Unlinked, deleted or no date: take its events away
      if (next.eventId || next.followUps.length) {
        const home = !next.calendarId ? null : cal && cal.getId() === next.calendarId ? cal : calById_(next.calendarId);
        if (home) {
          calDelete_(home, next.eventId);
          calDeleteFollowUps_(home, next);
        }
        next.eventId = '';
        next.followUps = [];
      }
      next.status = 'unlinked';
      next.reason = task.addToCalendar && !task.deletedAt && !task.date ? 'no-date' : '';
      next.followUpBase = '';
      next.nextAlertAt = '';
    } else if (next.status === 'deleted' && !next.eventId) {
      // Deleted in Google Calendar: stays that way until the app unlinks the task
    } else if (!cal) {
      next.status = 'paused';
      next.reason = targetError || (target && target.state === 'missing' ? 'calendar-missing' : 'calendar-failed');
    } else {
      calApply_(task, next, cal, cfg, now, ctx, props);
    }
  } catch (err) {
    next.status = 'paused';
    next.reason = calErrorCode_(err);
  }
  if (link && JSON.stringify(Object.assign({}, next, { updatedAt: link.updatedAt })) === before) return null;
  if (!link && next.status === 'unlinked' && !next.reason) return null;
  next.updatedAt = now.toISOString();
  return next;
}

/** Create or update a linked task's event and follow-ups. */
function calApply_(task, link, cal, cfg, now, ctx, props) {
  // Tasks now go into another calendar (chosen in the app): take the old event away first
  if (link.calendarId && link.calendarId !== cal.getId()) {
    const old = calById_(link.calendarId);
    if (old) {
      calDelete_(old, link.eventId);
      calDeleteFollowUps_(old, link);
    }
    link.eventId = '';
    link.followUps = [];
    link.followUpBase = '';
  }
  link.calendarId = cal.getId();
  link.calendarName = cal.getName();

  let event = link.eventId ? calAlive_(cal, link.eventId) : null;
  if (link.eventId && !event) {
    // Deleted in Google Calendar: the app tells you and unlinks the task. Never made again silently.
    calDeleteFollowUps_(cal, link);
    link.eventId = '';
    link.followUpBase = '';
    link.nextAlertAt = '';
    link.status = 'deleted';
    link.reason = 'removed-in-calendar';
    return;
  }

  if (task.status === 'done') {
    calDeleteFollowUps_(cal, link);
    link.followUpBase = '';
    link.nextAlertAt = '';
    if (event && cfg.calendar.completed === 'remove') {
      event.deleteEvent();
      link.eventId = '';
      event = null;
    } else if (event) {
      const doneTitle = '✓ ' + calTitle_(task);
      if (event.getTitle() !== doneTitle) event.setTitle(doneTitle);
      if (event.getPopupReminders().length) event.removeAllReminders();
    }
    link.status = event ? 'linked' : 'unlinked';
    link.reason = event ? 'done' : 'done-removed';
    return;
  }

  const want = calDesired_(task, cfg, ctx, props);
  if (!event) {
    event = want.kind === 'allday'
      ? cal.createAllDayEvent(want.title, want.date, { description: want.description })
      : cal.createEvent(want.title, want.start, want.end, { description: want.description });
    try { event.setTag(CAL_TAG, task.id); } catch (err) { /* only a label */ }
    link.eventId = event.getId();
    calSetPopups_(event, want.popups, true);
  } else {
    if (event.getTitle() !== want.title) event.setTitle(want.title);
    if ((event.getDescription() || '') !== want.description) event.setDescription(want.description);
    if (want.kind === 'allday') {
      if (!event.isAllDayEvent() || shownDateOf_(event.getAllDayStartDate()) !== want.dateKey) event.setAllDayDate(want.date);
    } else if (event.isAllDayEvent() || event.getStartTime().getTime() !== want.start.getTime() || event.getEndTime().getTime() !== want.end.getTime()) {
      event.setTime(want.start, want.end);
    }
    calSetPopups_(event, want.popups, false);
  }
  link.kind = want.kind;
  link.status = 'linked';
  link.reason = '';
  calFollowUps_(task, link, cal, cfg, want, now);

  const nowMs = now.getTime();
  const alerts = (want.start ? want.popups.map(function (m) { return want.start.getTime() - m * 60000; }) : [])
    .concat(link.followUps.filter(function (f) { return f && f.eventId; }).map(function (f) { return Date.parse(f.at); }))
    .filter(function (t) { return t > nowMs; });
  link.nextAlertAt = alerts.length ? new Date(Math.min.apply(null, alerts)).toISOString() : '';
}

/** What a task's event should look like. */
function calDesired_(task, cfg, ctx, props) {
  const title = calTitle_(task);
  const description = calDescription_(task, ctx, props);
  const reminders = list_(task.reminders);
  if (task.startTime) {
    const start = manilaTime_(task.date, task.startTime);
    let end = task.endTime ? manilaTime_(task.date, task.endTime) : null;
    if (end && end.getTime() <= start.getTime()) end = new Date(end.getTime() + 864e5); // ends after midnight
    if (!end) end = new Date(start.getTime() + CAL_TIMED_MIN * 60000);
    return { kind: 'timed', title: title, description: description, start: start, end: end, popups: calPopups_(reminders, start) };
  }
  if (reminders.length) {
    const start = manilaTime_(task.date, cfg.defaultTime);
    return { kind: 'entry', title: title, description: description, start: start, end: new Date(start.getTime() + CAL_ENTRY_MIN * 60000), popups: calPopups_(reminders, start) };
  }
  return { kind: 'allday', title: title, description: description, start: null, date: noonUtc_(task.date), dateKey: task.date, popups: [] };
}

/** Reminders as minutes before the start, the way Google Calendar takes them. */
function calPopups_(reminders, start) {
  const out = [];
  reminders.forEach(function (r) {
    if (!r) return;
    const m = r.kind === 'at' ? Math.round((start.getTime() - Date.parse(r.at)) / 60000) : Number(r.minutes);
    if (!isFinite(m) || m < 0 || m > CAL_POPUP_MAX) return; // after the start, or earlier than Google allows
    const minutes = Math.max(CAL_POPUP_MIN, Math.round(m));
    if (out.indexOf(minutes) < 0) out.push(minutes);
  });
  return out.sort(function (a, b) { return a - b; }).slice(0, CAL_MAX_POPUPS);
}

function calSetPopups_(event, popups, fresh) {
  if (!fresh) {
    const have = event.getPopupReminders().slice().sort(function (a, b) { return a - b; });
    if (have.join(',') === popups.join(',')) return;
  }
  event.removeAllReminders(); // also drops the calendar's own default alerts
  popups.forEach(function (m) { event.addPopupReminder(m); });
}

/** "Still not done" alerts after a linked task's reminder, while it stays open. */
function calFollowUps_(task, link, cal, cfg, want, now) {
  const f = followSettings_(task, cfg);
  const nowMs = now.getTime();
  const due = want.start
    ? want.popups.map(function (m) { return want.start.getTime() - m * 60000; }).filter(function (t) { return t <= nowMs; })
    : [];
  const base = due.length ? Math.max.apply(null, due) : 0;
  if (!f.enabled || !base) {
    calDeleteFollowUps_(cal, link);
    link.followUpBase = '';
    return;
  }
  const baseIso = new Date(base).toISOString();
  if (link.followUpBase !== baseIso) {
    // The reminder changed (a new time or date): start the follow-ups again
    calDeleteFollowUps_(cal, link);
    link.followUpBase = baseIso;
  }
  let at = base;
  for (let k = 0; k < f.limit; k++) {
    at = calOutOfQuiet_(at + f.minutes * 60000, f);
    if (link.followUps[k]) continue;
    if (at < nowMs) {
      link.followUps[k] = { eventId: '', at: new Date(at).toISOString(), missed: true }; // its time has passed
      continue;
    }
    if (at - nowMs > CAL_FOLLOW_LEAD_MIN * 60000) break; // not yet: a later check adds it
    const start = new Date(at + CAL_POPUP_MIN * 60000); // so the 5-minute alert rings right on time
    const event = cal.createEvent('Still not done: ' + calTitle_(task), start, new Date(start.getTime() + CAL_FOLLOW_EVENT_MIN * 60000),
      { description: 'A follow-up from your Life Dashboard: this task isn’t ticked yet. Ticking it in the app removes these.' });
    try { event.setTag(CAL_TAG, task.id); } catch (err) { /* only a label */ }
    event.removeAllReminders();
    event.addPopupReminder(CAL_POPUP_MIN);
    link.followUps[k] = { eventId: event.getId(), at: new Date(at).toISOString() };
  }
}

function followSettings_(task, cfg) {
  const base = cfg.followUps;
  const own = task.followUp && typeof task.followUp === 'object' ? task.followUp : {};
  const shorter = task.priority === 'high' && base.highMinutes ? base.highMinutes : base.minutes;
  return {
    enabled: own.enabled == null ? base.enabled : Boolean(own.enabled),
    minutes: numberIn_(own.minutes, 5, 1440, shorter),
    limit: numberIn_(own.limit, 1, 5, base.limit),
    quiet: base.quiet,
    quietStart: base.quietStart,
    quietEnd: base.quietEnd,
  };
}

/** A time inside quiet hours (Manila time) moves to when they end — the next morning. */
function calOutOfQuiet_(ms, f) {
  if (!f.quiet) return ms;
  const start = clockMin_(f.quietStart);
  const end = clockMin_(f.quietEnd);
  if (start === end) return ms;
  const whole = Math.floor(ms / 60000);
  const minute = (((whole + MANILA_OFFSET_MIN) % 1440) + 1440) % 1440;
  const quiet = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!quiet) return ms;
  return (whole + ((end - minute + 1440) % 1440)) * 60000;
}

/** The calendar tasks go into: the one chosen in the app, or "Life Dashboard Tasks" (made when create is true). */
function calTarget_(props, cfg, create) {
  const chosen = cfg.calendar.calendarId;
  if (chosen) {
    const cal = calById_(chosen);
    return cal ? { calendar: cal, id: chosen, name: cal.getName(), state: 'ok' } : { calendar: null, id: chosen, name: '', state: 'missing' };
  }
  const saved = props.getProperty('CAL_ID') || '';
  if (saved) {
    const cal = calById_(saved);
    return cal ? { calendar: cal, id: saved, name: cal.getName(), state: 'ok' } : { calendar: null, id: saved, name: CAL_NAME, state: 'missing' };
  }
  if (!create) return { calendar: null, id: '', name: CAL_NAME, state: 'not-created' };
  const cal = CalendarApp.createCalendar(CAL_NAME, { timeZone: SHOWN_TZ, summary: 'Tasks from your Life Dashboard app, put here by its sync script.' });
  props.setProperty('CAL_ID', cal.getId());
  return { calendar: cal, id: cal.getId(), name: cal.getName(), state: 'ok' };
}

function calById_(id) {
  try {
    return CalendarApp.getCalendarById(id) || null;
  } catch (err) {
    if (calNeedsAuth_(err)) throw err;
    return null;
  }
}

/** The event, if it still exists. (Google can return deleted events by id, so it's looked for in the calendar too.) */
function calAlive_(cal, id) {
  let event = null;
  try {
    event = cal.getEventById(id);
  } catch (err) {
    if (calNeedsAuth_(err)) throw err;
    return null;
  }
  if (!event) return null;
  const around = cal.getEvents(new Date(event.getStartTime().getTime() - 60000), new Date(event.getEndTime().getTime() + 60000));
  return around.some(function (e) { return e.getId() === id; }) ? event : null;
}

function calDelete_(cal, id) {
  if (!id) return;
  let event = null;
  try {
    event = cal.getEventById(id);
    if (event) event.deleteEvent();
  } catch (err) {
    if (calNeedsAuth_(err)) throw err; // otherwise it's already gone
  }
}

function calDeleteFollowUps_(cal, link) {
  list_(link.followUps).forEach(function (f) { if (f && f.eventId) calDelete_(cal, f.eventId); });
  link.followUps = [];
}

function calWanted_(task) {
  return Boolean(task.addToCalendar) && /^\d{4}-\d{2}-\d{2}$/.test(String(task.date || '')) && !task.deletedAt;
}

function calTitle_(task) {
  const clean = function (text) { return String(text || '').replace(/\s+/g, ' ').trim(); };
  const title = clean(task.title) || (task.item === 'subtask' ? 'Untitled subtask' : 'Untitled task');
  // A subtask says which task it's part of: "Draft the introduction (Finish STRAMA paper)"
  return (task.item === 'subtask' && clean(task.parentTitle) ? title + ' (' + clean(task.parentTitle) + ')' : title).slice(0, 200);
}

function calDescription_(task, ctx, props) {
  const lines = [task.item === 'subtask'
    ? 'A subtask of “' + String(task.parentTitle || 'a task') + '” from your Life Dashboard to-do list.'
    : 'A task from your Life Dashboard to-do list.'];
  const priority = PRIORITY_NAMES[task.priority];
  if (priority && priority !== 'None') lines.push('Priority: ' + priority);
  const category = ctx.name('taskCategories', task.categoryId);
  if (category) lines.push('Category: ' + category);
  if (task.notes) lines.push('', String(task.notes).slice(0, 1500));
  const url = props.getProperty('APP_URL');
  if (url) lines.push('', 'Open the app: ' + url.replace(/#.*$/, '') + '#/todo');
  lines.push('', 'Change this task in the app: edits made here are replaced.');
  return lines.join('\n');
}

function calNeedsAuth_(err) {
  return /permission|authori[sz]/i.test(String((err && err.message) || err));
}

function calErrorCode_(err) {
  return calNeedsAuth_(err) ? 'calendar-needs-auth' : 'calendar-failed';
}

/** The app's task settings (from the Settings tab), with defaults for anything missing. */
function taskSettings_(ss) {
  let saved = {};
  const sheet = ss.getSheetByName(STORES.settings);
  if (sheet) {
    dataRows_(sheet, HEADER.length).forEach(function (row) {
      if (row[COL.id] !== 'app') return;
      try { saved = (JSON.parse(row[COL.json]) || {}).tasks || {}; } catch (err) { /* keep the defaults */ }
    });
  }
  const cal = saved.calendar || {};
  const fu = saved.followUps || {};
  const d = TASK_DEFAULTS;
  return {
    defaultTime: clockText_(saved.defaultTime) || d.defaultTime,
    calendar: {
      calendarId: typeof cal.calendarId === 'string' ? cal.calendarId : '',
      completed: cal.completed === 'remove' ? 'remove' : 'rename',
    },
    followUps: {
      enabled: fu.enabled == null ? d.followUps.enabled : Boolean(fu.enabled),
      minutes: numberIn_(fu.minutes, 5, 1440, d.followUps.minutes),
      limit: numberIn_(fu.limit, 1, 5, d.followUps.limit),
      quiet: fu.quiet == null ? d.followUps.quiet : Boolean(fu.quiet),
      quietStart: clockText_(fu.quietStart) || d.followUps.quietStart,
      quietEnd: clockText_(fu.quietEnd) || d.followUps.quietEnd,
      highMinutes: numberIn_(fu.highMinutes, 5, 1440, 0),
    },
  };
}

function numberIn_(value, min, max, fallback) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

function clockText_(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : '';
}

function clockMin_(hhmm) {
  const parts = String(hhmm).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

/** "2026-09-27" at "08:15" in Manila time. */
function manilaTime_(dateKey, hhmm) {
  const d = String(dateKey).split('-').map(Number);
  const t = String(hhmm).split(':').map(Number);
  return new Date(Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - MANILA_OFFSET_MIN * 60000);
}

/** Midday on a date: the same calendar day wherever the script's time zone is. */
function noonUtc_(dateKey) {
  const d = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(d[0], d[1] - 1, d[2], 12));
}

function shownDate_(date) {
  return Utilities.formatDate(date, SHOWN_TZ, 'yyyy-MM-dd');
}

/** An all-day event's date, in the time zone Google uses for this script. */
function shownDateOf_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function addDaysKey_(key, n) {
  const d = String(key).split('-').map(Number);
  const x = new Date(Date.UTC(d[0], d[1] - 1, d[2] + n));
  const pad = function (v) { return (v < 10 ? '0' : '') + v; };
  return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
}

/* ---------- Sheet helpers ---------- */

function tabName_(store) {
  return STORES[store] || SCRIPT_STORES[store];
}

function storeSheet_(ss, store) {
  let sheet = ss.getSheetByName(tabName_(store));
  if (!sheet) {
    sheet = ss.insertSheet(tabName_(store));
    const header = LAYOUTS[store] ? HEADER.concat(Object.keys(LAYOUTS[store])) : HEADER;
    ensureSize_(sheet, 1, header.length);
    sheet.getRange(1, 1, 1, header.length).setNumberFormat('@').setValues([header]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function headerOf_(sheet) {
  const width = Math.max(sheet.getLastColumn(), HEADER.length);
  const header = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  for (let c = 0; c < HEADER.length; c++) header[c] = HEADER[c];
  while (header.length > HEADER.length && !header[header.length - 1]) header.pop();
  return header;
}

function dataRows_(sheet, width) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const cols = Math.min(width, sheet.getMaxColumns());
  return sheet.getRange(2, 1, last - 1, cols).getValues().map(function (row) {
    const out = row.map(function (v) { return v === null || v === undefined ? '' : String(v); });
    while (out.length < width) out.push('');
    return out;
  });
}

/**
 * One sheet row: fixed columns, then readable columns. Tabs with a fixed
 * layout (LAYOUTS) keep their columns; on the others the header grows as needed.
 */
function rowFor_(store, record, json, seq, device, header, ctx) {
  const readable = readableFor_(store, record, ctx);
  if (!LAYOUTS[store]) Object.keys(readable).forEach(function (k) { if (header.indexOf(k) < 0) header.push(k); });
  return header.map(function (name, c) {
    switch (c) {
      case COL.id: return record.id;
      case COL.updatedAt: return String(record.updatedAt || '');
      case COL.deletedAt: return record.deletedAt ? String(record.deletedAt) : '';
      case COL.seq: return String(seq);
      case COL.device: return device;
      case COL.json: return json;
      default: return Object.prototype.hasOwnProperty.call(readable, name) ? readable[name] : '';
    }
  });
}

function readable_(record) {
  const out = {};
  Object.keys(record).forEach(function (k) {
    if (HEADER.indexOf(k) >= 0 || k === 'sample') return;
    const v = record[k];
    let text;
    if (v === null || v === undefined) text = '';
    else if (typeof v === 'string') text = v.indexOf('data:') === 0 ? '(image)' : v;
    else if (typeof v !== 'object') text = String(v);
    else if (Array.isArray(v) && v.every(function (x) { return x === null || typeof x !== 'object'; })) text = v.join(', ');
    else if (Array.isArray(v) && v.every(isNamed_)) text = v.map(function (x) { return x.name; }).join(', '); // e.g. a workout's exercises
    else text = JSON.stringify(v);
    out[k] = cellText_(text);
  });
  return out;
}

/** Text for a readable cell: shortened, and never run as a formula. */
function cellText_(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (text.length > TEXT_LIMIT) text = text.slice(0, TEXT_LIMIT - 1) + '…';
  if (text.charAt(0) === '=') text = "'" + text;
  return text;
}

function isNamed_(x) {
  return Boolean(x) && typeof x.name === 'string';
}

function writeRows_(sheet, header, rows, changed) {
  const width = header.length;
  ensureSize_(sheet, rows.length + 1, width);
  sheet.getRange(1, 1, 1, width).setNumberFormat('@').setValues([header]).setFontWeight('bold');
  const indexes = Object.keys(changed).map(Number).sort(function (a, b) { return a - b; });
  let start = 0;
  while (start < indexes.length) {
    let end = start;
    while (end + 1 < indexes.length && indexes[end + 1] === indexes[end] + 1) end++;
    const block = indexes.slice(start, end + 1).map(function (i) { return pad_(rows[i], width); });
    sheet.getRange(indexes[start] + 2, 1, block.length, width).setNumberFormat('@').setValues(block);
    start = end + 1;
  }
}

function pad_(row, width) {
  const out = row.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

function ensureSize_(sheet, rowsNeeded, colsNeeded) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < rowsNeeded) sheet.insertRowsAfter(maxRows, rowsNeeded - maxRows);
  const maxCols = sheet.getMaxColumns();
  if (maxCols < colsNeeded) sheet.insertColumnsAfter(maxCols, colsNeeded - maxCols);
}

function conflictsSheet_(ss) {
  let sheet = ss.getSheetByName(CONFLICTS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CONFLICTS_TAB);
    sheet.getRange(1, 1, 1, CONFLICT_HEADER.length).setValues([CONFLICT_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendConflicts_(ss, rows) {
  const sheet = conflictsSheet_(ss);
  const width = CONFLICT_HEADER.length;
  const start = sheet.getLastRow() + 1;
  ensureSize_(sheet, start + rows.length - 1, width);
  const values = rows.map(function (row) {
    return pad_(row, width).map(function (v) { return String(v).slice(0, MAX_JSON); });
  });
  sheet.getRange(start, 1, values.length, width).setNumberFormat('@').setValues(values);
}

function connectionSheet_(ss, token) {
  let sheet = ss.getSheetByName(CONNECTION_TAB);
  if (!sheet) sheet = ss.insertSheet(CONNECTION_TAB, 0);
  ensureSize_(sheet, 8, 2);
  const savedUrl = String(sheet.getRange(4, 2).getValue() || '');
  sheet.getRange(1, 1, 8, 2).setNumberFormat('@').setValues([
    ['Life Dashboard — sync connection', ''],
    ['', ''],
    ['Secret token', token],
    ['Web app URL', savedUrl.indexOf('https://') === 0 ? savedUrl : '(paste it here after Deploy → New deployment, for safekeeping)'],
    ['', ''],
    ['Keep these private.', 'Together they give access to your Life Dashboard data.'],
    ['Please don’t rename or delete the other tabs.', 'The app stores your data in them.'],
    ['Conflicts tab', 'If one item is changed on two devices, the newest change is kept and the other is saved there.'],
  ]);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.getRange(3, 1, 2, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 560);
}

/* ---------- Small helpers ---------- */

/** Same item apart from its timestamps (e.g. default categories created on two devices). */
function sameContent_(storedJson, record) {
  try {
    return canonicalJson_(JSON.parse(storedJson)) === canonicalJson_(record);
  } catch (err) {
    return false;
  }
}

function canonicalJson_(record) {
  function sorted(v) {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = sorted(v[k]); });
      return out;
    }
    return v;
  }
  const copy = sorted(record);
  delete copy.updatedAt;
  delete copy.createdAt;
  return JSON.stringify(copy);
}

function makeToken_() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I to avoid mix-ups
  let hex = '';
  while (hex.length < 32) {
    const uuid = Utilities.getUuid().replace(/-/g, '');
    hex += uuid.slice(0, 12) + uuid.slice(13, 16) + uuid.slice(17); // skip the fixed UUID digits
  }
  let token = '';
  for (let i = 0; i < 16; i++) token += alphabet.charAt(parseInt(hex.substr(i * 2, 2), 16) % 32);
  return token.match(/.{4}/g).join('-');
}

function normalizeToken_(value) {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function sameToken_(given, expected) {
  const a = normalizeToken_(given);
  const b = normalizeToken_(expected);
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function currentSeq_(props) {
  return Number(props.getProperty('SEQ') || '0');
}

function nextSeq_(props) {
  const seq = currentSeq_(props) + 1;
  props.setProperty('SEQ', String(seq));
  return seq;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/** The current time (the test runner on the Mac can set it). */
function now_() {
  return new Date();
}
