/* In-memory stand-ins for the Google Apps Script services that apps-script/Code.gs
   uses, so the real script can be tested on a Mac (see run-gas.js).
   New sheets start deliberately small (6 rows × 8 columns) so the script's
   "grow the sheet" code is exercised. Real Sheets throw when a range falls
   outside the sheet, and so does this mock.

   Besides the script's own spreadsheet (__state.sheets), other spreadsheets —
   like a ward logsheet — live in __state.files[id]:
     { name, tz, access: 'edit' | 'view' | 'none', sheets: [{ name, rows, maxRows, maxCols, fmt, protectedCols, validation }] }
   validation: { <column number>: [allowed values] } — a dropdown that rejects anything else (case matters, like
   "Reject input" in Sheets); like Sheets, the rejection only surfaces when the changes are flushed.
   Cell values are strings, numbers or booleans, { __date: ISO } for dates and
   { __f: '=formula', v: value } for formulas. Text typed into a cell that isn't
   formatted as plain text ('@') is turned into a boolean, number or date, like
   Google Sheets does. __state.noAuth = true makes openById fail as if the
   script lacked permission.

   Google Calendar: __state.calendars[id] = { id, name, tz, deleted, events: { eventId: event } },
   where an event is { id, title, description, start, end (ISO), allDay, date ('YYYY-MM-DD'),
   popups: [minutes], tags: {}, deleted }. Like the real thing, getEventById still returns a
   deleted event (getEvents doesn't list it), new events get the calendar's default alert
   (30 minutes before timed events), and a pop-up alert must be 5 minutes to 4 weeks before.
   __state.calNoAuth = true makes Calendar calls fail as if permission was never given.
   Timers (ScriptApp triggers) live in __state.triggers; __state.now (ISO) sets the script's
   clock through its now_() (see run-gas.js). */

var __state = { sheets: [], props: {}, logs: [], files: {}, calendars: {}, triggers: [] };

function __load(json) {
  if (json) __state = JSON.parse(json);
  if (!__state.files) __state.files = {};
  if (!__state.calendars) __state.calendars = {};
  if (!__state.triggers) __state.triggers = [];
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
MockRange.prototype.getDataValidation = function () {
  var allowed = this.s.validation && this.s.validation[this.c];
  if (!allowed || this.r < 2) return null;
  return { getCriteriaType: function () { return 'VALUE_IN_LIST'; }, getCriteriaValues: function () { return [allowed.slice(), true]; } };
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
      var allowed = this.s.validation && this.s.validation[this.c + j];
      if (allowed && this.r + i > 1 && v !== '' && allowed.indexOf(String(v)) < 0) {
        __state.__violation = 'The data you entered in cell ' + String.fromCharCode(64 + this.c + j) + (this.r + i) + ' violates the data validation rules set on this cell. Please enter one of the following values: ' + allowed.join(', ') + '.';
        continue; // not written (Sheets rejects it)
      }
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
MockRange.prototype.clearContent = function () {
  this.__checkEdit();
  for (var i = 0; i < this.nr; i++) {
    var target = this.s.rows[this.r - 1 + i];
    if (!target) continue;
    for (var j = 0; j < this.nc; j++) if (this.c - 1 + j < target.length) target[this.c - 1 + j] = '';
  }
  return this;
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
/** Like Sheets: the rows rowSpec spans go before row destinationIndex (counted before the move), formats too. */
MockSheet.prototype.moveRows = function (rowSpec, destinationIndex) {
  var from = rowSpec.r;
  var n = rowSpec.nr;
  new MockRange(this.d, from, 1, n, this.d.maxCols, this.file).__checkEdit();
  if (!(destinationIndex >= 1 && destinationIndex <= this.d.maxRows + 1)) __fail('Invalid argument: destinationIndex');
  if (destinationIndex >= from && destinationIndex <= from + n) return this; // already there
  var total = Math.max(this.d.rows.length, from + n - 1, destinationIndex - 1);
  var seq = [];
  for (var r = 1; r <= total; r++) seq.push(r);
  var moving = seq.splice(from - 1, n);
  var at = destinationIndex > from ? destinationIndex - 1 - n : destinationIndex - 1;
  seq.splice.apply(seq, [at, 0].concat(moving));
  var rows = this.d.rows;
  var fmt = this.d.fmt || {};
  var byRow = {};
  Object.keys(fmt).forEach(function (k) {
    var p = k.split(',');
    (byRow[p[0]] = byRow[p[0]] || {})[p[1]] = fmt[k];
  });
  var nextFmt = {};
  Object.keys(byRow).forEach(function (row) { if (Number(row) > total) Object.keys(byRow[row]).forEach(function (c) { nextFmt[__cellKey(row, c)] = byRow[row][c]; }); });
  this.d.rows = seq.map(function (old, i) {
    Object.keys(byRow[old] || {}).forEach(function (c) { nextFmt[__cellKey(i + 1, c)] = byRow[old][c]; });
    return rows[old - 1] || [];
  });
  this.d.fmt = nextFmt;
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
MockSpreadsheet.prototype.getSpreadsheetTimeZone = function () { return (this.file && this.file.tz) || 'Asia/Manila'; };

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
  flush: function () {
    if (__state.__violation) {
      var message = __state.__violation;
      delete __state.__violation;
      __fail(message);
    }
  },
  DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST', VALUE_IN_RANGE: 'VALUE_IN_RANGE' },
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
    return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} };
  },
};

