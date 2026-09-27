/* In-memory stand-ins for the Google Apps Script services that apps-script/Code.gs
   uses, so the real script can be tested on a Mac (see run-gas.js).
   New sheets start deliberately small (6 rows × 8 columns) so the script's
   "grow the sheet" code is exercised. Real Sheets throw when a range falls
   outside the sheet, and so does this mock.

   Besides the script's own spreadsheet (__state.sheets), other spreadsheets —
   like a ward logsheet — live in __state.files[id]:
     { name, tz, access: 'edit' | 'view' | 'none', sheets: [{ name, rows, maxRows, maxCols, fmt, protectedCols }] }
   Cell values are strings, numbers or booleans, { __date: ISO } for dates and
   { __f: '=formula', v: value } for formulas. Text typed into a cell that isn't
   formatted as plain text ('@') is turned into a boolean, number or date, like
   Google Sheets does. __state.noAuth = true makes openById fail as if the
   script lacked permission. */

var __state = { sheets: [], props: {}, logs: [], files: {} };

function __load(json) {
  if (json) __state = JSON.parse(json);
  if (!__state.files) __state.files = {};
}
function __dump() { return JSON.stringify(__state); }

function __fail(message) { throw new Error(message); }

var __TZ_HOURS = { 'Asia/Manila': 8, UTC: 0, GMT: 0, 'Etc/GMT': 0, 'America/New_York': -4 };

function __cellKey(r, c) { return r + ',' + c; }

function __isDateLike(text) { return /^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2}(:\d{2})?)?$/.test(text); }

/** Text entered into a cell that isn't plain-text formatted, read the way Sheets would. */
function __parseInput(value, tz) {
  if (typeof value !== 'string') return value;
  var t = value.trim();
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (__isDateLike(t)) {
    var p = t.split(/[- :]/).map(Number);
    var hours = __TZ_HOURS[tz] == null ? 8 : __TZ_HOURS[tz];
    return { __date: new Date(Date.UTC(p[0], p[1] - 1, p[2], (p[3] || 0) - hours, p[4] || 0, p[5] || 0)).toISOString() };
  }
  if (t.charAt(0) === '=') return { __f: t, v: '#ERROR!' };
  return value;
}

function __plain(v) {
  if (v && typeof v === 'object' && v.__date) return new Date(v.__date);
  if (v && typeof v === 'object' && v.__f) return v.v;
  return v === undefined || v === null ? '' : v;
}

function __display(v, tz) {
  var p = __plain(v);
  if (p instanceof Date) return Utilities.formatDate(p, tz || 'Asia/Manila', 'M/d/yyyy H:mm:ss');
  if (p === true) return 'TRUE';
  if (p === false) return 'FALSE';
  return String(p);
}

