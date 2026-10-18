/* Ward reports: the daily summary of the patients you rounded on, and one
   patient's detailed referral — text you copy (or share) into a message to
   your consultant. Plain helpers with no database or network; the windows
   are in report-page.js. Nothing here leaves the device.

   Which column holds what is the list's report setup (def.report, synced with
   the list's name and columns — never patients):
     { cols: { dx, events, services, labs, imaging, plans }, open, close }
   open / close: the referral's first and last lines.

   What changed comes from what this device saw: the text each box had the
   last time the list loaded each day (wardSeen, see engine.js), else your own
   edits (wardEdits). Labs whose lines start with a date (as a lab script
   writes them) count by those dates instead. */
import { previousDateKey } from './model.js';

const DAY_MS = 864e5;

/* ---------- Where each part comes from ---------- */

export const REPORT_SECTIONS = [
  { id: 'dx', label: 'Diagnosis' },
  { id: 'events', label: 'Events (and exam)' },
  { id: 'services', label: 'Services ordered' },
  { id: 'labs', label: 'Labs' },
  { id: 'imaging', label: 'Imaging' },
  { id: 'plans', label: 'Medications and plans' },
];

// Headings that suggest each part, tried in this order (the more particular first)
const GUESS = [
  ['labs', /\blab/i],
  ['imaging', /imag|radiol|\bct\b|\bmri\b|scan|x-?ray/i],
  ['services', /servic|referr|co-?manag|consult/i],
  ['dx', /diagnos|\bdx\b|impression|assessment|\bcase\b|problem/i],
  ['events', /event|course|subjective|\bcc\b|hpi|exam|\bpe\b|history/i],
  ['plans', /plan|\bmeds?\b|medication|recommend|\brecs?\b|\borders?\b|management/i],
];

export const DEFAULT_OPENING = 'Respectfully giving updates for patient';
export const DEFAULT_CLOSING = 'Thank you po';
export const SEPARATOR = '---------------';
export const MAX_LINE = 120; // characters in the referral's first or last line

/** Columns a report can use: the list's own, except the location and tick-box ones. */
export const reportColumns = (columns) => columns.filter((c) => !c.location && c.type !== 'check');

/**
 * Where each part of a report comes from: the list's saved setup, or a guess
 * from its column headings (saved: false until you check it).
 * columns: the list's own columns [{ col, label, heading, location, type }].
 */
export function reportSetup(saved, columns) {
  const usable = reportColumns(columns);
  const letters = new Set(usable.map((c) => c.col));
  if (saved && typeof saved === 'object' && saved.cols && typeof saved.cols === 'object') {
    return {
      cols: Object.fromEntries(REPORT_SECTIONS.map(({ id }) => [id, letters.has(saved.cols[id]) ? saved.cols[id] : ''])),
      open: typeof saved.open === 'string' ? saved.open : DEFAULT_OPENING,
      close: typeof saved.close === 'string' ? saved.close : DEFAULT_CLOSING,
      saved: true,
    };
  }
  const cols = Object.fromEntries(REPORT_SECTIONS.map(({ id }) => [id, '']));
  const taken = new Set();
  for (const [id, re] of GUESS) {
    const c = usable.find((x) => !taken.has(x.col) && (re.test(x.label ?? '') || re.test(x.heading ?? '')));
    if (c) {
      cols[id] = c.col;
      taken.add(c.col);
    }
  }
  return { cols, open: DEFAULT_OPENING, close: DEFAULT_CLOSING, saved: false };
}