/* ---- Google Calendar ---- */

function __calAuth() {
  if (__state.calNoAuth) __fail('You do not have permission to call CalendarApp.getAllOwnedCalendars. Required permissions: https://www.googleapis.com/auth/calendar');
}

function __dateKeyIn(date, tz) { return Utilities.formatDate(date, tz || 'Asia/Manila', 'yyyy-MM-dd'); }

/** Midnight at the start of a "YYYY-MM-DD" day in a time zone. */
function __midnight(key, tz) {
  var p = key.split('-').map(Number);
  var hours = __TZ_HOURS[tz || 'Asia/Manila'];
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]) - hours * 3600e3);
}

function MockEvent(cal, data) { this.cal = cal; this.e = data; }
MockEvent.prototype.getId = function () { return this.e.id; };
MockEvent.prototype.getTitle = function () { return this.e.title; };
MockEvent.prototype.setTitle = function (t) { __calAuth(); this.e.title = String(t); return this; };
MockEvent.prototype.getDescription = function () { return this.e.description || ''; };
MockEvent.prototype.setDescription = function (d) { __calAuth(); this.e.description = String(d); return this; };
MockEvent.prototype.isAllDayEvent = function () { return Boolean(this.e.allDay); };
MockEvent.prototype.getStartTime = function () { return this.e.allDay ? __midnight(this.e.date, Session.getScriptTimeZone()) : new Date(this.e.start); };
MockEvent.prototype.getEndTime = function () {
  return this.e.allDay ? new Date(__midnight(this.e.date, Session.getScriptTimeZone()).getTime() + 864e5) : new Date(this.e.end);
};
MockEvent.prototype.getAllDayStartDate = function () {
  if (!this.e.allDay) __fail('Event is not an all-day event.');
  return __midnight(this.e.date, Session.getScriptTimeZone());
};
MockEvent.prototype.setTime = function (start, end) {
  __calAuth();
  this.e.allDay = false; this.e.date = null; this.e.start = start.toISOString(); this.e.end = end.toISOString();
  return this;
};
MockEvent.prototype.setAllDayDate = function (date) {
  __calAuth();
  this.e.allDay = true; this.e.date = __dateKeyIn(date, Session.getScriptTimeZone()); this.e.start = null; this.e.end = null;
  return this;
};
MockEvent.prototype.getPopupReminders = function () { return this.e.popups.slice(); };
MockEvent.prototype.removeAllReminders = function () { __calAuth(); this.e.popups = []; return this; };
MockEvent.prototype.addPopupReminder = function (minutes) {
  __calAuth();
  if (!(minutes >= 5 && minutes <= 40320)) __fail('Invalid argument: minutesBefore (' + minutes + ')');
  if (this.e.popups.length >= 5) __fail('Too many reminders.');
  this.e.popups.push(minutes);
  return this;
};
MockEvent.prototype.setTag = function (key, value) { this.e.tags[key] = String(value); return this; };
MockEvent.prototype.getTag = function (key) { return Object.prototype.hasOwnProperty.call(this.e.tags, key) ? this.e.tags[key] : null; };
MockEvent.prototype.deleteEvent = function () { __calAuth(); this.e.deleted = true; };

