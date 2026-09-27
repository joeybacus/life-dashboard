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
 * The same script also reads and updates your ward logsheet for the app's
 * Ward Patients screen (Neurology tab) — see "Ward Patients" further down.
 */

const PROTOCOL = 1;        // how the app and this script talk (changes rarely)
const SCRIPT_VERSION = 4;  // 2: Exercises and Workout templates tabs · 3: Ward Patients · 4: edit lab results

// App data → tab name. Please don't rename or delete these tabs.
const STORES = {
  profile: 'Profile',
  settings: 'Settings',
  tasks: 'Tasks',
  taskCategories: 'Task categories',
  workouts: 'Workouts',
  exercises: 'Exercises',
  templates: 'Workout templates',
  bodyMeasurements: 'Body measurements',
};

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
  Object.keys(STORES).forEach(function (store) { storeSheet_(ss, store); });
  conflictsSheet_(ss);
  connectionSheet_(ss, token);

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

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

  Object.keys(byStore).forEach(function (store) {
    const sheet = storeSheet_(ss, store);
    const header = headerOf_(sheet);
    const rows = dataRows_(sheet, header.length);
    const rowById = {};
    rows.forEach(function (row, i) { if (row[COL.id]) rowById[row[COL.id]] = i; });
    const changed = {};

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
        rows.push(rowFor_(record, json, seq, device, header));
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
        rows[i] = rowFor_(record, json, seq, device, header);
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
  Object.keys(STORES).forEach(function (store) {
    const sheet = ss.getSheetByName(STORES[store]);
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
 * Reads your ward logsheet — any Google Sheet this Google account can open —
 * and saves rounds and recommendations back to it. The app sends the
 * logsheet's ID with each request; this script doesn't keep it.
 *
 * Logsheet layout (patients from row 2; rows without a name are ignored):
 *   A Name · B Hospital Number · C Laboratory Results · D Recommendations
 *   E Rounded · F Rounds Start · G Rounds End  (headings added by the app, only
 *   if E1:G1 are empty — if they hold something else, nothing is written there)
 *
 * Safety rules: never writes to columns A and B (names and hospital numbers),
 * never adds, deletes or moves rows. Lab results (C) and recommendations (D)
 * are written only when you edit them in the app. Before every write it finds
 * the patient's row again by hospital
 * number (rows may have moved) and checks the cell still holds what the app
 * last saw; if someone changed it, it reports both versions instead of
 * overwriting. Times are written as text in Manila time: "2026-09-27 08:15".
 */

const WARD_HEADERS = ['Rounded', 'Rounds Start', 'Rounds End'];
const WARD_TZ = 'Asia/Manila';
const WARD_TIME_FORMAT = 'yyyy-MM-dd HH:mm';
const WARD_COL = { C: 3, D: 4, E: 5, F: 6, G: 7 };
const WARD_MAX_ROWS = 2000;
const WARD_MAX_TEXT = 20000;   // characters in one lab result or recommendation
const WARD_MAX_WRITES = 100;   // per request

const WARD_ACTIONS = {
  wardCheck: wardCheck_,
  wardSync: wardSync_,
  wardCreateTest: wardCreateTest_,
};

/** Check a logsheet link: can it be opened, does the tab exist, are E1:G1 free? */
function wardCheck_(req) {
  const opened = wardOpen_(req);
  if (opened.error) return opened;
  const headers = wardHeaders_(opened.sheet);
  return {
    ok: true,
    version: SCRIPT_VERSION,
    title: opened.ss.getName(),
    tab: opened.sheet.getName(),
    tabs: opened.tabs,
    headers: headers,
    canEdit: wardCanEdit_(opened.sheet),
    patients: wardRead_(opened.sheet, headers).rows.length,
  };
}

/**
 * Save the app's changes (if any), then send back the whole list.
 *   writes:      [{ id, hn, expect: { C | D | E, F, G }, set: { C | D | E, F, G }, quiet }]
 *   claim:       add the E–G headings if E1:G1 are empty
 *   resetBefore: "YYYY-MM-DD" — untick patients last rounded before that day (Manila)
 */
function wardSync_(req) {
  const opened = wardOpen_(req);
  if (opened.error) return opened;
  const sheet = opened.sheet;
  const writes = Array.isArray(req.writes) ? req.writes.slice(0, WARD_MAX_WRITES) : [];
  const resetBefore = /^\d{4}-\d{2}-\d{2}$/.test(String(req.resetBefore || '')) ? String(req.resetBefore) : '';
  const out = { ok: true, version: SCRIPT_VERSION, title: opened.ss.getName(), tab: sheet.getName(), results: {}, reset: [], claimed: false };

  let headers = wardHeaders_(sheet);
  const wantsRounds = Boolean(req.claim) || writes.some(function (w) { return w && wardTouchesRounds_(w.set); });
  const claimable = headers.state === 'empty' || headers.state === 'partial';
  if (writes.length || resetBefore || (wantsRounds && claimable)) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(25000);
    } catch (err) {
      return { ok: false, error: 'busy' };
    }
    try {
      headers = wardHeaders_(sheet); // again, now that no other request is writing
      let claimError = '';
      if (wantsRounds && (headers.state === 'empty' || headers.state === 'partial')) {
        claimError = wardClaimHeaders_(sheet);
        if (!claimError) {
          out.claimed = true;
          headers = wardHeaders_(sheet);
        }
      }
      if (writes.length) out.results = wardApplyWrites_(sheet, writes, headers, claimError);
      if (resetBefore && headers.state === 'ours') out.reset = wardResetStale_(sheet, resetBefore);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }

  const read = wardRead_(sheet, headers);
  out.headers = headers;
  out.canEdit = wardCanEdit_(sheet);
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
function wardHeaders_(sheet) {
  const width = Math.max(0, Math.min(3, sheet.getMaxColumns() - 4));
  const shown = width ? sheet.getRange(1, 5, 1, width).getDisplayValues()[0] : [];
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
      const below = sheet.getRange(2, 5, Math.min(last - 1, WARD_MAX_ROWS), width).getDisplayValues();
      dataBelow = below.some(function (row) { return free.some(function (i) { return String(row[i]).trim() !== ''; }); });
    }
    if (dataBelow) state = 'taken';
  }
  return { state: state, values: values, dataBelow: dataBelow };
}

/** Add the missing E–G headings (styled like D1). Returns '' or an error code. */
function wardClaimHeaders_(sheet) {
  try {
    const cols = sheet.getMaxColumns();
    if (cols < 7) sheet.insertColumnsAfter(cols, 7 - cols);
    const range = sheet.getRange(1, 5, 1, 3);
    const current = range.getDisplayValues()[0];
    const next = WARD_HEADERS.map(function (h, i) { return String(current[i]).trim() ? current[i] : h; });
    sheet.getRange(1, 4).copyFormatToRange(sheet, 5, 7, 1, 1);
    range.setNumberFormat('@').setValues([next]);
    return '';
  } catch (err) {
    return wardWriteError_(err);
  }
}

/** Patients from row 2 on. E–G are only read when they hold our headings. */
function wardRead_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  const count = Math.min(Math.max(0, lastRow - 1), WARD_MAX_ROWS);
  const rows = [];
  if (count) {
    const width = Math.min(7, sheet.getMaxColumns());
    const shown = sheet.getRange(2, 1, count, width).getDisplayValues();
    const raw = headers.state === 'ours' ? sheet.getRange(2, 5, count, 3).getValues() : null;
    for (let i = 0; i < count; i++) {
      const name = String(shown[i][0] == null ? '' : shown[i][0]).trim();
      if (!name) continue;
      const item = { row: i + 2, name: name, hn: String(shown[i][1] == null ? '' : shown[i][1]).trim(), labs: wardText_(shown[i][2]), recs: wardText_(shown[i][3]) };
      if (raw) {
        item.rounded = wardBool_(raw[i][0]);
        item.start = wardTime_(raw[i][1], shown[i][5]);
        item.end = wardTime_(raw[i][2], shown[i][6]);
      }
      rows.push(item);
    }
  }
  return { rows: rows, truncated: lastRow - 1 > WARD_MAX_ROWS };
}

function wardApplyWrites_(sheet, writes, headers, claimError) {
  const last = sheet.getLastRow();
  const keys = last >= 2
    ? sheet.getRange(2, 1, Math.min(last - 1, WARD_MAX_ROWS), 2).getDisplayValues().map(function (r) {
      return String(r[0]).trim() ? wardKey_(r[1]) : ''; // rows without a name don't count
    })
    : [];
  const results = {};
  writes.forEach(function (w) {
    const id = String((w && w.id) || '');
    if (!id || results[id]) return;
    results[id] = wardWriteOne_(sheet, w, keys, headers, claimError);
  });
  return results;
}

function wardWriteOne_(sheet, w, keys, headers, claimError) {
  const set = wardCells_(w.set, true);
  const expect = wardCells_(w.expect, false);
  const cols = set ? Object.keys(set) : [];
  const key = wardKey_(w.hn);
  if (!set || !expect || !cols.length || !key) return { status: 'invalid' };
  if (wardTouchesRounds_(set) && headers.state !== 'ours') {
    return { status: headers.state === 'taken' ? 'headers-taken' : claimError || 'headers-taken' };
  }

  // Find the patient again: rows may have been sorted or moved since the app loaded them
  const rows = [];
  keys.forEach(function (k, i) { if (k === key) rows.push(i + 2); });
  if (!rows.length) return { status: 'not-found' };
  if (rows.length > 1) return { status: 'duplicate' };
  const row = rows[0];

  const width = Math.min(5, sheet.getMaxColumns() - 2); // columns C to G
  if (width < 1) return { status: 'invalid' };
  const range = sheet.getRange(row, 3, 1, width);
  const formulas = range.getFormulas()[0];
  if (cols.some(function (c) { return formulas[WARD_COL[c] - 3]; })) return { status: 'formula', row: row };
  const shown = range.getDisplayValues()[0];
  const raw = range.getValues()[0];
  const current = {
    C: wardText_(shown[0]), D: wardText_(shown[1]), E: wardBool_(raw[2]), F: wardTime_(raw[3], shown[3]), G: wardTime_(raw[4], shown[4]),
  };
  const same = function (c, a, b) { return c === 'E' ? Boolean(a) === Boolean(b) : String(a == null ? '' : a) === String(b == null ? '' : b); };

  if (cols.every(function (c) { return same(c, current[c], set[c]); })) return { status: 'same', row: row };
  const unchanged = Object.keys(expect).every(function (c) { return same(c, current[c], expect[c]); });
  if (!unchanged) {
    if (w.quiet) return { status: 'skipped', row: row };
    const shownNow = {};
    Object.keys(expect).concat(cols).forEach(function (c) { shownNow[c] = current[c]; });
    return { status: 'conflict', row: row, current: shownNow };
  }
  try {
    cols.forEach(function (c) {
      const cell = sheet.getRange(row, WARD_COL[c]);
      if (c === 'E') cell.setValue(set.E);
      else cell.setNumberFormat('@').setValue(set[c]); // text, so Sheets never turns it into a date or formula
    });
  } catch (err) {
    return { status: wardWriteError_(err), row: row };
  }
  return { status: 'ok', row: row };
}

/** Untick patients whose tick is from an earlier day (Manila time). F and G keep the last rounds times. */
function wardResetStale_(sheet, before) {
  const last = sheet.getLastRow();
  const count = Math.min(Math.max(0, last - 1), WARD_MAX_ROWS);
  if (!count) return [];
  const names = sheet.getRange(2, 1, count, 2).getDisplayValues();
  const range = sheet.getRange(2, 5, count, 3);
  const raw = range.getValues();
  const shown = range.getDisplayValues();
  const formulas = sheet.getRange(2, 5, count, 1).getFormulas();
  const reset = [];
  for (let i = 0; i < count; i++) {
    if (!String(names[i][0]).trim() || !wardBool_(raw[i][0]) || formulas[i][0]) continue;
    const start = wardTime_(raw[i][1], shown[i][1]);
    const end = wardTime_(raw[i][2], shown[i][2]);
    const day = (end || start).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= before) continue; // no date: leave it alone
    try {
      sheet.getRange(i + 2, 5).setValue(false);
    } catch (err) {
      break; // can't edit the logsheet: try again another time
    }
    reset.push({ hn: String(names[i][1]).trim(), start: start, end: end });
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

/** Check the cells of one write. Only C–G are ever accepted, never A or B. */
function wardCells_(cells, forWriting) {
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return null;
  const out = {};
  const ok = Object.keys(cells).every(function (c) {
    const v = cells[c];
    if (c === 'C' || c === 'D') {
      if (typeof v !== 'string' || v.length > WARD_MAX_TEXT) return false;
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

function wardTouchesRounds_(cells) {
  return Boolean(cells) && typeof cells === 'object' && ['E', 'F', 'G'].some(function (c) { return c in cells; });
}

/** Hospital numbers match ignoring capitals and extra spaces. */
function wardKey_(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Free text as shown in the sheet: line breaks kept, trailing blank space dropped. */
function wardText_(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
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

/* ---------- Sheet helpers ---------- */

function storeSheet_(ss, store) {
  let sheet = ss.getSheetByName(STORES[store]);
  if (!sheet) {
    sheet = ss.insertSheet(STORES[store]);
    sheet.getRange(1, 1, 1, HEADER.length).setNumberFormat('@').setValues([HEADER]).setFontWeight('bold');
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
  return sheet.getRange(2, 1, last - 1, width).getValues().map(function (row) {
    return row.map(function (v) { return v === null || v === undefined ? '' : String(v); });
  });
}

/** One sheet row: fixed columns, then readable columns (the header grows as needed). */
function rowFor_(record, json, seq, device, header) {
  const readable = readable_(record);
  Object.keys(readable).forEach(function (k) { if (header.indexOf(k) < 0) header.push(k); });
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
    if (text.length > TEXT_LIMIT) text = text.slice(0, TEXT_LIMIT - 1) + '…';
    if (text.charAt(0) === '=') text = "'" + text; // show as text, never run as a formula
    out[k] = text;
  });
  return out;
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