/* ---------- Days written in text ---------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const monthNo = (word) => MONTHS.indexOf(String(word).slice(0, 3).toLowerCase()) + 1;
const pad = (n) => String(n).padStart(2, '0');

// Numbers first: a month's name can also be someone's name (May, March)
const NUMERIC_DATES = [
  // 2026-10-05, 2026/10/05
  { re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, parts: (m) => [m[1], m[2], m[3]] },
  // 10/05/2026, 10/5/26, 10-05-2026 (month first, as in the Philippines)
  { re: /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/g, parts: (m) => [m[3], m[1], m[2]] },
  // 10/5 (no year)
  { re: /\b(\d{1,2})\/(\d{1,2})\b(?![/-]\d)/g, parts: (m) => [null, m[1], m[2]] },
];
const WORD_DATES = [
  // Oct 5, 2026 · October 5
  { re: new RegExp(`\\b${MONTH}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4})\\b)?`, 'gi'), parts: (m) => [m[3], monthNo(m[1]), m[2]] },
  // 5 Oct 2026 · 5 October
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*${MONTH}(?:,?\\s*(\\d{4})\\b)?`, 'gi'), parts: (m) => [m[3], monthNo(m[2]), m[1]] },
];

/** "YYYY-MM-DD" for a day as written, or null when it isn't a real day. Without a year: the latest such day up to today. */
function dayKey(y, m, d, today) {
  const month = Number(m);
  const day = Number(d);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const noYear = y == null || y === '';
  const year = noYear ? Number(today.slice(0, 4)) : Number(y) < 100 ? 2000 + Number(y) : Number(y);
  const make = (yr) => {
    const t = new Date(Date.UTC(yr, month - 1, day));
    return t.getUTCMonth() === month - 1 && t.getUTCDate() === day ? `${yr}-${pad(month)}-${pad(day)}` : null;
  };
  const key = make(year);
  return noYear && key && key > today ? make(year - 1) : key;
}

/** The first day written in some text: { key, index, length }, or null. atStart: only one the text starts with. */
function findDate(text, today, { atStart = false } = {}) {
  const s = String(text ?? '');
  for (const patterns of [NUMERIC_DATES, WORD_DATES]) {
    let best = null;
    for (const p of patterns) {
      for (const m of s.matchAll(p.re)) {
        if (atStart && s.slice(0, m.index).trim()) break;
        const [y, mo, d] = p.parts(m);
        const key = dayKey(y, mo, d, today);
        if (!key) continue;
        if (!best || m.index < best.index) best = { key, index: m.index, length: m[0].length };
        break;
      }
    }
    if (best) return best;
  }
  return null;
}

/** The day a line starts with ("2026-10-16 Na 135", "10/16 CT scan: …"), or null. */
export const lineDay = (line, today) => findDate(line, today, { atStart: true })?.key ?? null;

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
/** "Oct 5, 2026" for a "YYYY-MM-DD" key. */
export const reportDay = (key) => DAY_FORMAT.format(new Date(`${key}T00:00:00Z`));