function MockRange(sheet, row, col, numRows, numCols, file) {
  if (!(row >= 1 && col >= 1 && numRows >= 1 && numCols >= 1)) __fail('Invalid range arguments');
  if (row + numRows - 1 > sheet.maxRows || col + numCols - 1 > sheet.maxCols) {
    __fail('The coordinates of the range are outside the dimensions of the sheet.');
  }
  this.s = sheet; this.r = row; this.c = col; this.nr = numRows; this.nc = numCols; this.file = file || null;
}
MockRange.prototype.__cells = function (fn) {
  var out = [];
  for (var i = 0; i < this.nr; i++) {
    var src = this.s.rows[this.r - 1 + i] || [];
    var line = [];
    for (var j = 0; j < this.nc; j++) line.push(fn(src[this.c - 1 + j], this.r + i, this.c + j));
    out.push(line);
  }
  return out;
};
MockRange.prototype.__tz = function () { return (this.file && this.file.tz) || 'Asia/Manila'; };
MockRange.prototype.__checkEdit = function () {
  if (!this.file) return;
  if (this.file.access !== 'edit') __fail('You do not have permission to access the requested document.');
  var cols = this.s.protectedCols || [];
  for (var c = this.c; c < this.c + this.nc; c++) {
    if (cols.indexOf(c) >= 0) __fail('You are trying to edit a protected cell or object. Please contact the spreadsheet owner to remove protection if you need to edit.');
  }
};
MockRange.prototype.getValues = function () { return this.__cells(function (v) { return __plain(v); }); };
MockRange.prototype.getValue = function () { return this.getValues()[0][0]; };
MockRange.prototype.getDisplayValues = function () {
  var tz = this.__tz();
  return this.__cells(function (v) { return __display(v, tz); });
};
MockRange.prototype.getDisplayValue = function () { return this.getDisplayValues()[0][0]; };
MockRange.prototype.getFormulas = function () {
  return this.__cells(function (v) { return v && typeof v === 'object' && v.__f ? v.__f : ''; });
};
MockRange.prototype.getFormula = function () { return this.getFormulas()[0][0]; };
MockRange.prototype.setValues = function (values) {
  this.__checkEdit();
  if (!Array.isArray(values) || values.length !== this.nr) __fail('The number of rows in the data does not match the number of rows in the range.');
  var fmt = this.s.fmt || (this.s.fmt = {});
  var tz = this.__tz();
  for (var i = 0; i < this.nr; i++) {
    if (!Array.isArray(values[i]) || values[i].length !== this.nc) __fail('The number of columns in the data does not match the number of columns in the range.');
    var target = this.s.rows[this.r - 1 + i] || (this.s.rows[this.r - 1 + i] = []);
    for (var j = 0; j < this.nc; j++) {
      var v = values[i][j];
      if (v instanceof Date) v = { __date: v.toISOString() };
      else if (fmt[__cellKey(this.r + i, this.c + j)] !== '@') v = __parseInput(v, tz);
      target[this.c - 1 + j] = v;
    }
  }
  return this;
};
MockRange.prototype.setValue = function (value) {
  var values = [];
  for (var i = 0; i < this.nr; i++) {
    var line = [];
    for (var j = 0; j < this.nc; j++) line.push(value);
    values.push(line);
  }
  return this.setValues(values);
};
MockRange.prototype.setNumberFormat = function (format) {
  var fmt = this.s.fmt || (this.s.fmt = {});
  for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) fmt[__cellKey(this.r + i, this.c + j)] = format;
  return this;
};
MockRange.prototype.copyFormatToRange = function (sheet, column, columnEnd, row, rowEnd) {
  var fmt = this.s.fmt || (this.s.fmt = {});
  var target = sheet.d || this.s;
  var tfmt = target.fmt || (target.fmt = {});
  var source = fmt[__cellKey(this.r, this.c)];
  for (var r = row; r <= rowEnd; r++) for (var c = column; c <= columnEnd; c++) {
    if (source === undefined) delete tfmt[__cellKey(r, c)]; else tfmt[__cellKey(r, c)] = source;
  }
  return this;
};
MockRange.prototype.canEdit = function () {
  if (!this.file) return true;
  try { this.__checkEdit(); return true; } catch (err) { return false; }
};
MockRange.prototype.setFontWeight = function () { return this; };
MockRange.prototype.setFontSize = function () { return this; };
MockRange.prototype.setWrap = function () { return this; };

function MockSheet(data, file) { this.d = data; this.file = file || null; }
MockSheet.prototype.getName = function () { return this.d.name; };
MockSheet.prototype.getMaxRows = function () { return this.d.maxRows; };
MockSheet.prototype.getMaxColumns = function () { return this.d.maxCols; };
MockSheet.prototype.getLastRow = function () {
  for (var i = this.d.rows.length - 1; i >= 0; i--) {
    var row = this.d.rows[i] || [];
    for (var j = 0; j < row.length; j++) if (row[j] !== '' && row[j] !== undefined && row[j] !== null) return i + 1;
  }
  return 0;
};
MockSheet.prototype.getLastColumn = function () {
  var last = 0;
  this.d.rows.forEach(function (row) {
    (row || []).forEach(function (v, j) { if (v !== '' && v !== undefined && v !== null) last = Math.max(last, j + 1); });
  });
  return last;
};
MockSheet.prototype.getRange = function (row, col, numRows, numCols) {
  return new MockRange(this.d, row, col, numRows === undefined ? 1 : numRows, numCols === undefined ? 1 : numCols, this.file);
};
MockSheet.prototype.insertRowsAfter = function (after, count) {
  var blanks = [];
  for (var i = 0; i < count; i++) blanks.push([]);
  this.d.rows.splice.apply(this.d.rows, [after, 0].concat(blanks));
  this.d.maxRows += count;
  return this;
};
MockSheet.prototype.insertColumnsAfter = function (after, count) {
  if (this.file && this.file.access !== 'edit') __fail('You do not have permission to access the requested document.');
  this.d.maxCols += count;
  return this;
};
MockSheet.prototype.setFrozenRows = function () { return this; };
MockSheet.prototype.setColumnWidth = function () { return this; };

