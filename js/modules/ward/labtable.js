/* Lab results as tables (0.11.1): a patient tile's text read as lab lines and
   shown as one table per heading — the tests down the side, a column per
   result date — like a paper lab flowsheet. Nothing is saved; the text in the
   logsheet stays exactly as it is, and the tile can switch back to it.

   The text it reads:
     CBC                                         ← a heading
     2026-10-31 RBC 4.4L Hgb 131L Hct 0.40       ← a date, then test and value pairs
     2026-10-26 RBC 4.6L Hgb 134L
     (blank line)
     Na
     2026-10-31 Na 131.39L (2:20am)              ← a time in brackets goes under the date
   A heading is a line without a date that comes first, after a blank line, or
   short (no commas) right after a dated line; other lines without a date show
   as notes under the table.

   Cultures (0.11.3): a section headed Culture (or whose lines are all "Blood CS",
   "Urine C/S"…) is one row, not a row per test — a column per date, the date as
   its header, each culture on its own line in it and the lines under it
   (R: …, S: …) at the bottom of that column. */

import { html } from '../../core/html.js';

const DATED = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*(.*)$/;
const TIME = /\s*\(([^()]*)\)\s*$/;
// A value: a number with an optional H/L before or after (131L, H15.14, <0.01, 1+), or a word results use.
const VALUE = /^(?:[<>≤≥]=?)?[HL]?[<>]?[-+]?\.?\d[\d.,:/]*(?:[HL]|\++)?%?$|^(?:neg(?:ative)?|pos(?:itive)?|trace|nil|none|normal|abnormal|reactive|non-?reactive|\++)$/i;
const FLAG = /^[<>]?[HL]\d|\d[HL]$/;
// Right under a result, only a short line with no commas or colons starts a new heading ("CBC", "Liver").
const HEADING = /^[^,:;]{1,24}$/;
// A culture section, by its heading or by every line naming a culture.
const CULTURE_TITLE = /cultur|\bc\/?s\b|sensitiv/i;
const CULTURE_LINE = /\b(?:c\/?s|cultures?)\b/i;
// Where one culture ends and the next starts on the same line: before "Blood CS", "Urine culture"…
const CULTURE_SPLIT = /\s+(?=[A-Za-z]+\s+(?:c\/?s|cultures?)\b)/i;

/** One dated line's tests: [{ name, value }], test names in the order written. */
function pairs(text) {
  const out = [];
  let name = [];
  text.split(/\s+/).filter(Boolean).forEach((tok) => {
    if (VALUE.test(tok) && name.length) {
      out.push({ name: name.join(' '), value: tok });
      name = [];
    } else if (VALUE.test(tok) && out.length) {
      out[out.length - 1].value += ` ${tok}`;
    } else {
      name.push(tok);
    }
  });
  if (name.length) out.push({ name: name.join(' '), value: '' });
  return out;
}

/** The sections in a tile's text: [{ title, cols: [{ date, time, values }], tests: [name], notes: [line] }]. */
export function labSections(text) {
  const sections = [];
  let section = null;
  let lastDated = false;
  let lastBlank = true;
  const start = (title) => {
    section = { title, cols: [], tests: [], keys: new Map(), notes: [] };
    sections.push(section);
  };
  String(text ?? '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) { lastBlank = true; return; }
    const dated = DATED.exec(line);
    if (dated) {
      if (!section) start('');
      let rest = dated[2];
      const time = TIME.exec(rest);
      if (time) rest = rest.slice(0, time.index);
      const values = new Map();
      pairs(rest).forEach(({ name, value }) => {
        const key = name.toLowerCase();
        if (!section.keys.has(key)) { section.keys.set(key, name); section.tests.push(key); }
        values.set(key, value);
      });
      section.cols.push({ date: dated[1], time: time?.[1] ?? '', values, text: dated[2], notes: [] });
      lastDated = true;
    } else if (!section || lastBlank || (lastDated && HEADING.test(line))) {
      start(line);
      lastDated = false;
    } else {
      section.notes.push(line);
      section.cols.at(-1)?.notes.push(line);
    }
    lastBlank = false;
  });
  return sections;
}

