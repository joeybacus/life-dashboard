/* Plain words → a task, with no AI and no internet — just rules, e.g.
   "Finish STRAMA paper tomorrow 8pm #MBA !!!" → "Finish STRAMA paper", tomorrow,
   8:00 PM, category MBA, High priority. It understands:

     dates     today · tonight · tomorrow (tmrw) · Friday (or on Fri) · next Monday ·
               in 3 days / in 2 weeks · Oct 3 / 3 October · 10/15 · 3/10 (asks: Mar 10 or Oct 3?)
     times     8pm · 8:30 PM · 20:00 · noon · 8–9 PM · at 8 (asks: AM or PM?)
               (not "8a"/"8p", so "Ward 5A" or "Bed 12A" stay words)
     priority  ! low · !! medium · !!! high · "high priority"
     category  #MBA — one of your categories (capitals, accents and spaces don't
               matter, and the start of a name is enough when it fits only one)
     tags      @paper
     reminder  remind me 30 min before · remind me 1 hour before · remind me 2 days before ·
               remind me (at the time) · "Remind me to call mom 7pm" → "Call mom", reminder at 7 PM

   What's left is the task's name. Every part it recognised keeps where it was in
   the text, so the box can show it as a chip — and removing a chip turns those
   words back into part of the name. Anything that could mean two things is
   returned with both options; the box asks before adding. */
import { firstDayOfWeek } from '../../core/dates.js';
import {
  addDays, clockOf, formatClock, formatClockRange, formatDay, formatDayYear, formatMonthDay, relativeDay, todayKey, weekdayOf,
} from '../../core/manila.js';
import { PRIORITIES } from './model.js';
import { minutesText } from './alerts.js';

const B = '(?<![\\p{L}\\p{N}])'; // word start (works for any language, unlike \b)
const E = '(?![\\p{L}\\p{N}])';  // word end

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const WEEKDAYS = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PRIORITY_WORDS = { high: 'high', medium: 'medium', med: 'medium', low: 'low' };
const alternation = (words) => Object.keys(words).sort((a, b) => b.length - a.length).join('|');

const pad = (n) => String(n).padStart(2, '0');
/** Lower case, no accents, single spaces: how parts are compared and remembered. */
const fold = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** A category name as a #word: "Board exam" → "boardexam". */
const squash = (text) => fold(text).replace(/[^\p{L}\p{N}]/gu, '');

/** Does "3/10" put the month or the day first on this device? ("md" in the Philippines and the US.) */
export function localDateOrder() {
  try {
    const types = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date(2000, 10, 22)).map((p) => p.type);
    return types.indexOf('day') < types.indexOf('month') ? 'dm' : 'md';
  } catch {
    return 'md';
  }
}

/* ---------- Dates ---------- */

