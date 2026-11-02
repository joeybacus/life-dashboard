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
   as notes under the table. */

import { html } from '../../core/html.js';

const DATED = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*(.*)$/;
const TIME = /\s*\(([^()]*)\)\s*$/;
// A value: a number with an optional H/L before or after (131L, H15.14, <0.01, 1+), or a word results use.
const VALUE = /^(?:[<>≤≥]=?)?[HL]?[<>]?[-+]?\.?\d[\d.,:/]*(?:[HL]|\++)?%?$|^(?:neg(?:ative)?|pos(?:itive)?|trace|nil|none|normal|abnormal|reactive|non-?reactive|\++)$/i;
const FLAG = /^[<>]?[HL]\d|\d[HL]$/;
// Right under a result, only a short line with no commas or colons starts a new heading ("CBC", "Liver").
const HEADING = /^[^,:;]{1,24}$/;

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
      section.cols.push({ date: dated[1], time: time?.[1] ?? '', values });
      lastDated = true;
    } else if (!section || lastBlank || (lastDated && HEADING.test(line))) {
      start(line);
      lastDated = false;
    } else {
      section.notes.push(line);
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
  return html`<div class="labt">${labSections(text).map((s) => html`<section class="labt__sec">
    ${s.title ? html`<h4 class="labt__title">${s.title}</h4>` : ''}
    ${s.cols.length && s.tests.length ? table(s) : ''}
    ${s.notes.map((n) => html`<p class="labt__note">${n}</p>`)}
  </section>`)}</div>`;
}
