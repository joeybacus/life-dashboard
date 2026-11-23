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
   (R: …, S: …) at the bottom of that column.

   Trends (0.11.4): a section with repeat results on one line, each with its
   time and an arrow ("Na 147.10H (1:11am) > 148.50H (5:55am)"), stays as the
   text, line by line — a table would make a row for every time.

   Timed tests (0.11.8): "ABG (18:00): pH 7.501H pCO2 29.4L" — a time in brackets
   inside a test's name — is the row "pH", and the cell "7.501H (18:00)", so
   blood gases taken at different times share one pH row.

   Write-ups (0.11.9): a section headed Urinalysis / UA (or whose dated lines hold
   no values, only lines under them) shows each date as one card the width of the
   section, every line of that result in it — swipe sideways for the other dates. */

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
// A trend: a time in brackets followed by an arrow, "(1:11am) >".
const TREND = /\([^()]*\d[^()]*\)\s*(?:>|→|->)/;
// A time inside a test's name: "ABG (18:00): pH" → the test "pH", taken at 18:00.
const NAME_TIME = /^(.*?)\s*\((\d{1,2}[:.]\d{2}\s*(?:[ap]\.?m\.?)?)\)\s*:?\s*(.*)$/i;
// A result written out in lines under its date, not test-value pairs.
const WRITEUP_TITLE = /urinalysis|\bu\/?a\b|fecalysis|stool exam|urine (?:exam|re\b)/i;
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
    section = { title, cols: [], tests: [], keys: new Map(), notes: [], lines: [] };
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
      const times = new Map();
      pairs(rest).forEach(({ name: written, value }) => {
        const timed = NAME_TIME.exec(written);
        const name = timed ? timed[3] || timed[1] || written : written;
        const key = name.toLowerCase();
        if (!section.keys.has(key)) { section.keys.set(key, name); section.tests.push(key); }
        values.set(key, value);
        if (timed) times.set(key, timed[2]);
      });
      section.cols.push({ date: dated[1], time: time?.[1] ?? '', values, times, text: dated[2], notes: [] });
      section.lines.push(line);
      lastDated = true;
    } else if (!section || lastBlank || (lastDated && HEADING.test(line) && !WRITEUP_TITLE.test(section.title))) {
      start(line);
      lastDated = false;
    } else {
      section.notes.push(line);
      section.lines.push(line);
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

function cell(value, time = '') {
  if (!value) return html`<td class="labt__v is-empty"></td>`;
  const at = time ? html` <span class="labt__at">(${time})</span>` : '';
  return FLAG.test(value)
    ? html`<td class="labt__v is-flag"><strong>${value}</strong>${at}</td>`
    : html`<td class="labt__v">${value}${at}</td>`;
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

function isWriteup(s) {
  if (WRITEUP_TITLE.test(s.title)) return true;
  return s.cols.some((c) => c.notes.length) && s.cols.every((c) => [...c.values.values()].every((v) => !v));
}

/** One card per date, as wide as the section; swipe for the others. */
function writeupCards(s) {
  const cols = cultureCols(s);
  // "2026-11-06 UA" under the heading Urinalysis: the "UA" adds nothing.
  const bare = (t) => t.toLowerCase().replace(/[^a-z]/g, '');
  const sameAsTitle = (t) => bare(t) === bare(s.title) || /^(?:ua|urinalysis)$/.test(bare(t));
  return html`<div class="labt__cards" tabindex="0" role="region" aria-label="${s.title || 'Results'}${cols.length > 1 ? ` — ${cols.length} dates, scroll sideways` : ''}">
    ${cols.map((c, i) => html`<article class="labt__card">
      <header class="labt__cardhead">
        <span class="labt__carddate" title="${c.date}">${shortDate(c.date)}${c.time ? html` <small>${c.time}</small>` : ''}</span>
        ${cols.length > 1 ? html`<span class="labt__cardpos">${i + 1} of ${cols.length}${i < cols.length - 1 ? ' ›' : ''}</span>` : ''}
      </header>
      ${c.items.filter((t) => !sameAsTitle(t)).map((t) => html`<p class="labt__cxi">${t}</p>`)}
      ${c.notes.map((n) => html`<p class="labt__cardline">${n}</p>`)}
    </article>`)}
  </div>`;
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

function table(s, tests = s.tests) {
  return html`<div class="labt__scroll" tabindex="0" role="region" aria-label="${s.title || 'Results'}">
    <table class="labt__table">
      <thead><tr>
        <th scope="col" class="labt__corner">Date</th>
        ${s.cols.map((c) => html`<th scope="col" class="labt__date" title="${c.date}${c.time ? ` ${c.time}` : ''}">${shortDate(c.date)}${c.time ? html`<small>${c.time}</small>` : ''}</th>`)}
      </tr></thead>
      <tbody>
        ${tests.map((key) => html`<tr>
          <th scope="row" class="labt__test">${s.keys.get(key)}</th>
          ${s.cols.map((c) => cell(c.values.get(key), c.times?.get(key)))}
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

/** The tile's text as tables, one per heading. grid: the headings side by side as cards, every row shown; more dates scroll sideways. */
export function labTables(text, { grid = false } = {}) {
  const sections = rehome(labSections(text), grid);
  const looks = new Map(sections.map((s) => [s, look(s, grid)]));
  // Grid: small sections share a card (0.11.53): Renal + Coag + Liver, and Lipid + Cardiac (0.11.55), where the first of each is
  const groups = grid ? COMBINE.map((re) => sections.filter((s) => looks.get(s) === 'table' && re.test(s.title))).filter((g) => g.length > 1) : [];
  const groupOf = new Map(groups.flatMap((g) => g.map((s) => [s, g])));
  const out = html`<div class="labt${grid ? ' labt--grid' : ''}">${sections.map((s) => {
    const combo = groupOf.get(s);
    if (combo) {
      if (s !== combo[0]) return '';
      return html`<section class="labt__sec labt__sec--combo">
    <h4 class="labt__title">${combo.map((c) => c.title).join(' · ')}</h4>
    ${combo.map((c) => html`<div class="labt__sub">
      <h5 class="labt__subtitle">${c.title}</h5>
      ${table(c)}
      ${c.notes.map((n) => html`<p class="labt__note">${n}</p>`)}
    </div>`)}
  </section>`;
    }
    return section(s, looks.get(s), grid);
  })}</div>`;
  // The box around the grid is what decides how many columns a wide card may take (ward.css container query)
  return grid ? html`<div class="labt-box">${out}</div>` : out;
}

/** Tests that always show in a set section, wherever the text lists them (0.11.56): eGFR → Renal.
    Only the table moves; the text in the logsheet stays as written. */
const HOMES = [{ test: /^e?gfr$/i, section: /\brenal\b/i }];

/** "2026-11-23" / "11/23/26" / "11/23" → a number to order dates by, or null when it can't tell. */
function dateKey(date) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(date);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
  return y * 10000 + Number(m[1]) * 100 + Number(m[2]);
}

/** Moves each HOMES test out of other tables into its section, by date; a column left empty goes. */
function rehome(sections, grid) {
  const emptied = new Set();
  HOMES.forEach((home) => {
    const target = sections.find((s) => home.section.test(s.title) && look(s, grid) === 'table');
    if (!target) return;
    sections.forEach((s) => {
      if (s === target || look(s, grid) !== 'table') return;
      s.tests.filter((key) => home.test.test(key)).forEach((key) => {
        if (!target.keys.has(key)) { target.keys.set(key, s.keys.get(key)); target.tests.push(key); }
        s.cols.forEach((c) => {
          if (!c.values.has(key)) return;
          let col = target.cols.find((t) => t.date === c.date);
          if (!col) {
            col = { date: c.date, time: c.time, values: new Map(), times: new Map(), text: '', notes: [] };
            // Keep the target's order (newest first or oldest first); a date it can't read goes last
            const k = dateKey(c.date);
            const keys = target.cols.map((t) => dateKey(t.date));
            const newestFirst = keys.length > 1 && keys[0] != null && keys.at(-1) != null ? keys[0] >= keys.at(-1) : true;
            const at = k == null ? -1 : keys.findIndex((t) => t != null && (newestFirst ? t < k : t > k));
            if (at < 0) target.cols.push(col); else target.cols.splice(at, 0, col);
          }
          if (!col.values.get(key)) {
            col.values.set(key, c.values.get(key));
            if (c.times?.has(key)) col.times.set(key, c.times.get(key));
          }
          c.values.delete(key);
          c.times?.delete(key);
        });
        s.tests = s.tests.filter((t) => t !== key);
      });
      const had = s.cols.length;
      s.cols = s.cols.filter((c) => c.values.size || c.notes.length);
      if (had && !s.cols.length && !s.notes.length) emptied.add(s);
    });
  });
  // A table that held only moved tests is gone
  return sections.filter((s) => !emptied.has(s));
}

/** Sections in Grid that are given two columns: they gather results from many dates. */
const WIDE_TITLE = /\babg\b|blood gas|\bother\b|\bcbc\b|blood count|hematology/i;
/** Sections in Grid that share a card, one pattern per card. */
const COMBINE = [/renal|\bcoag|liver|\blft\b|hepatic/i, /lipid|cardiac/i];

/** How a section is shown: as its lines, a write-up card, a culture table, or a flowsheet table. */
function look(s, grid) {
  if (s.cols.some((c) => TREND.test(c.text))) return 'lines';
  if (s.cols.length > 0 && isWriteup(s)) return 'writeup';
  if (s.cols.length > 0 && isCulture(s)) return 'culture';
  // A section of names with no results (Imaging: "Cranial (Plain) (CTSCAN) - …") reads better as its lines
  if (grid && s.cols.length > 0 && s.cols.every((c) => [...c.values.values()].every((v) => !v))) return 'lines';
  return 'table';
}

function section(s, kind, grid) {
  const title = s.title ? html`<h4 class="labt__title">${s.title}</h4>` : '';
  if (kind === 'lines') {
    return html`<section class="labt__sec labt__sec--wide">
    ${title}
    <div class="labt__lines">${s.lines.map((l) => html`<p class="labt__line">${l}</p>`)}</div>
  </section>`;
  }
  const wu = kind === 'writeup';
  const cx = kind === 'culture';
  // In a culture table or write-up card the lines under a result sit with it; lines before any date stay below.
  const notes = cx || wu ? s.notes.filter((n) => !s.cols.some((c) => c.notes.includes(n))) : s.notes;
  // Grid: urinalysis and cultures get three columns, ABG / CBC / Other two — they gather many dates
  const size = wu || cx ? (grid ? ' labt__sec--wider' : ' labt__sec--wide') : grid && WIDE_TITLE.test(s.title) ? ' labt__sec--wide' : '';
  return html`<section class="labt__sec${size}">
    ${title}
    ${wu ? writeupCards(s) : cx ? cultureTable(s) : s.cols.length && s.tests.length ? table(s) : ''}
    ${notes.map((n) => html`<p class="labt__note">${n}</p>`)}
  </section>`;
}