/** A spreadsheet: the script's own (file = null) or another one from __state.files. */
function MockSpreadsheet(getSheets, file, id) { this.list = getSheets; this.file = file; this.id = id; }
MockSpreadsheet.prototype.getSheets = function () {
  var file = this.file;
  return this.list().map(function (s) { return new MockSheet(s, file); });
};
MockSpreadsheet.prototype.getSheetByName = function (name) {
  var found = this.list().filter(function (s) { return s.name === name; })[0];
  return found ? new MockSheet(found, this.file) : null;
};
MockSpreadsheet.prototype.insertSheet = function (name, index) {
  if (this.getSheetByName(name)) __fail('A sheet with the name "' + name + '" already exists.');
  var data = { name: name, rows: [], maxRows: 6, maxCols: 8 };
  var list = this.list();
  if (typeof index === 'number') list.splice(index, 0, data); else list.push(data);
  return new MockSheet(data, this.file);
};
MockSpreadsheet.prototype.deleteSheet = function (sheet) {
  var list = this.list();
  var i = list.indexOf(sheet.d);
  if (i >= 0) list.splice(i, 1);
};
MockSpreadsheet.prototype.getName = function () { return this.file ? this.file.name : 'Life Dashboard Data'; };
MockSpreadsheet.prototype.getId = function () { return this.id || 'SCRIPT-SPREADSHEET'; };
MockSpreadsheet.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/' + this.getId() + '/edit'; };
MockSpreadsheet.prototype.setSpreadsheetTimeZone = function (tz) { if (this.file) this.file.tz = tz; };

var __spreadsheet = new MockSpreadsheet(function () { return __state.sheets; }, null, null);

function __newId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var id = '1';
  for (var i = 0; i < 43; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

var SpreadsheetApp = {
  getActiveSpreadsheet: function () { return __spreadsheet; },
  openById: function (id) {
    if (__state.noAuth) __fail('You do not have permission to call SpreadsheetApp.openById. Required permissions: https://www.googleapis.com/auth/spreadsheets');
    var file = __state.files[id];
    if (!file) __fail('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
    if (file.access === 'none') __fail('You do not have permission to access the requested document.');
    return new MockSpreadsheet(function () { return file.sheets; }, file, id);
  },
  create: function (name) {
    if (__state.noAuth) __fail('You do not have permission to call SpreadsheetApp.create. Required permissions: https://www.googleapis.com/auth/spreadsheets');
    var id = __newId();
    __state.files[id] = { name: name, tz: 'America/New_York', access: 'edit', sheets: [{ name: 'Sheet1', rows: [], maxRows: 1000, maxCols: 26 }] };
    return SpreadsheetApp.openById(id);
  },
  flush: function () {},
  getUi: function () {
    var menu = { addItem: function () { return menu; }, addToUi: function () { return menu; } };
    return {
      createMenu: function () { return menu; },
      alert: function (message) { __state.logs.push('ALERT: ' + message); },
    };
  },
};

var PropertiesService = {
  getScriptProperties: function () {
    return {
      getProperty: function (key) { return Object.prototype.hasOwnProperty.call(__state.props, key) ? __state.props[key] : null; },
      setProperty: function (key, value) { __state.props[key] = String(value); return this; },
    };
  },
};

var LockService = {
  getScriptLock: function () {
    return { waitLock: function () {}, releaseLock: function () {} };
  },
};

var ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: function (text) {
    return { content: text, setMimeType: function () { return this; }, getContent: function () { return this.content; } };
  },
};

var Utilities = {
  getUuid: function () {
    var hex = '';
    for (var i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
    hex = hex.slice(0, 12) + '4' + hex.slice(13, 16) + '8' + hex.slice(17);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  },
  /** Supports the patterns the script uses (yyyy MM dd HH mm ss, and M d H) for a few fixed-offset time zones. */
  formatDate: function (date, tz, pattern) {
    var hours = __TZ_HOURS[tz];
    if (hours == null) __fail('Unknown time zone in mock: ' + tz);
    var d = new Date(date.getTime() + hours * 3600e3);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var parts = {
      yyyy: String(d.getUTCFullYear()), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
      HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()),
      M: String(d.getUTCMonth() + 1), d: String(d.getUTCDate()), H: String(d.getUTCHours()),
    };
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss|M|d|H/g, function (token) { return parts[token]; });
  },
};

var Logger = { log: function (message) { __state.logs.push(String(message)); } };
