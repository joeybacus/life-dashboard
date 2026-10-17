/**
 * Life Dashboard — voucher codes.
 *
 * A separate, small Google Sheet (not your sync sheet) that decides who may open the app.
 *
 * Setup (once, about 10 minutes):
 *   1. Create a new blank Google Sheet, e.g. "Life Dashboard Vouchers".
 *   2. Extensions → Apps Script. Delete what's there, paste this whole file, click Save.
 *   3. Choose "setup" in the toolbar and click Run (allow access). The Codes tab appears.
 *   4. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the Web app URL.
 *   5. In the app's preview on your Mac: Settings → Voucher codes → paste the URL.
 *
 * Every day use:
 *   - Type codes into the Codes tab: column B = 1 week, column C = 1 month, column D = 1 year.
 *     Column A is for you (a name or a note). Use codes that are hard to guess (8+ letters and digits).
 *   - Column E: the customer's own Google Sheet (the link they sync their Life Dashboard to).
 *     With a Sheet there, the row's codes work only in a Life Dashboard synced to that Sheet — on any
 *     of their devices. A device that isn't synced yet gets 3 days to connect it.
 *     With column E empty, a code works on the first device that uses it, and on no other.
 *     To move such a code to a new phone, clear its "Device IDs" cell in the Used tab.
 *   - A code starts counting the first time someone types it into the app. The "Used" tab then
 *     shows when it started, its last day, and how many devices use it.
 *   - To stop a code early, delete it from the Codes tab.
 *   - To extend a code, change its "Last day" in the Used tab (or sell them a new code).
 *
 * After changing this code later: Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.
 * (Don't create a "New deployment" — that gives a new URL.)
 */

var VOUCHER_SCRIPT_VERSION = 1;
var CODES_TAB = 'Codes';
var USED_TAB = 'Used';
var LENGTHS = [
  { column: 2, label: '1 week', days: 7 },
  { column: 3, label: '1 month', months: 1 },
  { column: 4, label: '1 year', months: 12 },
];
var USED_HEADERS = ['Code', 'Length', 'First used', 'Last day', 'Last seen', 'Devices', 'Device IDs'];
var GRACE_DAYS = 3; // a device not synced yet may use a Sheet-linked code this many days

function now_() { return new Date(); }

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var codes = ss.getSheetByName(CODES_TAB) || ss.insertSheet(CODES_TAB, 0);
  if (!String(codes.getRange(1, 1).getValue())) {
    codes.getRange(1, 1, 1, 5).setValues([['Name or note', '1 week', '1 month', '1 year', 'Their Google Sheet (link)']]);
    codes.getRange(1, 1, 1, 5).setFontWeight('bold');
    codes.setFrozenRows(1);
    codes.getRange(2, 2, codes.getMaxRows() - 1, 3).setNumberFormat('@'); // codes stay as typed (no number or date guessing)
  }
  var used = ss.getSheetByName(USED_TAB) || ss.insertSheet(USED_TAB);
  if (!String(used.getRange(1, 1).getValue())) {
    used.getRange(1, 1, 1, USED_HEADERS.length).setValues([USED_HEADERS]);
    used.getRange(1, 1, 1, USED_HEADERS.length).setFontWeight('bold');
    used.setFrozenRows(1);
    used.getRange(2, 1, used.getMaxRows() - 1, 5).setNumberFormat('@');
  }
  return 'ready';
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, app: 'life-dashboard-vouchers', version: VOUCHER_SCRIPT_VERSION });
}

function doPost(e) {
  var request;
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad-request' });
  }
  if (request.action !== 'voucher') return json_({ ok: false, error: 'unknown-action' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return json_(checkVoucher_(String(request.code || ''), String(request.deviceId || '').replace(/[\s@]/g, '').slice(0, 40),
      String(request.sheetId || '').trim()));
  } finally {
    lock.releaseLock();
  }
}

function clean_(code) {
  return String(code).toUpperCase().replace(/[\s-]/g, '');
}

/** 'yyyy-MM-dd' for a date in the sheet's time zone, or for a cell that holds a date or that text. */
function dayKey_(value, tz) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  var text = String(value || '').trim();
  var m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // 11/30/2026
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return '';
}