function dateKey(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** A day and month without a year: this year, or next year if it was more than a week ago. */
function withYear(m, d, year, today) {
  if (year) return dateKey(year < 100 ? 2000 + year : year, m, d);
  const thisYear = Number(today.slice(0, 4));
  const key = dateKey(thisYear, m, d);
  if (!key) {
    // Feb 29 in a year without one: the next year that has it
    for (let y = thisYear + 1; y <= thisYear + 8; y++) if (dateKey(y, m, d)) return dateKey(y, m, d);
    return null;
  }
  return key < addDays(today, -7) ? dateKey(thisYear + 1, m, d) : key;
}

/** "Friday": the coming one (today if it's Friday). "next Friday": the one in next week. */
function weekdayDate(target, today, next, weekStart) {
  const dow = weekdayOf(today);
  if (!next) return addDays(today, (target - dow + 7) % 7);
  const nextWeek = addDays(today, 7 - ((dow - weekStart + 7) % 7));
  return addDays(nextWeek, (target - weekStart + 7) % 7);
}

/** The two readings of "3/10" always name the month: "Oct 3" or "Mar 10, 2027". */
const monthLabel = (key, today) => (key.slice(0, 4) === today.slice(0, 4) ? formatMonthDay(key) : formatDayYear(key));
/** A date chip: "Today", "Tomorrow", else the date itself — "Fri, Oct 2" or "Mar 10, 2027". */
function dateLabel(key, today) {
  const near = relativeDay(key, today);
  if (near === 'Today' || near === 'Tomorrow') return near;
  return key.slice(0, 4) === today.slice(0, 4) ? formatDay(key) : formatDayYear(key);
}

/* ---------- Times ---------- */

const merOf = (text) => (!text ? null : /^p/i.test(text) ? 'pm' : 'am');
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function clock(h, m, mer) {
  let hour = h;
  if (mer === 'am') hour = h % 12;
  else if (mer === 'pm') hour = (h % 12) + 12;
  return hour >= 0 && hour <= 23 && m >= 0 && m <= 59 ? `${pad(hour)}:${pad(m)}` : null;
}

/** "8–9 PM": the AM/PM written once counts for both ends, unless that would end before it starts ("11–1 PM"). */
function range(a, b) {
  let am = a.mer;
  let bm = b.mer;
  if (!am && bm) {
    am = bm;
    const s = clock(a.h, a.m, am);
    const e = clock(b.h, b.m, bm);
    if (s && e && minutesOf(s) >= minutesOf(e) && a.h !== 12) am = bm === 'pm' ? 'am' : 'pm';
  } else if (am && !bm) {
    bm = am;
    const s = clock(a.h, a.m, am);
    const e = clock(b.h, b.m, bm);
    if (s && e && minutesOf(e) <= minutesOf(s) && b.h !== 12) bm = am === 'pm' ? 'am' : 'pm';
  }
  const start = clock(a.h, a.m, am);
  const end = clock(b.h, b.m, bm);
  return start && end && start !== end ? { start, end } : null;
}

/** For "at 8" or "8:30" without AM/PM: both, most likely first (7–11 → morning, 1–6 → afternoon). */
function amOrPm(h, m, evening) {
  if (evening) return { value: clock(h, m, 'pm') };
  const am = clock(h, m, 'am');
  const pm = clock(h, m, 'pm');
  const first = h >= 7 && h <= 11 ? [am, pm] : [pm, am];
  return { options: first.map((v) => ({ value: v, label: formatClock(v) })) };
}

/* ---------- Rules ---------- */

const RULES = [
  // Time ranges: 8-9pm · 8 – 9 PM · 8pm-10 · 8:30-9:15 pm · 20:00-21:00 · from 8 to 9 pm
  {
    kind: 'time',
    re: new RegExp(`${B}(?:from\\s+|at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?${E}`, 'giu'),
    read(m, ctx) {
      const a = { h: Number(m[1]), m: Number(m[2] ?? 0), mer: merOf(m[3]), colon: m[2] != null, zero: m[1].length === 2 && m[1][0] === '0' };
      const b = { h: Number(m[4]), m: Number(m[5] ?? 0), mer: merOf(m[6]), colon: m[5] != null, zero: m[4].length === 2 && m[4][0] === '0' };
      if (a.mer || b.mer) {
        if (a.h > 12 || b.h > 12 || a.h === 0 || b.h === 0) return null;
        const r = range(a, b);
        return r && { value: r };
      }
      if (!a.colon || !b.colon) return null; // "3-4" is just numbers
      const is24 = (t) => t.zero || t.h >= 13 || t.h === 0;
      if (is24(a) || is24(b)) {
        const start = clock(a.h, a.m, null);
        const end = clock(b.h, b.m, null);
        return start && end && start !== end ? { value: { start, end } } : null;
      }
      if (ctx.evening) {
        const r = range({ ...a, mer: 'pm' }, { ...b, mer: 'pm' });
        return r && { value: r };
      }
      const am = range({ ...a, mer: 'am' }, b.h === 12 ? { ...b, mer: 'pm' } : { ...b, mer: 'am' });
      const pm = range({ ...a, mer: 'pm' }, { ...b, mer: 'pm' });
      const both = [am, pm].filter(Boolean);
      if (both.length < 2) return both[0] ? { value: both[0] } : null;
      const ordered = a.h >= 7 && a.h <= 11 ? both : both.reverse();
      return { options: ordered.map((r) => ({ value: r, label: formatClockRange(r.start, r.end) })) };
    },
  },
  // 8pm · 8 pm · 8:30 PM · 8.30pm · at 7am
  {
    kind: 'time',
    re: new RegExp(`${B}(?:(?:at|by|@)\\s*)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.m\\.?|p\\.m\\.?|am|pm)${E}`, 'giu'),
    read(m) {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return null;
      const start = clock(h, Number(m[2] ?? 0), merOf(m[3]));
      return start && { value: { start, end: null } };
    },
  },
  // 20:00 · 08:30 · at 8:30 (asks AM or PM)
  {
    kind: 'time',
    re: new RegExp(`${B}(?:(?:at|by|@)\\s*)?(\\d{1,2}):(\\d{2})${E}`, 'giu'),
    read(m, ctx) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if ((m[1].length === 2 && m[1][0] === '0') || h >= 12 || h === 0) {
        const start = clock(h, min, null);
        return start && { value: { start, end: null } };
      }
      const r = amOrPm(h, min, ctx.evening);
      return r.value ? { value: { start: r.value, end: null } } : { options: r.options.map((o) => ({ value: { start: o.value, end: null }, label: o.label })) };
    },
  },
  // at noon · at 8 (asks AM or PM)
  {
    kind: 'time',
    re: new RegExp(`${B}(?:at\\s+)?(noon|midday)${E}|${B}at\\s+(\\d{1,2})${E}`, 'giu'),
    read(m, ctx) {
      if (m[1]) return { value: { start: '12:00', end: null } };
      const h = Number(m[2]);
      if (h < 1 || h > 12) return null;
      if (h === 12) return { value: { start: '12:00', end: null } };
      const r = amOrPm(h, 0, ctx.evening);
      return r.value ? { value: { start: r.value, end: null } } : { options: r.options.map((o) => ({ value: { start: o.value, end: null }, label: o.label })) };
    },
  },
  // today · tonight · tomorrow · tmrw (with or without "on", "by", "due", "for")
  {
    kind: 'date',
    re: new RegExp(`${B}(?:(?:on|by|due|for)\\s+)?(today|tonight|tomorrow|tmrw|tmr)${E}`, 'giu'),
    read(m, ctx) {
      const word = m[1].toLowerCase();
      if (word === 'today' || word === 'tonight') return { value: ctx.today, tonight: word === 'tonight' };
      return { value: addDays(ctx.today, 1) };
    },
  },
  // in 3 days · in a week · in 2 weeks
  {
    kind: 'date',
    re: new RegExp(`${B}in\\s+(\\d{1,3}|${alternation(COUNTS)})\\s+(days?|weeks?)${E}`, 'giu'),
    read(m, ctx) {
      const n = /^\d/.test(m[1]) ? Number(m[1]) : COUNTS[m[1].toLowerCase()];
      return n ? { value: addDays(ctx.today, /^w/i.test(m[2]) ? n * 7 : n) } : null;
    },
  },
  // Friday · on Fri · next Monday · this Thursday (short names need "on", "next"… so "sat for the exam" stays words)
  {
    kind: 'date',
    re: new RegExp(`${B}((?:(?:on|by|due|for|this|next)\\s+){0,2})(${alternation(WEEKDAYS)})${E}`, 'giu'),
    read(m, ctx) {
      const lead = m[1].toLowerCase();
      const name = m[2].toLowerCase();
      const full = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].includes(name);
      if (!full && !lead.trim()) return null;
      return { value: weekdayDate(WEEKDAYS[name], ctx.today, /\bnext\b/.test(lead), ctx.weekStart) };
    },
  },
  // Oct 3 · October 3rd, 2026 · on Sept 5
  {
    kind: 'date',
    re: new RegExp(`${B}(?:(?:on|by|due|for)\\s+)?(${alternation(MONTHS)})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, 'giu'),
    read(m, ctx) {
      const key = withYear(MONTHS[m[1].toLowerCase()], Number(m[2]), m[3] ? Number(m[3]) : null, ctx.today);
      return key && { value: key };
    },
  },
  // 3 Oct · 3rd of October 2026
  {
    kind: 'date',
    re: new RegExp(`${B}(?:(?:on|by|due|for)\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${alternation(MONTHS)})\\.?(?:,?\\s+(\\d{4}))?${E}`, 'giu'),
    read(m, ctx) {
      const key = withYear(MONTHS[m[2].toLowerCase()], Number(m[1]), m[3] ? Number(m[3]) : null, ctx.today);
      return key && { value: key };
    },
  },
  // 10/15 · 3/10 (asks which is the day) · 10/15/2026 · 3/10/26
  {
    kind: 'date',
    re: new RegExp(`${B}(?:(?:on|by|due|for)\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?${E}`, 'giu'),
    read(m, ctx) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      const year = m[3] ? Number(m[3]) : null;
      const md = withYear(x, y, year, ctx.today);
      const dm = withYear(y, x, year, ctx.today);
      const first = ctx.dateOrder === 'dm' ? dm : md;
      const second = ctx.dateOrder === 'dm' ? md : dm;
      if (first && second && first !== second) {
        return { options: [first, second].map((key) => ({ value: key, label: monthLabel(key, ctx.today) })) };
      }
      return (first || second) ? { value: first || second } : null;
    },
  },
  // ! low · !! medium · !!! high (standing on their own)
  {
    kind: 'priority',
    re: /(?<!\S)(!{1,3})(?!\S)/gu,
    read: (m) => ({ value: ['low', 'medium', 'high'][m[1].length - 1] }),
  },
  // high priority · priority: low
  {
    kind: 'priority',
    re: new RegExp(`${B}(?:(${alternation(PRIORITY_WORDS)})[-\\s]+priority|priority[:\\s]+(${alternation(PRIORITY_WORDS)}))${E}`, 'giu'),
    read: (m) => ({ value: PRIORITY_WORDS[(m[1] ?? m[2]).toLowerCase()] }),
  },
  // #MBA — one of your categories
  {
    kind: 'category',
    re: /(?<![^\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu,
    read(m, ctx) {
      const word = squash(m[1]);
      const exact = ctx.categories.filter((c) => squash(c.name) === word);
      const found = exact.length ? exact : word.length >= 2 ? ctx.categories.filter((c) => squash(c.name).startsWith(word)) : [];
      if (!found.length) return null;
      if (found.length === 1) return { value: found[0].id };
      return { options: found.map((c) => ({ value: c.id, label: c.name })) };
    },
  },
  // @paper — a tag
  {
    kind: 'tag',
    re: /(?<![^\s(])@([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu,
    read: (m) => ({ value: m[1].slice(0, 40) }),
  },
  // "Remind me to …" at the start: a reminder at the task's time; the rest is the name
  {
    kind: 'reminder',
    re: /^\s*remind\s+me\s+to(?![\p{L}\p{N}])/giu,
    read: () => ({ value: 0, lead: true }),
  },
  // remind me 30 min before · remind me an hour before · remind me half an hour before · remind me
  // ("me" is needed, so "Remind the team about…" stays a name)
  {
    kind: 'reminder',
    re: new RegExp(`${B}remind\\s+me(?:\\s+(\\d{1,3}|an?|one|half\\s+an?)\\s*(mins?|minutes?|m|hrs?|hours?|h|days?|d)\\s+(?:before|earlier|ahead))?${E}`, 'giu'),
    read(m) {
      if (!m[1]) return { value: 0 };
      const amount = m[1].toLowerCase();
      const unit = m[2].toLowerCase();
      const per = unit.startsWith('d') ? 1440 : unit.startsWith('h') ? 60 : 1;
      if (amount.startsWith('half')) return per === 60 ? { value: 30 } : per === 1440 ? { value: 720 } : null;
      const n = /^\d/.test(amount) ? Number(amount) : 1;
      const minutes = n * per;
      return minutes > 0 && minutes <= 40320 ? { value: minutes } : null;
    },
  },
];

/**
 * Read a task typed in plain words.
 *   now        the moment to count from (Manila time is used)
 *   categories [{ id, name }] — for #Category
 *   dateOrder  'md' | 'dm' — which comes first in "3/10" (default: this device's region)
 *   weekStart  0 = Sunday … — for "next Monday" (default: this device's region)
 *   ignore     part keys to leave as words (chips you removed)
 *   choices    { partKey: value } — answers to "3/10 is…?" questions
 * Returns { title, parts, fields, unanswered }: fields holds only what was found
 * (date, startTime, endTime, priority, categoryId, tags, reminders); unanswered lists the
 * parts that could mean two things and still need a choice.
 */
export function parseTask(text, {
  now = Date.now(), categories = [], dateOrder = localDateOrder(), weekStart = firstDayOfWeek(), ignore = [], choices = {},
} = {}) {
  const source = String(text ?? '');
  const skip = new Set(ignore);
  const ctx = { today: todayKey(now), now, categories, dateOrder, weekStart, evening: /(?<![\p{L}\p{N}])tonight(?![\p{L}\p{N}])/iu.test(source) };

  // Every match of every rule, then keep the longest where they overlap (a chip you removed still blocks its words)
  const found = [];
  RULES.forEach((rule, order) => {
    rule.re.lastIndex = 0;
    for (const m of source.matchAll(rule.re)) {
      const result = rule.read(m, ctx);
      if (!result) continue;
      const words = m[0].trim();
      const start = m.index + m[0].indexOf(words);
      found.push({ kind: rule.kind, start, end: start + words.length, text: words, key: `${rule.kind}:${fold(words)}`, order, ...result });
    }
  });
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order);
  const taken = [];
  const kept = [];
  for (const f of found) {
    if (taken.some((t) => f.start < t.end && t.start < f.end)) continue;
    taken.push(f);
    if (skip.has(f.key)) continue;
    // One date, one time, one priority and one category; later ones stay as words
    const many = f.kind === 'tag' || f.kind === 'reminder';
    if (!many && kept.some((k) => k.kind === f.kind)) continue;
    if (many && kept.some((k) => k.kind === f.kind && fold(String(k.value)) === fold(String(f.value)))) continue;
    kept.push(f);
  }

  // Answers to "which one?"
  const parts = kept.map(({ order, ...p }) => {
    if (!p.options) return p;
    const pick = p.options.find((o) => JSON.stringify(o.value) === JSON.stringify(choices[p.key]));
    return pick ? { ...p, value: pick.value, chosen: true } : { ...p, value: null };
  });

  // What's left is the name
  let title = '';
  let cursor = 0;
  [...parts].sort((a, b) => a.start - b.start).forEach((p) => {
    title += `${source.slice(cursor, p.start)} `;
    cursor = p.end;
  });
  title += source.slice(cursor);
  title = title.replace(/\s+/g, ' ').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim();
  // "Remind me to call mom" → "Call mom"
  if (parts.some((p) => p.lead)) title = title.charAt(0).toLocaleUpperCase() + title.slice(1);

  // Fields
  const fields = {};
  const part = (kind) => parts.find((p) => p.kind === kind && p.value != null);
  const date = part('date');
  const time = part('time');
  if (date) fields.date = date.value;
  if (time) {
    fields.startTime = time.value.start;
    fields.endTime = time.value.end;
    // A time without a date: today if it's still to come, otherwise tomorrow
    if (!date && !parts.some((p) => p.kind === 'date')) {
      fields.date = time.value.start > clockOf(now) ? ctx.today : addDays(ctx.today, 1);
      time.impliedDate = fields.date;
    }
  }
  const priority = part('priority');
  if (priority) fields.priority = priority.value;
  const category = part('category');
  if (category) fields.categoryId = category.value;
  const tags = parts.filter((p) => p.kind === 'tag').map((p) => p.value);
  if (tags.length) fields.tags = tags;
  const reminders = parts.filter((p) => p.kind === 'reminder').map((p) => ({ kind: 'before', minutes: p.value }));
  if (reminders.length) fields.reminders = reminders;

  // Words for the chips
  parts.forEach((p) => {
    if (p.value == null) p.label = p.text;
    else if (p.kind === 'date') p.label = p.tonight ? 'Tonight' : dateLabel(p.value, ctx.today);
    else if (p.kind === 'time') {
      const clockText = formatClockRange(p.value.start, p.value.end);
      p.label = p.impliedDate ? `${relativeDay(p.impliedDate, ctx.today)} ${clockText}` : clockText;
    } else if (p.kind === 'priority') p.label = PRIORITIES[p.value].label;
    else if (p.kind === 'category') p.label = categories.find((c) => c.id === p.value)?.name ?? p.text;
    else if (p.kind === 'reminder') p.label = p.value ? `${minutesText(p.value)} before` : 'Remind at the time';
    else p.label = `@${p.value}`;
  });

  return { title, parts, fields, unanswered: parts.filter((p) => p.options && p.value == null) };
}