/** Hospital day: the day of admission is day 1. */
export function hospitalDay(doa, today) {
  const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${doa}T00:00:00Z`)) / DAY_MS) + 1;
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/* ---------- The name box: name, age/sex and admission day together ---------- */

const DOA_LABEL = /\b(?:DOA|D\.O\.A|date of admission|admitted(?:\s+on)?|adm)\b\.?\s*[:\-–=]?\s*/gi;
const AGE_SEX = /\b(\d{1,3})\s*(?:y\s*\/\s*o|y\.?\s*o\.?|yrs?\.?(?:\s*old)?|years?(?:\s*old)?|y)?\s*[/,-]?\s*(male|female|m|f)\b\.?/i;
const SEX_AGE = /\b(male|female|m|f)\s*[/,-]\s*(\d{1,3})\b/i;
const HOSPITAL_DAY = /\b(?:HD|hospital day)\s*#?\s*\d{1,3}\b/gi;

const cut = (text, index, length) => `${text.slice(0, index)} ${text.slice(index + length)}`;

/**
 * Read the name box however it's typed: "DELA CRUZ, JUAN 45/M DOA 10/12/26",
 * "Dela Cruz, Juan (45 y/o M) admitted Oct 12" or over several lines.
 * Returns { name, ageSex: '45/M' | '', doa: 'YYYY-MM-DD' | null }. Days are
 * read month first (10/12 = October 12).
 */
export function nameParts(text, today) {
  const original = String(text ?? '');
  let rest = original;
  let doa = null;
  // The admission day: right after "DOA" (or "admitted"), else any day in the box
  for (const m of rest.matchAll(DOA_LABEL)) {
    const after = rest.slice(m.index + m[0].length);
    const found = findDate(after, today, { atStart: true });
    if (found && found.key <= today) {
      doa = found.key;
      rest = `${rest.slice(0, m.index)} ${after.slice(found.index + found.length)}`;
      break;
    }
  }
  if (!doa) {
    const found = findDate(rest, today);
    if (found && found.key <= today) {
      doa = found.key;
      rest = cut(rest, found.index, found.length);
    }
  }
  rest = rest.replace(DOA_LABEL, ' ');

  let ageSex = '';
  const as = AGE_SEX.exec(rest);
  const sa = as ? null : SEX_AGE.exec(rest);
  const age = as ? Number(as[1]) : sa ? Number(sa[2]) : NaN;
  if (age <= 120) {
    const m = as ?? sa;
    ageSex = `${age}/${(as ? as[2] : sa[1])[0].toUpperCase()}`;
    rest = cut(rest, m.index, m[0].length);
  }

  const name = rest
    .replace(HOSPITAL_DAY, ' ')
    .replace(/\b(?:age|sex|gender)\s*[:=]/gi, ' ')
    .replace(/\(\s*[,;/-]?\s*\)/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').replace(/^[\s,;:|·•–—\-/()]+|[\s,;:|·•–—\-/(]+$/g, '').trim())
    .find(Boolean);
  return { name: name || original.split('\n')[0].trim(), ageSex, doa };
}

/* ---------- Comparing text ---------- */

const textLines = (text) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
const filled = (text) => textLines(text).filter((l) => l.trim());
const norm = (line) => line.replace(/\s+/g, ' ').trim().toLowerCase();

/** Text as it goes in a report: no blank space at the ends of lines, at most one empty line in a row. */
export const tidy = (text) => textLines(text).join('\n').replace(/\n{3,}/g, '\n\n').trim();

/** Same text, ignoring capitals, spacing and blank lines. */
export const sameText = (a, b) => filled(a).map(norm).join('\n') === filled(b).map(norm).join('\n');

/** Lines of `after` that `before` didn't have, and lines of `before` that are gone (ignoring capitals, spacing and order). */
export function lineChanges(before, after) {
  const b = filled(before);
  const a = filled(after);
  const left = (from, take) => {
    const count = new Map();
    take.forEach((l) => count.set(norm(l), (count.get(norm(l)) ?? 0) + 1));
    return from.filter((l) => {
      const n = count.get(norm(l)) ?? 0;
      if (n > 0) count.set(norm(l), n - 1);
      return n === 0;
    }).map((l) => l.trim());
  };
  return { added: left(a, b), removed: left(b, a) };
}

/* ---------- What a box said before ---------- */

const nextDateKey = (key) => new Date(Date.parse(`${key}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** The first day a report covers: today, or yesterday too. */
export const windowStart = (today, days) => (days === 2 ? previousDateKey(today) : today);

/**
 * The day to compare with for what changed since the start of `from`: the
 * day before, or the last earlier day this device saw the list (it wasn't
 * opened that day). seen: { <day>: { cols, rows } } (engine.js).
 */
export function compareDay(seen, from) {
  const want = previousDateKey(from);
  if (seen?.[want]) return want;
  return Object.keys(seen ?? {}).filter((d) => d < want).sort().pop() ?? want;
}

/**
 * What a patient's box said at the end of a day: the last time this device
 * loaded the list that day, else from your edits; undefined when that isn't
 * known. A patient who wasn't on the list that day had nothing.
 */
export function textOn(p, col, day, seen) {
  const look = seen?.[day];
  if (look && Array.isArray(look.cols) && look.cols.includes(col) && p.key) return look.rows?.[p.key]?.[col] ?? '';
  const byDay = p.edited?.[col] ?? {};
  if (byDay[nextDateKey(day)]) return byDay[nextDateKey(day)].before;
  if (byDay[day]) return byDay[day].after;
  return undefined;
}

/* ---------- A much worse exam ---------- */

// Words for a much worse neurological exam. One that appears more often than
// before (and isn't written as "no …" or "not …") makes the change drastic.
const WORSE = [
  /plegi/gi, // hemiplegia, quadriplegic
  /decreas\w*\s+(?:in\s+)?sensorium|sensorium\s+(?:decreas|deteriorat|worsen)\w*/gi,
  /\b(?:drowsy|lethargic|stupor(?:ous)?|obtunded|comatose|coma)\b/gi,
  /\bno eye opening\b|\bdoes(?:n[o’']t| not) open (?:his |her |the )?eyes\b/gi,
  /\b(?:unresponsive|nrtp)\b/gi,
  /\bherniat\w*/gi,
  /\b(?:decerebrate|decorticate|posturing)\b/gi,
  /\b[01]\s*\/\s*5\b/g, // muscle strength 0/5 or 1/5
  /\b(?:fixed|dilated)\b[^.\n]{0,20}?\b(?:fixed|dilated|non-?reactive)\b/gi,
];
const NEGATED = /(?:\b(?:no|not|non|nil|without|denies|negative for|absence of|resolved)\b[\w\s/-]{0,24}|\(-\)\s*)$/i;

function worseCounts(text) {
  const s = String(text ?? '');
  return WORSE.map((re) => [...s.matchAll(re)].filter((m) => !NEGATED.test(s.slice(Math.max(0, m.index - 40), m.index))).length);
}

/** The last Glasgow Coma Scale written ("GCS 9", "E2V3M4", "E1VTM4"), or null. */
export function gcsOf(text) {
  const s = String(text ?? '');
  const evm = [...s.matchAll(/\bE\s*([1-4])\s*V\s*([1-5]|T)\s*M\s*([1-6])\b/gi)].pop();
  if (evm) return Number(evm[1]) + (/t/i.test(evm[2]) ? 1 : Number(evm[2])) + Number(evm[3]);
  const total = [...s.matchAll(/\bGCS\b\s*(?:of|=|:)?\s*(\d{1,2})\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 3 && n <= 15).pop();
  return total ?? null;
}

/** Did the exam get much worse: plegia where there was paresis, decreased sensorium, a GCS 2 or more lower…? */
export function drasticChange(before, after) {
  const was = worseCounts(before);
  if (worseCounts(after).some((n, i) => n > was[i])) return true;
  const [g0, g1] = [gcsOf(before), gcsOf(after)];
  return g0 != null && g1 != null && g1 <= g0 - 2;
}

/* ---------- Medications and plans ---------- */

const PLAN_HEADING = /^(?:p\s*>|(?:[a-z][a-z\s'&/]*\s)?(?:medications?|meds|drugs|therapeutics|plans?|recommendations?|orders|management)(?:\s[a-z][a-z\s'&/]*)?)\s*:?$/i;
const MED_WORDS = /medic|meds|drugs|therapeutic|orders/i;
const PLAN_WORDS = /plan|recommend|management/i;
// A dose, route or how often: "80mg", "IV", "Q6", "OD", "PRN"
const DOSE = /\d\s*(?:mg|mcg|g|gm|grams?|ml|cc|units?|iu|meq|mmol|tabs?|caps?|amps?|%)\b|\b(?:iv|po|im|sc|sq|sl|ngt|ogt|od|bid|tid|qid|qd|qhs|hs|prn|rtc|q\s?\d{1,2}h?)\b/i;
const LABELLED = /^[a-z][\w\s/]{0,20}:\s*\S/i; // "IVF: PNSS x 80cc/hr", "Diet: NPO"
const NOT_A_DRUG = new Set(['start', 'started', 'give', 'given', 'continue', 'cont', 'resume', 'resumed', 'shift', 'shifted', 'hold', 'held', 'stop', 'stopped', 'dc', 'discontinue', 'increase', 'increased', 'decrease', 'decreased', 'add', 'added', 'then', 'to', 'may', 'please', 'inj', 'tab', 'tabs', 'cap', 'caps', 'x']);

/** Each line of a medications and plans box, as a medication (or other order) or a plan. */
function planLines(text) {
  let kind = 'mixed';
  const out = [];
  for (const raw of textLines(text)) {
    const line = raw.trim();
    if (!line) continue;
    if (PLAN_HEADING.test(line)) {
      const med = MED_WORDS.test(line);
      const plan = PLAN_WORDS.test(line);
      kind = med && !plan ? 'med' : plan && !med ? 'plan' : 'mixed';
      continue;
    }
    out.push({ line, kind: kind !== 'mixed' ? kind : /^>/.test(line) ? 'plan' : DOSE.test(line) || LABELLED.test(line) ? 'med' : 'plan' });
  }
  return out;
}

/** The drug (or order) a line is about, to match "Levetiracetam 500mg" with "Levetiracetam 1g". */
function drugKey(line) {
  const words = line.toLowerCase().replace(/^[\s>•*\-–—\d.)]+/, '').match(/[a-z][a-z+-]*/g) ?? [];
  return words.find((w) => w.length >= 2 && !NOT_A_DRUG.has(w)) ?? '';
}

/** What changed in a medications and plans box: { started, stopped, changed: [[was, now]], plans }. */
export function planChanges(before, after) {
  const was = planLines(before);
  const now = planLines(after);
  const { added, removed } = lineChanges(was.map((x) => x.line).join('\n'), now.map((x) => x.line).join('\n'));
  const kindOf = (list) => new Map(list.map((x) => [norm(x.line), x.kind]));
  const [kindWas, kindNow] = [kindOf(was), kindOf(now)];
  const startedAll = added.filter((l) => kindNow.get(norm(l)) === 'med');
  const stoppedAll = removed.filter((l) => kindWas.get(norm(l)) === 'med');
  const changed = [];
  const stopped = [];
  const used = new Set();
  for (const old of stoppedAll) {
    const key = drugKey(old);
    const i = key ? startedAll.findIndex((l, j) => !used.has(j) && drugKey(l) === key) : -1;
    if (i >= 0) {
      used.add(i);
      changed.push([old, startedAll[i]]);
    } else stopped.push(old);
  }
  return {
    started: startedAll.filter((_, j) => !used.has(j)),
    stopped,
    changed,
    plans: added.filter((l) => kindNow.get(norm(l)) !== 'med'),
  };
}

/* ---------- Labs (and anything else with dated lines) ---------- */

/**
 * Lines that start with a day inside [from, today], under their headings
 * ("CBC", "Na"…). A line without a day right after a dated one belongs to it.
 * Returns { dated, groups: [{ heading, lines }], latest } — dated: false
 * when no line starts with a day.
 */
export function datedLines(text, from, today) {
  const lines = textLines(text);
  const groups = [];
  let heading = '';
  let latest = null;
  let dated = false;
  let current = null; // the dated entry continuation lines go with
  let blank = true;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      blank = true;
      current = null;
      return;
    }
    const day = lineDay(line, today);
    if (day) {
      dated = true;
      if (!latest || day > latest) latest = day;
      current = day >= from && day <= today ? { keep: true } : { keep: false };
      if (current.keep) {
        let g = groups.at(-1);
        if (!g || g.heading !== heading) groups.push(g = { heading, lines: [] });
        g.lines.push(line);
      }
    } else {
      const next = lines.slice(i + 1).find((l) => l.trim());
      if (blank || !current || (line.length <= 40 && next && lineDay(next.trim(), today))) {
        heading = line;
        current = null;
      } else if (current.keep) groups.at(-1).lines.push(line);
    }
    blank = false;
  });
  return { dated, groups, latest };
}