/** The last day of a code that starts on `start` ('yyyy-MM-dd'). */
function lastDay_(start, length) {
  var p = start.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  if (length.days) d.setUTCDate(d.getUTCDate() + length.days);
  else d.setUTCMonth(d.getUTCMonth() + length.months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A Google Sheet's ID, from its link (or the ID itself). */
function sheetIdFrom_(text) {
  var t = String(text || '').trim();
  var m = t.match(/\/d\/([A-Za-z0-9_-]{20,})/) || t.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : '';
}

/** Where a code is sold: { length, sheetId } (sheetId '' when column E is empty), or null when it isn't there. */
function findCode_(ss, code) {
  var sheet = ss.getSheetByName(CODES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  for (var r = 0; r < values.length; r++) {
    for (var i = 0; i < LENGTHS.length; i++) {
      if (clean_(values[r][LENGTHS[i].column - 1]) === code) return { length: LENGTHS[i], sheetId: sheetIdFrom_(values[r][4]) };
    }
  }
  return null;
}

function daysBetween_(a, b) {
  var p = a.split('-').map(Number);
  var q = b.split('-').map(Number);
  return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 864e5);
}

/**
 * Answers: { valid: true, ends, length, needsSheet?, graceEnds? } or
 * { valid: false, reason: 'unknown' | 'expired' | 'in-use' | 'other-sheet' | 'needs-sheet', ends? }.
 */
function checkVoucher_(raw, deviceId, sheetId) {
  var code = clean_(raw);
  if (code.length < 4) return { ok: true, valid: false, reason: 'unknown' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var today = dayKey_(now_(), tz);
  var sold = findCode_(ss, code);
  if (!sold) return { ok: true, valid: false, reason: 'unknown' }; // never sold, or deleted to stop it
  var length = sold.length;

  var used = ss.getSheetByName(USED_TAB) || (setup(), ss.getSheetByName(USED_TAB));
  var rows = used.getLastRow() > 1 ? used.getRange(2, 1, used.getLastRow() - 1, USED_HEADERS.length).getValues() : [];
  var row = -1;
  for (var r = 0; r < rows.length; r++) {
    if (clean_(rows[r][0]) === code) { row = r; break; }
  }

  // Devices that used it, with the day each was first seen: "id@yyyy-MM-dd id@yyyy-MM-dd"
  var devices = row === -1 ? [] : String(rows[row][6] || '').split(/\s+/).filter(String).map(function (t) {
    var parts = t.split('@');
    return { id: parts[0], since: parts[1] || today };
  });
  var mine = null;
  for (var d = 0; d < devices.length; d++) if (devices[d].id === deviceId) mine = devices[d];

  // Who may use it
  var answer;
  if (sold.sheetId) {
    if (sheetId && sheetId !== sold.sheetId) return { ok: true, valid: false, reason: 'other-sheet' };
    if (!sheetId) {
      var since = mine ? mine.since : today;
      var graceEnds = lastDay_(since, { days: GRACE_DAYS });
      if (daysBetween_(since, today) >= GRACE_DAYS) return { ok: true, valid: false, reason: 'needs-sheet' };
      answer = { needsSheet: true, graceEnds: graceEnds };
    }
  } else if (devices.length && !mine) {
    return { ok: true, valid: false, reason: 'in-use' };
  }
  if (deviceId && !mine) devices.push({ id: deviceId, since: today });
  var deviceText = devices.map(function (x) { return x.id + '@' + x.since; }).join(' ');

  var ends;
  if (row === -1) {
    ends = lastDay_(today, length);
    var next = used.getLastRow() + 1;
    if (next > used.getMaxRows()) {
      used.insertRowsAfter(used.getMaxRows(), 100);
      used.getRange(next, 1, 100, 5).setNumberFormat('@');
    }
    used.getRange(next, 1, 1, USED_HEADERS.length).setValues([[code, length.label, today, ends, today, devices.length, deviceText]]);
  } else {
    // The Last day cell is yours to change (to extend a code); an empty or unreadable one is worked out again
    ends = dayKey_(rows[row][3], tz) || lastDay_(dayKey_(rows[row][2], tz) || today, length);
    used.getRange(row + 2, 4, 1, 4).setValues([[ends, today, devices.length, deviceText]]);
  }
  if (today > ends) return { ok: true, valid: false, reason: 'expired', ends: ends };
  var result = { ok: true, valid: true, ends: ends, length: length.label };
  if (answer) { result.needsSheet = true; result.graceEnds = answer.graceEnds; }
  return result;
}
