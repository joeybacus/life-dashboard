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
 */

const PROTOCOL = 1;

// App data → tab name. Please don't rename or delete these tabs.
const STORES = {
  profile: 'Profile',
  settings: 'Settings',
  tasks: 'Tasks',
  taskCategories: 'Task categories',
  workouts: 'Workouts',
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
  return json_({ ok: true, app: 'life-dashboard-sync', protocol: PROTOCOL, message: 'Life Dashboard sync is running.' });
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

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (req.action === 'ping') return json_({ ok: true, protocol: PROTOCOL, seq: currentSeq_(props) });
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
  return { ok: true, seq: seq, results: results };
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
  return { ok: true, seq: seq, changes: changes };
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
    else text = JSON.stringify(v);
    if (text.length > TEXT_LIMIT) text = text.slice(0, TEXT_LIMIT - 1) + '…';
    if (text.charAt(0) === '=') text = "'" + text; // show as text, never run as a formula
    out[k] = text;
  });
  return out;
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