/* ---------- One patient's report ---------- */

/**
 * Everything a report says about one patient. p: a patient from the list's
 * view(); setup: reportSetup(); seen: what this device saw each day; days: 1
 * (today) or 2 (yesterday too).
 */
export function patientReport(p, setup, { seen = {}, today, days = 1 }) {
  const from = windowStart(today, days);
  const ref = compareDay(seen, from);       // the end of the day before the report starts
  const refToday = compareDay(seen, today); // the end of yesterday
  const col = (id) => setup.cols[id] || '';
  const now = (id) => (col(id) ? String(p.cells?.[col(id)] ?? '') : null);
  const was = (id, day = ref) => (col(id) ? textOn(p, col(id), day, seen) : undefined);
  const who = nameParts(p.name, today);
  const text = Object.fromEntries(REPORT_SECTIONS.map(({ id }) => [id, now(id)]));

  let events = null;
  if (text.events !== null) {
    const before = was('events');
    if (before === undefined) events = { status: 'unknown' };
    else if (sameText(before, text.events)) events = { status: 'same' };
    else {
      const mid = days === 2 ? was('events', refToday) : undefined; // the end of yesterday
      const both = mid !== undefined && !sameText(mid, before) && !sameText(mid, text.events);
      events = { status: 'changed', before, mid: both ? mid : undefined, drastic: drasticChange(before, text.events) };
    }
  }

  /** New lines in a box (services, imaging): { status: 'empty' | 'same' | 'new' | 'unknown', lines }. */
  const fresh = (id) => {
    if (text[id] === null) return null;
    if (!text[id].trim()) return { status: 'empty', lines: [] };
    const before = was(id);
    if (before === undefined) return { status: 'unknown', lines: filled(text[id]).map((l) => l.trim()) };
    const { added } = lineChanges(before, text[id]);
    return { status: added.length ? 'new' : 'same', lines: added };
  };

  let labs = null;
  if (text.labs !== null) {
    const d = datedLines(text.labs, from, today);
    labs = d.dated ? { status: d.groups.length ? 'new' : 'same', groups: d.groups, latest: d.latest, dated: true } : { ...fresh('labs'), dated: false };
  }

  let plans = null;
  if (text.plans !== null) {
    const before = was('plans');
    if (before === undefined) plans = { status: 'unknown' };
    else {
      const c = planChanges(before, text.plans);
      plans = { status: c.started.length || c.stopped.length || c.changed.length || c.plans.length ? 'changed' : 'same', ...c };
    }
  }

  return {
    id: p.id,
    name: who.name || p.name,
    ageSex: who.ageSex,
    doa: who.doa,
    hd: who.doa ? hospitalDay(who.doa, today) : null,
    location: p.location ?? '',
    text,
    events,
    services: fresh('services'),
    labs,
    imaging: fresh('imaging'),
    plans,
  };
}

