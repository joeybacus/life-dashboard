/* In-memory stand-ins for the Google Apps Script services that apps-script/Code.gs
   uses, so the real script can be tested on a Mac (see run-gas.js).
   New sheets start deliberately small (6 rows × 8 columns) so the script's
   "grow the sheet" code is exercised. Real Sheets throw when a range falls
   outside the sheet, and so does this mock. */

var __state = { sheets: [], props: {}, logs: [] };

function __load(json) { if (json) __state = JSON.parse(json); }
function __dump() { return JSON.stringify(__state); }

function __fail(message) { throw new Error(message); }

function MockRange(sheet, row, col, numRows, numCols) {
  if (!(row >= 1 && col >= 1 && numRows >= 1 && numCols >= 1)) __fail('Invalid range arguments');
  if (row + numRows - 1 > sheet.maxRows || col + numCols - 1 > sheet.maxCols) {
    __fail('The coordinates of the range are outside the dimensions of the sheet.');
  }
  this.s = sheet; this.r = row; this.c = col; this.nr = numRows; this.nc = numCols;
}
MockRange.prototype.getValues = function () {
  var out = [];
  for (var i = 0; i < this.nr; i++) {
    var src = this.s.rows[this.r - 1 + i] || [];
    var line = [];
    for (var j = 0; j < this.nc; j++) {
      var v = src[this.c - 1 + j];
      line.push(v === undefined || v === null ? '' : v);
    }
    out.push(line);
  }
  return out;
};
MockRange.prototype.getValue = function () { return this.getValues()[0][0]; };
MockRange.prototype.setValues = function (values) {
  if (!Array.isArray(values) || values.length !== this.nr) __fail('The number of rows in the data does not match the number of rows in the range.');
  for (var i = 0; i < this.nr; i++) {
    if (!Array.isArray(values[i]) || values[i].length !== this.nc) __fail('The number of columns in the data does not match the number of columns in the range.');
    var target = this.s.rows[this.r - 1 + i] || (this.s.rows[this.r - 1 + i] = []);
    for (var j = 0; j < this.nc; j++) target[this.c - 1 + j] = values[i][j];
  }
  return this;
};
MockRange.prototype.setNumberFormat = function () { return this; };
MockRange.prototype.setFontWeight = function () { return this; };
MockRange.prototype.setFontSize = function () { return this; };

function MockSheet(data) { this.d = data; }
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
  return new MockRange(this.d, row, col, numRows === undefined ? 1 : numRows, numCols === undefined ? 1 : numCols);
};
MockSheet.prototype.insertRowsAfter = function (after, count) {
  var blanks = [];
  for (var i = 0; i < count; i++) blanks.push([]);
  this.d.rows.splice.apply(this.d.rows, [after, 0].concat(blanks));
  this.d.maxRows += count;
  return this;
};
MockSheet.prototype.insertColumnsAfter = function (after, count) { this.d.maxCols += count; return this; };
MockSheet.prototype.setFrozenRows = function () { return this; };
MockSheet.prototype.setColumnWidth = function () { return this; };

var __spreadsheet = {
  getSheetByName: function (name) {
    var found = __state.sheets.filter(function (s) { return s.name === name; })[0];
    return found ? new MockSheet(found) : null;
  },
  insertSheet: function (name, index) {
    if (this.getSheetByName(name)) __fail('A sheet with the name "' + name + '" already exists.');
    var data = { name: name, rows: [], maxRows: 6, maxCols: 8 };
    if (typeof index === 'number') __state.sheets.splice(index, 0, data); else __state.sheets.push(data);
    return new MockSheet(data);
  },
  getSheets: function () { return __state.sheets.map(function (s) { return new MockSheet(s); }); },
  deleteSheet: function (sheet) {
    __state.sheets = __state.sheets.filter(function (s) { return s !== sheet.d; });
  },
};

var SpreadsheetApp = {
  getActiveSpreadsheet: function () { return __spreadsheet; },
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
};

var Logger = { log: function (message) { __state.logs.push(String(message)); } };