function MockCalendar(data) { this.c = data; }
MockCalendar.prototype.getId = function () { return this.c.id; };
MockCalendar.prototype.getName = function () { return this.c.name; };
MockCalendar.prototype.__add = function (fields) {
  __calAuth();
  __state.eventSeq = (__state.eventSeq || 0) + 1;
  var id = 'ev' + __state.eventSeq + '@google.com';
  var data = { id: id, title: '', description: '', start: null, end: null, allDay: false, date: null, popups: [], tags: {}, deleted: false };
  Object.keys(fields).forEach(function (k) { data[k] = fields[k]; });
  this.c.events[id] = data;
  return new MockEvent(this, data);
};
MockCalendar.prototype.createEvent = function (title, start, end, options) {
  return this.__add({ title: String(title), description: (options && options.description) || '', start: start.toISOString(), end: end.toISOString(), popups: [30] });
};
MockCalendar.prototype.createAllDayEvent = function (title, date, options) {
  return this.__add({ title: String(title), description: (options && options.description) || '', allDay: true, date: __dateKeyIn(date, Session.getScriptTimeZone()), popups: [] });
};
MockCalendar.prototype.getEventById = function (id) {
  __calAuth();
  var data = this.c.events[id];
  return data ? new MockEvent(this, data) : null; // deleted events too, like Google
};
MockCalendar.prototype.getEvents = function (start, end) {
  __calAuth();
  var self = this;
  return Object.keys(this.c.events).map(function (id) { return self.c.events[id]; }).filter(function (e) {
    if (e.deleted) return false;
    var ev = new MockEvent(self, e);
    return ev.getStartTime() < end && ev.getEndTime() > start;
  }).map(function (e) { return new MockEvent(self, e); });
};

var CalendarApp = {
  getAllOwnedCalendars: function () {
    __calAuth();
    return Object.keys(__state.calendars).map(function (id) { return __state.calendars[id]; })
      .filter(function (c) { return !c.deleted; }).map(function (c) { return new MockCalendar(c); });
  },
  getCalendarById: function (id) {
    __calAuth();
    var c = __state.calendars[id];
    return c && !c.deleted ? new MockCalendar(c) : null;
  },
  createCalendar: function (name, options) {
    __calAuth();
    __state.calendarSeq = (__state.calendarSeq || 0) + 1;
    var id = 'cal' + __state.calendarSeq + '@group.calendar.google.com';
    __state.calendars[id] = { id: id, name: String(name), tz: (options && options.timeZone) || 'Asia/Manila', deleted: false, events: {} };
    return new MockCalendar(__state.calendars[id]);
  },
};

/* ---- Timers and the script's time zone ---- */

var ScriptApp = {
  getProjectTriggers: function () {
    return __state.triggers.map(function (t) { return { getHandlerFunction: function () { return t.fn; } }; });
  },
  newTrigger: function (fn) {
    return {
      timeBased: function () {
        return {
          everyMinutes: function (n) {
            if ([1, 5, 10, 15, 30].indexOf(n) < 0) __fail('Invalid minutes: ' + n);
            return { create: function () { __state.triggers.push({ fn: fn, everyMinutes: n }); return {}; } };
          },
        };
      },
    };
  },
};

var Session = {
  getScriptTimeZone: function () { return __state.scriptTz || 'Asia/Manila'; },
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