/** The events part: today's, or the earlier exam "to now" today's. full: the whole box even when nothing changed (referral). */
function eventsText(r, { earlier, when, full = false }) {
  const ev = r.events;
  const now = tidy(r.text.events);
  if (ev.status === 'unknown' || (ev.status === 'same' && full)) return now || 'None written.';
  if (ev.status === 'same') return `No new events ${when}.`;
  if (ev.mid !== undefined) return `Yesterday:\n${tidy(ev.mid) || 'None written.'}\n\nToday:\n${now || 'None written.'}`;
  const showEarlier = earlier ?? ev.drastic;
  if (showEarlier && tidy(ev.before)) return `${tidy(ev.before)}\n\nto now\n\n${now || 'None written.'}`;
  return now || 'None written.';
}

const sinceWords = (days) => (days === 2 ? 'today or yesterday' : 'today');

/** One patient in the daily summary. earlier: show the earlier exam (true / false), or null to decide by itself. */
export function summaryBlock(r, { days = 1, earlier = null } = {}) {
  const when = sinceWords(days);
  const out = [
    `Name: ${r.name || '?'}`,
    `Age/Gender: ${r.ageSex || '?'}`,
    `DOA: ${r.doa ? `${reportDay(r.doa)} · HD ${r.hd}` : '?'}`,
  ];
  if (r.text.dx !== null) out.push('', 'Diagnosis:', tidy(r.text.dx) || 'None written.');
  if (r.events) out.push('', 'Events:', eventsText(r, { earlier, when }));
  if (r.services && (r.services.status === 'new' || r.services.status === 'unknown')) {
    if (!r.events) out.push('');
    out.push('Services ordered:', ...r.services.lines);
  }
  if (r.labs) {
    out.push('', 'Labs:');
    const l = r.labs;
    if (l.dated && l.status === 'new') l.groups.forEach((g) => out.push(...(g.heading ? [g.heading] : []), ...g.lines));
    else if (l.dated) out.push(`No new results ${when}${l.latest ? ` (last: ${reportDay(l.latest)})` : ''}.`);
    else if (l.status === 'new' || l.status === 'unknown') out.push(...l.lines);
    else out.push(l.status === 'empty' ? 'None written.' : `No new results ${when}.`);
  }
  if (r.imaging && (r.imaging.status === 'new' || r.imaging.status === 'unknown')) {
    if (!r.labs) out.push('');
    out.push('Imaging:', ...r.imaging.lines);
  }
  if (r.plans) {
    out.push('', 'Plans:');
    const pl = r.plans;
    if (pl.status === 'unknown') out.push(tidy(r.text.plans) || 'None written.');
    else if (pl.status === 'same') out.push(`No changes ${when}.`);
    else {
      pl.started.forEach((l) => out.push(`Started: ${l}`));
      pl.stopped.forEach((l) => out.push(`Stopped: ${l}`));
      pl.changed.forEach(([a, b]) => out.push(`Changed: ${a} → ${b}`));
      out.push(...pl.plans);
    }
  }
  return out.join('\n');
}