/** Whether the text has any dated lab lines, so a table is worth offering. */
export function hasLabTable(text) {
  return labSections(text).some((s) => s.cols.length);
}

/** "2026-10-31" → "10/31" (the year is in the tooltip); other dates as written. */
function shortDate(date) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  return m ? `${Number(m[2])}/${Number(m[3])}` : date;
}

function cell(value) {
  if (!value) return html`<td class="labt__v is-empty"></td>`;
  return FLAG.test(value)
    ? html`<td class="labt__v is-flag"><strong>${value}</strong></td>`
    : html`<td class="labt__v">${value}</td>`;
}

function isCulture(s) {
  return CULTURE_TITLE.test(s.title) || (s.cols.length > 0 && s.cols.every((c) => CULTURE_LINE.test(c.text)));
}

/** Culture columns: lines with the same date share one column, oldest-to-newest order kept as written. */
function cultureCols(s) {
  const byDate = new Map();
  s.cols.forEach((c) => {
    // A bracket with a number in it at the end is a time ("(2:20am)"); "((LEFT ARM))" stays in the text.
    const isTime = /\d/.test(c.time);
    const text = isTime ? c.text.replace(TIME, '') : c.text;
    const key = c.date;
    if (!byDate.has(key)) byDate.set(key, { date: c.date, time: isTime ? c.time : '', items: [], notes: [] });
    const col = byDate.get(key);
    col.items.push(...text.split(CULTURE_SPLIT).map((t) => t.trim()).filter(Boolean));
    col.notes.push(...c.notes);
  });
  return [...byDate.values()];
}

function cultureTable(s) {
  const cols = cultureCols(s);
  return html`<div class="labt__scroll" tabindex="0" role="region" aria-label="${s.title || 'Cultures'}">
    <table class="labt__table labt__table--cx">
      <thead><tr>
        ${cols.map((c) => html`<th scope="col" class="labt__date" title="${c.date}${c.time ? ` ${c.time}` : ''}">${shortDate(c.date)}${c.time ? html`<small>${c.time}</small>` : ''}</th>`)}
      </tr></thead>
      <tbody><tr>
        ${cols.map((c) => html`<td class="labt__cx">
          ${c.items.map((t) => html`<p class="labt__cxi">${t}</p>`)}
          ${c.notes.map((n) => html`<p class="labt__cxn">${n}</p>`)}
        </td>`)}
      </tr></tbody>
    </table>
  </div>`;
}

function table(s) {
  return html`<div class="labt__scroll" tabindex="0" role="region" aria-label="${s.title || 'Results'}">
    <table class="labt__table">
      <thead><tr>
        <th scope="col" class="labt__corner">Date</th>
        ${s.cols.map((c) => html`<th scope="col" class="labt__date" title="${c.date}${c.time ? ` ${c.time}` : ''}">${shortDate(c.date)}${c.time ? html`<small>${c.time}</small>` : ''}</th>`)}
      </tr></thead>
      <tbody>
        ${s.tests.map((key) => html`<tr>
          <th scope="row" class="labt__test">${s.keys.get(key)}</th>
          ${s.cols.map((c) => cell(c.values.get(key)))}
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

/** The tile's text as tables, one per heading. */
export function labTables(text) {
  return html`<div class="labt">${labSections(text).map((s) => {
    const cx = s.cols.length > 0 && isCulture(s);
    // In a culture table the lines under a result sit in its column; lines before any date stay below.
    const notes = cx ? s.notes.filter((n) => !s.cols.some((c) => c.notes.includes(n))) : s.notes;
    return html`<section class="labt__sec">
    ${s.title ? html`<h4 class="labt__title">${s.title}</h4>` : ''}
    ${cx ? cultureTable(s) : s.cols.length && s.tests.length ? table(s) : ''}
    ${notes.map((n) => html`<p class="labt__note">${n}</p>`)}
  </section>`;
  })}</div>`;
}