/** The daily summary: every patient chosen, each followed by a dashed line. earlier: Map of patient id → true / false. */
export function summaryText(reports, { days = 1, earlier = new Map() } = {}) {
  return reports.map((r) => `${summaryBlock(r, { days, earlier: earlier.get(r.id) ?? null })}\n\n${SEPARATOR}`).join('\n');
}

/** One patient's detailed referral, in the style of the updates you send. */
export function referralText(r, setup, { days = 1, earlier = null } = {}) {
  const head = [
    setup.open?.trim(),
    r.name,
    r.ageSex,
    r.doa ? `DOA ${reportDay(r.doa)} · HD ${r.hd}` : '',
    r.location ? `Currently at ${r.location}` : '',
  ].filter(Boolean);
  const parts = [head.join('\n')];
  if (tidy(r.text.dx)) parts.push(`Case of\n${tidy(r.text.dx)}`);
  const cc = [r.events ? eventsText(r, { earlier, when: sinceWords(days), full: true }) : '', tidy(r.text.services)].filter((t) => t && t !== 'None written.');
  if (cc.length) parts.push(`CC:\n${cc.join('\n\n')}`);
  if (tidy(r.text.labs)) parts.push(tidy(r.text.labs));
  if (tidy(r.text.imaging)) parts.push(tidy(r.text.imaging));
  if (tidy(r.text.plans)) parts.push(`P>\n${tidy(r.text.plans)}`);
  if (setup.close?.trim()) parts.push(setup.close.trim());
  return parts.join('\n\n');
}
